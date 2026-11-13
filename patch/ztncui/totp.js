/*
  ztncui - ZeroTier network controller UI
  Copyright (C) 2017-2021  Key Networks (https://key-networks.com)
  Licensed under GPLv3 - see LICENSE for details.

  RFC 6238 TOTP, implemented on top of node's crypto module so the image does
  not need another runtime dependency. Verified against the reference vectors
  in tests/totp.test.js (SHA-1, 6 and 8 digits).
*/

const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const DEFAULT_STEP = 30;
const DEFAULT_DIGITS = 6;
const DEFAULT_WINDOW = 1;

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(input) {
  const clean = String(input).toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error('invalid base32 character');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  if (bytes.length === 0) throw new Error('empty base32 string');
  return Buffer.from(bytes);
}

/** A fresh 160-bit secret, base32 encoded (what authenticator apps expect). */
function generateSecret(bytes = 20) {
  return base32Encode(crypto.randomBytes(bytes));
}

/** Group the secret in fours so it can be typed by hand. */
function formatSecret(secret) {
  return String(secret).replace(/(.{4})/g, '$1 ').trim();
}

/** RFC 4226 HOTP on top of a BigInt counter (works past 2^32 steps). */
function hotp(key, counter, digits = DEFAULT_DIGITS) {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', key).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | (digest[offset + 1] << 16)
    | (digest[offset + 2] << 8)
    | digest[offset + 3];
  const modulo = 10 ** digits;
  return String(binary % modulo).padStart(digits, '0');
}

/** The code for one specific time step. */
function codeForStep(secret, step, digits = DEFAULT_DIGITS) {
  return hotp(base32Decode(secret), step, digits);
}

/** The code for a point in time (defaults to now). */
function generate(secret, options = {}) {
  const step = options.step || DEFAULT_STEP;
  const digits = options.digits || DEFAULT_DIGITS;
  const now = options.now === undefined ? Date.now() : options.now;
  return codeForStep(secret, Math.floor(now / 1000 / step), digits);
}

function constantTimeEquals(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/**
 * Check a submitted token. Returns the matched time step (so the caller can
 * refuse to accept the same step twice), or null when nothing matched.
 * A window of 1 accepts the previous, current and next 30 s step, which covers
 * ordinary clock drift without widening the attack surface much.
 */
function verify(secret, token, options = {}) {
  const step = options.step || DEFAULT_STEP;
  const digits = options.digits || DEFAULT_DIGITS;
  const window = options.window === undefined ? DEFAULT_WINDOW : options.window;
  const now = options.now === undefined ? Date.now() : options.now;

  const submitted = String(token === undefined || token === null ? '' : token).replace(/[\s-]/g, '');
  if (!new RegExp('^\\d{' + digits + '}$').test(submitted)) return null;

  const current = Math.floor(now / 1000 / step);
  for (let offset = -window; offset <= window; offset += 1) {
    const candidate = current + offset;
    if (candidate < 0) continue;
    if (constantTimeEquals(codeForStep(secret, candidate, digits), submitted)) {
      return candidate;
    }
  }
  return null;
}

/** otpauth:// URI for the enrollment screen (paste-able into any TOTP app). */
function otpauthUri(secret, account, issuer = 'ZeroTier Planet') {
  const label = encodeURIComponent(issuer) + ':' + encodeURIComponent(account);
  const params = new URLSearchParams({
    secret: String(secret).replace(/[\s-]/g, ''),
    issuer: String(issuer),
    algorithm: 'SHA1',
    digits: String(DEFAULT_DIGITS),
    period: String(DEFAULT_STEP)
  });
  return 'otpauth://totp/' + label + '?' + params.toString();
}

// Backup codes: 40 bits of entropy each, shown once, stored as SHA-256 hashes.
// A salted PBKDF2 would be pointless here: the codes are random, not memorable,
// and the file they live in is already 0600 inside the controller's data volume.
const BACKUP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateBackupCodes(count = 8) {
  const codes = [];
  for (let i = 0; i < count; i += 1) {
    let raw = '';
    for (let j = 0; j < 8; j += 1) {
      raw += BACKUP_ALPHABET[crypto.randomInt(BACKUP_ALPHABET.length)];
    }
    codes.push(raw.slice(0, 4) + '-' + raw.slice(4));
  }
  return codes;
}

function normalizeBackupCode(code) {
  return String(code === undefined || code === null ? '' : code).toUpperCase().replace(/[\s-]/g, '');
}

function hashBackupCode(code) {
  return crypto.createHash('sha256').update(normalizeBackupCode(code)).digest('hex');
}

exports.ALPHABET = ALPHABET;
exports.base32Encode = base32Encode;
exports.base32Decode = base32Decode;
exports.generateSecret = generateSecret;
exports.formatSecret = formatSecret;
exports.hotp = hotp;
exports.codeForStep = codeForStep;
exports.generate = generate;
exports.verify = verify;
exports.otpauthUri = otpauthUri;
exports.generateBackupCodes = generateBackupCodes;
exports.normalizeBackupCode = normalizeBackupCode;
exports.hashBackupCode = hashBackupCode;
exports.constantTimeEquals = constantTimeEquals;
exports.DEFAULT_STEP = DEFAULT_STEP;
exports.DEFAULT_DIGITS = DEFAULT_DIGITS;
