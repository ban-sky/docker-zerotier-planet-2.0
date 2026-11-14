#!/usr/bin/env node
/*
  Checks for patch/ztncui/webauthn.js.

  The test plays the role of an authenticator: it builds the CBOR structures a
  browser would send, signs them with real keys, and verifies that the server
  accepts well-formed ceremonies and rejects tampered ones.
*/

const assert = require('assert');
const crypto = require('crypto');
const wa = require('../patch/ztncui/webauthn');

let checks = 0;
function ok(name, fn) {
  fn();
  checks += 1;
  console.log('ok   ' + name);
}
function rejects(name, fn, pattern) {
  let error = null;
  try {
    fn();
  } catch (err) {
    error = err;
  }
  assert.ok(error, name + ': expected a rejection');
  if (pattern) assert.match(error.message, pattern);
  checks += 1;
  console.log('ok   ' + name);
}

/* --- a tiny CBOR encoder, only for building fixtures -------------------- */

function head(major, length) {
  if (length < 24) return Buffer.from([(major << 5) | length]);
  if (length < 256) return Buffer.from([(major << 5) | 24, length]);
  if (length < 65536) {
    const b = Buffer.alloc(3);
    b[0] = (major << 5) | 25;
    b.writeUInt16BE(length, 1);
    return b;
  }
  const b = Buffer.alloc(5);
  b[0] = (major << 5) | 26;
  b.writeUInt32BE(length, 1);
  return b;
}

function cbor(value) {
  if (Buffer.isBuffer(value)) return Buffer.concat([head(2, value.length), value]);
  if (typeof value === 'string') {
    const raw = Buffer.from(value, 'utf8');
    return Buffer.concat([head(3, raw.length), raw]);
  }
  if (typeof value === 'number') {
    return value >= 0 ? head(0, value) : head(1, -1 - value);
  }
  if (Array.isArray(value)) {
    return Buffer.concat([head(4, value.length), ...value.map(cbor)]);
  }
  if (value instanceof Map) {
    const parts = [head(5, value.size)];
    for (const [k, v] of value) parts.push(cbor(k), cbor(v));
    return Buffer.concat(parts);
  }
  if (value === true) return Buffer.from([0xf5]);
  if (value === false) return Buffer.from([0xf4]);
  if (value === null) return Buffer.from([0xf6]);
  throw new Error('cannot encode ' + typeof value);
}

/* --- authenticator fixtures -------------------------------------------- */

const RP_ID = 'planet.example.com';
const ORIGIN = 'https://planet.example.com';
const CHALLENGE = 'challenge-value-from-the-server';

function ecCose(keyObject) {
  const jwk = keyObject.export({ format: 'jwk' });
  return new Map([
    [1, 2],
    [3, -7],
    [-1, 1],
    [-2, wa.unb64u(jwk.x)],
    [-3, wa.unb64u(jwk.y)]
  ]);
}

function authDataFor(rpId, flags, counter, credentialId, coseMap) {
  const rpIdHash = crypto.createHash('sha256').update(rpId).digest();
  const head37 = Buffer.alloc(37);
  rpIdHash.copy(head37, 0);
  head37[32] = flags;
  head37.writeUInt32BE(counter, 33);

  if (!coseMap) return head37;

  const aaguid = Buffer.alloc(16, 0);
  const idLength = Buffer.alloc(2);
  idLength.writeUInt16BE(credentialId.length, 0);
  return Buffer.concat([head37, aaguid, idLength, credentialId, cbor(coseMap)]);
}

function clientData(type, overrides) {
  return Buffer.from(
    JSON.stringify(
      Object.assign(
        {
          type,
          challenge: CHALLENGE,
          origin: ORIGIN,
          crossOrigin: false
        },
        overrides || {}
      )
    )
  );
}

function registrationBody(fixture, overrides) {
  const credentialId = fixture.credentialId;
  const authData = authDataFor(RP_ID, 0x45, 0, credentialId, fixture.cose);
  const attestation = cbor(
    new Map([
      ['fmt', 'none'],
      ['attStmt', new Map()],
      ['authData', authData]
    ])
  );
  return Object.assign(
    {
      id: wa.b64u(credentialId),
      rawId: wa.b64u(credentialId),
      type: 'public-key',
      response: {
        clientDataJSON: wa.b64u(clientData('webauthn.create')),
        attestationObject: wa.b64u(attestation)
      }
    },
    overrides || {}
  );
}

