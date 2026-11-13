// Floor layouts and detailed interiors for the exploded-building view.
// Local frame of a floor: x = 0..W (west -> east), z = 0..D (north -> south), y up from the floor finish.
// The interior partitioning is ILLUSTRATIVE (ring of side rooms around central production lines, as described by the user);
// only the building outline, the storey count and the gate names come from data.
import * as THREE from 'three';
import * as TX from '../textures.js';
import { Acc } from '../builder.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ------------------------------------------------------------------ coloured box batch (one mesh for all furniture)
const FACES = [
  [[1, 0, 0], [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]]],
  [[-1, 0, 0], [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]]],
  [[0, 1, 0], [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]]],
  [[0, 0, 1], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]],
  [[0, 0, -1], [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]]],
];
const colCache = new Map();
function col(hex) { if (!colCache.has(hex)) { const c = new THREE.Color(hex); colCache.set(hex, [c.r, c.g, c.b]); } return colCache.get(hex); }
class Boxes {
  constructor() { this.p = []; this.n = []; this.c = []; this.i = []; }
  add(x0, y0, z0, x1, y1, z1, hex) {
    if (x1 < x0) [x0, x1] = [x1, x0]; if (z1 < z0) [z0, z1] = [z1, z0];
    const c = col(hex), X = [x0, x1], Y = [y0, y1], Z = [z0, z1];
    for (const [n, cs] of FACES) {
      const k = this.p.length / 3;
      for (const q of cs) { this.p.push(X[q[0]], Y[q[1]], Z[q[2]]); this.n.push(n[0], n[1], n[2]); this.c.push(c[0], c[1], c[2]); }
      this.i.push(k, k + 1, k + 2, k, k + 2, k + 3);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i); return g;
  }
}

// ------------------------------------------------------------------ gate names
const SIDE = { '北': 'N', '南': 'S', '東': 'E', '东': 'E', '西': 'W' };
const NUM = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6 };
// "ZZ-C09-1F-北一門" -> { site, bld, floor, name, side, idx }   (side / idx are null when the name carries no direction)
export function parseGate(id) {
  const m = /^([A-Za-z]+)-([A-Za-z]+\d+[A-Za-z]?)-(\d+)F-(.+)$/.exec(String(id).trim());
  if (!m) return null;
  const name = m[4], side = SIDE[name[0]] || null, idx = side ? (NUM[name[1]] || 1) : null;
  return { id: `${m[1]}-${m[2]}-${m[3]}F-${name}`, site: m[1], bld: m[2].toUpperCase(), floor: +m[3], name, side, idx };
}
const P_PATTERNS = [['北一門', '南一門', '東一門'], ['北一門', '北二門', '南一門'], ['北一門', '南一門'], ['北一門', '南一門', '西一門']];
const LOOSE = ['物流門', '碼頭門', '貨梯廳'];
// Simulated gate list for one building (2-3 per production floor, 2 + 2 at the ends of an office block).
export function demoGateNames(b, seed) {
  const R = TX.rng(seed), out = [];
  for (let f = 1; f <= b.floors; f++) {
    let names;
    if (b.type === 'O') names = ['東一門', '東二門', '西一門', '西二門'];
    else { names = P_PATTERNS[(Math.floor(R() * 4) + f) % 4].slice(); if (f === 1 && R() < 0.4) names.push(LOOSE[Math.floor(R() * LOOSE.length)]); }
    for (const n of names) out.push(`ZZ-${b.id}-${f}F-${n}`);
  }
  return out;
}

// ------------------------------------------------------------------ layout
const ROOM_P = [['office', '办公室', 3], ['lab', '测试实验室', 3], ['store', '物料暂存', 3], ['qc', '品管室', 2], ['meet', '会议室', 1.5], ['equip', '设备间', 1.5], ['tea', '休息区', 1], ['locker', '更衣室', 1.2], ['train', '培训室', 0.8]];
const ROOM_O = [['office', '办公区', 7], ['meet', '会议室', 2.5], ['mgr', '主管室', 1.5], ['tea', '茶水间', 0.8], ['file', '资料室', 0.7], ['train', '培训室', 0.8]];
function pickW(R, tab) { let s = 0; for (const t of tab) s += t[2]; let v = R() * s; for (const t of tab) { v -= t[2]; if (v <= 0) return t; } return tab[0]; }

