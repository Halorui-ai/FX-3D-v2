// Procedural canvas textures (no external files -> works offline from file://)
import * as THREE from 'three';

function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
export function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function tex(c, srgb = true, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = 8;
  return t;
}
const grey = (v, a = 1) => `rgba(${v | 0},${v | 0},${v | 0},${a})`;
function shade(hex, k) {
  const c = new THREE.Color(hex);
  return `rgb(${Math.min(255, c.r * 255 * k) | 0},${Math.min(255, c.g * 255 * k) | 0},${Math.min(255, c.b * 255 * k) | 0})`;
}
function speckle(g, w, h, r, n, lo, hi, a) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = grey(lo + r() * (hi - lo), a * (0.3 + r() * 0.7));
    const s = 1 + r() * 3; g.fillRect(r() * w, r() * h, s, s);
  }
}
function blotches(g, w, h, r, n, dark, amax, smin, smax) {
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, s = smin + r() * (smax - smin);
    const gr = g.createRadialGradient(x, y, 0, x, y, s);
    gr.addColorStop(0, dark ? `rgba(20,20,18,${amax * r()})` : `rgba(255,255,250,${amax * r()})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - s, y - s, s * 2, s * 2);
  }
}
function streaks(g, w, h, r, n, amax) { // rain stains running down
  for (let i = 0; i < n; i++) {
    const x = r() * w, y0 = r() * h * 0.6, len = h * (0.15 + r() * 0.5), ww = 2 + r() * 10;
    const gr = g.createLinearGradient(0, y0, 0, y0 + len);
    gr.addColorStop(0, `rgba(25,25,22,${amax * (0.4 + r() * 0.6)})`); gr.addColorStop(1, 'rgba(25,25,22,0)');
    g.fillStyle = gr; g.fillRect(x, y0, ww, len);
  }
}

// ---------------------------------------------------------------- facades
// canvas: 1024 px wide = 48 m of wall, 512 px tall = full building height H (top of canvas = roof edge)
export const FACADE_W = 48;
export function facade(kind, floors, H, seed = 1) {
  const W = 1024, Hp = 512;
  const [c, g] = mk(W, Hp), [ce, ge] = mk(W, Hp);
  const r = rng(seed * 7919 + floors * 131 + kind.length * 17);
  const X = (m) => m * W / FACADE_W, Y = (m) => Hp - m * Hp / H, SY = (m) => m * Hp / H;
  ge.fillStyle = '#000'; ge.fillRect(0, 0, W, Hp);
  const panelW = 6, nP = FACADE_W / panelW;

  if (kind === 'prod' || kind === 'office' || kind === 'conc' || kind === 'canteen') {
    const base = kind === 'canteen' ? 156 : 136;
    for (let i = 0; i < nP; i++) {                       // concrete panels, each a slightly different grey
      const v = base + (r() - 0.5) * 16;
      g.fillStyle = `rgb(${v | 0},${(v - 1) | 0},${(v - 5) | 0})`;
      g.fillRect(X(i * panelW), 0, X(panelW) + 1, Hp);
    }
    blotches(g, W, Hp, r, 60, true, 0.10, 20, 90);
    blotches(g, W, Hp, r, 30, false, 0.08, 20, 80);
    streaks(g, W, Hp, r, 46, 0.16);
    speckle(g, W, Hp, r, 2600, 90, 190, 0.12);
    g.fillStyle = 'rgba(40,40,38,0.35)';                 // panel joints
    for (let i = 0; i <= nP; i++) g.fillRect(X(i * panelW) - 1, 0, 2, Hp);
    const rows = [];
    if (kind === 'prod') {
      const first = Math.min(7.2, H * 0.36), step = (H - 3.0 - first) / Math.max(1, floors - 1);
      for (let k = 0; k < floors - 1; k++) rows.push([first + k * step + 1.3, 2.5]);
      if (floors === 1) rows.push([H - 4.2, 1.6]);
    } else if (kind === 'office' || kind === 'canteen') {
      const fh = (H - 1.6) / floors;
      for (let k = 0; k < floors; k++) rows.push([k * fh + 1.1 + (k === 0 ? 0.3 : 0), Math.min(2.1, fh * 0.45)]);
    } else {
      const fh = Math.max(4.5, H / Math.max(1, Math.round(H / 5)));
      for (let y = 1.4; y + 2 < H - 0.8; y += fh) rows.push([y, 1.6]);
    }
    for (const [y0, hh] of rows) {
      g.fillStyle = 'rgba(30,30,28,0.22)'; g.fillRect(0, Y(y0 - 0.9), W, 1.5);   // floor joint
      for (let i = 0; i < nP; i++) {
        const q = r(), x0 = i * panelW + 0.45, ww = panelW - 0.9;
        const pWin = kind === 'prod' ? 0.62 : kind === 'conc' ? 0.35 : 0.86;
        if (q < pWin) {
          g.fillStyle = '#2a2e33'; g.fillRect(X(x0), Y(y0 + hh), X(ww), SY(hh));
          const lit = r() < (kind === 'prod' ? 0.93 : 0.6);
          const n = 4;
          for (let k = 0; k < n; k++) {
            const px = X(x0 + 0.08 + k * ww / n), pw = X(ww / n - 0.14);
            const gy = Y(y0 + hh) + 2, gh = SY(hh) - 4;
            const gl = g.createLinearGradient(0, gy, 0, gy + gh);
            gl.addColorStop(0, '#6d8296'); gl.addColorStop(1, '#3d4c5b');
            g.fillStyle = gl; g.fillRect(px, gy, pw, gh);
            g.fillStyle = '#2a2e33'; g.fillRect(px, gy + gh * 0.42, pw, 2);
            if (lit && r() < 0.93) {
              const b = 170 + r() * 85;
              ge.fillStyle = `rgb(${b * 0.86 | 0},${b * 0.93 | 0},${b | 0})`; ge.fillRect(px, gy, pw, gh);
              ge.fillStyle = 'rgba(0,0,0,0.55)'; ge.fillRect(px, gy + gh * 0.42, pw, 2);
              ge.fillStyle = 'rgba(0,0,0,0.25)';
              for (let j = 0; j < 3; j++) ge.fillRect(px + r() * pw, gy, 2, gh);
            }
          }
          g.fillStyle = 'rgba(20,20,18,0.25)'; g.fillRect(X(x0), Y(y0) , X(ww), 3);   // sill shadow
          const st = g.createLinearGradient(0, Y(y0), 0, Y(y0) + SY(2.2));
          st.addColorStop(0, 'rgba(30,30,26,0.20)'); st.addColorStop(1, 'rgba(30,30,26,0)');
          g.fillStyle = st; g.fillRect(X(x0 + r() * 2), Y(y0), X(0.6 + r() * 1.5), SY(2.2));
        } else if (q < pWin + (kind === 'prod' ? 0.22 : 0.05)) {
          g.fillStyle = 'rgba(58,60,62,0.92)'; g.fillRect(X(i * panelW), Y(y0 + hh), X(panelW), SY(hh));   // dark painted band
        }
      }
    }
    if (kind === 'prod') {                                 // recessed dark attic / louvre openings under the eave
      for (let i = 0; i < nP; i++) {
        if (r() < 0.72) {
          g.fillStyle = '#26282a'; g.fillRect(X(i * panelW + 0.4), Y(H - 0.7), X(panelW - 0.8), SY(1.9));
          g.fillStyle = 'rgba(255,255,255,0.05)';
          for (let k = 1; k < 6; k++) g.fillRect(X(i * panelW + 0.4 + k * (panelW - 0.8) / 6), Y(H - 0.7), 1, SY(1.9));
        } else { g.fillStyle = 'rgba(70,72,72,0.8)'; g.fillRect(X(i * panelW), Y(H - 0.5), X(panelW), SY(2.3)); }
      }
      for (let i = 0; i < nP; i++) {                       // ground floor: dock doors + canopy
        if (r() < 0.3) {
          const x0 = i * panelW + 1.1;
          g.fillStyle = '#5d6165'; g.fillRect(X(x0), Y(4.2), X(3.8), SY(4.2));
          g.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 0; k < 9; k++) g.fillRect(X(x0), Y(4.2) + k * SY(0.47), X(3.8), 1);
          g.fillStyle = '#b9b9b4'; g.fillRect(X(x0 - 0.8), Y(5.0), X(5.4), SY(0.45));
          g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(X(x0 - 0.8), Y(4.55), X(5.4), SY(0.5));
          if (r() < 0.6) { ge.fillStyle = '#ffe9c0'; ge.fillRect(X(x0 + 1.5), Y(4.5), X(0.8), SY(0.25)); }
        }
      }
    }
    g.fillStyle = '#454543'; g.fillRect(0, Y(1.0), W, SY(1.0));                  // dark tile plinth
    g.fillStyle = 'rgba(235,235,230,0.9)';                                          // white downpipes
    for (let i = 0; i < FACADE_W / 12; i++) g.fillRect(X(i * 12 + 5.9 + (r() - 0.5)), 0, 3, Hp);
    g.fillStyle = 'rgba(210,210,205,0.9)'; g.fillRect(0, 0, W, SY(0.35));         // coping
  } else if (kind === 'ware' || kind === 'metal' || kind === 'shed') {
    const col = kind === 'metal' ? '#c9c5b8' : kind === 'shed' ? '#cfd0cc' : '#dfe2e2';
    g.fillStyle = col; g.fillRect(0, 0, W, Hp);
    for (let x = 0; x < W; x += 6) { g.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.05})`; g.fillRect(x, 0, 2, Hp); g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(x + 3, 0, 1, Hp); }
    blotches(g, W, Hp, r, 26, true, 0.07, 30, 110); streaks(g, W, Hp, r, 22, 0.08);
    if (kind === 'ware') {
      g.fillStyle = '#56687c'; g.fillRect(0, SY(0.3), W, SY(Math.min(1.6, H * 0.1)));
      for (let i = 0; i < 6; i++) {                        // loading docks
        const x0 = i * 8 + 2.2;
        g.fillStyle = '#7b8086'; g.fillRect(X(x0), Y(4.6), X(3.6), SY(3.4));
        g.fillStyle = 'rgba(0,0,0,0.22)'; for (let k = 0; k < 8; k++) g.fillRect(X(x0), Y(4.6) + k * SY(0.42), X(3.6), 1);
        g.fillStyle = '#e9c93a'; g.fillRect(X(x0 - 0.15), Y(1.2), X(0.15), SY(1.2)); g.fillRect(X(x0 + 3.6), Y(1.2), X(0.15), SY(1.2));
        if (r() < 0.5) { ge.fillStyle = '#fff2d2'; ge.fillRect(X(x0 + 1.4), Y(5.3), X(0.8), SY(0.3)); }
      }
      g.fillStyle = '#8b8d8c'; g.fillRect(0, Y(1.2), W, SY(1.2));
    } else if (H > 5) {
      for (let i = 0; i < 8; i++) if (r() < 0.5) { g.fillStyle = '#56606a'; g.fillRect(X(i * 6 + 1.5), Y(Math.min(H - 1.2, 4.2)), X(3), SY(1.3)); }
    }
  } else if (kind === 'white') {                           // rendered white wall with orange accent blocks (K17 style) / stair cores
    g.fillStyle = '#b4b5b0'; g.fillRect(0, 0, W, Hp);
    blotches(g, W, Hp, r, 40, true, 0.08, 20, 90); streaks(g, W, Hp, r, 30, 0.12);
    const fh = Math.max(3.6, H / Math.max(1, Math.round(H / 4.5)));
    for (let y = 1.2; y + 1.8 < H - 0.5; y += fh) for (let i = 0; i < 12; i++) if (r() < 0.55) {
      g.fillStyle = '#39424c'; g.fillRect(X(i * 4 + 1.2), Y(y + 1.7), X(1.5), SY(1.7));
      if (r() < 0.35) { ge.fillStyle = '#ffeccb'; ge.fillRect(X(i * 4 + 1.25), Y(y + 1.65), X(1.4), SY(1.6)); }
    }
    g.fillStyle = 'rgba(40,40,38,0.3)'; for (let i = 0; i <= 8; i++) g.fillRect(X(i * 6) - 1, 0, 2, Hp);
  } else if (kind === 'orange') {
    g.fillStyle = '#bdbdb7'; g.fillRect(0, 0, W, Hp);
    for (let i = 0; i < 4; i++) { g.fillStyle = '#d99a2b'; g.fillRect(X(i * 12 + 2), Y(H * 0.92), X(6), SY(H * 0.45)); }
    blotches(g, W, Hp, r, 40, true, 0.08, 20, 90);
    for (let y = 1.2; y + 1.6 < H - 0.5; y += 3.8) for (let i = 0; i < 16; i++) if (r() < 0.6) {
      g.fillStyle = '#343c45'; g.fillRect(X(i * 3 + 0.9), Y(y + 1.6), X(1.2), SY(1.6));
      if (r() < 0.4) { ge.fillStyle = '#ffeccb'; ge.fillRect(X(i * 3 + 0.95), Y(y + 1.55), X(1.1), SY(1.5)); }
    }
  } else if (kind === 'tower' || kind === 'dark') {
    g.fillStyle = kind === 'tower' ? '#8f9396' : '#6f7275'; g.fillRect(0, 0, W, Hp);
    blotches(g, W, Hp, r, 30, true, 0.08, 20, 90);
    const fh = kind === 'tower' ? 3.6 : 5.0;
    for (let y = 1.0; y + 2 < H; y += fh) for (let i = 0; i < 24; i++) {
      g.fillStyle = r() < 0.5 ? '#41556a' : '#33424f'; g.fillRect(X(i * 2 + 0.3), Y(y + 1.9), X(1.4), SY(1.9));
      if (r() < 0.22) { ge.fillStyle = r() < 0.5 ? '#8f7a55' : '#7d8799'; ge.fillRect(X(i * 2 + 0.35), Y(y + 1.85), X(1.3), SY(1.8)); }
    }
  } else if (kind === 'bridge') {                          // enclosed material-conveyor gallery
    g.fillStyle = '#b9bcbb'; g.fillRect(0, 0, W, Hp);
    for (let x = 0; x < W; x += 8) { g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(x, 0, 2, Hp); }
    g.fillStyle = '#3b4650'; g.fillRect(0, Hp * 0.30, W, Hp * 0.30);
    g.fillStyle = '#b9bcbb'; for (let i = 0; i < 16; i++) g.fillRect(X(i * 3), Hp * 0.30, 6, Hp * 0.30);
    ge.fillStyle = '#cfe0ff'; ge.fillRect(0, Hp * 0.33, W, Hp * 0.24);
    ge.fillStyle = '#000'; for (let i = 0; i < 16; i++) ge.fillRect(X(i * 3), Hp * 0.30, 6, Hp * 0.30);
    streaks(g, W, Hp, r, 20, 0.12);
  } else if (kind === 'steel') {
    g.fillStyle = '#8a8f93'; g.fillRect(0, 0, W, Hp);
    for (let x = 0; x < W; x += 32) {                      // truss diagonals
      g.strokeStyle = 'rgba(40,44,48,0.8)'; g.lineWidth = 5; g.beginPath(); g.moveTo(x, Hp); g.lineTo(x + 16, 0); g.lineTo(x + 32, Hp); g.stroke();
    }
    g.fillStyle = 'rgba(40,44,48,0.85)'; g.fillRect(0, 0, W, 26); g.fillRect(0, Hp - 26, W, 26);
    blotches(g, W, Hp, r, 30, true, 0.14, 20, 80);
  }
  return { map: tex(c), emissiveMap: tex(ce) };
}

