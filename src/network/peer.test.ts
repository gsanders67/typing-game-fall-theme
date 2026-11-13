import Peer from 'peerjs';
import { afterEach, expect, it, vi } from 'vitest';
import { createPeer } from './peer';

vi.mock('peerjs', () => ({ default: vi.fn(function () { return {}; }) }));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('keeps the local signaling tests independent of the deployed relay', async () => {
  vi.stubEnv('VITE_PEER_HOST', '127.0.0.1');
  vi.stubEnv('VITE_PEER_PORT', '9000');
  vi.stubEnv('VITE_ICE_SERVERS_URL', 'https://ice.example.com/ice');
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  await createPeer('test-host');
  expect(fetcher).not.toHaveBeenCalled();
  expect(Peer).toHaveBeenCalledWith('test-host', expect.objectContaining({ config: { iceServers: [] } }));
});

it('passes fetched relay credentials into PeerJS for hosts and players', async () => {
  vi.stubEnv('VITE_PEER_HOST', '');
  vi.stubEnv('VITE_ICE_SERVERS_URL', 'https://ice.example.com/ice');
  const relay = { urls: 'turns:turn.example.com:443', username: 'temporary', credential: 'temporary' };
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => Response.json({
    expiresAt: Math.floor(Date.now() / 1000) + 3600, iceServers: [relay],
  })));
  await createPeer('host');
  await createPeer();
  const options = { config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, relay] } };
  expect(Peer).toHaveBeenNthCalledWith(1, 'host', options);
  expect(Peer).toHaveBeenNthCalledWith(2, options);
});

it('does not open signaling when configured relay credentials cannot be loaded', async () => {
  vi.stubEnv('VITE_PEER_HOST', '');
  vi.stubEnv('VITE_ICE_SERVERS_URL', 'https://ice.example.com/ice');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
  await expect(createPeer()).rejects.toThrow('Could not load relay credentials');
  expect(Peer).not.toHaveBeenCalled();
});
