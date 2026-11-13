# Self-hosted game and lobby relay

Docker Compose runs the React game and TypeScript Express server in one `leaf-type-game` image, plus coturn and HAProxy. Everything uses the root `package.json` and lockfile; there is no separate server npm package.

Two DNS names share TCP port 443: `game.example.com` serves the React game and `/api/ice` through Express, while `turn.example.com` serves TURN over TLS. HAProxy routes encrypted connections by TLS hostname without decrypting them. UDP/TCP TURN on port 3478 is also available.

This requires a Linux VPS with its own public IPv4 address, Docker Compose, and no existing service occupying port 443. Public PeerJS signaling is unchanged.

## 1. DNS and certificates

Create DNS-only A records for `turn.example.com` and `game.example.com` pointing to the VPS IPv4 address. Do not put these records behind an HTTP-only CDN proxy, and do not add AAAA records unless you also configure and test IPv6.

Obtain a publicly trusted certificate covering **both names** using your existing ACME tooling. For example, with Certbot installed and inbound port 80 temporarily available:

```sh
sudo certbot certonly --standalone -d turn.example.com -d game.example.com
```

Clone this repository on the VPS and change to `deploy/relay`. Copy the certificate and key into its ignored `certs` directory. The containers share supplemental group 2000 so the private key need not be world-readable:

```sh
sudo install -d -m 750 -g 2000 certs
sudo install -m 640 -g 2000 /etc/letsencrypt/live/turn.example.com/fullchain.pem certs/fullchain.pem
sudo install -m 640 -g 2000 /etc/letsencrypt/live/turn.example.com/privkey.pem certs/privkey.pem
```

After each certificate renewal, repeat the two file copies and run `docker compose restart app coturn`. Automate this with your ACME renewal deploy hook. Do not mount only Certbot's `live` directory: its files are symlinks into a separate archive directory.

## 2. Configure and start

Copy `.env.example` to `.env`. Set `APP_HOST`, `TURN_HOST`, the VPS public IPv4 address, and `ALLOWED_ORIGIN` to your full HTTPS game origin, such as `https://game.example.com`, without a trailing slash or path. Generate a 64-character hexadecimal shared secret with `openssl rand -hex 32` and put it only in the VPS `.env` file.

```sh
cp .env.example .env
chmod 600 .env
# Edit .env before continuing.
docker compose config --quiet
docker compose up -d --build --wait
docker compose ps
```

Open `https://game.example.com` and share that address with players. No GitHub Pages rebuild or `VITE_ICE_SERVERS_URL` setting is required for this deployment: the Docker build uses the committed self-hosted Vite mode to call `/api/ice` on the same origin. `APP_HOST` must match the hostname in `ALLOWED_ORIGIN`.

The Docker build installs dependencies from the root lockfile, type-checks the project, and builds React. The final image contains production dependencies, the React `dist` output, and the TypeScript Express server, which Node.js 24 executes directly. All maintained server, test, and configuration sources are TypeScript; no `.mjs` files are used.

`.env` and certificate files are ignored by Git and excluded from the Docker build context. The permanent HMAC secret stays on the VPS and is never returned to the browser. Do not set `VITE_PEER_HOST` for this deployment: coturn is a relay, not a PeerJS signaling server.

## 3. Firewall and renewal

Allow inbound **TCP 443**, **UDP and TCP 3478**, and **UDP 49160-49415** in both the VPS firewall and provider security rules. TCP 80 is needed for the example certificate issuance/renewal, not normal gameplay. Do not expose ports 5349 or 8443; they are internal Compose backends.

If the VPS public address is NAT-mapped, set `TURN_PUBLIC_IP` to the public address and ensure relay UDP ports are forwarded without port translation. If your VPS already uses port 443, use a dedicated public IP/VPS or deliberately integrate these backends into an existing SNI-aware TCP proxy; do not put TURN behind an ordinary HTTP reverse proxy.

Credentials last 24 hours; start a new room for events extending beyond that window. After updates, run `docker compose up -d --build --wait` and have the host and players reload.

## 4. Verify before the event

```sh
curl --fail https://game.example.com/health
curl --fail https://game.example.com/
curl --fail https://game.example.com/api/ice -H 'Origin: https://game.example.com'
docker compose logs --tail 50
```

The third request must return `expiresAt` and authenticated `turn:`/`turns:` URLs. Keep its temporary credentials private. To test real relay traffic, run the opt-in Playwright preflight from the root package:

```powershell
$env:RELAY_PREFLIGHT_URL = 'https://game.example.com/api/ice'
npm run test:e2e -- relay.spec.ts
```

That test loads your hosted game and forces relay-only data delivery through UDP TURN and TLS TURN separately; a successful same-computer direct connection is not enough. Then rehearse a real host/player join from different networks, including those that previously failed.

## Limits and operation

This is intended for the friendly 25-player event, not an unrestricted public relay business. Issuance is limited to 120 requests per minute globally; allocations and traffic also have coturn quotas. The host can require many allocations, so its per-user quota intentionally supports all players. CORS and same-origin checks restrict normal browsers but **are not authentication**: scripts can forge headers and request credentials. Monitor VPS bandwidth/billing, restrict access upstream if needed, and stop the stack with `docker compose down` when not in use.

Private, loopback, link-local, and multicast relay destinations are blocked. The permanent secret is visible to VPS administrators through Docker configuration, so restrict Docker access. Rotate it by updating `.env` and recreating the stack; existing temporary credentials then stop working and players must rejoin.

The PR workflow builds the full game image, exercises the Express-hosted React app in a browser, and smoke-tests HTTPS/SNI routing using disposable self-signed certificates. Those certificates are not suitable for real players; VPS deployment requires publicly trusted certificates and a real-network relay preflight.

References: [Express static files](https://expressjs.com/en/starter/static-files.html), [Node.js TypeScript support](https://nodejs.org/api/typescript.html), [coturn authentication and configuration](https://github.com/coturn/coturn/blob/master/README.turnserver), [HAProxy TCP/TLS routing](https://docs.haproxy.org/3.2/configuration.html).
