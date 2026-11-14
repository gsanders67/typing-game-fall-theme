import { accessSync } from 'node:fs';
import { createGameServer } from './app.ts';
import { readConfig } from './config.ts';

accessSync(new URL('../dist/index.html', import.meta.url));
const config = readConfig(process.env);
const server = createGameServer(config);
server.http.on('error', (error) => { console.error('Game server failed:', error); process.exit(1); });
server.http.listen(config.port, config.host, () => console.log(`Game server listening on ${config.port}${config.basePath || '/'}`));
process.on('SIGTERM', () => { void server.close().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); }); });
