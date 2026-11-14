// Moving traffic: cars, vans, box trucks, container semis, buses on the municipal roads; e-bikes, pedestrians and the odd
// van / forklift on the campus roads.  Generic (not taken from the imagery) - it only follows the traced road centre lines.
// Agents keep to the right, loop along their road and do not react to each other or to junctions.
import * as THREE from 'three';
import * as TX from './textures.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const DARK = [0.03, 0.03, 0.035], GLASS = [0.07, 0.09, 0.11], BODY = [1, 1, 1], SKIN = [0.86, 0.62, 0.5];
function colored(geo, fn) {
  const g = geo.toNonIndexed(), p = g.attributes.position, n = g.attributes.normal, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const v = fn(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i)); c[i * 3] = v[0]; c[i * 3 + 1] = v[1]; c[i * 3 + 2] = v[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.deleteAttribute('uv'); return g;
}
const box = (w, h, d, x, y, z, fn) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return colored(g, fn || (() => BODY)); };
const wheel = (x, z, r = 0.34, w = 0.26) => { const g = new THREE.CylinderGeometry(r, r, w, 10); g.rotateX(Math.PI / 2); g.translate(x, r, z); return colored(g, () => DARK); };
function taper(g, y0, kx, kz, cx = 0) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) > y0) { p.setX(i, cx + (p.getX(i) - cx) * kx); p.setZ(i, p.getZ(i) * kz); } g.computeVertexNormals(); return g; }

