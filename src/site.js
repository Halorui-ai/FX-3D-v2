// Second pass: perimeter walls, gates, gate canopies and vehicles.  Same frame as builder.js (x = U, z = S, y up).
import * as THREE from 'three';
import * as TX from './textures.js';
import * as TR from './traffic.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// box running from a to b (plan), half-thickness ht, between y0 and y1
function obox(acc, ax, az, bx, bz, ht, y0, y1, texW = 4, caps = true) {
  const len = Math.hypot(bx - ax, bz - az); if (len < 1e-4) return;
  const dx = (bx - ax) / len, dz = (bz - az) / len, nx = -dz * ht, nz = dx * ht, t = len / texW, v = (y1 - y0) / texW;
  acc.quad([ax + nx, y0, az + nz], [bx + nx, y0, bz + nz], [bx + nx, y1, bz + nz], [ax + nx, y1, az + nz], [0, 0], [t, 0], [t, v], [0, v]);
  acc.quad([bx - nx, y0, bz - nz], [ax - nx, y0, az - nz], [ax - nx, y1, az - nz], [bx - nx, y1, bz - nz], [0, 0], [t, 0], [t, v], [0, v]);
  acc.quad([ax + nx, y1, az + nz], [bx + nx, y1, bz + nz], [bx - nx, y1, bz - nz], [ax - nx, y1, az - nz], [0, 0], [t, 0], [t, 0.1], [0, 0.1]);
  if (caps) {
    acc.quad([ax - nx, y0, az - nz], [ax + nx, y0, az + nz], [ax + nx, y1, az + nz], [ax - nx, y1, az - nz], [0, 0], [0.1, 0], [0.1, v], [0, v]);
    acc.quad([bx + nx, y0, bz + nz], [bx - nx, y0, bz - nz], [bx - nx, y1, bz - nz], [bx + nx, y1, bz + nz], [0, 0], [0.1, 0], [0.1, v], [0, v]);
  }
}
const sq = (acc, x, z, h, y0, y1) => acc.walls([x - h, z - h, x + h, z + h], y0, y1, 3);

function colored(geo, fn) {                       // per-vertex colour from (position, normal)
  const g = geo.toNonIndexed(), p = g.attributes.position, n = g.attributes.normal, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const v = fn(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i)); c[i * 3] = v[0]; c[i * 3 + 1] = v[1]; c[i * 3 + 2] = v[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.deleteAttribute('uv');
  return g;
}
const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
const DARK = [0.03, 0.03, 0.035], GLASS = [0.07, 0.09, 0.11], BODY = [1, 1, 1];