function assertionBody(fixture, overrides) {
  const authData = authDataFor(RP_ID, 0x05, 7, null, null);
  const json = clientData('webauthn.get');
  const signed = Buffer.concat([authData, crypto.createHash('sha256').update(json).digest()]);
  const signature =
    fixture.alg === 'ed25519'
      ? crypto.sign(null, signed, fixture.privateKey)
      : crypto.sign('sha256', signed, { key: fixture.privateKey, dsaEncoding: 'der' });
  return Object.assign(
    {
      id: wa.b64u(fixture.credentialId),
      rawId: wa.b64u(fixture.credentialId),
      type: 'public-key',
      response: {
        clientDataJSON: wa.b64u(json),
        authenticatorData: wa.b64u(authData),
        signature: wa.b64u(signature),
        userHandle: wa.b64u(Buffer.from('admin'))
      }
    },
    overrides || {}
  );
}

const expectation = { challenge: CHALLENGE, origin: ORIGIN, rpId: RP_ID };

function es256Fixture() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return {
    alg: 'es256',
    privateKey,
    credentialId: crypto.randomBytes(16),
    cose: ecCose(publicKey)
  };
}

function rsaFixture() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' });
  const n = Buffer.from(jwk.n, 'base64');
  const e = Buffer.from(jwk.e, 'base64');
  return {
    alg: 'rsa',
    privateKey,
    credentialId: crypto.randomBytes(16),
    cose: new Map([
      [1, 3],
      [3, -257],
      [-1, n],
      [-2, e]
    ])
  };
}

function ed25519Fixture() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const jwk = publicKey.export({ format: 'jwk' });
  return {
    alg: 'ed25519',
    privateKey,
    credentialId: crypto.randomBytes(16),
    cose: new Map([
      [1, 1],
      [3, -8],
      [-1, 6],
      [-2, Buffer.from(jwk.x, 'base64')]
    ])
  };
}

/* --- value encoding ----------------------------------------------------- */

ok('base64url round-trips arbitrary bytes', () => {
  const raw = crypto.randomBytes(64);
  assert.deepStrictEqual(wa.unb64u(wa.b64u(raw)), raw);
  assert.ok(!wa.b64u(raw).includes('='));
});

ok('CBOR decodes nested structures', () => {
  const encoded = cbor(
    new Map([
      ['fmt', 'none'],
      [1, [2, -7]],
      ['authData', Buffer.from([1, 2, 3])]
    ])
  );
  const decoded = wa.decodeCbor(encoded).value;
  assert.strictEqual(decoded.get('fmt'), 'none');
  assert.deepStrictEqual(decoded.get(1), [2, -7]);
  assert.deepStrictEqual(decoded.get('authData'), Buffer.from([1, 2, 3]));
});

ok('clientDataJSON is parsed and validated', () => {
  const parsed = wa.parseClientData(clientData('webauthn.get'));
  assert.strictEqual(parsed.type, 'webauthn.get');
  assert.strictEqual(parsed.challenge, CHALLENGE);
  assert.strictEqual(parsed.origin, ORIGIN);
  assert.strictEqual(parsed.crossOrigin, false);
});

/* --- registration ------------------------------------------------------- */

for (const [label, makeFixture] of [
  ['ES256', es256Fixture],
  ['RS256', rsaFixture],
  ['Ed25519', ed25519Fixture]
]) {
  ok('registration verifies with ' + label, () => {
    const fixture = makeFixture();
    const result = wa.verifyRegistration(registrationBody(fixture), expectation);
    assert.strictEqual(result.credentialId, wa.b64u(fixture.credentialId));
    assert.strictEqual(result.signCount, 0);
    const stored = result.publicKey;
    assert.ok(stored.key);
    assert.deepStrictEqual(wa.unb64u(result.credentialId), fixture.credentialId);
  });
}

ok('registration rejects a mismatched challenge', () => {
  const fixture = es256Fixture();
  const body = registrationBody(fixture);
  const json = JSON.parse(Buffer.from(body.response.clientDataJSON, 'base64').toString('utf8'));
  json.challenge = 'something-else';
  body.response.clientDataJSON = wa.b64u(Buffer.from(JSON.stringify(json)));
  rejects('registration with the wrong challenge', () => wa.verifyRegistration(body, expectation), /challenge/);
});

