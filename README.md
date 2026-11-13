# Leaf It On The Keyboard

An autumn/Xbox-themed typing party for **2-25 players plus one non-playing presenter**. One TypeScript npm package contains the React/Vite frontend, Express static server, and Socket.IO backend. Players connect through your VPS over HTTP/WebSocket, not browser P2P: no PeerJS, STUN, TURN, or public signaling service is needed.

## Run locally

Use Node.js 24 or newer:

```powershell
npm ci
npm run dev
```

Open `http://localhost:5173`. Express and Socket.IO share the same development port while Vite transforms React. For the built app:

```powershell
npm run build
npm start
```

Open `http://localhost:3000`. Choose **Host a game**, share the room code or invite link, and have players open the **same server URL**. Use separate browser profiles/contexts when testing multiple players on one computer: tabs in the same profile deliberately share reconnect identity.

## Deploy with Coolify

1. Add this Git repository as a **Docker Compose** application, using the repository root as the base directory and `compose.yaml` as the Compose file.
2. Add a domain to the `game` service with internal port **3000**, for example `https://typing.example.com:3000`. Coolify handles public HTTPS and proxies both the React app and Socket.IO.
3. Deploy. No database, relay server, certificates inside the container, shared secrets, or additional ports are required.

The Compose file does not publish a fixed host port, so it can share a VPS with your other Coolify applications. Keep this application at **one replica**; rooms are held in memory. Configure your proxy to allow WebSocket upgrades; HTTP polling remains available when upgrades are blocked.

### Any domain or base path

The same Docker image works on any domain without rebuilding. Root hosting needs no environment variables. For a subpath, set **one** runtime variable in Coolify:

```text
PUBLIC_URL=https://typing.example.com/games/fall
```

Alternatively, set `BASE_PATH=/games/fall` when the external hostname should remain unrestricted. If both are set, their paths must match. Tell Coolify to route that public path to the service **without stripping the prefix**, including its `/socket.io` requests.

React assets, invite links, and Socket.IO derive their paths from the runtime base URL. Opening a base path without the trailing slash redirects correctly. `PORT` defaults to 3000 and `HOST` to `0.0.0.0`; keep the Compose service's internal port at 3000 for the simplest Coolify setup.

### Docker without Coolify

```powershell
docker build -t leaf-type-game .
docker run --rm -p 3000:3000 leaf-type-game
```

For a subpath, add `-e PUBLIC_URL=https://your-domain.example/typing` to `docker run` and point your HTTPS proxy at container port 3000. Health checks are available at `/health` and under the configured base path.

## Run the event

1. Rehearse on the real devices/networks, including all 25 players, simultaneous typing, reconnections, and backup restoration.
2. Keep the presenter on a powered, awake computer with its tab visible. The server routes room messages; the presenter still validates typing, runs the authoritative game simulation, and owns tournament controls/checkpoints.
3. Players choose names and woodland avatars, join, practice if wanted, and mark themselves ready. The presenter can remove lobby players.
4. **Lock roster & draw bracket** prevents late competitors. Choose each stage's preset and start; all players acknowledge readiness before the shared five-second countdown.
5. Resolve score ties with d20 rolls, start subsequent stages, and export results/private backups. A 25-player field progresses **25 -> 12 -> 6 -> 3 -> 1**.
6. After the final, resolve any remaining podium ties, then celebrate the top three. Use **Bracket & standings** to revisit results or replay controls.

Desktop views fit a single screen, including 1280 x 720. Larger rosters, match lists, standings, and history use page controls. Private backups live in **Event backups**.

Odd stages use pairs plus one trio; only one player advances from each match. Paths are fixed after the initial seeded shuffle. Trio players have lower advancement odds, and the final may be a trio. Same-stage eliminations share placement during play; the final podium awards exact places.

## Rules

- Each competitive or practice match runs for 30 seconds with three lives. A target reaching the kill line removes one life. Zero lives locks that player's score, but opponents continue.
- Several targets fall at once. The first letter selects the matching target closest to the line; ties use spawn order. Selection stays locked until completion, expiration, or clearing the input buffer.
- Complete a target automatically without Enter. Case is ignored. Phrase spaces must be entered; punctuation is excluded. Backspace corrects a typo. Paste/held-key repeat is not accepted.
- Completed letters award 10 points each; spaces and incomplete targets award nothing. Every five consecutive clears increases the multiplier by 0.5 from 1x to a 3x cap; the sixth clear first earns 1.5x.
- Typos and missed targets reset the streak. **Typos never cost a life.**
- Every match in a stage receives identical seeded content, timing, preset, and logical geometry. Each stage has a fresh shuffled order. Xbox/gaming and autumn vocabulary is mixed into each tier, progressing from short words to longer words and original phrases. Each pool contains at least 60 unique prompts; a prompt cannot repeat until its pool is exhausted, including across deck boundaries.
- WPM is correct character entries / 5 / round minutes: for a 30-second round, correct character entries / 2.5. The denominator remains the full round even after early life loss. Accuracy excludes Backspace and displays the last completed round on the leaderboard. Practice never affects standings.