// ---------------------------------------------------------------- roofs (tile = ROOF_TILE metres)
export const ROOF_TILE = 32;
export function roof(kind, seed = 3) {
  const S = 512, [c, g] = mk(S, S), r = rng(seed * 104729 + kind.length);
  const M = S / ROOF_TILE;
  const flat = { white: '#c2bfb5', conc: '#77766f', eq: '#6f6e69', dark: '#3d4044', beige: '#b7ad98', pvbase: '#c9c7bf', pvdbase: '#8a8983' };
  const seam = { pale: '#c9d6d2', metal: '#cfc6b3', blue: '#5f86c4', teal: '#6fb5ad', whiteMetal: '#e3e5e4' };
  if (flat[kind]) {
    g.fillStyle = flat[kind]; g.fillRect(0, 0, S, S);
    blotches(g, S, S, r, 110, true, kind === 'white' ? 0.13 : 0.15, 10, 80);
    for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(70,62,50,${0.03 + r() * 0.06})`; g.fillRect(0, r() * S, S, 4 + r() * 26); }
    blotches(g, S, S, r, 50, false, 0.10, 10, 60);
    speckle(g, S, S, r, 5000, 60, 220, 0.10);
    g.fillStyle = 'rgba(0,0,0,0.10)';
    for (let i = 0; i < 4; i++) { g.fillRect(i * 8 * M, 0, 1.5, S); g.fillRect(0, i * 8 * M, S, 1.5); }
    for (let i = 0; i < 10; i++) {                         // puddle stains / patch repairs
      g.fillStyle = `rgba(${r() < 0.5 ? '30,30,28' : '240,240,235'},${0.05 + r() * 0.08})`;
      g.fillRect(r() * S, r() * S, 10 + r() * 60, 6 + r() * 30);
    }
  } else {
    g.fillStyle = seam[kind] || '#cccccc'; g.fillRect(0, 0, S, S);
    for (let x = 0; x < S; x += M) { g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(x, 0, 1.3, S); g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(x + 2, 0, 1, S); }
    blotches(g, S, S, r, 40, true, 0.07, 20, 90);
    for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(60,50,40,${0.03 + r() * 0.05})`; g.fillRect(r() * S, 0, 2 + r() * 6, S); }
    g.fillStyle = 'rgba(0,0,0,0.07)'; for (let i = 0; i < 2; i++) g.fillRect(0, i * 16 * M, S, 2);
  }
  return tex(c);
}
// PV array: v axis = across rows. tile 6.4 m.
export const PV_TILE = 6.4;
export function pv(dark) {
  const S = 256, [c, g] = mk(S, S), M = S / PV_TILE;
  g.fillStyle = dark ? '#7d7c77' : '#c5c3bb'; g.fillRect(0, 0, S, S);
  for (let row = 0; row < 2; row++) {
    const y0 = row * 3.2 * M + 0.5 * M, hh = 2.1 * M;
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y0 + hh, S, 0.35 * M);        // shadow under the tilted row
    const gr = g.createLinearGradient(0, y0, 0, y0 + hh);
    gr.addColorStop(0, dark ? '#1a2133' : '#42506c'); gr.addColorStop(1, dark ? '#10151f' : '#2f3b55');
    g.fillStyle = gr; g.fillRect(0, y0, S, hh);
    g.fillStyle = 'rgba(190,200,215,0.35)';
    for (let x = 0; x < S; x += 1.07 * M) g.fillRect(x, y0, 1, hh);
    g.fillRect(0, y0 + hh / 2, S, 1); g.fillRect(0, y0, S, 1);
  }
  return tex(c);
}
export function chillerTop() {
  const S = 128, [c, g] = mk(S, S);
  g.fillStyle = '#9da0a0'; g.fillRect(0, 0, S, S);
  for (const [x, y] of [[32, 64], [96, 64]]) {
    g.fillStyle = '#2b2d2f'; g.beginPath(); g.arc(x, y, 26, 0, 7); g.fill();
    g.strokeStyle = '#70757a'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, 26, 0, 7); g.stroke();
    g.strokeStyle = '#55595d'; g.lineWidth = 2;
    for (let a = 0; a < 6; a++) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 24 * Math.cos(a), y + 24 * Math.sin(a)); g.stroke(); }
  }
  g.strokeStyle = '#5c5f61'; g.lineWidth = 3; g.strokeRect(1, 1, S - 2, S - 2);
  return tex(c);
}

