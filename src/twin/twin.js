// Exploded-building view: click a production / office block -> its storeys lift apart, every storey shows its gates with
// live counters, a gate (or the whole block) opens a data panel.  Everything lives in the campus frame under W.root.
import * as THREE from 'three';
import { makeLayout, buildFloor } from './interior.js';
import { makeDemo, statsAt, sumStats, statusOf, STATUS_COLOR } from './data.js';
import { Panel } from './panel.js';

const $ = (id) => document.getElementById(id);
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

const BW = 0.132, BH = 0.0516;                       // badge size as a fraction of the view (constant on screen)
const roomTex = new Map();
function roomSprite(name) {
  if (!roomTex.has(name)) { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d'); x.font = '600 34px "Microsoft YaHei",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 7; x.strokeStyle = 'rgba(10,16,24,0.85)'; x.strokeText(name, 128, 34); x.fillStyle = '#dfe9f3'; x.fillText(name, 128, 34); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; roomTex.set(name, t); }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: roomTex.get(name), depthTest: false, transparent: true, fog: false })); sp.scale.set(7.2, 1.8, 1); sp.renderOrder = 11; return sp;
}
function badgeCanvas() { const c = document.createElement('canvas'); c.width = 512; c.height = 200; return c; }
function drawBadge(c, g, s, sel) {
  const x = c.getContext('2d'), col = STATUS_COLOR[statusOf(s)];
  x.clearRect(0, 0, 512, 200);
  const rr = (X, Y, W, H, r) => { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + W, Y, X + W, Y + H, r); x.arcTo(X + W, Y + H, X, Y + H, r); x.arcTo(X, Y + H, X, Y, r); x.arcTo(X, Y, X + W, Y, r); x.closePath(); };
  rr(6, 6, 500, 188, 26); x.fillStyle = sel ? 'rgba(22,44,78,0.96)' : 'rgba(12,18,26,0.92)'; x.fill(); x.lineWidth = sel ? 10 : 6; x.strokeStyle = col; x.stroke();
  x.textBaseline = 'middle'; x.textAlign = 'left'; x.font = '700 56px "Microsoft JhengHei","Microsoft YaHei",sans-serif'; x.fillStyle = '#ffffff'; x.fillText(g.name, 28, 58);
  x.textAlign = 'right'; x.font = '600 34px "Segoe UI",sans-serif'; x.fillStyle = '#8fa3b8'; x.fillText(g.side ? `${g.floor}F` : `${g.floor}F · 未定位`, 486, 58);
  x.fillStyle = 'rgba(255,255,255,0.12)'; x.fillRect(24, 98, 464, 2);
  const cell = (i, n, label, color) => { const cx = 28 + i * 118; x.textAlign = 'left'; x.font = '700 50px "Segoe UI",sans-serif'; x.fillStyle = n > 0 ? color : '#5d6b7a'; x.fillText(String(n), cx, 136);
    x.font = '500 22px "Microsoft YaHei",sans-serif'; x.fillStyle = '#9fb2c6'; x.fillText(label, cx, 176); };
  cell(0, s.incoming, '将到达', '#58a3f2'); cell(1, s.late, '在途超时', STATUS_COLOR.bad); cell(2, s.unrecv, '未接收', STATUS_COLOR.warn); cell(3, s.passed, '已过岗', '#e8eef5');
}

