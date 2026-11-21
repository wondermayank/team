import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { MEMBERS, ROOMS, FLOORS, TINTS, LIFE_PHOTOS, SPAWN, BATH_IMAGES, EXTRA_PICS, RULES } from './data.js';

/* ============================== constants ============================== */
const H = 3.2;            // room height (floor to ceiling)
const FH = 3.6;           // floor to floor (slab is 0.4 thick)
const T = 0.3;            // wall thickness
const DOOR_W = 1.4, DOOR_H = 2.35;
const BX = 12.2;          // half width of the building (inside)
const LEN = 61.2;         // building depth (inside)
const CORE = 9.15;        // depth of the lobby (core hall) on floors 2 to 5
const TOP = 5 * FH;       // roof level
const R = 0.32, EYE = 1.6;
const GX = 34, GZ = 22, CZ = 44, GB = -LEN - 24; // garden half width, garden front, gate z, garden back
const LIFT = { x: 4.2, z: -2.4 };
const LEVEL_NAMES = ['Ground floor', 'Floor 2', 'Floor 3', 'Floor 4', 'Floor 5', 'Terrace'];
const FL = [
  { lo: 0, hi: 1, side: -1 }, { lo: 1, hi: 2, side: 1 }, { lo: 2, hi: 3, side: -1 }, { lo: 3, hi: 4, side: 1 }, { lo: 4, hi: 5, side: -1 },
];
const flightRect = (side) => (side < 0 ? { x0: -11.9, x1: -8.5 } : { x0: 8.5, x1: 11.9 });
const FZ0 = -6.3, FZ1 = -1.5; // top (north) and bottom (south) of every flight
let buildLevel = 0;       // level new colliders belong to
let parent = null;        // group that new geometry is added to
const floorGroups = [];
const $ = (id) => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
document.documentElement.classList.toggle('touch', isTouch);

/* ============================== renderer =============================== */
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 330);
camera.rotation.order = 'YXZ';
const world = new THREE.Group();
scene.add(world); parent = world;
const hemi = new THREE.HemisphereLight(0xffffff, 0x9db8f0, 1.2); scene.add(hemi);
const glow = new THREE.PointLight(0xffffff, 2.2, 12, 2); scene.add(glow);
const sun = new THREE.DirectionalLight(0xffffff, 0.8); sun.position.set(30, 60, 50); scene.add(sun);

// sky dome, stars, moon and sun follow the camera
const skyGroup = new THREE.Group(); scene.add(skyGroup);
const skyGeo = new THREE.SphereGeometry(300, 24, 14);
skyGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(skyGeo.attributes.position.count * 3), 3));
const skyMesh = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
skyMesh.renderOrder = -10; skyGroup.add(skyMesh);
const starGeo = new THREE.BufferGeometry();
{ const a = new Float32Array(500 * 3); for (let i = 0; i < 500; i++) { const u = Math.random(), v = Math.random() * 0.9 + 0.08, th = u * Math.PI * 2, r = 280, y = v * r; const rr = Math.sqrt(r * r - y * y); a[i * 3] = Math.cos(th) * rr; a[i * 3 + 1] = y; a[i * 3 + 2] = Math.sin(th) * rr; } starGeo.setAttribute('position', new THREE.BufferAttribute(a, 3)); }
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.8, sizeAttenuation: false, fog: false, depthWrite: false }));
skyGroup.add(stars);
const moon = new THREE.Mesh(new THREE.SphereGeometry(9, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff4d6, fog: false })); moon.position.set(-110, 120, -190); skyGroup.add(moon);
const sunBall = new THREE.Mesh(new THREE.SphereGeometry(11, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff6c8, fog: false })); sunBall.position.set(110, 130, -190); skyGroup.add(sunBall);
function paintSky(top, hor) {
  const pos = skyGeo.attributes.position, col = skyGeo.attributes.color, a = new THREE.Color(top), b = new THREE.Color(hor), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) { const t = Math.max(0, Math.min(1, pos.getY(i) / 300)); c.copy(b).lerp(a, Math.pow(t, 0.55)); col.setXYZ(i, c.r, c.g, c.b); }
  col.needsUpdate = true;
}

/* ============================== palettes =============================== */
const PAL = {
  light: { bg: 0xcfe3ff, fog: 0xdbe9ff, skyTop: 0x6fa8ff, skyHor: 0xeef5ff, wall: 0xf3f6ff, floor: 0xc9d9fb, ceil: 0xffffff, trim: 0x8fb1f5, sky: 0xffffff, ground: 0x9db8f0, hemi: 1.5, glow: 2.2, sun: 0.9, lamp: 0xffffff,
    stone: 0xf4e8cf, grass: 0xaee3b6, water: 0x6fb2fb, path: 0xe8d2ac, deck: 0xdfe6fb, road: 0x6b7390, glass: 0x9cc4ff, glassEm: 0x000000, glassI: 0, stars: false },
  dark: { bg: 0x2a2055, fog: 0x4b3a86, skyTop: 0x150f3a, skyHor: 0x9a6bbd, wall: 0x4a3f86, floor: 0x2d2658, ceil: 0x3a3170, trim: 0x9a7afb, sky: 0xd4c8ff, ground: 0x3a2f6e, hemi: 1.2, glow: 4, sun: 0.45, lamp: 0xe3d9ff,
    stone: 0xd9bf94, grass: 0x2f6a5a, water: 0x3a5fd0, path: 0xa88460, deck: 0x4a3f86, road: 0x2a2750, glass: 0xffd88a, glassEm: 0xffb84a, glassI: 0.85, stars: true },
};
const std = (c, r = 0.92) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0 });
const mats = {
  wall: std(0xffffff), floor: std(0xffffff), ceil: std(0xffffff), trim: std(0xffffff), lamp: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  stone: std(0xffffff, 0.85), grass: std(0xffffff, 1), water: new THREE.MeshStandardMaterial({ color: 0x6fb2fb, roughness: 0.12, metalness: 0.05, emissive: 0x1a4aa0, emissiveIntensity: 0.25 }),
  path: std(0xffffff, 0.95), deck: std(0xffffff), road: std(0xffffff, 1), glass: new THREE.MeshStandardMaterial({ color: 0x9cc4ff, roughness: 0.15, metalness: 0.1, emissive: 0x000000 }),
  glassRail: new THREE.MeshStandardMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.35, roughness: 0.1 }),
  skyline: std(0xb9c8f0, 1), cloud: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 }),
};
const tintFloors = [];
let theme = 'light';
function applyTheme(name) {
  theme = name; const p = PAL[name];
  document.documentElement.setAttribute('data-theme', name);
  scene.background = new THREE.Color(p.bg);
  if (!scene.fog) scene.fog = new THREE.Fog(p.fog, 14, 46); scene.fog.color.setHex(p.fog);
  mats.wall.color.setHex(p.wall); mats.floor.color.setHex(p.floor); mats.ceil.color.setHex(p.ceil); mats.trim.color.setHex(p.trim); mats.lamp.color.setHex(p.lamp);
  mats.stone.color.setHex(p.stone); mats.grass.color.setHex(p.grass); mats.water.color.setHex(p.water); mats.path.color.setHex(p.path); mats.deck.color.setHex(p.deck); mats.road.color.setHex(p.road);
  mats.glass.color.setHex(p.glass); mats.glass.emissive.setHex(p.glassEm); mats.glass.emissiveIntensity = p.glassI;
  hemi.color.setHex(p.sky); hemi.groundColor.setHex(p.ground); hemi.intensity = p.hemi; glow.intensity = p.glow;
  mats.skyline.color.setHex(name === 'dark' ? 0x3a2f78 : 0xb9c8f0); mats.cloud.color.setHex(name === 'dark' ? 0x6a58aa : 0xffffff); mats.cloud.opacity = name === 'dark' ? 0.55 : 0.92;
  paintSky(p.skyTop, p.skyHor); stars.visible = p.stars; moon.visible = p.stars; sunBall.visible = !p.stars;
  tintFloors.forEach((f) => f.mat.color.setHex(p.floor).lerp(new THREE.Color(f.tint), name === 'light' ? 0.22 : 0.16));
  try { localStorage.setItem('theme', name); } catch (e) {}
  if (window.__miniDraw) window.__miniDraw();
  const m = $('metaTheme'); if (m) m.setAttribute('content', name === 'dark' ? '#9A7AFB' : '#70A1FC');
  if (window.__applyEnv) window.__applyEnv(true);
}

/* ============================== helpers ================================ */
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitPlane = new THREE.PlaneGeometry(1, 1);
const colliders = [];
const doors = [];
const spaces = [];       // { x0,x1,z0,z1, level, name, kind, id }
const pictures = [];
const interactMeshes = [];
const roomInfo = {};
const ramps = [];
const POPS = {};         // key -> popup content for pictures that are not rooms
const anim = { jets: [], cars: [] };
const cmatCache = {}, rbCache = {};
const cmat = (c) => cmatCache[c] || (cmatCache[c] = std(c));
const rbGeo = (w, h, d, r) => { const k = [w, h, d, r].join('|'); return rbCache[k] || (rbCache[k] = new RoundedBoxGeometry(w, h, d, 3, r)); };
const glowMat = (c) => new THREE.MeshBasicMaterial({ color: c });
const warm = glowMat(0xffe3a6);
const ALL = [0, 1, 2, 3, 4, 5];

function addCollider(cx, cz, w, d, lv) { const c = { x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, lv: lv || [buildLevel] }; colliders.push(c); return c; }
function addWall(cx, cz, w, d, y0, h, mat, collide = true, lv) {
  const m = new THREE.Mesh(unitBox, mat); m.scale.set(w, h, d); m.position.set(cx, y0 + h / 2, cz); parent.add(m);
  if (collide) addCollider(cx, cz, w, d, lv);
  return m;
}
function addFlat(cx, cz, w, d, y, mat, up) {
  const m = new THREE.Mesh(unitPlane, mat); m.rotation.x = up ? -Math.PI / 2 : Math.PI / 2; m.scale.set(w, d, 1); m.position.set(cx, y, cz); parent.add(m); return m;
}
const _d = new THREE.Object3D();
function inst(geo, mat, items) {
  const m = new THREE.InstancedMesh(geo, mat, items.length);
  items.forEach((it, i) => {
    _d.position.set(it.x, it.y, it.z); _d.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0); _d.scale.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1); _d.updateMatrix();
    m.setMatrixAt(i, _d.matrix); if (it.c !== undefined) m.setColorAt(i, new THREE.Color(it.c));
  });
  m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  parent.add(m); return m;
}
const slabMats = [mats.wall, mats.wall, mats.floor, mats.ceil, mats.wall, mats.wall];
const deckMats = [mats.wall, mats.wall, mats.deck, mats.ceil, mats.wall, mats.wall];
function slabPiece(x0, x1, z0, z1, ms) {
  if (x1 - x0 < 0.01 || z1 - z0 < 0.01) return;
  const m = new THREE.Mesh(unitBox, ms); m.scale.set(x1 - x0, 0.4, z1 - z0); m.position.set((x0 + x1) / 2, -0.2, (z0 + z1) / 2); parent.add(m);
}
function slab(x0, x1, z0, z1, hole, ms = slabMats) {
  if (!hole) return slabPiece(x0, x1, z0, z1, ms);
  const [hx0, hx1, hz0, hz1] = hole;
  slabPiece(x0, x1, z0, hz0, ms); slabPiece(x0, x1, hz1, z1, ms); slabPiece(x0, hx0, hz0, hz1, ms); slabPiece(hx1, x1, hz0, hz1, ms);
}
function startFloor(l) { const g = new THREE.Group(); g.position.y = l * FH; world.add(g); floorGroups[l] = g; parent = g; buildLevel = l; return g; }

function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function labelTexture(title, sub, w = 640, h = 170, opts = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const bg = opts.bg || '#ffffff', fg = opts.fg || '#1b2340', ac = opts.ac || '#5B8DF5';
  g.fillStyle = bg; rr(g, 0, 0, w, h, 28); g.fill();
  g.fillStyle = ac; rr(g, 0, 0, 16, h, 8); g.fill();
  g.fillStyle = fg; g.textBaseline = 'middle';
  g.font = '800 ' + (sub ? Math.round(h * 0.34) : Math.round(h * 0.42)) + 'px Inter, system-ui, sans-serif';
  g.fillText(title, 44, sub ? h * 0.38 : h / 2, w - 70);
  if (sub) { g.fillStyle = opts.subc || '#5a6694'; g.font = '600 ' + Math.round(h * 0.22) + 'px Inter, system-ui, sans-serif'; g.fillText(sub, 44, h * 0.74, w - 70); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function labelPlane(title, sub, w, h, opts) {
  const m = new THREE.Mesh(unitPlane, new THREE.MeshBasicMaterial({ map: labelTexture(title, sub, 640, Math.round(640 * h / w), opts), transparent: true }));
  m.scale.set(w, h, 1); return m;
}
function wrapText(g, text, x, y, maxW, lh) {
  const words = text.split(' '); let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y); y += lh; line = w; } else line = t; }
  g.fillText(line, x, y); return y + lh;
}
/** A rules poster. lines: array of strings. */
function posterPlane(title, lines, w, h, ac = '#5B8DF5', floor = false) {
  const cw = 768, ch = Math.round(768 * h / w), c = document.createElement('canvas'); c.width = cw; c.height = ch; const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; rr(g, 0, 0, cw, ch, 36); g.fill();
  g.fillStyle = ac; rr(g, 0, 0, cw, 22, 11); g.fill();
  g.strokeStyle = ac; g.lineWidth = 6; rr(g, 14, 14, cw - 28, ch - 28, 28); g.stroke();
  g.fillStyle = '#1b2340'; g.textBaseline = 'alphabetic'; g.font = '800 54px Inter, system-ui, sans-serif'; g.fillText(title, 44, 108);
  g.font = '700 31px Inter, system-ui, sans-serif'; let y = 172;
  lines.forEach((ln, i) => {
    g.fillStyle = ac; g.beginPath(); g.arc(62, y - 10, 19, 0, 7); g.fill();
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.font = '800 24px Inter, system-ui, sans-serif'; g.fillText(String(i + 1), 62, y - 1); g.textAlign = 'left';
    g.fillStyle = '#1b2340'; g.font = '700 31px Inter, system-ui, sans-serif'; y = wrapText(g, ln, 100, y, cw - 150, 38) + 18;
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = new THREE.Mesh(unitPlane, new THREE.MeshBasicMaterial({ map: t, transparent: true })); m.scale.set(w, h, 1); return m;
}

// blob shadow
const blobTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(30,20,80,.38)'); gr.addColorStop(1, 'rgba(30,20,80,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
})();
const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false });
function blob(g, x, z, w, d) { const m = new THREE.Mesh(unitPlane, blobMat); m.rotation.x = -Math.PI / 2; m.scale.set(w, d, 1); m.position.set(x, 0.006, z); g.add(m); }

/* props primitives (group-local, y = bottom). g.userData.col marks a collidable group */
function rb(g, w, h, d, x, y, z, color, rot = 0, r = 0.05) {
  const m = new THREE.Mesh(rbGeo(w, h, d, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)), cmat(color));
  m.position.set(x, y + h / 2, z); m.rotation.y = rot; g.add(m);
  if (g.userData.col && ((h >= 0.3 && w * d >= 0.2) || w * d >= 0.8 || (h >= 1.5 && Math.max(w, d) >= 0.6))) m.userData.col = true;
  return m;
}
function cyl(g, r, h, x, y, z, color, seg = 24) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), typeof color === 'object' ? color : cmat(color)); m.position.set(x, y + h / 2, z); g.add(m); if (g.userData.col && r >= 0.3 && h >= 0.3) m.userData.col = true; return m; }
function sph(g, r, x, y, z, color, sy = 1) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), typeof color === 'object' ? color : cmat(color)); m.scale.y = sy; m.position.set(x, y + r * sy, z); g.add(m); if (g.userData.col && r >= 0.45 && sy > 0.5) m.userData.col = true; return m; }
/** Register colliders for flagged meshes in a group. skip = {x,z}: ignore anything within 1 m of that point (room entry). */
function collect(g, lv, skip) {
  g.updateWorldMatrix(true, true);
  const out = [], b = new THREE.Box3();
  g.traverse((m) => {
    if (!m.isMesh || !m.userData.col) return;
    b.setFromObject(m);
    if (skip && b.max.x > skip.x - 1 && b.min.x < skip.x + 1 && b.max.z > skip.z - 1 && b.min.z < skip.z + 1) return;
    const c = { x0: b.min.x, x1: b.max.x, z0: b.min.z, z1: b.max.z, lv: [lv], p: true }; colliders.push(c); out.push(c);
  });
  return out;
}

/* ============================== pictures =============================== */
const loader = new THREE.TextureLoader();
const texCache = new Map();
function getTex(url) {
  if (texCache.has(url)) { const e = texCache.get(url); e.refs++; return e.promise; }
  const e = { refs: 1, tex: null, promise: null };
  e.promise = new Promise((res) => loader.load(url, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; e.tex = t; res(t); }, undefined, () => res(null)));
  texCache.set(url, e); return e.promise;
}
function dropTex(url) { const e = texCache.get(url); if (!e) return; e.refs--; if (e.refs <= 0) { if (e.tex) e.tex.dispose(); texCache.delete(url); } }

