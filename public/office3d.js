// ออฟฟิศ 3D (Three.js) — ใช้ตำแหน่งตัวละคร/ผังห้องเดียวกับฉบับ 2D ใน index.html
// 1 ช่อง (T px) ในผัง 2D = 1 หน่วยในโลก 3D · x → x, y → z
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const host = document.getElementById('three');
const labels = document.getElementById('labels');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const CX = W / T / 2, CZ = 13.5;
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -300, 500); // near ติดลบ: ดูภาพรวมหลายตึกแล้วตึกริมไม่ถูกตัด
const HOME = new THREE.Vector3(CX + 16, 30, CZ + 34);
camera.position.copy(HOME);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(CX, 0, CZ);
controls.enableDamping = true;
controls.minPolarAngle = 0.3; controls.maxPolarAngle = 1.3;
controls.minZoom = 0.18; controls.maxZoom = 4;
controls.zoomSpeed = 1.2;
renderer.domElement.addEventListener('dblclick', () => {
  const ox = oxOf(office);
  camera.position.copy(HOME); camera.position.x += ox; controls.target.set(CX + ox, 0, CZ); camera.zoom = 1; camera.updateProjectionMatrix();
});
// กล้องเลื่อนไปหาตึก (หยุดทันทีเมื่อผู้ใช้จับกล้องเอง)
let fly = null;
window.focusOffice3d = id => { fly = { x: CX + oxOf(id), zoom: 1 }; };
window.overview3d = () => {
  const xs = accounts().map(a => a.slot * LOT_W);
  const lo = Math.min(...xs), hi = Math.max(...xs), a = host.clientWidth / host.clientHeight;
  fly = { x: CX + (lo + hi) / 2, zoom: Math.max(controls.minZoom, Math.min(1, 31 * a / (hi - lo + 70))) };
};
renderer.domElement.addEventListener('wheel', () => { fly = null; }, { passive: true });
function flyStep() {
  if (!fly) return;
  const dx = (fly.x - controls.target.x) * 0.12;
  controls.target.x += dx; camera.position.x += dx;
  camera.zoom += (fly.zoom - camera.zoom) * 0.12; camera.updateProjectionMatrix();
  if (Math.abs(fly.x - controls.target.x) < 0.05 && Math.abs(fly.zoom - camera.zoom) < 0.005) fly = null;
}

// ---------- แสง ----------
const hemi = new THREE.HemisphereLight('#d6e2ff', '#2a2545', 1.8);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff3e0', 2.6);
sun.position.set(CX - 14, 30, CZ + 18);
sun.target.position.set(CX, 0, CZ);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 24, bottom: -24, near: 1, far: 100 });
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);
const roomLights = [];

// ---------- ตัวช่วย ----------
const mats = new Map();
function mat(color, o = {}) {
  const key = color + JSON.stringify(o);
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...o }));
  return mats.get(key);
}
const glow = (color, k = 1.6) => mat(color, { emissive: color, emissiveIntensity: k });
const root = new THREE.Group(); scene.add(root);
let world = root;                     // กลุ่มของตึกที่กำลังสร้าง (buildOffice สลับค่านี้)
function box(w, h, d, m, x, y, z, parent = world, shadow = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof m === 'string' ? mat(m) : m);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = shadow; mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function cyl(rt, rb, h, m, x, y, z, parent = world, seg = 16) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof m === 'string' ? mat(m) : m);
  mesh.position.set(x, y + h / 2, z); mesh.castShadow = true; mesh.receiveShadow = true;
  parent.add(mesh); return mesh;
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return { c, g, tex };
}
function screen(w, h, tex, x, y, z, rotY = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  m.position.set(x, y, z); m.rotation.y = rotY; world.add(m); return m;
}
const W3 = W / T, H3 = H / T;

const FLOORS = {
  library: '#3b3352', desk: '#2f3d5e', server: '#222a3e', lounge: '#2b3c49',
  meeting: '#352f52', board: '#2a3553', browser: '#1f3646', inbox: '#3a3346',
};
const ACCENT = {
  library: '#ffb86b', desk: '#7aa2ff', server: '#3ddc97', lounge: '#ff7eb6',
  meeting: '#b48cff', board: '#ffd166', browser: '#5ce1ff', inbox: '#ff6b6b',
};
const glassMat = new THREE.MeshPhysicalMaterial({ color: '#9cc0ff', transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0, depthWrite: false });
const railMat = glow('#5b7cff', 1.8);
await document.fonts.ready.catch(() => {});

// ไฟห้องกลางคืนมีชุดเดียว ย้ายตามตึกที่กล้องมองอยู่ (ไฟจริงหลายสิบดวงจะทำให้เครื่องหนักมาก)
const lightRig = new THREE.Group(); root.add(lightRig);
for (const [k, r] of Object.entries(ROOMS)) {
  const l = new THREE.PointLight(ACCENT[k], 0, 12, 1.6);
  l.position.set(r.x + r.w / 2, 2.6, r.y + r.h / 2); lightRig.add(l); roomLights.push(l);
}

