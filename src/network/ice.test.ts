import { afterEach, expect, it, vi } from 'vitest';
import { loadIceServers } from './ice';

afterEach(() => vi.unstubAllGlobals());

const relay = {
  urls: ['turn:relay.example.com:3478', 'turns:relay.example.com:443?transport=tcp'],
  username: 'temporary-user',
  credential: 'temporary-credential',
};
const credentials = () => ({ expiresAt: Math.floor(Date.now() / 1000) + 3600, iceServers: [relay] });

it('keeps direct connections available without a relay endpoint', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  expect(await loadIceServers()).toEqual([{ urls: 'stun:stun.l.google.com:19302' }]);
  expect(fetcher).not.toHaveBeenCalled();
});

it('loads temporary TURN credentials without caching or cookies', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json(credentials()));
  vi.stubGlobal('fetch', fetcher);
  expect(await loadIceServers('https://relay.example.com/ice')).toEqual([
    { urls: 'stun:stun.l.google.com:19302' }, relay,
  ]);
  expect(fetcher).toHaveBeenCalledWith('https://relay.example.com/ice', expect.objectContaining({
    cache: 'no-store', credentials: 'omit', signal: expect.any(AbortSignal),
  }));
});

it('rejects insecure endpoints before requesting credentials', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  await expect(loadIceServers('http://relay.example.com/ice')).rejects.toThrow('must use HTTPS');
  expect(fetcher).not.toHaveBeenCalled();
});

it.each([
  () => new Response('Unavailable', { status: 503 }),
  () => Response.json({ ...credentials(), expiresAt: 1 }),
  () => Response.json({ ...credentials(), iceServers: [{ ...relay, urls: 'stun:relay.example.com' }] }),
  () => Response.json({ iceServers: [{ urls: relay.urls }] }),
])('surfaces invalid or unavailable relay configuration instead of silently falling back', async (response) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()));
  await expect(loadIceServers('https://relay.example.com/ice')).rejects.toThrow('Could not load relay credentials');
});

it('surfaces network failures instead of silently attempting direct-only connections', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network unavailable')));
  await expect(loadIceServers('https://relay.example.com/ice')).rejects.toThrow('Could not load relay credentials');
});
