# Games at Home

A warm little place for two people to play together from separate devices. React, Vite, Google sign-in, and Firebase Realtime Database. The static frontend is intended for GitHub Pages.

## Games

- **Blind Wheel:** the clue giver sees a secret target on a scale, sends a clue, and the other player guesses the position. Proximity awards shared points. Roles alternate.
- **Word by Word:** each player creates an unrelated word list. The other sees first letters. Correct answers keep the turn; misses and letter requests pass it. Includes curated suggestions, with no paid AI service.
- **Three Little Clues:** a secret word and three single-word hints. The host chooses one to five guesses per hint. Earlier solves score more points.

Hosts select games, rounds, timers, word counts, suggestion categories, and custom scale labels in the lobby. The guest reviews settings before starting. Guess timers pause when either player disconnects. Rejoin with the same Google account and room code, including on another device. Hosts end rooms explicitly. An absent host's room expires after 24 hours; connected hosts renew its lease each minute.

## Run

Use Node 24 LTS.

```sh
npm ci
npm run dev
npm test
npm run test:ui
npm run build
```

Firebase's public web configuration is in `src/config.js`. This contains no administrative credential. Google sign-in needs the current domain in Firebase Authentication's authorized-domain list. For a different Firebase project, replace the public configuration and `.firebaserc` project ID.

## Free operation

Keep the Firebase project on **Spark**, with **no linked Cloud Billing account**. This application uses Realtime Database and Google authentication only. No Cloud Functions, Cloud Run, paid AI, file uploads, or billable storage buckets are used. Word suggestions are bundled local lists. GitHub Pages and a public repository supply the frontend and the included `github.io` URL.

Spark quota exhaustion can interrupt service; it does not automatically upgrade the project. Connecting billing or manually upgrading to Blaze would change this guarantee. Recheck Firebase's pricing if services or account billing change.

There are exactly five room slots enforced by database rules: public slots 1–4 and reserved slot 0. Each room has one host and one guest, for at most ten occupied game seats. Only the two priority accounts can create, read, or join slot 0. Public rooms cannot consume that reserved slot.

**This is a game-seat cap, not a cap on raw network connections, authentication requests, or malicious traffic.** A free public backend has no availability guarantee or dedicated capacity. An attacker may still consume quotas or deny service without gaining permission to read private data. Reserved seats do not reserve Firebase infrastructure. Keep billing disabled and monitor the Firebase usage console.

## Privacy and access controls

- Default-deny database rules; only verified Google sign-ins may access games.
- No public room listing or readable room codes. A new guest must present the correct eight-character invitation to claim a seat atomically.
- Only the host may change lobby settings, close a room, or create a new match. Guests can acknowledge their own settings review.
- Room players can read their room's public game state. Other rooms are inaccessible.
- Secret targets and word lists are stored separately, with owner-only read access. Only reveal results are copied into shared state.
- Room slot keys, collection keys, input lengths, game fields, and numeric ranges are bounded by server rules.
- Each account has at most three presence records per room; closing/reconnecting tabs updates presence. This does not limit an adversary's raw connections.
- The priority email list is backend-only at `/priority`, writable only with administrative credentials. Each signed-in account may check only its own entry. No real email addresses belong in this repository.
- Runtime error messages and form values are rendered as React text, not HTML. There is no raw HTML injection or dynamic code execution.

The game engine runs on the players' devices to stay within Spark's free services. The player owning a secret judges guesses against it. Database rules isolate rooms and secrets, but this is a casual game for trusted partners, **not a fully cheat-proof competitive server**. A malicious participant can disrupt their own room or attempt to manipulate shared scoring; they cannot gain administrative access or read another player's secret through the allowed client API.

Google manages account sign-in. Firebase administrators can access stored game data. No analytics or ad tracking SDK is loaded. Free fonts are bundled locally. Only nicknames are shared with the other player, not Google emails. Each slot's previous match is replaced when reused; rooms are not permanent archives. Homepage visitors do not keep a game-database connection open.

## Backend administration

Rules are generated from `scripts/generate-rules.mjs` and committed as `database.rules.json`. Deploy reviewed rule changes with your own authenticated Firebase CLI:

```sh
npm run rules:generate
firebase deploy --only database --project gaming-at-home
```

Enable Google sign-in in Firebase Authentication and disable anonymous sign-in. Add the GitHub Pages domain (the host name only) to authorized domains. Do not enable billing.

Priority entries are set privately in the Firebase console. The key is the lowercase Google email with every `.` replaced by `%2E`, and the value is `true`. Never commit the account list, CLI tokens, service-account JSON, or debug logs. Adding priority entries grants reserved-room access, so keep the list to the intended two accounts.

## Security tests

Install the official Firebase CLI and a supported Java runtime (Java 21+). No production account or data is needed for these tests:

```sh
npm run test:rules
```

The tests use the `demo-games-at-home` emulator project. They cover unauthorized access, invite-code requirements, third-player rejection, reserved room protection, private answers, settings ownership, input bounds, reconnection identity, concurrent word-list submissions, and a synchronized wheel reveal.

## GitHub Pages

Create a public repository, push this project on `main`, and select **Settings → Pages → Source → GitHub Actions**. The included workflow tests, builds, and deploys `dist`. No Firebase administrative token is required in GitHub Actions. Relative asset paths support a project URL such as `https://USERNAME.github.io/games-at-home/`.

The workflow has read-only repository permission during builds. Only its deployment job receives Pages write and OIDC permissions. Pull requests run tests and builds but do not deploy.