// ---------- ตึก 1 หลังต่อ 1 account · ผังเหมือนกันทุกหลัง เลื่อนตำแหน่งตาม slot ----------
const offices = new Map();  // account id -> ตึก
function buildOffice(acc) {
const group = new THREE.Group(); group.position.x = acc.slot * LOT_W; root.add(group);
world = group;

// ---------- พื้น ----------
box(W3 + 1, 0.5, H3 + 1, '#0c1222', CX, -0.6, H3 / 2);
for (const [k, r] of Object.entries(ROOMS)) {
  box(r.w, 0.1, r.h, FLOORS[k], r.x + r.w / 2, -0.1, r.y + r.h / 2, world, false);
  // พรมกลางห้อง
  box(r.w - 2, 0.02, r.h - 3, mat(FLOORS[k], { roughness: 1, color: new THREE.Color(FLOORS[k]).multiplyScalar(1.18) }), r.x + r.w / 2, 0, r.y + r.h / 2 + 0.3, world, false);
}
box(39, 0.1, 4, '#1a2340', 20.5, -0.1, 13, world, false);
for (const z of [12.15, 13.85]) box(39, 0.03, 0.06, glow('#4a6cff', 2.2), 20.5, 0.01, z, world, false);

// ---------- ผนัง ----------
const WALL = '#26304f', WALL_TOP = '#1b2340';
box(W3, 2.8, 0.3, WALL, CX, 0, 1.85);                 // ผนังหลัง
box(0.3, 2.8, H3, WALL, 0.85, 0, H3 / 2);             // ผนังซ้าย
box(0.3, 0.5, H3, WALL_TOP, W3 - 0.85, 0, H3 / 2);    // ผนังขวา (เตี้ย ให้มองเห็นข้างใน)
box(W3, 0.5, 0.3, WALL_TOP, CX, 0, H3 - 0.85);        // ผนังหน้า (เตี้ย)
box(W3, 0.06, 0.32, glow('#5b7cff', 1.4), CX, 2.8, 1.85, world, false);

const windows = [];
for (const wx of [2, 6, 13, 18, 23, 31, 35, 41, 45]) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.1), new THREE.MeshBasicMaterial({ color: '#8fd0ff', toneMapped: false }));
  m.position.set(wx + 1, 1.55, 2.01); world.add(m); windows.push(m);
  box(2.15, 0.08, 0.1, '#9fb0e0', wx + 1, 0.98, 2.03, world, false);
}

function glassWall(x1, z1, x2, z2) {
  const len = Math.hypot(x2 - x1, z2 - z1); if (len < 0.05) return;
  const horiz = Math.abs(z2 - z1) < 0.01;
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  const [w, d] = horiz ? [len, 0.12] : [0.12, len];
  box(w, 0.3, d, '#2a3558', cx, 0, cz);
  const g = new THREE.Mesh(new THREE.BoxGeometry(w, 1.35, d), glassMat);
  g.position.set(cx, 0.3 + 0.675, cz); world.add(g);
  box(w + (horiz ? 0 : 0.04), 0.05, d + (horiz ? 0.04 : 0), railMat, cx, 1.65, cz, world, false);
}
function wallRow(z, rooms) {
  const doors = rooms.map(k => ROOMS[k].door).sort((a, b) => a - b);
  let x = 1;
  for (const d of doors) { glassWall(x, z, d - 0.15, z); x = d + 1.15; }
  glassWall(x, z, 39, z);
}
wallRow(11.25, ['library', 'desk', 'server']);
wallRow(14.75, ['lounge', 'meeting', 'board', 'browser']);
for (const [x, z1, z2] of [[10.5, 2, 11.25], [29.5, 2, 11.25], [10.5, 14.75, 25], [21.5, 14.75, 25], [29.5, 14.75, 25], [39.5, 2, 12.05], [39.5, 13.95, 25]]) glassWall(x, z1, x, z2);

// ---------- ป้ายห้อง (ลอยเหนือห้อง) ----------
function sign(text, color, x, y, z, sx = 4.4) {
  const { tex } = canvasTex(512, 96, (g, w, h) => {
    g.fillStyle = 'rgba(10,14,36,0.88)';
    g.beginPath(); g.roundRect(6, 10, w - 12, h - 20, 18); g.fill();
    g.shadowColor = color; g.shadowBlur = 18; g.strokeStyle = color; g.lineWidth = 4; g.stroke();
    g.shadowBlur = 12; g.fillStyle = '#ffffff'; g.font = '700 44px "Pixelify Sans", monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 2);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, toneMapped: false }));
  s.scale.set(sx, sx * 96 / 512, 1); s.position.set(x, y, z); world.add(s); return s;
}
for (const [k, r] of Object.entries(ROOMS)) sign(r.name, ACCENT[k], r.x + r.w / 2, 3.3, r.y + r.h / 2 - (r.y < 11 ? 2 : 0));
sign(acc.name, '#b48cff', CX, 4.2, 1.9, 6);

// ---------- เฟอร์นิเจอร์ ----------
function plant(x, z, s = 1) {
  cyl(0.28 * s, 0.22 * s, 0.45 * s, '#8a4b2a', x, 0, z);
  const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 * s, 0), mat('#3fae5e', { flatShading: true }));
  leaf.position.set(x, 0.9 * s, z); leaf.castShadow = true; world.add(leaf);
  const leaf2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35 * s, 0), mat('#2f8a4a', { flatShading: true }));
  leaf2.position.set(x + 0.15, 1.3 * s, z - 0.1); leaf2.castShadow = true; world.add(leaf2);
}
function chair(x, z, rotY = 0, color = '#2a2f45') {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; world.add(g);
  cyl(0.05, 0.05, 0.4, '#555c70', 0, 0, 0, g, 8);
  cyl(0.3, 0.3, 0.04, '#3a4058', 0, 0, 0, g, 12);
  box(0.62, 0.1, 0.6, color, 0, 0.4, 0, g);
  box(0.62, 0.65, 0.1, color, 0, 0.5, 0.3, g);
  return g;
}

