# Games at Home

A warm little place for two to five people to play together from separate devices. React, Vite, guest play, optional Google sign-in, and Firebase Realtime Database. The static frontend is intended for GitHub Pages.

## Games

- **Backwards & Forwards:** 600 common words grouped by 1–4 syllables (160 / 150 / 150 / 140). The giver immediately receives a private word and hears its bundled pronunciation reversed locally. They record an imitation (maximum 8 seconds), review the original or flipped version, and can retake it as often as they like before explicitly sending. Drafts stay on that device; only the chosen recording is uploaded and cannot then be replaced. Each listener gets up to five plays and exactly one typed guess; exact answers pass automatically (ignoring case and surrounding whitespace); other answers go to the giver for Pass / No pass. A pass awards one point to the listener. During guessing, the giver can replay both versions privately without a listen limit. Playback counts survive refreshes; unsent drafts do not. Interrupted captures can be retried or skipped, and a saved upload can be recovered after reconnecting. Headphones or muting the voice call keeps practice private.
- **Blind Wheel:** choose a topic (for example Pokémon); the system supplies topic-specific opposites each round, with 16 pairs per topic. The clue giver spins a hidden 1–2–3–4–3–2–1 scoring band, with its center anywhere from 0–100% (outer zones are clipped at the edge), then names something in the topic to guide their partner toward the 4-point center. The scoring band spins before settling on the secret target (with reduced-motion support). With two players, revealing the band awards 0–4 shared points. With three to five, everyone else submits a private guess and earns individual points. Reveal waits for all guesses or the timer. The clue giver rotates around the room.
- **Word by Word:** each player builds a connected word chain, such as coffee → shop → window → shopping → cart. Suggestions update locally from the word being typed. A small association graph ranks phrase continuations first, then reverse connections; plural normalization, prefix matching, and bounded edit distance handle partial words and typos. Approximate matches are labelled and never overwrite typed words. No model, extra library, download, network request, or Firebase call is needed for suggestions. They are optional, not a semantic validator: players can type any words and discuss their connections on a call. Only the first word starts with its first letter visible. All later words stay fully masked, even after earlier words are solved; a letter hint reveals one letter and passes the turn. Each player guesses the next player’s chain in seating order, and misses or letter hints pass the turn to the next person in that circle. Correct answers keep the turn; the first player to finish their assigned chain wins. Guesses are recorded per word for both players, retaining the latest 50 per word plus the total attempt count to bound sync traffic. At game end, each connected player publishes their own chain for the shared answer review; a disconnected player publishes when they rejoin. No topics or paid AI service.
- **Three Little Clues:** choose a word in one of 26 topics, or use a new surprise topic each round. Give one single-word hint, allow two guesses by default, then review the grouped guess history before tailoring the next hint. The host can choose one to five guesses per hint. In groups, each guesser has their own allowance per hint; correct players finish while the others continue. The giver sees everyone’s private guess history and tailors each next hint after all remaining players finish that hint or its timer expires. The answer is revealed when everyone has finished, or after the third hint. Two-player play retains its original flow. Earlier solves score more points.

Hosts select games, rounds, timers, word counts, clue suggestion categories, and wheel topics in the lobby. Public rooms support 2–5 participants; new players join before a match starts. Existing players can always reclaim their saved seat while the room remains open. Host setting changes sync automatically to every guest; there is no Save button. Each guest can toggle Ready/Unready while the host edits settings. Readiness is independent of settings versions. The host starts explicitly; Start atomically saves the latest settings, begins the game, and clears readiness for the next game. A server-side readiness check rejects starts if any occupied guest seat is unready. During a match, any player can request a game change. Every other participant must agree; anyone can decline to keep playing; the requester can cancel. An agreement returns everyone to game selection in the same room, clears readiness, and discards the current match. If the host is disconnected, the agreed return completes when the host reconnects. Requests are tied to a match and unique request ID so stale responses cannot end a new game. After the final reveal (or the end of a word race), the host can choose One more round or Back to game selection without a vote. An extra wheel/clue/audio round preserves scores and swaps roles; Word by Word starts a fresh race with the same word-count and timer settings. End-of-game decisions are bound to the completed match and applied atomically, preventing stale clicks from ending a newer match. Returning to selection keeps the room and seats, and clears readiness for the next game. Guess timers pause when any participant disconnects. Guests can host or join with a nickname, with no signup. Rejoin using the same browser and room code; clearing browser data or changing sign-in loses an anonymous seat. Google players can rejoin with the same account on another device. Hosts end rooms explicitly. An absent host's room expires after 24 hours; connected hosts renew its lease each minute.

Soft synthesized interaction, turn, and result sounds run locally with the Web Audio API. They start only after a user interaction; the header mute toggle is stored on that device. These effects are suppressed during microphone capture. The audio game has explicit playback controls separate from the effects toggle and requires microphone/Web Audio support in a current HTTPS browser.

