// Ground routes between floor gates.
// Second-line gates (二线岗) are the gates in a zone's perimeter wall, third-line gates (三线岗) are the floor gates of a
// block.  A release order leaves through a third-line gate, walks the zone's inner roads to a second-line gate, follows
// the municipal roads, enters the destination zone through one of its second-line gates and ends at a third-line gate.
// The inner and the municipal road networks are joined ONLY at the perimeter gates, so every route between two zones
// passes exactly the gates it would have to pass in reality.
const RING = 5;                                   // routes hug a block at this distance from its wall
const GATE_COST = 400;                            // discourages short-cuts through a third zone

function hitsRect(a, b, r) {                      // does segment a-b cross rect r ?
  let t0 = 0, t1 = 1; const dx = b[0] - a[0], dy = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - r[0]], [dx, r[2] - a[0]], [-dy, a[1] - r[1]], [dy, r[3] - a[1]]]) {
    if (Math.abs(p) < 1e-9) { if (q < 0) return false; } else { const t = q / p; if (p < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t); }
  }
  return t1 - t0 > 1e-6;
}
const trad = (s) => s.replace(/门/g, '門').replace(/东/g, '東');

export class Router {
  constructor(DATA) {
    this.DATA = DATA; this.X = []; this.Z = []; this.adj = []; this.gate = []; this.key = new Map(); this.trees = new Map(); this.corners = new Map();
    const segs = [];
    for (const rd of DATA.roads) for (let i = 0; i + 1 < rd.line.length; i++) segs.push({ a: rd.line[i], b: rd.line[i + 1], main: rd.kind === 'main', pts: [0, 1] });
    const at = (s, t) => [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t];
    const len = (s) => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
    // crossings inside each network (ends are allowed to fall a little short of the crossing road)
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
      const p = segs[i], q = segs[j]; if (p.main !== q.main) continue;
      const ext = p.main ? 40 : 8, d1 = [p.b[0] - p.a[0], p.b[1] - p.a[1]], d2 = [q.b[0] - q.a[0], q.b[1] - q.a[1]], den = d1[0] * d2[1] - d1[1] * d2[0];
      if (Math.abs(den) < 1e-6) continue;
      const w = [q.a[0] - p.a[0], q.a[1] - p.a[1]], t = (w[0] * d2[1] - w[1] * d2[0]) / den, u = (w[0] * d1[1] - w[1] * d1[0]) / den, l1 = len(p), l2 = len(q);
      if (t * l1 < -ext || t * l1 > l1 + ext || u * l2 < -ext || u * l2 > l2 + ext) continue;
      const tc = Math.min(1, Math.max(0, t)), uc = Math.min(1, Math.max(0, u));
      p.pts.push(tc); q.pts.push(uc); (p.join || (p.join = [])).push([tc, q, uc]);
    }
    const project = (pt, main, maxD, blocked) => {    // nearest point of one network
      let best = null;
      for (const s of segs) { if (s.main !== main) continue; const l = len(s), t = Math.min(1, Math.max(0, ((pt[0] - s.a[0]) * (s.b[0] - s.a[0]) + (pt[1] - s.a[1]) * (s.b[1] - s.a[1])) / (l * l))), q = at(s, t), d = Math.hypot(q[0] - pt[0], q[1] - pt[1]);
        if (d > maxD || (best && d >= best.d)) continue; if (blocked && blocked(pt, q)) continue; best = { s, t, d, q }; }
      return best;
    };
    const links = [];                                // [pointA, pointB, extra cost, gate]
    this.zgates = [];
    for (const g of DATA.gates) {
      if (g.kind === 'lot' || !g.name) continue;
      const out = project(g.p, true, 95), inn = project(g.p, false, 140); if (!out) continue;
      const zg = { id: `ZZ-${g.zone}-${trad(g.name)}`, zone: g.zone, name: trad(g.name), label: `${g.zone}区 ${g.name}`, p: g.p, line: 2 };
      this.zgates.push(zg); out.s.pts.push(out.t); links.push([g.p, out.q, GATE_COST, zg]);
      if (inn) { inn.s.pts.push(inn.t); links.push([g.p, inn.q, 0, zg]); }
    }
    const solid = DATA.buildings.map((b) => [b.r[0] + 1, b.r[1] + 1, b.r[2] - 1, b.r[3] - 1]);
    const blocked = (a, b) => solid.some((r) => hitsRect(a, b, r));
    for (const b of DATA.buildings) {
      if (b.type !== 'P' && b.type !== 'O') continue;
      const c = [[b.r[0] - RING, b.r[1] - RING], [b.r[2] + RING, b.r[1] - RING], [b.r[2] + RING, b.r[3] + RING], [b.r[0] - RING, b.r[3] + RING]];   // NW NE SE SW
      this.corners.set(b.id, c);
      for (let i = 0; i < 4; i++) { links.push([c[i], c[(i + 1) % 4], 0, null]); const pr = project(c[i], false, 120, blocked); if (pr) { pr.s.pts.push(pr.t); links.push([c[i], pr.q, 0, null]); } }
    }
    for (const s of segs) { const ts = [...new Set(s.pts.map((t) => Math.round(t * 1e5) / 1e5))].sort((p, q) => p - q); for (let i = 0; i + 1 < ts.length; i++) this.edge(at(s, ts[i]), at(s, ts[i + 1]), 0); if (s.join) for (const [t, q, u] of s.join) this.edge(at(s, t), at(q, u), 0); }
    for (const [a, b, c, g] of links) { this.edge(a, b, c); if (g) this.gate[this.node(a)] = g; }
    this.cache = new Map();
  }
  node(p) { const k = Math.round(p[0] * 2) + ',' + Math.round(p[1] * 2); let n = this.key.get(k); if (n === undefined) { n = this.X.length; this.key.set(k, n); this.X.push(p[0]); this.Z.push(p[1]); this.adj.push([]); this.gate.push(null); } return n; }
  edge(a, b, extra) { const i = this.node(a), j = this.node(b); if (i === j) return; const w = Math.hypot(this.X[i] - this.X[j], this.Z[i] - this.Z[j]) + extra; this.adj[i].push([j, w]); this.adj[j].push([i, w]); }
  tree(src) {
    if (this.trees.has(src)) return this.trees.get(src);
    const n = this.X.length, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n); dist[src] = 0;
    for (;;) { let u = -1, best = Infinity; for (let i = 0; i < n; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; } if (u < 0) break; done[u] = 1;
      for (const [v, w] of this.adj[u]) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; } }
    const t = { dist, prev }; this.trees.set(src, t); return t;
  }
  // door of a floor gate on the ring around its block: { p, c: [[cornerIndex, distance along the ring], ...] }
  door(b, pos) {
    const W = b.r[2] - b.r[0], D = b.r[3] - b.r[1], x = Math.min(W, Math.max(0, pos.x)), z = Math.min(D, Math.max(0, pos.z));
    if (pos.nz > 0) return { p: [b.r[0] + x, b.r[1] - RING], c: [[0, x + RING], [1, W - x + RING]] };
    if (pos.nz < 0) return { p: [b.r[0] + x, b.r[3] + RING], c: [[3, x + RING], [2, W - x + RING]] };
    if (pos.nx < 0) return { p: [b.r[2] + RING, b.r[1] + z], c: [[1, z + RING], [2, D - z + RING]] };
    return { p: [b.r[0] - RING, b.r[1] + z], c: [[0, z + RING], [3, D - z + RING]] };
  }
  // -> { pts: [[u, s], ...] on the ground, gates: [{ g, d }] second-line gates in order with distance from the start, len }
  route(bA, posA, bB, posB) {
    const key = `${bA.id}|${posA.x.toFixed(0)},${posA.z.toFixed(0)},${posA.nx},${posA.nz}|${bB.id}|${posB.x.toFixed(0)},${posB.z.toFixed(0)},${posB.nx},${posB.nz}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const dA = this.door(bA, posA), dB = this.door(bB, posB); let res;
    if (bA.id === bB.id) res = { pts: [dA.p, dB.p], gates: [], len: Math.hypot(dA.p[0] - dB.p[0], dA.p[1] - dB.p[1]) };
    else {
      const cA = this.corners.get(bA.id), cB = this.corners.get(bB.id); let best = null;
      for (const [i, da] of dA.c) { const src = this.node(cA[i]), t = this.tree(src); for (const [j, db] of dB.c) { const dst = this.node(cB[j]), d = da + t.dist[dst] + db; if (isFinite(d) && (!best || d < best.d)) best = { d, src, dst, t }; } }
      if (!best) res = { pts: [dA.p, dB.p], gates: [], len: Math.hypot(dA.p[0] - dB.p[0], dA.p[1] - dB.p[1]), direct: true };
      else {
        const nodes = []; for (let n = best.dst; n >= 0; n = best.t.prev[n]) { nodes.push(n); if (n === best.src) break; } nodes.reverse();
        const pts = [dA.p, ...nodes.map((n) => [this.X[n], this.Z[n]]), dB.p], gates = []; let d = 0;
        for (let i = 1; i < pts.length; i++) { d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); const n = nodes[i - 1]; if (n !== undefined && this.gate[n]) gates.push({ g: this.gate[n], d }); }
        res = { pts, gates, len: d };
      }
    }
    this.cache.set(key, res); return res;
  }
}
