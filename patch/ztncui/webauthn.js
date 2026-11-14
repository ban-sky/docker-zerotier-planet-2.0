/*
  Minimal WebAuthn (passkey) verification, with no runtime dependencies.

  Only what this application needs is implemented: attestation "none" (the
  browser's own statement about the credential), ES256 / RS256 / Ed25519
  signatures, and the registration/assertion checks that matter for a
  single-origin admin UI. Attestation chains are deliberately ignored — they
  identify hardware, not the user, and cannot be verified without shipping a
  metadata service.

  GPLv3 - see LICENSE.
*/

'use strict';

const crypto = require('crypto');

const FLAG_UP = 0x01; // user present
const FLAG_UV = 0x04; // user verified
const FLAG_AT = 0x40; // attested credential data included
const FLAG_ED = 0x80; // extension data included

function b64u(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64u(str) {
  if (typeof str !== 'string') throw new Error('expected a base64url string');
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded + '='.repeat((4 - (padded.length % 4)) % 4), 'base64');
}

/* ------------------------------------------------------------------ CBOR -- */

function decodeCbor(buf, offset) {
  const start = offset || 0;
  const head = buf[start];
  if (head === undefined) throw new Error('truncated CBOR input');
  const major = head >> 5;
  const info = head & 0x1f;
  let pos = start + 1;
  let length = info;

  if (info === 24) {
    length = buf[pos++];
  } else if (info === 25) {
    length = buf.readUInt16BE(pos);
    pos += 2;
  } else if (info === 26) {
    length = buf.readUInt32BE(pos);
    pos += 4;
  } else if (info === 27) {
    length = Number(buf.readBigUInt64BE(pos));
    pos += 8;
  } else if (info > 27) {
    throw new Error('unsupported CBOR length encoding');
  }

  switch (major) {
    case 0:
      return { value: length, offset: pos };
    case 1:
      return { value: -1 - length, offset: pos };
    case 2: {
      const value = buf.subarray(pos, pos + length);
      if (value.length !== length) throw new Error('truncated CBOR byte string');
      return { value, offset: pos + length };
    }
    case 3: {
      const value = buf.subarray(pos, pos + length).toString('utf8');
      if (Buffer.byteLength(value, 'utf8') !== length) throw new Error('truncated CBOR text string');
      return { value, offset: pos + length };
    }
    case 4: {
      const value = [];
      let next = pos;
      for (let i = 0; i < length; i += 1) {
        const item = decodeCbor(buf, next);
        value.push(item.value);
        next = item.offset;
      }
      return { value, offset: next };
    }
    case 5: {
      const value = new Map();
      let next = pos;
      for (let i = 0; i < length; i += 1) {
        const key = decodeCbor(buf, next);
        const val = decodeCbor(buf, key.offset);
        value.set(key.value, val.value);
        next = val.offset;
      }
      return { value, offset: next };
    }
    case 6: {
      // Tags (dates, self-described CBOR, ...) are transparent for our use.
      return decodeCbor(buf, pos);
    }
    default:
      throw new Error('unsupported CBOR major type ' + major);
  }
}

/* --------------------------------------------------------------- parsing -- */

function parseClientData(input) {
  let data;
  try {
    data = JSON.parse(typeof input === 'string' ? input : Buffer.from(input).toString('utf8'));
  } catch (err) {
    throw new Error('clientDataJSON is not valid JSON');
  }
  if (!data || typeof data !== 'object') throw new Error('clientDataJSON is not an object');
  return {
    type: typeof data.type === 'string' ? data.type : '',
    challenge: typeof data.challenge === 'string' ? data.challenge : '',
    origin: typeof data.origin === 'string' ? data.origin : '',
    crossOrigin: data.crossOrigin === true
  };
}

