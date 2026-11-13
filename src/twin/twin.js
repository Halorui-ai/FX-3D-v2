// Exploded-building view.  Click a production / office block -> the rest of the campus dims, the storeys step apart, each
// storey gets ONE data card beside it (its gates in rows), gates in the model only carry their name.  Picking a gate opens
// a drawer with its orders; picking an order draws its real route (third-line gate -> second-line gate -> roads -> ...).
import * as THREE from 'three';
import { makeLayout, buildFloor } from './interior.js';
import { makeDemo, statsAt, sumStats, statusOf, orderState, STATUS_COLOR } from './data.js';
import { Router } from './route.js';
import { Panel, esc, hm, dur } from './panel.js';

const $ = (id) => document.getElementById(id);
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const TW = 0.062, TH = TW * 72 / 256;                // gate name tag, as a fraction of the view (constant on screen)
const DIM = 0.26;

function tagTexture(text, color, sel, sub) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 72; const x = c.getContext('2d');
  const rr = (X, Y, W, H, r) => { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + W, Y, X + W, Y + H, r); x.arcTo(X + W, Y + H, X, Y + H, r); x.arcTo(X, Y + H, X, Y, r); x.arcTo(X, Y, X + W, Y, r); x.closePath(); };
  rr(4, 4, 248, 64, 16); x.fillStyle = sel ? 'rgba(28,62,110,0.97)' : 'rgba(12,18,26,0.9)'; x.fill(); x.lineWidth = sel ? 7 : 5; x.strokeStyle = color; x.stroke();
  x.fillStyle = color; x.beginPath(); x.arc(30, 36, 9, 0, 7); x.fill();
  x.textBaseline = 'middle'; x.textAlign = 'left'; x.fillStyle = '#fff';
  if (sub) { x.font = '700 26px "Microsoft JhengHei","Microsoft YaHei",sans-serif'; x.fillText(text, 48, 25, 196); x.font = '500 19px "Microsoft YaHei",sans-serif'; x.fillStyle = '#b9c8d8'; x.fillText(sub, 48, 51, 196); }
  else { x.font = '700 36px "Microsoft JhengHei","Microsoft YaHei",sans-serif'; x.fillText(text, 48, 38, 196); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function tagSprite(tex, scale = 1) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, fog: false, sizeAttenuation: false }));
  sp.center.set(0.5, 0); sp.scale.set(TW * scale, TH * scale, 1); sp.renderOrder = 12; return sp;
}
const roomTex = new Map();
function roomSprite(name) {
  if (!roomTex.has(name)) { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d'); x.font = '600 34px "Microsoft YaHei",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 7; x.strokeStyle = 'rgba(10,16,24,0.85)'; x.strokeText(name, 128, 34); x.fillStyle = '#dfe9f3'; x.fillText(name, 128, 34); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; roomTex.set(name, t); }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: roomTex.get(name), depthTest: false, transparent: true, fog: false })); sp.scale.set(7.2, 1.8, 1); sp.renderOrder = 11; return sp;
}
const gateLabel = (g) => (g.line === 2 ? g.label : g.id.replace(/^ZZ-/, ''));

