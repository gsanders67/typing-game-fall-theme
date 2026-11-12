import { PeerServer } from 'peer';

PeerServer({ port: 9000, path: '/peer', host: '127.0.0.1', allow_discovery: false });
