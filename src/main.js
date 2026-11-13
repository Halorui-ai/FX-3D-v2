import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import DATA from './data/campus.json';
import groundUrl from './data/ground.png';
import { build } from './builder.js';
import { Environment, WEATHER } from './env.js';

const $ = (id) => document.getElementById(id);
const hash = Object.fromEntries(location.hash.replace(/^#/, '').split('&').filter(Boolean).map((kv) => kv.split('=')));
const THETA = DATA.theta_deg * Math.PI / 180;

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!hash.shot });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.7;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 4, 60000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = Math.PI * 0.492; controls.minDistance = 25; controls.maxDistance = 9000;
controls.screenSpacePanning = false; controls.zoomToCursor = true;
controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };

// ---------------------------------------------------------------- world
const groundTex = new THREE.TextureLoader().load(groundUrl);
const W = build(DATA, { groundTex });
W.root.rotation.y = -THETA;                    // campus grid -> true north (north = -z)
scene.add(W.root);
W.root.updateMatrixWorld(true);
const env = new Environment(renderer, scene);
const toWorld = (u, s, y = 0) => new THREE.Vector3(u, y, s).applyMatrix4(W.root.matrixWorld);

// ---------------------------------------------------------------- post-processing
let composer = null, gtao = null, bloom = null, useAO = hash.ao !== '0';
try {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  gtao = new GTAOPass(scene, camera, size.x, size.y);
  gtao.updateGtaoMaterial({ radius: 7, distanceExponent: 1.4, thickness: 2.0, scale: 1.25, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
  gtao.blendIntensity = 0.9;
  if (typeof gtao.overrideVisibility === 'function') {          // keep sky / clouds / rain / labels out of the AO pre-pass
    const skip = [...env.noAO, W.labels, W.zoneLabels, W.roadsG, W.lamps.children[2], W.site.gateLabels, ...(W.site.rail ? [W.site.rail] : [])];
    const ov = gtao.overrideVisibility.bind(gtao), rv = gtao.restoreVisibility.bind(gtao);
    let hidden = false;
    gtao.overrideVisibility = () => { ov(); if (hidden) return; hidden = true; for (const o of skip) { o.userData._v = o.visible; o.visible = false; } };
    gtao.restoreVisibility = () => { if (hidden) { hidden = false; for (const o of skip) o.visible = o.userData._v; } rv(); };
  }
  gtao.enabled = useAO;
  composer.addPass(gtao);
  bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.22, 0.5, 1.6);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
} catch (e) { console.warn('post-processing disabled', e); composer = null; }

// ---------------------------------------------------------------- environment hooks
function onEnv(e) {
  const n = e.night;
  for (const m of W.facadeMats) m.emissiveIntensity = n * 1.25;
  W.headM.emissiveIntensity = n * 9; W.glowM.opacity = n * 0.26; W.lamps.children[2].visible = n > 0.02;
  W.groundUniforms.uWet.value = e.wet;
  if (gtao) gtao.blendIntensity = e.fogBase > 0.0004 ? 0.25 : 0.9;
  for (const m of W.wetMats) { if (m.userData.r0 === undefined) m.userData.r0 = m.roughness; m.roughness = m.userData.r0 * (1 - 0.5 * e.wet); }
  if (bloom) { bloom.threshold = THREE.MathUtils.lerp(1.5, 0.55, n); bloom.strength = THREE.MathUtils.lerp(0.14, 0.38, n); }
  $('sunInfo').textContent = e.elDeg > -0.8 ? `太阳高度 ${e.elDeg.toFixed(0)}°　方位 ${e.azDeg.toFixed(0)}°` : '夜间';
}
const MONTH_DOY = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];
function setTime(h) { env.state.hours = h; $('time').value = h; const hh = Math.floor(h), mm = Math.round((h - hh) * 60); $('timeLabel').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; env.apply(onEnv); }
function setWeather(k) { env.state.weather = k; document.querySelectorAll('#weather button').forEach((b) => b.classList.toggle('on', b.dataset.k === k)); env.apply(onEnv); }
function setMonth(m) { env.state.doy = MONTH_DOY[m]; $('month').value = m; env.apply(onEnv); }

