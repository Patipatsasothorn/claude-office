// บรรยากาศนอกตึกของออฟฟิศ 3D — office3d.js เรียก setup() ครั้งเดียว และ update() ทุกเฟรม
// ถนนหน้าตึก (วิ่งตามแกน x) · ทางเท้า · ทางม้าลาย + ไฟจราจร · รถสองเลน · คนเดิน · ต้นไม้ · ลานจอดด้านขวา · นก

let THREE, C, out = null;            // C = ctx จาก office3d.js · out = กลุ่มของทุกอย่างนอกตึก
let seed = 20261031;                 // สุ่มแบบมี seed → ผังเหมือนเดิมทุกครั้งที่โหลด
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const pick = a => a[Math.floor(rnd() * a.length)];
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- ผังพื้น (y = ผิวบนของแต่ละชั้น) ----------
const GY = -0.36, SW_Y = -0.18, RD_Y = -0.32;   // หญ้า / ทางเท้า / ถนน
const RZ = 30.7;                                  // กลางถนน (ถนน z 28.3–33.1)
const EXTRA = (MAX_OFFICES - 1) * LOT_W;          // ระยะที่เผื่อไว้ให้ตึกที่เพิ่ม (LOT_W, MAX_OFFICES อยู่ใน index.html)
const ROAD_W = 170 + EXTRA, ROAD_X = 25 + EXTRA / 2;
const XS = -22, XE = 72 + EXTRA, LOOP = XE - XS;  // รถ/คน วนจากท้ายตึกแรกถึงท้ายตึกสุดท้าย
const CROSS_X = 20, BUS_X = 34.5;
const CYCLE = 18, T_YEL = 9, T_RED = 11.5;        // เขียว 0–9 · เหลือง 9–11.5 · แดง 11.5–18
const ACC = 3, DEC = 5;
const CAR_COLS = ['#ff6b6b', '#ffd166', '#5ce1ff', '#7aa2ff', '#3ddc97', '#ff9f43', '#f2f3f7', '#b48cff', '#e84a5f', '#9aa3b8'];
const SHIRTS = ['#ff7eb6', '#7aa2ff', '#ffd166', '#3ddc97', '#ff9f43', '#e9ecf5', '#b48cff', '#5ce1ff'];
const PANTS = ['#2b2f45', '#3a4a6b', '#4a3b30', '#1d2233'];
const SKINS = ['#f1c9a5', '#d9a77e', '#b07b52', '#ffe0c2'];

const M = {};                         // วัสดุที่ปรับตามกลางวัน/คืน (ของตัวเอง ไม่แตะ cache ของ office)
const G = {};                         // geometry ใช้ซ้ำ
const geo = (k, make) => G[k] || (G[k] = make());
const lanes = [], walkers = [], crossers = [], sway = [], birds = [];
const beams = [], pools = [], lights = [];
let flock, nightNow = null, lastPh = null, lastT = null, broken = false;