Pronunciation assets use offline Kokoro-82M neural synthesis with the Heart voice, with CMUdict-verified syllable counts; provenance and regeneration instructions are in `public/licenses/reverse-audio.txt`. No runtime model or speech API is downloaded. Each selected word loads one short 24 kHz static WAV from GitHub Pages. The neural model is used only for offline asset generation; it never runs on a player’s phone or Firebase. The browser decodes its own MediaRecorder format and shares only a standard reversed mono 24 kHz PCM16 WAV, avoiding Safari/Chromium recording-format mismatches. Eight seconds occupies at most 512,060 base64 characters in `/roundAudio/<slot>`, separate from frequent game-state updates. Only the current room members can read it. One upload per round, size bounds, five-listen counter, and manual-judging permissions are checked in database rules. This is not DRM: a participant with developer tools can copy bytes already delivered to their browser.

Both reversals operate on actual audio samples, not syllables. Capture requests 48 kHz mono without speech enhancement, then uses band-limited resampling to 24 kHz, modest level normalization, and 2 ms edge fades. Browsers may choose their own capture format/rate. MediaRecorder's 250 ms chunks affect delivery, not reversal precision. Reference pronunciations remain the bundled neural clips; no extra model or paid service is introduced. Higher-quality recordings use roughly twice the previous transfer allowance per full-length clip.

Microphone tracks are disabled between takes and reused while the sound game remains open and visible; no recorder runs between takes. Leaving the game, hiding the page, or pressing Release microphone stops the tracks. Permission persistence is controlled by the browser, not this site. In iPhone Safari, Page menu → Website Settings → Microphone → Allow can remember site permission. Reacquiring access after hiding/reloading may still prompt under browser policy.

The host deletes the previous clip on advancing rounds, starting/changing games, or closing the room. An abandoned clip becomes inaccessible when its lease expires and is overwritten/deleted when the slot is reused. There is no background retention job, archive, Firebase Storage bucket, or recording in the public repository. The five slots bound stored clips to about 2.6 MB total, but repeated plays/refreshes still consume free database transfer quota.

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

Keep the Firebase project on **Spark**, with **no linked Cloud Billing account**. This application uses Realtime Database and anonymous/Google authentication only. No Cloud Functions, Cloud Run, paid AI, or storage buckets are used. Short game recordings use bounded Realtime Database values. Word suggestions are bundled local lists. GitHub Pages and a public repository supply the frontend and the included `github.io` URL.

Spark quota exhaustion can interrupt service; it does not automatically upgrade the project. Connecting billing or manually upgrading to Blaze would change this guarantee. Recheck Firebase's pricing if services or account billing change.

There are exactly five room slots enforced by database rules: public slots 1–4 and reserved slot 0. Public rooms have one host and up to four guests. The reserved room remains limited to the two priority accounts, for at most 22 occupied game seats in total. Only the two priority accounts can create, read, or join slot 0. Public rooms cannot consume that reserved slot.

**This is a game-seat cap, not a cap on raw network connections, authentication requests, or malicious traffic.** A free public backend has no availability guarantee or dedicated capacity. An attacker may still consume quotas or deny service without gaining permission to read private data. Reserved seats do not reserve Firebase infrastructure. Keep billing disabled and monitor the Firebase usage console.

## Privacy and access controls

- Default-deny database rules; public rooms accept Firebase anonymous identities or verified Google sign-ins. Reserved rooms require a verified Google account on the private priority list.
- No public room listing or readable room codes. A new guest must present the correct eight-character invitation to claim one of four fixed guest seats atomically. Seats must be unique, are bounded server-side, and cannot be added during a match.
- Only the host may change lobby settings, close a room, or create a new match. Guests can toggle their own readiness.
- Room players can read their room's public game state. Other rooms are inaccessible. In group wheel/clue/audio rounds, each player's submissions are readable only by that player and the current clue giver. Shared state contains bounded progress, not private guesses, until reveal. Rules freeze the giver and roster within a round, bind submissions to match/round, reject overwritten answers, and limit listens per listener. A round or match change clears private submissions atomically.
- Secret targets and word lists are stored separately, with owner-only read access. Only reveal results are copied into shared state.
- Room slot keys, collection keys, input lengths, game fields, and numeric ranges are bounded by server rules.
- Each account has at most three presence records per room; closing/reconnecting tabs updates presence. This does not limit an adversary's raw connections.
- The priority email list is backend-only at `/priority`, writable only with administrative credentials. Only verified Google accounts may check their own entry; anonymous guests cannot read the list. No real email addresses belong in this repository.
- Runtime error messages and form values are rendered as React text, not HTML. There is no raw HTML injection or dynamic code execution.

Group audio rounds give each listener five plays and one guess; exact answers resolve automatically and the recorder judges spelling variants independently. Each browser caches the single shared recording instead of downloading it on every play.

The game engine runs on the players' devices to stay within Spark's free services. The player owning a secret judges guesses against it. Database rules isolate rooms and secrets, but this is a casual game for trusted partners, **not a fully cheat-proof competitive server**. A malicious participant can disrupt their own room or attempt to manipulate shared scoring; they cannot gain administrative access or read another player's secret through the allowed client API.

Firebase creates a persistent anonymous identity when a guest first enters a room; Google manages optional account sign-in. Firebase administrators can access stored game data. No analytics or ad tracking SDK is loaded. Free fonts are bundled locally. Only nicknames are shared with the other players, not Google emails. Each slot's previous match is replaced when reused; rooms are not permanent archives. Homepage visitors do not keep a game-database connection open.

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