function parseAuthenticatorData(buf) {
  if (buf.length < 37) throw new Error('authenticatorData is too short');
  const rpIdHash = buf.subarray(0, 32);
  const flags = buf[32];
  const signCount = buf.readUInt32BE(33);
  const result = {
    rpIdHash,
    flags: {
      up: (flags & FLAG_UP) !== 0,
      uv: (flags & FLAG_UV) !== 0,
      at: (flags & FLAG_AT) !== 0,
      ed: (flags & FLAG_ED) !== 0
    },
    signCount,
    credentialId: null,
    publicKey: null
  };

  if (!result.flags.at) return result;

  let pos = 37;
  if (buf.length < pos + 18) throw new Error('authenticatorData lacks credential data');
  pos += 16; // AAGUID is not used here
  const idLength = buf.readUInt16BE(pos);
  pos += 2;
  if (buf.length < pos + idLength) throw new Error('truncated credential ID');
  result.credentialId = buf.subarray(pos, pos + idLength);
  pos += idLength;

  const cose = decodeCbor(buf, pos);
  result.publicKey = coseToKey(cose.value);
  return result;
}

/**
 * Turn a COSE_Key map into a node public key.
 * Supported: EC2/P-256 (ES256), RSA (RS256/RS384/RS512), OKP/Ed25519 (EdDSA).
 */
function coseToKey(cose) {
  if (!(cose instanceof Map)) throw new Error('COSE key is not a map');
  const kty = cose.get(1);
  const alg = cose.get(3);

  if (kty === 2) {
    const crv = cose.get(-1);
    if (crv !== 1) throw new Error('unsupported EC curve (only P-256 can be verified here)');
    const x = cose.get(-2);
    const y = cose.get(-3);
    if (!Buffer.isBuffer(x) || !Buffer.isBuffer(y) || x.length !== 32 || y.length !== 32) {
      throw new Error('invalid EC coordinates');
    }
    const jwk = {
      kty: 'EC',
      crv: 'P-256',
      x: b64u(x),
      y: b64u(y)
    };
    return { key: crypto.createPublicKey({ key: jwk, format: 'jwk' }), alg: alg || -7 };
  }

  if (kty === 3) {
    const n = cose.get(-1);
    const e = cose.get(-2);
    if (!Buffer.isBuffer(n) || !Buffer.isBuffer(e)) throw new Error('invalid RSA key');
    const jwk = { kty: 'RSA', n: b64u(n), e: b64u(e) };
    return { key: crypto.createPublicKey({ key: jwk, format: 'jwk' }), alg: alg || -257 };
  }

  if (kty === 1) {
    const crv = cose.get(-1);
    if (crv !== 6) throw new Error('unsupported OKP curve (only Ed25519 can be verified here)');
    const x = cose.get(-2);
    if (!Buffer.isBuffer(x) || x.length !== 32) throw new Error('invalid Ed25519 key');
    const jwk = { kty: 'OKP', crv: 'Ed25519', x: b64u(x) };
    return { key: crypto.createPublicKey({ key: jwk, format: 'jwk' }), alg: alg || -8 };
  }

  throw new Error('unsupported COSE key type ' + kty);
}

function algorithmFor(alg) {
  switch (alg) {
    case -7:
      return { name: 'sha256', options: { key: null, dsaEncoding: 'der' } };
    case -257:
      return { name: 'sha256', options: { key: null, padding: crypto.constants.RSA_PKCS1_PADDING } };
    case -258:
      return { name: 'sha384', options: { key: null, padding: crypto.constants.RSA_PKCS1_PADDING } };
    case -259:
      return { name: 'sha512', options: { key: null, padding: crypto.constants.RSA_PKCS1_PADDING } };
    case -8:
      return { name: null, options: { key: null } };
    default:
      throw new Error('unsupported COSE algorithm ' + alg);
  }
}

function verifySignature(publicKey, signature, data) {
  const spec = algorithmFor(publicKey.alg);
  try {
    return crypto.verify(spec.name, data, publicKey.key, signature);
  } catch (err) {
    return false;
  }
}

/* ----------------------------------------------------------- validations -- */

function expectedRpIdHash(rpId) {
  return crypto.createHash('sha256').update(rpId, 'utf8').digest();
}

function checkClientData(clientData, expectation, type) {
  if (clientData.type !== type) throw new Error('unexpected ceremony type');
  if (clientData.challenge !== expectation.challenge) throw new Error('challenge does not match');
  if (expectation.origin && clientData.origin !== expectation.origin) {
    throw new Error('origin does not match');
  }
}

