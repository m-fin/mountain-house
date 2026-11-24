// Hearthridge simulation: walking, tasks, partner, and localStorage save.
// No rendering here, so tests and the page can share the same state.

export const SAVE_KEY = 'mountain-house-v1';
export const TITLE = 'Hearthridge';

export const TASKS = {
  porch: { label: 'Porch board', verb: 'Repair the porch board' },
  garden: { label: 'Garden', verb: 'Tend the garden' },
  fire: { label: 'Hearth', verb: 'Light the fireplace' },
};

// Playable walk bounds and the flattened cabin terrace.
export const BOUNDS = { minX: -28, maxX: 28, minZ: -24, maxZ: 32 };

const PLAYER_R = 0.32;
const WALK_SPEED = 2.65;
const PARTNER_SPEED = 1.35;
const INTERACT_HOLD = 1.15;
const GARDEN_GROW_S = 90; // seconds after watering to full bloom
const DAY_LENGTH = 480; // 8 minutes for a full day-night cycle
const SAVE_EVERY = 4;

// Default late-afternoon, heading into sunset — the first view should glow.
export const DEFAULT_TOD = 0.73;

const CLAMP = (v, a, b) => Math.max(a, Math.min(b, v));

export function heightAt(x, z) {
  // Flat pad around the cabin and porch, then a downhill valley (+Z)
  // and a gentle climb into the pines behind the house (-Z).
  const ax = Math.abs(x), azp = Math.abs(z + 0.4);
  const pad = Math.max(ax / 8.2, azp / 7.2);
  const t = CLAMP((pad - 0.72) / 0.55, 0, 1);
  const s = t * t * (3 - 2 * t);
  const valley = z > 3 ? -0.11 * (z - 3) - 0.012 * Math.max(0, z - 10) * (z - 10) : 0;
  const rise = z < -4 ? -0.13 * (z + 4) : 0;
  const ripple =
    0.42 * Math.sin(x * 0.071 + 0.4) * Math.sin(z * 0.054) +
    0.22 * Math.sin(x * 0.19 + z * 0.11) +
    0.15 * Math.sin(x * 0.31 - z * 0.07);
  const dip = z > 12 ? -0.04 * (z - 12) : 0;
  return (valley + rise + ripple + dip) * s;
}

export function insideCabin(x, z) {
  return x > -3.55 && x < 3.55 && z > -3.35 && z < 2.85;
}

export function onPorch(x, z) {
  return x > -4.1 && x < 4.1 && z > 2.7 && z < 5.35 && !insideCabin(x, z);
}

function floorY(x, z) {
  if (insideCabin(x, z) || onPorch(x, z)) return 0.05;
  return heightAt(x, z);
}

export function defaultState() {
  return {
    player: { x: 0.2, z: 6.2, yaw: 0, vyaw: 0, pitch: -0.12, speed: 0, bob: 0 },
    partner: { x: 2.4, z: 4.6, yaw: -0.6, speed: 0, bob: 0, mood: 'wander', timer: 2, help: '' },
    cam: { yaw: 0, pitch: -0.18 },
    timeOfDay: DEFAULT_TOD, // 0 midnight, 0.25 dawn, 0.5 noon, 0.75 sunset
    tasks: {
      porch: { done: false, progress: 0 },
      garden: { planted: false, watered: false, growth: 0, progress: 0 },
      fire: { lit: false, progress: 0 },
    },
    near: null,
    toast: '',
    toastT: 0,
    hold: 0,
    savedAt: 0,
    clock: 0,
    complete: false,
    _saveAcc: 0,
  };
}

