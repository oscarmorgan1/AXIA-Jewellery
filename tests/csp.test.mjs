// The Content-Security-Policy: `node --test tests/csp.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { policy, withNonce, OFFLINE_SCRIPT_HASH } from '../server/csp.js';

const directive = (p, name) => (p.split('; ').find(d => d.startsWith(name + ' ')) || '').split(' ').slice(1);

test('scripts need the nonce: no unsafe-inline, a default-src, connect-src locked to known hosts', () => {
  const p = policy('abc');
  const script = directive(p, 'script-src');
  assert.ok(script.includes("'nonce-abc'"));
  assert.ok(!script.includes("'unsafe-inline'") && !script.includes("'unsafe-eval'") && !script.includes('*'));
  assert.deepEqual(directive(p, 'default-src'), ["'self'"]);
  assert.deepEqual(directive(p, 'object-src'), ["'none'"]);
  const connect = directive(p, 'connect-src');
  assert.ok(connect.includes("'self'") && connect.includes('https://firestore.googleapis.com'));
  assert.ok(!connect.some(h => h === '*' || h === 'https:' || h.startsWith('https://*')));
  // what App Check and Google sign-in need
  assert.ok(script.includes('https://www.google.com/recaptcha/') && script.includes('https://apis.google.com'));
  assert.ok(directive(p, 'frame-src').includes('https://axia-jewellery.firebaseapp.com'));
});

test('every <script> in a page gets the nonce, once', () => {
  const html = '<script src="a.js"></script><script type="text/axia-deferred">x()</script><script>y()</script><script nonce="z">w()</script><scripts>';
  const out = withNonce(html, 'N');
  assert.equal(out.match(/nonce="N"/g).length, 3);
  assert.ok(out.includes('<script nonce="z">') && out.includes('<scripts>'));
});

test('no page relies on inline event handlers, which the nonce can’t allow', () => {
  const pages = fs.readdirSync('.').filter(f => f.endsWith('.html'));
  for (const f of pages) {
    const html = fs.readFileSync(f, 'utf8');
    assert.ok(!/<[a-z][^>]*\son[a-z]+\s*=\s*["']/i.test(html), `${f} has an inline on...= handler`);
    assert.ok(!/href=["']javascript:/i.test(html), `${f} has a javascript: link`);
  }
});

test('the admin offline page’s inline script matches its allowed hash', () => {
  const html = fs.readFileSync('admin-portal/public/offline.html', 'utf8');
  const body = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
  const hash = `'sha256-${crypto.createHash('sha256').update(body).digest('base64')}'`;
  assert.equal(hash, OFFLINE_SCRIPT_HASH);
});

test('analytics hosts only on pages that load them, and only for the tool configured', async () => {
  const { GA_HOSTS, CLARITY_HOSTS } = await import('../server/csp.js');
  const all = [...Object.values(GA_HOSTS).flat(), ...Object.values(CLARITY_HOSTS).flat()];
  const plain = policy('n');
  assert.ok(!all.some(h => plain.includes(h)), 'the default policy (admin, portal, api) has no analytics host');

  const ga = policy('n', { ga: 'G-ABC123', clarity: '' });
  assert.ok(directive(ga, 'script-src').includes('https://www.googletagmanager.com'));
  assert.ok(directive(ga, 'connect-src').includes('https://region1.google-analytics.com'));
  assert.ok(!ga.includes('clarity.ms'));

  const both = policy('n', { ga: 'G-ABC123', clarity: 'abcdef1234' });
  const connect = directive(both, 'connect-src');
  // the one wildcard allowed: Clarity's upload hosts, on clarity.ms only
  assert.deepEqual(connect.filter(h => h.includes('*')), ['https://*.clarity.ms']);
  assert.ok(!directive(both, 'script-src').some(h => h.includes('*.clarity.ms')));
  assert.deepEqual(directive(both, 'frame-src'), directive(plain, 'frame-src'));
});

test('analytics config: valid IDs only, never on checkout or unsubscribe, no Clarity on /genuine', async () => {
  const { analyticsFor, analyticsTag } = await import('../server/analytics.js');
  const keep = { ...process.env };
  try {
    delete process.env.GA_MEASUREMENT_ID; delete process.env.CLARITY_PROJECT_ID;
    assert.equal(analyticsFor('store'), null);
    process.env.GA_MEASUREMENT_ID = 'G-ABC123'; process.env.CLARITY_PROJECT_ID = 'abcdef1234';
    assert.deepEqual(analyticsFor('store'), { ga: 'G-ABC123', clarity: 'abcdef1234', consent: 'notice' });
    for (const p of ['checkout', 'unsubscribe', 'styleguide']) assert.equal(analyticsFor(p), null);
    assert.equal(analyticsFor('genuine').clarity, '');
    process.env.GA_MEASUREMENT_ID = '"><script>'; process.env.CLARITY_PROJECT_ID = 'x';
    assert.equal(analyticsFor('store'), null);
    process.env.GA_MEASUREMENT_ID = 'G-ABC123'; process.env.ANALYTICS_CONSENT = 'opt-in';
    assert.equal(analyticsTag(analyticsFor('store')), '<script src="/assets/js/analytics.js?v=20261116b" data-ga="G-ABC123" data-consent="opt-in" defer></script>');
  } finally { process.env = keep; }
});
