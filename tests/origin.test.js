#!/usr/bin/env node
/*
  Unit tests for patch/ztncui/origin.js.

  Regression: 2.0.x compared the raw Origin host:port with the Host header, so
  a reverse proxy (Host rewritten to the backend) or an Origin without the
  explicit port made every login fail with "Bad request origin".
*/

const assert = require('assert');
const path = require('path');

const origin = require(path.join(__dirname, '..', 'patch', 'ztncui', 'origin.js'));

let failed = 0;
function check(name, actual, expected) {
  try {
    assert.deepStrictEqual(actual, expected);
    console.log('ok   ' + name);
  } catch (err) {
    failed++;
    console.error('FAIL ' + name + '\n     expected ' + JSON.stringify(expected)
      + '\n     actual   ' + JSON.stringify(actual));
  }
}

function req(method, headers, remoteAddress) {
  return {
    method,
    headers,
    socket: { remoteAddress },
    get(name) {
      const value = headers[name.toLowerCase()];
      return value === undefined ? undefined : value;
    }
  };
}

const PRIVATE = '172.18.0.1';
const PUBLIC = '203.0.113.9';

// 1. Direct access, exact match.
check('same origin and port',
  origin.checkOrigin(req('POST', { host: '10.0.0.5:3443', origin: 'https://10.0.0.5:3443' }, PUBLIC)).ok,
  true);

// 2. Browser omits the default port on the Origin side.
check('origin without explicit port',
  origin.checkOrigin(req('POST', { host: 'planet.example.com:443', origin: 'https://planet.example.com' }, PUBLIC)).ok,
  true);

// 3. Port remap: proxy listens on 443, app on 3443.
check('port mismatch, same hostname',
  origin.checkOrigin(req('POST', { host: '10.0.0.5:3443', origin: 'https://10.0.0.5' }, PUBLIC)).ok,
  true);

// 4. The reported bug: reverse proxy rewrites Host to the backend, but forwards
//    the browser's host in X-Forwarded-Host from a private peer.
check('reverse proxy with X-Forwarded-Host',
  origin.checkOrigin(req('POST', {
    host: '127.0.0.1:3443',
    'x-forwarded-host': 'planet.example.com',
    origin: 'https://planet.example.com'
  }, PRIVATE)).ok,
  true);

// 5. Forwarded header form.
check('reverse proxy with Forwarded header',
  origin.checkOrigin(req('POST', {
    host: '127.0.0.1:3443',
    forwarded: 'for=203.0.113.7;proto=https;host=planet.example.com',
    origin: 'https://planet.example.com'
  }, PRIVATE)).ok,
  true);

// 6. A remote client cannot make its forged X-Forwarded-Host trusted.
check('untrusted X-Forwarded-Host is ignored',
  origin.checkOrigin(req('POST', {
    host: '127.0.0.1:3443',
    'x-forwarded-host': 'evil.example',
    origin: 'https://evil.example'
  }, PUBLIC)).ok,
  false);

// 7. Same, but the operator enabled TRUST_PROXY.
check('TRUST_PROXY trusts forwarded host',
  origin.checkOrigin(req('POST', {
    host: '127.0.0.1:3443',
    'x-forwarded-host': 'planet.example.com',
    origin: 'https://planet.example.com'
  }, PUBLIC), { trustProxy: true }).ok,
  true);

// 8. Cross-site form post is still rejected.
check('cross-site origin rejected',
  origin.checkOrigin(req('POST', { host: 'planet.example.com', origin: 'https://evil.example' }, PUBLIC)).ok,
  false);

// 9. Subdomain of the same suffix is not accepted.
check('sibling host rejected',
  origin.checkOrigin(req('POST', { host: 'planet.example.com', origin: 'https://evil.planet.example.com' }, PUBLIC)).ok,
  false);

// 10. Referer fallback when Origin is absent.
check('referer fallback',
  origin.checkOrigin(req('POST', {
    host: '10.0.0.5:3443',
    referer: 'https://10.0.0.5:3443/controller/networks'
  }, PUBLIC)).ok,
  true);