export function timePreset(name) {
  const map = { night: 0.08, dawn: 0.26, day: 0.5, noon: 0.5, sunset: 0.73, dusk: 0.8 };
  return map[String(name || '').toLowerCase()] ?? null;
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function applySave(state, data) {
  if (!data) return state;
  if (data.player) Object.assign(state.player, data.player);
  if (data.partner) Object.assign(state.partner, { help: '', timer: 1.5, ...data.partner });
  if (typeof data.timeOfDay === 'number') state.timeOfDay = data.timeOfDay;
  if (data.tasks) {
    if (data.tasks.porch) Object.assign(state.tasks.porch, data.tasks.porch);
    if (data.tasks.garden) Object.assign(state.tasks.garden, data.tasks.garden);
    if (data.tasks.fire) Object.assign(state.tasks.fire, data.tasks.fire);
  }
  if (data.cam) Object.assign(state.cam, data.cam);
  state.complete = allDone(state);
  state.savedAt = data.savedAt || 0;
  return state;
}

export function serialize(state) {
  return {
    v: 1,
    savedAt: Date.now(),
    player: { x: state.player.x, z: state.player.z, yaw: state.player.yaw, pitch: state.player.pitch },
    partner: { x: state.partner.x, z: state.partner.z, yaw: state.partner.yaw },
    cam: { yaw: state.cam.yaw, pitch: state.cam.pitch },
    timeOfDay: state.timeOfDay,
    tasks: {
      porch: { done: state.tasks.porch.done, progress: 0 },
      garden: {
        planted: state.tasks.garden.planted,
        watered: state.tasks.garden.watered,
        growth: state.tasks.garden.growth,
        progress: 0,
      },
      fire: { lit: state.tasks.fire.lit, progress: 0 },
    },
  };
}

export function persist(state) {
  try {
    const data = serialize(state);
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    state.savedAt = data.savedAt;
  } catch { /* private mode or quota — ignore */ }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* */ }
}

export function allDone(state) {
  const g = state.tasks.garden;
  return !!(state.tasks.porch.done && g.planted && g.watered && state.tasks.fire.lit);
}

export const INTERACTS = {
  porch: { x: -1.15, z: 4.15, r: 1.35 },
  plant: { x: 6.15, z: 3.1, r: 1.7 },
  water: { x: 6.15, z: 3.1, r: 1.7 },
  fire: { x: 0.0, z: -2.55, r: 1.45 },
};

export function currentInteract(state) {
  const { x, z } = state.player;
  const t = state.tasks;
  const near = (id) => {
    const p = INTERACTS[id === 'plant' || id === 'water' ? id : id];
    const d = Math.hypot(x - p.x, z - p.z);
    return d <= p.r;
  };
  if (!t.porch.done && near('porch')) return 'porch';
  if (!t.garden.planted && near('plant')) return 'plant';
  if (t.garden.planted && !t.garden.watered && near('water')) return 'water';
  if (!t.fire.lit && near('fire')) return 'fire';
  return null;
}

function promptFor(id, state) {
  if (id === 'porch') return 'Hold to repair the porch board';
  if (id === 'plant') return 'Hold to plant the garden bed';
  if (id === 'water') return 'Hold to water the seeds';
  if (id === 'fire') return 'Hold to light the fireplace';
  if (state.complete) return 'The house feels like yours now';
  return '';
}

export function toast(state, msg) {
  state.toast = msg;
  state.toastT = 3.2;
}

function finish(state, id) {
  if (id === 'porch') {
    state.tasks.porch.done = true;
    state.tasks.porch.progress = 1;
    toast(state, 'The porch board sits flush again.');
  } else if (id === 'plant') {
    state.tasks.garden.planted = true;
    state.tasks.garden.progress = 0;
    toast(state, 'Seeds tucked into the soil.');
  } else if (id === 'water') {
    state.tasks.garden.watered = true;
    state.tasks.garden.progress = 0;
    toast(state, 'The garden drinks it in.');
  } else if (id === 'fire') {
    state.tasks.fire.lit = true;
    state.tasks.fire.progress = 1;
    toast(state, 'The hearth catches. The room warms.');
  }
  if (allDone(state) && !state.complete) {
    state.complete = true;
    // A second, later toast once the first fades — set a delayed flag via clock.
    state._completeAt = state.clock + 3.4;
  }
  persist(state);
}

