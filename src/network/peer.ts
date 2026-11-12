import Peer from 'peerjs';

export const peerId = (code: string) => `leaf-type-v1-${code}`;

export function createPeer(id?: string) {
  const options = import.meta.env.VITE_PEER_HOST
    ? {
        host: import.meta.env.VITE_PEER_HOST,
        port: Number(import.meta.env.VITE_PEER_PORT || 9000),
        path: '/peer',
        secure: false,
        config: { iceServers: [] },
      }
    : {};
  return id ? new Peer(id, options) : new Peer(options);
}
