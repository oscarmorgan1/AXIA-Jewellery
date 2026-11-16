// Checks that the storefront's photos and videos stored in Firebase Storage
// load the way a shopper's browser loads them: a plain request to the download
// URL, with no sign-in and no App Check token. Run it after turning on
// App Check enforcement for Storage (give it ~15 minutes to take effect):
//
//   npm run check:media                       # the live site
//   npm run check:media -- http://127.0.0.1:5050
//
// Exits 1 if any URL fails, so it can also run in CI.
const site = (process.argv[2] || process.env.PUBLIC_SITE_URL || 'https://axiajewellery.com').replace(/\/$/, '');

const res = await fetch(`${site}/api/catalogue`, { headers: { Accept: 'application/json' } });
if (!res.ok) { console.error(`GET ${site}/api/catalogue: ${res.status}`); process.exit(1); }
const text = await res.text();
const urls = [...new Set(text.match(/https:\/\/firebasestorage\.googleapis\.com\/[^"\s\\]+/g) || [])]
  .map(u => u.replace(/\\u0026/g, '&'));
if (!urls.length) { console.log('No Storage URLs in the catalogue: nothing to check.'); process.exit(0); }

let failed = 0;
const check = async url => {
  // One byte is enough to prove access without downloading every video.
  const r = await fetch(url, { headers: { Range: 'bytes=0-0' } }).catch(e => ({ status: e.message }));
  const ok = r.status === 200 || r.status === 206;
  if (!ok) { failed++; console.error(`FAIL ${r.status}  ${url.split('?')[0]}`); }
  if (r.body) await r.body.cancel().catch(() => {});
};
for (let i = 0; i < urls.length; i += 8) await Promise.all(urls.slice(i, i + 8).map(check));

const tokenless = urls.filter(u => !/[?&]token=/.test(u));
console.log(`${urls.length - failed}/${urls.length} Storage URLs load without App Check.`);
if (tokenless.length) console.warn(`${tokenless.length} have no download token, so App Check enforcement on Storage will block them:\n  ${tokenless.join('\n  ')}`);
process.exit(failed ? 1 : 0);
