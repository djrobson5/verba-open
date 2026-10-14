// Invite, revoke, or list Verba users. Verba is invite-only: an account gets
// in only with the `allowed` (or `admin`) custom claim (src/config/access.ts).
//
// Usage (run from the project root):
//   node scripts/invite.mjs <email>                # invite (creates the user if needed)
//   node scripts/invite.mjs <email> --password     # invite with a generated password instead of a link
//   node scripts/invite.mjs <email> revoke         # revoke access
//   node scripts/invite.mjs <email> unlimited      # lift the daily caps and weekly practice budget
//   node scripts/invite.mjs <email> unlimited-off  # put the limits back
//   node scripts/invite.mjs --list                 # list every Auth user + access (read-only)
//
// Invite: creates the Firebase Auth user with no password if they don't exist,
// sets `allowed: true` (merged with existing claims, so `admin` is kept), and
// prints a password-reset link. Send that link to the invitee; it opens the
// project's default Firebase action handler (the same auth domain the client
// config uses), where they choose a password, then they sign in at /login.
//
// Invite with --password: same, but sets a freshly generated random password
// (creating or overwriting) and prints it instead of a link, so you can hand
// the invitee their email + password directly. The password is printed once
// and stored nowhere else; send it over a private channel.
//
// Revoke: removes `allowed` (never touches `admin`, never deletes the user) and
// revokes refresh tokens, so existing sessions die at the next token refresh
// (within ~1h); middleware then refuses the new token.
//
// Unlimited / unlimited-off: sets or removes the `unlimited` custom claim on an
// existing user (merged; `admin` and `allowed` are never dropped). `unlimited`
// skips the daily session caps and the weekly practice budget, like `admin`,
// but grants no access by itself: the account still needs `allowed`. Takes
// effect when the user's ID token next refreshes (within ~1h, or at once after
// signing out and back in).
//
// Dev and prod share one Firebase project: invites and revokes are live.
// This script never prints env values or credentials.

import { readFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
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

const USAGE = [
  'Usage:',
  '  node scripts/invite.mjs <email>                # invite (password-setup link)',
  '  node scripts/invite.mjs <email> --password     # invite with a generated password',
  '  node scripts/invite.mjs <email> revoke         # revoke',
  '  node scripts/invite.mjs <email> unlimited      # no daily caps or weekly budget',
  '  node scripts/invite.mjs <email> unlimited-off  # restore the limits',
  '  node scripts/invite.mjs --list                 # list who has access',
].join('\n');

const auth = getAuth();

function accessStatus(user) {
  const claims = user.customClaims ?? {};
  if (claims.admin === true) return 'admin';
  if (claims.allowed === true) return 'allowed';
  return 'none';
}

async function getUserOrNull(email) {
  try {
    return await auth.getUserByEmail(email);
  } catch (err) {
    if (err?.code === 'auth/user-not-found') return null;
    throw err;
  }
}

async function list() {
  const rows = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) {
      rows.push({
        email: user.email ?? `(no email) ${user.uid}`,
        access: accessStatus(user),
        unlimited: user.customClaims?.unlimited === true,
        lastSignIn: user.metadata.lastSignInTime
          ? new Date(user.metadata.lastSignInTime).toISOString()
          : 'never',
      });
    }
    pageToken = page.pageToken;
  } while (pageToken);

  rows.sort((a, b) => a.email.localeCompare(b.email));
  const emailWidth = Math.max(5, ...rows.map((r) => r.email.length));
  console.log(
    `${'EMAIL'.padEnd(emailWidth)}  ${'ACCESS'.padEnd(7)}  ${'LIMITS'.padEnd(9)}  LAST SIGN-IN`,
  );
  for (const r of rows) {
    // Admins skip the limits too, whether or not they carry `unlimited`.
    const limits = r.unlimited ? 'unlimited' : r.access === 'admin' ? 'none' : 'standard';
    console.log(
      `${r.email.padEnd(emailWidth)}  ${r.access.padEnd(7)}  ${limits.padEnd(9)}  ${r.lastSignIn}`,
    );
  }
  const counted = (s) => rows.filter((r) => r.access === s).length;
  console.log(
    `\n${rows.length} users: ${counted('admin')} admin, ${counted('allowed')} allowed, ${counted('none')} none; ${rows.filter((r) => r.unlimited).length} unlimited`,
  );
}

