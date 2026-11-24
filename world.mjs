// Low-poly mountain cabin, pines, meadow, and cozy interior. All original geometry.
import * as THREE from './vendor/three.module.js';
import { heightAt, setColliders, INTERACTS } from './game.mjs';

function mulberry(seed) {
  let s = seed | 0 || 1;
  return () => {
    s += 0x6D2B79F5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function boxMesh(w, h, d, color, x, y, z, rotY = 0) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  );
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function addBoxCollider(boxes, x, y, z, w, h, d, rotY = 0) {
  // Only axis-aligned used for walking; skip rotated (none of the walls rotate except 0/pi).
  if (Math.abs(rotY) > 0.01 && Math.abs(Math.abs(rotY) - Math.PI) > 0.01) {
    const hw = (Math.abs(Math.cos(rotY)) * w + Math.abs(Math.sin(rotY)) * d) / 2;
    const hd = (Math.abs(Math.sin(rotY)) * w + Math.abs(Math.cos(rotY)) * d) / 2;
    boxes.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd, minY: y - h / 2, maxY: y + h / 2 });
    return;
  }
  boxes.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, minY: y - h / 2, maxY: y + h / 2 });
}

export function buildWorld() {
  const root = new THREE.Group();
  const refs = {};
  const boxes = [];
  const trunks = [];
  const rng = mulberry(47);

  root.add(buildTerrain());
  root.add(buildMountains());
  addPines(root, rng, trunks);
  addRocks(root, rng, boxes);
  addWildflowers(root, rng);
  const cabin = buildCabin(boxes, refs);
  root.add(cabin);
  root.add(buildGarden(refs));
  boxes.push({ minX: 6.15 - 1.75, maxX: 6.15 + 1.75, minZ: 3.1 - 1.15, maxZ: 3.1 + 1.15, minY: 0, maxY: 0.5 });
  addFence(root, boxes);

  setColliders(boxes, trunks);
  refs.boxes = boxes;
  refs.trunks = trunks;
  return { group: root, refs };
}

