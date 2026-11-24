// Hearthridge audio: a quiet procedural wind bed under an original scored
// soundtrack. Music starts only after a user gesture unlocks AudioContext.
//
// Buses: master → wind/pad, and master → musicBus (bed + stinger).
// Beds crossfade with equal power. Only porch_sunset and stinger_task are
// preloaded; the rest are fetched on demand (and quietly ahead of time).
// Rain / first snow / spring thaw cues are not shipped until those states exist.
// stinger_save is implemented but only for a future player-facing save —
// do not hook it to the 4-second autosave.

import { insideCabin, INTERACTS } from './game.mjs';

const MUSIC_BASE = './music/';
const MUTE_KEY = 'hearthridge-muted';
const VOL_KEY = 'hearthridge-music-volume';
const DEFAULT_VOL = 0.8;
const MASTER_GAIN = 0.7;

export const BEDS = {
  main_theme: { file: 'main_theme.ogg', loop: false },
  porch_sunset: { file: 'porch_sunset.ogg', loop: true },
  garden_morning: { file: 'garden_morning.ogg', loop: true },
  hearth_night: { file: 'hearth_night.ogg', loop: true },
  fixing_up: { file: 'fixing_up.ogg', loop: true },
  stargazing: { file: 'stargazing.ogg', loop: true },
  together: { file: 'together.ogg', loop: true },
  explore_day: { file: 'explore_day.ogg', loop: true },
  explore_night: { file: 'explore_night.ogg', loop: true },
};

const STINGERS = {
  stinger_task: { file: 'stinger_task.ogg' },
  stinger_save: { file: 'stinger_save.ogg' },
};

const PRELOAD = ['porch_sunset', 'stinger_task'];
const LAZY = [
  'explore_day', 'explore_night', 'hearth_night', 'garden_morning',
  'fixing_up', 'stargazing', 'together', 'main_theme', 'stinger_save',
];

function readFlag(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    if (v == null) return fallback;
    if (key === MUTE_KEY) return v === '1' || v === 'true';
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
  } catch {
    return fallback;
  }
}

function writeFlag(key, value) {
  try { localStorage.setItem(key, String(value)); } catch { /* private mode */ }
}

function nearGarden(state, extra = 0) {
  const p = INTERACTS.plant;
  return Math.hypot(state.player.x - p.x, state.player.z - p.z) <= p.r + extra;
}

function isNight(tod) { return tod < 0.18 || tod > 0.82; }
function isStars(tod) { return tod < 0.18 || tod > 0.92; }
function isSunset(tod) { return tod >= 0.68 && tod < 0.82; }
function isMorning(tod) { return tod >= 0.18 && tod < 0.38; }

/** Pure bed picker. Safe to call from tests without an AudioContext. */
export function chooseBed(state) {
  const tod = state.timeOfDay;
  const { x, z } = state.player;
  const inside = insideCabin(x, z);

  if (state.complete) return 'together';
  if (state.hold && state.near) return 'fixing_up';
  if (inside && state.tasks.fire.lit && isNight(tod)) return 'hearth_night';
  if (!inside && isStars(tod)) return 'stargazing';
  if (isSunset(tod)) return 'porch_sunset';
  if (isMorning(tod) && nearGarden(state, 2.2)) return 'garden_morning';
  if (tod >= 0.18 && tod < 0.68) return 'explore_day';
  return 'explore_night';
}

export function taskSignature(state) {
  const t = state.tasks;
  return [
    t.porch.done ? 1 : 0,
    t.garden.planted ? 1 : 0,
    t.garden.watered ? 1 : 0,
    t.fire.lit ? 1 : 0,
  ].join('');
}

function fadeEqualPower(fromGain, toGain, fromLevel, toLevel, dur, now) {
  const n = 20;
  const down = new Float32Array(n);
  const up = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    down[i] = fromLevel * Math.cos(t * Math.PI / 2);
    up[i] = toLevel * Math.sin(t * Math.PI / 2);
  }
  if (fromGain) {
    fromGain.gain.cancelScheduledValues(now);
    fromGain.gain.setValueAtTime(fromLevel, now);
    fromGain.gain.setValueCurveAtTime(down, now, dur);
  }
  if (toGain) {
    toGain.gain.cancelScheduledValues(now);
    toGain.gain.setValueAtTime(0, now);
    toGain.gain.setValueCurveAtTime(up, now, dur);
  }
}

