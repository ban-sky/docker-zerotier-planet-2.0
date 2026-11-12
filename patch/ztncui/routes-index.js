/*
  ztncui - ZeroTier network controller UI
  Copyright (C) 2017-2021  Key Networks (https://key-networks.com)
  Licensed under GPLv3 - see LICENSE for details.
*/

const express = require('express');
const auth = require('../controllers/auth');
const authenticate = auth.authenticate;
const restrict = auth.restrict;
const router = express.Router();

// Translate a user-visible string when the i18n middleware is installed; fall
// back to the key so the UI still renders when it is not.
function msg(req, key, vars) {
  return req.t ? req.t(key, vars) : key;
}

// Failed-login throttling. Per source IP, 10 failures per 15 minutes.
const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const failures = new Map();

function clientIp(req) {
  return req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
}

function failureRecord(ip) {
  const now = Date.now();
  let record = failures.get(ip);
  if (!record || record.reset <= now) {
    record = { count: 0, reset: now + FAILURE_WINDOW_MS };
    failures.set(ip, record);
  }
  return record;
}

function isThrottled(ip) {
  const record = failures.get(ip);
  return !!record && record.reset > Date.now() && record.count >= MAX_FAILURES;
}

function recordFailure(ip) {
  const record = failureRecord(ip);
  record.count += 1;
}

function clearFailures(ip) {
  failures.delete(ip);
}

const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of failures) {
    if (record.reset <= now) failures.delete(ip);
  }
}, 5 * 60 * 1000);
if (cleanup.unref) cleanup.unref();

/** Only allow redirects to a local absolute path. */
function safeRedirect(target) {
  if (typeof target !== 'string' || target.length === 0 || target.length > 512) {
    return '/controller';
  }
  if (target[0] !== '/' || target[1] === '/' || target[1] === '\\') {
    return '/controller';
  }
  return target;
}

/** Redirect logged user to controller page */
function guest_only(req, res, next) {
  if (req.session.user) {
    res.redirect('/controller');
  } else {
    next();
  }
}

/* GET home page. */
router.get('/', guest_only, function(req, res, next) {
  res.render('front_door', { title: 'ztncui' });
});

router.get('/logout', function(req, res) {
  req.session.destroy(function() {
    res.clearCookie('ztncui.sid', { path: '/' });
    res.redirect('/');
  });
});

router.get('/login', guest_only, function(req, res) {
  let message = null;
  if (req.session.error) {
    if (req.session.error !== 'Access denied!') {
      message = req.session.error;
    }
  } else {
    message = req.session.success;
  }
  res.render('login', { title: msg(req, 'page.login'), message: message });
});

router.post('/login', async function(req, res, next) {
  const ip = clientIp(req);

  if (isThrottled(ip)) {
    res.setHeader('Retry-After', '900');
    return res.status(429).render('login', {
      title: msg(req, 'page.login'),
      message: msg(req, 'msg.tooManyAttempts')
    });
  }

  const username = typeof req.body.username === 'string' ? req.body.username : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!username || !password || username.length > 128 || password.length > 160) {
    recordFailure(ip);
    return res.status(401).render('login', {
      title: msg(req, 'page.login'),
      message: msg(req, 'msg.authFailed')
    });
  }

  try {
    await authenticate(username, password, function(err, user) {
      if (!user) {
        recordFailure(ip);
        return res.status(401).render('login', {
          title: msg(req, 'page.login'),
          message: msg(req, 'msg.authFailed')
        });
      }

      clearFailures(ip);
      req.session.regenerate(function(regenErr) {
        if (regenErr) return next(regenErr);
        req.session.user = user;
        req.session.success = msg(req, 'msg.authenticatedAs', { name: user.name });
        if (user.pass_set) {
          res.redirect(safeRedirect(req.query.redirect));
        } else {
          res.redirect('/users/' + encodeURIComponent(user.name) + '/password');
        }
      });
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
