/*
  ztncui - ZeroTier network controller UI
  Copyright (C) 2017-2021  Key Networks (https://key-networks.com)
  Licensed under GPLv3 - see LICENSE for details.

  Hardened user/password controller:
  - password file is configurable and outside the application directory
  - atomic writes with 0600 permissions
  - username lookups never traverse the prototype chain
  - existing admin passwords can only be changed by that admin
  - the bootstrap password file is removed after the first password change
*/

const fs = require('fs');
const path = require('path');
const util = require('util');
const argon2 = require('../argon2-wasm');

const passwd_file = process.env.ZTNCUI_PASSWD
  ? path.resolve(process.env.ZTNCUI_PASSWD)
  : path.join(__dirname, '..', 'etc', 'passwd');
const admin_password_file = process.env.ZTNCUI_ADMIN_PASSWORD_FILE || '';
const min_pass_len = 10;
const max_pass_len = 160;
const username_re = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const reserved_names = new Set(['__proto__', 'prototype', 'constructor', 'hasOwnProperty']);

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const chmod = util.promisify(fs.chmod);
const rename = util.promisify(fs.rename);
const mkdir = util.promisify(fs.mkdir);
const unlink = util.promisify(fs.unlink);

let _users = null;

// Translate a user-visible string when the i18n middleware is installed; fall
// back to the key so the UI still renders when it is not.
function msg(req, key, vars) {
  return req.t ? req.t(key, vars) : key;
}

function validUsername(name) {
  return typeof name === 'string' && username_re.test(name) && !reserved_names.has(name);
}

const get_users = async function() {
  if (_users) return _users;
  _users = JSON.parse(await readFile(passwd_file, 'utf8'));
  return _users;
};
exports.get_users = get_users;

const update_users = async function(users) {
  await mkdir(path.dirname(passwd_file), { recursive: true, mode: 0o700 });
  const tmp = passwd_file + '.tmp-' + process.pid;
  await writeFile(tmp, JSON.stringify(users), { encoding: 'utf8', mode: 0o600 });
  await chmod(tmp, 0o600);
  await rename(tmp, passwd_file);
  await chmod(passwd_file, 0o600);
  _users = null;
  return await get_users();
};

function removeBootstrapPassword() {
  if (!admin_password_file) return;
  unlink(admin_password_file).catch(() => {});
}

exports.users_list = async function(req, res) {
  const navigate = { active: 'users' };
  try {
    const users = await get_users();
    const list = Object.keys(users).map((name) => ({ name, pass_set: !!users[name].pass_set }));
    res.render('users', { title: msg(req, 'page.adminUsers'), navigate, message: msg(req, 'users.description'), users: list });
  } catch (err) {
    res.status(500).render('users', {
      title: msg(req, 'page.adminUsers'),
      navigate,
      message: msg(req, 'msg.error'),
      users: null,
      error: msg(req, 'users.listFailed')
    });
  }
};

exports.password_get = async function(req, res) {
  const navigate = { active: 'users' };
  const target = req.params.name;
  const sessionUser = req.session.user && req.session.user.name;

  if (!validUsername(target)) {
    return res.status(400).render('error', { message: msg(req, 'msg.invalidUsername'), error: {} });
  }

  let users;
  try {
    users = await get_users();
  } catch (err) {
    throw err;
  }

  const existing = Object.prototype.hasOwnProperty.call(users, target) ? users[target] : null;
  if (existing && existing.pass_set && target !== sessionUser) {
    return res.status(403).render('error', { message: msg(req, 'msg.ownPasswordOnly'), error: {} });
  }

  const user = { name: target, password1: null, password2: null };
  res.render('password', {
    title: msg(req, 'page.setPassword'),
    navigate,
    user,
    readonly: true,
    message: ''
  });
};