export function resolveInteract(id, state, amount) {
  const t = state.tasks;
  if (id === 'porch' && !t.porch.done) {
    t.porch.progress = CLAMP(t.porch.progress + amount, 0, 1);
    if (t.porch.progress >= 1) finish(state, 'porch');
  } else if (id === 'plant' && !t.garden.planted) {
    t.garden.progress = CLAMP(t.garden.progress + amount, 0, 1);
    if (t.garden.progress >= 1) finish(state, 'plant');
  } else if (id === 'water' && t.garden.planted && !t.garden.watered) {
    t.garden.progress = CLAMP(t.garden.progress + amount, 0, 1);
    if (t.garden.progress >= 1) finish(state, 'water');
  } else if (id === 'fire' && !t.fire.lit) {
    t.fire.progress = CLAMP(t.fire.progress + amount, 0, 1);
    if (t.fire.progress >= 1) finish(state, 'fire');
  }
}

// Axis-aligned boxes and tree trunks from the world. Set by buildWorld.
export const colliders = { boxes: [], trunks: [] };

export function setColliders(boxes, trunks) {
  colliders.boxes = boxes;
  colliders.trunks = trunks;
}

function overlapCircleBox(x, z, r, b) {
  const qx = CLAMP(x, b.minX, b.maxX);
  const qz = CLAMP(z, b.minZ, b.maxZ);
  const dx = x - qx, dz = z - qz;
  return dx * dx + dz * dz < r * r;
}

function resolvePos(x, z, r) {
  x = CLAMP(x, BOUNDS.minX + 0.8, BOUNDS.maxX - 0.8);
  z = CLAMP(z, BOUNDS.minZ + 0.8, BOUNDS.maxZ - 0.8);
  for (let n = 0; n < 3; n++) {
    for (const b of colliders.boxes) {
      if (!overlapCircleBox(x, z, r, b)) continue;
      const cx = CLAMP(x, b.minX, b.maxX);
      const cz = CLAMP(z, b.minZ, b.maxZ);
      let dx = x - cx, dz = z - cz;
      if (dx === 0 && dz === 0) {
        const left = Math.abs(x - b.minX), right = Math.abs(b.maxX - x);
        const back = Math.abs(z - b.minZ), front = Math.abs(b.maxZ - z);
        const m = Math.min(left, right, back, front);
        if (m === left) x = b.minX - r;
        else if (m === right) x = b.maxX + r;
        else if (m === back) z = b.minZ - r;
        else z = b.maxZ + r;
        continue;
      }
      const d = Math.hypot(dx, dz) || 1e-6;
      const push = (r - d) + 0.001;
      x += (dx / d) * push;
      z += (dz / d) * push;
    }
    for (const t of colliders.trunks) {
      const dx = x - t.x, dz = z - t.z;
      const d = Math.hypot(dx, dz);
      const need = r + t.r;
      if (d < need && d > 1e-5) {
        const push = (need - d) / d;
        x += dx * push;
        z += dz * push;
      }
    }
  }
  return { x, z };
}

export function groundY(x, z) {
  return floorY(x, z);
}

function moveBody(body, vx, vz, dt, radius) {
  const next = resolvePos(body.x + vx * dt, body.z + vz * dt, radius);
  const dist = Math.hypot(next.x - body.x, next.z - body.z);
  body.x = next.x;
  body.z = next.z;
  body.speed = dist / Math.max(dt, 1e-4);
  if (body.speed > 0.15) {
    body.bob += body.speed * dt * 8.5;
    const want = Math.atan2(vx, vz);
    let d = want - body.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    body.yaw += d * CLAMP(dt * 8, 0, 1);
  } else {
    body.speed = 0;
    body.bob *= Math.max(0, 1 - dt * 4);
  }
}

