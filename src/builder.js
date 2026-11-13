// Geometry: everything is built in campus-grid metres (x = U, z = S, y up); the root group is rotated to true north.
import * as THREE from 'three';
import * as TX from './textures.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildSite } from './site.js';

class Acc {
  constructor() { this.p = []; this.n = []; this.uv = []; this.i = []; }
  quad(a, b, c, d, ua, ub, uc, ud) {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
    let l = Math.hypot(nx, ny, nz);
    if (l < 1e-7) {                                 // degenerate corner (a == d or a == b): use the opposite corner instead
      const f1 = [c[0] - b[0], c[1] - b[1], c[2] - b[2]], f2 = [d[0] - c[0], d[1] - c[1], d[2] - c[2]];
      nx = f1[1] * f2[2] - f1[2] * f2[1]; ny = f1[2] * f2[0] - f1[0] * f2[2]; nz = f1[0] * f2[1] - f1[1] * f2[0];
      l = Math.hypot(nx, ny, nz);
      if (l < 1e-7) { nx = 0; ny = 1; nz = 0; l = 1; }
    }
    nx /= l; ny /= l; nz /= l;
    const k = this.p.length / 3;
    for (const v of [a, b, c, d]) { this.p.push(v[0], v[1], v[2]); this.n.push(nx, ny, nz); }
    this.uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1], ud[0], ud[1]);
    this.i.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  tri(a, b, c, ua, ub, uc) {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const k = this.p.length / 3;
    for (const v of [a, b, c]) { this.p.push(v[0], v[1], v[2]); this.n.push(nx, ny, nz); }
    this.uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
    this.i.push(k, k + 1, k + 2);
  }
  // 4 walls of a rect; texW = metres of wall covered by one texture repeat; v runs 0..vTop over the height
  walls(r, y0, y1, texW, off = 0, vTop = 1) {
    const [u0, s0, u1, s1] = r, W = u1 - u0, D = s1 - s0;
    const q = (a, b, len, o) => this.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]],
      [o, 0], [o + len / texW, 0], [o + len / texW, vTop], [o, vTop]);
    q([u0, s1], [u1, s1], W, off);            // south (+z)
    q([u1, s0], [u0, s0], W, off + 0.37);     // north (-z)
    q([u1, s1], [u1, s0], D, off + 0.61);     // east  (+x)
    q([u0, s0], [u0, s1], D, off + 0.83);     // west  (-x)
  }
  top(r, y, tile, rot = false) {
    const [u0, s0, u1, s1] = r;
    const f = rot ? (u, s) => [s / tile, u / tile] : (u, s) => [u / tile, s / tile];
    this.quad([u0, y, s1], [u1, y, s1], [u1, y, s0], [u0, y, s0], f(u0, s1), f(u1, s1), f(u1, s0), f(u0, s0));
  }
  box(r, y0, y1, texW, tile) { this.walls(r, y0, y1, texW); this.top(r, y1, tile); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.i);
    return g;
  }
  get empty() { return this.i.length === 0; }
}