function buildTerrain() {
  const geo = new THREE.PlaneGeometry(96, 90, 108, 100);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cGrass = new THREE.Color(0x5a8a52);
  const cMeadow = new THREE.Color(0x7aa860);
  const cDry = new THREE.Color(0x9aaa62);
  const cDirt = new THREE.Color(0x8a6e48);
  const cMoss = new THREE.Color(0x4a7a52);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const y = heightAt(x, z);
    pos.setY(i, y);
    const n = Math.abs(Math.sin(x * 0.37) * Math.cos(z * 0.29));
    tmp.copy(cGrass).lerp(cMeadow, 0.45 + 0.4 * Math.sin(x * 0.11 + z * 0.08));
    if (y < -1.2) tmp.lerp(cMoss, 0.45);
    if (y > 2.2) tmp.lerp(cDry, 0.5);
    // Path-ish strip down the middle in front of the porch.
    const path = Math.exp(-((x - 0.3) ** 2) / 3.2) * (z > 5 && z < 22 ? 1 : 0);
    tmp.lerp(cDirt, path * 0.85);
    // Terrace dirt near the cabin
    const pad = Math.max(Math.abs(x) / 8.2, Math.abs(z + 0.4) / 7.2);
    if (pad < 1.05 && pad > 0.72) tmp.lerp(cDirt, 0.35);
    tmp.offsetHSL(0, 0, (n - 0.5) * 0.07);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

function buildMountains() {
  const g = new THREE.Group();
  const peaks = [
    { x: -38, z: -48, w: 34, h: 22, d: 16, c: 0x6b6e78 },
    { x: -12, z: -56, w: 28, h: 28, d: 18, c: 0x5c6270 },
    { x: 18, z: -54, w: 36, h: 24, d: 16, c: 0x64687a },
    { x: 46, z: -46, w: 32, h: 19, d: 15, c: 0x585c68 },
    { x: -58, z: -30, w: 24, h: 16, d: 18, c: 0x4e5660 },
    { x: 62, z: -28, w: 26, h: 15, d: 16, c: 0x525860 },
    { x: 4, z: -70, w: 50, h: 34, d: 22, c: 0x4a5160 },
  ];
  for (const p of peaks) {
    const geo = new THREE.ConeGeometry(p.w / 2, p.h, 5);
    const mat = new THREE.MeshLambertMaterial({ color: p.c, flatShading: true });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(p.x, p.h * 0.28, p.z);
    m.scale.z = p.d / p.w;
    m.rotation.y = p.x * 0.05;
    g.add(m);
    // Snow cap on the tallest
    if (p.h > 24) {
      const cap = new THREE.Mesh(
        new THREE.ConeGeometry(p.w / 6, p.h * 0.22, 5),
        new THREE.MeshLambertMaterial({ color: 0xe8eef6, flatShading: true }),
      );
      cap.position.set(p.x, p.h * 0.28 + p.h * 0.38, p.z);
      cap.scale.z = p.d / p.w;
      cap.rotation.y = p.x * 0.05;
      g.add(cap);
    }
  }
  // Far ridge silhouettes, darker (behind the cabin)
  for (let i = 0; i < 8; i++) {
    const x = -70 + i * 20 + (i % 2) * 4;
    const h = 10 + (i % 3) * 3;
    const m = new THREE.Mesh(
      new THREE.ConeGeometry(10, h, 4),
      new THREE.MeshLambertMaterial({ color: 0x3a4250, flatShading: true }),
    );
    m.position.set(x, h * 0.15, -78);
    g.add(m);
  }
  // Distant valley peaks ahead of the porch, so a look down the path still has a horizon.
  const far = [
    { x: -28, z: 62, w: 26, h: 11, c: 0x4a5360 },
    { x: -8, z: 70, w: 32, h: 14, c: 0x3e4654 },
    { x: 16, z: 68, w: 28, h: 12, c: 0x454c5a },
    { x: 38, z: 60, w: 24, h: 10, c: 0x3a4250 },
    { x: 4, z: 80, w: 40, h: 16, c: 0x2e3544 },
  ];
  for (const p of far) {
    const m = new THREE.Mesh(
      new THREE.ConeGeometry(p.w / 2, p.h, 5),
      new THREE.MeshLambertMaterial({ color: p.c, flatShading: true }),
    );
    m.position.set(p.x, p.h * 0.15 - 1.2, p.z);
    g.add(m);
  }
  return g;
}

function addPines(root, rng, trunks) {
  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.2, 1.2, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x4a3426, flatShading: true });
  const leafGeo = new THREE.ConeGeometry(1, 2.4, 7);
  const leafMats = [
    new THREE.MeshLambertMaterial({ color: 0x1f4a32, flatShading: true }),
    new THREE.MeshLambertMaterial({ color: 0x2a5a3a, flatShading: true }),
    new THREE.MeshLambertMaterial({ color: 0x163828, flatShading: true }),
    new THREE.MeshLambertMaterial({ color: 0x2f6a44, flatShading: true }),
  ];
  const spots = [];
  const trySpot = (x, z) => {
    if (Math.abs(x) < 9 && z > -8 && z < 10) return; // keep the terrace open
    if (Math.hypot(x - 6.2, z - 3.1) < 3.2) return; // garden
    const y = heightAt(x, z);
    if (y < -2.8) return;
    spots.push([x, y, z]);
  };
  for (let i = 0; i < 70; i++) {
    const a = rng() * Math.PI * 2;
    const rad = 10 + rng() * 30;
    trySpot(Math.cos(a) * rad, Math.sin(a) * rad * 0.9 - 2);
  }
  // A denser stand behind the cabin
  for (let i = 0; i < 28; i++) {
    trySpot(-16 + rng() * 32, -8 - rng() * 16);
  }
  // A few trees down the valley, leaving the central path open
  for (let i = 0; i < 14; i++) {
    const side = rng() < 0.5 ? -1 : 1;
    trySpot(side * (6 + rng() * 16), 12 + rng() * 16);
  }
  for (const [x, y, z] of spots) {
    const s = 0.75 + rng() * 0.7;
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, y + 0.55 * s, z);
    trunk.scale.set(s, s * (1.1 + rng() * 0.4), s);
    root.add(trunk);
    const layers = 2 + (rng() > 0.4 ? 1 : 0);
    const mat = leafMats[(rng() * leafMats.length) | 0];
    for (let k = 0; k < layers; k++) {
      const leaf = new THREE.Mesh(leafGeo, mat);
      const ls = s * (1.05 - k * 0.18);
      leaf.scale.set(ls, ls * 0.95, ls);
      leaf.position.set(x, y + (1.35 + k * 1.15) * s, z);
      leaf.rotation.y = rng() * Math.PI;
      root.add(leaf);
    }
    trunks.push({ x, z, r: 0.28 * s });
  }
}