export function carGeo() {                          // sedan / hatchback, nose at +x
  const body = box(4.4, 0.55, 1.78, 0, 0.62, 0, (x, y) => (y < 0.4 ? DARK : BODY));
  const cab = colored(taper(new THREE.BoxGeometry(2.5, 0.55, 1.68).translate(-0.25, 1.17, 0), 1.2, 0.68, 0.88, -0.3), (x, y, z, nx, ny) => (ny > 0.8 ? BODY : GLASS));
  const lf = box(0.06, 0.16, 1.5, 2.2, 0.72, 0, () => [1.0, 0.97, 0.85]), lr = box(0.06, 0.14, 1.5, -2.2, 0.76, 0, () => [0.55, 0.04, 0.04]);
  return mergeGeometries([body, cab, lf, lr, wheel(-1.4, -0.8), wheel(-1.4, 0.8), wheel(1.4, -0.8), wheel(1.4, 0.8)]);
}
export function vanGeo() {                          // 面包车 / light van
  const body = box(4.5, 1.35, 1.7, 0, 1.02, 0, (x, y) => (y < 0.45 ? DARK : BODY));
  const win = box(3.3, 0.5, 1.72, -0.2, 1.42, 0, (x, y, z, nx, ny) => (Math.abs(ny) > 0.5 ? BODY : GLASS));
  const ws = box(0.06, 0.6, 1.5, 2.24, 1.36, 0, () => GLASS), lr = box(0.06, 0.2, 1.5, -2.26, 0.8, 0, () => [0.55, 0.04, 0.04]);
  return mergeGeometries([body, win, ws, lr, wheel(-1.45, -0.78), wheel(-1.45, 0.78), wheel(1.5, -0.78), wheel(1.5, 0.78)]);
}
export function boxTruckGeo() {                     // 6-7 m box truck
  const cargo = box(4.6, 2.3, 2.3, -1.0, 2.05, 0, () => [0.9, 0.9, 0.88]);
  const cab = box(1.8, 1.9, 2.2, 2.35, 1.45, 0, (x, y, z, nx) => (y > 1.5 && nx > -0.5 && Math.abs(nx) + 0 > 0.5 ? GLASS : BODY));
  const ch = box(6.6, 0.3, 2.0, 0, 0.75, 0, () => DARK);
  return mergeGeometries([cargo, cab, ch, wheel(-2.2, -1.0, 0.45, 0.32), wheel(-2.2, 1.0, 0.45, 0.32), wheel(2.3, -1.0, 0.45, 0.3), wheel(2.3, 1.0, 0.45, 0.3)]);
}
export function semiGeo() {                         // tractor + 40 ft container
  const cont = box(12.2, 2.6, 2.45, -1.6, 2.7, 0, () => BODY);
  const ribs = []; for (let x = -7.4; x < 4.4; x += 0.6) ribs.push(box(0.08, 2.5, 2.5, x, 2.7, 0, () => [0.8, 0.8, 0.8]));
  const ch = box(13.0, 0.35, 2.3, -1.4, 1.2, 0, () => DARK);
  const cabin = box(2.3, 2.7, 2.45, 6.3, 2.05, 0, (x, y, z, nx) => (nx > 0.5 && y > 2.1 ? GLASS : [0.86, 0.86, 0.84]));
  const ws = []; for (const wx of [-6.6, -5.4, 2.6, 3.8, 6.4]) for (const wz of [-1.05, 1.05]) ws.push(wheel(wx, wz, 0.5, 0.34));
  return mergeGeometries([cont, ...ribs, ch, cabin, ...ws]);
}
export function busGeo() {
  const body = box(11.6, 2.75, 2.5, 0, 1.8, 0, (x, y) => (y < 0.8 ? DARK : BODY));
  const band = box(11.66, 1.0, 2.56, 0, 2.3, 0, (x, y, z, nx, ny) => (Math.abs(ny) > 0.5 ? BODY : GLASS));
  const top = box(11.6, 0.12, 2.5, 0, 3.2, 0, () => [0.9, 0.9, 0.9]);
  return mergeGeometries([body, band, top, wheel(-3.6, -1.15, 0.5, 0.3), wheel(-3.6, 1.15, 0.5, 0.3), wheel(3.9, -1.15, 0.5, 0.3), wheel(3.9, 1.15, 0.5, 0.3)]);
}
export function riderGeo() {                        // e-bike with its rider
  const body = box(1.5, 0.4, 0.34, 0, 0.5, 0, (x, y) => (y < 0.42 ? DARK : BODY));
  const front = box(0.14, 0.6, 0.48, 0.62, 0.82, 0);
  const legs = box(0.5, 0.45, 0.36, -0.1, 0.95, 0, () => [0.1, 0.11, 0.15]);
  const torso = colored(new THREE.CylinderGeometry(0.19, 0.2, 0.62, 7).translate(-0.22, 1.45, 0), () => [0.25, 0.27, 0.32]);
  const head = colored(new THREE.SphereGeometry(0.15, 8, 6).translate(-0.18, 1.9, 0), () => [0.75, 0.75, 0.78]);
  return mergeGeometries([body, front, legs, torso, head, wheel(-0.6, 0, 0.22, 0.1), wheel(0.62, 0, 0.22, 0.1)]);
}
export function walkerGeo() {                       // facing +x
  const l1 = colored(new THREE.CylinderGeometry(0.085, 0.075, 0.84, 6).translate(0.07, 0.42, -0.1), () => [0.1, 0.11, 0.15]);
  const l2 = colored(new THREE.CylinderGeometry(0.085, 0.075, 0.84, 6).translate(-0.07, 0.42, 0.1), () => [0.1, 0.11, 0.15]);
  const torso = colored(new THREE.CylinderGeometry(0.2, 0.18, 0.64, 8).translate(0, 1.15, 0), () => BODY);
  const head = colored(new THREE.SphereGeometry(0.125, 8, 6).translate(0, 1.6, 0), () => SKIN);
  const hair = colored(new THREE.SphereGeometry(0.13, 8, 5, 0, 6.3, 0, 1.5).translate(-0.01, 1.63, 0), () => DARK);
  return mergeGeometries([l1, l2, torso, head, hair]);
}
export function forkliftGeo() {
  const body = box(2.0, 0.9, 1.1, 0, 0.75, 0, () => BODY), seat = box(0.9, 0.9, 1.0, -0.2, 1.65, 0, () => DARK), mast = box(0.12, 2.3, 0.9, 1.05, 1.3, 0, () => DARK);
  const f1 = box(1.1, 0.06, 0.12, 1.6, 0.2, -0.3, () => DARK), f2 = box(1.1, 0.06, 0.12, 1.6, 0.2, 0.3, () => DARK);
  return mergeGeometries([body, seat, mast, f1, f2, wheel(-0.6, -0.5, 0.3, 0.2), wheel(-0.6, 0.5, 0.3, 0.2), wheel(0.7, -0.5, 0.3, 0.2), wheel(0.7, 0.5, 0.3, 0.2)]);
}

