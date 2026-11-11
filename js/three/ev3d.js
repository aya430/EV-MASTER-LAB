// Procedural 3D models (no external assets needed): electric car with full powertrain, battery packs,
// PMSM / induction motors. Viewer with orbit controls, view presets, picking, transparent / X-ray / exploded modes.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export { THREE };
const MAT = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, metalness: 0.35, roughness: 0.45 }, o));

export class Viewer {
  constructor(host, o = {}) {
    this.host = host;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    host.append(r.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 500);
    this.home = o.cam || [5.5, 2.6, 5.5];
    this.target = new THREE.Vector3(...(o.target || [0, 0.5, 0]));
    this.camera.position.set(...this.home);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.target.copy(this.target); this.controls.enableDamping = true; this.controls.maxPolarAngle = Math.PI * 0.495;
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xbfd9ff, 0x1a2238, 1.25));
    const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(5, 9, 6); d.castShadow = true; d.shadow.mapSize.set(1024, 1024);
    Object.assign(d.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 }); s.add(d);
    const d2 = new THREE.DirectionalLight(0x22d3ee, 0.6); d2.position.set(-6, 3, -4); s.add(d2);
    if (o.floor !== false) {
      const floor = new THREE.Mesh(new THREE.CircleGeometry(o.floorR || 9, 64), new THREE.MeshStandardMaterial({ color: 0x0d1830, roughness: 0.9, metalness: 0.1 }));
      floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.add(floor); this.floor = floor;
      const grid = new THREE.GridHelper(18, 36, 0x1e3a6b, 0x15284a); grid.position.y = 0.002; s.add(grid); this.grid = grid;
    }
    this.ray = new THREE.Raycaster(); this.pickables = []; this.onPick = null;
    r.domElement.addEventListener('pointerdown', e => { this._down = [e.clientX, e.clientY]; });
    r.domElement.addEventListener('pointerup', e => {
      if (!this._down || Math.hypot(e.clientX - this._down[0], e.clientY - this._down[1]) > 4 || !this.onPick) return;
      const rc = r.domElement.getBoundingClientRect();
      this.ray.setFromCamera(new THREE.Vector2((e.clientX - rc.left) / rc.width * 2 - 1, -(e.clientY - rc.top) / rc.height * 2 + 1), this.camera);
      const hit = this.ray.intersectObjects(this.pickables, true).find(x => x.object.visible && findComp(x.object));
      this.onPick(hit ? findComp(hit.object) : null);
    });
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(host);
    this.resize();
  }
  resize() { const w = this.host.clientWidth, h = this.host.clientHeight || 400; this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  render() { this.controls.update(); this.renderer.render(this.scene, this.camera); }
  view(name) {
    const D = this.home.length ? Math.hypot(...this.home) : 8, t = this.target;
    const P = { front: [D, t.y + 0.4, 0.001], rear: [-D, t.y + 0.4, 0.001], side: [0.001, t.y + 0.4, D], top: [0.001, D, 0.002], iso: this.home };
    this.camera.position.set(...(P[name] || this.home)); this.controls.target.copy(t);
  }
  zoom(f) { const v = this.camera.position.clone().sub(this.controls.target); v.multiplyScalar(1 / f); this.camera.position.copy(this.controls.target.clone().add(v)); }
  dispose() { this.ro.disconnect(); this.controls.dispose(); this.renderer.dispose(); this.scene.traverse(o => { o.geometry && o.geometry.dispose(); }); this.renderer.domElement.remove(); }
}
function findComp(o) { while (o) { if (o.userData && o.userData.comp) return o.userData.comp; o = o.parent; } return null; }
function tag(obj, comp) { obj.userData.comp = comp; obj.traverse(c => { if (c.isMesh) { c.castShadow = true; c.userData.baseMat = c.material; } }); return obj; }