export class Twin {
  constructor(ctx) {
    Object.assign(this, ctx);                       // DATA, W, camera, controls, flyTo, toWorld
    this.active = null; this.demo = null; this.T = 600; this.e = 1; this.floorSel = null; this.gateSel = null; this.orderSel = null;
    this.overlay = new THREE.Group(); this.overlay.name = 'twinOverlay'; this.W.root.add(this.overlay);   // tags, rings, routes: kept out of the AO pass
    this.panel = new Panel((id) => this.selectOrder(id), () => this.selectGate(null));
    $('twClose').onclick = () => this.close();
    $('fcards').addEventListener('click', (e) => { const r = e.target.closest('[data-gate]'); if (r) this.selectGate(r.dataset.gate); else { const f = e.target.closest('[data-floor]'); if (f) this.setFloor(this.floorSel === +f.dataset.floor ? null : +f.dataset.floor); } });
    $('trace').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) this.selectOrder(null); });
    window.addEventListener('keydown', (e) => { if (e.key !== 'Escape' || !this.active) return; if (this.orderSel) this.selectOrder(null); else if (this.gateSel) this.selectGate(null); else this.close(); });
    window.addEventListener('resize', () => this.panel.resize());
  }
  data() { if (!this.demo) { this.router = new Router(this.DATA); this.demo = makeDemo(this.DATA, this.router); } return this.demo; }
  canOpen(b) { return (b.type === 'P' || b.type === 'O') && !!this.data().byBld.get(b.id); }
  noAO() { const a = [this.overlay]; if (this.active) for (const f of this.active.floors) f.group.traverse((o) => { if (o.userData.noAO) a.push(o); }); return a; }

  // ------------------------------------------------------------ open / close
  open(b, instant = false) {
    if (this.active) this.close(true);
    if (!this.canOpen(b)) return false;
    const gates = this.data().byBld.get(b.id), n = b.floors, fh = b.h / n, D = b.r[3] - b.r[1], Wd = b.r[2] - b.r[0];
    const gap = Math.min(32, Math.max(13, D * 0.5)), shift = D * 0.46, seed = b.id.charCodeAt(0) * 37 + (+b.id.slice(1) || 0);
    const root = new THREE.Group(); root.position.set(b.r[0], 0, b.r[1]); this.W.root.add(root);
    const A = this.active = { b, n, fh, gap, shift, root, rooms: [], floors: [], tags: [], cards: [], Wd, D, t0: performance.now(), dur: 1100, animating: !instant };
    $('fcards').innerHTML = '';
    for (let i = 0; i < n; i++) {
      const L = makeLayout(b, i + 1, gates.filter((g) => g.floor === i + 1), seed), f = buildFloor(L, fh);
      f.index = i; root.add(f.group); A.floors.push(f);
      for (const r of f.rooms) { const sp = roomSprite(r.name); sp.visible = false; this.overlay.add(sp); A.rooms.push({ sp, i, x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 }); }
      for (const a of f.anchors) {
        const sp = tagSprite(tagTexture(a.g.name, '#3ddc84', false)); sp.userData.gate = a.g.id;
        const ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 2.15, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, fog: false }));
        ring.rotation.x = -Math.PI / 2;
        const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, fog: false }));
        disc.rotation.x = -Math.PI / 2; disc.userData.gate = a.g.id;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, fog: false }));
        this.overlay.add(sp, ring, disc, stem);
        A.tags.push({ a, f, sp, ring, disc, stem, key: '' });
      }
      const el = document.createElement('div'); el.className = 'fc'; $('fcards').appendChild(el); A.cards.push({ el, i, key: '' });
    }
    // the real shell: walls go, the roof (with its PV / plant) becomes the top layer of the stack
    A.wall = []; A.roof = [];
    b._mesh.traverse((o) => { if (o.userData.part === 'wall') A.wall.push(o); else if (o.userData.part === 'roof') A.roof.push(o); });
    for (const o of A.wall) o.visible = false;
    for (const o of A.roof) { o.userData._mat = o.material; o.material = o.material.clone(); }
    A.label = this.W.labels.children.find((s) => s.userData.b === b); if (A.label) A.label.visible = false;
    this.dim(true);
    this.floorSel = null; this.gateSel = null; this.orderSel = null; this.e = instant ? 1 : 0;
    this.setNight(this.night || 0);
    this.layoutY(); this.refresh(true); this.bar();
    $('info').style.display = 'none'; document.body.classList.add('twin-on');
    A.ctlWasOpen = !document.body.classList.contains('ctl-min'); document.body.classList.add('ctl-min');
    this.frame(instant ? 0 : 1300);
    return true;
  }
  close(silent) {
    const A = this.active; if (!A) return;
    this.clearRoute(); this.dim(false);
    for (const o of A.wall) o.visible = true;
    for (const o of A.roof) { o.position.set(0, 0, 0); o.visible = true; o.material.dispose(); o.material = o.userData._mat; }
    if (A.label) A.label.visible = true;
    for (const f of A.floors) f.group.userData.dispose();
    this.W.root.remove(A.root);
    for (const o of [...this.overlay.children]) { this.overlay.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map && ![...roomTex.values()].includes(o.material.map)) o.material.map.dispose(); o.material.dispose(); } }
    this.active = null; this.panel.hide(); $('fcards').innerHTML = ''; $('trace').style.display = 'none';
    document.body.classList.remove('twin-on'); $('twinbar').style.display = 'none'; if (A.ctlWasOpen) document.body.classList.remove('ctl-min');
    if (!silent) { const b = A.b, c = this.toWorld((b.r[0] + b.r[2]) / 2, (b.r[1] + b.r[3]) / 2, b.h * 0.4); this.flyTo(c.clone().add(new THREE.Vector3(-90, 150, 260)), c, 900); }
  }
  // darken everything that is not the opened block, so the eye stays on it
  dim(on) {
    if (on) {
      const A = this.active, seen = new Set(); this.dimmed = [];
      const walk = (o) => { if (o === A.root || o === this.overlay || o === this.W.labels || o === this.W.zoneLabels || o === this.W.site.gateLabels) return;
        const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const m of ms) if (m.color && !seen.has(m) && !A.roof.some((r) => r.material === m)) { seen.add(m); this.dimmed.push([m, m.color.clone()]); m.color.multiplyScalar(DIM); }
        for (const c of o.children) walk(c); };
      walk(this.W.root); this.W.groundUniforms.uDim.value = DIM;
    } else if (this.dimmed) { for (const [m, c] of this.dimmed) m.color.copy(c); this.dimmed = null; this.W.groundUniforms.uDim.value = 1; }
  }

  // ------------------------------------------------------------ geometry of the stack
  levelY(i) { const A = this.active; return 0.8 + i * A.fh + this.e * i * A.gap; }
  levelZ(i) { return -this.e * i * this.active.shift; }        // upper storeys step back to the north so the ones below stay visible
  layoutY() {
    const A = this.active, k = this.floorSel;
    A.floors.forEach((f, i) => { f.group.position.set(0, this.levelY(i), this.levelZ(i)); f.group.visible = k === null || i <= k; });
    for (const o of A.roof) { o.position.set(0, 0.8 + this.e * A.n * A.gap, this.levelZ(A.n)); o.visible = k === null; }
    for (const r of A.rooms) { r.sp.visible = k === r.i && this.e > 0.9; r.sp.position.set(A.b.r[0] + r.x, this.levelY(r.i) + 3.4, A.b.r[1] + r.z + this.levelZ(r.i)); }
    for (const q of A.tags) {
      const y = this.levelY(q.f.index), vis = this.e > 0.6 && (k === null ? true : q.f.index === k), top = y + (q.a.loose ? 3 : q.f.hw + 1.5), x = A.b.r[0] + q.a.x, z = A.b.r[1] + q.a.z + this.levelZ(q.f.index);
      q.sp.position.set(x, top, z); q.ring.position.set(x, y + 0.09, z); q.disc.position.set(x, y + 0.07, z);
      q.stem.position.set(x, (y + top) / 2, z); q.stem.scale.set(1, top - y, 1);
      q.sp.visible = q.ring.visible = q.disc.visible = q.stem.visible = vis;
    }
  }
  gate3D(id) {                                       // position of any gate in the campus frame
    const A = this.active, g = this.demo.gates.get(id);
    if (g.line === 2) return new THREE.Vector3(g.p[0], 1.4, g.p[1]);
    if (g.bld === A.b.id) { const q = A.tags.find((t) => t.a.g.id === id); return new THREE.Vector3(A.b.r[0] + q.a.x, this.levelY(q.f.index) + 1.6, A.b.r[1] + q.a.z + this.levelZ(q.f.index)); }
    const b = this.demo.bld.get(g.bld), p = this.demo.pos.get(id);
    return new THREE.Vector3(b.r[0] + Math.max(-3, p.x), (g.floor - 1) * (b.h / b.floors) + 1.6, b.r[1] + p.z);
  }
  bar() {
    const A = this.active, el = $('twFloors'); $('twinbar').style.display = 'flex'; $('twName').textContent = `${A.b.id} · ${A.b.typeName}`;
    el.innerHTML = '';
    const add = (label, k) => { const b = document.createElement('button'); b.textContent = label; b.className = this.floorSel === k ? 'on' : ''; b.onclick = () => this.setFloor(k); el.appendChild(b); };
    add('全部', null); for (let i = A.n - 1; i >= 0; i--) add(`${i + 1}F`, i);
  }
  // camera: the whole stack from the south at a shallow angle, or one storey from above
  frame(ms = 900) {
    const A = this.active, b = A.b, cu = (b.r[0] + b.r[2]) / 2, cs = (b.r[1] + b.r[3]) / 2;
    if (this.floorSel === null) {
      const top = A.n * A.fh + A.n * A.gap, back = A.n * A.shift, c = this.toWorld(cu + A.Wd * 0.12, cs - back * 0.5, top * 0.4), d = Math.max(A.Wd * 1.25, (top + back * 0.55) * 1.42);
      this.flyTo(c.clone().add(new THREE.Vector3(-0.30 * d, 0.60 * d, 0.80 * d)), c, ms);
    } else {
      const y = 0.8 + this.floorSel * (A.fh + A.gap), c = this.toWorld(cu + A.Wd * 0.1, cs - this.floorSel * A.shift, y), d = Math.max(A.Wd * 1.1, A.D * 1.9);
      this.flyTo(c.clone().add(new THREE.Vector3(-0.12 * d, 0.86 * d, 0.5 * d)), c, ms);
    }
  }
  setFloor(k) { if (!this.active) return; this.floorSel = k; this.orderSel = null; this.clearRoute(); if (this.gateSel) { const g = this.data().gates.get(this.gateSel); if (k !== null && g.floor - 1 !== k) this.gateSel = null; } this.layoutY(); this.bar(); this.refresh(true); this.frame(); }
  selectGate(id) { if (!this.active) return; const g = id && this.data().gates.get(id); this.gateSel = g && g.bld === this.active.b.id ? id : null; if (this.orderSel) { this.orderSel = null; this.clearRoute(); this.frame(); } this.refresh(true); }
  selectOrder(id) { if (!this.active) return; this.orderSel = id && this.demo.byId.has(id) ? id : null; this.refresh(true); if (this.orderSel) this.fitRoute(); else this.frame(); }
  setNight(n) { this.night = n; if (this.active) for (const f of this.active.floors) f.lit(n); }
  onTime(T) { this.T = T; if (this.active) this.refresh(false); }

  // ------------------------------------------------------------ data -> tags, floor cards, top bar, drawer
  refresh(force) {
    const A = this.active; if (!A) return;
    const st = this.stats = statsAt(this.data(), this.T), gates = this.data().byBld.get(A.b.id), S = (g) => st.S.get(g.id);
    for (const q of A.tags) {
      const s = S(q.a.g), sel = this.gateSel === q.a.g.id, stt = statusOf(s), key = `${stt}|${sel}`;
      if (key !== q.key) { q.key = key; q.sp.material.map.dispose(); q.sp.material.map = tagTexture(q.a.g.name, STATUS_COLOR[stt], sel); q.sp.material.needsUpdate = true; }
      const c = new THREE.Color(STATUS_COLOR[stt]); q.ring.material.color.copy(c); q.disc.material.color.copy(c); q.stem.material.color.copy(c);
      const r = 2.4 + Math.min(9, Math.sqrt(s.passed) * 0.55); q.disc.scale.set(r, r, 1); q.bad = s.late > 0;
      q.sp.scale.set(sel ? TW * 1.25 : TW, sel ? TH * 1.25 : TH, 1); q.sp.material.opacity = this.gateSel && !sel ? 0.55 : 1; q.sp.renderOrder = sel ? 13 : 12;
    }
    // one card per storey
    for (const c of A.cards) {
      const gs = gates.filter((g) => g.floor === c.i + 1).sort((a, b) => a.name.localeCompare(b.name)), t = sumStats(gs.map(S)), worst = t.late > 0 ? 'bad' : t.unrecv > 0 ? 'warn' : 'ok';
      const n = (v, col) => `<td style="color:${v > 0 ? col : '#4f5d6b'}">${v}</td>`;
      const html = `<div class="fh" data-floor="${c.i}" style="border-color:${STATUS_COLOR[worst]}"><b>${c.i + 1}F</b><span class="sum"><i style="color:${STATUS_COLOR.run}">将到 ${t.incoming}</i><i style="color:${t.late ? STATUS_COLOR.bad : '#6f8296'}">超时 ${t.late}</i><i style="color:${t.unrecv ? STATUS_COLOR.warn : '#6f8296'}">未收 ${t.unrecv}</i></span></div>
        <table><tr class="hd"><td></td><td>将到达</td><td>在途超时</td><td>未接收</td><td>已过岗</td></tr>${gs.map((g) => { const s = S(g); return `<tr data-gate="${esc(g.id)}" class="${this.gateSel === g.id ? 'on' : ''}"><td><u style="background:${STATUS_COLOR[statusOf(s)]}"></u>${esc(g.name)}${g.side ? '' : '<em>未定位</em>'}</td>${n(s.incoming, STATUS_COLOR.run)}${n(s.late, STATUS_COLOR.bad)}${n(s.unrecv, STATUS_COLOR.warn)}${n(s.passed, '#e8eef5')}</tr>`; }).join('')}</table>`;
      if (html !== c.key) { c.key = html; c.el.innerHTML = html; }
    }
    const all = sumStats(gates.map(S)), chip = (v, label, col) => `<span class="kc" style="color:${v > 0 ? col : '#6f8296'}"><b>${v}</b>${label}</span>`;
    $('twKpis').innerHTML = chip(all.incoming, '将到达', STATUS_COLOR.run) + chip(all.late, '在途超时', STATUS_COLOR.bad) + chip(all.unrecv, '超时未接收', STATUS_COLOR.warn) + chip(all.passed, '已过岗', '#e8eef5') + `<span class="kc dimc">截至 ${hm(this.T)}</span>`;
    if (this.gateSel) { const g = this.data().gates.get(this.gateSel); this.panel.show({ g, s: S(g), sub: `三线岗 · ${A.b.typeName} ${g.floor}F${g.side ? '' : ' · 名称不含方位，未定位'}`, T: this.T, order: this.orderSel }); }
    else this.panel.hide();
    document.body.classList.toggle('twin-drawer', !!this.gateSel);
    this.buildRoute(force);
  }

  // ------------------------------------------------------------ route of one order
  clearRoute() { if (this.route) { for (const o of this.route.objs) { this.overlay.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } } this.route = null; } $('trace').style.display = 'none'; }
  buildRoute(force) {
    const id = this.orderSel; if (!id) { if (this.route) this.clearRoute(); return; }
    const o = this.demo.byId.get(id), nPass = o.legs.filter((l) => l.t <= this.T).length, key = `${id}|${nPass}|${this.floorSel}`;
    if (!force && this.route && this.route.key === key) { this.trace(o); return; }
    this.clearRoute();
    const rt = this.demo.routeOf(o), Y = 1.4, P = [this.gate3D(o.from)];
    for (const p of rt.pts) P.push(new THREE.Vector3(p[0], Y, p[1]));
    P.push(this.gate3D(o.to));
    const cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + P[i].distanceTo(P[i - 1]));
    const total = cum[cum.length - 1], d0 = cum[1], legD = [0, ...rt.gates.map((x) => Math.min(total, d0 + x.d)), total];
    const at = (d) => { let i = 1; while (i < cum.length - 1 && cum[i] < d) i++; const k = (d - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]); return P[i - 1].clone().lerp(P[i], Math.min(1, Math.max(0, k))); };
    const slice = (a, b) => { const pts = [at(a)]; for (let i = 0; i < P.length; i++) if (cum[i] > a + 0.01 && cum[i] < b - 0.01) pts.push(P[i]); pts.push(at(b)); return pts; };
    const state = orderState(o, this.T), col = new THREE.Color(state.k === 'bad' ? STATUS_COLOR.bad : o.special ? '#b98cff' : state.k === 'warn' ? STATUS_COLOR.warn : '#4fc3ff');
    const done = nPass ? legD[Math.min(legD.length - 1, nPass - 1)] : 0, rad = Math.min(3.0, Math.max(1.1, total / 520)), objs = [];
    const tube = (pts, opacity) => { if (pts.length < 2) return; const path = new THREE.CurvePath(); for (let i = 1; i < pts.length; i++) if (pts[i].distanceTo(pts[i - 1]) > 0.01) path.add(new THREE.LineCurve3(pts[i - 1], pts[i])); if (!path.curves.length) return;
      const m = new THREE.Mesh(new THREE.TubeGeometry(path, Math.min(900, Math.max(24, Math.round(path.getLength() / 2.5))), rad, 6, false), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity, depthWrite: false, fog: false })); m.renderOrder = 5; this.overlay.add(m); objs.push(m); };
    if (done > 0.5) tube(slice(0, done), 0.95);
    if (total - done > 0.5) tube(slice(done, total), 0.45);
    // a tag at every gate of the trip: name + when it was passed
    o.legs.forEach((l, i) => { const g = this.demo.gates.get(l.g), passed = l.t <= this.T, p = at(legD[i]);
      if (g.bld === this.active.b.id && g.line !== 2) return;      // the opened block already shows its own gate tags
      const sp = tagSprite(tagTexture(gateLabel(g), passed ? '#' + col.getHexString() : '#6f8296', false, (g.line === 2 ? '二线岗 · ' : '三线岗 · ') + (passed ? hm(l.t) + ' 已过' : '未到')), 1.5);
      sp.position.copy(p).add(new THREE.Vector3(0, 9, 0)); this.overlay.add(sp); objs.push(sp);
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 9, 6), new THREE.MeshBasicMaterial({ color: passed ? col : new THREE.Color('#6f8296'), fog: false })); pin.position.copy(p).add(new THREE.Vector3(0, 4.5, 0)); this.overlay.add(pin); objs.push(pin); });
    const here = new THREE.Mesh(new THREE.SphereGeometry(rad * 3.2, 16, 12), new THREE.MeshBasicMaterial({ color: col.clone().lerp(new THREE.Color(1, 1, 1), 0.5), transparent: true, opacity: 0.95, fog: false })); here.position.copy(at(done)); here.renderOrder = 7; this.overlay.add(here); objs.push(here);
    if (state.k === 'bad' || state.k === 'run') { const sp = tagSprite(tagTexture('当前位置', '#ffffff', true), 1.5); sp.position.copy(at(done)).add(new THREE.Vector3(0, rad * 4 + 16, 0)); sp.renderOrder = 14; this.overlay.add(sp); objs.push(sp); }
    const box = new THREE.Box3().setFromPoints(P);
    this.route = { key, objs, here, box, total };
    this.trace(o);
  }
  fitRoute() {
    if (!this.route) return; const b = this.route.box, c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3()), d = Math.max(s.x * 1.0, s.z * 1.45, 260) + 140;
    const w = this.toWorld(c.x - d * 0.19, c.z + d * 0.04, 0); this.flyTo(w.clone().add(new THREE.Vector3(-0.1 * d, 0.82 * d, 0.56 * d)), w, 1000);
  }
  // bottom strip: the trip as a row of gates with times (same idea as the dashboard's order trace)
  trace(o) {
    const T = this.T, st = orderState(o, T), el = $('trace'); el.style.display = 'block';
    const steps = [{ label: '申请', sub: o.dept, t: o.tApply, line: 0 }, ...o.legs.map((l) => { const g = this.demo.gates.get(l.g); return { label: gateLabel(g), sub: g.line === 2 ? '二线岗' : (l.g === o.from ? '三线岗 · 流出' : '三线岗 · 流入'), t: l.t, line: g.line }; }), { label: '接收', sub: o.recvDept, t: o.tRecv, line: 0 }];
    let html = '', prev = null;
    for (const s of steps) { const ok = s.t <= T; if (prev) html += `<div class="ar${ok ? ' ok' : ''}">${ok ? dur(s.t - prev.t) : ''}<i></i></div>`; html += `<div class="sp${ok ? ' ok' : ''}${s.line === 2 ? ' l2' : ''}"><b>${esc(s.label)}</b><span>${esc(s.sub)}</span><em>${ok ? hm(s.t) : '未到'}</em></div>`; prev = s; }
    const over = st.k === 'bad' ? ` · 已超 ${dur(T - o.tLimit)}` : st.text === '超时未接收' ? ` · 已超 ${dur(T - o.tRecvLimit)}` : '';
    const h = `<div class="trh"><b class="${o.special ? 'sp' : ''}">${esc(o.id)}</b>${o.special ? '<span class="tg">特保</span>' : ''}<span>${esc(o.cat)}</span><span class="st" style="color:${STATUS_COLOR[st.k]};border-color:${STATUS_COLOR[st.k]}">${st.text}${over}</span><span class="dimc">时限 ${hm(o.tLimit)} · 路程约 ${Math.round(this.route ? this.route.total : 0)} 米</span><button data-close="1">✕ 关闭路线</button></div><div class="trs">${html}</div>`;
    if (el._h !== h) { el._h = h; el.innerHTML = h; }
  }

  // ------------------------------------------------------------ per frame
  tick() {
    const A = this.active; if (!A) return;
    const now = performance.now();
    if (A.animating) { const k = Math.min(1, (now - A.t0) / A.dur); this.e = ease(k); this.layoutY(); if (k >= 1) A.animating = false; }
    const p = 0.5 + 0.5 * Math.sin(now / 260);
    for (const q of A.tags) { const s = q.bad ? 1 + 0.35 * p : 1; q.ring.scale.set(s, s, 1); q.ring.material.opacity = q.bad ? 0.55 + 0.45 * p : 0.85; }
    if (this.route) { const s = 1 + 0.35 * p; this.route.here.scale.set(s, s, s); }
    // floor cards follow the east edge of their storey
    const v = new THREE.Vector3(), w = window.innerWidth, h = window.innerHeight, far = !!this.orderSel;
    for (const c of A.cards) {
      const vis = !far && this.e > 0.75 && (this.floorSel === null || this.floorSel === c.i);
      if (!vis) { c.el.style.display = 'none'; continue; }
      v.set(A.b.r[2] + 4, this.levelY(c.i) + A.floors[c.i].hw * 0.5, (A.b.r[1] + A.b.r[3]) / 2 + this.levelZ(c.i)); this.W.root.localToWorld(v);
      const dist = v.distanceTo(this.camera.position); v.project(this.camera);
      if (v.z > 1 || Math.abs(v.x) > 1.3 || Math.abs(v.y) > 1.3) { c.el.style.display = 'none'; continue; }
      const k = Math.min(1, Math.max(0.5, 300 / dist)), x = (v.x * 0.5 + 0.5) * w + 14, y = (-v.y * 0.5 + 0.5) * h;
      c.el.style.display = 'block'; c.el.classList.toggle('mini', k < 0.66);
      c.el.style.transform = `translate(${Math.min(x, w - 40).toFixed(1)}px, ${y.toFixed(1)}px) translateY(-50%) scale(${k.toFixed(3)})`;
    }
  }
  // returns true when the click was used by the exploded view
  click(ray) {
    if (!this.active) return false;
    const objs = []; for (const q of this.active.tags) if (q.sp.visible) objs.push(q.sp, q.disc);
    const h = ray.intersectObjects(objs, false)[0];
    if (h) this.selectGate(h.object.userData.gate);
    return true;
  }
}