function stepPartner(state, dt) {
  const p = state.partner;
  const you = state.player;
  p.timer -= dt;
  const g = state.tasks.garden;

  // Help: if seeds are in and dry, walk over and water them.
  if (g.planted && !g.watered && p.mood !== 'water') {
    p.mood = 'water';
    p.timer = 8;
    p.help = "I'll water these.";
  }

  if (p.mood === 'water') {
    const tx = 6.15, tz = 3.1;
    const dx = tx - p.x, dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.55) {
      moveBody(p, (dx / d) * PARTNER_SPEED, (dz / d) * PARTNER_SPEED, dt, PLAYER_R);
    } else {
      p.speed = 0;
      if (!g.watered) {
        g.progress = CLAMP(g.progress + dt / 1.6, 0, 1);
        if (g.progress >= 1) {
          finish(state, 'water');
          p.help = 'There. They will like the sun.';
          p.mood = 'watch';
          p.timer = 4;
        }
      }
    }
    return;
  }

  if (p.mood === 'watch') {
    const dx = you.x - p.x, dz = you.z - p.z;
    if (Math.hypot(dx, dz) > 0.2) p.yaw += Math.atan2(dx, dz) * 0; // face player softly
    const want = Math.atan2(dx, dz);
    let ang = want - p.yaw;
    while (ang > Math.PI) ang -= Math.PI * 2;
    while (ang < -Math.PI) ang += Math.PI * 2;
    p.yaw += ang * CLAMP(dt * 3, 0, 1);
    p.speed = 0;
    if (p.timer <= 0) { p.mood = 'wander'; p.help = ''; p.timer = 2 + Math.random() * 4; }
    return;
  }

  // Sit by the fire once it's lit, sometimes.
  if (state.tasks.fire.lit && p.mood !== 'hearth' && Math.random() < dt * 0.08) {
    p.mood = 'hearth';
    p.timer = 8 + Math.random() * 8;
    p.help = '';
  }
  if (p.mood === 'hearth') {
    const tx = 0.85, tz = -1.4;
    const dx = tx - p.x, dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.4) moveBody(p, (dx / d) * PARTNER_SPEED, (dz / d) * PARTNER_SPEED, dt, PLAYER_R);
    else p.speed = 0;
    if (p.timer <= 0) { p.mood = 'wander'; p.timer = 3; }
    return;
  }

  // Wander between cozy spots, or stroll near the player now and then.
  if (p.timer <= 0 || p.mood !== 'wander') {
    const spots = [
      [2.6, 4.8], [-2.4, 5.0], [6.0, 5.4], [-5.2, 3.2],
      [0.4, 8.5], [4.8, 1.2], [-1.2, 2.0], [1.6, -1.0],
    ];
    if (Math.random() < 0.25) spots.push([you.x + 1.4, you.z + 0.6]);
    const s = spots[(Math.random() * spots.length) | 0];
    p._tx = s[0]; p._tz = s[1];
    p.mood = 'wander';
    p.timer = 5 + Math.random() * 6;
    p.help = '';
  }
  const tx = p._tx ?? 2.6, tz = p._tz ?? 4.8;
  const dx = tx - p.x, dz = tz - p.z;
  const d = Math.hypot(dx, dz);
  if (d > 0.5) moveBody(p, (dx / d) * PARTNER_SPEED, (dz / d) * PARTNER_SPEED, dt, PLAYER_R);
  else p.speed = 0;
}