function checkFlags(parsed, expectation) {
  if (!parsed.flags.up) throw new Error('user presence flag is not set');
  if (expectation.requireUV && !parsed.flags.uv) throw new Error('user verification flag is not set');
  if (!parsed.rpIdHash.equals(expectedRpIdHash(expectation.rpId))) {
    throw new Error('relying party ID does not match');
  }
}

function decodeAttestationObject(buf) {
  const outer = decodeCbor(buf);
  const map = outer.value;
  if (!(map instanceof Map)) throw new Error('attestationObject is not a map');
  const authData = map.get('authData');
  if (!Buffer.isBuffer(authData)) throw new Error('attestationObject lacks authData');
  return {
    fmt: map.get('fmt') || 'none',
    authData
  };
}

/**
 * Verify a registration response.
 *
 * expectation: { challenge, origin, rpId, requireUV }
 * body:        { id, rawId, type, response: { clientDataJSON, attestationObject } }
 *
 * Returns { credentialId, publicKey, signCount }.
 */
function verifyRegistration(body, expectation) {
  if (!body || typeof body !== 'object') throw new Error('missing registration response');
  if (body.type !== 'public-key') throw new Error('unexpected credential type');

  const response = body.response || {};
  const clientData = parseClientData(unb64u(response.clientDataJSON));
  checkClientData(clientData, expectation, 'webauthn.create');
  if (clientData.crossOrigin) throw new Error('cross-origin ceremonies are not accepted');

  const attestation = decodeAttestationObject(unb64u(response.attestationObject));
  const parsed = parseAuthenticatorData(attestation.authData);
  checkFlags(parsed, expectation);

  if (!parsed.credentialId || !parsed.publicKey) {
    throw new Error('attestation did not include a credential');
  }

  if (body.rawId) {
    const rawId = unb64u(body.rawId);
    if (!rawId.equals(parsed.credentialId)) throw new Error('credential ID mismatch');
  }
  if (body.id && b64u(parsed.credentialId) !== body.id) throw new Error('credential ID mismatch');

  return {
    credentialId: b64u(parsed.credentialId),
    publicKey: parsed.publicKey,
    signCount: parsed.signCount,
    fmt: attestation.fmt
  };
}

/**
 * Verify an assertion (sign-in) response.
 *
 * stored:      { publicKey, signCount }
 * body:        { id, rawId, response: { clientDataJSON, authenticatorData, signature } }
 *
 * Returns { signCount }.
 */
function verifyAuthentication(body, expectation, stored) {
  if (!body || typeof body !== 'object') throw new Error('missing assertion response');
  if (body.type !== 'public-key') throw new Error('unexpected credential type');

  const response = body.response || {};
  const clientData = parseClientData(unb64u(response.clientDataJSON));
  checkClientData(clientData, expectation, 'webauthn.get');
  if (clientData.crossOrigin) throw new Error('cross-origin ceremonies are not accepted');

  const authData = unb64u(response.authenticatorData);
  const parsed = parseAuthenticatorData(authData);
  checkFlags(parsed, expectation);

  const clientDataHash = crypto.createHash('sha256').update(unb64u(response.clientDataJSON)).digest();
  const signed = Buffer.concat([authData, clientDataHash]);
  const signature = unb64u(response.signature);
  if (!verifySignature(stored.publicKey, signature, signed)) {
    throw new Error('signature verification failed');
  }

  // A counter that stays at zero means the authenticator does not track clones.
  if (stored.signCount > 0 && parsed.signCount > 0 && parsed.signCount <= stored.signCount) {
    throw new Error('authenticator sign counter did not advance');
  }

  return { signCount: parsed.signCount };
}

module.exports = {
  b64u,
  unb64u,
  decodeCbor,
  parseClientData,
  parseAuthenticatorData,
  coseToKey,
  decodeAttestationObject,
  verifyRegistration,
  verifyAuthentication,
  expectedRpIdHash
};