/** A framed picture. key: id of the room (or a POPS key) opened by clicking it. */
function addPicture(g0, { w, h, src, tint, key, pos, rotY = 0, border = 0.07 }) {
  const g = new THREE.Group(); g.position.copy(pos); g.rotation.y = rotY; g0.add(g);
  const tc = TINTS[tint] || tint;
  const back = new THREE.Mesh(rbGeo(w + border * 2, h + border * 2, 0.06, 0.03), cmat(tc)); back.position.z = 0.03; g.add(back);
  const mat = new THREE.MeshBasicMaterial({ color: 0xe9eefc });
  const plane = new THREE.Mesh(unitPlane, mat); plane.scale.set(w, h, 1); plane.position.z = 0.062; g.add(plane);
  back.userData.key = key; plane.userData.key = key;
  interactMeshes.push(back, plane);
  const rec = { plane, mat, src, loaded: false, loading: false, pos: new THREE.Vector3(), group: g };
  pictures.push(rec); g.userData.rec = rec; return g;
}
function finishPictures() { scene.updateMatrixWorld(true); pictures.forEach((p) => p.plane.getWorldPosition(p.pos)); }
function updateTextures(px, py, pz) {
  for (const p of pictures) {
    const d = Math.hypot(p.pos.x - px, (p.pos.y - py) * 5, p.pos.z - pz);
    if (d < 17 && !p.loaded && !p.loading) {
      p.loading = true;
      getTex(p.src).then((t) => { p.loading = false; if (!t) return; p.mat.map = t; p.mat.color.setHex(0xffffff); p.mat.needsUpdate = true; p.loaded = true; });
    } else if (d > 32 && p.loaded) {
      p.mat.map = null; p.mat.color.setHex(0xe9eefc); p.mat.needsUpdate = true; p.loaded = false; dropTex(p.src);
    }
  }
}
const S = (name) => 'assets/small/' + name + '.webp';

/* ============================== doors ================================== */
function addDoor({ wx, wz, normal, tint, title, sub, dw = DOOR_W, dh = DOOR_H, fixed = false, plate = true, double = false, gold = false }) {
  const tc = TINTS[tint] || tint || '#5B8DF5';
  const lv = buildLevel;
  const nAxisX = Math.abs(normal[0]) > 0.5;
  const tang = nAxisX ? [0, 1] : [1, 0];
  const tm = gold ? cmat(0xd9a93e) : cmat(typeof tc === 'string' && tc[0] === '#' ? tc : tc);
  const trimW = 0.1, trimD = T + 0.06;
  [-1, 1].forEach((sgn) => {
    const m = new THREE.Mesh(unitBox, tm); m.scale.set(nAxisX ? trimD : trimW, dh + 0.1, nAxisX ? trimW : trimD);
    m.position.set(wx + tang[0] * sgn * (dw / 2 + trimW / 2), (dh + 0.1) / 2, wz + tang[1] * sgn * (dw / 2 + trimW / 2)); parent.add(m);
  });
  const top = new THREE.Mesh(unitBox, tm); top.scale.set(nAxisX ? trimD : dw + trimW * 2, 0.1, nAxisX ? dw + trimW * 2 : trimD); top.position.set(wx, dh + 0.05, wz); parent.add(top);
  const mk = (cxo, w) => {
    const leaf = new THREE.Mesh(unitBox, cmat(gold ? 0x7a4a2a : (typeof tc === 'string' ? tc : tc)));
    leaf.scale.set(nAxisX ? 0.09 : w, dh, nAxisX ? w : 0.09); leaf.position.set(wx + tang[0] * cxo, dh / 2, wz + tang[1] * cxo); parent.add(leaf);
    return leaf;
  };
  const leaves = [];
  if (double) {
    const w = dw / 2 - 0.03;
    [-1, 1].forEach((s) => { const l = mk(s * dw / 4, w); leaves.push({ leaf: l, base: l.position.clone(), off: new THREE.Vector3(tang[0] * s * (dw / 2 - 0.1), 0, tang[1] * s * (dw / 2 - 0.1)) }); });
  } else {
    const l = mk(0, dw - 0.04); leaves.push({ leaf: l, base: l.position.clone(), off: new THREE.Vector3(tang[0] * (dw - 0.1), 0, tang[1] * (dw - 0.1)) });
  }
  doors.push({ leaves, cx: wx, cz: wz, k: 0, lv, fixed, dw });
  if (fixed) addCollider(wx, wz, nAxisX ? T : dw, nAxisX ? dw : T, [lv]);
  if (plate && title) {
    const p = labelPlane(title, sub, Math.max(2.1, Math.min(3, dw + 0.6)), 0.58, { ac: typeof tc === 'string' ? tc : '#5B8DF5' });
    p.position.set(wx + normal[0] * (T / 2 + 0.025), (dh + H) / 2 + 0.02, wz + normal[1] * (T / 2 + 0.025));
    p.lookAt(p.position.x + normal[0], p.position.y, p.position.z + normal[1]); parent.add(p);
  }
}

/* ============================== rooms ================================== */
const BOYS = new Set(['wondermayank', 'aahan', 'rohit', 'raj', 'rohan']);
const C = { white: 0xffffff, soft: 0xdfe8ff, lav: 0xd9d0ff, wood: 0xcfd8f5, deep: 0x5a4fb0, blue: 0x6f9bf7, dark: 0x2a2f55 };
function buildRoom(id, cx, cz, dv, sx, sz) {
  const room = ROOMS[id], lvl = buildLevel;
  const g = new THREE.Group(); g.position.set(cx, 0, cz); g.rotation.y = Math.atan2(dv[0], dv[1]); parent.add(g);
  const tc = TINTS[room.tint];
  const fmat = std(0xffffff, 0.95); tintFloors.push({ mat: fmat, tint: tc });
  const fl = new THREE.Mesh(unitPlane, fmat); fl.rotation.x = -Math.PI / 2; fl.scale.set(sx, sz, 1); fl.position.y = 0.002; g.add(fl);
  const lamp = new THREE.Mesh(unitBox, mats.lamp); lamp.scale.set(Math.min(sx * 0.3, 1.6), 0.04, Math.min(sz * 0.25, 1.2)); lamp.position.set(0, H - 0.03, 0); g.add(lamp);
  const bb = (w, d, x, z) => { const m = new THREE.Mesh(unitBox, cmat(tc)); m.scale.set(w, 0.12, d); m.position.set(x, 0.06, z); g.add(m); };
  bb(sx, 0.05, 0, -sz / 2 + 0.03); bb(0.05, sz, -sx / 2 + 0.03, 0); bb(0.05, sz, sx / 2 - 0.03, 0);
  const props = new THREE.Group(); props.userData.col = true; g.add(props);
  const back = -sz / 2 + 0.04, leftWall = -sx / 2 + 0.04;
  const alongX = Math.abs(dv[0]) > 0.5;
  const entry = { x: cx + dv[0] * (sz / 2 - 0.9), z: cz + dv[1] * (sz / 2 - 0.9), face: [-dv[0], -dv[1]] };
  const nameplate = (y, w, title, sub) => { const p = labelPlane(title, sub, w, 0.42, { ac: tc }); p.position.set(0, y, back + 0.01); g.add(p); };
  const portrait = (mid, size, x, y, z, rotY) => addPicture(g, { w: size, h: size, src: 'assets/' + MEMBERS[mid].file + '.webp', tint: room.tint, key: id, pos: new THREE.Vector3(x, y, z), rotY });
  const illus = (w, x, y, z, rotY) => addPicture(g, { w, h: w * 9 / 16, src: S('room-' + id), tint: room.tint, key: id, pos: new THREE.Vector3(x, y, z), rotY });
  const cols = [];

  if (room.kind === 'personal') {
    const L = -sx / 2, Rt = sx / 2, front = sz / 2, bk = -sz / 2;
    const xp = L + 1.8, zb = bk + 3.4, zd = front - 1.9, dwid = 1.2, bz = zb + 1.5;
    const th = Math.atan2(dv[0], dv[1]), cs = Math.cos(th), sn = Math.sin(th);
    const lc = (lx, lz, w, d) => { const wx = cx + lx * cs + lz * sn, wz = cz - lx * sn + lz * cs; const sw = Math.abs(sn) > 0.5; cols.push(addCollider(wx, wz, sw ? d : w, sw ? w : d, [lvl])); };
    const wallBox = (w, h, d, x, y, z, col) => { const m = new THREE.Mesh(unitBox, mats.wall); m.scale.set(w, h, d); m.position.set(x, y + h / 2, z); g.add(m); if (col) lc(x, z, w, d); };
    // partition between the bedroom and the dress corridor, with a doorway
    const zA = zb - 0.1;
    wallBox(0.2, H, zd - dwid / 2 - zA, xp, 0, (zA + zd - dwid / 2) / 2, true);
    wallBox(0.2, H, front - (zd + dwid / 2), xp, 0, (zd + dwid / 2 + front) / 2, true);
    wallBox(0.2, H - DOOR_H, dwid, xp, DOOR_H, zd, false);
    // wall in front of the bathroom (the dress corridor continues into the bathroom on the left)
    wallBox(Rt - xp + 0.1, H, 0.2, (xp - 0.1 + Rt) / 2, 0, zb, true);
    const pb = zb + 0.1;
    portrait(room.member, 1.5, xp + (Rt - xp) * 0.32, 1.7, pb, 0);
    const np = labelPlane(room.title, room.sub + '  /  Personal room', 2.2, 0.42, { ac: tc }); np.position.set(xp + (Rt - xp) * 0.32, 2.8, pb + 0.01); g.add(np);
    illus(2.4, Rt - 0.04, 1.95, bz, -Math.PI / 2);
    const bl = labelPlane('Dress room and bathroom', null, 1.5, 0.28, { ac: tc }); bl.position.set(xp + 0.11, 2.6, zd); bl.rotation.y = Math.PI / 2; g.add(bl);
    const btz = bk + 0.1 + 1.25;
    if (BATH_IMAGES.includes(id)) {
      addPicture(g, { w: 1.3, h: 1.4, src: S('bath-' + id), tint: room.tint, key: 'bath:' + id, pos: new THREE.Vector3(Rt - 0.04, 1.7, btz), rotY: -Math.PI / 2 });
      POPS['bath:' + id] = { img: 'assets/bath-' + id + '.webp', title: room.title + "'s bathroom", tag: 'Bathroom', tint: room.tint, why: 'A big private bathroom with a bathtub, a shower, a mirror and a changing room, with the dress storage in the corridor just outside.', who: [room.member] };
    }
    propsPersonal(props, sx, sz, tc, { xp, zb, zd, bz, btz, boy: BOYS.has(id) });
  } else if (id === 'living') {
    illus(4.6, 0, 1.95, back, 0);
    nameplate(0.5, 2.4, room.title, 'Where we meet, eat and play');
    LIFE_PHOTOS.forEach((n, i) => {
      const left = i < 3, zz = -2.4 + (i % 3) * 2.4;
      addPicture(g, { w: 1.5, h: 1.1, src: S(n), tint: room.tint, key: id, pos: new THREE.Vector3(left ? leftWall : sx / 2 - 0.04, 1.8, zz), rotY: left ? Math.PI / 2 : -Math.PI / 2 });
    });
    propsLiving(props, sx, sz, tc);
  } else {
    if (!room.noPics) {
      illus(3.2, 0, 1.8, back, 0);
      nameplate(0.55, 2.2, room.title, room.blurb.length > 38 ? room.tag : room.blurb);
      const members = room.who.filter((w) => MEMBERS[w]);
      members.forEach((mid, i) => {
        const span = Math.min(sz - 1.6, members.length * 1.5);
        const zz = members.length === 1 ? -0.3 : -span / 2 + (i + 0.5) * (span / members.length);
        portrait(mid, 1.05, leftWall, 1.7, zz, Math.PI / 2);
      });
    } else nameplate(0.9, 2.4, room.title, room.tag);
    (PROPS[room.props] || (() => {}))(props, sx, sz, tc);
    fillers(props, sx, sz, tc, room.noPics);
  }
  const cs2 = collect(props, lvl, entry);
  roomInfo[id] = { id, level: lvl, cx, cz, dv, sx, sz, group: g, props, entry, cols: cs2.concat(cols) };
  const hx = (alongX ? sz : sx) / 2, hz = (alongX ? sx : sz) / 2;
  spaces.push({ x0: cx - hx, x1: cx + hx, z0: cz - hz, z1: cz + hz, level: lvl, name: room.title, kind: 'room', id });
  return roomInfo[id];
}