exports.password_post = async function(req, res) {
  const navigate = { active: 'users' };
  const target = req.params.name;
  const sessionUser = req.session.user && req.session.user.name;

  if (!validUsername(target)) {
    return res.status(400).render('error', { message: msg(req, 'msg.invalidUsername'), error: {} });
  }

  let users;
  try {
    users = await get_users();
  } catch (err) {
    throw err;
  }

  const existing = Object.prototype.hasOwnProperty.call(users, target) ? users[target] : null;
  if (existing && existing.pass_set && target !== sessionUser) {
    return res.status(403).render('error', { message: msg(req, 'msg.ownPasswordOnly'), error: {} });
  }

  req.checkBody('password1', msg(req, 'msg.passwordRequired')).notEmpty();
  req.checkBody('password1', msg(req, 'msg.passwordMinLength', { min: min_pass_len }))
    .isLength({ min: min_pass_len, max: max_pass_len });
  req.checkBody('password2', msg(req, 'msg.passwordReenter')).notEmpty();
  req.checkBody('password2', msg(req, 'msg.passwordsDiffer')).equals(req.body.password1);

  const errors = req.validationErrors();
  if (errors) {
    return res.status(400).render('password', {
      title: msg(req, 'page.setPassword'),
      navigate,
      user: { name: target, password1: null, password2: null },
      readonly: true,
      message: msg(req, 'msg.checkErrorsBelow'),
      errors
    });
  }

  let pass_set = true;
  if (req.body.pass_set === 'check') pass_set = false;

  const hash = await argon2.hash(req.body.password1);
  users[target] = { name: target, pass_set, hash };
  await update_users(users);

  if (pass_set && target === sessionUser) {
    // The bootstrap password is useless after the admin has chosen a new one.
    removeBootstrapPassword();
  }

  res.render('password', {
    title: msg(req, 'page.setPassword'),
    navigate,
    user: { name: target },
    readonly: true,
    message: msg(req, 'msg.passwordSetFor', { name: target })
  });
};

exports.user_create_get = async function(req, res) {
  const navigate = { active: 'create_user' };
  res.render('password', {
    title: msg(req, 'page.createAdmin'),
    navigate,
    user: { name: null, password1: null, password2: null },
    readonly: false,
    message: ''
  });
};

exports.user_create_post = async function(req, res) {
  const navigate = { active: 'create_user' };
  const name = typeof req.body.username === 'string' ? req.body.username.trim() : '';

  if (!validUsername(name)) {
    return res.status(400).render('password', {
      title: msg(req, 'page.createAdmin'),
      navigate,
      user: { name, password1: null, password2: null },
      readonly: false,
      message: msg(req, 'msg.usernameRule')
    });
  }

  let users;
  try {
    users = await get_users();
  } catch (err) {
    throw err;
  }
  if (Object.prototype.hasOwnProperty.call(users, name)) {
    return res.status(409).render('password', {
      title: msg(req, 'page.createAdmin'),
      navigate,
      user: { name, password1: null, password2: null },
      readonly: false,
      message: msg(req, 'msg.userExists')
    });
  }

  // Keep the original 307 flow: the password is submitted by the next form.
  res.redirect(307, '/users/' + encodeURIComponent(name) + '/password');
};

exports.user_delete_get = async function(req, res) {
  const navigate = { active: 'users' };
  const target = req.params.name;

  let users;
  try {
    users = await get_users();
  } catch (err) {
    throw err;
  }

  const user = Object.prototype.hasOwnProperty.call(users, target) ? users[target] : null;
  if (!user) {
    return res.status(404).render('user_delete', { title: msg(req, 'page.deleteUser'), navigate, user: null });
  }
  if (req.session.user && req.session.user.name === target) {
    return res.status(400).render('user_delete', {
      title: msg(req, 'page.deleteUser'),
      navigate,
      user,
      self_delete: true
    });
  }

  res.render('user_delete', { title: msg(req, 'page.deleteUser'), navigate, user });
};

exports.user_delete_post = async function(req, res) {
  const navigate = { active: 'users' };
  const target = req.params.name;

  if (req.body.delete !== 'delete') {
    return res.redirect('/users');
  }

  let users;
  try {
    users = await get_users();
  } catch (err) {
    throw err;
  }

  const user = Object.prototype.hasOwnProperty.call(users, target) ? users[target] : null;
  if (!user) {
    return res.status(404).render('user_delete', { title: msg(req, 'page.deleteUser'), navigate, user: null });
  }
  if (req.session.user && req.session.user.name === target) {
    return res.status(400).render('user_delete', {
      title: msg(req, 'page.deleteUser'),
      navigate,
      user,
      self_delete: true
    });
  }
  if (Object.keys(users).length <= 1) {
    return res.status(400).render('user_delete', {
      title: msg(req, 'page.deleteUser'),
      navigate,
      user,
      errors: [{ msg: msg(req, 'msg.lastAdminCannotBeDeleted') }]
    });
  }

  delete users[target];
  await update_users(users);

  res.render('user_delete', {
    title: msg(req, 'page.deletedUser'),
    navigate,
    user: { name: target },
    deleted: true
  });
};

