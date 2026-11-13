# Self-hosted lobby relay

This Docker Compose deployment runs coturn, a small credential-service image built from this directory, and HAProxy. The game keeps public PeerJS signaling but uses your VPS for connections that cannot be made directly.

Two DNS names share TCP port 443: `ice.example.com` serves HTTPS credentials and `turn.example.com` serves TURN over TLS. HAProxy routes the encrypted connection by TLS hostname without decrypting it. UDP/TCP TURN on port 3478 is also available. This requires a Linux VPS with its own public IPv4 address, Docker Compose, and no existing service occupying port 443. It is not a GitHub Pages server.

## 1. DNS and certificates

Create DNS-only A records for `turn.example.com` and `ice.example.com` pointing to the VPS IPv4 address. Do not put these records behind an HTTP-only CDN proxy, and do not add AAAA records unless you also configure and test IPv6.

Obtain a publicly trusted certificate covering **both names** using your existing ACME tooling. For example, with Certbot installed and inbound port 80 temporarily available:

```sh
sudo certbot certonly --standalone -d turn.example.com -d ice.example.com
```

In this directory on the VPS, copy the certificate and key into the ignored `certs` directory. The containers share supplemental group 2000 so the private key need not be world-readable:

```sh
sudo install -d -m 750 -g 2000 certs
sudo install -m 640 -g 2000 /etc/letsencrypt/live/turn.example.com/fullchain.pem certs/fullchain.pem
sudo install -m 640 -g 2000 /etc/letsencrypt/live/turn.example.com/privkey.pem certs/privkey.pem
```

After each certificate renewal, repeat the two file copies and run `docker compose restart credentials coturn`. Automate this with your ACME renewal deploy hook. Do not mount only Certbot's `live` directory: its files are symlinks into a separate archive directory.

## 2. Configure and start

Copy `.env.example` to `.env`. Set both hostnames, the VPS public IPv4 address, and the exact game origin. For the existing Pages site, the origin is `https://gsanders67.github.io`, **without** the repository path. Generate a 64-character hexadecimal shared secret with `openssl rand -hex 32` and put it only in the VPS `.env` file.

```sh
cp .env.example .env
chmod 600 .env
# Edit .env before continuing.
docker compose config --quiet
docker compose up -d --build --wait
docker compose ps
```

The local credential image is named `leaf-type-relay-credentials:local`. No npm packages or external credential provider are needed inside it. `.env` and certificate files are ignored by Git and excluded from the Docker build context.

Allow inbound **TCP 443**, **UDP and TCP 3478**, and **UDP 49160-49415** in both the VPS firewall and provider security rules. TCP 80 is needed for the example certificate issuance/renewal, not for normal gameplay. Do not expose ports 5349 or 8443; they are internal Compose backends. If the VPS public address is NAT-mapped, set `TURN_PUBLIC_IP` to the public address and ensure the relay UDP ports are forwarded without port translation.

TCP 443 must support raw TLS pass-through, not only HTTPS. If your VPS already uses port 443, use a dedicated public IP/VPS or deliberately integrate these backends into an existing SNI-aware TCP proxy; do not put TURN behind an ordinary HTTP reverse proxy.

## 3. Connect the game

Set the repository **Settings -> Secrets and variables -> Actions -> Variables** entry:

```text
VITE_ICE_SERVERS_URL=https://ice.example.com/ice
```

After merging, rerun **Validate and deploy Type Night** so Vite embeds the public URL. For local development, set the same variable in an ignored `.env.local` file and restart Vite. Host and players must all reload the deployed game after the update.

The browser fetches fresh credentials on hosting/joining. Credentials last 24 hours; start a new room for events extending beyond that window. The permanent HMAC secret stays on the VPS and is never returned to the browser. Do not set `VITE_PEER_HOST` for this deployment: coturn is a relay, not a PeerJS signaling server.

## 4. Verify before the event

```sh
curl --fail https://ice.example.com/health
curl --fail https://ice.example.com/ice -H 'Origin: https://gsanders67.github.io'
docker compose logs --tail 50
```

The second request must return `expiresAt` and authenticated `turn:`/`turns:` URLs. Keep its temporary credentials private. To test real relay traffic, run the opt-in Playwright relay preflight against this endpoint:

```powershell
$env:RELAY_PREFLIGHT_URL = 'https://ice.example.com/ice'
npm run test:e2e -- tests/relay.spec.ts
```

That test forces relay-only data delivery through UDP TURN and TLS TURN separately; a successful same-computer direct connection is not enough. Then rehearse a real host/player join from different networks, including the networks that previously failed.

## Limits and operation

This is intended for the friendly 25-player event, not an unrestricted public relay business. Issuance is limited to 120 requests per minute globally; allocations and traffic also have coturn quotas. The host can require many allocations, so its per-user quota intentionally supports all players. CORS restricts normal browsers but **is not authentication**: scripts can forge Origin and request credentials. Monitor VPS bandwidth/billing, restrict access upstream if needed, and stop the stack with `docker compose down` when not in use.

Private, loopback, link-local, and multicast relay destinations are blocked. The permanent secret is visible to VPS administrators through Docker configuration, so restrict Docker access. Rotate it by updating `.env` and recreating the stack; existing temporary credentials then stop working and players must rejoin.

The PR workflow builds the credential image and smoke-tests HTTPS/SNI routing using disposable self-signed certificates. Those are not suitable for real browsers; VPS deployment requires publicly trusted certificates and a real-network relay preflight.

References: [coturn authentication and configuration](https://github.com/coturn/coturn/blob/master/README.turnserver), [coturn Docker image](https://github.com/coturn/coturn/tree/master/docker/coturn), [HAProxy TCP/TLS routing](https://docs.haproxy.org/3.2/configuration.html).