// ---------------------------------------------------------------- UI
for (const [k, w] of Object.entries(WEATHER)) { const b = document.createElement('button'); b.textContent = w.name; b.dataset.k = k; b.onclick = () => setWeather(k); $('weather').appendChild(b); }
$('time').oninput = (e) => setTime(+e.target.value);
$('month').onchange = (e) => setMonth(+e.target.value);
for (const [id, h] of [['tDawn', 6.6], ['tNoon', 12], ['tDusk', 17.4], ['tNight', 21.5]]) $(id).onclick = () => setTime(h);
$('lyLabels').onchange = (e) => { W.labels.visible = e.target.checked; };

$('lyTrees').onchange = (e) => { W.trees.visible = e.target.checked; };
$('lyRoads').onchange = (e) => { W.roadsG.visible = e.target.checked; };
$('lyWalls').onchange = (e) => { W.site.walls.visible = e.target.checked; };
$('lyCars').onchange = (e) => { W.site.vehicles.visible = e.target.checked; };
$('lyAO').onchange = (e) => { if (gtao) gtao.enabled = e.target.checked; };
$('lyShadow').onchange = (e) => { env.sun.castShadow = e.target.checked; };

// camera moves
let fly = null;
function flyTo(pos, target, ms = 1400) { fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: target, s: performance.now(), ms }; if (ms <= 0) { camera.position.copy(pos); controls.target.copy(target); fly = null; controls.update(); } }
const CENTER = toWorld(100, 330);
const VIEWS = {
  top: () => [CENTER.clone().add(new THREE.Vector3(0, 5200, 6)), CENTER.clone()],
  oblique: () => [CENTER.clone().add(new THREE.Vector3(-420, 980, 2350)), CENTER.clone().add(new THREE.Vector3(0, 0, -260))],
  west: () => { const c = toWorld(-850, 270); return [c.clone().add(new THREE.Vector3(-300, 1250, 1750)), c]; },
  east: () => { const c = toWorld(1100, 330); return [c.clone().add(new THREE.Vector3(300, 1350, 1850)), c]; },
};
function zoneView(z, ms) {
  const s = DATA.sites.find((q) => q.zone === z); if (!s) return;
  const c = toWorld((s.r[0] + s.r[2]) / 2, (s.r[1] + s.r[3]) / 2), d = Math.max(s.r[2] - s.r[0], s.r[3] - s.r[1]);
  flyTo(c.clone().add(new THREE.Vector3(-d * 0.28, d * 0.85, d * 1.05)), c, ms);
}
for (const [k, name] of [['top', '全景俯视'], ['oblique', '全景鸟瞰'], ['west', '西厂区'], ['east', '东厂区']]) { const b = document.createElement('button'); b.textContent = name; b.onclick = () => flyTo(...VIEWS[k]()); $('views').appendChild(b); }
for (const z of ['D', 'E', 'F', 'A', 'B', 'C', 'K', 'L', 'M', 'G北', 'G南']) { const b = document.createElement('button'); b.textContent = z; b.onclick = () => zoneView(z); $('zones').appendChild(b); }

