// Grants (or revokes) admin access to the portal by setting the `admin`
// custom claim on a Firebase Auth user.
//
//   npm run set-admin -- you@example.com                  # emulator
//   npm run set-admin -- you@example.com --create pass123 # emulator: create the user first
//   npm run set-admin -- you@example.com --prod           # live project
//   npm run set-admin -- you@example.com --revoke [--prod]
import { auth, argValue } from './_firebase.mjs';

const email = process.argv.slice(2).find(a => a.includes('@'));
if (!email) { console.error('Usage: npm run set-admin -- <email> [--create <password>] [--revoke] [--prod]'); process.exit(1); }
const revoke = process.argv.includes('--revoke');
const createPw = argValue('--create');

let user;
try {
  user = await auth.getUserByEmail(email);
} catch (e) {
  if (e.code !== 'auth/user-not-found' || !createPw) {
    console.error(`No user ${email}. Sign up in the portal first, or pass --create <password>.`);
    process.exit(1);
  }
  user = await auth.createUser({ email, password: createPw, emailVerified: true });
  console.log(`Created ${email}`);
}
await auth.setCustomUserClaims(user.uid, { ...(user.customClaims || {}), admin: !revoke });
console.log(`${revoke ? 'Revoked' : 'Granted'} admin for ${email} (uid ${user.uid}). They need to sign out and back in.`);
process.exit(0);