function carGeo() {                               // length along +x (nose at +x), ~4.5 x 1.8 x 1.45 m
  const body = colored(box(4.45, 0.6, 1.8, 0, 0.62, 0), (x, y) => (y < 0.4 ? DARK : BODY));
  const cab = new THREE.BoxGeometry(2.5, 0.52, 1.66); cab.translate(-0.25, 1.18, 0);
  { const p = cab.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) > 1.2) { p.setX(i, -0.3 + (p.getX(i) + 0.25) * 0.7); p.setZ(i, p.getZ(i) * 0.88); } cab.computeVertexNormals(); }
  const cabC = colored(cab, (x, y, z, nx, ny) => (ny > 0.8 ? BODY : GLASS));
  const wheels = [];
  for (const wx of [-1.42, 1.42]) for (const wz of [-0.8, 0.8]) wheels.push(colored(box(0.66, 0.64, 0.26, wx, 0.32, wz), () => DARK));
  return mergeGeometries([body, cabC, ...wheels]);
}
function busGeo() {                               // ~11.6 x 2.5 x 3.2 m
  const body = colored(box(11.6, 2.75, 2.5, 0, 1.78, 0), () => BODY);
  const band = colored(box(11.66, 0.95, 2.56, 0, 2.35, 0), (x, y, z, nx, ny) => (Math.abs(ny) > 0.5 ? BODY : GLASS));
  const wheels = [];
  for (const wx of [-3.6, 3.9]) for (const wz of [-1.15, 1.15]) wheels.push(colored(box(1.0, 0.96, 0.3, wx, 0.48, wz), () => DARK));
  return mergeGeometries([body, band, ...wheels]);
}
function truckGeo() {                             // tractor + 40 ft container, ~16 x 2.5 x 4 m
  const cont = colored(box(12.2, 2.6, 2.45, -1.6, 2.65, 0), () => BODY);
  const chassis = colored(box(13.0, 0.35, 2.3, -1.4, 1.15, 0), () => DARK);
  const cabin = colored(box(2.3, 2.7, 2.45, 6.3, 2.0, 0), (x, y, z, nx) => (nx > 0.5 && y > 2.1 ? GLASS : [0.86, 0.86, 0.84]));
  const wheels = [];
  for (const wx of [-6.6, -5.4, 2.6, 6.2]) for (const wz of [-1.05, 1.05]) wheels.push(colored(box(1.0, 1.0, 0.34, wx, 0.5, wz), () => DARK));
  return mergeGeometries([cont, chassis, cabin, ...wheels]);
}
function bikeGeo() {                              // e-bike / scooter, ~1.7 x 0.65 x 1.1 m
  const body = colored(box(1.55, 0.42, 0.36, 0, 0.5, 0), (x, y) => (y < 0.42 ? DARK : BODY));
  const seat = colored(box(0.62, 0.14, 0.32, -0.3, 0.78, 0), () => DARK);
  const front = colored(box(0.14, 0.62, 0.5, 0.62, 0.82, 0), () => BODY);
  return mergeGeometries([body, seat, front]);
}

const CAR_COLORS = [[0.72, 0.73, 0.72, 34], [0.03, 0.03, 0.035, 20], [0.42, 0.44, 0.46, 16], [0.62, 0.64, 0.66, 10], [0.45, 0.04, 0.04, 6], [0.06, 0.12, 0.32, 5], [0.28, 0.2, 0.13, 4], [0.5, 0.42, 0.25, 3], [0.1, 0.25, 0.14, 2]];
const BUS_COLORS = [[0.5, 0.07, 0.06, 5], [0.1, 0.36, 0.2, 3], [0.62, 0.62, 0.6, 3], [0.1, 0.22, 0.5, 2]];
const TRUCK_COLORS = [[0.5, 0.08, 0.06, 4], [0.08, 0.18, 0.42, 4], [0.75, 0.75, 0.72, 3], [0.1, 0.32, 0.22, 2], [0.6, 0.35, 0.08, 2]];
const BIKE_COLORS = [[0.035, 0.035, 0.04, 52], [0.13, 0.13, 0.14, 20], [0.3, 0.3, 0.31, 8], [0.3, 0.06, 0.06, 6], [0.07, 0.1, 0.24, 5], [0.55, 0.55, 0.53, 6], [0.3, 0.24, 0.1, 2], [0.1, 0.2, 0.18, 1]];
function pickColor(tab, r) { let s = 0; for (const c of tab) s += c[3]; let v = r * s; for (const c of tab) { v -= c[3]; if (v <= 0) return c; } return tab[0]; }

