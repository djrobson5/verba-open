# Verba

Verba is a speaking-practice app for language learners. You pick a language, a scenario and a
difficulty level, then hold a live spoken conversation with an AI partner (Gemini Live, or
optionally OpenAI's GPT-Live) in that language. The transcript is saved so you can review the
conversation afterward. It was built for a university language program, so access is
invite-only: accounts are created from the command line, and daily and weekly limits keep voice
API costs bounded.

## Features

- **12 languages**: English, Spanish, French, German, Italian, Portuguese, Chinese, Japanese,
  Korean, Hindi, Arabic and Turkish.
- **Scenarios**: ordering a coffee, inviting a friend out, asking for directions, dining at a
  restaurant, discussing academic interests and an international coffee hour. Scenarios live in
  Firestore and can be added or edited by admins at `/admin/scenarios`.
- **Difficulty levels**: easy, medium and hard, each with its own partner prompt.
- **Live voice**: low-latency, interruptible conversation over the Gemini Live API. The API key
  never reaches the browser; the server mints short-lived, single-use tokens pinned to the
  session's setup.
- **GPT-Live** (optional): OpenAI's realtime voice model as a second provider, over WebRTC.
- **Video partner** (optional): a talking-head avatar driven by the AI's audio, via Simli or
  HeyGen LiveAvatar. Without an avatar key it falls back to audio only.
- **Live transcript** during the session, and a **history** page to review past conversations.
- **Usage limits**: a daily session cap, a per-session time limit and idle timeout, and a weekly
  practice budget (30 minutes by default), all enforced on the server.
- **Admin pages**: a scenario editor and a usage dashboard with estimated API spend per day and
  per provider.
- **Installable PWA** with an offline fallback page.

## Requirements

- Node.js 20 or newer
- A [Firebase](https://firebase.google.com/) project with Email/Password authentication and
  Cloud Firestore enabled
- A [Gemini API key](https://aistudio.google.com/apikey). Use a paid-tier key for real users:
  on the free tier Google may use your inputs to improve its products.
- Optional: an OpenAI API key (GPT-Live), a Simli API key or a HeyGen LiveAvatar API key (video
  partner)

## Quick start

```bash
npm install
cp .env.local.example .env.local   # then fill in the values
npm run dev
```

The app runs at http://localhost:3000.

### Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `GEMINI_API_KEY` | yes | Server-side only. |
| `NEXT_PUBLIC_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_STORAGE_BUCKET` | yes | Firebase web app config (Project settings → Your apps). |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | yes | A Firebase Admin service account (Project settings → Service accounts). Keep the key's `\n` sequences literal. |
| `COOKIE_SECRET_CURRENT`, `COOKIE_SECRET_PREVIOUS` | yes | Two random strings for signing the session cookie, e.g. `openssl rand -base64 32`. |
| `OPENAI_API_KEY` | no | Enables the GPT-Live model. |
| `SIMLI_API_KEY`, `SIMLI_DEFAULT_FACE_ID` | no | Enables the Simli video partner. |
| `LIVEAVATAR_API_KEY`, `LIVEAVATAR_DEFAULT_AVATAR_ID` | no | Enables the HeyGen LiveAvatar video partner. |

`.env.local.example` lists every key with notes on cost.

### Firebase setup

1. Point the Firebase CLI at your project with `firebase use --add`, then deploy the security
   rules and indexes: `firebase deploy --only firestore`. The rules are the authorization
   boundary for transcripts and the scenario editor, so deploy them before inviting anyone.
2. In the Firebase console, turn off **Enable create (sign-up)** under Authentication →
   Settings → User actions, so nobody can create accounts with your public API key. Such
   accounts couldn't start a session anyway, but there's no reason to allow them. The Admin
   SDK, which the invite script uses, can still create accounts.
3. Seed the scenarios: `node scripts/seed-scenarios.mjs`. If the collection is empty, the app
   falls back to the scenarios in `src/config/scenarios.ts`.
4. Create your own account and make it an admin:

   ```bash
   node scripts/invite.mjs you@example.com --password   # prints a generated password
   node scripts/set-admin.mjs you@example.com
   ```

   Sign out and back in for the admin claim to take effect.

All scripts read the Firebase Admin credentials from `.env.local`.

## Accounts and access

There is no public sign-up. An account can start a session only if it carries an `allowed` or
`admin` custom claim, checked in the middleware and mirrored in `firestore.rules`. Manage access
with `scripts/invite.mjs`:

```bash
node scripts/invite.mjs student@example.edu              # create/allow, print a set-password link
node scripts/invite.mjs student@example.edu --password   # create/allow, print a generated password
node scripts/invite.mjs student@example.edu revoke       # remove access
node scripts/invite.mjs student@example.edu unlimited    # lift daily caps and the weekly budget
node scripts/invite.mjs --list                           # list every account and its access
```

## Limits and cost

Voice APIs bill by the minute or by the token, so every limit is enforced on the server. The
values live in `src/config/limits.ts`:

- 10 sessions per user per day, and 30 token requests per day to bound retries
- 20 minutes per session, with an idle timeout after 3 minutes of silence
- 30 minutes of connected practice per user per week

Admins and accounts with the `unlimited` claim skip the daily and weekly limits. The usage
dashboard at `/admin/usage` estimates spend from the token counts and audio minutes each session
reports, using the rates in `src/config/pricing.ts`. Check those rates against the providers'
current pricing pages.

## Customizing

- **Languages**: `src/config/languages.ts`
- **Scenarios**: the admin editor at `/admin/scenarios`, or `src/config/scenarios.ts` for the
  fallback set
- **Voice models**: `src/config/models.ts`. A new Gemini model must also be added to the
  ephemeral-token allowlist (see [CLAUDE.md](./CLAUDE.md)).
- **Colors and fonts**: the design tokens at the top of `src/app/globals.css`

## Development

- `npm run dev`: dev server (Turbopack)
- `npm run build`: production build, and the only path that generates the service worker. Don't
  run it while `npm run dev` is running; both write to `.next/`.
- `npm run lint`: ESLint. There is no test runner.

[CLAUDE.md](./CLAUDE.md) documents the architecture in depth: the two halves of auth, the access
gate, the ephemeral-token flow, the Firestore data model, the session caps and weekly budget,
cost tracking and the avatar vendors. Live API notes are in
[docs/gemini-live-models.md](./docs/gemini-live-models.md).

## License

[MIT](LICENSE)
