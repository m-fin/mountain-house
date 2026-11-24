// Renderer, sky, lighting, characters, and visual task updates.
import * as THREE from './vendor/three.module.js';
import { buildWorld, makePerson } from './world.mjs';
import { groundY, dayFactor, sunDir, insideCabin } from './game.mjs';

const CAM_DIST = 5.1;
const CAM_HEIGHT = 2.15;
const CAM_LOOK = 1.15;

export function createRenderer(canvas, width, height, opts = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: opts.antialias !== false,
    powerPreference: 'high-performance',
    alpha: false,
    preserveDrawingBuffer: !!opts.preserveDrawingBuffer,
  });
  renderer.setPixelRatio(Math.min(opts.pixelRatio || devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x87a0c0, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x9ab4c8, 0.014);

  const camera = new THREE.PerspectiveCamera(52, width / height, 0.12, 220);
  camera.position.set(0, 4.2, 11);

  const world = buildWorld();
  scene.add(world.group);

  const rowan = makePerson('rowan');
  const lark = makePerson('lark');
  scene.add(rowan, lark);

  const sky = makeSky();
  scene.add(sky.mesh);
  scene.add(sky.sun);
  scene.add(sky.stars);

  const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x3d4a32, 0.7);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe6c0, 1.1);
  sun.position.set(12, 20, 8);
  scene.add(sun);
  const fill = new THREE.AmbientLight(0x6a7a90, 0.25);
  scene.add(fill);
  const cabinWarm = new THREE.PointLight(0xffc07a, 0.15, 10, 2);
  cabinWarm.position.set(0, 1.8, 0);
  scene.add(cabinWarm);

  const fireflies = makeFireflies();
  scene.add(fireflies);

  const smoke = makeSmoke(world.refs.chimney);
  scene.add(smoke);

  const partnerLabel = makeLabel();
  scene.add(partnerLabel);

  const camPos = new THREE.Vector3();
  const camTarget = new THREE.Vector3();
  const look = new THREE.Vector3();
  const desired = new THREE.Vector3();

  const api = {
    renderer, scene, camera, world, rowan, lark, sky,
    resize(w, h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    setPixelRatio(r) {
      renderer.setPixelRatio(Math.min(r, 2));
    },
    update(state, dt) {
      updatePeople(rowan, lark, state, dt);
      updateSky(sky, hemi, sun, fill, scene, renderer, world.refs, cabinWarm, state);
      updateTasks(world.refs, state, dt);
      updateFireflies(fireflies, state, dt);
      updateSmoke(smoke, state, dt);
      updateLabel(partnerLabel, lark, state);
      updateCamera(camera, state, camPos, camTarget, look, desired, dt);
    },
    snapCamera(state) {
      snapCam(camera, state, camPos, camTarget);
    },
    render() {
      renderer.render(scene, camera);
    },
  };
  return api;
}

function updatePeople(rowan, lark, state, dt) {
  placePerson(rowan, state.player);
  placePerson(lark, state.partner);
  swingLimbs(rowan, state.player, dt);
  swingLimbs(lark, state.partner, dt);
}

function placePerson(mesh, body) {
  const y = groundY(body.x, body.z);
  mesh.position.set(body.x, y, body.z);
  mesh.rotation.y = body.yaw;
}

function swingLimbs(mesh, body, dt) {
  const u = mesh.userData;
  const swing = Math.sin(body.bob) * Math.min(0.7, body.speed * 0.45);
  u.legL.rotation.x = swing;
  u.legR.rotation.x = -swing;
  u.armL.rotation.x = -swing * 0.7;
  u.armR.rotation.x = swing * 0.7;
  const bob = Math.abs(Math.sin(body.bob)) * Math.min(0.06, body.speed * 0.025);
  mesh.position.y += bob;
  // Subtle idle breath
  if (body.speed < 0.15) {
    u.tBreath = (u.tBreath || 0) + dt;
    mesh.position.y += Math.sin(u.tBreath * 2.1) * 0.012;
  }
}

