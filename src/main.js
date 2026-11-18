import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { MEMBERS, ROOMS, LAYOUT, TINTS, LIFE_PHOTOS, SPAWN } from './data.js';

/* ============================== constants ============================== */
const H = 3.2;          // wall height
const T = 0.3;          // wall thickness
const HALF = 1.5;       // half corridor width
const DOOR_W = 1.4, DOOR_H = 2.35;
const PITCH = 4.7;      // room slot length along a corridor
const SIDE_D = 5;       // depth of side rooms
const ZSTART = 1.5;     // first room starts this far into a corridor
const HUB = 3;          // half size of the hub
const R = 0.32;         // player radius
const EYE = 1.6;
const HEAD = {
  N: { f: [0, -1], r: [1, 0] },
  E: { f: [1, 0], r: [0, 1] },
  S: { f: [0, 1], r: [-1, 0] },
  W: { f: [-1, 0], r: [0, -1] },
};
const $ = (id) => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
document.documentElement.classList.toggle('touch', isTouch);

/* ============================== renderer =============================== */
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 90);
camera.rotation.order = 'YXZ';
const world = new THREE.Group();
scene.add(world);
const hemi = new THREE.HemisphereLight(0xffffff, 0x9db8f0, 1.2);
scene.add(hemi);
const glow = new THREE.PointLight(0xffffff, 2.2, 12, 2);
scene.add(glow);

/* ============================== palettes =============================== */
const PAL = {
  light: { bg: 0xdce8ff, wall: 0xf3f6ff, floor: 0xc9d9fb, ceil: 0xffffff, trim: 0x8fb1f5, sky: 0xffffff, ground: 0x9db8f0, hemi: 1.5, glow: 2.2, lamp: 0xffffff, rug: 0.55 },
  dark: { bg: 0x14112b, wall: 0x4a3f86, floor: 0x2d2658, ceil: 0x3a3170, trim: 0x9a7afb, sky: 0xd4c8ff, ground: 0x3a2f6e, hemi: 1.2, glow: 4, lamp: 0xe3d9ff, rug: 0.3 },
};
const std = (c, r = 0.92) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0 });
const mats = { wall: std(0xffffff), floor: std(0xffffff), ceil: std(0xffffff), trim: std(0xffffff), lamp: new THREE.MeshBasicMaterial({ color: 0xffffff }) };
const tintFloors = []; // { mat, tint }
let theme = 'light';
function applyTheme(name) {
  theme = name;
  const p = PAL[name];
  document.documentElement.setAttribute('data-theme', name);
  scene.background = new THREE.Color(p.bg);
  scene.fog = new THREE.Fog(p.bg, 14, 46);
  mats.wall.color.setHex(p.wall); mats.floor.color.setHex(p.floor); mats.ceil.color.setHex(p.ceil);
  mats.trim.color.setHex(p.trim); mats.lamp.color.setHex(p.lamp);
  hemi.color.setHex(p.sky); hemi.groundColor.setHex(p.ground); hemi.intensity = p.hemi; glow.intensity = p.glow;
  tintFloors.forEach((f) => f.mat.color.setHex(p.floor).lerp(new THREE.Color(f.tint), name === 'light' ? 0.22 : 0.16));
  try { localStorage.setItem('theme', name); } catch (e) {}
  if (window.__miniDraw) window.__miniDraw();
  const m = document.getElementById('metaTheme'); if (m) m.setAttribute('content', name === 'dark' ? '#9A7AFB' : '#70A1FC');
}

/* ============================== helpers ================================ */
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitPlane = new THREE.PlaneGeometry(1, 1);
const colliders = [];
const doors = [];
const spaces = [];       // { x0,x1,z0,z1, name, kind, id }
const pictures = [];     // lazy textures
const interactMeshes = [];
const roomInfo = {};     // id -> { cx,cz,dv,sx,sz,entry }
const cmatCache = {};
const rbCache = {};
const cmat = (c) => cmatCache[c] || (cmatCache[c] = std(c));
const rbGeo = (w, h, d, r) => { const k = [w, h, d, r].join('|'); return rbCache[k] || (rbCache[k] = new RoundedBoxGeometry(w, h, d, 3, r)); };

function addWall(cx, cz, w, d, y0, h, mat, collide = true) {
  const m = new THREE.Mesh(unitBox, mat);
  m.scale.set(w, h, d); m.position.set(cx, y0 + h / 2, cz);
  world.add(m);
  if (collide) colliders.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 });
  return m;
}
function addFlat(cx, cz, w, d, y, mat, up) {
  const m = new THREE.Mesh(unitPlane, mat);
  m.rotation.x = up ? -Math.PI / 2 : Math.PI / 2;
  m.scale.set(w, d, 1); m.position.set(cx, y, cz);
  world.add(m);
  return m;
}
function makeFrame(heading, ox, oz) {
  const { f, r } = HEAD[heading];
  const swap = heading === 'E' || heading === 'W';
  return {
    f, r,
    p: (lx, lz) => [ox + f[0] * lz + r[0] * lx, oz + f[1] * lz + r[1] * lx],
    wall(lcx, lcz, lw, ld, y0, h, mat, collide) {
      const [x, z] = this.p(lcx, lcz);
      return swap ? addWall(x, z, ld, lw, y0, h, mat, collide) : addWall(x, z, lw, ld, y0, h, mat, collide);
    },
    flat(lcx, lcz, lw, ld, y, mat, up) {
      const [x, z] = this.p(lcx, lcz);
      return swap ? addFlat(x, z, ld, lw, y, mat, up) : addFlat(x, z, lw, ld, y, mat, up);
    },
  };
}
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
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function labelPlane(title, sub, w, h, opts) {
  const m = new THREE.Mesh(unitPlane, new THREE.MeshBasicMaterial({ map: labelTexture(title, sub, 640, Math.round(640 * h / w), opts), transparent: true }));
  m.scale.set(w, h, 1); return m;
}

// blob shadow
const blobTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(30,20,80,.38)'); gr.addColorStop(1, 'rgba(30,20,80,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); return t;
})();
const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false });
function blob(g, x, z, w, d) { const m = new THREE.Mesh(unitPlane, blobMat); m.rotation.x = -Math.PI / 2; m.scale.set(w, d, 1); m.position.set(x, 0.006, z); g.add(m); }