// โต๊ะทำงาน + จอ (จอเปลี่ยนตามสถานะเจ้าของโต๊ะ)
const deskScreens = [];
DESKS.forEach((d, i) => {
  const x0 = d.x / T, z0 = (d.y + 10) / T;
  box(3, 0.08, 1.05, '#c9a27a', x0 + 1.5, 0.72, z0 + 0.45);
  for (const [lx, lz] of [[0.1, 0.05], [2.9, 0.05], [0.1, 0.85], [2.9, 0.85]]) box(0.07, 0.72, 0.07, '#5a4636', x0 + lx, 0, z0 + lz);
  box(0.12, 0.25, 0.12, '#1b1f2b', x0 + 1.5, 0.8, z0 + 0.25);
  box(1.4, 0.78, 0.06, '#151924', x0 + 1.5, 1.02, z0 + 0.22);
  const s = canvasTex(160, 88, () => {});
  deskScreens.push({ ...s, i });
  screen(1.3, 0.68, s.tex, x0 + 1.5, 1.41, z0 + 0.26);
  box(0.75, 0.03, 0.25, '#2a2f40', x0 + 1.5, 0.8, z0 + 0.7);
  cyl(0.07, 0.06, 0.16, '#e8e0d0', x0 + 2.55, 0.8, z0 + 0.55, world, 10);
  chair(d.x / T + 1.5, (d.y + 2.35 * T) / T + 0.05);
});
plant(11.6, 10.3); plant(28.3, 10.3); plant(28.3, 2.8, 0.9);

// ห้องสมุด
const BOOK = ['#c94f4f', '#4f7fc9', '#d9b84a', '#4fae7a', '#9a5fc9', '#e08a4a'];
for (let i = 0; i < 4; i++) {
  const x = 1.3 + i * 2.2 + 0.95;
  box(1.9, 2.3, 0.55, '#4a2c1b', x, 0, 2.3);
  for (let s = 0; s < 4; s++) {
    box(1.8, 0.05, 0.5, '#5e3a24', x, 0.15 + s * 0.52, 2.33, world, false);
    for (let b = 0; b < 7; b++) {
      const h = 0.32 + ((b * 7 + s * 3 + i) % 4) * 0.04;
      box(0.18, h, 0.36, BOOK[(b + s + i) % 6], x - 0.72 + b * 0.24, 0.2 + s * 0.52, 2.36, world, false);
    }
  }
}
for (const p of SPOTS.library.slice(0, 4)) chair(p.x / T, p.y / T + 0.05, 0, '#8a3e30');
box(1.4, 0.06, 0.9, '#7a5534', 4.8, 0.6, 7.4); cyl(0.08, 0.08, 0.6, '#5a3a22', 4.8, 0, 7.4);
box(0.5, 0.05, 0.35, '#efe6cc', 4.6, 0.66, 7.35, world, false);
plant(9.2, 10.2);

// ห้องเซิร์ฟเวอร์
const leds = [];
for (let i = 0; i < 4; i++) {
  const x = 30.4 + i * 2.1 + 0.85;
  box(1.7, 2.5, 0.8, '#121620', x, 0, 2.45);
  for (let s = 0; s < 8; s++) {
    box(1.5, 0.2, 0.02, '#232a3c', x, 0.2 + s * 0.28, 2.86, world, false);
    for (let l = 0; l < 3; l++) {
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.02), new THREE.MeshBasicMaterial({ color: '#3ddc97', toneMapped: false }));
      led.position.set(x - 0.6 + l * 0.14, 0.3 + s * 0.28, 2.88); world.add(led);
      leds.push({ led, seed: i * 100 + s * 10 + l, color: l === 2 ? '#ffc857' : '#3ddc97' });
    }
  }
}
box(2.4, 0.75, 1.0, '#1d2230', 37.2, 0, 9.4);
const term = canvasTex(256, 96, () => {});
box(1.6, 0.9, 0.06, '#151924', 37.2, 0.8, 9.1);
screen(1.5, 0.8, term.tex, 37.2, 1.25, 9.14);
chair(37.2, 10.3);

// Lounge
const COUCH = '#7b4fb5';
box(5, 0.45, 1.3, COUCH, 4.7, 0, 18.6);
box(5, 0.9, 0.35, COUCH, 4.7, 0, 18.0);
box(0.35, 0.7, 1.3, COUCH, 2.35, 0, 18.6); box(0.35, 0.7, 1.3, COUCH, 7.05, 0, 18.6);
for (let i = 0; i < 3; i++) box(1.4, 0.15, 1.0, mat('#9b6fd5'), 3.2 + i * 1.55, 0.45, 18.75, world, false);
box(2.4, 0.4, 1.0, '#5a3a22', 4.9, 0, 21.2);
cyl(0.09, 0.08, 0.16, '#e8e0d0', 4.6, 0.4, 21.1, world, 10);
box(1.2, 1.4, 0.8, '#c0c4d0', 2.0, 0, 23.3); box(0.8, 0.4, 0.05, '#2a2f40', 2.0, 0.9, 22.88, world, false);
box(1.2, 2.3, 1.0, '#dfe3ec', 8.9, 0, 22.3);
const tv = canvasTex(160, 90, () => {});
box(2.9, 1.65, 0.08, '#0c0c10', 5.3, 0.9, 15.12);
screen(2.75, 1.5, tv.tex, 5.3, 1.72, 15.17);
plant(1.7, 15.7); plant(8.9, 16); plant(8.9, 24.2, 0.8);

// ห้องประชุม
box(6.2, 0.1, 2.3, '#8a6038', 15.7, 0.72, 20.05);
box(5.6, 0.72, 0.4, '#5a3a22', 15.7, 0, 20.05);
for (const p of SPOTS.meeting.slice(0, 6)) chair(p.x / T, p.y / T + (p.face === 'down' ? -0.05 : 0.05), p.face === 'down' ? Math.PI : 0, '#3a3058');
for (let i = 0; i < 3; i++) box(0.5, 0.02, 0.35, '#efe6cc', 13.4 + i * 2.1, 0.82, 20, world, false);
const meetScreen = canvasTex(320, 160, (g, w, h) => {
  g.fillStyle = '#0f1630'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#b48cff'; g.font = '700 22px "Pixelify Sans", monospace'; g.fillText('SPRINT BOARD', 16, 32);
  const bars = [0.8, 0.55, 0.9, 0.35, 0.65];
  bars.forEach((v, i) => { g.fillStyle = ['#7aa2ff', '#3ddc97', '#ffc857', '#ff6b6b', '#b48cff'][i]; g.fillRect(20 + i * 58, h - 16 - v * 100, 36, v * 100); });
});
box(4.2, 2.1, 0.08, '#0c0c10', 14, 0.7, 15.12);
screen(4, 1.9, meetScreen.tex, 14, 1.75, 15.17);
plant(20.3, 23.8); plant(11.7, 23.8, 0.8);

