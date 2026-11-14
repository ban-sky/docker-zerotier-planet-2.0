/*
  Browser side of the passkey (WebAuthn) flows.

  The CSP forbids inline scripts, so this file is loaded from every page that
  needs a ceremony and wires itself up through data attributes:

    data-mode    'register' or 'login'
    data-begin   URL that returns PublicKeyCredential*OptionsJSON
    data-finish  URL that verifies the result
    data-label   optional credential label used when registering
*/

(function () {
  'use strict';

  function b64uToBytes(value) {
    const padded = String(value).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
    return bytes;
  }

  function bytesToB64u(buffer) {
    const bytes = new Uint8Array(buffer);
    let raw = '';
    for (let i = 0; i < bytes.length; i += 1) raw += String.fromCharCode(bytes[i]);
    return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async function postJson(url, body) {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: JSON.stringify(body || {})
    });
    let payload = {};
    try {
      payload = await response.json();
    } catch (err) {
      payload = {};
    }
    if (!response.ok || payload.error) {
      throw new Error(payload.error || 'Request failed');
    }
    return payload;
  }

  function decodeCreationOptions(options) {
    const publicKey = options.publicKey;
    publicKey.challenge = b64uToBytes(publicKey.challenge);
    publicKey.user.id = b64uToBytes(publicKey.user.id);
    if (Array.isArray(publicKey.excludeCredentials)) {
      publicKey.excludeCredentials = publicKey.excludeCredentials.map(function (item) {
        return Object.assign({}, item, { id: b64uToBytes(item.id) });
      });
    }
    return publicKey;
  }

  function decodeRequestOptions(options) {
    const publicKey = options.publicKey;
    publicKey.challenge = b64uToBytes(publicKey.challenge);
    if (Array.isArray(publicKey.allowCredentials)) {
      publicKey.allowCredentials = publicKey.allowCredentials.map(function (item) {
        return Object.assign({}, item, { id: b64uToBytes(item.id) });
      });
    }
    return publicKey;
  }

  function encodeAttestation(credential) {
    return {
      id: credential.id,
      rawId: bytesToB64u(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: bytesToB64u(credential.response.clientDataJSON),
        attestationObject: bytesToB64u(credential.response.attestationObject),
        transports:
          typeof credential.response.getTransports === 'function'
            ? credential.response.getTransports()
            : []
      }
    };
  }

  function encodeAssertion(credential) {
    return {
      id: credential.id,
      rawId: bytesToB64u(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: bytesToB64u(credential.response.clientDataJSON),
        authenticatorData: bytesToB64u(credential.response.authenticatorData),
        signature: bytesToB64u(credential.response.signature),
        userHandle: credential.response.userHandle
          ? bytesToB64u(credential.response.userHandle)
          : undefined
      }
    };
  }

  function showError(message) {
    const box = document.getElementById('passkey-error');
    if (!box) return;
    box.textContent = message;
    box.hidden = false;
  }

  async function run(button) {
    const mode = button.dataset.mode;
    const label = button.dataset.label || '';
    button.disabled = true;
    try {
      if (!window.PublicKeyCredential || !navigator.credentials) {
        throw new Error('This browser does not support passkeys');
      }

      if (mode === 'register') {
        const options = await postJson(button.dataset.begin, {});
        const publicKey = decodeCreationOptions(options);
        const credential = await navigator.credentials.create({ publicKey });
        const payload = encodeAttestation(credential);
        payload.label = label;
        await postJson(button.dataset.finish, payload);
        window.location.reload();
        return;
      }

      const options = await postJson(button.dataset.begin, {});
      const publicKey = decodeRequestOptions(options);
      const credential = await navigator.credentials.get({ publicKey });
      const result = await postJson(button.dataset.finish, encodeAssertion(credential));
      window.location.assign(result.redirect || '/');
    } catch (err) {
      showError(err && err.message ? err.message : String(err));
      button.disabled = false;
    }
  }

  document.addEventListener('click', function (event) {
    const button = event.target.closest('#passkey-start');
    if (!button) return;
    event.preventDefault();
    run(button);
  });
})();