export function step(state, input, dt) {
  dt = CLAMP(dt, 0, 0.05);
  state.clock += dt;

  // Look
  state.cam.yaw += input.lookX || 0;
  state.cam.pitch = CLAMP(state.cam.pitch + (input.lookY || 0), -0.85, 0.45);

  // Walk in camera space (W is into the look direction on XZ).
  const mx = input.mx || 0, mz = input.mz || 0;
  const mag = Math.hypot(mx, mz);
  let vx = 0, vz = 0;
  if (mag > 0.04) {
    const m = Math.min(1, mag);
    const yaw = state.cam.yaw;
    const fwdX = Math.sin(yaw), fwdZ = Math.cos(yaw);
    const rightX = Math.cos(yaw), rightZ = -Math.sin(yaw);
    vx = (rightX * mx + fwdX * mz) / mag * m * WALK_SPEED;
    vz = (rightZ * mx + fwdZ * mz) / mag * m * WALK_SPEED;
  }
  moveBody(state.player, vx, vz, dt, PLAYER_R);
  // Face the walk direction, otherwise ease toward the camera yaw.
  if (state.player.speed < 0.2) {
    let d = state.cam.yaw - state.player.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    state.player.yaw += d * CLAMP(dt * 1.8, 0, 1);
  }

  // Tasks
  const near = currentInteract(state);
  state.near = near;
  if (near && input.use) {
    resolveInteract(near, state, dt / INTERACT_HOLD);
    state.hold = 1;
  } else {
    // Decay unfinished holds so a bump doesn't finish a task later.
    if (near === 'porch' && !state.tasks.porch.done) state.tasks.porch.progress *= Math.max(0, 1 - dt * 1.2);
    if (near === 'plant' && !state.tasks.garden.planted) state.tasks.garden.progress *= Math.max(0, 1 - dt * 1.2);
    if (near === 'water' && !state.tasks.garden.watered) state.tasks.garden.progress *= Math.max(0, 1 - dt * 1.2);
    if (near === 'fire' && !state.tasks.fire.lit) state.tasks.fire.progress *= Math.max(0, 1 - dt * 1.2);
    if (!input.use) state.hold = 0;
  }

  // Garden grows in real time after watering.
  if (state.tasks.garden.watered && state.tasks.garden.growth < 1) {
    const dayBoost = dayFactor(state.timeOfDay) > 0.25 ? 1.15 : 0.65;
    state.tasks.garden.growth = CLAMP(state.tasks.garden.growth + (dt * dayBoost) / GARDEN_GROW_S, 0, 1);
  }

  stepPartner(state, dt);

  if (input.paused) { /* sky still moves a little */ }
  if (!input.freezeTime) state.timeOfDay = (state.timeOfDay + dt / DAY_LENGTH) % 1;

  if (state.toastT > 0) {
    state.toastT -= dt;
    if (state.toastT <= 0) state.toast = '';
  }
  if (state._completeAt && state.clock >= state._completeAt) {
    toast(state, 'The house feels like yours now.');
    state._completeAt = 0;
  }

  state._saveAcc = (state._saveAcc || 0) + dt;
  if (state._saveAcc >= SAVE_EVERY) {
    state._saveAcc = 0;
    persist(state);
  }

  return state;
}

// 0 at night, 1 at midday. Used for lighting and plant growth.
export function dayFactor(tod) {
  // tod 0–1, sunrise ~0.22, sunset ~0.78
  const ang = (tod - 0.25) * Math.PI * 2; // 0 at dawn, pi at dusk? 
  // sin of sun elevation: peak at 0.5
  const elev = Math.sin((tod - 0.22) / 0.56 * Math.PI);
  return CLAMP(elev, 0, 1);
}

export function sunDir(tod) {
  // Sun travels east (+X) at dawn, overhead-ish south, west (-X) at dusk.
  const t = (tod - 0.22) / 0.56; // 0 dawn, 1 dusk
  const a = CLAMP(t, -0.15, 1.15) * Math.PI;
  const y = Math.sin(a);
  const x = -Math.cos(a);
  const z = 0.35 + 0.2 * Math.cos(a);
  const len = Math.hypot(x, y, z) || 1;
  return { x: x / len, y: y / len, z: z / len };
}

export function taskPrompt(state) {
  return promptFor(state.near, state);
}

export function taskProgress(state) {
  const id = state.near;
  if (!id) return 0;
  if (id === 'porch') return state.tasks.porch.progress;
  if (id === 'plant' || id === 'water') return state.tasks.garden.progress;
  if (id === 'fire') return state.tasks.fire.progress;
  return 0;
}

export function hudLines(state) {
  const t = state.tasks;
  const porch = t.porch.done ? 'fixed' : 'to repair';
  const garden = !t.garden.planted ? 'to plant' : (!t.garden.watered ? 'to water' : (t.garden.growth >= 1 ? 'in bloom' : 'growing'));
  const fire = t.fire.lit ? 'lit' : 'unlit';
  return [
    `Porch   ·  ${porch}`,
    `Garden  ·  ${garden}`,
    `Hearth  ·  ${fire}`,
  ];
}