/* ---- placeholder props (replace with your own .glb, see prompt.txt) ---- */
function propsPersonal(g, sx, sz, tc, o) {
  const L = -sx / 2, Rt = sx / 2, front = sz / 2, back = -sz / 2, { xp, zb, zd, bz, btz } = o;
  const accent = o.boy ? 0x6f9bf7 : 0xe8a0c8, light = new THREE.Color(tc).lerp(new THREE.Color(0xffffff), 0.6).getHex();
  const mid = (xp + Rt) / 2;
  // ---------- bedroom (right of the partition) ----------
  cyl(g, 1.5, 0.03, mid, 0, 1.9, light);                                                   // rug
  rb(g, 2.1, 0.38, 1.6, Rt - 1.2, 0, bz, C.white, 0, 0.1);                                  // bed base, head on the right wall
  rb(g, 2.0, 0.18, 1.5, Rt - 1.25, 0.38, bz, tc, 0, 0.08);                                  // blanket
  rb(g, 0.1, 0.9, 1.7, Rt - 0.12, 0, bz, C.soft, 0, 0.04);                                  // headboard
  rb(g, 0.5, 0.14, 0.6, Rt - 0.55, 0.55, bz - 0.45, C.white, 0, 0.06); rb(g, 0.5, 0.14, 0.6, Rt - 0.55, 0.55, bz + 0.45, C.white, 0, 0.06);
  rb(g, 0.5, 0.5, 0.5, Rt - 0.4, 0, bz + 1.15, C.soft, 0, 0.05); cyl(g, 0.12, 0.3, Rt - 0.4, 0.5, bz + 1.15, tc);
  rb(g, 0.5, 0.5, 0.5, Rt - 0.4, 0, bz - 1.15, C.soft, 0, 0.05);
  // study table on the right wall, chair, laptop, books
  const dz = front - 1.9;
  rb(g, 0.8, 0.06, 2.0, Rt - 0.5, 0.74, dz, C.white); rb(g, 0.06, 0.74, 1.8, Rt - 0.15, 0, dz, C.soft); rb(g, 0.06, 0.74, 1.8, Rt - 0.85, 0, dz, C.soft);
  rb(g, 0.04, 0.4, 0.55, Rt - 0.3, 0.8, dz - 0.1, C.dark, 0, 0.01); rb(g, 0.45, 0.02, 0.35, Rt - 0.62, 0.8, dz - 0.1, C.dark, 0, 0.01);
  rb(g, 0.3, 0.2, 0.25, Rt - 0.4, 0.8, dz + 0.7, tc, 0, 0.02); rb(g, 0.3, 0.12, 0.25, Rt - 0.4, 1.0, dz + 0.7, 0xf0a63a, 0, 0.02);
  rb(g, 0.5, 0.08, 0.5, Rt - 1.45, 0.45, dz, tc, 0, 0.05); rb(g, 0.08, 0.55, 0.5, Rt - 1.68, 0.45, dz, tc, 0, 0.04); cyl(g, 0.04, 0.45, Rt - 1.45, 0, dz, C.dark);
  // bookshelf on the partition
  const bsz = zb + 2.6;
  rb(g, 0.4, 1.9, 1.3, xp + 0.3, 0, bsz, C.soft, 0, 0.04);
  [0.35, 0.8, 1.25, 1.7].forEach((y, i) => rb(g, 0.34, 0.07, 1.2, xp + 0.3, y, bsz, i % 2 ? tc : C.white, 0, 0.01));
  cyl(g, 0.22, 0.4, Rt - 0.4, 0, front - 0.45, C.white); sph(g, 0.36, Rt - 0.4, 0.34, front - 0.45, 0x6fcfb0);
  blob(g, Rt - 1.2, bz, 2.6, 2.1); blob(g, Rt - 0.6, dz, 1.5, 2.3);
  // ---------- dress corridor (left strip): wardrobes along the left wall, mirror, runner, ottoman ----------
  const wcol = o.boy ? 0x5a86ee : accent;
  [-0.6, 0.7, 2.0].forEach((z) => {
    rb(g, 0.6, 2.2, 1.3, L + 0.35, 0, z, wcol, 0, 0.04);
    [-0.32, 0.32].forEach((k) => rb(g, 0.04, 2.0, 0.6, L + 0.68, 0.1, z + k, C.white, 0, 0.01));
    rb(g, 0.05, 0.4, 0.04, L + 0.71, 1.0, z - 0.05, 0xf0a63a, 0, 0.01); rb(g, 0.05, 0.4, 0.04, L + 0.71, 1.0, z + 0.05, 0xf0a63a, 0, 0.01);
  });
  const sm = new THREE.Mesh(unitBox, new THREE.MeshStandardMaterial({ color: 0xe9f4ff, roughness: 0.05, metalness: 0.5 })); sm.scale.set(0.04, 1.9, 2.8); sm.position.set(xp - 0.13, 1.1, 0.35); g.add(sm);
  const runner = new THREE.Mesh(unitPlane, cmat(accent)); runner.rotation.x = -Math.PI / 2; runner.scale.set(0.7, zd + 1.5 - zb, 1); runner.position.set(L + 1.35, 0.012, (front + zb) / 2 - 0.2); g.add(runner);
  rb(g, 0.55, 0.45, 0.55, L + 1.2, 0, front - 0.45, tc, 0, 0.12);
  // ---------- bathroom (back of the room, full width) ----------
  const B = back + 0.1;
  const tile = new THREE.Mesh(unitPlane, cmat(light)); tile.rotation.x = -Math.PI / 2; tile.scale.set(sx - 0.1, zb - back - 0.2, 1); tile.position.set(0, 0.012, (zb + back) / 2); g.add(tile);
  // tub along the right wall
  rb(g, 1.0, 0.62, 2.0, Rt - 0.6, 0, btz, C.white, 0, 0.28);
  const water = new THREE.Mesh(unitPlane, new THREE.MeshStandardMaterial({ color: 0x9fd3ff, roughness: 0.15 })); water.rotation.x = -Math.PI / 2; water.scale.set(0.7, 1.7, 1); water.position.set(Rt - 0.6, 0.58, btz); g.add(water);
  cyl(g, 0.03, 0.5, Rt - 0.6, 0, B + 0.1, 0xbfc7e8);
  // shower stall on the back wall
  const shx = Rt - 2.15;
  rb(g, 1.0, 0.05, 1.0, shx, 0, B + 0.5, light, 0, 0.02);
  const glass = new THREE.Mesh(unitBox, new THREE.MeshStandardMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.35, roughness: 0.1 })); glass.scale.set(1.0, 2.0, 0.04); glass.position.set(shx, 1.0, B + 1.0); g.add(glass);
  cyl(g, 0.03, 1.9, shx, 0, B + 0.08, 0xbfc7e8); sph(g, 0.1, shx, 1.85, B + 0.14, 0xbfc7e8);
  // changing booth in the back-left corner
  const bx = L + 0.75;
  rb(g, 1.4, 0.04, 1.4, bx, 0, B + 0.7, 0xffffff, 0, 0.01);
  rb(g, 0.04, 2.2, 1.4, bx - 0.7, 0, B + 0.7, accent, 0, 0.02); rb(g, 0.04, 2.2, 1.4, bx + 0.7, 0, B + 0.7, accent, 0, 0.02);
  const curt = new THREE.Mesh(unitBox, cmat(tc)); curt.scale.set(0.8, 2.0, 0.05); curt.position.set(bx - 0.3, 1.0, B + 1.4); g.add(curt);
  const cm = new THREE.Mesh(unitBox, new THREE.MeshStandardMaterial({ color: 0xe9f4ff, roughness: 0.05, metalness: 0.5 })); cm.scale.set(0.6, 1.5, 0.03); cm.position.set(bx, 1.2, back + 0.05); g.add(cm);
  rb(g, 0.45, 0.45, 0.45, bx + 0.2, 0, B + 0.5, tc, 0, 0.06);
  // vanity with a big mirror on the back wall
  const vx = (bx + 0.7 + shx - 0.5) / 2;
  rb(g, 1.5, 0.85, 0.55, vx, 0, B + 0.3, C.white, 0, 0.05); rb(g, 1.55, 0.05, 0.6, vx, 0.85, B + 0.3, accent, 0, 0.02);
  const mir = new THREE.Mesh(unitBox, new THREE.MeshStandardMaterial({ color: 0xe9f4ff, roughness: 0.05, metalness: 0.5 })); mir.scale.set(1.3, 1.1, 0.04); mir.position.set(vx, 1.75, back + 0.06); g.add(mir);
  rb(g, 0.2, 0.2, 0.2, vx + 0.4, 0.9, B + 0.3, tc, 0, 0.03);
  cyl(g, 0.55, 0.02, mid + 0.4, 0, zb - 1.0, accent); sph(g, 0.3, Rt - 0.4, 0.34, zb - 0.45, 0x6fcfb0);
  blob(g, Rt - 0.6, btz, 1.6, 2.4);
}
function propsLiving(g, sx, sz, tc) {
  cyl(g, 3.2, 0.03, 0, 0, 0.6, 0xd9d0ff);
  // big sofa facing the picture wall + two armchairs + coffee table
  rb(g, 4.2, 0.45, 1.1, 0, 0, 2.2, 0x6f9bf7, 0, 0.1); rb(g, 4.2, 0.6, 0.3, 0, 0.45, 2.7, 0x5a86ee, 0, 0.1);
  rb(g, 0.3, 0.75, 1.1, -2.25, 0, 2.2, 0x5a86ee, 0, 0.1); rb(g, 0.3, 0.75, 1.1, 2.25, 0, 2.2, 0x5a86ee, 0, 0.1);
  rb(g, 1.2, 0.5, 1.0, -3.6, 0, 0.6, 0xa78bfa, 0, 0.1, ); rb(g, 1.2, 0.5, 1.0, 3.6, 0, 0.6, 0xa78bfa, 0, 0.1);
  rb(g, 1.9, 0.1, 1.0, 0, 0.38, 0.6, 0xcfd8f5); rb(g, 0.1, 0.38, 0.8, -0.8, 0, 0.6, 0xb8c4ee); rb(g, 0.1, 0.38, 0.8, 0.8, 0, 0.6, 0xb8c4ee);
  // dining table with chairs at the back
  rb(g, 2.8, 0.08, 1.2, 0, 0.74, -2.6, 0xffffff); rb(g, 0.1, 0.74, 0.1, -1.3, 0, -2.3, C.soft); rb(g, 0.1, 0.74, 0.1, 1.3, 0, -2.3, C.soft); rb(g, 0.1, 0.74, 0.1, -1.3, 0, -2.9, C.soft); rb(g, 0.1, 0.74, 0.1, 1.3, 0, -2.9, C.soft);
  [-0.9, 0.9].forEach((x) => { rb(g, 0.45, 0.06, 0.45, x, 0.45, -1.8, tc); rb(g, 0.45, 0.06, 0.45, x, 0.45, -3.4, tc); });
  rb(g, 0.4, 0.12, 0.4, -0.5, 0.82, -2.6, 0xf0a63a, 0, 0.04); rb(g, 0.4, 0.12, 0.4, 0.5, 0.82, -2.6, 0xe8679a, 0, 0.04);
  sph(g, 0.55, -4.9, 0, -1.6, 0x8b6bff, 0.7); sph(g, 0.55, 4.8, 0, -1.2, 0xe8679a, 0.7);
  [[-1, -1], [1, -1], [1, 1]].forEach(([a, b]) => { cyl(g, 0.3, 0.5, a * (sx / 2 - 0.6), 0, b * (sz / 2 - 0.6), 0xffffff); sph(g, 0.5, a * (sx / 2 - 0.6), 0.45, b * (sz / 2 - 0.6), 0x6fcfb0); });
  blob(g, 0, 2.2, 4.6, 1.5);
}
function fillers(g, sx, sz, tc, quiet) {
  [[-1, -1], [1, -1]].forEach(([a, b]) => { cyl(g, 0.3, 0.5, a * (sx / 2 - 0.5), 0, b * (sz / 2 - 0.5), 0xffffff); sph(g, 0.5, a * (sx / 2 - 0.5), 0.45, b * (sz / 2 - 0.5), 0x6fcfb0); });
}
const PROPS = {
  singing(g, sx, sz, tc) {
    rb(g, 4.2, 0.22, 2.2, 0, 0, -2.2, 0xd9d0ff, 0, 0.08);
    [-0.8, 0.8].forEach((x) => { cyl(g, 0.03, 1.5, x, 0.22, -2.0, C.dark); sph(g, 0.07, x, 1.72, -2.0, C.dark); });
    rb(g, 0.6, 1.2, 0.5, -2.6, 0.22, -2.4, C.dark); rb(g, 0.6, 1.2, 0.5, 2.6, 0.22, -2.4, C.dark);
    rb(g, 3.0, 0.45, 1.0, 0, 0, 2.2, 0x6f9bf7, 0, 0.1); rb(g, 3.0, 0.6, 0.28, 0, 0.45, 2.65, 0x5a86ee, 0, 0.1);
    cyl(g, 0.22, 0.5, sx / 2 - 0.8, 0, 0.5, tc); cyl(g, 0.22, 0.5, sx / 2 - 0.8, 0, 1.2, tc);
    blob(g, 0, -2.2, 4.4, 2.6);
  },
  creativity(g, sx, sz, tc) {
    rb(g, 3.0, 0.08, 1.4, 0.8, 0.74, -0.4, 0xffffff);
    [[-1.3, -0.5], [1.3, -0.5], [-1.3, 0.5], [1.3, 0.5]].forEach(([x, z]) => rb(g, 0.08, 0.74, 0.08, 0.8 + x, 0, -0.4 + z, C.soft));
    ['b', 'v', 'p', 'a', 'g'].forEach((k, i) => rb(g, 0.22, 0.22, 0.22, -0.2 + i * 0.5, 0.82, -0.4 + (i % 2 ? 0.2 : -0.2), TINTS[k], i, 0.04));
    rb(g, 1.2, 1.4, 0.05, -2.2, 0.6, -2.6, 0xffffff); rb(g, 0.06, 2.0, 0.06, -2.7, 0, -2.6, C.wood); rb(g, 0.06, 2.0, 0.06, -1.7, 0, -2.6, C.wood);
    sph(g, 0.5, 3.0, 0, 1.8, 0xe8679a, 0.7); sph(g, 0.5, 1.6, 0, 2.4, 0x8b6bff, 0.7); sph(g, 0.5, -1.6, 0, 2.2, 0x60a5fa, 0.7);
    blob(g, 0.8, -0.4, 3.4, 1.8);
  },
  designer(g, sx, sz, tc) {
    [-2.4, -0.8, 0.8, 2.4].forEach((z) => {
      rb(g, 0.75, 0.06, 1.3, sx / 2 - 0.5, 0.72, z, 0xffffff); rb(g, 0.06, 0.72, 1.1, sx / 2 - 0.5, 0, z, C.soft);
      rb(g, 0.04, 0.45, 0.8, sx / 2 - 0.25, 0.95, z, C.dark); rb(g, 0.4, 0.04, 0.4, sx / 2 - 0.35, 0.78, z, C.dark, 0.3);
      rb(g, 0.45, 0.08, 0.45, sx / 2 - 1.3, 0.45, z, tc); rb(g, 0.08, 0.5, 0.45, sx / 2 - 1.5, 0.45, z, tc);
    });
    rb(g, 2.6, 0.08, 1.2, -1.2, 0.74, 0.2, 0xffffff); rb(g, 0.1, 0.74, 1.0, -2.4, 0, 0.2, C.soft); rb(g, 0.1, 0.74, 1.0, 0, 0, 0.2, C.soft);
    cyl(g, 1.6, 0.03, -1.2, 0, 0.2, 0xd9d0ff);
  },
  tech(g, sx, sz, tc) {
    [-3.6, -1.8, 0, 1.8, 3.6].forEach((z) => {
      rb(g, 0.75, 0.06, 1.4, sx / 2 - 0.5, 0.72, z, 0xffffff); rb(g, 0.06, 0.72, 1.2, sx / 2 - 0.5, 0, z, C.soft);
      rb(g, 0.04, 0.45, 0.8, sx / 2 - 0.25, 0.95, z, C.dark);
      rb(g, 0.45, 0.08, 0.45, sx / 2 - 1.3, 0.45, z, tc); rb(g, 0.08, 0.5, 0.45, sx / 2 - 1.5, 0.45, z, tc);
    });
    rb(g, 0.8, 1.9, 0.7, -3.2, 0, -sz / 2 + 0.6, C.dark);
    [0.5, 0.9, 1.3, 1.7].forEach((y, i) => { const m = new THREE.Mesh(unitBox, glowMat(i % 2 ? 0x5be0a0 : 0x7aa8ff)); m.scale.set(0.6, 0.05, 0.02); m.position.set(-3.2, y, -sz / 2 + 0.96); g.add(m); });
    rb(g, 2.4, 0.08, 1.2, -2.0, 0.74, 1.0, 0xffffff); rb(g, 0.1, 0.74, 1.0, -3.1, 0, 1.0, C.soft); rb(g, 0.1, 0.74, 1.0, -0.9, 0, 1.0, C.soft);
    cyl(g, 1.5, 0.03, -2.0, 0, 1.0, 0xd9d0ff);
  },
  dancing(g, sx, sz, tc) {
    const m = rb(g, 0.06, 2.1, sz - 2.6, sx / 2 - 0.05, 0.1, -0.2, 0xcfe3ff); m.material = new THREE.MeshStandardMaterial({ color: 0xcfe3ff, roughness: 0.12, metalness: 0.6 });
    const bar = cyl(g, 0.03, sz - 3, 0, 0, 0, C.dark); bar.rotation.x = Math.PI / 2; bar.position.set(sx / 2 - 0.4, 1.0, -0.2);
    rb(g, 0.6, 1.2, 0.5, -2.2, 0, -sz / 2 + 0.5, C.dark); rb(g, 0.6, 1.2, 0.5, 2.2, 0, -sz / 2 + 0.5, C.dark);
    rb(g, 2.0, 0.4, 0.5, 0, 0, sz / 2 - 0.6, tc);
    const wf = new THREE.Mesh(unitPlane, cmat(0xe7d9ff)); wf.rotation.x = -Math.PI / 2; wf.scale.set(sx - 1.6, sz - 2, 1); wf.position.set(-0.4, 0.006, -0.3); g.add(wf);
  },
  ca(g, sx, sz, tc) {
    rb(g, 2.4, 0.06, 1.0, 0.4, 0.74, -1.4, 0xffffff); rb(g, 0.06, 0.74, 0.8, -0.75, 0, -1.4, C.soft); rb(g, 0.06, 0.74, 0.8, 1.55, 0, -1.4, C.soft);
    rb(g, 0.8, 0.45, 0.04, 0.4, 0.82, -1.65, C.dark);
    rb(g, 0.5, 0.08, 0.5, 0.4, 0.45, -2.3, tc); rb(g, 0.5, 0.5, 0.08, 0.4, 0.45, -2.52, tc);
    rb(g, 0.5, 0.08, 0.5, -0.3, 0.45, -0.5, 0x5a86ee); rb(g, 0.5, 0.08, 0.5, 1.1, 0.45, -0.5, 0x5a86ee);
    rb(g, 0.45, 1.8, 3.2, sx / 2 - 0.3, 0, -0.8, 0xdfe8ff);
    ['b', 'v', 'a', 'p', 'g', 't'].forEach((k, i) => rb(g, 0.1, 0.3, 0.3, sx / 2 - 0.3, 0.45 + (i % 3) * 0.5, -1.8 + Math.floor(i / 3) * 1.3 + (i % 3) * 0.15, TINTS[k], 0, 0.02));
    // client waiting corner
    rb(g, 2.4, 0.45, 0.9, -2.8, 0, 2.6, 0x6f9bf7, 0, 0.1); rb(g, 2.4, 0.6, 0.25, -2.8, 0.45, 3.0, 0x5a86ee, 0, 0.1); rb(g, 0.9, 0.35, 0.9, -2.8, 0, 1.3, 0xcfd8f5, 0, 0.08);
    cyl(g, 1.6, 0.03, 0.4, 0, -1.2, 0xd9d0ff);
    blob(g, 0.4, -1.4, 3.0, 1.6);
  },
  rest(g, sx, sz, tc) {
    // 4 day beds along the back wall, sofas and beanbags in front
    [-3.9, -1.3, 1.3, 3.9].forEach((x, i) => {
      rb(g, 2.1, 0.4, 1.1, x, 0, -sz / 2 + 0.8, C.white, 0, 0.1); rb(g, 2.0, 0.16, 1.0, x, 0.4, -sz / 2 + 0.8, i % 2 ? 0xa78bfa : 0x60a5fa, 0, 0.08);
      rb(g, 0.5, 0.12, 0.7, x - 0.7, 0.56, -sz / 2 + 0.8, C.white, 0, 0.06);
    });
    rb(g, 3.2, 0.45, 1.0, -2.2, 0, 1.4, 0x6f9bf7, 0, 0.1); rb(g, 3.2, 0.6, 0.28, -2.2, 0.45, 1.85, 0x5a86ee, 0, 0.1);
    rb(g, 1.4, 0.38, 0.8, -2.2, 0, 0.0, 0xcfd8f5, 0, 0.08);
    sph(g, 0.55, 2.2, 0, 1.2, 0x8b6bff, 0.7); sph(g, 0.55, 3.3, 0, 0.4, 0xe8679a, 0.7); sph(g, 0.55, 3.6, 0, 1.8, 0x60a5fa, 0.7);
    cyl(g, 2.2, 0.03, 0.2, 0, 0.8, 0xd9d0ff);
  },
  sleep(g, sx, sz, tc) {
    [-3.9, -1.3, 1.3, 3.9].forEach((x, i) => {
      rb(g, 1.1, 0.38, 2.0, x, 0, -sz / 2 + 1.3, C.white, 0, 0.1); rb(g, 1.0, 0.18, 1.9, x, 0.38, -sz / 2 + 1.3, i % 2 ? 0xa78bfa : 0x60a5fa, 0, 0.08);
      rb(g, 0.8, 0.14, 0.45, x, 0.55, -sz / 2 + 0.5, C.white, 0, 0.06);
      rb(g, 0.4, 0.45, 0.4, x + 0.8, 0, -sz / 2 + 0.5, C.soft, 0, 0.05);
    });
    rb(g, 0.6, 2.2, 3.0, -sx / 2 + 0.4, 0, 1.2, 0x8fb1f5, 0, 0.04);
    rb(g, 0.6, 2.2, 3.0, sx / 2 - 0.4, 0, 1.2, 0xa78bfa, 0, 0.04);
    cyl(g, 1.6, 0.03, 0, 0, 1.6, 0xd9d0ff);
  },
};

