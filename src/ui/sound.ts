let audio: AudioContext | undefined;
function context() { audio ??= new AudioContext(); return audio; }
export function playTone(kind: 'clear' | 'miss' | 'win', volume: number) {
  if (!volume) return;
  const sound = context();
  void sound.resume().then(() => {
    const notes = kind === 'win' ? [523, 659, 784, 1047] : kind === 'clear' ? [660, 880] : [220, 147];
    notes.forEach((frequency, index) => {
      const oscillator = sound.createOscillator();
      const gain = sound.createGain();
      const start = sound.currentTime + index * 0.09;
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume * 0.08, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.16);
      oscillator.connect(gain); gain.connect(sound.destination);
      oscillator.start(start); oscillator.stop(start + 0.18);
    });
  }).catch((error: unknown) => console.error('Audio playback failed:', error));
}
export function ambientMusic(volume: number): () => void {
  const sound = context();
  let step = 0;
  const notes = [261.63, 329.63, 392, 440, 392, 329.63, 293.66, 196];
  const active = new Set<OscillatorNode>();
  const tick = () => {
    const oscillator = sound.createOscillator();
    const gain = sound.createGain();
    const start = sound.currentTime;
    oscillator.type = 'sine';
    oscillator.frequency.value = notes[step++ % notes.length];
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume * 0.025, start + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.8);
    oscillator.connect(gain); gain.connect(sound.destination);
    active.add(oscillator);
    oscillator.onended = () => { active.delete(oscillator); gain.disconnect(); oscillator.disconnect(); };
    oscillator.start(start); oscillator.stop(start + 0.85);
  };
  void sound.resume().catch((error: unknown) => console.error('Music playback failed:', error));
  tick();
  const timer = setInterval(tick, 900);
  return () => { clearInterval(timer); for (const oscillator of active) oscillator.stop(); };
}