export class Twin {
  constructor(ctx) {
    Object.assign(this, ctx);                       // DATA, W, camera, controls, flyTo, toWorld
    this.active = null; this.demo = null; this.T = 600; this.e = 1; this.floorSel = null; this.gateSel = null;
    this.overlay = new THREE.Group(); this.overlay.name = 'twinOverlay'; this.W.root.add(this.overlay);   // badges, rings, arcs: kept out of the AO pass
    this.panel = new Panel((id) => this.selectGate(id));
    $('twClose').onclick = () => this.close();
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.active) { if (this.gateSel) this.selectGate(null); else this.close(); } });
    window.addEventListener('resize', () => this.panel.resize());
  }
  data() { if (!this.demo) this.demo = makeDemo(this.DATA); return this.demo; }
  canOpen(b) { return (b.type === 'P' || b.type === 'O') && !!this.data().byBld.get(b.id); }
  noAO() { const a = [this.overlay]; if (this.active) for (const f of this.active.floors) f.group.traverse((o) => { if (o.userData.noAO) a.push(o); }); return a; }

  open(b, instant = false) {
    if (this.active) this.close(true);
    if (!this.canOpen(b)) return false;
    const gates = this.data().byBld.get(b.id), n = b.floors, fh = b.h / n, D = b.r[3] - b.r[1], Wd = b.r[2] - b.r[0];
    const gap = Math.min(32, Math.max(13, D * 0.5)), shift = D * 0.46, seed = b.id.charCodeAt(0) * 37 + (+b.id.slice(1) || 0);
    const root = new THREE.Group(); root.position.set(b.r[0], 0, b.r[1]); this.W.root.add(root);
    const A = this.active = { b, n, fh, gap, shift, root, rooms: [], floors: [], badges: [], Wd, D, t0: performance.now(), dur: 1100, animating: !instant };
    for (let i = 0; i < n; i++) {
      const L = makeLayout(b, i + 1, gates.filter((g) => g.floor === i + 1), seed), f = buildFloor(L, fh);
      f.index = i; root.add(f.group); A.floors.push(f);
      for (const r of f.rooms) { const sp = roomSprite(r.name); sp.visible = false; this.overlay.add(sp); A.rooms.push({ sp, i, x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 }); }
      for (const a of f.anchors) {
        const cv = badgeCanvas(), tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, fog: false, sizeAttenuation: false }));
        sp.center.set(0.5, 0); sp.scale.set(BW, BH, 1); sp.renderOrder = 12; sp.userData.gate = a.g.id;
        const ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 2.15, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, fog: false }));
        ring.rotation.x = -Math.PI / 2; ring.userData.gate = a.g.id;
        const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, fog: false }));
        disc.rotation.x = -Math.PI / 2; disc.userData.gate = a.g.id;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, fog: false }));
        this.overlay.add(sp, ring, disc, stem);
        A.badges.push({ a, f, cv, tex, sp, ring, disc, stem, key: '' });
      }
    }
    // the real shell: walls go, the roof (with its PV / plant) becomes the top layer of the exploded stack
    A.wall = []; A.roof = [];
    b._mesh.traverse((o) => { if (o.userData.part === 'wall') A.wall.push(o); else if (o.userData.part === 'roof') A.roof.push(o); });
    for (const o of A.wall) o.visible = false;
    A.label = this.W.labels.children.find((s) => s.userData.b === b); if (A.label) A.label.visible = false;
    this.floorSel = null; this.gateSel = null; this.e = instant ? 1 : 0;
    this.setNight(this.night || 0);
    this.layoutY(); this.refresh(true); this.bar();
    $('info').style.display = 'none'; document.body.classList.add('twin-on');
    this.frame(instant ? 0 : 1300);
    return true;
  }
  close(silent) {
    const A = this.active; if (!A) return;
    for (const o of A.wall) o.visible = true;
    for (const o of A.roof) { o.position.set(0, 0, 0); o.visible = true; }
    if (A.label) A.label.visible = true;
    for (const f of A.floors) f.group.userData.dispose();
    this.W.root.remove(A.root);
    for (const o of [...this.overlay.children]) { this.overlay.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map && ![...roomTex.values()].includes(o.material.map)) o.material.map.dispose(); o.material.dispose(); } }
    this.active = null; this.arcs = null; this.panel.hide(); document.body.classList.remove('twin-on'); $('twinbar').style.display = 'none';
    if (!silent) { const b = A.b, c = this.toWorld((b.r[0] + b.r[2]) / 2, (b.r[1] + b.r[3]) / 2, b.h * 0.4); this.flyTo(c.clone().add(new THREE.Vector3(-90, 150, 260)), c, 900); }
  }
  levelY(i) { const A = this.active; return 0.8 + i * A.fh + this.e * i * A.gap; }
  levelZ(i) { return -this.e * i * this.active.shift; }        // upper storeys step back to the north so the ones below stay visible
  layoutY() {
    const A = this.active, k = this.floorSel;
    A.floors.forEach((f, i) => { f.group.position.set(0, this.levelY(i), this.levelZ(i)); f.group.visible = k === null || i <= k; });
    for (const o of A.roof) { o.position.set(0, 0.8 + this.e * A.n * A.gap, this.levelZ(A.n)); o.visible = k === null; }
    for (const r of A.rooms) { r.sp.visible = k === r.i && this.e > 0.9; r.sp.position.set(A.b.r[0] + r.x, this.levelY(r.i) + 3.4, A.b.r[1] + r.z + this.levelZ(r.i)); }
    for (const q of A.badges) {
      const y = this.levelY(q.f.index), vis = this.e > 0.6 && (k === null ? true : q.f.index === k), top = y + (q.a.loose ? 4 : q.f.hw + 2.5), x = A.b.r[0] + q.a.x, z = A.b.r[1] + q.a.z + this.levelZ(q.f.index);
      q.sp.position.set(x, top, z); q.ring.position.set(x, y + 0.09, z); q.disc.position.set(x, y + 0.07, z);
      q.stem.position.set(x, (y + top) / 2, z); q.stem.scale.set(1, top - y, 1);
      q.sp.visible = q.ring.visible = q.disc.visible = q.stem.visible = vis;
    }
  }
  bar() {
    const A = this.active, el = $('twFloors'); $('twinbar').style.display = 'flex'; $('twName').textContent = `${A.b.id} · ${A.b.typeName} · ${A.n} 层`;
    el.innerHTML = '';
    const add = (label, k) => { const b = document.createElement('button'); b.textContent = label; b.className = this.floorSel === k ? 'on' : ''; b.onclick = () => this.setFloor(k); el.appendChild(b); };
    add('全部楼层', null); for (let i = A.n - 1; i >= 0; i--) add(`${i + 1}F`, i);
  }
  // camera: whole stack from the south at a shallow angle (so every storey shows), or one storey from above
  frame(ms = 900) {
    const A = this.active, b = A.b, cu = (b.r[0] + b.r[2]) / 2, cs = (b.r[1] + b.r[3]) / 2;
    if (this.floorSel === null) {
      const top = A.n * A.fh + A.n * A.gap, back = A.n * A.shift, c = this.toWorld(cu, cs - back * 0.5, top * 0.4), d = Math.max(A.Wd * 1.08, (top + back * 0.55) * 1.42);
      this.flyTo(c.clone().add(new THREE.Vector3(-0.30 * d, 0.60 * d, 0.80 * d)), c, ms);
    } else {
      const y = 0.8 + this.floorSel * (A.fh + A.gap), c = this.toWorld(cu, cs - this.floorSel * A.shift, y), d = Math.max(A.Wd * 1.18, A.D * 1.9);
      this.flyTo(c.clone().add(new THREE.Vector3(-0.12 * d, 0.86 * d, 0.5 * d)), c, ms);
    }
  }
  setFloor(k) { if (!this.active) return; this.floorSel = k; if (this.gateSel) { const g = this.data().gates.get(this.gateSel); if (k !== null && g.floor - 1 > k) this.gateSel = null; } this.layoutY(); this.bar(); this.refresh(true); this.frame(); }
  selectGate(id) { if (!this.active) return; this.gateSel = id && this.data().gates.get(id) && this.data().gates.get(id).bld === this.active.b.id ? id : null; this.refresh(true); }
  setNight(n) { this.night = n; if (this.active) for (const f of this.active.floors) f.lit(n); }
  onTime(T) { this.T = T; if (this.active) this.refresh(false); }

  refresh(force) {
    const A = this.active; if (!A) return;
    const st = this.stats = statsAt(this.data(), this.T), gates = this.data().byBld.get(A.b.id);
    for (const q of A.badges) {
      const s = st.S.get(q.a.g.id), sel = this.gateSel === q.a.g.id, key = `${s.incoming}|${s.late}|${s.unrecv}|${s.passed}|${sel}`;
      if (key !== q.key) { q.key = key; drawBadge(q.cv, q.a.g, s, sel); q.tex.needsUpdate = true; }
      const c = new THREE.Color(STATUS_COLOR[statusOf(s)]); q.ring.material.color.copy(c); q.disc.material.color.copy(c); q.stem.material.color.copy(c);
      const r = 2.4 + Math.min(9, Math.sqrt(s.passed) * 0.55); q.disc.scale.set(r, r, 1); q.bad = s.late > 0; q.sel = sel;
      q.sp.scale.set(sel ? BW * 1.22 : BW, sel ? BH * 1.22 : BH, 1); q.sp.material.opacity = this.gateSel && !sel ? 0.4 : 1; q.sp.renderOrder = sel ? 13 : 12;
    }
    if (this.gateSel) { const g = this.data().gates.get(this.gateSel); this.panel.show({ title: g.id, sub: `${A.b.typeName} · ${g.floor}F${g.side ? '' : ' · 名称不含方位，未定位'}`, s: st.S.get(g.id), T: this.T }); }
    else this.panel.show({ title: `${A.b.id} 全楼`, sub: `${A.b.zone} 区 · ${A.b.typeName} · ${A.n} 层 · ${gates.length} 个门岗`, s: sumStats(gates.map((g) => st.S.get(g.id))), gates: gates.map((g) => ({ g, s: st.S.get(g.id) })), T: this.T });
    this.buildArcs(force);
  }
  // in-transit orders heading for the selected gate, drawn from the roof of the source block (blue = on time, red = overdue, purple = special)
  buildArcs(force) {
    const A = this.active, id = this.gateSel, s = id ? this.stats.S.get(id) : null;
    const items = s ? [...s.lateList, ...s.incList].slice(0, 36) : [], key = items.map((x) => x.o.id).join(',');
    if (!force && this.arcs && this.arcs.key === key) return;
    if (this.arcs) { for (const o of this.arcs.objs) { this.overlay.remove(o); o.geometry.dispose(); o.material.dispose(); } this.arcs = null; }
    if (!items.length) return;
    const q = A.badges.find((x) => x.a.g.id === id), end = new THREE.Vector3(A.b.r[0] + q.a.x, this.levelY(q.f.index) + 1.6, A.b.r[1] + q.a.z + this.levelZ(q.f.index)), geos = [], curves = [], cols = [];
    const per = new Map();
    for (const x of items) {
      const fg = this.data().gates.get(x.o.from), sb = this.DATA.buildings.find((v) => v.id === fg.bld); if (!sb) continue;
      const k = per.get(sb.id) || 0; per.set(sb.id, k + 1);
      const same = sb.id === A.b.id, sq = same ? A.badges.find((v) => v.a.g.id === fg.id) : null;
      const start = sq ? new THREE.Vector3(A.b.r[0] + sq.a.x, this.levelY(sq.f.index) + 1.6, A.b.r[1] + sq.a.z + this.levelZ(sq.f.index)) : new THREE.Vector3((sb.r[0] + sb.r[2]) / 2 + (k % 5 - 2) * 6, sb.h + 1.5, (sb.r[1] + sb.r[3]) / 2 + Math.floor(k / 5) * 6);
      const mid = start.clone().lerp(end, 0.5); mid.y = Math.max(start.y, end.y) + 22 + start.distanceTo(end) * 0.16 + (k % 4) * 3;
      const cv = new THREE.QuadraticBezierCurve3(start, mid, end), c = new THREE.Color(x.over !== undefined ? STATUS_COLOR.bad : x.o.special ? '#b98cff' : '#58a3f2');
      const g = new THREE.TubeGeometry(cv, 40, 0.55, 6, false), n = g.attributes.position.count, ca = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { ca[i * 3] = c.r; ca[i * 3 + 1] = c.g; ca[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(ca, 3)); g.deleteAttribute('uv'); g.deleteAttribute('normal'); geos.push(g); curves.push(cv); cols.push(c);
    }
    if (!geos.length) return;
    const merged = geos.length === 1 ? geos[0] : mergeTubes(geos);
    const tube = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false, fog: false }));
    const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(1.1, 10, 8), new THREE.MeshBasicMaterial({ fog: false }), curves.length);
    cols.forEach((c, i) => dots.setColorAt(i, c.clone().lerp(new THREE.Color(1, 1, 1), 0.35)));
    tube.renderOrder = 5; dots.renderOrder = 6; this.overlay.add(tube, dots);
    this.arcs = { key, objs: [tube, dots], dots, curves };
  }
  tick() {
    const A = this.active; if (!A) return;
    const now = performance.now();
    if (A.animating) { const k = Math.min(1, (now - A.t0) / A.dur); this.e = ease(k); this.layoutY(); if (k >= 1) { A.animating = false; this.buildArcs(true); } }
    const p = 0.5 + 0.5 * Math.sin(now / 260);
    for (const q of A.badges) { const s = q.bad ? 1 + 0.35 * p : 1; q.ring.scale.set(s, s, 1); q.ring.material.opacity = q.bad ? 0.55 + 0.45 * p : 0.85; }
    if (this.arcs) { const M = new THREE.Matrix4(), t = now / 4200; this.arcs.curves.forEach((cv, i) => { const P = cv.getPoint((t + i * 0.137) % 1); M.makeTranslation(P.x, P.y, P.z); this.arcs.dots.setMatrixAt(i, M); }); this.arcs.dots.instanceMatrix.needsUpdate = true; }
  }
  // returns true when the click was used by the exploded view
  click(ray) {
    if (!this.active) return false;
    const objs = []; for (const q of this.active.badges) if (q.sp.visible) objs.push(q.sp, q.disc);
    const h = ray.intersectObjects(objs, false)[0];
    this.selectGate(h ? h.object.userData.gate : null);
    return true;
  }
}
function mergeTubes(geos) {
  let nv = 0, ni = 0; for (const g of geos) { nv += g.attributes.position.count; ni += g.index.count; }
  const p = new Float32Array(nv * 3), c = new Float32Array(nv * 3), idx = new Uint32Array(ni); let vo = 0, io = 0;
  for (const g of geos) { p.set(g.attributes.position.array, vo * 3); c.set(g.attributes.color.array, vo * 3); const a = g.index.array; for (let i = 0; i < a.length; i++) idx[io + i] = a[i] + vo; vo += g.attributes.position.count; io += a.length; g.dispose(); }
  const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.BufferAttribute(p, 3)); m.setAttribute('color', new THREE.BufferAttribute(c, 3)); m.setIndex(new THREE.BufferAttribute(idx, 1)); return m;
}