function addRocks(root, rng, boxes) {
  const geo = new THREE.IcosahedronGeometry(0.55, 0);
  const mat = new THREE.MeshLambertMaterial({ color: 0x7a7468, flatShading: true });
  for (let i = 0; i < 18; i++) {
    const x = (rng() - 0.5) * 50;
    const z = (rng() - 0.5) * 48;
    if (Math.abs(x) < 8 && z > -7 && z < 9) continue;
    const y = heightAt(x, z);
    const s = 0.4 + rng() * 1.1;
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y + 0.18 * s, z);
    m.scale.set(s, s * (0.5 + rng() * 0.5), s * (0.8 + rng() * 0.4));
    m.rotation.set(rng(), rng(), rng());
    root.add(m);
    if (s > 0.7) boxes.push({ minX: x - 0.35 * s, maxX: x + 0.35 * s, minZ: z - 0.35 * s, maxZ: z + 0.35 * s, minY: y, maxY: y + 0.6 * s });
  }
}

function addWildflowers(root, rng) {
  const geo = new THREE.SphereGeometry(0.07, 5, 4);
  const colors = [0xe07a5f, 0xf2d48b, 0xd9c4e8, 0xf7f1e1, 0x7aa8c4];
  const mats = colors.map((c) => new THREE.MeshLambertMaterial({ color: c }));
  const stemMat = new THREE.MeshLambertMaterial({ color: 0x3d6a38 });
  const stemGeo = new THREE.CylinderGeometry(0.015, 0.02, 0.22, 4);
  for (let i = 0; i < 80; i++) {
    const x = (rng() - 0.5) * 40;
    const z = 4 + rng() * 24;
    if (Math.abs(x) < 3 && z < 12) continue;
    const y = heightAt(x, z);
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.set(x, y + 0.12, z);
    root.add(stem);
    const fl = new THREE.Mesh(geo, mats[(rng() * mats.length) | 0]);
    fl.position.set(x, y + 0.24, z);
    fl.scale.set(1, 0.7, 1);
    root.add(fl);
  }
}

function addFence(root, boxes) {
  const postMat = new THREE.MeshLambertMaterial({ color: 0x6a4e32 });
  const railMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const g = new THREE.Group();
  // A short rustic rail along the downhill edge of the terrace, leaving the path open.
  const zs = 6.4;
  for (const x of [-7.2, -5.4, -3.6, 3.6, 5.4, 7.2]) {
    const y = heightAt(x, zs);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.95, 0.1), postMat);
    post.position.set(x, y + 0.45, zs);
    g.add(post);
  }
  for (const [x1, x2] of [[-7.2, -3.6], [3.6, 7.2]]) {
    const mid = (x1 + x2) / 2;
    const y = heightAt(mid, zs) + 0.58;
    const rail = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x2 - x1), 0.06, 0.06), railMat);
    rail.position.set(mid, y, zs);
    g.add(rail);
  }
  root.add(g);
}

function pane(w, h, color, x, y, z, rotY = 0, emissive = 0x000000) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshLambertMaterial({
      color,
      emissive,
      emissiveIntensity: 0.0,
      side: THREE.DoubleSide,
    }),
  );
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  return m;
}

