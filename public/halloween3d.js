// ของตกแต่งฮาโลวีนในออฟฟิศ 3D — office3d.js เรียก setup() ครั้งเดียว, decorate() ต่อตึก และ update() ทุกเฟรม
// แต่ละตึกมี ฟักทองหน้าเรืองแสง · ไฟประดับ · ใยแมงมุม · หลุมศพ · หม้อยาแม่มด · ผี · ค้างคาว · ป้ายอวยพร
// ตัวแปร spooky, PUMPKINS, W, T อยู่ใน index.html

let THREE, C, shared = null;
const decos = [];   // { group, root, ghosts, bats, bubbles }

function buildShared() {
  // ฟักทอง: ทรงกลมที่ดันผิวเป็นพู แล้วบีบให้เตี้ยลง
  const body = new THREE.SphereGeometry(1, 28, 18), p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 0.92 + 0.1 * Math.abs(Math.cos(4 * Math.atan2(p.getZ(i), p.getX(i))));
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * 0.8, p.getZ(i) * k);
  }
  body.computeVertexNormals();
  const faceTex = C.canvasTex(128, 96, g => {
    g.fillStyle = '#fff';
    const tri = (x1, y1, x2, y2, x3, y3) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineTo(x3, y3); g.closePath(); g.fill(); };
    tri(26, 42, 52, 42, 39, 16); tri(76, 42, 102, 42, 89, 16); tri(56, 56, 72, 56, 64, 42);
    g.beginPath(); g.moveTo(20, 60); g.lineTo(38, 70); g.lineTo(46, 62); g.lineTo(58, 74); g.lineTo(70, 62); g.lineTo(82, 74); g.lineTo(90, 62); g.lineTo(108, 60);
    g.lineTo(94, 86); g.lineTo(34, 86); g.closePath(); g.fill();
  }).tex;
  const web = C.canvasTex(256, 256, g => {
    g.strokeStyle = 'rgba(235,235,255,0.85)'; g.lineWidth = 2;
    for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI / 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 250, Math.sin(a) * 250); g.stroke(); }
    for (const rad of [50, 95, 145, 200]) {
      g.beginPath();
      for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI / 2; const k = i % 2 ? rad * 0.93 : rad; g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * k, Math.sin(a) * k); }
      g.stroke();
    }
  }).tex;
  const rip = C.canvasTex(128, 128, g => {
    g.fillStyle = '#3a3f4b'; g.font = '700 42px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('RIP', 64, 56);
    g.fillRect(34, 86, 60, 5);
  }).tex;
  const banner = C.canvasTex(512, 96, (g, w, h) => {
    g.fillStyle = 'rgba(28,10,44,0.92)'; g.beginPath(); g.roundRect(6, 10, w - 12, h - 20, 18); g.fill();
    g.shadowColor = '#ff8a1f'; g.shadowBlur = 16; g.strokeStyle = '#ff8a1f'; g.lineWidth = 4; g.stroke();
    g.fillStyle = '#ffd9a8'; g.font = '700 38px "Pixelify Sans", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('HAPPY HALLOWEEN', w / 2, h / 2 + 2);
  }).tex;
  const ghostShape = new THREE.LatheGeometry([[0.36, 0], [0.34, 0.08], [0.37, 0.16], [0.36, 0.55], [0.31, 0.85], [0.17, 1.02], [0, 1.08]].map(([x, y]) => new THREE.Vector2(x, y)), 18);
  return {
    pumpkinBody: body, faceTex, web, rip, banner, ghostShape,
    faceM: new THREE.MeshBasicMaterial({ map: faceTex, transparent: true, color: '#ffb347', depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
    pumpkinM: C.mat('#e8791e', { roughness: 0.55 }), stemM: C.mat('#4e7a3a', { roughness: 0.8 }),
    webM: new THREE.MeshBasicMaterial({ map: web, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.8 }),
    ghostM: new THREE.MeshStandardMaterial({ color: '#f4f4ff', transparent: true, opacity: 0.72, depthWrite: false, emissive: '#b9c4ff', emissiveIntensity: 0.35 }),
    batM: C.mat('#17131f', { roughness: 0.7 }),
    ball: new THREE.SphereGeometry(1, 12, 10), cube: new THREE.BoxGeometry(1, 1, 1),
    stem: new THREE.CylinderGeometry(0.1, 0.16, 0.3, 7), face: new THREE.PlaneGeometry(1.3, 1),
    bulbs: new THREE.SphereGeometry(0.07, 8, 6),
  };
}

function mesh(parent, g, m, x, y, z, sx = 1, sy = sx, sz = sx, shadow = false) {
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = shadow; parent.add(o); return o;
}
function pumpkin(parent, x, y, z, s) {
  const g = new THREE.Group(); g.position.set(x, y + 0.8 * s, z); g.scale.setScalar(s); parent.add(g);
  mesh(g, shared.pumpkinBody, shared.pumpkinM, 0, 0, 0, 1, 1, 1, true);
  mesh(g, shared.stem, shared.stemM, 0, 0.88, 0);
  mesh(g, shared.face, shared.faceM, 0, 0.02, 1.04);
}
function lights(parent, list, color) {
  const im = new THREE.InstancedMesh(shared.bulbs, new THREE.MeshBasicMaterial({ color, toneMapped: false }), list.length), d = new THREE.Object3D();
  list.forEach(([x, y, z], i) => { d.position.set(x, y, z); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
  im.frustumCulled = false; parent.add(im);
}
function makeGhost(parent) {
  const g = new THREE.Group(); parent.add(g); g.scale.setScalar(1.15);
  mesh(g, shared.ghostShape, shared.ghostM, 0, 0, 0);
  const black = C.mat('#14121c', { roughness: 0.3 });
  for (const x of [-0.12, 0.12]) mesh(g, shared.ball, black, x, 0.72, 0.28, 0.05, 0.07, 0.03);
  mesh(g, shared.ball, black, 0, 0.55, 0.32, 0.05, 0.06, 0.025);
  return g;
}
function makeBat(parent) {
  const g = new THREE.Group(); parent.add(g);
  mesh(g, shared.ball, shared.batM, 0, 0, 0, 0.13, 0.08, 0.08);
  mesh(g, shared.ball, shared.batM, 0.13, 0.03, 0, 0.06);
  const wings = [];
  for (const side of [-1, 1]) {
    const w = new THREE.Group(); w.position.z = side * 0.05; g.add(w);
    mesh(w, shared.cube, shared.batM, 0, 0, side * 0.2, 0.2, 0.012, 0.4);
    mesh(w, shared.cube, shared.batM, -0.05, 0, side * 0.3, 0.13, 0.012, 0.22);
    wings.push({ w, side });
  }
  return { g, wings };
}

export function setup(ctx) {
  try { C = ctx; THREE = ctx.THREE; shared = buildShared(); }
  catch (e) { console.warn('halloween3d setup', e); shared = null; }
}

export function decorate(group) {
  if (!shared) return;
  const root = new THREE.Group(); group.add(root);
  for (const [x, z, y, s] of PUMPKINS) pumpkin(root, x, y, z, s);

  // ไฟประดับสองสี: ผนังหลังกับราวกระจกริมทางเดิน
  const orange = [], purple = [];
  const string = (x0, x1, step, y, z) => {
    for (let x = x0, i = 0; x <= x1; x += step, i++) (i % 2 ? purple : orange).push([x, y - Math.abs(Math.sin(i * 0.8)) * 0.12, z]);
  };
  string(1.4, 47.6, 1.1, 2.72, 2.08);
  string(1.2, 38.8, 1.3, 1.62, 11.34);
  string(1.2, 38.8, 1.3, 1.62, 14.66);
  lights(root, orange, '#ff8a1f'); lights(root, purple, '#b06cff');

  // ใยแมงมุมตามหน้าต่าง
  for (const [x, y, z, rot] of [[13.1, 2.1, 2.05, 0], [24.9, 2.1, 2.05, Math.PI / 2], [41.1, 2.1, 2.05, 0], [46.9, 2.1, 2.05, Math.PI / 2]]) {
    const m = mesh(root, new THREE.PlaneGeometry(1.2, 1.2), shared.webM, x, y, z);
    m.rotation.z = -rot;
  }

  // หลุมศพข้างตึก
  const stone = C.mat('#8b8f9c', { roughness: 0.95 });
  const ripM = new THREE.MeshBasicMaterial({ map: shared.rip, transparent: true, depthWrite: false });
  for (const [x, z, tilt] of [[-2.4, 6, 0.05], [-3.4, 11, -0.08], [-2.3, 16.5, 0.1], [-3.1, 22, -0.04]]) {
    const g = new THREE.Group(); g.position.set(x, -0.36, z); g.rotation.z = tilt; root.add(g);
    mesh(g, shared.cube, stone, 0, 0.45, 0, 0.8, 0.9, 0.2, true);
    mesh(g, new THREE.CylinderGeometry(0.4, 0.4, 0.2, 18), stone, 0, 0.9, 0).rotation.x = Math.PI / 2;
    mesh(g, new THREE.PlaneGeometry(0.62, 0.62), ripM, 0, 0.72, 0.105);
  }

  // หม้อยาแม่มดกลางห้อง Think Tank
  const pot = C.mat('#20202a', { roughness: 0.35, metalness: 0.6 });
  mesh(root, shared.ball, pot, 25, 0.48, 20, 0.62, 0.5, 0.62, true);
  mesh(root, new THREE.TorusGeometry(0.5, 0.06, 8, 24), pot, 25, 0.86, 20).rotation.x = Math.PI / 2;
  const brew = new THREE.MeshBasicMaterial({ color: '#7cff6b', toneMapped: false });
  mesh(root, new THREE.CircleGeometry(0.47, 24), brew, 25, 0.87, 20).rotation.x = -Math.PI / 2;
  const bubbles = [];
  for (let i = 0; i < 5; i++) bubbles.push({ m: mesh(root, shared.ball, brew, 25, 0.9, 20, 0.05), ph: i * 1.3, x: Math.cos(i * 2.1) * 0.25, z: Math.sin(i * 2.1) * 0.25 });

  // ป้ายอวยพรเหนือป้ายชื่อตึก
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: shared.banner, toneMapped: false }));
  sign.scale.set(7, 7 * 96 / 512, 1); sign.position.set(W / T / 2, 5.3, 1.9); root.add(sign);

  const ghosts = [0, 1, 2].map(i => ({ g: makeGhost(root), ph: i * 2.2, sp: 0.09 + i * 0.03, z: 12.3 + i * 0.7 }));
  const bats = [0, 1, 2, 3, 4].map(i => ({ ...makeBat(root), ph: i * 1.25, r: 18 + i * 1.7, sp: 0.32 + i * 0.05 }));
  decos.push({ group, root, ghosts, bats, bubbles });
}

