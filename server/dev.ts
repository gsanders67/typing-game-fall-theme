import { createServer } from 'vite';
import { createGameServer } from './app.ts';
import { readConfig } from './config.ts';
import { roomMetadataPlugin } from './metadata.ts';

const vite = await createServer({ plugins: [roomMetadataPlugin], server: { middlewareMode: true } });
const config = readConfig({ ...process.env, PORT: process.env.PORT || process.env.PLAYWRIGHT_PORT || '5173' });
const server = createGameServer(config, undefined, (req, res, next) => vite.middlewares(req, res, next));
server.http.on('error', (error) => { console.error('Development server failed:', error); process.exit(1); });
server.http.listen(config.port, config.host, () => console.log(`Development server: http://localhost:${config.port}`));
process.on('SIGTERM', () => { void Promise.all([vite.close(), server.close()]).then(() => process.exit(0)); });
