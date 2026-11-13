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
const usersController = require('../controllers/usersController');

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

/** Wrap the callback-based authenticate() so the handler can stay async. */
function authenticateAsync(name, pass) {
  return new Promise(function(resolve) {
    auth.authenticate(name, pass, function(err, user) {
      resolve(err ? null : user || null);
    });
  });
}

const PENDING_TTL_MS = 5 * 60 * 1000;

/** Start a session for a fully authenticated user. */
function finishLogin(req, res, next, user, redirectTo) {
  req.session.regenerate(function(regenErr) {
    if (regenErr) return next(regenErr);
    delete req.session.pending2fa;
    req.session.user = user;
    req.session.success = msg(req, 'msg.authenticatedAs', { name: user.name });
    if (user.pass_set) {
      res.redirect(safeRedirect(redirectTo));
    } else {
      res.redirect('/users/' + encodeURIComponent(user.name) + '/password');
    }
  });
}

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
    const user = await authenticateAsync(username, password);
    if (!user) {
      recordFailure(ip);
      return res.status(401).render('login', {
        title: msg(req, 'page.login'),
        message: msg(req, 'msg.authFailed')
      });
    }

    // Password is correct. When 2FA is on, stop here and ask for the token;
    // nothing is granted until the second factor is verified.
    const status = await usersController.totp_status(user.name);
    if (status.enabled) {
      clearFailures(ip);
      const redirectTo = safeRedirect(req.query.redirect);
      req.session.regenerate(function(regenErr) {
        if (regenErr) return next(regenErr);
        req.session.pending2fa = {
          name: user.name,
          pass_set: !!user.pass_set,
          redirect: redirectTo,
          issued_at: Date.now()
        };
        res.redirect('/login/2fa');
      });
      return;
    }

    clearFailures(ip);
    finishLogin(req, res, next, user, req.query.redirect);
  } catch (err) {
    next(err);
  }
});

router.get('/login/2fa', function(req, res) {
  const pending = req.session.pending2fa;
  if (!pending || Date.now() - pending.issued_at > PENDING_TTL_MS) {
    delete req.session.pending2fa;
    return res.redirect('/login');
  }
  res.render('login2fa', {
    title: msg(req, 'page.twoFactor'),
    name: pending.name,
    message: null
  });
});

router.post('/login/2fa', async function(req, res, next) {
  const ip = clientIp(req);
  const pending = req.session.pending2fa;

  if (!pending || Date.now() - pending.issued_at > PENDING_TTL_MS) {
    delete req.session.pending2fa;
    req.session.error = msg(req, 'msg.totpSessionExpired');
    return res.redirect('/login');
  }

  if (isThrottled(ip)) {
    res.setHeader('Retry-After', '900');
    return res.status(429).render('login2fa', {
      title: msg(req, 'page.twoFactor'),
      name: pending.name,
      message: msg(req, 'msg.tooManyAttempts')
    });
  }

  const code = typeof req.body.code === 'string' ? req.body.code : '';
  if (!code || code.length > 32) {
    recordFailure(ip);
    return res.status(401).render('login2fa', {
      title: msg(req, 'page.twoFactor'),
      name: pending.name,
      message: msg(req, 'msg.totpCodeInvalid')
    });
  }

  try {
    const check = await usersController.totp_check(pending.name, code);
    if (!check.ok) {
      recordFailure(ip);
      return res.status(401).render('login2fa', {
        title: msg(req, 'page.twoFactor'),
        name: pending.name,
        message: msg(req, 'msg.totpCodeInvalid')
      });
    }

    clearFailures(ip);
    finishLogin(req, res, next, { name: pending.name, pass_set: pending.pass_set }, pending.redirect);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
