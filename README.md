# Games at Home

A warm little place for two people to play together from separate devices. React, Vite, guest play, optional Google sign-in, and Firebase Realtime Database. The static frontend is intended for GitHub Pages.

## Games

- **Blind Wheel:** choose a topic (for example Pokémon); the system supplies topic-specific opposites each round, with 16 pairs per topic. The clue giver spins a hidden 1–2–3–4–3–2–1 scoring band, with its center anywhere from 0–100% (outer zones are clipped at the edge), then names something in the topic to guide their partner toward the 4-point center. The guesser places the needle; revealing the band awards 0–4 shared points. Roles alternate.
- **Word by Word:** each player builds a connected word chain, such as coffee → shop → window → shopping → cart. Suggestions update locally from the word being typed. A small association graph ranks phrase continuations first, then reverse connections; plural normalization, prefix matching, and bounded edit distance handle partial words and typos. Approximate matches are labelled and never overwrite typed words. No model, extra library, download, network request, or Firebase call is needed for suggestions. They are optional, not a semantic validator: players can type any words and discuss their connections on a call. Only the first word starts with its first letter visible. All later words stay fully masked, even after earlier words are solved; a letter hint reveals one letter and passes the turn. Correct answers keep the turn; misses pass it. Guesses are recorded per word for both players, retaining the latest 50 per word plus the total attempt count to bound sync traffic. At game end, each connected player publishes their own chain for the shared answer review; a disconnected player publishes when they rejoin. No topics or paid AI service.
- **Three Little Clues:** choose a word in one of 26 topics, or use a new surprise topic each round. Give one single-word hint, allow two guesses by default, then review the grouped guess history before tailoring the next hint. The host can choose one to five guesses per hint. A correct guess ends the round; three unsuccessful hints reveal the answer. Earlier solves score more points.

Hosts select games, rounds, timers, word counts, clue suggestion categories, and wheel topics in the lobby. The guest reviews settings before starting. Guess timers pause when either player disconnects. Guests can host or join with a nickname, with no signup. Rejoin using the same browser and room code; clearing browser data or changing sign-in loses an anonymous seat. Google players can rejoin with the same account on another device. Hosts end rooms explicitly. An absent host's room expires after 24 hours; connected hosts renew its lease each minute.

## Run

Use Node 24 LTS.

```sh
npm ci
npm run dev
npm test
npm run test:ui
npm run build
```

Firebase's project identifiers are in `src/config.js`. The browser key comes from `VITE_FIREBASE_API_KEY`: use an ignored `.env.local` file for development and a GitHub Actions secret for deployment. Copy `.env.example` and supply your own restricted key. Builds fail when this value is missing. No live key belongs in tracked source.

**A `VITE_` value is included in the deployed browser JavaScript. It is not a runtime secret.** Firebase web keys identify a project; authentication, database rules, and API restrictions enforce access. The production key is restricted to `identitytoolkit.googleapis.com` and `securetoken.googleapis.com`, with website restrictions for the deployed site, the Firebase auth handler, and the documented localhost development origins. Keep origin referrers enabled; invitation paths are not sent cross-origin.

Google sign-in needs the current domain in Firebase Authentication's authorized-domain list. For a different Firebase project, replace the configuration and `.firebaserc` project ID. Never reuse this browser key for paid Google APIs.

## Free operation

Keep the Firebase project on **Spark**, with **no linked Cloud Billing account**. This application uses Realtime Database and anonymous/Google authentication only. No Cloud Functions, Cloud Run, paid AI, file uploads, or billable storage buckets are used. Word suggestions are bundled local lists. GitHub Pages and a public repository supply the frontend and the included `github.io` URL.

Spark quota exhaustion can interrupt service; it does not automatically upgrade the project. Connecting billing or manually upgrading to Blaze would change this guarantee. Recheck Firebase's pricing if services or account billing change.

