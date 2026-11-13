import { expect, test } from '@playwright/test';

for (const transport of ['udp', 'tls'] as const) {
  test(`self-hosted TURN delivers relay-only data over ${transport}`, async ({ page }) => {
    test.skip(!process.env.RELAY_PREFLIGHT_URL, 'Opt-in test requires a deployed VPS and trusted certificates.');
    test.setTimeout(90000);
    const endpoint = process.env.RELAY_PREFLIGHT_URL!;
    await page.goto(new URL(endpoint).origin);
    const result = await page.evaluate(async ({ endpoint, transport }) => {
      const response = await fetch(endpoint, { cache: 'no-store', credentials: 'omit' });
      if (!response.ok) throw new Error(`Relay credentials request failed: HTTP ${response.status}`);
      const { iceServers } = await response.json() as { iceServers: RTCIceServer[] };
      const selected = iceServers.flatMap((server) => {
        const urls = [server.urls].flat().filter((url) => transport === 'tls'
          ? url.startsWith('turns:') : url.startsWith('turn:') && url.includes('transport=udp'));
        return urls.length ? [{ ...server, urls }] : [];
      });
      if (!selected.length) throw new Error(`No ${transport} TURN URL was returned.`);
      const a = new RTCPeerConnection({ iceServers: selected, iceTransportPolicy: 'relay' });
      const b = new RTCPeerConnection({ iceServers: selected, iceTransportPolicy: 'relay' });
      let deliveryTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        const channel = a.createDataChannel('relay-preflight');
        b.ondatachannel = ({ channel }) => { channel.onmessage = ({ data }) => channel.send(data); };
        channel.onopen = () => channel.send('relay-preflight-ok');
        let received = false;
        channel.onmessage = ({ data }) => { received = data === 'relay-preflight-ok'; };
        async function gather(peer: RTCPeerConnection, description: RTCSessionDescriptionInit) {
          await peer.setLocalDescription(description);
          if (peer.iceGatheringState === 'complete') return;
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('TURN candidate gathering timed out.')), 20000);
            peer.onicegatheringstatechange = () => {
              if (peer.iceGatheringState === 'complete') { clearTimeout(timeout); resolve(); }
            };
          });
        }
        await gather(a, await a.createOffer());
        await b.setRemoteDescription(a.localDescription!);
        await gather(b, await b.createAnswer());
        await a.setRemoteDescription(b.localDescription!);
        await new Promise<void>((resolve, reject) => {
          const started = Date.now();
          const check = () => {
            if (received) { resolve(); return; }
            if (Date.now() - started >= 20000) { reject(new Error('Relay-only data delivery timed out.')); return; }
            deliveryTimer = setTimeout(check, 100);
          };
          check();
        });
        const stats = await a.getStats();
        const active = [...stats.values()].find((item) => item.type === 'transport' && item.selectedCandidatePairId);
        const pair = active && stats.get(active.selectedCandidatePairId);
        return {
          received,
          localType: pair && stats.get(pair.localCandidateId)?.candidateType,
          remoteType: pair && stats.get(pair.remoteCandidateId)?.candidateType,
        };
      } finally { clearTimeout(deliveryTimer); a.close(); b.close(); }
    }, { endpoint, transport });
    expect(result).toEqual({ received: true, localType: 'relay', remoteType: 'relay' });
  });
}