// Think tank — ไวท์บอร์ด
const wb = canvasTex(512, 200, (g, w, h) => {
  g.fillStyle = '#f7f9ff'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#1a2140'; g.font = '700 26px "Pixelify Sans", monospace'; g.fillText('ROADMAP', 18, 34);
  const steps = ['PLAN', 'READ', 'EDIT', 'TEST', 'SHIP'];
  const cols = ['#7aa2ff', '#b48cff', '#3ddc97', '#ffc857', '#ff6b6b'];
  g.strokeStyle = '#9aa8c8'; g.lineWidth = 3; g.beginPath(); g.moveTo(50, 120); g.lineTo(470, 120); g.stroke();
  steps.forEach((s, i) => {
    const x = 50 + i * 105; g.fillStyle = cols[i]; g.beginPath(); g.roundRect(x - 34, 96, 68, 48, 10); g.fill();
    g.fillStyle = '#fff'; g.font = '700 16px "Pixelify Sans", monospace'; g.textAlign = 'center'; g.fillText(s, x, 126); g.textAlign = 'left';
  });
  g.fillStyle = '#5a6488'; g.font = '16px sans-serif'; g.fillText('→ ทุกงานเดินตามลำดับนี้', 18, 180);
});
box(6.4, 0.08, 0.1, '#9aa3bb', 25.5, 0.75, 15.15);
screen(6.2, 2.4, wb.tex, 25.5, 2.0, 15.2);
box(1.2, 1.6, 0.1, '#e9d27a', 27.9, 0.2, 23.8);
for (let i = 0; i < 6; i++) box(0.3, 0.3, 0.02, ['#fff3a8', '#a8f0ff', '#ffc8e0'][i % 3], 27.6 + (i % 3) * 0.32, 0.9 + Math.floor(i / 3) * 0.4, 23.74, world, false);
plant(22.4, 23.8);

// Browser lab
box(7.8, 0.08, 1.0, '#4a5470', 34.5, 0.72, 17.9);
box(7.6, 0.72, 0.15, '#2f3650', 34.5, 0, 17.5);
const browserScreens = [];
for (let i = 0; i < 3; i++) {
  const x = 31.8 + i * 2.6;
  box(0.12, 0.3, 0.12, '#141824', x, 0.8, 17.6);
  box(2.0, 1.15, 0.06, '#141824', x, 1.05, 17.55);
  const s = canvasTex(256, 144, () => {});
  browserScreens.push(s);
  screen(1.9, 1.05, s.tex, x, 1.62, 17.59);
}
for (const p of SPOTS.browser.slice(0, 3)) chair(p.x / T, p.y / T + 0.05);
plant(38.3, 23.8); plant(30.6, 23.8, 0.8);

// ห้องคอม — โต๊ะคอม 2 แถว จอทุกเครื่องแสดงจำนวนเมลใหม่
const mailScreen = canvasTex(256, 144, () => {});
for (const z of [2.75, 17.8]) {
  box(7, 0.08, 1.0, '#4a5470', 44, 0.72, z);
  box(6.8, 0.72, 0.15, '#2f3650', 44, 0, z - 0.4);
  for (let i = 0; i < 3; i++) {
    const x = 41.6 + i * 2.4;
    box(0.12, 0.3, 0.12, '#141824', x, 0.8, z - 0.25);
    box(1.7, 1.0, 0.06, '#141824', x, 1.0, z - 0.3);
    screen(1.6, 0.9, mailScreen.tex, x, 1.5, z - 0.26);
    box(0.75, 0.03, 0.25, '#2a2f40', x, 0.8, z + 0.25);
    chair(x, z + 1.1);
  }
}
// เคาน์เตอร์เลขาฯ + คอม
box(3.6, 0.08, 1.3, '#b07a4a', 44, 0.86, 11.65);
box(3.6, 0.86, 0.12, '#8a5a36', 44, 0, 12.24);
for (const sx of [42.25, 45.75]) box(0.1, 0.86, 1.2, '#8a5a36', sx, 0, 11.6);
box(3.4, 0.05, 0.02, glow('#ff6b6b', 1.4), 44, 0.62, 12.31, world, false);
box(0.12, 0.2, 0.12, '#141824', 45.2, 0.94, 11.95);
box(1.1, 0.6, 0.06, '#141824', 45.2, 1.1, 11.95);
screen(1.0, 0.52, mailScreen.tex, 45.2, 1.4, 11.91, Math.PI);
box(0.75, 0.03, 0.25, '#2a2f40', 44.6, 0.94, 11.35);
chair(44, 10.25, Math.PI, '#8a3e4a');
// โซฟารอ + ตู้น้ำ + ต้นไม้
box(4, 0.42, 1.3, '#4a6a8a', 43, 0, 22.15);
box(4, 0.85, 0.3, '#4a6a8a', 43, 0, 22.65);
for (const sx of [41.15, 44.85]) box(0.3, 0.65, 1.3, '#4a6a8a', sx, 0, 22.15);
for (let i = 0; i < 2; i++) box(1.65, 0.14, 0.95, '#5f86ad', 42.15 + i * 1.7, 0.42, 22.05, world, false);
box(0.6, 0.95, 0.55, '#cfe8ff', 46.85, 0, 21.4);
box(0.3, 0.12, 0.04, '#3a3f55', 46.85, 0.6, 21.12, world, false);
cyl(0.2, 0.2, 0.55, mat('#7ec8ff', { transparent: true, opacity: 0.7, roughness: 0.1 }), 46.85, 0.95, 21.4);
plant(46.8, 4.6); plant(40.7, 23.6); plant(47.3, 15.6, 0.8);