/* props primitives (group-local, y = bottom) */
function rb(g, w, h, d, x, y, z, color, rot = 0, r = 0.05) { const m = new THREE.Mesh(rbGeo(w, h, d, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)), cmat(color)); m.position.set(x, y + h / 2, z); m.rotation.y = rot; g.add(m); return m; }
function cyl(g, r, h, x, y, z, color, seg = 24) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), cmat(color)); m.position.set(x, y + h / 2, z); g.add(m); return m; }
function sph(g, r, x, y, z, color, sy = 1) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), cmat(color)); m.scale.y = sy; m.position.set(x, y + r * sy, z); g.add(m); return m; }
const glowMat = (c) => new THREE.MeshBasicMaterial({ color: c });

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

/** A framed picture. dir: group-local rotation. Returns the group. */
function addPicture(parent, { w, h, src, tint, roomId, pos, rotY = 0, border = 0.07 }) {
  const g = new THREE.Group(); g.position.copy(pos); g.rotation.y = rotY; parent.add(g);
  const tc = TINTS[tint] || tint;
  const back = new THREE.Mesh(rbGeo(w + border * 2, h + border * 2, 0.06, 0.03), cmat(tc)); back.position.z = 0.03; g.add(back);
  const mat = new THREE.MeshBasicMaterial({ color: 0xe9eefc });
  const plane = new THREE.Mesh(unitPlane, mat); plane.scale.set(w, h, 1); plane.position.z = 0.062; g.add(plane);
  back.userData.room = roomId; plane.userData.room = roomId;
  interactMeshes.push(back, plane);
  const rec = { plane, mat, src, loaded: false, loading: false, pos: new THREE.Vector3(), group: g };
  pictures.push(rec);
  g.userData.rec = rec;
  return g;
}
function finishPictures() { world.updateMatrixWorld(true); pictures.forEach((p) => p.plane.getWorldPosition(p.pos)); }
function updateTextures(px, pz) {
  for (const p of pictures) {
    const d = Math.hypot(p.pos.x - px, p.pos.z - pz);
    if (d < 17 && !p.loaded && !p.loading) {
      p.loading = true;
      getTex(p.src).then((t) => { p.loading = false; if (!t) return; if (p.dropped) { dropTex(p.src); p.dropped = false; return; } p.mat.map = t; p.mat.color.setHex(0xffffff); p.mat.needsUpdate = true; p.loaded = true; });
    } else if (d > 32 && p.loaded) {
      p.mat.map = null; p.mat.color.setHex(0xe9eefc); p.mat.needsUpdate = true; p.loaded = false; dropTex(p.src);
    }
  }
}
const S = (name) => 'assets/small/' + name + '.webp';

/* ============================== doors ================================== */
function addDoor({ wx, wz, normal, tint, title, sub, roomId }) {
  const tc = TINTS[tint];
  const nAxisX = Math.abs(normal[0]) > 0.5;           // wall plane normal along world x
  const tang = nAxisX ? [0, 1] : [1, 0];
  // frame trims
  const tm = cmat(tc);
  const trimW = 0.1, trimD = T + 0.06;
  const post = (sgn) => {
    const cx = wx + tang[0] * sgn * (DOOR_W / 2 + trimW / 2), cz = wz + tang[1] * sgn * (DOOR_W / 2 + trimW / 2);
    const m = new THREE.Mesh(unitBox, tm); m.scale.set(nAxisX ? trimD : trimW, DOOR_H + 0.1, nAxisX ? trimW : trimD); m.position.set(cx, (DOOR_H + 0.1) / 2, cz); world.add(m);
  };
  post(-1); post(1);
  const top = new THREE.Mesh(unitBox, tm); top.scale.set(nAxisX ? trimD : DOOR_W + trimW * 2, 0.1, nAxisX ? DOOR_W + trimW * 2 : trimD); top.position.set(wx, DOOR_H + 0.05, wz); world.add(top);
  // leaf
  const leafW = DOOR_W - 0.04;
  const leaf = new THREE.Mesh(unitBox, cmat(tc));
  leaf.scale.set(nAxisX ? 0.09 : leafW, DOOR_H, nAxisX ? leafW : 0.09);
  leaf.position.set(wx, DOOR_H / 2, wz); world.add(leaf);
  doors.push({ leaf, base: leaf.position.clone(), off: new THREE.Vector3(tang[0] * (DOOR_W - 0.1), 0, tang[1] * (DOOR_W - 0.1)), cx: wx, cz: wz, k: 0 });
  // plate on the corridor side, above the door
  const plate = labelPlane(title, sub, 2.1, 0.58, { ac: tc });
  plate.position.set(wx + normal[0] * (T / 2 + 0.025), (DOOR_H + H) / 2 + 0.02, wz + normal[1] * (T / 2 + 0.025));
  plate.lookAt(plate.position.x + normal[0], plate.position.y, plate.position.z + normal[1]);
  world.add(plate);
}

