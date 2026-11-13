import { z } from 'zod';

const iceUrl = z.string().regex(/^(stun|stuns|turn|turns):[^\s]+$/);
const credentialsSchema = z.object({
  expiresAt: z.number().int().positive(),
  iceServers: z.array(z.object({
    urls: z.union([iceUrl, z.array(iceUrl).min(1)]),
    username: z.string().min(1),
    credential: z.string().min(1),
  })).min(1),
});

export async function loadIceServers(endpoint?: string): Promise<RTCIceServer[]> {
  const stun = { urls: 'stun:stun.l.google.com:19302' };
  if (!endpoint) return [stun];
  if (new URL(endpoint).protocol !== 'https:') throw new Error('The relay credentials URL must use HTTPS.');
  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(10000), cache: 'no-store', credentials: 'omit' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = credentialsSchema.parse(await response.json());
    if (result.expiresAt <= Date.now() / 1000 + 60) throw new Error('Relay credentials have expired or expire too soon.');
    if (!result.iceServers.some((server) =>
      [server.urls].flat().some((url) => /^turns?:/.test(url)))) throw new Error('No TURN relay was returned.');
    return [stun, ...result.iceServers];
  } catch (error) {
    throw new Error('Could not load relay credentials. Ask the presenter to check the relay service.', { cause: error });
  }
}