function updateCamera(camera, state, camPos, camTarget, look, desired, dt) {
  const p = state.player;
  const y = groundY(p.x, p.z);
  const yaw = state.cam.yaw, pitch = state.cam.pitch;
  const inside = insideCabin(p.x, p.z);
  const dist = inside ? 3.2 : CAM_DIST;
  const height = inside ? 1.7 : CAM_HEIGHT;
  const backX = -Math.sin(yaw) * Math.cos(pitch) * dist;
  const backZ = -Math.cos(yaw) * Math.cos(pitch) * dist;
  const backY = height - Math.sin(pitch) * dist * 0.85;
  desired.set(p.x + backX, y + backY, p.z + backZ);
  // Keep the camera off the ground
  const gy = groundY(desired.x, desired.z) + 0.6;
  if (desired.y < gy) desired.y = gy;
  if (inside) {
    desired.x = Math.max(-3.25, Math.min(3.25, desired.x));
    desired.z = Math.max(-3.05, Math.min(2.55, desired.z));
    desired.y = Math.max(1.15, Math.min(2.25, desired.y));
  }
  const k = 1 - Math.pow(0.001, dt);
  camPos.lerp(desired, 0.2 + 0.7 * k);
  look.set(p.x, y + (inside ? 1.25 : CAM_LOOK), p.z);
  camTarget.lerp(look, 0.25 + 0.6 * k);
  camera.position.copy(camPos);
  camera.lookAt(camTarget);
}

function snapCam(camera, state, camPos, camTarget) {
  const p = state.player;
  const y = groundY(p.x, p.z);
  const yaw = state.cam.yaw, pitch = state.cam.pitch;
  const inside = insideCabin(p.x, p.z);
  const dist = inside ? 3.2 : CAM_DIST;
  const height = inside ? 1.7 : CAM_HEIGHT;
  const backX = -Math.sin(yaw) * Math.cos(pitch) * dist;
  const backZ = -Math.cos(yaw) * Math.cos(pitch) * dist;
  const backY = height - Math.sin(pitch) * dist * 0.85;
  camPos.set(p.x + backX, y + backY, p.z + backZ);
  if (inside) {
    camPos.x = Math.max(-3.25, Math.min(3.25, camPos.x));
    camPos.z = Math.max(-3.05, Math.min(2.55, camPos.z));
    camPos.y = Math.max(1.15, Math.min(2.25, camPos.y));
  }
  const gy = groundY(camPos.x, camPos.z) + 0.6;
  if (camPos.y < gy) camPos.y = gy;
  camTarget.set(p.x, y + (inside ? 1.25 : CAM_LOOK), p.z);
  camera.position.copy(camPos);
  camera.lookAt(camTarget);
}

function makeSky() {
  const uniforms = {
    topColor: { value: new THREE.Color(0x6ea0d0) },
    horizonColor: { value: new THREE.Color(0xf2c9a0) },
    bottomColor: { value: new THREE.Color(0x8aa070) },
    sunColor: { value: new THREE.Color(0xfff1c8) },
    sunDir: { value: new THREE.Vector3(0.3, 0.8, 0.4).normalize() },
    sunSize: { value: 0.035 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vDir = w.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform vec3 topColor, horizonColor, bottomColor, sunColor, sunDir;
      uniform float sunSize;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(horizonColor, topColor, smoothstep(0.02, 0.48, h));
        col = mix(bottomColor, col, smoothstep(-0.2, 0.04, h));
        float sunDot = dot(d, normalize(sunDir));
        float disc = smoothstep(1.0 - sunSize * 0.7, 1.0 - sunSize * 0.2, sunDot);
        float glow = pow(clamp(sunDot, 0.0, 1.0), 32.0) * 0.85;
        float halo = pow(clamp(sunDot, 0.0, 1.0), 8.0) * 0.35;
        col += sunColor * (disc + glow + halo);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(160, 24, 16), mat);
  mesh.frustumCulled = false;

  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(1.1, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff3c8, fog: false }),
  );
  sun.visible = false; // the skydome shader already draws the disc

  const starGeo = new THREE.BufferGeometry();
  const n = 400;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(0.08 + Math.random() * 0.92); // upper hemisphere
    const r = 140;
    arr[i * 3] = r * Math.sin(ph) * Math.cos(th);
    arr[i * 3 + 1] = r * Math.cos(ph);
    arr[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: 0xf5f0e6, size: 0.9, sizeAttenuation: true, transparent: true, opacity: 0, fog: false, depthWrite: false }),
  );
  return { mesh, uniforms, sun, stars };
}

