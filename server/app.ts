import { createHmac, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express, { type ErrorRequestHandler } from 'express';

const lifetime = 24 * 60 * 60;

export interface ServerConfig {
  secret: string;
  host: string;
  origin: string;
}

export function readConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const { TURN_SHARED_SECRET: secret, TURN_HOST: host, ALLOWED_ORIGIN: origin } = env;
  if (!secret || !/^[a-f0-9]{64}$/i.test(secret)) throw new Error('TURN_SHARED_SECRET must be 64 hexadecimal characters.');
  if (!host || host.length > 253 || !host.includes('.') ||
    !host.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) {
    throw new Error('TURN_HOST must be a public DNS hostname without a scheme or port.');
  }
  if (!origin) throw new Error('ALLOWED_ORIGIN is required.');
  const url = new URL(origin);
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.origin !== origin || (url.protocol !== 'https:' && !localHttp)) {
    throw new Error('ALLOWED_ORIGIN must be an HTTPS origin without a path (HTTP is allowed only on localhost).');
  }
  return { secret, host, origin };
}

export function createApp(config: ServerConfig, options: { now?: () => number; staticDir?: string } = {}) {
  const app = express();
  const now = options.now ?? Date.now;
  const staticDir = options.staticDir ?? fileURLToPath(new URL('../dist/', import.meta.url));
  const originHost = new URL(config.origin).host;
  let windowStart = now();
  let requests = 0;
  app.disable('x-powered-by');
  app.use((_req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); next(); });
  app.get('/health', (_req, res) => { res.setHeader('Cache-Control', 'no-store'); res.send('ok'); });
  app.all('/api/ice', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.vary('Origin');
    const origin = req.get('Origin');
    const sameOrigin = !origin && req.get('Sec-Fetch-Site') === 'same-origin' && req.get('Host') === originHost;
    if (origin !== config.origin && !sameOrigin) { res.status(403).send('Origin not allowed'); return; }
    if (origin) res.setHeader('Access-Control-Allow-Origin', config.origin);
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET');
      res.status(204).end();
      return;
    }
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET, OPTIONS'); res.status(405).send('Method not allowed'); return; }
    const timestamp = now();
    if (timestamp - windowStart >= 60000) { windowStart = timestamp; requests = 0; }
    if (++requests > 120) {
      res.setHeader('Retry-After', '60');
      res.status(429).send('Too many credential requests; retry in one minute.');
      return;
    }
    const expiresAt = Math.floor(timestamp / 1000) + lifetime;
    const username = `${expiresAt}:${randomUUID()}`;
    const credential = createHmac('sha1', config.secret).update(username).digest('base64');
    res.json({
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
    });
  });
  app.use(express.static(staticDir, { dotfiles: 'deny', etag: true, maxAge: 0 }));
  app.use((_req, res) => { res.status(404).send('Not found'); });
  const onError: ErrorRequestHandler = (error: unknown, _req, res, next) => {
    console.error('Game server request failed:', error);
    if (res.headersSent) { next(error); return; }
    res.status(500).send('Server error');
  };
  app.use(onError);
  return app;
}