// ---------------------------------------------------------------- sports
export function track(longAxisVertical) {
  const W = 1024, H = 544, [c, g] = mk(W, H);              // drawn with long axis horizontal: 176 m x 93.5 m
  g.fillStyle = '#2f5b2a'; g.fillRect(0, 0, W, H);
  const m = W / 176, R = H / 2 - 4;
  const oval = (rr) => { g.beginPath(); g.moveTo(H / 2, H / 2 - rr); g.lineTo(W - H / 2, H / 2 - rr); g.arc(W - H / 2, H / 2, rr, -Math.PI / 2, Math.PI / 2); g.lineTo(H / 2, H / 2 + rr); g.arc(H / 2, H / 2, rr, Math.PI / 2, Math.PI * 1.5); g.closePath(); };
  oval(R); g.fillStyle = '#a5432f'; g.fill();
  const r = rng(11); for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '60,20,10' : '230,150,120'},0.06)`; g.fillRect(r() * W, r() * H, 3, 3); }
  g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.2;
  for (let k = 0; k <= 8; k++) { oval(R - k * 1.22 * m); g.stroke(); }
  const ri = R - 8 * 1.22 * m - 2 * m;
  oval(ri); g.fillStyle = '#3d7a33'; g.fill();
  g.save(); oval(ri); g.clip();
  for (let x = 0; x < W; x += 11 * m) { g.fillStyle = (Math.round(x / (11 * m)) % 2) ? '#356d2d' : '#448538'; g.fillRect(x, 0, 11 * m, H); }
  g.restore();
  const fx0 = W / 2 - 52.5 * m, fy0 = H / 2 - 34 * m;       // football pitch 105 x 68
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2;
  g.strokeRect(fx0, fy0, 105 * m, 68 * m);
  g.beginPath(); g.moveTo(W / 2, fy0); g.lineTo(W / 2, fy0 + 68 * m); g.stroke();
  g.beginPath(); g.arc(W / 2, H / 2, 9.15 * m, 0, 7); g.stroke();
  g.strokeRect(fx0, H / 2 - 20.15 * m, 16.5 * m, 40.3 * m); g.strokeRect(fx0 + 105 * m - 16.5 * m, H / 2 - 20.15 * m, 16.5 * m, 40.3 * m);
  const t = tex(c, true, false);
  if (longAxisVertical) { t.center.set(0.5, 0.5); t.rotation = Math.PI / 2; }
  return t;
}
export function courts(kind, wM, hM) {
  const px = 10, W = Math.max(64, Math.round(wM * px)), H = Math.max(64, Math.round(hM * px)), [c, g] = mk(W, H);
  const tennis = kind === 'tennis';
  g.fillStyle = tennis ? '#2e6f45' : '#c8502f'; g.fillRect(0, 0, W, H);
  const horizontal = wM >= hM;                              // courts laid side by side along the long side
  const cw = tennis ? 18 : 17, ch = tennis ? 36 : 30;
  const n = Math.max(1, Math.floor((horizontal ? wM : hM) / (cw + 1.5)));
  const span = (horizontal ? wM : hM) / n;
  for (let i = 0; i < n; i++) {
    g.save();
    if (horizontal) g.translate((i + 0.5) * span * px, H / 2); else { g.translate(W / 2, (i + 0.5) * span * px); g.rotate(Math.PI / 2); }
    const w = Math.min(cw - 2, span - 2) * px, h = Math.min(ch - 2, (horizontal ? hM : wM) - 3) * px;
    g.fillStyle = tennis ? '#3f6fa8' : '#4f6f9c'; g.fillRect(-w / 2, -h / 2, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1.5; g.strokeRect(-w / 2, -h / 2, w, h);
    g.beginPath(); g.moveTo(-w / 2, 0); g.lineTo(w / 2, 0); g.stroke();
    if (!tennis) {
      g.beginPath(); g.arc(0, 0, 1.8 * px, 0, 7); g.stroke();
      for (const s of [-1, 1]) {
        g.fillStyle = '#c8502f'; g.fillRect(-2.45 * px, s > 0 ? h / 2 - 5.8 * px : -h / 2, 4.9 * px, 5.8 * px);
        g.strokeRect(-2.45 * px, s > 0 ? h / 2 - 5.8 * px : -h / 2, 4.9 * px, 5.8 * px);
        g.beginPath(); g.arc(0, s * (h / 2 - 1.6 * px), 6.75 * px, s > 0 ? Math.PI : 0, s > 0 ? 2 * Math.PI : Math.PI); g.stroke();
      }
    }
    g.restore();
  }
  return tex(c, true, false);
}

// ---------------------------------------------------------------- misc
export function noiseTex() {                                 // tiling RGB value noise for the ground shader
  const S = 256, [c, g] = mk(S, S), id = g.createImageData(S, S), r = rng(99);
  const oct = (n) => { const a = new Float32Array(n * n); for (let i = 0; i < a.length; i++) a[i] = r(); return (x, y) => { const fx = x * n / S, fy = y * n / S, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty); const v = (i, j) => a[((j + n) % n) * n + ((i + n) % n)]; return (v(x0, y0) * (1 - sx) + v(x0 + 1, y0) * sx) * (1 - sy) + (v(x0, y0 + 1) * (1 - sx) + v(x0 + 1, y0 + 1) * sx) * sy; }; };
  for (let ch = 0; ch < 3; ch++) {
    const o = [oct(4 << ch), oct(8 << ch), oct(16 << ch), oct(32 << ch)];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) id.data[(y * S + x) * 4 + ch] = 255 * (o[0](x, y) * 0.5 + o[1](x, y) * 0.25 + o[2](x, y) * 0.15 + o[3](x, y) * 0.10);
  }
  for (let i = 3; i < id.data.length; i += 4) id.data[i] = 255;
  g.putImageData(id, 0, 0);
  return tex(c, false, true);
}
export function laneMarks(lanes) {                           // u across the road (0..1), v along (tile = 12 m)
  const W = 256, H = 256, [c, g] = mk(W, H);
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(235,235,225,0.85)';
  g.fillRect(W * 0.03, 0, 3, H); g.fillRect(W * 0.97 - 3, 0, 3, H);
  g.fillStyle = 'rgba(232,196,60,0.9)'; g.fillRect(W / 2 - 4, 0, 2.5, H); g.fillRect(W / 2 + 1.5, 0, 2.5, H);
  g.fillStyle = 'rgba(235,235,225,0.8)';
  for (let k = 1; k < lanes; k++) for (const s of [-1, 1]) g.fillRect(W / 2 + s * k * (W * 0.47 / lanes) - 1.2, 0, 2.4, H * 0.5);
  const t = tex(c); t.anisotropy = 16; return t;
}
export function glow() {
  const S = 128, [c, g] = mk(S, S), gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,225,170,1)'); gr.addColorStop(0.25, 'rgba(255,205,140,0.45)'); gr.addColorStop(1, 'rgba(255,190,120,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S); return tex(c, true, false);
}
export function labelSprite(text, big) {
  const fs = big ? 120 : 64, [c, g] = mk(big ? 512 : 256, big ? 160 : 96);
  g.font = `700 ${fs}px "Segoe UI","Microsoft YaHei",sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = big ? 14 : 10; g.strokeStyle = 'rgba(10,16,24,0.85)'; g.strokeText(text, c.width / 2, c.height / 2);
  g.fillStyle = big ? '#ffd76a' : '#ffffff'; g.fillText(text, c.width / 2, c.height / 2);
  const t = tex(c, true, false); return t;
}

