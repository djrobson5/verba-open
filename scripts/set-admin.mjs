// Grant or revoke the `admin` Firebase Auth custom claim.
//
// Usage (run from the project root):
//   node scripts/set-admin.mjs <email|uid>          # grant
//   node scripts/set-admin.mjs <email|uid> revoke   # revoke
//
// Reads FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY from .env.local.
// User must sign out + back in afterward for the new claim to appear in
// their ID token.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env.local');

const env = Object.fromEntries(
  readFileSync(envPath, 'utf-8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const idx = line.indexOf('=');
      if (idx < 1) return null;
      let val = line.slice(idx + 1);
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      return [line.slice(0, idx).trim(), val];
    })
    .filter(Boolean),
);

if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const target = process.argv[2];
const action = (process.argv[3] ?? 'grant').toLowerCase();

if (!target || (action !== 'grant' && action !== 'revoke')) {
  console.error('Usage: node scripts/set-admin.mjs <email|uid> [grant|revoke]');
  process.exit(1);
}

const auth = getAuth();
const user = target.includes('@')
  ? await auth.getUserByEmail(target)
  : await auth.getUser(target);

const claims = { ...(user.customClaims ?? {}) };
if (action === 'grant') {
  claims.admin = true;
} else {
  delete claims.admin;
}

await auth.setCustomUserClaims(user.uid, claims);

console.log(
  `${action === 'grant' ? 'Granted' : 'Revoked'} admin for ${user.email ?? '(no email)'} (${user.uid})`,
);
console.log('User must sign out and back in for the change to take effect.');