/* ============================== shared building parts ================== */
const Zc = (lz) => -CORE - lz; // corridor local depth -> world z
function sofa(g, x, z, rot, color, len = 2.2) {
  const s = new THREE.Group(); s.position.set(x, 0, z); s.rotation.y = rot; s.userData.col = g.userData.col; g.add(s);
  rb(s, len, 0.45, 0.95, 0, 0, 0, color, 0, 0.1); rb(s, len, 0.6, 0.28, 0, 0.45, -0.45, color, 0, 0.1);
  rb(s, 0.3, 0.75, 0.95, -len / 2 + 0.15, 0, 0, color, 0, 0.1); rb(s, 0.3, 0.75, 0.95, len / 2 - 0.15, 0, 0, color, 0, 0.1);
  rb(s, 0.5, 0.3, 0.12, -len / 4, 0.5, -0.1, 0xffffff, 0.1, 0.05); rb(s, 0.5, 0.3, 0.12, len / 4, 0.5, -0.1, 0xc4b5fd, -0.1, 0.05);
  return s;
}
function plant(g, x, z, s = 1) { cyl(g, 0.28 * s, 0.5 * s, x, 0, z, 0xffffff); sph(g, 0.5 * s, x, 0.45 * s, z, 0x6fcfb0); }
function lampBox(x, z, w, d) { const m = new THREE.Mesh(unitBox, mats.lamp); m.scale.set(w, 0.05, d); m.position.set(x, H - 0.03, z); parent.add(m); }
function emblem(x, z, r) {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(256, 256, 250, 0, 7); g.fill();
  g.strokeStyle = '#5B8DF5'; g.lineWidth = 14; g.beginPath(); g.arc(256, 256, 232, 0, 7); g.stroke();
  g.strokeStyle = '#8B6BFF'; g.lineWidth = 6; g.beginPath(); g.arc(256, 256, 206, 0, 7); g.stroke();
  g.fillStyle = '#5B8DF5'; g.beginPath(); g.moveTo(290, 120); g.lineTo(200, 270); g.lineTo(255, 270); g.lineTo(235, 392); g.lineTo(325, 240); g.lineTo(270, 240); g.closePath(); g.fill();
  g.fillStyle = '#1b2340'; g.textAlign = 'center'; g.font = '800 34px Inter, system-ui, sans-serif'; g.fillText('THUNDER OFFICE', 256, 440);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const em = new THREE.Mesh(new THREE.CircleGeometry(r, 48), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.96 }));
  em.rotation.x = -Math.PI / 2; em.position.set(x, 0.008, z); parent.add(em);
}
function addExtraPic(key, x, y, z, rotY, w, h) {
  const e = EXTRA_PICS[key];
  POPS['extra:' + key] = { img: 'assets/' + e.file + '.webp', title: e.title, tag: e.tag, tint: 'v', why: e.why, who: [] };
  addPicture(parent, { w, h, src: S(e.file), tint: 'v', key: 'extra:' + key, pos: new THREE.Vector3(x, y, z), rotY });
}

/** The lift: a closed booth on every floor (same place). Walk in and pick a floor. */
function buildLift(l) {
  const lv = [l];
  addWall(2.6, -2.125, 0.3, 3.65, 0, H, mats.wall, true, lv);
  addWall(5.8, -2.125, 0.3, 3.65, 0, H, mats.wall, true, lv);
  addWall(2.925, -3.8, 0.95, 0.3, 0, H, mats.wall, true, lv);
  addWall(5.475, -3.8, 0.95, 0.3, 0, H, mats.wall, true, lv);
  addWall(4.2, -3.8, 1.6, 0.3, DOOR_H, H - DOOR_H, mats.wall, false);
  addDoor({ wx: 4.2, wz: -3.8, normal: [0, -1], tint: 't', title: 'Lift', sub: 'All floors', dw: 1.6, double: true });
  addFlat(4.2, -2.125, 2.9, 3.35, 0.006, cmat(0xc4b5fd), true);
  lampBox(4.2, -2.1, 1.2, 1.2);
  const rail = (x) => { const m = new THREE.Mesh(unitBox, cmat(0xbfc7e8)); m.scale.set(0.05, 0.05, 2.2); m.position.set(x, 1.0, -2.0); parent.add(m); };
  rail(2.78); rail(5.62);
  const pnl = labelPlane('Lift', 'Choose your floor', 1.5, 0.4, { ac: '#5B8DF5' }); pnl.position.set(5.63, 1.7, -2.0); pnl.rotation.y = -Math.PI / 2; parent.add(pnl);
  spaces.push({ x0: 2.45, x1: 5.95, z0: -3.95, z1: -0.3, level: l, name: 'Lift', kind: 'area', id: 'lift' });
}

/** Stairs from level `lo` up to `hi`, built into floor `lo`. */
function buildFlight(k) {
  const { lo, hi, side } = FL[k], { x0, x1 } = flightRect(side), cx = (x0 + x1) / 2, w = x1 - x0;
  parent = floorGroups[lo]; buildLevel = lo;
  const sm = [cmat(0xe4ebff), cmat(0xc9d8fb)];
  for (let i = 0; i < 16; i++) addWall(cx, FZ1 - 0.3 * i - 0.15, w, 0.3, 0, (i + 1) * FH / 16, sm[i % 2], false);
  const inX = side < 0 ? x1 + 0.1 : x0 - 0.1, outX = side < 0 ? x0 - 0.15 : x1 + 0.15, zc = (FZ0 + FZ1) / 2, zl = FZ1 - FZ0;
  addWall(inX, zc, 0.2, zl, 0, FH, mats.wall, true, [lo, hi]);
  addWall(outX, zc, 0.3, zl, 0, FH, mats.wall, true, [lo, hi]);
  addWall(inX, zc, 0.06, zl, FH, 1.0, mats.glassRail, false);
  addWall(cx, FZ1 + 0.05, w, 0.06, FH, 1.0, mats.glassRail, false);
  addCollider(cx, FZ1 + 0.1, w, 0.4, [hi]);          // south end of the opening on the upper floor
  addCollider(cx, FZ0 - 0.15, w, 0.3, [lo]);         // north end under the stairs on the lower floor
  const bar = new THREE.Mesh(unitBox, cmat(0x8fb1f5)); bar.scale.set(0.08, 0.06, zl); bar.position.set(inX, FH + 1.0, zc); parent.add(bar);
  const sg = labelPlane('Stairs up', LEVEL_NAMES[hi], 2.2, 0.52, { ac: '#60A5FA' });
  sg.position.set(inX + (side < 0 ? 0.12 : -0.12), 2.6, zc); sg.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2; parent.add(sg);
  ramps.push({ x0, x1, a: FZ1, b: FZ0, yA: lo * FH, yB: hi * FH, lo, hi });
  spaces.push({ x0, x1, z0: FZ0, z1: FZ1, level: lo, name: 'Stairs', kind: 'area', id: 'stairs' });
  spaces.push({ x0, x1, z0: FZ0, z1: FZ1, level: hi, name: 'Stairs', kind: 'area', id: 'stairs' });
}

/** A corridor going north from the lobby. Returns nothing; registers rooms. */
function corridor(sp) {
  const l = sp.level, hw = sp.halfw, zs = sp.start ?? 0.3, P = sp.pitch ?? 4.7, SD = sp.sideD ?? 5;
  const n = Math.max(sp.left.length, sp.right.length);
  const L = Math.max(sp.minLength || 0, zs + n * P + 1.5);
  const wall = (lcx, lcz, w, d, y0, h, mat, col = true) => addWall(lcx, Zc(lcz), w, d, y0, h, mat, col);
  for (let z = 2.2; z < L - 0.5; z += 4.2) { const m = new THREE.Mesh(unitBox, mats.lamp); m.scale.set(Math.min(1.2, hw * 0.4), 0.05, 1.6); m.position.set(0, H - 0.03, Zc(z)); parent.add(m); }
  wall(-(hw - 0.03), L / 2, 0.06, L, 0, 0.1, mats.trim, false); wall(hw - 0.03, L / 2, 0.06, L, 0, 0.1, mats.trim, false);
  // corridor mouth in the lobby wall
  const pieceW = BX - hw;
  addWall(-(BX + hw) / 2, -CORE - T / 2, pieceW, T, 0, H, mats.wall, true);
  addWall((BX + hw) / 2, -CORE - T / 2, pieceW, T, 0, H, mats.wall, true);
  addWall(0, -CORE - T / 2, hw * 2, T, 2.75, H - 2.75, mats.wall, false);
  const sg = labelPlane(sp.sign, sp.sub, Math.min(3.4, hw * 2 + 0.4), 0.5, { ac: '#5B8DF5' }); sg.position.set(0, 2.98, -CORE + 0.03); parent.add(sg);
  const walk = {};
  [{ s: -1, list: sp.left }, { s: 1, list: sp.right }].forEach(({ s, list }) => {
    const lx = s * (hw + T / 2);
    const piece = (a, b) => { if (b - a > 0.001) wall(lx, (a + b) / 2, T, b - a, 0, H, mats.wall, true); };
    const gaps = list.map((id, i) => ({ zc: zs + i * P + P / 2, id }));
    (sp.privates || []).filter((p) => p.side === s).forEach((p) => gaps.push({ zc: L - p.back, priv: true }));
    gaps.sort((a, b) => a.zc - b.zc);
    let cur = T;
    gaps.forEach((gp) => {
      const a = gp.zc - DOOR_W / 2, b = gp.zc + DOOR_W / 2;
      piece(cur, a); cur = b;
      wall(lx, gp.zc, T, DOOR_W, DOOR_H, H - DOOR_H, mats.wall, false);
      const pos = { wx: lx, wz: Zc(gp.zc), normal: [-s, 0] };
      if (gp.id) { const room = ROOMS[gp.id]; addDoor({ ...pos, tint: room.tint, title: room.title, sub: room.sub }); }
      else addDoor({ ...pos, tint: 'v', title: 'Private', sub: 'Closed room', fixed: true });
    });
    piece(cur, L);
    if (list.length) {
      for (let i = 0; i <= list.length; i++) wall(s * (hw + T + SD / 2), zs + i * P, SD, T, 0, H, mats.wall, true);
      wall(s * (hw + T + SD + T / 2), zs + (list.length * P) / 2, T, list.length * P + T, 0, H, mats.wall, true);
      list.forEach((id, i) => {
        const zc = zs + i * P + P / 2, wx = s * (hw + T + SD / 2), wz = Zc(zc);
        const info = buildRoom(id, wx, wz, [-s, 0], P - T, SD);
        info.walk = [[0, wz], [lx, wz], [info.entry.x, info.entry.z]];
      });
    }
  });
  // end wall + end room
  const [ew, ed] = sp.endSize, edw = sp.endDoor || 1.6, half = ew / 2 + T;
  wall(-(half + edw / 2) / 2, L + T / 2, half - edw / 2, T, 0, H, mats.wall, true);
  wall((half + edw / 2) / 2, L + T / 2, half - edw / 2, T, 0, H, mats.wall, true);
  wall(0, L + T / 2, edw, T, DOOR_H, H - DOOR_H, mats.wall, false);
  wall(-(ew / 2 + T / 2), L + T + ed / 2, T, ed, 0, H, mats.wall, true);
  wall(ew / 2 + T / 2, L + T + ed / 2, T, ed, 0, H, mats.wall, true);
  wall(0, L + T + ed + T / 2, ew + 2 * T, T, 0, H, mats.wall, true);
  const er = ROOMS[sp.end];
  addDoor({ wx: 0, wz: Zc(L + T / 2), normal: [0, 1], tint: er.tint, title: er.title, sub: er.sub, dw: edw, double: edw > 2 });
  const info = buildRoom(sp.end, 0, Zc(L + T + ed / 2), [0, 1], ew, ed);
  info.walk = [[0, Zc(L - 1.5)], [info.entry.x, info.entry.z]];
  spaces.push({ x0: -hw, x1: hw, z0: Zc(L), z1: Zc(0), level: l, name: sp.sign, kind: 'corridor', id: 'corridor' + l });
  return { L, hw };
}

/* ============================== ground floor =========================== */
function buildGround() {
  startFloor(0);
  slab(-BX, BX, -LEN, -0.3);
  for (const x of [-8, 0, 8]) for (const z of [-3, -8, -13]) lampBox(x, z, 1.8, 1.2);
  buildLift(0); buildFlight(0);
  emblem(0, -9.2, 2.1);
  // wall between the waiting hall and the rest and sleep rooms
  const NZ = -17.8;
  addWall(-9.85, NZ, 4.7, T, 0, H, mats.wall); addWall(9.85, NZ, 4.7, T, 0, H, mats.wall); addWall(0, NZ, 11.8, T, 0, H, mats.wall);
  addWall(-6.7, NZ, 1.6, T, DOOR_H, H - DOOR_H, mats.wall, false); addWall(6.7, NZ, 1.6, T, DOOR_H, H - DOOR_H, mats.wall, false);
  addDoor({ wx: -6.7, wz: NZ, normal: [0, 1], tint: 'b', title: 'Rest room', sub: 'Sit back and relax', dw: 1.6 });
  addDoor({ wx: 6.7, wz: NZ, normal: [0, 1], tint: 'v', title: 'Sleep room', sub: 'Beds for the night', dw: 1.6 });
  addWall(0, -22.125, 2.4, 8.35, 0, H, mats.wall); addWall(0, -26.45, 2 * BX, T, 0, H, mats.wall);
  [['rest', -6.7], ['sleep', 6.7]].forEach(([id, x]) => { const inf = buildRoom(id, x, -22.125, [0, 1], 11.0, 8.35); inf.walk = [[x, -15.5], [inf.entry.x, inf.entry.z]]; });
  // waiting hall furniture
  const dg = new THREE.Group(); dg.userData.col = true; parent.add(dg);
  rb(dg, 3.6, 1.05, 0.9, -3.2, 0, -5.0, 0xffffff, 0, 0.1); rb(dg, 3.8, 0.08, 1.1, -3.2, 1.05, -5.0, 0x8b6bff, 0, 0.03);
  rb(dg, 0.5, 0.35, 0.04, -3.9, 1.13, -5.1, C.dark, 0, 0.01); rb(dg, 0.2, 0.1, 0.2, -2.6, 1.13, -5.0, 0xf0a63a, 0, 0.03);
  const rp = labelPlane('Reception', 'Please wait here', 1.9, 0.5, { ac: '#7C3AED' }); rp.position.set(-3.2, 0.6, -4.53); rp.rotation.y = 0; dg.add(rp);
  [4.2, -4.2].forEach((x) => {
    sofa(dg, x, -14.0, Math.PI, x < 0 ? 0x6f9bf7 : 0xa78bfa); sofa(dg, x, -11.0, 0, x < 0 ? 0x6f9bf7 : 0xa78bfa);
    rb(dg, 1.5, 0.4, 0.8, x, 0, -12.5, 0xcfd8f5, 0, 0.08); cyl(dg, 1.8, 0.03, x, 0, -12.5, 0xd9d0ff);
  });
  sofa(dg, 11.1, -10.5, -Math.PI / 2, 0x8b6bff, 1.8); sofa(dg, 11.1, -7.6, -Math.PI / 2, 0x8b6bff, 1.8);
  cyl(dg, 0.3, 1.0, 11.4, 0, -15.6, 0xffffff); cyl(dg, 0.26, 0.45, 11.4, 1.0, -15.6, 0x60a5fa);
  [[-11.4, -16.6], [11.4, -16.6], [-2.2, -1.0], [2.0, -1.0], [-11.4, -12], [-7.6, -0.9]].forEach(([x, z]) => plant(dg, x, z, 1.2));
  collect(dg, 0);
  const rules = posterPlane('House rules', RULES, 3.2, 2.2, '#7C3AED'); rules.position.set(0, 1.62, NZ + 0.17); parent.add(rules);
  const wp = labelPlane('Waiting area', 'Knock and wait for a team member', 3.4, 0.46, { ac: '#5B8DF5' }); wp.position.set(0, 2.88, NZ + 0.17); parent.add(wp);
  addExtraPic('building', -9.85, 1.8, NZ + 0.16, 0, 1.9, 2.05);
  addExtraPic('terrace', 9.85, 1.8, NZ + 0.16, 0, 1.9, 2.05);
  const kn = labelPlane('Knock and wait', 'Visitors need approval', 2.2, 0.56, { ac: '#F0A63A' }); kn.position.set(-2.4, 1.9, -0.33); kn.rotation.y = Math.PI; parent.add(kn);
  spaces.push({ x0: -BX, x1: BX, z0: -17.65, z1: -0.3, level: 0, name: 'Waiting area', kind: 'hall', id: 'waiting' });
}

/* ============================== floors 2 to 5 ========================== */
function buildFloor(sp) {
  const l = sp.level, fr = flightRect(FL[l - 1].side);
  startFloor(l);
  slab(-BX, BX, -LEN, -0.3, [fr.x0, fr.x1, FZ0, FZ1]);
  for (const x of [-6, 0, 6]) for (const z of [-3, -7]) lampBox(x, z, 1.6, 1.1);
  buildLift(l); buildFlight(l);
  const { L, hw } = corridor(sp);
  spaces.push({ x0: -BX, x1: BX, z0: -CORE, z1: -0.3, level: l, name: 'Lobby', kind: 'hall', id: 'lobby' + l });
  const dg = new THREE.Group(); dg.userData.col = true; parent.add(dg);
  const nf = FL[l].side; // the flight going up sits on this side; keep that side clear
  plant(dg, -BX + 0.6 + (nf < 0 ? 0 : 0), -8.5, 1.1); plant(dg, BX - 0.6, -8.5, 1.1);
  sofa(dg, -9.4, -8.3, 0, 0x6f9bf7, 2.6);
  if (nf > 0) { plant(dg, -8.0, -1.0, 1.1); } else plant(dg, 8.0, -1.0, 1.1);
  if (l === 1) {
    // wide corridor: rug, sofas along the walls, plants
    const rug = new THREE.Mesh(unitPlane, cmat(0xd9d0ff)); rug.rotation.x = -Math.PI / 2; rug.scale.set(4, L - 4, 1); rug.position.set(0, 0.01, Zc(L / 2)); parent.add(rug);
    [6, 13].forEach((z) => { sofa(dg, -4.35, Zc(z), Math.PI / 2, 0x6f9bf7, 2.4); sofa(dg, 4.35, Zc(z), -Math.PI / 2, 0xa78bfa, 2.4); rb(dg, 0.8, 0.4, 1.3, -4.4 + 1.5, 0, Zc(z), 0xcfd8f5, 0, 0.08); rb(dg, 0.8, 0.4, 1.3, 4.4 - 1.5, 0, Zc(z), 0xcfd8f5, 0, 0.08); });
    [3, 10, 17, L - 1.2].forEach((z) => { plant(dg, -4.4, Zc(z), 1.1); plant(dg, 4.4, Zc(z), 1.1); });
    const cs = labelPlane('Client entrance', "Anamika's CA room", 3.0, 0.5, { ac: '#3FB57A' }); cs.position.set(0, 2.95, Zc(L) + 0.2); parent.add(cs);
    spaces.push({ x0: -hw, x1: hw, z0: Zc(L), z1: Zc(0), level: l, name: 'Wide corridor', kind: 'hall', id: 'wide' });
  }
  if (l === 2) {
    const rules = posterPlane('House rules', RULES, 3.0, 2.1, '#7C3AED'); rules.position.set(-6.6, 1.6, -CORE + 0.03); parent.add(rules);
    const fp = posterPlane('Corridor rules', RULES, 3.0, 3.5, '#5B8DF5'); fp.rotation.x = -Math.PI / 2; fp.position.set(0, 0.014, Zc(3.2)); parent.add(fp);
  }
  collect(dg, l);
}

