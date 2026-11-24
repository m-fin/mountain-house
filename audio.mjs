// Soft original ambient bed: wind (filtered noise) and a quiet two-note pad.
// Starts muted until a user gesture unlocks AudioContext.

export function createAudio() {
  let ctx = null, master, windGain, padGain, started = false, muted = false;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    // Brown-ish noise through a lowpass, slowly wandering filter and gain.
    const bufSize = 2 * ctx.sampleRate;
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bufSize; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 0.7;
    windGain = ctx.createGain();
    windGain.gain.value = 0.18;
    noise.connect(filter);
    filter.connect(windGain);
    windGain.connect(master);
    noise.start();
    // Wander the wind
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    // Quiet pad: C3 and G3 sines, very slow chorus.
    padGain = ctx.createGain();
    padGain.gain.value = 0.035;
    padGain.connect(master);
    for (const [freq, detune] of [[130.81, -3], [196.0, 4], [261.63, 2]]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      o.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = freq < 150 ? 0.5 : 0.28;
      o.connect(g);
      g.connect(padGain);
      o.start();
    }
    return ctx;
  }

  function fadeTo(value, t = 1.6) {
    if (!master) return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(value, now + t);
  }

  return {
    get muted() { return muted; },
    async unlock() {
      const c = ensure();
      if (!c) return;
      try { if (c.state === 'suspended') await c.resume(); } catch { /* */ }
      if (!started && !muted) fadeTo(0.7, 2.2);
      started = true;
    },
    setMuted(v) {
      muted = !!v;
      if (!ctx) return;
      fadeTo(muted ? 0 : 0.7, 0.4);
    },
    toggle() {
      this.setMuted(!muted);
      return muted;
    },
  };
}