export function makeLayout(b, floor, gates, seed) {
  const W = b.r[2] - b.r[0], D = b.r[3] - b.r[1], R = TX.rng(seed * 131 + floor * 977 + 5), isO = b.type === 'O' || D < 36;
  const L = { W, D, floor, isO, rooms: [], lobbies: [], aisles: [], zones: [], lines: [], cols: [], gates: [], R };
  // gates: position on the outer wall from the direction in the name; the n-th gate of a side is spread evenly west->east / north->south
  const per = {}; for (const g of gates) if (g.side) per[g.side] = Math.max(per[g.side] || 0, g.idx);
  let loose = 0;
  for (const g of gates) {
    const q = { g };
    if (g.side === 'N' || g.side === 'S') { q.x = W * g.idx / (per[g.side] + 1); q.z = g.side === 'N' ? 0 : D; q.nx = 0; q.nz = g.side === 'N' ? 1 : -1; }
    else if (g.side) { q.z = D * g.idx / (per[g.side] + 1); q.x = g.side === 'W' ? 0 : W; q.nz = 0; q.nx = g.side === 'W' ? 1 : -1; }
    else { q.x = -9; q.z = D - 6 - 11 * loose++; q.nx = 1; q.nz = 0; q.loose = true; }
    L.gates.push(q);
  }
  const on = (s) => L.gates.filter((q) => q.g.side === s);
  // split [a0,a1] into rooms, leaving a lobby of half-width hw at every gate coordinate
  const band = (a0, a1, cuts, hw, wmin, wmax, each) => {
    const iv = []; let a = a0;
    for (const c of cuts.slice().sort((p, q) => p - q)) { if (c - hw > a + 3) iv.push([a, c - hw]); a = Math.max(a, c + hw); }
    if (a1 > a + 3) iv.push([a, a1]);
    for (const [s0, s1] of iv) { let s = s0; while (s1 - s > 0.5) { let w = wmin + R() * (wmax - wmin); if (s1 - s - w < wmin * 0.75) w = s1 - s; each(s, s + w); s += w; } }
  };
  const room = (x0, z0, x1, z1, tab, door) => { const t = pickW(R, tab); L.rooms.push({ x0, z0, x1, z1, kind: t[0], name: t[1], door }); };
  if (!isO) {
    const bd = Math.min(8, D * 0.14), cw = 11, ai = 4;
    L.bd = bd; L.cw = cw; L.ai = ai;
    band(cw, W - cw, on('N').map((q) => q.x), 4.2, 8, 15, (a, c) => room(a, 0, c, bd, ROOM_P, 'S'));
    band(cw, W - cw, on('S').map((q) => q.x), 4.2, 8, 15, (a, c) => room(a, D - bd, c, D, ROOM_P, 'N'));
    const core = ['stair', 'lift', 'wc', 'locker', 'equip', 'store', 'stair'], cn = { stair: '楼梯间', lift: '货梯厅', wc: '洗手间', locker: '鞋柜区', equip: '配电房', store: '备品仓' };
    let k = 0;
    band(0, D, on('W').map((q) => q.z), 4.2, 7, 11, (a, c) => { const t = core[k++ % core.length]; L.rooms.push({ x0: 0, z0: a, x1: cw, z1: c, kind: t, name: cn[t], door: 'E' }); });
    k = 3;
    band(0, D, on('E').map((q) => q.z), 4.2, 7, 11, (a, c) => { const t = core[k++ % core.length]; L.rooms.push({ x0: W - cw, z0: a, x1: W, z1: c, kind: t, name: cn[t], door: 'W' }); });
    for (const q of on('N')) L.lobbies.push({ x0: q.x - 4.2, z0: 0, x1: q.x + 4.2, z1: bd, q });
    for (const q of on('S')) L.lobbies.push({ x0: q.x - 4.2, z0: D - bd, x1: q.x + 4.2, z1: D, q });
    for (const q of on('W')) L.lobbies.push({ x0: 0, z0: q.z - 4.2, x1: cw, z1: q.z + 4.2, q });
    for (const q of on('E')) L.lobbies.push({ x0: W - cw, z0: q.z - 4.2, x1: W, z1: q.z + 4.2, q });
    // ring aisle
    L.aisles.push({ x0: cw, z0: bd, x1: W - cw, z1: bd + ai }, { x0: cw, z0: D - bd - ai, x1: W - cw, z1: D - bd }, { x0: cw, z0: bd, x1: cw + ai, z1: D - bd }, { x0: W - cw - ai, z0: bd, x1: W - cw, z1: D - bd });
    const px0 = cw + ai, px1 = W - cw - ai, pz0 = bd + ai, pz1 = D - bd - ai, pw = px1 - px0;
    L.prod = { x0: px0, z0: pz0, x1: px1, z1: pz1 };
    // production zones: ground floor has a warehouse bay on the west, the top-but-one floor a test bay on the east
    const zs = []; let a = px0, bEnd = px1; const cross = 3.6;
    if (floor === 1 && pw > 70) { zs.push({ kind: 'ware', x0: a, x1: a + pw * 0.28 }); a += pw * 0.28; L.aisles.push({ x0: a, z0: pz0, x1: a + cross, z1: pz1 }); a += cross; }
    if (floor === 3 && pw > 70) { bEnd = px1 - pw * 0.24; zs.push({ kind: 'test', x0: bEnd + cross, x1: px1 }); L.aisles.push({ x0: bEnd, z0: pz0, x1: bEnd + cross, z1: pz1 }); }
    if (bEnd - a > 78) { const mid = (a + bEnd) / 2; zs.push({ kind: 'lines', x0: a, x1: mid - cross / 2 }, { kind: 'lines', x0: mid + cross / 2, x1: bEnd }); L.aisles.push({ x0: mid - cross / 2, z0: pz0, x1: mid + cross / 2, z1: pz1 }); }
    else zs.push({ kind: 'lines', x0: a, x1: bEnd });
    for (const z of zs) { z.z0 = pz0; z.z1 = pz1; L.zones.push(z); }
    const nl = Math.max(1, Math.floor((pz1 - pz0) / 6)), off = ((pz1 - pz0) - (nl - 1) * 6) / 2;
    for (const z of zs) if (z.kind === 'lines') for (let i = 0; i < nl; i++) L.lines.push({ x0: z.x0 + 1.2, x1: z.x1 - 1.2, z: pz0 + off + i * 6, i });
    for (let x = px0 + 0.4; x <= px1; x += 9) for (let zz = pz0 + off + 3; zz < pz1 - 2; zz += 12) L.cols.push([x, zz]);
    for (let x = cw; x <= W - cw + 0.1; x += 9) { L.cols.push([x, bd]); L.cols.push([x, D - bd]); }
  } else {
    const cw = Math.min(9, W * 0.1), cz0 = D / 2 - 1.3, cz1 = D / 2 + 1.3;
    L.cw = cw; L.bd = cz0; L.ai = 2.6;
    L.aisles.push({ x0: cw, z0: cz0, x1: W - cw, z1: cz1 });
    band(cw, W - cw, [], 0, 8, 18, (a, c) => room(a, 0, c, cz0, ROOM_O, 'S'));
    band(cw, W - cw, [], 0, 8, 18, (a, c) => room(a, cz1, c, D, ROOM_O, 'N'));
    for (const [x0, x1, door, side] of [[0, cw, 'E', 'W'], [W - cw, W, 'W', 'E']]) {
      const gs = on(side), lz0 = Math.min(D * 0.2, 5.5), lz1 = D - lz0;
      if (gs.length) { L.lobbies.push({ x0, z0: lz0, x1, z1: lz1, q: gs[0], qs: gs }); L.rooms.push({ x0, z0: 0, x1, z1: lz0, kind: 'stair', name: '楼梯间', door }, { x0, z0: lz1, x1, z1: D, kind: 'wc', name: '洗手间', door }); }
      else L.rooms.push({ x0, z0: 0, x1, z1: D / 2, kind: 'stair', name: '楼梯间', door }, { x0, z0: D / 2, x1, z1: D, kind: 'wc', name: '洗手间', door });
    }
    for (let x = cw; x <= W - cw + 0.1; x += 9) { L.cols.push([x, cz0]); L.cols.push([x, cz1]); }
  }
  return L;
}

