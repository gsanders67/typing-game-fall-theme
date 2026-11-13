import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import { attachRooms } from './rooms.ts';
import type { ServerConfig } from './config.ts';

const escapeHtml = (value: string) => value.replace(/[&"<>]/g, (char) =>
  ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[char]!);

export function createGameServer(
  config: ServerConfig,
  staticDir = fileURLToPath(new URL('../dist/', import.meta.url)),
  development?: RequestHandler,
) {
  const app = express();
  const router = express.Router();
  app.disable('x-powered-by');
  app.enable('strict routing');
  if (development) app.use(development);
  app.use((_req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); next(); });
  app.get('/health', (_req, res) => { res.setHeader('Cache-Control', 'no-store'); res.send('ok'); });
  if (config.basePath) app.get(config.basePath, (req, res) => res.redirect(308, `${config.basePath}/${new URL(req.originalUrl, 'http://localhost').search}`));
  router.get('/health', (_req, res) => { res.setHeader('Cache-Control', 'no-store'); res.send('ok'); });
  router.get(['/', '/index.html'], async (_req, res) => {
    const html = await readFile(join(staticDir, 'index.html'), 'utf8');
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(html.replace('<head>', `<head><base href="${escapeHtml(config.basePath)}/">`));
  });
  router.use(express.static(staticDir, { index: false, dotfiles: 'deny', maxAge: 0 }));
  app.use(config.basePath || '/', router);
  app.use((_req, res) => { res.status(404).send('Not found'); });
  const onError: ErrorRequestHandler = (error: unknown, _req, res, next) => {
    console.error('Game server request failed:', error);
    if (res.headersSent) { next(error); return; }
    res.status(500).send('Game server error.');
  };
  app.use(onError);
  const http = createServer(app);
  const io = attachRooms(http, config);
  return { http, io, close: () => new Promise<void>((resolve, reject) => io.close((error?: Error) => error ? reject(error) : resolve())) };
}