// จุดถามคุณ (กลางทางเดิน)
box(1.8, 1.0, 0.6, '#ffc857', 20, 0, 11.75);
sign('ASK', '#ffc857', 20, 1.6, 11.8, 1.6);

world = root;
return { acc, group, windows, deskScreens, browserScreens, leds, term, tv, mailScreen, npc: null };
}
function dropOffice(id) {
  const o = offices.get(id);
  root.remove(o.group);
  o.group.traverse(m => { if (m.isSprite) return; m.geometry?.dispose(); m.material?.map?.dispose(); });
  if (o.npc) { root.remove(o.npc.g); o.npc.lbl.remove(); }
  offices.delete(id);
}
function syncOffices() {
  const accs = accounts();
  for (const id of [...offices.keys()]) if (!accs.some(a => a.id === id)) dropOffice(id);
  for (const a of accs) if (!offices.has(a.id)) { offices.set(a.id, buildOffice(a)); nightNow = null; }
}

// ---------- ตัวละคร ----------
const STATE_COLOR = { tool: '#ffc857', thinking: '#b48cff', done: '#3ddc97', asking: '#ff6b6b', away: '#6b7799' };
const people = new Map();
const geo = {
  leg: new THREE.BoxGeometry(0.18, 0.5, 0.2), arm: new THREE.BoxGeometry(0.13, 0.46, 0.14),
  body: new THREE.CapsuleGeometry(0.28, 0.32, 4, 12), head: new THREE.SphereGeometry(0.31, 20, 14),
  hair: new THREE.SphereGeometry(0.335, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
  hand: new THREE.SphereGeometry(0.075, 8, 6), eye: new THREE.BoxGeometry(0.06, 0.08, 0.02),
  ring: new THREE.RingGeometry(0.42, 0.56, 40), disc: new THREE.CircleGeometry(0.42, 40),
};
function limb(parent, g, m, x, y, len) {
  const pivot = new THREE.Group(); pivot.position.set(x, y, 0); parent.add(pivot);
  const mesh = new THREE.Mesh(g, m); mesh.position.y = -len / 2; mesh.castShadow = true; pivot.add(mesh);
  return pivot;
}
function makePerson(a) {
  const h = hash(a.id);
  const shirt = a.id.startsWith('npc:') ? new THREE.Color(a.shirt) : new THREE.Color().setHSL((h % 360) / 360, 0.65, 0.55);
  const shirtM = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.6 });
  const skinM = mat(a.skin), hairM = mat(a.hair), pantsM = mat('#2a3045');
  const g = new THREE.Group(); root.add(g);
  g.scale.setScalar(1.35);
  const body = new THREE.Group(); g.add(body);
  const legL = limb(body, geo.leg, pantsM, -0.11, 0.55, 0.5), legR = limb(body, geo.leg, pantsM, 0.11, 0.55, 0.5);
  const torso = new THREE.Mesh(geo.body, shirtM); torso.position.y = 0.92; torso.castShadow = true; body.add(torso);
  const armL = limb(body, geo.arm, shirtM, -0.38, 1.13, 0.46), armR = limb(body, geo.arm, shirtM, 0.38, 1.13, 0.46);
  for (const arm of [armL, armR]) { const hd = new THREE.Mesh(geo.hand, skinM); hd.position.y = -0.48; arm.add(hd); }
  const head = new THREE.Group(); head.position.y = 1.55; body.add(head);
  const skull = new THREE.Mesh(geo.head, skinM); skull.castShadow = true; head.add(skull);
  const hair = new THREE.Mesh(geo.hair, hairM); hair.position.y = 0.03; hair.rotation.x = -0.25; head.add(hair);
  if (a.style === 1) { const back = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.18), hairM); back.position.set(0, -0.12, -0.22); head.add(back); }
  if (a.style === 2) { const top = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), hairM); top.position.set(0, 0.33, -0.05); head.add(top); }
  for (const ex of [-0.11, 0.11]) { const e = new THREE.Mesh(geo.eye, mat('#1a1a1a')); e.position.set(ex, 0.02, 0.3); head.add(e); }
  if (a.glasses) { const gl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.03), mat('#222')); gl.position.set(0, 0.04, 0.31); head.add(gl); }
  if (a.data.isSub) { const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 16), mat('#ffc857')); cap.position.y = 0.28; head.add(cap); }
  const ringM = new THREE.MeshBasicMaterial({ color: '#ffc857', transparent: true, opacity: 0.95, side: THREE.DoubleSide, toneMapped: false });
  const discM = new THREE.MeshBasicMaterial({ color: '#ffc857', transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false });
  const ring = new THREE.Mesh(geo.ring, ringM); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; g.add(ring);
  const disc = new THREE.Mesh(geo.disc, discM); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.025; g.add(disc);
  g.traverse(o => { o.userData.sid = a.id; });

  const lbl = document.createElement('div'); lbl.className = 'lbl'; lbl.dataset.id = a.id;
  lbl.innerHTML = '<div class="bub"></div><div class="pill"><i></i><b></b><small></small></div>';
  labels.appendChild(lbl);
  return { g, body, legL, legR, armL, armR, head, ringM, discM, ring, lbl, yaw: 0, key: '' };
}
labels.addEventListener('click', e => {
  const el = e.target.closest('.lbl'); if (!el) return;
  if (el.dataset.id.startsWith('npc:')) return openInbox(null, el.dataset.id.slice(4));
  selected = selected === el.dataset.id ? null : el.dataset.id; onSelect();
});