function lerpColor(out, a, b, t) {
  out.r = a.r + (b.r - a.r) * t;
  out.g = a.g + (b.g - a.g) * t;
  out.b = a.b + (b.b - a.b) * t;
  return out;
}

const C = (hex) => new THREE.Color(hex);

const PAL = {
  dayTop: C(0x6ea8d8),
  dayHor: C(0xd7e8f4),
  dayBot: C(0x8aa86a),
  setTop: C(0x2a3a6a),
  setHor: C(0xff9a62),
  setBot: C(0xc07450),
  duskTop: C(0x151830),
  duskHor: C(0x8a4a5c),
  duskBot: C(0x3a2a28),
  nightTop: C(0x0a0c18),
  nightHor: C(0x1c2438),
  nightBot: C(0x12141c),
  dawnTop: C(0x3a4a78),
  dawnHor: C(0xf0b090),
  dawnBot: C(0x6a7a50),
  sunDay: C(0xfff6d0),
  sunSet: C(0xffc078),
  sunNight: C(0xc0d0f0),
};

function updateSky(sky, hemi, sun, fill, scene, renderer, refs, cabinWarm, state) {
  const tod = state.timeOfDay;
  const elev = dayFactor(tod);
  const dir = sunDir(tod);
  sky.uniforms.sunDir.value.set(dir.x, dir.y, dir.z);

  // Blend palettes around key times.
  const top = sky.uniforms.topColor.value;
  const hor = sky.uniforms.horizonColor.value;
  const bot = sky.uniforms.bottomColor.value;
  const sunC = sky.uniforms.sunColor.value;

  // Weights: dawn ~0.22-0.32, day 0.35-0.68, sunset 0.70-0.82, night otherwise.
  function band(center, width) {
    return Math.max(0, 1 - Math.abs(tod - center) / width);
  }
  const wDawn = Math.max(band(0.26, 0.08), band(0.26 + 1, 0.08));
  const wDay = elev * (1 - band(0.74, 0.1) * 0.7);
  const wSet = Math.max(band(0.74, 0.08), band(0.8, 0.07));
  const wDusk = band(0.84, 0.07);
  const wNight = Math.max(0, 1 - elev * 1.2 - wSet * 0.5 - wDawn * 0.5);

  const tw = wDawn + wDay + wSet + wDusk + wNight || 1;
  top.set(0, 0, 0); hor.set(0, 0, 0); bot.set(0, 0, 0); sunC.set(0, 0, 0);
  const acc = (w, t, h, b, s) => {
    const k = w / tw;
    top.r += t.r * k; top.g += t.g * k; top.b += t.b * k;
    hor.r += h.r * k; hor.g += h.g * k; hor.b += h.b * k;
    bot.r += b.r * k; bot.g += b.g * k; bot.b += b.b * k;
    sunC.r += s.r * k; sunC.g += s.g * k; sunC.b += s.b * k;
  };
  acc(wDawn, PAL.dawnTop, PAL.dawnHor, PAL.dawnBot, PAL.sunSet);
  acc(wDay, PAL.dayTop, PAL.dayHor, PAL.dayBot, PAL.sunDay);
  acc(wSet, PAL.setTop, PAL.setHor, PAL.setBot, PAL.sunSet);
  acc(wDusk, PAL.duskTop, PAL.duskHor, PAL.duskBot, PAL.sunSet);
  acc(wNight, PAL.nightTop, PAL.nightHor, PAL.nightBot, PAL.sunNight);

  sky.uniforms.sunSize.value = 0.028 + wSet * 0.03;

  const sunDist = 90;
  sky.sun.position.set(dir.x * sunDist, dir.y * sunDist, dir.z * sunDist);
  sky.sun.visible = dir.y > -0.05;
  sky.sun.material.color.copy(sunC);
  // Stars only well after dusk — they were leaking into the sunset sky as little squares.
  const starAmt = (tod < 0.18 || tod > 0.92) ? Math.max(wNight, 0.35) : 0;
  sky.stars.material.opacity = starAmt * 0.9;
  sky.stars.rotation.y = tod * Math.PI * 2 * 0.15;

  sun.position.set(dir.x, Math.max(0.05, dir.y), dir.z);
  sun.color.copy(sunC);
  sun.intensity = 0.15 + elev * 1.15 + wSet * 0.35;
  hemi.intensity = 0.22 + elev * 0.55;
  hemi.color.set(wNight > 0.5 ? 0x8aa0c8 : 0xcfe6ff);
  hemi.groundColor.set(wNight > 0.5 ? 0x1a1c18 : 0x3d4a32);
  fill.intensity = 0.08 + elev * 0.22;
  renderer.toneMappingExposure = 0.85 + elev * 0.28 + wSet * 0.08;

  const fogC = hor.clone().lerp(bot, 0.25);
  scene.fog.color.copy(fogC);
  scene.fog.density = 0.011 + wNight * 0.008;
  renderer.setClearColor(fogC, 1);

  // Windows glow from late afternoon through night.
  const winGlow = Math.max(0, (1 - elev) * 1.1, wSet * 0.8 + wNight * 1.2 + wDusk);
  const glow = Math.min(1.6, winGlow);
  for (const w of refs.windows || []) {
    w.material.emissive.setHex(0xffd9a0);
    w.material.emissiveIntensity = glow * 0.85;
    w.material.color.setHex(glow > 0.35 ? 0xffe4b0 : 0x9ec9d9);
  }
  if (refs.porchLamp) refs.porchLamp.intensity = 0.15 + glow * 0.7;
  cabinWarm.intensity = 0.08 + glow * 0.45 + (state.tasks.fire.lit ? 0.4 : 0);
}