/* ============================== rooms ================================== */
function buildRoom(id, cx, cz, dv, sx, sz) {
  const room = ROOMS[id];
  const g = new THREE.Group(); g.position.set(cx, 0, cz); g.rotation.y = Math.atan2(dv[0], dv[1]); world.add(g);
  const tc = TINTS[room.tint];
  // floor + ceiling
  const fmat = std(0xffffff, 0.95); tintFloors.push({ mat: fmat, tint: tc });
  const fl = new THREE.Mesh(unitPlane, fmat); fl.rotation.x = -Math.PI / 2; fl.scale.set(sx, sz, 1); fl.position.y = 0.002; g.add(fl);
  const ce = new THREE.Mesh(unitPlane, mats.ceil); ce.rotation.x = Math.PI / 2; ce.scale.set(sx, sz, 1); ce.position.y = H; g.add(ce);
  const lamp = new THREE.Mesh(unitBox, mats.lamp); lamp.scale.set(sx * 0.3, 0.04, sz * 0.25); lamp.position.set(0, H - 0.03, 0); g.add(lamp);
  // baseboard strip in tint colour
  const bb = (w, d, x, z) => { const m = new THREE.Mesh(unitBox, cmat(tc)); m.scale.set(w, 0.12, d); m.position.set(x, 0.06, z); g.add(m); };
  bb(sx, 0.05, 0, -sz / 2 + 0.03); bb(0.05, sz, -sx / 2 + 0.03, 0); bb(0.05, sz, sx / 2 - 0.03, 0);

  const props = new THREE.Group(); g.add(props); g.userData.props = props;
  const back = -sz / 2 + 0.04;
  const nameplate = (y, w, title, sub) => { const p = labelPlane(title, sub, w, 0.42, { ac: tc }); p.position.set(0, y, back + 0.01); g.add(p); };
  const portrait = (mid, size, x, y, z, rotY) => addPicture(g, { w: size, h: size, src: 'assets/' + MEMBERS[mid].file + '.webp', tint: room.tint, roomId: id, pos: new THREE.Vector3(x, y, z), rotY });
  const illus = (w, x, y, z, rotY) => addPicture(g, { w, h: w * 9 / 16, src: S('room-' + id), tint: room.tint, roomId: id, pos: new THREE.Vector3(x, y, z), rotY });
  const leftWall = -sx / 2 + 0.04;

  if (room.kind === 'personal') {
    portrait(room.member, 1.7, 0, 1.85, back, 0);
    nameplate(0.6, 1.9, room.title, room.sub + '  /  Personal room');
    illus(2.5, leftWall, 1.7, -0.2, Math.PI / 2);
    const hint = labelPlane('Tap to see why this room', null, 1.7, 0.3, { ac: tc }); hint.position.set(leftWall + 0.01, 0.7, -0.2); hint.rotation.y = Math.PI / 2; g.add(hint);
    propsPersonal(props, sx, sz, tc);
  } else if (id === 'living') {
    illus(3.8, 0, 1.95, back, 0);
    nameplate(0.5, 2.4, room.title, 'Where we meet, eat and play');
    LIFE_PHOTOS.forEach((n, i) => {
      const left = i < 3, zz = -1.7 + (i % 3) * 1.7;
      addPicture(g, { w: 1.2, h: 0.9, src: S(n), tint: room.tint, roomId: id, pos: new THREE.Vector3(left ? leftWall : sx / 2 - 0.04, 1.7, zz), rotY: left ? Math.PI / 2 : -Math.PI / 2 });
    });
    propsLiving(props, sx, sz, tc);
  } else {
    illus(3.2, 0, 1.8, back, 0);
    nameplate(0.55, 2.2, room.title, room.blurb.length > 38 ? room.tag : room.blurb);
    const members = room.who.filter((w) => MEMBERS[w]);
    members.forEach((mid, i) => {
      const span = Math.min(sz - 1.6, members.length * 1.5);
      const zz = members.length === 1 ? -0.3 : -span / 2 + (i + 0.5) * (span / members.length);
      portrait(mid, 1.05, leftWall, 1.7, zz, Math.PI / 2);
    });
    (PROPS[room.props] || (() => {}))(props, sx, sz, tc);
  }
  roomInfo[id] = { id, cx, cz, dv, sx, sz, group: g, props };
  // bbox for "where am I"
  const alongX = Math.abs(dv[0]) > 0.5;
  const hx = (alongX ? sz : sx) / 2, hz = (alongX ? sx : sz) / 2;
  spaces.push({ x0: cx - hx, x1: cx + hx, z0: cz - hz, z1: cz + hz, name: room.title, kind: 'room', id });
  roomInfo[id].entry = { x: cx + dv[0] * (sz / 2 - 0.9), z: cz + dv[1] * (sz / 2 - 0.9), face: [-dv[0], -dv[1]] };
}

