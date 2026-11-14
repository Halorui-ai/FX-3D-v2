// Sky, sun, weather, rain. True-north frame: +x = east, -z = north.
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

export const LAT = 34.5545, LON = 113.8518, TZ = 8;

export function sunPosition(doy, hours) {
  const g = 2 * Math.PI / 365 * (doy - 1 + (hours - 12) / 24);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const tst = hours * 60 + eq + 4 * LON - 60 * TZ;
  const ha = (tst / 4 - 180) * Math.PI / 180, lat = LAT * Math.PI / 180;
  const cosZ = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
  const el = Math.PI / 2 - Math.acos(Math.max(-1, Math.min(1, cosZ)));
  const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat)) + Math.PI;
  return { el, az };
}
export const dirFrom = (az, el) => new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));

export const WEATHER = {
  clear:    { name: '晴',   cloud: 0.12, sun: 1.0,  amb: 1.0,  fog: 0.00012, turb: 3.2, wet: 0, rain: 0, grey: 0.0 },
  partly:   { name: '多云', cloud: 0.52, sun: 0.78, amb: 1.05, fog: 0.00015,  turb: 5.0, wet: 0, rain: 0, grey: 0.15 },
  overcast: { name: '阴',   cloud: 1.0,  sun: 0.10, amb: 1.25, fog: 0.00021,  turb: 9.0, wet: 0, rain: 0, grey: 0.75 },
  rain:     { name: '雨',   cloud: 1.0,  sun: 0.04, amb: 1.0,  fog: 0.00048,  turb: 10,  wet: 1, rain: 1, grey: 0.9 },
  fog:      { name: '雾',   cloud: 0.9,  sun: 0.12, amb: 1.15, fog: 0.0016,  turb: 12,  wet: 0.25, rain: 0, grey: 0.85 },
  haze:     { name: '霾',   cloud: 0.35, sun: 0.55, amb: 1.0,  fog: 0.00062,  turb: 16,  wet: 0, rain: 0, grey: 0.45, tint: [0.80, 0.72, 0.58] },
};