// ---------------------------------------------------------------------------
// Two-factor authentication (TOTP, RFC 6238)
//
// The secret and the hashed backup codes live next to the password hash in the
// passwd file (0600, inside the controller's data volume). Nothing is ever put
// into the session except a short-lived enrollment secret.
// ---------------------------------------------------------------------------

const totp = require('../totp');

const ISSUER = process.env.TOTP_ISSUER || 'ZeroTier Planet';
const MAX_BACKUP_CODES = 10;

function totpRecord(user) {
  if (user && user.totp && typeof user.totp.secret === 'string' && user.totp.secret) {
    return user.totp;
  }
  return null;
}

function loadUser(users, name) {
  if (!validUsername(name) || !Object.prototype.hasOwnProperty.call(users, name)) return null;
  return users[name] || null;
}

exports.totp_status = async function(name) {
  const users = await get_users();
  const user = loadUser(users, name);
  const record = totpRecord(user);
  if (!record) return { enabled: false, backup_codes: 0, verified_at: null };
  return {
    enabled: true,
    backup_codes: Array.isArray(record.backupCodes) ? record.backupCodes.length : 0,
    verified_at: record.verifiedAt || null
  };
};

/** A fresh enrollment challenge; the secret waits in the session until it is confirmed. */
exports.totp_challenge = function(name) {
  const secret = totp.generateSecret();
  return {
    secret,
    formatted: totp.formatSecret(secret),
    uri: totp.otpauthUri(secret, name, ISSUER),
    issuer: ISSUER
  };
};

/** Store the confirmed secret and return the one-time backup codes. */
exports.totp_activate = async function(name, secret, step) {
  const users = await get_users();
  const user = loadUser(users, name);
  if (!user) throw new Error('unknown user');

  const codes = totp.generateBackupCodes(MAX_BACKUP_CODES);
  user.totp = {
    secret,
    verifiedAt: Date.now(),
    lastStep: step,
    backupCodes: codes.map(totp.hashBackupCode)
  };
  await update_users(users);
  return codes;
};

exports.totp_deactivate = async function(name) {
  const users = await get_users();
  const user = loadUser(users, name);
  if (!user) return false;
  if (!totpRecord(user)) return false;
  delete user.totp;
  await update_users(users);
  return true;
};

exports.totp_regenerate_backup_codes = async function(name) {
  const users = await get_users();
  const user = loadUser(users, name);
  const record = totpRecord(user);
  if (!record) return null;
  const codes = totp.generateBackupCodes(MAX_BACKUP_CODES);
  record.backupCodes = codes.map(totp.hashBackupCode);
  record.lastStep = record.lastStep || 0;
  await update_users(users);
  return codes;
};

/**
 * Check a submitted code: a TOTP token first, then a backup code. Replaying a
 * token that was already used for this account is refused, so a code observed
 * on the wire cannot be replayed inside its 30 s window.
 *
 * Returns { ok: true, kind: 'totp' | 'backup' } or { ok: false, reason }.
 */
exports.totp_check = async function(name, token) {
  const users = await get_users();
  const user = loadUser(users, name);
  const record = totpRecord(user);
  if (!record) return { ok: false, reason: 'not_enabled' };

  const step = totp.verify(record.secret, token);
  if (step !== null) {
    if (record.lastStep && step <= record.lastStep) {
      return { ok: false, reason: 'replayed' };
    }
    record.lastStep = step;
    await update_users(users);
    return { ok: true, kind: 'totp' };
  }

  const hash = totp.hashBackupCode(token);
  const codes = Array.isArray(record.backupCodes) ? record.backupCodes : [];
  const index = codes.indexOf(hash);
  if (index !== -1) {
    codes.splice(index, 1);
    record.backupCodes = codes;
    await update_users(users);
    return { ok: true, kind: 'backup', remaining: codes.length };
  }

  return { ok: false, reason: 'invalid' };
};

// --- pages -----------------------------------------------------------------

