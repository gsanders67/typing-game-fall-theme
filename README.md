# Leaf It On The Keyboard

An original Xbox/autumn-themed typing party for **2-25 players plus one non-playing presenter**. React, TypeScript, Vite, and PeerJS; static hosting with no account or application backend.

## Run locally

Use Node.js 24 or newer.

```powershell
npm ci
npm run dev
```

Open the address printed by Vite. Choose **Host a game**, share the six-character room code or invite link, and have players join from their own browsers. Use a separate browser profile/context when testing multiple players on one computer: tabs in the same profile deliberately share reconnect identity.

Public PeerJS signaling and browser P2P are used by default. Without a configured relay, connections use STUN and require a working direct path between browsers. For players on different or restricted networks, deploy the [self-hosted TURN relay](deploy/relay/README.md) and set `VITE_ICE_SERVERS_URL`. The game fetches temporary credentials before opening a room or joining; a configured relay outage is shown as an error rather than silently falling back to direct-only connections.

## Run the event

1. Rehearse on the actual event network and representative physical keyboards/devices. Local capacity tests are not proof of corporate-network reachability.
2. Keep the presenter on a powered, awake computer with its tab visible. Share that screen; both controls and bracket are intentionally visible.
3. Players choose names and original woodland characters, join, practice if wanted, and mark themselves ready. The presenter can remove lobby players.
4. **Lock roster & draw bracket** once everyone is ready. This prevents late competitors.
5. Select the stage preset, then start. All players acknowledge readiness before the shared five-second countdown.
6. Resolve score ties with the d20 button, then start the next stage. Highest tied dice are rerolled until one winner remains.
7. Export public results and save a private backup. A 25-player field progresses **25 -> 12 -> 6 -> 3 -> 1**.

Desktop views fit a single screen, including 1280 x 720. Larger rosters, match lists, standings, and history use page controls instead of scrolling. Choose a stage above the bracket to inspect its fixed matchups; use **Next matches** to reach additional matches and their dice controls. Private backups live in **Event backups**.

Odd stages use pairs plus one trio; only one player advances from every match. Paths are fixed after the initial seeded shuffle. Trio players have lower advancement odds than pair players, and the final may be a trio. Players eliminated in the same stage share placement.

## Rules

- Each match runs for 60 seconds with three lives. A target reaching the kill line removes one life. Zero lives locks that player's score, but opponents continue.
- Several targets fall at once. The first letter selects the matching target closest to the line; ties use spawn order. Selection stays locked until completion, expiration, or clearing the input buffer.
- Complete the target to clear it automatically; no Enter. Case is ignored. Phrase spaces must be entered; punctuation is excluded. Backspace corrects a typo. Paste/held-key repeat is not accepted.
- Completed letters award 10 points each; spaces award no points and incomplete targets award nothing.
- Start at 1x. Every five consecutive clears increases the multiplier by 0.5 to a 3x cap. The fifth clear still uses 1x; the sixth uses 1.5x.
- Typos and missed targets reset the streak. **Typos never cost a life.**
- Opponents receive identical seeded content, timing, preset, and logical board geometry.
- Presets progress from short words to longer words and short phrases. The presenter can override a stage preset before it starts.
- WPM is accepted correct character entries / 5 over the full one-minute match. Accuracy excludes Backspace and displays the last completed round on the leaderboard. Practice never affects standings.
- Eliminated players can practice and follow the bracket. Backgrounding or disconnecting does not pause a competitive match.

## Recovery

The host saves versioned local checkpoints at key transitions, including locked results. Browser storage is not a shared backend. **Save private backup** downloads the room and reconnect credentials; keep this file private. **Export public results** excludes those credentials.

- A player can use **Reconnect** with the same browser identity; timer and misses continue while offline.
- After presenter refresh, open **Returning presenter? Restore your event** and restore the browser checkpoint or import a private backup. Players reconnect. Finalized matches survive; unfinished games require replay.
- If the old room code is occupied, restoration issues a new one. Returning players should keep their original tabs open, enter the new code in the offline banner, and reconnect with the retained identity.
- **Void & replay** uses a fresh shared seed, clears downstream results, and resets all unfinished matches because the room revision changes. The confirmation explicitly warns about this.
- No automatic host migration, cloud persistence, account recovery, or recovery after losing both storage and backups is included.

Browser P2P is appropriate for a friendly event, not tamper-proof competition. The presenter validates sequenced inputs and owns scoring/results; a determined participant or presenter still controls their browser.

## Validation

```powershell
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run test:production
```

Browser tests start a **local-only test signaling server** and Vite automatically, then stop them. No test hooks are exposed in the production bundle. Tests include live authoritative typing, malformed/unauthorized input, reconnects, checkpoint restore, all supported bracket sizes, d20 rerolls, 26-peer traffic, and a complete 25-player/four-stage event.

The full-tournament test synchronizes all peer clocks and uses reduced motion for its 25 player windows, so one computer's rendering load cannot consume the typing window. Separate browser tests exercise normal-motion feedback and screen fit.

If your preview already uses port 5173, run browser tests with `$env:PLAYWRIGHT_PORT = '5174'`. This leaves the preview and its public-signaled rooms alone.

Opt-in public-service connectivity check:

```powershell
$env:PUBLIC_P2P = '1'
npm run test:e2e -- tests/public-signaling.spec.ts
```

This proves only the network where it runs. The required event-network rehearsal must include all 25 players plus presenter, simultaneous input, reconnection, and backup restoration.

## GitHub Pages

Live site: https://gsanders67.github.io/typing-game-fall-theme/

Repository: https://github.com/gsanders67/typing-game-fall-theme

GitHub Pages uses **Settings -> Pages -> Source: GitHub Actions**. The **Validate and deploy Type Night** workflow validates and publishes every push to `main`, and can also be run manually from the Actions tab.

Vite emits relative assets and invites use hash routing, so root and repository-subpath hosting both work. Production tests exercise an `/event/` subpath. No `VITE_PEER_HOST` or `VITE_PEER_PORT` variables should be set in the production build; these are for the local test server only and must never contain secrets.

For cross-network play, set the repository Actions variable `VITE_ICE_SERVERS_URL` to your VPS credential endpoint (for example, `https://ice.example.com/ice`) and run the Pages workflow again. This URL is public; never put the TURN shared secret in a `VITE_` variable. The VPS deployment and certificate/firewall instructions are in [the relay guide](deploy/relay/README.md).

Fonts use Google Fonts with system fallbacks. The original dark-green/autumn presentation uses simple woodland avatars and falling word chips; no Jackbox game assets or source were copied. Motion for React drives button presses, character reactions, and screen/page transitions. **Less motion** or the system preference removes transform-heavy effects while preserving immediate feedback. Music/effects are synthesized locally. The game is inspired by the falling-word mechanic, not a reproduction of the reference site's code.

Official references: [PeerJS](https://peerjs.com/client/getting-started), [PeerJS network limitations](https://peerjs.com/client/faq), [GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [Vite deployment](https://vite.dev/guide/static-deploy.html).