export function createAudio() {
  let ctx = null, master, windGain, padGain, musicBus, bedBus, stingerBus;
  let started = false;
  let muted = !!readFlag(MUTE_KEY, false);
  let musicVol = readFlag(VOL_KEY, DEFAULT_VOL);
  if (typeof musicVol !== 'number') musicVol = DEFAULT_VOL;

  const raw = new Map();      // name -> ArrayBuffer
  const decoded = new Map();  // name -> AudioBuffer
  const inflight = new Map(); // name -> Promise<ArrayBuffer>
  let currentBed = null;      // { name, source, gain }
  let wantedBed = null;
  let lastSig = null;
  let lazyStarted = false;

  function fileFor(name) {
    return (BEDS[name] || STINGERS[name] || {}).file;
  }

  function fetchRaw(name) {
    if (raw.has(name)) return Promise.resolve(raw.get(name));
    if (inflight.has(name)) return inflight.get(name);
    const file = fileFor(name);
    if (!file) return Promise.reject(new Error('unknown cue ' + name));
    const p = fetch(MUSIC_BASE + file)
      .then((r) => {
        if (!r.ok) throw new Error('music ' + file + ' HTTP ' + r.status);
        return r.arrayBuffer();
      })
      .then((buf) => {
        raw.set(name, buf);
        inflight.delete(name);
        return buf;
      })
      .catch((err) => {
        inflight.delete(name);
        console.warn('[hearthridge audio]', err.message || err);
        throw err;
      });
    inflight.set(name, p);
    return p;
  }

  async function decode(name) {
    const existing = decoded.get(name);
    if (existing) return existing;
    const buf = raw.get(name) || await fetchRaw(name);
    if (!ctx) return null;
    // decodeAudioData may detach the buffer; keep a copy in `raw`.
    const copy = buf.slice(0);
    const audioBuf = await ctx.decodeAudioData(copy);
    decoded.set(name, audioBuf);
    return audioBuf;
  }

  function preload() {
    return Promise.all(PRELOAD.map((n) => fetchRaw(n).catch(() => null)));
  }

  function startLazyLoads() {
    if (lazyStarted) return;
    lazyStarted = true;
    // One at a time so first-play bandwidth stays with the current bed.
    (async () => {
      for (const name of LAZY) {
        try { await fetchRaw(name); } catch { /* already warned */ }
      }
    })();
  }

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
    windGain.gain.value = 0.12;
    noise.connect(filter);
    filter.connect(windGain);
    windGain.connect(master);
    noise.start();
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    // Quiet pad, ducked once scored music is playing so the C-G pad
    // doesn't clash with the D-major soundtrack.
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

    musicBus = ctx.createGain();
    musicBus.gain.value = musicVol;
    musicBus.connect(master);
    bedBus = ctx.createGain();
    bedBus.gain.value = 1;
    bedBus.connect(musicBus);
    stingerBus = ctx.createGain();
    stingerBus.gain.value = 0.95;
    stingerBus.connect(musicBus);

    return ctx;
  }

  function fadeMaster(value, t = 1.6) {
    if (!master) return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(value, now + t);
  }

  function duckBeds(state, bedName) {
    if (!ctx || !windGain) return;
    const inside = state ? insideCabin(state.player.x, state.player.z) : false;
    const night = state ? isNight(state.timeOfDay) : false;
    let wind = 0.12;
    if (inside) wind = bedName === 'hearth_night' ? 0.03 : 0.05;
    else if (night) wind = 0.15;
    const now = ctx.currentTime;
    windGain.gain.cancelScheduledValues(now);
    windGain.gain.setValueAtTime(windGain.gain.value, now);
    windGain.gain.linearRampToValueAtTime(wind, now + 1.2);
    // Duck the old C-G pad under scored music; bring it back if no bed.
    const pad = bedName ? 0.0 : 0.035;
    padGain.gain.cancelScheduledValues(now);
    padGain.gain.setValueAtTime(padGain.gain.value, now);
    padGain.gain.linearRampToValueAtTime(pad, now + 1.2);
  }

  async function setBed(name, fadeSec) {
    if (!ctx) return;
    wantedBed = name;
    if (!name) {
      if (currentBed) {
        const now = ctx.currentTime;
        const dur = fadeSec ?? 3.2;
        const from = currentBed.gain.gain.value;
        fadeEqualPower(currentBed.gain, null, from, 0, dur, now);
        const old = currentBed;
        currentBed = null;
        setTimeout(() => { try { old.source.stop(); } catch { /* */ } }, dur * 1000 + 80);
      }
      return;
    }
    if (currentBed && currentBed.name === name) return;
    let buf;
    try { buf = await decode(name); } catch { return; }
    if (wantedBed !== name || !buf) return;
    if (currentBed && currentBed.name === name) return;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = !!(BEDS[name] && BEDS[name].loop);
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(g);
    g.connect(bedBus);

    const fromFix = currentBed && currentBed.name === 'fixing_up';
    const toFix = name === 'fixing_up';
    const dur = fadeSec ?? ((fromFix || toFix) ? 2.0 : 3.4);
    const now = ctx.currentTime;
    const fromLevel = currentBed ? currentBed.gain.gain.value : 0;
    fadeEqualPower(currentBed ? currentBed.gain : null, g, fromLevel, 1, dur, now);
    src.start();

    if (currentBed) {
      const old = currentBed;
      setTimeout(() => { try { old.source.stop(); } catch { /* */ } }, dur * 1000 + 80);
    }
    currentBed = { name, source: src, gain: g };
    if (!src.loop) {
      src.onended = () => {
        if (currentBed && currentBed.source === src) currentBed = null;
      };
    }
  }

  async function playStinger(name) {
    if (!ctx || muted) return;
    let buf;
    try { buf = await decode(name); } catch { return; }
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = 1;
    src.connect(g);
    g.connect(stingerBus);
    src.start();
  }

  // Kick off the first-load fetches immediately (no AudioContext required).
  preload().then(() => startLazyLoads());

  return {
    get muted() { return muted; },
    get volume() { return musicVol; },
    get currentBed() { return currentBed && currentBed.name; },
    chooseBed,
    async unlock() {
      const c = ensure();
      if (!c) return;
      try { if (c.state === 'suspended') await c.resume(); } catch { /* */ }
      if (!started && !muted) fadeMaster(MASTER_GAIN, 2.2);
      else if (!started && muted) fadeMaster(0, 0.01);
      started = true;
      startLazyLoads();
      // Decode the boot bed so the first setBed is snappy.
      decode('porch_sunset').catch(() => {});
      decode('stinger_task').catch(() => {});
    },
    setMuted(v) {
      muted = !!v;
      writeFlag(MUTE_KEY, muted ? '1' : '0');
      if (!ctx) return;
      fadeMaster(muted ? 0 : MASTER_GAIN, 0.4);
    },
    toggle() {
      this.setMuted(!muted);
      return muted;
    },
    setMusicVolume(v) {
      musicVol = Math.max(0, Math.min(1, Number(v) || 0));
      writeFlag(VOL_KEY, String(musicVol));
      if (musicBus && ctx) {
        const now = ctx.currentTime;
        musicBus.gain.cancelScheduledValues(now);
        musicBus.gain.setValueAtTime(musicBus.gain.value, now);
        musicBus.gain.linearRampToValueAtTime(musicVol, now + 0.15);
      }
    },
    tick(state) {
      if (!started || !ctx || !state) return;
      const want = chooseBed(state);
      duckBeds(state, want);
      if (want && want !== wantedBed) {
        setBed(want);
        fetchRaw(want).catch(() => {});
      }
      const sig = taskSignature(state);
      if (lastSig == null) {
        lastSig = sig;
      } else if (sig !== lastSig) {
        // Any 0→1 bit is a task finishing (player or partner).
        for (let i = 0; i < 4; i++) {
          if (lastSig[i] === '0' && sig[i] === '1') playStinger('stinger_task');
        }
        lastSig = sig;
      }
    },
    playTaskStinger() { return playStinger('stinger_task'); },
    // Only call this from a player-facing save. Never from persist() autosave.
    playSaveStinger() { return playStinger('stinger_save'); },
    prefetch(name) { return fetchRaw(name); },
  };
}