const FACE = { up: Math.PI, down: 0, left: -Math.PI / 2, right: Math.PI / 2 };
function turn(from, to, k) { let d = to - from; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return from + d * k; }
const v3 = new THREE.Vector3();

function updatePeople(t, now) {
  for (const [id, p] of people) if (!actors.has(id)) { root.remove(p.g); p.lbl.remove(); people.delete(id); }
  const cw = host.clientWidth, ch = host.clientHeight;
  for (const a of actors.values()) {
    let p = people.get(a.id);
    const x = a.x / T + oxOf(a.data.account), z = a.y / T;
    if (!p) { p = makePerson(a); people.set(a.id, p); p.g.position.set(x, 0, z); }
    const dx = x - p.g.position.x, dz = z - p.g.position.z;
    const moving = a.path.length > 0;
    const sit = a.seat && !moving;
    const s = a.data;
    let yaw = p.yaw;
    if (moving && dx * dx + dz * dz > 1e-5) yaw = Math.atan2(dx, dz);
    else if (!moving) yaw = FACE[a.face] ?? 0;
    p.yaw = turn(p.yaw, yaw, 0.18);
    p.g.rotation.y = p.yaw;
    p.g.position.set(x, 0, z);

    const swing = moving ? Math.sin(t * 11 + hash(a.id)) * 0.6 : 0;
    const sending = !!a.delivery;
    const typing = sit && s.zone === 'desk' && (s.state === 'tool' || sending);
    p.body.position.y = moving ? Math.abs(Math.sin(t * 11)) * 0.05 : sit ? -0.08 : 0;
    p.legL.rotation.x = sit ? -Math.PI / 2 : swing;
    p.legR.rotation.x = sit ? -Math.PI / 2 : -swing;
    // พิมพ์งาน / ส่งเมล / ยกมือถาม
    p.armL.rotation.z = 0; p.armR.rotation.z = 0; p.body.rotation.x = 0;
    if (typing) { p.armL.rotation.x = -1.15 + Math.sin(t * 22) * 0.08; p.armR.rotation.x = -1.15 + Math.cos(t * 22) * 0.08; }
    else if (s.state === 'asking' && !moving) { p.armL.rotation.x = 0; p.armR.rotation.x = -2.8; p.armR.rotation.z = 0.45 + Math.sin(t * 9) * 0.3; }
    else if (s.state === 'thinking' && !moving) { p.armL.rotation.x = 0; p.armR.rotation.x = -2.3; }
    else { p.armL.rotation.x = -swing; p.armR.rotation.x = swing; }
    p.head.rotation.x = s.state === 'away' ? 0.35 : 0;
    p.head.rotation.y = s.state === 'thinking' && !moving ? Math.sin(t * 1.5) * 0.3 : 0;

    const col = STATE_COLOR[s.state] || '#7aa2ff';
    p.ringM.color.set(col); p.discM.color.set(col);
    const pulse = s.state === 'tool' || s.state === 'thinking' || s.state === 'asking' ? 1 +Math.sin(t * 4) * 0.08 : 1;
    p.ring.scale.setScalar(selected === a.id ? 1.25 : pulse);

    // ป้ายชื่อ + กรอบข้อความ (HTML ทับบนภาพ 3D)
    v3.set(x, sit ? 2.55 : 2.85, z).project(camera);
    const off = v3.z > 1 || v3.x < -1.1 || v3.x > 1.1 || v3.y < -1.1 || v3.y > 1.1;
    p.lbl.style.display = off ? 'none' : '';
    p.lbl.style.left = ((v3.x + 1) / 2 * cw) + 'px';
    p.lbl.style.top = ((1 - v3.y) / 2 * ch) + 'px';
    p.lbl.style.zIndex = String(1000 - Math.round(v3.z * 500));
    const showBub = selected === a.id || now < a.bubbleUntil || s.state === 'tool' || s.state === 'thinking' || s.state === 'asking' || s.state === 'away' || sending;
    const bub = sending ? '📧 ส่งเมลให้เลขาฯ แล้ว' : s.state === 'away' ? '💤 พักอยู่' : s.state === 'thinking' ? '💭 กำลังคิด…' : `${s.icon} ${s.text}`;
    const key = [s.name, s.title, s.project, s.state, bub, showBub, selected === a.id].join('|');
    if (key !== p.key) {
      p.key = key;
      p.lbl.classList.toggle('sel', selected === a.id);
      p.lbl.querySelector('i').style.background = col;
      p.lbl.querySelector('i').style.boxShadow = `0 0 8px ${col}`;
      p.lbl.querySelector('b').textContent = (s.isSub ? '↳ ' : '') + nameOf(s);
      p.lbl.querySelector('small').textContent = shortName(s.title, 22) + ' · ' + s.project;
      const b = p.lbl.querySelector('.bub');
      b.textContent = bub; b.style.display = showBub ? '' : 'none';
      b.classList.toggle('away', s.state === 'away' && !sending);
      const red = s.state === 'asking' && !sending;
      b.style.background = red ? '#ff6b6b' : ''; b.style.color = red ? '#fff' : '';
    }
  }
  for (const o of offices.values()) updateNpc(o, t, cw, ch);
}