/* ------------------------------------------------------------------ car ------------------------------------------------------------------ */
export function buildCar(o = {}) {
  const car = new THREE.Group(); const parts = {}; const L = 4.4, W = 1.85, wr = 0.33, wb = 2.75;
  const bodyCol = o.color || 0x2563eb;
  // body: lower body (to the beltline) as a smooth extruded side profile, greenhouse as tinted glass + roof
  const sh = new THREE.Shape();
  sh.moveTo(-2.18, 0.30);
  sh.quadraticCurveTo(-2.32, 0.42, -2.26, 0.72);           // rear bumper
  sh.quadraticCurveTo(-2.2, 0.95, -1.75, 0.98);            // boot lid
  sh.lineTo(1.2, 0.98);                                     // beltline
  sh.quadraticCurveTo(1.9, 0.9, 2.16, 0.76);               // bonnet
  sh.quadraticCurveTo(2.32, 0.6, 2.24, 0.36);              // nose
  sh.lineTo(1.85, 0.30);
  sh.absarc(wb / 2, 0.32, 0.43, 0.05, Math.PI - 0.05, false);
  sh.lineTo(-wb / 2 + 0.43, 0.30);
  sh.absarc(-wb / 2, 0.32, 0.43, 0.05, Math.PI - 0.05, false);
  sh.lineTo(-2.18, 0.30);
  const bodyGeo = new THREE.ExtrudeGeometry(sh, { depth: W - 0.16, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.07, bevelSegments: 5, curveSegments: 28 });
  bodyGeo.translate(0, 0, -(W - 0.16) / 2);
  const bodyMat = MAT(bodyCol, { metalness: 0.75, roughness: 0.22, transparent: true, opacity: 1 });
  const body = new THREE.Mesh(bodyGeo, bodyMat); body.castShadow = true; car.add(body); parts.body = tag(body, 'body');
  // greenhouse (tinted glass) and roof panel
  const gs = new THREE.Shape(); gs.moveTo(-1.62, 0.98); gs.quadraticCurveTo(-1.2, 1.38, -0.55, 1.44); gs.lineTo(0.35, 1.45); gs.quadraticCurveTo(0.85, 1.38, 1.22, 0.98); gs.lineTo(-1.62, 0.98);
  const gg = new THREE.ExtrudeGeometry(gs, { depth: W - 0.34, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3 }); gg.translate(0, 0, -(W - 0.34) / 2);
  const glass = new THREE.Mesh(gg, new THREE.MeshPhysicalMaterial({ color: 0x0b1b33, transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.6 })); car.add(glass); parts.glass = glass;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.03, W - 0.36), bodyMat); roof.position.set(-0.12, 1.475, 0); car.add(roof); parts.roof = roof;
  for (const z of [-1, 1]) { const sill = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.07, 0.05), MAT(0x111827, { metalness: 0.5 })); sill.position.set(0.05, 0.36, z * (W / 2 - 0.02)); car.add(sill); }
  // lights
  const hl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1.45), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xdff6ff, emissiveIntensity: 1.2 })); hl.position.set(2.2, 0.74, 0); hl.rotation.z = -0.5; car.add(hl);
  const tl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 1.5), new THREE.MeshStandardMaterial({ color: 0xff2244, emissive: 0xff0022, emissiveIntensity: 0.9 })); tl.position.set(-2.27, 0.84, 0); car.add(tl); parts.tail = tl;
  // wheels
  parts.wheels = [];
  for (const [x, z] of [[wb / 2, W / 2 - 0.05], [wb / 2, -W / 2 + 0.05], [-wb / 2, W / 2 - 0.05], [-wb / 2, -W / 2 + 0.05]]) {
    const wg = new THREE.Group();
    const tyre = new THREE.Mesh(new THREE.TorusGeometry(wr - 0.08, 0.09, 16, 40), MAT(0x111318, { roughness: 0.9, metalness: 0 }));
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(wr - 0.11, wr - 0.11, 0.18, 28), MAT(0xb8c2d0, { metalness: 0.9, roughness: 0.25 })); rim.rotation.x = Math.PI / 2;
    const spokes = new THREE.Group(); for (let k = 0; k < 5; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.2), MAT(0x6b7686, { metalness: 0.9 })); sp.rotation.z = k * Math.PI * 2 / 5; spokes.add(sp); }
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 24), MAT(0x8a8f99, { metalness: 0.8 })); disc.rotation.x = Math.PI / 2; disc.position.z = z > 0 ? -0.1 : 0.1;
    const spin = new THREE.Group(); spin.add(tyre, rim, spokes, disc);
    wg.add(spin); wg.position.set(x, wr, z); wg.userData.spin = spin; car.add(wg); parts.wheels.push(tag(wg, 'wheel'));
  }
  // -------- powertrain --------
  const pt = new THREE.Group(); car.add(pt); parts.pt = pt;
  const comp = (name, mesh, pos, explode) => { mesh.position.set(...pos); mesh.userData.home = new THREE.Vector3(...pos); mesh.userData.explode = new THREE.Vector3(...explode); pt.add(tag(mesh, name)); parts[name] = mesh; return mesh; };
  // battery pack with modules
  const pack = new THREE.Group();
  const casing = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.14, 1.45), MAT(0x334155, { metalness: 0.7, roughness: 0.4, transparent: true, opacity: 0.55 })); pack.add(casing);
  const modMat = MAT(0x16a34a, { metalness: 0.3, emissive: 0x052e16, emissiveIntensity: 0.6 });
  for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.11, 0.62), modMat); m.position.set(-1.05 + i * 0.42, 0, -0.34 + j * 0.68); pack.add(m); }
  comp('battery', pack, [0.0, 0.25, 0], [0, -0.75, 0]);
  comp('bms', new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.22), MAT(0x0ea5e9, { emissive: 0x0369a1, emissiveIntensity: .6 })), [1.0, 0.36, 0.45], [0.4, -0.2, 1.0]);
  comp('inverter', new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.42), MAT(0xf59e0b, { metalness: 0.6, emissive: 0x3b2200, emissiveIntensity: .5 })), [-1.15, 0.75, 0], [-0.2, 1.0, 0]);
  const motor = new THREE.Group();
  const stat = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.42, 32), MAT(0x94a3b8, { metalness: 0.85, roughness: 0.3 })); stat.rotation.x = Math.PI / 2; motor.add(stat);
  for (let k = 0; k < 10; k++) { const fin = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.012, 6, 32), MAT(0x64748b)); fin.position.z = -0.18 + k * 0.04; motor.add(fin); }
  const rotorSpin = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 12), MAT(0x22d3ee, { emissive: 0x0e7490, emissiveIntensity: .7 })); rotorSpin.rotation.x = Math.PI / 2; motor.add(rotorSpin); motor.userData.spin = rotorSpin;
  comp('motor', motor, [-1.38, 0.42, 0.28], [-0.6, 0.6, 0.9]);
  comp('gearbox', new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.2), MAT(0x9ca3af, { metalness: 0.9 })), [-1.38, 0.38, 0.0], [-0.6, 0.4, 0]);
  const diff = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 16), MAT(0x78716c, { metalness: 0.9 })); comp('differential', diff, [-1.38, 0.33, -0.18], [-0.6, 0.3, -0.6]);
  const shaftMat = MAT(0xd1d5db, { metalness: 0.95, roughness: 0.2 });
  const sh1 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.68, 12), shaftMat); sh1.rotation.x = Math.PI / 2; comp('shafts', sh1, [-1.375, 0.33, -0.55], [-0.6, 0.2, -1.1]);
  const sh2 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.42, 12), shaftMat); sh2.rotation.x = Math.PI / 2; comp('shafts2', sh2, [-1.375, 0.33, 0.62], [-0.6, 0.2, 1.4]); sh2.userData.comp = 'shafts';
  comp('obc', new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.3), MAT(0xa78bfa, { emissive: 0x2e1065, emissiveIntensity: .5 })), [-1.7, 0.7, -0.45], [-0.5, 0.9, -0.8]);
  comp('dcdc', new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, 0.22), MAT(0xec4899, { emissive: 0x500724, emissiveIntensity: .5 })), [1.55, 0.62, 0.35], [0.6, 0.7, 0.8]);
  comp('aux12', new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.18, 0.17), MAT(0x1f2937)), [1.75, 0.62, -0.4], [0.7, 0.6, -0.8]);
  comp('vcu', new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.16), MAT(0x22c55e, { emissive: 0x14532d, emissiveIntensity: .6 })), [0.6, 0.62, 0], [0, 1.2, 0]);
  comp('radiator', new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 1.1), MAT(0x0891b2, { metalness: 0.7 })), [2.0, 0.55, 0], [0.8, 0.2, 0]);
  comp('chargeport', new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 20), MAT(0x111827, { emissive: 0x22c55e, emissiveIntensity: .4 })), [-1.75, 0.85, -0.93], [-0.3, 0.3, -0.8]);
  parts.chargeport.rotation.x = Math.PI / 2;
  // HV cables (orange)
  const cable = (a, b, mid) => { const c = new THREE.CatmullRomCurve3([new THREE.Vector3(...a), new THREE.Vector3(...mid), new THREE.Vector3(...b)]); const m = new THREE.Mesh(new THREE.TubeGeometry(c, 30, 0.018, 8), MAT(0xf97316, { emissive: 0x7c2d12, emissiveIntensity: .5 })); pt.add(m); m.userData.curve = c; m.userData.isCable = true; return m; };
  parts.cableBI = cable([-1.2, 0.3, 0.2], [-1.15, 0.7, 0.1], [-1.3, 0.45, 0.2]);
  parts.cableIM = cable([-1.25, 0.72, 0.15], [-1.38, 0.55, 0.28], [-1.4, 0.7, 0.25]);
  parts.cableCO = cable([-1.75, 0.85, -0.9], [-1.7, 0.7, -0.45], [-1.8, 0.8, -0.7]);
  parts.cableOB = cable([-1.6, 0.66, -0.45], [-1.2, 0.3, -0.35], [-1.45, 0.4, -0.45]);
  // flow particles along cables + mechanical path
  const flowPts = new THREE.Group(); pt.add(flowPts); parts.flow = flowPts;
  const pMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
  const paths = [parts.cableBI.userData.curve, parts.cableIM.userData.curve];
  paths.forEach((c, k) => { for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), pMat.clone()); s.userData.curve = c; s.userData.u = i / 6; flowPts.add(s); } });
  car.userData.parts = parts;
  car.traverse(c => { if (c.isMesh) c.castShadow = true; });
  // ---- API ----
  let mode = 'normal', explodeK = 0, explodeTarget = 0;
  car.setMode = m => {
    mode = m;
    bodyMat.opacity = m === 'normal' ? 1 : m === 'transparent' ? 0.22 : 0.08; bodyMat.depthWrite = m === 'normal';
    bodyMat.wireframe = m === 'xray'; glass.visible = m === 'normal'; roof.visible = m !== 'xray';
    explodeTarget = m === 'exploded' ? 1 : 0;
    if (m === 'exploded') { bodyMat.opacity = 0.12; bodyMat.depthWrite = false; }
  };
  let hiName = null;
  car.highlight = name => {
    hiName = name;
    pt.traverse(c => { if (c.isMesh && c.material && c.material.emissive) { const comp = findComp(c); c.material.emissiveIntensity = comp === name ? 1.6 : (c.userData.baseEm ?? (c.userData.baseEm = c.material.emissiveIntensity)); } });
  };
  car.isolate = name => { pt.children.forEach(ch => { if (ch.userData.comp) ch.visible = !name || ch.userData.comp === name || (name === 'shafts' && ch.userData.comp === 'shafts'); }); body.visible = !name; glass.visible = !name; roof.visible = !name; parts.wheels.forEach(w => { w.visible = !name || name === 'wheel'; }); };
  /** state: {wheelAng, motorAng, flow (-1..1), steer} */
  car.update = (st = {}, dt = 0.016) => {
    explodeK += (explodeTarget - explodeK) * Math.min(1, dt * 4);
    pt.children.forEach(ch => { if (ch.userData.home) ch.position.copy(ch.userData.home).addScaledVector(ch.userData.explode, explodeK); });
    parts.flow.visible = parts.cableBI.visible = parts.cableIM.visible = explodeK < 0.05;
    if (st.wheelAng !== undefined) parts.wheels.forEach(w => { w.userData.spin.rotation.z = -st.wheelAng; });
    if (st.steer !== undefined) parts.wheels.slice(0, 2).forEach(w => { w.rotation.y = st.steer * 0.5; });
    if (st.motorAng !== undefined) parts.motor.userData.spin.rotation.y = st.motorAng;
    const f = st.flow || 0;
    parts.flow.children.forEach(s => {
      s.visible = Math.abs(f) > 0.01 && explodeK < 0.05;
      s.userData.u = (s.userData.u + dt * (0.3 + 1.6 * Math.abs(f)) * Math.sign(f) + 1) % 1;
      s.position.copy(s.userData.curve.getPoint(s.userData.u));
      s.material.color.setHex(f >= 0 ? 0x22d3ee : 0x22c55e); s.scale.setScalar(0.7 + Math.abs(f));
    });
    parts.tail.material.emissiveIntensity = st.braking ? 3 : 0.9;
  };
  return car;
}

