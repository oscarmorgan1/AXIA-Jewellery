// Storage rules tests, run against the emulator: `npm run test:rules`.
// Admins past their emailed code upload and read; nobody else reads, lists or
// writes through the Storage API. (The storefront shows photos through their
// download URLs, which carry their own token and don't go through these rules.)
import { after, before, beforeEach, test } from 'node:test';
import fs from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { getBytes, getMetadata, listAll, ref, uploadBytes } from 'firebase/storage';

let env;
const admin = (uid = 'boss') => env.authenticatedContext(uid, { email: 'boss@axia.test', email_verified: true, admin: true, auth_time: 100, mfa: [100] }).storage();
const customer = (extra = {}) => env.authenticatedContext('ana', { email: 'ana@example.com', email_verified: true, ...extra }).storage();
const png = new Uint8Array([137, 80, 78, 71]);

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-axia-rules',
    storage: { rules: fs.readFileSync(new URL('../storage.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 9199 },
  });
});
after(() => env.cleanup());
beforeEach(async () => {
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async ctx => {
    await uploadBytes(ref(ctx.storage(), 'products/ring/1.png'), png, { contentType: 'image/png' });
    await uploadBytes(ref(ctx.storage(), 'admins/boss/photo.png'), png, { contentType: 'image/png' });
    await uploadBytes(ref(ctx.storage(), 'media/landing/hd.mp4'), png, { contentType: 'video/mp4' });
  });
});

test('visitors and customers can’t read or list anything through the Storage API', async () => {
  for (const s of [env.unauthenticatedContext().storage(), customer(), customer({ admin: true, auth_time: 5 })]) {
    await assertFails(getMetadata(ref(s, 'products/ring/1.png')));
    await assertFails(getBytes(ref(s, 'products/ring/1.png')));
    await assertFails(listAll(ref(s, 'products')));
    await assertFails(getMetadata(ref(s, 'admins/boss/photo.png')));
    await assertFails(getMetadata(ref(s, 'media/landing/hd.mp4')));
  }
});

test('verified admins read and upload product photos; nobody uploads elsewhere', async () => {
  await assertSucceeds(getMetadata(ref(admin(), 'products/ring/1.png')));
  await assertSucceeds(uploadBytes(ref(admin(), 'products/ring/2.png'), png, { contentType: 'image/png' }));
  await assertFails(uploadBytes(ref(admin(), 'products/ring/x.txt'), png, { contentType: 'text/plain' }));
  await assertFails(uploadBytes(ref(customer(), 'products/ring/3.png'), png, { contentType: 'image/png' }));
  await assertFails(uploadBytes(ref(admin(), 'media/x.png'), png, { contentType: 'image/png' }));
});

test('an admin writes only their own profile photo', async () => {
  await assertSucceeds(getMetadata(ref(admin(), 'admins/boss/photo.png')));
  await assertSucceeds(uploadBytes(ref(admin(), 'admins/boss/new.png'), png, { contentType: 'image/png' }));
  await assertFails(uploadBytes(ref(admin('other'), 'admins/boss/new.png'), png, { contentType: 'image/png' }));
});