function buildCabin(boxes, refs) {
  const g = new THREE.Group();
  const wood = 0xb0895a;
  const woodDark = 0x8a6740;
  const woodDeep = 0x6b4a2c;
  const trim = 0x5c3d24;
  const plaster = 0xe8d7b8;
  const roof = 0x3d4248;
  const stone = 0x7a7368;
  const stoneDark = 0x5c564c;

  // Floor (interior + porch share a warm plank tone)
  const floor = boxMesh(7.4, 0.12, 6.4, woodDark, 0, 0.0, -0.2);
  g.add(floor);
  const porch = boxMesh(8.0, 0.12, 2.6, wood, 0, 0.0, 4.15);
  g.add(porch);
  // Steps down toward the path
  g.add(boxMesh(1.8, 0.1, 0.42, woodDark, 0, -0.07, 5.58));
  g.add(boxMesh(1.55, 0.1, 0.4, woodDeep, 0, -0.16, 5.92));

  // Broken porch board (left of center) — missing gap + a loose plank until repaired.
  const gap = boxMesh(0.55, 0.02, 1.4, 0x3a2a18, -1.15, 0.07, 4.15);
  g.add(gap);
  const loose = boxMesh(0.5, 0.06, 1.35, 0x6b4a2c, -1.15, 0.14, 4.35);
  loose.rotation.z = 0.18;
  loose.rotation.x = -0.12;
  g.add(loose);
  const fixed = boxMesh(0.55, 0.08, 1.45, wood, -1.15, 0.08, 4.15);
  fixed.visible = false;
  g.add(fixed);
  refs.porchLoose = loose;
  refs.porchFixed = fixed;
  refs.porchGap = gap;

  // Walls. Interior is walkable; door opening on +Z (valley) side.
  const wallH = 2.55, wallY = 1.33;
  // Back wall (-Z)
  g.add(boxMesh(7.4, wallH, 0.22, plaster, 0, wallY, -3.3));
  addBoxCollider(boxes, 0, wallY, -3.3, 7.4, wallH, 0.22);
  // Front wall split around the door (door 1.5 wide, centered a tad right of 0)
  const doorX = 0.15, doorW = 1.55;
  const leftW = 2.7, rightW = 2.7;
  // left front wall: from x=-3.7 to door
  g.add(boxMesh(2.85, wallH, 0.22, plaster, -2.3, wallY, 2.95));
  addBoxCollider(boxes, -2.3, wallY, 2.95, 2.85, wallH, 0.22);
  g.add(boxMesh(2.85, wallH, 0.22, plaster, 2.4, wallY, 2.95));
  addBoxCollider(boxes, 2.4, wallY, 2.95, 2.85, wallH, 0.22);
  // lintel
  g.add(boxMesh(1.7, 0.45, 0.22, plaster, doorX, 2.38, 2.95));
  addBoxCollider(boxes, doorX, 2.38, 2.95, 1.7, 0.45, 0.22);
  // Side walls
  g.add(boxMesh(0.22, wallH, 6.5, plaster, -3.7, wallY, -0.2));
  addBoxCollider(boxes, -3.7, wallY, -0.2, 0.22, wallH, 6.5);
  g.add(boxMesh(0.22, wallH, 6.5, plaster, 3.7, wallY, -0.2));
  addBoxCollider(boxes, 3.7, wallY, -0.2, 0.22, wallH, 6.5);

  // Exterior trim / foundation
  g.add(boxMesh(7.7, 0.28, 6.7, stone, 0, 0.08, -0.2));
  g.add(boxMesh(8.2, 0.22, 2.7, stoneDark, 0, 0.02, 4.15));

  // Interior ceiling (keeps night interiors from opening into the sky)
  g.add(boxMesh(7.35, 0.1, 6.45, 0xd4c4a8, 0, 2.62, -0.2));

  // Gabled roof: two slabs + overhang
  const roofL = new THREE.Mesh(
    new THREE.BoxGeometry(8.6, 0.16, 4.6),
    new THREE.MeshLambertMaterial({ color: roof, flatShading: true }),
  );
  roofL.position.set(0, 3.35, -1.55);
  roofL.rotation.x = 0.48;
  g.add(roofL);
  const roofR = roofL.clone();
  roofR.position.set(0, 3.35, 1.35);
  roofR.rotation.x = -0.48;
  g.add(roofR);
  // Gable end fills
  const gableShape = (z, rot) => {
    const shape = new THREE.Shape();
    shape.moveTo(-3.75, 0);
    shape.lineTo(3.75, 0);
    shape.lineTo(0, 2.05);
    shape.lineTo(-3.75, 0);
    const m = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshLambertMaterial({ color: plaster, side: THREE.DoubleSide }),
    );
    m.position.set(0, 2.55, z);
    return m;
  };
  g.add(gableShape(-3.38));
  g.add(gableShape(3.05));

  // Chimney on the back left
  g.add(boxMesh(0.7, 2.4, 0.7, stone, -2.2, 3.7, -2.9));
  g.add(boxMesh(0.86, 0.18, 0.86, stoneDark, -2.2, 4.9, -2.9));
  refs.chimney = { x: -2.2, y: 5.05, z: -2.9 };

  // Door (open inward look — a slightly ajar warm door on a hinge)
  const door = boxMesh(1.25, 2.05, 0.08, 0x8b3d2a, doorX - 0.55, 1.08, 2.82, 0.55);
  g.add(door);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshLambertMaterial({ color: 0xd4b06a }));
  knob.position.set(doorX - 0.05, 1.05, 3.05);
  g.add(knob);

  // Windows — emissive panes we can warm up at dusk.
  const windows = [];
  const addWin = (x, y, z, rotY, w = 0.85, h = 0.95) => {
    const frame = boxMesh(w + 0.12, h + 0.12, 0.08, trim, x, y, z, rotY);
    g.add(frame);
    const glass = pane(w, h, 0x9ec9d9, x + Math.sin(rotY) * 0.06, y, z + Math.cos(rotY) * 0.06, rotY, 0xffd9a0);
    g.add(glass);
    windows.push(glass);
  };
  addWin(-2.15, 1.55, 3.08, 0);
  addWin(2.25, 1.55, 3.08, 0);
  addWin(-3.8, 1.55, -0.6, Math.PI / 2, 0.9, 1.0);
  addWin(3.8, 1.55, -0.6, -Math.PI / 2, 0.9, 1.0);
  addWin(-3.8, 1.55, 1.5, Math.PI / 2, 0.7, 0.85);
  refs.windows = windows;

  // Porch posts and rail
  for (const x of [-3.7, 3.7]) {
    g.add(boxMesh(0.16, 2.15, 0.16, woodDeep, x, 1.1, 5.25));
    g.add(boxMesh(0.16, 2.15, 0.16, woodDeep, x, 1.1, 3.25));
  }
  g.add(boxMesh(7.6, 0.1, 0.1, woodDeep, 0, 1.05, 5.25));
  g.add(boxMesh(0.1, 0.1, 2.1, woodDeep, -3.7, 1.05, 4.25));
  g.add(boxMesh(0.1, 0.1, 2.1, woodDeep, 3.7, 1.05, 4.25));
  // Roof over porch
  const porchRoof = new THREE.Mesh(
    new THREE.BoxGeometry(8.4, 0.1, 3.0),
    new THREE.MeshLambertMaterial({ color: roof }),
  );
  porchRoof.position.set(0, 2.45, 4.35);
  porchRoof.rotation.x = -0.12;
  g.add(porchRoof);

  // Interior furniture
  // Fireplace on the back wall
  const hearth = new THREE.Group();
  hearth.position.set(0, 0, -2.85);
  hearth.add(boxMesh(2.1, 1.7, 0.7, stone, 0, 0.85, 0));
  // Recessed black back of the firebox (not a solid sitting in the opening)
  hearth.add(boxMesh(1.05, 0.8, 0.12, 0x120e0c, 0, 0.62, -0.12));
  hearth.add(boxMesh(2.3, 0.16, 0.9, stoneDark, 0, 0.1, 0.1));
  const mantel = boxMesh(2.35, 0.1, 0.8, woodDeep, 0, 1.62, 0.05);
  hearth.add(mantel);
  // Logs
  const logMat = new THREE.MeshLambertMaterial({ color: 0x4a3424 });
  for (const [lx, ly, rz] of [[-0.18, 0.28, 0.35], [0.16, 0.28, -0.4], [0.0, 0.4, 0.15]]) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.7, 6), logMat);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = rz;
    log.position.set(lx, ly, 0.18);
    hearth.add(log);
  }
  // Flames (hidden until lit)
  const flames = new THREE.Group();
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0.92, side: THREE.DoubleSide });
  const flameMat2 = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  for (let i = 0; i < 5; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.1 + (i % 2) * 0.04, 0.55, 5), i % 2 ? flameMat2 : flameMat);
    f.position.set(-0.22 + i * 0.11, 0.58, 0.28);
    flames.add(f);
  }
  flames.visible = false;
  hearth.add(flames);
  refs.flames = flames;
  const glow = new THREE.PointLight(0xff9a4a, 0, 7, 2);
  glow.position.set(0, 0.7, 0.4);
  hearth.add(glow);
  refs.fireLight = glow;
  g.add(hearth);

  // Rug, table, two chairs, a little bed nook
  const rug = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 0.04, 1.8),
    new THREE.MeshLambertMaterial({ color: 0x8b3d2a }),
  );
  rug.position.set(0.2, 0.1, -0.4);
  g.add(rug);
  g.add(boxMesh(1.15, 0.55, 0.7, woodDeep, 1.7, 0.4, 0.6));
  // Chairs
  const chair = (x, z, rot) => {
    const c = new THREE.Group();
    c.add(boxMesh(0.45, 0.08, 0.45, wood, 0, 0.38, 0));
    c.add(boxMesh(0.08, 0.38, 0.08, woodDeep, -0.18, 0.19, -0.18));
    c.add(boxMesh(0.08, 0.38, 0.08, woodDeep, 0.18, 0.19, -0.18));
    c.add(boxMesh(0.08, 0.38, 0.08, woodDeep, -0.18, 0.19, 0.18));
    c.add(boxMesh(0.08, 0.38, 0.08, woodDeep, 0.18, 0.19, 0.18));
    c.add(boxMesh(0.45, 0.45, 0.07, wood, 0, 0.62, -0.19));
    c.position.set(x, 0, z);
    c.rotation.y = rot;
    return c;
  };
  g.add(chair(1.15, 0.55, 0.6));
  g.add(chair(2.2, 0.2, -0.9));
  // Bed in the left corner
  g.add(boxMesh(1.6, 0.35, 2.1, 0x6b4a2c, -2.55, 0.32, -1.5));
  g.add(boxMesh(1.5, 0.18, 2.0, 0xe8dcc8, -2.55, 0.52, -1.5));
  g.add(boxMesh(1.4, 0.18, 0.4, 0xf4eee4, -2.55, 0.62, -2.3));
  // Shelf / kettle silhouette
  g.add(boxMesh(0.7, 0.08, 0.25, wood, -1.3, 1.85, -3.05));
  const kettle = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0x4a4e52 }),
  );
  kettle.position.set(-1.3, 2.02, -3.0);
  kettle.scale.set(1, 0.8, 1);
  g.add(kettle);

  // Porch light
  const porchLamp = new THREE.PointLight(0xffd2a0, 0.4, 6, 2);
  porchLamp.position.set(0.2, 2.15, 4.0);
  g.add(porchLamp);
  refs.porchLamp = porchLamp;
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffe4b8 }),
  );
  bulb.position.set(0.2, 2.2, 4.05);
  g.add(bulb);

  // Invisible blockers so you don't walk through the bed / table / hearth.
  addBoxCollider(boxes, 0, 0.85, -2.85, 2.1, 1.7, 0.7);
  addBoxCollider(boxes, -2.55, 0.4, -1.5, 1.6, 0.8, 2.1);
  addBoxCollider(boxes, 1.7, 0.4, 0.6, 1.15, 0.55, 0.7);

  return g;
}