/* ---- placeholder props (replace with your own .glb, see prompt.txt) ---- */
const C = { white: 0xffffff, soft: 0xdfe8ff, lav: 0xd9d0ff, wood: 0xcfd8f5, deep: 0x5a4fb0, blue: 0x6f9bf7, dark: 0x2a2f55 };
function propsPersonal(g, sx, sz, tc) {
  const rx = sx / 2;
  const rug = cyl(g, 1.3, 0.03, 0, 0.0, 0.5, tc); rug.material = cmat(new THREE.Color(tc).lerp(new THREE.Color(0xffffff), 0.55).getHex());
  rb(g, 0.8, 0.06, 1.6, rx - 0.5, 0.72, -0.6, C.white);
  rb(g, 0.06, 0.72, 1.4, rx - 0.5, 0, -0.6, C.soft);
  rb(g, 0.45, 0.08, 0.45, rx - 1.35, 0.45, -0.6, tc); rb(g, 0.45, 0.45, 0.08, rx - 1.55, 0.45, -0.6, tc, Math.PI / 2);
  rb(g, 0.4, 0.28, 0.02, rx - 0.45, 0.78, -0.6, C.dark, Math.PI / 2);
  sph(g, 0.45, rx - 0.95, 0, 1.2, tc, 0.65);
  cyl(g, 0.2, 0.35, rx - 0.35, 0, -sz / 2 + 0.45, C.white); sph(g, 0.33, rx - 0.35, 0.3, -sz / 2 + 0.45, 0x6fcfb0);
  blob(g, rx - 0.6, -0.6, 1.4, 2.0); blob(g, rx - 0.95, 1.2, 1.3, 1.1);
}
function propsLiving(g, sx, sz, tc) {
  const rug = cyl(g, 2.6, 0.03, 0, 0, 0.1, 0xd9d0ff);
  rb(g, 3.6, 0.45, 1.0, 0, 0, -0.9, 0x6f9bf7, 0, 0.1); rb(g, 3.6, 0.6, 0.28, 0, 0.45, -0.5, 0x5a86ee, 0, 0.1);
  rb(g, 0.3, 0.75, 1.0, -1.95, 0, -0.9, 0x5a86ee, 0, 0.1); rb(g, 0.3, 0.75, 1.0, 1.95, 0, -0.9, 0x5a86ee, 0, 0.1);
  rb(g, 1.7, 0.1, 0.9, 0, 0.38, -2.2, 0xcfd8f5); rb(g, 0.1, 0.38, 0.7, -0.7, 0, -2.2, 0xb8c4ee); rb(g, 0.1, 0.38, 0.7, 0.7, 0, -2.2, 0xb8c4ee);
  sph(g, 0.55, -2.4, 0, -1.2, 0x8b6bff, 0.7); sph(g, 0.55, 2.5, 0, -0.9, 0xe8679a, 0.7);
  cyl(g, 0.22, 0.4, -sx / 2 + 0.5, 0, -sz / 2 + 0.5, 0xffffff); sph(g, 0.38, -sx / 2 + 0.5, 0.35, -sz / 2 + 0.5, 0x6fcfb0);
  blob(g, 0, 0.6, 3.8, 1.5); blob(g, -2.4, -1.2, 1.3, 1.3); blob(g, 2.5, -0.9, 1.3, 1.3);
}
const PROPS = {
  singing(g, sx, sz, tc) {
    rb(g, 3.2, 0.22, 1.7, 0, 0, -1.3, 0xd9d0ff, 0, 0.08);
    cyl(g, 0.03, 1.5, -0.6, 0.22, -1.2, C.dark); sph(g, 0.07, -0.6, 1.72, -1.2, C.dark);
    cyl(g, 0.03, 1.5, 0.6, 0.22, -1.2, C.dark); sph(g, 0.07, 0.6, 1.72, -1.2, C.dark);
    rb(g, 0.5, 1.0, 0.4, -1.8, 0.22, -1.4, C.dark); rb(g, 0.5, 1.0, 0.4, 1.8, 0.22, -1.4, C.dark);
    cyl(g, 0.22, 0.5, sx / 2 - 0.7, 0, 0.8, tc); cyl(g, 0.22, 0.5, sx / 2 - 0.7, 0, 1.5, tc);
    blob(g, 0, -1.3, 3.4, 1.9);
  },
  creativity(g, sx, sz, tc) {
    rb(g, 2.2, 0.08, 1.1, 0.9, 0.74, -0.2, 0xffffff);
    [[-0.9, -0.6], [0.9, -0.6], [-0.9, 0.6], [0.9, 0.6]].forEach(([x, z]) => rb(g, 0.08, 0.74, 0.08, 0.9 + x * 0.5 * 1.1, 0, -0.2 + z * 0.4, C.soft));
    ['b', 'v', 'p', 'a', 'g'].forEach((k, i) => rb(g, 0.22, 0.22, 0.22, 0.1 + i * 0.4, 0.82, -0.2 + (i % 2 ? 0.15 : -0.15), TINTS[k], i, 0.04));
    rb(g, 0.9, 1.1, 0.05, -1.0, 0.6, -1.4, 0xffffff); rb(g, 0.06, 1.8, 0.06, -1.35, 0, -1.4, C.wood); rb(g, 0.06, 1.8, 0.06, -0.65, 0, -1.4, C.wood);
    sph(g, 0.5, 1.6, 0, 1.3, 0xe8679a, 0.7); sph(g, 0.5, 0.6, 0, 1.5, 0x8b6bff, 0.7);
    blob(g, 0.9, -0.2, 2.6, 1.6);
  },
  designer(g, sx, sz, tc) {
    [-0.9, 0.9].forEach((z) => {
      rb(g, 0.75, 0.06, 1.3, sx / 2 - 0.5, 0.72, z, 0xffffff); rb(g, 0.06, 0.72, 1.1, sx / 2 - 0.5, 0, z, C.soft);
      rb(g, 0.04, 0.45, 0.8, sx / 2 - 0.25, 0.95, z, C.dark); rb(g, 0.4, 0.04, 0.4, sx / 2 - 0.35, 0.78, z, C.dark, 0.3);
      rb(g, 0.45, 0.08, 0.45, sx / 2 - 1.3, 0.45, z, tc); rb(g, 0.08, 0.5, 0.45, sx / 2 - 1.5, 0.45, z, tc);
      blob(g, sx / 2 - 0.7, z, 1.6, 1.8);
    });
    cyl(g, 1.2, 0.03, -0.2, 0, 0.5, 0xd9d0ff);
  },
  tech(g, sx, sz, tc) {
    [-1.5, 0, 1.5].forEach((z) => {
      rb(g, 0.75, 0.06, 1.3, sx / 2 - 0.5, 0.72, z, 0xffffff); rb(g, 0.06, 0.72, 1.1, sx / 2 - 0.5, 0, z, C.soft);
      rb(g, 0.04, 0.45, 0.8, sx / 2 - 0.25, 0.95, z, C.dark);
      rb(g, 0.45, 0.08, 0.45, sx / 2 - 1.3, 0.45, z, tc); rb(g, 0.08, 0.5, 0.45, sx / 2 - 1.5, 0.45, z, tc);
      blob(g, sx / 2 - 0.7, z, 1.6, 1.8);
    });
    rb(g, 0.7, 1.9, 0.6, -0.5, 0, -sz / 2 + 0.5, C.dark);
    [0.5, 0.9, 1.3, 1.7].forEach((y, i) => { const m = new THREE.Mesh(unitBox, glowMat(i % 2 ? 0x5be0a0 : 0x7aa8ff)); m.scale.set(0.5, 0.05, 0.02); m.position.set(-0.5, y, -sz / 2 + 0.82); g.add(m); });
    cyl(g, 1.1, 0.03, -1.2, 0, 0.8, 0xd9d0ff);
  },
  dancing(g, sx, sz, tc) {
    const m = rb(g, 0.06, 2.1, 3.8, sx / 2 - 0.05, 0.1, -0.2, 0xcfe3ff); m.material = new THREE.MeshStandardMaterial({ color: 0xcfe3ff, roughness: 0.12, metalness: 0.6 });
    cyl(g, 0.03, 3.6, 0, 0, 0, C.dark); g.children[g.children.length - 1].rotation.x = Math.PI / 2; g.children[g.children.length - 1].position.set(sx / 2 - 0.4, 1.0, -0.2);
    rb(g, 0.5, 1.0, 0.4, -1.6, 0, -sz / 2 + 0.4, C.dark); rb(g, 0.5, 1.0, 0.4, 1.6, 0, -sz / 2 + 0.4, C.dark);
    rb(g, 1.6, 0.4, 0.4, 0, 0, sz / 2 - 0.5, tc);
    const wf = new THREE.Mesh(unitPlane, cmat(0xe7d9ff)); wf.rotation.x = -Math.PI / 2; wf.scale.set(sx - 0.8, sz - 1.2, 1); wf.position.set(0, 0.006, -0.3); g.add(wf);
  },
  ca(g, sx, sz, tc) {
    rb(g, 1.9, 0.06, 0.85, 0.4, 0.74, -0.6, 0xffffff); rb(g, 0.06, 0.74, 0.7, -0.45, 0, -0.6, C.soft); rb(g, 0.06, 0.74, 0.7, 1.25, 0, -0.6, C.soft);
    rb(g, 0.65, 0.4, 0.04, 0.4, 0.82, -0.8, C.dark);
    rb(g, 0.5, 0.08, 0.5, 0.4, 0.45, -1.4, tc); rb(g, 0.5, 0.5, 0.08, 0.4, 0.45, -1.62, tc);
    rb(g, 0.5, 0.08, 0.5, -0.4, 0.45, 0.4, 0x5a86ee); rb(g, 0.5, 0.08, 0.5, 1.2, 0.45, 0.4, 0x5a86ee);
    rb(g, 0.45, 1.8, 2.4, sx / 2 - 0.3, 0, -0.2, 0xdfe8ff);
    ['b', 'v', 'a', 'p', 'g', 't'].forEach((k, i) => rb(g, 0.1, 0.3, 0.3, sx / 2 - 0.3, 0.45 + (i % 3) * 0.5, -1.0 + Math.floor(i / 3) * 1.1 + (i % 3) * 0.15, TINTS[k], 0, 0.02));
    cyl(g, 1.2, 0.03, 0.2, 0, 0.6, 0xd9d0ff);
    blob(g, 0.4, -0.6, 2.4, 1.4);
  },
};