/* ============================== terrace ================================ */
function buildTerrace() {
  const fr = flightRect(FL[4].side);
  startFloor(5);
  slab(-BX, BX, -LEN, -0.3, [fr.x0, fr.x1, FZ0, FZ1], deckMats);
  buildLift(5);
  addWall(4.2, -2.125, 3.5, 3.65, H, 0.2, mats.wall, false);
  const ss = labelPlane('Terrace and pool', 'Relax, swim, repeat', 2.4, 0.56, { ac: '#7C3AED' }); ss.position.set(5.96, 1.9, -2.1); ss.rotation.y = Math.PI / 2; parent.add(ss);
  addExtraPic('terrace', 2.44, 1.9, -2.1, -Math.PI / 2, 1.4, 1.5);
  const dg = new THREE.Group(); dg.userData.col = true; parent.add(dg);
  // pool with a tiled rim
  const px = 0, pz = -26, pw = 10.6, pd = 5.6;
  const rimM = cmat(0xffffff);
  [[pw, 0.5, 0.45, px, pz - pd / 2 + 0.225], [pw, 0.5, 0.45, px, pz + pd / 2 - 0.225], [0.45, 0.5, pd, px - pw / 2 + 0.225, pz], [0.45, 0.5, pd, px + pw / 2 - 0.225, pz]]
    .forEach(([w, h, d, x, z]) => { const m = new THREE.Mesh(rbGeo(w, h, d, 0.12), rimM); m.position.set(x, h / 2, z); parent.add(m); });
  const bed = new THREE.Mesh(unitPlane, cmat(0x9fd3ff)); bed.rotation.x = -Math.PI / 2; bed.scale.set(pw - 0.8, pd - 0.8, 1); bed.position.set(px, 0.03, pz); parent.add(bed);
  const water = new THREE.Mesh(unitPlane, mats.water); water.rotation.x = -Math.PI / 2; water.scale.set(pw - 0.8, pd - 0.8, 1); water.position.set(px, 0.4, pz); parent.add(water);
  for (let i = 0; i < 7; i++) { const st = new THREE.Mesh(unitPlane, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.26 })); st.rotation.x = -Math.PI / 2; st.scale.set(pw - 2, 0.07, 1); st.position.set(px + (i % 2) * 0.4 - 0.2, 0.402, pz - 2 + i * 0.66); parent.add(st); }
  [-0.6, 0.6].forEach((k) => { const ld = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 10), cmat(0xbfc7e8)); ld.position.set(px + pw / 2 - 0.15, 0.7, pz + k); parent.add(ld); });
  addCollider(px, pz, pw + 0.2, pd + 0.2, [5]);
  // floaties
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.2, 12, 24), cmat(0xff7eb6)); ring.rotation.x = Math.PI / 2; ring.position.set(-2.6, 0.5, pz + 0.7); parent.add(ring);
  const uni = new THREE.Group(); uni.position.set(2.8, 0.38, pz - 0.5); parent.add(uni);
  sph(uni, 0.75, 0, 0, 0, 0xffffff, 0.45); sph(uni, 0.28, 0.7, 0.2, 0, 0xffffff); const horn = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.35, 8), cmat(0xf0a63a)); horn.position.set(0.82, 0.85, 0); uni.add(horn);
  [0xe8679a, 0xa78bfa, 0x60a5fa].forEach((c, i) => sph(uni, 0.1, 0.52, 0.55 - i * 0.12, 0, c));
  const bc = document.createElement('canvas'); bc.width = 128; bc.height = 64; { const g = bc.getContext('2d'); ['#60a5fa', '#ffffff', '#e8679a', '#f0a63a'].forEach((c, i) => { g.fillStyle = c; g.fillRect(i * 32, 0, 32, 64); }); }
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 14), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(bc), roughness: 0.5 })); ball.position.set(0.6, 0.62, pz + 1.2); parent.add(ball);
  // loungers and umbrellas on the south side of the pool
  [-4.2, -1.4, 1.4, 4.2].forEach((x, i) => {
    const gp = new THREE.Group(); gp.position.set(x, 0, -21.2); gp.userData.col = true; parent.add(gp);
    rb(gp, 0.75, 0.3, 1.8, 0, 0.1, 0, i % 2 ? 0xa78bfa : 0x60a5fa, 0, 0.1); rb(gp, 0.75, 0.7, 0.12, 0, 0.3, -0.85, i % 2 ? 0xa78bfa : 0x60a5fa, 0.3, 0.05);
    dg.add(gp);
  });
  [-2.8, 2.8].forEach((x, i) => { cyl(dg, 0.04, 2.3, x, 0, -21.2, 0xbfc7e8); const u = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.5, 20), cmat(i ? 0xc4b5fd : 0xb9d9dc)); u.position.set(x, 2.45, -21.2); parent.add(u); });
  // pergola with a swing
  const pgx0 = -10.4, pgx1 = -6.6, pgz0 = -15.4, pgz1 = -12.6;
  [[pgx0, pgz0], [pgx1, pgz0], [pgx0, pgz1], [pgx1, pgz1]].forEach(([x, z]) => { const m = new THREE.Mesh(unitBox, cmat(0xf4efe4)); m.scale.set(0.26, 3.0, 0.26); m.position.set(x, 1.5, z); parent.add(m); addCollider(x, z, 0.3, 0.3, [5]); });
  [pgz0, pgz1].forEach((z) => { const m = new THREE.Mesh(unitBox, cmat(0xf4efe4)); m.scale.set(pgx1 - pgx0 + 0.6, 0.2, 0.2); m.position.set((pgx0 + pgx1) / 2, 3.0, z); parent.add(m); });
  const slats = []; for (let i = 0; i < 9; i++) slats.push({ x: pgx0 - 0.1 + i * 0.5, y: 3.12, z: (pgz0 + pgz1) / 2 });
  inst(new THREE.BoxGeometry(0.1, 0.08, pgz1 - pgz0 + 0.5), cmat(0xf4efe4), slats);
  const vines = []; for (let i = 0; i < 22; i++) vines.push({ x: pgx0 + Math.random() * (pgx1 - pgx0), y: 3.2 + Math.random() * 0.2, z: pgz0 + Math.random() * (pgz1 - pgz0), sx: 1, sy: 0.7, sz: 1, c: i % 5 === 0 ? 0xe8679a : 0x5fb07a });
  inst(new THREE.SphereGeometry(0.28, 8, 6), cmat(0xffffff), vines);
  const swx = (pgx0 + pgx1) / 2, swz = (pgz0 + pgz1) / 2;
  rb(dg, 2.0, 0.12, 0.75, swx, 0.5, swz, 0xb98a5a, 0, 0.04); rb(dg, 2.0, 0.55, 0.1, swx, 0.62, swz - 0.35, 0xb98a5a, 0, 0.04);
  rb(dg, 0.9, 0.16, 0.6, swx - 0.5, 0.62, swz + 0.02, 0xc4b5fd, 0, 0.06); rb(dg, 0.9, 0.16, 0.6, swx + 0.5, 0.62, swz + 0.02, 0xf4a6cd, 0, 0.06);
  [-0.95, 0.95].forEach((dx) => [-0.3, 0.3].forEach((dz2) => cyl(parent, 0.012, 2.5, swx + dx, 0.55, swz + dz2, 0x8a7f9a, 6)));
  // rattan sofas around a table
  const sx0 = 8.2, sz0 = -14;
  sofa(dg, sx0, sz0 - 2.0, 0, 0x9c7a5c, 3.0); sofa(dg, sx0 - 2.0, sz0, Math.PI / 2, 0x9c7a5c, 2.4); sofa(dg, sx0 + 2.0, sz0, -Math.PI / 2, 0x9c7a5c, 2.4);
  rb(dg, 1.8, 0.45, 1.2, sx0, 0, sz0, 0x9c7a5c, 0, 0.08);
  cyl(parent, 0.14, 0.34, sx0 - 0.3, 0.45, sz0, 0xe3d3b5); const lant = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), warm); lant.position.set(sx0 - 0.3, 0.7, sz0); parent.add(lant);
  [[0.4, 0.2], [0.55, -0.25], [0.1, -0.3]].forEach(([a, b], i) => { cyl(parent, 0.06, 0.16, sx0 + a, 0.45, sz0 + b, [0xf0a63a, 0x8b4a2a, 0xe8679a][i], 10); });
  rb(dg, 0.6, 0.12, 0.6, sx0 + 0.2, 0.45, sz0 + 0.45, 0xffffff, 0, 0.05);
  // planters with flowers along both side walls
  const pl = [], fl = [];
  for (let z = -8; z > -58; z -= 4.2) [-1, 1].forEach((s) => { const x = s * 11.7; pl.push({ x, y: 0.2, z }); fl.push({ x, y: 0.62, z, c: [0xe8679a, 0xff7eb6, 0xc084fc, 0xa78bfa][(Math.abs(Math.round(z)) + (s > 0 ? 1 : 0)) % 4], sx: 1.3, sy: 1, sz: 1.3 }); addCollider(x, z, 0.8, 0.8, [5]); });
  inst(new THREE.BoxGeometry(0.7, 0.4, 0.7), cmat(0xc0654a), pl);
  inst(new THREE.SphereGeometry(0.3, 10, 8), cmat(0xffffff), fl);
  // string lights between poles
  const bulbs = [];
  [-11.9, 11.9].forEach((x) => [-9.5, -20, -31, -42, -53].forEach((z) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.3, 8), cmat(0x8a7f9a)); p.position.set(x, 1.65, z); parent.add(p); }));
  [-9.5, -20, -31, -42, -53].forEach((z) => {
    const pts = []; for (let i = 0; i <= 24; i++) { const t = i / 24; const y = 3.2 - 0.9 * Math.sin(Math.PI * t); pts.push(new THREE.Vector3(-11.9 + t * 23.8, y, z)); if (i % 2 === 0) bulbs.push({ x: pts[i].x, y: y - 0.08, z }); }
    parent.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x6b5f8a })));
  });
  inst(new THREE.SphereGeometry(0.08, 8, 6), warm, bulbs);
  collect(dg, 5);
  spaces.push({ x0: -BX, x1: BX, z0: -LEN, z1: -0.3, level: 5, name: 'Terrace and pool', kind: 'hall', id: 'terrace' });
  parent = world;
}