function buildGarden(refs) {
  const g = new THREE.Group();
  const bedX = INTERACTS.plant.x, bedZ = INTERACTS.plant.z;
  const y = 0.02;
  // Raised bed
  const soil = boxMesh(3.3, 0.28, 2.1, 0x4a3220, bedX, y + 0.16, bedZ);
  g.add(soil);
  const frameMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2c });
  for (const [w, d, x, z] of [
    [3.5, 0.12, bedX, bedZ - 1.1],
    [3.5, 0.12, bedX, bedZ + 1.1],
    [0.12, 2.3, bedX - 1.7, bedZ],
    [0.12, 2.3, bedX + 1.7, bedZ],
  ]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.38, d), frameMat);
    m.position.set(x, y + 0.22, z);
    g.add(m);
  }

  // Empty mounds, then sprouts / blooms driven by growth.
  const mounds = new THREE.Group();
  const moundMat = new THREE.MeshLambertMaterial({ color: 0x3a2618 });
  const spots = [];
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 3; j++) {
      const x = bedX - 1.0 + j * 1.0;
      const z = bedZ - 0.45 + i * 0.9;
      spots.push([x, z]);
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 4), moundMat);
      m.position.set(x, y + 0.32, z);
      m.scale.set(1, 0.45, 1);
      mounds.add(m);
    }
  }
  mounds.visible = false;
  g.add(mounds);
  refs.mounds = mounds;

  const plants = [];
  const stemGeo = new THREE.CylinderGeometry(0.025, 0.04, 1, 5);
  const stemMat = new THREE.MeshLambertMaterial({ color: 0x3d7a3c });
  const leafGeo = new THREE.SphereGeometry(0.16, 6, 5);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x4f9a52 });
  const bloomCols = [0xe07a5f, 0xf2d48b, 0xd9c4e8, 0xf7f1e1, 0xe8a0b0, 0x7aa8c4];
  spots.forEach(([x, z], i) => {
    const p = new THREE.Group();
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.y = 0.5;
    p.add(stem);
    const leaf1 = new THREE.Mesh(leafGeo, leafMat);
    leaf1.position.set(0.12, 0.45, 0.04);
    leaf1.scale.set(1, 0.45, 0.8);
    p.add(leaf1);
    const leaf2 = leaf1.clone();
    leaf2.position.set(-0.1, 0.35, -0.06);
    p.add(leaf2);
    const bloom = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 7, 6),
      new THREE.MeshLambertMaterial({ color: bloomCols[i % bloomCols.length] }),
    );
    bloom.position.y = 1.02;
    bloom.visible = false;
    p.add(bloom);
    p.position.set(x, y + 0.28, z);
    p.scale.setScalar(0.001);
    p.userData = { bloom, stem };
    g.add(p);
    plants.push(p);
  });
  refs.plants = plants;
  refs.gardenGroup = g;
  return g;
}

