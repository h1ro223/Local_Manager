/* =========================================================
   LAST LANDING ～100人の孤島戦線～
   made by hiro / ヒロ  https://github.com/h1ro223
   ========================================================= */
(() => {
'use strict';

// ================= 基本ユーティリティ =================
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const wrapAngle = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const rnd = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const rndInt = (a, b) => Math.floor(rnd(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function weighted(obj, r = Math.random) {
  let total = 0; for (const k in obj) total += obj[k];
  let x = r() * total;
  for (const k in obj) { x -= obj[k]; if (x <= 0) return k; }
  return Object.keys(obj)[0];
}
const fmtTime = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const dist2D = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// ================= 定数 =================
const MAP = 6000, HALF = 3000, SEG = 300, CELL = MAP / SEG; // 1セル20m
const HN = SEG + 1;
const SEED = 20260;
const TOTAL = 100;
const GRAV = 20;
const STEP = 0.55;
const SOLID = 1, BULLET = 2;
const SWIM_DEPTH = -1.35;

const isTouchDevice = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || (('ontouchstart' in window) && navigator.maxTouchPoints > 0);

// ================= 設定 =================
const SETTINGS_KEY = 'lastlanding_settings_v1';
function loadSettings() { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (e) { return {}; } }
function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* 保存不可環境 */ } }
const settings = Object.assign({
  quality: isTouchDevice ? 1 : 2,
  sens: 1.0, adsSens: 0.8, fov: 80, volume: 0.8,
  controls: 'auto', showFps: false,
  autoReload: true, autoPickup: true, autoDash: true, layout: {}, view: 'fps'
}, loadSettings());
if (!settings.layout || typeof settings.layout !== 'object') settings.layout = {};
const useTouch = () => settings.controls === 'touch' || (settings.controls === 'auto' && isTouchDevice);

const QUALITY = [
  { name: '低', pr: Math.min(window.devicePixelRatio || 1, 1), fog: 700, tree: 330, shadow: 0, aa: false },
  { name: '中', pr: Math.min(window.devicePixelRatio || 1, 1.5), fog: 1050, tree: 560, shadow: 0, aa: false },
  { name: '高', pr: Math.min(window.devicePixelRatio || 1, 2), fog: 1500, tree: 850, shadow: 2048, aa: true },
];
const Q = () => QUALITY[clamp(settings.quality | 0, 0, 2)];

// ================= レンダラー =================
const canvas = $('gl');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouchDevice, powerPreference: 'high-performance' });
} catch (e) {
  $('loadText').textContent = 'WebGLを初期化できませんでした。別のブラウザでお試しください。';
  throw e;
}
renderer.autoClear = false;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.08, 3000);
camera.rotation.order = 'YXZ';
scene.add(camera);
const vmScene = new THREE.Scene();
const vmCamera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);

const SKY_TOP = new THREE.Color(0x2f67b0);
const SKY_HORIZON = new THREE.Color(0xc4d6df);
const FOG_COLOR = SKY_HORIZON.clone();
scene.fog = new THREE.Fog(FOG_COLOR, 60, 1500);
scene.background = FOG_COLOR.clone();

const SUN_DIR = new THREE.Vector3(-0.42, 0.72, 0.36).normalize();
const hemi = new THREE.HemisphereLight(0xe2efff, 0x5d5a3e, 0.78);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d6, 0.95);
sun.position.copy(SUN_DIR).multiplyScalar(300);
scene.add(sun); scene.add(sun.target);
sun.shadow.camera.near = 10; sun.shadow.camera.far = 700;
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
const flashLight = new THREE.PointLight(0xffc27a, 0, 16, 2);
scene.add(flashLight);

// ビューモデル用ライト
vmScene.add(new THREE.HemisphereLight(0xe8f0ff, 0x4d4a3a, 0.9));
const vmSun = new THREE.DirectionalLight(0xfff0d6, 0.7); vmSun.position.set(-0.5, 1, 0.6); vmScene.add(vmSun);
const vmFlashLight = new THREE.PointLight(0xffb060, 0, 3, 2); vmFlashLight.position.set(0.1, -0.1, -0.9); vmScene.add(vmFlashLight);

// 空ドーム
const skyMat = new THREE.ShaderMaterial({
  uniforms: { top: { value: SKY_TOP }, horizon: { value: SKY_HORIZON }, sunDir: { value: SUN_DIR } },
  vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: [
    'uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; varying vec3 vDir;',
    'void main(){',
    '  vec3 d = normalize(vDir); float h = d.y;',
    '  vec3 c = mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.5));',
    '  if (h < 0.0) c = horizon * (1.0 + h * 0.3);',
    '  float s = max(dot(d, sunDir), 0.0);',
    '  c += vec3(1.0, 0.92, 0.75) * pow(s, 900.0) * 2.0 + vec3(1.0, 0.85, 0.6) * pow(s, 10.0) * 0.22;',
    '  gl_FragColor = vec4(c, 1.0);',
    '}'
  ].join('\n'),
  side: THREE.BackSide, depthWrite: false, fog: false
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), skyMat);
sky.frustumCulled = false; sky.renderOrder = -10;
scene.add(sky);

// ================= サウンド (WebAudio合成) =================
const Sound = {
  ctx: null, master: null, noise: null, voices: 0, loops: {},
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 6;
      this.master = this.ctx.createGain();
      this.master.gain.value = settings.volume;
      this.master.connect(comp); comp.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
    } catch (e) { this.ctx = null; }
  },
  setVolume(v) { if (this.master) this.master.gain.value = v; },
  ok() { return !!(this.ctx && this.ctx.state === 'running'); },
  out(vol, pan) {
    const c = this.ctx; const g = c.createGain(); g.gain.value = vol;
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); g.connect(p); p.connect(this.master); }
    else g.connect(this.master);
    return g;
  },
  burst(dest, t, dur, vol, ftype, freq, q, decay) {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = ftype; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  },
  tone(dest, t, f0, f1, dur, vol, type = 'sine') {
    const c = this.ctx; const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
  },
  // 銃声：距離による減衰・こもり・音速遅延
  shot(kind, dist, pan, own) {
    if (!this.ok() || this.voices > 28) return;
    const vol = own ? 0.9 : 1.1 / (1 + dist / 28);
    if (vol < 0.015) return;
    const c = this.ctx;
    const t = c.currentTime + (own ? 0 : Math.min(1.6, dist / 340));
    const lp = c.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.value = own ? 16000 : clamp(14000 / (1 + dist / 60), 500, 14000);
    const dest = this.out(1, pan); lp.connect(dest);
    const P = {
      pistol: [2600, 0.09, 0.22, 150], smg: [2900, 0.07, 0.18, 140], shotgun: [1300, 0.2, 0.45, 80],
      ar556: [2200, 0.1, 0.3, 110], ar762: [1800, 0.12, 0.36, 95], dmr: [1700, 0.14, 0.45, 85],
      sniper: [1500, 0.18, 0.7, 70], fist: [600, 0.04, 0.08, 200]
    }[kind] || [2000, 0.1, 0.3, 100];
    this.burst(lp, t, P[2], vol, 'bandpass', P[0], 0.8, P[1]);
    this.burst(lp, t, P[2], vol * 0.8, 'lowpass', 900, 0.5, P[2]);
    this.tone(lp, t, P[3] * 1.6, P[3] * 0.5, 0.16, vol * 0.7);
    if (dist > 120 && !own) this.burst(lp, t + 0.15, 0.5, vol * 0.35, 'lowpass', 500, 0.3, 0.6); // 遠方の反響
    this.voices++; setTimeout(() => { this.voices--; }, 450);
  },
  step(dist, pan, surface) {
    if (!this.ok()) return;
    const vol = 0.22 / (1 + dist / 4);
    if (vol < 0.012) return;
    const t = this.ctx.currentTime;
    this.burst(this.out(1, pan), t, 0.08, vol, surface === 'hard' ? 'bandpass' : 'lowpass', surface === 'hard' ? 1400 : 700, 0.6, 0.07);
  },
  ui(kind) {
    if (!this.ok()) return;
    const t = this.ctx.currentTime, d = this.out(1, 0);
    switch (kind) {
      case 'hit': this.tone(d, t, 1900, 1500, 0.05, 0.16, 'square'); break;
      case 'head': this.tone(d, t, 2600, 2400, 0.22, 0.2); this.tone(d, t, 1300, 1250, 0.12, 0.08, 'square'); break;
      case 'kill': this.tone(d, t, 900, 880, 0.1, 0.18, 'triangle'); this.tone(d, t + 0.09, 1400, 1380, 0.2, 0.18, 'triangle'); break;
      case 'pickup': this.burst(d, t, 0.06, 0.25, 'highpass', 2500, 0.7, 0.05); break;
      case 'click': this.tone(d, t, 1200, 1100, 0.03, 0.08, 'square'); break;
      case 'empty': this.burst(d, t, 0.05, 0.2, 'bandpass', 3500, 2, 0.03); break;
      case 'warn': this.tone(d, t, 720, 720, 0.25, 0.15, 'triangle'); this.tone(d, t + 0.3, 720, 720, 0.25, 0.15, 'triangle'); break;
      case 'hurt': this.burst(d, t, 0.12, 0.35, 'lowpass', 400, 0.6, 0.12); this.tone(d, t, 160, 80, 0.12, 0.25); break;
      case 'heal': this.burst(d, t, 0.2, 0.12, 'bandpass', 2000, 0.4, 0.2); break;
      case 'chute': this.burst(d, t, 0.5, 0.45, 'lowpass', 600, 0.4, 0.5); break;
      case 'land': this.burst(d, t, 0.15, 0.4, 'lowpass', 300, 0.5, 0.15); break;
      case 'door': this.tone(d, t, 200, 150, 0.2, 0.1, 'sawtooth'); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => this.tone(d, t + i * 0.14, f, f, 0.5, 0.15, 'triangle')); break;
    }
  },
  reload(step) {
    if (!this.ok()) return;
    const t = this.ctx.currentTime, d = this.out(1, 0);
    this.burst(d, t, 0.06, step === 2 ? 0.35 : 0.22, 'bandpass', step === 0 ? 1800 : 3200, 1.5, 0.05);
  },
  impact(dist, pan, kind) {
    if (!this.ok() || dist > 60) return;
    const vol = 0.25 / (1 + dist / 6);
    const t = this.ctx.currentTime;
    this.burst(this.out(1, pan), t, 0.06, vol, 'bandpass', kind === 'metal' ? 3600 : kind === 'flesh' ? 500 : 1600, 1.2, 0.05);
  },
  explosion(dist, pan) {
    if (!this.ok()) return;
    const vol = 1.2 / (1 + dist / 40);
    const t = this.ctx.currentTime + Math.min(1.5, dist / 340);
    const d = this.out(1, pan);
    this.burst(d, t, 1.4, vol, 'lowpass', 500, 0.4, 1.3);
    this.tone(d, t, 90, 30, 0.8, vol);
  },
  // ループ音（飛行機・風・エンジン）
  loop(name, kind) {
    if (!this.ctx) return null;
    if (this.loops[name]) return this.loops[name];
    const c = this.ctx; const g = c.createGain(); g.gain.value = 0; g.connect(this.master);
    const L = { gain: g, nodes: [] };
    if (kind === 'noise') {
      const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 0.5;
      s.connect(f); f.connect(g); s.start(); L.filter = f; L.nodes.push(s);
    } else {
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600; f.connect(g);
      const o1 = c.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 50;
      const o2 = c.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 53;
      o1.connect(f); o2.connect(f); o1.start(); o2.start();
      L.filter = f; L.osc = [o1, o2]; L.nodes.push(o1, o2);
    }
    this.loops[name] = L;
    return L;
  },
  setLoop(name, kind, vol, freq, filt) {
    if (!this.ctx) return;
    const L = this.loop(name, kind); if (!L) return;
    const t = this.ctx.currentTime;
    L.gain.gain.setTargetAtTime(vol, t, 0.08);
    if (L.osc && freq) { L.osc[0].frequency.setTargetAtTime(freq, t, 0.1); L.osc[1].frequency.setTargetAtTime(freq * 1.06, t, 0.1); }
    if (L.filter && filt) L.filter.frequency.setTargetAtTime(filt, t, 0.1);
  },
  stopLoops() { for (const k in this.loops) this.loops[k].gain.gain.value = 0; }
};

// ================= ノイズ =================
function hash2(ix, iy, s) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s), c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbm(x, y, oct, s) {
  let v = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { v += a * vnoise(x * f, y * f, s + i * 17); n += a; a *= 0.5; f *= 2.03; }
  return v / n;
}

// ================= 地形の元データ =================
const channelZ = (x) => 1800 + Math.sin(x * 0.0021) * 45;
function islandMask(x, z) {
  const w = fbm(x * 0.00055 + 3.1, z * 0.00055 - 7.3, 3, SEED) - 0.5;
  const dx = x / 2550, dz = (z + 280) / 2080;
  const d1 = Math.sqrt(dx * dx + dz * dz) + w * 0.42;
  const m1 = 1 - smooth(0.8, 1.0, d1);
  const ex = (x - 380) / 820, ez = (z - 2260) / 470;
  const d2 = Math.sqrt(ex * ex + ez * ez) + w * 0.3;
  const m2 = 1 - smooth(0.74, 1.0, d2);
  let m = Math.max(m1, m2);
  m *= smooth(55, 150, Math.abs(z - channelZ(x)));
  const e = Math.max(Math.abs(x), Math.abs(z));
  m *= 1 - smooth(2780, 2940, e);
  return m;
}
function rawHeight(x, z) {
  const m = islandMask(x, z);
  const big = fbm(x * 0.00042 + 11.3, z * 0.00042 - 4.7, 3, SEED + 5);
  const mount = smooth(0.5, 0.76, big);
  const hills = fbm(x * 0.0017, z * 0.0017, 5, SEED + 9);
  const r = fbm(x * 0.0009 + 40, z * 0.0009 + 12, 4, SEED + 23);
  const ridge = 1 - Math.abs(r * 2 - 1);
  const land = 5 + hills * 24 + mount * (ridge * ridge * 95 + hills * 20);
  const sea = -24 + fbm(x * 0.002, z * 0.002, 2, SEED + 3) * 5;
  return sea + (land - sea) * smooth(0, 1, m);
}
const forestD = (x, z) => smooth(0.5, 0.67, fbm(x * 0.0012 + 77, z * 0.0012 - 31, 3, SEED + 40));

// ================= 街の定義 =================
const TOWNS = [
  { name: 'グランスク', type: 'city', x: -150, z: -250, r: 215, tier: 2 },
  { name: 'ノヴォ港', type: 'city', x: 1950, z: -650, r: 180, tier: 2 },
  { name: 'ロザノ', type: 'village', x: -1450, z: -1450, r: 120, tier: 1 },
  { name: 'ミルカ', type: 'village', x: 900, z: -1450, r: 115, tier: 1 },
  { name: '発電所', type: 'factory', x: -1850, z: 250, r: 150, tier: 2 },
  { name: 'ポルタ', type: 'village', x: -850, z: 850, r: 120, tier: 1 },
  { name: '学園', type: 'school', x: 650, z: 300, r: 125, tier: 2 },
  { name: 'ヤスナ', type: 'village', x: 1450, z: 650, r: 115, tier: 1 },
  { name: '採石場', type: 'factory', x: -500, z: -1850, r: 130, tier: 2 },
  { name: '北部砦', type: 'fort', x: 400, z: -2050, r: 110, tier: 3 },
  { name: 'ザボリエ', type: 'village', x: -2200, z: -500, r: 110, tier: 1 },
  { name: 'ステップ村', type: 'village', x: 200, z: 1200, r: 110, tier: 1 },
  { name: '軍事基地', type: 'military', x: 380, z: 2260, r: 235, tier: 3, south: true },
];
const FLATS = []; // 平坦化領域 {x,z,r0,r1,base}
const SITES = []; // 郊外の一軒家
const roads = []; // {pts:[[x,z]...], w}
const bridges = []; // {x,z0,z1,w,y0,y1}
let roadMask = null; const RM = 5, RMN = MAP / RM;

function townValid(t) {
  if (rawHeight(t.x, t.z) < 4) return false;
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * TAU;
    if (rawHeight(t.x + Math.cos(a) * t.r * 1.05, t.z + Math.sin(a) * t.r * 1.05) < 1.6) return false;
  }
  return true;
}
function placeTowns() {
  for (const t of TOWNS) {
    const cx = t.south ? 380 : 0, cz = t.south ? 2260 : -300;
    for (let k = 0; k < 60 && !townValid(t); k++) {
      const dx = cx - t.x, dz = cz - t.z, d = Math.hypot(dx, dz) || 1;
      t.x += dx / d * 30; t.z += dz / d * 30;
      if (k > 30) t.r = Math.max(80, t.r - 4);
    }
    t.base = Math.max(3, rawHeight(t.x, t.z));
    FLATS.push({ x: t.x, z: t.z, r0: t.r * 0.86, r1: t.r * 1.25, base: t.base });
  }
}

// ---- 道路 ----
function curvePts(ax, az, bx, bz, rng) {
  const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
  const px = -dz / len, pz = dx / len;
  const o1 = (rng() - 0.5) * len * 0.16, o2 = (rng() - 0.5) * len * 0.16;
  const cps = [
    new THREE.Vector3(ax, 0, az),
    new THREE.Vector3(ax + dx * 0.33 + px * o1, 0, az + dz * 0.33 + pz * o1),
    new THREE.Vector3(ax + dx * 0.66 + px * o2, 0, az + dz * 0.66 + pz * o2),
    new THREE.Vector3(bx, 0, bz)
  ];
  const curve = new THREE.CatmullRomCurve3(cps, false, 'centripetal');
  const n = Math.max(4, Math.ceil(curve.getLength() / 10));
  return curve.getSpacedPoints(n).map((v) => [v.x, v.z]);
}
function ptsOK(pts, endSkip) {
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i];
    const de = Math.min(Math.hypot(x - pts[0][0], z - pts[0][1]), Math.hypot(x - pts[pts.length - 1][0], z - pts[pts.length - 1][1]));
    if (de < endSkip) continue;
    if (rawHeight(x, z) < 1.4) return false;
  }
  return true;
}
function buildRoadGraph(rng) {
  const main = TOWNS.filter((t) => !t.south);
  const edges = [];
  for (let i = 0; i < main.length; i++) for (let j = i + 1; j < main.length; j++) {
    const a = main[i], b = main[j];
    edges.push({ a: i, b: j, len: Math.hypot(a.x - b.x, a.z - b.z) });
  }
  edges.sort((p, q) => p.len - q.len);
  const parent = main.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  let extra = 0;
  for (const e of edges) {
    const A = main[e.a], B = main[e.b];
    const ra = find(e.a), rb = find(e.b);
    const isTree = ra !== rb;
    if (!isTree && (extra >= 4 || e.len > 1800)) continue;
    let pts = curvePts(A.x, A.z, B.x, B.z, rng);
    if (!ptsOK(pts, 20)) { pts = curvePts(A.x, A.z, B.x, B.z, () => 0.5); if (!ptsOK(pts, 20)) continue; }
    if (isTree) parent[ra] = rb; else extra++;
    roads.push({ pts, w: 7.5 });
  }
  // 橋
  const mil = TOWNS.find((t) => t.south);
  for (const bx of [60, 760]) {
    const cz = channelZ(bx);
    if (rawHeight(bx, cz) > -1) continue;
    let zN = cz; while (zN > cz - 700 && rawHeight(bx, zN) < 1.6) zN -= 2;
    let zS = cz; while (zS < cz + 800 && rawHeight(bx, zS) < 1.6) zS += 2;
    if (rawHeight(bx, zN) < 1.6 || rawHeight(bx, zS) < 1.6 || zS - zN > 950) continue;
    const b = { x: bx, z0: zN - 8, z1: zS + 8, w: 9 };
    bridges.push(b);
    // 最寄りの街から橋へ
    let best = null, bd = 1e9;
    for (const t of main) { const d = Math.hypot(t.x - bx, t.z - b.z0); if (d < bd) { bd = d; best = t; } }
    let p1 = curvePts(best.x, best.z, bx, b.z0 - 30, rng);
    if (!ptsOK(p1, 40)) p1 = curvePts(best.x, best.z, bx, b.z0 - 30, () => 0.5);
    p1.push([bx, b.z0]);
    roads.push({ pts: p1, w: 7.5 });
    const p2 = [[bx, b.z1]].concat(curvePts(bx, b.z1 + 30, mil.x, mil.z, () => 0.5));
    roads.push({ pts: p2, w: 7.5 });
  }
  // 道路マスク(建物・木の配置回避用)
  roadMask = new Uint8Array(RMN * RMN);
  const mark = (x, z, R) => {
    const i0 = Math.floor((x - R + HALF) / RM), i1 = Math.floor((x + R + HALF) / RM);
    const j0 = Math.floor((z - R + HALF) / RM), j1 = Math.floor((z + R + HALF) / RM);
    for (let j = Math.max(0, j0); j <= Math.min(RMN - 1, j1); j++)
      for (let i = Math.max(0, i0); i <= Math.min(RMN - 1, i1); i++) roadMask[j * RMN + i] = 1;
  };
  for (const r of roads) for (let i = 0; i < r.pts.length - 1; i++) {
    const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
    const l = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(l / 2.5));
    for (let k = 0; k <= n; k++) mark(ax + (bx - ax) * k / n, az + (bz - az) * k / n, 8);
  }
  for (const b of bridges) for (let z = b.z0 - 10; z <= b.z1 + 10; z += 3) mark(b.x, z, 9);
}
const onRoadMask = (x, z) => {
  const i = Math.floor((x + HALF) / RM), j = Math.floor((z + HALF) / RM);
  if (i < 0 || j < 0 || i >= RMN || j >= RMN) return false;
  return roadMask[j * RMN + i] === 1;
};

function placeSites(rng) {
  let tries = 0;
  while (SITES.length < 110 && tries < 9000) {
    tries++;
    const x = (rng() * 2 - 1) * 2700, z = (rng() * 2 - 1) * 2700;
    const h = rawHeight(x, z);
    if (h < 3 || h > 75) continue;
    let ok = true;
    for (let k = 0; k < 4 && ok; k++) {
      const a = k / 4 * TAU;
      const hh = rawHeight(x + Math.cos(a) * 14, z + Math.sin(a) * 14);
      if (Math.abs(hh - h) > 5 || hh < 2) ok = false;
    }
    if (!ok) continue;
    for (const t of TOWNS) if (Math.hypot(t.x - x, t.z - z) < t.r * 1.25 + 60) { ok = false; break; }
    if (!ok) continue;
    for (const s of SITES) if (Math.hypot(s.x - x, s.z - z) < 75) { ok = false; break; }
    if (!ok) continue;
    for (let dz = -16; dz <= 16 && ok; dz += 8) for (let dx = -16; dx <= 16; dx += 8) if (onRoadMask(x + dx, z + dz)) { ok = false; break; }
    if (!ok) continue;
    const s = { x, z, base: Math.max(2.5, h) };
    SITES.push(s);
    FLATS.push({ x, z, r0: 12, r1: 24, base: s.base });
  }
}

// ================= 高さマップ =================
const heights = new Float32Array(HN * HN);
function finalHeight(x, z) {
  let h = rawHeight(x, z);
  for (let i = 0; i < FLATS.length; i++) {
    const f = FLATS[i];
    const dx = x - f.x, dz = z - f.z, d2 = dx * dx + dz * dz;
    if (d2 < f.r1 * f.r1) { const k = 1 - smooth(f.r0, f.r1, Math.sqrt(d2)); h = h + (f.base - h) * k; }
  }
  return h;
}
function terrainH(x, z) {
  const gx = (x + HALF) / CELL, gz = (z + HALF) / CELL;
  if (gx < 0 || gz < 0 || gx >= SEG || gz >= SEG) return -24;
  const i = gx | 0, j = gz | 0, fx = gx - i, fz = gz - j;
  const k = j * HN + i;
  const h00 = heights[k], h10 = heights[k + 1], h01 = heights[k + HN], h11 = heights[k + HN + 1];
  if (fx + fz <= 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
  return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
}
function terrainNormalY(x, z) {
  const a = terrainH(x - 2, z), b = terrainH(x + 2, z), c = terrainH(x, z - 2), d = terrainH(x, z + 2);
  const nx = a - b, nz = c - d, ny = 4;
  return ny / Math.hypot(nx, ny, nz);
}

// ================= ジオメトリビルダー =================
const colorCache = {};
function COL(hex) { return colorCache[hex] || (colorCache[hex] = new THREE.Color(hex)); }
class GeoBuilder {
  constructor() { this.p = []; this.n = []; this.c = []; }
  face(a, b, c, d, col, nx, ny, nz, shade = 1) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const l = Math.hypot(cx, cy, cz) || 1; cx /= l; cy /= l; cz /= l;
    if (nx !== undefined && cx * nx + cy * ny + cz * nz < 0) {
      if (d) { const t = b; b = d; d = t; } else { const t = b; b = c; c = t; }
      cx = -cx; cy = -cy; cz = -cz;
    }
    const r = col.r * shade, g = col.g * shade, bl = col.b * shade;
    const P = this.p, N = this.n, C = this.c;
    const vs = d ? [a, b, c, a, c, d] : [a, b, c];
    for (const v of vs) { P.push(v[0], v[1], v[2]); N.push(cx, cy, cz); C.push(r, g, bl); }
  }
  box(cx, cy, cz, sx, sy, sz, col, shade = 1) {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    this.face([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], col, 1, 0, 0, shade);
    this.face([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], col, -1, 0, 0, shade);
    this.face([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], col, 0, 1, 0, shade);
    this.face([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], col, 0, -1, 0, shade);
    this.face([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], col, 0, 0, 1, shade);
    this.face([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], col, 0, 0, -1, shade);
  }
  get empty() { return this.p.length === 0; }
  mesh(mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
}
function mergeGeos(list) {
  const pos = [], nor = [];
  for (const g0 of list) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.computeBoundingSphere();
  return g;
}

// ================= 当たり判定グリッド =================
const CG = 24, GN = Math.ceil(MAP / CG);
const colGrid = new Array(GN * GN);
const propGrid = new Array(GN * GN);
let qStamp = 1;
const gi = (v) => clamp(Math.floor((v + HALF) / CG), 0, GN - 1);
function addCollider(x0, y0, z0, x1, y1, z1, f) {
  const c = { x0, y0, z0, x1, y1, z1, f, s: 0 };
  for (let j = gi(z0); j <= gi(z1); j++) for (let i = gi(x0); i <= gi(x1); i++) {
    const k = j * GN + i; (colGrid[k] || (colGrid[k] = [])).push(c);
  }
  return c;
}
function addProp(x, z, r, y0, y1, t) {
  const p = { x, z, r, y0, y1, t, s: 0 };
  const k = gi(z) * GN + gi(x); (propGrid[k] || (propGrid[k] = [])).push(p);
  return p;
}
function forColliders(x0, z0, x1, z1, fn) {
  const st = ++qStamp;
  for (let j = gi(z0); j <= gi(z1); j++) for (let i = gi(x0); i <= gi(x1); i++) {
    const a = colGrid[j * GN + i]; if (!a) continue;
    for (let n = 0; n < a.length; n++) { const c = a[n]; if (c.s !== st) { c.s = st; fn(c); } }
  }
}
function forProps(x0, z0, x1, z1, fn) {
  for (let j = gi(z0 - 4); j <= gi(z1 + 4); j++) for (let i = gi(x0 - 4); i <= gi(x1 + 4); i++) {
    const a = propGrid[j * GN + i]; if (!a) continue;
    for (let n = 0; n < a.length; n++) fn(a[n]);
  }
}
function bridgeY(b, z) {
  const t = clamp((z - b.z0) / (b.z1 - b.z0), 0, 1);
  return lerp(b.y0, b.y1, t) + Math.sin(t * Math.PI) * 6;
}
function groundAt(x, z, feetY) {
  let h = terrainH(x, z);
  for (let i = 0; i < bridges.length; i++) {
    const b = bridges[i];
    if (Math.abs(x - b.x) <= b.w / 2 + 0.2 && z >= b.z0 && z <= b.z1) {
      const y = bridgeY(b, z);
      if (y <= feetY + STEP + 0.4 && y > h) h = y;
    }
  }
  const a = colGrid[gi(z) * GN + gi(x)];
  if (a) for (let n = 0; n < a.length; n++) {
    const c = a[n];
    if ((c.f & SOLID) && x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1 && c.y1 <= feetY + STEP && c.y1 > h) h = c.y1;
  }
  return h;
}
function collide(pos, r, h) {
  let hit = false;
  forColliders(pos.x - r, pos.z - r, pos.x + r, pos.z + r, (c) => {
    if (!(c.f & SOLID)) return;
    if (pos.y + h <= c.y0 || pos.y >= c.y1 - 0.001) return;
    if (c.y1 <= pos.y + STEP) return;
    const cx = clamp(pos.x, c.x0, c.x1), cz = clamp(pos.z, c.z0, c.z1);
    const dx = pos.x - cx, dz = pos.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return;
    if (d2 > 1e-8) { const d = Math.sqrt(d2); pos.x += dx / d * (r - d); pos.z += dz / d * (r - d); }
    else {
      const l = pos.x - c.x0, rr = c.x1 - pos.x, b = pos.z - c.z0, f = c.z1 - pos.z, m = Math.min(l, rr, b, f);
      if (m === l) pos.x = c.x0 - r; else if (m === rr) pos.x = c.x1 + r; else if (m === b) pos.z = c.z0 - r; else pos.z = c.z1 + r;
    }
    hit = true;
  });
  forProps(pos.x - r, pos.z - r, pos.x + r, pos.z + r, (p) => {
    if (p.t === 2) return;
    if (pos.y >= p.y1 || pos.y + h <= p.y0) return;
    const dx = pos.x - p.x, dz = pos.z - p.z, rr = r + p.r, d2 = dx * dx + dz * dz;
    if (d2 < rr * rr && d2 > 1e-8) { const d = Math.sqrt(d2); pos.x += dx / d * (rr - d); pos.z += dz / d * (rr - d); hit = true; }
  });
  pos.x = clamp(pos.x, -HALF + 30, HALF - 30); pos.z = clamp(pos.z, -HALF + 30, HALF - 30);
  return hit;
}

// ---- レイキャスト(弾・視線) ----
const RAY = { t: 1, type: '' };
function rayBox(ax, ay, az, dx, dy, dz, c) {
  let t0 = 0, t1 = 1, ta, tb, q;
  if (Math.abs(dx) < 1e-9) { if (ax < c.x0 || ax > c.x1) return -1; }
  else { ta = (c.x0 - ax) / dx; tb = (c.x1 - ax) / dx; if (ta > tb) { q = ta; ta = tb; tb = q; } if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) return -1; }
  if (Math.abs(dy) < 1e-9) { if (ay < c.y0 || ay > c.y1) return -1; }
  else { ta = (c.y0 - ay) / dy; tb = (c.y1 - ay) / dy; if (ta > tb) { q = ta; ta = tb; tb = q; } if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) return -1; }
  if (Math.abs(dz) < 1e-9) { if (az < c.z0 || az > c.z1) return -1; }
  else { ta = (c.z0 - az) / dz; tb = (c.z1 - az) / dz; if (ta > tb) { q = ta; ta = tb; tb = q; } if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) return -1; }
  return t0;
}
function raycast(ax, ay, az, bx, by, bz, los) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-5) return null;
  let best = 1, type = null;
  const st = ++qStamp;
  const steps = Math.ceil(len / (CG * 0.25)) + 1;
  let lastCell = -1;
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    if (t > best + 0.02) break;
    const cell = gi(az + dz * t) * GN + gi(ax + dx * t);
    if (cell === lastCell) continue;
    lastCell = cell;
    const a = colGrid[cell];
    if (a) for (let n = 0; n < a.length; n++) {
      const c = a[n]; if (c.s === st) continue; c.s = st;
      if (!(c.f & BULLET)) continue;
      const tt = rayBox(ax, ay, az, dx, dy, dz, c);
      if (tt >= 0 && tt < best) { best = tt; type = 'wall'; }
    }
    const p = propGrid[cell];
    if (p) for (let n = 0; n < p.length; n++) {
      const o = p[n]; if (o.s === st) continue; o.s = st;
      if (o.t === 2 && !los) continue;
      const fx = ax - o.x, fz = az - o.z, A = dx * dx + dz * dz;
      if (A < 1e-9) continue;
      const B = 2 * (fx * dx + fz * dz), C = fx * fx + fz * fz - o.r * o.r;
      if (C < 0) continue;
      const disc = B * B - 4 * A * C; if (disc < 0) continue;
      const tt = (-B - Math.sqrt(disc)) / (2 * A);
      if (tt < 0 || tt >= best) continue;
      const y = ay + dy * tt; if (y < o.y0 || y > o.y1) continue;
      best = tt; type = o.t === 0 ? 'wood' : o.t === 1 ? 'rock' : 'bush';
    }
  }
  // 橋の床
  for (let i = 0; i < bridges.length; i++) {
    const b = bridges[i];
    // 橋は区間AABBとして登録済み(BULLET)なのでここでは何もしない
    void b;
  }
  // 地形・水面
  const stepT = Math.min(1, 2.5 / len);
  if (ay >= Math.max(terrainH(ax, az), -0.3) - 0.05) {
    let prev = 0;
    for (let t = stepT; ; t += stepT) {
      const tt = Math.min(t, best);
      const y = ay + dy * tt, g = terrainH(ax + dx * tt, az + dz * tt);
      if (y < Math.max(g, -0.3)) {
        let lo = prev, hi = tt;
        for (let it = 0; it < 7; it++) {
          const m = (lo + hi) / 2;
          const ym = ay + dy * m, gm = terrainH(ax + dx * m, az + dz * m);
          if (ym < Math.max(gm, -0.3)) hi = m; else lo = m;
        }
        if (hi < best || type === null || hi <= best) { best = hi; type = g < -0.3 ? 'water' : 'ground'; }
        break;
      }
      prev = tt;
      if (tt >= best) break;
    }
  }
  if (type === null) return null;
  RAY.t = best; RAY.type = type;
  return RAY;
}

// ================= 建物生成 =================
const buildings = []; // 建物 {ix0,iz0,ix1,iz1, route...}
const lootSpots = []; // {x,y,z,tier,route}
const WALL_COLORS = [0xd9cfb8, 0xc9c3b4, 0xb8c4c7, 0xa86b55, 0xbfc9a8, 0xe0d6c2, 0x9fa9b3, 0xc7a98a];
const ROOF_COLORS = [0x7a3b2e, 0x5a4636, 0x4d5157, 0x6b2f2a, 0x3f4a42, 0x80604a];
function placer(ox, oy, oz, rot) {
  const c = [1, 0, -1, 0][rot], s = [0, 1, 0, -1][rot];
  return {
    ox, oy, oz, rot, odd: rot & 1,
    p(lx, lz) { return [ox + lx * c - lz * s, oz + lx * s + lz * c]; },
    v(lx, ly, lz) { return [ox + lx * c - lz * s, oy + ly, oz + lx * s + lz * c]; }
  };
}
function pBox(B, P, lx, ly, lz, sx, sy, sz, col, flags, shade) {
  const [wx, wz] = P.p(lx, lz);
  const wsx = P.odd ? sz : sx, wsz = P.odd ? sx : sz;
  B.box(wx, P.oy + ly, wz, wsx, sy, wsz, COL(col), shade);
  if (flags) addCollider(wx - wsx / 2, P.oy + ly - sy / 2, wz - wsz / 2, wx + wsx / 2, P.oy + ly + sy / 2, wz + wsz / 2, flags);
}
function pColl(P, lx, ly, lz, sx, sy, sz, flags) {
  const [wx, wz] = P.p(lx, lz);
  const wsx = P.odd ? sz : sx, wsz = P.odd ? sx : sz;
  addCollider(wx - wsx / 2, P.oy + ly - sy / 2, wz - wsz / 2, wx + wsx / 2, P.oy + ly + sy / 2, wz + wsz / 2, flags);
}
function gableRoof(R, P, w, d, top, rh, ov, col) {
  const x0 = -w / 2 - ov, x1 = w / 2 + ov, z0 = -d / 2 - ov, z1 = d / 2 + ov;
  const c = COL(col);
  // 南北の斜面
  let a = P.v(x0, top, z1), b = P.v(x1, top, z1), cc = P.v(x1, top + rh, 0), dd = P.v(x0, top + rh, 0);
  let n = P.v(0, 1, 1); R.face(a, b, cc, dd, c, n[0] - P.ox, 1, n[2] - P.oz, 1);
  a = P.v(x0, top, z0); b = P.v(x1, top, z0); cc = P.v(x1, top + rh, 0); dd = P.v(x0, top + rh, 0);
  n = P.v(0, 1, -1); R.face(a, b, cc, dd, c, n[0] - P.ox, 1, n[2] - P.oz, 0.86);
}
function gableEnds(B, P, w, d, top, rh, col) {
  const c = COL(col);
  for (const sx of [-1, 1]) {
    const x = sx * w / 2;
    const n = P.v(sx, 0, 0);
    B.face(P.v(x, top, -d / 2), P.v(x, top, d / 2), P.v(x, top + rh, 0), null, c, n[0] - P.ox, 0, n[2] - P.oz, 0.95);
  }
}
function windowsOn(B, P, axis, fixed, from, to, y, every, skipA, skipB) {
  // axis 'x': 壁がx方向に伸びる(z=fixed) / 'z': 壁がz方向(x=fixed)
  const len = to - from;
  const n = Math.max(1, Math.floor(len / every));
  for (let i = 0; i < n; i++) {
    const t = from + (i + 0.5) * len / n;
    if (skipA !== undefined && Math.abs(t - skipA) < (skipB || 1.6)) continue;
    const out = Math.sign(fixed) || 1;
    if (axis === 'x') {
      pBox(B, P, t, y, fixed + out * 0.02, 1.3, 1.35, 0.06, 0xe8e4da, 0);
      pBox(B, P, t, y, fixed + out * 0.05, 1.05, 1.1, 0.04, 0x334a57, 0);
      pBox(B, P, t, y, fixed - out * 0.34, 1.05, 1.1, 0.04, 0x4a6270, 0);
    } else {
      pBox(B, P, fixed + out * 0.02, y, t, 0.06, 1.35, 1.3, 0xe8e4da, 0);
      pBox(B, P, fixed + out * 0.05, y, t, 0.04, 1.1, 1.05, 0x334a57, 0);
      pBox(B, P, fixed - out * 0.34, y, t, 0.04, 1.1, 1.05, 0x4a6270, 0);
    }
  }
}
function registerBuilding(P, w, d, doorX, partX, tier, nLoot, rng, lootY, outdoor) {
  const T = 0.25;
  const [ax, az] = P.p(-w / 2 + T, -d / 2 + T), [bx, bz] = P.p(w / 2 - T, d / 2 - T);
  const b = {
    x0: Math.min(ax, bx), z0: Math.min(az, bz), x1: Math.max(ax, bx), z1: Math.max(az, bz), y: P.oy,
    doorOut: P.p(doorX, d / 2 + 1.6), doorIn: P.p(doorX, d / 2 - 1.1),
    part: partX !== null ? P.p(partX, 0) : null
  };
  buildings.push(b);
  for (let i = 0; i < nLoot; i++) {
    const lx = (rng() * 2 - 1) * (w / 2 - 1.0), lz = (rng() * 2 - 1) * (d / 2 - 1.0);
    if (partX !== null && Math.abs(lx - partX) < 0.6) continue;
    const [x, z] = P.p(lx, lz);
    const route = [b.doorOut, b.doorIn];
    if (partX !== null && (lx < partX) !== (doorX < partX)) route.push(b.part);
    lootSpots.push({ x, y: P.oy + (lootY || 0.17), z, tier, route, bld: b });
  }
  return b;
}
function buildHouse(B, R, x, y, z, rot, w, d, tier, rng) {
  const P = placer(x, y, z, rot);
  const H = 3.1, T = 0.25, FY = 0.15, top = FY + H;
  const wc = WALL_COLORS[Math.floor(rng() * WALL_COLORS.length)];
  const rc = ROOF_COLORS[Math.floor(rng() * ROOF_COLORS.length)];
  pBox(B, P, 0, (FY - 1.4) / 2, 0, w + 0.3, 1.4 + FY, d + 0.3, 0x8b867c, SOLID | BULLET, 0.9);
  pBox(B, P, 0, FY + 0.01, 0, w - 2 * T, 0.02, d - 2 * T, 0x8a6a48, 0);
  const doorX = (rng() < 0.5 ? -1 : 1) * (w / 2 - 2.0);
  const DW = 1.3, DH = 2.25;
  const zf = d / 2 - T / 2, zb = -d / 2 + T / 2, xs = w / 2 - T / 2;
  // 正面(ドア付き)
  pBox(B, P, (-w / 2 + doorX - DW / 2) / 2, FY + H / 2, zf, doorX - DW / 2 + w / 2, H, T, wc, SOLID | BULLET);
  pBox(B, P, (doorX + DW / 2 + w / 2) / 2, FY + H / 2, zf, w / 2 - doorX - DW / 2, H, T, wc, SOLID | BULLET);
  pBox(B, P, doorX, FY + DH + (H - DH) / 2, zf, DW, H - DH, T, wc, SOLID | BULLET);
  pBox(B, P, doorX - DW / 2 - 0.05, FY + DH / 2, zf + 0.15, 0.1, DH, 0.06, 0x5b4632, 0); // ドア枠
  pBox(B, P, doorX + DW / 2 + 0.05, FY + DH / 2, zf + 0.15, 0.1, DH, 0.06, 0x5b4632, 0);
  pBox(B, P, doorX, FY + DH + 0.05, zf + 0.15, DW + 0.2, 0.1, 0.06, 0x5b4632, 0);
  // 背面・側面
  pBox(B, P, 0, FY + H / 2, zb, w, H, T, wc, SOLID | BULLET, 0.92);
  pBox(B, P, -xs, FY + H / 2, 0, T, H, d - 2 * T, wc, SOLID | BULLET, 0.96);
  pBox(B, P, xs, FY + H / 2, 0, T, H, d - 2 * T, wc, SOLID | BULLET, 0.96);
  // 間仕切り
  let partX = null;
  if (w >= 9) {
    partX = -doorX * 0.15;
    const gap = 1.2, inner = d - 2 * T;
    const seg = (inner - gap) / 2;
    pBox(B, P, partX, FY + H / 2, -d / 2 + T + seg / 2, 0.15, H, seg, 0xe9e2d2, SOLID | BULLET);
    pBox(B, P, partX, FY + H / 2, d / 2 - T - seg / 2, 0.15, H, seg, 0xe9e2d2, SOLID | BULLET);
    pBox(B, P, partX, FY + DH + (H - DH) / 2, 0, 0.15, H - DH, gap, 0xe9e2d2, SOLID | BULLET);
  }
  // 天井・屋根
  pBox(B, P, 0, top + 0.1, 0, w, 0.2, d, 0xd8d2c4, BULLET);
  const rh = Math.min(2.6, d * 0.32);
  gableRoof(R, P, w, d, top + 0.2, rh, 0.45, rc);
  gableEnds(B, P, w, d, top + 0.2, rh, wc);
  pColl(P, 0, top + 0.2 + rh / 2, 0, w, rh, d, BULLET);
  if (rng() < 0.5) pBox(B, P, w * 0.25, top + rh * 0.8, -d * 0.15, 0.6, 1.6, 0.6, 0x6d5d50, 0);
  // 窓
  windowsOn(B, P, 'x', d / 2, -w / 2 + 0.6, w / 2 - 0.6, FY + 1.55, 2.6, doorX, 1.5);
  windowsOn(B, P, 'x', -d / 2, -w / 2 + 0.6, w / 2 - 0.6, FY + 1.55, 2.6);
  windowsOn(B, P, 'z', w / 2, -d / 2 + 0.6, d / 2 - 0.6, FY + 1.55, 3.2);
  windowsOn(B, P, 'z', -w / 2, -d / 2 + 0.6, d / 2 - 0.6, FY + 1.55, 3.2);
  // 玄関ステップ
  pBox(B, P, doorX, FY / 2 - 0.05, d / 2 + 0.6, 1.8, FY + 0.1, 1.0, 0x8b867c, 0);
  return registerBuilding(P, w, d, doorX, partX, tier, 2 + Math.floor(rng() * 3), rng);
}
function buildWarehouse(B, R, x, y, z, rot, w, d, H, tier, rng, small) {
  const P = placer(x, y, z, rot);
  const T = 0.3, FY = 0.15, top = FY + H;
  const wc = small ? pick([0x8e5a3c, 0x9a8f7a, 0x6f7b6a]) : pick([0x7b8478, 0x8a8f94, 0x6b735f, 0x9a9686]);
  pBox(B, P, 0, (FY - 1.4) / 2, 0, w + 0.3, 1.4 + FY, d + 0.3, 0x7d7a72, SOLID | BULLET, 0.9);
  const DW = small ? 3.0 : 5.0, DH = small ? 3.0 : 4.6, doorX = 0;
  const zf = d / 2 - T / 2;
  pBox(B, P, (-w / 2 + doorX - DW / 2) / 2, FY + H / 2, zf, w / 2 - DW / 2, H, T, wc, SOLID | BULLET);
  pBox(B, P, (doorX + DW / 2 + w / 2) / 2, FY + H / 2, zf, w / 2 - DW / 2, H, T, wc, SOLID | BULLET);
  pBox(B, P, doorX, FY + DH + (H - DH) / 2, zf, DW, H - DH, T, wc, SOLID | BULLET);
  // 背面(小ドア)
  const zb = -d / 2 + T / 2, bd = w * 0.3;
  pBox(B, P, (-w / 2 + bd - 0.65) / 2, FY + H / 2, zb, bd - 0.65 + w / 2, H, T, wc, SOLID | BULLET, 0.9);
  pBox(B, P, (bd + 0.65 + w / 2) / 2, FY + H / 2, zb, w / 2 - bd - 0.65, H, T, wc, SOLID | BULLET, 0.9);
  pBox(B, P, bd, FY + 2.25 + (H - 2.25) / 2, zb, 1.3, H - 2.25, T, wc, SOLID | BULLET, 0.9);
  pBox(B, P, -w / 2 + T / 2, FY + H / 2, 0, T, H, d - 2 * T, wc, SOLID | BULLET, 0.95);
  pBox(B, P, w / 2 - T / 2, FY + H / 2, 0, T, H, d - 2 * T, wc, SOLID | BULLET, 0.95);
  // 屋根
  if (small) {
    const rh = 2.2;
    gableRoof(R, P, w, d, top, rh, 0.4, 0x5d3a2a);
    gableEnds(B, P, w, d, top, rh, wc);
    pColl(P, 0, top + rh / 2, 0, w, rh, d, BULLET);
  } else {
    pBox(B, P, 0, top + 0.15, 0, w + 0.4, 0.3, d + 0.4, 0x5c615e, BULLET);
    for (let i = -2; i <= 2; i++) pBox(B, P, i * w / 5, top + 0.4, 0, 0.3, 0.2, d, 0x4c514e, 0);
  }
  // 側面の帯
  pBox(B, P, 0, FY + H - 0.4, d / 2 + 0.03, w, 0.3, 0.04, 0x3b403c, 0);
  windowsOn(B, P, 'z', w / 2, -d / 2 + 1, d / 2 - 1, FY + H - 1.4, 4);
  windowsOn(B, P, 'z', -w / 2, -d / 2 + 1, d / 2 - 1, FY + H - 1.4, 4);
  // 中の木箱(遮蔽物)
  const nCr = small ? 1 : 3;
  for (let i = 0; i < nCr; i++) {
    const lx = (rng() * 2 - 1) * (w / 2 - 2.5), lz = (rng() * 2 - 1) * (d / 2 - 3.5);
    if (Math.abs(lx) < DW && lz > d / 2 - 5) continue;
    pBox(B, P, lx, FY + 0.6, lz, 1.2, 1.2, 1.2, 0x8b6a3e, SOLID | BULLET);
    if (rng() < 0.4) pBox(B, P, lx, FY + 1.8, lz, 1.2, 1.2, 1.2, 0x7d5f37, SOLID | BULLET);
  }
  return registerBuilding(P, w, d, doorX, null, tier, small ? 2 + Math.floor(rng() * 2) : 4 + Math.floor(rng() * 4), rng);
}
function buildApartment(B, R, x, y, z, rot, w, d, floors, tier, rng) {
  const P = placer(x, y, z, rot);
  const H = 3.2, T = 0.3, FY = 0.15;
  const wc = pick([0xbfb8a8, 0xa9a59c, 0xc8b89c, 0x9ea7a8, 0xb59d84]);
  pBox(B, P, 0, (FY - 1.4) / 2, 0, w + 0.3, 1.4 + FY, d + 0.3, 0x7d7a72, SOLID | BULLET, 0.9);
  pBox(B, P, 0, FY + 0.01, 0, w - 2 * T, 0.02, d - 2 * T, 0x6f6a62, 0);
  const DW = 1.6, DH = 2.4, doorX = 0, zf = d / 2 - T / 2;
  pBox(B, P, (-w / 2 - DW / 2) / 2, FY + H / 2, zf, w / 2 - DW / 2, H, T, wc, SOLID | BULLET);
  pBox(B, P, (DW / 2 + w / 2) / 2, FY + H / 2, zf, w / 2 - DW / 2, H, T, wc, SOLID | BULLET);
  pBox(B, P, 0, FY + DH + (H - DH) / 2, zf, DW, H - DH, T, wc, SOLID | BULLET);
  pBox(B, P, 0, FY + H / 2, -d / 2 + T / 2, w, H, T, wc, SOLID | BULLET, 0.9);
  pBox(B, P, -w / 2 + T / 2, FY + H / 2, 0, T, H, d - 2 * T, wc, SOLID | BULLET, 0.95);
  pBox(B, P, w / 2 - T / 2, FY + H / 2, 0, T, H, d - 2 * T, wc, SOLID | BULLET, 0.95);
  // 上層階(立入不可の塊)
  const upH = (floors - 1) * H;
  pBox(B, P, 0, FY + H + upH / 2, 0, w, upH, d, wc, SOLID | BULLET);
  pBox(B, P, 0, FY + H + 0.05, 0, w + 0.25, 0.25, d + 0.25, 0x8a857a, 0);
  // 屋上
  const topY = FY + H + upH;
  pBox(B, P, 0, topY + 0.4, d / 2 - 0.1, w, 0.8, 0.2, wc, 0, 0.9);
  pBox(B, P, 0, topY + 0.4, -d / 2 + 0.1, w, 0.8, 0.2, wc, 0, 0.9);
  pBox(B, P, w / 2 - 0.1, topY + 0.4, 0, 0.2, 0.8, d, wc, 0, 0.9);
  pBox(B, P, -w / 2 + 0.1, topY + 0.4, 0, 0.2, 0.8, d, wc, 0, 0.9);
  pBox(B, P, w * 0.2, topY + 0.9, -d * 0.2, 1.6, 1.8, 1.6, 0x7b7f80, 0);
  for (let f = 0; f < floors; f++) {
    const yy = FY + 1.6 + f * H;
    windowsOn(B, P, 'x', d / 2, -w / 2 + 0.6, w / 2 - 0.6, yy, 2.4, f === 0 ? 0 : undefined, 1.8);
    windowsOn(B, P, 'x', -d / 2, -w / 2 + 0.6, w / 2 - 0.6, yy, 2.4);
    windowsOn(B, P, 'z', w / 2, -d / 2 + 0.6, d / 2 - 0.6, yy, 2.6);
    windowsOn(B, P, 'z', -w / 2, -d / 2 + 0.6, d / 2 - 0.6, yy, 2.6);
  }
  pBox(B, P, 0, FY + DH + 0.35, d / 2 + 0.7, DW + 1.4, 0.15, 1.4, 0x6b6660, 0);
  return registerBuilding(P, w, d, doorX, null, tier, 3 + Math.floor(rng() * 3), rng);
}
function buildBarracks(B, R, x, y, z, rot, tier, rng) {
  const P = placer(x, y, z, rot);
  const w = 16, d = 7, H = 3.0, T = 0.25, FY = 0.15, top = FY + H;
  const wc = 0x7d8466;
  pBox(B, P, 0, (FY - 1.4) / 2, 0, w + 0.3, 1.4 + FY, d + 0.3, 0x7d7a72, SOLID | BULLET, 0.9);
  const zf = d / 2 - T / 2, DW = 1.4, DH = 2.25;
  for (const zz of [zf, -zf]) {
    pBox(B, P, (-w / 2 - DW / 2) / 2, FY + H / 2, zz, w / 2 - DW / 2, H, T, wc, SOLID | BULLET, zz < 0 ? 0.9 : 1);
    pBox(B, P, (DW / 2 + w / 2) / 2, FY + H / 2, zz, w / 2 - DW / 2, H, T, wc, SOLID | BULLET, zz < 0 ? 0.9 : 1);
    pBox(B, P, 0, FY + DH + (H - DH) / 2, zz, DW, H - DH, T, wc, SOLID | BULLET);
  }
  pBox(B, P, -w / 2 + T / 2, FY + H / 2, 0, T, H, d - 2 * T, wc, SOLID | BULLET);
  pBox(B, P, w / 2 - T / 2, FY + H / 2, 0, T, H, d - 2 * T, wc, SOLID | BULLET);
  pBox(B, P, 0, top + 0.1, 0, w, 0.2, d, 0xc9c4b5, BULLET);
  gableRoof(R, P, w, d, top + 0.2, 1.6, 0.35, 0x4a5240);
  gableEnds(B, P, w, d, top + 0.2, 1.6, wc);
  pColl(P, 0, top + 1, 0, w, 1.6, d, BULLET);
  windowsOn(B, P, 'x', d / 2, -w / 2 + 0.8, w / 2 - 0.8, FY + 1.6, 3, 0, 1.6);
  windowsOn(B, P, 'x', -d / 2, -w / 2 + 0.8, w / 2 - 0.8, FY + 1.6, 3, 0, 1.6);
  // 二段ベッド風の障害物
  for (const sx of [-1, 1]) pBox(B, P, sx * (w / 2 - 2.2), FY + 0.5, -d / 2 + 1.0, 2.0, 1.0, 0.9, 0x55603f, SOLID | BULLET);
  return registerBuilding(P, w, d, 0, null, tier, 3 + Math.floor(rng() * 3), rng);
}
function buildTower(B, R, x, y, z, rng) {
  const P = placer(x, y, z, 0);
  const c = 0x6e6252;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) pBox(B, P, sx * 1.5, 3.2, sz * 1.5, 0.3, 6.4, 0.3, c, SOLID | BULLET);
  pBox(B, P, 0, 6.5, 0, 3.8, 0.3, 3.8, 0x7a6a55, SOLID | BULLET);
  for (const s of [-1, 1]) { pBox(B, P, s * 1.85, 7.2, 0, 0.1, 1.0, 3.8, c, BULLET); pBox(B, P, 0, 7.2, s * 1.85, 3.8, 1.0, 0.1, c, BULLET); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) pBox(B, P, sx * 1.8, 8.3, sz * 1.8, 0.15, 2.0, 0.15, c, 0);
  pBox(B, P, 0, 9.4, 0, 4.4, 0.25, 4.4, 0x4f4a40, BULLET);
  lootSpots.push({ x: x + 1.0, y: y + 0.2, z: z + 0.5, tier: 3, route: null, bld: null });
}
function buildContainers(B, x, y, z, rot, rng) {
  const P = placer(x, y, z, rot);
  const cols = [0x2f6f9f, 0xa83a2c, 0x3f7f4a, 0xc78a2a, 0x6b6f72, 0x7b3f6a];
  const n = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    const lz = (i - (n - 1) / 2) * 2.7;
    const col = pick(cols);
    pBox(B, P, 0, 1.3, lz, 6.1, 2.6, 2.44, col, SOLID | BULLET);
    for (let k = -2; k <= 2; k++) pBox(B, P, k * 1.2, 1.3, lz + 1.24, 0.12, 2.4, 0.04, col, 0, 0.82);
    if (rng() < 0.35) pBox(B, P, 0, 3.9, lz, 6.1, 2.6, 2.44, pick(cols), SOLID | BULLET);
  }
  const [lx, lz2] = P.p(0, (n / 2) * 2.7 + 1.0);
  lootSpots.push({ x: lx, y: y + 0.15, z: lz2, tier: 3, route: null, bld: null });
}
function buildCrates(B, x, y, z, rng) {
  const P = placer(x, y, z, 0);
  const n = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) pBox(B, P, (i - (n - 1) / 2) * 1.25, 0.6, 0, 1.2, 1.2, 1.2, pick([0x8b6a3e, 0x7a5d36, 0x6b5a3a]), SOLID | BULLET);
  if (rng() < 0.5) pBox(B, P, 0, 1.8, 0, 1.2, 1.2, 1.2, 0x8b6a3e, SOLID | BULLET);
}
function buildSchool(B, R, x, y, z, rot, tier, rng) {
  // 大きな校舎 (1階のみ探索可・2つのドア)
  const P = placer(x, y, z, rot);
  const w = 30, d = 14, H = 3.4, T = 0.3, FY = 0.15;
  const wc = 0xd7cfbf;
  pBox(B, P, 0, (FY - 1.4) / 2, 0, w + 0.3, 1.4 + FY, d + 0.3, 0x7d7a72, SOLID | BULLET, 0.9);
  pBox(B, P, 0, FY + 0.01, 0, w - 2 * T, 0.02, d - 2 * T, 0x9b8466, 0);
  const DW = 1.8, DH = 2.4, zf = d / 2 - T / 2;
  const doors = [-8, 8];
  let xs = -w / 2;
  for (const dx of doors) {
    pBox(B, P, (xs + dx - DW / 2) / 2, FY + H / 2, zf, dx - DW / 2 - xs, H, T, wc, SOLID | BULLET);
    pBox(B, P, dx, FY + DH + (H - DH) / 2, zf, DW, H - DH, T, wc, SOLID | BULLET);
    xs = dx + DW / 2;
  }
  pBox(B, P, (xs + w / 2) / 2, FY + H / 2, zf, w / 2 - xs, H, T, wc, SOLID | BULLET);
  pBox(B, P, 0, FY + H / 2, -d / 2 + T / 2, w, H, T, wc, SOLID | BULLET, 0.9);
  pBox(B, P, -w / 2 + T / 2, FY + H / 2, 0, T, H, d - 2 * T, wc, SOLID | BULLET);
  pBox(B, P, w / 2 - T / 2, FY + H / 2, 0, T, H, d - 2 * T, wc, SOLID | BULLET);
  pBox(B, P, 0, FY + H + 3.4, 0, w, 6.8, d, wc, SOLID | BULLET);
  pBox(B, P, 0, FY + H + 6.95, 0, w + 0.4, 0.3, d + 0.4, 0x8b867a, 0);
  pBox(B, P, 0, FY + H + 7.6, 0, 3, 1.6, 0.4, 0x6d6a62, 0); // 時計台風
  pBox(B, P, 0, FY + H + 7.6, 0.22, 1.1, 1.1, 0.05, 0xf0ece0, 0);
  for (let f = 0; f < 3; f++) {
    const yy = FY + 1.7 + f * H;
    if (f === 0) {
      windowsOn(B, P, 'x', d / 2, -w / 2 + 1, -9.6, yy, 2.4);
      windowsOn(B, P, 'x', d / 2, -6.4, 6.4, yy, 2.4);
      windowsOn(B, P, 'x', d / 2, 9.6, w / 2 - 1, yy, 2.4);
    } else windowsOn(B, P, 'x', d / 2, -w / 2 + 1, w / 2 - 1, yy, 2.4);
    windowsOn(B, P, 'x', -d / 2, -w / 2 + 1, w / 2 - 1, yy, 2.4);
  }
  // 机(遮蔽)
  for (let i = 0; i < 6; i++) pBox(B, P, -12 + i * 4.8, FY + 0.4, -2, 1.6, 0.8, 0.8, 0x7a6a50, SOLID | BULLET);
  return registerBuilding(P, w, d, -8, null, tier, 8, rng);
}

function overlapsAny(list, x0, z0, x1, z1) {
  for (const o of list) if (x0 < o.x1 && x1 > o.x0 && z0 < o.z1 && z1 > o.z0) return true;
  return false;
}
function footprintClear(x, z, hx, hz) {
  for (let dz = -hz; dz <= hz + 0.01; dz += Math.max(2, hz / 2)) for (let dx = -hx; dx <= hx + 0.01; dx += Math.max(2, hx / 2))
    if (onRoadMask(x + dx, z + dz)) return false;
  return true;
}
function buildTown(t, B, R, rng) {
  const used = [];
  const spec = {
    village: { n: [13, 18], kinds: { house: 82, barn: 12, crates: 6 } },
    city: { n: [34, 42], kinds: { apt: 42, house: 42, wh: 8, crates: 8 } },
    factory: { n: [14, 18], kinds: { wh: 50, house: 15, tower: 10, cont: 15, crates: 10 } },
    school: { n: [9, 12], kinds: { house: 70, apt: 15, crates: 15 } },
    fort: { n: [8, 11], kinds: { barracks: 45, tower: 20, cont: 15, crates: 20 } },
    military: { n: [28, 34], kinds: { wh: 30, barracks: 30, tower: 12, cont: 18, crates: 10 } }
  }[t.type];
  const y = t.base;
  if (t.type === 'school') {
    const rot = Math.floor(rng() * 4);
    const hx = rot & 1 ? 7.5 : 15.5, hz = rot & 1 ? 15.5 : 7.5;
    let sx = t.x, sz = t.z;
    for (let k = 0; k < 30 && !footprintClear(sx, sz, hx + 4, hz + 4); k++) { sx = t.x + (rng() - 0.5) * t.r; sz = t.z + (rng() - 0.5) * t.r; }
    buildSchool(B, R, sx, y, sz, rot, t.tier, rng);
    used.push({ x0: sx - hx - 6, z0: sz - hz - 6, x1: sx + hx + 6, z1: sz + hz + 6 });
  }
  if (t.type === 'military') {
    // 外周の壁
    const s = t.r * 0.86, H = 2.6, th = 0.5, piece = 6;
    const P = placer(t.x, y, t.z, 0);
    for (const side of [-1, 1]) {
      for (let u = -s; u < s - 0.01; u += piece) {
        const c = u + piece / 2;
        if (Math.abs(c) < 7) continue; // ゲート
        if (!onRoadMask(t.x + c, t.z + side * s)) pBox(B, P, c, H / 2, side * s, piece, H, th, 0x9a978c, SOLID | BULLET, 0.95 + (Math.abs(c) % 12 < 6 ? 0 : 0.05));
        if (!onRoadMask(t.x + side * s, t.z + c)) pBox(B, P, side * s, H / 2, c, th, H, piece, 0x9a978c, SOLID | BULLET, 0.95 + (Math.abs(c) % 12 < 6 ? 0 : 0.05));
      }
    }
    used.push({ x0: t.x - 8, z0: t.z - 8, x1: t.x + 8, z1: t.z + 8 });
    buildTower(B, R, t.x + s - 5, y, t.z + s - 5, rng);
    buildTower(B, R, t.x - s + 5, y, t.z - s + 5, rng);
    used.push({ x0: t.x + s - 9, z0: t.z + s - 9, x1: t.x + s, z1: t.z + s });
    used.push({ x0: t.x - s, z0: t.z - s, x1: t.x - s + 9, z1: t.z - s + 9 });
  }
  const target = spec.n[0] + Math.floor(rng() * (spec.n[1] - spec.n[0] + 1));
  let placed = 0;
  for (let tries = 0; tries < target * 40 && placed < target; tries++) {
    const kind = weighted(spec.kinds, rng);
    let w = 0, d = 0;
    if (kind === 'house') { w = 8 + Math.floor(rng() * 4); d = 7 + Math.floor(rng() * 3); }
    else if (kind === 'barn') { w = 12; d = 9; }
    else if (kind === 'apt') { w = 12; d = 10; }
    else if (kind === 'wh') { w = 20; d = 14; }
    else if (kind === 'barracks') { w = 16; d = 7; }
    else if (kind === 'tower') { w = 4.5; d = 4.5; }
    else if (kind === 'cont') { w = 7; d = 9; }
    else if (kind === 'crates') { w = 4; d = 2; }
    const rot = Math.floor(rng() * 4);
    const fw = rot & 1 ? d : w, fd = rot & 1 ? w : d;
    const ang = rng() * TAU, rr = Math.sqrt(rng()) * (t.r * 0.74 - Math.max(fw, fd) / 2);
    const x = t.x + Math.cos(ang) * rr, z = t.z + Math.sin(ang) * rr;
    const m = kind === 'crates' ? 2 : 4.5;
    const box = { x0: x - fw / 2 - m, z0: z - fd / 2 - m, x1: x + fw / 2 + m, z1: z + fd / 2 + m };
    if (overlapsAny(used, box.x0, box.z0, box.x1, box.z1)) continue;
    if (!footprintClear(x, z, fw / 2 + 1, fd / 2 + 2)) continue;
    used.push(box); placed++;
    switch (kind) {
      case 'house': buildHouse(B, R, x, y, z, rot, w, d, t.tier, rng); break;
      case 'barn': buildWarehouse(B, R, x, y, z, rot, w, d, 4.6, t.tier, rng, true); break;
      case 'apt': buildApartment(B, R, x, y, z, rot, w, d, 2 + Math.floor(rng() * 3), t.tier, rng); break;
      case 'wh': buildWarehouse(B, R, x, y, z, rot, w, d, 6.5, t.tier, rng, false); break;
      case 'barracks': buildBarracks(B, R, x, y, z, rot, t.tier, rng); break;
      case 'tower': buildTower(B, R, x, y, z, rng); break;
      case 'cont': buildContainers(B, x, y, z, rot, rng); break;
      case 'crates': buildCrates(B, x, y, z, rng); break;
    }
  }
  // ドラム缶・木箱などの小物(遮蔽物)
  const BARREL = [0x9c2f2a, 0x2f5f8f, 0x4f6b3a, 0x6b6e70];
  for (let i = 0; i < Math.round(t.r / 22); i++) {
    const a = rng() * TAU, rr = Math.sqrt(rng()) * t.r * 0.72;
    const x = t.x + Math.cos(a) * rr, z = t.z + Math.sin(a) * rr;
    if (overlapsAny(used, x - 2, z - 2, x + 2, z + 2) || onRoadMask(x, z)) continue;
    used.push({ x0: x - 2.5, z0: z - 2.5, x1: x + 2.5, z1: z + 2.5 });
    const P = placer(x, y, z, 0);
    if (rng() < 0.55) {
      const n = 2 + Math.floor(rng() * 3), c = BARREL[Math.floor(rng() * BARREL.length)];
      for (let k = 0; k < n; k++) pBox(B, P, (k % 2) * 0.75 - 0.35, 0.48, Math.floor(k / 2) * 0.75 - 0.35, 0.62, 0.95, 0.62, c, SOLID | BULLET, 0.9 + (k % 2) * 0.1);
    } else buildCrates(B, x, y, z, rng);
  }
  // 街中のちょっとした物資
  for (let i = 0; i < Math.round(t.r / 40); i++) {
    const a = rng() * TAU, rr = rng() * t.r * 0.7;
    const x = t.x + Math.cos(a) * rr, z = t.z + Math.sin(a) * rr;
    if (overlapsAny(used, x - 1, z - 1, x + 1, z + 1)) continue;
    lootSpots.push({ x, y: y + 0.05, z, tier: t.tier, route: null, bld: null });
  }
}

// ================= テクスチャ生成 =================
function tileNoise(x, y, p, s) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const m = (v) => ((v % p) + p) % p;
  const a = hash2(m(ix), m(iy), s), b = hash2(m(ix + 1), m(iy), s), c = hash2(m(ix), m(iy + 1), s), d = hash2(m(ix + 1), m(iy + 1), s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function makeDetailTexture() {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = tileNoise(x / 32, y / 32, 8, 7) * 0.5 + tileNoise(x / 8, y / 8, 32, 9) * 0.3 + Math.random() * 0.2;
    const v = Math.round(255 * (0.78 + n * 0.22));
    const k = (y * S + x) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = v; img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}
function makeWaterNormal() {
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(S, S);
  const hgt = (x, y) => tileNoise(x / 16, y / 16, 8, 3) + tileNoise(x / 6, y / 6, Math.round(S / 6), 5) * 0.5;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = hgt(x + 1, y) - hgt(x - 1, y), dy = hgt(x, y + 1) - hgt(x, y - 1);
    const nx = -dx * 2, ny = -dy * 2, nz = 1, l = Math.hypot(nx, ny, nz);
    const k = (y * S + x) * 4;
    img.data[k] = (nx / l * 0.5 + 0.5) * 255; img.data[k + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[k + 2] = (nz / l * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function makeCloudTexture() {
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  for (let i = 0; i < 14; i++) {
    const x = S / 2 + (Math.random() - 0.5) * S * 0.5, y = S / 2 + (Math.random() - 0.5) * S * 0.25, r = S * (0.15 + Math.random() * 0.18);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  }
  return new THREE.CanvasTexture(cv);
}

// ================= マテリアル =================
const MAT = {};
function makeMaterials() {
  MAT.detail = makeDetailTexture();
  MAT.terrain = new THREE.MeshLambertMaterial({ vertexColors: true, map: MAT.detail });
  MAT.building = new THREE.MeshLambertMaterial({ vertexColors: true });
  MAT.roof = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  MAT.road = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 });
  MAT.trunk = new THREE.MeshLambertMaterial({ color: 0x5a4632 });
  MAT.leaf = new THREE.MeshLambertMaterial({ color: 0xffffff });
  MAT.rock = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  MAT.waterNormal = makeWaterNormal();
  MAT.waterNormal.repeat.set(900, 900);
  MAT.water = new THREE.MeshPhongMaterial({
    color: 0x2a6a86, specular: 0xbfd8e6, shininess: 80, transparent: true, opacity: 0.84,
    normalMap: MAT.waterNormal, normalScale: new THREE.Vector2(0.6, 0.6)
  });
}

// ================= 地形メッシュ =================
let terrainMesh = null, waterMesh = null;
const _col = [0, 0, 0];
function terrainColor(x, z, h, ny, out) {
  let r, g, b;
  const n1 = fbm(x * 0.012, z * 0.012, 2, SEED + 60), n2 = fbm(x * 0.003 + 5, z * 0.003, 2, SEED + 61);
  if (h < 0.9) {
    const t = smooth(-8, 0.9, h);
    r = lerp(0.36, 0.78, t); g = lerp(0.37, 0.72, t); b = lerp(0.3, 0.52, t);
  } else {
    r = lerp(0.37, 0.27, n1); g = lerp(0.52, 0.42, n1); b = lerp(0.21, 0.16, n1);
    const dry = smooth(0.56, 0.72, n2) * 0.8;
    r = lerp(r, 0.6, dry); g = lerp(g, 0.57, dry); b = lerp(b, 0.31, dry);
    const f = forestD(x, z) * 0.7;
    r = lerp(r, 0.2, f); g = lerp(g, 0.32, f); b = lerp(b, 0.13, f);
    const beach = 1 - smooth(0.9, 2.8, h);
    r = lerp(r, 0.78, beach); g = lerp(g, 0.72, beach); b = lerp(b, 0.52, beach);
    const rk = clamp(smooth(0.86, 0.7, ny) + smooth(80, 115, h) * 0.6, 0, 1);
    r = lerp(r, 0.48, rk); g = lerp(g, 0.46, rk); b = lerp(b, 0.42, rk);
  }
  for (const t of TOWNS) {
    const d = Math.hypot(x - t.x, z - t.z);
    if (d < t.r * 1.1) { const k = (1 - smooth(t.r * 0.6, t.r * 1.1, d)) * 0.6; r = lerp(r, 0.55, k); g = lerp(g, 0.52, k); b = lerp(b, 0.43, k); }
  }
  out[0] = r; out[1] = g; out[2] = b;
}
function buildTerrainMesh() {
  const pos = new Float32Array(HN * HN * 3), col = new Float32Array(HN * HN * 3), uv = new Float32Array(HN * HN * 2);
  for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) {
    const k = j * HN + i, x = -HALF + i * CELL, z = -HALF + j * CELL;
    pos[k * 3] = x; pos[k * 3 + 1] = heights[k]; pos[k * 3 + 2] = z;
    uv[k * 2] = x / 7; uv[k * 2 + 1] = z / 7;
  }
  const idx = new Uint32Array(SEG * SEG * 6);
  let n = 0;
  for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++) {
    const v00 = j * HN + i, v10 = v00 + 1, v01 = v00 + HN, v11 = v01 + 1;
    idx[n++] = v00; idx[n++] = v01; idx[n++] = v10;
    idx[n++] = v10; idx[n++] = v01; idx[n++] = v11;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  const nor = g.attributes.normal.array;
  for (let k = 0; k < HN * HN; k++) {
    terrainColor(pos[k * 3], pos[k * 3 + 2], pos[k * 3 + 1], nor[k * 3 + 1], _col);
    col[k * 3] = _col[0]; col[k * 3 + 1] = _col[1]; col[k * 3 + 2] = _col[2];
  }
  // 道路沿いを土色に
  for (const r of roads) for (const [x, z] of r.pts) {
    const i0 = Math.round((x + HALF) / CELL), j0 = Math.round((z + HALF) / CELL);
    for (let j = j0 - 1; j <= j0 + 1; j++) for (let i = i0 - 1; i <= i0 + 1; i++) {
      if (i < 0 || j < 0 || i >= HN || j >= HN) continue;
      const k = j * HN + i, d = Math.hypot(pos[k * 3] - x, pos[k * 3 + 2] - z);
      if (d > 16) continue;
      const w = (1 - d / 16) * 0.45;
      col[k * 3] = lerp(col[k * 3], 0.47, w); col[k * 3 + 1] = lerp(col[k * 3 + 1], 0.43, w); col[k * 3 + 2] = lerp(col[k * 3 + 2], 0.34, w);
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  terrainMesh = new THREE.Mesh(g, MAT.terrain);
  terrainMesh.receiveShadow = true;
  scene.add(terrainMesh);
  waterMesh = new THREE.Mesh(new THREE.PlaneGeometry(MAP * 5, MAP * 5), MAT.water);
  waterMesh.rotation.x = -Math.PI / 2;
  waterMesh.position.y = 0;
  scene.add(waterMesh);
}

// ================= 道路・橋のメッシュ =================
function onBridge(x, z) {
  for (const b of bridges) if (Math.abs(x - b.x) <= b.w / 2 + 1 && z >= b.z0 && z <= b.z1) return b;
  return null;
}
function buildRoadMesh() {
  const B = new GeoBuilder();
  const asphalt = COL(0x4d4b47), line = COL(0xd9d3c0), edge = COL(0x6a6457);
  for (const r of roads) {
    const P = r.pts, hw = r.w / 2;
    const L = [], Rr = [];
    for (let i = 0; i < P.length; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
      let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const px = -dz, pz = dx;
      const [x, z] = P[i];
      const br = onBridge(x, z);
      const yl = br ? bridgeY(br, z) + 0.05 : terrainH(x + px * hw, z + pz * hw) + 0.2;
      const yr = br ? bridgeY(br, z) + 0.05 : terrainH(x - px * hw, z - pz * hw) + 0.2;
      L.push([x + px * hw, yl, z + pz * hw]); Rr.push([x - px * hw, yr, z - pz * hw]);
    }
    for (let i = 0; i < P.length - 1; i++) {
      B.face(L[i], L[i + 1], Rr[i + 1], Rr[i], asphalt, 0, 1, 0, 0.94 + ((i * 7) % 5) * 0.015);
      if (i % 2 === 0) {
        const m0 = [(L[i][0] + Rr[i][0]) / 2, (L[i][1] + Rr[i][1]) / 2 + 0.03, (L[i][2] + Rr[i][2]) / 2];
        const m1 = [(L[i + 1][0] + Rr[i + 1][0]) / 2, (L[i + 1][1] + Rr[i + 1][1]) / 2 + 0.03, (L[i + 1][2] + Rr[i + 1][2]) / 2];
        const dx = m1[0] - m0[0], dz = m1[2] - m0[2], l = Math.hypot(dx, dz) || 1;
        const px = -dz / l * 0.1, pz = dx / l * 0.1;
        const e = [m0[0] + dx * 0.5, m0[1] + (m1[1] - m0[1]) * 0.5, m0[2] + dz * 0.5];
        B.face([m0[0] + px, m0[1], m0[2] + pz], [e[0] + px, e[1], e[2] + pz], [e[0] - px, e[1], e[2] - pz], [m0[0] - px, m0[1], m0[2] - pz], line, 0, 1, 0);
      }
    }
    void edge;
  }
  const m = B.mesh(MAT.road); m.castShadow = false;
  scene.add(m);
}
function buildBridges() {
  const B = new GeoBuilder();
  const deck = COL(0x6f6d68), rail = COL(0x8f8b84), pil = COL(0x76736c);
  for (const b of bridges) {
    b.y0 = terrainH(b.x, b.z0) + 0.15; b.y1 = terrainH(b.x, b.z1) + 0.15;
    const hw = b.w / 2;
    const n = Math.ceil((b.z1 - b.z0) / 8);
    for (let i = 0; i < n; i++) {
      const za = b.z0 + (b.z1 - b.z0) * i / n, zb = b.z0 + (b.z1 - b.z0) * (i + 1) / n;
      const ya = bridgeY(b, za), yb = bridgeY(b, zb);
      B.face([b.x - hw, ya, za], [b.x + hw, ya, za], [b.x + hw, yb, zb], [b.x - hw, yb, zb], deck, 0, 1, 0);
      B.face([b.x - hw, ya - 1.2, za], [b.x + hw, ya - 1.2, za], [b.x + hw, yb - 1.2, zb], [b.x - hw, yb - 1.2, zb], deck, 0, -1, 0, 0.6);
      for (const s of [-1, 1]) {
        const x = b.x + s * hw;
        B.face([x, ya - 1.2, za], [x, ya, za], [x, yb, zb], [x, yb - 1.2, zb], deck, s, 0, 0, 0.85);
        const rx = b.x + s * (hw + 0.1), ym = Math.min(ya, yb), yM = Math.max(ya, yb);
        B.box(rx, (ya + yb) / 2 + 0.55, (za + zb) / 2, 0.22, 1.1 + (yM - ym), zb - za, rail, 0.95);
        addCollider(rx - 0.15, ym - 0.5, za, rx + 0.15, yM + 1.1, zb, SOLID | BULLET);
      }
      addCollider(b.x - hw, Math.min(ya, yb) - 1.2, za, b.x + hw, Math.min(ya, yb) - 0.05, zb, BULLET);
      if (i % 6 === 3) {
        const zc = (za + zb) / 2, yc = bridgeY(b, zc), sea = terrainH(b.x, zc);
        if (sea < yc - 3) for (const s of [-1, 1]) {
          const h = yc - 1.2 - sea + 2;
          B.box(b.x + s * (hw - 1), yc - 1.2 - h / 2, zc, 1.2, h, 1.6, pil, 0.9);
          addCollider(b.x + s * (hw - 1) - 0.6, sea - 2, zc - 0.8, b.x + s * (hw - 1) + 0.6, yc - 1.2, zc + 0.8, SOLID | BULLET);
        }
      }
    }
  }
  if (!B.empty) scene.add(B.mesh(MAT.building));
}

// ================= 建物の配置 =================
const mapRects = [];
const cityMeshes = [];
function buildAllStructures(rng) {
  for (const t of TOWNS) {
    const B = new GeoBuilder(), R = new GeoBuilder();
    buildTown(t, B, R, rng);
    if (!B.empty) { const m = B.mesh(MAT.building); scene.add(m); cityMeshes.push(m); }
    if (!R.empty) { const m = R.mesh(MAT.roof); scene.add(m); cityMeshes.push(m); }
  }
  // 郊外の家(4区画に分けてまとめる)
  const groups = [0, 1, 2, 3].map(() => ({ B: new GeoBuilder(), R: new GeoBuilder() }));
  for (const s of SITES) {
    const g = groups[(s.x > 0 ? 1 : 0) + (s.z > 0 ? 2 : 0)];
    const rot = Math.floor(rng() * 4);
    const y = s.base;
    if (rng() < 0.22) buildWarehouse(g.B, g.R, s.x, y, s.z, rot, 12, 9, 4.6, 1, rng, true);
    else buildHouse(g.B, g.R, s.x, y, s.z, rot, 8 + Math.floor(rng() * 3), 7 + Math.floor(rng() * 2), 1, rng);
    if (rng() < 0.5) buildCrates(g.B, s.x + 8, y, s.z + 6, rng);
  }
  buildScatter(groups, rng);
  for (const g of groups) {
    if (!g.B.empty) { const m = g.B.mesh(MAT.building); scene.add(m); cityMeshes.push(m); }
    if (!g.R.empty) { const m = g.R.mesh(MAT.roof); scene.add(m); cityMeshes.push(m); }
  }
  for (const b of buildings) mapRects.push([b.x0, b.z0, b.x1, b.z1]);
}

// ================= 野外の遮蔽物(廃墟の壁・干し草・丸太・電柱) =================
const occ = new Set();
const occKey = (x, z) => Math.floor((x + HALF) / 6) * 10000 + Math.floor((z + HALF) / 6);
function markOcc(x, z, r) { for (let dz = -r; dz <= r; dz += 3) for (let dx = -r; dx <= r; dx += 3) occ.add(occKey(x + dx, z + dz)); }
function buildScatter(groups, rng) {
  const gOf = (x, z) => groups[(x > 0 ? 1 : 0) + (z > 0 ? 2 : 0)];
  const nearFlat = (x, z, m) => { for (const f of FLATS) if (Math.hypot(x - f.x, z - f.z) < f.r1 + m) return true; return false; };
  const flatOK = (x, z, r) => {
    const h = terrainH(x, z); if (h < 2 || h > 120) return null;
    let mn = h, mx = h;
    for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) { const hh = terrainH(x + dx, z + dz); mn = Math.min(mn, hh); mx = Math.max(mx, hh); }
    return mx - mn > 2.2 ? null : { h, mn };
  };
  const counts = { ruin: 180, hay: 150, logs: 100 };
  for (const kind in counts) {
    let n = 0, tries = 0;
    while (n < counts[kind] && tries < counts[kind] * 50) {
      tries++;
      const x = (rng() * 2 - 1) * 2850, z = (rng() * 2 - 1) * 2850;
      if (onRoadMask(x, z) || nearFlat(x, z, 12) || onBridge(x, z) || occ.has(occKey(x, z))) continue;
      const fd = forestD(x, z);
      if (kind === 'logs' && fd < 0.25) continue;
      if (kind === 'hay' && fd > 0.4) continue;
      const f = flatOK(x, z, 4); if (!f) continue;
      const g = gOf(x, z), P = placer(x, f.h, z, Math.floor(rng() * 4));
      const sink = f.h - f.mn + 0.4;
      if (kind === 'ruin') {
        const L1 = 4 + rng() * 4, L2 = 3 + rng() * 3, H = 1.5 + rng() * 1.2, T = 0.55;
        const col = [0x8a877c, 0x7d7a70, 0x958f80][Math.floor(rng() * 3)];
        pBox(g.B, P, 0, (H - sink) / 2, 0, L1, H + sink, T, col, SOLID | BULLET);
        pBox(g.B, P, -L1 / 2 + T / 2, (H * 0.8 - sink) / 2, L2 / 2, T, H * 0.8 + sink, L2, col, SOLID | BULLET, 0.92);
        if (rng() < 0.5) pBox(g.B, P, L1 * 0.25, (H * 0.5 - sink) / 2, -1.4, 1.6, H * 0.5 + sink, T, col, SOLID | BULLET, 0.88);
        if (rng() < 0.35) { const [lx, lz] = P.p(-L1 / 4 + 0.8, L2 / 3); lootSpots.push({ x: lx, y: terrainH(lx, lz) + 0.05, z: lz, tier: 1, route: null, bld: null }); }
        mapRects.push([x - 3, z - 3, x + 3, z + 3]);
      } else if (kind === 'hay') {
        const k = 2 + Math.floor(rng() * 3);
        for (let i = 0; i < k; i++) {
          const lx = (i - (k - 1) / 2) * 1.7, c = [0xc9a85a, 0xbfa055, 0xd4b468][i % 3];
          pBox(g.B, P, lx, (1.3 - sink) / 2, 0, 1.6, 1.3 + sink, 1.3, c, SOLID | BULLET);
          if (rng() < 0.3) pBox(g.B, P, lx, 1.95, 0, 1.6, 1.3, 1.3, 0xc4a35a, SOLID | BULLET, 0.95);
        }
      } else {
        pBox(g.B, P, 0, (1.0 - sink) / 2, 0, 3.6, 1.0 + sink, 1.4, 0x6b4a2e, SOLID | BULLET);
        pBox(g.B, P, 0, 1.4, 0, 3.4, 0.8, 1.0, 0x5d4128, SOLID | BULLET, 0.92);
      }
      markOcc(x, z, 7);
      n++;
    }
  }
  // 道路沿いの電柱
  for (const r of roads) {
    let acc = 0;
    for (let i = 1; i < r.pts.length; i++) {
      const [ax, az] = r.pts[i - 1], [bx, bz] = r.pts[i];
      const l = Math.hypot(bx - ax, bz - az) || 1;
      acc += l; if (acc < 70) continue; acc = 0;
      const px = -(bz - az) / l, pz = (bx - ax) / l;
      const x = bx + px * 7.5, z = bz + pz * 7.5;
      if (onBridge(x, z) || nearFlat(x, z, -25)) continue;
      const h = terrainH(x, z); if (h < 1) continue;
      const g = gOf(x, z), wood = COL(0x5a4632);
      g.B.box(x, h + 3.9, z, 0.24, 8.2, 0.24, wood);
      if (Math.abs(px) > Math.abs(pz)) g.B.box(x, h + 7.4, z, 1.8, 0.14, 0.14, wood); else g.B.box(x, h + 7.4, z, 0.14, 0.14, 1.8, wood);
      addProp(x, z, 0.22, h - 1, h + 8, 0);
      markOcc(x, z, 3);
    }
  }
}

// ================= 樹木・岩・茂み (チャンク分割インスタンス) =================
const CH = 8, CHS = MAP / CH;
const chunks = [];
function makeTreeGeos() {
  const pineLeaf = mergeGeos([
    new THREE.ConeGeometry(2.4, 4.2, 7).translate(0, 4.3, 0),
    new THREE.ConeGeometry(1.9, 3.6, 7).translate(0, 6.4, 0),
    new THREE.ConeGeometry(1.3, 3.0, 7).translate(0, 8.3, 0)
  ]);
  const pineTrunk = new THREE.CylinderGeometry(0.16, 0.26, 5, 5).translate(0, 2.5, 0);
  const broadLeaf = mergeGeos([
    new THREE.IcosahedronGeometry(2.7, 0).translate(0, 6.0, 0),
    new THREE.IcosahedronGeometry(2.0, 0).translate(1.3, 5.2, 0.6),
    new THREE.IcosahedronGeometry(1.8, 0).translate(-1.1, 6.6, -0.8)
  ]);
  const broadTrunk = new THREE.CylinderGeometry(0.2, 0.32, 5, 5).translate(0, 2.5, 0);
  const rock = new THREE.DodecahedronGeometry(1, 0);
  const bush = mergeGeos([new THREE.IcosahedronGeometry(0.9, 0).translate(0, 0.55, 0), new THREE.IcosahedronGeometry(0.65, 0).translate(0.6, 0.45, 0.2)]);
  return { pineLeaf, pineTrunk, broadLeaf, broadTrunk, rock, bush };
}
function buildProps(rng) {
  const G = makeTreeGeos();
  const lists = [];
  for (let i = 0; i < CH * CH; i++) lists.push({ pt: [], pl: [], bt: [], bl: [], rk: [], bu: [] });
  const ci = (x, z) => clamp(Math.floor((z + HALF) / CHS), 0, CH - 1) * CH + clamp(Math.floor((x + HALF) / CHS), 0, CH - 1);
  const nearFlat = (x, z, m) => { for (const f of FLATS) { const dx = x - f.x, dz = z - f.z; if (dx * dx + dz * dz < (f.r1 + m) * (f.r1 + m)) return true; } return false; };
  const okSpot = (x, z, h) => {
    if (h < 1.8 || h > 150) return false;
    if (onRoadMask(x, z) || nearFlat(x, z, 4) || onBridge(x, z) || occ.has(occKey(x, z))) return false;
    return Math.abs(terrainH(x + 3, z) - terrainH(x - 3, z)) + Math.abs(terrainH(x, z + 3) - terrainH(x, z - 3)) < 5;
  };
  const col = new THREE.Color();
  let trees = 0, att = 0;
  while (trees < 12500 && att < 240000) {
    att++;
    const x = (rng() * 2 - 1) * 2900, z = (rng() * 2 - 1) * 2900;
    const fd = forestD(x, z);
    if (rng() > 0.03 + fd * 0.97) continue;
    const h = terrainH(x, z);
    if (!okSpot(x, z, h)) continue;
    const s = 0.75 + rng() * 0.65, rot = rng() * TAU;
    const pine = rng() < 0.68;
    const L = lists[ci(x, z)];
    if (pine) {
      col.setHSL(0.27 + rng() * 0.06, 0.42 + rng() * 0.15, 0.2 + rng() * 0.08);
      L.pt.push([x, h - 0.2, z, s, rot]); L.pl.push([x, h - 0.2, z, s, rot, col.r, col.g, col.b]);
      addProp(x, z, 0.28 * s, h - 1, h + 9 * s, 0);
    } else {
      const autumn = rng() < 0.1;
      col.setHSL(autumn ? 0.1 + rng() * 0.04 : 0.22 + rng() * 0.07, autumn ? 0.55 : 0.45, autumn ? 0.42 : 0.28 + rng() * 0.08);
      L.bt.push([x, h - 0.2, z, s, rot]); L.bl.push([x, h - 0.2, z, s, rot, col.r, col.g, col.b]);
      addProp(x, z, 0.32 * s, h - 1, h + 8 * s, 0);
    }
    trees++;
  }
  let rocks = 0; att = 0;
  while (rocks < 2000 && att < 45000) {
    att++;
    const x = (rng() * 2 - 1) * 2900, z = (rng() * 2 - 1) * 2900;
    const h = terrainH(x, z);
    if (h < 1 || onRoadMask(x, z) || nearFlat(x, z, 6) || onBridge(x, z) || occ.has(occKey(x, z))) continue;
    const ny = terrainNormalY(x, z);
    if (rng() > 0.25 + (1 - ny) * 3) continue;
    const s = 0.6 + Math.pow(rng(), 2) * 2.4;
    const v = 0.42 + rng() * 0.14; col.setRGB(v, v * 0.98, v * 0.93);
    lists[ci(x, z)].rk.push([x, h - s * 0.25, z, s, rng() * TAU, col.r, col.g, col.b, 0.65 + rng() * 0.35]);
    addProp(x, z, s * 0.85, h - 2, h + s * 0.6, 1);
    rocks++;
  }
  let bushes = 0; att = 0;
  while (bushes < 6500 && att < 95000) {
    att++;
    const x = (rng() * 2 - 1) * 2900, z = (rng() * 2 - 1) * 2900;
    const fd = forestD(x, z);
    if (rng() > 0.12 + fd * 0.6) continue;
    const h = terrainH(x, z);
    if (!okSpot(x, z, h)) continue;
    const s = 0.8 + rng() * 0.7;
    col.setHSL(0.24 + rng() * 0.08, 0.45, 0.22 + rng() * 0.08);
    lists[ci(x, z)].bu.push([x, h - 0.1, z, s, rng() * TAU, col.r, col.g, col.b]);
    addProp(x, z, 1.0 * s, h - 0.5, h + 1.25 * s, 2);
    bushes++;
  }
  const dummy = new THREE.Object3D();
  const make = (geo, mat, arr, colored, cast) => {
    if (!arr.length) return null;
    const m = new THREE.InstancedMesh(geo, mat, arr.length);
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i];
      dummy.position.set(a[0], a[1], a[2]); dummy.rotation.set(0, a[4], 0);
      const sy = a[8] !== undefined ? a[8] : 1;
      dummy.scale.set(a[3], a[3] * sy, a[3]); dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      if (colored) m.setColorAt(i, col.setRGB(a[5], a[6], a[7]));
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.frustumCulled = false; m.castShadow = cast; m.receiveShadow = true;
    return m;
  };
  for (let j = 0; j < CH; j++) for (let i = 0; i < CH; i++) {
    const L = lists[j * CH + i];
    const g = new THREE.Group();
    const add = (m) => { if (m) g.add(m); };
    add(make(G.pineTrunk, MAT.trunk, L.pt, false, true));
    add(make(G.pineLeaf, MAT.leaf, L.pl, true, true));
    add(make(G.broadTrunk, MAT.trunk, L.bt, false, true));
    add(make(G.broadLeaf, MAT.leaf, L.bl, true, true));
    add(make(G.rock, MAT.rock, L.rk, true, true));
    add(make(G.bush, MAT.leaf, L.bu, true, false));
    const cx = -HALF + (i + 0.5) * CHS, cz = -HALF + (j + 0.5) * CHS;
    const sphere = new THREE.Sphere(new THREE.Vector3(cx, terrainH(cx, cz) + 20, cz), CHS * 0.75);
    scene.add(g);
    chunks.push({ g, sphere, cx, cz });
  }
}

// 雲
const clouds = [];
function buildClouds() {
  const tex = makeCloudTexture();
  for (let i = 0; i < 46; i++) {
    const m = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.55 + Math.random() * 0.3, depthWrite: false, fog: false });
    const s = new THREE.Sprite(m);
    const sc = 260 + Math.random() * 420;
    s.scale.set(sc, sc * 0.45, 1);
    s.position.set((Math.random() * 2 - 1) * 4200, 760 + Math.random() * 260, (Math.random() * 2 - 1) * 4200);
    s.renderOrder = -5;
    scene.add(s); clouds.push(s);
  }
}

// ================= マップ画像 =================
const MAPRES = 1024;
let mapCanvas = null;
async function buildMapImage(progress) {
  mapCanvas = document.createElement('canvas'); mapCanvas.width = mapCanvas.height = MAPRES;
  const ctx = mapCanvas.getContext('2d');
  const img = ctx.createImageData(MAPRES, MAPRES);
  const sc = MAP / MAPRES;
  for (let py = 0; py < MAPRES; py++) {
    for (let px = 0; px < MAPRES; px++) {
      const x = -HALF + (px + 0.5) * sc, z = -HALF + (py + 0.5) * sc;
      const h = terrainH(x, z);
      let r, g, b;
      if (h < 0) {
        const t = smooth(-22, 0, h);
        r = lerp(0.13, 0.33, t); g = lerp(0.3, 0.55, t); b = lerp(0.42, 0.62, t);
      } else {
        const sh = clamp(1 + (terrainH(x - 8, z - 8) - h) * 0.07, 0.7, 1.25);
        const f = forestD(x, z);
        r = lerp(0.5, 0.33, f); g = lerp(0.6, 0.47, f); b = lerp(0.36, 0.27, f);
        const beach = 1 - smooth(0.4, 2.6, h);
        r = lerp(r, 0.83, beach); g = lerp(g, 0.78, beach); b = lerp(b, 0.6, beach);
        const hi = smooth(60, 120, h);
        r = lerp(r, 0.62, hi); g = lerp(g, 0.6, hi); b = lerp(b, 0.54, hi);
        r *= sh; g *= sh; b *= sh;
      }
      const k = (py * MAPRES + px) * 4;
      img.data[k] = clamp(r * 255, 0, 255); img.data[k + 1] = clamp(g * 255, 0, 255); img.data[k + 2] = clamp(b * 255, 0, 255); img.data[k + 3] = 255;
    }
    if (py % 128 === 127) { progress && progress(py / MAPRES); await wait(); }
  }
  ctx.putImageData(img, 0, 0);
  const toPx = (v) => (v + HALF) / sc;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const pass of [0, 1]) {
    ctx.strokeStyle = pass ? '#e7dcc0' : 'rgba(60,50,35,0.55)';
    ctx.lineWidth = pass ? 1.8 : 3.4;
    for (const r of roads) {
      ctx.beginPath();
      r.pts.forEach(([x, z], i) => (i ? ctx.lineTo(toPx(x), toPx(z)) : ctx.moveTo(toPx(x), toPx(z))));
      ctx.stroke();
    }
    for (const b of bridges) { ctx.beginPath(); ctx.moveTo(toPx(b.x), toPx(b.z0)); ctx.lineTo(toPx(b.x), toPx(b.z1)); ctx.stroke(); }
  }
  ctx.fillStyle = '#5b544b';
  for (const [x0, z0, x1, z1] of mapRects) ctx.fillRect(toPx(x0), toPx(z0), Math.max(1.5, (x1 - x0) / sc), Math.max(1.5, (z1 - z0) / sc));
  // グリッド(1km)
  ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 1;
  for (let v = -HALF; v <= HALF; v += 1000) {
    ctx.beginPath(); ctx.moveTo(toPx(v), 0); ctx.lineTo(toPx(v), MAPRES); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, toPx(v)); ctx.lineTo(MAPRES, toPx(v)); ctx.stroke();
  }
}

// ================= アイテム定義 =================
const AMMO = {
  '9mm': { name: '9mm弾', color: 0xe0b23a, stack: 30, max: 240 },
  '556': { name: '5.56mm弾', color: 0x5fa34a, stack: 30, max: 240 },
  '762': { name: '7.62mm弾', color: 0xd06a2c, stack: 30, max: 210 },
  '12g': { name: '12ゲージ', color: 0xb83a3a, stack: 10, max: 60 }
};
const WEAPONS = {
  pistol: { name: 'P-92', cls: 'ハンドガン', ammo: '9mm', mag: 15, dmg: 32, rpm: 420, auto: false, vel: 380, hip: 2.0, ads: 0.35, recoil: 1.0, reload: 1.8, range: 70, slot: 2, color: 0x3a3a3a, head: 2.1 },
  smg: { name: 'UZ-9', cls: 'SMG', ammo: '9mm', mag: 32, dmg: 25, rpm: 860, auto: true, vel: 400, hip: 1.5, ads: 0.32, recoil: 0.32, reload: 2.0, range: 90, color: 0x2f3431, head: 2.0 },
  shotgun: { name: 'S-12', cls: 'ショットガン', ammo: '12g', mag: 5, dmg: 22, pellets: 9, rpm: 75, auto: false, vel: 360, hip: 3.0, ads: 2.5, recoil: 2.8, reload: 0.5, shell: true, range: 30, color: 0x6b4a2e, head: 1.5 },
  ar556: { name: 'VX-4', cls: 'アサルトライフル', ammo: '556', mag: 30, dmg: 40, rpm: 700, auto: true, vel: 880, hip: 1.3, ads: 0.12, recoil: 0.42, reload: 2.3, range: 260, color: 0x2b2e2c, head: 2.35 },
  ar762: { name: 'KR-47', cls: 'アサルトライフル', ammo: '762', mag: 30, dmg: 47, rpm: 600, auto: true, vel: 715, hip: 1.5, ads: 0.17, recoil: 0.62, reload: 2.6, range: 230, color: 0x5a3b22, head: 2.35 },
  dmr: { name: 'MK-14S', cls: 'マークスマン', ammo: '762', mag: 10, dmg: 58, rpm: 330, auto: false, vel: 850, hip: 1.8, ads: 0.05, recoil: 1.2, reload: 3.0, range: 520, color: 0x4b5240, head: 2.35 },
  sniper: { name: 'BOLT-98', cls: 'スナイパー', ammo: '762', mag: 5, dmg: 85, rpm: 42, auto: false, bolt: true, vel: 760, hip: 2.6, ads: 0.0, recoil: 2.2, reload: 3.4, range: 900, color: 0x6a4a2c, head: 2.5 }
};
const HEALS = {
  bandage: { name: '包帯', time: 3.0, add: 10, cap: 75, color: 0xeae2cf, qty: 5, keyN: '4' },
  firstaid: { name: '救急キット', time: 6.0, add: 75, cap: 75, color: 0xf2f2f2, qty: 1, keyN: '5' },
  medkit: { name: '医療キット', time: 8.0, add: 100, cap: 100, color: 0xd94848, qty: 1, keyN: '6' },
  drink: { name: 'エナジードリンク', time: 4.0, boost: 40, color: 0x3a8fd9, qty: 1, keyN: '7' }
};
const HEAL_ORDER = ['bandage', 'firstaid', 'medkit', 'drink'];
const SCOPES = {
  reddot: { name: 'ドットサイト', zoom: 1.45, rank: 1 },
  x2: { name: '2倍スコープ', zoom: 2.0, rank: 2 },
  x4: { name: '4倍スコープ', zoom: 4.0, overlay: true, rank: 3 },
  x8: { name: '8倍スコープ', zoom: 8.0, overlay: true, rank: 4 }
};
const ARMOR_RED = [0, 0.3, 0.4, 0.55];
const VEST_DUR = [0, 200, 220, 250];
const HELM_DUR = [0, 80, 150, 230];
const WEAPON_POOL = {
  1: { pistol: 30, smg: 26, shotgun: 20, ar556: 15, ar762: 7, dmr: 2 },
  2: { pistol: 12, smg: 22, shotgun: 14, ar556: 25, ar762: 16, dmr: 7, sniper: 4 },
  3: { smg: 12, shotgun: 8, ar556: 30, ar762: 25, dmr: 13, sniper: 12 }
};
const ARMOR_POOL = { 1: { 1: 70, 2: 28, 3: 2 }, 2: { 1: 45, 2: 45, 3: 10 }, 3: { 1: 20, 2: 55, 3: 25 } };
function itemLabel(it) {
  switch (it.kind) {
    case 'weapon': return WEAPONS[it.key].name + (it.scope ? ' +' + SCOPES[it.scope].name : '');
    case 'ammo': return AMMO[it.key].name + ' ×' + it.qty;
    case 'heal': return HEALS[it.key].name + (it.qty > 1 ? ' ×' + it.qty : '');
    case 'vest': return 'ベスト Lv' + it.key;
    case 'helmet': return 'ヘルメット Lv' + it.key;
    case 'scope': return SCOPES[it.key].name;
  }
  return '';
}

// ================= ワールド生成 =================
let worldReady = false;
async function generateWorld(progress) {
  const rng = mulberry32(SEED);
  progress(0.02, '島の輪郭を測量中…');
  await wait(30);
  placeTowns();
  buildRoadGraph(rng);
  placeSites(rng);
  progress(0.08, '地形を生成中…');
  await wait();
  for (let j = 0; j < HN; j++) {
    for (let i = 0; i < HN; i++) heights[j * HN + i] = finalHeight(-HALF + i * CELL, -HALF + j * CELL);
    if (j % 30 === 29) { progress(0.08 + 0.32 * j / HN, '地形を生成中…'); await wait(); }
  }
  progress(0.42, '大地を描画中…');
  await wait();
  makeMaterials();
  buildTerrainMesh();
  buildBridges();
  buildRoadMesh();
  progress(0.52, '街を建設中…');
  await wait();
  buildAllStructures(rng);
  progress(0.64, '森を植えています…');
  await wait();
  buildProps(rng);
  buildClouds();
  progress(0.78, '地図を作成中…');
  await wait();
  await buildMapImage((p) => progress(0.78 + p * 0.18, '地図を作成中…'));
  worldReady = true;
  progress(1, '準備完了');
}

// ================= ゲーム全体の状態 =================
const soldiers = [];
const bots = [];
let player = null;
let aliveCount = TOTAL;
const game = { state: 'boot', time: 0, paused: false, matchTime: 0, damageDealt: 0, rank: 0, surviveTime: 0, ended: false };

// ================= ルート(戦利品) =================
const loot = [];
const LG = 16, LGN = Math.ceil(MAP / LG);
let lootGrid = new Array(LGN * LGN);
const lgi = (v) => clamp(Math.floor((v + HALF) / LG), 0, LGN - 1);
let lootDirty = true;
function addLoot(kind, key, qty, x, y, z, extra) {
  if (NET.mode === 'client' && !NET.applying) {
    // クライアントは物資を直接置けない：ホストに頼む
    NET.send({ t: 'drop', k: kind, y: key, q: qty, x: r2(x), h: r2(y), z: r2(z), s: extra && extra.scope || null, m: extra && extra.mag || 0, d: extra && extra.dur !== undefined ? extra.dur : null });
    return null;
  }
  const it = { kind, key, qty, x, y, z, alive: true, rot: Math.random() * TAU, scope: null, mag: 0 };
  if (extra) Object.assign(it, extra);
  if (it.id === undefined) it.id = nextLootId++;
  lootById.set(it.id, it);
  if (NET.mode === 'host' && NET.inMatch && !NET.bulk) NET.broadcast({ t: 'ladd', l: lootPack(it) });
  loot.push(it);
  const k = lgi(z) * LGN + lgi(x);
  (lootGrid[k] || (lootGrid[k] = [])).push(it);
  lootDirty = true;
  return it;
}
function removeLoot(it) {
  it.alive = false; lootDirty = true;
  if (NET.mode === 'host' && NET.inMatch && it.id !== undefined) NET.broadcast({ t: 'lupd', i: it.id, q: it.qty, a: 0 });
}
function forLoot(x, z, r, fn) {
  for (let j = lgi(z - r); j <= lgi(z + r); j++) for (let i = lgi(x - r); i <= lgi(x + r); i++) {
    const a = lootGrid[j * LGN + i]; if (!a) continue;
    for (let n = 0; n < a.length; n++) {
      const it = a[n];
      if (!it.alive) continue;
      const dx = it.x - x, dz = it.z - z;
      if (dx * dx + dz * dz <= r * r) fn(it);
    }
  }
}
function clearLoot() { loot.length = 0; lootById.clear(); nextLootId = 1; lootGrid = new Array(LGN * LGN); lootDirty = true; }
function spawnLootAtSpot(s) {
  const t = s.tier;
  if (Math.random() < (t === 1 ? 0.22 : 0.12)) return;
  const r = Math.random();
  const ox = (dx) => s.x + dx, extra = { route: s.route, bld: s.bld };
  if (r < 0.3) {
    const key = weighted(WEAPON_POOL[t]);
    addLoot('weapon', key, 1, s.x, s.y, s.z, extra);
    const W = WEAPONS[key];
    const n = 1 + (Math.random() < 0.6 ? 1 : 0);
    for (let i = 0; i < n; i++) addLoot('ammo', W.ammo, AMMO[W.ammo].stack, ox(0.45 + i * 0.35), s.y, s.z + 0.3, extra);
  } else if (r < 0.52) {
    const key = weighted({ '9mm': 30, '556': 30, '762': 25, '12g': 15 });
    addLoot('ammo', key, AMMO[key].stack, s.x, s.y, s.z, extra);
  } else if (r < 0.72) {
    const key = weighted({ bandage: 50, firstaid: 24, drink: 18, medkit: 3 + t * 3 });
    addLoot('heal', key, HEALS[key].qty, s.x, s.y, s.z, extra);
  } else if (r < 0.88) {
    const lv = +weighted(ARMOR_POOL[t]);
    addLoot(Math.random() < 0.5 ? 'vest' : 'helmet', lv, 1, s.x, s.y, s.z, extra);
  } else {
    const key = weighted({ reddot: 35, x2: 28, x4: 20 + t * 3, x8: 5 + t * 3 });
    addLoot('scope', key, 1, s.x, s.y, s.z, extra);
  }
}

// ルートの描画(近くだけインスタンス化)
const LOOT_CAP = 420;
const lootMeshes = {};
const lootMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
function initLootMeshes() {
  const geos = {
    weapon: mergeGeos([new THREE.BoxGeometry(1.0, 0.1, 0.16), new THREE.BoxGeometry(0.12, 0.08, 0.26).translate(0.12, 0, 0.14), new THREE.BoxGeometry(0.28, 0.12, 0.13).translate(-0.4, 0, 0.02)]),
    ammo: new THREE.BoxGeometry(0.34, 0.2, 0.24),
    heal: mergeGeos([new THREE.BoxGeometry(0.38, 0.2, 0.3), new THREE.BoxGeometry(0.2, 0.025, 0.06).translate(0, 0.1, 0), new THREE.BoxGeometry(0.06, 0.025, 0.2).translate(0, 0.1, 0)]),
    vest: mergeGeos([new THREE.BoxGeometry(0.56, 0.12, 0.62), new THREE.BoxGeometry(0.44, 0.06, 0.4).translate(0, 0.08, 0)]),
    helmet: new THREE.SphereGeometry(0.2, 10, 6, 0, TAU, 0, Math.PI / 2),
    scope: new THREE.CylinderGeometry(0.06, 0.07, 0.38, 10).rotateZ(Math.PI / 2)
  };
  for (const k in geos) {
    const m = new THREE.InstancedMesh(geos[k], lootMat, LOOT_CAP);
    m.count = 0; m.frustumCulled = false;
    m.setColorAt(0, new THREE.Color(1, 1, 1));
    scene.add(m); lootMeshes[k] = m;
  }
}
const _dummy = new THREE.Object3D();
const _c = new THREE.Color();
const ARMOR_COLORS = [0x888888, 0x8a8f6a, 0x4d6a8a, 0x2b2b2b];
function lootColor(it) {
  switch (it.kind) {
    case 'weapon': return WEAPONS[it.key].color;
    case 'ammo': return AMMO[it.key].color;
    case 'heal': return HEALS[it.key].color;
    case 'vest': case 'helmet': return ARMOR_COLORS[it.key];
    case 'scope': return 0x262a2c;
  }
  return 0xffffff;
}
function updateLootRender(cx, cz) {
  const counts = {}; for (const k in lootMeshes) counts[k] = 0;
  forLoot(cx, cz, 95, (it) => {
    const m = lootMeshes[it.kind]; const n = counts[it.kind];
    if (n >= LOOT_CAP) return;
    _dummy.position.set(it.x, it.y + (it.kind === 'helmet' ? 0.0 : it.kind === 'weapon' ? 0.06 : 0.1), it.z);
    _dummy.rotation.set(0, it.rot, 0); _dummy.scale.set(1.15, 1.15, 1.15); _dummy.updateMatrix();
    m.setMatrixAt(n, _dummy.matrix); m.setColorAt(n, _c.setHex(lootColor(it)));
    counts[it.kind] = n + 1;
  });
  for (const k in lootMeshes) {
    const m = lootMeshes[k]; m.count = counts[k];
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
}

// ================= キャラクターモデル =================
const CH_GEO = {}, CH_MAT = {};
function initCharacterAssets() {
  CH_GEO.leg = new THREE.BoxGeometry(0.17, 0.84, 0.2).translate(0, -0.42, 0);
  CH_GEO.boot = new THREE.BoxGeometry(0.19, 0.12, 0.28).translate(0, -0.8, -0.04);
  CH_GEO.torso = new THREE.BoxGeometry(0.46, 0.62, 0.26);
  CH_GEO.vest = new THREE.BoxGeometry(0.52, 0.46, 0.32);
  CH_GEO.head = new THREE.BoxGeometry(0.22, 0.25, 0.24);
  CH_GEO.helmet = new THREE.BoxGeometry(0.27, 0.13, 0.29);
  CH_GEO.arm = new THREE.BoxGeometry(0.12, 0.58, 0.12).translate(0, -0.27, 0);
  CH_GEO.gun = new THREE.BoxGeometry(0.07, 0.12, 0.85);
  CH_GEO.pack = new THREE.BoxGeometry(0.36, 0.44, 0.18);
  CH_GEO.flash = new THREE.PlaneGeometry(0.5, 0.5);
  CH_GEO.canopy = new THREE.SphereGeometry(3.4, 12, 5, 0, TAU, 0, Math.PI / 2.4);
  CH_GEO.line = new THREE.CylinderGeometry(0.01, 0.01, 4.2, 3);
  CH_MAT.skin = new THREE.MeshLambertMaterial({ color: 0xd2a07a });
  CH_MAT.outfits = [0x4d5a3a, 0x6b6253, 0x3c4a5c, 0x5a3f33, 0x2f3a33, 0x7a6f5a, 0x494949, 0x5c6b4c].map((c) => new THREE.MeshLambertMaterial({ color: c }));
  CH_MAT.pants = [0x3a3a32, 0x2f3338, 0x4a4436, 0x333a2d].map((c) => new THREE.MeshLambertMaterial({ color: c }));
  CH_MAT.boot = new THREE.MeshLambertMaterial({ color: 0x2a2520 });
  CH_MAT.gun = new THREE.MeshLambertMaterial({ color: 0x252727 });
  CH_MAT.vest = ARMOR_COLORS.map((c) => new THREE.MeshLambertMaterial({ color: c }));
  CH_MAT.pack = new THREE.MeshLambertMaterial({ color: 0x5b5340 });
  CH_MAT.flash = new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  CH_MAT.canopy = [0xd8642a, 0x3d7fc4, 0xe0c23a, 0x5aa04a, 0xc0c0c0].map((c) => new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide }));
  CH_MAT.line = new THREE.MeshBasicMaterial({ color: 0x222222 });
}
function makeCharacter(idx) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const outfit = CH_MAT.outfits[idx % CH_MAT.outfits.length];
  const pants = CH_MAT.pants[idx % CH_MAT.pants.length];
  const mk = (g, m, x, y, z, parent = body) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  const legL = new THREE.Group(); legL.position.set(-0.11, 0.86, 0); root.add(legL);
  const legR = new THREE.Group(); legR.position.set(0.11, 0.86, 0); root.add(legR);
  mk(CH_GEO.leg, pants, 0, 0, 0, legL); mk(CH_GEO.boot, CH_MAT.boot, 0, 0, 0, legL);
  mk(CH_GEO.leg, pants, 0, 0, 0, legR); mk(CH_GEO.boot, CH_MAT.boot, 0, 0, 0, legR);
  mk(CH_GEO.torso, outfit, 0, 1.18, 0);
  const vest = mk(CH_GEO.vest, CH_MAT.vest[1], 0, 1.2, 0); vest.visible = false;
  mk(CH_GEO.head, CH_MAT.skin, 0, 1.63, 0);
  const helmet = mk(CH_GEO.helmet, CH_MAT.vest[1], 0, 1.77, 0); helmet.visible = false;
  mk(CH_GEO.pack, CH_MAT.pack, 0, 1.2, 0.22);
  const armL = new THREE.Group(); armL.position.set(-0.29, 1.44, 0); body.add(armL);
  const armR = new THREE.Group(); armR.position.set(0.29, 1.44, 0); body.add(armR);
  mk(CH_GEO.arm, outfit, 0, 0, 0, armL); mk(CH_GEO.arm, outfit, 0, 0, 0, armR);
  armL.rotation.set(-1.25, -0.45, 0); armR.rotation.set(-1.35, 0.15, 0);
  const gun = mk(CH_GEO.gun, CH_MAT.gun, 0.06, 1.32, -0.5);
  const flash = new THREE.Mesh(CH_GEO.flash, CH_MAT.flash); flash.position.set(0.06, 1.34, -1.0); flash.visible = false; body.add(flash);
  const canopy = new THREE.Group(); canopy.position.y = 5.2; canopy.visible = false; root.add(canopy);
  const cm = new THREE.Mesh(CH_GEO.canopy, CH_MAT.canopy[idx % CH_MAT.canopy.length]); cm.scale.set(1, 0.55, 0.75); canopy.add(cm);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const l = new THREE.Mesh(CH_GEO.line, CH_MAT.line); l.position.set(sx * 1.5, -1.9, sz * 1.0); l.rotation.set(sz * 0.25, 0, -sx * 0.4); canopy.add(l);
  }
  root.visible = false;
  scene.add(root);
  return { root, body, legL, legR, armL, armR, vest, helmet, gun, flash, canopy, phase: 0, deathT: 0 };
}
function poseCharacter(s, dt, moveSpeed) {
  const M = s.model; if (!M) return;
  const r = M.root;
  r.position.copy(s.pos);
  r.rotation.y = s.yaw;
  M.vest.visible = s.vest.lv > 0; if (M.vest.visible) M.vest.material = CH_MAT.vest[s.vest.lv];
  M.helmet.visible = s.helmet.lv > 0; if (M.helmet.visible) M.helmet.material = CH_MAT.vest[s.helmet.lv];
  const w = s.weapon;
  M.gun.visible = !!w && s.mode !== 'freefall';
  if (w) M.gun.scale.z = w.key === 'pistol' ? 0.35 : w.key === 'smg' ? 0.65 : w.key === 'sniper' || w.key === 'dmr' ? 1.3 : 1.0;
  M.canopy.visible = s.mode === 'chute';
  if (!s.alive) {
    M.deathT = Math.min(1, M.deathT + dt * 2.2);
    const e = 1 - Math.pow(1 - M.deathT, 3);
    r.rotation.x = -e * Math.PI / 2; r.position.y = s.pos.y + e * 0.15;
    M.legL.rotation.x = M.legR.rotation.x = 0;
    return;
  }
  if (s.mode === 'freefall') {
    r.rotation.x = -1.25; M.armL.rotation.set(0, 0, 1.2); M.armR.rotation.set(0, 0, -1.2);
    M.legL.rotation.x = 0.3; M.legR.rotation.x = 0.25; M.body.position.y = 0; return;
  }
  r.rotation.x = 0;
  M.armL.rotation.set(-1.25 + (s.crouch ? 0.1 : 0), -0.45, 0); M.armR.rotation.set(-1.35, 0.15, 0);
  if (!w) { M.armL.rotation.set(-0.3, 0, 0.1); M.armR.rotation.set(-0.3, 0, -0.1); }
  if (s.mode === 'chute') { M.armL.rotation.set(-2.8, 0, 0.3); M.armR.rotation.set(-2.8, 0, -0.3); }
  M.phase += dt * moveSpeed * 2.2;
  const amp = Math.min(1, moveSpeed / 4) * 0.6;
  if (s.crouch || s.vehicle) {
    M.body.position.y = -0.42;
    M.legL.rotation.x = 1.25 + Math.sin(M.phase) * amp * 0.3; M.legR.rotation.x = 1.25 - Math.sin(M.phase) * amp * 0.3;
    M.legL.position.y = M.legR.position.y = 0.5;
  } else {
    M.body.position.y = Math.abs(Math.sin(M.phase)) * amp * 0.06;
    M.legL.rotation.x = Math.sin(M.phase) * amp; M.legR.rotation.x = -Math.sin(M.phase) * amp;
    M.legL.position.y = M.legR.position.y = 0.86;
  }
}

// ================= ビューモデル(一人称の武器) =================
const VM = { root: new THREE.Group(), models: {}, flash: null, cur: null, scopeMeshes: {} };
vmScene.add(VM.root);
function vmBox(g, w, h, d, x, y, z, mat) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); g.add(m); return m; }
function buildViewModels() {
  const metal = new THREE.MeshLambertMaterial({ color: 0x2a2d2c });
  const metal2 = new THREE.MeshLambertMaterial({ color: 0x3a3e3c });
  const wood = new THREE.MeshLambertMaterial({ color: 0x6b4526 });
  const tan = new THREE.MeshLambertMaterial({ color: 0x5c5a44 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc89470 });
  const glove = new THREE.MeshLambertMaterial({ color: 0x2f2c27 });
  const sleeve = new THREE.MeshLambertMaterial({ color: 0x4d5a3a });
  const sight = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const hands = (g, gripZ, foreZ, foreY) => {
    vmBox(g, 0.075, 0.09, 0.11, 0.0, -0.13, gripZ, glove);
    vmBox(g, 0.09, 0.09, 0.32, 0.03, -0.17, gripZ + 0.2, sleeve).rotation.x = 0.35;
    if (foreZ !== null) {
      vmBox(g, 0.08, 0.075, 0.12, -0.01, foreY, foreZ, glove);
      const s2 = vmBox(g, 0.09, 0.09, 0.4, -0.08, foreY - 0.07, foreZ + 0.25, sleeve); s2.rotation.set(0.3, -0.35, 0);
    }
  };
  const iron = (g, rz, fz) => { const a = vmBox(g, 0.03, 0.025, 0.012, 0, -0.013, rz, sight), b = vmBox(g, 0.008, 0.03, 0.008, 0, -0.012, fz, sight); a.userData.iron = b.userData.iron = true; };
  const mk = (key, f) => { const g = new THREE.Group(); f(g); g.visible = false; VM.root.add(g); VM.models[key] = g; };
  mk('ar556', (g) => {
    vmBox(g, 0.06, 0.07, 0.42, 0, -0.07, -0.18, metal);
    vmBox(g, 0.055, 0.06, 0.3, 0, -0.065, -0.52, tan);
    vmBox(g, 0.022, 0.022, 0.3, 0, -0.06, -0.82, metal2);
    vmBox(g, 0.045, 0.14, 0.07, 0, -0.16, -0.24, metal).rotation.x = 0.15;
    vmBox(g, 0.045, 0.1, 0.06, 0, -0.14, -0.05, metal).rotation.x = -0.3;
    vmBox(g, 0.05, 0.08, 0.22, 0, -0.08, 0.12, tan);
    vmBox(g, 0.03, 0.015, 0.4, 0, -0.03, -0.3, metal2);
    iron(g, -0.05, -0.62);
    hands(g, -0.05, -0.5, -0.11);
    g.userData = { muzzle: -0.98, scopeZ: -0.22, kind: 'rifle' };
  });
  mk('ar762', (g) => {
    vmBox(g, 0.06, 0.075, 0.44, 0, -0.07, -0.18, metal);
    vmBox(g, 0.06, 0.065, 0.26, 0, -0.07, -0.5, wood);
    vmBox(g, 0.024, 0.024, 0.32, 0, -0.06, -0.78, metal2);
    const mag = vmBox(g, 0.045, 0.17, 0.07, 0, -0.18, -0.24, metal); mag.rotation.x = 0.4;
    vmBox(g, 0.045, 0.1, 0.06, 0, -0.14, -0.04, wood).rotation.x = -0.3;
    vmBox(g, 0.05, 0.085, 0.24, 0, -0.085, 0.13, wood);
    iron(g, -0.1, -0.66);
    hands(g, -0.04, -0.5, -0.115);
    g.userData = { muzzle: -0.95, scopeZ: -0.22, kind: 'rifle' };
  });
  mk('smg', (g) => {
    vmBox(g, 0.06, 0.08, 0.34, 0, -0.07, -0.18, metal);
    vmBox(g, 0.026, 0.026, 0.16, 0, -0.06, -0.42, metal2);
    vmBox(g, 0.04, 0.16, 0.05, 0, -0.17, -0.2, metal);
    vmBox(g, 0.045, 0.1, 0.06, 0, -0.14, -0.04, metal).rotation.x = -0.25;
    vmBox(g, 0.03, 0.04, 0.2, 0, -0.08, 0.1, metal2);
    iron(g, -0.04, -0.33);
    hands(g, -0.04, -0.3, -0.12);
    g.userData = { muzzle: -0.52, scopeZ: -0.18, kind: 'smg' };
  });
  mk('shotgun', (g) => {
    vmBox(g, 0.06, 0.075, 0.3, 0, -0.07, -0.12, metal);
    vmBox(g, 0.035, 0.035, 0.55, 0, -0.055, -0.5, metal2);
    vmBox(g, 0.05, 0.05, 0.22, 0, -0.1, -0.45, wood);
    vmBox(g, 0.05, 0.09, 0.3, 0, -0.1, 0.12, wood).rotation.x = -0.12;
    iron(g, -0.04, -0.75);
    hands(g, -0.02, -0.45, -0.12);
    g.userData = { muzzle: -0.8, scopeZ: -0.14, kind: 'shotgun' };
  });
  mk('dmr', (g) => {
    vmBox(g, 0.06, 0.08, 0.5, 0, -0.07, -0.2, metal);
    vmBox(g, 0.062, 0.07, 0.3, 0, -0.07, -0.58, tan);
    vmBox(g, 0.024, 0.024, 0.35, 0, -0.06, -0.9, metal2);
    vmBox(g, 0.045, 0.12, 0.08, 0, -0.16, -0.24, metal);
    vmBox(g, 0.045, 0.1, 0.06, 0, -0.14, -0.03, metal).rotation.x = -0.3;
    vmBox(g, 0.055, 0.09, 0.26, 0, -0.085, 0.14, tan);
    iron(g, -0.06, -0.72);
    hands(g, -0.03, -0.55, -0.11);
    g.userData = { muzzle: -1.06, scopeZ: -0.25, kind: 'rifle' };
  });
  mk('sniper', (g) => {
    vmBox(g, 0.055, 0.07, 0.42, 0, -0.075, -0.2, metal);
    vmBox(g, 0.065, 0.08, 0.7, 0, -0.1, -0.35, wood);
    vmBox(g, 0.024, 0.024, 0.45, 0, -0.06, -0.9, metal2);
    vmBox(g, 0.06, 0.1, 0.32, 0, -0.11, 0.12, wood).rotation.x = -0.1;
    vmBox(g, 0.02, 0.02, 0.08, 0.05, -0.06, -0.05, metal2);
    iron(g, -0.1, -1.08);
    hands(g, -0.02, -0.55, -0.13);
    g.userData = { muzzle: -1.14, scopeZ: -0.24, kind: 'rifle' };
  });
  mk('pistol', (g) => {
    vmBox(g, 0.045, 0.05, 0.2, 0, -0.04, -0.08, metal);
    vmBox(g, 0.04, 0.12, 0.06, 0, -0.12, -0.01, metal2).rotation.x = -0.2;
    iron(g, 0.0, -0.17);
    vmBox(g, 0.075, 0.09, 0.11, 0.0, -0.15, 0.02, glove);
    vmBox(g, 0.075, 0.08, 0.1, -0.035, -0.16, 0.0, glove);
    vmBox(g, 0.09, 0.09, 0.3, 0.02, -0.2, 0.2, sleeve).rotation.x = 0.4;
    g.userData = { muzzle: -0.2, scopeZ: -0.06, kind: 'pistol' };
  });
  mk('fists', (g) => {
    vmBox(g, 0.09, 0.09, 0.11, 0.13, -0.15, -0.1, skin);
    vmBox(g, 0.1, 0.1, 0.4, 0.15, -0.18, 0.12, sleeve).rotation.x = 0.4;
    vmBox(g, 0.09, 0.09, 0.11, -0.13, -0.15, -0.1, skin);
    vmBox(g, 0.1, 0.1, 0.4, -0.15, -0.18, 0.12, sleeve).rotation.x = 0.4;
    g.userData = { muzzle: -0.2, scopeZ: 0, kind: 'fists' };
  });
  // スコープ
  const glass = new THREE.MeshBasicMaterial({ color: 0x0d1a22, transparent: true, opacity: 0.35 });
  const red = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  const mkScope = (key, f) => { const g = new THREE.Group(); f(g); g.visible = false; VM.scopeMeshes[key] = g; VM.root.add(g); };
  mkScope('reddot', (g) => {
    vmBox(g, 0.05, 0.012, 0.07, 0, -0.03, 0, metal);
    vmBox(g, 0.006, 0.05, 0.05, -0.024, 0, 0, metal); vmBox(g, 0.006, 0.05, 0.05, 0.024, 0, 0, metal);
    vmBox(g, 0.05, 0.006, 0.05, 0, 0.024, 0, metal);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0016, 10), red); dot.position.set(0, 0, -0.02); g.add(dot);
  });
  const tube = (g, len, r) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14, 1, true), metal); m.rotation.x = Math.PI / 2; g.add(m);
    const e1 = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.35, r, 0.05, 14, 1, true), metal); e1.rotation.x = Math.PI / 2; e1.position.z = -len / 2; g.add(e1);
    vmBox(g, 0.03, 0.03, 0.05, 0, -r - 0.012, 0.03, metal);
    const gl = new THREE.Mesh(new THREE.CircleGeometry(r * 0.95, 14), glass); gl.position.z = len / 2 - 0.005; g.add(gl);
  };
  mkScope('x2', (g) => tube(g, 0.13, 0.022));
  mkScope('x4', (g) => tube(g, 0.22, 0.026));
  mkScope('x8', (g) => tube(g, 0.3, 0.03));
  // マズルフラッシュ
  const fm = new THREE.MeshBasicMaterial({ color: 0xffd28a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const flash = new THREE.Group();
  const p1 = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), fm); flash.add(p1);
  const p2 = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.3), fm); p2.rotation.x = Math.PI / 2; flash.add(p2);
  const p3 = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.05), fm); p3.rotation.y = Math.PI / 2; flash.add(p3);
  flash.visible = false; VM.root.add(flash); VM.flash = flash;
}
const vmState = { bob: 0, swayX: 0, swayY: 0, kick: 0, kickRot: 0, ads: 0, lower: 1, reloadT: 0, sprint: 0, flashT: 0, key: null, scope: null, punch: 0 };

// ================= エフェクト(弾道・パーティクル) =================
const TRACER_MAX = 260;
const tracerGeo = new THREE.BufferGeometry();
tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRACER_MAX * 6), 3).setUsage(THREE.DynamicDrawUsage));
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffd889, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
const tracerLines = new THREE.LineSegments(tracerGeo, tracerMat);
tracerLines.frustumCulled = false; scene.add(tracerLines);

const PART_MAX = 500;
const partGeo = new THREE.BufferGeometry();
partGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PART_MAX * 3).fill(-9999), 3).setUsage(THREE.DynamicDrawUsage));
partGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(PART_MAX * 3), 3).setUsage(THREE.DynamicDrawUsage));
const partMat = new THREE.PointsMaterial({ size: 0.22, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, sizeAttenuation: true });
const partPoints = new THREE.Points(partGeo, partMat); partPoints.frustumCulled = false; scene.add(partPoints);
const parts = []; for (let i = 0; i < PART_MAX; i++) parts.push({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 0, g: 0, b: 0, grav: 1 });
let partIdx = 0;
const IMPACT_COL = { ground: [0.55, 0.48, 0.36], wall: [0.72, 0.7, 0.66], wood: [0.5, 0.36, 0.2], rock: [0.6, 0.6, 0.58], water: [0.85, 0.92, 1.0], blood: [0.55, 0.04, 0.04], metal: [1, 0.85, 0.4], bush: [0.3, 0.45, 0.2], fire: [1, 0.55, 0.15], smoke: [0.25, 0.25, 0.25] };
function spawnParticles(x, y, z, kind, n, spd, up) {
  const c = IMPACT_COL[kind] || IMPACT_COL.ground;
  for (let i = 0; i < n; i++) {
    const p = parts[partIdx]; partIdx = (partIdx + 1) % PART_MAX;
    p.x = x; p.y = y; p.z = z;
    p.vx = (Math.random() - 0.5) * spd; p.vz = (Math.random() - 0.5) * spd; p.vy = Math.random() * spd * (up || 0.8);
    p.life = 0.35 + Math.random() * 0.5; p.grav = kind === 'smoke' ? -0.2 : kind === 'water' ? 1.2 : 0.6;
    const v = 0.85 + Math.random() * 0.3;
    p.r = c[0] * v; p.g = c[1] * v; p.b = c[2] * v;
  }
}
function updateParticles(dt) {
  const pa = partGeo.attributes.position.array, ca = partGeo.attributes.color.array;
  for (let i = 0; i < PART_MAX; i++) {
    const p = parts[i];
    if (p.life <= 0) { pa[i * 3 + 1] = -9999; continue; }
    p.life -= dt;
    p.vy -= 9.8 * p.grav * dt; p.vx *= 0.96; p.vz *= 0.96;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    pa[i * 3] = p.x; pa[i * 3 + 1] = p.y; pa[i * 3 + 2] = p.z;
    const f = Math.min(1, p.life * 3);
    ca[i * 3] = p.r * f + 0.6 * (1 - f); ca[i * 3 + 1] = p.g * f + 0.6 * (1 - f); ca[i * 3 + 2] = p.b * f + 0.6 * (1 - f);
  }
  partGeo.attributes.position.needsUpdate = true; partGeo.attributes.color.needsUpdate = true;
}

// ================= 弾丸 =================
const bullets = [];
const bulletPool = [];
function fireBullet(owner, ox, oy, oz, dx, dy, dz, speed, dmg, wkey, tracer, visX, visY, visZ, visual) {
  const b = bulletPool.pop() || {};
  b.owner = owner; b.x = ox; b.y = oy; b.z = oz;
  b.vx = dx * speed; b.vy = dy * speed; b.vz = dz * speed;
  b.dmg = dmg; b.wkey = wkey; b.traveled = 0; b.tracer = tracer;
  b.ox = visX || 0; b.oy = visY || 0; b.oz = visZ || 0; b.sx = ox; b.sz = oz;
  b.nearPlayer = false;
  b.visual = NET.mode === 'client' || !!visual; // 見た目だけの弾(ダメージ判定はホスト)
  bullets.push(b);
}
const SEGR = { s: 0, t: 0, d2: 0, cx: 0, cy: 0, cz: 0 };
function segSeg(p1x, p1y, p1z, d1x, d1y, d1z, p2x, p2y, p2z, d2x, d2y, d2z) {
  const rx = p1x - p2x, ry = p1y - p2y, rz = p1z - p2z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z, f = d2x * rx + d2y * ry + d2z * rz;
  let s, t;
  if (a <= 1e-9 && e <= 1e-9) { s = t = 0; }
  else if (a <= 1e-9) { s = 0; t = clamp(f / e, 0, 1); }
  else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= 1e-9) { t = 0; s = clamp(-c / a, 0, 1); }
    else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z, den = a * e - b * b;
      s = den !== 0 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  const c1x = p1x + d1x * s, c1y = p1y + d1y * s, c1z = p1z + d1z * s;
  const c2x = p2x + d2x * t, c2y = p2y + d2y * t, c2z = p2z + d2z * t;
  SEGR.s = s; SEGR.t = t; SEGR.cx = c2x; SEGR.cy = c2y; SEGR.cz = c2z;
  SEGR.d2 = (c1x - c2x) ** 2 + (c1y - c2y) ** 2 + (c1z - c2z) ** 2;
  return SEGR;
}
function segSphere(ax, ay, az, dx, dy, dz, cx, cy, cz, r) {
  const fx = ax - cx, fy = ay - cy, fz = az - cz;
  const A = dx * dx + dy * dy + dz * dz, B = 2 * (fx * dx + fy * dy + fz * dz), C = fx * fx + fy * fy + fz * fz - r * r;
  if (C < 0) return 0;
  const disc = B * B - 4 * A * C; if (disc < 0) return -1;
  const t = (-B - Math.sqrt(disc)) / (2 * A);
  return t >= 0 && t <= 1 ? t : -1;
}
// 兵士のヒットテスト：{t, part}
const HIT = { t: 1, part: '', s: null };
function hitSoldiers(owner, ax, ay, az, dx, dy, dz, maxT) {
  let best = maxT, bs = null, bp = '';
  const len = Math.hypot(dx, dy, dz);
  for (let i = 0; i < soldiers.length; i++) {
    const s = soldiers[i];
    if (!s.alive || s === owner || s.mode === 'plane') continue;
    // 粗い判定
    const cx = s.pos.x, cy = s.pos.y + 0.9, cz = s.pos.z;
    const tt = clamp(((cx - ax) * dx + (cy - ay) * dy + (cz - az) * dz) / (len * len), 0, 1);
    const qx = ax + dx * tt - cx, qy = ay + dy * tt - cy, qz = az + dz * tt - cz;
    if (qx * qx + qy * qy + qz * qz > 2.2) continue;
    const low = s.crouch || s.vehicle || s.mode === 'swim';
    const lx = s.isPlayer ? s.leanX : 0, lz = s.isPlayer ? s.leanZ : 0;
    const ht = segSphere(ax, ay, az, dx, dy, dz, cx + lx, s.pos.y + (low ? 1.2 : 1.66), cz + lz, 0.17);
    if (ht >= 0 && ht < best) { best = ht; bs = s; bp = 'head'; }
    const top = low ? 1.0 : 1.46;
    const r = segSeg(ax, ay, az, dx, dy, dz, cx, s.pos.y + 0.12, cz, 0, top - 0.12, 0);
    if (r.d2 < 0.09) {
      const back = Math.sqrt(0.09 - r.d2) / len;
      const t = Math.max(0, r.s - back);
      if (t < best) { best = t; bs = s; bp = (r.cy - s.pos.y) < (low ? 0.5 : 0.82) ? 'leg' : 'body'; }
    }
  }
  HIT.t = best; HIT.part = bp; HIT.s = bs;
  return bs ? HIT : null;
}
function updateBullets(dt) {
  const pa = tracerGeo.attributes.position.array;
  let nt = 0;
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    const nx = b.x + b.vx * dt, nz = b.z + b.vz * dt;
    const ny = b.y + b.vy * dt - 4.9 * dt * dt;
    b.vy -= 9.8 * dt;
    const dx = nx - b.x, dy = ny - b.y, dz = nz - b.z;
    let endT = 1, kind = null, target = null, part = '';
    const w = raycast(b.x, b.y, b.z, nx, ny, nz, false);
    if (w) { endT = w.t; kind = w.type; }
    const h = hitSoldiers(b.owner, b.x, b.y, b.z, dx, dy, dz, endT);
    if (h) { endT = h.t; target = h.s; part = h.part; kind = 'flesh'; }
    const vh = hitVehicles(b.x, b.y, b.z, dx, dy, dz, endT);
    if (vh) { endT = vh.t; target = vh.v; kind = 'metal'; }
    const hx = b.x + dx * endT, hy = b.y + dy * endT, hz = b.z + dz * endT;
    // プレイヤー付近を通過した弾(かすめ音)
    if (player && player.alive && b.owner !== player && !b.nearPlayer) {
      const r = segSeg(b.x, b.y, b.z, dx * endT, dy * endT, dz * endT, player.pos.x, player.pos.y + 1.4, player.pos.z, 0, 0, 0);
      if (r.d2 < 9) { b.nearPlayer = true; Sound.impact(1, 0, 'metal'); }
    }
    b.traveled += Math.hypot(dx, dy, dz) * endT;
    if (kind) {
      if (kind === 'flesh') {
        spawnParticles(hx, hy, hz, 'blood', 8, 3, 0.5);
        if (!b.visual) damageSoldier(target, b.dmg * falloff(b.wkey, b.traveled), part, b.owner, b.wkey, b.sx, b.sz);
      } else if (kind === 'metal') {
        spawnParticles(hx, hy, hz, 'metal', 6, 4, 0.8);
        if (!b.visual) damageVehicle(target, b.dmg * 0.35, b.owner);
      } else {
        spawnParticles(hx, hy, hz, kind === 'water' ? 'water' : kind, kind === 'water' ? 10 : 7, kind === 'water' ? 2 : 3, kind === 'water' ? 2.5 : 0.8);
        if (player) { const d = Math.hypot(hx - player.pos.x, hz - player.pos.z); if (d < 40) Sound.impact(d, panTo(hx, hz), kind === 'rock' || kind === 'wall' ? 'hard' : 'soft'); }
      }
      bullets.splice(i, 1); bulletPool.push(b);
      continue;
    }
    b.x = nx; b.y = ny; b.z = nz;
    b.ox *= 0.82; b.oy *= 0.82; b.oz *= 0.82;
    if (b.traveled > 1200 || b.y < -30) { bullets.splice(i, 1); bulletPool.push(b); continue; }
    if (b.tracer && nt < TRACER_MAX) {
      const sp = Math.hypot(b.vx, b.vy, b.vz) || 1;
      const L = Math.min(b.traveled, 9);
      const k = nt * 6;
      pa[k] = b.x + b.ox; pa[k + 1] = b.y + b.oy; pa[k + 2] = b.z + b.oz;
      pa[k + 3] = b.x + b.ox * 1.4 - b.vx / sp * L; pa[k + 4] = b.y + b.oy * 1.4 - b.vy / sp * L; pa[k + 5] = b.z + b.oz * 1.4 - b.vz / sp * L;
      nt++;
    }
  }
  tracerGeo.setDrawRange(0, nt * 2);
  tracerGeo.attributes.position.needsUpdate = true;
}
function falloff(wkey, d) {
  const W = WEAPONS[wkey]; if (!W) return 1;
  if (wkey === 'shotgun') return clamp(1.15 - d / 45, 0.15, 1);
  return clamp(1 - Math.max(0, d - W.range) / (W.range * 3), 0.55, 1);
}
function panTo(x, z) {
  if (!player) return 0;
  const a = Math.atan2(x - player.pos.x, z - player.pos.z);
  const rel = wrapAngle(a - (player.yaw + Math.PI));
  return clamp(Math.sin(rel), -1, 1) * 0.85;
}

// ================= ダメージ・キル =================
function damageSoldier(t, base, part, att, wkey, fx, fz) {
  if (NET.mode === 'client') { netClientDamage(t, base, part, att, wkey, fx, fz); return; } // 判定はホストが行う
  if (!t || !t.alive || base <= 0) return;
  if (NET.mode !== 'off' && NET.team && att && att !== t && isHuman(att) && isHuman(t)) return; // チーム戦：味方への攻撃は無効
  let d = base;
  if (part === 'head') {
    d *= WEAPONS[wkey] ? WEAPONS[wkey].head : 2;
    if (t.helmet.lv > 0) { d *= 1 - ARMOR_RED[t.helmet.lv]; t.helmet.dur -= base; if (t.helmet.dur <= 0) { t.helmet.lv = 0; t.helmet.dur = 0; } }
  } else if (part === 'body') {
    if (t.vest.lv > 0) { d *= 1 - ARMOR_RED[t.vest.lv]; t.vest.dur -= base; if (t.vest.dur <= 0) { t.vest.lv = 0; t.vest.dur = 0; } }
  } else if (part === 'leg') d *= 0.9;
  const before = t.hp;
  t.hp -= d;
  t.lastDamageTime = game.time;
  if (t.healing) t.healing = null;
  if (att && att.isRemote && t !== att) {
    att.damageDealt = (att.damageDealt || 0) + Math.min(d, before);
    NET.toRemote(att, { t: 'hit', h: part === 'head' ? 1 : 0, k: t.hp <= 0 ? 1 : 0, n: t.name });
  }
  if (t.isRemote) NET.toRemote(t, { t: 'dmg', d: r1(d), fx: r1(fx || 0), fz: r1(fz || 0) });
  if (att === player && t !== player) {
    game.damageDealt += Math.min(d, before);
    showHitmarker(part === 'head', t.hp <= 0);
    Sound.ui(part === 'head' ? 'head' : 'hit');
  }
  if (t === player) onPlayerDamaged(d, fx, fz, att);
  else if (t.onDamaged) t.onDamaged(att, fx, fz);
  if (t.hp <= 0) killSoldier(t, att, wkey, part === 'head');
}
function killSoldier(t, att, wkey, head) {
  if (!t.alive) return;
  t.alive = false; t.hp = 0;
  aliveCount--;
  if (att && att !== t) att.kills++;
  const how = !att ? 'zone' : wkey;
  addKillfeed(att, t, how, head);
  if (t.vehicle) { const v = t.vehicle; if (v.driver === t) v.driver = null; t.vehicle = null; }
  dropAll(t);
  if (t.isRemote) NET.toRemote(t, { t: 'dead', k: att && att !== t ? att.name : null, r: aliveCount + 1, ac: aliveCount });
  if (t === player) { onPlayerDeath(att); }
  else if (att === player) { Sound.ui('kill'); showCenter((head ? 'ヘッドショット ' : '') + t.name + ' を倒した', 2.2, 'kill'); }
  checkWinner();
}
function dropAll(s) {
  const x = s.pos.x, z = s.pos.z, y = groundAt(x, z, s.pos.y + 0.5) + 0.02;
  let k = 0;
  const off = () => { const a = k * 2.399, r = 0.35 + k * 0.12; k++; return [x + Math.cos(a) * r, z + Math.sin(a) * r]; };
  for (const w of s.weapons) if (w) { const [ax, az] = off(); addLoot('weapon', w.key, 1, ax, y, az, { scope: w.scope, mag: w.mag }); }
  for (const key in s.ammo) {
    let q = s.ammo[key];
    if (!s.isPlayer && !s.isRemote && s.weapons.some((w) => w && WEAPONS[w.key].ammo === key)) q = Math.max(q, rndInt(20, 60));
    if (q > 0) { const [ax, az] = off(); addLoot('ammo', key, q, ax, y, az); }
  }
  for (const key in s.heals) if (s.heals[key] > 0) { const [ax, az] = off(); addLoot('heal', key, s.heals[key], ax, y, az); }
  if (s.vest.lv > 0) { const [ax, az] = off(); addLoot('vest', s.vest.lv, 1, ax, y, az, { dur: s.vest.dur }); }
  if (s.helmet.lv > 0) { const [ax, az] = off(); addLoot('helmet', s.helmet.lv, 1, ax, y, az, { dur: s.helmet.dur }); }
}

// ================= 兵士 =================
class Soldier {
  constructor(name, isPlayer) {
    this.name = name; this.isPlayer = isPlayer;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.hp = 100; this.boost = 0; this.alive = true;
    this.vest = { lv: 0, dur: 0 }; this.helmet = { lv: 0, dur: 0 };
    this.crouch = false; this.mode = 'plane'; this.onGround = false; this.swimming = false;
    this.kills = 0; this.weapons = [null, null, null]; this.slot = -1;
    this.ammo = { '9mm': 0, '556': 0, '762': 0, '12g': 0 };
    this.heals = { bandage: 0, firstaid: 0, medkit: 0, drink: 0 };
    this.reloadT = 0; this.reloadTotal = 0; this.fireCd = 0; this.switchT = 0; this.healing = null;
    this.model = null; this.vehicle = null; this.lastDamageTime = -99;
    this.leanX = 0; this.leanZ = 0;
  }
  get weapon() { return this.slot >= 0 ? this.weapons[this.slot] : null; }
}
const WEAPON_RANK = { pistol: 1, shotgun: 2, smg: 3, ar556: 5, ar762: 5, dmr: 4, sniper: 4 };
const IDEAL_RANGE = { pistol: 14, smg: 20, shotgun: 7, ar556: 45, ar762: 40, dmr: 110, sniper: 160 };
const HEAL_CAP = { bandage: 20, firstaid: 5, medkit: 2, drink: 5 };

function forwardVec(yaw, pitch, out) {
  const cp = Math.cos(pitch);
  out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
  return out;
}

// ---- 拾得 ----
function pickupItem(s, it, silent) {
  if (!it.alive) return false;
  let consumed = true;
  switch (it.kind) {
    case 'weapon': {
      const W = WEAPONS[it.key];
      const wpn = { key: it.key, mag: s.isPlayer ? (it.mag || 0) : W.mag, scope: it.scope || null, single: false };
      let slot;
      if (W.slot === 2) slot = 2;
      else if (!s.weapons[0]) slot = 0;
      else if (!s.weapons[1]) slot = 1;
      else slot = (s.slot === 0 || s.slot === 1) ? s.slot : 0;
      const old = s.weapons[slot];
      if (old) addLoot('weapon', old.key, 1, it.x + 0.3, it.y, it.z + 0.3, { scope: old.scope, mag: old.mag, route: it.route, bld: it.bld });
      s.weapons[slot] = wpn;
      if (s.isPlayer) { equipSlot(slot, true); if (!silent) showCenter(W.name + ' を装備', 1.4); }
      else s.slot = bestBotSlot(s, 30);
      break;
    }
    case 'ammo': {
      const max = s.isPlayer ? AMMO[it.key].max : 999;
      const take = Math.min(it.qty, max - s.ammo[it.key]);
      if (take <= 0) { if (s.isPlayer && !silent) showCenter('これ以上持てません', 1.2); return false; }
      s.ammo[it.key] += take; it.qty -= take;
      if (it.qty > 0) consumed = false;
      break;
    }
    case 'heal': {
      const cap = HEAL_CAP[it.key];
      const take = Math.min(it.qty, cap - s.heals[it.key]);
      if (take <= 0) { if (s.isPlayer && !silent) showCenter('これ以上持てません', 1.2); return false; }
      s.heals[it.key] += take; it.qty -= take;
      if (it.qty > 0) consumed = false;
      break;
    }
    case 'vest': case 'helmet': {
      const slot = s[it.kind], lv = +it.key;
      const dur = it.dur !== undefined ? it.dur : (it.kind === 'vest' ? VEST_DUR[lv] : HELM_DUR[lv]);
      if (lv < slot.lv || (lv === slot.lv && dur <= slot.dur)) { if (s.isPlayer && !silent) showCenter('今の装備の方が良いです', 1.2); return false; }
      if (slot.lv > 0) addLoot(it.kind, slot.lv, 1, it.x + 0.3, it.y, it.z, { dur: slot.dur, route: it.route, bld: it.bld });
      slot.lv = lv; slot.dur = dur;
      break;
    }
    case 'scope': {
      const sc = SCOPES[it.key];
      let target = null;
      const cand = [s.slot, 0, 1].filter((i) => i === 0 || i === 1);
      for (const i of cand) { const w = s.weapons[i]; if (w && (!w.scope || SCOPES[w.scope].rank < sc.rank)) { target = w; break; } }
      if (!target) { if (s.isPlayer && !silent) showCenter('取り付けられる武器がありません', 1.4); return false; }
      if (target.scope) addLoot('scope', target.scope, 1, it.x + 0.3, it.y, it.z, { route: it.route, bld: it.bld });
      target.scope = it.key;
      if (s.isPlayer && !silent) showCenter(sc.name + ' を ' + WEAPONS[target.key].name + ' に装着', 1.4);
      break;
    }
  }
  if (consumed) removeLoot(it); else lootDirty = true;
  netLootTouched(s, it);
  if (s.isPlayer) { Sound.ui('pickup'); hudDirty = true; }
  return true;
}

// ---- 装備切替・リロード ----
function equipSlot(slot, force) {
  const p = player;
  if (slot !== -1 && !p.weapons[slot]) return;
  if (p.slot === slot && !force) return;
  p.slot = slot; p.reloadT = 0; p.switchT = 0.42; p.adsHeld = false;
  vmState.lower = 1;
  Sound.ui('click'); hudDirty = true;
}
function startReload(s) {
  const w = s.weapon; if (!w || s.reloadT > 0) return false;
  const W = WEAPONS[w.key];
  if (w.mag >= W.mag) return false;
  if (s.isPlayer && s.ammo[W.ammo] <= 0) { showCenter(AMMO[W.ammo].name + ' がありません', 1.2); return false; }
  const shells = s.isPlayer ? Math.min(W.mag - w.mag, s.ammo[W.ammo]) : W.mag - w.mag;
  s.reloadT = s.reloadTotal = W.shell ? W.reload * shells + 0.35 : W.reload;
  s.healing = null;
  if (s.isPlayer) Sound.reload(0);
  return true;
}
function finishReload(s) {
  const w = s.weapon; if (!w) return;
  const W = WEAPONS[w.key];
  const need = W.mag - w.mag;
  if (s.isPlayer) { const take = Math.min(need, s.ammo[W.ammo]); w.mag += take; s.ammo[W.ammo] -= take; Sound.reload(2); hudDirty = true; }
  else w.mag = W.mag;
}

// ---- 回復 ----
function useHeal(s, key) {
  if (!s.alive || s.heals[key] <= 0) { if (s.isPlayer) showCenter(HEALS[key].name + ' を持っていません', 1.2); return; }
  const H = HEALS[key];
  if (H.cap && s.hp >= H.cap) { if (s.isPlayer) showCenter('体力が' + H.cap + '以上のため使えません', 1.4); return; }
  if (key === 'drink' && s.boost >= 95) { if (s.isPlayer) showCenter('ブーストは満タンです', 1.2); return; }
  if (s.vehicle) { if (s.isPlayer) showCenter('乗車中は使えません', 1.2); return; }
  s.healing = { key, t: H.time, total: H.time };
  s.reloadT = 0;
  if (s.isPlayer) { s.adsHeld = false; Sound.ui('heal'); }
}
function updateHealing(s, dt) {
  if (s.boost > 0) {
    s.boost = Math.max(0, s.boost - dt * 1.3);
    if (s.hp < 100) s.hp = Math.min(100, s.hp + dt * (s.boost > 60 ? 1.0 : 0.6));
  }
  if (!s.healing) return;
  s.healing.t -= dt;
  if (s.healing.t <= 0) {
    const key = s.healing.key, H = HEALS[key];
    s.healing = null;
    if (s.heals[key] <= 0) return;
    s.heals[key]--;
    if (key === 'bandage') s.hp = Math.min(75, s.hp + 10);
    else if (key === 'firstaid') s.hp = Math.max(s.hp, 75);
    else if (key === 'medkit') s.hp = 100;
    else if (key === 'drink') s.boost = Math.min(100, s.boost + H.boost);
    if (s.isPlayer) { Sound.ui('heal'); hudDirty = true; if (NET.mode === 'client') NET.send({ t: 'heal', k: key }); }
  }
}

// ================= プレイヤー =================
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
function adsZoom(p) {
  const w = p.weapon; if (!w) return 1;
  if (w.scope) return SCOPES[w.scope].zoom;
  return w.key === 'pistol' ? 1.15 : 1.3;
}
function zoomFov(base, zoom) { return 2 * Math.atan(Math.tan(base * DEG / 2) / zoom) / DEG; }

function updatePlayerGround(dt) {
  const p = player;
  const W = p.weapon ? WEAPONS[p.weapon.key] : null;
  // 視点
  p.yaw = wrapAngle(p.yaw); p.pitch = clamp(p.pitch, -1.5, 1.5);
  // 入力
  let fwd = input.move.y, str = input.move.x;
  const mlen = Math.hypot(fwd, str); if (mlen > 1) { fwd /= mlen; str /= mlen; }
  // ダッシュ入力：押し直し(立ち上がり)でしゃがみ中の抑制を解除
  const sprintSig = !!(input.sprint || input.autoSprint || input.dashLock);
  if (sprintSig && !p.prevSprintSig) p.sprintBlocked = false;
  p.prevSprintSig = sprintSig;
  if (input.consume('crouch')) {
    p.crouch = !p.crouch;
    if (p.crouch && sprintSig) p.sprintBlocked = true; // ダッシュ中にしゃがむ → しゃがみ歩き
    else if (!p.crouch) p.sprintBlocked = false;
  }
  const canSprint = fwd > 0.5 && !p.adsHeld && !p.healing && !p.swimming;
  let sprint = sprintSig && !p.sprintBlocked && canSprint && !input.fire;
  if (sprint && p.crouch) p.crouch = false;
  p.sprinting = sprint;
  let speed = p.swimming ? 2.6 : p.crouch ? 2.5 : sprint ? 6.5 : 4.7;
  if (p.adsActive) speed *= 0.62;
  if (p.healing) speed *= 0.5;
  if (p.boost > 60) speed *= 1.06;
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  let wx = -sy * fwd + cy * str, wz = -cy * fwd - sy * str;
  const acc = p.onGround || p.swimming ? 14 : 2.2;
  const k = Math.min(1, acc * dt);
  p.vel.x += (wx * speed - p.vel.x) * k;
  p.vel.z += (wz * speed - p.vel.z) * k;
  if (input.consume('jump')) {
    if (p.crouch) p.crouch = false;
    else if (p.onGround && !p.swimming) { p.vel.y = 6.2; p.onGround = false; }
  }
  if (!p.swimming) p.vel.y -= GRAV * dt;
  const prevY = p.pos.y;
  p.pos.x += p.vel.x * dt; p.pos.z += p.vel.z * dt; p.pos.y += p.vel.y * dt;
  const H = p.crouch ? 1.25 : 1.8;
  collide(p.pos, 0.38, H);
  const g = groundAt(p.pos.x, p.pos.z, Math.max(p.pos.y, prevY));
  if (g < SWIM_DEPTH) {
    if (p.pos.y <= SWIM_DEPTH) {
      if (!p.swimming) { spawnParticles(p.pos.x, 0, p.pos.z, 'water', 14, 3, 2); p.softLand = false; }
      p.pos.y = SWIM_DEPTH; p.vel.y = 0; p.swimming = true; p.onGround = false; p.crouch = false;
    } else { p.swimming = false; p.onGround = false; }
  } else {
    if (p.pos.y <= g) {
      if (p.vel.y < -13 && !p.softLand) { const dmg = (-p.vel.y - 13) * 7.5; damageSoldier(p, dmg, 'fall', null, null, p.pos.x, p.pos.z); }
      p.softLand = false;
      if (!p.onGround && p.vel.y < -5) Sound.ui('land');
      p.pos.y = g; p.vel.y = 0; p.onGround = true;
    } else if (p.onGround && p.pos.y - g < 0.5 && p.vel.y <= 0) { p.pos.y = g; p.vel.y = 0; }
    else p.onGround = false;
    p.swimming = false;
  }
  // 足音
  const hs = Math.hypot(p.vel.x, p.vel.z);
  if ((p.onGround || p.swimming) && hs > 1) {
    p.stepDist = (p.stepDist || 0) + hs * dt;
    const stride = sprint ? 2.3 : p.crouch ? 1.6 : 1.9;
    if (p.stepDist > stride) { p.stepDist = 0; if (!p.crouch) Sound.step(0.5, 0, insideBuilding(p.pos) ? 'hard' : 'soft'); }
  }
  // リーン
  const leanT = input.lean && !sprint && !p.swimming ? input.lean : 0;
  p.lean = lerp(p.lean || 0, leanT, Math.min(1, dt * 10));
  p.leanX = cy * 0.42 * p.lean; p.leanZ = -sy * 0.42 * p.lean;
  // ADS
  const canAds = !!W && !sprint && !p.healing && !p.swimming && p.reloadT <= 0 && p.switchT <= 0;
  p.adsActive = p.adsHeld && canAds;
  p.adsT = lerp(p.adsT || 0, p.adsActive ? 1 : 0, Math.min(1, dt * (p.adsActive ? 9 : 12)));
  // 目線
  const eyeT = p.swimming ? 1.62 : p.crouch ? 1.12 : 1.62;
  p.eyeH = lerp(p.eyeH || 1.62, eyeT, Math.min(1, dt * 10));
  // 武器
  playerWeapon(dt, sprint);
  updateHealing(p, dt);
  if (p.healing && (input.fire && p.weapon)) p.healing = null;
  // 自動拾得
  p.autoPickT = (p.autoPickT || 0) - dt;
  if (p.autoPickT <= 0) { p.autoPickT = 0.2; if (settings.autoPickup) autoPickup(p); }
}
function insideBuilding(pos) {
  for (const b of buildings) if (pos.x > b.x0 && pos.x < b.x1 && pos.z > b.z0 && pos.z < b.z1 && Math.abs(pos.y - b.y) < 2) return b;
  return null;
}
function autoPickup(p) {
  forLoot(p.pos.x, p.pos.z, 1.7, (it) => {
    if (Math.abs(it.y - p.pos.y) > 1.5) return;
    if (it.kind === 'ammo') {
      const uses = p.weapons.some((w) => w && WEAPONS[w.key].ammo === it.key);
      if (uses && p.ammo[it.key] < AMMO[it.key].max) pickupItem(p, it, true);
    } else if (it.kind === 'heal') {
      if (p.heals[it.key] < HEAL_CAP[it.key]) pickupItem(p, it, true);
    } else if (it.kind === 'vest' || it.kind === 'helmet') {
      if (+it.key > p[it.kind].lv) { pickupItem(p, it, true); showCenter(itemLabel(it) + ' を装備', 1.2); }
    }
  });
}
function nearestLootList(p, r) {
  const list = [];
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
  forLoot(p.pos.x, p.pos.z, r, (it) => {
    if (Math.abs(it.y - p.pos.y) > 1.6) return;
    const dx = it.x - p.pos.x, dz = it.z - p.pos.z, d = Math.hypot(dx, dz);
    const facing = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
    list.push({ it, d, score: d - facing * 0.8 });
  });
  list.sort((a, b) => a.score - b.score);
  return list;
}

// ---- プレイヤーの射撃 ----
function playerWeapon(dt, sprint) {
  const p = player, w = p.weapon;
  p.fireCd -= dt;
  if (p.switchT > 0) p.switchT -= dt;
  if (p.reloadT > 0) {
    const prev = p.reloadT; p.reloadT -= dt;
    if (prev > p.reloadTotal * 0.55 && p.reloadT <= p.reloadTotal * 0.55) Sound.reload(1);
    if (p.reloadT <= 0) finishReload(p);
  }
  if (input.consume('reload')) startReload(p);
  // 自動リロード(予備弾があってマガジンが空のとき)
  if (settings.autoReload && w && w.mag <= 0 && p.reloadT <= 0 && p.fireCd <= 0 && p.switchT <= 0 && !p.healing && !p.swimming &&
    p.ammo[WEAPONS[w.key].ammo] > 0) startReload(p);
  if (input.consume('firemode') && w && WEAPONS[w.key].auto) { w.single = !w.single; showCenter(w.single ? '単発' : 'フルオート', 1); Sound.ui('click'); }
  const firing = input.fire && !p.swimming && p.switchT <= 0 && !p.healing;
  if (!input.fire) { p.triggerHeld = false; p.emptyClick = false; }
  if (firing) {
    if (!w) {
      if (p.fireCd <= 0) { punch(p); p.fireCd = 0.45; }
    } else {
      const W = WEAPONS[w.key];
      if (p.reloadT > 0) {
        if (W.shell && w.mag > 0 && !p.triggerHeld) { p.reloadT = 0; }
      } else if (w.mag <= 0) {
        if (!p.emptyClick) { Sound.ui('empty'); p.emptyClick = true; startReload(p); }
      } else if (p.fireCd <= 0 && ((W.auto && !w.single) || !p.triggerHeld)) {
        shootPlayer(p, w, W);
        p.fireCd = 60 / W.rpm;
      }
    }
    p.triggerHeld = true;
  }
  // 反動の回復
  if (!input.fire && p.recoilAcc > 0) { const r = Math.min(p.recoilAcc, dt * 0.08); p.pitch -= r * 0.55; p.recoilAcc -= r; }
  p.bloom = Math.max(0, (p.bloom || 0) - dt * 3);
  void sprint;
}
function aimAngles(p) {
  let ay = p.yaw, ap = p.pitch;
  if (p.adsT > 0.5 && p.weapon && p.weapon.scope && SCOPES[p.weapon.scope].overlay) {
    const z = SCOPES[p.weapon.scope].zoom;
    const m = (p.holdBreath ? 0.12 : 1) * (isTouchDevice ? 0.4 : 1) * (p.crouch ? 0.6 : 1);
    ay += Math.sin(game.time * 0.9) * 0.0016 * m * z / 4;
    ap += Math.sin(game.time * 1.3 + 1) * 0.0012 * m * z / 4;
  }
  return [ay, ap];
}
const _muz = new THREE.Vector3();
function shootPlayer(p, w, W) {
  w.mag--;
  let [ay, ap] = aimAngles(p);
  const eye = _v1.set(p.pos.x + p.leanX, p.pos.y + p.eyeH, p.pos.z + p.leanZ);
  if (game.tpsView) {
    // 三人称：カメラ中心の先にある着弾点へ向けて、本人の目線から撃つ
    const c = camera.position, d = forwardVec(ay, ap, _v3), R = 700;
    const h = raycast(c.x, c.y, c.z, c.x + d.x * R, c.y + d.y * R, c.z + d.z * R, false);
    const t = h ? h.t : 1;
    const tx = c.x + d.x * R * t - eye.x, ty = c.y + d.y * R * t - eye.y, tz = c.z + d.z * R * t - eye.z;
    if (Math.hypot(tx, ty, tz) > 1.5) { ay = Math.atan2(-tx, -tz); ap = Math.atan2(ty, Math.hypot(tx, tz)); }
  }
  const moving = Math.hypot(p.vel.x, p.vel.z) > 1;
  let spread = (p.adsT > 0.7 ? W.ads : W.hip) * (moving ? 1.5 : 1) * (p.crouch ? 0.8 : 1) * (p.onGround ? 1 : 2.5) + p.bloom;
  if (W.pellets) spread = p.adsT > 0.7 ? W.ads : W.hip;
  p.bloom = Math.min(3, p.bloom + W.recoil * (p.adsT > 0.7 ? 0.12 : 0.3));
  // マズル位置(見た目用)
  if (game.tpsView && p.model) {
    p.model.flash.getWorldPosition(_muz);
    p.flashT = 0.05;
  } else {
    const ud = VM.cur ? VM.cur.userData : { muzzle: -0.6 };
    _muz.set(VM.root.position.x, VM.root.position.y - 0.05, VM.root.position.z + ud.muzzle);
    camera.updateMatrixWorld();
    _muz.applyMatrix4(camera.matrixWorld);
  }
  const ox = _muz.x - eye.x, oy = _muz.y - eye.y, oz = _muz.z - eye.z;
  const n = W.pellets || 1;
  const sent = [];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * spread * DEG;
    const dir = forwardVec(ay + Math.cos(a) * r, ap + Math.sin(a) * r, _v2);
    fireBullet(p, eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, W.vel, W.dmg, w.key, true, ox, oy, oz);
    sent.push([r2(eye.x), r2(eye.y), r2(eye.z), r3(dir.x), r3(dir.y), r3(dir.z)]);
  }
  p.flashT = 0.05;
  if (NET.mode === 'client') NET.send({ t: 'shot', w: w.key, b: sent });
  else if (NET.mode === 'host') netQueueShot(p, eye.x, eye.y, eye.z, sent[0][3], sent[0][4], sent[0][5], w.key);
  // 反動
  const kick = W.recoil * DEG * (p.adsT > 0.7 ? 0.8 : 1) * (p.crouch ? 0.82 : 1) * (0.85 + Math.random() * 0.3);
  p.pitch += kick; p.recoilAcc = (p.recoilAcc || 0) + kick;
  p.yaw += (Math.random() - 0.45) * W.recoil * 0.35 * DEG;
  vmState.kick = Math.min(1.4, vmState.kick + (W.bolt || W.pellets ? 1.4 : 0.7));
  vmState.flashT = 0.05;
  flashLight.position.copy(_muz); flashLight.intensity = 2.2;
  vmFlashLight.intensity = 1.2;
  Sound.shot(w.key, 0, 0, true);
  if (W.bolt) setTimeout(() => Sound.reload(1), 450);
  alertBots(p, 260);
  hudDirty = true;
}
function punch(s) {
  const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
  if (s.isPlayer) { vmState.punch = 1; Sound.shot('fist', 0, 0, true); }
  for (const t of soldiers) {
    if (t === s || !t.alive || t.mode !== 'ground') continue;
    const dx = t.pos.x - s.pos.x, dz = t.pos.z - s.pos.z, d = Math.hypot(dx, dz);
    if (d < 1.8 && Math.abs(t.pos.y - s.pos.y) < 1.2 && (dx * fx + dz * fz) / (d || 1) > 0.5) {
      damageSoldier(t, 16, 'fist', s, null, s.pos.x, s.pos.z);
      spawnParticles(t.pos.x, t.pos.y + 1.4, t.pos.z, 'blood', 4, 2);
      break;
    }
  }
}
function alertBots(shooter, range) {
  for (const b of bots) {
    if (!b.alive || b.mode !== 'ground' || b.target) continue;
    const d = dist2D(b.pos.x, b.pos.z, shooter.pos.x, shooter.pos.z);
    if (d < range && Math.random() < 0.6) { b.investigate = { x: shooter.pos.x, z: shooter.pos.z, t: game.time + 12 }; b.lookAt = { x: shooter.pos.x, z: shooter.pos.z }; }
  }
}

// ---- 降下中 ----
function updatePlayerAir(dt) {
  const p = player;
  p.pitch = clamp(p.pitch, -1.5, 1.4);
  const fwd = clamp(input.move.y, -1, 1), str = clamp(input.move.x, -1, 1);
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  const agl = p.pos.y - terrainH(p.pos.x, p.pos.z);
  if (p.mode === 'freefall') {
    p.fallT += dt;
    const dive = clamp(-p.pitch / (Math.PI / 2), 0, 1);
    let hs, vs;
    if (fwd > 0.1) { hs = lerp(38, 16, dive) * fwd; vs = lerp(30, 64, dive); } else { hs = 4; vs = 45; }
    const tx = (-sy * hs) + cy * str * 10, tz = (-cy * hs) - sy * str * 10;
    p.vel.x += (tx - p.vel.x) * Math.min(1, dt * 1.6); p.vel.z += (tz - p.vel.z) * Math.min(1, dt * 1.6);
    p.vel.y += (-vs - p.vel.y) * Math.min(1, dt * 1.6);
    if (agl < 155 || (input.consume('jump') && p.fallT > 1.5 && agl < 1200)) { p.mode = 'chute'; Sound.ui('chute'); hudDirty = true; }
  } else {
    const hs = 4 + Math.max(0, fwd) * 12 - Math.max(0, -fwd) * 3;
    const vs = fwd > 0.2 ? 7.5 : 5.5;
    const tx = -sy * hs + cy * str * 6, tz = -cy * hs - sy * str * 6;
    p.vel.x += (tx - p.vel.x) * Math.min(1, dt * 1.2); p.vel.z += (tz - p.vel.z) * Math.min(1, dt * 1.2);
    p.vel.y += (-vs - p.vel.y) * Math.min(1, dt * 2);
  }
  p.pos.addScaledVector(p.vel, dt);
  p.pos.x = clamp(p.pos.x, -HALF + 40, HALF - 40); p.pos.z = clamp(p.pos.z, -HALF + 40, HALF - 40);
  const g = groundAt(p.pos.x, p.pos.z, p.pos.y);
  if (p.mode === 'chute' && p.pos.y - Math.max(g, SWIM_DEPTH) <= 5) {
    // 地上5mでパラシュートを切り離し、そのまま落下して着地(落下ダメージなし)
    p.mode = 'ground'; p.onGround = false; p.softLand = true; p.eyeH = 1.62;
    p.vel.y = Math.min(p.vel.y, -1);
    hudDirty = true;
    showCenter('着地！ 物資を集めよう', 2);
  } else if (p.mode === 'freefall' && p.pos.y <= g + 2) {
    p.mode = 'chute';
  }
  p.eyeH = 1.62;
}

// ================= Bot =================
const BOT_NAMES_A = ['Kuro', 'Shiro', 'Aka', 'Tora', 'Kaze', 'Yami', 'Hana', 'Ryu', 'Neko', 'Sora', 'Hoshi', 'Raku', 'Zen', 'Mochi', 'Taka', 'Kai', 'Rin', 'Haru', 'Yuki', 'Jin', 'Nagi', 'Ren', 'Tetsu', 'Kumo', 'Sato', 'Ichi', 'Gin', 'Ao', 'Momo', 'Kiri'];
const BOT_NAMES_B = ['_jp', '99', 'X', '_FPS', 'Ace', 'God', 'san', '777', '_TV', 'Blade', 'Wolf', 'Pro', 'chan', 'Shot', '2nd', '_00', 'Zero', 'Fox', 'Kun', '_yt'];
function botName(used) {
  for (let i = 0; i < 50; i++) { const n = pick(BOT_NAMES_A) + pick(BOT_NAMES_B); if (!used.has(n)) { used.add(n); return n; } }
  return 'Bot' + rndInt(100, 999);
}
class Bot extends Soldier {
  constructor(name, idx) {
    super(name, false);
    this.skill = clamp(0.25 + Math.random() * 0.75, 0, 1);
    this.model = makeCharacter(idx);
    this.reset();
  }
  reset() {
    this.target = null; this.lastSeen = -99; this.seen = false; this.reactT = 0;
    this.thinkT = Math.random() * 0.5; this.state = 'idle'; this.goal = null; this.path = [];
    this.lootTarget = null; this.landT = 0; this.lootUntil = 0;
    this.strafe = 1; this.strafeT = 0; this.stuckT = 0; this.lastX = 0; this.lastZ = 0; this.stuck = 0; this.detour = null;
    this.healT = 0; this.investigate = null; this.lookAt = null;
    this.aimErrX = 0; this.aimErrY = 0; this.burst = 0; this.burstPause = 0;
    this.deadT = 0; this.campT = 0; this.stepPhase = 0; this.flashT = 0; this.jumpTime = 0; this.drop = null;
    this.engagedT = 0;
  }
  onDamaged(att, fx, fz) {
    if (!att || att === this) return;
    if (!this.target || !this.seen) {
      this.target = att; this.lastSeen = game.time; this.reactT = Math.min(this.reactT, 0.25 + Math.random() * 0.3);
      this.lookAt = { x: fx, z: fz };
    }
    this.healT = 0;
  }
}
function bestBotSlot(b, dist) {
  let best = -1, bs = -1e9;
  for (let i = 0; i < 3; i++) {
    const w = b.weapons[i]; if (!w) continue;
    const s = -Math.abs(Math.log(Math.max(1, dist) / IDEAL_RANGE[w.key])) + WEAPON_RANK[w.key] * 0.15;
    if (s > bs) { bs = s; best = i; }
  }
  return best;
}
function canSee(b, s) {
  const low = s.crouch || s.swimming;
  const ty = s.pos.y + (s.vehicle ? 1.3 : low ? 0.95 : 1.5);
  return !raycast(b.pos.x, b.pos.y + 1.6, b.pos.z, s.pos.x, ty, s.pos.z, true);
}
function botViewRange(b) {
  const w = b.weapon;
  if (!w) return 70;
  return { pistol: 110, smg: 160, shotgun: 90, ar556: 320, ar762: 300, dmr: 480, sniper: 600 }[w.key];
}
function landGoal(cx, cz, r) {
  for (let i = 0; i < 20; i++) {
    const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * r;
    const x = clamp(cx + Math.cos(a) * d, -2800, 2800), z = clamp(cz + Math.sin(a) * d, -2800, 2800);
    if (terrainH(x, z) > 1.5) return { x, z };
  }
  return { x: cx, z: cz };
}
function botWantLoot(b) {
  const hasPrimary = b.weapons[0] || b.weapons[1];
  const r = !b.weapon ? 75 : 45;
  let best = null, bd = 1e9;
  forLoot(b.pos.x, b.pos.z, r, (it) => {
    if (it.claim && it.claim !== b && it.claimT > game.time) return;
    if (Math.abs(it.y - b.pos.y) > 6) return;
    let want = 0;
    if (it.kind === 'weapon') {
      const W = WEAPONS[it.key];
      if (W.slot === 2) want = !b.weapons[2] && !hasPrimary ? 2.5 : 0;
      else if (!hasPrimary) want = 3;
      else if (!b.weapons[1]) want = 1.2;
      else { const worst = Math.min(WEAPON_RANK[b.weapons[0].key], WEAPON_RANK[b.weapons[1].key]); want = WEAPON_RANK[it.key] > worst ? 1.0 : 0; }
    } else if (it.kind === 'vest' || it.kind === 'helmet') want = +it.key > b[it.kind].lv ? 1.6 : 0;
    else if (it.kind === 'heal') want = (b.heals[it.key] < 3 && it.key !== 'drink') ? 0.7 : 0;
    else if (it.kind === 'scope') want = (b.weapons[0] && !b.weapons[0].scope) || (b.weapons[1] && !b.weapons[1].scope) ? 0.5 : 0;
    if (!want) return;
    const d = dist2D(it.x, it.z, b.pos.x, b.pos.z) / want;
    if (d < bd) { bd = d; best = it; }
  });
  return best;
}
function setBotLootPath(b, it) {
  b.lootTarget = it; it.claim = b; it.claimT = game.time + 25;
  b.path = [];
  const inB = insideBuilding(b.pos);
  if (inB && inB !== it.bld) b.path.push(inB.doorIn, inB.doorOut);
  if (it.route) {
    if (inB === it.bld) { if (it.route[2]) b.path.push(it.route[2]); }
    else for (const p of it.route) b.path.push(p);
  }
  b.path.push([it.x, it.z]);
}
function setBotGoal(b, x, z) {
  b.goal = { x, z }; b.path = [];
  const inB = insideBuilding(b.pos);
  if (inB) { b.path.push(inB.doorIn, inB.doorOut); }
}

function botThink(b) {
  const dp = player ? dist2D(b.pos.x, b.pos.z, player.pos.x, player.pos.z) : 9999;
  b.thinkT = dp < 500 ? 0.22 + Math.random() * 0.12 : dp < 1200 ? 0.5 + Math.random() * 0.2 : 1.0 + Math.random() * 0.4;
  // 知覚
  const range = botViewRange(b);
  const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw);
  const cand = [];
  for (const s of soldiers) {
    if (s === b || !s.alive || (s.mode !== 'ground' && s.mode !== 'vehicle')) continue;
    const dx = s.pos.x - b.pos.x, dz = s.pos.z - b.pos.z, d = Math.hypot(dx, dz);
    if (d > range) continue;
    const facing = (dx * fx + dz * fz) / (d || 1);
    const aware = s === b.target && game.time - b.lastSeen < 3;
    if (!aware && d > 15 && facing < 0.15) continue;
    if (!aware && d > 50 && Math.random() > 1.3 - d / range) continue;
    cand.push([d, s]);
  }
  cand.sort((a, c) => a[0] - c[0]);
  let found = null;
  for (let i = 0; i < Math.min(3, cand.length); i++) if (canSee(b, cand[i][1])) { found = cand[i][1]; break; }
  if (found) {
    if (found !== b.target) { b.reactT = 0.75 - b.skill * 0.45 + Math.random() * 0.3; b.engagedT = 0; }
    b.target = found; b.lastSeen = game.time; b.seen = true;
    const d = dist2D(found.pos.x, found.pos.z, b.pos.x, b.pos.z);
    const err = (0.05 - b.skill * 0.032) * (0.7 + Math.random() * 0.6);
    b.aimErrX = (Math.random() - 0.5) * 2 * err * Math.max(0.35, 1 - b.engagedT * 0.15);
    b.aimErrY = (Math.random() - 0.5) * 2 * err * 0.7 * Math.max(0.35, 1 - b.engagedT * 0.15);
    const ns = bestBotSlot(b, d);
    if (ns !== b.slot && ns >= 0) { b.slot = ns; b.switchT = 0.5; b.reloadT = 0; }
    b.state = 'combat'; b.healT = 0;
    return;
  }
  b.seen = false;
  if (b.target) {
    if (!b.target.alive || game.time - b.lastSeen > 6) {
      if (b.target.alive && b.weapon) b.investigate = { x: b.target.pos.x, z: b.target.pos.z, t: game.time + 10 };
      b.target = null;
    } else { b.state = 'combat'; return; }
  }
  // 回復
  if (b.hp < 65 && b.healT <= 0 && b.mode === 'ground' && !b.swimming) {
    const key = b.hp < 45 && b.heals.medkit > 0 ? 'medkit' : b.heals.firstaid > 0 ? 'firstaid' : b.heals.bandage > 0 ? 'bandage' : null;
    if (key && !(HEALS[key].cap && b.hp >= HEALS[key].cap)) {
      b.heals[key]--; b.healT = HEALS[key].time + 0.5; b.healKey = key; b.state = 'heal'; return;
    }
  }
  if (b.healT > 0) return;
  // 安全地帯
  const zx = zone.state === 'shrink' || zone.state === 'wait' ? zone.nx : zone.cx;
  const zz = zone.state === 'shrink' || zone.state === 'wait' ? zone.nz : zone.cz;
  const zr = zone.state === 'shrink' || zone.state === 'wait' ? zone.nr : zone.r;
  const outCur = dist2D(b.pos.x, b.pos.z, zone.cx, zone.cz) > zone.r - 20;
  const outNext = dist2D(b.pos.x, b.pos.z, zx, zz) > zr * 0.92;
  const lateEnough = zone.phase >= 0 && (zone.state === 'shrink' || zone.timer < 50 + b.skill * 30 || zone.phase > 0);
  if (outCur || (outNext && lateEnough)) {
    if (b.state !== 'zone' || !b.goal || dist2D(b.goal.x, b.goal.z, zx, zz) > zr) {
      const g = landGoal(zx, zz, zr * 0.6);
      setBotGoal(b, g.x, g.z); b.state = 'zone';
    }
    return;
  }
  // 物資
  const looting = game.time < b.lootUntil || !b.weapon;
  if (looting && (!b.lootTarget || !b.lootTarget.alive)) {
    const it = botWantLoot(b);
    if (it) { setBotLootPath(b, it); b.state = 'loot'; return; }
  }
  if (b.lootTarget && b.lootTarget.alive) { b.state = 'loot'; return; }
  if (!b.weapon && game.time - b.landT > 100) {
    // 長時間武器が見つからない場合は救済
    b.weapons[2] = { key: 'pistol', mag: 15, scope: null }; b.slot = 2;
  }
  if (b.investigate && game.time < b.investigate.t) {
    if (!b.goal || b.state !== 'investigate') { setBotGoal(b, b.investigate.x + rnd(-8, 8), b.investigate.z + rnd(-8, 8)); b.state = 'investigate'; }
    return;
  }
  b.investigate = null;
  // 徘徊・待機
  if (b.state === 'camp' && b.campT > game.time) return;
  if (!b.goal || b.state !== 'roam') {
    if (Math.random() < 0.45) { b.state = 'camp'; b.campT = game.time + rnd(4, 14); b.goal = null; b.path = []; b.crouch = Math.random() < 0.5; return; }
    const cx = zone.phase >= 0 ? zx : b.pos.x, cz = zone.phase >= 0 ? zz : b.pos.z;
    const rr = zone.phase >= 0 ? Math.min(zr * 0.7, 350) : 250;
    const bx = clamp(b.pos.x + rnd(-200, 200), cx - rr, cx + rr), bz = clamp(b.pos.z + rnd(-200, 200), cz - rr, cz + rr);
    const g = landGoal(bx, bz, 30);
    setBotGoal(b, g.x, g.z); b.state = 'roam'; b.crouch = false;
  }
}

function botShoot(b, t) {
  const w = b.weapon, W = WEAPONS[w.key];
  w.mag--;
  const ex = b.pos.x, ey = b.pos.y + (b.crouch ? 1.1 : 1.55), ez = b.pos.z;
  const low = t.crouch || t.vehicle || t.swimming;
  const aimY = t.pos.y + (Math.random() < 0.12 + b.skill * 0.18 ? (low ? 1.2 : 1.62) : (low ? 0.8 : 1.15));
  const d = Math.hypot(t.pos.x - ex, aimY - ey, t.pos.z - ez);
  const lead = d / W.vel * (0.4 + b.skill * 0.6);
  const tx = t.pos.x + t.vel.x * lead, tz = t.pos.z + t.vel.z * lead;
  const drop = 0.5 * 9.8 * (d / W.vel) ** 2;
  const yaw = Math.atan2(-(tx - ex), -(tz - ez)) + b.aimErrX;
  const pitch = Math.atan2(aimY + drop - ey, Math.hypot(tx - ex, tz - ez)) + b.aimErrY;
  const moving = Math.hypot(b.vel.x, b.vel.z) > 1;
  const tMove = Math.hypot(t.vel.x, t.vel.z) > 3 ? 1.3 : 1;
  const spread = (d < 15 ? W.hip * 0.6 : W.ads + 0.25) * (moving ? 1.4 : 1) * tMove * (1.6 - b.skill * 0.6);
  const n = W.pellets || 1;
  const near = player && dist2D(ex, ez, player.pos.x, player.pos.z) < 450;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * spread * DEG;
    const dir = forwardVec(yaw + Math.cos(a) * r, pitch + Math.sin(a) * r, _v3);
    fireBullet(b, ex, ey, ez, dir.x, dir.y, dir.z, W.vel, W.dmg * 0.92, w.key, near && (i === 0), 0, 0, 0);
    if (i === 0 && NET.mode === 'host') netQueueShot(b, ex, ey, ez, dir.x, dir.y, dir.z, w.key);
  }
  b.flashT = 0.05;
  b.engagedT += 0.15;
  if (player) {
    const dp = dist2D(ex, ez, player.pos.x, player.pos.z);
    if (dp < 1100) { Sound.shot(w.key, dp, panTo(ex, ez), false); if (dp < 260) soundCue(ex, ez, 'shot'); }
  }
}

function moveSoldier(s, wx, wz, speed, dt, H) {
  const k = Math.min(1, 10 * dt);
  s.vel.x += (wx * speed - s.vel.x) * k; s.vel.z += (wz * speed - s.vel.z) * k;
  if (!s.swimming) s.vel.y -= GRAV * dt;
  const prevY = s.pos.y;
  s.pos.x += s.vel.x * dt; s.pos.z += s.vel.z * dt; s.pos.y += s.vel.y * dt;
  collide(s.pos, 0.38, H);
  const g = groundAt(s.pos.x, s.pos.z, Math.max(s.pos.y, prevY) + 0.1);
  if (g < SWIM_DEPTH) {
    if (s.pos.y <= SWIM_DEPTH) { s.pos.y = SWIM_DEPTH; s.vel.y = 0; s.swimming = true; s.onGround = false; }
    else s.swimming = false;
  } else {
    s.swimming = false;
    if (s.pos.y <= g || (s.onGround && s.pos.y - g < 0.6 && s.vel.y <= 0)) { s.pos.y = g; s.vel.y = 0; s.onGround = true; }
    else s.onGround = false;
  }
}
function updateBotGround(b, dt) {
  b.thinkT -= dt;
  if (b.thinkT <= 0) botThink(b);
  b.fireCd -= dt; if (b.switchT > 0) b.switchT -= dt;
  if (b.flashT > 0) b.flashT -= dt;
  if (b.reloadT > 0) { b.reloadT -= dt; if (b.reloadT <= 0) finishReload(b); }
  updateHealing(b, dt);
  let wx = 0, wz = 0, speed = 0;
  const t = b.target;
  if (b.healT > 0) {
    b.healT -= dt; b.crouch = true;
    if (b.healT <= 0) {
      const k = b.healKey;
      if (k === 'bandage') b.hp = Math.min(75, b.hp + 10); else if (k === 'firstaid') b.hp = Math.max(b.hp, 75); else b.hp = 100;
      b.state = 'idle';
    }
  } else if (t && t.alive && b.state === 'combat') {
    const dx = t.pos.x - b.pos.x, dz = t.pos.z - b.pos.z, d = Math.hypot(dx, dz) || 1;
    const want = Math.atan2(-dx, -dz);
    const turn = (3 + b.skill * 5) * dt;
    b.yaw += clamp(wrapAngle(want - b.yaw), -turn, turn);
    b.pitch = Math.atan2(t.pos.y - b.pos.y, d);
    if (b.reactT > 0) b.reactT -= dt;
    const w = b.weapon;
    if (!w) {
      // 素手：近ければ殴る、遠ければ逃げる
      if (d < 25) { wx = dx / d; wz = dz / d; speed = 6; if (d < 1.6 && b.fireCd <= 0) { punch(b); b.fireCd = 0.6; } }
      else { wx = -dx / d; wz = -dz / d; speed = 6; }
    } else {
      const ideal = IDEAL_RANGE[w.key];
      // 移動
      b.strafeT -= dt;
      if (b.strafeT <= 0) { b.strafe = Math.random() < 0.5 ? -1 : 1; b.strafeT = 0.6 + Math.random() * 1.6; if (d > 70) b.crouch = Math.random() < 0.55; else b.crouch = Math.random() < 0.15; }
      const px = -dz / d, pz = dx / d;
      let ap = 0;
      if (d > ideal * 1.6) ap = 1; else if (d < ideal * 0.45 && ideal > 20) ap = -0.7;
      if (!b.seen && game.time - b.lastSeen > 1) ap = 0.8; // 見失ったら詰める
      wx = dx / d * ap + px * b.strafe * 0.8; wz = dz / d * ap + pz * b.strafe * 0.8;
      speed = b.crouch ? 2.3 : 4.4;
      if (b.swimming) speed = 2.4;
      // 射撃
      const aligned = Math.abs(wrapAngle(want - b.yaw)) < 0.12;
      if (b.reactT <= 0 && b.seen && aligned && b.switchT <= 0 && !b.swimming) {
        if (w.mag <= 0) { if (b.reloadT <= 0) { b.reloadT = WEAPONS[w.key].shell ? 2.2 : WEAPONS[w.key].reload; } }
        else if (b.reloadT <= 0 && b.fireCd <= 0 && d < botViewRange(b) * 1.1) {
          const W = WEAPONS[w.key];
          if (W.auto) {
            if (b.burstPause > 0) b.burstPause -= dt;
            else {
              botShoot(b, t); b.fireCd = 60 / W.rpm * (d > 60 ? 1.6 : 1.05);
              b.burst++;
              if (b.burst >= (d > 80 ? 2 : d > 30 ? 4 : 7)) { b.burst = 0; b.burstPause = 0.25 + Math.random() * 0.5 + (1 - b.skill) * 0.4; b.aimErrX *= 0.7; b.aimErrY *= 0.7; }
            }
          } else { botShoot(b, t); b.fireCd = Math.max(60 / W.rpm, 0.4 + (1 - b.skill) * 0.5 + d / 400); }
        }
      }
    }
  } else {
    b.crouch = b.state === 'camp' ? b.crouch : false;
    let gx = null, gz = null;
    if (b.path.length) {
      const wp = b.path[0]; gx = wp[0]; gz = wp[1];
      if (dist2D(gx, gz, b.pos.x, b.pos.z) < (b.path.length === 1 && b.lootTarget ? 0.9 : 0.75)) {
        b.path.shift();
        if (!b.path.length && b.lootTarget) {
          const it = b.lootTarget; b.lootTarget = null;
          if (it.alive && dist2D(it.x, it.z, b.pos.x, b.pos.z) < 1.6) {
            pickupItem(b, it, true);
            b.slot = bestBotSlot(b, 40);
          }
          if (it.bld && insideBuilding(b.pos)) { /* 次の思考で出口へ */ }
          b.thinkT = Math.min(b.thinkT, 0.3 + Math.random() * 0.5);
        }
      }
    } else if (b.goal) {
      gx = b.goal.x; gz = b.goal.z;
      if (dist2D(gx, gz, b.pos.x, b.pos.z) < 2.5) { b.goal = null; if (b.state === 'zone' || b.state === 'roam' || b.state === 'investigate') { b.state = 'camp'; b.campT = game.time + rnd(3, 10); } }
    }
    if (gx !== null) {
      const dx = gx - b.pos.x, dz = gz - b.pos.z, d = Math.hypot(dx, dz) || 1;
      wx = dx / d; wz = dz / d;
      if (b.detour) { b.detour.t -= dt; wx = wx * 0.3 + b.detour.x; wz = wz * 0.3 + b.detour.z; if (b.detour.t <= 0) b.detour = null; }
      const sprint = b.state === 'zone' || (b.state === 'loot' && d > 10);
      speed = b.swimming ? 2.5 : sprint ? 6.2 : 4.4;
      if (d < 3) speed = Math.min(speed, 3);
      const want = Math.atan2(-wx, -wz);
      b.yaw += clamp(wrapAngle(want - b.yaw), -6 * dt, 6 * dt);
      b.pitch *= 0.9;
    } else if (b.lookAt) {
      const want = Math.atan2(-(b.lookAt.x - b.pos.x), -(b.lookAt.z - b.pos.z));
      b.yaw += clamp(wrapAngle(want - b.yaw), -4 * dt, 4 * dt);
      if (Math.abs(wrapAngle(want - b.yaw)) < 0.05) b.lookAt = null;
    } else if (b.state === 'camp' && Math.random() < dt * 0.4) {
      b.lookAt = { x: b.pos.x + rnd(-50, 50), z: b.pos.z + rnd(-50, 50) };
    }
  }
  const wl = Math.hypot(wx, wz); if (wl > 1) { wx /= wl; wz /= wl; }
  moveSoldier(b, wx, wz, speed, dt, b.crouch ? 1.25 : 1.8);
  // スタック検出
  b.stuckT += dt;
  if (b.stuckT > 1.0) {
    const moved = dist2D(b.pos.x, b.pos.z, b.lastX, b.lastZ);
    if (speed > 1 && moved < 0.5) {
      b.stuck++;
      const a = Math.atan2(wz, wx) + (Math.random() < 0.5 ? 1.6 : -1.6);
      b.detour = { x: Math.cos(a), z: Math.sin(a), t: 0.9 + Math.random() * 0.6 };
      if (b.vel.y === 0 && b.onGround && Math.random() < 0.5) b.vel.y = 5.5;
      if (b.stuck > 4) { b.stuck = 0; if (b.lootTarget) { b.lootTarget.claimT = 0; b.lootTarget = null; } b.path = []; b.goal = null; b.state = 'idle'; b.thinkT = 0; }
    } else if (moved > 1.5) b.stuck = 0;
    b.lastX = b.pos.x; b.lastZ = b.pos.z; b.stuckT = 0;
  }
  // 足音(プレイヤー付近)
  const hs = Math.hypot(b.vel.x, b.vel.z);
  if (player && hs > 1.5 && b.onGround && !b.crouch) {
    const dp = dist2D(b.pos.x, b.pos.z, player.pos.x, player.pos.z);
    if (dp < 40) {
      b.stepPhase += hs * dt;
      if (b.stepPhase > 2.0) { b.stepPhase = 0; Sound.step(dp, panTo(b.pos.x, b.pos.z), insideBuilding(b.pos) ? 'hard' : 'soft'); if (dp < 30) soundCue(b.pos.x, b.pos.z, 'step'); }
    }
  }
}
function updateBot(b, dt) {
  if (!b.alive) {
    b.deadT += dt;
    poseCharacter(b, dt, 0);
    if (b.deadT > 60) b.model.root.visible = false;
    return;
  }
  if (b.mode === 'plane') {
    if (plane.t >= b.jumpTime || plane.done) {
      b.mode = 'freefall'; plane.pos(plane.t, b.pos); b.pos.y -= 4;
      b.vel.copy(plane.dir).multiplyScalar(30);
    } else return;
  }
  if (b.mode === 'freefall' || b.mode === 'chute') {
    const dx = b.drop.x - b.pos.x, dz = b.drop.z - b.pos.z, d = Math.hypot(dx, dz) || 1;
    const agl = b.pos.y - terrainH(b.pos.x, b.pos.z);
    const hs = b.mode === 'freefall' ? Math.min(36, d / 3) : Math.min(13, d / 2);
    const vs = b.mode === 'freefall' ? (d > 400 ? 30 : 55) : 6;
    b.vel.x += (dx / d * hs - b.vel.x) * Math.min(1, dt * 1.5);
    b.vel.z += (dz / d * hs - b.vel.z) * Math.min(1, dt * 1.5);
    b.vel.y = -vs;
    b.pos.addScaledVector(b.vel, dt);
    b.yaw = Math.atan2(-dx, -dz);
    if (b.mode === 'freefall' && agl < 140) b.mode = 'chute';
    const g = groundAt(b.pos.x, b.pos.z, b.pos.y);
    if (b.mode === 'chute' && b.pos.y - Math.max(g, SWIM_DEPTH) <= 5) {
      b.mode = 'ground'; b.vel.y = -2; b.onGround = false;
      b.landT = game.time; b.lootUntil = game.time + rnd(50, 130); b.thinkT = rnd(0.2, 1.0);
    }
    poseCharacter(b, dt, 0);
    return;
  }
  updateBotGround(b, dt);
  poseCharacter(b, dt, Math.hypot(b.vel.x, b.vel.z));
  if (b.model) { b.model.flash.visible = b.flashT > 0; if (b.flashT > 0) b.model.flash.rotation.z = Math.random() * TAU; }
}

// ================= 車両 =================
const vehicles = [];
const VEH = {};
function initVehicleAssets() {
  VEH.wheel = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 12).rotateZ(Math.PI / 2);
  VEH.glass = new THREE.MeshLambertMaterial({ color: 0x1f2b33 });
  VEH.tire = new THREE.MeshLambertMaterial({ color: 0x1c1c1c });
  VEH.light = new THREE.MeshBasicMaterial({ color: 0xfff4c8 });
  VEH.tail = new THREE.MeshBasicMaterial({ color: 0xc02020 });
  VEH.burnt = new THREE.MeshLambertMaterial({ color: 0x1e1b19 });
  VEH.trim = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
  VEH.bodies = [0x9c2f2a, 0x2f5f8f, 0xd8d2c0, 0x4f6b3a, 0x6b6e70, 0xc7972f, 0x3b3b3b].map((c) => new THREE.MeshLambertMaterial({ color: c }));
}
function makeVehicleMesh(kind) {
  const g = new THREE.Group();
  const body = VEH.bodies[Math.floor(Math.random() * VEH.bodies.length)];
  const box = (w, h, d, x, y, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  const parts = [];
  if (kind === 'buggy') {
    parts.push(box(1.7, 0.35, 3.4, 0, 0.62, 0, body));
    parts.push(box(1.5, 0.12, 0.12, 0, 1.55, 0.35, VEH.trim));
    for (const s of [-1, 1]) { box(0.08, 0.9, 0.08, s * 0.72, 1.1, 0.35, VEH.trim); box(0.08, 0.8, 0.08, s * 0.72, 1.05, -0.5, VEH.trim); }
    box(1.5, 0.1, 0.9, 0, 1.5, -0.08, VEH.trim);
    box(0.5, 0.35, 0.5, 0, 0.95, 1.2, VEH.trim);
  } else {
    parts.push(box(1.9, 0.62, 4.2, 0, 0.78, 0, body));
    parts.push(box(1.74, 0.55, 2.1, 0, 1.36, 0.25, VEH.glass));
    parts.push(box(1.76, 0.08, 1.9, 0, 1.66, 0.3, body));
    box(1.95, 0.18, 0.12, 0, 0.6, -2.12, VEH.trim); box(1.95, 0.18, 0.12, 0, 0.6, 2.12, VEH.trim);
  }
  const zf = kind === 'buggy' ? -1.72 : -2.11;
  box(0.32, 0.14, 0.04, -0.6, 0.85, zf, VEH.light); box(0.32, 0.14, 0.04, 0.6, 0.85, zf, VEH.light);
  box(0.3, 0.12, 0.04, -0.62, 0.85, -zf, VEH.tail); box(0.3, 0.12, 0.04, 0.62, 0.85, -zf, VEH.tail);
  const wheels = [];
  const wz = kind === 'buggy' ? 1.15 : 1.35;
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(sx * 0.95, 0.38, sz * wz); g.add(piv);
    const w = new THREE.Mesh(VEH.wheel, VEH.tire); w.castShadow = true; piv.add(w);
    wheels.push({ piv, w, front: sz < 0 });
  }
  scene.add(g);
  return { g, wheels, parts };
}
class Vehicle {
  constructor(x, z, yaw, kind) {
    this.kind = kind;
    this.pos = new THREE.Vector3(x, terrainH(x, z) + 0.05, z);
    this.yaw = yaw; this.speed = 0; this.vy = 0; this.steer = 0; this.pitch = 0; this.roll = 0;
    this.maxHp = kind === 'buggy' ? 450 : 600; this.hp = this.maxHp;
    this.driver = null; this.destroyed = false; this.sunk = false; this.burnT = 0;
    this.mesh = makeVehicleMesh(kind); this.wheelRot = 0;
    this.maxSpeed = kind === 'buggy' ? 31 : 28;
    this.syncMesh();
  }
  syncMesh() {
    const m = this.mesh.g;
    m.position.copy(this.pos); m.rotation.order = 'YXZ';
    m.rotation.set(this.pitch, this.yaw, this.roll);
  }
}
function spawnVehicles() {
  for (const v of vehicles) scene.remove(v.mesh.g);
  vehicles.length = 0;
  let tries = 0;
  while (vehicles.length < 42 && tries < 2000) {
    tries++;
    const r = pick(roads);
    const i = rndInt(1, r.pts.length - 2);
    const [x, z] = r.pts[i], [x2, z2] = r.pts[i + 1];
    if (onBridge(x, z)) continue;
    let near = false;
    for (const t of TOWNS) if (dist2D(x, z, t.x, t.z) < t.r * 0.55) { near = true; break; }
    if (near && Math.random() < 0.7) continue;
    for (const v of vehicles) if (dist2D(x, z, v.pos.x, v.pos.z) < 120) { near = true; break; }
    if (near) continue;
    const dx = x2 - x, dz = z2 - z, l = Math.hypot(dx, dz) || 1;
    const side = Math.random() < 0.5 ? -1 : 1;
    const vx = x + (-dz / l) * 6.2 * side, vz = z + (dx / l) * 6.2 * side;
    if (terrainH(vx, vz) < 1) continue;
    const yaw = Math.atan2(-dx, -dz) + (Math.random() < 0.5 ? 0 : Math.PI) + rnd(-0.3, 0.3);
    vehicles.push(new Vehicle(vx, vz, yaw, Math.random() < 0.35 ? 'buggy' : 'car'));
  }
  vehicles.forEach((v, i) => { v.id = i; settleVehicle(v); });
}
function settleVehicle(v) {
  const g = vehicleGround(v);
  v.pos.y = g.y; v.pitch = g.pitch; v.roll = g.roll; v.syncMesh();
}
const _vg = { y: 0, pitch: 0, roll: 0 };
function vehicleGround(v) {
  const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw), rx = Math.cos(v.yaw), rz = -Math.sin(v.yaw);
  const hl = 1.4, hw = 0.9, fy = v.pos.y + 1.2;
  const fl = groundAt(v.pos.x + fx * hl - rx * hw, v.pos.z + fz * hl - rz * hw, fy);
  const fr = groundAt(v.pos.x + fx * hl + rx * hw, v.pos.z + fz * hl + rz * hw, fy);
  const bl = groundAt(v.pos.x - fx * hl - rx * hw, v.pos.z - fz * hl - rz * hw, fy);
  const br = groundAt(v.pos.x - fx * hl + rx * hw, v.pos.z - fz * hl + rz * hw, fy);
  _vg.y = (fl + fr + bl + br) / 4;
  _vg.pitch = Math.atan2((fl + fr) / 2 - (bl + br) / 2, hl * 2);
  _vg.roll = Math.atan2((fr + br) / 2 - (fl + bl) / 2, hw * 2);
  return _vg;
}
const _cp = { x: 0, y: 0, z: 0 };
function updateVehicle(v, dt) {
  if (v.destroyed) {
    if (v.burnT > 0) { v.burnT -= dt; if (Math.random() < dt * 8) spawnParticles(v.pos.x + rnd(-1, 1), v.pos.y + 1.2, v.pos.z + rnd(-1, 1), Math.random() < 0.4 ? 'fire' : 'smoke', 2, 1.5, 2); }
    if (v.sunk && v.pos.y > -4) { v.pos.y -= dt * 0.6; v.syncMesh(); }
    return;
  }
  // オンライン：他人が運転している車は届いた位置へ補間するだけ
  if ((NET.mode === 'client' && v.driver !== player) || (NET.mode === 'host' && v.driver && v.driver.isRemote)) { applyNetVehicle(v, dt); return; }
  const drv = v.driver;
  if (!drv && Math.abs(v.speed) < 0.05 && v.vy === 0) return;
  let thr = 0, st = 0, brake = false;
  if (drv === player) { thr = clamp(input.move.y, -1, 1); st = clamp(input.move.x, -1, 1); brake = input.jumpHeld; }
  const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
  const maxF = v.maxSpeed * (input.sprint && drv ? 1.08 : 1);
  if (thr > 0.05) v.speed += (v.speed < -0.5 ? 22 : 10.5 * thr * (1 - Math.max(0, v.speed) / maxF * 0.55)) * dt;
  else if (thr < -0.05) v.speed -= (v.speed > 0.5 ? 22 : 7 * -thr) * dt;
  else { v.speed *= Math.pow(0.6, dt); if (Math.abs(v.speed) < 0.15) v.speed = 0; }
  if (brake) v.speed *= Math.pow(0.08, dt);
  v.speed -= Math.sin(v.pitch) * 9.8 * dt * 0.55;
  v.speed = clamp(v.speed, -9, maxF);
  v.steer = lerp(v.steer, st, Math.min(1, dt * 5));
  if (v.vy === 0) v.yaw -= v.steer * 1.75 * clamp(v.speed / 6, -1, 1) * (1 - 0.45 * Math.min(1, Math.abs(v.speed) / 30)) * dt;
  const ox = v.pos.x, oz = v.pos.z;
  v.pos.x += fx * v.speed * dt; v.pos.z += fz * v.speed * dt;
  // 衝突
  let hit = false;
  for (const k of [1.35, 0, -1.35]) {
    _cp.x = v.pos.x + fx * k; _cp.z = v.pos.z + fz * k; _cp.y = v.pos.y + 0.35;
    const bx = _cp.x, bz = _cp.z;
    if (collide(_cp, 1.0, 1.3)) { v.pos.x += _cp.x - bx; v.pos.z += _cp.z - bz; hit = true; }
  }
  for (const o of vehicles) {
    if (o === v || o.sunk) continue;
    const dx = v.pos.x - o.pos.x, dz = v.pos.z - o.pos.z, d = Math.hypot(dx, dz);
    if (d < 2.8 && d > 0.01) { v.pos.x += dx / d * (2.8 - d); v.pos.z += dz / d * (2.8 - d); hit = true; o.speed += v.speed * 0.3; }
  }
  if (hit) {
    const impact = Math.abs(v.speed);
    if (impact > 9) {
      damageVehicle(v, (impact - 9) * 12, drv);
      if (drv && impact > 15) damageSoldier(drv, (impact - 15) * 3, 'crash', null, 'crash', v.pos.x, v.pos.z);
      if (drv === player) { Sound.impact(0, 0, 'metal'); shakeCam(0.3); }
    }
    v.speed *= -0.25;
  }
  // 地面追従
  const g = vehicleGround(v);
  if (v.pos.y > g.y + 0.3) {
    v.vy -= GRAV * dt; v.pos.y += v.vy * dt;
    if (v.pos.y <= g.y) { if (v.vy < -12) damageVehicle(v, (-v.vy - 12) * 15, drv); v.pos.y = g.y; v.vy = 0; }
  } else {
    if (g.y > v.pos.y + 1.2) { v.pos.x = ox; v.pos.z = oz; v.speed *= -0.2; }
    else { v.pos.y = g.y; v.vy = 0; }
  }
  v.pitch = lerp(v.pitch, g.pitch, Math.min(1, dt * (v.vy === 0 ? 8 : 1)));
  v.roll = lerp(v.roll, g.roll, Math.min(1, dt * (v.vy === 0 ? 8 : 1)));
  // 水
  const th = terrainH(v.pos.x, v.pos.z);
  if (!onBridge(v.pos.x, v.pos.z) && th < -0.9) {
    v.speed *= Math.pow(0.15, dt);
    if (th < -2.0) { v.destroyed = true; v.sunk = true; if (NET.mode === 'client') NET.send({ t: 'vsunk', i: v.id }); if (drv) ejectFromVehicle(drv); if (drv === player) showCenter('車両が水没しました', 2); return; }
  }
  // 轢く
  if (Math.abs(v.speed) > 4) {
    for (const s of soldiers) {
      if (!s.alive || s === drv || s.mode !== 'ground') continue;
      const cx = v.pos.x + fx * Math.sign(v.speed) * 1.2, cz = v.pos.z + fz * Math.sign(v.speed) * 1.2;
      if (dist2D(s.pos.x, s.pos.z, cx, cz) < 1.9 && Math.abs(s.pos.y - v.pos.y) < 2) {
        damageSoldier(s, Math.abs(v.speed) * 7, 'crash', drv, 'vehicle', v.pos.x, v.pos.z);
        s.vel.x += fx * v.speed * 0.6; s.vel.z += fz * v.speed * 0.6; s.vel.y = 4;
        v.speed *= 0.8;
      }
    }
  }
  v.wheelRot -= v.speed * dt / 0.38;
  for (const w of v.mesh.wheels) { w.w.rotation.x = v.wheelRot; if (w.front) w.piv.rotation.y = -v.steer * 0.45; }
  v.syncMesh();
  if (drv) { drv.pos.set(v.pos.x, v.pos.y + 0.25, v.pos.z); drv.vel.set(fx * v.speed, 0, fz * v.speed); }
}
function damageVehicle(v, dmg, att) {
  if (v.destroyed || dmg <= 0) return;
  if (NET.mode === 'client') { if (att === player || v.driver === player) NET.send({ t: 'vdmg', i: v.id, d: r1(dmg) }); return; }
  v.hp -= dmg;
  if (v.driver === player) hudDirty = true;
  if (v.hp <= 0) explodeVehicle(v, att);
}
// 爆発の見た目(ホスト・クライアント共通)
function explodeFx(v) {
  v.destroyed = true; v.burnT = 14; v.hp = 0;
  for (const p of v.mesh.parts) p.material = VEH.burnt;
  spawnParticles(v.pos.x, v.pos.y + 1, v.pos.z, 'fire', 40, 10, 1.2);
  spawnParticles(v.pos.x, v.pos.y + 1.5, v.pos.z, 'smoke', 30, 5, 1.5);
  if (player) Sound.explosion(dist2D(v.pos.x, v.pos.z, player.pos.x, player.pos.z), panTo(v.pos.x, v.pos.z));
  if (player && dist2D(v.pos.x, v.pos.z, player.pos.x, player.pos.z) < 30) shakeCam(1);
  if (NET.mode === 'client' && v.driver === player) ejectFromVehicle(player);
}
function explodeVehicle(v, att) {
  if (NET.mode === 'host' && NET.inMatch) NET.broadcast({ t: 'vx', i: v.id });
  explodeFx(v);
  const drv = v.driver;
  if (drv) ejectFromVehicle(drv);
  for (const s of soldiers) {
    if (!s.alive || s.mode !== 'ground') continue;
    const d = Math.hypot(s.pos.x - v.pos.x, s.pos.y - v.pos.y, s.pos.z - v.pos.z);
    if (d < 7) damageSoldier(s, (1 - d / 7) * 140 + (s === drv ? 60 : 0), 'blast', att, 'explosion', v.pos.x, v.pos.z);
  }
}
function enterVehicle(p, v) {
  if (v.destroyed || v.driver) return;
  v.driver = p; p.vehicle = v; p.mode = 'vehicle';
  p.healing = null; p.reloadT = 0; p.adsHeld = false; p.crouch = false;
  p.yaw = v.yaw; p.pitch = -0.15;
  Sound.ui('door'); hudDirty = true;
}
function ejectFromVehicle(p) {
  const v = p.vehicle; if (!v) return;
  if (p === player && NET.mode === 'client') NET.send({ t: 'vexit', i: v.id, v: [v.id, r2(v.pos.x), r2(v.pos.y), r2(v.pos.z), r3(v.yaw), r3(v.pitch), r3(v.roll), r2(v.destroyed ? 0 : v.speed)] });
  v.driver = null; p.vehicle = null; p.mode = 'ground';
  const rx = Math.cos(v.yaw), rz = -Math.sin(v.yaw);
  for (const side of [-1, 1]) {
    p.pos.set(v.pos.x + rx * 1.9 * side, v.pos.y + 0.5, v.pos.z + rz * 1.9 * side);
    const bx = p.pos.x, bz = p.pos.z;
    collide(p.pos, 0.38, 1.8);
    if (Math.abs(p.pos.x - bx) + Math.abs(p.pos.z - bz) < 0.05) break;
  }
  p.pos.y = groundAt(p.pos.x, p.pos.z, p.pos.y + 1);
  p.vel.set(0, 0, 0); p.onGround = true;
  if (p.isPlayer) { Sound.ui('door'); hudDirty = true; Sound.setLoop('engine', 'osc', 0); }
}
const _vs = new THREE.Vector3();
const VHIT = { t: 1, v: null };
function hitVehicles(ax, ay, az, dx, dy, dz, maxT) {
  let best = maxT, bv = null;
  for (const v of vehicles) {
    if (v.sunk) continue;
    const ex = v.pos.x - ax, ez = v.pos.z - az;
    if (ex * ex + ez * ez > 4000 && Math.abs(ex) + Math.abs(ez) > Math.abs(dx) + Math.abs(dz) + 10) continue;
    const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
    for (const k of [-1.1, 0, 1.1]) {
      const t = segSphere(ax, ay, az, dx, dy, dz, v.pos.x + fx * k, v.pos.y + 0.6, v.pos.z + fz * k, 0.8);
      if (t >= 0 && t < best) { best = t; bv = v; }
    }
  }
  if (!bv) return null;
  VHIT.t = best; VHIT.v = bv; return VHIT;
}

// ================= 輸送機 =================
const plane = {
  mesh: null, start: new THREE.Vector3(), dir: new THREE.Vector3(1, 0, 0), speed: 120, alt: 650, t: 0, len: 8600, done: false, hideT: 0,
  pos(t, out) { return out.copy(this.start).addScaledVector(this.dir, this.speed * t).setY(this.alt); }
};
function buildPlaneMesh() {
  const g = new THREE.Group();
  const m = new THREE.MeshLambertMaterial({ color: 0x7d8571 });
  const d = new THREE.MeshLambertMaterial({ color: 0x4d5347 });
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 1.7, 30, 12), m); fus.rotation.x = Math.PI / 2; g.add(fus);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(2.3, 12, 8, 0, TAU, 0, Math.PI / 2), m); nose.rotation.x = -Math.PI / 2; nose.position.z = -15; g.add(nose);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(40, 0.5, 5), m); wing.position.set(0, 1.4, -2); g.add(wing);
  const tw = new THREE.Mesh(new THREE.BoxGeometry(13, 0.4, 3), m); tw.position.set(0, 1.5, 13.5); g.add(tw);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6, 4), m); fin.position.set(0, 4.2, 13); g.add(fin);
  const cock = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 2.2), new THREE.MeshLambertMaterial({ color: 0x223038 })); cock.position.set(0, 1.4, -13); g.add(cock);
  plane.props = [];
  for (const x of [-12, -6, 6, 12]) {
    const e = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 4, 10), d); e.rotation.x = Math.PI / 2; e.position.set(x, 0.6, -3.5); g.add(e);
    const pr = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.3, 0.1), d); pr.position.set(x, 0.6, -5.6); g.add(pr); plane.props.push(pr);
  }
  g.visible = false;
  scene.add(g);
  plane.mesh = g;
}
function setupPlane() {
  const a = Math.random() * TAU;
  plane.dir.set(Math.cos(a), 0, Math.sin(a));
  const off = rnd(-900, 900), px = -plane.dir.z, pz = plane.dir.x;
  plane.start.set(px * off - plane.dir.x * 4300, plane.alt, pz * off - plane.dir.z * 4300);
  plane.t = 0; plane.done = false; plane.hideT = 0;
  plane.tIn = -1; plane.tOut = plane.len / plane.speed;
  for (let t = 0; t <= plane.len / plane.speed; t += 0.5) if (planeInMap(t)) { if (plane.tIn < 0) plane.tIn = t; plane.tOut = t; }
  if (plane.tIn < 0) plane.tIn = 0;
  plane.mesh.visible = true;
  plane.mesh.rotation.y = Math.atan2(-plane.dir.x, -plane.dir.z);
  plane.pos(0, plane.mesh.position);
}
function planeInMap(t) {
  const p = plane.pos(t, _v1);
  return Math.abs(p.x) < 2850 && Math.abs(p.z) < 2850;
}
function updatePlane(dt) {
  if (!plane.mesh.visible) return;
  plane.t += dt;
  plane.pos(plane.t, plane.mesh.position);
  for (const p of plane.props) p.rotation.z += dt * 40;
  if (!plane.done && plane.t * plane.speed > plane.len) plane.done = true;
  if (plane.done) { plane.hideT += dt; if (plane.hideT > 30) plane.mesh.visible = false; }
}

// ================= 安全地帯 =================
const ZR = [1650, 1000, 620, 360, 190, 95, 42, 0];
const ZW = [110, 80, 65, 55, 45, 40, 30, 20];
const ZS = [130, 95, 80, 65, 50, 40, 35, 30];
const ZD = [0.4, 0.8, 1.6, 3, 5, 8, 11, 15];
const zone = { phase: -1, state: 'pre', timer: 0, cx: 0, cz: 0, r: 4300, fx: 0, fz: 0, fr: 0, nx: 0, nz: 0, nr: 4300, mesh: null, dmgT: 0 };
function buildZoneMesh() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: [
      'uniform float time; varying vec3 vW;',
      'void main(){',
      '  float s = sin(vW.y * 0.35 - time * 2.0) * 0.5 + 0.5;',
      '  float s2 = sin((vW.x + vW.z) * 0.02 + time * 0.6) * 0.5 + 0.5;',
      '  float a = 0.2 + 0.12 * s + 0.06 * s2;',
      '  gl_FragColor = vec4(0.22, 0.48, 1.0, a);',
      '}'
    ].join('\n'),
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false
  });
  zone.mesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 128, 1, true), mat);
  zone.mesh.frustumCulled = false; zone.mesh.renderOrder = 5;
  scene.add(zone.mesh);
}
function landFrac(x, z, r) {
  let n = 0;
  for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; if (terrainH(x + Math.cos(a) * r, z + Math.sin(a) * r) > 0.5) n++; }
  return n / 16;
}
function pickNextZone(r) {
  let best = null, bs = -1;
  for (let i = 0; i < 60; i++) {
    const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * Math.max(0, zone.r - r);
    const x = clamp(zone.cx + Math.cos(a) * d, -2700, 2700), z = clamp(zone.cz + Math.sin(a) * d, -2700, 2700);
    if (dist2D(x, z, zone.cx, zone.cz) > zone.r - r + 1) continue;
    const c = terrainH(x, z) > 1.5 ? 1 : 0;
    const s = c * 2 + landFrac(x, z, r * 0.5) + landFrac(x, z, r * 0.9) * 0.5;
    if (s > bs) { bs = s; best = { x, z }; }
    if (s >= 3.3) break;
  }
  if (!best) best = { x: zone.cx, z: zone.cz };
  zone.nx = best.x; zone.nz = best.z; zone.nr = r;
}
function resetZone() {
  zone.phase = 0; zone.state = 'wait'; zone.cx = 0; zone.cz = -150; zone.r = 4300;
  pickNextZone(ZR[0]);
  zone.timer = ZW[0] + 40;
}
function updateZone(dt) {
  if (zone.phase < 0) return;
  zone.timer -= dt;
  if (zone.state === 'wait' && zone.timer <= 0) {
    zone.state = 'shrink'; zone.timer = ZS[zone.phase];
    zone.fx = zone.cx; zone.fz = zone.cz; zone.fr = zone.r;
    showCenter('安全地帯の縮小が始まりました', 3, 'warn'); Sound.ui('warn');
  } else if (zone.state === 'shrink') {
    const k = 1 - clamp(zone.timer / ZS[zone.phase], 0, 1);
    zone.cx = lerp(zone.fx, zone.nx, k); zone.cz = lerp(zone.fz, zone.nz, k); zone.r = lerp(zone.fr, zone.nr, k);
    if (zone.timer <= 0) {
      zone.cx = zone.nx; zone.cz = zone.nz; zone.r = zone.nr;
      zone.phase++;
      if (zone.phase >= ZR.length) { zone.state = 'done'; zone.timer = 0; zone.phase = ZR.length - 1; zone.r = 0; }
      else { pickNextZone(ZR[zone.phase]); zone.state = 'wait'; zone.timer = ZW[zone.phase]; showCenter('次の安全地帯が表示されました', 3, 'warn'); Sound.ui('warn'); }
    }
  }
  // ダメージ(0.5秒ごと)
  zone.dmgT -= dt;
  if (zone.dmgT <= 0) {
    zone.dmgT = 0.5;
    const dps = ZD[clamp(zone.phase, 0, ZD.length - 1)];
    for (const s of soldiers) {
      if (!s.alive || (s.mode !== 'ground' && s.mode !== 'vehicle')) continue;
      if (dist2D(s.pos.x, s.pos.z, zone.cx, zone.cz) > zone.r) damageSoldier(s, dps * 0.5, 'zone', null, 'zone', zone.cx, zone.cz);
    }
  }
  zoneMeshUpdate();
}
function zoneMeshUpdate() {
  zone.mesh.visible = zone.r < 3400;
  zone.mesh.position.set(zone.cx, 0, zone.cz);
  zone.mesh.scale.set(Math.max(0.1, zone.r), 1400, Math.max(0.1, zone.r));
  zone.mesh.material.uniforms.time.value = game.time;
}

// ================= 入力 =================
const input = {
  move: { x: 0, y: 0 }, touchMove: { x: 0, y: 0 }, fire: false, sprint: false, autoSprint: false, lean: 0, jumpHeld: false,
  queue: new Set(),
  push(a) { this.queue.add(a); },
  consume(a) { if (this.queue.has(a)) { this.queue.delete(a); return true; } return false; }
};
const keys = {};
let adsDownT = 0;
function look(dx, dy, k) {
  const p = player; if (!p || game.state !== 'match' || game.paused) return;
  let s = k * settings.sens;
  if (p.mode === 'ground' && p.adsT > 0.5) s *= settings.adsSens * (camera.fov / settings.fov);
  p.yaw -= dx * s; p.pitch -= dy * s;
  p.pitch = clamp(p.pitch, -1.5, 1.5);
  vmState.swayX = clamp(vmState.swayX - dx * 0.00025, -0.04, 0.04);
  vmState.swayY = clamp(vmState.swayY + dy * 0.00025, -0.04, 0.04);
}
const KEY_ACTIONS = {
  Space: 'jump', KeyC: 'crouch', ControlLeft: 'crouch', KeyR: 'reload', KeyF: 'interact', KeyB: 'firemode',
  Digit1: 'slot0', Digit2: 'slot1', Digit3: 'slot2', KeyX: 'holster',
  KeyV: 'view', Digit4: 'heal_bandage', Digit5: 'heal_firstaid', Digit6: 'heal_medkit', Digit7: 'heal_drink'
};
window.addEventListener('keydown', (e) => {
  if (game.state !== 'match') return;
  if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
  keys[e.code] = true;
  if (e.repeat) return;
  if (e.code === 'Escape') { if (game.ui) closeUI(); else if (game.paused) resumeGame(); else pauseGame(); return; }
  if (game.paused) return;
  if (e.code === 'KeyM') { toggleMap(); return; }
  if (e.code === 'Tab' || e.code === 'KeyI') { toggleInv(); return; }
  if (game.ui) return;
  if (e.code === 'Space') input.jumpHeld = true;
  const a = KEY_ACTIONS[e.code];
  if (a) input.push(a);
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (e.code === 'Space') input.jumpHeld = false;
});
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; input.fire = false; input.jumpHeld = false; });
// マウス固定(ポインターロック)が使えない環境(iframe内など)では、ドラッグで視点を動かす
let noLock = false, everLocked = false;
const drag = { on: false, x: 0, y: 0, moved: 0, rightT: 0 };
function lockFailed() {
  if (everLocked || noLock) return;
  noLock = true;
  if (game.state === 'match') showCenter('マウス固定が使えない環境のため、ドラッグで視点を動かします', 3.5);
}
document.addEventListener('pointerlockerror', lockFailed);
canvas.addEventListener('mousedown', (e) => {
  if (game.state !== 'match' || useTouch()) return;
  if (document.pointerLockElement !== canvas && !noLock) { if (!game.paused && !game.ui) lockPointer(); return; }
  if (game.paused || game.ui) return;
  if (noLock) { drag.on = true; drag.x = e.clientX; drag.y = e.clientY; drag.moved = 0; }
  if (e.button === 0) input.fire = true;
  if (e.button === 2 && player) {
    if (noLock) drag.rightT = performance.now(); // 右ドラッグ=視点、右クリック=覗き込み切替
    else { player.adsHeld = !player.adsHeld; adsDownT = performance.now(); }
  }
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) input.fire = false;
  if (e.button === 2 && player) {
    if (noLock) { if (performance.now() - drag.rightT < 260 && drag.moved < 8) player.adsHeld = !player.adsHeld; }
    else if (performance.now() - adsDownT > 260) player.adsHeld = false;
  }
  if (!e.buttons) drag.on = false;
});
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas) look(e.movementX || 0, e.movementY || 0, 0.0021);
  else if (noLock && drag.on && game.state === 'match' && !game.ui) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
    look(dx, dy, 0.0042);
  }
});
canvas.addEventListener('wheel', (e) => {
  if (document.pointerLockElement !== canvas && !noLock) return;
  e.preventDefault();
  input.push(e.deltaY > 0 ? 'cycle+' : 'cycle-');
}, { passive: false });
function lockPointer() {
  if (noLock) return;
  if (!canvas.requestPointerLock) { lockFailed(); return; }
  try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => lockFailed()); } catch (e) { lockFailed(); }
}
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) everLocked = true;
  if (document.pointerLockElement !== canvas) {
    input.fire = false;
    if (game.state === 'match' && !game.ui && !game.paused && player && player.alive && !game.ended && !useTouch()) pauseGame();
  }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'match' && !game.ended) pauseGame(); });
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => { const n = Date.now(); if (n - lastTouchEnd < 320 && !e.target.closest('input,select,.scroll')) e.preventDefault(); lastTouchEnd = n; }, { passive: false });

// ---- タッチ操作 ----
const touchLayer = $('touch');
const T = { joyId: null, jx: 0, jy: 0, looks: new Map(), fires: new Set(), btns: new Map() };
const JOY_R = 58, DASH_OFF = 118, DASH_R = 36;
function dashZoneAt(x, y, show, lock) {
  const z = $('dashZone');
  z.style.left = x + 'px'; z.style.top = y + 'px';
  z.classList.toggle('on', show); z.classList.toggle('lock', lock);
  z.querySelector('span').textContent = lock ? 'ダッシュ固定中' : 'ダッシュ';
}
function joyIdleXY() {
  const it = LAYOUT_ITEMS.find((i) => i.k === 'joy'), L = layoutOf(it);
  return [L.x * innerWidth, L.y * innerHeight];
}
function placeJoyIdle() {
  const it = LAYOUT_ITEMS.find((i) => i.k === 'joy'), L = layoutOf(it), b = $('joyBase');
  b.style.left = (L.x * 100) + '%'; b.style.top = (L.y * 100) + '%';
  $('joyKnob').style.transform = 'translate(-50%,-50%)';
  const [x, y] = joyIdleXY();
  dashZoneAt(x, y - DASH_OFF, !!input.dashLock, !!input.dashLock);
}
function touchAction(act) {
  if (!player) return;
  switch (act) {
    case 'ads': player.adsHeld = !player.adsHeld; break;
    case 'jump': input.push('jump'); input.jumpHeld = true; break;
    case 'crouch': input.push('crouch'); break;
    case 'reload': input.push('reload'); break;
    case 'interact': input.push('interact'); break;
    case 'map': toggleMap(); break;
    case 'bag': toggleInv(); break;
    case 'pause': pauseGame(); break;
    case 'view': input.push('view'); break;
  }
}
touchLayer.addEventListener('touchstart', (e) => {
  e.preventDefault();
  Sound.init();
  if (game.state !== 'match' || game.paused) return;
  for (const t of e.changedTouches) {
    const el = t.target && t.target.closest ? t.target.closest('[data-act]') : null;
    if (el) {
      el.classList.add('on');
      const act = el.dataset.act;
      if (act === 'fire') { T.fires.add(t.identifier); T.looks.set(t.identifier, { x: t.clientX, y: t.clientY }); }
      else touchAction(act);
      T.btns.set(t.identifier, el);
      continue;
    }
    if (t.clientX < innerWidth * 0.45 && T.joyId === null) {
      T.joyId = t.identifier; T.jx = t.clientX; T.jy = t.clientY;
      input.dashLock = false; // スティックに触れたらダッシュ固定を解除
      const base = $('joyBase'); base.style.left = t.clientX + 'px'; base.style.top = t.clientY + 'px'; base.classList.add('on');
      $('joyKnob').style.transform = 'translate(-50%,-50%)';
      const air = player && (player.mode === 'ground' || player.mode === 'freefall');
      dashZoneAt(T.jx, T.jy - DASH_OFF, settings.autoDash && air, false);
    } else T.looks.set(t.identifier, { x: t.clientX, y: t.clientY });
  }
  input.fire = T.fires.size > 0;
}, { passive: false });
touchLayer.addEventListener('touchmove', (e) => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === T.joyId) {
      let dx = t.clientX - T.jx, dy = t.clientY - T.jy;
      if (settings.autoDash) {
        input.autoSprint = false;
        if (!input.dashLock && Math.hypot(dx, dy + DASH_OFF) < DASH_R + 8) {
          input.dashLock = true;
          dashZoneAt(T.jx, T.jy - DASH_OFF, true, true);
          if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) { /* 非対応 */ } }
        }
      } else input.autoSprint = -dy > JOY_R * 1.15 && Math.abs(dx) < JOY_R * 0.8;
      const d = Math.hypot(dx, dy);
      if (d > JOY_R) { dx = dx / d * JOY_R; dy = dy / d * JOY_R; }
      input.touchMove.x = dx / JOY_R; input.touchMove.y = -dy / JOY_R;
      $('joyKnob').style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      $('joyBase').classList.toggle('sprint', input.autoSprint);
    } else if (T.looks.has(t.identifier)) {
      const L = T.looks.get(t.identifier);
      look(t.clientX - L.x, t.clientY - L.y, 0.0052);
      L.x = t.clientX; L.y = t.clientY;
    }
  }
}, { passive: false });
function touchEnd(e) {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === T.joyId) {
      T.joyId = null; input.touchMove.x = input.touchMove.y = 0; input.autoSprint = false;
      $('joyBase').classList.remove('on', 'sprint');
      placeJoyIdle();
    }
    T.looks.delete(t.identifier); T.fires.delete(t.identifier);
    const el = T.btns.get(t.identifier);
    if (el) { el.classList.remove('on'); if (el.dataset.act === 'jump') input.jumpHeld = false; T.btns.delete(t.identifier); }
  }
  input.fire = T.fires.size > 0;
}
touchLayer.addEventListener('touchend', touchEnd, { passive: false });
touchLayer.addEventListener('touchcancel', touchEnd, { passive: false });
function resetTouch() {
  T.joyId = null; T.looks.clear(); T.fires.clear(); T.btns.forEach((el) => el.classList.remove('on')); T.btns.clear();
  input.touchMove.x = input.touchMove.y = 0; input.autoSprint = false; input.fire = false; input.dashLock = false;
  $('joyBase').classList.remove('on', 'sprint');
  placeJoyIdle();
}
function tap(el, fn) {
  if (!el) return;
  el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); Sound.init(); fn(e); }, { passive: false });
  el.addEventListener('click', (e) => { Sound.init(); fn(e); });
}
function readMoveInput() {
  if (input.dashLock) {
    // ダッシュ固定：前進し続ける(指を置いている間は左右だけ調整可)
    input.move.y = 1; input.move.x = T.joyId !== null ? clamp(input.touchMove.x, -0.6, 0.6) : 0;
  } else if (T.joyId !== null) { input.move.x = input.touchMove.x; input.move.y = input.touchMove.y; }
  else {
    input.move.x = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    input.move.y = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    input.autoSprint = false;
  }
  input.sprint = !!(keys.ShiftLeft || keys.ShiftRight);
  input.lean = (keys.KeyE ? 1 : 0) - (keys.KeyQ ? 1 : 0);
  if (player) player.holdBreath = input.sprint && player.adsT > 0.5;
}

// ================= 行動の処理 =================
function nearestVehicle(p, r) {
  let best = null, bd = r;
  for (const v of vehicles) {
    if (v.destroyed || v.driver) continue;
    const d = Math.hypot(v.pos.x - p.pos.x, v.pos.y - p.pos.y, v.pos.z - p.pos.z);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}
function interactContext() {
  const p = player; if (!p || !p.alive) return null;
  if (p.mode === 'plane') return planeInMap(plane.t) ? { kind: 'drop', label: '降下する' } : null;
  if (p.mode === 'freefall') return p.fallT > 1.5 ? { kind: 'chute', label: 'パラシュートを開く' } : null;
  if (p.mode === 'vehicle') return { kind: 'exit', label: '降車' };
  if (p.mode !== 'ground') return null;
  const list = nearestLootList(p, 2.4);
  const v = p.swimming ? null : nearestVehicle(p, 3.6);
  const top = list[0];
  if (top && (!v || top.d < 1.6)) return { kind: 'loot', label: '拾う：' + itemLabel(top.it), it: top.it };
  if (v) return { kind: 'enter', label: '乗車', v };
  return null;
}
function toggleView() {
  settings.view = settings.view === 'tps' ? 'fps' : 'tps';
  saveSettings(); hudDirty = true;
  showCenter(settings.view === 'tps' ? '三人称視点（TPS）' : '一人称視点（FPS）', 1.2);
  Sound.ui('click');
}
function isTPS(p) {
  if (settings.view !== 'tps' || !p.alive) return false;
  if (p.mode === 'ground') return !p.adsActive && (p.adsT || 0) < 0.05; // 覗き込み中は一人称
  return p.mode === 'freefall' || p.mode === 'chute';
}
function processActions() {
  const p = player;
  if (!p || !p.alive) { input.queue.clear(); return; }
  if (input.consume('view')) toggleView();
  if (p.mode === 'plane') {
    if (input.consume('jump') || input.consume('interact')) {
      if (planeInMap(plane.t)) dropFromPlane();
      else showCenter('島の上空に入ると降下できます', 1.5);
    }
  } else if (p.mode === 'freefall') {
    if (input.consume('interact')) input.push('jump');
  } else if (p.mode === 'vehicle') {
    if (input.consume('interact')) ejectFromVehicle(p);
  } else if (p.mode === 'ground') {
    if (input.consume('interact')) {
      const c = interactContext();
      if (c && c.kind === 'loot') pickupItem(p, c.it);
      else if (c && c.kind === 'enter') {
        if (NET.mode === 'client') NET.send({ t: 'venter', i: c.v.id }); // 乗れるかホストに確認
        else enterVehicle(p, c.v);
      }
    }
    for (let i = 0; i < 3; i++) if (input.consume('slot' + i)) { if (p.weapons[i]) equipSlot(i); else showCenter('スロット' + (i + 1) + 'は空です', 1); }
    if (input.consume('holster')) equipSlot(-1);
    const cyc = input.consume('cycle+') ? 1 : input.consume('cycle-') ? -1 : 0;
    if (cyc) {
      const order = [0, 1, 2, -1];
      let i = order.indexOf(p.slot);
      for (let k = 0; k < 4; k++) { i = (i + cyc + 4) % 4; const s = order[i]; if (s === -1 || p.weapons[s]) { equipSlot(s); break; } }
    }
    for (const k of HEAL_ORDER) if (input.consume('heal_' + k)) useHeal(p, k);
  }
  // ダッシュ固定は地上・降下中のみ
  if (p.mode !== 'ground' && p.mode !== 'freefall') input.dashLock = false;
  // 未使用の操作はstep()の最後でまとめて破棄する
}
function dropFromPlane() {
  const p = player;
  plane.pos(plane.t, p.pos); p.pos.y -= 5;
  p.vel.copy(plane.dir).multiplyScalar(30); p.vel.y = -5;
  p.mode = 'freefall'; p.fallT = 0;
  p.yaw = Math.atan2(-plane.dir.x, -plane.dir.z); p.pitch = -0.6;
  Sound.ui('chute'); hudDirty = true;
  showCenter('スカイダイブ！ 前進＋下を向くと速く降りられます', 2.5);
}

// ================= カメラ =================
let shake = 0;
function shakeCam(a) { shake = Math.min(1.2, shake + a); }
const _look = new THREE.Vector3();
let titleT = 0;
function setFog(far) {
  scene.fog.far = far; scene.fog.near = far * 0.12;
  if (Math.abs(camera.far - (far + 400)) > 1) { camera.far = far + 400; camera.updateProjectionMatrix(); }
}
function titleCamera(dt) {
  titleT += dt * 0.035;
  camera.position.set(Math.cos(titleT) * 2100, 430, Math.sin(titleT) * 2100 - 150);
  camera.lookAt(0, 30, -150);
  if (camera.fov !== 55) { camera.fov = 55; camera.updateProjectionMatrix(); }
  setFog(4200);
}
function updateCamera(dt) {
  const p = player;
  shake = Math.max(0, shake - dt * 2.5);
  let fov = settings.fov;
  game.tpsView = false;
  if (!p) return;
  if (p.mode === 'plane') {
    const t = plane.mesh.position;
    forwardVec(p.yaw, p.pitch, _v1);
    camera.position.set(t.x - _v1.x * 46, t.y - _v1.y * 46 + 9, t.z - _v1.z * 46);
    camera.lookAt(t.x, t.y + 3, t.z);
    setFog(Math.max(2800, Q().fog * 2));
  } else if (p.mode === 'vehicle' && p.vehicle) {
    const v = p.vehicle;
    _look.set(v.pos.x, v.pos.y + 1.8, v.pos.z);
    forwardVec(p.yaw, clamp(p.pitch, -0.9, 0.5), _v1);
    const cx = _look.x - _v1.x * 8, cz = _look.z - _v1.z * 8;
    const cy = Math.max(_look.y - _v1.y * 8 + 0.6, terrainH(cx, cz) + 0.8);
    _v2.set(cx, cy, cz);
    if (camera.position.distanceTo(_v2) > 25) camera.position.copy(_v2); else camera.position.lerp(_v2, Math.min(1, dt * 12));
    camera.lookAt(_look);
    setFog(Q().fog);
  } else if (!p.alive) {
    game.deadT = (game.deadT || 0) + dt;
    const a = game.deadT * 0.25;
    camera.position.set(p.pos.x + Math.sin(a) * 6, p.pos.y + 3.5 + game.deadT * 0.3, p.pos.z + Math.cos(a) * 6);
    camera.lookAt(p.pos.x, p.pos.y + 0.4, p.pos.z);
    setFog(Q().fog);
  } else {
    const [ay, ap] = aimAngles(p);
    const ex = p.pos.x + p.leanX, ey = p.pos.y + (p.eyeH || 1.62), ez = p.pos.z + p.leanZ;
    game.tpsView = isTPS(p);
    if (game.tpsView) {
      // 肩越しカメラ(壁・天井にめり込まないよう手前に寄せる)
      forwardVec(ay, ap, _v1);
      const air = p.mode !== 'ground';
      const back = air ? 5.5 : 3.0, side = air ? 0 : 0.6, up = air ? 1.0 : 0.34;
      const rx = Math.cos(ay), rz = -Math.sin(ay);
      let cx = ex - _v1.x * back + rx * side, cy = ey - _v1.y * back + up, cz = ez - _v1.z * back + rz * side;
      const h = raycast(ex, ey, ez, cx, cy, cz, false);
      if (h) { const t = Math.max(0, h.t - 0.15); cx = ex + (cx - ex) * t; cy = ey + (cy - ey) * t; cz = ez + (cz - ez) * t; }
      cy = Math.max(cy, terrainH(cx, cz) + 0.3);
      camera.position.set(cx, cy, cz);
      camera.rotation.set(ap, ay, 0);
    } else {
      camera.position.set(ex, ey, ez);
      camera.rotation.set(ap, ay, -(p.lean || 0) * 0.12);
    }
    if (p.mode === 'ground') {
      fov = lerp(settings.fov, zoomFov(settings.fov, adsZoom(p)), p.adsT * p.adsT * (3 - 2 * p.adsT));
      const agl = 0;
      setFog(Q().fog + agl);
    } else {
      const agl = p.pos.y - terrainH(p.pos.x, p.pos.z);
      setFog(Q().fog + Math.max(0, agl) * 2.2);
      fov = settings.fov + (p.mode === 'freefall' ? 8 : 0);
    }
  }
  if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake * 0.15; camera.position.y += (Math.random() - 0.5) * shake * 0.15; }
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
}

// ================= ビューモデル更新 =================
function updateViewModel(dt) {
  const p = player;
  const show = !!p && p.alive && p.mode === 'ground' && !p.swimming && game.state === 'match' && !game.tpsView;
  const key = show ? (p.weapon ? p.weapon.key : 'fists') : null;
  if (key !== vmState.key) {
    if (VM.cur) VM.cur.visible = false;
    VM.cur = key ? VM.models[key] : null;
    if (VM.cur) VM.cur.visible = true;
    vmState.key = key; vmState.lower = 1;
  }
  const scope = show && p.weapon && p.weapon.key !== 'pistol' ? p.weapon.scope : null;
  for (const k in VM.scopeMeshes) VM.scopeMeshes[k].visible = k === scope;
  if (!VM.cur) { VM.root.visible = false; return false; }
  const overlay = scope && SCOPES[scope].overlay && p.adsT > 0.82;
  VM.root.visible = !overlay;
  if (scope) VM.scopeMeshes[scope].position.set(0, 0, VM.cur.userData.scopeZ);
  if (vmState.ironFor !== VM.cur || vmState.ironScope !== scope) {
    vmState.ironFor = VM.cur; vmState.ironScope = scope;
    VM.cur.children.forEach((c) => { if (c.userData.iron) c.visible = !scope; });
  }
  const ads = p.adsT || 0;
  const moving = Math.hypot(p.vel.x, p.vel.z);
  if (p.onGround && moving > 0.5) vmState.bob += dt * moving * 1.7;
  const bobA = Math.min(1, moving / 5) * (1 - ads * 0.85);
  vmState.sprint = lerp(vmState.sprint, p.sprinting ? 1 : 0, Math.min(1, dt * 8));
  vmState.kick = Math.max(0, vmState.kick - dt * 9);
  vmState.punch = Math.max(0, vmState.punch - dt * 5);
  vmState.swayX *= Math.pow(0.002, dt); vmState.swayY *= Math.pow(0.002, dt);
  const lowerT = p.switchT > 0 ? 1 : 0;
  vmState.lower = lerp(vmState.lower, Math.max(lowerT, p.healing ? 0.85 : 0), Math.min(1, dt * (lowerT ? 14 : 7)));
  const pistol = key === 'pistol';
  const hip = pistol ? [0.13, -0.15, -0.4] : key === 'fists' ? [0, -0.02, -0.12] : [0.13, -0.16, -0.44];
  const adsP = [0, 0, pistol ? -0.34 : scope ? -0.2 : -0.24];
  let x = lerp(hip[0], adsP[0], ads), y = lerp(hip[1], adsP[1], ads), z = lerp(hip[2], adsP[2], ads);
  x += Math.sin(vmState.bob) * 0.013 * bobA + vmState.swayX * (1 - ads * 0.8);
  y += -Math.abs(Math.cos(vmState.bob)) * 0.015 * bobA + vmState.swayY * (1 - ads * 0.8) - vmState.lower * 0.28;
  z += vmState.kick * 0.045 * (1 - ads * 0.4) - vmState.punch * 0.22;
  let rx = vmState.kick * 0.06 - vmState.lower * 0.7, ry = 0, rz = 0;
  if (p.reloadT > 0 && p.reloadTotal > 0) {
    const ph = 1 - p.reloadT / p.reloadTotal, d = Math.sin(Math.min(1, ph) * Math.PI);
    rx -= d * 0.45; rz += d * 0.5; y -= d * 0.06; x -= d * 0.03;
  }
  const s = vmState.sprint * (1 - ads);
  rx -= s * 0.35; ry += s * 0.55; x -= s * 0.06; y -= s * 0.02;
  VM.root.position.set(x, y, z);
  VM.root.rotation.set(rx, ry, rz);
  vmState.flashT -= dt;
  VM.flash.visible = vmState.flashT > 0 && key !== 'fists';
  if (VM.flash.visible) { VM.flash.position.set(0, -0.05, VM.cur.userData.muzzle - 0.06); VM.flash.rotation.z = Math.random() * TAU; }
  vmFlashLight.intensity = Math.max(0, vmFlashLight.intensity - dt * 25);
  return VM.root.visible;
}

// ================= HUD =================
let hudDirty = true;
const textCache = new Map();
function setText(id, t) { if (textCache.get(id) === t) return; textCache.set(id, t); const el = $(id); if (el) el.textContent = t; }
function setHTML(id, t) { if (textCache.get(id) === t) return; textCache.set(id, t); const el = $(id); if (el) el.innerHTML = t; }
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let centerT = 0;
function showCenter(text, dur = 2, cls = '') {
  const el = $('centerMsg');
  el.textContent = text; el.className = 'show ' + cls;
  centerT = dur;
}
let hitT = 0;
function showHitmarker(head, kill) {
  const el = $('hitmarker');
  el.className = 'show' + (kill ? ' kill' : head ? ' head' : '');
  hitT = kill ? 0.35 : 0.16;
}
const KILL_HOW = { zone: '安全地帯', fall: '落下', vehicle: '車両', explosion: '爆発', crash: '衝突', disconnect: '切断' };
function addKillfeed(att, t, how, head) {
  const an = att && att !== t ? att.name : null;
  addKillfeedRaw(an, t.name, how, head, att === player || t === player);
  if (NET.mode === 'host' && NET.inMatch) NET.broadcast({ t: 'kf', a: an, v: t.name, w: how, h: head ? 1 : 0, ai: att ? att.netId : -1, vi: t.netId });
}
function addKillfeedRaw(an, vn, how, head, me) {
  const box = $('killfeed');
  const row = document.createElement('div');
  row.className = 'kf' + (me ? ' me' : '');
  const wname = WEAPONS[how] ? WEAPONS[how].name : KILL_HOW[how] || '素手';
  if (!an) row.innerHTML = `<b>${esc(vn)}</b><span class="how">${esc(wname)}</span>`;
  else row.innerHTML = `<b>${esc(an)}</b><span class="how">${head ? '◎ ' : ''}${esc(wname)}</span><b>${esc(vn)}</b>`;
  box.prepend(row);
  while (box.children.length > 5) box.lastChild.remove();
  setTimeout(() => row.classList.add('out'), 5200);
  setTimeout(() => row.remove(), 6000);
  hudDirty = true;
}
// 被弾方向 / 音の可視化
function edgeIndicator(container, x, z, cls, life) {
  if (!player) return;
  const a = Math.atan2(x - player.pos.x, -(z - player.pos.z));
  const heading = -player.yaw;
  const rel = a - heading;
  const el = document.createElement('div');
  el.className = 'ind ' + cls;
  el.style.transform = `translate(-50%,-50%) rotate(${rel}rad)`;
  $(container).appendChild(el);
  setTimeout(() => el.remove(), life);
}
let cueCount = 0;
function soundCue(x, z, kind) {
  if (!player || !player.alive || cueCount > 6) return;
  cueCount++; setTimeout(() => cueCount--, 700);
  edgeIndicator('cues', x, z, kind, 700);
}
let dmgFlash = 0;
function onPlayerDamaged(d, fx, fz, att) {
  dmgFlash = Math.min(1, dmgFlash + d / 40 + 0.15);
  if (att || (fx !== undefined && dist2D(fx, fz, player.pos.x, player.pos.z) > 2)) {
    if (att !== null || true) edgeIndicator('dmgDirs', fx, fz, 'dmg', 1200);
  }
  Sound.ui('hurt'); shakeCam(Math.min(0.4, d / 60));
  hudDirty = true;
}
function onPlayerDeath(att) {
  game.rank = aliveCount + 1;
  game.surviveTime = game.matchTime;
  game.ended = true; game.deadT = 0;
  game.killer = att ? att.name : null;
  if (player.vehicle) ejectFromVehicle(player);
  player.model.root.visible = true;
  closeUI();
  if (document.pointerLockElement) document.exitPointerLock();
  resetTouch();
  showCenter(att ? att.name + ' に倒されました' : '倒れてしまった…', 3, 'kill');
  setTimeout(() => showResult(false), 2800);
}
function onPlayerWin() {
  if (game.ended) return;
  game.ended = true; game.rank = 1; game.surviveTime = game.matchTime;
  Sound.ui('win');
  showCenter('最後の1人になった！', 3, 'win');
  closeUI();
  setTimeout(() => { if (document.pointerLockElement) document.exitPointerLock(); resetTouch(); showResult(true); }, 3000);
}

// ---- コンパス ----
const compass = $('compass'), cctx = compass.getContext('2d');
const DIRS = { 0: '北', 45: '北東', 90: '東', 135: '南東', 180: '南', 225: '南西', 270: '西', 315: '北西' };
let marker = null;
function drawCompass() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = compass.clientWidth, h = compass.clientHeight;
  if (compass.width !== Math.round(w * dpr)) { compass.width = Math.round(w * dpr); compass.height = Math.round(h * dpr); }
  cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cctx.clearRect(0, 0, w, h);
  const yaw = player.mode === 'vehicle' || player.mode === 'plane' ? -player.yaw : -aimAngles(player)[0];
  const heading = ((yaw / DEG) % 360 + 360) % 360;
  const span = 150, pxPerDeg = w / span;
  cctx.textAlign = 'center'; cctx.textBaseline = 'middle';
  for (let d = Math.floor((heading - span / 2) / 5) * 5; d <= heading + span / 2; d += 5) {
    const x = w / 2 + (d - heading) * pxPerDeg;
    const dd = ((d % 360) + 360) % 360;
    const edge = 1 - Math.abs(x - w / 2) / (w / 2);
    cctx.globalAlpha = Math.max(0, Math.min(1, edge * 1.6));
    cctx.fillStyle = '#fff';
    if (DIRS[dd] !== undefined) {
      cctx.font = (dd % 90 === 0 ? '700 15px' : '600 12px') + ' "Zen Kaku Gothic New", sans-serif';
      cctx.fillStyle = dd === 0 ? '#F2B134' : '#fff';
      cctx.fillText(DIRS[dd], x, h * 0.42);
    } else if (dd % 15 === 0) {
      cctx.font = '600 11px "Saira Condensed", sans-serif';
      cctx.fillText(String(dd), x, h * 0.42);
    } else cctx.fillRect(x - 0.5, h * 0.62, 1, 5);
  }
  cctx.globalAlpha = 1;
  if (marker) {
    const b = ((Math.atan2(marker.x - player.pos.x, -(marker.z - player.pos.z)) / DEG) % 360 + 360) % 360;
    let diff = ((b - heading + 540) % 360) - 180;
    const x = w / 2 + clamp(diff, -span / 2 + 3, span / 2 - 3) * pxPerDeg;
    cctx.fillStyle = '#F2B134';
    cctx.beginPath(); cctx.moveTo(x, h - 2); cctx.lineTo(x - 5, h - 10); cctx.lineTo(x + 5, h - 10); cctx.fill();
  }
  if (zone.phase >= 0 && dist2D(player.pos.x, player.pos.z, zone.nx, zone.nz) > zone.nr) {
    const b = ((Math.atan2(zone.nx - player.pos.x, -(zone.nz - player.pos.z)) / DEG) % 360 + 360) % 360;
    const diff = ((b - heading + 540) % 360) - 180;
    const x = w / 2 + clamp(diff, -span / 2 + 3, span / 2 - 3) * pxPerDeg;
    cctx.fillStyle = '#ffffff'; cctx.fillRect(x - 6, 2, 12, 3);
  }
  cctx.fillStyle = '#F2B134';
  cctx.beginPath(); cctx.moveTo(w / 2, h - 1); cctx.lineTo(w / 2 - 4, h - 7); cctx.lineTo(w / 2 + 4, h - 7); cctx.fill();
  cctx.font = '700 13px "Saira Condensed", sans-serif'; cctx.fillStyle = '#fff';
  cctx.fillText(String(Math.round(heading) % 360), w / 2, h * 0.86 - 2);
}

// ---- ミニマップ ----
const mm = $('minimap'), mctx = mm.getContext('2d');
const toMapPx = (v, size) => (v + HALF) / MAP * size;
function drawPlayerArrow(ctx, x, y, yaw, s) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-yaw);
  ctx.fillStyle = '#F2B134'; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.7, s * 0.8); ctx.lineTo(0, s * 0.4); ctx.lineTo(-s * 0.7, s * 0.8); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}
function drawZones(ctx, toX, toY, scale) {
  if (zone.phase < 0) return;
  ctx.lineWidth = 2;
  if (zone.state !== 'done') { ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.beginPath(); ctx.arc(toX(zone.nx), toY(zone.nz), Math.max(1, zone.nr * scale), 0, TAU); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(70,140,255,1)'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(toX(zone.cx), toY(zone.cz), Math.max(1, zone.r * scale), 0, TAU); ctx.stroke();
}
function drawMinimap() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const S = mm.clientWidth;
  if (mm.width !== Math.round(S * dpr)) { mm.width = mm.height = Math.round(S * dpr); }
  mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const range = player.mode === 'vehicle' ? 900 : player.mode === 'ground' ? 520 : 1600;
  const cx = player.pos.x, cz = player.pos.z;
  const src = range / MAP * MAPRES;
  mctx.fillStyle = '#204a5e'; mctx.fillRect(0, 0, S, S);
  mctx.drawImage(mapCanvas, (cx - range / 2 + HALF) / MAP * MAPRES, (cz - range / 2 + HALF) / MAP * MAPRES, src, src, 0, 0, S, S);
  const scale = S / range;
  const toX = (x) => S / 2 + (x - cx) * scale, toY = (z) => S / 2 + (z - cz) * scale;
  // 安全地帯の外を暗く
  if (zone.phase >= 0) {
    mctx.save(); mctx.beginPath(); mctx.rect(0, 0, S, S); mctx.arc(toX(zone.cx), toY(zone.cz), Math.max(0.5, zone.r * scale), 0, TAU, true);
    mctx.fillStyle = 'rgba(40,70,160,.32)'; mctx.fill('evenodd'); mctx.restore();
  }
  drawZones(mctx, toX, toY, scale);
  if (player.mode === 'plane' || player.mode === 'freefall') {
    const a = plane.start, b = _v1.copy(plane.start).addScaledVector(plane.dir, plane.len);
    mctx.strokeStyle = 'rgba(255,255,255,.7)'; mctx.setLineDash([6, 5]); mctx.lineWidth = 1.5;
    mctx.beginPath(); mctx.moveTo(toX(a.x), toY(a.z)); mctx.lineTo(toX(b.x), toY(b.z)); mctx.stroke(); mctx.setLineDash([]);
  }
  for (const v of vehicles) {
    if (v.destroyed) continue;
    const x = toX(v.pos.x), y = toY(v.pos.z);
    if (x < 0 || y < 0 || x > S || y > S) continue;
    if (dist2D(v.pos.x, v.pos.z, cx, cz) > 160) continue;
    mctx.fillStyle = '#d6e2ea'; mctx.fillRect(x - 2.5, y - 2.5, 5, 5);
  }
  if (marker) { mctx.fillStyle = '#F2B134'; const x = clamp(toX(marker.x), 4, S - 4), y = clamp(toY(marker.z), 4, S - 4); mctx.beginPath(); mctx.arc(x, y, 4, 0, TAU); mctx.fill(); }
  // チーム戦：味方の位置
  if (NET.mode !== 'off' && NET.team) for (const s of soldiers) {
    if (s === player || !s.alive || !isHuman(s) || s.mode === 'plane') continue;
    const x = clamp(toX(s.pos.x), 5, S - 5), y = clamp(toY(s.pos.z), 5, S - 5);
    mctx.fillStyle = '#7fd0ff'; mctx.strokeStyle = 'rgba(0,0,0,.7)'; mctx.lineWidth = 1.5;
    mctx.beginPath(); mctx.arc(x, y, 4.5, 0, TAU); mctx.fill(); mctx.stroke();
  }
  drawPlayerArrow(mctx, S / 2, S / 2, player.mode === 'plane' ? Math.atan2(-plane.dir.x, -plane.dir.z) : player.yaw, 7);
}

// ---- 大マップ ----
const bigmap = $('bigmap'), bctx = bigmap.getContext('2d');
function drawBigMap() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const S = Math.floor(Math.min(bigmap.parentElement.clientWidth, bigmap.parentElement.clientHeight));
  bigmap.style.width = bigmap.style.height = S + 'px';
  if (bigmap.width !== Math.round(S * dpr)) { bigmap.width = bigmap.height = Math.round(S * dpr); }
  bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  bctx.drawImage(mapCanvas, 0, 0, S, S);
  const scale = S / MAP;
  const toX = (x) => (x + HALF) * scale, toY = (z) => (z + HALF) * scale;
  if (zone.phase >= 0) {
    bctx.save(); bctx.beginPath(); bctx.rect(0, 0, S, S); bctx.arc(toX(zone.cx), toY(zone.cz), Math.max(0.5, zone.r * scale), 0, TAU, true);
    bctx.fillStyle = 'rgba(40,70,160,.3)'; bctx.fill('evenodd'); bctx.restore();
  }
  drawZones(bctx, toX, toY, scale);
  bctx.font = '600 11px "Saira Condensed", sans-serif'; bctx.fillStyle = 'rgba(255,255,255,.55)'; bctx.textAlign = 'left'; bctx.textBaseline = 'top';
  for (let i = 0; i < 6; i++) { bctx.fillText('ABCDEF'[i], toX(-HALF + i * 1000) + 4, 4); bctx.fillText(String(i + 1), 4, toY(-HALF + i * 1000) + 4); }
  bctx.textAlign = 'center'; bctx.textBaseline = 'middle';
  for (const t of TOWNS) {
    bctx.font = (t.r > 160 ? '900 14px' : '700 12px') + ' "Zen Kaku Gothic New", sans-serif';
    bctx.lineWidth = 3; bctx.strokeStyle = 'rgba(0,0,0,.65)'; bctx.strokeText(t.name, toX(t.x), toY(t.z));
    bctx.fillStyle = t.tier === 3 ? '#ffd27a' : '#ffffff'; bctx.fillText(t.name, toX(t.x), toY(t.z));
  }
  if (player.mode === 'plane' || player.mode === 'freefall') {
    const a = plane.start, b = _v1.copy(plane.start).addScaledVector(plane.dir, plane.len);
    bctx.strokeStyle = 'rgba(255,255,255,.85)'; bctx.setLineDash([8, 6]); bctx.lineWidth = 2;
    bctx.beginPath(); bctx.moveTo(toX(a.x), toY(a.z)); bctx.lineTo(toX(b.x), toY(b.z)); bctx.stroke(); bctx.setLineDash([]);
  }
  if (marker) {
    const x = toX(marker.x), y = toY(marker.z);
    bctx.fillStyle = '#F2B134'; bctx.strokeStyle = '#000'; bctx.lineWidth = 1.5;
    bctx.beginPath(); bctx.moveTo(x, y); bctx.lineTo(x - 7, y - 14); bctx.lineTo(x + 7, y - 14); bctx.closePath(); bctx.fill(); bctx.stroke();
  }
  if (NET.mode !== 'off' && NET.team) for (const s of soldiers) {
    if (s === player || !s.alive || !isHuman(s) || s.mode === 'plane') continue;
    bctx.fillStyle = '#7fd0ff'; bctx.strokeStyle = '#000'; bctx.lineWidth = 1.5;
    bctx.beginPath(); bctx.arc(toX(s.pos.x), toY(s.pos.z), 5, 0, TAU); bctx.fill(); bctx.stroke();
    bctx.font = '700 11px "Zen Kaku Gothic New", sans-serif'; bctx.fillStyle = '#fff'; bctx.fillText(s.name, toX(s.pos.x), toY(s.pos.z) - 12);
  }
  const pp = player.mode === 'plane' ? plane.mesh.position : player.pos;
  drawPlayerArrow(bctx, toX(pp.x), toY(pp.z), player.mode === 'plane' ? Math.atan2(-plane.dir.x, -plane.dir.z) : player.yaw, 9);
  const d = marker ? Math.round(dist2D(marker.x, marker.z, player.pos.x, player.pos.z)) + 'm' : '—';
  setText('mapInfo', 'マーカーまで ' + d + '　｜　タップ／クリックでマーカー設置');
}
function mapPointer(e) {
  const r = bigmap.getBoundingClientRect();
  const pt = e.changedTouches ? e.changedTouches[0] : e;
  const x = (pt.clientX - r.left) / r.width * MAP - HALF, z = (pt.clientY - r.top) / r.height * MAP - HALF;
  if (x < -HALF || z < -HALF || x > HALF || z > HALF) return;
  if (marker && dist2D(marker.x, marker.z, x, z) < MAP / r.width * 18) marker = null;
  else marker = { x, z };
  Sound.ui('click'); drawBigMap();
}
tap(bigmap, mapPointer);

// ---- UI(マップ/バッグ/ポーズ) ----
function openUI(name) {
  game.ui = name;
  input.fire = false; resetTouch();
  if (document.pointerLockElement) document.exitPointerLock();
  $('mapOverlay').classList.toggle('hidden', name !== 'map');
  $('invPanel').classList.toggle('hidden', name !== 'inv');
  if (name === 'map') drawBigMap();
  if (name === 'inv') buildInventory();
}
function closeUI() {
  if (!game.ui) return;
  game.ui = null;
  $('mapOverlay').classList.add('hidden'); $('invPanel').classList.add('hidden');
  if (game.state === 'match' && !game.paused && !game.ended && !useTouch()) lockPointer();
}
function toggleMap() { if (game.ui === 'map') closeUI(); else openUI('map'); }
function toggleInv() { if (!player || !player.alive) return; if (game.ui === 'inv') closeUI(); else openUI('inv'); }
function buildInventory() {
  const p = player;
  let h = '<div class="inv-grid"><section><h3>武器</h3>';
  for (let i = 0; i < 3; i++) {
    const w = p.weapons[i];
    h += `<div class="inv-w${p.slot === i ? ' act' : ''}" data-slot="${i}"><span class="k">${i + 1}</span>`;
    if (w) {
      const W = WEAPONS[w.key];
      h += `<b>${W.name}</b><small>${W.cls}・${AMMO[W.ammo].name}${w.scope ? '・' + SCOPES[w.scope].name : ''}</small><em>${w.mag}/${W.mag}</em>`;
      if (w.scope) h += `<button class="mini" data-unscope="${i}">スコープを外す</button>`;
      h += `<button class="mini" data-dropw="${i}">捨てる</button>`;
    } else h += '<small>空き</small>';
    h += '</div>';
  }
  h += '</section><section><h3>回復</h3>';
  for (const k of HEAL_ORDER) {
    h += `<button class="inv-h" data-heal="${k}" ${p.heals[k] ? '' : 'disabled'}><b>${HEALS[k].name}</b><em>×${p.heals[k]}</em><small>キー ${HEALS[k].keyN}</small></button>`;
  }
  h += '<h3>弾薬</h3><div class="inv-ammo">';
  for (const k in AMMO) h += `<div><i style="background:#${AMMO[k].color.toString(16).padStart(6, '0')}"></i>${AMMO[k].name}<em>${p.ammo[k]}</em></div>`;
  h += '</div><h3>防具</h3><div class="inv-ammo">';
  h += `<div>ベスト<em>${p.vest.lv ? 'Lv' + p.vest.lv + '（' + Math.ceil(p.vest.dur / VEST_DUR[p.vest.lv] * 100) + '%）' : 'なし'}</em></div>`;
  h += `<div>ヘルメット<em>${p.helmet.lv ? 'Lv' + p.helmet.lv + '（' + Math.ceil(p.helmet.dur / HELM_DUR[p.helmet.lv] * 100) + '%）' : 'なし'}</em></div>`;
  h += '</div></section></div>';
  $('invContent').innerHTML = h;
}
function invClick(e) {
  const t = e.target.closest('[data-heal],[data-slot],[data-unscope],[data-dropw]');
  if (!t || !player || !player.alive) return;
  const p = player;
  if (t.dataset.heal) { closeUI(); useHeal(p, t.dataset.heal); return; }
  if (t.dataset.unscope !== undefined) {
    const w = p.weapons[+t.dataset.unscope];
    if (w && w.scope) { addLoot('scope', w.scope, 1, p.pos.x + 0.4, groundAt(p.pos.x, p.pos.z, p.pos.y + 0.5) + 0.02, p.pos.z); w.scope = null; }
  } else if (t.dataset.dropw !== undefined) {
    const i = +t.dataset.dropw, w = p.weapons[i];
    if (w) { addLoot('weapon', w.key, 1, p.pos.x + 0.5, groundAt(p.pos.x, p.pos.z, p.pos.y + 0.5) + 0.02, p.pos.z, { scope: w.scope, mag: w.mag }); p.weapons[i] = null; if (p.slot === i) equipSlot(-1, true); }
  } else if (t.dataset.slot !== undefined) { if (p.weapons[+t.dataset.slot]) equipSlot(+t.dataset.slot); }
  Sound.ui('click'); hudDirty = true; buildInventory();
}
tap($('invContent'), invClick);

// ---- HUD毎フレーム/定期更新 ----
let hudTick = 0, lootSig = '';
function spreadNow(p) {
  const w = p.weapon; if (!w) return 1.2;
  const W = WEAPONS[w.key];
  const moving = Math.hypot(p.vel.x, p.vel.z) > 1;
  return (p.adsT > 0.7 ? W.ads : W.hip) * (moving ? 1.5 : 1) * (p.crouch ? 0.8 : 1) * (p.onGround ? 1 : 2.5) + (p.bloom || 0);
}
function updateHUD(dt) {
  const p = player;
  if (!p || game.state !== 'match') return;
  if (centerT > 0) { centerT -= dt; if (centerT <= 0) $('centerMsg').className = ''; }
  if (hitT > 0) { hitT -= dt; if (hitT <= 0) $('hitmarker').className = ''; }
  dmgFlash = Math.max(0, dmgFlash - dt * 1.4);
  $('dmgVignette').style.opacity = (dmgFlash * 0.9 + (p.alive && p.hp < 30 ? 0.25 + Math.sin(game.time * 5) * 0.08 : 0)).toFixed(3);
  const outZone = zone.phase >= 0 && p.alive && dist2D(p.pos.x, p.pos.z, zone.cx, zone.cz) > zone.r && (p.mode === 'ground' || p.mode === 'vehicle');
  $('zoneTint').classList.toggle('on', outZone);
  drawCompass();
  drawMinimap();
  // クロスヘア
  const ch = $('crosshair');
  const showCh = p.alive && p.mode === 'ground' && p.adsT < 0.6 && !p.swimming && !p.sprinting;
  ch.style.opacity = showCh ? '1' : '0';
  if (showCh) {
    const px = Math.tan(spreadNow(p) * DEG) / Math.tan(camera.fov * DEG / 2) * innerHeight / 2 + 5;
    ch.style.setProperty('--s', Math.min(80, px).toFixed(1) + 'px');
  }
  const sc = p.alive && p.weapon && p.weapon.scope && SCOPES[p.weapon.scope].overlay && p.adsT > 0.82 && p.mode === 'ground' && !game.tpsView;
  const so = $('scopeOverlay');
  so.classList.toggle('on', !!sc);
  if (sc) so.dataset.z = p.weapon.scope;
  // 回復リング
  const prog = $('progress');
  if (p.healing) {
    prog.classList.add('on');
    $('progressArc').style.strokeDashoffset = (276.5 * (p.healing.t / p.healing.total)).toFixed(1);
    setText('progressLabel', HEALS[p.healing.key].name + ' ' + p.healing.t.toFixed(1));
  } else prog.classList.remove('on');
  if (game.ui === 'map') { game.mapT = (game.mapT || 0) - dt; if (game.mapT <= 0) { game.mapT = 0.25; drawBigMap(); } }
  hudTick -= dt;
  if (hudTick > 0 && !hudDirty) return;
  hudTick = 0.1; hudDirty = false;
  if (game.ui === 'inv') buildInventory();
  setText('aliveCount', String(aliveCount));
  setText('killCount', String(p.kills));
  // 安全地帯の情報
  let zt = '';
  if (zone.state === 'wait') zt = '縮小まで ' + fmtTime(zone.timer);
  else if (zone.state === 'shrink') zt = '縮小中 ' + fmtTime(zone.timer);
  else if (zone.state === 'done') zt = '最終局面';
  const dz = dist2D(p.pos.x, p.pos.z, zone.state === 'done' ? zone.cx : zone.nx, zone.state === 'done' ? zone.cz : zone.nz) - (zone.state === 'done' ? zone.r : zone.nr);
  if (zone.phase >= 0 && dz > 0 && p.mode !== 'plane') zt += '　安全地帯まで ' + Math.round(dz) + 'm';
  setText('zoneInfo', zt);
  // 体力
  $('hpFill').style.width = clamp(p.hp, 0, 100) + '%';
  $('hpFill').classList.toggle('low', p.hp < 30);
  $('boostFill').style.width = clamp(p.boost, 0, 100) + '%';
  const armor = (id, a, maxArr, label) => {
    const el = $(id);
    el.classList.toggle('none', a.lv === 0);
    el.dataset.lv = a.lv;
    el.querySelector('.lv').textContent = a.lv ? label + a.lv : label + '−';
    el.querySelector('.bar i').style.width = (a.lv ? a.dur / maxArr[a.lv] * 100 : 0) + '%';
  };
  armor('helmIcon', p.helmet, HELM_DUR, 'ヘルメ');
  armor('vestIcon', p.vest, VEST_DUR, 'ベスト');
  // 武器スロット
  for (let i = 0; i < 3; i++) {
    const el = $('slot' + i), w = p.weapons[i];
    el.classList.toggle('act', p.slot === i);
    el.classList.toggle('empty', !w);
    if (w) {
      const W = WEAPONS[w.key];
      el.querySelector('.n').textContent = W.name + (w.scope ? ' ' + { reddot: '◉', x2: '×2', x4: '×4', x8: '×8' }[w.scope] : '');
      el.querySelector('.a').textContent = w.mag + ' / ' + p.ammo[W.ammo];
    } else { el.querySelector('.n').textContent = i === 2 ? 'ハンドガン' : '空き'; el.querySelector('.a').textContent = ''; }
  }
  const w = p.weapon;
  if (w) {
    const W = WEAPONS[w.key];
    setText('magCount', String(w.mag));
    setText('reserveCount', String(p.ammo[W.ammo]));
    setText('fireMode', p.reloadT > 0 ? 'リロード中' : W.auto ? (w.single ? '単発' : 'フルオート') : W.bolt ? 'ボルト' : '単発');
    $('ammoBox').classList.toggle('low', w.mag <= Math.ceil(W.mag * 0.2));
  } else { setText('magCount', '素手'); setText('reserveCount', ''); setText('fireMode', ''); $('ammoBox').classList.remove('low'); }
  for (const k of HEAL_ORDER) {
    const el = document.querySelector(`#healBar [data-heal="${k}"]`);
    el.querySelector('em').textContent = p.heals[k];
    el.classList.toggle('zero', p.heals[k] === 0);
  }
  // 状況に応じたUI
  const mode = p.alive ? (p.mode === 'ground' && p.swimming ? 'swim' : p.mode) : 'dead';
  document.body.dataset.mode = mode;
  const ctx = interactContext();
  const ib = $('btnInteract');
  if (ctx) { ib.classList.remove('hidden'); ib.querySelector('span').textContent = ctx.label; }
  else ib.classList.add('hidden');
  setText('tbView', settings.view === 'tps' ? 'TPS' : 'FPS');
  const keyHint = p.mode === 'plane' ? 'Space' : p.mode === 'freefall' ? 'Space' : 'F';
  setText('prompt', ctx && !useTouch() ? '［' + keyHint + '］ ' + ctx.label : '');
  // ルートリスト
  const list = p.mode === 'ground' && p.alive && !layoutEditing ? nearestLootList(p, 2.6).slice(0, useTouch() ? 4 : 6) : [];
  const sig = list.map((l) => l.it.kind + l.it.key + l.it.qty + (l.it.scope || '')).join('|');
  if (sig !== lootSig && !layoutEditing) {
    lootSig = sig;
    lootRows = list.map((l) => l.it);
    $('lootList').innerHTML = list.map((l, i) => `<div class="lr${i === 0 ? ' top' : ''}" data-i="${i}"><i style="background:#${lootColor(l.it).toString(16).padStart(6, '0')}"></i>${esc(itemLabel(l.it))}</div>`).join('');
  }
  // 降下中
  if (p.mode === 'plane' || p.mode === 'freefall' || p.mode === 'chute') {
    const agl = Math.max(0, Math.round(p.mode === 'plane' ? plane.alt - terrainH(plane.mesh.position.x, plane.mesh.position.z) : p.pos.y - terrainH(p.pos.x, p.pos.z)));
    setText('altText', '高度 ' + agl + 'm');
    setText('airHint', p.mode === 'plane' ? (planeInMap(plane.t) ? (useTouch() ? '「降下する」で飛び降りよう' : '［Space］で降下') : '島の上空へ向かっています…') :
      p.mode === 'freefall' ? (useTouch() ? 'スティック前＋下向きで急降下' : 'W＋下向きで急降下／［Space］で開傘') : 'パラシュート降下中');
    setText('airSpeed', p.mode === 'plane' ? '' : Math.round(Math.hypot(p.vel.x, p.vel.y, p.vel.z) * 3.6) + ' km/h');
  }
  if (p.mode === 'vehicle' && p.vehicle) {
    setText('vehSpeed', String(Math.round(Math.abs(p.vehicle.speed) * 3.6)));
    $('vehHpFill').style.width = (p.vehicle.hp / p.vehicle.maxHp * 100) + '%';
  }
  if (settings.showFps) setText('fps', fpsVal + ' FPS');
  const ni = netInfoText(), nel = $('netInfo');
  setText('netInfo', ni ? ni.t : '');
  nel.className = ni ? ni.c : '';
}
let lootRows = [];
tap($('lootList'), (e) => {
  const r = e.target.closest('[data-i]'); if (!r || !player || !player.alive || player.mode !== 'ground') return;
  const it = lootRows[+r.dataset.i]; if (it && it.alive) pickupItem(player, it);
  hudDirty = true;
});
for (let i = 0; i < 3; i++) tap($('slot' + i), () => { if (player && player.alive && player.mode === 'ground' && player.weapons[i]) equipSlot(player.slot === i ? -1 : i); });
document.querySelectorAll('#healBar [data-heal]').forEach((el) => tap(el, () => { if (player && player.mode === 'ground') useHeal(player, el.dataset.heal); }));
tap($('btnMapClose'), closeUI);
tap($('btnInvClose'), closeUI);
tap($('mmWrap'), () => { if (game.state === 'match' && useTouch()) toggleMap(); });

// ================= オンライン（友達とルーム／ホストが試合を計算するP2P方式） =================
const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const PEER_PREFIX = 'lastlanding-h1ro223-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_HUMANS = 8;
const MODES = ['plane', 'freefall', 'chute', 'ground', 'vehicle'];
const WKEYS = Object.keys(WEAPONS);
const ZSTATES = ['pre', 'wait', 'shrink', 'done'];
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
let nextLootId = 1;
const lootById = new Map();
let activeBots = bots;
const NET = {
  mode: 'off', peer: null, host: null, myId: 0, code: '', name: '', team: true,
  clients: [], nextId: 1, inMatch: false, applying: false, bulk: false,
  byId: new Map(), humanProxies: new Map(), sendT: 0, zoneT: 0, invT: 0, stT: 0, armorHold: 0,
  zt: null, roster: [], lobbyPlayers: [], endTimer: null,
  send(m) { if (this.host && this.host.open) { try { this.host.send(m); } catch (e) { /* 送信失敗 */ } } },
  broadcast(m) { for (const c of this.clients) if (c.conn.open) { try { c.conn.send(m); } catch (e) { /* 送信失敗 */ } } },
  toRemote(s, m) { if (s && s.conn && s.conn.open) { try { s.conn.send(m); } catch (e) { /* 送信失敗 */ } } }
};
const isHuman = (s) => !!s && (s.isPlayer || s.isRemote || s.isHumanProxy);

// ---- PeerJSの読み込み(オンラインを使う時だけ) ----
let peerLoading = null;
function loadPeerJS() {
  if (window.Peer) return Promise.resolve(true);
  if (peerLoading) return peerLoading;
  peerLoading = new Promise((res) => {
    const s = document.createElement('script');
    s.src = PEERJS_URL; s.async = true;
    s.onload = () => res(!!window.Peer);
    s.onerror = () => { peerLoading = null; res(false); };
    document.head.appendChild(s);
  });
  return peerLoading;
}
function netStatus(t, err) { const el = $('netStatus'); el.textContent = t || ''; el.classList.toggle('err', !!err); }
function randomCode() { let s = ''; for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return s; }
function netName() {
  const v = ($('netName').value || '').trim().slice(0, 12);
  const n = v || ('Player' + rndInt(10, 99));
  settings.netName = n; saveSettings();
  return n;
}

// ---- ロビー画面 ----
function openLobby() {
  showScreen('title', false); showScreen('result', false);
  showScreen('lobby', true);
  $('netName').value = settings.netName || '';
  refreshLobbyUI();
}
function closeLobby() {
  netLeave();
  showScreen('lobby', false); showScreen('title', true);
}
function refreshLobbyUI() {
  const inRoom = NET.mode !== 'off' && (NET.mode === 'host' ? !!NET.code : !!(NET.host && NET.host.open));
  $('lobbyStart').classList.toggle('hidden', inRoom);
  $('lobbyRoom').classList.toggle('hidden', !inRoom);
  if (!inRoom) return;
  $('roomCode').textContent = NET.code || '-----';
  const list = NET.mode === 'host'
    ? [{ id: 0, name: NET.name }].concat(NET.clients.map((c) => ({ id: c.id, name: c.name })))
    : NET.lobbyPlayers;
  $('roomList').innerHTML = list.map((p) => `<li>${p.id === 0 ? '<i>ホスト</i>' : ''}${esc(p.name)}${(NET.mode === 'host' ? p.id === 0 : p.id === NET.myId) ? '<em>あなた</em>' : ''}</li>`).join('') +
    `<li class="bots">Bot ×${TOTAL - list.length}</li>`;
  const host = NET.mode === 'host';
  $('btnNetStart').classList.toggle('hidden', !host);
  $('btnNetStart').disabled = NET.inMatch;
  $('btnNetStart').textContent = NET.inMatch ? '試合中…（終わるまで待ってね）' : '試合開始';
  $('netTeam').disabled = !host;
  $('netTeam').checked = NET.team;
}
function netLobbyBroadcast() {
  if (NET.mode !== 'host') return;
  const players = [{ id: 0, name: NET.name }].concat(NET.clients.map((c) => ({ id: c.id, name: c.name })));
  NET.broadcast({ t: 'lobby', code: NET.code, players, team: NET.team ? 1 : 0, busy: NET.inMatch ? 1 : 0 });
  refreshLobbyUI();
}

// ---- ホスト ----
async function netHost() {
  if (NET.mode !== 'off') return;
  netStatus('通信の準備中…');
  if (!(await loadPeerJS())) { netStatus('オンライン機能を読み込めませんでした。通信環境を確認してください', true); return; }
  NET.mode = 'host'; NET.name = netName(); NET.clients = []; NET.nextId = 1; NET.inMatch = false;
  const tryOpen = (left) => {
    const code = randomCode();
    let peer;
    try { peer = new window.Peer(PEER_PREFIX + code, { debug: 0 }); } catch (e) { netStatus('このブラウザはオンライン機能に対応していません', true); NET.mode = 'off'; return; }
    NET.peer = peer;
    peer.on('open', () => { NET.code = code; netStatus('ルームを作りました。友達にコードを伝えてね'); netLobbyBroadcast(); });
    peer.on('connection', netAccept);
    peer.on('disconnected', () => { if (NET.peer === peer && !peer.destroyed) { try { peer.reconnect(); } catch (e) { /* 再接続失敗 */ } } });
    peer.on('error', (e) => {
      if (NET.peer !== peer) return;
      if (e.type === 'unavailable-id' && left > 0) { try { peer.destroy(); } catch (err) { /* 無視 */ } tryOpen(left - 1); return; }
      if (e.type === 'peer-unavailable') return;
      netStatus('通信エラー：' + (e.type || e.message || e), true);
    });
  };
  tryOpen(3);
}
function netAccept(conn) {
  conn.on('open', () => {
    if (NET.inMatch) { try { conn.send({ t: 'busy' }); } catch (e) { /* 無視 */ } setTimeout(() => conn.close(), 400); return; }
    if (NET.clients.length >= MAX_HUMANS - 1) { try { conn.send({ t: 'full' }); } catch (e) { /* 無視 */ } setTimeout(() => conn.close(), 400); return; }
    const c = { id: NET.nextId++, name: 'Player', conn, soldier: null, shots: [] };
    NET.clients.push(c);
    conn.on('data', (m) => { try { netHostMsg(c, m); } catch (e) { console.error(e); } });
    conn.on('close', () => netClientGone(c));
    conn.on('error', () => netClientGone(c));
    try { conn.send({ t: 'welcome', id: c.id }); } catch (e) { /* 無視 */ }
    netLobbyBroadcast();
  });
}
function netClientGone(c) {
  const i = NET.clients.indexOf(c);
  if (i < 0) return;
  NET.clients.splice(i, 1);
  const s = c.soldier;
  if (s && s.alive && NET.inMatch) {
    if (s.vehicle && s.vehicle.driver === s) s.vehicle.driver = null;
    killSoldier(s, null, 'disconnect', false);
  }
  if (s) s.conn = null;
  if (game.state === 'match') showCenter(c.name + ' が退出しました', 2);
  netLobbyBroadcast();
}
function makeRemote(c) {
  const s = new Soldier(c.name, false);
  s.isRemote = true;
  s.model = makeCharacter(20 + c.id);
  attachTag(s);
  return s;
}
// ホスト：試合開始時に全員へ送る
function lootPack(it) { return [it.id, it.kind, it.key, it.qty, r2(it.x), r2(it.y), r2(it.z), it.scope || 0, it.mag || 0, it.dur === undefined ? -1 : Math.round(it.dur)]; }
function zonePack() { return [zone.phase, Math.max(0, ZSTATES.indexOf(zone.state)), r1(zone.timer), r1(zone.cx), r1(zone.cz), r1(zone.r), r1(zone.nx), r1(zone.nz), r1(zone.nr)]; }
function netSendStart() {
  if (NET.mode !== 'host') return;
  const roster = [{ id: 0, name: NET.name }].concat(NET.clients.filter((c) => c.soldier).map((c) => ({ id: c.id, name: c.name })));
  const base = {
    t: 'start', roster, nb: activeBots.length, team: NET.team ? 1 : 0, ac: aliveCount,
    plane: [r2(plane.start.x), r2(plane.start.z), r3(plane.dir.x), r3(plane.dir.z), plane.len, plane.tIn, plane.tOut], pt: r2(plane.t),
    ve: vehicles.map((v) => [v.id, r2(v.pos.x), r2(v.pos.y), r2(v.pos.z), r3(v.yaw), v.kind === 'buggy' ? 1 : 0]),
    z: zonePack()
  };
  const items = loot.filter((it) => it.alive).map(lootPack);
  for (const c of NET.clients) {
    if (!c.soldier || !c.conn.open) continue;
    try {
      c.conn.send(Object.assign({ id: c.id }, base));
      for (let i = 0; i < items.length; i += 150) c.conn.send({ t: 'lc', l: items.slice(i, i + 150) });
      c.conn.send({ t: 'lcd' });
    } catch (e) { /* 送信失敗 */ }
  }
}
function netEndMatch(winner) {
  if (NET.mode !== 'host' || !NET.inMatch) return;
  NET.inMatch = false;
  NET.broadcast({ t: 'end', w: winner || null });
  netLobbyBroadcast();
}
function checkWinner() {
  const alive = soldiers.filter((s) => s.alive);
  let winners = null;
  if (NET.mode !== 'off' && NET.team && alive.length && alive.every(isHuman)) winners = alive;
  else if (aliveCount <= 1) winners = alive.slice(0, 1);
  if (!winners) return;
  for (const w of winners) {
    if (w === player) onPlayerWin();
    else if (w.isRemote) NET.toRemote(w, { t: 'win' });
  }
  if (NET.mode === 'host' && NET.inMatch && !NET.endTimer) {
    const name = winners.length > 1 ? 'チーム' : winners[0] ? winners[0].name : null;
    NET.endTimer = setTimeout(() => { NET.endTimer = null; netEndMatch(name); }, 3500);
  }
}
// ホスト：クライアントからのメッセージ
function netHostMsg(c, m) {
  if (!m || typeof m !== 'object') return;
  const s = c.soldier;
  switch (m.t) {
    case 'hello': c.name = String(m.n || 'Player').slice(0, 12); netLobbyBroadcast(); break;
    case 'pi': try { c.conn.send({ t: 'po', c: m.c }); } catch (e) { /* 無視 */ } break;
    case 'st': {
      if (!s || !NET.inMatch || !s.alive || !Array.isArray(m.p)) return;
      const p = m.p;
      if (!s.tp) { s.tp = new THREE.Vector3(p[0], p[1], p[2]); s.pos.copy(s.tp); } else s.tp.set(p[0], p[1], p[2]);
      s.yaw = p[3]; s.pitch = p[4]; s.mode = MODES[p[5]] || 'ground'; s.crouch = !!p[6]; s.swimming = !!p[7];
      s.vel.set(p[8], p[9], p[10]);
      // 乗車の確認と位置情報の順番がずれても外れないよう、降車はvexitで行う(長く食い違う時だけ解除)
      if (s.mode !== 'vehicle' && s.vehicle) {
        s.vehMismatch = (s.vehMismatch || 0) + 1;
        if (s.vehMismatch > 60) { if (s.vehicle.driver === s) s.vehicle.driver = null; s.vehicle = null; }
      } else s.vehMismatch = 0;
      if (m.v && !s.vehicle) { const v = vehicles[m.v[0]]; if (v && !v.destroyed && (!v.driver || v.driver === s)) { v.driver = s; s.vehicle = v; } }
      if (m.v && s.vehicle && s.vehicle.id === m.v[0]) {
        const v = s.vehicle;
        v.nt = { x: m.v[1], y: m.v[2], z: m.v[3], yaw: m.v[4], pitch: m.v[5], roll: m.v[6] };
        v.speed = m.v[7]; v.steer = m.v[8];
      }
      break;
    }
    case 'inv': {
      if (!s) return;
      s.weapons = [0, 1, 2].map((i) => { const w = m.w && m.w[i]; return w && WEAPONS[w[0]] ? { key: w[0], mag: w[1] | 0, scope: SCOPES[w[2]] ? w[2] : null } : null; });
      s.slot = m.s >= 0 && m.s <= 2 && s.weapons[m.s] ? m.s : -1;
      if (m.am) for (const k in s.ammo) s.ammo[k] = Math.max(0, m.am[k] | 0);
      if (m.he) for (const k in s.heals) s.heals[k] = Math.max(0, m.he[k] | 0);
      break;
    }
    case 'shot': {
      if (!s || !s.alive || !Array.isArray(m.b) || !WEAPONS[m.w]) return;
      const W = WEAPONS[m.w];
      const dp = player ? dist2D(s.pos.x, s.pos.z, player.pos.x, player.pos.z) : 9999;
      m.b.slice(0, 12).forEach((b, i) => fireBullet(s, b[0], b[1], b[2], b[3], b[4], b[5], W.vel, W.dmg, m.w, dp < 450 && i === 0, 0, 0, 0));
      s.flashT = 0.05;
      if (player && dp < 1100) { Sound.shot(m.w, dp, panTo(s.pos.x, s.pos.z), false); if (dp < 260 && !(NET.team)) soundCue(s.pos.x, s.pos.z, 'shot'); }
      alertBots(s, 260);
      const b0 = m.b[0]; if (b0) netQueueShot(s, b0[0], b0[1], b0[2], b0[3], b0[4], b0[5], m.w);
      break;
    }
    case 'heal': {
      if (!s || !s.alive) return;
      if (m.k === 'bandage') s.hp = Math.min(75, s.hp + 10);
      else if (m.k === 'firstaid') s.hp = Math.max(s.hp, 75);
      else if (m.k === 'medkit') s.hp = 100;
      else if (m.k === 'drink') s.boost = Math.min(100, s.boost + 40);
      break;
    }
    case 'pick': {
      const it = lootById.get(m.i);
      if (!it || !it.alive || !s) return;
      if ((it.kind === 'vest' || it.kind === 'helmet') && !m.a) {
        const lv = +it.key; s[it.kind].lv = lv;
        s[it.kind].dur = it.dur !== undefined ? it.dur : (it.kind === 'vest' ? VEST_DUR[lv] : HELM_DUR[lv]);
      }
      it.qty = Math.max(0, m.q | 0);
      if (!m.a) removeLoot(it); else { lootDirty = true; NET.broadcast({ t: 'lupd', i: it.id, q: it.qty, a: 1 }); }
      break;
    }
    case 'drop': {
      if (!s) return;
      const ok = { weapon: WEAPONS, ammo: AMMO, heal: HEALS, scope: SCOPES }[m.k];
      if (!(ok ? ok[m.y] : (m.k === 'vest' || m.k === 'helmet') && m.y >= 1 && m.y <= 3)) return;
      const extra = {};
      if (m.s && SCOPES[m.s]) extra.scope = m.s;
      if (m.m) extra.mag = m.m | 0;
      if (m.d !== undefined && m.d !== null) extra.dur = +m.d;
      addLoot(m.k, m.y, Math.max(1, m.q | 0), +m.x, +m.h, +m.z, extra);
      break;
    }
    case 'dmg': {
      const t = NET.byId.get(m.i);
      if (!t || !s) return;
      const self = t === s;
      damageSoldier(t, Math.min(400, +m.b || 0), String(m.p || 'body'), self ? null : s, m.w || null, +m.fx || 0, +m.fz || 0);
      break;
    }
    case 'vdmg': { const v = vehicles[m.i]; if (v && s) damageVehicle(v, Math.min(600, +m.d || 0), s); break; }
    case 'venter': {
      const v = vehicles[m.i];
      const ok = !!v && !v.destroyed && !v.driver && s && s.alive;
      if (ok) { v.driver = s; s.vehicle = v; s.mode = 'vehicle'; v.nt = null; }
      NET.toRemote(s, { t: 'vok', i: m.i, ok: ok ? 1 : 0 });
      break;
    }
    case 'vexit': {
      const v = vehicles[m.i];
      if (v && s && v.driver === s) {
        v.driver = null;
        if (m.v) { v.pos.set(m.v[1], m.v[2], m.v[3]); v.yaw = m.v[4]; v.pitch = m.v[5]; v.roll = m.v[6]; v.speed = m.v[7]; v.syncMesh(); }
      }
      if (s) s.vehicle = null;
      break;
    }
    case 'vsunk': { const v = vehicles[m.i]; if (v && !v.destroyed) { v.destroyed = true; v.sunk = true; if (v.driver) { v.driver.vehicle = null; v.driver = null; } } break; }
  }
}
// ホスト：射撃の見た目を近くのクライアントへ
function netQueueShot(owner, ox, oy, oz, dx, dy, dz, wkey) {
  if (NET.mode !== 'host' || !NET.inMatch) return;
  for (const c of NET.clients) {
    const me = c.soldier;
    if (!me || me === owner || !c.conn.open) continue;
    if (dist2D(owner.pos.x, owner.pos.z, me.pos.x, me.pos.z) > 1100) continue;
    if (c.shots.length < 60) c.shots.push([owner.netId, r2(ox), r2(oy), r2(oz), r3(dx), r3(dy), r3(dz), WKEYS.indexOf(wkey)]);
  }
}
function soldierFlags(s) {
  return (s.alive ? 1 : 0) | (s.crouch ? 2 : 0) | (s.swimming ? 4 : 0) | (Math.max(0, MODES.indexOf(s.mode)) << 4);
}
function netHostTick(dt) {
  if (!NET.inMatch) return;
  NET.sendT -= dt; NET.zoneT -= dt;
  if (NET.zoneT <= 0) {
    NET.zoneT = 0.5;
    NET.broadcast({ t: 'z', z: zonePack(), pt: r2(plane.t), pd: plane.done ? 1 : 0, ac: aliveCount });
  }
  if (NET.sendT > 0) return;
  NET.sendT = 1 / 15;
  for (const c of NET.clients) {
    const me = c.soldier;
    if (!me || !c.conn.open) continue;
    const dc = c.conn.dataChannel;
    if (dc && dc.bufferedAmount > 256000) continue; // 回線が詰まっている時は間引く
    const so = [];
    for (const s of soldiers) {
      if (s === me || s.mode === 'plane') continue;
      if (dist2D(s.pos.x, s.pos.z, me.pos.x, me.pos.z) > 720 && !(NET.team && isHuman(s))) continue;
      const w = s.weapon;
      so.push([s.netId, r2(s.pos.x), r2(s.pos.y), r2(s.pos.z), r3(s.yaw), r3(s.pitch), soldierFlags(s), w ? WKEYS.indexOf(w.key) + 1 : 0, s.vest.lv, s.helmet.lv]);
    }
    const ve = [];
    for (const v of vehicles) {
      if (dist2D(v.pos.x, v.pos.z, me.pos.x, me.pos.z) > 650) continue;
      ve.push([v.id, r2(v.pos.x), r2(v.pos.y), r2(v.pos.z), r3(v.yaw), r3(v.pitch), r3(v.roll), r2(v.speed), Math.round(v.hp), (v.destroyed ? 1 : 0) | (v.sunk ? 2 : 0), v.driver ? v.driver.netId : -1]);
    }
    const msg = { t: 's', ac: aliveCount, so, ve, me: [r1(me.hp), r1(me.boost), me.vest.lv, Math.round(me.vest.dur), me.helmet.lv, Math.round(me.helmet.dur), me.kills, Math.round(me.damageDealt || 0)] };
    if (c.shots.length) { msg.sh = c.shots; c.shots = []; }
    try { c.conn.send(msg); } catch (e) { /* 送信失敗 */ }
  }
}
function updateRemote(r, dt) {
  if (!r.alive) { r.deadT = (r.deadT || 0) + dt; poseCharacter(r, dt, 0); return; }
  if (r.tp) {
    if (r.pos.distanceTo(r.tp) > 15) r.pos.copy(r.tp); else r.pos.lerp(r.tp, Math.min(1, dt * 14));
  }
  updateHealing(r, dt);
  r.flashT = Math.max(0, (r.flashT || 0) - dt);
  poseCharacter(r, dt, Math.hypot(r.vel.x, r.vel.z));
  if (r.model) { r.model.flash.visible = r.flashT > 0; if (r.flashT > 0) r.model.flash.rotation.z = Math.random() * TAU; }
}

// ---- クライアント ----
async function netJoin() {
  if (NET.mode !== 'off') return;
  const code = ($('netCode').value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 5) { netStatus('5文字のルームコードを入力してね', true); return; }
  netStatus('通信の準備中…');
  if (!(await loadPeerJS())) { netStatus('オンライン機能を読み込めませんでした。通信環境を確認してください', true); return; }
  NET.mode = 'client'; NET.name = netName(); NET.code = code; NET.myId = -1;
  let peer;
  try { peer = new window.Peer({ debug: 0 }); } catch (e) { netStatus('このブラウザはオンライン機能に対応していません', true); NET.mode = 'off'; return; }
  NET.peer = peer;
  let opened = false;
  const fail = (t) => { if (NET.peer !== peer) return; netStatus(t, true); netLeave(true); };
  const timer = setTimeout(() => { if (!opened) fail('つながりませんでした。コードと通信環境を確認してね'); }, 15000);
  peer.on('open', () => {
    netStatus('ルームに接続中…');
    const conn = peer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'json' });
    NET.host = conn;
    conn.on('open', () => {
      opened = true; clearTimeout(timer);
      conn.send({ t: 'hello', n: NET.name });
      netStatus('接続しました。ホストが試合を始めるのを待っています');
      refreshLobbyUI();
    });
    conn.on('data', (m) => { try { netClientMsg(m); } catch (e) { console.error(e); } });
    conn.on('close', () => { if (NET.peer === peer) netLost('ホストとの接続が切れました'); });
    conn.on('error', () => { if (NET.peer === peer) netLost('ホストとの接続が切れました'); });
  });
  peer.on('error', (e) => {
    if (e.type === 'peer-unavailable') fail('ルームが見つかりません。コードを確認してね');
    else if (!opened) fail('通信エラー：' + (e.type || e.message || e));
  });
}
function netLost(msg) {
  const wasMatch = game.state === 'match' || game.state === 'result';
  netLeave(true);
  if (wasMatch) toTitle();
  openLobby();
  netStatus(msg, true);
}
function netLeave(silent) {
  if (NET.endTimer) { clearTimeout(NET.endTimer); NET.endTimer = null; }
  const peer = NET.peer;
  NET.peer = null;
  try { if (NET.host) NET.host.close(); } catch (e) { /* 無視 */ }
  for (const c of NET.clients) { try { c.conn.close(); } catch (e) { /* 無視 */ } }
  try { if (peer) peer.destroy(); } catch (e) { /* 無視 */ }
  NET.host = null; NET.clients = []; NET.mode = 'off'; NET.inMatch = false; NET.code = ''; NET.lobbyPlayers = [];
  if (!silent) netStatus('');
  refreshLobbyUI();
}
function getHumanProxy(id, name) {
  let s = NET.humanProxies.get(id);
  if (!s) {
    s = new Soldier(name, false);
    s.isHumanProxy = true;
    s.model = makeCharacter(20 + id);
    attachTag(s);
    NET.humanProxies.set(id, s);
  }
  s.name = name;
  setTag(s);
  return s;
}
function startClientMatch(m) {
  Sound.init();
  clearLoot();
  bullets.length = 0;
  for (const p of parts) p.life = 0;
  // 車両
  for (const v of vehicles) scene.remove(v.mesh.g);
  vehicles.length = 0;
  for (const e of m.ve) {
    const v = new Vehicle(e[1], e[3], e[4], e[5] ? 'buggy' : 'car');
    v.id = e[0]; v.pos.y = e[2]; v.syncMesh();
    vehicles[e[0]] = v;
  }
  // 輸送機
  plane.start.set(m.plane[0], plane.alt, m.plane[1]); plane.dir.set(m.plane[2], 0, m.plane[3]).normalize();
  plane.len = m.plane[4]; plane.tIn = m.plane[5]; plane.tOut = m.plane[6];
  plane.t = m.pt; plane.done = false; plane.hideT = 0;
  plane.mesh.visible = true; plane.mesh.rotation.y = Math.atan2(-plane.dir.x, -plane.dir.z); plane.pos(plane.t, plane.mesh.position);
  // 安全地帯
  NET.zt = null; netApplyZone(m.z, true); zone.mesh.visible = true;
  NET.team = !!m.team;
  // 兵士(自分以外はホストから届く位置で動く表示用)
  NET.myId = m.id;
  for (const b of bots) { resetSoldier(b); b.reset(); b.alive = false; b.tp = null; }
  for (const s of NET.humanProxies.values()) { resetSoldier(s); s.tp = null; }
  soldiers.length = 0;
  NET.byId.clear();
  resetSoldier(player);
  player.netId = m.id; player.name = NET.name;
  soldiers.push(player); NET.byId.set(m.id, player);
  for (const r of m.roster) {
    if (r.id === m.id) continue;
    const s = getHumanProxy(r.id, r.name);
    s.netId = r.id; s.alive = true; s.mode = 'plane'; s.netSeen = -99;
    soldiers.push(s); NET.byId.set(r.id, s);
  }
  activeBots = bots.slice(0, m.nb);
  activeBots.forEach((b, i) => { b.netId = 100 + i; b.alive = true; b.mode = 'plane'; b.netSeen = -99; soldiers.push(b); NET.byId.set(b.netId, b); });
  aliveCount = m.ac;
  NET.inMatch = true;
  NET.stT = 0; NET.invT = 0;
  beginMatchCommon();
  if (!useTouch()) showCenter('画面をクリックすると操作できます', 3);
}
function netApplyZone(z, snap) {
  if (!z) return;
  const prevState = zone.state, prevPhase = zone.phase;
  zone.phase = z[0]; zone.state = ZSTATES[z[1]] || 'wait'; zone.timer = z[2];
  NET.zt = { cx: z[3], cz: z[4], r: z[5] };
  zone.nx = z[6]; zone.nz = z[7]; zone.nr = z[8];
  if (snap) { zone.cx = z[3]; zone.cz = z[4]; zone.r = z[5]; }
  if (!snap && game.state === 'match') {
    if (prevState === 'wait' && zone.state === 'shrink') { showCenter('安全地帯の縮小が始まりました', 3, 'warn'); Sound.ui('warn'); }
    else if (zone.phase > prevPhase && zone.state === 'wait') { showCenter('次の安全地帯が表示されました', 3, 'warn'); Sound.ui('warn'); }
  }
}
function netClientZone(dt) {
  if (NET.zt) {
    const k = Math.min(1, dt * 3);
    zone.cx = lerp(zone.cx, NET.zt.cx, k); zone.cz = lerp(zone.cz, NET.zt.cz, k); zone.r = lerp(zone.r, NET.zt.r, k);
  }
  zone.timer = Math.max(0, zone.timer - dt);
  zoneMeshUpdate();
}
function updateProxy(s, dt) {
  if (s.tp) {
    if (s.pos.distanceTo(s.tp) > 20) s.pos.copy(s.tp); else s.pos.lerp(s.tp, Math.min(1, dt * 12));
    if (s.tyaw !== undefined) s.yaw += wrapAngle(s.tyaw - s.yaw) * Math.min(1, dt * 12);
  }
  if (!s.alive) s.deadT = (s.deadT || 0) + dt;
  s.flashT = Math.max(0, (s.flashT || 0) - dt);
  poseCharacter(s, dt, s.netSpeed || 0);
  if (s.model) { s.model.flash.visible = s.flashT > 0 && s.alive; if (s.flashT > 0) s.model.flash.rotation.z = Math.random() * TAU; }
}
function applyNetVehicle(v, dt) {
  const t = v.nt;
  if (t) {
    const k = Math.min(1, dt * 12);
    if (Math.hypot(v.pos.x - t.x, v.pos.z - t.z) > 25) v.pos.set(t.x, t.y, t.z);
    else { v.pos.x = lerp(v.pos.x, t.x, k); v.pos.y = lerp(v.pos.y, t.y, k); v.pos.z = lerp(v.pos.z, t.z, k); }
    v.yaw += wrapAngle(t.yaw - v.yaw) * k; v.pitch = lerp(v.pitch, t.pitch, k); v.roll = lerp(v.roll, t.roll, k);
  }
  v.wheelRot -= v.speed * dt / 0.38;
  for (const w of v.mesh.wheels) { w.w.rotation.x = v.wheelRot; if (w.front) w.piv.rotation.y = -(v.steer || 0) * 0.45; }
  v.syncMesh();
}
function netClientMsg(m) {
  if (!m || typeof m !== 'object') return;
  NET.lastRecv = performance.now();
  switch (m.t) {
    case 'po': { const rtt = performance.now() - m.c; NET.rtt = NET.rtt ? NET.rtt * 0.7 + rtt * 0.3 : rtt; break; }
    case 'welcome': NET.myId = m.id; break;
    case 'lobby':
      NET.code = m.code; NET.lobbyPlayers = m.players || []; NET.team = !!m.team;
      refreshLobbyUI();
      if (m.busy && game.state !== 'match' && game.state !== 'result') netStatus('ホストは試合中です。終わるまで待ってね');
      break;
    case 'busy': netStatus('そのルームは試合中です。終わってから参加してね', true); netLeave(true); break;
    case 'full': netStatus('ルームが満員です（最大' + MAX_HUMANS + '人）', true); netLeave(true); break;
    case 'start': if (worldReady) startClientMatch(m); break;
    case 'lc': NET.applying = true; for (const e of m.l) addLoot(e[1], e[2], e[3], e[4], e[5], e[6], { id: e[0], scope: e[7] || null, mag: e[8] || 0, dur: e[9] >= 0 ? e[9] : undefined }); NET.applying = false; break;
    case 'lcd': lootDirty = true; break;
    case 'ladd': { const e = m.l; NET.applying = true; addLoot(e[1], e[2], e[3], e[4], e[5], e[6], { id: e[0], scope: e[7] || null, mag: e[8] || 0, dur: e[9] >= 0 ? e[9] : undefined }); NET.applying = false; break; }
    case 'lupd': { const it = lootById.get(m.i); if (it) { it.qty = m.q; if (!m.a) it.alive = false; lootDirty = true; } break; }
    case 'z': netApplyZone(m.z, false); if (Math.abs(plane.t - m.pt) > 1) plane.t = m.pt; if (m.pd) plane.done = true; aliveCount = m.ac; break;
    case 's': netApplySnapshot(m); break;
    case 'kf': addKillfeedRaw(m.a, m.v, m.w, m.h, m.ai === NET.myId || m.vi === NET.myId); break;
    case 'hit':
      showHitmarker(!!m.h, !!m.k); Sound.ui(m.h ? 'head' : 'hit');
      if (m.k) { Sound.ui('kill'); showCenter((m.h ? 'ヘッドショット ' : '') + (m.n || '') + ' を倒した', 2.2, 'kill'); }
      break;
    case 'dmg': if (player && player.alive) onPlayerDamaged(m.d || 10, m.fx, m.fz, true); break;
    case 'dead':
      if (!player.alive) break;
      player.alive = false; player.hp = 0; aliveCount = m.ac;
      onPlayerDeath(m.k ? { name: m.k } : null);
      game.rank = m.r || game.rank;
      break;
    case 'win': if (player.alive) onPlayerWin(); break;
    case 'end':
      NET.inMatch = false;
      if (game.state === 'match' && player.alive) onPlayerWin();
      netStatus('試合が終わりました。ホストの次の開始を待っています');
      break;
    case 'vok': {
      const v = vehicles[m.i];
      if (m.ok && v && player.alive && player.mode === 'ground') { v.driver = null; v.nt = null; enterVehicle(player, v); }
      else if (!m.ok) showCenter('その車両には乗れません', 1.2);
      break;
    }
    case 'vx': { const v = vehicles[m.i]; if (v && !v.destroyed) explodeFx(v); break; }
  }
}
function netApplySnapshot(m) {
  aliveCount = m.ac;
  const now = performance.now();
  for (const e of m.so) {
    const s = NET.byId.get(e[0]);
    if (!s || s === player) continue;
    if (!s.tp) { s.tp = new THREE.Vector3(e[1], e[2], e[3]); s.pos.copy(s.tp); s.yaw = e[4]; }
    else {
      const dts = Math.max(0.03, (now - (s.netT || now)) / 1000);
      s.vel.set((e[1] - s.tp.x) / dts, (e[2] - s.tp.y) / dts, (e[3] - s.tp.z) / dts);
      s.netSpeed = Math.min(12, Math.hypot(s.vel.x, s.vel.z));
      s.tp.set(e[1], e[2], e[3]);
    }
    s.netT = now; s.tyaw = e[4]; s.pitch = e[5];
    const f = e[6], was = s.alive;
    s.alive = !!(f & 1);
    if (was && !s.alive) { s.deadT = 0; if (s.model) s.model.deathT = 0; }
    s.crouch = !!(f & 2); s.swimming = !!(f & 4); s.mode = MODES[(f >> 4) & 7] || 'ground';
    s.vehicle = s.mode === 'vehicle' ? true : null;
    if (e[7]) { const key = WKEYS[e[7] - 1]; if (!s.weapons[0] || s.weapons[0].key !== key) s.weapons[0] = { key, mag: 1, scope: null }; s.slot = 0; } else s.slot = -1;
    s.vest.lv = e[8]; s.helmet.lv = e[9];
    s.netSeen = game.time;
  }
  for (const e of m.ve || []) {
    const v = vehicles[e[0]]; if (!v) continue;
    v.hp = e[8];
    if (v.driver === player) continue;
    v.nt = { x: e[1], y: e[2], z: e[3], yaw: e[4], pitch: e[5], roll: e[6] };
    v.speed = e[7];
    if ((e[9] & 1) && !v.destroyed) { if (e[9] & 2) { v.destroyed = true; v.sunk = true; } else explodeFx(v); }
    v.driver = e[10] >= 0 ? (NET.byId.get(e[10]) || true) : null;
  }
  if (m.me && player.alive) {
    const me = m.me;
    player.hp = me[0]; player.boost = me[1];
    if (game.time > NET.armorHold) { player.vest.lv = me[2]; player.vest.dur = me[3]; player.helmet.lv = me[4]; player.helmet.dur = me[5]; }
    player.kills = me[6]; game.damageDealt = me[7];
    hudDirty = true;
  }
  if (m.sh) for (const e of m.sh) {
    const s = NET.byId.get(e[0]); const key = WKEYS[e[7]];
    if (!s || !key) continue;
    const W = WEAPONS[key], dp = dist2D(e[1], e[3], player.pos.x, player.pos.z);
    fireBullet(s, e[1], e[2], e[3], e[4], e[5], e[6], W.vel, 0, key, dp < 450, 0, 0, 0, true);
    s.flashT = 0.06;
    if (dp < 1100) { Sound.shot(key, dp, panTo(e[1], e[3]), false); if (dp < 260 && !(NET.team && isHuman(s))) soundCue(e[1], e[3], 'shot'); }
  }
}
function netClientTick(dt) {
  if (!NET.inMatch || !player) return;
  NET.stT -= dt; NET.invT -= dt;
  // 通信の速さ(往復時間)を2秒ごとに計測
  NET.pingT = (NET.pingT || 0) - dt;
  if (NET.pingT <= 0) { NET.pingT = 2; NET.send({ t: 'pi', c: performance.now() }); }
  if (NET.stT <= 0 && player.alive) {
    NET.stT = 0.05;
    const p = player, v = p.vehicle && p.vehicle.driver === p ? p.vehicle : null;
    NET.send({
      t: 'st',
      p: [r2(p.pos.x), r2(p.pos.y), r2(p.pos.z), r3(p.yaw), r3(p.pitch), Math.max(0, MODES.indexOf(p.mode)), p.crouch ? 1 : 0, p.swimming ? 1 : 0, r1(p.vel.x), r1(p.vel.y), r1(p.vel.z)],
      v: v ? [v.id, r2(v.pos.x), r2(v.pos.y), r2(v.pos.z), r3(v.yaw), r3(v.pitch), r3(v.roll), r2(v.speed), r2(v.steer)] : null
    });
  }
  if (NET.invT <= 0 && player.alive) {
    NET.invT = 0.5;
    const p = player;
    NET.send({ t: 'inv', w: p.weapons.map((w) => (w ? [w.key, w.mag, w.scope || 0] : 0)), s: p.slot, am: p.ammo, he: p.heals });
  }
}
// クライアント側の変更をホストへ(ダメージ・物資)
function netClientDamage(t, base, part, att, wkey, fx, fz) {
  if (!t || t.netId === undefined) return;
  if (att !== player && t !== player) return;
  NET.send({ t: 'dmg', i: t.netId, b: r1(base), p: part, w: wkey || null, fx: r1(fx || 0), fz: r1(fz || 0) });
}
function netLootTouched(s, it) {
  if (it.id === undefined) return;
  if (NET.mode === 'client' && s === player) {
    if (it.kind === 'vest' || it.kind === 'helmet') NET.armorHold = game.time + 0.8;
    NET.send({ t: 'pick', i: it.id, q: it.qty, a: it.alive ? 1 : 0 });
  } else if (NET.mode === 'host' && NET.inMatch && it.alive) NET.broadcast({ t: 'lupd', i: it.id, q: it.qty, a: 1 });
}
// HUD用の通信状態
function netInfoText() {
  if (NET.mode === 'host' && NET.inMatch) return { t: 'ホスト・' + NET.clients.length + '人が接続中', c: '' };
  if (NET.mode === 'client' && NET.inMatch) {
    const silent = performance.now() - (NET.lastRecv || 0);
    if (silent > 2500) return { t: 'ホストの応答待ち…', c: 'bad' };
    const ms = Math.round(NET.rtt || 0);
    return { t: '通信 ' + (ms ? ms + 'ms' : '計測中'), c: ms > 250 ? 'bad' : ms > 120 ? 'mid' : '' };
  }
  return null;
}
function netTick(dt) {
  if (NET.mode === 'host') netHostTick(dt);
  else if (NET.mode === 'client') netClientTick(dt);
}

// ---- 味方の名札(チーム戦) ----
function attachTag(s) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const tex = new THREE.CanvasTexture(cv);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false, fog: false }));
  sp.scale.set(0.16, 0.04, 1); sp.position.y = 2.3; sp.renderOrder = 999; sp.visible = false;
  s.model.root.add(sp);
  s.tag = { sp, cv, tex, name: '' };
  setTag(s);
}
function setTag(s) {
  if (!s.tag || s.tag.name === s.name) return;
  const { cv, tex } = s.tag, ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, 256, 64);
  ctx.font = '700 30px "Zen Kaku Gothic New", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText('▼ ' + s.name, 128, 32);
  ctx.fillStyle = '#7fd0ff'; ctx.fillText('▼ ' + s.name, 128, 32);
  tex.needsUpdate = true; s.tag.name = s.name;
}
function updateTags() {
  for (const s of soldiers) if (s.tag) s.tag.sp.visible = NET.mode !== 'off' && NET.team && s !== player && s.alive;
}

// ---- ロビーのボタン ----
tap($('btnOnline'), openLobby);
tap($('btnLobbyClose'), closeLobby);
tap($('btnHost'), netHost);
tap($('btnJoin'), netJoin);
tap($('btnNetLeave'), () => { netLeave(); netStatus('ルームを抜けました'); });
tap($('btnNetStart'), () => { if (NET.mode === 'host' && !NET.inMatch && NET.code) startMatch(); });
// コピー(iframe内でクリップボードAPIが禁止されていても動く予備の方法つき)
function copyText(t) {
  const done = () => netStatus('コードをコピーしました');
  const fallback = () => {
    try {
      const ta = document.createElement('textarea');
      ta.value = t; ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-999px;top:0;opacity:0;-webkit-user-select:text;user-select:text;';
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, t.length);
      const ok = document.execCommand && document.execCommand('copy');
      ta.remove();
      if (ok) done(); else netStatus('コード：' + t + '（手動で伝えてね）');
    } catch (e) { netStatus('コード：' + t + '（手動で伝えてね）'); }
  };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, fallback);
    else fallback();
  } catch (e) { fallback(); }
}
tap($('btnCopyCode'), () => copyText(NET.code));
$('netTeam').addEventListener('change', (e) => { if (NET.mode === 'host') { NET.team = e.target.checked; netLobbyBroadcast(); } });
$('netCode').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); });

// ================= 画面・メニュー =================
function showScreen(id, on) { $(id).classList.toggle('hidden', !on); }
function pauseGame() {
  if (game.state !== 'match' || game.paused || game.ended) return;
  game.paused = true; input.fire = false; resetTouch();
  for (const k in keys) keys[k] = false; input.jumpHeld = false;
  if (game.ui) { game.ui = null; $('mapOverlay').classList.add('hidden'); $('invPanel').classList.add('hidden'); }
  if (document.pointerLockElement) document.exitPointerLock();
  showScreen('pauseMenu', true);
  Sound.stopLoops();
}
function resumeGame() {
  if (!game.paused) return;
  game.paused = false;
  showScreen('pauseMenu', false); showScreen('settings', false); showScreen('help', false);
  last = performance.now();
  if (!useTouch()) lockPointer();
}
function showResult(win) {
  $('scopeOverlay').classList.remove('on');
  game.state = 'result';
  Sound.stopLoops();
  $('resRank').textContent = '#' + game.rank;
  $('resTotal').textContent = '/ ' + TOTAL;
  $('resTitle').textContent = win ? (NET.mode !== 'off' && NET.team ? 'チームで最後まで生き残った' : '最後の1人として島に立った') : game.rank <= 10 ? 'あと少しで頂点だった' : '次こそ生き残ろう';
  $('btnAgain').textContent = NET.mode !== 'off' ? 'ロビーへ戻る' : 'もう一度出撃';
  $('btnToTitle').textContent = NET.mode !== 'off' ? 'ルームを抜ける' : 'タイトルへ';
  $('result').classList.toggle('win', win);
  $('resKills').textContent = player.kills;
  $('resDmg').textContent = Math.round(game.damageDealt);
  $('resTime').textContent = fmtTime(game.surviveTime);
  $('resKiller').textContent = !win && game.killer ? '倒した相手：' + game.killer : '';
  showScreen('hud', false); showScreen('touch', false);
  showScreen('result', true);
}
function toTitle() {
  $('scopeOverlay').classList.remove('on');
  game.state = 'title'; game.paused = false; game.ended = true;
  for (const id of ['hud', 'touch', 'pauseMenu', 'result', 'mapOverlay', 'invPanel', 'settings', 'help']) showScreen(id, false);
  game.ui = null;
  if (document.pointerLockElement) document.exitPointerLock();
  Sound.stopLoops();
  showScreen('title', true);
  VM.root.visible = false;
  if (zone.mesh) zone.mesh.visible = false;
  if (plane.mesh && !(NET.mode === 'host' && NET.inMatch)) plane.mesh.visible = false;
  for (const b of bots) if (b.model) b.model.root.visible = false;
}

// ---- 設定 ----
function applyQuality() {
  const q = Q();
  renderer.setPixelRatio(q.pr);
  const sh = q.shadow > 0;
  if (renderer.shadowMap.enabled !== sh || (sh && sun.shadow.mapSize.x !== q.shadow)) {
    renderer.shadowMap.enabled = sh; sun.castShadow = sh;
    if (sh) {
      sun.shadow.mapSize.set(q.shadow, q.shadow);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      const c = sun.shadow.camera; c.left = -75; c.right = 75; c.top = 75; c.bottom = -75; c.updateProjectionMatrix();
    }
    scene.traverse((o) => { if (o.material) { const m = Array.isArray(o.material) ? o.material : [o.material]; m.forEach((x) => (x.needsUpdate = true)); } });
  }
  resize();
}
function syncSettingsUI() {
  document.querySelectorAll('#setQuality button').forEach((b) => b.classList.toggle('act', +b.dataset.q === settings.quality));
  document.querySelectorAll('#setControls button').forEach((b) => b.classList.toggle('act', b.dataset.c === settings.controls));
  $('setSens').value = settings.sens; $('setSensV').textContent = settings.sens.toFixed(2);
  $('setAds').value = settings.adsSens; $('setAdsV').textContent = settings.adsSens.toFixed(2);
  $('setFov').value = settings.fov; $('setFovV').textContent = settings.fov;
  $('setVol').value = settings.volume; $('setVolV').textContent = Math.round(settings.volume * 100) + '%';
  $('setFps').checked = settings.showFps;
  $('setAutoReload').checked = settings.autoReload;
  $('setAutoPick').checked = settings.autoPickup;
  $('setAutoDash').checked = settings.autoDash;
  $('fps').classList.toggle('hidden', !settings.showFps);
}
document.querySelectorAll('#setQuality button').forEach((b) => tap(b, () => { settings.quality = +b.dataset.q; saveSettings(); applyQuality(); syncSettingsUI(); }));
document.querySelectorAll('#setControls button').forEach((b) => tap(b, () => { settings.controls = b.dataset.c; saveSettings(); syncSettingsUI(); applyControlsMode(); }));
const bindRange = (id, key, fn) => $(id).addEventListener('input', (e) => { settings[key] = +e.target.value; saveSettings(); syncSettingsUI(); if (fn) fn(); });
bindRange('setSens', 'sens'); bindRange('setAds', 'adsSens');
bindRange('setFov', 'fov'); bindRange('setVol', 'volume', () => Sound.setVolume(settings.volume));
$('setFps').addEventListener('change', (e) => { settings.showFps = e.target.checked; saveSettings(); syncSettingsUI(); });
const bindCheck = (id, key, fn) => $(id).addEventListener('change', (e) => { settings[key] = e.target.checked; saveSettings(); if (fn) fn(); });
bindCheck('setAutoReload', 'autoReload');
bindCheck('setAutoPick', 'autoPickup');
bindCheck('setAutoDash', 'autoDash', () => { input.dashLock = false; placeJoyIdle(); });
function applyControlsMode() { document.body.classList.toggle('touchmode', useTouch()); applyLayout(); if (game.state === 'match') showScreen('touch', useTouch()); }

// ================= ボタン配置(スマホ) =================
// x,y は画面に対する割合。a はどこを基準に置くか(c:中心 top:上辺中央 bottom:下辺中央 tl:左上 joy:スティック)
const LAYOUT_ITEMS = [
  { k: 'fire', id: 'tbFire', name: '射撃（右）', x: 0.87, y: 0.67 },
  { k: 'fireL', id: 'tbFireL', name: '射撃（左）', x: 0.2, y: 0.42 },
  { k: 'ads', id: 'tbAds', name: '覗く', x: 0.79, y: 0.42 },
  { k: 'jump', id: 'tbJump', name: 'ジャンプ', x: 0.95, y: 0.8 },
  { k: 'crouch', id: 'tbCrouch', name: 'しゃがむ', x: 0.83, y: 0.88 },
  { k: 'reload', id: 'tbReload', name: 'リロード', x: 0.74, y: 0.76 },
  { k: 'interact', id: 'btnInteract', name: '行動ボタン', x: 0.5, y: 0.62 },
  { k: 'map', id: 'tbMap', name: '地図', x: 0.76, y: 0.08 },
  { k: 'bag', id: 'tbBag', name: 'バッグ', x: 0.76, y: 0.2 },
  { k: 'pause', id: 'tbPause', name: 'ポーズ', x: 0.035, y: 0.08 },
  { k: 'view', id: 'tbView', name: '視点切替（FPS/TPS）', x: 0.955, y: 0.6 },
  { k: 'mini', id: 'topRight', name: 'ミニマップ・縮小表示', x: 0.91, y: 0.02, a: 'top' },
  { k: 'slots', id: 'slots', name: '武器スロット', x: 0.5, y: 0.8 },
  { k: 'heal', id: 'healBar', name: '回復アイテム', x: 0.045, y: 0.58 },
  { k: 'loot', id: 'lootList', name: '近くの物資', x: 0.62, y: 0.16, a: 'top' },
  { k: 'hp', id: 'bottom', name: '体力・防具', x: 0.5, y: 0.985, a: 'bottom' },
  { k: 'feed', id: 'killfeed', name: 'キルログ', x: 0.085, y: 0.15, a: 'tl' },
  { k: 'joy', id: 'joyBase', name: 'スティック（待機位置）', x: 0.2, y: 0.7, a: 'joy' }
];
const ANCHOR_TF = { c: 'translate(-50%,-50%)', top: 'translate(-50%,0)', bottom: 'translate(-50%,-100%)', tl: 'translate(0,0)' };
const ANCHOR_OR = { c: '50% 50%', top: '50% 0', bottom: '50% 100%', tl: '0 0' };
let layoutEditing = false, laySel = null, layDrag = null, layRestore = [], layHud = null, layBarPos = 'bot';
// 編集バーの位置(上・中央・下)。選んだ部品と重ならない側へ自動で逃げる
function setBarPos(pos) {
  layBarPos = pos;
  $('layoutEditor').classList.toggle('barMid', pos === 'mid');
  $('layoutEditor').classList.toggle('barBottom', pos === 'bot');
}
function layoutOf(it) {
  const L = settings.layout[it.k] || {};
  return { x: L.x ?? it.x, y: L.y ?? it.y, s: L.s ?? 1, o: L.o ?? 1, h: !!L.h };
}
function setLay(it, patch) { settings.layout[it.k] = Object.assign(layoutOf(it), patch); }
function applyLayout() {
  const on = useTouch() || layoutEditing;
  for (const it of LAYOUT_ITEMS) {
    const el = $(it.id); if (!el) continue;
    el.dataset.lay = it.k;
    el.classList.toggle('layHidden', on && layoutOf(it).h); // 非表示(ボタン無効化)
    if (!on) { for (const pr of ['left', 'top', 'right', 'bottom', 'transform', 'transformOrigin', 'opacity']) el.style[pr] = ''; continue; }
    const L = layoutOf(it), a = it.a || 'c';
    el.style.right = 'auto'; el.style.bottom = 'auto';
    if (a === 'joy') {
      if (T.joyId === null) { el.style.left = (L.x * 100) + '%'; el.style.top = (L.y * 100) + '%'; }
      el.style.transform = 'scale(' + L.s + ')';
    } else {
      el.style.left = (L.x * 100) + '%'; el.style.top = (L.y * 100) + '%';
      el.style.transform = ANCHOR_TF[a] + ' scale(' + L.s + ')';
      el.style.transformOrigin = ANCHOR_OR[a];
      el.style.opacity = L.o < 1 ? String(L.o) : '';
    }
  }
}
function hitLay(x, y) {
  let best = null, ba = Infinity;
  for (const it of LAYOUT_ITEMS) {
    const el = $(it.id); if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 6 && y <= r.bottom + 6) {
      const area = r.width * r.height;
      if (area < ba) { ba = area; best = it; }
    }
  }
  return best;
}
function selectLay(it) {
  laySel = it;
  document.querySelectorAll('.laySel').forEach((e) => e.classList.remove('laySel'));
  const has = !!it;
  $('laySize').disabled = !has; $('layOpa').disabled = !has || it.k === 'joy'; $('layHide').disabled = !has;
  $('layHide').textContent = has && layoutOf(it).h ? '表示に戻す' : '非表示にする';
  if (has) {
    $(it.id).classList.add('laySel');
    const L = layoutOf(it);
    $('layName').textContent = it.name;
    $('laySize').value = L.s; $('layOpa').value = L.o;
    setBarPos(L.y > 0.6 ? 'top' : 'bot');
  } else $('layName').textContent = '動かしたい部品をドラッグ';
}
function openLayoutEditor() {
  layoutEditing = true;
  layRestore = ['title', 'pauseMenu', 'settings', 'result'].filter((id) => !$(id).classList.contains('hidden'));
  layRestore.forEach((id) => showScreen(id, false));
  layHud = { hud: $('hud').classList.contains('hidden'), touch: $('touch').classList.contains('hidden') };
  showScreen('hud', true); showScreen('touch', true);
  document.body.classList.add('layoutEdit');
  $('lootList').innerHTML = '<div class="lr top"><i style="background:#5fa34a"></i>5.56mm弾 ×30</div><div class="lr"><i style="background:#2b2e2c"></i>VX-4</div><div class="lr"><i style="background:#eae2cf"></i>包帯 ×5</div>';
  $('btnInteract').querySelector('span').textContent = '拾う：VX-4';
  if (!$('killfeed').children.length) $('killfeed').innerHTML = '<div class="kf demo"><b>Player</b><span class="how">VX-4</span><b>Enemy</b></div>';
  applyLayout(); selectLay(null); setBarPos('bot');
  showScreen('layoutEditor', true);
}
function closeLayoutEditor() {
  layoutEditing = false;
  document.body.classList.remove('layoutEdit');
  showScreen('layoutEditor', false);
  if (layHud.hud) showScreen('hud', false);
  if (layHud.touch) showScreen('touch', false);
  document.querySelectorAll('.kf.demo').forEach((e) => e.remove());
  $('lootList').innerHTML = ''; lootSig = ''; hudDirty = true;
  selectLay(null);
  saveSettings(); applyLayout(); placeJoyIdle();
  layRestore.forEach((id) => showScreen(id, true));
  syncSettingsUI();
}
const layEl = $('layoutEditor');
layEl.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.layBar')) return;
  e.preventDefault();
  const it = hitLay(e.clientX, e.clientY);
  selectLay(it);
  if (it) {
    const L = layoutOf(it);
    layDrag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: L.x, y: L.y };
    try { layEl.setPointerCapture(e.pointerId); } catch (err) { /* 無視 */ }
  }
});
layEl.addEventListener('pointermove', (e) => {
  if (!layDrag || e.pointerId !== layDrag.id || !laySel) return;
  e.preventDefault();
  const x = clamp(layDrag.x + (e.clientX - layDrag.sx) / innerWidth, 0.01, 0.99);
  const y = clamp(layDrag.y + (e.clientY - layDrag.sy) / innerHeight, 0.01, 0.995);
  setLay(laySel, { x, y }); applyLayout();
  if (laySel.k === 'joy') placeJoyIdle();
});
const layUp = (e) => { if (layDrag && e.pointerId === layDrag.id) { layDrag = null; saveSettings(); if (laySel) setBarPos(layoutOf(laySel).y > 0.6 ? 'top' : 'bot'); } };
layEl.addEventListener('pointerup', layUp);
layEl.addEventListener('pointercancel', layUp);
$('laySize').addEventListener('input', (e) => { if (laySel) { setLay(laySel, { s: +e.target.value }); applyLayout(); } });
$('layOpa').addEventListener('input', (e) => { if (laySel) { setLay(laySel, { o: +e.target.value }); applyLayout(); } });
tap($('layReset'), () => { settings.layout = {}; saveSettings(); applyLayout(); placeJoyIdle(); selectLay(null); });
tap($('layDone'), closeLayoutEditor);
tap($('layFlip'), () => setBarPos({ top: 'mid', mid: 'bot', bot: 'top' }[layBarPos]));
tap($('layHide'), () => { if (!laySel) return; setLay(laySel, { h: !layoutOf(laySel).h }); saveSettings(); applyLayout(); selectLay(laySel); });
tap($('btnLayout'), openLayoutEditor);
let settingsFrom = 'title';
function openSettings(from) { settingsFrom = from; syncSettingsUI(); showScreen('settings', true); }
tap($('btnSettings'), () => openSettings('title'));
tap($('btnPauseSettings'), () => openSettings('pause'));
tap($('btnSettingsClose'), () => showScreen('settings', false));
tap($('btnHelp'), () => showScreen('help', true));
tap($('btnPauseHelp'), () => showScreen('help', true));
tap($('btnHelpClose'), () => showScreen('help', false));
tap($('btnResume'), resumeGame);
tap($('btnQuit'), () => { if (NET.mode !== 'off') netLeave(); toTitle(); });
tap($('btnStart'), () => startMatch());
tap($('btnAgain'), () => { if (NET.mode !== 'off') { toTitle(); openLobby(); } else startMatch(); });
tap($('btnToTitle'), () => { if (NET.mode !== 'off') netLeave(); toTitle(); });

// ================= 試合の準備 =================
function chooseDropTarget() {
  const lat = (x, z) => { const ox = x - plane.start.x, oz = z - plane.start.z; return Math.abs(ox * plane.dir.z - oz * plane.dir.x); };
  const opts = {};
  TOWNS.forEach((t, i) => { opts['t' + i] = (t.r / 100) * (t.tier === 3 ? 1.6 : 1) * Math.exp(-lat(t.x, t.z) / 900) + 0.02; });
  opts.site = 0.9;
  const k = weighted(opts);
  if (k === 'site') {
    const cand = buildings.filter((b) => lat(b.doorOut[0], b.doorOut[1]) < 1100);
    const b = cand.length ? pick(cand) : pick(buildings);
    return { x: b.doorOut[0] + rnd(-6, 6), z: b.doorOut[1] + rnd(-6, 6) };
  }
  const t = TOWNS[+k.slice(1)];
  const inTown = buildings.filter((b) => dist2D(b.x0, b.z0, t.x, t.z) < t.r);
  if (inTown.length) { const b = pick(inTown); return { x: b.doorOut[0] + rnd(-4, 4), z: b.doorOut[1] + rnd(-4, 4) }; }
  return landGoal(t.x, t.z, t.r * 0.6);
}
function resetSoldier(s) {
  s.hp = 100; s.boost = 0; s.alive = true;
  s.vest = { lv: 0, dur: 0 }; s.helmet = { lv: 0, dur: 0 };
  s.crouch = false; s.mode = 'plane'; s.onGround = false; s.swimming = false;
  s.kills = 0; s.weapons = [null, null, null]; s.slot = -1;
  for (const k in s.ammo) s.ammo[k] = 0;
  for (const k in s.heals) s.heals[k] = 0;
  s.reloadT = 0; s.fireCd = 0; s.switchT = 0; s.healing = null; s.vehicle = null;
  s.vel.set(0, 0, 0); s.leanX = s.leanZ = 0; s.lean = 0;
  if (s.model) { s.model.root.visible = false; s.model.root.rotation.set(0, 0, 0); s.model.deathT = 0; }
}
function startMatch() {
  if (!worldReady || NET.mode === 'client') return;
  Sound.init();
  // ルート
  clearLoot();
  NET.bulk = true;
  for (const s of lootSpots) spawnLootAtSpot(s);
  NET.bulk = false;
  bullets.length = 0;
  for (const p of parts) p.life = 0;
  spawnVehicles();
  setupPlane();
  resetZone();
  zone.mesh.visible = true;
  // プレイヤー
  resetSoldier(player);
  player.adsHeld = false; player.adsT = 0; player.eyeH = 1.62; player.recoilAcc = 0; player.bloom = 0; player.fallT = 0;
  player.yaw = Math.atan2(-plane.dir.x, -plane.dir.z) + Math.PI * 0.75; player.pitch = -0.25;
  plane.pos(0, player.pos);
  player.netId = 0; player.name = NET.mode === 'host' ? NET.name : 'あなた';
  // 参加者(オンライン)と、残りの枠を埋めるBot
  const humans = NET.mode === 'host' ? NET.clients.filter((c) => c.conn.open) : [];
  soldiers.length = 0; NET.byId.clear();
  soldiers.push(player); NET.byId.set(0, player);
  for (const c of humans) {
    if (!c.soldier) c.soldier = makeRemote(c);
    const r = c.soldier;
    resetSoldier(r);
    r.name = c.name; setTag(r); r.netId = c.id; r.conn = c.conn; r.tp = null; r.damageDealt = 0; r.deadT = 0;
    plane.pos(0, r.pos);
    c.shots = [];
    soldiers.push(r); NET.byId.set(c.id, r);
  }
  activeBots = bots.slice(0, TOTAL - 1 - humans.length);
  for (const b of bots) if (!activeBots.includes(b)) { resetSoldier(b); b.reset(); b.alive = false; }
  for (const b of activeBots) {
    resetSoldier(b); b.reset();
    b.netId = 100 + bots.indexOf(b);
    soldiers.push(b); NET.byId.set(b.netId, b);
    b.skill = clamp(0.2 + Math.random() * 0.8, 0, 1);
    b.drop = chooseDropTarget();
    const s = (b.drop.x - plane.start.x) * plane.dir.x + (b.drop.z - plane.start.z) * plane.dir.z;
    b.jumpTime = clamp(s / plane.speed - rnd(2, 9), plane.tIn + 1, plane.tOut - 3);
    plane.pos(0, b.pos);
  }
  aliveCount = TOTAL;
  if (NET.mode === 'host') {
    NET.inMatch = true; NET.sendT = 0; NET.zoneT = 0;
    if (NET.endTimer) { clearTimeout(NET.endTimer); NET.endTimer = null; }
    netSendStart();
    netLobbyBroadcast();
  }
  beginMatchCommon();
}
// 試合開始時の画面・状態リセット(ホスト/オフライン/クライアント共通)
function beginMatchCommon() {
  player.adsHeld = false; player.adsT = 0; player.eyeH = 1.62; player.recoilAcc = 0; player.bloom = 0; player.fallT = 0;
  if (NET.mode === 'client') { player.yaw = Math.atan2(-plane.dir.x, -plane.dir.z) + Math.PI * 0.75; player.pitch = -0.25; plane.pos(plane.t, player.pos); }
  game.matchTime = 0; game.damageDealt = 0; game.ended = false; game.paused = false; game.rank = 0; game.deadT = 0; game.ui = null; game.killer = null;
  marker = null; lootSig = ''; $('killfeed').innerHTML = ''; $('dmgDirs').innerHTML = ''; $('cues').innerHTML = '';
  textCache.clear(); hudDirty = true;
  game.state = 'match'; game.tpsView = false;
  for (const id of ['title', 'result', 'pauseMenu', 'settings', 'help', 'mapOverlay', 'invPanel', 'lobby']) showScreen(id, false);
  showScreen('hud', true);
  applyControlsMode();
  showCenter('輸送機が島へ向かっています', 3);
  last = performance.now();
  if (!useTouch()) lockPointer();
}

// ================= 描画の間引き =================
const frustum = new THREE.Frustum(), projM = new THREE.Matrix4();
function cullWorld() {
  camera.updateMatrixWorld();
  projM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(projM);
  const cx = camera.position.x, cz = camera.position.z;
  const alt = Math.max(0, camera.position.y - terrainH(cx, cz));
  const treeD = Math.min(scene.fog.far, Q().tree * (1 + alt / 350));
  for (const c of chunks) {
    const d = dist2D(cx, cz, c.cx, c.cz) - CHS * 0.72;
    c.g.visible = d < treeD && frustum.intersectsSphere(c.sphere);
    if (c.g.visible) for (const m of c.g.children) m.visible = !(m.material === MAT.leaf && m.geometry.attributes.position.count < 200 && d > treeD * 0.55);
  }
  const far = scene.fog.far + 20;
  for (const b of soldiers) {
    const M = b.model; if (!M || b === player) continue;
    let show = game.state !== 'title' && b.mode !== 'plane' && (b.alive || (b.deadT || 0) < 60) && dist2D(cx, cz, b.pos.x, b.pos.z) < far;
    if (NET.mode === 'client' && game.time - (b.netSeen || -99) > 1.2) show = false; // 近くの情報が届いていない相手は隠す
    M.root.visible = show;
  }
  updateTags();
  if (player && player.model) player.model.root.visible = game.state === 'match' && (player.mode === 'vehicle' || !player.alive || (!!game.tpsView && player.mode !== 'plane'));
}
function updateShadowCam() {
  if (!renderer.shadowMap.enabled) return;
  const t = player && game.state === 'match' ? (player.vehicle ? player.vehicle.pos : player.pos) : camera.position;
  const snap = 150 / Q().shadow;
  const x = Math.round(t.x / snap) * snap, z = Math.round(t.z / snap) * snap, y = t.y;
  sun.target.position.set(x, y, z);
  sun.position.set(x + SUN_DIR.x * 300, y + SUN_DIR.y * 300, z + SUN_DIR.z * 300);
  sun.target.updateMatrixWorld();
}

// ================= メインループ =================
let last = performance.now(), fpsVal = 0, fpsN = 0, fpsT = 0, lootT = 0;
function step(dt) {
  game.time += dt;
  game.matchTime += dt;
  readMoveInput();
  processActions();
  updatePlane(dt);
  const p = player;
  if (p.alive) {
    if (p.mode === 'plane') {
      plane.pos(plane.t, p.pos);
      if (plane.t >= plane.tOut - 2.5 || plane.done) { dropFromPlane(); showCenter('自動で降下しました', 2); }
    } else if (p.mode === 'freefall' || p.mode === 'chute') updatePlayerAir(dt);
    else if (p.mode === 'ground') updatePlayerGround(dt);
    if (p.mode === 'ground' || p.mode === 'freefall' || p.mode === 'chute') {
      // 三人称用に自分のモデルも動かす
      poseCharacter(p, dt, Math.hypot(p.vel.x, p.vel.z));
      p.flashT = Math.max(0, (p.flashT || 0) - dt);
      p.model.flash.visible = !!game.tpsView && p.flashT > 0;
      if (p.model.flash.visible) p.model.flash.rotation.z = Math.random() * TAU;
    }
    else if (p.mode === 'vehicle') {
      updateHealing(p, dt);
      if (p.vehicle) poseCharacter(p, dt, 0);
    }
  } else poseCharacter(p, dt, 0);
  // 遠くのBotは更新を間引く(100人対応)
  if (NET.mode === 'client') {
    // クライアント：他の兵士はホストから届いた位置を表示するだけ
    for (const s of soldiers) if (s !== player) updateProxy(s, dt);
  } else {
    const lc = p.mode === 'plane' ? plane.mesh.position : p.pos;
    const lodD = Math.max(500, Q().fog * 0.65);
    for (const b of activeBots) {
      b.lodAcc = (b.lodAcc || 0) + dt;
      const far = b.alive && b.mode === 'ground' && dist2D(b.pos.x, b.pos.z, lc.x, lc.z) > lodD;
      if (far && b.lodAcc < 0.1) continue;
      updateBot(b, Math.min(b.lodAcc, 0.12));
      b.lodAcc = 0;
    }
    if (NET.mode === 'host') for (const s of soldiers) if (s.isRemote) updateRemote(s, dt);
  }
  for (const v of vehicles) updateVehicle(v, dt);
  if (NET.mode === 'client') netClientZone(dt); else updateZone(dt);
  updateBullets(dt);
  updateParticles(dt);
  lootT -= dt;
  if (lootT <= 0 || lootDirty) {
    lootT = 0.25; lootDirty = false;
    const c = p.mode === 'plane' ? plane.mesh.position : p.pos;
    updateLootRender(c.x, c.z);
  }
  // 音
  if (game.state !== 'match') { Sound.stopLoops(); netTick(dt); input.queue.clear(); return; }
  const pd = dist2D(p.pos.x, p.pos.z, plane.mesh.position.x, plane.mesh.position.z);
  Sound.setLoop('plane', 'osc', plane.mesh.visible ? (p.mode === 'plane' ? 0.16 : clamp(0.12 - pd / 9000, 0, 0.1)) : 0, 46, 380);
  Sound.setLoop('wind', 'noise', p.mode === 'freefall' ? 0.35 : p.mode === 'chute' ? 0.12 : 0, 0, p.mode === 'freefall' ? 900 : 500);
  if (p.mode === 'vehicle' && p.vehicle) {
    const sp = Math.abs(p.vehicle.speed);
    Sound.setLoop('engine', 'osc', 0.09 + Math.abs(input.move.y) * 0.05, 34 + sp * 3.2, 380 + sp * 30);
  } else Sound.setLoop('engine', 'osc', 0);
  flashLight.intensity = Math.max(0, flashLight.intensity - dt * 40);
  input.queue.clear(); // このフレームで使われなかった操作は破棄
  netTick(dt);
}
function render(vm) {
  renderer.clear();
  renderer.render(scene, camera);
  if (vm) { renderer.clearDepth(); renderer.render(vmScene, vmCamera); }
}
let lastFrameAt = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  lastFrameAt = performance.now();
  let dt = (now - last) / 1000; last = now;
  if (!(dt > 0)) dt = 0.016;
  dt = Math.min(dt, 0.05);
  fpsN++; fpsT += dt; if (fpsT >= 0.5) { fpsVal = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; if (settings.showFps) setText('fps', fpsVal + ' FPS'); }
  if (MAT.waterNormal) { MAT.waterNormal.offset.x += dt * 0.006; MAT.waterNormal.offset.y += dt * 0.004; }
  if (game.state === 'title' || game.state === 'boot') {
    // ホストはタイトル/ロビー画面にいても、試合中なら計算を続ける
    if (NET.mode === 'host' && NET.inMatch) { try { step(dt); } catch (err) { console.error(err); } }
    titleCamera(dt);
    sky.position.copy(camera.position); sky.scale.setScalar(camera.far * 0.9);
    if (worldReady) { cullWorld(); updateShadowCam(); }
    render(false);
    return;
  }
  try {
    const online = NET.mode !== 'off' && NET.inMatch; // オンラインでは一時停止中も試合は進む
    if (game.state === 'match' && (!game.paused || online)) step(dt); // マップ/バッグ表示中も時間は進む
    else if (game.state === 'result') {
      if (online) step(dt);
      else if (NET.mode === 'off') { game.time += dt; for (const b of activeBots) updateBot(b, dt); updateBullets(dt); updateParticles(dt); updateZone(dt); }
      else { game.time += dt; updateParticles(dt); }
    }
  } catch (err) { console.error(err); }
  updateCamera(dt);
  const vm = updateViewModel(dt);
  sky.position.copy(camera.position); sky.scale.setScalar(camera.far * 0.9);
  for (const c of clouds) c.visible = camera.position.y > 120 || dist2D(c.position.x, c.position.z, camera.position.x, camera.position.z) < camera.far;
  cullWorld();
  updateShadowCam();
  render(vm);
  if (game.state === 'match') updateHUD(dt);
}

// ホストの保険：画面が裏に回る/iframeが隠れるなどで描画ループが止まっても、試合の計算は続ける
function hostKeepAlive() {
  if (!(NET.mode === 'host' && NET.inMatch)) return;
  const now = performance.now();
  if (now - lastFrameAt < 300) return; // 描画ループが動いていれば不要
  let t = Math.min(3, (now - lastFrameAt) / 1000);
  lastFrameAt = now; last = now;
  try { while (t > 0.001) { const d = Math.min(0.05, t); step(d); t -= d; } } catch (err) { console.error(err); }
}
// 裏のタブでは普通のタイマーが強く間引かれるので、間引かれにくいWeb Workerを時計がわりに使う
(() => {
  try {
    const src = 'setInterval(function(){postMessage(0)},100);';
    const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    w.onmessage = hostKeepAlive;
    w.onerror = () => { w.terminate(); setInterval(hostKeepAlive, 100); };
  } catch (e) { setInterval(hostKeepAlive, 100); }
})();

// ================= リサイズ =================
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  if (typeof placeJoyIdle === 'function' && T.joyId === null) placeJoyIdle();
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  vmCamera.aspect = w / h; vmCamera.updateProjectionMatrix();
  textCache.clear(); hudDirty = true;
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 250));

// ================= 起動 =================
async function boot() {
  renderer.setClearColor(FOG_COLOR);
  applyControlsMode();
  syncSettingsUI();
  resize();
  requestAnimationFrame(loop);
  try {
    await generateWorld((p, t) => { $('loadBar').style.width = Math.round(p * 100) + '%'; $('loadText').textContent = t; });
    initLootMeshes();
    initCharacterAssets();
    initVehicleAssets();
    buildViewModels();
    buildPlaneMesh();
    buildZoneMesh();
    zone.mesh.visible = false;
    player = new Soldier('あなた', true);
    player.model = makeCharacter(2);
    soldiers.push(player);
    const used = new Set();
    for (let i = 0; i < TOTAL - 1; i++) { const b = new Bot(botName(used), i + 3); bots.push(b); soldiers.push(b); }
    applyQuality();
  } catch (err) {
    console.error(err);
    $('loadText').textContent = '読み込みに失敗しました：' + (err && err.message ? err.message : err);
    return;
  }
  game.state = 'title';
  showScreen('loading', false);
  showScreen('title', true);
}
boot();
})();