export function buildSite(DATA, Acc, std, root, wetMats) {
  const R = TX.rng(4242);
  const out = {};

  // ------------------------------------------------ perimeter walls
  const baseA = new Acc(), postA = new Acc(), solidA = new Acc(), railA = new Acc();
  for (const w of DATA.walls || []) {
    const [ax, az] = w.a, [bx, bz] = w.b, len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len;
    if (w.kind === 'solid') { obox(solidA, ax, az, bx, bz, 0.13, 0, 2.5, 6); }
    else {
      obox(baseA, ax, az, bx, bz, 0.16, 0, 0.5, 4);
      const t = len / TX.FENCE_W;
      railA.quad([ax, 0.5, az], [bx, 0.5, bz], [bx, 2.15, bz], [ax, 2.15, az], [0, 0], [t, 0], [t, 1], [0, 1]);
    }
    const n = Math.max(1, Math.round(len / 6));
    for (let k = 0; k <= n; k++) sq(postA, ax + dx * len * k / n, az + dz * len * k / n, 0.2, 0, w.kind === 'solid' ? 2.7 : 2.3);
  }
  const wallMat = std({ color: 0xb9b9b2, roughness: 0.92 });
  const solidMat = std({ color: 0x9aa3a8, roughness: 0.85 });
  const railMat = new THREE.MeshStandardMaterial({ map: TX.fence(), transparent: true, alphaTest: 0.04, depthWrite: false, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.4 });
  const walls = new THREE.Group(); walls.name = 'walls';
  for (const [a, m, sh] of [[baseA, wallMat, true], [postA, wallMat, true], [solidA, solidMat, true]]) {
    if (a.empty) continue; const me = new THREE.Mesh(a.geometry(), m); me.castShadow = sh; me.receiveShadow = true; walls.add(me);
  }
  let rail = null;
  if (!railA.empty) { rail = new THREE.Mesh(railA.geometry(), railMat); rail.receiveShadow = false; rail.renderOrder = 2; walls.add(rail); }
  wetMats.push(wallMat, solidMat);

  // ------------------------------------------------ gates: pillars, boom barriers, guard booth, name tag
  const pilA = new Acc(), capA = new Acc(), armA = new Acc(), boothA = new Acc(), boothRoofA = new Acc();
  const gateLabels = new THREE.Group(); gateLabels.name = 'gateLabels';
  for (const g of DATA.gates || []) {
    const [px, pz] = g.p, [dx, dz] = g.dir, [nx, nz] = g.in, hw = g.w / 2;
    const main = g.kind === 'main', lot = g.kind === 'lot';
    const ph = main ? 3.4 : lot ? 2.3 : 2.8, ps = main ? 0.5 : 0.32;
    for (const s of [-1, 1]) {
      const x = px + dx * hw * s, z = pz + dz * hw * s;
      sq(pilA, x, z, ps, 0, ph); capA.box([x - ps - 0.12, z - ps - 0.12, x + ps + 0.12, z + ps + 0.12], ph, ph + 0.18, 2, 2);
    }
    // boom barriers set 2.5 m inside the wall line
    const ox = px + nx * 2.5, oz = pz + nz * 2.5;
    const arm = (s, L) => { const x0 = ox + dx * hw * s, z0 = oz + dz * hw * s, x1 = x0 - dx * L * s, z1 = z0 - dz * L * s;
      obox(armA, x0, z0, x1, z1, 0.05, 1.0, 1.1, 4, true); sq(pilA, x0, z0, 0.16, 0, 1.15); };
    if (main && g.w >= 12) { arm(-1, hw - 1.4); arm(1, hw - 1.4); sq(pilA, ox, oz, 0.5, 0, 0.25); }    // in / out lanes with an island
    else arm(-1, g.w - 1.2);
    if (!lot) {                                    // guard booth beside the opening, inside the wall
      const s = (px * 13.7 + pz * 7.3) % 2 > 1 ? 1 : -1, bx = px + dx * (hw + 2.2) * s + nx * 2.4, bz = pz + dz * (hw + 2.2) * s + nz * 2.4, b = main ? 1.6 : 1.25;
      boothA.walls([bx - b, bz - b, bx + b, bz + b], 0, 2.7, b * 2, 0, 1);
      boothRoofA.box([bx - b - 0.35, bz - b - 0.35, bx + b + 0.35, bz + b + 0.35], 2.7, 2.9, 2, 2);
    }
    if (g.name) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.tagSprite(g.zone + '区 ' + g.name), depthTest: false, transparent: true, fog: false }));
      sp.scale.set(24, 6, 1); sp.position.set(px, 8.5, pz); sp.renderOrder = 10; gateLabels.add(sp);
    }
  }
  const pilMat = std({ color: 0xd8d6cf, roughness: 0.85 }), capMat = std({ color: 0x5b1f1c, roughness: 0.7 });
  const armMat = std({ map: TX.stripes(), roughness: 0.6 }), boothMat = std({ map: TX.booth(), roughness: 0.6 }), boothRoofMat = std({ color: 0x3c4650, roughness: 0.5, metalness: 0.3 });
  const gates = new THREE.Group(); gates.name = 'gates';
  for (const [a, m] of [[capA, capMat], [armA, armMat]]) {
    if (a.empty) continue; const me = new THREE.Mesh(a.geometry(), m); me.castShadow = me.receiveShadow = true; gates.add(me);
  }
  wetMats.push(pilMat, boothRoofMat);

  // ------------------------------------------------ gate canopies (posts + thin roof), customs lane booths
  const CC = { blue: 0x2b55a8, white: 0xe4e4df, grey: 0x9aa0a3, yellow: 0xcfa93a };
  const canA = {}, canPost = new Acc();
  for (const c of DATA.canopies || []) {
    const [u0, s0, u1, s1] = c.r, H = c.h, W = u1 - u0, D = s1 - s0;
    const a = canA[c.c] || (canA[c.c] = new Acc());
    a.box([u0 - 0.4, s0 - 0.4, u1 + 0.4, s1 + 0.4], H - 0.32, H, 4, 4);
    a.quad([u0 - 0.4, H - 0.32, s0 - 0.4], [u1 + 0.4, H - 0.32, s0 - 0.4], [u1 + 0.4, H - 0.32, s1 + 0.4], [u0 - 0.4, H - 0.32, s1 + 0.4], [0, 0], [1, 0], [1, 1], [0, 1]);
    const nu = Math.max(1, Math.round(W / 7)), ns = Math.max(1, Math.round(D / 7));
    if (c.c === 'yellow') {                        // lane island: two posts on the centre line and a booth
      const cu = (u0 + u1) / 2;
      sq(canPost, cu, s0 + 2, 0.18, 0, H - 0.3); sq(canPost, cu, s1 - 2, 0.18, 0, H - 0.3);
      boothA.walls([cu - 0.8, (s0 + s1) / 2 - 1.6, cu + 0.8, (s0 + s1) / 2 + 1.6], 0, 2.6, 3.2, 0, 1);
      boothRoofA.box([cu - 0.95, (s0 + s1) / 2 - 1.75, cu + 0.95, (s0 + s1) / 2 + 1.75], 2.6, 2.75, 2, 2);
      obox(pilA, cu, s0 - 3, cu, s1 + 3, 0.6, 0, 0.22, 4);
    } else for (let i = 0; i <= nu; i++) for (let j = 0; j <= ns; j++) { if (i > 0 && i < nu && j > 0 && j < ns) continue; sq(canPost, u0 + 0.2 + (W - 0.4) * i / nu, s0 + 0.2 + (D - 0.4) * j / ns, 0.13, 0, H - 0.3); }
  }
  for (const [a, m] of [[pilA, pilMat], [boothA, boothMat], [boothRoofA, boothRoofMat]]) { if (a.empty) continue; const me = new THREE.Mesh(a.geometry(), m); me.castShadow = me.receiveShadow = true; gates.add(me); }
  for (const k of Object.keys(canA)) {
    const m = std({ color: CC[k] || 0xcccccc, roughness: k === 'blue' ? 0.45 : 0.7, metalness: k === 'blue' ? 0.35 : 0.05 });
    const me = new THREE.Mesh(canA[k].geometry(), m); me.castShadow = me.receiveShadow = true; gates.add(me); wetMats.push(m);
  }
  if (!canPost.empty) { const me = new THREE.Mesh(canPost.geometry(), std({ color: 0x8a9094, roughness: 0.6, metalness: 0.4 })); me.castShadow = true; gates.add(me); }
  walls.add(gates);
  root.add(walls, gateLabels);

  // ------------------------------------------------ vehicles
  const list = { car: [], bus: [], truck: [], bike: [] };
  const SPEC = { car: { pitch: 2.7, len: 6.0, tab: CAR_COLORS }, bus: { pitch: 3.6, len: 13.4, tab: BUS_COLORS }, truck: { pitch: 3.9, len: 18, tab: TRUCK_COLORS } };
  const put = (kind, x, z, hx, hz, s = 1) => { const c = pickColor(kind === 'bike' ? BIKE_COLORS : SPEC[kind].tab, R()); list[kind].push([x, z, Math.atan2(-hz, hx), c, s]); };
  for (const p of DATA.park || []) {
    const [ax, az, bx, bz] = p.l, len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len, sp = SPEC[p.v];
    if (p.m === 'r') {
      const n = Math.max(1, Math.floor(len / sp.pitch + 0.5)), off = (len - (n - 1) * sp.pitch) / 2, flip = R() < 0.5 ? 1 : -1;
      for (let k = 0; k < n; k++) {
        if (R() > p.f) continue;
        const d = off + k * sp.pitch + (R() - 0.5) * 0.25, j = (R() - 0.5) * 0.5, f = (R() < 0.82 ? 1 : -1) * flip, a = (R() - 0.5) * 0.06;
        const hx = -dz * f, hz = dx * f;
        put(p.v, ax + dx * d + hx * j, az + dz * d + hz * j, hx * Math.cos(a) - hz * Math.sin(a), hx * Math.sin(a) + hz * Math.cos(a));
      }
    } else {
      const n = Math.max(1, Math.floor(len / sp.len + 0.5)), off = (len - (n - 1) * sp.len) / 2;
      for (let k = 0; k < n; k++) { if (R() > p.f) continue; const d = off + k * sp.len + (R() - 0.5) * 0.8; put(p.v, ax + dx * d, az + dz * d, dx, dz); }
    }
  }
  for (const b of DATA.bikes || []) {                 // double rows of scooters with walking aisles
    const [u0, s0, u1, s1] = b.r, W = u1 - u0, D = s1 - s0, alongU = W >= D, L = alongU ? W : D, T = alongU ? D : W;
    const rows = []; let t = 1.0;
    while (t < T - 0.6) { rows.push(t); if (t + 2.0 < T - 0.6) rows.push(t + 2.0); t += 5.4; }
    if (!rows.length) rows.push(T / 2);
    for (const rt of rows) for (let d = 0.4; d < L - 0.3; d += 0.74) {
      if (R() > b.f) continue;
      const f = R() < 0.5 ? 1 : -1, a = (R() - 0.5) * 0.5, jx = (R() - 0.5) * 0.3;
      const x = alongU ? u0 + d : u0 + rt + jx, z = alongU ? s0 + rt + jx : s0 + d;
      const hx = alongU ? Math.sin(a) : f * Math.cos(a), hz = alongU ? f * Math.cos(a) : Math.sin(a);
      put('bike', x, z, hx, hz, 0.92 + R() * 0.16);
    }
  }
  const vehicles = new THREE.Group(); vehicles.name = 'vehicles';
  const paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.22 });
  const matte = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 });
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  const counts = {};
  for (const [kind, geo, mat, shadow] of [['car', TR.carGeo(), paint, true], ['bus', TR.busGeo(), matte, true], ['truck', TR.semiGeo(), matte, true], ['bike', bikeGeo(), matte, false]]) {
    const arr = list[kind]; counts[kind] = arr.length; if (!arr.length) continue;
    const im = new THREE.InstancedMesh(geo, mat, arr.length);
    arr.forEach((v, i) => { Q.setFromAxisAngle(Y, v[2]); P.set(v[0], 0.02, v[1]); S.set(v[4], v[4], v[4]); M4.compose(P, Q, S); im.setMatrixAt(i, M4); col.setRGB(v[3][0], v[3][1], v[3][2]); im.setColorAt(i, col); });
    im.castShadow = shadow; im.receiveShadow = true; im.name = kind; vehicles.add(im);
  }
  wetMats.push(matte);
  root.add(vehicles);
  Object.assign(out, { walls, rail, gateLabels, vehicles, counts });
  return out;
}