const PAL = {
  car: [[0.7, 0.71, 0.7, 34], [0.03, 0.03, 0.035, 22], [0.4, 0.42, 0.44, 16], [0.58, 0.6, 0.62, 10], [0.42, 0.04, 0.04, 6], [0.06, 0.11, 0.3, 5], [0.26, 0.19, 0.12, 4]],
  van: [[0.72, 0.73, 0.72, 40], [0.5, 0.52, 0.54, 20], [0.75, 0.72, 0.6, 8], [0.1, 0.2, 0.42, 6]],
  box: [[0.1, 0.25, 0.55, 5], [0.7, 0.7, 0.68, 6], [0.55, 0.1, 0.08, 3], [0.75, 0.6, 0.1, 3], [0.12, 0.35, 0.2, 2]],
  semi: [[0.5, 0.08, 0.06, 4], [0.08, 0.18, 0.42, 4], [0.7, 0.7, 0.67, 3], [0.1, 0.32, 0.22, 2], [0.6, 0.35, 0.08, 2], [0.55, 0.55, 0.6, 2]],
  bus: [[0.1, 0.36, 0.2, 4], [0.6, 0.6, 0.58, 3], [0.1, 0.22, 0.5, 3], [0.5, 0.07, 0.06, 2]],
  rider: [[0.04, 0.04, 0.045, 40], [0.3, 0.06, 0.06, 10], [0.07, 0.1, 0.24, 8], [0.5, 0.5, 0.5, 10], [0.6, 0.45, 0.1, 4]],
  walker: [[0.82, 0.83, 0.85, 30], [0.12, 0.13, 0.16, 30], [0.5, 0.66, 0.85, 12], [0.85, 0.55, 0.62, 8], [0.75, 0.2, 0.2, 5], [0.85, 0.8, 0.4, 4], [0.3, 0.5, 0.35, 5]],
  fork: [[0.75, 0.12, 0.08, 5], [0.85, 0.6, 0.08, 4]],
};
const SPEED = { car: [9, 14], van: [8, 12], box: [7, 11], semi: [6, 9.5], bus: [7, 10], rider: [3.5, 6], walker: [1.0, 1.6], fork: [2, 3.5] };
function pick(tab, r) { let s = 0; for (const c of tab) s += c[3]; let v = r * s; for (const c of tab) { v -= c[3]; if (v <= 0) return c; } return tab[0]; }