export function build(DATA, ctx) {
  const root = new THREE.Group();
  const R = TX.rng(20261112);
  const facadeMats = [];           // materials whose emissive follows the night factor
  const wetMats = [];              // materials that get glossier in the rain
  const pick = [];                 // meshes that answer clicks
  const labels = new THREE.Group(); labels.name = 'labels';
  const std = (o) => { const m = new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.9, metalness: 0 }, o)); return m; };

  // ------------------------------------------------ material cache
  const fcache = new Map();
  function facadeMat(kind, floors, H, seed = 1) {
    const key = `${kind}|${floors}|${Math.round(H)}|${seed % 3}`;
    if (!fcache.has(key)) {
      const t = TX.facade(kind, floors, H, seed % 3 + 1);
      const m = std({ map: t.map, emissiveMap: t.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0, roughness: kind === 'ware' || kind === 'metal' ? 0.62 : 0.93 });
      facadeMats.push(m); wetMats.push(m); fcache.set(key, m);
    }
    return fcache.get(key);
  }
  const rcache = new Map();
  function roofMat(kind) {
    if (!rcache.has(kind)) {
      const seam = ['pale', 'metal', 'blue', 'teal', 'whiteMetal'].includes(kind);
      const m = std({ map: TX.roof(kind), roughness: seam ? 0.5 : 0.92, metalness: seam ? 0.25 : 0 });
      wetMats.push(m); rcache.set(kind, m);
    }
    return rcache.get(kind);
  }
  const pvMat = { pv: std({ map: TX.pv(false), roughness: 0.28, metalness: 0.55 }), pvd: std({ map: TX.pv(true), roughness: 0.28, metalness: 0.55 }) };
  const equipMat = std({ color: 0x8f9494, roughness: 0.7, metalness: 0.3 });
  const chillMat = std({ map: TX.chillerTop(), roughness: 0.65, metalness: 0.3 });
  const parapetMat = std({ color: 0xcfcec8, roughness: 0.9 });
  const ROOFKIND = { pv: 'white', pvd: 'conc', eq: 'eq', white: 'white', conc: 'conc', beige: 'beige', dark: 'dark', pale: 'pale', metal: 'metal', blue: 'blue', teal: 'teal' };

  // shared accumulators for all the small stuff (merged -> few draw calls)
  const A = { equip: new Acc(), chill: new Acc(), parapet: new Acc(), pv: new Acc(), pvd: new Acc() };
  const extraAcc = new Map();
  const acc = (key) => { if (!extraAcc.has(key)) extraAcc.set(key, new Acc()); return extraAcc.get(key); };

  function parapet(r, y, hgt = 1.1, t = 0.45) {
    const [u0, s0, u1, s1] = r;
    for (const rr of [[u0, s0, u1, s0 + t], [u0, s1 - t, u1, s1], [u0, s0 + t, u0 + t, s1 - t], [u1 - t, s0 + t, u1, s1 - t]]) A.parapet.box(rr, y, y + hgt, 8, 8);
  }
  function roofClutter(r, y, density = 1) {        // AHUs / ducts along the north and south roof margins
    const [u0, s0, u1, s1] = r, W = u1 - u0, D = s1 - s0, margin = Math.min(9, D * 0.16);
    for (const side of [0, 1]) {
      let u = u0 + 4 + R() * 6;
      while (u < u1 - 10) {
        const w = 3 + R() * 7, d = 2 + R() * 3.2, h = 1.2 + R() * 2.2;
        const s = side ? s1 - 1.6 - d - R() * (margin - d - 1) : s0 + 1.6 + R() * (margin - d - 1);
        if (R() < 0.72 * density) A.equip.box([u, s, u + w, s + d], y, y + h, 6, 6);
        if (R() < 0.3 * density) A.equip.box([u + w * 0.3, s + (side ? -3 : d), u + w * 0.3 + 0.9, s + (side ? 0 : d + 3)], y + 0.3, y + 1.0, 6, 6);  // duct stub
        u += w + 3 + R() * 14;
      }
    }
  }
  function pvField(r, y, dark) {
    const [u0, s0, u1, s1] = r, W = u1 - u0, D = s1 - s0, a = dark ? A.pvd : A.pv;
    const m = Math.min(11, D * 0.2), mid = (u0 + u1) / 2;
    for (const [a0, a1] of [[u0 + W * 0.05, mid - 1.6], [mid + 1.6, u1 - W * 0.05]]) {
      const f = (u, s) => [u / TX.PV_TILE, s / TX.PV_TILE];
      const z0 = s0 + m, z1 = s1 - m, yy = y + 0.45;
      a.quad([a0, yy, z1], [a1, yy, z1], [a1, yy, z0], [a0, yy, z0], f(a0, z1), f(a1, z1), f(a1, z0), f(a0, z0));
    }
  }
  function chillers(r, y) {
    const [u0, s0, u1, s1] = r, W = u1 - u0, D = s1 - s0;
    for (const f of [0.26, 0.64]) {
      const cu = u0 + W * f;
      for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) {
        const x = cu + i * 3.1, z = s0 + D * 0.22 + j * (D * 0.3);
        const rr = [x, z, x + 2.4, z + D * 0.24];
        A.equip.walls(rr, y, y + 2.6, 4);
        A.chill.quad([rr[0], y + 2.6, rr[3]], [rr[2], y + 2.6, rr[3]], [rr[2], y + 2.6, rr[1]], [rr[0], y + 2.6, rr[1]], [0, 0], [1, 0], [1, 2], [0, 2]);
      }
    }
    A.equip.box([u0 + W * 0.84, s0 + D * 0.25, u0 + W * 0.96, s0 + D * 0.6], y, y + 3.2, 6, 6);   // stair / lift head
    A.equip.box([u0 + W * 0.04, s0 + D * 0.3, u0 + W * 0.14, s0 + D * 0.7], y, y + 2.8, 6, 6);
  }

  // ------------------------------------------------ main buildings
  const KIND = { P: 'prod', O: 'office', C: 'canteen', W: 'ware', U: 'conc', X: 'conc' };
  DATA.buildings.forEach((b, bi) => {
    const [u0, s0, u1, s1] = b.r, H = b.h, W = u1 - u0, D = s1 - s0;
    let kind = KIND[b.type];
    if (b.type === 'P' && ['white', 'metal'].includes(b.roof) && b.floors === 1) kind = 'metal';
    if (b.type === 'P' && b.roof === 'white' && b.floors === 1) kind = 'ware';
    if (b.id === 'K17') kind = 'orange';
    if (b.id === 'B16' || b.id === 'K15') kind = 'ware';
    const wa = new Acc(), ra = new Acc();
    const gable = ['pale', 'metal'].includes(b.roof);
    const vault = b.roof === 'blue';
    const rk = ROOFKIND[b.roof] || 'conc';
    wa.walls(b.r, 0, H, TX.FACADE_W, (bi * 0.173) % 1);
    if (gable) {                                   // E-W ridge, two slopes + gable-end triangles
      const rise = Math.min(3.2, D * 0.045), zm = (s0 + s1) / 2, t = TX.ROOF_TILE, y1 = H + rise;
      ra.quad([u0, H, s1], [u1, H, s1], [u1, y1, zm], [u0, y1, zm], [s1 / t, u0 / t], [s1 / t, u1 / t], [zm / t, u1 / t], [zm / t, u0 / t]);
      ra.quad([u1, H, s0], [u0, H, s0], [u0, y1, zm], [u1, y1, zm], [s0 / t, u1 / t], [s0 / t, u0 / t], [zm / t, u0 / t], [zm / t, u1 / t]);
      wa.tri([u1, H, s1], [u1, H, s0], [u1, y1, zm], [0, 0.97], [D / TX.FACADE_W, 0.97], [D / 2 / TX.FACADE_W, 1]);
      wa.tri([u0, H, s0], [u0, H, s1], [u0, y1, zm], [0, 0.97], [D / TX.FACADE_W, 0.97], [D / 2 / TX.FACADE_W, 1]);
    } else if (vault) {                            // barrel vault (arched ribs span N-S)
      const N = 10, rise = 5.5, t = TX.ROOF_TILE;
      for (let k = 0; k < N; k++) {
        const t0 = k / N, t1 = (k + 1) / N, za = s1 - D * t0, zb = s1 - D * t1;
        const ya = H + rise * Math.sin(Math.PI * t0), yb = H + rise * Math.sin(Math.PI * t1);
        ra.quad([u0, ya, za], [u1, ya, za], [u1, yb, zb], [u0, yb, zb], [u0 / 2, za / t], [u1 / 2, za / t], [u1 / 2, zb / t], [u0 / 2, zb / t]);
        for (const [ux, flip] of [[u1, 0], [u0, 1]]) {   // end caps
          const p = [[ux, H, za], [ux, H, zb], [ux, yb, zb], [ux, ya, za]];
          if (flip) p.reverse();
          wa.quad(p[0], p[1], p[2], p[3], [0, 0.6], [0.1, 0.6], [0.1, 0.7], [0, 0.7]);
        }
      }
    } else {
      ra.top(b.r, H, TX.ROOF_TILE);
      parapet(b.r, H);
      if (b.roof === 'pv' || b.roof === 'pvd') { pvField(b.r, H, b.roof === 'pvd'); roofClutter(b.r, H, 1); }
      else if (b.roof === 'eq') { chillers(b.r, H); roofClutter(b.r, H, 0.35); }
      else if (b.roof === 'conc' && b.type !== 'X') roofClutter(b.r, H, 1.3);
      else if (b.roof === 'white' && b.type === 'P') roofClutter(b.r, H, 0.25);
    }
    const g = new THREE.Group();
    const mw = new THREE.Mesh(wa.geometry(), facadeMat(kind, b.floors, H, bi));
    const mr = new THREE.Mesh(ra.geometry(), roofMat(rk));
    for (const m of [mw, mr]) { m.castShadow = m.receiveShadow = true; m.userData.b = b; pick.push(m); g.add(m); }
    root.add(g);
    b._mesh = g;
    // label
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.labelSprite(b.id), depthTest: false, transparent: true, fog: false }));
    const sc = Math.min(46, Math.max(22, W * 0.26)); sp.scale.set(sc, sc * 96 / 256, 1);
    sp.position.set((u0 + u1) / 2, H + (vault ? 12 : 9), (s0 + s1) / 2); sp.renderOrder = 10; sp.userData.b = b;
    if (!/^HF/.test(b.id)) labels.add(sp);
  });

  // ------------------------------------------------ annexes, sheds, link cores
  for (const e of DATA.extras) {
    const [u0, s0, u1, s1] = e.r, H = e.h, W = u1 - u0, D = s1 - s0;
    let wk = 'white';
    if (e.roof === 'pvd') wk = H <= 5 ? 'steel' : 'conc';
    else if (e.roof === 'conc') wk = 'conc';
    else if (['blue', 'teal'].includes(e.roof)) wk = 'shed';
    else if (H <= 6) wk = 'shed';
    const openCarport = e.roof === 'pvd' && H <= 5;
    const wa = acc('w|' + wk + '|' + Math.round(H));
    const fl = Math.max(1, Math.round(H / 5.5));
    if (openCarport) {                             // PV car / bike ports: posts + a thin PV-covered roof
      const n = Math.max(2, Math.round(Math.max(W, D) / 9));
      for (let i = 0; i <= n; i++) {
        const u = W >= D ? u0 + W * i / n : u0, s = W >= D ? s0 : s0 + D * i / n;
        for (const o of [0, 1]) { const pu = W >= D ? u : u + o * (W - 0.3), ps = W >= D ? s + o * (D - 0.3) : s; A.equip.walls([pu, ps, pu + 0.3, ps + 0.3], 0, H - 0.3, 3); }
      }
      A.equip.walls(e.r, H - 0.3, H, 6);
      const f = (u, s) => [u / TX.PV_TILE, s / TX.PV_TILE];
      A.pvd.quad([u0, H, s1], [u1, H, s1], [u1, H, s0], [u0, H, s0], f(u0, s1), f(u1, s1), f(u1, s0), f(u0, s0));
      continue;
    }
    wa.walls(e.r, 0, H, TX.FACADE_W, R());
    wa._kind = wk; wa._fl = fl; wa._H = H;
    const rk = e.roof === 'pvd' ? 'conc' : (ROOFKIND[e.roof] || 'white');
    acc('r|' + rk).top(e.r, H, TX.ROOF_TILE);
    if (e.roof === 'pvd') { const f = (u, s) => [u / TX.PV_TILE, s / TX.PV_TILE]; const m = 2, y = H + 0.4; A.pvd.quad([u0 + m, y, s1 - m], [u1 - m, y, s1 - m], [u1 - m, y, s0 + m], [u0 + m, y, s0 + m], f(u0, s1), f(u1, s1), f(u1, s0), f(u0, s0)); }
    if (H >= 10 && !['blue', 'teal'].includes(e.roof)) parapet(e.r, H, 0.9, 0.35);
  }
  // ------------------------------------------------ context buildings
  for (const c of DATA.context) {
    const H = c.h, tall = H >= 40;
    const wk = tall ? 'tower' : c.roof === 'dark' ? 'dark' : c.roof === 'white' ? 'ware' : 'conc';
    const wa = acc('w|' + wk + '|' + Math.round(H));
    wa.walls(c.r, 0, H, TX.FACADE_W, R()); wa._kind = wk; wa._fl = Math.max(1, Math.round(H / 5)); wa._H = H;
    acc('r|' + (c.roof === 'white' ? 'whiteMetal' : c.roof === 'dark' ? 'dark' : c.roof === 'metal' ? 'metal' : 'conc')).top(c.r, H, TX.ROOF_TILE);
    if (c.roof !== 'white') parapet(c.r, H, 0.9, 0.4);
  }
  // ------------------------------------------------ conveyor bridges between buildings
  const br = acc('w|bridge|5');
  br._kind = 'bridge'; br._fl = 1; br._H = 5;
  for (const b of DATA.bridges) {
    const [u0, s0, u1, s1] = b.r, y0 = b.clear, y1 = b.clear + b.th;
    br.walls(b.r, y0, y1, 12);
    acc('r|whiteMetal').top(b.r, y1, TX.ROOF_TILE);
    A.equip.quad([u0, y0, s0], [u1, y0, s0], [u1, y0, s1], [u0, y0, s1], [0, 0], [1, 0], [1, 1], [0, 1]);   // soffit
  }
  // ------------------------------------------------ pipe racks / conveyor galleries along the roads
  const st = acc('w|steel|2');
  st._kind = 'steel'; st._fl = 1; st._H = 2;
  for (const p of DATA.pipes) {
    for (let i = 0; i + 1 < p.line.length; i++) {
      const [ax, az] = p.line[i], [bx, bz] = p.line[i + 1], w = p.w / 2, y0 = p.h, y1 = p.h + 2.2;
      const horiz = Math.abs(bx - ax) >= Math.abs(bz - az);
      const len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len, nx = -dz * w, nz = dx * w;
      const c = [[ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz], [ax - nx, az - nz]];
      const V = (k, y) => [c[k][0], y, c[k][1]];
      const t = len / 12;
      st.quad(V(3, y0), V(2, y0), V(2, y1), V(3, y1), [0, 0], [t, 0], [t, 1], [0, 1]);
      st.quad(V(1, y0), V(0, y0), V(0, y1), V(1, y1), [0, 0], [t, 0], [t, 1], [0, 1]);
      A.equip.quad(V(0, y1), V(3, y1), V(2, y1), V(1, y1), [0, 0], [1, 0], [1, 1], [0, 1]);
      A.equip.quad(V(0, y0), V(1, y0), V(2, y0), V(3, y0), [0, 0], [1, 0], [1, 1], [0, 1]);
      const n = Math.max(1, Math.round(len / 18));
      for (let k = 0; k <= n; k++) {                // support bents
        const px = ax + (bx - ax) * k / n, pz = az + (bz - az) * k / n;
        for (const s of [-1, 1]) { const qx = px + nx * s * 0.9, qz = pz + nz * s * 0.9; A.equip.walls([qx - 0.25, qz - 0.25, qx + 0.25, qz + 0.25], 0, y0, 3); }
      }
      void horiz;
    }
  }
  // flush accumulators
  for (const [key, a] of extraAcc) {
    if (a.empty) continue;
    const [t, k, hh] = key.split('|');
    const mat = t === 'w' ? facadeMat(a._kind || k, a._fl || 1, a._H || +hh, 1) : roofMat(k);
    const m = new THREE.Mesh(a.geometry(), mat); m.castShadow = m.receiveShadow = true; root.add(m);
  }
  for (const [k, mat] of [['equip', equipMat], ['chill', chillMat], ['parapet', parapetMat], ['pv', pvMat.pv], ['pvd', pvMat.pvd]]) {
    if (A[k].empty) continue;
    const m = new THREE.Mesh(A[k].geometry(), mat); m.castShadow = k !== 'pv' && k !== 'pvd' && k !== 'chill'; m.receiveShadow = true; root.add(m);
  }
  wetMats.push(pvMat.pv, pvMat.pvd, equipMat, parapetMat);

  // ------------------------------------------------ sports grounds
  for (const c of DATA.courts) {
    const [u0, s0, u1, s1] = c.r, W = u1 - u0, D = s1 - s0;
    const map = c.kind === 'track' ? TX.track(D > W) : TX.courts(c.kind, W, D);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W, D), std({ map, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.rotation.x = -Math.PI / 2; m.position.set((u0 + u1) / 2, 0.06, (s0 + s1) / 2); m.receiveShadow = true; root.add(m);
  }

  // ------------------------------------------------ ground (class map -> procedural materials in the shader)
  const G = DATA.ground;
  const cls = ctx.groundTex; cls.colorSpace = THREE.NoColorSpace; cls.anisotropy = 8; cls.flipY = true;
  const noise = TX.noiseTex();
  const gmat = std({ map: cls, roughness: 0.95 });
  const gu = { uNoise: { value: noise }, uWet: { value: 0 }, uSize: { value: new THREE.Vector2(G.w * G.mpp, G.h * G.mpp) } };
  gmat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, gu);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uNoise; uniform float uWet; uniform vec2 uSize; float gWet;`)
      .replace('#include <map_fragment>', `
        vec4 cls = texture2D(map, vMapUv);
        float inside = step(0.0, vMapUv.x) * step(vMapUv.x, 1.0) * step(0.0, vMapUv.y) * step(vMapUv.y, 1.0);
        cls *= inside;
        vec2 wp = vMapUv * uSize;
        vec3 n1 = texture2D(uNoise, wp / 90.0).rgb, n2 = texture2D(uNoise, wp / 13.0).rgb, n3 = texture2D(uNoise, wp / 2.7).rgb;
        float nn = n1.r * 0.55 + n2.g * 0.3 + n3.b * 0.15;
        vec3 earth = mix(vec3(0.115, 0.098, 0.066), vec3(0.19, 0.165, 0.105), nn);
        earth = mix(earth, vec3(0.085, 0.12, 0.045), smoothstep(0.5, 0.75, n1.g) * 0.6);
        vec3 nF = texture2D(uNoise, wp / 1700.0 + 0.37).rgb, nG = texture2D(uNoise, wp / 420.0 + 0.11).rgb;
        vec3 field = mix(vec3(0.20, 0.18, 0.11), vec3(0.085, 0.125, 0.045), smoothstep(0.38, 0.62, nF.r * 0.6 + nG.g * 0.4));
        field = mix(field, vec3(0.25, 0.22, 0.15), smoothstep(0.58, 0.72, nF.b * 0.7 + nG.r * 0.3));
        earth = mix(earth, field * (0.75 + 0.5 * nn), 0.8);
        vec3 paved = vec3(0.245, 0.24, 0.225) * (0.72 + 0.5 * nn);
        vec2 jf = abs(fract(wp / 6.0) - 0.5) * 6.0; float jw = fwidth(wp.x) * 1.2 + 0.035;
        float joint = 1.0 - smoothstep(0.0, jw, min(jf.x, jf.y));
        paved *= 1.0 - 0.32 * joint * clamp(0.6 / jw * 0.06, 0.0, 1.0);
        paved = mix(paved, paved * 0.72, smoothstep(0.62, 0.8, n2.r) * 0.6);              // oil / tyre stains
        vec3 grass = mix(vec3(0.050, 0.072, 0.024), vec3(0.095, 0.115, 0.042), n2.g * 0.6 + n3.r * 0.4);
        vec3 asph = vec3(0.040, 0.041, 0.044) * (0.75 + 0.55 * (n2.b * 0.6 + n3.g * 0.4));
        vec3 gc = mix(earth, paved, cls.r);
        float gmask = smoothstep(0.42, 0.56, cls.g + (n3.r - 0.5) * 0.35 + (n2.b - 0.5) * 0.25);
        gc = mix(gc, grass * (0.8 + 0.5 * n3.g), gmask);
        gc = mix(gc, asph, smoothstep(0.3, 0.7, cls.b));
        float puddle = smoothstep(0.45, 0.7, n1.b * 0.6 + n2.r * 0.4) * (1.0 - smoothstep(0.25, 0.7, cls.g));
        gWet = uWet * (0.45 + 0.55 * puddle);
        gc *= 1.0 - 0.38 * uWet;
        diffuseColor.rgb = gc;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.08, gWet);`);
  };
  const GK = 10, gGeo = new THREE.PlaneGeometry(G.w * G.mpp * GK, G.h * G.mpp * GK);
  { const uv = gGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) - 0.5) * GK + 0.5, (uv.getY(i) - 0.5) * GK + 0.5); }
  cls.wrapS = cls.wrapT = THREE.ClampToEdgeWrapping;
  const gm = new THREE.Mesh(gGeo, gmat);
  gm.rotation.x = -Math.PI / 2; gm.position.set(G.u0 + G.w * G.mpp / 2, 0, G.s0 + G.h * G.mpp / 2); gm.receiveShadow = true; root.add(gm);
  const far = new THREE.Mesh(new THREE.PlaneGeometry(160000, 160000), std({ color: 0x6f6a55, roughness: 1 }));
  far.rotation.x = -Math.PI / 2; far.position.y = -3; root.add(far);

  // ------------------------------------------------ lane markings on municipal roads
  const laneTex = { 2: TX.laneMarks(2), 3: TX.laneMarks(3) };
  const roadsG = new THREE.Group(); roadsG.name = 'roads';
  for (const rd of DATA.roads) {
    if (rd.kind !== 'main') continue;
    const lanes = rd.w >= 30 ? 3 : 2, a = new Acc(), w = rd.w * 0.42;
    for (let i = 0; i + 1 < rd.line.length; i++) {
      const [ax, az] = rd.line[i], [bx, bz] = rd.line[i + 1], len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len, nx = -dz * w, nz = dx * w;
      a.quad([ax - nx, 0.05, az - nz], [ax + nx, 0.05, az + nz], [bx + nx, 0.05, bz + nz], [bx - nx, 0.05, bz - nz], [0, 0], [1, 0], [1, len / 12], [0, len / 12]);
    }
    const m = new THREE.Mesh(a.geometry(), new THREE.MeshStandardMaterial({ map: laneTex[lanes], transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, depthWrite: false, side: THREE.DoubleSide }));
    m.receiveShadow = true; roadsG.add(m);
  }
  // municipal roads continue beyond the mapped area
  { const a = new Acc(), G0 = DATA.ground, bx0 = G0.u0, bx1 = G0.u0 + G0.w * G0.mpp, bz0 = G0.s0, bz1 = G0.s0 + G0.h * G0.mpp, L = 9000;
    for (const rd of DATA.roads) { if (rd.kind !== 'main') continue; const w = rd.w / 2;
      for (const [x, z] of [rd.line[0], rd.line[rd.line.length - 1]]) {
        if (Math.abs(x - bx0) < 2) a.top([x - L, z - w, x, z + w], 0.04, 12); else if (Math.abs(x - bx1) < 2) a.top([x, z - w, x + L, z + w], 0.04, 12);
        else if (Math.abs(z - bz0) < 2) a.top([x - w, z - L, x + w, z], 0.04, 12); else if (Math.abs(z - bz1) < 2) a.top([x - w, z, x + w, z + L], 0.04, 12); } }
    if (!a.empty) { const m = new THREE.Mesh(a.geometry(), std({ color: 0x3b3c3f, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); m.receiveShadow = true; root.add(m); wetMats.push(m.material); } }
  root.add(roadsG);

  // ------------------------------------------------ trees (instanced, positions taken from the satellite image)
  let crown = new THREE.IcosahedronGeometry(1, 2); crown.deleteAttribute('uv'); crown.deleteAttribute('normal'); crown = mergeVertices(crown, 1e-4);
  { const p = crown.attributes.position, r = TX.rng(5);
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 0.82 + 0.36 * Math.abs(Math.sin(x * 5.1 + y * 3.3) * Math.cos(z * 4.7 + y * 2.1)); void r; p.setXYZ(i, x * k, y * k * 0.9 + 0.75, z * k); }
    crown.computeVertexNormals(); }
  const tmat = std({ color: 0xffffff, roughness: 0.95 });
  tmat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= 0.55 + 0.75 * smoothstep(-0.2, 1.0, normalize(vNormal).y * 0.5 + 0.5);'); };
  const trees = new THREE.InstancedMesh(crown, tmat, DATA.trees.length);
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S3 = new THREE.Vector3(), col = new THREE.Color();
  DATA.trees.forEach((t, i) => {
    const rad = t[2] * (0.85 + R() * 0.3), hgt = rad * (1.25 + R() * 0.6);
    Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6.28); V.set(t[0], rad * 0.25, t[1]); S3.set(rad, hgt, rad);
    M4.compose(V, Q, S3); trees.setMatrixAt(i, M4);
    col.setHSL(0.23 + R() * 0.08, 0.30 + R() * 0.2, 0.05 + R() * 0.055); trees.setColorAt(i, col);
  });
  trees.castShadow = true; trees.receiveShadow = true; trees.name = 'trees'; root.add(trees);

  // ------------------------------------------------ street lights along municipal roads (emissive heads + ground glow at night)
  const lampPos = [];
  for (const rd of DATA.roads) {
    const step = rd.kind === 'main' ? 42 : 55, off = rd.w / 2 + (rd.kind === 'main' ? 1.5 : 1);
    for (let i = 0; i + 1 < rd.line.length; i++) {
      const [ax, az] = rd.line[i], [bx, bz] = rd.line[i + 1], len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len;
      for (let d = step / 2, k = 0; d < len; d += step, k++) { const s = (k % 2 ? 1 : -1) * off; lampPos.push([ax + dx * d - dz * s, az + dz * d + dx * s]); }
    }
  }
  const poleG = new THREE.CylinderGeometry(0.12, 0.16, 9, 5); poleG.translate(0, 4.5, 0);
  const poles = new THREE.InstancedMesh(poleG, std({ color: 0x70767a, roughness: 0.6, metalness: 0.5 }), lampPos.length);
  const headM = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd9a0, emissiveIntensity: 0 });
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(1.3, 0.2, 0.5), headM, lampPos.length);
  const glowM = new THREE.MeshBasicMaterial({ map: TX.glow(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const glowG = new THREE.PlaneGeometry(26, 26); glowG.rotateX(-Math.PI / 2);
  const glows = new THREE.InstancedMesh(glowG, glowM, lampPos.length);
  lampPos.forEach((p, i) => {
    M4.makeTranslation(p[0], 0, p[1]); poles.setMatrixAt(i, M4);
    M4.makeTranslation(p[0], 9, p[1]); heads.setMatrixAt(i, M4);
    M4.makeTranslation(p[0], 0.12, p[1]); glows.setMatrixAt(i, M4);
  });
  glows.renderOrder = 3;
  const lamps = new THREE.Group(); lamps.name = 'lamps'; lamps.add(poles, heads, glows); root.add(lamps);

  // ------------------------------------------------ zone labels
  const zoneLabels = new THREE.Group(); zoneLabels.name = 'zoneLabels';
  for (const s of DATA.sites) {
    if (!s.zone) continue;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.labelSprite(s.zone + '区', true), depthTest: false, transparent: true, fog: false }));
    sp.scale.set(96, 96 * 160 / 256, 1); sp.position.set((s.r[0] + s.r[2]) / 2, 60, (s.r[1] + s.r[3]) / 2); sp.renderOrder = 11; zoneLabels.add(sp);
  }
  root.add(labels, zoneLabels);

  const site = buildSite(DATA, Acc, std, root, wetMats);

  return { root, pick, labels, zoneLabels, roadsG, trees, lamps, facadeMats, wetMats, groundUniforms: gu, headM, glowM, site };
}
