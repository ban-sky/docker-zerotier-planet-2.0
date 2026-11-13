#!/usr/bin/env node
/*
  Checks for patch/ztncui/totp.js, including the reference vectors from
  RFC 6238 appendix B (HMAC-SHA1) so the implementation is verified against the
  specification rather than against itself.
*/

const assert = require('assert');
const totp = require('../patch/ztncui/totp');

let checks = 0;
function ok(name, fn) {
  fn();
  checks += 1;
  console.log('ok   ' + name);
}

const RFC_SECRET = totp.base32Encode(Buffer.from('12345678901234567890'));

ok('base32 matches the RFC seed', () => {
  assert.strictEqual(RFC_SECRET, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
});

ok('base32 round-trips', () => {
  const raw = Buffer.from('a longer secret with binary \u0000\u00ff bytes');
  assert.deepStrictEqual(totp.base32Decode(totp.base32Encode(raw)), raw);
});

ok('RFC 6238 SHA-1 vectors (8 digits)', () => {
  const vectors = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130']
  ];
  for (const [time, expected] of vectors) {
    const step = Math.floor(time / 30);
    assert.strictEqual(totp.codeForStep(RFC_SECRET, step, 8), expected, 'time ' + time);
  }
});

ok('6-digit codes are the trailing 6 digits of the 8-digit ones', () => {
  assert.strictEqual(totp.generate(RFC_SECRET, { now: 59 * 1000 }), '287082');
  assert.strictEqual(totp.generate(RFC_SECRET, { now: 1234567890 * 1000 }), '005924');
});

ok('verify accepts the current step', () => {
  const now = 1700000000000;
  const code = totp.generate(RFC_SECRET, { now });
  assert.strictEqual(totp.verify(RFC_SECRET, code, { now }), Math.floor(now / 30000));
});

ok('verify accepts one step of drift but not two', () => {
  const now = 1700000000000;
  const step = Math.floor(now / 30000);
  const previous = totp.codeForStep(RFC_SECRET, step - 1);
  const next = totp.codeForStep(RFC_SECRET, step + 1);
  const tooOld = totp.codeForStep(RFC_SECRET, step - 2);
  assert.notStrictEqual(totp.verify(RFC_SECRET, previous, { now }), null);
  assert.notStrictEqual(totp.verify(RFC_SECRET, next, { now }), null);
  assert.strictEqual(totp.verify(RFC_SECRET, tooOld, { now }), null);
});

ok('verify rejects malformed input', () => {
  const now = 1700000000000;
  for (const bad of ['', '12345', '1234567', 'abcdef', '12 34 56', null, undefined, '  ']) {
    assert.strictEqual(totp.verify(RFC_SECRET, bad, { now }), null, String(bad));
  }
});

ok('verify tolerates spaces and dashes in the submitted code', () => {
  const now = 1700000000000;
  const code = totp.generate(RFC_SECRET, { now });
  assert.notStrictEqual(totp.verify(RFC_SECRET, code.slice(0, 3) + ' ' + code.slice(3), { now }), null);
});

ok('generateSecret produces 20 random bytes', () => {
  const a = totp.generateSecret();
  const b = totp.generateSecret();
  assert.strictEqual(totp.base32Decode(a).length, 20);
  assert.notStrictEqual(a, b);
});

ok('formatSecret groups the secret in fours', () => {
  assert.strictEqual(totp.formatSecret('ABCDEFGHIJKL'), 'ABCD EFGH IJKL');
});

ok('otpauth URI carries the expected parameters', () => {
  const uri = new URL(totp.otpauthUri('ABCDEFGH', 'admin@example', 'ZeroTier Planet'));
  assert.strictEqual(uri.protocol, 'otpauth:');
  assert.strictEqual(uri.host, 'totp');
  assert.strictEqual(decodeURIComponent(uri.pathname).replace(/^\//, ''), 'ZeroTier Planet:admin@example');
  assert.strictEqual(uri.searchParams.get('secret'), 'ABCDEFGH');
  assert.strictEqual(uri.searchParams.get('issuer'), 'ZeroTier Planet');
  assert.strictEqual(uri.searchParams.get('algorithm'), 'SHA1');
  assert.strictEqual(uri.searchParams.get('digits'), '6');
  assert.strictEqual(uri.searchParams.get('period'), '30');
});

ok('backup codes are unique, grouped and hash to different digests', () => {
  const codes = totp.generateBackupCodes(8);
  assert.strictEqual(codes.length, 8);
  assert.strictEqual(new Set(codes).size, 8);
  for (const code of codes) assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const hashes = codes.map(totp.hashBackupCode);
  assert.strictEqual(new Set(hashes).size, 8);
  assert.strictEqual(totp.hashBackupCode(codes[0].toLowerCase()), hashes[0]);
  assert.strictEqual(totp.hashBackupCode(codes[0].replace('-', ' ')), hashes[0]);
});

ok('constantTimeEquals compares strings of different length safely', () => {
  assert.strictEqual(totp.constantTimeEquals('123456', '123456'), true);
  assert.strictEqual(totp.constantTimeEquals('123456', '123457'), false);
  assert.strictEqual(totp.constantTimeEquals('123456', '12345'), false);
});

console.log('\n' + checks + ' TOTP checks passed');
