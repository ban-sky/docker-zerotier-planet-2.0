/*
  Checks the ztncui i18n catalog and every template/controller reference.

  The application exports only the translation API, so the private catalog is
  read by evaluating patch/ztncui/i18n.js in a VM with one extra line appended
  (`module.exports.__messages = messages`) - the shipped file is not modified.

  Run: node tests/ztncui-i18n.test.js
*/

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const ztncui = path.join(root, 'patch', 'ztncui');
const i18nPath = path.join(ztncui, 'i18n.js');

const source = fs.readFileSync(i18nPath, 'utf8') +
  '\n;module.exports.__messages = messages;\n';
const mod = { exports: {} };
vm.runInNewContext(source, {
  module: mod,
  exports: mod.exports,
  require,
  console,
  process,
  __filename: i18nPath,
  __dirname: ztncui
}, { filename: i18nPath });

const i18n = mod.exports;
const messages = i18n.__messages;

// 1. Public surface (`__messages` is the probe added above, not a real export).
assert.deepStrictEqual(
  Object.keys(i18n).filter((key) => key !== '__messages').sort(),
  ['DEFAULT_LOCALE', 'LOCALES', 'negotiate', 'normalizeLocale', 'translate'],
  'i18n.js must export exactly the documented API'
);
assert.strictEqual(JSON.stringify(i18n.LOCALES), '["zh-CN","en"]');

// 2. Both dictionaries must expose exactly the same keys, with no empty copy.
const zh = messages['zh-CN'];
const en = messages.en;
const zhKeys = Object.keys(zh).sort();
const enKeys = Object.keys(en).sort();
assert.deepStrictEqual(zhKeys, enKeys, 'zh-CN and en must have identical key sets');

for (const key of zhKeys) {
  for (const locale of ['zh-CN', 'en']) {
    const value = messages[locale][key];
    assert.strictEqual(typeof value, 'string', key + ' in ' + locale + ' must be a string');
    assert.ok(value.length > 0, key + ' in ' + locale + ' must not be empty');
    assert.ok(!value.includes('\uFFFD'), key + ' in ' + locale + ' contains U+FFFD');
  }
  const placeholders = (value) => (value.match(/\{[a-zA-Z0-9_]+\}/g) || []).sort();
  assert.deepStrictEqual(
    placeholders(zh[key]),
    placeholders(en[key]),
    key + ' must use the same {placeholders} in both locales'
  );
}

// 3. Every key referenced by a template or a controller must exist.
const referenced = new Map();
function addRef(key, file) {
  if (!referenced.has(key)) referenced.set(key, new Set());
  referenced.get(key).add(path.relative(root, file));
}
function collect(file, pattern, text) {
  let match;
  while ((match = pattern.exec(text)) !== null) addRef(match[1], file);
}

const viewDir = path.join(ztncui, 'views');
for (const name of fs.readdirSync(viewDir)) {
  if (!name.endsWith('.pug')) continue;
  const file = path.join(viewDir, name);
  const text = fs.readFileSync(file, 'utf8');
  collect(file, /\bt\('([^']+)'/g, text);
  // t(condition ? 'key.a' : 'key.b') - both branches are real keys.
  const ternary = /\bt\([^)]*\?\s*'([^']+)'\s*:\s*'([^']+)'/g;
  let match;
  while ((match = ternary.exec(text)) !== null) {
    addRef(match[1], file);
    addRef(match[2], file);
  }
}

const controllers = [
  'app.js', 'routes-index.js', 'routes-users.js', 'usersController.js',
  'networkController.js', 'validate.js', 'auth.js'
];
for (const name of controllers) {
  const file = path.join(ztncui, name);
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  collect(file, /\bmsg\(req,\s*'([^']+)'/g, text);
  collect(file, /\.t\('([^']+)'/g, text);
}

const missing = [];
for (const [key, files] of referenced) {
  if (!zh[key]) missing.push(key + ' (used by ' + [...files].join(', ') + ')');
}
assert.deepStrictEqual(missing, [], 'keys used in the UI but missing from the dictionaries');

// 4. API behaviour: normalisation, negotiation and fallback.
const cases = [
  ['zh', 'zh-CN'], ['zh-cn', 'zh-CN'], ['zh-CN', 'zh-CN'], ['zh-Hans', 'zh-CN'],
  ['zh-Hant-TW', 'zh-CN'], ['en', 'en'], ['en-US', 'en'], ['EN-gb', 'en'],
  ['fr', null], ['', null], [null, null], [undefined, null], ['de-DE', null], ['  zh  ', 'zh-CN']
];
for (const [input, expected] of cases) {
  assert.strictEqual(i18n.normalizeLocale(input), expected, 'normalizeLocale(' + input + ')');
}

const negotiate = (headers, cookieHeader) => {
  const req = { headers: headers || {} };
  if (cookieHeader) req.headers.cookie = cookieHeader;
  return i18n.negotiate(req);
};
assert.strictEqual(negotiate({ 'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8' }), 'zh-CN');
assert.strictEqual(negotiate({ 'accept-language': 'fr-FR,fr;q=0.9,en-US;q=0.5' }), 'en');
assert.strictEqual(negotiate({}, 'lang=en'), 'en');
assert.strictEqual(negotiate({ 'accept-language': 'en' }, 'lang=zh-CN'), 'zh-CN');
assert.strictEqual(negotiate({}, 'other=1; lang=zh'), 'zh-CN');
assert.strictEqual(negotiate({}, 'lang=fr'), i18n.DEFAULT_LOCALE);
assert.strictEqual(negotiate({}, null), i18n.DEFAULT_LOCALE);
assert.strictEqual(negotiate({ 'accept-language': 'en;q=0' }), i18n.DEFAULT_LOCALE);

assert.strictEqual(i18n.translate('zh-CN', 'nav.overview'), zh['nav.overview']);
assert.strictEqual(i18n.translate('en', 'nav.overview'), en['nav.overview']);
assert.strictEqual(i18n.translate('fr', 'nav.overview'), en['nav.overview']);
assert.strictEqual(i18n.translate('en', 'no.such.key'), 'no.such.key');
assert.strictEqual(
  i18n.translate('en', 'msg.passwordSetFor', { name: 'alice' }),
  'Successfully set password for alice'
);
assert.strictEqual(i18n.translate('en', 'msg.passwordSetFor'), 'Successfully set password for {name}');

// 5. Report.
const unused = zhKeys.filter((key) => !referenced.has(key));
console.log('ok   ' + zhKeys.length + ' keys per locale, identical key sets');
console.log('ok   ' + referenced.size + ' keys referenced by views/controllers');
if (unused.length) {
  console.log('note unused keys (informational): ' + unused.join(', '));
}
console.log('All i18n checks passed (' + zhKeys.length + ' keys per locale)');
