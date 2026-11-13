// Simulated release-order data and the per-gate statistics.
// Definitions follow the dashboard's CONTEXT.md (Halorui-ai/FX-): everything is counted per ORDER, "arrived" = a release
// record at the inflow gate, "in transit" = not arrived yet, release timeouts are red, receiving timeouts are yellow,
// special-security orders carry the WF9897 prefix.  The only thing the demo adds is a deadline, so that the state can be
// replayed for any time of the day (the real export only carries the timeout flags as of the export time).
import * as TX from '../textures.js';
import { parseGate, demoGateNames } from './interior.js';

const CATS = [['生產物料', 46], ['治具', 12], ['設備', 9], ['包材', 14], ['辦公用品', 5], ['樣品', 8], ['報廢品', 6]];
const SCATS = ['A級物料', '新產品機台'];
const DEPTS = ['製造一處', '製造二處', '製造三處', '品管處', '工程處', '物流處', '資材處', '設備處', 'NPI處'];
// share of the day's requests per hour (two day-shift peaks, a smaller night shift)
const HOURS = [1.2, 1, 0.8, 0.7, 0.7, 0.9, 1.6, 3.2, 6.2, 7.6, 7.8, 6.6, 3.6, 5.4, 7.2, 7.4, 6.6, 5.2, 3.4, 3.6, 4.2, 3.8, 2.6, 1.7];

export function makeDemo(DATA, nOrders = 9000) {
  const R = TX.rng(20261113), gates = new Map(), byBld = new Map(), list = [], centre = new Map();
  for (const b of DATA.buildings) {
    if (b.type !== 'P' && b.type !== 'O') continue;
    centre.set(b.id, [(b.r[0] + b.r[2]) / 2, (b.r[1] + b.r[3]) / 2, b.zone]);
    const arr = [];
    for (const id of demoGateNames(b, b.id.charCodeAt(0) * 131 + (+b.id.slice(1) || 0) * 17)) {
      const g = parseGate(id); g.zone = b.zone; g.type = b.type;
      g.w = (g.floor === 1 ? 2.3 : 1) * (b.type === 'P' ? 1 : 0.3) * Math.exp((R() + R() + R() - 1.5) * 0.9);
      gates.set(g.id, g); arr.push(g); list.push(g);
    }
    byBld.set(b.id, arr);
  }
  const cum = []; let tot = 0; for (const g of list) { tot += g.w; cum.push(tot); }
  const pick = () => { const v = R() * tot; let lo = 0, hi = cum.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < v) lo = m + 1; else hi = m; } return list[lo]; };
  const hc = []; let ht = 0; for (const h of HOURS) { ht += h; hc.push(ht); }
  const byZone = new Map(); for (const g of list) { if (!byZone.has(g.zone)) byZone.set(g.zone, []); byZone.get(g.zone).push(g); }
  const wpick = (arr) => { let s = 0; for (const g of arr) s += g.w; let v = R() * s; for (const g of arr) { v -= g.w; if (v <= 0) return g; } return arr[0]; };
  const expo = (m) => -Math.log(1 - R() * 0.999) * m;
  const orders = [];
  for (let i = 0; i < nOrders; i++) {
    const from = pick(); let to = from, k = R();
    for (let n = 0; n < 8 && (to === from); n++) to = k < 0.2 ? wpick(byBld.get(from.bld)) : k < 0.72 ? wpick(byZone.get(from.zone)) : pick();
    if (to === from) continue;
    const v = R() * ht; let h = 0; while (hc[h] < v) h++;
    const tApply = h * 60 + R() * 60, special = R() < 0.06;
    const a = centre.get(from.bld), b = centre.get(to.bld), dist = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
    const tOut = tApply + 3 + expo(7);
    let travel = 6 + dist / 55 + Math.abs(from.floor - to.floor) * 3 + (from.floor - 1 + to.floor - 1) * 2 + expo(11);
    if (R() < 0.085) travel += 70 + expo(150);                     // stuck somewhere on the way
    const tArr = tOut + travel, limit = special ? 45 : 90;
    const legs = [{ g: from.id, t: tOut }];
    if (from.bld !== to.bld && from.floor > 1 && R() < 0.5) { const g1 = byBld.get(from.bld).find((g) => g.floor === 1); if (g1) legs.push({ g: g1.id, t: tOut + (tArr - tOut) * (0.15 + R() * 0.15) }); }
    if (from.bld !== to.bld && to.floor > 1 && R() < 0.5) { const g1 = byBld.get(to.bld).find((g) => g.floor === 1); if (g1) legs.push({ g: g1.id, t: tOut + (tArr - tOut) * (0.7 + R() * 0.15) }); }
    legs.push({ g: to.id, t: tArr });
    let tRecv = tArr + 2 + expo(11); if (R() < 0.07) tRecv += 100 + expo(260);
    let cat; if (special) cat = SCATS[R() < 0.6 ? 0 : 1]; else { let s = 0; for (const c of CATS) s += c[1]; let q = R() * s; cat = CATS[0][0]; for (const c of CATS) { q -= c[1]; if (q <= 0) { cat = c[0]; break; } } }
    orders.push({ id: (special ? 'WF9897' : 'WF7501') + '261113' + String(100000 + i).slice(1), special, cat, dept: DEPTS[Math.floor(R() * DEPTS.length)], recvDept: DEPTS[Math.floor(R() * DEPTS.length)],
      from: from.id, to: to.id, tApply, legs, tArr, tLimit: tApply + limit, tRecv, tRecvLimit: tArr + 60 });
  }
  return { gates, byBld, orders, centre };
}