// picking
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
let downAt = null, selected = null;
const hl = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x44d7ff, transparent: true, opacity: 0.22, depthWrite: false, fog: false }));
const hlEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0x7fe6ff, fog: false }));
hl.add(hlEdge); hl.visible = false; W.root.add(hl);
function usToLonLat(u, s) {
  const c = Math.cos(THETA), sn = Math.sin(THETA), v = -s, e = u * c + v * sn, n = -u * sn + v * c, R = 6378137;
  return [DATA.origin[0] + (e / (R * Math.cos(DATA.origin[1] * Math.PI / 180))) * 180 / Math.PI, DATA.origin[1] + (n / R) * 180 / Math.PI];
}
function select(b) {
  selected = b;
  if (!b) { hl.visible = false; $('info').style.display = 'none'; return; }
  const [u0, s0, u1, s1] = b.r; hl.scale.set(u1 - u0 + 2, b.h + 4, s1 - s0 + 2); hl.position.set((u0 + u1) / 2, (b.h + 4) / 2, (s0 + s1) / 2); hl.visible = true;
  const [lon, lat] = usToLonLat((u0 + u1) / 2, (s0 + s1) / 2);
  $('info').style.display = 'block';
  $('info').innerHTML = `<h3>${b.id}</h3><div>${b.zone} 区　${b.typeName}</div><div>${b.floors} 层　约 ${b.h.toFixed(0)} m 高</div><div>平面 ${(u1 - u0).toFixed(0)} × ${(s1 - s0).toFixed(0)} m</div><div class="dim">${lat.toFixed(6)}°N　${lon.toFixed(6)}°E</div><div class="dim">双击飞到该楼</div>`;
}
function pickAt(ev) { mouse.set(ev.clientX / window.innerWidth * 2 - 1, -(ev.clientY / window.innerHeight) * 2 + 1); ray.setFromCamera(mouse, camera); const h = ray.intersectObjects(W.pick, false)[0]; return h ? h.object.userData.b : null; }
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => { if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 5) select(pickAt(e)); });
renderer.domElement.addEventListener('dblclick', (e) => { const b = pickAt(e); if (!b) return; const c = toWorld((b.r[0] + b.r[2]) / 2, (b.r[1] + b.r[3]) / 2, b.h * 0.4); flyTo(c.clone().add(new THREE.Vector3(-70, 110, 210)), c); });
$('search').addEventListener('keydown', (e) => { if (e.key !== 'Enter') return; const q = e.target.value.trim().toUpperCase(); const b = DATA.buildings.find((x) => x.id === q); if (b) { select(b); const c = toWorld((b.r[0] + b.r[2]) / 2, (b.r[1] + b.r[3]) / 2, b.h * 0.4); flyTo(c.clone().add(new THREE.Vector3(-90, 150, 260)), c); } });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight);
  if (composer) composer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- start-up state (URL hash lets the self-check script take fixed shots)
setMonth(hash.m ? +hash.m : 9);
setWeather(hash.w || 'clear');
setTime(hash.t ? +hash.t : 10);
if (hash.labels === '0') { W.labels.visible = false; $('lyLabels').checked = false; }
if (hash.zl === '0') { W.zoneLabels.visible = false; $('lyZones').checked = false; }
if (hash.ui === '0') document.body.classList.add('noui');
if (hash.cars === '0') { W.site.vehicles.visible = false; $('lyCars').checked = false; }
if (hash.walls === '0') { W.site.walls.visible = false; $('lyWalls').checked = false; }
if (hash.zone) zoneView(decodeURIComponent(hash.zone), 0);
else if (hash.cam) { const v = hash.cam.split(',').map(Number); flyTo(toWorld(v[0], v[1], v[2]), toWorld(v[3], v[4], v[5] || 0), 0); }
else flyTo(...VIEWS[hash.view || 'oblique'](), 0);

const clock = new THREE.Clock();
let frames = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.1);
  if (fly) {
    const k = Math.min(1, (performance.now() - fly.s) / fly.ms), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    camera.position.lerpVectors(fly.p0, fly.p1, e); controls.target.lerpVectors(fly.t0, fly.t1, e); if (k >= 1) fly = null;
  }
  controls.update();
  const dist = camera.position.distanceTo(controls.target);
  camera.near = Math.max(2, dist * 0.004); camera.far = Math.max(30000, dist * 12); camera.updateProjectionMatrix();
  env.updateShadow(controls.target, dist);
  scene.fog.density = env.fogBase / (1 + camera.position.y / 2600);   // thinner haze when looking down from high up
  env.tick(dt, camera);
  // label sizes stay readable: fade the small ones out when far away
  const showSmall = dist < 2600; if (W.labels.visible !== (showSmall && $('lyLabels').checked)) W.labels.visible = showSmall && $('lyLabels').checked;
  const gl = dist < 1100 && $('lyLabels').checked && W.site.walls.visible; if (W.site.gateLabels.visible !== gl) W.site.gateLabels.visible = gl;
  const zl = dist > 1300 && $('lyZones').checked; if (W.zoneLabels.visible !== zl) W.zoneLabels.visible = zl;
  $('needle').style.transform = `rotate(${controls.getAzimuthalAngle() * 180 / Math.PI}deg)`;
  if (composer) composer.render(dt); else renderer.render(scene, camera);
  if (++frames === 40) { document.title = '富士康郑州厂区 3D · ready'; document.body.dataset.ready = '1'; }
}
loop();
window.__app = { scene, camera, controls, env, W, DATA, setTime, setWeather, flyTo, toWorld };