function selfOnly(req, res, name) {
  const sessionUser = req.session.user && req.session.user.name;
  if (sessionUser === name) return true;
  res.status(403).render('error', { message: msg(req, 'msg.ownPasswordOnly'), error: {} });
  return false;
}

exports.totp_get = async function(req, res) {
  const navigate = { active: 'users' };
  const name = req.params.name;
  if (!validUsername(name)) {
    return res.status(400).render('error', { message: msg(req, 'msg.invalidUsername'), error: {} });
  }
  if (!selfOnly(req, res, name)) return;

  const status = await exports.totp_status(name);

  let flash = '';
  if (req.session.error) {
    flash = req.session.error;
    delete req.session.error;
  } else if (req.session.success) {
    flash = req.session.success;
    delete req.session.success;
  }

  // Keep one enrollment secret per session so refreshing the page does not
  // invalidate the QR scan the user just did.
  if (!status.enabled) {
    const current = req.session.totpEnroll;
    if (!current || current.name !== name || !current.secret) {
      req.session.totpEnroll = Object.assign({ name, issued_at: Date.now() }, exports.totp_challenge(name));
    }
    return res.render('totp', {
      title: msg(req, 'page.twoFactor'),
      navigate,
      name,
      status,
      enroll: req.session.totpEnroll,
      backupCodes: null,
      message: flash
    });
  }

  // Enrollment finished: the plaintext codes are shown exactly once, straight
  // from the redirect target, and never kept in the session.
  const fresh = req.session.totpBackupCodes;
  delete req.session.totpBackupCodes;
  delete req.session.totpEnroll;

  res.render('totp', {
    title: msg(req, 'page.twoFactor'),
    navigate,
    name,
    status,
    enroll: null,
    backupCodes: Array.isArray(fresh) ? fresh : null,
    message: flash
  });
};

exports.totp_enable_post = async function(req, res) {
  const navigate = { active: 'users' };
  const name = req.params.name;
  if (!validUsername(name)) {
    return res.status(400).render('error', { message: msg(req, 'msg.invalidUsername'), error: {} });
  }
  if (!selfOnly(req, res, name)) return;

  const challenge = req.session.totpEnroll;
  if (!challenge || challenge.name !== name || !challenge.secret) {
    req.session.error = msg(req, 'msg.totpRestart');
    return res.redirect('/users/' + encodeURIComponent(name) + '/totp');
  }

  const status = await exports.totp_status(name);
  if (status.enabled) {
    req.session.error = msg(req, 'msg.totpAlreadyEnabled');
    return res.redirect('/users/' + encodeURIComponent(name) + '/totp');
  }

  // Passkeys and TOTP are mutually exclusive; an account carries one.
  const passkeys = passkeyRecords(loadUser(await get_users(), name));
  if (passkeys.length) {
    req.session.error = msg(req, 'msg.passkeyTotpConflict');
    return res.redirect('/users/' + encodeURIComponent(name) + '/totp');
  }

  const step = totp.verify(challenge.secret, req.body.code);
  if (step === null) {
    return res.status(400).render('totp', {
      title: msg(req, 'page.twoFactor'),
      navigate,
      name,
      status,
      enroll: challenge,
      backupCodes: null,
      message: msg(req, 'msg.totpCodeInvalid')
    });
  }

  const codes = await exports.totp_activate(name, challenge.secret, step);
  delete req.session.totpEnroll;
  req.session.totpBackupCodes = codes;
  req.session.success = msg(req, 'msg.totpEnabled');
  res.redirect('/users/' + encodeURIComponent(name) + '/totp');
};

exports.totp_disable_post = async function(req, res) {
  const navigate = { active: 'users' };
  const name = req.params.name;
  if (!validUsername(name)) {
    return res.status(400).render('error', { message: msg(req, 'msg.invalidUsername'), error: {} });
  }
  if (!selfOnly(req, res, name)) return;

  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const code = typeof req.body.code === 'string' ? req.body.code : '';

  const status = await exports.totp_status(name);
  if (!status.enabled) {
    req.session.error = msg(req, 'msg.totpNotEnabled');
    return res.redirect('/users/' + encodeURIComponent(name) + '/totp');
  }

  if (!(await argon2.verify((await get_users())[name].hash, password).catch(() => false))) {
    return res.status(401).render('totp', {
      title: msg(req, 'page.twoFactor'),
      navigate,
      name,
      status,
      enroll: null,
      backupCodes: null,
      message: msg(req, 'msg.authFailed')
    });
  }

  const check = await exports.totp_check(name, code);
  if (!check.ok) {
    return res.status(401).render('totp', {
      title: msg(req, 'page.twoFactor'),
      navigate,
      name,
      status,
      enroll: null,
      backupCodes: null,
      message: msg(req, 'msg.totpCodeInvalid')
    });
  }

  await exports.totp_deactivate(name);
  req.session.success = msg(req, 'msg.totpDisabled');
  res.redirect('/users/' + encodeURIComponent(name) + '/totp');
};