const blank = () => ({ incoming: 0, late: 0, passed: 0, unrecv: 0, out: 0, special: 0, arrived: 0, hourly: new Array(24).fill(0), src: new Map(), cats: new Map(), lateList: [], incList: [], unrecvList: [] });
// State of every gate at minute T of the day.
export function statsAt(demo, T) {
  const S = new Map(); for (const id of demo.gates.keys()) S.set(id, blank());
  let total = 0, transit = 0, lateAll = 0;
  for (const o of demo.orders) {
    if (o.tApply > T) continue;
    total++;
    for (const l of o.legs) if (l.t <= T) { const s = S.get(l.g); s.passed++; s.hourly[Math.min(23, Math.floor(l.t / 60))]++; }
    const to = S.get(o.to), arrived = o.tArr <= T;
    to.cats.set(o.cat, (to.cats.get(o.cat) || 0) + 1);
    if (!arrived) {
      transit++;
      const late = T > o.tLimit, fb = demo.gates.get(o.from).bld, e = to.src.get(fb) || [0, 0];
      if (late) { to.late++; lateAll++; e[1]++; to.lateList.push({ o, over: T - o.tLimit }); } else { to.incoming++; e[0]++; to.incList.push({ o, left: o.tLimit - T }); }
      to.src.set(fb, e); if (o.special) to.special++;
      if (o.legs[0].t <= T) S.get(o.from).out++;
    } else {
      to.arrived++;
      if (o.tRecv > T && T > o.tRecvLimit) { to.unrecv++; to.unrecvList.push({ o, over: T - o.tRecvLimit }); }
    }
  }
  for (const s of S.values()) { s.lateList.sort((a, b) => b.over - a.over); s.unrecvList.sort((a, b) => b.over - a.over); s.incList.sort((a, b) => a.left - b.left); }
  return { S, total, transit, lateAll, T };
}
export function sumStats(list) {
  const t = blank();
  for (const s of list) { for (const k of ['incoming', 'late', 'passed', 'unrecv', 'out', 'special', 'arrived']) t[k] += s[k]; for (let h = 0; h < 24; h++) t.hourly[h] += s.hourly[h];
    for (const [k, v] of s.src) { const e = t.src.get(k) || [0, 0]; e[0] += v[0]; e[1] += v[1]; t.src.set(k, e); } for (const [k, v] of s.cats) t.cats.set(k, (t.cats.get(k) || 0) + v);
    t.lateList.push(...s.lateList); t.unrecvList.push(...s.unrecvList); t.incList.push(...s.incList); }
  t.lateList.sort((a, b) => b.over - a.over); t.unrecvList.sort((a, b) => b.over - a.over);
  return t;
}
export const statusOf = (s) => (s.late > 0 ? 'bad' : s.unrecv > 0 ? 'warn' : 'ok');
export const STATUS_COLOR = { bad: '#ff5a4d', warn: '#ffb020', ok: '#3ddc84' };