// เลขาฯ ตึกละคน — ไม่อยู่ใน people จึงไม่ถูกลบ · คลิกแล้วเปิดกล่องเมลของตึกนั้น
function updateNpc(o, t, cw, ch) {
  const ox = o.acc.slot * LOT_W;
  if (!o.npc) {
    o.npc = makePerson({ ...NPC_ACTOR, id: 'npc:' + o.acc.id });
    o.npc.g.position.set(NPC.x / T + ox, 0, NPC.y / T);
    o.npc.legL.rotation.x = o.npc.legR.rotation.x = -Math.PI / 2;
    o.npc.lbl.querySelector('b').textContent = 'เลขาฯ รับเมล';
    o.npc.lbl.querySelector('small').textContent = o.acc.name;
  }
  const npc = o.npc;
  const n = unreadMail(o.acc.id).length;
  const gotMail = [...actors.values()].some(a => a.delivery && a.data.account === o.acc.id);
  npc.body.position.y = -0.08 + Math.sin(t * 2) * 0.01;
  npc.head.rotation.y = Math.sin(t * 0.7) * 0.25;
  npc.armL.rotation.x = gotMail ? -1.15 + Math.sin(t * 22) * 0.08 : -0.55 + Math.sin(t * 1.3) * 0.05;
  npc.armR.rotation.x = gotMail ? -1.15 + Math.cos(t * 22) * 0.08 : -0.55 + Math.cos(t * 1.3) * 0.05;
  const col = n ? '#ff6b6b' : '#3ddc97';
  npc.ringM.color.set(col); npc.discM.color.set(col);
  npc.ring.scale.setScalar(n ? 1 + Math.sin(t * 4) * 0.08 : 1);
  v3.set(NPC.x / T + ox, 2.55, NPC.y / T).project(camera);
  const off = v3.z > 1 || v3.x < -1.1 || v3.x > 1.1 || v3.y < -1.1 || v3.y > 1.1;
  npc.lbl.style.display = off ? 'none' : '';
  npc.lbl.style.left = ((v3.x + 1) / 2 * cw) + 'px';
  npc.lbl.style.top = ((1 - v3.y) / 2 * ch) + 'px';
  npc.lbl.style.zIndex = String(1000 - Math.round(v3.z * 500));
  if (npc.key !== String(n)) {
    npc.key = String(n);
    npc.lbl.querySelector('i').style.background = col;
    npc.lbl.querySelector('i').style.boxShadow = `0 0 8px ${col}`;
    const b = npc.lbl.querySelector('.bub');
    b.textContent = n ? `📧 ${n} เมลใหม่ · คลิกอ่าน` : '📭 ยังไม่มีเมลใหม่';
    b.style.background = n ? '#ff6b6b' : '#2a3350'; b.style.color = n ? '#fff' : '#9fb0e0';
  }
}

// แมว
const catG = new THREE.Group(); root.add(catG);
box(0.55, 0.28, 0.25, '#e08a3a', 0, 0.12, 0, catG);
box(0.26, 0.24, 0.24, '#e08a3a', 0.33, 0.3, 0, catG);
box(0.06, 0.1, 0.06, '#e08a3a', 0.3, 0.54, 0.07, catG); box(0.06, 0.1, 0.06, '#e08a3a', 0.3, 0.54, -0.07, catG);
const tail = box(0.06, 0.35, 0.06, '#c06a2a', -0.3, 0.3, 0, catG); tail.rotation.z = 0.5;
for (const [lx, lz] of [[-0.18, -0.08], [-0.18, 0.08], [0.18, -0.08], [0.18, 0.08]]) box(0.07, 0.14, 0.07, '#c06a2a', lx, 0, lz, catG, false);
let catYaw = 0;

// ---------- จอ / ไฟ ที่ขยับได้ ----------
function drawDeskScreen(s, owner, t) {
  const g = s.g, w = s.c.width, h = s.c.height;
  const on = owner && owner.data.state !== 'away';
  const working = on && owner.data.state === 'tool' && owner.data.zone === 'desk' && owner.seat;
  g.fillStyle = on ? (working ? '#14254a' : '#1a2440') : '#06080e'; g.fillRect(0, 0, w, h);
  if (!on) return;
  g.fillStyle = owner.shirt; g.fillRect(0, 0, w, 6);
  const rows = working ? 9 : 4;
  for (let l = 0; l < rows; l++) {
    const len = 20 + (hash(s.i + ':' + l + ':' + Math.floor(t * (working ? 4 : 0.2))) % 100);
    g.fillStyle = ['#7cd8ff', '#ffd27c', '#9cff9c', '#ff9cc8', '#c8b4ff'][l % 5];
    g.fillRect(10 + (l % 3) * 8, 14 + l * 8, len, 4);
  }
  s.tex.needsUpdate = true;
}
function drawBrowser(s, i, on, t) {
  const g = s.g, w = s.c.width, h = s.c.height;
  g.fillStyle = on ? '#eef2fb' : '#1d2740'; g.fillRect(0, 0, w, h);
  g.fillStyle = on ? '#7aa2ff' : '#2a3758'; g.fillRect(0, 0, w, 16);
  g.fillStyle = on ? '#ffffff' : '#34416a'; g.fillRect(40, 4, w - 60, 8);
  const shift = on ? Math.floor(t * 2 + i) % 4 : 0;
  g.fillStyle = on ? '#c3cce0' : '#26324e';
  for (let r = 0; r < 6; r++) g.fillRect(14, 28 + ((r + shift) % 6) * 18, 60 + (hash(i + '-' + r) % 150), 8);
  s.tex.needsUpdate = true;
}

// ---------- กลางวัน / กลางคืน ----------
let nightNow = null;
function applyMood() {
  const hr = new Date().getHours();
  const night = dayMode === 'night' || (dayMode === 'auto' && (hr < 6 || hr >= 18));
  if (night === nightNow) return;
  nightNow = night;
  scene.background = new THREE.Color(night ? '#060914' : '#0d1428');
  hemi.intensity = night ? 0.45 : 1.8;
  hemi.color.set(night ? '#6b7bd6' : '#d6e2ff');
  sun.intensity = night ? 0.3 : 2.6;
  sun.color.set(night ? '#8fa0ff' : '#fff3e0');
  for (const l of roomLights) l.intensity = night ? 25 : 0;
  for (const o of offices.values()) for (const w of o.windows) w.material.color.set(night ? '#1a2356' : '#8fd0ff');
  railMat.emissiveIntensity = night ? 3 : 1.6;
}