/* ------------------------------------------------------------ battery pack ------------------------------------------------------------ */
export function buildPack({ s = 4, p = 3, format = 'cylindrical', colorFn } = {}) {
  const g = new THREE.Group(); const cells = [];
  const dims = { cylindrical: [0.21, 0.65], prismatic: [0.3, 0.6], pouch: [0.1, 0.7] }[format];
  const pitch = format === 'pouch' ? 0.16 : format === 'prismatic' ? 0.36 : 0.26;
  const mods = Math.max(1, Math.ceil(s / 6));
  for (let i = 0; i < s; i++) for (let j = 0; j < p; j++) {
    let m;
    if (format === 'cylindrical') m = new THREE.Mesh(new THREE.CylinderGeometry(dims[0] / 2, dims[0] / 2, dims[1], 20), MAT(0x2563eb, { metalness: 0.5 }));
    else if (format === 'prismatic') m = new THREE.Mesh(new THREE.BoxGeometry(dims[0], dims[1], 0.5), MAT(0x64748b, { metalness: 0.7 }));
    else m = new THREE.Mesh(new THREE.BoxGeometry(dims[0], dims[1], 0.55), MAT(0xc0c8d4, { metalness: 0.6, roughness: 0.25 }));
    m.position.set((i - (s - 1) / 2) * pitch + Math.floor(i / 6) * 0.08, dims[1] / 2, (j - (p - 1) / 2) * (format === 'cylindrical' ? 0.24 : 0.6));
    const term = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 10), MAT(i % 2 ? 0xef4444 : 0x9ca3af));
    term.position.y = dims[1] / 2 + 0.02; m.add(term);
    m.castShadow = true; g.add(m); cells.push(m);
  }
  // bus bars: series links (orange) along s, parallel links (silver) across p
  for (let i = 0; i < s - 1; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(pitch, 0.02, 0.05), MAT(0xf97316, { emissive: 0x7c2d12, emissiveIntensity: .4 })); b.position.set((i + 0.5 - (s - 1) / 2) * pitch + Math.floor(i / 6) * 0.08, dims[1] + 0.05, -(p - 1) / 2 * (format === 'cylindrical' ? 0.24 : 0.6) - 0.05); g.add(b); }
  for (let i = 0; i < s; i++) { const len = (p - 1) * (format === 'cylindrical' ? 0.24 : 0.6) + 0.06; const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, len), MAT(0xcbd5e1, { metalness: 0.9 })); b.position.set((i - (s - 1) / 2) * pitch + Math.floor(i / 6) * 0.08, dims[1] + 0.03, 0); g.add(b); }
  const w = s * pitch + mods * 0.08 + 0.2, d = p * (format === 'cylindrical' ? 0.24 : 0.6) + 0.2;
  const tray = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), MAT(0x334155, { metalness: 0.6 })); tray.position.y = -0.025; tray.receiveShadow = true; g.add(tray);
  g.userData.cells = cells;
  g.color = fn => cells.forEach((c, k) => c.material.color.set(fn(k, Math.floor(k / p), k % p)));
  return g;
}