/* ============================== outside: building, garden, road ======== */
function canvasTex(w, h, fn, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); } return t;
}
function palm(x, z, s = 1) {
  const g = new THREE.Group(); g.position.set(x, 0, z); parent.add(g);
  const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * s, 0.3 * s, 5.4 * s, 10), cmat(0x9a7a5a)); tr.position.y = 2.7 * s; g.add(tr);
  for (let i = 0; i < 9; i++) {
    const f = new THREE.Mesh(unitBox, cmat(i % 2 ? 0x4f9a5a : 0x5fb07a)); f.scale.set(0.5 * s, 0.05, 2.8 * s);
    const a = (i / 9) * Math.PI * 2; const pv = new THREE.Group(); pv.position.y = 5.4 * s; pv.rotation.y = a; g.add(pv);
    f.position.set(0, 0, 1.3 * s); f.rotation.x = 0.45; pv.add(f);
  }
  [0.9, 1.5, 2.1, 2.7, 3.3, 3.9].forEach((y) => { const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), warm); b.position.set(0.26 * s, y * s, 0.12 * s); g.add(b); });
  addCollider(x, z, 0.6, 0.6, [0]);
}
function tree(x, z, s = 1) {
  const g = new THREE.Group(); g.position.set(x, 0, z); parent.add(g);
  cyl(g, 0.2 * s, 1.6 * s, 0, 0, 0, 0x9a7a5a, 10);
  sph(g, 1.1 * s, 0, 1.3 * s, 0, 0x5fb07a, 0.9); sph(g, 0.8 * s, 0.6 * s, 2.0 * s, 0.2 * s, 0x6fcfb0, 0.9); sph(g, 0.7 * s, -0.5 * s, 2.1 * s, -0.2 * s, 0x4f9a5a, 0.9);
  addCollider(x, z, 0.5, 0.5, [0]);
}
function lampPost(x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z); parent.add(g);
  rb(g, 0.5, 0.9, 0.5, 0, 0, 0, 0xf1e3c4, 0, 0.05); rb(g, 0.62, 0.1, 0.62, 0, 0.9, 0, 0xd9b974, 0, 0.03);
  const l = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.46, 0.34), warm); l.position.y = 1.2; g.add(l);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.24, 4), cmat(0x2d2540)); cap.position.y = 1.55; cap.rotation.y = Math.PI / 4; g.add(cap);
  addCollider(x, z, 0.5, 0.5, [0]);
}
function iron(g, w, h, gold) {
  const f = cmat(0x2d2540);
  const top = new THREE.Mesh(unitBox, f); top.scale.set(w, 0.1, 0.1); top.position.set(0, h, 0); g.add(top);
  const bot = new THREE.Mesh(unitBox, f); bot.scale.set(w, 0.1, 0.1); bot.position.set(0, 0.2, 0); g.add(bot);
  for (let i = 0; i < 12; i++) { const b = new THREE.Mesh(unitBox, f); b.scale.set(0.05, h, 0.05); b.position.set(-w / 2 + (i + 0.5) * w / 12, h / 2, 0); g.add(b); const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 6), cmat(0xd9a93e)); tip.position.set(-w / 2 + (i + 0.5) * w / 12, h + 0.08, 0); g.add(tip); }
  const d = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 20), cmat(0xd9a93e)); d.rotation.x = Math.PI / 2; d.position.set(0, h * 0.55, 0.04); g.add(d);
}
function buildExterior() {
  parent = world; buildLevel = 0;
  const stoneM = mats.stone;
  const skin = (inner) => { const a = [stoneM, stoneM, stoneM, stoneM, stoneM, stoneM]; a[inner] = mats.wall; return a; };
  const ph = TOP + 1.1;
  // --- perimeter walls (inner face uses the interior wall colour) ---
  const per = (cx, cz, w, d, inner, y0 = 0, h = ph, lv = ALL) => { const m = new THREE.Mesh(unitBox, skin(inner)); m.scale.set(w, h, d); m.position.set(cx, y0 + h / 2, cz); parent.add(m); if (lv) addCollider(cx, cz, w, d, lv); return m; };
  per(-BX - 0.15, (-LEN - 0.3) / 2, 0.3, LEN + 0.6, 0);      // west, inner face +x
  per(BX + 0.15, (-LEN - 0.3) / 2, 0.3, LEN + 0.6, 1);       // east, inner face -x
  per(0, -LEN - 0.15, 2 * BX + 0.6, 0.3, 4);                // back, inner face +z
  // front: main door in the middle (ground floor only)
  const DW = 2.4, DH = 2.7;
  per(-(BX + 0.3 + DW / 2) / 2 - 0.0, 0, BX + 0.3 - DW / 2, 0.6, 5, 0, ph, ALL.slice(1));
  per((BX + 0.3 + DW / 2) / 2, 0, BX + 0.3 - DW / 2, 0.6, 5, 0, ph, ALL.slice(1));
  addCollider(-(BX + 0.3 + DW / 2) / 2, 0, BX + 0.3 - DW / 2, 0.6, [0]); addCollider((BX + 0.3 + DW / 2) / 2, 0, BX + 0.3 - DW / 2, 0.6, [0]);
  per(0, 0, DW, 0.6, 5, DH, ph - DH, null);
  addDoor({ wx: 0, wz: 0, normal: [0, 1], tint: '#7a4a2a', dw: DW, dh: DH, double: true, gold: true, plate: false });
  // --- central tower, portico, jali panel, dome ---
  const tow = new THREE.Mesh(unitBox, stoneM); tow.scale.set(7.4, TOP + 3.4, 0.9); tow.position.set(0, (TOP + 3.4) / 2, 0.75); parent.add(tow);
  const jali = new THREE.Mesh(unitPlane, new THREE.MeshStandardMaterial({ roughness: 0.9, map: canvasTex(512, 1024, (g, w, h) => {
    g.fillStyle = '#f4e6c8'; g.fillRect(0, 0, w, h);
    const arch = (cy, aw, ah) => { g.beginPath(); g.moveTo(w / 2 - aw / 2, cy + ah / 2); g.lineTo(w / 2 - aw / 2, cy - ah / 2 + aw / 2); g.arc(w / 2, cy - ah / 2 + aw / 2, aw / 2, Math.PI, 0); g.lineTo(w / 2 + aw / 2, cy + ah / 2); g.closePath(); };
    [[190, 250, 300], [520, 280, 400], [860, 250, 300]].forEach(([cy, aw, ah]) => {
      arch(cy, aw, ah); g.fillStyle = '#e4cf9c'; g.fill(); g.save(); arch(cy, aw, ah); g.clip(); g.strokeStyle = '#c9a85c'; g.lineWidth = 3;
      for (let i = -40; i < 40; i++) { g.beginPath(); g.moveTo(w / 2 + i * 14 - 300, cy - 300); g.lineTo(w / 2 + i * 14 + 300, cy + 300); g.stroke(); g.beginPath(); g.moveTo(w / 2 + i * 14 + 300, cy - 300); g.lineTo(w / 2 + i * 14 - 300, cy + 300); g.stroke(); }
      g.restore(); arch(cy, aw, ah); g.strokeStyle = '#d9a93e'; g.lineWidth = 12; g.stroke();
    });
    g.translate(w / 2, 520); g.fillStyle = '#f7d36b'; g.strokeStyle = '#b8862b'; g.lineWidth = 4;
    for (let i = 0; i < 12; i++) { g.rotate(Math.PI / 6); g.beginPath(); g.ellipse(0, -62, 20, 48, 0, 0, 7); g.fill(); g.stroke(); }
    g.beginPath(); g.arc(0, 0, 26, 0, 7); g.fill(); g.stroke();
  }) }));
  jali.scale.set(7.0, TOP - 2.2, 1); jali.position.set(0, FH + 1.6 + (TOP - 2.2) / 2 - 0.0, 1.22); parent.add(jali);
  // portico over the door
  const por = new THREE.Mesh(unitBox, stoneM); por.scale.set(7.4, 0.3, 3.2); por.position.set(0, 3.25, 2.1); parent.add(por);
  const por2 = new THREE.Mesh(unitBox, cmat(0xd9a93e)); por2.scale.set(7.5, 0.08, 3.3); por2.position.set(0, 3.43, 2.1); parent.add(por2);
  [-3.3, 3.3].forEach((x) => { cyl(parent, 0.26, 3.1, x, 0, 3.4, 0xf1e3c4); const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.28, 0.2, 14), cmat(0xd9a93e)); cap.position.set(x, 3.1, 3.4); parent.add(cap); addCollider(x, 3.4, 0.6, 0.6, [0]); });
  const arc = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.1, 8, 28, Math.PI), cmat(0xd9a93e)); arc.position.set(0, DH, 0.62); parent.add(arc);
  const lant = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), warm); lant.position.set(0, 2.9, 1.2); parent.add(lant);
  cyl(parent, 0.012, 0.35, 0, 3.05, 1.2, 0x2d2540, 6);
  const sign = labelPlane('Thunder Office', 'ThunderStudy team home', 5.2, 0.95, { ac: '#7C3AED' }); sign.position.set(0, 4.4, 1.24); parent.add(sign);
  const knock = labelPlane('Knock and wait', 'Visitors need approval', 2.3, 0.62, { ac: '#F0A63A' }); knock.position.set(2.6, 1.7, 0.78); parent.add(knock);
  const rules = labelPlane('Rooms are private', 'Sign in at the waiting area', 2.3, 0.62, { ac: '#60A5FA' }); rules.position.set(-2.6, 1.7, 0.78); parent.add(rules);
  // dome pavilion
  [[-2.4, -1.6], [2.4, -1.6], [-2.4, 1.6], [2.4, 1.6]].forEach(([x, z]) => cyl(parent, 0.16, 1.8, x * 0.8, TOP + 3.4, 0.75 + z * 0.1, 0xf1e3c4, 10));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2.4, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), stoneM); dome.position.set(0, TOP + 5.2, 0.75); dome.scale.set(1, 0.85, 0.6); parent.add(dome);
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.9, 8), cmat(0xd9a93e)); fin.position.set(0, TOP + 5.2 + 2.0 + 0.45, 0.75); parent.add(fin);
  [-1, 1].forEach((s) => { const d2 = new THREE.Mesh(new THREE.SphereGeometry(1.0, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), stoneM); d2.position.set(s * 10.8, ph, 0.0); parent.add(d2); cyl(parent, 0.16, 1.0, s * 10.8 - 0.8, ph - 1.0, 0, 0xf1e3c4, 8); cyl(parent, 0.16, 1.0, s * 10.8 + 0.8, ph - 1.0, 0, 0xf1e3c4, 8); });
  const cap = new THREE.Mesh(unitBox, cmat(0xd9a93e)); cap.scale.set(2 * BX + 0.9, 0.12, 0.8); cap.position.set(0, ph + 0.06, 0); parent.add(cap);
  // --- balconies, windows, planters on both wings ---
  const bal = [], rails = [], topRail = [], plant1 = [], flo = [];
  const winR = [], winA = [], frR = [], frA = [];
  const w2 = (x, y, z, ry) => { const nx = Math.sin(ry), nz = Math.cos(ry);
    frR.push({ x: x + nx * 0.03, y: y + 1.62, z: z + nz * 0.03, ry }); frA.push({ x: x + nx * 0.03, y: y + 2.48, z: z + nz * 0.03, ry });
    winR.push({ x: x + nx * 0.07, y: y + 1.6, z: z + nz * 0.07, ry }); winA.push({ x: x + nx * 0.07, y: y + 2.45, z: z + nz * 0.07, ry }); };
  for (let l = 0; l < 5; l++) {
    const y0 = l * FH;
    [-1, 1].forEach((s) => {
      bal.push({ x: s * 8.4, y: y0 + 0.05, z: 0.85, sx: 8.2, sy: 0.18, sz: 1.1 });
      for (let i = 0; i < 24; i++) rails.push({ x: s * (4.5 + i * 0.34), y: y0 + 0.6, z: 1.35 });
      topRail.push({ x: s * 8.4, y: y0 + 1.08, z: 1.35, sx: 8.2, sy: 0.07, sz: 0.09 });
      for (let k = 0; k < 4; k++) { const px = s * (5.0 + k * 2.1); plant1.push({ x: px, y: y0 + 0.4, z: 1.2 }); [0xe8679a, 0xff7eb6, 0xc084fc, 0xa78bfa][(k + l) % 4]; flo.push({ x: px, y: y0 + 0.72, z: 1.2, c: [0xe8679a, 0xff7eb6, 0xc084fc, 0xa78bfa][(k + l) % 4], sx: 1.3, sy: 0.9, sz: 1 }); }
      [5.6, 8.2, 10.8].forEach((x) => w2(s * x, y0, 0.3, 0));
      for (let z = -6; z > -58; z -= 5) w2(s * (BX + 0.3), y0, z, s * Math.PI / 2);
    });
    [-9, -4.5, 0, 4.5, 9].forEach((x) => w2(x, y0, -LEN - 0.3, Math.PI));
  }
  [-1, 1].forEach((s) => addCollider(s * 8.4, 1.35, 8.2, 0.3, [0]));
  inst(unitBox, cmat(0xe9d8b0), bal);
  inst(new THREE.BoxGeometry(0.05, 0.9, 0.05), cmat(0x2d2540), rails);
  inst(unitBox, cmat(0x2d2540), topRail);
  inst(new THREE.BoxGeometry(0.7, 0.4, 0.4), cmat(0xc0654a), plant1);
  inst(new THREE.SphereGeometry(0.26, 10, 8), cmat(0xffffff), flo);
  const archGeo = (r) => { const g = new THREE.CylinderGeometry(r, r, 0.08, 16, 1, false, -Math.PI / 2, Math.PI); g.rotateX(-Math.PI / 2); return g; };
  inst(new THREE.BoxGeometry(1.7, 1.95, 0.08), cmat(0xe3cf9f), frR);
  inst(archGeo(0.85), cmat(0xe3cf9f), frA);
  inst(new THREE.BoxGeometry(1.3, 1.7, 0.1), mats.glass, winR);
  inst(archGeo(0.65), mats.glass, winA);
  // --- garden ground, water, causeway, road ---
  const gm = mats.grass, W = 900;
  const wat = new THREE.Mesh(unitPlane, mats.water); wat.rotation.x = -Math.PI / 2; wat.scale.set(W, W, 1); wat.position.set(0, -0.32, -60); parent.add(wat);
  const gbox = (x0, x1, z0, z1, mat = gm, y = 0) => { const m = new THREE.Mesh(unitBox, mat); m.scale.set(x1 - x0, 0.5, z1 - z0); m.position.set((x0 + x1) / 2, y - 0.25, (z0 + z1) / 2); parent.add(m); return m; };
  gbox(-GX, -BX - 0.3, GB, GZ); gbox(BX + 0.3, GX, GB, GZ); gbox(-BX - 0.3, BX + 0.3, 0.3, GZ); gbox(-BX - 0.3, BX + 0.3, GB, -LEN - 0.3);
  gbox(-3, 3, GZ - 0.01, CZ + 0.4, mats.path);
  const kerb = (x0, x1, z0, z1) => { const m = new THREE.Mesh(unitBox, cmat(0xe9d8b0)); m.scale.set(x1 - x0, 0.3, z1 - z0); m.position.set((x0 + x1) / 2, 0.15, (z0 + z1) / 2); parent.add(m); };
  kerb(-GX - 0.3, -GX, GB, GZ); kerb(GX, GX + 0.3, GB, GZ); kerb(-GX, -3.3, GZ, GZ + 0.3); kerb(3.3, GX, GZ, GZ + 0.3); kerb(-GX, GX, GB - 0.3, GB);
  kerb(-3.3, -3, GZ, CZ); kerb(3, 3.3, GZ, CZ);
  // colliders around the walkable land
  addCollider(-GX - 0.4, (GB + GZ) / 2, 0.8, GZ - GB + 1, [0]); addCollider(GX + 0.4, (GB + GZ) / 2, 0.8, GZ - GB + 1, [0]); addCollider(0, GB - 0.4, 2 * GX + 1.6, 0.8, [0]);
  addCollider(-(GX + 3.3) / 2 - 0.0, GZ + 0.2, GX - 3.3, 0.5, [0]); addCollider((GX + 3.3) / 2, GZ + 0.2, GX - 3.3, 0.5, [0]);
  addCollider(-3.4, (GZ + CZ) / 2, 0.5, CZ - GZ + 1, [0]); addCollider(3.4, (GZ + CZ) / 2, 0.5, CZ - GZ + 1, [0]);
  addCollider(0, CZ + 0.3, 8, 0.6, [0]);
  // paved path to the door
  const pave = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#d9bd92'; g.fillRect(0, 0, w, h); const cols = ['#c9a57a', '#d6b88c', '#bf9a6c', '#dcc296'];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 4; c++) { g.fillStyle = cols[(r * 3 + c * 5) % 4]; g.fillRect(c * 64 + (r % 2 ? 32 : 0) - 32 + 2, r * 32 + 2, 60, 28); }
  }, [1.5, 12]);
  const path = new THREE.Mesh(unitPlane, new THREE.MeshStandardMaterial({ map: pave, roughness: 0.95 })); path.rotation.x = -Math.PI / 2; path.scale.set(3.4, CZ - 0.6, 1); path.position.set(0, 0.012, (CZ + 0.6) / 2); parent.add(path);
  const plaza = new THREE.Mesh(unitPlane, new THREE.MeshStandardMaterial({ map: pave, roughness: 0.95 })); plaza.rotation.x = -Math.PI / 2; plaza.scale.set(8, 5, 1); plaza.position.set(0, 0.011, 3.2); parent.add(plaza);
  // lamp posts along the path
  for (let z = 4; z < GZ; z += 6) { lampPost(-2.3, z); lampPost(2.3, z); }
  // pools with fountains beside the path
  [-1, 1].forEach((s) => {
    const cx = s * 7.5, cz = 11;
    const rim = new THREE.Mesh(rbGeo(6, 0.4, 3.6, 0.12), cmat(0xf1e3c4)); rim.position.set(cx, 0.2, cz); parent.add(rim);
    const w = new THREE.Mesh(unitPlane, mats.water); w.rotation.x = -Math.PI / 2; w.scale.set(5.4, 3.0, 1); w.position.set(cx, 0.43, cz); parent.add(w);
    addCollider(cx, cz, 6, 3.6, [0]);
    [-1.4, 0, 1.4].forEach((o, i) => { const j = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.5 - (i === 1 ? 0 : 0.5), 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })); j.position.set(cx + o, 0.43 + 0.75, cz); parent.add(j); anim.jets.push({ m: j, ph: i + s }); });
    // flower beds and hedges behind the pools
    const fb = []; for (let i = 0; i < 30; i++) fb.push({ x: cx + (Math.random() - 0.5) * 6.4, y: 0.35, z: cz + 2.5 + Math.random() * 1.2, c: [0xe8679a, 0xff7eb6, 0xc084fc, 0xa78bfa, 0xffffff][i % 5], sx: 1, sy: 0.8, sz: 1 });
    inst(new THREE.SphereGeometry(0.28, 8, 6), cmat(0xffffff), fb);
    rb(parent, 6.2, 0.6, 0.9, cx, 0, cz + 2.4, 0x4f9a5a, 0, 0.3);
  });
  // gazebo (left) and swing pergola (right)
  { const gx = -17, gz = 8, g = new THREE.Group(); g.position.set(gx, 0, gz); parent.add(g);
    rb(g, 6, 0.25, 6, 0, 0, 0, 0xf1e3c4, 0, 0.05);
    [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]].forEach(([x, z]) => cyl(g, 0.16, 3, x, 0.25, z, 0xf1e3c4, 10));
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.6, 1.9, 4), cmat(0xb5493e)); roof.position.y = 3.25 + 0.95; roof.rotation.y = Math.PI / 4; g.add(roof);
    sofa(g, 0, -2.0, 0, 0xc0654a, 3.2); rb(g, 1.4, 0.4, 1.0, 0, 0.25, 0, 0x9c7a5c, 0, 0.08);
    [-2.8, 0, 2.8].forEach((x) => { const b = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), warm); b.position.set(x, 3.1, 2.7); g.add(b); });
    addCollider(gx, gz, 6, 6, [0]); }
  { const gx = 17, gz = 8, g = new THREE.Group(); g.position.set(gx, 0, gz); parent.add(g);
    [[-2.2, -1.2], [2.2, -1.2], [-2.2, 1.2], [2.2, 1.2]].forEach(([x, z]) => { const m = new THREE.Mesh(unitBox, cmat(0xb5493e)); m.scale.set(0.2, 3.0, 0.2); m.position.set(x, 1.5, z); g.add(m); });
    [-1.2, 1.2].forEach((z) => { const m = new THREE.Mesh(unitBox, cmat(0xb5493e)); m.scale.set(5.0, 0.2, 0.2); m.position.set(0, 3.0, z); g.add(m); });
    rb(g, 2.4, 0.14, 0.8, 0, 0.6, 0, 0xb98a5a, 0, 0.04); rb(g, 2.4, 0.6, 0.1, 0, 0.7, -0.38, 0xb98a5a, 0, 0.04); rb(g, 1.0, 0.18, 0.7, -0.6, 0.74, 0, 0xf4a6cd, 0, 0.06); rb(g, 1.0, 0.18, 0.7, 0.6, 0.74, 0, 0xc4b5fd, 0, 0.06);
    [-1.1, 1.1].forEach((x) => [-0.3, 0.3].forEach((z) => cyl(g, 0.012, 2.4, x, 0.65, z, 0x8a7f9a, 6)));
    addCollider(gx, gz, 5.2, 2.8, [0]); }
  // palms, trees
  [[-10, 4], [10, 4], [-24, 3], [24, 3], [-26, 18], [26, 18], [-14, 19], [14, 19]].forEach(([x, z], i) => palm(x, z, 0.9 + (i % 3) * 0.1));
  [[-28, -10], [28, -10], [-28, -30], [28, -30], [-20, -50], [20, -50], [-28, -70], [28, -70], [0, -80], [-16, -75], [16, -75], [-26, 8], [26, 10]].forEach(([x, z], i) => tree(x, z, 1.1 + (i % 4) * 0.15));
  // hedges lining the path
  for (let z = 6; z < GZ - 1; z += 5) { rb(parent, 0.8, 0.7, 4.2, -3.9, 0, z + 0.4, 0x4f9a5a, 0, 0.3); rb(parent, 0.8, 0.7, 4.2, 3.9, 0, z + 0.4, 0x4f9a5a, 0, 0.3); }
  // flower beds along the path
  { const fb = []; for (let i = 0; i < 80; i++) { const s = i % 2 ? 1 : -1; fb.push({ x: s * (2.0 + Math.random() * 1.2), y: 0.3, z: 3 + Math.random() * (GZ - 4), c: [0xe8679a, 0xff7eb6, 0xc084fc, 0xa78bfa, 0xffffff, 0xf0a63a][i % 6], sx: 1, sy: 0.7, sz: 1 }); } inst(new THREE.SphereGeometry(0.24, 8, 6), cmat(0xffffff), fb); }
  // gate at the end of the causeway (closed behind the visitor)
  [-1, 1].forEach((s) => {
    const p = new THREE.Group(); p.position.set(s * 3.5, 0, CZ + 0.3); parent.add(p);
    rb(p, 0.9, 2.2, 0.9, 0, 0, 0, 0xf1e3c4, 0, 0.06); rb(p, 1.1, 0.16, 1.1, 0, 2.2, 0, 0xd9a93e, 0, 0.04);
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.5), warm); l.position.y = 2.6; p.add(l);
    const lc = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.4, 4), cmat(0x2d2540)); lc.position.y = 3.1; lc.rotation.y = Math.PI / 4; p.add(lc);
    const gt = new THREE.Group(); gt.position.set(-s * 1.75, 0, 0); iron(gt, 2.9, 2.0); p.add(gt);
    const sp = []; for (let i = 0; i < 6; i++) sp.push({ x: s * 3.9 + (Math.random() - 0.5) * 1.2, y: 0.35, z: CZ - 0.6 + Math.random() * 0.5, c: [0xe8679a, 0xff7eb6, 0xc084fc][i % 3], sx: 1, sy: 0.8, sz: 1 }); inst(new THREE.SphereGeometry(0.28, 8, 6), cmat(0xffffff), sp);
  });
  const gs = labelPlane('Thunder Office', 'Walk to the main door', 2.8, 0.62, { ac: '#7C3AED' }); gs.position.set(0, 2.5, CZ + 0.3); gs.rotation.y = Math.PI; parent.add(gs);
  // road with cars
  { const rd = new THREE.Mesh(unitBox, mats.road); rd.scale.set(W, 0.4, 8.2); rd.position.set(0, -0.15, CZ + 4.5); parent.add(rd);
    const dashes = []; for (let x = -200; x < 200; x += 6) dashes.push({ x, y: 0.06, z: CZ + 4.5, sx: 2.6, sy: 0.02, sz: 0.2 }); inst(unitBox, cmat(0xffffff), dashes);
    const pv = new THREE.Mesh(unitPlane, cmat(0xe3d5b5)); pv.rotation.x = -Math.PI / 2; pv.scale.set(W, 3, 1); pv.position.set(0, -0.0, CZ - 0.9); pv.renderOrder = 1; }
  [[0xe8679a, 1, 12, CZ + 2.8], [0x60a5fa, -1, 15, CZ + 6.2], [0xf0a63a, 1, 10, CZ + 2.8], [0xa78bfa, -1, 13, CZ + 6.2]].forEach(([c, dir, spd, z], i) => {
    const car = new THREE.Group(); parent.add(car);
    rb(car, 3.6, 0.7, 1.7, 0, 0.3, 0, c, 0, 0.25); rb(car, 1.9, 0.6, 1.5, -0.1, 0.95, 0, 0xffffff, 0, 0.25);
    [[-1.1, 0.8], [1.1, 0.8], [-1.1, -0.8], [1.1, -0.8]].forEach(([x, zz]) => { const w = cyl(car, 0.32, 0.25, x, 0, zz, 0x2d2540, 14); w.rotation.x = Math.PI / 2; w.position.y = 0.32; });
    car.scale.x = dir; anim.cars.push({ m: car, x: -90 + i * 55, z, dir, spd }); car.position.set(-90 + i * 55, 0.05, z);
  });
  // far skyline ring and clouds
  { const sk = [], rnd = (a) => { const x = Math.sin(a * 12.9898) * 43758.5453; return x - Math.floor(x); };
    for (let i = 0; i < 70; i++) { const a = (i / 70) * Math.PI * 2, r = 135 + rnd(i) * 40; const h = 12 + rnd(i + 9) * 46, w = 8 + rnd(i + 3) * 12;
      if (Math.cos(a) * 0 + Math.sin(a) > 0.7 && Math.abs(Math.cos(a)) < 0.35) continue; // keep the view over the road open
      sk.push({ x: Math.sin(a) * r, y: h / 2 - 1, z: -30 + Math.cos(a) * r, sx: w, sy: h, sz: w }); }
    inst(unitBox, mats.skyline, sk);
    for (let i = 0; i < 9; i++) { const g = new THREE.Group(); g.position.set(-150 + i * 40 + rnd(i) * 20, 60 + rnd(i + 4) * 25, -170 - rnd(i + 2) * 60); parent.add(g);
      [[0, 0, 7], [6, -1, 5], [-6, -1, 5], [3, 2, 4.5]].forEach(([x, y, r]) => { const s = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), mats.cloud); s.position.set(x, y, 0); s.scale.y = 0.6; g.add(s); }); } }
  spaces.push({ x0: -GX, x1: GX, z0: 0.45, z1: GZ, level: 0, name: 'Garden', kind: 'area', id: 'garden' });
  spaces.push({ x0: -3, x1: 3, z0: GZ, z1: CZ + 1, level: 0, name: 'Entry', kind: 'area', id: 'entry' });
  spaces.push({ x0: -GX, x1: -BX - 0.3, z0: GB, z1: 0.45, level: 0, name: 'Garden', kind: 'area', id: 'garden2' });
  spaces.push({ x0: BX + 0.3, x1: GX, z0: GB, z1: 0.45, level: 0, name: 'Garden', kind: 'area', id: 'garden3' });
  spaces.push({ x0: -BX - 0.3, x1: BX + 0.3, z0: GB, z1: -LEN - 0.3, level: 0, name: 'Garden', kind: 'area', id: 'garden4' });
}