// ---------- ขนาด / คลิก ----------
function resize3d() {
  const w = host.clientWidth;
  const h = Math.max(360, Math.min(window.innerHeight - 150, w * 0.66));
  host.style.height = h + 'px';
  renderer.setSize(w, h);
  const size = 31, a = w / h;
  Object.assign(camera, { left: -size * a / 2, right: size * a / 2, top: size / 2, bottom: -size / 2 });
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize3d);
window.resize3d = resize3d;

const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
let down = null;
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), groundHit = new THREE.Vector3();
renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; fly = null; });
renderer.domElement.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
  const r = renderer.domElement.getBoundingClientRect();
  mouse.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const npcs = [...offices.values()].map(o => o.npc).filter(Boolean);
  const hit = ray.intersectObjects([...people.values(), ...npcs].map(p => p.g), true)[0];
  const id = hit && hit.object.userData.sid;
  if (id && id.startsWith('npc:')) return openInbox(null, id.slice(4));
  // คลิกพื้นของตึกอื่น หรือคลิกตึกตอนดูภาพรวม → กล้องไปที่ตึกนั้น
  if (!id && ray.ray.intersectPlane(groundPlane, groundHit)) {
    const acc = accounts().find(a => groundHit.x >= a.slot * LOT_W + 0.5 && groundHit.x <= a.slot * LOT_W + W3 - 0.5 && groundHit.z >= 1 && groundHit.z <= 26);
    if (acc && (acc.id !== office || camera.zoom < 0.6)) return setOffice(acc.id);
  }
  selected = id ? (selected === id ? null : id) : null; onSelect();
});

// ---------- ลูป ----------
const clock = new THREE.Clock();
let lastSlow = 0, lastCat = { x: cat.x, y: cat.y };
function loop() {
  requestAnimationFrame(loop);
  if (view !== '3d') return;
  const t = clock.getElapsedTime(), now = performance.now();
  syncOffices();
  flyStep();
  controls.update();
  // แสงแดด (เงา) กับไฟห้องตามตึกที่กล้องมองอยู่
  sun.position.x = controls.target.x - 14; sun.target.position.x = controls.target.x;
  lightRig.position.x = Math.max(0, Math.round((controls.target.x - CX) / LOT_W)) * LOT_W;
  applyMood();
  updatePeople(t, now);

  const cdx = cat.x - lastCat.x, cdy = cat.y - lastCat.y;
  if (cdx * cdx + cdy * cdy > 0.01) catYaw = Math.atan2(-cdy, cdx);
  lastCat = { x: cat.x, y: cat.y };
  catG.position.set(cat.x / T, 0, cat.y / T); catG.rotation.y = catYaw;
  tail.rotation.z = 0.5 + Math.sin(t * 3) * 0.25;

  if (now - lastSlow > 200) {
    lastSlow = now;
    for (const o of offices.values()) {
      const { deskScreens, browserScreens, leds, term, tv, mailScreen } = o;
      const list = [...actors.values()].filter(a => a.data.account === o.acc.id);
      deskScreens.forEach(s => drawDeskScreen(s, list.find(a => a.deskIdx === s.i), t));
      const surfing = list.some(a => a.data.zone === 'browser' && a.data.state === 'tool');
      browserScreens.forEach((s, i) => drawBrowser(s, i, surfing, t));
      const busy = list.some(a => a.data.zone === 'server' && a.data.state === 'tool');
      for (const l of leds) l.led.material.color.set(hash(l.seed + ':' + Math.floor(t * (busy ? 8 : 1.2))) % 3 ? l.color : '#123024');
      term.g.fillStyle = '#04140c'; term.g.fillRect(0, 0, 256, 96);
      term.g.fillStyle = '#3ddc97'; term.g.font = '18px monospace';
      term.g.fillText(busy ? '> running' + '.'.repeat(1 + Math.floor(t * 3) % 3) : '> idle_', 12, 30);
      if (busy) term.g.fillText('$ ' + (list.find(a => a.data.zone === 'server' && a.data.state === 'tool')?.data.text || '').slice(0, 22), 12, 62);
      term.tex.needsUpdate = true;
      tv.g.fillStyle = ['#3b6bd6', '#d63b6b', '#3bd68a', '#d6b43b'][Math.floor(t / 4) % 4]; tv.g.fillRect(0, 0, 160, 90);
      tv.g.fillStyle = '#ffffff55'; tv.g.fillRect(20 + (t * 30) % 120, 30, 20, 30); tv.tex.needsUpdate = true;
      const unread = unreadMail(o.acc.id).length, mg = mailScreen.g;
      mg.fillStyle = unread ? '#3a1f2e' : '#10203c'; mg.fillRect(0, 0, 256, 144);
      mg.fillStyle = unread ? '#ff6b6b' : '#7aa2ff'; mg.fillRect(0, 0, 256, 26);
      mg.fillStyle = '#fff'; mg.font = '700 16px "Pixelify Sans", monospace'; mg.textBaseline = 'alphabetic'; mg.fillText('MAIL', 10, 19);
      mg.font = '700 28px "IBM Plex Sans Thai", sans-serif'; mg.fillText(unread ? `📧 ${unread} เมลใหม่` : '📭 ไม่มีเมลใหม่', 14, 90);
      mailScreen.tex.needsUpdate = true;
    }
  }
  outdoor?.update?.(t, now);
  renderer.render(scene, camera);
}

// บรรยากาศนอกตึก (ถนน รถ ต้นไม้) แยกไว้ใน outdoor3d.js
const outdoor = await import('./outdoor3d.js').catch(e => { console.warn('outdoor3d', e); return null; });
outdoor?.setup?.({ THREE, scene, world: root, mat, glow, box, cyl, canvasTex, W3, H3, isNight: () => !!nightNow });
resize3d();
loop();