exports.totp_backup_post = async function(req, res) {
  const name = req.params.name;
  if (!validUsername(name)) {
    return res.status(400).render('error', { message: msg(req, 'msg.invalidUsername'), error: {} });
  }
  if (!selfOnly(req, res, name)) return;

  const code = typeof req.body.code === 'string' ? req.body.code : '';
  const check = await exports.totp_check(name, code);
  if (!check.ok) {
    req.session.error = msg(req, 'msg.totpCodeInvalid');
    return res.redirect('/users/' + encodeURIComponent(name) + '/totp');
  }

  const codes = await exports.totp_regenerate_backup_codes(name);
  req.session.totpBackupCodes = codes || [];
  req.session.success = msg(req, 'msg.totpBackupRegenerated');
  res.redirect('/users/' + encodeURIComponent(name) + '/totp');
};

// --- passkeys (WebAuthn) ---------------------------------------------------
//
// Passkeys are the alternative second factor to TOTP: an account uses one or
// the other, never both. Credentials are public keys, so they can live in the
// same 0600 passwd file as the password hash without weakening it.

const crypto = require('crypto');
const webauthn = require('../webauthn');

const PK_TTL_MS = 5 * 60 * 1000;
const MAX_PASSKEYS = 10;
const RP_NAME = process.env.PASSKEY_RP_NAME || 'ZeroTier Planet';

function passkeyRecords(user) {
  if (!user || !Array.isArray(user.passkeys)) return [];
  return user.passkeys.filter((record) => record && typeof record.id === 'string');
}

function isIpLiteral(hostname) {
  const host = String(hostname || '').replace(/^\[|\]$/g, '');
  if (!host) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(':') && /^[0-9a-f:.]+$/i.test(host);
}

/**
 * Work out the relying party for this request.
 *
 * WebAuthn is bound to a hostname and to a secure context, so a deployment on a
 * bare IP address (or plain HTTP) cannot use passkeys. The UI says so instead
 * of offering a button that the browser will refuse.
 */
function relyingParty(req) {
  const configuredId = (process.env.PASSKEY_RP_ID || '').trim().toLowerCase();
  const configuredOrigin = (process.env.PASSKEY_ORIGIN || '').trim().replace(/\/+$/, '');
  const hostname = String(req.hostname || '').toLowerCase();
  const rpId = configuredId || hostname;
  const origin = configuredOrigin || String(req.protocol + '://' + req.get('host')).toLowerCase();

  if (!rpId) return { ok: false, reason: 'no-host' };
  if (isIpLiteral(rpId)) return { ok: false, reason: 'ip' };
  if (!/^https:\/\//.test(origin) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return { ok: false, reason: 'insecure' };
  }
  return { ok: true, rpId, origin, name: RP_NAME };
}

function userHandle(name) {
  return webauthn.b64u(Buffer.from(name, 'utf8'));
}

function challengeBytes() {
  return crypto.randomBytes(32);
}

function storedKey(record) {
  return {
    alg: record.alg,
    key: crypto.createPublicKey({
      key: Buffer.from(record.spki, 'base64'),
      format: 'der',
      type: 'spki'
    })
  };
}

exports.passkey_records = passkeyRecords;
exports.passkey_rp = relyingParty;

exports.passkey_status = async function(name) {
  const users = await get_users();
  const user = loadUser(users, name);
  return {
    enabled: passkeyRecords(user).length > 0,
    count: passkeyRecords(user).length,
    records: passkeyRecords(user).map((record) => ({
      id: record.id,
      label: record.label || '',
      created_at: record.createdAt || null
    }))
  };
};

