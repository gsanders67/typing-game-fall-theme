import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:https';
import { pathToFileURL } from 'node:url';

const lifetime = 24 * 60 * 60;

export function readConfig(env) {
  const { TURN_SHARED_SECRET: secret, TURN_HOST: host, ALLOWED_ORIGIN: origin } = env;
  if (!/^[a-f0-9]{64}$/i.test(secret || '')) throw new Error('TURN_SHARED_SECRET must be 64 hexadecimal characters.');
  if (!/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host || '') || !host.includes('.')) {
    throw new Error('TURN_HOST must be a public DNS hostname without a scheme or port.');
  }
  if (!origin || new URL(origin).origin !== origin || new URL(origin).protocol !== 'https:') {
    throw new Error('ALLOWED_ORIGIN must be the exact HTTPS game origin, without a path.');
  }
  return { secret, host, origin };
}

export function credentialHandler(config, now = Date.now) {
  let windowStart = now();
  let requests = 0;
  return (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200).end('ok');
      return;
    }
    if (req.url !== '/ice') { res.writeHead(404).end('Not found'); return; }
    if (req.headers.origin !== config.origin) { res.writeHead(403).end('Origin not allowed'); return; }
    res.setHeader('Access-Control-Allow-Origin', config.origin);
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET');
      res.writeHead(204).end();
      return;
    }
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET, OPTIONS'); res.writeHead(405).end('Method not allowed'); return; }
    const timestamp = now();
    if (timestamp - windowStart >= 60000) { windowStart = timestamp; requests = 0; }
    if (++requests > 120) {
      res.setHeader('Retry-After', '60');
      res.writeHead(429).end('Too many credential requests; retry in one minute.');
      return;
    }
    const expiresAt = Math.floor(timestamp / 1000) + lifetime;
    const username = `${expiresAt}:${randomUUID()}`;
    const credential = createHmac('sha1', config.secret).update(username).digest('base64');
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200).end(JSON.stringify({
      expiresAt,
      iceServers: [{
        urls: [
          `turn:${config.host}:3478?transport=udp`,
          `turn:${config.host}:3478?transport=tcp`,
          `turns:${config.host}:443?transport=tcp`,
        ],
        username,
        credential,
      }],
    }));
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = readConfig(process.env);
  const server = createServer({
    cert: readFileSync('/certs/fullchain.pem'),
    key: readFileSync('/certs/privkey.pem'),
    minVersion: 'TLSv1.2',
  }, credentialHandler(config));
  server.on('error', (error) => { console.error('Relay credential server failed:', error); process.exit(1); });
  server.listen(8443, '0.0.0.0', () => console.log('Relay credential server listening on 8443'));
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
}