function updateTasks(refs, state, dt) {
  const porchDone = state.tasks.porch.done;
  if (refs.porchLoose) refs.porchLoose.visible = !porchDone;
  if (refs.porchFixed) refs.porchFixed.visible = porchDone;
  if (refs.porchGap) refs.porchGap.visible = !porchDone;

  if (refs.mounds) refs.mounds.visible = state.tasks.garden.planted;
  const growth = state.tasks.garden.growth;
  const planted = state.tasks.garden.planted;
  if (refs.plants) {
    for (const p of refs.plants) {
      if (!planted) {
        p.scale.setScalar(0.001);
        p.userData.bloom.visible = false;
        continue;
      }
      const sprout = 0.08 + growth * 0.95;
      p.scale.setScalar(sprout);
      p.userData.bloom.visible = growth > 0.55;
      p.userData.bloom.scale.setScalar(Math.max(0.1, (growth - 0.55) / 0.45));
    }
  }

  const lit = state.tasks.fire.lit;
  if (refs.flames) {
    refs.flames.visible = lit;
    if (lit) {
      refs.flames.userData.t = (refs.flames.userData.t || 0) + dt;
      const t = refs.flames.userData.t;
      refs.flames.children.forEach((f, i) => {
        const flicker = 0.85 + Math.sin(t * 11 + i * 1.7) * 0.18 + Math.sin(t * 19 + i) * 0.08;
        f.scale.set(1, flicker, 1);
        f.position.y = 0.58 + Math.sin(t * 8 + i * 2) * 0.04;
      });
    }
  }
  if (refs.fireLight) {
    if (lit) {
      refs.fireLight.userData.t = (refs.fireLight.userData.t || 0) + dt;
      const t = refs.fireLight.userData.t;
      refs.fireLight.intensity = 2.4 + Math.sin(t * 9) * 0.35 + Math.sin(t * 17) * 0.15;
      refs.fireLight.distance = 9;
    } else {
      refs.fireLight.intensity = 0;
    }
  }
}

