// Who's allowed to hold a Verba session. Verba is invite-only: an account
// gets in only if its ID token carries one of these custom claims:
//   1. `admin: true`   (set via scripts/set-admin.mjs; the owner).
//   2. `allowed: true` (set via scripts/invite.mjs when the owner invites
//      someone; scripts/set-allowed.mjs also still works).
//
// The email domain grants nothing by itself; a school-domain account without
// a claim is refused like any other. Public signup is closed (/signup only
// shows an invite-only notice), so invited users get their account and a
// set-password link from scripts/invite.mjs.
//
// Enforced in middleware on every authenticated request. firestore.rules
// mirrors the same check (`isMember()`) for app data.

export function isAccessAllowed(decodedToken: {
  admin?: unknown;
  allowed?: unknown;
}): boolean {
  return decodedToken.admin === true || decodedToken.allowed === true;
}