/* ============================== hub & corridors ======================== */
const corridorRecs = [];
function buildHub() {
  const used = new Set(LAYOUT.map((c) => c.heading));
  world.add(new THREE.Group());
  addFlat(0, 0, HUB * 2, HUB * 2, 0, mats.floor, true);
  addFlat(0, 0, HUB * 2, HUB * 2, H, mats.ceil, false);
  const lamp = new THREE.Mesh(unitBox, mats.lamp); lamp.scale.set(2.6, 0.05, 2.6); lamp.position.set(0, H - 0.03, 0); world.add(lamp);
  // floor emblem
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(256, 256, 250, 0, 7); g.fill();
  g.strokeStyle = '#5B8DF5'; g.lineWidth = 14; g.beginPath(); g.arc(256, 256, 232, 0, 7); g.stroke();
  g.strokeStyle = '#8B6BFF'; g.lineWidth = 6; g.beginPath(); g.arc(256, 256, 206, 0, 7); g.stroke();
  g.fillStyle = '#5B8DF5'; g.beginPath(); g.moveTo(290, 120); g.lineTo(200, 270); g.lineTo(255, 270); g.lineTo(235, 392); g.lineTo(325, 240); g.lineTo(270, 240); g.closePath(); g.fill();
  g.fillStyle = '#1b2340'; g.textAlign = 'center'; g.font = '800 34px Inter, system-ui, sans-serif'; g.fillText('THUNDER OFFICE', 256, 440);
  const et = new THREE.CanvasTexture(c); et.colorSpace = THREE.SRGBColorSpace; et.anisotropy = 4;
  const em = new THREE.Mesh(new THREE.CircleGeometry(1.7, 48), new THREE.MeshBasicMaterial({ map: et, transparent: true, opacity: 0.96 }));
  em.rotation.x = -Math.PI / 2; em.position.y = 0.008; world.add(em);
  // corner plants + benches
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    const g2 = new THREE.Group(); g2.position.set(sx * 2.45, 0, sz * 2.45); world.add(g2);
    cyl(g2, 0.25, 0.45, 0, 0, 0, 0xffffff); sph(g2, 0.42, 0, 0.4, 0, 0x6fcfb0); blob(g2, 0, 0, 1.0, 1.0);
  });
  for (const key of Object.keys(HEAD)) {
    const F = makeFrame(key, HEAD[key].f[0] * HUB, HEAD[key].f[1] * HUB);
    const ex = key === 'N' || key === 'S' ? T : 0;
    if (used.has(key)) {
      F.wall(-(HALF + HUB + ex) / 2, T / 2, HUB + ex - HALF, T, 0, H, mats.wall, true);
      F.wall((HALF + HUB + ex) / 2, T / 2, HUB + ex - HALF, T, 0, H, mats.wall, true);
      F.wall(0, T / 2, HALF * 2, T, 2.75, H - 2.75, mats.wall, false);
    } else {
      F.wall(0, T / 2, (HUB + ex) * 2, T, 0, H, mats.wall, true);
    }
  }
  spaces.push({ x0: -HUB, x1: HUB, z0: -HUB, z1: HUB, name: 'Hub', kind: 'hub', id: 'hub' });
}