// ------------------------------------------------------------------ floor finish texture
const FLOOR = { office: '#8d99a6', mgr: '#93897c', meet: '#978b7e', train: '#8d99a6', lab: '#d6dad6', qc: '#dcdfdc', store: '#a4a6a2', file: '#b3b4ae', equip: '#98aa9e', tea: '#bda47f', locker: '#b6babd', wc: '#cfd6d8', stair: '#b2b3ae', lift: '#a9aaa6' };
function floorTexture(L) {
  const ppm = Math.min(3072 / L.W, 24), cw = Math.round(L.W * ppm), ch = Math.round(L.D * ppm);
  const c = document.createElement('canvas'); c.width = cw; c.height = ch; const g = c.getContext('2d'), R = TX.rng(L.floor * 71 + 3);
  const m = (v) => v * ppm, rect = (r, f) => { g.fillStyle = f; g.fillRect(m(r.x0), m(r.z0), m(r.x1 - r.x0), m(r.z1 - r.z0)); };
  const line = (x0, z0, x1, z1, w, s, dash) => { g.strokeStyle = s; g.lineWidth = Math.max(1, m(w)); g.setLineDash(dash ? dash.map(m) : []); g.beginPath(); g.moveTo(m(x0), m(z0)); g.lineTo(m(x1), m(z1)); g.stroke(); g.setLineDash([]); };
  g.fillStyle = '#c4c6c2'; g.fillRect(0, 0, cw, ch);
  if (L.prod) rect(L.prod, '#86b29a');
  for (const z of L.zones) {
    if (z.kind === 'ware') { rect(z, '#a9aca9'); }
    if (z.kind === 'test') { rect(z, '#b3c1c8'); }
  }
  for (const ln of L.lines) { rect({ x0: ln.x0 - 0.3, z0: ln.z - 1.75, x1: ln.x1 + 0.3, z1: ln.z + 1.75 }, '#6c9a82'); g.strokeStyle = '#e3c53c'; g.lineWidth = Math.max(1, m(0.09)); g.strokeRect(m(ln.x0 - 0.3), m(ln.z - 1.75), m(ln.x1 - ln.x0 + 0.6), m(3.5)); }
  for (const r of L.rooms) {
    rect(r, FLOOR[r.kind] || '#c4c6c2');
    if (['lab', 'qc', 'wc', 'locker', 'tea', 'stair', 'lift'].includes(r.kind)) { g.strokeStyle = 'rgba(40,50,55,0.13)'; g.lineWidth = 1; g.beginPath(); for (let x = r.x0; x < r.x1; x += 0.6) { g.moveTo(m(x), m(r.z0)); g.lineTo(m(x), m(r.z1)); } for (let z = r.z0; z < r.z1; z += 0.6) { g.moveTo(m(r.x0), m(z)); g.lineTo(m(r.x1), m(z)); } g.stroke(); }
    if (['office', 'train', 'mgr', 'meet'].includes(r.kind)) { for (let x = r.x0; x < r.x1; x += 0.5) for (let z = r.z0; z < r.z1; z += 0.5) if (R() < 0.5) { g.fillStyle = `rgba(${R() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 + R() * 0.05})`; g.fillRect(m(x), m(z), m(0.5), m(0.5)); } }
  }
  for (const a of [...L.aisles, ...L.lobbies]) rect(a, '#9ea2a3');
  // aisle edge lines (yellow) and a blue AGV guide down the middle
  for (const a of L.aisles) {
    const horiz = (a.x1 - a.x0) >= (a.z1 - a.z0);
    if (horiz) { line(a.x0, a.z0 + 0.12, a.x1, a.z0 + 0.12, 0.11, '#e6c634'); line(a.x0, a.z1 - 0.12, a.x1, a.z1 - 0.12, 0.11, '#e6c634'); line(a.x0, (a.z0 + a.z1) / 2, a.x1, (a.z0 + a.z1) / 2, 0.06, '#2f6fb8', [0.9, 0.5]); }
    else { line(a.x0 + 0.12, a.z0, a.x0 + 0.12, a.z1, 0.11, '#e6c634'); line(a.x1 - 0.12, a.z0, a.x1 - 0.12, a.z1, 0.11, '#e6c634'); line((a.x0 + a.x1) / 2, a.z0, (a.x0 + a.x1) / 2, a.z1, 0.06, '#2f6fb8', [0.9, 0.5]); }
  }
  // aisle crossings are repainted so the edge lines do not run across junctions
  for (const a of L.aisles) for (const b of L.aisles) { if (a === b) continue; const x0 = Math.max(a.x0, b.x0), x1 = Math.min(a.x1, b.x1), z0 = Math.max(a.z0, b.z0), z1 = Math.min(a.z1, b.z1); if (x1 - x0 > 1 && z1 - z0 > 1) rect({ x0: x0 + 0.2, z0: z0 + 0.2, x1: x1 - 0.2, z1: z1 - 0.2 }, '#9ea2a3'); }
  // warehouse bay markings
  for (const z of L.zones) if (z.kind === 'ware') { g.strokeStyle = '#e6c634'; g.lineWidth = Math.max(1, m(0.08)); for (let x = z.x0 + 1.2; x + 2.6 < z.x1; x += 3.6) g.strokeRect(m(x), m(z.z0 + 1.5), m(1.3), m(z.z1 - z.z0 - 3)); }
  // gate lobbies: hazard hatching in front of the door
  for (const lb of L.lobbies) for (const q of (lb.qs || [lb.q])) {
    const tx = -q.nz, tz = q.nx, cx = q.x + q.nx * 2.2, cz = q.z + q.nz * 2.2;
    g.save(); g.translate(m(cx), m(cz)); g.rotate(Math.atan2(tz, tx));
    g.fillStyle = '#d8b92f'; g.fillRect(m(-1.9), m(-1.3), m(3.8), m(2.6));
    g.beginPath(); g.rect(m(-1.9), m(-1.3), m(3.8), m(2.6)); g.clip();
    g.strokeStyle = '#26282a'; g.lineWidth = m(0.22); for (let k = -6; k < 8; k++) { g.beginPath(); g.moveTo(m(k * 0.62), m(-1.4)); g.lineTo(m(k * 0.62 + 2.8), m(1.4)); g.stroke(); }
    g.restore();
  }
  // structural joints, wear, stains, darker edges along the walls
  g.strokeStyle = 'rgba(30,36,38,0.16)'; g.lineWidth = 1; g.beginPath();
  for (let x = 9; x < L.W; x += 9) { g.moveTo(m(x), 0); g.lineTo(m(x), ch); } for (let z = 9; z < L.D; z += 9) { g.moveTo(0, m(z)); g.lineTo(cw, m(z)); } g.stroke();
  for (const a of L.aisles) { const horiz = (a.x1 - a.x0) >= (a.z1 - a.z0); for (let k = 0; k < 26; k++) { const t = R(), u = 0.25 + R() * 0.5, len = 4 + R() * 16; g.strokeStyle = `rgba(20,22,24,${0.03 + R() * 0.05})`; g.lineWidth = m(0.12 + R() * 0.15); g.beginPath(); if (horiz) { const x = a.x0 + t * (a.x1 - a.x0 - len), z = a.z0 + u * (a.z1 - a.z0); g.moveTo(m(x), m(z)); g.lineTo(m(x + len), m(z + (R() - 0.5) * 0.3)); } else { const z = a.z0 + t * (a.z1 - a.z0 - len), x = a.x0 + u * (a.x1 - a.x0); g.moveTo(m(x), m(z)); g.lineTo(m(x + (R() - 0.5) * 0.3), m(z + len)); } g.stroke(); } }
  for (let i = 0; i < 260; i++) { const x = R() * cw, y = R() * ch, s = m(0.3 + R() * 1.6), gr = g.createRadialGradient(x, y, 0, x, y, s); gr.addColorStop(0, `rgba(${R() < 0.6 ? '25,28,26' : '250,250,245'},${0.03 + R() * 0.07})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - s, y - s, s * 2, s * 2); }
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,255,255'},${0.02 + R() * 0.04})`; g.fillRect(R() * cw, R() * ch, 1 + R() * 2, 1 + R() * 2); }
  const e = m(2.2);
  for (const [x0, y0, x1, y1, w, h] of [[0, 0, 0, e, cw, e], [0, ch, 0, ch - e, cw, e], [0, 0, e, 0, e, ch], [cw, 0, cw - e, 0, e, ch]]) { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, 'rgba(0,0,0,0.28)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(Math.min(x0, x1), Math.min(y0, y1), w, h); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
let wallTex = null;
function interiorWallTexture() {                       // 6 m of wall x full storey height
  if (wallTex) return wallTex;
  const c = document.createElement('canvas'); c.width = 512; c.height = 512; const g = c.getContext('2d'), R = TX.rng(9);
  g.fillStyle = '#e4e5e0'; g.fillRect(0, 0, 512, 512);
  g.fillStyle = '#aeb6b8'; g.fillRect(0, 512 - 96, 512, 96);              // dado
  g.fillStyle = '#8a9193'; g.fillRect(0, 512 - 100, 512, 5);
  g.fillStyle = '#cfd2cd'; g.fillRect(0, 0, 512, 40);                     // beam / duct zone
  g.fillStyle = '#3a4246'; g.fillRect(40, 160, 432, 150);                 // strip window frame
  const gr = g.createLinearGradient(0, 160, 0, 310); gr.addColorStop(0, '#a9c9de'); gr.addColorStop(1, '#6f97b3');
  g.fillStyle = gr; for (let i = 0; i < 4; i++) g.fillRect(46 + i * 107, 166, 100, 138);
  g.fillStyle = '#c9ccc7'; g.fillRect(0, 0, 14, 512); g.fillRect(498, 0, 14, 512);   // pilaster
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${R() * 0.05})`; g.fillRect(R() * 512, R() * 512, 2, 2 + R() * 10); }
  wallTex = new THREE.CanvasTexture(c); wallTex.colorSpace = THREE.SRGBColorSpace; wallTex.wrapS = THREE.RepeatWrapping; wallTex.anisotropy = 8;
  return wallTex;
}
function signTexture(text) {
  const c = document.createElement('canvas'); c.width = 384; c.height = 96; const g = c.getContext('2d');
  g.fillStyle = '#12356f'; g.fillRect(0, 0, 384, 96); g.strokeStyle = '#e8ecf2'; g.lineWidth = 5; g.strokeRect(5, 5, 374, 86);
  g.font = '700 54px "Microsoft JhengHei","Microsoft YaHei",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffffff'; g.fillText(text, 192, 50);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

// ------------------------------------------------------------------ people (instanced)
let personGeo = null;
function person() {
  if (personGeo) return personGeo;
  const paint = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g.toNonIndexed(); };
  const legs = new THREE.CylinderGeometry(0.15, 0.13, 0.82, 7); legs.translate(0, 0.41, 0);
  const torso = new THREE.CylinderGeometry(0.2, 0.19, 0.66, 8); torso.translate(0, 1.15, 0);
  const head = new THREE.SphereGeometry(0.125, 8, 6); head.translate(0, 1.62, 0);
  const cap = new THREE.CylinderGeometry(0.135, 0.135, 0.09, 8); cap.translate(0, 1.72, 0);
  personGeo = mergeGeometries([paint(legs, [0.1, 0.11, 0.14]), paint(torso, [1, 1, 1]), paint(head, [0.9, 0.62, 0.48]), paint(cap, [1, 1, 1])]);
  return personGeo;
}
const SMOCK = [[0.86, 0.87, 0.88, 56], [0.55, 0.72, 0.9, 20], [0.92, 0.6, 0.68, 12], [0.9, 0.8, 0.35, 6], [0.3, 0.6, 0.4, 6]];

// ------------------------------------------------------------------ build one floor
export function buildFloor(L, fh) {
  const R = TX.rng(L.floor * 53 + Math.round(L.W * 7) + 1), group = new THREE.Group(), B = new Boxes(), T = new Boxes(), glass = new Acc(), walls = new Acc(), people = [];
  const hw = Math.max(4.0, fh - 0.75), W = L.W, D = L.D, disposables = [];
  const who = (x, z, seated, c) => people.push([x, z, seated ? -0.36 : 0, c || null, R() * 6.28]);
  const carton = () => ['#b98f5c', '#a9814f', '#c29b68', '#8f6f45'][Math.floor(R() * 4)];
  // ---- slab, floor finish, outer shell
  B.add(0, -0.55, 0, W, -0.02, D, '#8f9290');
  const ft = floorTexture(L); disposables.push(ft);
  const fa = new Acc(); fa.quad([0, 0, D], [W, 0, D], [W, 0, 0], [0, 0, 0], [0, 0], [1, 0], [1, 1], [0, 1]);
  const fm = new THREE.Mesh(fa.geometry(), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.62, metalness: 0.02, emissive: 0xffffff, emissiveMap: ft, emissiveIntensity: 0 })); fm.receiveShadow = true; group.add(fm);
  // outer wall: single-sided, facing inwards -> the side nearest the camera disappears (dolls-house view)
  const open = { N: [], S: [], W: [], E: [] };
  for (const q of L.gates) if (q.g.side) open[q.g.side].push(q.g.side === 'N' || q.g.side === 'S' ? q.x : q.z);
  const side = (len, cuts, P) => {                 // P(t, y) -> [x,y,z]; t runs so that the inward normal is on the left-hand rule side
    const ow = 1.7, oh = 2.9, segs = []; let a = 0;
    for (const c of cuts.slice().sort((p, q) => p - q)) { segs.push([a, c - ow]); a = c + ow; walls.quad(P(c - ow, oh), P(c + ow, oh), P(c + ow, hw), P(c - ow, hw), [(c - ow) / 6, oh / hw], [(c + ow) / 6, oh / hw], [(c + ow) / 6, 1], [(c - ow) / 6, 1]); }
    segs.push([a, len]);
    for (const [s0, s1] of segs) if (s1 - s0 > 0.05) walls.quad(P(s0, 0), P(s1, 0), P(s1, hw), P(s0, hw), [s0 / 6, 0], [s1 / 6, 0], [s1 / 6, 1], [s0 / 6, 1]);
    return segs;
  };
  const sN = side(W, open.N, (t, y) => [t, y, 0]);
  const sS = side(W, open.S.map((x) => W - x), (t, y) => [W - t, y, D]);
  const sW = side(D, open.W.map((z) => D - z), (t, y) => [0, y, D - t]);
  const sE = side(D, open.E, (t, y) => [W, y, t]);
  const wm = new THREE.Mesh(walls.geometry(), new THREE.MeshStandardMaterial({ map: interiorWallTexture(), roughness: 0.9, emissive: 0xffffff, emissiveMap: interiorWallTexture(), emissiveIntensity: 0 })); wm.receiveShadow = true; group.add(wm);
  // facade upstand outside the slab edge (keeps the storey reading as part of the building)
  for (const [s0, s1] of sN) B.add(s0, -0.55, -0.3, s1, 0.95, 0, '#b9bcb8');
  for (const [s0, s1] of sS) B.add(W - s1, -0.55, D, W - s0, 0.95, D + 0.3, '#b9bcb8');
  for (const [s0, s1] of sW) B.add(-0.3, -0.55, D - s1, 0, 0.95, D - s0, '#b9bcb8');
  for (const [s0, s1] of sE) B.add(W, -0.55, s0, W + 0.3, 0.95, s1, '#b9bcb8');
  B.add(-0.3, -0.75, -0.3, W + 0.3, -0.55, D + 0.3, '#5d6163');
  for (const [x, z] of L.cols) B.add(x - 0.32, 0, z - 0.32, x + 0.32, hw, z + 0.32, '#d2d4cf');

  // ---- partitions
  const PH = 2.7, PT = 0.07;
  const solid = (x0, z0, x1, z1) => B.add(x0 === x1 ? x0 - PT : x0, 0, z0 === z1 ? z0 - PT : z0, x0 === x1 ? x1 + PT : x1, PH, z0 === z1 ? z1 + PT : z1, '#e9eae6');
  const glazed = (x0, z0, x1, z1, doorAt) => {      // low wall + glass + head, with a door gap at doorAt (distance from the start)
    const len = Math.hypot(x1 - x0, z1 - z0), dx = (x1 - x0) / len, dz = (z1 - z0) / len, dw = 1.15;
    const seg = (a, b) => { if (b - a < 0.1) return; const ax = x0 + dx * a, az = z0 + dz * a, bx = x0 + dx * b, bz = z0 + dz * b;
      B.add(Math.min(ax, bx) - (dx ? 0 : PT), 0, Math.min(az, bz) - (dz ? 0 : PT), Math.max(ax, bx) + (dx ? 0 : PT), 1.0, Math.max(az, bz) + (dz ? 0 : PT), '#dfe1dd');
      glass.quad([ax, 1.0, az], [bx, 1.0, bz], [bx, PH - 0.12, bz], [ax, PH - 0.12, az], [0, 0], [1, 0], [1, 1], [0, 1]);
      for (let t = a; t <= b + 0.01; t += Math.max(1.2, (b - a) / Math.max(1, Math.round((b - a) / 1.5)))) { const mx = x0 + dx * t, mz = z0 + dz * t; T.add(mx - 0.035, 1.0, mz - 0.035, mx + 0.035, PH - 0.12, mz + 0.035, '#5a6266'); } };
    const d0 = Math.min(Math.max(doorAt, 0.4), len - dw - 0.4);
    seg(0, d0); seg(d0 + dw, len);
    B.add(Math.min(x0, x1) - (dx ? 0 : PT), PH - 0.12, Math.min(z0, z1) - (dz ? 0 : PT), Math.max(x0, x1) + (dx ? 0 : PT), PH, Math.max(z0, z1) + (dz ? 0 : PT), '#5a6266');
    const hx = x0 + dx * d0, hz = z0 + dz * d0;                                   // door leaf standing open
    B.add(hx - (dx ? 0.03 : 0), 0, hz - (dz ? 0.03 : 0), hx + (dx ? 0.03 : 0.9), 2.1, hz + (dz ? 0.03 : 0.9), '#8c6f4e');
  };

  // ---- furniture primitives (all axis aligned)
  const desk = (x, z, w, d, top = '#d9d4c8') => { B.add(x, 0.7, z, x + w, 0.75, z + d, top); B.add(x + 0.04, 0, z + 0.04, x + 0.09, 0.7, z + d - 0.04, '#7c8286'); B.add(x + w - 0.09, 0, z + 0.04, x + w - 0.04, 0.7, z + d - 0.04, '#7c8286'); };
  const monitor = (x, z, alongX) => { if (alongX) B.add(x - 0.26, 0.86, z - 0.02, x + 0.26, 1.18, z + 0.02, '#16181b'); else B.add(x - 0.02, 0.86, z - 0.26, x + 0.02, 1.18, z + 0.26, '#16181b'); B.add(x - 0.04, 0.75, z - 0.04, x + 0.04, 0.87, z + 0.04, '#2a2d31'); };
  const chair = (x, z, c = '#2b3440') => { T.add(x - 0.22, 0.42, z - 0.22, x + 0.22, 0.5, z + 0.22, c); T.add(x - 0.04, 0, z - 0.04, x + 0.04, 0.42, z + 0.04, '#55595d'); };
  const cabinet = (x, z, w, d, h, c = '#c9ccc8') => { B.add(x, 0, z, x + w, h, z + d, c); };
  const pallet = (x, z, h) => { B.add(x, 0, z, x + 1.2, 0.14, z + 1.0, '#9a7a4d'); if (h > 0) { const n = Math.max(1, Math.round(h / 0.38)); for (let k = 0; k < n; k++) B.add(x + 0.05 + R() * 0.04, 0.14 + k * 0.38, z + 0.05, x + 1.15 - R() * 0.04, 0.14 + (k + 1) * 0.38 - 0.01, z + 0.95, carton()); } };
  const rack = (x0, z0, x1, z1, h, levels) => {     // pallet racking with cartons / totes
    const alongX = (x1 - x0) >= (z1 - z0), len = alongX ? x1 - x0 : z1 - z0, dep = alongX ? z1 - z0 : x1 - x0, bay = 2.7, nb = Math.max(1, Math.round(len / bay)), bl = len / nb;
    for (let i = 0; i <= nb; i++) for (const s of [0, dep - 0.08]) { const a = i * bl; if (alongX) B.add(x0 + a - 0.04, 0, z0 + s, x0 + a + 0.04, h, z0 + s + 0.08, '#2d5fa3'); else B.add(x0 + s, 0, z0 + a - 0.04, x0 + s + 0.08, h, z0 + a + 0.04, '#2d5fa3'); }
    for (let l = 0; l < levels; l++) { const y = 0.25 + l * (h - 0.3) / levels;
      if (alongX) B.add(x0, y, z0, x1, y + 0.07, z1, '#d0782c'); else B.add(x0, y, z0, x1, y + 0.07, z1, '#d0782c');
      for (let i = 0; i < nb; i++) for (let k = 0; k < 2; k++) { if (R() < 0.22) continue; const a = i * bl + 0.15 + k * (bl / 2), w = bl / 2 - 0.3, hh = 0.35 + R() * ((h - 0.3) / levels - 0.55), cc = R() < 0.25 ? '#2f6da8' : carton();
        if (alongX) B.add(x0 + a, y + 0.07, z0 + 0.08, x0 + a + w, y + 0.07 + hh, z1 - 0.08, cc); else B.add(x0 + 0.08, y + 0.07, z0 + a, x1 - 0.08, y + 0.07 + hh, z0 + a + w, cc); } }
  };
  const bench = (x0, z0, x1, z1, top = '#3f6f8f') => { B.add(x0, 0.82, z0, x1, 0.9, z1, top); B.add(x0 + 0.05, 0, z0 + 0.05, x1 - 0.05, 0.82, z1 - 0.05, '#c7cac6');
    const alongX = (x1 - x0) >= (z1 - z0), len = alongX ? x1 - x0 : z1 - z0;
    for (let a = 0.4; a < len - 0.5; a += 0.9 + R() * 1.1) { const w = 0.3 + R() * 0.35, h = 0.18 + R() * 0.35, cc = ['#e8e6de', '#cfd3d6', '#3b4046', '#d9c9a0'][Math.floor(R() * 4)];
      if (alongX) B.add(x0 + a, 0.9, (z0 + z1) / 2 - 0.18, x0 + a + w, 0.9 + h, (z0 + z1) / 2 + 0.18, cc); else B.add((x0 + x1) / 2 - 0.18, 0.9, z0 + a, (x0 + x1) / 2 + 0.18, 0.9 + h, z0 + a + w, cc); } };

  // ---- rooms
  for (const r of L.rooms) {
    const w = r.x1 - r.x0, d = r.z1 - r.z0, x0 = r.x0 + 0.25, x1 = r.x1 - 0.25, z0 = r.z0 + 0.25, z1 = r.z1 - 0.25;
    // enclosure: glazed front to the aisle, solid walls between rooms
    if (r.door === 'S') { glazed(r.x0, r.z1, r.x1, r.z1, 1.2); solid(r.x1, r.z0, r.x1, r.z1); }
    else if (r.door === 'N') { glazed(r.x0, r.z0, r.x1, r.z0, 1.2); solid(r.x1, r.z0, r.x1, r.z1); }
    else if (r.door === 'E') { glazed(r.x1, r.z0, r.x1, r.z1, 1.2); solid(r.x0, r.z1, r.x1, r.z1); }
    else { glazed(r.x0, r.z0, r.x0, r.z1, 1.2); solid(r.x0, r.z1, r.x1, r.z1); }
    if (r.door === 'S' || r.door === 'N') solid(r.x0, r.z0, r.x0, r.z1); else solid(r.x0, r.z0, r.x1, r.z0);
    const far = r.door === 'S' ? z0 : r.door === 'N' ? z1 : null;                 // z of the outer-wall side for N / S rooms
    switch (r.kind) {
      case 'office': case 'mgr': case 'file': {
        if (r.kind === 'file') { for (let x = x0 + 0.2; x + 1.0 < x1; x += 1.9) rack(x, z0 + 0.3, x + 0.9, z1 - 1.6, 2.0, 4); break; }
        const alongX = w >= d;
        if (alongX) for (let z = z0 + 0.9; z + 1.5 < z1 - 0.5; z += 3.3) for (let x = x0 + 0.4; x + 1.5 <= x1 - 0.3; x += 1.5) {
          desk(x, z, 1.48, 0.72); desk(x, z + 0.75, 1.48, 0.72); monitor(x + 0.74, z + 0.5, true); monitor(x + 0.74, z + 1.0, true);
          chair(x + 0.74, z - 0.4); chair(x + 0.74, z + 1.9); if (R() < 0.55) who(x + 0.74, z - 0.4, true); if (R() < 0.55) who(x + 0.74, z + 1.9, true);
        } else for (let x = x0 + 0.9; x + 1.5 < x1 - 0.5; x += 3.3) for (let z = z0 + 0.4; z + 1.5 <= z1 - 0.3; z += 1.5) {
          desk(x, z, 0.72, 1.48); desk(x + 0.75, z, 0.72, 1.48); monitor(x + 0.5, z + 0.74, false); monitor(x + 1.0, z + 0.74, false);
          chair(x - 0.4, z + 0.74); chair(x + 1.9, z + 0.74); if (R() < 0.55) who(x - 0.4, z + 0.74, true); if (R() < 0.55) who(x + 1.9, z + 0.74, true);
        }
        cabinet(x1 - 0.5, z0 + 0.1, 0.45, Math.min(3, d - 1.2), 1.9, '#b7bcc0');
        break; }
      case 'meet': case 'train': {
        if (r.kind === 'train') { for (let z = z0 + 1.6; z + 0.6 < z1 - 0.4; z += 1.5) for (let x = x0 + 0.5; x + 1.3 < x1 - 0.4; x += 1.6) { desk(x, z, 1.3, 0.5, '#cfc6b4'); chair(x + 0.65, z + 0.9); if (R() < 0.4) who(x + 0.65, z + 0.9, true); } B.add(x0 + 1, 1.1, z0, x1 - 1, 2.3, z0 + 0.06, '#1b1e22'); break; }
        const tw = Math.min(w - 2.6, 6), td = Math.min(d - 2.8, 1.6), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        B.add(cx - tw / 2, 0.7, cz - td / 2, cx + tw / 2, 0.76, cz + td / 2, '#6f5138'); B.add(cx - tw / 2 + 0.3, 0, cz - 0.25, cx + tw / 2 - 0.3, 0.7, cz + 0.25, '#4a3a2b');
        for (let x = cx - tw / 2 + 0.45; x < cx + tw / 2; x += 0.85) { chair(x, cz - td / 2 - 0.4, '#3a3f46'); chair(x, cz + td / 2 + 0.4, '#3a3f46'); if (R() < 0.3) who(x, cz - td / 2 - 0.4, true); }
        B.add(x0, 1.0, cz - 1.0, x0 + 0.06, 2.1, cz + 1.0, '#101214');
        break; }
      case 'lab': case 'qc': {
        const top = r.kind === 'lab' ? '#3f6f8f' : '#e9ece9';
        if (far !== null) bench(x0 + 0.2, far === z0 ? z0 : z1 - 0.8, x1 - 0.8, far === z0 ? z0 + 0.8 : z1, top);
        for (let z = z0 + 2.2; z + 1.5 < z1 - 0.9; z += 2.9) { bench(x0 + 0.9, z, x1 - 1.4, z + 1.5, top); for (let x = x0 + 1.4; x < x1 - 1.6; x += 1.5) { chair(x, z - 0.42, '#3d5a73'); if (R() < 0.45) who(x, z - 0.42, true, [0.9, 0.9, 0.92]); } }
        for (let z = z0 + 0.2; z + 0.95 < z1 - 1.6; z += 1.0) cabinet(x1 - 0.62, z, 0.6, 0.9, 1.95, r.kind === 'lab' ? '#b9bfbf' : '#dcdedb');
        break; }
      case 'store': {
        if (w >= d) { for (let z = z0 + 0.15; z + 1.05 < z1 - 1.8; z += 2.9) rack(x0 + 0.3, z, x1 - 0.3, z + 1.05, 2.4, 3); for (let x = x0 + 0.6; x + 1.3 < x1 - 0.4; x += 1.5) if (R() < 0.6) pallet(x, z1 - 1.5, R() * 1.3); }
        else { for (let x = x0 + 0.15; x + 1.05 < x1 - 1.8; x += 2.9) rack(x, z0 + 0.3, x + 1.05, z1 - 0.3, 2.4, 3); for (let z = z0 + 0.6; z + 1.1 < z1 - 0.4; z += 1.3) if (R() < 0.6) pallet(x1 - 1.6, z, R() * 1.3); }
        break; }
      case 'equip': {
        for (let z = z0 + 0.5; z + 0.8 < z1 - 1.4; z += 2.4) for (let x = x0 + 0.5; x + 1.2 < x1 - 0.5; x += 1.25) { cabinet(x, z, 1.2, 0.8, 2.1, '#8fa39a'); B.add(x + 0.15, 1.5, z + 0.8, x + 0.45, 1.75, z + 0.82, '#1f2326'); }
        break; }
      case 'tea': {
        for (let x = x0 + 1.2; x + 1 < x1 - 2; x += 2.6) for (let z = z0 + 1.2; z + 1 < z1 - 1; z += 2.6) { B.add(x, 0.7, z, x + 0.9, 0.75, z + 0.9, '#e6e0d2'); B.add(x + 0.4, 0, z + 0.4, x + 0.5, 0.7, z + 0.5, '#70757a'); chair(x - 0.35, z + 0.45, '#b5562f'); chair(x + 1.25, z + 0.45, '#b5562f'); if (R() < 0.35) who(x - 0.35, z + 0.45, true); }
        cabinet(x1 - 0.9, z0 + 0.2, 0.8, 0.9, 1.9, '#b3261e'); cabinet(x1 - 0.9, z0 + 1.2, 0.8, 0.9, 1.9, '#1f5fa8'); cabinet(x1 - 0.9, z0 + 2.2, 0.8, 0.7, 1.1, '#e3e5e3');
        break; }
      case 'locker': {
        if (w >= d) for (let x = x0 + 0.6; x + 0.9 < x1 - 0.4; x += 2.3) { cabinet(x, z0 + 0.3, 0.45, d - 2.2, 1.9, '#7f97ab'); cabinet(x + 0.45, z0 + 0.3, 0.45, d - 2.2, 1.9, '#8aa2b5'); }
        else for (let z = z0 + 0.6; z + 0.9 < z1 - 0.4; z += 2.3) { cabinet(x0 + 0.3, z, w - 2.2, 0.45, 1.9, '#7f97ab'); cabinet(x0 + 0.3, z + 0.45, w - 2.2, 0.45, 1.9, '#8aa2b5'); }
        break; }
      case 'wc': {
        for (let z = z0 + 0.3; z + 1.0 < z1 - 0.3; z += 1.0) { B.add(x0 + 0.2, 0, z, x0 + 1.6, 2.0, z + 0.04, '#cfd3d2'); B.add(x0 + 0.5, 0, z + 0.3, x0 + 0.95, 0.4, z + 0.7, '#f1f2f0'); }
        B.add(x1 - 0.7, 0.75, z0 + 0.4, x1 - 0.15, 0.85, z1 - 0.4, '#e9ebe9');
        break; }
      case 'stair': {
        const sw = Math.min(1.5, (w - 1.2) / 2), n = 11, run = Math.min(d - 2.4, n * 0.29), sx = x0 + 0.4, sz = z0 + 1.0;
        for (let k = 0; k < n; k++) { B.add(sx, 0, sz + k * run / n, sx + sw, (k + 1) * (hw * 0.5) / n, sz + (k + 1) * run / n, '#bfc1bc'); B.add(sx + sw + 0.2, 0, sz + (n - 1 - k) * run / n, sx + 2 * sw + 0.2, hw * 0.5 + (k + 1) * (hw * 0.45) / n, sz + (n - k) * run / n, '#bfc1bc'); }
        B.add(sx, 0, sz + run, sx + 2 * sw + 0.2, hw * 0.5, sz + run + 1.2, '#c9cbc6'); B.add(sx + sw, 0, sz, sx + sw + 0.2, hw * 0.5 + 1.0, sz + run, '#70767a');
        break; }
      case 'lift': {
        const lw = Math.min(3.2, w - 3), n = Math.max(1, Math.floor((d - 1) / 4.2));
        for (let k = 0; k < n; k++) { const z = z0 + 0.5 + k * 4.2, xx = r.door === 'E' ? x0 + 0.2 : x1 - 0.2 - lw; B.add(xx, 0, z, xx + lw, Math.min(hw, 3.6), z + 3.6, '#a7abad'); const fx = r.door === 'E' ? xx + lw : xx - 0.05; B.add(fx, 0, z + 0.5, fx + 0.05, 2.6, z + 3.1, '#c8cdd0'); B.add(fx, 0, z + 1.77, fx + 0.06, 2.6, z + 1.83, '#5c6266'); }
        break; }
      default: break;
    }
  }

  // ---- production lines
  const stools = [];
  for (const ln of L.lines) {
    const z = ln.z, x0 = ln.x0, x1 = ln.x1, mlen = Math.min(9, (x1 - x0) * 0.16);
    // head-of-line machines with signal towers
    for (let k = 0; k < 3; k++) { const mx = x0 + 0.3 + k * (mlen / 3); B.add(mx, 0, z - 0.8, mx + mlen / 3 - 0.35, 1.75, z + 0.8, k === 1 ? '#dfe3e4' : '#e9ebe8'); B.add(mx, 1.1, z - 0.82, mx + mlen / 3 - 0.35, 1.5, z + 0.82, '#24313c'); B.add(mx, 0.05, z - 0.83, mx + mlen / 3 - 0.35, 0.3, z + 0.83, '#2c6aa6');
      const tx = mx + mlen / 3 - 0.6; B.add(tx, 1.75, z - 0.6, tx + 0.08, 1.87, z - 0.52, '#2fae4e'); B.add(tx, 1.87, z - 0.6, tx + 0.08, 1.99, z - 0.52, '#e3b62b'); B.add(tx, 1.99, z - 0.6, tx + 0.08, 2.11, z - 0.52, '#c93328'); }
    // conveyor
    const c0 = x0 + mlen + 0.4, c1 = x1 - 5.2;
    B.add(c0, 0.1, z - 0.3, c1, 0.72, z + 0.3, '#b9bec1'); B.add(c0, 0.72, z - 0.42, c1, 0.8, z + 0.42, '#c9ced1'); B.add(c0, 0.8, z - 0.3, c1, 0.83, z + 0.3, '#1f5c3d');
    for (let x = c0; x < c1; x += 2.4) { T.add(x, 0, z - 0.4, x + 0.07, 0.72, z - 0.33, '#8d9397'); T.add(x, 0, z + 0.33, x + 0.07, 0.72, z + 0.4, '#8d9397'); }
    for (let x = c0 + 0.5; x < c1 - 0.4; x += 0.8 + R() * 0.5) B.add(x, 0.83, z - 0.09, x + 0.17, 0.85, z + 0.09, R() < 0.5 ? '#d9dcde' : '#3a3f45');
    // side work shelves, task-light rail and stools with operators
    for (const s of [-1, 1]) { B.add(c0, 0.86, z + s * 0.42, c1, 0.89, z + s * 0.72, '#dfe2e3'); for (let x = c0 + 1.2; x < c1; x += 2.4) T.add(x, 0, z + s * 0.68, x + 0.05, 0.86, z + s * 0.72, '#8d9397'); }
    for (let x = c0; x <= c1; x += 4.8) T.add(x - 0.04, 0.83, z - 0.04, x + 0.04, 2.25, z + 0.04, '#8d9397');
    T.add(c0, 2.2, z - 0.05, c1, 2.27, z + 0.05, '#a5abaf'); T.add(c0, 2.14, z - 0.11, c1, 2.2, z + 0.11, '#f3f1e2');
    for (let x = c0 + 0.6; x < c1 - 0.3; x += 1.2) for (const s of [-1, 1]) { stools.push([x, z + s * 1.05]); if (R() < 0.72) who(x, z + s * 1.05, true); }
    // line status board + end-of-line packing
    B.add(c0 - 0.06, 2.3, z - 0.6, c0, 2.9, z + 0.6, '#14171a'); B.add(c0 - 0.08, 2.55, z - 0.5, c0 - 0.06, 2.8, z + 0.1, R() < 0.8 ? '#35c463' : '#d64a3c');
    desk(c1 + 0.3, z - 0.5, 1.6, 1.0, '#cfd3d4'); who(c1 + 1.1, z + 0.9, false);
    for (let k = 0; k < 2; k++) pallet(c1 + 2.3 + k * 1.4, z - 0.5, 0.4 + R() * 1.1);
    // flow racks and trolleys in the gap to the next line
    if (ln.i % 2 === 0) for (let x = c0 + 3; x + 2 < c1; x += 9 + R() * 8) { if (R() < 0.7) rack(x, z + 2.55, x + 2.7, z + 3.2, 1.7, 3); else { B.add(x, 0.15, z + 2.6, x + 0.9, 1.0, z + 3.2, '#2f6da8'); B.add(x + 0.05, 1.0, z + 2.65, x + 0.85, 1.25, z + 3.15, carton()); } }
  }
  for (const [sx, sz] of stools) { T.add(sx - 0.17, 0.42, sz - 0.17, sx + 0.17, 0.48, sz + 0.17, '#26303b'); T.add(sx - 0.03, 0, sz - 0.03, sx + 0.03, 0.42, sz + 0.03, '#6b7074'); }
  // ---- warehouse / test bays
  for (const zn of L.zones) {
    if (zn.kind === 'ware') {
      for (let x = zn.x0 + 1.2; x + 2.6 < zn.x1; x += 3.6) rack(x, zn.z0 + 1.5, x + 1.3, zn.z1 - 1.5, Math.min(3.8, hw - 0.8), 3);
      for (let k = 0; k < 3; k++) { const fx = zn.x0 + 3 + R() * (zn.x1 - zn.x0 - 6), fz = zn.z0 + 0.3 + (k % 2) * (zn.z1 - zn.z0 - 1.6); B.add(fx, 0.1, fz, fx + 1.9, 1.1, fz + 1.05, '#e2a81f'); B.add(fx + 0.2, 1.1, fz + 0.1, fx + 1.2, 2.1, fz + 0.95, '#3a3d40'); B.add(fx + 1.9, 0.05, fz + 0.2, fx + 3.0, 0.12, fz + 0.32, '#55595c'); B.add(fx + 1.9, 0.05, fz + 0.73, fx + 3.0, 0.12, fz + 0.85, '#55595c'); B.add(fx + 1.85, 0, fz + 0.15, fx + 1.95, 2.6, fz + 0.9, '#4b4f52'); who(fx + 0.7, fz + 0.5, true, [0.95, 0.6, 0.15]); }
    }
    if (zn.kind === 'test') {
      for (let x = zn.x0 + 1.5; x + 1 < zn.x1 - 1; x += 2.6) for (let z = zn.z0 + 1.5; z + 5 < zn.z1; z += 7.5) { for (let k = 0; k < 5; k++) { cabinet(x, z + k * 0.95, 0.9, 0.9, 2.0, '#4a5158'); B.add(x + 0.9, 1.2, z + k * 0.95 + 0.15, x + 0.92, 1.7, z + k * 0.95 + 0.75, R() < 0.85 ? '#2bd06a' : '#e0b030'); } if (R() < 0.5) who(x + 1.5, z + 2.2, false, [0.86, 0.87, 0.88]); }
    }
  }
  // ---- AGVs and people walking on the aisles
  for (const a of L.aisles) { const horiz = (a.x1 - a.x0) >= (a.z1 - a.z0), len = horiz ? a.x1 - a.x0 : a.z1 - a.z0;
    for (let t = 6 + R() * 20; t < len - 4; t += 18 + R() * 30) { const x = horiz ? a.x0 + t : (a.x0 + a.x1) / 2 - 0.4, z = horiz ? (a.z0 + a.z1) / 2 - 0.4 : a.z0 + t;
      if (R() < 0.55) { B.add(x, 0.05, z, x + (horiz ? 1.1 : 0.8), 0.32, z + (horiz ? 0.8 : 1.1), '#e2761c'); B.add(x + 0.1, 0.32, z + 0.1, x + (horiz ? 1.0 : 0.7), 0.75, z + (horiz ? 0.7 : 1.0), '#2f6da8'); }
      else who(x + (R() - 0.5), z + (R() - 0.5) * 1.5, false); } }

  // ---- gates: door frame, scanner arch, guard desk, lane posts, staging pallets, name board
  const anchors = [];
  for (const q of L.gates) {
    const tx = -q.nz, tz = q.nx, P = (t, d) => [q.x + tx * t + q.nx * d, q.z + tz * t + q.nz * d];
    const bx = (t0, d0, t1, d1, y0, y1, c) => { const a = P(t0, d0), b = P(t1, d1); B.add(Math.min(a[0], b[0]), y0, Math.min(a[1], b[1]), Math.max(a[0], b[0]), y1, Math.max(a[1], b[1]), c); };
    if (q.loose) { B.add(q.x - 3.5, -0.3, q.z - 3.5, q.x + 3.5, -0.1, q.z + 3.5, '#6c7378'); bx(-1.2, -0.6, 1.2, 0.6, -0.1, 1.0, '#c9ccc8'); }
    else {
      bx(-1.7, -0.3, -1.55, 0.25, 0, 2.9, '#4d565c'); bx(1.55, -0.3, 1.7, 0.25, 0, 2.9, '#4d565c'); bx(-1.7, -0.3, 1.7, 0.25, 2.9, 3.1, '#4d565c');     // door frame
      bx(-1.55, -0.28, -0.05, -0.2, 0, 2.9, '#aeb6bb'); bx(0.9, -1.4, 0.96, -0.2, 0, 2.9, '#aeb6bb');                                             // one leaf shut, one swung open
      bx(-0.75, 1.5, -0.6, 1.9, 0, 2.2, '#dfe2e4'); bx(0.6, 1.5, 0.75, 1.9, 0, 2.2, '#dfe2e4'); bx(-0.75, 1.5, 0.75, 1.9, 2.2, 2.35, '#dfe2e4');      // walk-through scanner
      bx(1.7, 1.2, 3.3, 1.95, 0, 1.05, '#d8dbdc'); bx(1.7, 1.2, 3.3, 1.95, 1.05, 1.1, '#3a4a5c');                                                  // guard desk
      { const a = P(2.5, 1.45); monitor(a[0], a[1], q.nz !== 0); const w = P(2.5, 2.5); who(w[0], w[1], false, [0.16, 0.2, 0.34]); }
      for (const t of [-1.5, 1.5]) for (const d of [2.9, 4.4]) { bx(t - 0.07, d - 0.07, t + 0.07, d + 0.07, 0, 1.0, '#c9302a'); }
      for (const t of [-1.5, 1.5]) bx(t - 0.02, 2.9, t + 0.02, 4.4, 0.9, 0.96, '#22252a');
      for (let k = 0; k < 3; k++) if (R() < 0.75) { const a = P(-3.6, 2.0 + k * 1.5); pallet(a[0] - 0.6, a[1] - 0.5, 0.3 + R() * 1.0); }
      { const a = P(-2.6, 4.2); B.add(a[0] - 0.5, 0.15, a[1] - 0.35, a[0] + 0.5, 1.0, a[1] + 0.35, '#2f6da8'); B.add(a[0] - 0.45, 1.0, a[1] - 0.3, a[0] + 0.45, 1.3, a[1] + 0.3, carton()); const w = P(-1.9, 4.6); who(w[0], w[1], false); }
      // name board above the door, facing the room
      const st = signTexture(q.g.name); disposables.push(st);
      const sa = new Acc(), a = P(1.6, 0.14), b = P(-1.6, 0.14);
      sa.quad([a[0], 3.2, a[1]], [b[0], 3.2, b[1]], [b[0], 4.0, b[1]], [a[0], 4.0, a[1]], [0, 0], [1, 0], [1, 1], [0, 1]);
      const sm = new THREE.Mesh(sa.geometry(), new THREE.MeshStandardMaterial({ map: st, roughness: 0.5, emissive: 0xffffff, emissiveMap: st, emissiveIntensity: 0.25 })); group.add(sm);
    }
    anchors.push({ g: q.g, x: q.x + q.nx * 1.2, z: q.z + q.nz * 1.2, nx: q.nx, nz: q.nz, loose: !!q.loose });
  }

  // ---- meshes
  const fmesh = new THREE.Mesh(B.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.05, emissive: 0x9aa0a6, emissiveIntensity: 0 })); fmesh.castShadow = fmesh.receiveShadow = true; group.add(fmesh);
  const tmesh = new THREE.Mesh(T.geometry(), fmesh.material); tmesh.receiveShadow = true; group.add(tmesh);      // thin parts: no sun shadows (they only add noise)
  if (!glass.empty) { const gm = new THREE.Mesh(glass.geometry(), new THREE.MeshStandardMaterial({ color: 0x9fc4d6, transparent: true, opacity: 0.22, roughness: 0.08, metalness: 0.3, side: THREE.DoubleSide, depthWrite: false })); gm.renderOrder = 2; gm.userData.noAO = true; group.add(gm); }
  if (people.length) {
    const im = new THREE.InstancedMesh(person(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, emissive: 0x8a8f94, emissiveIntensity: 0 }), people.length);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P3 = new THREE.Vector3(), S3 = new THREE.Vector3(1, 1, 1), Y = new THREE.Vector3(0, 1, 0), cc = new THREE.Color();
    people.forEach((p, i) => { Q.setFromAxisAngle(Y, p[4]); P3.set(p[0], p[2], p[1]); const k = 0.94 + R() * 0.12; S3.set(k, k, k); M.compose(P3, Q, S3); im.setMatrixAt(i, M);
      let c = p[3]; if (!c) { let s = 0; for (const t of SMOCK) s += t[3]; let v = R() * s; c = SMOCK[0]; for (const t of SMOCK) { v -= t[3]; if (v <= 0) { c = t; break; } } } cc.setRGB(c[0], c[1], c[2]); im.setColorAt(i, cc); });
    im.castShadow = false; im.receiveShadow = true; group.add(im);
  }
  group.userData.dispose = () => { group.traverse((o) => { if (o.geometry && o.geometry !== personGeo) o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); }); for (const t of disposables) t.dispose(); };
  // interior lighting at night: the storey glows instead of going black (n = 0 day .. 1 night)
  const lit = (n) => { fm.material.emissiveIntensity = 0.5 * n; wm.material.emissiveIntensity = 0.55 * n; fmesh.material.emissiveIntensity = 0.3 * n; group.traverse((o) => { if (o.isInstancedMesh) o.material.emissiveIntensity = 0.32 * n; }); };
  return { group, anchors, hw, people: people.length, rooms: L.rooms, lit };
}
