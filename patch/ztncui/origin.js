/*
  ztncui - ZeroTier network controller UI
  Copyright (C) 2017-2021  Key Networks (https://key-networks.com)
  Licensed under GPLv3 - see LICENSE for details.

  Origin/Referer validation for state-changing requests.

  The strict "Origin host must equal the Host header" check in earlier 2.0
  builds rejected perfectly legitimate logins as soon as anything rewrote the
  Host header: a reverse proxy (1Panel site proxy, nginx, Caddy, Traefik), a
  port remap, or an Origin without the explicit port

      Origin: https://planet.example.com     Host: 127.0.0.1:3443
      -> 403 "Bad request origin"

  This module keeps the cross-site protection but compares *hostnames* instead
  of raw host:port strings, and accepts a proxy-forwarded host when the request
  really did come from a proxy (loopback/private peer, or TRUST_PROXY set).
*/

const net = require('net');

function stripBrackets(host) {
  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    return end === -1 ? host : host.slice(1, end);
  }
  // "1.2.3.4:80" -> "1.2.3.4"; bare IPv6 without brackets has >1 colon
  const firstColon = host.indexOf(':');
  if (firstColon !== -1 && host.indexOf(':', firstColon + 1) === -1) {
    return host.slice(0, firstColon);
  }
  return host;
}

function normalizeHostname(host) {
  if (!host) return '';
  let value = String(host).trim().toLowerCase();
  if (!value) return '';
  // A full origin (scheme://host[:port]) is accepted as well.
  if (value.includes('://')) {
    try {
      value = new URL(value).host;
    } catch (err) {
      return '';
    }
  }
  value = stripBrackets(value);
  if (value.endsWith('.')) value = value.slice(0, -1);
  return value;
}

function firstHeaderValue(value) {
  if (!value) return '';
  // Proxies may append: "a.example.com, b.example.com" or "a, b".
  const first = String(value).split(',')[0];
  return first ? first.trim() : '';
}

function isPrivateAddress(address) {
  if (!address) return false;
  let addr = String(address);
  if (addr.startsWith('::ffff:')) addr = addr.slice(7);
  if (addr === '::1' || addr === 'localhost') return true;
  if (addr.startsWith('fe80:') || addr.startsWith('fc') || addr.startsWith('fd')) return true;
  if (!net.isIPv4(addr)) return false;
  const parts = addr.split('.').map(Number);
  if (parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts;
  if (a === 10 || a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function peerAddress(req) {
  const socket = req.socket || req.connection || {};
  return socket.remoteAddress || '';
}

/*
 * Whether the forwarded headers on this request may be trusted: either the
 * operator opted in with TRUST_PROXY, or the connection comes from a local /
 * private address (the usual case inside a container network or a reverse
 * proxy on the same host). A remote attacker cannot forge this, because it
 * describes the TCP peer, not a header.
 */
function forwardedHeadersTrusted(req, options) {
  if (options && options.trustProxy) return true;
  return isPrivateAddress(peerAddress(req));
}

function collectCandidates(req, options) {
  const opts = options || {};
  const candidates = [];

  const host = req.get ? req.get('host') : req.headers.host;
  if (host) candidates.push(host);

  if (forwardedHeadersTrusted(req, opts)) {
    const forwardedHost = req.get ? req.get('x-forwarded-host') : req.headers['x-forwarded-host'];
    const firstForwarded = firstHeaderValue(forwardedHost);
    if (firstForwarded) candidates.push(firstForwarded);

    const forwarded = req.get ? req.get('forwarded') : req.headers.forwarded;
    if (forwarded) {
      const match = /host="?([^;",]+)"?/i.exec(String(forwarded));
      if (match) candidates.push(match[1].trim());
    }
  }

  for (const extra of opts.allowedOrigins || []) {
    if (extra) candidates.push(extra);
  }

  return candidates
    .map(normalizeHostname)
    .filter((value, index, list) => value && list.indexOf(value) === index);
}

function parseOrigin(source) {
  try {
    const url = new URL(source);
    if (!url.hostname) return null;
    return url;
  } catch (err) {
    return null;
  }
}

/*
 * "Origin: null" is what browsers send for an opaque origin: a sandboxed
 * iframe, a data:/file: page, or - very common in the field - an in-app
 * WebView (WeChat, QQ, UC, some Android browsers). It is a legal value, not
 * garbage, so it must not be treated as an unparsable origin: that made every
 * login fail in those browsers. An opaque origin carries no host to compare,
 * so we fall back to the Referer and, when that is missing too, behave like a
 * client that sent no Origin at all (the session cookie is SameSite=Lax, so a
 * cross-site POST never carries credentials anyway).
 */
function usableSource(value) {
  const raw = value ? String(value).trim() : '';
  if (!raw) return '';
  if (raw.toLowerCase() === 'null') return '';
  return raw;
}

/*
 * Returns { ok: true } or { ok: false, reason, origin, candidates }.
 * `reason` is one of: unparsable | mismatch.
 */
function checkOrigin(req, options) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return { ok: true };

  const headerOrigin = (req.get && req.get('origin'))
    || (req.headers && req.headers.origin) || '';
  const headerReferer = (req.get && req.get('referer'))
    || (req.headers && req.headers.referer) || '';

  const source = usableSource(headerOrigin) || usableSource(headerReferer);
  if (!source) return { ok: true, reason: 'no-source' }; // opaque origin or non-browser client

  const candidates = collectCandidates(req, options);
  const parsed = parseOrigin(source);
  if (!parsed) {
    // An unparsable Origin ("null" is handled above) still has the Referer as
    // a second chance; only reject when neither can be used.
    const fallback = parseOrigin(usableSource(headerReferer) || '');
    if (!fallback) return { ok: true, reason: 'no-source' };
    const fallbackHost = normalizeHostname(fallback.host);
    if (fallbackHost && candidates.includes(fallbackHost)) return { ok: true };
    return { ok: false, reason: 'mismatch', origin: String(headerReferer), candidates };
  }

  const originHost = normalizeHostname(parsed.host);
  if (originHost && candidates.includes(originHost)) return { ok: true };

  return { ok: false, reason: 'mismatch', origin: source, candidates };
}

module.exports = {
  checkOrigin,
  collectCandidates,
  forwardedHeadersTrusted,
  isPrivateAddress,
  normalizeHostname,
  peerAddress
};