// 11. An unparsable Origin carries no host to compare with. Rejecting it does
//     not add protection - any non-browser client can just omit the header,
//     which is allowed - while it locks out browsers that send odd values.
//     Treated like a missing Origin (the Referer is consulted first).
check('unparsable origin without referer is tolerated',
  origin.checkOrigin(req('POST', { host: 'planet.example.com', origin: 'not a url' }, PUBLIC)).ok,
  true);

// 12. Non-browser clients without Origin/Referer still pass the origin gate
//     (they must present a session cookie anyway).
check('missing origin allowed',
  origin.checkOrigin(req('POST', { host: 'planet.example.com' }, PUBLIC)).ok,
  true);

// 13. Safe methods are untouched.
check('GET is not checked',
  origin.checkOrigin(req('GET', { host: 'planet.example.com', origin: 'https://evil.example' }, PUBLIC)).ok,
  true);

// 14. IPv6 literal on both sides.
check('IPv6 origin literal',
  origin.checkOrigin(req('POST', { host: '[::1]:3443', origin: 'https://[::1]:3443' }, '::1')).ok,
  true);

// 15. Hostname comparison is case-insensitive and tolerates a trailing dot.
check('hostname case and trailing dot',
  origin.checkOrigin(req('POST', { host: 'Planet.Example.COM.', origin: 'https://planet.example.com' }, PUBLIC)).ok,
  true);

// 16. Explicit allow-list for setups where the public name never reaches the app.
check('ALLOWED_ORIGINS allow-list',
  origin.checkOrigin(req('POST', {
    host: '127.0.0.1:3443',
    origin: 'https://zt.example.net'
  }, PUBLIC), { allowedOrigins: ['https://zt.example.net'] }).ok,
  true);

// 17. Private/loopback detection used to decide whether forwarded headers count.
check('private address detection',
  ['127.0.0.1', '::1', '::ffff:10.1.2.3', '192.168.1.4', '172.18.0.1', '169.254.1.1', '100.64.0.1']
    .map(origin.isPrivateAddress), [true, true, true, true, true, true, true]);
check('public address detection',
  ['203.0.113.9', '8.8.8.8', '::ffff:8.8.4.4'].map(origin.isPrivateAddress), [false, false, false]);

// 18. "Origin: null" is an opaque origin (sandboxed frame, data:/file: page,
//     in-app WebView). It is not garbage: rejecting it locked those browsers
//     out of the login form entirely.
check('opaque origin is accepted',
  origin.checkOrigin(req('POST', { host: '38.246.246.76:3443', origin: 'null' }, PUBLIC)).ok,
  true);
check('opaque origin uppercase',
  origin.checkOrigin(req('POST', { host: '38.246.246.76:3443', origin: 'NULL' }, PUBLIC)).ok,
  true);

// 19. With an opaque Origin the Referer still gets a say when it disagrees.
check('opaque origin, same-host referer',
  origin.checkOrigin(req('POST', {
    host: '38.246.246.76:3443',
    origin: 'null',
    referer: 'https://38.246.246.76:3443/login'
  }, PUBLIC)).ok,
  true);
check('opaque origin, cross-site referer',
  origin.checkOrigin(req('POST', {
    host: '38.246.246.76:3443',
    origin: 'null',
    referer: 'https://evil.example/attack.html'
  }, PUBLIC)).ok,
  false);

// 20. Garbage in the Origin header cannot be used, so the Referer is used
//     instead of failing outright.
check('unparsable origin falls back to referer',
  origin.checkOrigin(req('POST', {
    host: '10.0.0.5:3443',
    origin: '@@bogus@@',
    referer: 'https://10.0.0.5:3443/login'
  }, PUBLIC)).ok,
  true);

if (failed) {
  console.error(failed + ' check(s) failed');
  process.exit(1);
}
console.log('origin checks passed');