// 16 characters from an alphabet without look-alikes (0/O, 1/l/I), grouped
// in fours so it can be read aloud or retyped: about 90 bits of entropy.
function generatePassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const chars = Array.from({ length: 16 }, () => alphabet[randomInt(alphabet.length)]);
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join('')).join('-');
}

async function invite(email, { withPassword = false } = {}) {
  const password = withPassword ? generatePassword() : undefined;
  let user = await getUserOrNull(email);
  if (user) {
    console.log(`Found existing user ${email} (${user.uid}).`);
    if (password) {
      user = await auth.updateUser(user.uid, { password, disabled: false });
      console.log('Set a new generated password.');
    }
  } else {
    user = await auth.createUser({ email, emailVerified: false, ...(password ? { password } : {}) });
    console.log(
      `Created user ${email} (${user.uid}) ${password ? 'with a generated password' : 'with no password'}.`,
    );
  }

  const claims = { ...(user.customClaims ?? {}), allowed: true };
  await auth.setCustomUserClaims(user.uid, claims);
  console.log(`Granted allowed for ${email}.`);

  if (password) {
    console.log(`\nEmail:    ${email}\nPassword: ${password}\n`);
    console.log(
      'Send these to the invitee over a private channel; they sign in at /login. This password is not stored anywhere else.',
    );
    return;
  }

  const link = await auth.generatePasswordResetLink(email);
  console.log(`\n${link}\n`);
  console.log(
    `Send this link to ${email}; it lets them set a password, then they sign in at /login.`,
  );
}

async function revoke(email) {
  const user = await getUserOrNull(email);
  if (!user) {
    console.error(`No Firebase Auth user with email ${email}. Nothing to revoke.`);
    process.exit(1);
  }

  const claims = { ...(user.customClaims ?? {}) };
  const hadAllowed = claims.allowed === true;
  delete claims.allowed;
  await auth.setCustomUserClaims(user.uid, claims);
  await auth.revokeRefreshTokens(user.uid);

  console.log(
    hadAllowed
      ? `Removed allowed from ${email} (${user.uid}).`
      : `${email} (${user.uid}) did not have allowed; claim left absent.`,
  );
  console.log('Revoked refresh tokens; existing sessions end at the next token refresh (within ~1h).');
  if (claims.admin === true) {
    console.log(`Note: ${email} still has admin, so they keep access.`);
  }
}

async function setUnlimited(email, on) {
  const user = await getUserOrNull(email);
  if (!user) {
    console.error(`No Firebase Auth user with email ${email}. Invite them first.`);
    process.exit(1);
  }

  // Merged: admin and allowed (and anything else) are carried over untouched.
  const claims = { ...(user.customClaims ?? {}) };
  const had = claims.unlimited === true;
  if (on) claims.unlimited = true;
  else delete claims.unlimited;
  await auth.setCustomUserClaims(user.uid, claims);

  if (on) {
    console.log(
      had
        ? `${email} (${user.uid}) already had unlimited; claims rewritten unchanged.`
        : `Granted unlimited to ${email} (${user.uid}): no daily caps, no weekly practice budget.`,
    );
  } else {
    console.log(
      had
        ? `Removed unlimited from ${email} (${user.uid}); the standard limits apply again.`
        : `${email} (${user.uid}) did not have unlimited; claim left absent.`,
    );
  }
  console.log('Takes effect at the next ID token refresh (within ~1h, or at once after signing out and in).');
  if (claims.admin !== true && claims.allowed !== true) {
    console.log(`Note: ${email} has neither admin nor allowed, so they still can't sign in.`);
  }
}

const ACTIONS = [undefined, 'revoke', '--password', 'unlimited', 'unlimited-off'];
const [arg, action] = process.argv.slice(2);

if (arg === '--list') {
  await list();
} else if (arg && arg.includes('@') && ACTIONS.includes(action)) {
  const email = arg.trim().toLowerCase();
  if (action === 'revoke') await revoke(email);
  else if (action === 'unlimited') await setUnlimited(email, true);
  else if (action === 'unlimited-off') await setUnlimited(email, false);
  else await invite(email, { withPassword: action === '--password' });
} else {
  console.error(USAGE);
  process.exit(1);
}