There are exactly five room slots enforced by database rules: public slots 1–4 and reserved slot 0. Each room has one host and one guest, for at most ten occupied game seats. Only the two priority accounts can create, read, or join slot 0. Public rooms cannot consume that reserved slot.

**This is a game-seat cap, not a cap on raw network connections, authentication requests, or malicious traffic.** A free public backend has no availability guarantee or dedicated capacity. An attacker may still consume quotas or deny service without gaining permission to read private data. Reserved seats do not reserve Firebase infrastructure. Keep billing disabled and monitor the Firebase usage console.

## Privacy and access controls

- Default-deny database rules; public rooms accept Firebase anonymous identities or verified Google sign-ins. Reserved rooms require a verified Google account on the private priority list.
- No public room listing or readable room codes. A new guest must present the correct eight-character invitation to claim a seat atomically.
- Only the host may change lobby settings, close a room, or create a new match. Guests can acknowledge their own settings review.
- Room players can read their room's public game state. Other rooms are inaccessible.
- Secret targets and word lists are stored separately, with owner-only read access. Only reveal results are copied into shared state.
- Room slot keys, collection keys, input lengths, game fields, and numeric ranges are bounded by server rules.
- Each account has at most three presence records per room; closing/reconnecting tabs updates presence. This does not limit an adversary's raw connections.
- The priority email list is backend-only at `/priority`, writable only with administrative credentials. Only verified Google accounts may check their own entry; anonymous guests cannot read the list. No real email addresses belong in this repository.
- Runtime error messages and form values are rendered as React text, not HTML. There is no raw HTML injection or dynamic code execution.

The game engine runs on the players' devices to stay within Spark's free services. The player owning a secret judges guesses against it. Database rules isolate rooms and secrets, but this is a casual game for trusted partners, **not a fully cheat-proof competitive server**. A malicious participant can disrupt their own room or attempt to manipulate shared scoring; they cannot gain administrative access or read another player's secret through the allowed client API.

Firebase creates a persistent anonymous identity when a guest first enters a room; Google manages optional account sign-in. Firebase administrators can access stored game data. No analytics or ad tracking SDK is loaded. Free fonts are bundled locally. Only nicknames are shared with the other player, not Google emails. Each slot's previous match is replaced when reused; rooms are not permanent archives. Homepage visitors do not keep a game-database connection open.

## Backend administration

Rules are generated from `scripts/generate-rules.mjs` and committed as `database.rules.json`. Deploy reviewed rule changes with your own authenticated Firebase CLI:

```sh
npm run rules:generate
firebase deploy --only database --project gaming-at-home
```

Enable both Anonymous and Google sign-in in Firebase Authentication. Add the GitHub Pages domain (the host name only) to authorized domains. Do not enable billing.

Priority entries are set privately in the Firebase console. The key is the lowercase Google email with every `.` replaced by `%2E`, and the value is `true`. Never commit the account list, CLI tokens, service-account JSON, or debug logs. Adding priority entries grants reserved-room access, so keep the list to the intended two accounts.

## Security tests

Install the official Firebase CLI and a supported Java runtime (Java 21+). No production account or data is needed for these tests:

```sh
npm run test:rules
```

The tests use the `demo-games-at-home` emulator project. They cover unauthorized access, invite-code requirements, third-player rejection, reserved room protection, private answers, settings ownership, input bounds, reconnection identity, concurrent word-list submissions, and a synchronized wheel reveal.

## GitHub Pages

Create a public repository, set the Actions secret `VITE_FIREBASE_API_KEY` to your restricted browser key, push this project on `main`, and select **Settings → Pages → Source → GitHub Actions**. The included workflow scans tracked source for recognizable credentials, tests, builds, and deploys `dist`. No Firebase administrative token is required in GitHub Actions. Relative asset paths support a project URL such as `https://USERNAME.github.io/games-at-home/`.

The workflow has read-only repository permission during builds. Only its deployment job receives Pages write and OIDC permissions. Pull requests run tests and builds but do not deploy.