ok('registration rejects a foreign origin', () => {
  const fixture = es256Fixture();
  const body = registrationBody(fixture);
  const json = JSON.parse(Buffer.from(body.response.clientDataJSON, 'base64').toString('utf8'));
  json.origin = 'https://evil.example.com';
  body.response.clientDataJSON = wa.b64u(Buffer.from(JSON.stringify(json)));
  rejects('registration from another origin', () => wa.verifyRegistration(body, expectation), /origin/);
});

ok('registration rejects a foreign relying party', () => {
  const fixture = es256Fixture();
  const authData = authDataFor('other.example.com', 0x45, 0, fixture.credentialId, fixture.cose);
  const body = registrationBody(fixture);
  body.response.attestationObject = wa.b64u(
    cbor(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]))
  );
  rejects('registration for another RP', () => wa.verifyRegistration(body, expectation), /relying party/);
});

ok('registration rejects a credential ID mismatch', () => {
  const fixture = es256Fixture();
  const body = registrationBody(fixture);
  body.id = wa.b64u(crypto.randomBytes(16));
  body.rawId = body.id;
  rejects('registration with a swapped credential ID', () => wa.verifyRegistration(body, expectation), /mismatch/);
});

ok('registration requires the user-presence flag', () => {
  const fixture = es256Fixture();
  const authData = authDataFor(RP_ID, 0x45 & ~0x01, 0, fixture.credentialId, fixture.cose);
  const body = registrationBody(fixture);
  body.response.attestationObject = wa.b64u(
    cbor(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]))
  );
  rejects('registration without user presence', () => wa.verifyRegistration(body, expectation), /presence/);
});

/* --- assertions --------------------------------------------------------- */

for (const [label, makeFixture] of [
  ['ES256', es256Fixture],
  ['RS256', rsaFixture],
  ['Ed25519', ed25519Fixture]
]) {
  ok('assertion verifies with ' + label, () => {
    const fixture = makeFixture();
    const registered = wa.verifyRegistration(registrationBody(fixture), expectation);
    const result = wa.verifyAuthentication(assertionBody(fixture), expectation, {
      publicKey: registered.publicKey,
      signCount: 0
    });
    assert.strictEqual(result.signCount, 7);
  });
}

ok('assertion rejects a tampered signature', () => {
  const fixture = es256Fixture();
  const registered = wa.verifyRegistration(registrationBody(fixture), expectation);
  const body = assertionBody(fixture);
  const signature = wa.unb64u(body.response.signature);
  signature[signature.length - 1] ^= 0xff;
  body.response.signature = wa.b64u(signature);
  rejects(
    'assertion with a broken signature',
    () => wa.verifyAuthentication(body, expectation, { publicKey: registered.publicKey, signCount: 0 }),
    /signature/
  );
});

ok('assertion rejects a replayed counter', () => {
  const fixture = es256Fixture();
  const registered = wa.verifyRegistration(registrationBody(fixture), expectation);
  rejects(
    'assertion whose counter did not advance',
    () => wa.verifyAuthentication(assertionBody(fixture), expectation, {
      publicKey: registered.publicKey,
      signCount: 7
    }),
    /counter/
  );
});

ok('assertion rejects a mismatched challenge', () => {
  const fixture = es256Fixture();
  const registered = wa.verifyRegistration(registrationBody(fixture), expectation);
  rejects(
    'assertion for another challenge',
    () =>
      wa.verifyAuthentication(assertionBody(fixture), { challenge: 'other', origin: ORIGIN, rpId: RP_ID }, {
        publicKey: registered.publicKey,
        signCount: 0
      }),
    /challenge/
  );
});

ok('assertion rejects cross-origin ceremonies', () => {
  const fixture = es256Fixture();
  const registered = wa.verifyRegistration(registrationBody(fixture), expectation);
  const body = assertionBody(fixture);
  const json = JSON.parse(Buffer.from(body.response.clientDataJSON, 'base64').toString('utf8'));
  json.crossOrigin = true;
  body.response.clientDataJSON = wa.b64u(Buffer.from(JSON.stringify(json)));
  rejects(
    'cross-origin assertion',
    () => wa.verifyAuthentication(body, expectation, { publicKey: registered.publicKey, signCount: 0 }),
    /cross-origin/
  );
});

ok('a missing assertion is rejected', () => {
  rejects('empty assertion', () => wa.verifyAuthentication(null, expectation, { publicKey: {}, signCount: 0 }));
});

console.log('\n' + checks + ' WebAuthn checks passed');