/* --------------------------------------------------------------- motors --------------------------------------------------------------- */
export function buildMotor({ type = 'PMSM', salient = false, poles = 8 } = {}) {
  const g = new THREE.Group(); const parts = {};
  const R = 1.0, Lz = 1.4;
  // stator laminations (ring with slots)
  const ring = new THREE.Shape(); ring.absarc(0, 0, R, 0, Math.PI * 2, false);
  const hole = new THREE.Path(); const slots = 36;
  for (let k = 0; k <= slots * 4; k++) { const a = k / (slots * 4) * Math.PI * 2; const tooth = (Math.floor(k / 2) % 2) === 0; const rr = tooth ? 0.62 : 0.74; if (k === 0) hole.moveTo(rr * Math.cos(a), rr * Math.sin(a)); else hole.lineTo(rr * Math.cos(a), rr * Math.sin(a)); }
  ring.holes.push(hole);
  const statorGeo = new THREE.ExtrudeGeometry(ring, { depth: Lz, bevelEnabled: false, curveSegments: 48 }); statorGeo.translate(0, 0, -Lz / 2);
  const stator = new THREE.Mesh(statorGeo, MAT(0x64748b, { metalness: 0.85, roughness: 0.35, transparent: true, opacity: 1, side: THREE.DoubleSide })); g.add(tag(stator, 'stator')); parts.stator = stator;
  // windings (three phases)
  const phaseCol = [0xef4444, 0xfacc15, 0x3b82f6]; parts.coils = [];
  for (let k = 0; k < 18; k++) {
    const a = k / 18 * Math.PI * 2;
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.035, 8, 20), MAT(0xb45309, { metalness: 0.9, roughness: 0.3, emissive: phaseCol[k % 3], emissiveIntensity: 0.2 }));
    coil.scale.set(1, 1, 1); coil.position.set(0.68 * Math.cos(a), 0.68 * Math.sin(a), Lz / 2 + 0.05); coil.rotation.z = a;
    const coil2 = coil.clone(); coil2.material = coil.material; coil2.position.z = -Lz / 2 - 0.05;
    g.add(tag(coil, 'windings'), tag(coil2, 'windings')); parts.coils.push([coil, k % 3], [coil2, k % 3]);
  }
  // rotor
  const rotor = new THREE.Group();
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, Lz * 0.98, 48), MAT(0x475569, { metalness: 0.85 })); core.rotation.x = Math.PI / 2; rotor.add(core);
  if (type === 'PMSM') {
    for (let k = 0; k < poles; k++) {
      const a = k / poles * Math.PI * 2;
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.32, Lz * 0.96), MAT(k % 2 ? 0xdc2626 : 0x2563eb, { metalness: 0.3, emissive: k % 2 ? 0x450a0a : 0x172554, emissiveIntensity: .7 }));
      const rr = salient ? 0.4 : 0.56; mag.position.set(rr * Math.cos(a), rr * Math.sin(a), 0); mag.rotation.z = a;
      if (salient) { mag.scale.set(0.8, 1.1, 1); const m2 = mag.clone(); m2.position.set(0.42 * Math.cos(a + 0.18), 0.42 * Math.sin(a + 0.18), 0); m2.rotation.z = a + 0.9; m2.material = mag.material; const m3 = mag.clone(); m3.position.set(0.42 * Math.cos(a - 0.18), 0.42 * Math.sin(a - 0.18), 0); m3.rotation.z = a - 0.9; m3.material = mag.material; rotor.add(tag(m2, 'magnets'), tag(m3, 'magnets')); mag.visible = false; }
      rotor.add(tag(mag, 'magnets'));
    }
  } else {
    for (let k = 0; k < 28; k++) { const a = k / 28 * Math.PI * 2; const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, Lz * 1.02, 8), MAT(0xd97706, { metalness: 0.95, roughness: 0.25 })); bar.rotation.x = Math.PI / 2; bar.position.set(0.5 * Math.cos(a), 0.5 * Math.sin(a), 0); rotor.add(tag(bar, 'rotorbars')); }
    for (const z of [-1, 1]) { const er = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 10, 48), MAT(0xd97706, { metalness: 0.95 })); er.position.z = z * Lz * 0.51; rotor.add(tag(er, 'endrings')); }
  }
  tag(core, 'rotor');
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, Lz + 1.4, 20), MAT(0xe5e7eb, { metalness: 0.95, roughness: 0.15 })); shaft.rotation.x = Math.PI / 2; rotor.add(tag(shaft, 'shaft'));
  g.add(rotor); parts.rotor = rotor;
  for (const z of [-1, 1]) { const b = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 10, 24), MAT(0x9ca3af, { metalness: 0.95 })); b.position.z = z * (Lz / 2 + 0.35); g.add(tag(b, 'bearings')); }
  // air-gap ring indicator
  const gap = new THREE.Mesh(new THREE.TorusGeometry(0.59, 0.006, 6, 96), new THREE.MeshBasicMaterial({ color: 0x22d3ee })); gap.position.z = Lz / 2 + 0.01; g.add(tag(gap, 'airgap')); parts.gap = gap;
  // rotating field arrow (resultant MMF)
  const fieldArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, Lz / 2 + 0.25), 0.9, 0x22d3ee, 0.2, 0.12); g.add(fieldArrow); parts.field = fieldArrow;
  // flux lines (simple arcs for each pole pair, rotate with field)
  const flux = new THREE.Group(); const np = Math.max(2, poles / 2);
  for (let k = 0; k < poles; k++) { const a = k / poles * Math.PI * 2; const c = new THREE.EllipseCurve(0, 0, 0.78, 0.78, a - Math.PI / poles * 0.9, a + Math.PI / poles * 0.9); const pts = c.getPoints(20).map(p => new THREE.Vector3(p.x, p.y, Lz / 2 + 0.12)); const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: k % 2 ? 0xf472b6 : 0x22d3ee, transparent: true, opacity: 0.7 })); flux.add(l); }
  g.add(flux); parts.flux = flux; parts.np = np;
  g.userData.parts = parts;
  g.rotation.y = -Math.PI / 5;
  g.update = ({ thetaE = 0, thetaM = 0, ia = 0, ib = 0, ic = 0, cut = false, explode = 0 } = {}) => {
    rotor.rotation.z = thetaM;
    const dir = new THREE.Vector3(Math.cos(thetaE / Math.max(1, poles / 2)), Math.sin(thetaE / Math.max(1, poles / 2)), 0);
    fieldArrow.setDirection(dir);
    flux.rotation.z = thetaE / Math.max(1, poles / 2);
    const cur = [ia, ib, ic]; const mx = Math.max(1e-6, Math.abs(ia), Math.abs(ib), Math.abs(ic));
    parts.coils.forEach(([c, ph]) => { c.material.emissiveIntensity = 0.1 + 1.2 * Math.abs(cur[ph]) / mx; });
    stator.material.opacity = cut ? 0.25 : 1; stator.material.depthWrite = !cut;
    rotor.position.z = explode * 1.6;
  };
  return g;
}