/* ============================== build everything ======================= */
const tick = () => new Promise((r) => setTimeout(r, 0));
const prog = (f, t) => { const b = $('lbar'), x = $('ltxt'); if (b) b.style.width = Math.round(f * 100) + '%'; if (x) x.textContent = t; };
async function build() {
  prog(0.04, 'Preparing the garden'); await tick();
  buildExterior(); prog(0.22, 'Ground floor'); await tick();
  buildGround(); prog(0.32, 'Floor 2'); await tick();
  buildFloor(FLOORS[1]); prog(0.42, 'Floor 3, the member rooms'); await tick();
  buildFloor(FLOORS[2]); prog(0.68, 'Floor 4'); await tick();
  buildFloor(FLOORS[3]); prog(0.8, 'Floor 5'); await tick();
  buildFloor(FLOORS[4]); prog(0.9, 'The terrace'); await tick();
  buildTerrace(); parent = world; prog(0.96, 'Finishing up'); await tick();
  finishPictures();
  applyTheme((() => { try { return localStorage.getItem('theme') === 'dark' ? 'dark' : 'light'; } catch (e) { return 'light'; } })());
  prog(1, 'Ready');
}

/* optional .glb decor ---------------------------------------------------- */
async function loadDecor() {
  let man = {};
  try { const r = await fetch('models/manifest.json'); if (r.ok) man = await r.json(); } catch (e) {}
  const gl = new GLTFLoader(); gl.setMeshoptDecoder(MeshoptDecoder);
  const load = (u) => new Promise((res) => gl.load(u, (g) => res(g.scene), undefined, () => res(null)));
  for (const id of man.decor || []) {
    const info = roomInfo[id]; if (!info) continue;
    const s = await load('models/decor_' + id + '.glb'); if (!s) continue;
    info.group.remove(info.props); info.props = new THREE.Group(); info.props.add(s); info.group.add(info.props);
    info.cols.forEach((c) => { const i = colliders.indexOf(c); if (i >= 0) colliders.splice(i, 1); }); info.cols = [];
  }
  const adds = { building: [0, 0], terrace: [5, 0], lobby: [0, 0] };
  for (const [k, [lv]] of Object.entries(adds)) if ((man.areas || []).includes(k)) { const s = await load('models/' + k + '_decor.glb'); if (s) floorGroups[lv].add(s); }
}

/* ============================== player & input ========================= */
const player = { x: 0, z: CZ - 1.6, yaw: 0, pitch: 0.14, bob: 0, level: 0, gy: 0 };
const faceDir = (dx, dz) => Math.atan2(-dx, -dz);
const keys = {};
const joy = { x: 0, y: 0, id: null };
let started = false, uiOpen = false;
let walkT = null;        // tap-to-walk target
const tour = { on: false, i: -1, stops: [], wp: [], hold: 0, wait: 0, paused: false, face: null };

function collide(nx, nz) {
  const lvl = player.level;
  for (let it = 0; it < 2; it++) {
    for (const c of colliders) {
      if (!c.lv.includes(lvl)) continue;
      if (nx < c.x0 - R || nx > c.x1 + R || nz < c.z0 - R || nz > c.z1 + R) continue;
      const cx = Math.max(c.x0, Math.min(nx, c.x1)), cz = Math.max(c.z0, Math.min(nz, c.z1));
      const dx = nx - cx, dz = nz - cz, d2 = dx * dx + dz * dz;
      if (d2 < R * R) {
        if (d2 > 1e-8) { const d = Math.sqrt(d2), p = (R - d) / d; nx += dx * p; nz += dz * p; }
        else { const l = nx - c.x0, r = c.x1 - nx, t = nz - c.z0, b = c.z1 - nz, m = Math.min(l, r, t, b); if (m === l) nx = c.x0 - R; else if (m === r) nx = c.x1 + R; else if (m === t) nz = c.z0 - R; else nz = c.z1 + R; }
      }
    }
  }
  return [nx, nz];
}
function moveBy(dx, dz) {
  let [nx, nz] = collide(player.x + dx, player.z); [nx, nz] = collide(nx, player.z + dz);
  const m = Math.hypot(nx - player.x, nz - player.z); player.x = nx; player.z = nz; return m;
}
/** Height of the floor under the player. On a flight of stairs it follows the slope and switches level at the ends. */
function groundY() {
  for (const r of ramps) {
    const zl = Math.min(r.a, r.b), zh = Math.max(r.a, r.b);
    if (player.x >= r.x0 && player.x <= r.x1 && player.z >= zl && player.z <= zh && (player.level === r.lo || player.level === r.hi)) {
      const t = Math.max(0, Math.min(1, (player.z - r.a) / (r.b - r.a)));
      if (t >= 0.9) player.level = r.hi; else if (t <= 0.1) player.level = r.lo;
      return r.yA + (r.yB - r.yA) * t;
    }
  }
  return player.level * FH;
}
const isOutside = () => player.level === 0 && player.z > 0.45;

/* look + move ----------------------------------------------------------- */
addEventListener('keydown', (e) => {
  if (e.target && /input|textarea/i.test(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown'].includes(k)) { walkT = null; if (tour.on) stopTour(); }
  if (k === 'e' || k === 'enter') { if (started && !uiOpen) interact(); }
  if (k === 'm') togglePanel();
  if (k === 'escape') { if (popup.classList.contains('show')) closePopup(); else if (panel.classList.contains('show')) togglePanel(false); else if (tour.on) stopTour(); }
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

/* pointer: drag-look, joystick, tap-interact, tap-to-walk */
const joyBase = $('joyBase'), joyKnob = $('joyKnob');
const ptrs = new Map();
canvas.addEventListener('pointerdown', (e) => {
  if (!started || uiOpen) return;
  const isJoy = e.pointerType === 'touch' && e.clientX < innerWidth * 0.42 && e.clientY > innerHeight * 0.35;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), joy: isJoy });
  if (isJoy) {
    joy.id = e.pointerId; walkT = null; if (tour.on) stopTour();
    joyBase.style.left = e.clientX - 60 + 'px'; joyBase.style.top = e.clientY - 60 + 'px'; joyBase.classList.add('on');
    joyBase._cx = e.clientX; joyBase._cy = e.clientY; joyKnob.style.transform = 'translate(0,0)';
  }
  try { canvas.setPointerCapture(e.pointerId); } catch (x) {}
});
const mouse = { x: 0, y: 0, in: false };
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') { mouse.x = (e.clientX / innerWidth) * 2 - 1; mouse.y = -(e.clientY / innerHeight) * 2 + 1; mouse.in = true; }
  const p = ptrs.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (p.joy) {
    const r = 46; let jx = e.clientX - joyBase._cx, jy = e.clientY - joyBase._cy; const m = Math.hypot(jx, jy);
    if (m > r) { jx = jx / m * r; jy = jy / m * r; }
    joy.x = jx / r; joy.y = jy / r; joyKnob.style.transform = `translate(${jx}px,${jy}px)`;
  } else {
    const s = e.pointerType === 'touch' ? 0.0052 : 0.0035;
    player.yaw -= dx * s; player.pitch = Math.max(-1.25, Math.min(1.25, player.pitch - dy * s));
  }
});
function endPtr(e) {
  const p = ptrs.get(e.pointerId); if (!p) return;
  ptrs.delete(e.pointerId);
  if (p.joy) { joy.x = joy.y = 0; joy.id = null; joyBase.classList.remove('on'); return; }
  const moved = Math.hypot(e.clientX - p.sx, e.clientY - p.sy), dt = performance.now() - p.t;
  if (moved < 9 && dt < 450 && started && !uiOpen) {
    const hit = interactAt(e.clientX, e.clientY);
    if (!hit && e.pointerType === 'touch') tapWalk(e.clientX, e.clientY);
  }
}
canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);

/* interaction ----------------------------------------------------------- */
const ray = new THREE.Raycaster(); ray.far = 5.2;
const v2 = new THREE.Vector2();
function blocked(ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  for (const c of colliders) {
    if (c.p || !c.lv.includes(player.level)) continue;
    let t0 = 0, t1 = 1;
    for (const [p, d, lo, hi] of [[ax, dx, c.x0, c.x1], [az, dz, c.z0, c.z1]]) {
      if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) { t0 = 2; break; } }
      else { let a = (lo - p) / d, b = (hi - p) / d; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) break; }
    }
    if (t0 <= t1 && t0 < 0.98) return true;
  }
  return false;
}
function pick(nx, ny) {
  v2.set(nx, ny); ray.setFromCamera(v2, camera);
  const h = ray.intersectObjects(interactMeshes, false);
  if (!h.length) return null;
  const p = h[0].point;
  return blocked(camera.position.x, camera.position.z, p.x, p.z) ? null : h[0].object.userData.key;
}
function hoverPick() { return isTouch || !mouse.in ? pick(0, 0) : pick(mouse.x, mouse.y); }
function interact() { const k = hoverPick(); if (k) openPopup(k); return !!k; }
function interactAt(cx, cy) { const k = pick((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1); if (k) openPopup(k); return !!k; }
const floorMarker = new THREE.Mesh(new THREE.RingGeometry(0.14, 0.24, 24), new THREE.MeshBasicMaterial({ color: 0x7c3aed, transparent: true, opacity: 0.9, depthWrite: false }));
floorMarker.rotation.x = -Math.PI / 2; floorMarker.visible = false; scene.add(floorMarker);
function tapWalk(cx, cy) {
  v2.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1); ray.setFromCamera(v2, camera);
  const o = ray.ray.origin, d = ray.ray.direction; if (d.y > -0.02) return;
  const t = (player.gy - o.y) / d.y; if (t < 0 || t > 24) return;
  walkT = { x: o.x + d.x * t, z: o.z + d.z * t, stuck: 0 };
  floorMarker.position.set(walkT.x, player.gy + 0.03, walkT.z); floorMarker.visible = true;
}
const walkLabel = (key) => (POPS[key] ? POPS[key].title : ROOMS[key] ? ROOMS[key].title : '');

/* ============================== UI ===================================== */
const popup = $('popup'), panel = $('panel'), prompt = $('prompt'), whereEl = $('where'), hint = $('hint');
function setUi() { uiOpen = popup.classList.contains('show') || panel.classList.contains('show') || !started; }
function openPopup(key) {
  let d = POPS[key];
  if (!d) {
    const r = ROOMS[key]; if (!r || r.noPics) return;
    d = { img: 'assets/room-' + key + '.webp', title: r.kind === 'personal' ? r.title + "'s room" : r.title, tag: r.tag + (r.kind === 'personal' ? ' / ' + r.sub : ''), tint: r.tint, why: r.why, who: r.who, member: r.kind === 'personal' ? r.member : null };
  }
  $('pImg').src = d.img; $('pImg').alt = d.title;
  $('pTag').textContent = d.tag; $('pTag').style.setProperty('--tc', TINTS[d.tint] || '#7C3AED');
  $('pTitle').textContent = d.title; $('pWhy').textContent = d.why;
  const who = $('pWho'); who.innerHTML = '';
  (d.who || []).forEach((w) => {
    const chip = document.createElement('span'); chip.className = 'chip-who';
    if (MEMBERS[w]) { const im = document.createElement('img'); im.src = 'assets/' + MEMBERS[w].file + '.webp'; im.alt = ''; chip.appendChild(im); chip.appendChild(document.createTextNode(MEMBERS[w].name)); }
    else chip.textContent = w;
    who.appendChild(chip);
  });
  $('pWhoBox').style.display = (d.who || []).length ? '' : 'none';
  const card = $('pCard');
  if (d.member) {
    const m = MEMBERS[d.member]; card.style.display = '';
    $('cImg').src = 'assets/' + m.file + '.webp'; $('cName').textContent = m.name; $('cNick').textContent = 'Nickname: ' + m.nick;
    const sk = $('cSkills'); sk.innerHTML = ''; (m.skills || []).forEach((s) => { const c = document.createElement('span'); c.textContent = s; sk.appendChild(c); });
  } else card.style.display = 'none';
  popup.classList.add('show'); popup.removeAttribute('aria-hidden'); setUi();
  setTimeout(() => $('pClose').focus({ preventScroll: true }), 60);
}
function closePopup() { popup.classList.remove('show'); popup.setAttribute('aria-hidden', 'true'); setUi(); canvas.focus(); }
$('pClose').addEventListener('click', closePopup);
popup.addEventListener('click', (e) => { if (e.target === popup) closePopup(); });
function togglePanel(force) {
  const open = force === undefined ? !panel.classList.contains('show') : force;
  panel.classList.toggle('show', open); setUi();
}
$('mapBtn').addEventListener('click', () => togglePanel()); $('panelClose').addEventListener('click', () => togglePanel(false));
$('mini').addEventListener('click', () => togglePanel(true));
$('themeBtn').addEventListener('click', () => applyTheme(theme === 'dark' ? 'light' : 'dark'));
$('helpBtn').addEventListener('click', () => { $('start').classList.remove('hide'); $('startBtn').firstChild.textContent = 'Back to the office'; started = false; if (tour.on) stopTour(); setUi(); });