function makeFireflies() {
  const n = 28;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const seeds = [];
  for (let i = 0; i < n; i++) {
    const x = (Math.random() - 0.5) * 22;
    const z = 2 + Math.random() * 16;
    const y = 0.6 + Math.random() * 1.8;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    seeds.push({ x, y, z, p: Math.random() * Math.PI * 2, s: 0.4 + Math.random() * 0.8 });
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      color: 0xe8f2a0,
      size: 0.12,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  );
  pts.userData.seeds = seeds;
  return pts;
}

function updateFireflies(pts, state, dt) {
  const night = 1 - dayFactor(state.timeOfDay);
  const show = Math.max(0, night - 0.35) / 0.65;
  pts.material.opacity = show * 0.85;
  if (show <= 0) return;
  pts.userData.t = (pts.userData.t || 0) + dt;
  const t = pts.userData.t;
  const pos = pts.geometry.attributes.position;
  pts.userData.seeds.forEach((s, i) => {
    pos.setXYZ(
      i,
      s.x + Math.sin(t * s.s + s.p) * 0.6,
      s.y + Math.sin(t * 1.4 * s.s + s.p) * 0.35,
      s.z + Math.cos(t * 0.8 * s.s + s.p) * 0.6,
    );
  });
  pos.needsUpdate = true;
}

function makeSmoke(chimney) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xc8c4be, transparent: true, opacity: 0.22, depthWrite: false });
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), mat.clone());
    p.userData.phase = i * 0.7;
    g.add(p);
  }
  g.userData.chimney = chimney;
  g.visible = false;
  return g;
}

function updateSmoke(g, state, dt) {
  const on = state.tasks.fire.lit;
  g.visible = on;
  if (!on) return;
  g.userData.t = (g.userData.t || 0) + dt;
  const c = g.userData.chimney;
  const t = g.userData.t;
  g.children.forEach((p, i) => {
    const u = (t * 0.22 + p.userData.phase) % 2.4;
    const k = u / 2.4;
    p.position.set(
      c.x + Math.sin(t * 0.7 + i) * 0.15 * k,
      c.y + k * 2.6,
      c.z + Math.cos(t * 0.5 + i) * 0.1 * k,
    );
    const s = 0.4 + k * 1.8;
    p.scale.setScalar(s);
    p.material.opacity = 0.28 * (1 - k);
  });
}

function makeLabel() {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(2.4, 0.6, 1);
  spr.userData = { canvas, ctx, tex, text: '' };
  return spr;
}

function updateLabel(spr, lark, state) {
  const msg = state.partner.help || '';
  const want = msg ? 1 : 0;
  spr.material.opacity += (want - spr.material.opacity) * 0.12;
  const y = groundY(state.partner.x, state.partner.z) + 2.15;
  spr.position.set(state.partner.x, y, state.partner.z);
  if (msg && msg !== spr.userData.text) {
    spr.userData.text = msg;
    const { ctx, canvas, tex } = spr.userData;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(40, 28, 18, 0.78)';
    roundRect(ctx, 16, 24, 480, 80, 24);
    ctx.fill();
    ctx.fillStyle = '#f6ead6';
    ctx.font = '600 36px system-ui, Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(msg, 256, 64);
    tex.needsUpdate = true;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