/** Build the creation options and remember the challenge in the session. */
exports.passkey_begin_registration = async function(req, name) {
  const rp = relyingParty(req);
  if (!rp.ok) {
    const err = new Error(rp.reason);
    err.code = rp.reason;
    throw err;
  }

  const users = await get_users();
  const user = loadUser(users, name);
  const existing = passkeyRecords(user);
  if (existing.length >= MAX_PASSKEYS) {
    const err = new Error('too-many');
    err.code = 'too-many';
    throw err;
  }

  const challenge = webauthn.b64u(challengeBytes());
  req.session.pkCeremony = {
    kind: 'register',
    name,
    challenge,
    rpId: rp.rpId,
    origin: rp.origin,
    issued_at: Date.now()
  };

  return {
    publicKey: {
      rp: { id: rp.rpId, name: rp.name },
      user: { id: userHandle(name), name, displayName: name },
      challenge,
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
        { type: 'public-key', alg: -8 }
      ],
      timeout: 60000,
      attestation: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred'
      },
      excludeCredentials: existing.map((record) => ({ type: 'public-key', id: record.id }))
    }
  };
};

/** Verify the attestation and store the credential. */
exports.passkey_finish_registration = async function(req, name, body) {
  const ceremony = req.session.pkCeremony;
  delete req.session.pkCeremony;
  if (!ceremony || ceremony.kind !== 'register' || ceremony.name !== name) {
    const err = new Error('ceremony-expired');
    err.code = 'ceremony-expired';
    throw err;
  }
  if (Date.now() - ceremony.issued_at > PK_TTL_MS) {
    const err = new Error('ceremony-expired');
    err.code = 'ceremony-expired';
    throw err;
  }

  // The two factors are mutually exclusive; refuse to end up with both.
  const totpState = await exports.totp_status(name);
  if (totpState.enabled) {
    const err = new Error('totp-enabled');
    err.code = 'totp-enabled';
    throw err;
  }

  const verified = webauthn.verifyRegistration(body, {
    challenge: ceremony.challenge,
    origin: ceremony.origin,
    rpId: ceremony.rpId,
    requireUV: false
  });

  const users = await get_users();
  const user = loadUser(users, name);
  if (!user) {
    const err = new Error('unknown-user');
    err.code = 'unknown-user';
    throw err;
  }

  const records = passkeyRecords(user).filter((record) => record.id !== verified.credentialId);
  records.push({
    id: verified.credentialId,
    alg: verified.publicKey.alg,
    spki: verified.publicKey.key.export({ type: 'spki', format: 'der' }).toString('base64'),
    signCount: verified.signCount,
    createdAt: new Date().toISOString(),
    label: typeof (body && body.label) === 'string' ? body.label.slice(0, 40) : ''
  });
  user.passkeys = records;
  await update_users(users);

  return { id: verified.credentialId, count: records.length };
};

exports.passkey_begin_authentication = async function(req, name) {
  const rp = relyingParty(req);
  if (!rp.ok) {
    const err = new Error(rp.reason);
    err.code = rp.reason;
    throw err;
  }

  const users = await get_users();
  const records = passkeyRecords(loadUser(users, name));
  if (!records.length) {
    const err = new Error('no-passkey');
    err.code = 'no-passkey';
    throw err;
  }

  const challenge = webauthn.b64u(challengeBytes());
  req.session.pkCeremony = {
    kind: 'login',
    name,
    challenge,
    rpId: rp.rpId,
    origin: rp.origin,
    issued_at: Date.now()
  };

  return {
    publicKey: {
      challenge,
      rpId: rp.rpId,
      timeout: 60000,
      userVerification: 'preferred',
      allowCredentials: records.map((record) => ({ type: 'public-key', id: record.id }))
    }
  };
};