const skyVS = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * 0.99999; }`;
const skyFS = `
varying vec3 vDir; uniform float uCover, uTime, uNight, uGrey, uSunVis; uniform vec3 uSun, uSunCol, uZen, uHor, uGround;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for(int i=0;i<6;i++){ s += a*n(p); p = p*2.03 + vec2(17.0, 9.0); a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float up = max(d.y, 0.0);
  vec3 sky = mix(uHor, uZen, pow(up, 0.42));
  float sd = max(dot(d, uSun), 0.0);
  sky += uSunCol * uSunVis * (pow(sd, 6.0) * 0.10 + pow(sd, 48.0) * 0.35 + pow(sd, 700.0) * 2.5 + smoothstep(0.99955, 0.99985, sd) * 30.0);
  if (d.y < 0.0) sky = mix(uHor, uGround, smoothstep(0.0, -0.12, d.y));
  else {
    vec2 uv = d.xz / (d.y + 0.12) * 1.1 + vec2(uTime * 0.006, uTime * 0.002);
    float f = fbm(uv * 1.6), f2 = fbm(uv * 4.0 + 5.0);
    float dens = smoothstep(1.02 - uCover * 0.95, 1.30 - uCover * 0.85, f + f2 * 0.35 + uCover * 0.35);
    float lit = clamp(0.55 + 0.45 * dot(d, uSun), 0.0, 1.0);
    vec3 base = mix(vec3(1.05), vec3(0.50, 0.52, 0.56), uGrey);
    vec3 shadow = mix(vec3(0.50, 0.56, 0.68), vec3(0.26, 0.28, 0.32), uGrey);
    vec3 col = mix(shadow, base, (1.0 - dens * 0.55) * lit) * mix(uSunCol, vec3(1.0), 0.35);
    col = mix(col, uHor, 0.20) * (1.0 - 0.96 * uNight) + vec3(0.010, 0.012, 0.018) * uNight;
    float a = dens * smoothstep(0.0, 0.10, d.y);
    a = mix(a, max(a, smoothstep(0.0, 0.04, d.y) * 0.97), smoothstep(0.85, 1.0, uCover));
    sky = mix(sky, col, a);
  }
  gl_FragColor = vec4(sky, 1.0);
}`;

export class Environment {
  constructor(renderer, scene) {
    this.renderer = renderer; this.scene = scene;
    this.skyU = { uCover: { value: 0.2 }, uTime: { value: 0 }, uNight: { value: 0 }, uGrey: { value: 0 }, uSunVis: { value: 1 },
      uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) }, uZen: { value: new THREE.Color(0.16, 0.34, 0.8) },
      uHor: { value: new THREE.Color(0.6, 0.72, 0.9) }, uGround: { value: new THREE.Color(0.1, 0.1, 0.09) } };
    const skyMat = new THREE.ShaderMaterial({ uniforms: this.skyU, vertexShader: skyVS, fragmentShader: skyFS, side: THREE.BackSide, depthWrite: false, fog: false });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(15000, 48, 24), skyMat);
    this.sky.renderOrder = -10; this.sky.frustumCulled = false; scene.add(this.sky);
    // stars
    const sg = new THREE.BufferGeometry(), sp = [];
    for (let i = 0; i < 1500; i++) { const a = Math.random() * 6.283, y = Math.random(); const r = Math.sqrt(1 - y * y); sp.push(r * Math.cos(a) * 14000, y * 14000 + 300, r * Math.sin(a) * 14000); }
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.frustumCulled = false; scene.add(this.stars);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(4096, 4096); this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbcd3ff, 0x6b6558, 0.5); scene.add(this.hemi);
    scene.fog = new THREE.FogExp2(0x9fb4c8, 0.00006);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    // a private scene (sky + clouds) used to bake the image-based lighting
    this.envScene = new THREE.Scene();
    this.envScene.add(new THREE.Mesh(this.sky.geometry, skyMat));
    this.envRT = null; this.dirty = true; this.lastBake = 0;
    // rain
    const N = 16000, rp = new Float32Array(N * 6), rs = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) { const x = Math.random(), y = Math.random(), z = Math.random(), s = Math.random(); rp.set([x, y, z, x, y, z], i * 6); rs.set([0, 1], i * 2); void s; }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3)); rg.setAttribute('aEnd', new THREE.BufferAttribute(rs, 1));
    this.rainU = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: 300 }, uOpacity: { value: 0 }, uLen: { value: 5 } };
    this.rain = new THREE.LineSegments(rg, new THREE.ShaderMaterial({ uniforms: this.rainU, transparent: true, depthWrite: false, fog: false,
      vertexShader: `attribute float aEnd; uniform float uTime, uBox, uLen; uniform vec3 uCam; void main(){ vec3 p = position; float sp = 0.9 + fract(p.x * 91.7) * 0.5; p.y = fract(p.y - uTime * sp * (90.0 / uBox)); vec3 w = (fract(p + vec3(uCam.x, 0.0, uCam.z) / uBox * vec3(-1.0, 0.0, -1.0)) - 0.5) * uBox; w.y = (p.y - 0.5) * uBox * 0.6; w += vec3(uCam.x, uCam.y, uCam.z); w.y += aEnd * uLen; w.x += aEnd * uLen * 0.12; gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0); }`,
      fragmentShader: `uniform float uOpacity; void main(){ gl_FragColor = vec4(0.78, 0.82, 0.88, uOpacity); }` }));
    this.rain.frustumCulled = false; this.rain.visible = false; scene.add(this.rain);
    this.noAO = [this.sky, this.stars, this.rain];
    this.state = { hours: 10, doy: 288, weather: 'clear' };
  }

  apply(hooks) {
    const st = this.state, W = WEATHER[st.weather];
    const { el, az } = sunPosition(st.doy, st.hours);
    const elD = el * 180 / Math.PI;
    const day = THREE.MathUtils.smoothstep(elD, -6, 6);          // 0 night .. 1 day
    const night = 1 - day;
    const golden = 1 - THREE.MathUtils.smoothstep(elD, 2, 22);   // warm light near the horizon
    const sunDir = dirFrom(az, Math.max(el, 0.02));
    // moon: roughly opposite the sun, fixed elevation
    const moonDir = dirFrom(az + Math.PI * 0.9, 0.75);
    const lightDir = day > 0.02 ? sunDir : moonDir;
    this.lightDir = lightDir.clone();
    const sunCol = new THREE.Color().setRGB(1, 0.95 - 0.38 * golden, 0.88 - 0.62 * golden);
    const grey = W.grey;
    sunCol.lerp(new THREE.Color(0.86, 0.88, 0.92), grey);
    if (day > 0.02) { this.sun.color.copy(sunCol); this.sun.intensity = 4.2 * W.sun * day * (0.35 + 0.65 * THREE.MathUtils.smoothstep(elD, 0, 14)); }
    else { this.sun.color.setRGB(0.55, 0.65, 0.95); this.sun.intensity = 0.42 * (1 - 0.6 * grey); }
    // sky colours (linear HDR): zenith / horizon by time of day, pulled towards grey by the weather
    const zen = new THREE.Color(0.13, 0.30, 0.74).multiplyScalar(day).lerp(new THREE.Color(0.30, 0.33, 0.37).multiplyScalar(0.25 + 0.75 * day), grey);
    const hor = new THREE.Color(0.58, 0.70, 0.88).lerp(new THREE.Color(1.0, 0.56, 0.26), golden * 0.75).multiplyScalar(day).lerp(new THREE.Color(0.46, 0.48, 0.50).multiplyScalar(0.2 + 0.8 * day), grey);
    zen.add(new THREE.Color(0.0035, 0.005, 0.012).multiplyScalar(night)); hor.add(new THREE.Color(0.012, 0.014, 0.022).multiplyScalar(night));
    if (W.tint) { const t = new THREE.Color(...W.tint).multiplyScalar(0.10 + 0.75 * day); zen.lerp(t, 0.55); hor.lerp(t, 0.8); }
    const skyCol = zen.clone().lerp(hor, 0.5);
    const U = this.skyU;
    U.uZen.value.copy(zen); U.uHor.value.copy(hor); U.uGround.value.copy(hor).multiplyScalar(0.35);
    U.uCover.value = W.cloud; U.uNight.value = night; U.uGrey.value = grey;
    U.uSun.value.copy(day > 0.02 ? dirFrom(az, el) : moonDir); U.uSunCol.value.copy(day > 0.02 ? sunCol : new THREE.Color(0.5, 0.6, 0.9));
    U.uSunVis.value = (day > 0.02 ? 1.0 : 0.05) * (1 - 0.92 * grey);
    this.stars.material.opacity = night * (1 - W.cloud) * 0.9;
    // ambient
    this.hemi.color.copy(skyCol).lerp(new THREE.Color(1, 1, 1), 0.25);
    this.hemi.groundColor.setRGB(0.30, 0.28, 0.24).multiplyScalar(0.35 + 0.65 * day);
    if (night > 0.5) this.hemi.color.setRGB(0.55, 0.50, 0.48);          // sodium-ish city sky glow
    this.hemi.intensity = (0.03 + 0.34 * day) * W.amb + 0.16 * night;
    this.scene.environmentIntensity = (0.10 + 0.85 * day) * W.amb;
    // fog takes the horizon colour
    const fogCol = hor.clone().lerp(zen, 0.18);
    this.scene.fog.color.copy(fogCol); this.fogBase = W.fog * (1 + 0.6 * night);
    this.renderer.toneMappingExposure = THREE.MathUtils.lerp(1.35, 0.60, day) * (1 + 0.35 * grey * day) * (1 + 0.9 * golden * day * (1 - grey));
    // rain
    this.rain.visible = W.rain > 0; this.rainU.uOpacity.value = 0.09 * W.rain * (0.35 + 0.65 * day);
    this.night = night; this.day = day; this.wet = W.wet; this.elDeg = elD; this.azDeg = az * 180 / Math.PI;
    if (this.hdri) { const m = this.hdri.material; m.opacity = 0.9 * day * (1 - grey) * (1 - 0.5 * golden); m.color.setRGB(0.8, 0.8 - 0.12 * golden, 0.8 - 0.25 * golden); this.hdri.rotation.y = Math.atan2(lightDir.x, lightDir.z) - this.hdriAng; }
    this.dirty = true;
    if (hooks) hooks(this);
  }

  // A photographed sky (Poly Haven, CC0) is blended into the image-based lighting so glass / metal reflect real clouds and a
  // real sun.  It is rotated to the current sun azimuth and faded by daylight and weather; the procedural sky stays underneath.
  setHDRI(bytes) {
    const d = new RGBELoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const tex = new THREE.DataTexture(d.data, d.width, d.height, THREE.RGBAFormat, d.type); tex.flipY = true; tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.LinearSRGBColorSpace; tex.needsUpdate = true;
    let best = -1, bu = 0; for (let y = 0; y < d.height; y += 2) for (let x = 0; x < d.width; x += 2) { const i = (y * d.width + x) * 4, l = THREE.DataUtils.fromHalfFloat(d.data[i]) + THREE.DataUtils.fromHalfFloat(d.data[i + 1]) + THREE.DataUtils.fromHalfFloat(d.data[i + 2]); if (l > best) { best = l; bu = x / d.width; } }
    this.hdriAng = Math.atan2(-Math.cos(bu * Math.PI * 2), Math.sin(bu * Math.PI * 2));
    this.hdri = new THREE.Mesh(new THREE.SphereGeometry(9000, 48, 24), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, depthTest: false, toneMapped: false, fog: false }));
    this.hdri.renderOrder = 5; this.envScene.add(this.hdri); this.apply();
  }

  // shadow frustum follows the camera target; tight when zoomed in, wide when zoomed out
  updateShadow(target, dist) {
    const ext = THREE.MathUtils.clamp(dist * 0.85, 140, 2600), cam = this.sun.shadow.camera;
    const texel = ext * 2 / this.sun.shadow.mapSize.x;
    const t = target.clone(); t.x = Math.round(t.x / texel) * texel; t.z = Math.round(t.z / texel) * texel; t.y = 0;
    this.sun.target.position.copy(t); this.sun.position.copy(t).addScaledVector(this.lightDir, 5000);
    if (Math.abs(cam.right - ext) > 1e-3) { cam.left = -ext; cam.right = ext; cam.top = ext; cam.bottom = -ext; cam.near = 100; cam.far = 9000; cam.updateProjectionMatrix(); }
    this.sun.shadow.normalBias = Math.max(0.25, texel * 1.6);
  }

  tick(dt, camera) {
    this.skyU.uTime.value += dt; this.rainU.uTime.value += dt; this.rainU.uCam.value.copy(camera.position);
    const h = Math.max(30, camera.position.y); this.rainU.uBox.value = THREE.MathUtils.clamp(h * 1.6, 120, 1500); this.rainU.uLen.value = this.rainU.uBox.value * 0.007;
    this.sky.position.copy(camera.position); this.stars.position.set(camera.position.x, 0, camera.position.z);
    const now = performance.now();
    if (this.dirty && now - this.lastBake > 160) {
      this.dirty = false; this.lastBake = now;
      const old = this.envRT;
      this.envRT = this.pmrem.fromScene(this.envScene, 0, 10, 40000);
      this.scene.environment = this.envRT.texture;
      if (old) old.dispose();
    }
  }
}