// ---------------------------------------------------------------- perimeter fence, gates, vehicles (second pass)
export const FENCE_W = 3.0;                                  // one tile = 3 m of railing, full canvas height = panel height
export function fence() {
  const W = 256, H = 128, [c, g] = mk(W, H);
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(38,43,45,1)';
  g.fillRect(0, 6, W, 7); g.fillRect(0, H - 16, W, 7);        // top / bottom rails
  for (let x = 3; x < W; x += 10.667) { g.fillRect(x, 0, 4.2, H); g.beginPath(); g.moveTo(x - 1.5, 6); g.lineTo(x + 1.7, 0); g.lineTo(x + 4.9, 6); g.fill(); }
  const t = tex(c); t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 16; return t;
}
export function stripes() {                                  // red / white boom barrier
  const [c, g] = mk(128, 16);
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#e9e9e4' : '#c8201c'; g.fillRect(i * 16, 0, 16, 16); }
  return tex(c);
}
export function booth() {                                    // guard booth wall: white panel with a dark window band
  const [c, g] = mk(128, 128), r = rng(77);
  g.fillStyle = '#d9dcda'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#2a4a8a'; g.fillRect(0, 0, 128, 14);
  g.fillStyle = '#1c262c'; g.fillRect(10, 34, 108, 46);
  g.fillStyle = '#c9cdcb'; g.fillRect(62, 34, 4, 46);
  speckle(g, 128, 128, r, 120, 60, 120, 0.12);
  return tex(c);
}
export function tagSprite(text) {                            // small green tag for gate names
  const [c, g] = mk(384, 96);
  g.font = '700 50px "Segoe UI","Microsoft YaHei",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 9; g.strokeStyle = 'rgba(8,20,12,0.9)'; g.strokeText(text, 192, 48);
  g.fillStyle = '#9df0b0'; g.fillText(text, 192, 48);
  return tex(c, true, false);
}

