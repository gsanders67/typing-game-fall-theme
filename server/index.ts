import { readFileSync, accessSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { createApp, readConfig } from './app.ts';

const config = readConfig(process.env);
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
const { TLS_CERT_FILE: cert, TLS_KEY_FILE: key } = process.env;
if (!!cert !== !!key) throw new Error('Set both TLS_CERT_FILE and TLS_KEY_FILE, or neither.');
accessSync(new URL('../dist/index.html', import.meta.url));
const app = createApp(config);
const server = cert && key
  ? createHttpsServer({ cert: readFileSync(cert), key: readFileSync(key), minVersion: 'TLSv1.2' }, app)
  : createHttpServer(app);
server.on('error', (error) => { console.error('Game server failed:', error); process.exit(1); });
server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Game server listening on port ${port}`));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