function buildCorridor(c) {
  const hd = HEAD[c.heading];
  const F = makeFrame(c.heading, hd.f[0] * HUB, hd.f[1] * HUB);
  const n = Math.max(c.left.length, c.right.length);
  const zs = c.start ?? ZSTART;
  const L = Math.max(c.minLength || 0, zs + n * PITCH + 1.5);
  F.flat(0, L / 2, HALF * 2, L, 0, mats.floor, true);
  F.flat(0, L / 2, HALF * 2, L, H, mats.ceil, false);
  for (let z = 2.2; z < L - 0.5; z += 4.2) F.wall(0, z, 0.5, 1.6, H - 0.05, 0.05, mats.lamp, false);
  // trim strip along the floor of the corridor
  F.wall(-(HALF - 0.03), L / 2, 0.06, L, 0, 0.1, mats.trim, false);
  F.wall((HALF - 0.03), L / 2, 0.06, L, 0, 0.1, mats.trim, false);

  const doorPos = (lcx, lcz, nrm) => { const [wx, wz] = F.p(lcx, lcz); return { wx, wz, normal: nrm }; };
  [{ s: -1, list: c.left }, { s: 1, list: c.right }].forEach(({ s, list }) => {
    const lx = s * (HALF + T / 2);
    const piece = (a, b) => { if (b - a > 0.001) F.wall(lx, (a + b) / 2, T, b - a, 0, H, mats.wall, true); };
    let cur = T;
    list.forEach((id, i) => {
      const zc = zs + i * PITCH + PITCH / 2, a = zc - DOOR_W / 2, b = zc + DOOR_W / 2;
      piece(cur, a); cur = b;
      F.wall(lx, zc, T, DOOR_W, DOOR_H, H - DOOR_H, mats.wall, false);
      F.flat(lx, zc, T + 0.02, DOOR_W, 0.001, mats.floor, true);
      const nrm = [-s * hd.r[0], -s * hd.r[1]]; // from wall towards corridor centre
      const p = doorPos(lx, zc, nrm); const room = ROOMS[id];
      addDoor({ ...p, tint: room.tint, title: room.title, sub: room.sub, roomId: id });
    });
    piece(cur, L);
    if (list.length) {
      for (let i = 0; i <= list.length; i++) F.wall(s * (HALF + T + SIDE_D / 2), zs + i * PITCH, SIDE_D, T, 0, H, mats.wall, true);
      F.wall(s * (HALF + T + SIDE_D + T / 2), zs + (list.length * PITCH) / 2, T, list.length * PITCH + T, 0, H, mats.wall, true);
      list.forEach((id, i) => {
        const zc = zs + i * PITCH + PITCH / 2;
        const [wx, wz] = F.p(s * (HALF + T + SIDE_D / 2), zc);
        const dv = [-s * hd.r[0], -s * hd.r[1]];
        buildRoom(id, wx, wz, dv, PITCH - T, SIDE_D);
      });
    }
  });
  // end wall + end room
  const [ew, ed] = c.endSize;
  const half = ew / 2 + T;
  F.wall(-(half + 0.8) / 2, L + T / 2, half - 0.8, T, 0, H, mats.wall, true);
  F.wall((half + 0.8) / 2, L + T / 2, half - 0.8, T, 0, H, mats.wall, true);
  F.wall(0, L + T / 2, 1.6, T, DOOR_H, H - DOOR_H, mats.wall, false);
  F.flat(0, L + T / 2, 1.6, T + 0.02, 0.001, mats.floor, true);
  F.wall(-(ew / 2 + T / 2), L + T + ed / 2, T, ed, 0, H, mats.wall, true);
  F.wall((ew / 2 + T / 2), L + T + ed / 2, T, ed, 0, H, mats.wall, true);
  F.wall(0, L + T + ed + T / 2, ew + 2 * T, T, 0, H, mats.wall, true);
  const endRoom = ROOMS[c.end];
  const [wx, wz] = F.p(0, L + T / 2);
  addDoor({ wx, wz, normal: [-hd.f[0], -hd.f[1]], tint: endRoom.tint, title: endRoom.title, sub: endRoom.sub, roomId: c.end });
  const [rx, rz] = F.p(0, L + T + ed / 2);
  buildRoom(c.end, rx, rz, [-hd.f[0], -hd.f[1]], ew, ed);
  // corridor space (world bbox)
  const [ax, az] = F.p(-HALF, 0), [bx, bz] = F.p(HALF, L);
  spaces.push({ x0: Math.min(ax, bx), x1: Math.max(ax, bx), z0: Math.min(az, bz), z1: Math.max(az, bz), name: c.name, kind: 'corridor', id: c.id });
  // sign on the hub side
  const sign = labelPlane(c.sign, c.sub, 2.7, 0.44, { ac: '#5B8DF5' });
  const [sx0, sz0] = makeFrame(c.heading, hd.f[0] * HUB, hd.f[1] * HUB).p(0, -0.02);
  sign.position.set(sx0, 2.98, sz0); sign.lookAt(sx0 - hd.f[0], 2.98, sz0 - hd.f[1]); world.add(sign);
  corridorRecs.push({ id: c.id, L });
}

/* ============================== build office =========================== */
buildHub();
LAYOUT.forEach(buildCorridor);
finishPictures();
applyTheme((() => { try { return localStorage.getItem('theme') === 'dark' ? 'dark' : 'light'; } catch (e) { return 'light'; } })());

/* optional .glb decor ---------------------------------------------------- */
(async function loadDecor() {
  let man = {};
  try { const r = await fetch('models/manifest.json'); if (r.ok) man = await r.json(); } catch (e) {}
  const gl = new GLTFLoader(); gl.setMeshoptDecoder(MeshoptDecoder);
  const load = (u) => new Promise((res) => gl.load(u, (g) => res(g.scene), undefined, () => res(null)));
  for (const id of man.decor || []) {
    const info = roomInfo[id]; if (!info) continue;
    const s = await load('models/decor_' + id + '.glb'); if (!s) continue;
    info.group.remove(info.props); info.props = new THREE.Group(); info.props.add(s); info.group.add(info.props);
  }
  if (man.hub) { const s = await load('models/hub_decor.glb'); if (s) world.add(s); }
})();

/* ============================== player & input ========================= */
const sp = roomInfo[SPAWN];
const player = { x: sp.entry.x, z: sp.entry.z, yaw: 0, pitch: 0, bob: 0 };
function faceDir(dx, dz) { return Math.atan2(-dx, -dz); }
player.x = sp.entry.x; player.z = sp.entry.z; player.yaw = faceDir(sp.entry.face[0], sp.entry.face[1]);
const keys = {};
const joy = { x: 0, y: 0, id: null };
let started = false, locked = false, uiOpen = false;
const bounds = (() => { let b = { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 }; spaces.forEach((s) => { b.x0 = Math.min(b.x0, s.x0); b.x1 = Math.max(b.x1, s.x1); b.z0 = Math.min(b.z0, s.z0); b.z1 = Math.max(b.z1, s.z1); }); return b; })();