/* ---- places you can jump to ---- */
const SPOTS = {
  outside: { x: 0, z: CZ - 1.6, yaw: 0, pitch: 0.14, level: 0 },
  waiting: { x: 0, z: -3.2, yaw: faceDir(0, -1), level: 0 },
  terrace: { x: 0, z: -12, yaw: faceDir(0, -1), level: 5 },
  floor2: { x: 0, z: -6.2, yaw: faceDir(0, -1), level: 1 }, floor3: { x: 0, z: -6.2, yaw: faceDir(0, -1), level: 2 },
  floor4: { x: 0, z: -6.2, yaw: faceDir(0, -1), level: 3 }, floor5: { x: 0, z: -6.2, yaw: faceDir(0, -1), level: 4 },
};
function poseOf(id) {
  if (SPOTS[id]) return SPOTS[id];
  const r = roomInfo[id]; if (!r) return null;
  return { x: r.entry.x, z: r.entry.z, yaw: faceDir(r.entry.face[0], r.entry.face[1]), level: r.level };
}
let goT = null;
function setPose(p) {
  player.x = p.x; player.z = p.z; player.yaw = p.yaw; player.pitch = p.pitch || 0; player.level = p.level || 0; player.gy = player.level * FH;
  walkT = null; floorMarker.visible = false; joy.x = joy.y = 0; envUpdate(true);
}
function go(p, after) {
  const f = $('fade'); f.classList.add('on'); clearTimeout(goT);
  goT = setTimeout(() => { setPose(p); f.classList.remove('on'); if (after) after(); }, 240);
}
function teleport(id) { const p = poseOf(id); if (!p) return; if (tour.on) stopTour(); go(p); }
function ride(level) { if (tour.on) stopTour(); go({ x: LIFT.x, z: LIFT.z, yaw: faceDir(0, -1), level }); }

(function buildLiftUi() {
  const box = $('liftBtns'); const labs = ['G', '2', '3', '4', '5', 'Roof'];
  labs.forEach((t, l) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.title = LEVEL_NAMES[l]; b.dataset.l = l; b.addEventListener('click', () => { if (player.level !== l) ride(l); }); box.appendChild(b); });
})();
const liftEl = $('lift');
function inLift() { return started && !uiOpen && player.x > 2.8 && player.x < 5.6 && player.z > -3.65 && player.z < -0.35 && player.level >= 0 && !isOutside(); }
let liftShown = false, liftLevel = -1;
function updateLiftUi() {
  const on = inLift();
  if (on !== liftShown) { liftShown = on; liftEl.classList.toggle('show', on); }
  if (on && liftLevel !== player.level) { liftLevel = player.level; [...$('liftBtns').children].forEach((b) => b.classList.toggle('cur', +b.dataset.l === player.level)); $('liftName').textContent = LEVEL_NAMES[player.level]; }
}

/* ---- map panel ---- */
function buildPanel() {
  const list = $('panelList'); list.innerHTML = '';
  const add = (title, items) => {
    const h = document.createElement('h3'); h.textContent = title; list.appendChild(h);
    const box = document.createElement('div'); box.className = 'plist'; list.appendChild(box);
    items.forEach(([label, id, tint, thumb]) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'pitem';
      if (thumb) { const im = document.createElement('img'); im.src = thumb; im.alt = ''; im.loading = 'lazy'; b.appendChild(im); }
      else { const d = document.createElement('i'); d.style.background = TINTS[tint] || '#5B8DF5'; b.appendChild(d); }
      const s = document.createElement('span'); s.textContent = label; b.appendChild(s);
      b.addEventListener('click', () => { togglePanel(false); teleport(id); });
      box.appendChild(b);
    });
  };
  const rm = (id) => { const r = ROOMS[id]; return [r.title, id, r.tint, r.kind === 'personal' ? 'assets/' + MEMBERS[r.member].file + '.webp' : null]; };
  add('Outside', [['Garden entry (start)', 'outside', 'b']]);
  add('Ground floor', [['Waiting area', 'waiting', 'b'], rm('rest'), rm('sleep')]);
  add('Floor 2', [['Lobby', 'floor2', 'g'], rm('ca')]);
  add('Floor 3 · Team rooms', [['Lobby', 'floor3', 'v'], ...FLOORS[2].left.map(rm), ...FLOORS[2].right.map(rm), rm(FLOORS[2].end)]);
  add('Floor 4 · Common rooms', [['Lobby', 'floor4', 'p'], rm('singing'), rm('dancing'), rm('living')]);
  add('Floor 5 · Creative floor', [['Lobby', 'floor5', 'a'], rm('creativity'), rm('designer'), rm('tech')]);
  add('Roof', [['Terrace and pool', 'terrace', 'v']]);
}

/* ---- guided tour ---- */
const tourBar = $('tourBar');
function buildTourStops() {
  const S = [];
  S.push({ cap: 'Outside · The garden and the entry', pose: SPOTS.outside, walk: [[0, 14]], hold: 3.2 });
  S.push({ cap: 'The main door. Knock and wait.', walk: [[0, 4.2]], hold: 3 });
  S.push({ cap: 'Ground floor · Waiting area', walk: [[0, -1.5], [0, -9]], hold: 3 });
  ['rest', 'sleep'].forEach((id) => { const r = roomInfo[id]; S.push({ cap: 'Ground floor · ' + ROOMS[id].title, walk: [[r.walk[0][0] * 0.4, -9], ...r.walk], face: r.entry.face, hold: 3, room: id }); });
  FLOORS.slice(1).forEach((f) => {
    const l = f.level, ids = [...(f.left || []).flatMap((a, i) => [a, f.right[i]].filter(Boolean)), f.end];
    S.push({ cap: f.name + ' · ' + f.sign, pose: { x: LIFT.x, z: -4.6, yaw: faceDir(0, -1), level: l }, walk: [[0, -8.2], [0, Zc(1.2)]], hold: 2, floor: l });
    let prev = null;
    ids.forEach((id) => {
      const r = roomInfo[id]; const rv = prev ? prev.slice(0, -1).reverse() : [];
      S.push({ cap: f.name + ' · ' + (ROOMS[id].kind === 'personal' ? ROOMS[id].title + "'s room" : ROOMS[id].title), walk: [...rv, ...r.walk], face: r.entry.face, hold: 3.6, room: id });
      prev = r.walk;
    });
  });
  S.push({ cap: 'Terrace · The swimming pool', pose: SPOTS.terrace, walk: [[0, -18]], hold: 4 });
  return S;
}
function startStop(i) {
  tour.i = i; const s = tour.stops[i];
  if (!s) { stopTour(); return; }
  $('tourCap').textContent = s.cap; $('tourCount').textContent = (i + 1) + ' / ' + tour.stops.length;
  tour.wp = s.walk.map((p) => p.slice()); tour.hold = s.hold; tour.face = s.face ? faceDir(s.face[0], s.face[1]) : null; tour.wait = 0;
  if (s.pose) { tour.wait = 99; go(s.pose, () => { tour.wait = 0.5; }); }
}
function startTour() {
  if (!tour.stops.length) tour.stops = buildTourStops();
  togglePanel(false); tour.on = true; tour.paused = false; walkT = null; floorMarker.visible = false;
  tourBar.classList.add('show'); $('tourPause').textContent = 'Pause'; $('tourBtn').classList.add('on');
  hint.classList.remove('show'); startStop(0);
}
function stopTour() { tour.on = false; clearTimeout(goT); $('fade').classList.remove('on'); tourBar.classList.remove('show'); $('tourBtn').classList.remove('on'); }
$('tourBtn').addEventListener('click', () => (tour.on ? stopTour() : (started ? startTour() : null)));
$('tourStop').addEventListener('click', stopTour);
$('tourNext').addEventListener('click', () => { if (tour.on) startStop(Math.min(tour.i + 1, tour.stops.length)); });
$('tourPause').addEventListener('click', () => { tour.paused = !tour.paused; $('tourPause').textContent = tour.paused ? 'Resume' : 'Pause'; });
function turnTo(target, dt) { let d = target - player.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); player.yaw += Math.max(-4 * dt, Math.min(4 * dt, d)); }
function tourStep(dt) {
  if (tour.paused) return;
  if (tour.wait > 0) { tour.wait -= dt; return; }
  player.pitch += (0 - player.pitch) * Math.min(1, dt * 2);
  if (tour.wp.length) {
    const [tx, tz] = tour.wp[0], dx = tx - player.x, dz = tz - player.z, d = Math.hypot(dx, dz), st = 3.4 * dt;
    if (d <= st) { player.x = tx; player.z = tz; tour.wp.shift(); } else { player.x += dx / d * st; player.z += dz / d * st; turnTo(faceDir(dx, dz), dt); }
    player.bob += dt * 7.5;
  } else {
    if (tour.face !== null) turnTo(tour.face, dt);
    tour.hold -= dt; if (tour.hold <= 0) startStop(tour.i + 1);
  }
}

/* start screen */
const startEl = $('start');
$('startBtn').addEventListener('click', () => {
  startEl.classList.add('hide'); started = true; setUi();
  hintDone = false; setTimeout(() => { hintDone = true; updateHint(); }, 7000); updateHint();
  const h = location.hash.replace('#', ''); if (h && poseOf(h)) teleport(h);
});
let hintDone = false;
function updateHint() { hint.classList.toggle('show', started && !isTouch && !uiOpen && !hintDone && !tour.on); }

/* ---- minimap (one floor at a time) ---- */
const mini = $('mini'), mctx = mini.getContext('2d');
const MW = isTouch ? 62 : 80, MHh = Math.round(MW * 2.5);
mini.width = MW * 2; mini.height = MHh * 2; mini.style.width = MW + 'px'; mini.style.height = MHh + 'px';
const MB = { x0: -13, x1: 13, z0: -LEN - 1, z1: 4 };
const mS = Math.min((MW * 2 - 12) / (MB.x1 - MB.x0), (MHh * 2 - 34) / (MB.z1 - MB.z0));
const mx = (x) => 6 + (x - MB.x0) * mS, mz = (z) => 28 + (z - MB.z0) * mS;
let miniBg = null, miniLv = -1;
function miniDraw() {
  miniLv = player.level;
  const css = getComputedStyle(document.documentElement);
  miniBg = document.createElement('canvas'); miniBg.width = MW * 2; miniBg.height = MHh * 2; const g = miniBg.getContext('2d');
  g.fillStyle = css.getPropertyValue('--primary-soft').trim(); g.globalAlpha = 0.45; g.fillRect(mx(-BX), mz(-LEN), 2 * BX * mS, LEN * mS); g.globalAlpha = 1;
  spaces.filter((s) => s.level === miniLv && s.kind !== 'area').forEach((s) => {
    g.fillStyle = s.kind === 'room' ? (TINTS[ROOMS[s.id].tint] + 'cc') : s.kind === 'hall' ? css.getPropertyValue('--primary').trim() + '66' : css.getPropertyValue('--primary-soft').trim();
    g.fillRect(mx(s.x0), mz(s.z0), (s.x1 - s.x0) * mS, (s.z1 - s.z0) * mS);
  });
  g.fillStyle = css.getPropertyValue('--ink').trim(); g.font = '800 15px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(LEVEL_NAMES[miniLv].replace('Ground floor', 'Ground'), MW, 18);
}
window.__miniDraw = miniDraw;
function miniFrame() {
  if (miniLv !== player.level) miniDraw();
  mctx.clearRect(0, 0, MW * 2, MHh * 2); if (miniBg) mctx.drawImage(miniBg, 0, 0);
  const px = mx(Math.max(MB.x0, Math.min(MB.x1, player.x))), pz = mz(Math.max(MB.z0, Math.min(MB.z1, player.z))), fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  mctx.fillStyle = '#ffffff'; mctx.strokeStyle = '#1b2340'; mctx.lineWidth = 2;
  mctx.beginPath(); mctx.moveTo(px + fx * 11, pz + fz * 11); mctx.lineTo(px - fz * 6.5 - fx * 5, pz + fx * 6.5 - fz * 5); mctx.lineTo(px + fz * 6.5 - fx * 5, pz - fx * 6.5 - fz * 5); mctx.closePath(); mctx.fill(); mctx.stroke();
}

/* where am I */
let lastWhere = '';
const KIND_RANK = { room: 4, area: 3, corridor: 2, hall: 1 };
function whereAmI() {
  let found = null;
  for (const s of spaces) {
    if (s.level !== player.level) continue;
    if (player.x < s.x0 || player.x > s.x1 || player.z < s.z0 || player.z > s.z1) continue;
    if (!found || KIND_RANK[s.kind] > KIND_RANK[found.kind]) found = s;
  }
  let name = '';
  if (found) {
    name = found.kind === 'room' ? (ROOMS[found.id].kind === 'personal' ? ROOMS[found.id].title + "'s room" : found.name) : found.name;
    if (!isOutside()) name = LEVEL_NAMES[player.level] + (found.id === 'terrace' || found.id === 'waiting' ? '' : ' · ' + name);
    if (!isOutside() && (found.id === 'terrace')) name = 'Terrace and pool';
    if (!isOutside() && found.id === 'waiting') name = 'Ground floor · Waiting area';
  }
  if (name !== lastWhere) { lastWhere = name; whereEl.textContent = name; whereEl.classList.remove('pop'); void whereEl.offsetWidth; whereEl.classList.add('pop'); }
}

/* ============================== environment, loop ====================== */
let envOut = null, visT = 0;
function updateVis() {
  const out = isOutside();
  floorGroups.forEach((g, l) => { g.visible = out ? l === 0 : Math.abs(l - player.level) <= 1; });
  for (const id in roomInfo) { const r = roomInfo[id]; r.group.visible = !out && r.level === player.level && Math.hypot(r.cx - player.x, r.cz - player.z) < 42; }
  skyGroup.visible = out || player.level === 5;
}
function envUpdate(force) {
  const out = isOutside();
  if (force || out !== envOut) {
    envOut = out; scene.fog.near = out ? 95 : 14; scene.fog.far = out ? 330 : 48;
    sun.intensity = PAL[theme].sun * (out || player.level === 5 ? 1 : 0.4); glow.visible = !out;
  }
  updateVis();
}
window.__applyEnv = envUpdate;
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);
const clock = new THREE.Clock(); let texT = 0, promptT = 0, shown = null, tAcc = 0, lastLevel = -1;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05); tAcc += dt;
  if (started && !uiOpen) {
    let fw = (keys['w'] || keys['arrowup'] ? 1 : 0) - (keys['s'] || keys['arrowdown'] ? 1 : 0) - joy.y;
    let st = (keys['d'] ? 1 : 0) - (keys['a'] ? 1 : 0) + joy.x;
    const tl = (keys['arrowright'] ? 1 : 0) - (keys['arrowleft'] ? 1 : 0);
    player.yaw -= tl * 1.8 * dt;
    if (tour.on) tourStep(dt);
    else {
      const m = Math.hypot(fw, st); if (m > 1) { fw /= m; st /= m; }
      const spd = (keys['shift'] ? 4.6 : 2.7) * dt;
      const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
      if (fw || st) { walkT = null; floorMarker.visible = false; moveBy((fx * fw + rx * st) * spd, (fz * fw + rz * st) * spd); player.bob += dt * (keys['shift'] ? 11 : 7.5); }
      else if (walkT) {
        const dx = walkT.x - player.x, dz = walkT.z - player.z, d = Math.hypot(dx, dz), sp = 2.9 * dt;
        if (d < 0.25) { walkT = null; floorMarker.visible = false; }
        else { const mv = moveBy(dx / d * Math.min(sp, d), dz / d * Math.min(sp, d)); turnTo(faceDir(dx, dz), dt); player.bob += dt * 7.5; walkT.stuck = mv < sp * 0.25 ? walkT.stuck + dt : 0; if (walkT.stuck > 0.4) { walkT = null; floorMarker.visible = false; } }
      }
    }
  }
  player.gy = groundY();
  if (player.level !== lastLevel) { lastLevel = player.level; envUpdate(true); }
  camera.position.set(player.x, player.gy + EYE + Math.sin(player.bob) * 0.025, player.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
  glow.position.set(player.x, player.gy + 2.4, player.z);
  skyGroup.position.copy(camera.position);
  for (const d of doors) {
    const near = d.lv === player.level && !d.fixed && Math.hypot(player.x - d.cx, player.z - d.cz) < (d.dw > 2 ? 3.2 : 2.3) ? 1 : 0;
    d.k += (near - d.k) * Math.min(1, dt * 6);
    for (const l of d.leaves) l.leaf.position.copy(l.base).addScaledVector(l.off, d.k);
  }
  for (const c of anim.cars) { c.x += c.dir * c.spd * dt; if (c.x > 110) c.x = -110; if (c.x < -110) c.x = 110; c.m.position.x = c.x; }
  for (const j of anim.jets) j.m.scale.y = 0.85 + 0.15 * Math.sin(tAcc * 5 + j.ph);
  texT += dt; if (texT > 0.3) { texT = 0; updateTextures(player.x, player.gy, player.z); whereAmI(); }
  visT += dt; if (visT > 0.25) { visT = 0; envUpdate(false); updateLiftUi(); }
  promptT += dt;
  if (promptT > 0.12) {
    promptT = 0; const k = started && !uiOpen && !tour.on ? hoverPick() : null;
    canvas.style.cursor = uiOpen ? 'default' : k ? 'pointer' : ptrs.size ? 'grabbing' : 'grab';
    if (k !== shown) { shown = k; prompt.classList.toggle('show', !!k); if (k) $('promptTxt').textContent = walkLabel(k) + ': ' + (isTouch ? 'tap to open' : 'click to open'); }
  }
  miniFrame();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
$('prompt').addEventListener('click', () => { if (shown) openPopup(shown); });

function runtime() {
  resize(); buildPanel();
  scene.updateMatrixWorld(true);
  setPose(SPOTS.outside); player.gy = 0;
  miniDraw(); setUi(); updateHint();
  requestAnimationFrame(frame);
  setTimeout(() => updateTextures(player.x, player.gy, player.z), 50);
  setTimeout(() => $('loading').classList.add('hide'), 250);
  loadDecor();
}
window.__team = { collide, teleport, go, setPose, player, ROOMS, roomInfo, spaces, camera, scene, THREE, openPopup, setTheme: applyTheme, colliders, ramps, moveBy, groundY, SPOTS, ride, startTour, stopTour, tour, FH, doors, floorGroups, isOutside, envUpdate, start: () => $('startBtn').click(), keys };
build().then(runtime).catch((e) => { console.error(e); const t = $('ltxt'); if (t) t.textContent = 'Something went wrong while building the office: ' + e.message; });