export class Traffic {
  constructor(DATA, root) {
    const R = TX.rng(8642), agents = [];
    const add = (path, kind, dir, off, s) => agents.push({ path, kind, dir, off, s, v: SPEED[kind][0] + R() * (SPEED[kind][1] - SPEED[kind][0]), c: pick(PAL[kind], R()), k: 0.94 + R() * 0.12 });
    const G = DATA.ground, x0 = G.u0 + 5, x1 = G.u0 + G.w * G.mpp - 5, z0 = G.s0 + 5, z1 = G.s0 + G.h * G.mpp - 5;
    for (const rd of DATA.roads) {
      const pts = rd.line.map((p) => [Math.min(x1, Math.max(x0, p[0])), Math.min(z1, Math.max(z0, p[1]))]), cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const path = { pts, cum, len: cum[cum.length - 1] }; if (path.len < 30) continue;
      for (const dir of [1, -1]) {
        if (rd.kind === 'main') {
          const lanes = rd.w >= 30 ? 3 : rd.w >= 22 ? 2 : 1, lw = rd.w * 0.42 / lanes;
          for (let s = R() * 90; s < path.len; s += 55 + R() * 130) { const q = R(), kind = q < 0.52 ? 'car' : q < 0.68 ? 'van' : q < 0.8 ? 'box' : q < 0.91 ? 'semi' : 'bus', lane = kind === 'car' ? Math.floor(R() * lanes) : lanes - 1 - (R() < 0.3 && lanes > 1 ? 1 : 0); add(path, kind, dir, (lane + 0.5) * lw, s); }
          for (let s = R() * 60; s < path.len; s += 45 + R() * 110) add(path, 'rider', dir, rd.w * 0.455, s);
          for (let s = R() * 80; s < path.len; s += 60 + R() * 140) add(path, 'walker', dir, rd.w / 2 + 1.6 + R(), s);
        } else {
          for (let s = R() * 50; s < path.len; s += 40 + R() * 80) add(path, 'rider', dir, 1.2 + R() * 0.8, s);
          for (let s = R() * 20; s < path.len; s += 9 + R() * 26) add(path, 'walker', dir, rd.w / 2 - 0.9 + R() * 1.6, s);
          for (let s = 40 + R() * 200; s < path.len; s += 220 + R() * 300) add(path, R() < 0.5 ? 'van' : R() < 0.6 ? 'box' : 'fork', dir, 1.9, s);
        }
      }
    }
    this.group = new THREE.Group(); this.group.name = 'traffic'; this.agents = agents; this.sets = {}; this.counts = {};
    const paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.25 }), matte = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 });
    const geo = { car: [carGeo(), paint], van: [vanGeo(), paint], box: [boxTruckGeo(), matte], semi: [semiGeo(), matte], bus: [busGeo(), matte], rider: [riderGeo(), matte], walker: [walkerGeo(), matte], fork: [forkliftGeo(), matte] };
    const col = new THREE.Color();
    for (const kind of Object.keys(geo)) {
      const list = agents.filter((a) => a.kind === kind); this.counts[kind] = list.length; if (!list.length) continue;
      const im = new THREE.InstancedMesh(geo[kind][0], geo[kind][1], list.length); im.castShadow = kind !== 'walker' && kind !== 'rider'; im.receiveShadow = true; im.frustumCulled = false;
      list.forEach((a, i) => { a.im = im; a.i = i; col.setRGB(a.c[0], a.c[1], a.c[2]); im.setColorAt(i, col); });
      this.group.add(im); this.sets[kind] = im;
    }
    this.mats = [paint, matte];
    root.add(this.group); this.M = new THREE.Matrix4(); this.Q = new THREE.Quaternion(); this.P = new THREE.Vector3(); this.S = new THREE.Vector3(); this.Y = new THREE.Vector3(0, 1, 0);
    this.tick(0);
  }
  tick(dt) {
    if (!this.group.visible) return;
    const { M, Q, P, S, Y } = this, t = performance.now() / 1000;
    for (const a of this.agents) {
      const p = a.path; a.s += a.v * dt * a.dir; if (a.s > p.len) a.s -= p.len; else if (a.s < 0) a.s += p.len;
      let i = 1; while (i < p.cum.length - 1 && p.cum[i] < a.s) i++;
      const A = p.pts[i - 1], B = p.pts[i], L = p.cum[i] - p.cum[i - 1], k = (a.s - p.cum[i - 1]) / L, dx = (B[0] - A[0]) / L, dz = (B[1] - A[1]) / L, o = a.off * a.dir;
      const bob = a.kind === 'walker' ? Math.abs(Math.sin(t * 7 + a.i)) * 0.05 : 0;
      P.set(A[0] + (B[0] - A[0]) * k - dz * o, 0.03 + bob, A[1] + (B[1] - A[1]) * k + dx * o);
      Q.setFromAxisAngle(Y, Math.atan2(-dz * a.dir, dx * a.dir)); S.set(a.k, a.k, a.k); M.compose(P, Q, S); a.im.setMatrixAt(a.i, M);
    }
    for (const im of Object.values(this.sets)) im.instanceMatrix.needsUpdate = true;
  }
}