function collide(nx, nz) {
  for (let it = 0; it < 2; it++) {
    for (const c of colliders) {
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

/* look + move ----------------------------------------------------------- */
document.addEventListener('mousemove', (e) => {
  if (!locked) return;
  player.yaw -= e.movementX * 0.0022; player.pitch = Math.max(-1.25, Math.min(1.25, player.pitch - e.movementY * 0.0022));
});
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; updateHint(); });
addEventListener('keydown', (e) => {
  if (e.target && /input|textarea/i.test(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (k === 'e' || k === 'enter') { if (started && !uiOpen) interact(); }
  if (k === 'm') togglePanel();
  if (k === 'escape') { if (popup.classList.contains('show')) closePopup(); else if (panel.classList.contains('show')) togglePanel(false); }
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

/* pointer: drag-look, joystick, tap-interact */
const joyZone = $('joyZone'), joyBase = $('joyBase'), joyKnob = $('joyKnob');
const ptrs = new Map();
canvas.addEventListener('pointerdown', (e) => {
  if (!started || uiOpen) return;
  const isJoy = e.pointerType === 'touch' && e.clientX < innerWidth * 0.42 && e.clientY > innerHeight * 0.35;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), joy: isJoy });
  if (isJoy) {
    joy.id = e.pointerId; const r = 46;
    joyBase.style.left = e.clientX - 60 + 'px'; joyBase.style.top = e.clientY - 60 + 'px'; joyBase.classList.add('on');
    joyBase._cx = e.clientX; joyBase._cy = e.clientY; joyKnob.style.transform = 'translate(0,0)';
  }
  try { canvas.setPointerCapture(e.pointerId); } catch (x) {}
});
canvas.addEventListener('pointermove', (e) => {
  const p = ptrs.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (p.joy) {
    const r = 46; let jx = e.clientX - joyBase._cx, jy = e.clientY - joyBase._cy; const m = Math.hypot(jx, jy);
    if (m > r) { jx = jx / m * r; jy = jy / m * r; }
    joy.x = jx / r; joy.y = jy / r; joyKnob.style.transform = `translate(${jx}px,${jy}px)`;
  } else if (!locked) {
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
    if (!isTouch && !locked) { try { canvas.requestPointerLock(); } catch (x) {} }
    if (locked) interact(); else interactAt(e.clientX, e.clientY);
  }
}
canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);

/* interaction ----------------------------------------------------------- */
const ray = new THREE.Raycaster(); ray.far = 5.2;
const v2 = new THREE.Vector2();
function blocked(ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  for (const c of colliders) {
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
  return blocked(camera.position.x, camera.position.z, p.x, p.z) ? null : h[0].object.userData.room;
}
function interact() { const id = pick(0, 0); if (id) openPopup(id); }
function interactAt(cx, cy) { const id = pick((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1); if (id) openPopup(id); }

/* ============================== UI ===================================== */
const popup = $('popup'), panel = $('panel'), prompt = $('prompt'), whereEl = $('where'), hint = $('hint');
function setUi() { uiOpen = popup.classList.contains('show') || panel.classList.contains('show') || !started; }
function openPopup(id) {
  const r = ROOMS[id]; if (!r) return;
  $('pImg').src = 'assets/room-' + id + '.webp'; $('pImg').alt = r.title + ' illustration';
  $('pTag').textContent = r.tag + (r.kind === 'personal' ? ' / ' + r.sub : ''); $('pTag').style.setProperty('--tc', TINTS[r.tint]);
  $('pTitle').textContent = r.kind === 'personal' ? r.title + "'s room" : r.title;
  $('pWhy').textContent = r.why;
  const who = $('pWho'); who.innerHTML = '';
  r.who.forEach((w) => {
    const chip = document.createElement('span'); chip.className = 'chip-who';
    if (MEMBERS[w]) { const im = document.createElement('img'); im.src = 'assets/' + MEMBERS[w].file + '.webp'; im.alt = ''; chip.appendChild(im); chip.appendChild(document.createTextNode(MEMBERS[w].name)); }
    else chip.textContent = w;
    who.appendChild(chip);
  });
  if (document.pointerLockElement) document.exitPointerLock();
  popup.classList.add('show'); popup.removeAttribute('aria-hidden'); setUi();
  setTimeout(() => $('pClose').focus({ preventScroll: true }), 60);
}
function closePopup() { popup.classList.remove('show'); popup.setAttribute('aria-hidden', 'true'); setUi(); canvas.focus(); }
$('pClose').addEventListener('click', closePopup);
popup.addEventListener('click', (e) => { if (e.target === popup) closePopup(); });

function togglePanel(force) {
  const open = force === undefined ? !panel.classList.contains('show') : force;
  panel.classList.toggle('show', open); if (open && document.pointerLockElement) document.exitPointerLock(); setUi();
}
$('mapBtn').addEventListener('click', () => togglePanel()); $('panelClose').addEventListener('click', () => togglePanel(false));
$('mini').addEventListener('click', () => togglePanel(true));
$('themeBtn').addEventListener('click', () => applyTheme(theme === 'dark' ? 'light' : 'dark'));
$('helpBtn').addEventListener('click', () => { $('start').classList.remove('hide'); $('startBtn').textContent = 'Back to the office'; started = false; setUi(); if (document.pointerLockElement) document.exitPointerLock(); });

// map list
(function buildPanel() {
  const list = $('panelList');
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
  const rmItem = (id) => { const r = ROOMS[id]; return [r.kind === 'personal' ? r.title : r.title, id, r.tint, r.kind === 'personal' ? 'assets/' + MEMBERS[r.member].file + '.webp' : null]; };
  add('Start', [['Hub (centre)', 'hub', 'b'], ['Living room (start)', 'living', 'a']]);
  LAYOUT.forEach((c) => add(c.name + ' / ' + c.sign, [...c.left, ...c.right, c.end].map(rmItem)));
})();

function teleport(id) {
  let x, z, yaw;
  if (id === 'hub') { x = 0; z = 0.6; yaw = faceDir(0, -1); }
  else { const r = roomInfo[id]; if (!r) return; x = r.entry.x; z = r.entry.z; yaw = faceDir(r.entry.face[0], r.entry.face[1]); }
  const f = $('fade'); f.classList.add('on');
  setTimeout(() => { player.x = x; player.z = z; player.yaw = yaw; player.pitch = 0; f.classList.remove('on'); }, 230);
}

/* start screen */
const startEl = $('start');
$('startBtn').addEventListener('click', () => {
  startEl.classList.add('hide'); started = true; setUi();
  if (!isTouch) { try { canvas.requestPointerLock(); } catch (e) {} }
  const h = location.hash.replace('#', ''); if (h && (roomInfo[h] || h === 'hub')) teleport(h);
});
function updateHint() { hint.classList.toggle('show', started && !isTouch && !locked && !uiOpen); }

/* minimap */
const mini = $('mini'), mctx = mini.getContext('2d');
const MS = isTouch ? 112 : 150;
mini.width = mini.height = MS * 2; mini.style.width = mini.style.height = MS + 'px';
const mScale = (MS * 2 - 20) / Math.max(bounds.x1 - bounds.x0, bounds.z1 - bounds.z0);
const mx = (x) => 10 + (x - bounds.x0) * mScale, mz = (z) => 10 + (z - bounds.z0) * mScale;
let miniBg = null;
function miniDraw() {
  const css = getComputedStyle(document.documentElement);
  miniBg = document.createElement('canvas'); miniBg.width = miniBg.height = MS * 2; const g = miniBg.getContext('2d');
  spaces.forEach((s) => {
    g.fillStyle = s.kind === 'room' ? (TINTS[ROOMS[s.id].tint] + 'cc') : s.kind === 'hub' ? css.getPropertyValue('--primary').trim() : css.getPropertyValue('--primary-soft').trim();
    g.fillRect(mx(s.x0), mz(s.z0), (s.x1 - s.x0) * mScale, (s.z1 - s.z0) * mScale);
  });
}
window.__miniDraw = miniDraw; miniDraw();
function miniFrame() {
  mctx.clearRect(0, 0, MS * 2, MS * 2); if (miniBg) mctx.drawImage(miniBg, 0, 0);
  const px = mx(player.x), pz = mz(player.z), fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  mctx.fillStyle = '#ffffff'; mctx.strokeStyle = '#1b2340'; mctx.lineWidth = 2;
  mctx.beginPath(); mctx.moveTo(px + fx * 12, pz + fz * 12); mctx.lineTo(px - fz * 7 - fx * 6, pz + fx * 7 - fz * 6); mctx.lineTo(px + fz * 7 - fx * 6, pz - fx * 7 - fz * 6); mctx.closePath(); mctx.fill(); mctx.stroke();
}

/* where am I */
let lastWhere = '';
function whereAmI() {
  let found = null;
  for (const s of spaces) {
    if (player.x < s.x0 || player.x > s.x1 || player.z < s.z0 || player.z > s.z1) continue;
    if (s.kind === 'room') { found = s; break; }
    if (!found || (s.kind === 'corridor' && found.kind === 'hub')) found = s;
  }
  const name = !found ? '' : found.kind === 'room' ? (ROOMS[found.id].kind === 'personal' ? ROOMS[found.id].title + "'s room" : found.name) : found.kind === 'hub' ? 'Hub' : found.name;
  if (name !== lastWhere) { lastWhere = name; whereEl.textContent = name; whereEl.classList.remove('pop'); void whereEl.offsetWidth; whereEl.classList.add('pop'); }
}

/* ============================== loop =================================== */
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
const clock = new THREE.Clock(); let texT = 0, promptT = 0, shown = null;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (started && !uiOpen) {
    let fw = (keys['w'] || keys['arrowup'] ? 1 : 0) - (keys['s'] || keys['arrowdown'] ? 1 : 0) - joy.y;
    let st = (keys['d'] ? 1 : 0) - (keys['a'] ? 1 : 0) + joy.x;
    const tl = (keys['arrowright'] ? 1 : 0) - (keys['arrowleft'] ? 1 : 0);
    player.yaw -= tl * 1.8 * dt;
    const m = Math.hypot(fw, st); if (m > 1) { fw /= m; st /= m; }
    const spd = (keys['shift'] ? 4.6 : 2.7) * dt;
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
    const dx = (fx * fw + rx * st) * spd, dz = (fz * fw + rz * st) * spd;
    if (dx || dz) {
      let [nx, nz] = collide(player.x + dx, player.z); [nx, nz] = collide(nx, player.z + dz);
      player.x = nx; player.z = nz; player.bob += (Math.abs(fw) + Math.abs(st) > 0 ? 1 : 0) * dt * (keys['shift'] ? 11 : 7.5);
    }
  }
  camera.position.set(player.x, EYE + Math.sin(player.bob) * 0.025, player.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
  glow.position.set(player.x, 2.4, player.z);
  for (const d of doors) {
    const near = Math.hypot(player.x - d.cx, player.z - d.cz) < 2.3 ? 1 : 0;
    d.k += (near - d.k) * Math.min(1, dt * 6); d.leaf.position.copy(d.base).addScaledVector(d.off, d.k);
  }
  texT += dt; if (texT > 0.3) { texT = 0; updateTextures(player.x, player.z); whereAmI(); }
  promptT += dt;
  if (promptT > 0.12) {
    promptT = 0; const id = started && !uiOpen ? pick(0, 0) : null;
    if (id !== shown) { shown = id; prompt.classList.toggle('show', !!id); if (id) $('promptTxt').textContent = ROOMS[id].title + ': ' + (isTouch ? 'tap to see why this room' : 'press E or click'); }
  }
  miniFrame();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
$('prompt').addEventListener('click', () => { if (shown) openPopup(shown); });
setUi(); updateHint();
requestAnimationFrame(frame);
setTimeout(() => updateTextures(player.x, player.z), 50);
$('loading').classList.add('hide');

window.__team = { teleport, player, ROOMS, roomInfo, spaces, camera, scene, THREE, openPopup, setTheme: applyTheme };