export function makePerson(kind) {
  // kind: 'rowan' (player, terracotta) or 'lark' (partner, sage)
  const isRowan = kind === 'rowan';
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xf0d0b4, flatShading: true });
  const sweater = new THREE.MeshLambertMaterial({ color: isRowan ? 0xc4623a : 0x6b8f71, flatShading: true });
  const pants = new THREE.MeshLambertMaterial({ color: isRowan ? 0x5a3a28 : 0xc4b49a, flatShading: true });
  const hair = new THREE.MeshLambertMaterial({ color: isRowan ? 0x3a2a22 : 0x5c3d2e, flatShading: true });
  const boot = new THREE.MeshLambertMaterial({ color: 0x3a2c22, flatShading: true });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.28), sweater);
  torso.position.y = 1.05;
  g.add(torso);
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.26), pants);
  hips.position.y = 0.7;
  g.add(hips);

  const head = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.175, 8, 6), skin);
  head.add(skull);
  const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.185, 8, 6), hair);
  hairM.scale.set(1.05, 0.7, 1.05);
  hairM.position.y = 0.07;
  head.add(hairM);
  if (!isRowan) {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), hair);
    bun.position.set(0, 0.1, -0.14);
    head.add(bun);
  }
  const eyeMat = new THREE.MeshLambertMaterial({ color: 0x2a1c14, flatShading: true });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 5), eyeMat);
  eyeL.position.set(-0.06, 0.02, 0.155);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.06;
  head.add(eyeL, eyeR);
  head.position.y = 1.48;
  g.add(head);

  const armGeo = new THREE.BoxGeometry(0.12, 0.48, 0.12);
  const armL = new THREE.Mesh(armGeo, sweater);
  armL.position.set(-0.28, 1.0, 0);
  const armR = new THREE.Mesh(armGeo, sweater);
  armR.position.set(0.28, 1.0, 0);
  g.add(armL, armR);

  const legGeo = new THREE.BoxGeometry(0.14, 0.52, 0.16);
  const legL = new THREE.Mesh(legGeo, pants);
  legL.position.set(-0.11, 0.38, 0);
  const legR = new THREE.Mesh(legGeo, pants);
  legR.position.set(0.11, 0.38, 0);
  g.add(legL, legR);
  const bootL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.22), boot);
  bootL.position.set(-0.11, 0.1, 0.03);
  const bootR = bootL.clone();
  bootR.position.x = 0.11;
  g.add(bootL, bootR);

  g.userData = { armL, armR, legL, legR, head, kind };
  return g;
}