// ---------- ตัวช่วย ----------
function part(p, w, h, d, m, x, y, z, shadow = false) {   // กล่อง unit ใช้ geometry เดียว (y = ฐาน)
  const o = new THREE.Mesh(geo('ub', () => new THREE.BoxGeometry(1, 1, 1)), m);
  o.scale.set(w, h, d); o.position.set(x, y + h / 2, z);
  o.castShadow = shadow; o.receiveShadow = true; p.add(o); return o;
}
function flat(p, w, d, m, x, y, z) {                       // แผ่นราบ (แสงบนพื้น)
  const o = new THREE.Mesh(geo('pl', () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), m);
  o.scale.set(w, 1, d); o.position.set(x, y, z); o.renderOrder = 2; p.add(o); return o;
}
function inst(g, m, list) {                                 // ของซ้ำเยอะ ๆ (เส้นถนน) → InstancedMesh
  const im = new THREE.InstancedMesh(g, m, list.length), d = new THREE.Object3D();
  list.forEach(([x, y, z], i) => { d.position.set(x, y, z); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
  im.receiveShadow = true; im.frustumCulled = false; out.add(im); return im;
}
const own = (color, emissive, k, o = {}) => new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: k, roughness: 0.5, ...o });
const poleGeo = () => geo('pole', () => new THREE.CylinderGeometry(0.05, 0.07, 3, 8).translate(0, 1.5, 0));
function glowTex(w, h, cx, cy, r, rgb) {                    // วงแสงไล่ระดับ
  return C.canvasTex(w, h, g => {
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    gr.addColorStop(0, `rgba(${rgb},0.85)`); gr.addColorStop(0.45, `rgba(${rgb},0.3)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }).tex;
}
const addMat = tex => new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0.6 });
function tileMat(base, line, rx, ry) {
  const t = C.canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.strokeStyle = line; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
  }).tex;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
}

// ---------- ยานพาหนะ (หันหน้า +x ในพิกัดของกลุ่ม) ----------
function wheel(p, r, th, x, z) {
  const o = new THREE.Mesh(geo('wh' + r + th, () => new THREE.CylinderGeometry(r, r, th, 10).rotateX(Math.PI / 2)), C.mat('#15161c', { roughness: 0.9 }));
  o.position.set(x, r, z); p.add(o); return o;
}
function beam(g, L, len, wid) {                             // แสงไฟหน้าบนถนน (กลางคืน)
  const o = flat(g, len, wid, M.beam, L / 2 + len / 2, 0.015, 0); o.visible = false; beams.push(o); return o;
}
const paintMat = c => C.mat(c, { roughness: 0.4, metalness: 0.25 });
function carLights(g, L, y, zs, parked, hw = 0.2) {         // ไฟหน้า + ไฟท้าย
  const tails = [];
  for (const z of zs) {
    part(g, 0.04, 0.1, hw, parked ? C.mat('#d9d6c8') : M.head, L / 2 + 0.01, y, z);
    tails.push(part(g, 0.04, 0.1, hw * 0.9, parked ? C.mat('#6b2a2a') : M.tail, -L / 2 - 0.01, y + 0.02, z));
  }
  return tails;
}
function makeCar(color, parked = false) {
  const g = new THREE.Group(), L = 2, body = paintMat(color);
  const paint = [part(g, L, 0.42, 1, body, 0, 0.18, 0, true)];
  part(g, 1.1, 0.36, 0.86, M.glass, -0.12, 0.6, 0, true);          // ห้องโดยสาร (กระจก)
  paint.push(part(g, 1.02, 0.07, 0.9, body, -0.12, 0.96, 0));       // หลังคา
  const wheels = [];
  for (const wx of [-0.62, 0.62]) for (const wz of [-0.47, 0.47]) wheels.push(wheel(g, 0.2, 0.16, wx, wz));
  const tails = carLights(g, L, 0.38, [-0.3, 0.3], parked);
  return { g, type: 'car', len: L, r: 0.2, wheels, paint, tails, beam: parked ? null : beam(g, L, 3, 1.5) };
}
function makeBus(color) {
  const g = new THREE.Group(), L = 4.6, Wd = 1.25, body = paintMat(color);
  const paint = [part(g, L, 1.25, Wd, body, 0, 0.22, 0, true)];
  part(g, L - 0.5, 0.42, Wd + 0.02, M.glass, 0.1, 0.82, 0);         // แถบหน้าต่าง
  part(g, 0.03, 0.55, Wd - 0.2, M.glass, L / 2 + 0.005, 0.7, 0);    // กระจกหน้า
  part(g, L - 0.2, 0.08, Wd - 0.15, C.mat('#e9edf5'), 0, 1.47, 0);  // หลังคา
  part(g, 0.04, 0.14, 0.8, M.sign, L / 2 + 0.02, 1.28, 0);          // ป้ายสาย
  const wheels = [];
  for (const wx of [-1.55, 1.55]) for (const wz of [-0.56, 0.56]) wheels.push(wheel(g, 0.27, 0.2, wx, wz));
  const tails = carLights(g, L, 0.36, [-0.45, 0.45], false, 0.24);
  return { g, type: 'bus', len: L, r: 0.27, wheels, paint, tails, beam: beam(g, L, 3.4, 1.8) };
}
function makeScooter(color) {
  const g = new THREE.Group(), L = 0.95, body = paintMat(color), dark = C.mat('#3a3d48');
  const paint = [part(g, 0.8, 0.22, 0.26, body, 0, 0.14, 0, true)];
  part(g, 0.36, 0.08, 0.24, C.mat('#20222b'), -0.12, 0.36, 0);      // เบาะ
  part(g, 0.06, 0.42, 0.06, dark, 0.34, 0.3, 0);                     // คอรถ
  part(g, 0.05, 0.05, 0.42, dark, 0.34, 0.72, 0);                    // แฮนด์
  part(g, 0.22, 0.42, 0.3, C.mat(pick(SHIRTS)), -0.1, 0.44, 0, true); // คนขี่
  const helm = new THREE.Mesh(geo('helm', () => new THREE.SphereGeometry(0.13, 10, 8)), C.mat('#f2f3f7', { roughness: 0.3 }));
  helm.position.set(-0.06, 0.98, 0); g.add(helm);
  const wheels = [wheel(g, 0.14, 0.08, -0.33, 0), wheel(g, 0.14, 0.08, 0.33, 0)];
  part(g, 0.04, 0.08, 0.1, M.head, 0.38, 0.5, 0);
  const tails = [part(g, 0.04, 0.07, 0.1, M.tail, -0.41, 0.3, 0)];
  return { g, type: 'scooter', len: L, r: 0.14, wheels, paint, tails, beam: beam(g, L, 2, 0.9) };
}

// ---------- คน / ต้นไม้ / ของตกแต่ง ----------
function person(shirt = pick(SHIRTS)) {           // หันหน้า +x · ฐานเท้าที่ y=0
  const g = new THREE.Group(), legs = [], pants = C.mat(pick(PANTS));
  for (const z of [-0.065, 0.065]) {
    const l = new THREE.Mesh(geo('leg', () => new THREE.BoxGeometry(0.09, 0.34, 0.09).translate(0, -0.17, 0)), pants);
    l.position.set(0, 0.34, z); g.add(l); legs.push(l);
  }
  const b = new THREE.Mesh(geo('torso', () => new THREE.CapsuleGeometry(0.13, 0.3, 3, 8)), C.mat(shirt));
  b.position.y = 0.62; b.castShadow = true; g.add(b);
  const h = new THREE.Mesh(geo('head', () => new THREE.SphereGeometry(0.11, 10, 8)), C.mat(pick(SKINS)));
  h.position.y = 1.01; g.add(h);
  out.add(g);
  return { g, legs };
}
function stride(pp, ph, on) {           // ท่าเดิน: ขาแกว่ง + ตัวเด้ง (คืนค่าความสูงที่เด้ง)
  const k = on ? Math.sin(ph) * 0.55 : 0;
  pp.legs[0].rotation.z = k; pp.legs[1].rotation.z = -k;
  return on ? Math.abs(Math.sin(ph)) * 0.04 : 0;
}
function tree(x, z, s) {
  const g = new THREE.Group(); g.position.set(x, GY, z); out.add(g);
  const tr = new THREE.Mesh(geo('trunk', () => new THREE.CylinderGeometry(0.1, 0.15, 1, 6).translate(0, 0.5, 0)), C.mat('#6b4a33'));
  tr.scale.set(s, s * 1.2, s); tr.castShadow = true; g.add(tr);
  const top = new THREE.Group(); top.position.y = 1.1 * s; g.add(top);
  const leaf = () => C.mat(pick(['#3f8f5a', '#2f7a4a', '#4aa36a', '#357d55']), { flatShading: true, roughness: 0.9 });
  if (rnd() < 0.3) {                    // ต้นสน
    const f = new THREE.Mesh(geo('cone', () => new THREE.ConeGeometry(0.75, 2, 7).translate(0, 1, 0)), leaf());
    f.scale.setScalar(s); f.position.y = -0.3 * s; f.castShadow = true; top.add(f);
  } else {
    const n = rnd() < 0.5 ? 1 : 2;
    for (let i = 0; i < n; i++) {
      const f = new THREE.Mesh(geo('ico', () => new THREE.IcosahedronGeometry(1, 0)), leaf());
      f.scale.setScalar(s * (0.78 - i * 0.22)); f.position.set(i * 0.25 * s, (0.5 + i * 0.65) * s, i * -0.1 * s);
      f.rotation.y = rnd() * 6; f.castShadow = true; top.add(f);
    }
  }
  sway.push({ o: top, ph: rnd() * 6, k: 0.025 + rnd() * 0.02 });
}
function bush(x, z, s, y = GY) {
  const o = new THREE.Mesh(geo('ico', () => new THREE.IcosahedronGeometry(1, 0)),
    C.mat(pick(['#3fae5e', '#2f8a4a', '#4c9c58']), { flatShading: true, roughness: 0.9 }));
  o.scale.set(s, s * 0.7, s); o.position.set(x, y + s * 0.45, z); o.rotation.y = rnd() * 6;
  o.castShadow = true; o.receiveShadow = true; out.add(o);
}
function lamp(x, z, rotY, withLight = false) {   // เสาไฟถนน แขนยื่นไปทาง +z ของกลุ่ม
  const g = new THREE.Group(); g.position.set(x, SW_Y, z); g.rotation.y = rotY; out.add(g);
  const pole = new THREE.Mesh(poleGeo(), M.pole); pole.castShadow = true; g.add(pole);
  part(g, 0.06, 0.06, 0.8, M.pole, 0, 2.94, 0.38);
  part(g, 0.24, 0.1, 0.36, M.pole, 0, 2.9, 0.78);
  part(g, 0.18, 0.03, 0.26, M.bulb, 0, 2.87, 0.78);
  const pl = flat(g, 4.2, 4.2, M.pool, 0, 0.02, 0.9); pl.visible = false; pools.push(pl);
  if (withLight) {
    const l = new THREE.PointLight('#ffd59a', 0, 10, 1.5); l.position.set(0, 2.6, 0.8); g.add(l); lights.push(l);
  }
}
function signal(x, z) {                // ไฟจราจร (ดวงไฟทะลุสองหน้า มองเห็นได้ทั้งสองฝั่ง)
  const g = new THREE.Group(); g.position.set(x, SW_Y, z); out.add(g);
  const pole = new THREE.Mesh(poleGeo(), M.pole); pole.scale.y = 0.62; pole.castShadow = true; g.add(pole);
  part(g, 0.3, 0.86, 0.3, C.mat('#1c1f27'), 0, 1.86, 0, true);
  part(g, 0.34, 0.2, 0.2, M.red, 0, 2.48, 0);
  part(g, 0.34, 0.2, 0.2, M.yel, 0, 2.22, 0);
  part(g, 0.34, 0.2, 0.2, M.grn, 0, 1.96, 0);
}

// ---------- สร้างฉาก ----------
export function setup(ctx) {
  try { build(ctx); } catch (e) { console.warn('outdoor3d setup', e); broken = true; }
}
function build(ctx) {
  C = ctx; THREE = ctx.THREE;
  out = new THREE.Group(); out.name = 'outdoor'; C.world.add(out);
  const box = (w, h, d, m, x, y, z) => C.box(w, h, d, m, x, y, z, out, false);

  M.head = own('#fffbe6', '#fff2c0', 0.5);
  M.tail = own('#ff4a4a', '#ff2020', 0.35);
  M.brake = own('#ff5a5a', '#ff2a2a', 1.6);
  M.bulb = own('#fff4d6', '#ffd98a', 0.1);
  M.sign = own('#ffb84d', '#ffb84d', 0.4);
  M.red = own('#3a1414', '#ff3b3b', 0.05);
  M.yel = own('#3a3014', '#ffc83b', 0.05);
  M.grn = own('#123a20', '#3bff7a', 0.05);
  M.glass = C.mat('#1b2740', { roughness: 0.15, metalness: 0.6 });
  M.pole = C.mat('#4a5168', { roughness: 0.5, metalness: 0.4 });
  M.beam = addMat(glowTex(128, 64, 8, 32, 120, '255,236,180'));
  M.pool = addMat(glowTex(128, 128, 64, 64, 64, '255,214,140'));

  // หญ้า (ลายตัดหญ้าเป็นแถบ)
  const gt = C.canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#2f6040'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2a573a'; g.fillRect(0, 0, w / 2, h);
    for (let i = 0; i < 50; i++) { g.fillStyle = rnd() < 0.5 ? '#377150' : '#264f36'; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
  }).tex;
  gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(ROAD_W / 2, 60);
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, 120).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: gt, roughness: 1 }));
  grass.position.set(ROAD_X, GY, 13); grass.receiveShadow = true; out.add(grass);

  // ทางเท้า + ขอบฟุตบาท + ถนน
  const tiles = ROAD_W * 142 / 170;
  box(ROAD_W, 0.18, 1.8, tileMat('#8a90a0', '#6f7585', tiles, 1.5), ROAD_X, GY, 27.4);    // ทางเท้าหน้าตึก z 26.5–28.3
  box(ROAD_W, 0.18, 1.5, tileMat('#868c9c', '#6c7282', tiles, 1.25), ROAD_X, GY, 33.85);  // ทางเท้าฝั่งตรงข้าม z 33.1–34.6
  const sideWalk = tileMat('#8a90a0', '#6f7585', 1.2, 23), lot = C.mat('#30343f', { roughness: 0.95 }), drive = C.mat('#3a3f4b', { roughness: 0.95 });
  for (let i = 0; i < MAX_OFFICES; i++) {
    const ox = i * LOT_W;
    box(1.4, 0.18, 27.5, sideWalk, 50.2 + ox, GY, 12.75);     // ทางเท้าข้างตึกขวา
    box(6.6, 0.04, 23, lot, 54.2 + ox, GY, 13.5);             // ลานจอดรถ
    box(3, 0.19, 1.8, drive, 54.2 + ox, GY, 27.4);            // ทางรถเข้าลานจอด
  }
  const curb = C.mat('#c9ccd6');
  box(ROAD_W, 0.2, 0.12, curb, ROAD_X, GY, 28.24); box(ROAD_W, 0.2, 0.12, curb, ROAD_X, GY, 33.16);
  const road = C.mat('#2a2e38', { roughness: 0.95 });
  box(ROAD_W, 0.04, 4.8, road, ROAD_X, GY, RZ);

  // เส้นจราจร
  const white = C.mat('#e9ecf2', { roughness: 0.8 }), yellow = C.mat('#f2c94c', { roughness: 0.8 });
  const LY = RD_Y + 0.005;
  box(ROAD_W, 0.01, 0.08, white, ROAD_X, RD_Y, 28.55); box(ROAD_W, 0.01, 0.08, white, ROAD_X, RD_Y, 32.85);
  const dashes = [];
  for (let x = -45; x < 95 + EXTRA; x += 2.6) if (Math.abs(x - CROSS_X) > 2.6) dashes.push([x, LY, RZ]);
  inst(new THREE.BoxGeometry(1.3, 0.01, 0.1), yellow, dashes);                                  // เส้นกลางถนนประ
  inst(new THREE.BoxGeometry(2.2, 0.01, 0.36), white, Array.from({ length: 7 }, (_, i) => [CROSS_X, LY, 28.75 + i * 0.62])); // ทางม้าลาย
  box(0.14, 0.01, 2.3, white, CROSS_X - 1.75, RD_Y, 29.5); box(0.14, 0.01, 2.3, white, CROSS_X + 1.75, RD_Y, 31.9); // เส้นหยุด
  const stalls = [];
  for (let o = 0; o < MAX_OFFICES; o++) for (let i = 0; i < 14; i++) for (const x of [52.2, 56.2]) stalls.push([x + o * LOT_W, LY, 3 + i * 1.6]);
  inst(new THREE.BoxGeometry(2.2, 0.01, 0.07), white, stalls);                                  // ช่องจอดรถ

  // รถจอดในลาน
  for (let o = 0; o < MAX_OFFICES; o++) for (const [i, row] of [[1, 0], [2, 1], [5, 0], [8, 1], [11, 0]]) {
    const c = makeCar(pick(CAR_COLS), true);
    c.g.position.set((row ? 56.2 : 52.2) + o * LOT_W, RD_Y, 3.8 + i * 1.6); c.g.rotation.y = row ? 0 : Math.PI; out.add(c.g);
  }

  // รถวิ่ง: เลน 0 → +x (ชิดซ้ายแบบไทย) · เลน 1 → -x · s = ระยะตามทิศของเลน (x * dir)
  lanes.push({ dir: 1, z: 29.5, stopS: CROSS_X - 1.75, vs: [] }, { dir: -1, z: 31.9, stopS: -(CROSS_X + 1.75), vs: [] });
  const spec = [[0, 'car'], [0, 'car'], [0, 'bus'], [0, 'car'], [1, 'car'], [1, 'scooter'], [1, 'car']];
  for (let round = 0; round < 3; round++) for (const [li, type] of spec) {   // ถนนยาวขึ้น จึงเพิ่มรถตาม
    const v = type === 'bus' ? makeBus(pick(['#ffd166', '#3ddc97', '#5ce1ff'])) : type === 'scooter' ? makeScooter(pick(CAR_COLS)) : makeCar(pick(CAR_COLS));
    Object.assign(v, { s: 0, v: 0, decCyc: -1, stop: false, served: false, dwell: 0, braking: false,
      cruise: type === 'bus' ? 3.2 : type === 'scooter' ? 4.6 : 3.6 + rnd() * 2.4 });
    const ln = lanes[li];
    v.g.position.set(0, RD_Y, ln.z); v.g.rotation.y = ln.dir > 0 ? 0 : Math.PI; out.add(v.g);
    ln.vs.push(v);
  }
  for (const ln of lanes) {
    const sMin = ln.dir > 0 ? XS : -XE, n = ln.vs.length;
    ln.vs.forEach((v, k) => { v.s = sMin + (k + 0.15 + rnd() * 0.3) / n * LOOP; v.v = v.cruise; v.g.position.x = v.s * ln.dir; });
  }

  // ไฟจราจร + เสาไฟถนน (ไฟจริงแค่ 2 ดวง ที่ทางม้าลายกับป้ายรถเมล์)
  signal(CROSS_X - 2.1, 28.1); signal(CROSS_X + 2.1, 33.3);
  for (let o = 0; o < MAX_OFFICES; o++) {
    const ox = o * LOT_W;
    for (const x of [2, 12, 25, 38, 47]) lamp(x + ox, 28.08, 0, !o && (x === 25 || x === 38));
    for (const x of [6, 17, 31, 43]) lamp(x + ox, 33.32, Math.PI);
    for (const z of [8, 18]) lamp(50.75 + ox, z, Math.PI / 2);
  }

  // ป้ายรถเมล์ (หลังคายื่น ไม่มีเสาหน้า คนเดินลอดได้)
  const roof = C.mat('#3a4560', { roughness: 0.5, metalness: 0.3 });
  part(out, 2.8, 0.08, 1.0, roof, BUS_X, SW_Y + 2.0, 27.1, true);
  for (const dx of [-1.3, 1.3]) part(out, 0.07, 2.0, 0.07, M.pole, BUS_X + dx, SW_Y, 26.64);
  part(out, 2.6, 1.6, 0.04, new THREE.MeshStandardMaterial({ color: '#9cc0ff', transparent: true, opacity: 0.25, depthWrite: false, roughness: 0.1 }), BUS_X, SW_Y + 0.3, 26.62);
  const wood = C.mat('#a8754a');
  part(out, 2.0, 0.07, 0.4, wood, BUS_X, SW_Y + 0.42, 26.86, true);
  for (const dx of [-0.8, 0.8]) part(out, 0.06, 0.42, 0.34, M.pole, BUS_X + dx, SW_Y, 26.86);
  const bt = C.canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#2f6bff'; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 20); g.fill();
    g.fillStyle = '#ffffff'; g.font = '700 46px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('BUS', w / 2, h / 2 + 2);
  }).tex;
  M.busSign = new THREE.MeshStandardMaterial({ map: bt, emissive: '#ffffff', emissiveMap: bt, emissiveIntensity: 0.25, roughness: 0.6 });
  part(out, 0.05, 2.2, 0.05, M.pole, BUS_X + 1.8, SW_Y, 28.02);
  part(out, 0.5, 0.5, 0.05, M.busSign, BUS_X + 1.8, SW_Y + 1.75, 28.02);
  const sitter = person();                          // คนนั่งรอรถเมล์ (หันหน้าเข้าถนน)
  sitter.g.position.set(BUS_X - 0.45, SW_Y + 0.15, 26.86); sitter.g.rotation.y = -Math.PI / 2;
  for (const l of sitter.legs) l.rotation.z = Math.PI / 2;

  // ม้านั่งฝั่งตรงข้าม + ของจุกจิกบนทางเท้า
  part(out, 1.6, 0.07, 0.42, wood, 12, GY + 0.4, 35.05, true);
  part(out, 1.6, 0.4, 0.06, wood, 12, GY + 0.5, 35.25, true);
  for (const dx of [-0.65, 0.65]) part(out, 0.06, 0.4, 0.36, M.pole, 12 + dx, GY, 35.05);
  C.cyl(0.1, 0.11, 0.38, C.mat('#e84a5f'), 8.5, SW_Y, 28.02, out, 10);           // หัวดับเพลิง
  C.cyl(0.06, 0.06, 0.06, C.mat('#f2f3f7'), 8.5, SW_Y + 0.38, 28.02, out, 8);
  C.cyl(0.2, 0.17, 0.55, C.mat('#3d7a5a'), 29.5, SW_Y, 28.0, out, 10);           // ถังขยะ
  for (const x of [6, 15, 28, 42]) {                                              // กระถางต้นไม้ชิดตึก
    part(out, 0.9, 0.35, 0.5, C.mat('#5a5f70'), x, SW_Y, 26.85, true);
    bush(x, 26.85, 0.36, SW_Y + 0.25);
  }

  // ต้นไม้ + พุ่มไม้รอบตึก
  for (let x = -20; x < XE; x += 6.5) { const tx = x + rnd() * 2; if (Math.abs(tx - 12) > 1.6) tree(tx, 36.4 + rnd() * 2.5, 0.85 + rnd() * 0.45); }
  for (const [x, z] of [[-3, 4], [-5.5, 9], [-2.8, 15], [-6, 20], [-3.5, 24.5]]) tree(x + rnd(), z, 0.9 + rnd() * 0.4);
  for (let i = 0; i < 8; i++) bush(-15 + i * 10 + rnd() * 4, 35.2 + rnd() * 0.4, 0.4 + rnd() * 0.25);
  for (let i = 0; i < 5; i++) bush(-1.3, 2 + i * 5.2 + rnd() * 2, 0.4 + rnd() * 0.2);
  for (let o = 0; o < MAX_OFFICES; o++) {
    const ox = o * LOT_W;
    for (let x = 3; x < 49; x += 7.5) tree(x + ox + rnd() * 2, -3 - rnd() * 3, 0.9 + rnd() * 0.5);
    for (const z of [4, 11, 18, 24]) tree(59.5 + ox + rnd(), z, 0.9 + rnd() * 0.4);
    for (let i = 0; i < 5; i++) bush(58.2 + ox, 3 + i * 5 + rnd() * 2, 0.35 + rnd() * 0.2);
  }

  // คนเดินบนทางเท้า (สองฝั่ง สวนกัน)
  for (const [z, dir, n] of [[27.7, 1, 6], [27.25, -1, 6], [33.65, 1, 3], [34.1, -1, 6]]) {
    for (let i = 0; i < n; i++) walkers.push({ p: person(), z, dir, x: XS + rnd() * LOOP, sp: 0.7 + rnd() * 0.45, ph: rnd() * 6 });
  }
  // คนข้ามทางม้าลายตอนไฟแดง (สองคน เดินสวนกัน)
  crossers.push({ p: person(), x: CROSS_X - 0.4, k: 0 }, { p: person(), x: CROSS_X + 0.4, k: 1 });

  // ฝูงนก (กลางวัน)
  flock = new THREE.Group(); out.add(flock);
  const bm = C.mat('#2a2d36');
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Group(); b.position.set(-i * 0.55, Math.sin(i) * 0.3, (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.45); flock.add(b);
    part(b, 0.26, 0.08, 0.1, bm, 0, 0, 0, true);
    const wl = new THREE.Mesh(geo('wingL', () => new THREE.BoxGeometry(0.16, 0.02, 0.34).translate(0, 0, 0.17)), bm);
    const wr = new THREE.Mesh(geo('wingR', () => new THREE.BoxGeometry(0.16, 0.02, 0.34).translate(0, 0, -0.17)), bm);
    wl.position.y = wr.position.y = 0.06; b.add(wl, wr);
    birds.push({ wl, wr, ph: i * 0.9 });
  }
}

// ---------- กลางวัน / กลางคืน ----------
function setNight(n) {
  nightNow = n;
  M.head.emissiveIntensity = n ? 3.2 : 0.5;
  M.tail.emissiveIntensity = n ? 1.6 : 0.35;
  M.brake.emissiveIntensity = n ? 3.6 : 1.6;
  M.bulb.emissiveIntensity = n ? 3.4 : 0.1;
  M.sign.emissiveIntensity = n ? 1.6 : 0.4;
  M.busSign.emissiveIntensity = n ? 1.1 : 0.25;
  for (const o of beams) o.visible = n;
  for (const o of pools) o.visible = n;
  for (const l of lights) l.intensity = n ? 16 : 0;
  setSignal(lastPh);
}
function setSignal(ph) {
  lastPh = ph;
  const on = nightNow ? 3.4 : 2.2;
  M.red.emissiveIntensity = ph === 'R' ? on : 0.05;
  M.yel.emissiveIntensity = ph === 'Y' ? on : 0.05;
  M.grn.emissiveIntensity = ph === 'G' ? on : 0.05;
}

// ---------- รถวิ่ง: ตามคันหน้า · หยุดไฟแดง · รถเมล์จอดป้าย ----------
function drive(ln, ph, cyc, dt) {
  const sMin = ln.dir > 0 ? XS : -XE;
  for (const v of ln.vs) {
    const front = v.s + v.len / 2;
    let vt = v.cruise;
    const lim = d => { vt = Math.min(vt, Math.sqrt(2 * DEC * Math.max(0, d))); };   // ความเร็วที่ยังเบรกทันในระยะ d
    let gap = Infinity;                              // ระยะถึงท้ายคันหน้า (วนรอบ)
    for (const o of ln.vs) if (o !== v) gap = Math.min(gap, ((o.s - v.s) % LOOP + LOOP) % LOOP - (o.len + v.len) / 2);
    if (gap < Infinity) lim(gap - 0.8);
    if (ph !== 'G') {                                // ตัดสินใจครั้งเดียวต่อรอบไฟ: หยุดหรือไปต่อ
      const d = ln.stopS - 0.15 - front;
      if (v.decCyc !== cyc) { v.decCyc = cyc; v.stop = ph === 'R' ? d > -0.3 : d > 0.2 && v.v * v.v / (2 * DEC) < d + 0.4; }
      if (v.stop) lim(d);
    }
    if (v.type === 'bus' && !v.served && ln.dir > 0) {   // รถเมล์จอดรับคนที่ป้าย 3 วิ
      const d = BUS_X + 1.9 - front;
      if (d > -1) { lim(d); if (d < 0.25 && v.v < 0.05 && (v.dwell += dt) > 3) v.served = true; }
    }
    v.v = vt < v.v ? vt : Math.min(vt, v.v + ACC * dt);
    v.s += v.v * dt;
    if (v.s > sMin + LOOP) {                         // วนกลับต้นถนน (นอกจอ) + สุ่มสีใหม่
      v.s -= LOOP; v.decCyc = -1; v.served = false; v.dwell = 0;
      if (v.type === 'car') { const m = paintMat(pick(CAR_COLS)); for (const p of v.paint) p.material = m; }
    }
    v.g.position.x = v.s * ln.dir;
    for (const w of v.wheels) w.rotation.z -= v.v * dt / v.r;
    const br = vt < v.cruise * 0.7 || v.v < 0.3;      // ไฟเบรก
    if (br !== v.braking) { v.braking = br; for (const tl of v.tails) tl.material = br ? M.brake : M.tail; }
  }
}

// ---------- ทุกเฟรม ----------
export function update(t, now) {
  if (!out || broken) return;
  try { tick(t); } catch (e) { console.warn('outdoor3d update', e); broken = true; }
}
function tick(t) {
  const dt = lastT == null ? 0 : clamp(t - lastT, 0, 0.1); lastT = t;
  const night = !!C.isNight();
  if (night !== nightNow) setNight(night);
  const cp = t % CYCLE, cyc = Math.floor(t / CYCLE);
  const ph = cp < T_YEL ? 'G' : cp < T_RED ? 'Y' : 'R';
  if (ph !== lastPh) setSignal(ph);
  for (const ln of lanes) drive(ln, ph, cyc, dt);

  for (const w of walkers) {
    w.x += w.dir * w.sp * dt; w.ph += w.sp * dt * 7;
    if (w.x > XE) w.x -= LOOP; else if (w.x < XS) w.x += LOOP;
    w.p.g.position.set(w.x, SW_Y + stride(w.p, w.ph, true), w.z);
    w.p.g.rotation.y = w.dir > 0 ? 0 : Math.PI;
  }
  for (const c of crossers) {                        // ข้ามช่วงไฟแดงของรถ แล้วรอฝั่งตรงข้ามจนรอบหน้า
    const near = (cyc + c.k) % 2 === 0, z0 = near ? 27.6 : 33.9, z1 = near ? 33.9 : 27.6;
    const u = clamp((cp - 12) / 5.2, 0, 1), z = lerp(z0, z1, u), on = u > 0 && u < 1;
    const y = z > 28.3 && z < 33.1 ? RD_Y : SW_Y;
    c.p.g.position.set(c.x, y + stride(c.p, t * 7, on), z);
    c.p.g.rotation.y = (u < 1 ? z1 > z0 : z0 > z1) ? -Math.PI / 2 : Math.PI / 2;
  }
  for (const s of sway) { s.o.rotation.z = Math.sin(t * 0.9 + s.ph) * s.k; s.o.rotation.x = Math.sin(t * 0.7 + s.ph * 1.3) * s.k * 0.6; }

  const u = (t % 55) / 34;                           // นกบินผ่านเป็นช่วง ๆ
  flock.visible = !night && u <= 1;
  if (flock.visible) {
    flock.position.set(lerp(-25, 70, u), 7 + Math.sin(u * 9) * 0.6, lerp(38, -12, u));
    flock.rotation.y = Math.atan2(50, 95);
    for (const b of birds) { const a = Math.sin(t * 11 + b.ph) * 0.7; b.wl.rotation.x = -a; b.wr.rotation.x = a; }
  }
}