exports.passkey_finish_authentication = async function(req, name, body) {
  const ceremony = req.session.pkCeremony;
  delete req.session.pkCeremony;
  if (!ceremony || ceremony.kind !== 'login' || ceremony.name !== name) {
    const err = new Error('ceremony-expired');
    err.code = 'ceremony-expired';
    throw err;
  }
  if (Date.now() - ceremony.issued_at > PK_TTL_MS) {
    const err = new Error('ceremony-expired');
    err.code = 'ceremony-expired';
    throw err;
  }

  const users = await get_users();
  const user = loadUser(users, name);
  const records = passkeyRecords(user);
  const credentialId = typeof (body && body.id) === 'string' ? body.id : '';
  const record = records.find((item) => item.id === credentialId);
  if (!record) {
    const err = new Error('unknown-credential');
    err.code = 'unknown-credential';
    throw err;
  }

  const result = webauthn.verifyAuthentication(body, {
    challenge: ceremony.challenge,
    origin: ceremony.origin,
    rpId: ceremony.rpId,
    requireUV: false
  }, {
    publicKey: storedKey(record),
    signCount: Number(record.signCount) || 0
  });

  record.signCount = result.signCount;
  record.lastUsedAt = new Date().toISOString();
  await update_users(users);

  return { name };
};

exports.passkey_remove = async function(name, id) {
  const users = await get_users();
  const user = loadUser(users, name);
  if (!user) return 0;
  const records = passkeyRecords(user);
  const kept = records.filter((record) => record.id !== id);
  user.passkeys = kept;
  await update_users(users);
  return records.length - kept.length;
};

// --- passkey pages ---------------------------------------------------------

function passkeyError(req, code) {
  const map = {
    ip: 'msg.passkeyNeedsDomain',
    insecure: 'msg.passkeyNeedsHttps',
    'no-host': 'msg.passkeyNeedsDomain',
    'totp-enabled': 'msg.passkeyTotpConflict',
    'too-many': 'msg.passkeyLimit',
    'ceremony-expired': 'msg.passkeyExpired',
    'unknown-credential': 'msg.passkeyInvalid',
    'no-passkey': 'msg.passkeyInvalid'
  };
  return msg(req, map[code] || 'msg.passkeyInvalid');
}

exports.passkeyError = passkeyError;

exports.passkeys_get = async function(req, res) {
  const navigate = { active: 'users' };
  const name = req.params.name;
  if (!validUsername(name)) {
    return res.status(400).render('error', { message: msg(req, 'msg.invalidUsername'), error: {} });
  }
  if (!selfOnly(req, res, name)) return;

  const status = await exports.passkey_status(name);
  const totpState = await exports.totp_status(name);
  const rp = relyingParty(req);

  let flash = '';
  if (req.session.error) {
    flash = req.session.error;
    delete req.session.error;
  } else if (req.session.success) {
    flash = req.session.success;
    delete req.session.success;
  }

  res.render('passkeys', {
    title: msg(req, 'page.passkeys'),
    navigate,
    name,
    status,
    totpEnabled: totpState.enabled,
    available: rp.ok,
    unavailableReason: rp.ok ? '' : passkeyError(req, rp.reason),
    rpId: rp.ok ? rp.rpId : '',
    message: flash
  });
};

exports.passkeys_begin_post = async function(req, res) {
  const name = req.params.name;
  if (!validUsername(name)) {
    return res.status(400).json({ error: msg(req, 'msg.invalidUsername') });
  }
  if (!selfOnly(req, res, name)) return;

  try {
    const options = await exports.passkey_begin_registration(req, name);
    res.json(options);
  } catch (err) {
    res.status(400).json({ error: passkeyError(req, err.code || 'unknown') });
  }
};

exports.passkeys_finish_post = async function(req, res) {
  const name = req.params.name;
  if (!validUsername(name)) {
    return res.status(400).json({ error: msg(req, 'msg.invalidUsername') });
  }
  if (!selfOnly(req, res, name)) return;

  try {
    const result = await exports.passkey_finish_registration(req, name, req.body || {});
    res.json({ ok: true, id: result.id, count: result.count });
  } catch (err) {
    res.status(400).json({ error: passkeyError(req, err.code || 'invalid') });
  }
};

exports.passkeys_delete_post = async function(req, res) {
  const name = req.params.name;
  if (!validUsername(name)) {
    return res.status(400).render('error', { message: msg(req, 'msg.invalidUsername'), error: {} });
  }
  if (!selfOnly(req, res, name)) return;

  const removed = await exports.passkey_remove(name, String(req.params.id || ''));
  req.session[removed ? 'success' : 'error'] = msg(req, removed ? 'msg.passkeyRemoved' : 'msg.passkeyInvalid');
  res.redirect('/users/' + encodeURIComponent(name) + '/passkeys');
};