// ---------------------------------------------------------------- photo-based factory facades (third pass)
// Read off the user's K-zone photos: light grey painted concrete, dark tile ground floor with dock doors under a
// projecting canopy, strip windows with white frames on the long sides, dark painted bands on the end walls, a dark
// set-back attic band under the roof.  Returns colour + emissive + bump + roughness maps (drawn in metres, y up).
function layer(w, h, H, fill) { const [c, g] = mk(w, h); g.fillStyle = fill; g.fillRect(0, 0, w, h); g.setTransform(w / FACADE_W, 0, 0, -h / H, 0, h); return [c, g]; }
export function facade2(kind, floors, H, seed = 1) {
  const r = rng(seed * 6151 + floors * 131 + kind.length * 29 + Math.round(H));
  const [cc, C] = layer(2048, 1024, H, '#000'), [ce, E] = layer(1024, 512, H, '#000'), [cb, B] = layer(1024, 512, H, '#808080'), [cr, Q] = layer(1024, 512, H, '#ececec');
  const all = (x, y, w, h, col, o = {}) => { C.fillStyle = col; C.fillRect(x, y, w, h); if (o.e) { E.fillStyle = o.e; E.fillRect(x, y, w, h); } if (o.b !== undefined) { B.fillStyle = grey(o.b); B.fillRect(x, y, w, h); } if (o.r !== undefined) { Q.fillStyle = grey(o.r); Q.fillRect(x, y, w, h); } };
  const px = (fn) => { C.save(); C.setTransform(1, 0, 0, 1, 0, 0); fn(C); C.restore(); };
  const office = kind === 'office', end = kind === 'prodEnd', nP = FACADE_W / 6;
  // painted concrete panels
  for (let i = 0; i < nP; i++) { const v = 160 + (r() - 0.5) * 13; all(i * 6, 0, 6.02, H, `rgb(${v | 0},${(v + 1) | 0},${(v - 3) | 0})`); }
  px((g) => { blotches(g, 2048, 1024, r, 90, true, 0.09, 30, 160); blotches(g, 2048, 1024, r, 40, false, 0.07, 30, 140); streaks(g, 2048, 1024, r, 70, 0.13); speckle(g, 2048, 1024, r, 5200, 80, 200, 0.10); });
  for (let y = 1.22; y < H; y += 1.22) { all(0, y, FACADE_W, 0.025, 'rgba(40,40,38,0.10)', { b: 112 }); }
  for (let i = 0; i <= nP; i++) all(i * 6 - 0.03, 0, 0.06, H, 'rgba(40,40,38,0.42)', { b: 84 });
  const glass = (x, y, w, h, lit, warm) => {
    const gr = C.createLinearGradient(0, y + h, 0, y); gr.addColorStop(0, '#8498aa'); gr.addColorStop(1, '#465564');
    C.fillStyle = gr; C.fillRect(x, y, w, h); B.fillStyle = grey(70); B.fillRect(x, y, w, h); Q.fillStyle = grey(34); Q.fillRect(x, y, w, h);
    if (lit) { const b = 175 + r() * 80; E.fillStyle = warm ? `rgb(${b | 0},${b * 0.9 | 0},${b * 0.72 | 0})` : `rgb(${b * 0.86 | 0},${b * 0.93 | 0},${b | 0})`; E.fillRect(x, y, w, h); if (r() < 0.5) { E.fillStyle = 'rgba(0,0,0,0.3)'; E.fillRect(x + r() * w * 0.7, y, w * 0.12, h); } }
  };
  const unit = (x, y, w, h, cols, lit, warm) => {            // white-framed multi-pane window
    all(x - 0.07, y - 0.07, w + 0.14, h + 0.14, '#33383d', { b: 96 }); all(x, y, w, h, '#d5dadd', { b: 100, r: 150 });
    const pw = w / cols, on = lit && r() < 0.93;
    for (let k = 0; k < cols; k++) { glass(x + k * pw + 0.05, y + 0.05, pw - 0.1, h * 0.62 - 0.07, on, warm); glass(x + k * pw + 0.05, y + h * 0.62 + 0.03, pw - 0.1, h * 0.38 - 0.08, on, warm); }
    const st = C.createLinearGradient(0, y, 0, y - 2.2); st.addColorStop(0, 'rgba(30,30,26,0.22)'); st.addColorStop(1, 'rgba(30,30,26,0)');
    C.fillStyle = st; for (let k = 0; k < 2; k++) C.fillRect(x + r() * w * 0.8, y - 2.2, 0.25 + r() * 0.8, 2.2);
  };
  const g0 = office ? 0 : 4.7, a0 = office ? H - 0.5 : H - 3.4, n = office ? floors : Math.max(1, floors - 1), sh = (a0 - g0) / n;
  if (!office) {                                              // dark tile ground floor
    all(0, 0, FACADE_W, g0, '#3a3d40', { b: 118, r: 140 });
    for (let x = 0; x < FACADE_W; x += 0.3) all(x, 0, 0.02, g0, 'rgba(0,0,0,0.16)');
    for (let y = 0.3; y < g0; y += 0.3) all(0, y, FACADE_W, 0.02, 'rgba(0,0,0,0.16)');
    px((g) => blotches(g, 2048, 1024, r, 0, true, 0, 1, 2));
    for (let i = 0; i < nP; i++) {
      const x = i * 6, q = r();
      if (q < (end ? 0.34 : 0.3)) {                           // roller / lift door
        all(x + 1.0, 0, 4.0, 3.9, '#9ea3a6', { b: 100, r: 110 }); for (let y = 0.25; y < 3.9; y += 0.25) all(x + 1.0, y, 4.0, 0.03, 'rgba(0,0,0,0.22)');
        all(x + 0.85, 0, 0.15, 1.1, '#d9b92c'); all(x + 5.0, 0, 0.15, 1.1, '#d9b92c');
        px((g) => { g.fillStyle = 'rgba(110,60,30,0.12)'; for (let k = 0; k < 6; k++) g.fillRect((x + 1 + r() * 3.6) * 2048 / FACADE_W, 1024 - (r() * 3.5) * 1024 / H, 30 * r(), 46 * r()); });
      } else if (!end && q < 0.66) unit(x + 0.7, 1.05, 4.6, 2.5, 4, r() < 0.8, r() < 0.3);
      else if (q < 0.8) { all(x + 2.2, 0, 1.3, 2.3, '#6d7a84', { b: 104, r: 120 }); all(x + 2.3, 2.4, 1.1, 0.35, '#b3261e', { e: r() < 0.5 ? '#801a14' : undefined }); }
    }
    all(0, g0 - 0.55, FACADE_W, 0.55, 'rgba(0,0,0,0.38)');    // shade under the canopy
    all(0, g0, FACADE_W, 0.42, '#cfd0ca', { b: 150 });
  }
  for (let k = 0; k < n; k++) {
    const base = g0 + (office ? 0 : 0.42) + k * sh, sill = base + Math.max(0.9, (sh - 2.4) * 0.42), wh = Math.min(2.3, sh - 1.5);
    all(0, base, FACADE_W, 0.03, 'rgba(30,30,28,0.3)', { b: 96 });
    if (end) {                                                // dark painted band, the odd small window / door
      all(0, sill, FACADE_W, wh, '#3e4144', { r: 226 });
      px((g) => { g.fillStyle = 'rgba(190,190,185,0.06)'; for (let j = 0; j < 30; j++) g.fillRect(r() * 2048, 1024 - (sill + r() * wh) * 1024 / H, 30 + r() * 120, 2 + r() * 5); });
      for (let i = 0; i < nP; i += 2) if (r() < 0.6) unit(i * 6 + 4.2 + r() * 2, sill + 0.25, 1.3, wh - 0.5, 2, r() < 0.7, false);
      for (let i = 1; i < nP; i += 3) all(i * 6 + 1.5, base + 0.05, 1.1, 2.2, '#7a858c', { b: 100, r: 120 });
    } else for (let i = 0; i < nP; i++) {
      const x = i * 6, q = r(), lit = r() < (office ? 0.6 : 0.9);
      if (q < 0.08) { all(x + 0.5, sill, 5.0, wh, '#565a5d', { b: 90 }); for (let y = sill + 0.12; y < sill + wh; y += 0.12) all(x + 0.5, y, 5.0, 0.03, 'rgba(0,0,0,0.3)'); }
      else if (q < 0.9 || office) { unit(x + 0.32, sill, 2.56, wh, 4, lit, office && r() < 0.4); unit(x + 3.12, sill, 2.56, wh, 4, lit, office && r() < 0.4); }
      if (r() < 0.12) all(x + 2.4, sill - 0.75, 0.9, 0.6, '#d8d9d5', { b: 160 });      // AC outdoor unit
    }
  }
  if (!office) {                                              // attic band under the roof
    if (end) { all(0, a0, FACADE_W, H - a0, '#4c4e4d', { b: 110 }); for (let i = 0; i < nP; i++) all(i * 6 + 0.5, a0 + 0.4, 5.0, H - a0 - 1.3, '#595c5a', { b: 100 }); }
    else { all(0, a0, FACADE_W, H - a0, '#25282b', { b: 52, r: 46 }); for (let x = 0; x < FACADE_W; x += 1.0) all(x, a0, 0.05, H - a0, 'rgba(200,205,210,0.16)'); all(0, a0 + (H - a0) * 0.5, FACADE_W, 0.05, 'rgba(200,205,210,0.16)');
      for (let i = 0; i <= nP; i++) all(i * 6 - 0.3, a0, 0.6, H - a0, '#4a4c4c', { b: 128, r: 232 }); }
    all(0, a0 - 0.18, FACADE_W, 0.18, '#bfc0ba', { b: 150 });
    all(0, H - 0.95, FACADE_W, 0.6, '#4f514f', { b: 128, r: 232 });
    px((g) => streaks(g, 2048, 140, r, 40, 0.2));
  }
  all(0, H - 0.35, FACADE_W, 0.35, '#c9cac4', { b: 150, r: 232 });
  const t = { map: tex(cc), emissiveMap: tex(ce), bumpMap: tex(cb, false), roughnessMap: tex(cr, false) };
  t.map.anisotropy = 16; return t;
}
export function signTex(text) {                                // building number, dark blue letters as on the K07 photo
  const [c, g] = mk(64 * text.length + 32, 96); g.font = '900 86px "Arial Black","Segoe UI",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#27458f'; g.fillText(text, c.width / 2, 52); const t = tex(c, true, false); t.anisotropy = 8; return t;
}
export function innerMarks() {                                // campus roads: white edge lines + dashed centre line (tile = 12 m)
  const W = 128, H = 256, [c, g] = mk(W, H); g.clearRect(0, 0, W, H); g.fillStyle = 'rgba(232,232,224,0.8)';
  g.fillRect(3, 0, 2.5, H); g.fillRect(W - 5.5, 0, 2.5, H); g.fillRect(W / 2 - 1.5, 0, 3, H * 0.45);
  const t = tex(c); t.anisotropy = 16; return t;
}