export function forget(group) {
  const i = decos.findIndex(d => d.group === group);
  if (i >= 0) decos.splice(i, 1);
}

export function update(t) {
  if (!shared) return;
  shared.faceM.opacity = 0.82 + Math.sin(t * 11) * 0.08 + Math.sin(t * 23) * 0.06;  // เปลวเทียนสั่นไหว
  const cx = W / T / 2;
  for (const d of decos) {
    d.root.visible = spooky;
    if (!spooky) continue;
    for (const g of d.ghosts) {                 // ผีลอยไปมาตามทางเดิน
      const k = Math.sin(t * g.sp + g.ph);
      g.g.position.set(20 + k * 17, 0.25 + Math.sin(t * 1.7 + g.ph) * 0.14, g.z);
      g.g.rotation.y = Math.cos(t * g.sp + g.ph) > 0 ? 0.7 : -0.7;
    }
    for (const b of d.bats) {                   // ค้างคาวบินวนเหนือตึก
      const a = t * b.sp + b.ph, x = Math.cos(a), z = Math.sin(a);
      b.g.position.set(cx + x * b.r * 1.15, 3.9 + Math.sin(t * 2 + b.ph) * 0.4, 13 + z * b.r * 0.6);
      b.g.rotation.y = Math.atan2(-x, -z) + Math.PI / 2;
      const flap = Math.sin(t * 14 + b.ph) * 0.6;
      for (const w of b.wings) w.w.rotation.x = w.side * flap;
    }
    for (const b of d.bubbles) {                // ฟองยาในหม้อ
      const u = (t * 0.6 + b.ph) % 1;
      b.m.position.set(25 + b.x, 0.9 + u * 0.55, 20 + b.z);
      b.m.scale.setScalar(0.03 + u * 0.05);
    }
  }
}