## Podium and winner awards

The final match's locked winner is always champion, including when match dice decided the winner. Remaining podium places are ranked by furthest stage reached, then that stage's score, WPM, accuracy, and best streak, all descending. Missing accuracy ranks below measured accuracy. The presenter resolves any remaining tie affecting a podium place with **Roll for podium**, rerolling only unresolved players. Rolls are recorded in event history, checkpoints, and public results. A two-player event shows two places; lower non-podium placements may remain shared.

The champion appears immediately while other podium ties are pending. Once resolved, the original autumn podium reveals bronze, silver, then gold. **Less motion** or the operating system's reduced-motion preference displays results without the reveal animation.

The presenter and champion see **Winner awards**: a PNG to insert into an email signature, a downloadable standalone HTML certificate, and **Print / Save as PDF** through the browser print dialog. Both awards name the champion **GDS #1 Best Keyboard Warrior** for winning the **2026 Fall Faster Finger Championship**. No email address, email sending, account, upload, or external image service is involved. These are friendly-event keepsakes, not authenticated credentials. The original leaf-and-keyboard site icon also works under runtime deployment prefixes.
- Eliminated players can practice and follow the bracket. Backgrounding or disconnecting does not pause a competitive match.

## Recovery and limits

The host saves versioned browser checkpoints at key transitions, including locked results. **Save private backup** downloads the room and reconnect credentials; keep this private. **Export public results** excludes those credentials.

- A player uses **Reconnect** with the same browser identity; timer and misses continue while offline.
- After presenter refresh, open **Returning presenter? Restore your event** and restore the checkpoint or import a backup. Players reconnect. Finalized matches survive; unfinished games require replay.
- If an old code is occupied, restoration issues a new one. Returning players keep their original tabs open, enter the new code in the offline banner, and reconnect with the retained identity.
- **Void & replay** retains the shared stage prompt order so completed and replayed matches remain comparable. It clears downstream results, resets unfinished games because the room revision changes, and invalidates podium roll decisions. This means replayed prompts can be familiar; rehearse before the real event.
- A server restart/redeploy clears routing rooms. A connected presenter automatically registers its room again; players use Reconnect. A presenter refresh still requires checkpoint restoration. No automatic host migration, cloud game persistence, accounts, or recovery after losing both storage and backups is included.

This remains a friendly-event game, not tamper-proof competition. The presenter validates sequenced inputs and owns results; participants still control their own browsers. The backend isolates host/player channels, bounds messages/connections, and rejects attempts to message another player's channel.

New events record rules version 2. Completed legacy backups can be restored without recalculating their stored statistics; they are read-only for match replay and can resolve new podium ties. Legacy lobby backups can start with the new rules. Unfinished legacy 60-second tournaments are rejected with an explicit message: restore them with the previous app version or start a new event rather than silently mixing durations and stage seeds. Deploy between events, not during a live tournament.

## Validation

```powershell
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
npm run test:production
```

Tests cover typing rules, 30-second deadlines and WPM, shuffled prompt decks, stage-wide seeds, tournament sizes, exact podiums and d20 rerolls, award escaping/downloads, live authoritative typing, malformed/unauthorized input, checkpoint restore, reconnects, 25-player traffic, and complete tournaments. Backend tests cover room ownership, isolation, HTTP polling fallback, static files, and runtime URL prefixes. Production browser tests use the real Express server and verify site icons at `/event/`.

If port 5173 is occupied, set `$env:PLAYWRIGHT_PORT = '5174'` before browser tests. The CI workflow also builds the Docker image and checks React delivery and Socket.IO under a runtime base URL.

GitHub Pages is no longer a deployment target: multiplayer requires the Express/Socket.IO server. The old Pages publishing workflow has been removed.

Fonts use Google Fonts with system fallbacks. Original avatars and falling word chips are used; no Jackbox assets or source were copied. Motion and synthesized audio retain the original presentation, including **Less motion** accessibility.

References: [Express static files](https://expressjs.com/en/starter/static-files.html), [Socket.IO initialization](https://socket.io/docs/v4/server-initialization/), [Socket.IO client/proxy paths](https://socket.io/docs/v4/client-options/), [Coolify Compose deployment](https://coolify.io/docs/applications/builds/docker-compose).
