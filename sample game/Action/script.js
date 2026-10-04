/* =====================================================================
   ホップヒーロー ～七色の星と浮遊大陸～
   made by hiro/ヒロ   https://github.com/h1ro223
   ===================================================================== */
(() => {
'use strict';

/* ================= 基本設定 ================= */
const TILE = 16, ROWS = 15, VIEW_H = ROWS * TILE;
let VIEW_W = 400, RES = 2;
const FIXED_DT = 1000 / 60;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
const FONT_JP = '"DotGothic16","Hiragino Kaku Gothic ProN","Meiryo",sans-serif';
const FONT_EN = '"Press Start 2P","DotGothic16",monospace';
const IS_TOUCH = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
if (IS_TOUCH) document.body.classList.add('touch');

/* ================= ユーティリティ ================= */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sgn = v => (v > 0 ? 1 : v < 0 ? -1 : 0);
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function makeRng(seed) {
  const f = mulberry32(seed >>> 0);
  return {
    f,
    i: (a, b) => a + Math.floor(f() * (b - a + 1)),
    pick: arr => arr[Math.floor(f() * arr.length)],
    chance: p => f() < p,
    weighted(list) {
      let s = 0; for (const it of list) s += it[1];
      let r = f() * s;
      for (const it of list) { r -= it[1]; if (r < 0) return it[0]; }
      return list[list.length - 1][0];
    }
  };
}
function fmtTime(fr) {
  if (!fr) return '--:--.--';
  const s = Math.floor(fr / 60), m = Math.floor(s / 60), cs = Math.floor((fr % 60) * 100 / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/* ================= 画面サイズ ================= */
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const portrait = h > w;
  VIEW_W = Math.round(clamp(VIEW_H * (w / h), 320, 480) / 2) * 2;
  const scale = Math.min(w / VIEW_W, (portrait ? h * 0.62 : h) / VIEW_H);
  const dpr = window.devicePixelRatio || 1;
  RES = clamp(Math.ceil(scale * dpr), 1, 4);
  canvas.width = VIEW_W * RES;
  canvas.height = VIEW_H * RES;
  canvas.style.width = Math.floor(VIEW_W * scale) + 'px';
  canvas.style.height = Math.floor(VIEW_H * scale) + 'px';
  ctx.imageSmoothingEnabled = false;
  document.body.classList.toggle('portrait', portrait);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 250));
resize();

/* ================= セーブデータ ================= */
const SAVE_KEY = 'hophero_save_v1';
const Save = {
  data: null,
  def() {
    return { cleared: {}, medals: {}, best: {}, lives: 5, high: 0, totalCoins: 0, enemies: 0, deaths: 0,
      playSec: 0, bgm: 7, sfx: 8, shake: true, autoDash: true, padAlpha: 6, padSize: 1, padLayout: 0, endA: false, endB: false, lastW: 1, lastS: 1, started: false };
  },
  load() {
    let d = null;
    try { const s = localStorage.getItem(SAVE_KEY); if (s) d = JSON.parse(s); } catch (e) { d = null; }
    this.data = Object.assign(this.def(), d && typeof d === 'object' ? d : {});
    ['cleared', 'medals', 'best'].forEach(k => { if (!this.data[k] || typeof this.data[k] !== 'object') this.data[k] = {}; });
  },
  save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) { /* 保存不可環境 */ } },
  reset() {
    const k = { bgm: this.data.bgm, sfx: this.data.sfx, shake: this.data.shake, autoDash: this.data.autoDash, padAlpha: this.data.padAlpha, padSize: this.data.padSize, padLayout: this.data.padLayout };
    this.data = Object.assign(this.def(), k); this.save();
  }
};
Save.load();
function medalCount(w0 = 1, w1 = 7) {
  let n = 0;
  for (let w = w0; w <= w1; w++) for (let s = 1; s <= 5; s++) {
    const m = Save.data.medals[`${w}-${s}`]; if (m) n += m.filter(Boolean).length;
  }
  return n;
}
const W7_NEED = 60;
function world7Open() { return !!Save.data.cleared['6-5'] && medalCount(1, 6) >= W7_NEED; }
function isUnlocked(w, s) {
  if (w === 7 && !world7Open()) return false;
  if (s === 1) return w === 1 || !!Save.data.cleared[`${w - 1}-5`];
  return !!Save.data.cleared[`${w}-${s - 1}`];
}

/* ================= 入力 ================= */
const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'run', 'dash', 'pause', 'back'];
const Input = { held: {}, latch: {}, touch: {}, pad: {}, cur: {}, prev: {}, pressed: {} };
ACTIONS.forEach(a => { Input.held[a] = Input.latch[a] = Input.touch[a] = Input.pad[a] = Input.cur[a] = Input.prev[a] = Input.pressed[a] = false; });
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down', Space: 'jump', KeyZ: 'jump', KeyK: 'jump', KeyX: 'run', KeyJ: 'run',
  ShiftLeft: 'run', ShiftRight: 'run', Enter: 'pause', KeyP: 'pause', Escape: 'back', Backspace: 'back'
};
window.addEventListener('keydown', e => {
  const a = KEYMAP[e.code];
  Snd.unlock();
  if (!a) return;
  e.preventDefault();
  if (!e.repeat) Input.latch[a] = true;
  Input.held[a] = true;
});
window.addEventListener('keyup', e => { const a = KEYMAP[e.code]; if (a) { Input.held[a] = false; e.preventDefault(); } });
window.addEventListener('blur', () => { ACTIONS.forEach(a => { Input.held[a] = false; Input.touch[a] = false; }); });

const NINTENDO_RE = /nintendo|switch|pro controller|joy-?con|057e|8bitdo/i;
function padIsNintendo(gp) {
  const m = Save.data.padLayout | 0;
  if (m === 1) return false;
  if (m === 2) return true;
  return NINTENDO_RE.test(gp.id || '');
}
function padName() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of pads) if (gp) return padIsNintendo(gp) ? 'Switch式' : 'Xbox式';
  return '';
}
function pollPad() {
  const p = {}; ACTIONS.forEach(a => p[a] = false);
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of pads) {
    if (!gp) continue;
    const b = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    p.left = p.left || b(14) || ax < -0.45; p.right = p.right || b(15) || ax > 0.45;
    p.up = p.up || b(12) || ay < -0.5; p.down = p.down || b(13) || ay > 0.5;
    // Aボタン=ジャンプ / Bボタン=ダッシュ・ファイア（Switch系はAが右・Bが下なので入れかえ）
    const nin = padIsNintendo(gp), ia = nin ? 1 : 0, ib = nin ? 0 : 1;
    p.jump = p.jump || b(ia) || b(3); p.run = p.run || b(ib) || b(2);
    p.pause = p.pause || b(9); p.back = p.back || b(8);
  }
  ACTIONS.forEach(a => Input.pad[a] = p[a]);
}
Input.poll = function () {
  pollPad();
  for (const a of ACTIONS) {
    this.prev[a] = this.cur[a];
    this.cur[a] = this.held[a] || this.latch[a] || this.touch[a] || this.pad[a];
    this.pressed[a] = this.cur[a] && !this.prev[a];
    this.latch[a] = false;
  }
};
Input.clear = function () { ACTIONS.forEach(a => { this.pressed[a] = false; this.latch[a] = false; }); };

/* ---- タッチ操作（仮想スティック＋ボタン） ---- */
const touchRoot = document.getElementById('touch');
const stickBase = document.getElementById('stickBase'), stickKnob = document.getElementById('stickKnob');
const btnA = document.getElementById('btnA'), btnB = document.getElementById('btnB'), btnP = document.getElementById('btnP');
const Stick = { id: null, ox: 0, oy: 0, dx: 0, dy: 0, left: false, right: false, up: false, down: false, dash: false };
const PAD_SCALES = [0.82, 1, 1.2];
function padScale() { return PAD_SCALES[clamp(Save.data.padSize | 0, 0, 2)]; }
function applyPadStyle() {
  touchRoot.style.setProperty('--pa', String(clamp(Save.data.padAlpha, 1, 10) / 10));
  touchRoot.style.setProperty('--ps', String(padScale()));
}
function circOf(el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 }; }
const TAP_STATES = ['title', 'ending', 'result', 'story'];
function updateTouches(e) {
  if (e.cancelable) e.preventDefault();
  Snd.unlock();
  const vw = window.innerWidth, vh = window.innerHeight, sc = padScale();
  const next = {}; ACTIONS.forEach(a => next[a] = false);
  const P = circOf(btnP);
  // 新しく置かれた指の割り当て
  if (e.type === 'touchstart') {
    for (const t of e.changedTouches) {
      const onP = Math.hypot(t.clientX - P.x, t.clientY - P.y) < P.r + 12;
      if (!onP && t.clientX < vw * 0.5 && Stick.id === null) { Stick.id = t.identifier; Stick.ox = t.clientX; Stick.oy = t.clientY; Stick.dx = Stick.dy = 0; }
      if (!onP && !G.menus.length && TAP_STATES.includes(G.state)) Input.latch.jump = true;
    }
  }
  let stickT = null;
  const A = circOf(btnA), B = circOf(btnB);
  for (const t of e.touches) {
    if (t.identifier === Stick.id) { stickT = t; continue; }
    const x = t.clientX, y = t.clientY;
    if (Math.hypot(x - P.x, y - P.y) < P.r + 12) { next.pause = true; continue; }
    if (x < vw * 0.5 || y < vh * 0.2) continue;
    // 右半分：いちばん近いボタン。AとBの間なら同時押し
    const dA = Math.hypot(x - A.x, y - A.y) - A.r, dB = Math.hypot(x - B.x, y - B.y) - B.r;
    if (Math.abs(dA - dB) < 14 * sc) { next.jump = true; next.run = true; }
    else if (dA < dB) next.jump = true; else next.run = true;
  }
  // スティック
  const R = 42 * sc, s = Stick;
  if (stickT) {
    let dx = stickT.clientX - s.ox, dy = stickT.clientY - s.oy;
    const d = Math.hypot(dx, dy);
    if (d > R) { const k = (d - R) / d; s.ox += dx * k; s.oy += dy * k; dx = stickT.clientX - s.ox; dy = stickT.clientY - s.oy; }
    s.dx = dx; s.dy = dy;
    const hx = (s.left || s.right) ? 0.2 : 0.28, hy = (s.up || s.down) ? 0.4 : 0.55;
    s.left = dx < -R * hx; s.right = dx > R * hx;
    s.down = dy > R * hy && dy > Math.abs(dx) * 0.8;
    s.up = dy < -R * hy && -dy > Math.abs(dx) * 0.8;
    s.dash = !!Save.data.autoDash && Math.abs(dx) > R * 0.72;
    stickBase.classList.remove('idle'); stickBase.classList.add('on');
    stickBase.style.left = s.ox + 'px'; stickBase.style.top = s.oy + 'px';
    stickKnob.style.transform = `translate(-50%,-50%) translate(${dx}px,${dy}px)`;
    stickKnob.classList.toggle('dash', s.dash);
  } else {
    s.id = null; s.left = s.right = s.up = s.down = s.dash = false;
    stickBase.classList.remove('on'); stickBase.classList.add('idle');
    stickBase.style.left = ''; stickBase.style.top = '';
    stickKnob.style.transform = 'translate(-50%,-50%)'; stickKnob.classList.remove('dash');
  }
  next.left = s.left; next.right = s.right; next.up = s.up; next.down = s.down; next.dash = s.dash;
  for (const a of ACTIONS) {
    if (next[a] && !Input.touch[a]) Input.latch[a] = true;
    Input.touch[a] = next[a];
  }
  btnA.classList.toggle('on', next.jump); btnB.classList.toggle('on', next.run); btnP.classList.toggle('on', next.pause);
}
['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(ev => touchRoot.addEventListener(ev, updateTouches, { passive: false }));
touchRoot.addEventListener('mousedown', () => { Snd.unlock(); if (!G.menus.length && TAP_STATES.includes(G.state)) Input.latch.jump = true; });
canvas.addEventListener('mousedown', () => { Snd.unlock(); if (!G.menus.length && TAP_STATES.includes(G.state)) Input.latch.jump = true; });
applyPadStyle();
// 拡大・コピペ・長押しメニュー対策（Safari）
['gesturestart', 'gesturechange', 'gestureend'].forEach(ev => document.addEventListener(ev, e => e.preventDefault(), { passive: false }));
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
document.addEventListener('contextmenu', e => { if (!e.target.closest('a')) e.preventDefault(); });
document.addEventListener('selectstart', e => e.preventDefault());
document.addEventListener('touchmove', e => { if (e.touches.length > 1 || !e.target.closest('a')) { if (e.cancelable) e.preventDefault(); } }, { passive: false });
let lastTouchEnd = 0;
document.addEventListener('touchend', e => {
  const now = Date.now();
  if (now - lastTouchEnd <= 350 && !e.target.closest('a') && e.cancelable) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });

/* ================= サウンド ================= */
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const Snd = {
  ctx: null, master: null, bgm: null, sfx: null, noiseBuf: null, waves: {},
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      const c = this.ctx = new AC();
      this.master = c.createGain(); this.master.gain.value = 0.9; this.master.connect(c.destination);
      this.bgm = c.createGain(); this.bgm.connect(this.master);
      this.sfx = c.createGain(); this.sfx.connect(this.master);
      const len = c.sampleRate | 0, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      this.waves.p25 = this.pulse(0.25); this.waves.p125 = this.pulse(0.125);
      this.applyVolume();
      const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, 22050); s.connect(c.destination); s.start(0);
      if (c.state === 'suspended') c.resume().catch(() => {});
    } catch (e) { this.ctx = null; }
  },
  pulse(duty) {
    const n = 32, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    return this.ctx.createPeriodicWave(re, im);
  },
  applyVolume() {
    if (!this.ctx) return;
    this.bgm.gain.value = (Save.data.bgm / 10) * 0.55;
    this.sfx.gain.value = (Save.data.sfx / 10) * 0.7;
  },
  osc(type, t, f0, f1, dur, vol, dest) {
    const c = this.ctx; if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    if (type === 'p25' || type === 'p125') o.setPeriodicWave(this.waves[type]); else o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.02, dur));
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  },
  noiseAt(t, dur, vol, freq, type, dest) {
    const c = this.ctx; if (!c) return;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  },
  tone(type, f0, f1, dur, vol = 0.25, delay = 0) { if (this.ctx) this.osc(type, this.ctx.currentTime + delay, f0, f1, dur, vol, this.sfx); },
  noise(dur, vol = 0.3, delay = 0, freq = 2000, type = 'lowpass') { if (this.ctx) this.noiseAt(this.ctx.currentTime + delay, dur, vol, freq, type, this.sfx); },
  notes(seq, type = 'p25', vol = 0.2, step = 0.06) { seq.forEach((m, i) => { if (m) this.tone(type, mtof(m), 0, step * 1.3, vol, i * step); }); },
  play(n) {
    if (!this.ctx) return;
    const T = this;
    switch (n) {
      case 'jump': T.tone('p25', 270, 650, 0.14, 0.17); break;
      case 'bigjump': T.tone('p25', 200, 520, 0.17, 0.17); break;
      case 'wjump': T.tone('p25', 340, 900, 0.12, 0.15); break;
      case 'coin': T.tone('square', 1046, 0, 0.07, 0.12); T.tone('square', 1568, 0, 0.3, 0.12, 0.07); break;
      case 'stomp': T.tone('square', 520, 140, 0.12, 0.2); T.noise(0.06, 0.15, 0, 1200); break;
      case 'kick': T.tone('square', 300, 900, 0.08, 0.17); T.noise(0.05, 0.2, 0, 3000); break;
      case 'bump': T.tone('triangle', 160, 80, 0.1, 0.4); break;
      case 'break': T.noise(0.25, 0.45, 0, 1800); T.tone('square', 220, 60, 0.18, 0.14); break;
      case 'appear': T.notes([60, 64, 67, 72, 64, 67, 72, 76], 'p25', 0.14, 0.05); break;
      case 'power': T.notes([67, 71, 74, 79, 71, 74, 79, 83, 74, 79, 83, 86], 'square', 0.11, 0.035); break;
      case 'shrink': T.notes([79, 74, 71, 67, 62, 59], 'p25', 0.15, 0.05); break;
      case 'fire': T.tone('square', 1200, 300, 0.08, 0.11); break;
      case 'oneup': T.notes([76, 79, 88, 84, 86, 91], 'square', 0.12, 0.09); break;
      case 'spring': T.tone('triangle', 150, 900, 0.3, 0.4); break;
      case 'pause': T.notes([76, 72, 76, 72], 'square', 0.11, 0.06); break;
      case 'cursor': T.tone('square', 880, 0, 0.04, 0.09); break;
      case 'ok': T.tone('square', 660, 0, 0.05, 0.11); T.tone('square', 990, 0, 0.1, 0.11, 0.05); break;
      case 'cancel': T.tone('square', 440, 220, 0.1, 0.11); break;
      case 'checkpoint': T.notes([72, 76, 79, 84], 'p25', 0.15, 0.07); break;
      case 'medal': T.notes([84, 88, 91, 96, 91, 96, 100], 'p125', 0.14, 0.05); T.tone('triangle', 1046, 0, 0.5, 0.15, 0.35); break;
      case 'pound': T.noise(0.25, 0.5, 0, 600); T.tone('triangle', 120, 40, 0.25, 0.5); break;
      case 'spin': T.tone('p25', 600, 1200, 0.1, 0.12); break;
      case 'thud': T.noise(0.3, 0.5, 0, 400); T.tone('triangle', 90, 40, 0.3, 0.45); break;
      case 'cannon': T.noise(0.2, 0.45, 0, 900); T.tone('square', 140, 50, 0.15, 0.18); break;
      case 'swim': T.tone('triangle', 400, 700, 0.08, 0.2); break;
      case 'bosshit': T.tone('square', 900, 100, 0.25, 0.2); T.noise(0.15, 0.25, 0, 3000); break;
      case 'explode': T.noise(0.5, 0.55, 0, 900); T.tone('triangle', 100, 30, 0.5, 0.4); break;
      case 'thunder': T.noise(0.6, 0.5, 0, 4000, 'highpass'); T.noise(0.5, 0.4, 0.05, 500); break;
      case 'flag': for (let i = 0; i < 12; i++) T.tone('p25', mtof(86 - i * 2), 0, 0.05, 0.11, i * 0.04); break;
      case 'efire': T.tone('sawtooth', 300, 120, 0.18, 0.07); break;
      case 'tick': T.tone('square', 1760, 0, 0.03, 0.05); break;
      case 'star': T.notes([72, 76, 79, 84, 88, 91, 96], 'square', 0.12, 0.06); break;
      case 'icicle': T.tone('triangle', 1600, 800, 0.15, 0.12); break;
      case 'warn': T.notes([88, 0, 88, 0, 88], 'square', 0.1, 0.06); break;
      case 'door': T.noise(0.4, 0.4, 0, 300); T.tone('square', 80, 50, 0.4, 0.15); break;
      case 'firework': T.noise(0.4, 0.4, 0, 1500); T.tone('triangle', 300, 60, 0.3, 0.3); break;
    }
  }
};

/* ================= 作曲エンジン（プロシージャルBGM） ================= */
const SCALES = { maj: [0, 2, 4, 5, 7, 9, 11], min: [0, 2, 3, 5, 7, 8, 10], dor: [0, 2, 3, 5, 7, 9, 10], mix: [0, 2, 4, 5, 7, 9, 10], hmin: [0, 2, 3, 5, 7, 8, 11], lyd: [0, 2, 4, 6, 7, 9, 11] };
const RHYTHMS = [[4, 4, 4, 4], [2, 2, 4, 2, 2, 4], [3, 3, 2, 4, 4], [4, 2, 2, 8], [2, 2, 2, 2, 4, 4], [6, 2, 4, 4], [2, 4, 2, 4, 4], [4, 4, 2, 2, 4], [3, 3, 4, 2, 4], [8, 4, 4], [2, 2, 2, 2, 2, 2, 4]];
const DRUMS = {
  rock: 'k.h.s.h.k.k.s.hh', fast: 'khshkhshkhshkhss', half: 'k...h...s...h...', shuffle: 'k..hs..hk..hs.hh',
  march: 's.s.s.ssk.s.s.ss', boss: 'kkhsk.hskkhsk.ss', waltz: 'k...h.h.k...h.h.', none: '................'
};
function genSong(o) {
  const r = makeRng(o.seed), sc = SCALES[o.scale], n = sc.length;
  const deg2m = (deg, oct) => { const q = Math.floor(deg / n); return o.root + 12 * (q + oct) + sc[deg - q * n]; };
  const prog = o.prog, p2 = o.prog2 || [prog[2], prog[3], prog[0], prog[1]];
  const bars = 16, len = bars * 16;
  const lead = new Array(len).fill(null), bass = new Array(len).fill(null), arp = new Array(len).fill(null), drum = new Array(len).fill(0);
  const phrase = (chs, base) => {
    const out = []; let prev = base;
    for (let b = 0; b < 2; b++) {
      const rh = r.pick(RHYTHMS); let s = 0; const ch = chs[b];
      rh.forEach((L, k) => {
        let deg;
        if (s % 4 === 0) {
          let best = prev, bd = 99;
          for (const t0 of [ch, ch + 2, ch + 4]) for (const oc of [-7, 0, 7]) {
            const t = t0 + oc; if (t < 0 || t > 11) continue;
            const dd = Math.abs(t - prev) + r.f() * 1.6;
            if (dd < bd) { bd = dd; best = t; }
          }
          deg = best;
        } else deg = clamp(prev + r.pick([-2, -1, -1, 1, 1, 2]), 0, 11);
        if (!(k > 0 && r.chance(o.restP || 0.08))) out.push([b * 16 + s, deg, L]);
        prev = deg; s += L;
      });
    }
    return out;
  };
  const P1 = phrase([prog[0], prog[1]], 7), P2 = phrase([prog[2], prog[3]], 7), P2b = phrase([prog[2], prog[3]], 6);
  const P3 = phrase([p2[0], p2[1]], 9), P4 = phrase([p2[2], p2[3]], 7);
  const layout = [P1, P2, P1, P2b, P3, P4, P1, P2b];
  const chordBars = [...prog, ...prog, ...p2, ...prog];
  const lo = o.leadOct === undefined ? 1 : o.leadOct;
  layout.forEach((P, i) => P.forEach(([st, dg, L]) => { lead[i * 32 + st] = [deg2m(dg, lo), L]; }));
  const dp = DRUMS[o.drum || 'rock'];
  for (let b = 0; b < bars; b++) {
    const ch = chordBars[b], root = deg2m(ch, -1), fifth = deg2m(ch + 4, -1);
    const put = (s, m, L) => { bass[b * 16 + s] = [m, L]; };
    switch (o.bass || 'pump') {
      case 'pump': for (let s = 0; s < 16; s += 4) put(s, s % 8 === 0 ? root : root + 12, 3); break;
      case 'walk': put(0, root, 4); put(4, deg2m(ch + 2, -1), 4); put(8, fifth, 4); put(12, deg2m(ch + 5, -1), 4); break;
      case 'drive': for (let s = 0; s < 16; s += 2) put(s, s === 6 || s === 14 ? fifth : root, 2); break;
      case 'slow': put(0, root, 8); put(8, fifth, 8); break;
      case 'bounce': put(0, root, 3); put(3, root, 3); put(6, fifth, 2); put(8, root + 12, 4); put(12, fifth, 4); break;
    }
    if (o.arp) for (let s = 0; s < 16; s += o.arp) { const k = (s / o.arp) % 3; arp[b * 16 + s] = [deg2m(ch + [0, 2, 4][k], 0), o.arp]; }
    for (let s = 0; s < 16; s++) { const c = dp[s]; drum[b * 16 + s] = c === 'k' ? 1 : c === 's' ? 2 : c === 'h' ? 4 : 0; }
  }
  return { bpm: o.bpm, len, lead, bass, arp, drum, loop: true, wave: o.lead || 'p25' };
}
const SONG_DEFS = {
  title: { seed: 11, bpm: 138, root: 60, scale: 'maj', prog: [0, 5, 3, 4], bass: 'bounce', drum: 'rock', arp: 2 },
  map: { seed: 23, bpm: 112, root: 62, scale: 'maj', prog: [0, 3, 4, 0], prog2: [5, 3, 1, 4], bass: 'walk', drum: 'shuffle', lead: 'p125' },
  grass: { seed: 101, bpm: 150, root: 60, scale: 'maj', prog: [0, 3, 4, 0], prog2: [5, 1, 3, 4], bass: 'pump', drum: 'rock' },
  desert: { seed: 202, bpm: 140, root: 57, scale: 'hmin', prog: [0, 0, 5, 4], prog2: [3, 3, 0, 4], bass: 'drive', drum: 'shuffle' },
  ice: { seed: 303, bpm: 124, root: 64, scale: 'lyd', prog: [0, 1, 0, 4], prog2: [5, 3, 1, 4], bass: 'slow', drum: 'half', arp: 2, lead: 'p125' },
  forest: { seed: 404, bpm: 116, root: 57, scale: 'dor', prog: [0, 3, 0, 6], prog2: [5, 3, 4, 4], bass: 'walk', drum: 'shuffle' },
  sky: { seed: 505, bpm: 164, root: 62, scale: 'mix', prog: [0, 6, 3, 0], prog2: [3, 4, 6, 4], bass: 'bounce', drum: 'fast' },
  volcano: { seed: 606, bpm: 170, root: 52, scale: 'min', prog: [0, 5, 6, 4], prog2: [3, 4, 0, 4], bass: 'drive', drum: 'fast', lead: 'square' },
  star: { seed: 707, bpm: 146, root: 61, scale: 'lyd', prog: [0, 1, 5, 4], bass: 'pump', drum: 'rock', arp: 2, lead: 'p125' },
  cave: { seed: 808, bpm: 104, root: 55, scale: 'min', prog: [0, 0, 5, 4], bass: 'slow', drum: 'half', lead: 'p125', restP: 0.25 },
  water: { seed: 909, bpm: 96, root: 60, scale: 'maj', prog: [0, 3, 1, 4], bass: 'slow', drum: 'waltz', arp: 4, lead: 'triangle' },
  castle: { seed: 1001, bpm: 128, root: 50, scale: 'hmin', prog: [0, 0, 1, 4], prog2: [5, 5, 3, 4], bass: 'drive', drum: 'march', lead: 'square' },
  boss: { seed: 1101, bpm: 176, root: 52, scale: 'hmin', prog: [0, 5, 0, 4], prog2: [3, 1, 4, 4], bass: 'drive', drum: 'boss', lead: 'square' },
  final: { seed: 1201, bpm: 184, root: 49, scale: 'hmin', prog: [0, 1, 5, 4], prog2: [3, 4, 0, 4], bass: 'drive', drum: 'boss', arp: 2, lead: 'square' },
  starman: { seed: 1301, bpm: 200, root: 65, scale: 'maj', prog: [0, 4, 0, 4], bass: 'drive', drum: 'fast' },
  ending: { seed: 1401, bpm: 100, root: 60, scale: 'maj', prog: [0, 5, 3, 4], prog2: [1, 4, 0, 0], bass: 'walk', drum: 'half', arp: 4, lead: 'triangle' }
};
function jingle(bpm, leadSeq, bassSeq, wave) {
  const build = seq => { const arr = []; for (const [m, L] of seq) { arr.push(m ? [m, L] : null); for (let i = 1; i < L; i++) arr.push(null); } return arr; };
  const lead = build(leadSeq), bass = build(bassSeq), len = Math.max(lead.length, bass.length);
  while (lead.length < len) lead.push(null); while (bass.length < len) bass.push(null);
  return { bpm, len, lead, bass, arp: new Array(len).fill(null), drum: new Array(len).fill(0), loop: false, wave: wave || 'p25' };
}
const JINGLES = {
  clear: () => jingle(150, [[67, 2], [72, 2], [76, 2], [79, 2], [84, 4], [79, 2], [84, 12]], [[48, 4], [52, 4], [55, 4], [60, 4], [48, 12]]),
  castleclear: () => jingle(132, [[72, 2], [67, 2], [64, 2], [72, 2], [76, 4], [79, 4], [77, 2], [74, 2], [71, 2], [77, 2], [79, 4], [84, 14]], [[48, 8], [53, 8], [55, 8], [48, 14]]),
  death: () => jingle(132, [[79, 2], [78, 2], [77, 2], [76, 2], [0, 2], [72, 3], [67, 3], [60, 10]], [[43, 8], [0, 2], [48, 6], [36, 10]]),
  gameover: () => jingle(92, [[72, 4], [67, 4], [64, 4], [69, 3], [71, 3], [69, 3], [68, 3], [70, 3], [68, 3], [67, 2], [65, 2], [67, 12]], [[48, 12], [45, 9], [44, 9], [43, 16]], 'triangle')
};
const SONG_CACHE = {};
const Music = {
  cur: null, name: '', step: 0, next: 0, rate: 1, paused: false,
  play(name, force) {
    if (!force && this.name === name && this.cur) return;
    this.name = name;
    this.cur = JINGLES[name] ? JINGLES[name]() : (SONG_CACHE[name] || (SONG_CACHE[name] = genSong(SONG_DEFS[name] || SONG_DEFS.grass)));
    this.step = 0; this.rate = 1;
    this.next = Snd.ctx ? Snd.ctx.currentTime + 0.06 : 0;
  },
  stop() { this.cur = null; this.name = ''; },
  update() {
    const c = Snd.ctx; if (!c || !this.cur) return;
    const s = this.cur, sd = 60 / (s.bpm * this.rate) / 4;
    if (this.next < c.currentTime - 0.25) this.next = c.currentTime + 0.05;
    let guard = 0;
    while (this.next < c.currentTime + 0.15 && guard++ < 64) {
      this.playStep(s, this.step, this.next, sd);
      this.next += sd; this.step++;
      if (this.step >= s.len) { if (s.loop) this.step = 0; else { this.cur = null; this.name = ''; return; } }
    }
  },
  playStep(s, i, t, sd) {
    const out = Snd.bgm;
    const WV = { square: 0.055, p25: 0.075, p125: 0.075, triangle: 0.16 };
    const L = s.lead[i]; if (L) Snd.osc(s.wave, t, mtof(L[0]), 0, Math.max(0.05, L[1] * sd * 0.9), WV[s.wave] || 0.07, out);
    const B = s.bass[i]; if (B) Snd.osc('triangle', t, mtof(B[0]), 0, Math.max(0.05, B[1] * sd * 0.9), 0.19, out);
    const A = s.arp[i]; if (A) Snd.osc('p125', t, mtof(A[0] + 12), 0, Math.max(0.04, A[1] * sd * 0.6), 0.03, out);
    const D = s.drum[i];
    if (D & 1) Snd.osc('sine', t, 160, 40, 0.14, 0.45, out);
    if (D & 2) { Snd.noiseAt(t, 0.12, 0.2, 1800, 'highpass', out); Snd.osc('triangle', t, 220, 120, 0.07, 0.12, out); }
    if (D & 4) Snd.noiseAt(t, 0.03, 0.07, 7000, 'highpass', out);
  }
};

/* ================= グラフィック基盤 ================= */
const SPR = new Map();
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function spr(key, w, h, fn) {
  let c = SPR.get(key);
  if (!c) { c = mk(w, h); const g = c.getContext('2d'); g.imageSmoothingEnabled = false; fn(g, w, h); SPR.set(key, c); }
  return c;
}
// パーツ列をアウトライン付きで描く  p=[x,y,w,h,color,noOutline]
function parts(g, list, out) {
  g.fillStyle = out;
  for (const p of list) if (!p[5]) g.fillRect(p[0] - 1, p[1] - 1, p[2] + 2, p[3] + 2);
  for (const p of list) { g.fillStyle = p[4]; g.fillRect(p[0], p[1], p[2], p[3]); }
}
function P() { const L = []; const R = (x, y, w, h, c, n) => L.push([x, y, w, h, c, n]); return [L, R]; }
function blit(img, x, y, flipX, flipY, alpha) {
  x = Math.round(x); y = Math.round(y);
  if (alpha !== undefined && alpha < 1) ctx.globalAlpha = Math.max(0, alpha);
  if (!flipX && !flipY) ctx.drawImage(img, x, y);
  else {
    ctx.save();
    ctx.translate(x + (flipX ? img.width : 0), y + (flipY ? img.height : 0));
    ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}
function text(str, x, y, size = 8, color = '#fff', align = 'left', font = FONT_JP, shadow = '#000') {
  ctx.font = `${size}px ${font}`; ctx.textAlign = align; ctx.textBaseline = 'top';
  if (shadow) { ctx.fillStyle = shadow; ctx.fillText(str, x + 1, y + 1); }
  ctx.fillStyle = color; ctx.fillText(str, x, y);
}
function textOutline(str, x, y, size, color, out, align = 'center', font = FONT_EN) {
  ctx.font = `${size}px ${font}`; ctx.textAlign = align; ctx.textBaseline = 'top';
  ctx.fillStyle = out;
  for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 3; dy++) if (dx || dy) ctx.fillText(str, x + dx, y + dy);
  ctx.fillStyle = color; ctx.fillText(str, x, y);
}
function box(x, y, w, h, fill = 'rgba(10,12,34,.86)', stroke = '#ffffff') {
  ctx.fillStyle = fill; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = stroke;
  ctx.fillRect(x + 2, y, w - 4, 1); ctx.fillRect(x + 2, y + h - 1, w - 4, 1);
  ctx.fillRect(x, y + 2, 1, h - 4); ctx.fillRect(x + w - 1, y + 2, 1, h - 4);
  ctx.fillRect(x + 1, y + 1, 1, 1); ctx.fillRect(x + w - 2, y + 1, 1, 1); ctx.fillRect(x + 1, y + h - 2, 1, 1); ctx.fillRect(x + w - 2, y + h - 2, 1, 1);
}

/* ================= 主人公「ポップ」 ================= */
const HERO_PAL = {
  n: { hood: '#25b9a9', hoodD: '#167a72', tunic: '#ff9a2e', tunicD: '#c4621c', pants: '#3d3577', scarf: '#ee3a52', boot: '#6b3a1f', skin: '#ffd9b5', glove: '#ffffff', eye: '#1b1033', tip: '#ffe14d', out: '#1b1033' },
  f: { hood: '#ffffff', hoodD: '#c9cbe0', tunic: '#ee3a52', tunicD: '#9e1d33', pants: '#5a1830', scarf: '#ffb02e', boot: '#6b3a1f', skin: '#ffd9b5', glove: '#ffe14d', eye: '#1b1033', tip: '#ff5a2e', out: '#1b1033' },
  w: { hood: '#ffd84a', hoodD: '#c79a14', tunic: '#4a86ff', tunicD: '#2a4fb0', pants: '#22306b', scarf: '#ffffff', boot: '#6b3a1f', skin: '#ffd9b5', glove: '#ffffff', eye: '#1b1033', tip: '#7ae0ff', out: '#1b1033', wing: true }
};
[['#ff5ab4', '#b02a78', '#ffe14d', '#7a1050'], ['#5affc8', '#1fae84', '#ff7a2e', '#0f6050'], ['#5aa0ff', '#2a5ac8', '#ffffff', '#1a2a80'], ['#ffe14d', '#c79a14', '#ff3a6a', '#806000']]
  .forEach((c, i) => { HERO_PAL['s' + i] = Object.assign({}, HERO_PAL.n, { hood: c[0], hoodD: c[1], tunic: c[2], tunicD: c[1], out: c[3], scarf: c[0] }); });

function drawHero(g, big, pose, Pl) {
  const [L, R] = P();
  const H = big ? 24 : 16;
  const crouch = pose === 'crouch' || pose === 'pound';
  const hy = crouch ? H - 14 : 0, bodyY = hy + 10, legY = big ? 18 : 12;
  const moving = !['stand', 'crouch', 'pound'].includes(pose);
  if (Pl.wing) { const up = pose === 'jump' || pose === 'fall' || pose === 'swim1'; R(0, bodyY - (up ? 5 : 2), 3, 3, '#ffffff'); R(1, bodyY - (up ? 7 : 4), 2, 2, '#e8f4ff'); }
  if (!crouch) {
    let a = [4, 8], ly = [0, 0];
    switch (pose) {
      case 'walk1': case 'swim1': a = [2, 10]; break;
      case 'walk2': a = [3, 9]; ly = [0, -1]; break;
      case 'walk3': a = [5, 7]; break;
      case 'jump': a = [3, 9]; ly = [0, -2]; break;
      case 'fall': a = [3, 9]; ly = [-1, 0]; break;
      case 'skid': a = [2, 9]; break;
      case 'swim2': a = [4, 8]; ly = [-1, 0]; break;
      case 'die': ly = [-2, -2]; break;
      case 'wall': a = [5, 9]; ly = [-1, 0]; break;
    }
    for (let i = 0; i < 2; i++) { const lx = a[i], yy = legY + ly[i], hh = H - legY; R(lx, yy, 3, Math.max(1, hh - 2), Pl.pants); R(lx, yy + hh - 2, 4, 2, Pl.boot); }
  } else { R(3, H - 3, 4, 3, Pl.boot); R(9, H - 3, 4, 3, Pl.boot); }
  const bodyH = crouch ? Math.max(1, (H - 3) - bodyY) : legY - bodyY;
  R(4, bodyY, 8, bodyH, Pl.tunic); R(4, bodyY, 1, bodyH, Pl.tunicD, true);
  if (big && !crouch) { R(4, bodyY + 5, 8, 1, Pl.tunicD, true); R(7, bodyY + 5, 2, 1, Pl.tip, true); }
  // 頭（フード）
  R(1, hy + 4, 3, 3, Pl.hoodD); R(0, hy + 6, 2, 2, Pl.hoodD);
  R(4, hy + 1, 7, 1, Pl.hood); R(3, hy + 2, 9, 7, Pl.hood);
  R(6, hy, 2, 1, Pl.tip);
  R(3, hy + 7, 4, 2, Pl.hoodD, true);
  R(7, hy + 4, 5, 4, Pl.skin, true);
  R(7, hy + 3, 5, 1, Pl.hoodD, true);
  if (pose === 'die') R(9, hy + 5, 3, 1, Pl.eye, true); else R(10, hy + 5, 1, 2, Pl.eye, true);
  R(11, hy + 7, 1, 1, '#ff8f9e', true);
  R(3, hy + 9, 9, 1, Pl.scarf);
  if (moving) { R(0, hy + 9, 3, 1, Pl.scarf); R(0, hy + 10, 2, 1, Pl.scarf); } else R(2, hy + 10, 2, 2, Pl.scarf);
  if (!crouch) {
    const ah = big ? 4 : 2;
    if (pose === 'jump' || pose === 'wall') { R(10, bodyY - 3, 2, 3, Pl.tunicD); R(10, bodyY - 5, 2, 2, Pl.glove); }
    else if (pose === 'die') { R(1, bodyY - 4, 2, 4, Pl.tunicD); R(13, bodyY - 4, 2, 4, Pl.tunicD); R(1, bodyY - 6, 2, 2, Pl.glove); R(13, bodyY - 6, 2, 2, Pl.glove); }
    else if (pose === 'swim1' || pose === 'swim2') { R(11, bodyY + 1, 3, 2, Pl.tunicD); R(14, bodyY + 1, 2, 2, Pl.glove); }
    else { let ax = 9; if (pose === 'walk1') ax = 11; else if (pose === 'walk3') ax = 7; else if (pose === 'skid') ax = 12;
      R(ax, bodyY + 1, 2, ah, Pl.tunicD); R(ax, bodyY + 1 + ah, 2, 2, Pl.glove); }
  }
  parts(g, L, Pl.out);
}
function heroSprite(big, pose, pal) { return spr(`hero${big ? 1 : 0}_${pose}_${pal}`, 16, big ? 24 : 16, g => drawHero(g, big, pose, HERO_PAL[pal])); }

/* ================= 敵スプライト ================= */
const OUT = '#1b1033';
const SLIME_COL = { g: ['#5bd65b', '#2e8f3a'], p: ['#b16bff', '#6a2fb0'], i: ['#7fd8ff', '#3a8fc0'], r: ['#ff7a5a', '#b0402a'], y: ['#ffd84a', '#c08a14'] };
function slimeSpr(col, f) {
  return spr('sl' + col + f, 16, 16, g => {
    const [c, d] = SLIME_COL[col]; const [L, R] = P();
    if (f === 2) { R(1, 12, 14, 4, c); R(3, 11, 10, 1, c); R(4, 13, 3, 1, OUT, true); R(9, 13, 3, 1, OUT, true); }
    else {
      const s = f;
      R(2 - s, 8 + s, 12 + 2 * s, 8 - s, c); R(3 - s, 6 + s, 10 + 2 * s, 2, c); R(5, 5 + s, 6, 1, c);
      R(2 - s, 14, 12 + 2 * s, 2, d, true); R(4, 7 + s, 2, 2, '#ffffff', true);
      R(6, 9 + s, 2, 3, '#ffffff', true); R(10, 9 + s, 2, 3, '#ffffff', true); R(7, 10 + s, 1, 2, OUT, true); R(11, 10 + s, 1, 2, OUT, true);
    }
    parts(g, L, OUT);
  });
}
function beetleSpr(col, mode, f) {
  return spr('bt' + col + mode + f, 16, 16, g => {
    const sh = col === 'r' ? ['#ff5a4a', '#a82a20'] : ['#4ad06a', '#1f8a3a']; const [L, R] = P();
    if (mode === 'walk') {
      R(f ? 3 : 4, 14, 2, 2, '#3a2a1a'); R(f ? 9 : 8, 14, 2, 2, '#3a2a1a');
      R(11, 7, 4, 6, '#ffd36a'); R(13, 8, 1, 2, OUT, true);
      R(1, 6, 11, 8, sh[0]); R(3, 4, 7, 2, sh[0]); R(1, 12, 11, 2, '#fff1c8', true);
      R(6, 4, 1, 8, sh[1], true); R(3, 7, 2, 2, '#ffffff', true);
    } else {
      R(2, 6, 12, 8, sh[0]); R(4, 4, 8, 2, sh[0]); R(2, 12, 12, 2, '#fff1c8', true);
      R(f ? 4 : 7, 4, 2, 8, sh[1], true); R(f ? 10 : 4, 7, 2, 2, '#ffffff', true);
    }
    parts(g, L, OUT);
  });
}
function spinySpr(f) {
  return spr('sp' + f, 16, 16, g => {
    const [L, R] = P();
    R(f ? 3 : 4, 14, 2, 2, '#3a2a1a'); R(f ? 10 : 9, 14, 2, 2, '#3a2a1a');
    R(2, 7, 12, 7, '#e8443a'); R(3, 5, 10, 2, '#e8443a'); R(11, 9, 3, 4, '#ffcf8a'); R(12, 10, 1, 1, OUT, true);
    for (let i = 0; i < 4; i++) R(3 + i * 3, 2, 1, 3, '#ffffff');
    R(3, 12, 8, 2, '#a82a20', true); R(4, 7, 2, 2, '#ff9a8a', true);
    parts(g, L, OUT);
  });
}
function batSpr(f) {
  return spr('bat' + f, 16, 12, g => {
    const [L, R] = P();
    if (f === 0) { R(1, 1, 5, 3, '#4a2280'); R(10, 1, 5, 3, '#4a2280'); R(0, 0, 2, 2, '#4a2280'); R(14, 0, 2, 2, '#4a2280'); }
    else { R(1, 6, 5, 3, '#4a2280'); R(10, 6, 5, 3, '#4a2280'); R(0, 8, 2, 2, '#4a2280'); R(14, 8, 2, 2, '#4a2280'); }
    R(5, 3, 6, 6, '#6b3aa8'); R(6, 2, 1, 1, '#6b3aa8'); R(9, 2, 1, 1, '#6b3aa8');
    R(7, 5, 1, 1, '#ffe14d', true); R(9, 5, 1, 1, '#ffe14d', true); R(8, 7, 1, 1, '#ffffff', true);
    parts(g, L, OUT);
  });
}
function frogSpr(f) {
  return spr('fr' + f, 16, 16, g => {
    const [L, R] = P(); const c = '#ff9a3a';
    if (f === 0) { R(1, 13, 4, 3, '#c45d12'); R(11, 13, 4, 3, '#c45d12'); R(2, 8, 12, 7, c); R(3, 5, 4, 3, c); R(9, 5, 4, 3, c); }
    else { R(2, 12, 3, 4, '#c45d12'); R(11, 12, 3, 4, '#c45d12'); R(3, 4, 10, 8, c); R(3, 2, 4, 3, c); R(9, 2, 4, 3, c); }
    const ey = f ? 3 : 6;
    R(4, ey, 2, 2, '#fff', true); R(10, ey, 2, 2, '#fff', true); R(5, ey + 1, 1, 1, OUT, true); R(11, ey + 1, 1, 1, OUT, true);
    R(5, f ? 8 : 11, 6, 2, '#ffe0a0', true);
    parts(g, L, OUT);
  });
}
function plantSpr(f) {
  return spr('pl' + f, 16, 24, g => {
    const [L, R] = P();
    R(7, 10, 2, 14, '#2e9a3a'); R(2, 15, 5, 3, '#4ccf52'); R(9, 18, 5, 3, '#4ccf52');
    R(2, 0, 12, 10, '#e8304a'); R(1, 2, 14, 6, '#e8304a');
    if (f === 1) { R(3, 4, 10, 3, '#5a0a14', true); R(4, 4, 1, 1, '#fff', true); R(7, 4, 1, 1, '#fff', true); R(10, 4, 1, 1, '#fff', true); R(5, 6, 1, 1, '#fff', true); R(9, 6, 1, 1, '#fff', true); }
    else R(3, 5, 10, 1, '#5a0a14', true);
    R(3, 1, 2, 2, '#ffffff', true); R(11, 2, 2, 2, '#ffffff', true); R(6, 8, 2, 1, '#ffffff', true);
    parts(g, L, OUT);
  });
}
function ghostSpr(shy, f) {
  return spr('gh' + shy + f, 16, 16, g => {
    const [L, R] = P(); const c = '#f4f4ff';
    R(2, 2, 12, 10, c); R(3, 1, 10, 1, c); R(2, 12, 3, 2 + f, c); R(6, 12, 4, 3 - f, c); R(11, 12, 3, 2 + f, c);
    if (shy) { R(3, 5, 4, 4, '#d8d8f0', true); R(9, 5, 4, 4, '#d8d8f0', true); R(6, 10, 4, 1, '#ff8fb0', true); }
    else { R(5, 4, 2, 3, OUT, true); R(9, 4, 2, 3, OUT, true); R(5, 8, 6, 2, OUT, true); R(6, 9, 1, 1, '#ff5a7a', true); R(9, 9, 1, 1, '#ff5a7a', true); }
    parts(g, L, '#3a2a6a');
  });
}
function fishSpr(f) {
  return spr('fi' + f, 16, 12, g => {
    const [L, R] = P();
    R(f ? 0 : 1, 2, 3, 8, '#ff5a3a'); R(4, 1, 10, 9, '#ff8a3a'); R(14, 3, 2, 5, '#ff8a3a'); R(7, 0, 4, 1, '#ff5a3a');
    R(6, 2, 1, 7, '#ffffff', true); R(9, 2, 1, 7, '#ffffff', true); R(12, 3, 2, 2, '#fff', true); R(13, 4, 1, 1, OUT, true);
    parts(g, L, OUT);
  });
}
function urchinSpr(f) {
  return spr('ur' + f, 16, 16, g => {
    const [L, R] = P(); const s = '#e8d8ff', o = f;
    R(7, 0 + o, 2, 3, s); R(7, 13 - o, 2, 3, s); R(0 + o, 7, 3, 2, s); R(13 - o, 7, 3, 2, s);
    R(2, 2, 2, 2, s); R(12, 2, 2, 2, s); R(2, 12, 2, 2, s); R(12, 12, 2, 2, s);
    R(3, 3, 10, 10, '#5a2a7a'); R(4, 4, 3, 2, '#8a5aaa', true);
    R(5, 7, 2, 2, '#fff', true); R(9, 7, 2, 2, '#fff', true); R(6, 8, 1, 1, OUT, true); R(10, 8, 1, 1, OUT, true);
    parts(g, L, OUT);
  });
}
function cannonSpr() {
  return spr('cannon', 16, 16, g => {
    const [L, R] = P();
    R(3, 11, 10, 5, '#6a4a30'); R(4, 12, 8, 1, '#8a6a48', true);
    R(1, 2, 14, 9, '#2a2c3e'); R(0, 3, 1, 7, '#2a2c3e'); R(15, 3, 1, 7, '#2a2c3e');
    R(6, 2, 4, 9, '#4a4c66', true); R(7, 5, 2, 3, '#ffe14d', true); R(2, 3, 2, 1, '#6a6c86', true);
    parts(g, L, OUT);
  });
}
function bulletSpr() {
  return spr('bullet', 16, 14, g => {
    const [L, R] = P();
    R(0, 1, 3, 3, '#e8e8f0'); R(0, 10, 3, 3, '#e8e8f0');
    R(3, 1, 10, 12, '#2a2c3e'); R(13, 2, 2, 10, '#2a2c3e'); R(15, 4, 1, 6, '#2a2c3e');
    R(9, 3, 3, 4, '#fff', true); R(11, 4, 1, 3, OUT, true); R(9, 9, 5, 1, '#e8e8f0', true); R(4, 2, 4, 1, '#5a5c76', true);
    parts(g, L, OUT);
  });
}
function thwompSpr(angry) {
  return spr('tw' + angry, 24, 32, g => {
    const [L, R] = P();
    R(1, 1, 22, 30, '#8a93a6');
    for (let i = 0; i < 5; i++) { R(0, 3 + i * 6, 1, 3, '#c8d0e0'); R(23, 3 + i * 6, 1, 3, '#c8d0e0'); }
    R(1, 1, 22, 2, '#b8c0d0', true); R(1, 28, 22, 3, '#5a6276', true); R(3, 5, 2, 18, '#a8b0c0', true);
    if (angry) { R(4, 8, 6, 2, '#2a2c3e', true); R(14, 8, 6, 2, '#2a2c3e', true); R(8, 10, 2, 1, '#2a2c3e', true); R(14, 10, 2, 1, '#2a2c3e', true); }
    else { R(4, 9, 6, 2, '#2a2c3e', true); R(14, 9, 6, 2, '#2a2c3e', true); }
    R(5, 11, 4, 5, '#ffffff', true); R(15, 11, 4, 5, '#ffffff', true);
    R(angry ? 7 : 6, 13, 2, 3, OUT, true); R(angry ? 15 : 16, 13, 2, 3, OUT, true);
    R(6, 21, 12, 4, '#2a2c3e', true);
    for (let i = 0; i < 4; i++) { R(7 + i * 3, 21, 2, 2, '#ffffff', true); }
    parts(g, L, OUT);
  });
}
function podSpr(f) {
  return spr('pod' + f, 12, 14, g => {
    const [L, R] = P();
    R(2, 3, 8, 10, f ? '#ff5a1a' : '#ff7a1a'); R(1, 5, 10, 6, f ? '#ff5a1a' : '#ff7a1a'); R(3, 1, 6, 2, '#ffb02e'); R(5, 0, 2, 1, '#ffe14d');
    R(4, 5, 4, 6, '#ffe14d', true); R(3, 6, 2, 2, '#fff', true); R(7, 6, 2, 2, '#fff', true); R(4, 7, 1, 1, OUT, true); R(8, 7, 1, 1, OUT, true);
    parts(g, L, '#5a1408');
  });
}
function orbSpr(kind, f) {
  return spr('orb' + kind + f, 8, 8, g => {
    const C = { fire: ['#ff7a1a', '#ffe14d'], ghost: ['#a86aff', '#f0d8ff'], ice: ['#7fd8ff', '#ffffff'], dark: ['#6a1a9a', '#ff5ae0'], bolt: ['#ffe14d', '#ffffff'], rock: ['#7a6a5a', '#b0a090'] }[kind] || ['#ff7a1a', '#ffe14d'];
    g.fillStyle = C[0]; g.fillRect(2, 0, 4, 8); g.fillRect(0, 2, 8, 4); g.fillRect(1, 1, 6, 6);
    g.fillStyle = C[1]; g.fillRect(2 + f, 2, 3, 3);
  });
}
function springSpr(f) {
  return spr('spr' + f, 16, 16, g => {
    const [L, R] = P(); const top = f ? 8 : 2;
    R(1, 13, 14, 3, '#e8304a');
    for (let y = top + 3; y < 13; y += 2) R(((y >> 1) & 1) ? 3 : 4, y, 9, 1, '#b8c0d0');
    R(1, top, 14, 3, '#e8304a'); R(2, top, 12, 1, '#ff8a9a', true); R(2, 13, 12, 1, '#ff8a9a', true);
    parts(g, L, OUT);
  });
}

/* ================= アイテム ================= */
function itemSpr(kind, f = 0) {
  return spr('it' + kind + f, 16, 16, g => {
    const [L, R] = P();
    if (kind === 'berry') {
      R(3, 4, 10, 11, '#ff3a5a'); R(2, 6, 12, 7, '#ff3a5a'); R(5, 5, 2, 2, '#ffffff', true); R(7, 1, 2, 3, '#3fbf4a'); R(9, 2, 3, 2, '#3fbf4a');
      R(6, 8, 1, 2, OUT, true); R(9, 8, 1, 2, OUT, true); R(7, 11, 2, 1, OUT, true);
    } else if (kind === 'fire') {
      R(4, 6, 8, 9, '#ff6a1a'); R(3, 8, 10, 5, '#ff6a1a'); R(5, 3, 6, 3, '#ff9a2e'); R(7, 1, 2, 2, '#ffe14d');
      R(6, 8, 4, 5, '#ffe14d', true); R(6, 9, 1, 2, OUT, true); R(9, 9, 1, 2, OUT, true);
    } else if (kind === 'wing') {
      R(2, 3, 11, 4, '#ffffff'); R(1, 7, 11, 3, '#e8f4ff'); R(3, 10, 8, 2, '#d0e8ff'); R(11, 9, 4, 2, '#c7a040');
      R(4, 5, 7, 1, '#c8dcff', true); R(3, 8, 7, 1, '#b8d0f0', true);
    } else if (kind === 'star') {
      const c = ['#ffe14d', '#fff3a0', '#ffc83a'][f % 3];
      R(7, 0, 2, 3, c); R(5, 3, 6, 2, c); R(0, 5, 16, 3, c); R(2, 8, 12, 2, c); R(3, 10, 10, 2, c); R(2, 12, 4, 2, c); R(10, 12, 4, 2, c); R(1, 14, 3, 1, c); R(12, 14, 3, 1, c);
      R(6, 6, 1, 2, OUT, true); R(9, 6, 1, 2, OUT, true);
    } else if (kind === 'oneup') {
      R(2, 3, 5, 4, '#3fdc6a'); R(9, 3, 5, 4, '#3fdc6a'); R(1, 5, 14, 4, '#3fdc6a'); R(3, 9, 10, 2, '#3fdc6a'); R(5, 11, 6, 2, '#3fdc6a'); R(7, 13, 2, 1, '#3fdc6a');
      R(3, 4, 2, 2, '#ffffff', true); R(6, 7, 1, 2, OUT, true); R(9, 7, 1, 2, OUT, true);
    } else if (kind === 'medal' || kind === 'medalG') {
      const C = kind === 'medal' ? ['#ffc83a', '#ffe68a', '#c88a14', '#fff8d0'] : ['#7aa8e8', '#b8d0ff', '#4a6ab0', '#e8f0ff'];
      R(4, 1, 8, 14, C[0]); R(2, 3, 12, 10, C[0]); R(1, 5, 14, 6, C[0]);
      R(4, 3, 8, 10, C[1], true); R(3, 5, 10, 6, C[1], true);
      R(7, 4, 2, 2, C[2], true); R(4, 6, 8, 2, C[2], true); R(5, 8, 6, 2, C[2], true); R(5, 10, 2, 2, C[2], true); R(9, 10, 2, 2, C[2], true);
      R(3, 3, 2, 2, C[3], true);
    }
    parts(g, L, OUT);
  });
}
function coinSpr(f) {
  return spr('coin' + f, 16, 16, g => {
    const w = [10, 6, 2, 6][f];
    const x = 8 - w / 2;
    g.fillStyle = '#8a5a10'; g.fillRect(x - 1, 2, w + 2, 12); g.fillRect(x, 1, w, 14);
    g.fillStyle = '#ffc83a'; g.fillRect(x, 2, w, 12);
    if (w > 2) { g.fillStyle = '#fff3a0'; g.fillRect(x + 1, 3, 1, 9); g.fillStyle = '#d8961a'; g.fillRect(x + w - 2, 4, 1, 8); }
    if (w >= 6) { g.fillStyle = '#d8961a'; g.fillRect(7, 5, 2, 6); }
  });
}
function bigStarSpr(f) {
  return spr('bigstar' + f, 24, 24, g => {
    const [L, R] = P(); const c = ['#ffe14d', '#ff9ae0', '#9ae8ff', '#b8ff9a'][f % 4];
    R(10, 0, 4, 5, c); R(8, 5, 8, 3, c); R(0, 8, 24, 4, c); R(3, 12, 18, 3, c); R(5, 15, 14, 3, c); R(3, 18, 6, 3, c); R(15, 18, 6, 3, c); R(1, 21, 5, 2, c); R(18, 21, 5, 2, c);
    R(9, 9, 2, 3, OUT, true); R(13, 9, 2, 3, OUT, true); R(10, 14, 4, 1, OUT, true); R(4, 9, 3, 2, '#ffffff', true);
    parts(g, L, OUT);
  });
}

/* ================= テーマ ================= */
const THEMES = {
  grass: { sky: ['#4fb8ff', '#b8ecff'], g: '#c27c3e', gd: '#8d4f22', gl: '#e5a565', top: '#4fd04a', topd: '#2e9a2e', topl: '#a3f56c', br: '#d86a3c', brd: '#7c2e14', brl: '#f39a6a', st: '#c9a978', std: '#83663f', stl: '#ead3a6', semi: 'wood', pil: '#5fcf6a', pild: '#2e8f3a', pill: '#a8f0a0' },
  desert: { sky: ['#ff8a4a', '#ffe0a0'], g: '#e0a95a', gd: '#a8742e', gl: '#f5c985', top: '#ffe08a', topd: '#d9a84a', topl: '#fff3c2', br: '#d8a050', brd: '#8a5a20', brl: '#f0c880', st: '#d0b080', std: '#8a6a3a', stl: '#f0dcb0', semi: 'wood', pil: '#c8a060', pild: '#806020', pill: '#f0d090' },
  ice: { sky: ['#8fd0ff', '#eef9ff'], g: '#6fa8d8', gd: '#3f6fa0', gl: '#a8d8f8', top: '#ffffff', topd: '#c8e0f0', topl: '#ffffff', br: '#7ab8e8', brd: '#2f5f90', brl: '#c0e8ff', st: '#b8d8f0', std: '#6890b8', stl: '#ffffff', semi: 'ice', pil: '#8fd0ff', pild: '#3f80b0', pill: '#e0f6ff' },
  forest: { sky: ['#0e1630', '#2e3f72'], g: '#4a3428', gd: '#2a1c14', gl: '#6a4a38', top: '#2f8a4a', topd: '#1a5a2e', topl: '#5fc070', br: '#6a4a3a', brd: '#2a1a12', brl: '#9a7258', st: '#5a6070', std: '#30343e', stl: '#8a90a0', semi: 'wood', pil: '#7a5a40', pild: '#3a2818', pill: '#a8805a', dark: true },
  sky: { sky: ['#6cc0ff', '#ffeef8'], g: '#ffffff', gd: '#b8d0f0', gl: '#ffffff', top: '#ffffff', topd: '#d8e8ff', topl: '#ffffff', br: '#f0c0e0', brd: '#a06890', brl: '#ffe8f6', st: '#f8e090', std: '#c0a040', stl: '#fff8d0', semi: 'cloud', pil: '#f8e0a0', pild: '#c0a050', pill: '#fffbe0', cloud: true },
  volcano: { sky: ['#1a060c', '#8a2a1a'], g: '#4a3030', gd: '#241414', gl: '#6a4444', top: '#5a3a3a', topd: '#ff5a1a', topl: '#8a5a5a', br: '#7a3a2a', brd: '#3a1410', brl: '#a85a40', st: '#6a5a5a', std: '#302626', stl: '#9a8a8a', semi: 'stone', pil: '#5a4848', pild: '#2a1e1e', pill: '#8a7070', lava: true },
  star: { sky: ['#07031a', '#3a1a6a'], g: '#5a3a9a', gd: '#2a1a5a', gl: '#8a6ad0', top: '#c8a0ff', topd: '#7a4ad0', topl: '#f0e0ff', br: '#7a5ac8', brd: '#2a1a6a', brl: '#b8a0ff', st: '#a090e0', std: '#4a3a90', stl: '#e0d8ff', semi: 'crystal', pil: '#8a70e0', pild: '#3a2a90', pill: '#d0c0ff' },
  cave: { sky: ['#06080f', '#1a2236'], g: '#4a5a78', gd: '#262e44', gl: '#6a7c9e', top: '#5f7392', topd: '#3a4660', topl: '#8aa0c0', br: '#5a6a8a', brd: '#222a40', brl: '#8090b0', st: '#7080a0', std: '#384260', stl: '#a0b0d0', semi: 'stone', pil: '#5a6a8a', pild: '#2a3248', pill: '#8a9ab8' },
  water: { sky: ['#06346e', '#1a82c0'], g: '#d8b878', gd: '#9a7a40', gl: '#f0d8a0', top: '#f0dca0', topd: '#c0a060', topl: '#fff4d0', br: '#e07a8a', brd: '#8a3040', brl: '#ffb0c0', st: '#5a9ab8', std: '#2a5a78', stl: '#9ad0e8', semi: 'coral', pil: '#ff8aa0', pild: '#b04060', pill: '#ffc8d4', water: true },
  castle: { sky: ['#0c0a14', '#2e2036'], g: '#5a5468', gd: '#2c2836', gl: '#7a7490', top: '#6a6480', topd: '#3a3648', topl: '#8a84a0', br: '#6a5a70', brd: '#2a2232', brl: '#8a7a90', st: '#7a748a', std: '#3a3648', stl: '#a8a2b8', semi: 'stone', pil: '#6a6480', pild: '#2c2836', pill: '#9a94b0', lava: true, bricky: true }
};

function tileImg(th, kind, f = 0) {
  return spr(`t_${th}_${kind}_${f}`, 16, 16, g => {
    const TH = THEMES[th]; const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    switch (kind) {
      case 'gtop': case 'gfill':
        if (TH.cloud) {
          R(0, 0, 16, 16, TH.g); R(0, 13, 16, 3, TH.gd); R(3, 6, 2, 1, TH.gd); R(10, 9, 3, 1, TH.gd);
          if (kind === 'gtop') { g.clearRect(0, 0, 16, 3); R(1, 1, 6, 2, TH.g); R(9, 1, 6, 2, TH.g); R(2, 0, 4, 1, TH.g); R(10, 0, 4, 1, TH.g); R(0, 3, 16, 1, '#ffffff'); }
        } else if (TH.bricky) {
          R(0, 0, 16, 16, TH.g); R(0, 7, 16, 1, TH.gd); R(0, 15, 16, 1, TH.gd); R(4, 0, 1, 7, TH.gd); R(12, 8, 1, 7, TH.gd);
          R(0, 0, 16, 1, TH.gl); R(0, 8, 16, 1, TH.gl); R(6, 3, 2, 1, TH.gl);
        } else {
          R(0, 0, 16, 16, TH.g); R(3, 6, 2, 2, TH.gd); R(10, 10, 2, 2, TH.gd); R(6, 13, 2, 1, TH.gd); R(13, 4, 1, 2, TH.gd);
          R(12, 3, 1, 1, TH.gl); R(1, 11, 1, 1, TH.gl); R(8, 8, 1, 1, TH.gl);
          if (kind === 'gtop') {
            R(0, 0, 16, 4, TH.top); R(0, 4, 16, 1, TH.topd); for (let x = 0; x < 16; x += 4) R(x + 1, 5, 2, 1, TH.topd);
            R(0, 0, 16, 1, TH.topl); R(3, 1, 2, 1, TH.topl); R(11, 2, 2, 1, TH.topl);
          }
          if (TH.lava) { R(4, 9, 1, 3, '#ff6a1a'); R(5, 11, 3, 1, '#ff6a1a'); R(11, 7, 1, 3, '#ff9a2e'); }
        }
        break;
      case 'brick':
        R(0, 0, 16, 16, TH.br); R(0, 0, 16, 1, TH.brl); R(0, 8, 16, 1, TH.brl);
        R(0, 7, 16, 1, TH.brd); R(0, 15, 16, 1, TH.brd); R(7, 0, 1, 7, TH.brd); R(3, 8, 1, 7, TH.brd); R(11, 8, 1, 7, TH.brd);
        R(1, 1, 1, 6, TH.brl); R(8, 1, 1, 6, TH.brl); R(4, 9, 1, 6, TH.brl); R(12, 9, 1, 6, TH.brl);
        break;
      case 'q': {
        const c = ['#ffc83a', '#ffd860', '#ffe890'][f];
        R(0, 0, 16, 16, '#8a4a10'); R(1, 1, 14, 14, c); R(1, 1, 14, 1, '#fff6c8'); R(1, 14, 14, 1, '#c88a20'); R(14, 1, 1, 14, '#c88a20');
        R(2, 2, 1, 1, '#8a4a10'); R(13, 2, 1, 1, '#8a4a10'); R(2, 13, 1, 1, '#8a4a10'); R(13, 13, 1, 1, '#8a4a10');
        R(8, 4, 2, 10, '#c88a20'); R(4, 8, 10, 2, '#c88a20'); R(6, 6, 6, 6, '#c88a20');
        R(7, 3, 2, 10, '#ffffff'); R(3, 7, 10, 2, '#ffffff'); R(5, 5, 6, 6, '#ffffff'); R(6, 6, 4, 4, '#fff6c8');
        break;
      }
      case 'used': R(0, 0, 16, 16, '#5a3018'); R(1, 1, 14, 14, '#a86a3a'); R(1, 1, 14, 1, '#c88a5a'); R(2, 2, 1, 1, '#5a3018'); R(13, 2, 1, 1, '#5a3018'); R(2, 13, 1, 1, '#5a3018'); R(13, 13, 1, 1, '#5a3018'); break;
      case 'stone': R(0, 0, 16, 16, TH.std); R(0, 0, 15, 15, TH.stl); R(1, 1, 14, 14, TH.st); R(2, 2, 4, 1, TH.stl); R(2, 3, 1, 3, TH.stl); R(12, 12, 2, 2, TH.std); break;
      case 'semi': {
        const s = TH.semi;
        if (s === 'wood') { R(0, 0, 16, 5, '#c88a40'); R(0, 0, 16, 1, '#f0c070'); R(0, 4, 16, 1, '#7a4a1a'); R(3, 1, 1, 3, '#7a4a1a'); R(11, 1, 1, 3, '#7a4a1a'); R(0, 5, 1, 3, '#7a4a1a'); R(15, 5, 1, 3, '#7a4a1a'); }
        else if (s === 'cloud') { R(0, 2, 16, 5, '#ffffff'); R(2, 0, 5, 2, '#ffffff'); R(9, 1, 5, 1, '#ffffff'); R(0, 6, 16, 1, '#c8dcff'); }
        else if (s === 'ice') { R(0, 0, 16, 6, '#cdeeff'); R(0, 0, 16, 1, '#ffffff'); R(0, 5, 16, 1, '#6fa8d8'); R(3, 2, 3, 1, '#ffffff'); }
        else if (s === 'crystal') { R(0, 0, 16, 5, '#d0b0ff'); R(0, 0, 16, 1, '#ffffff'); R(0, 4, 16, 1, '#7a4ad0'); R(5, 1, 2, 2, '#ffffff'); }
        else if (s === 'coral') { R(0, 0, 16, 5, '#ff8aa0'); R(0, 0, 16, 1, '#ffd0d8'); R(0, 4, 16, 1, '#b04060'); R(4, 1, 1, 3, '#ffd0d8'); }
        else { R(0, 0, 16, 6, TH.st); R(0, 0, 16, 1, TH.stl); R(0, 5, 16, 1, TH.std); R(7, 1, 1, 4, TH.std); }
        break;
      }
      case 'spike':
        R(0, 12, 16, 4, '#5a5a6a'); R(0, 12, 16, 1, '#8a8a9a');
        for (const k of [0, 8]) for (let j = 0; j < 10; j++) {
          const w = 2 + 2 * Math.floor(j * 3 / 9), x = k + 4 - w / 2;
          R(x, 2 + j, w / 2, 1, '#eeeef6'); R(x + w / 2, 2 + j, w / 2, 1, '#9a9aaa');
        }
        break;
      case 'ptopL': R(0, 0, 16, 7, TH.pild); R(1, 1, 15, 5, TH.pil); R(1, 1, 15, 1, TH.pill); R(2, 2, 2, 3, TH.pill); R(2, 7, 14, 9, TH.pild); R(3, 7, 13, 9, TH.pil); R(4, 7, 2, 9, TH.pill); break;
      case 'ptopR': R(0, 0, 16, 7, TH.pild); R(0, 1, 15, 5, TH.pil); R(0, 1, 15, 1, TH.pill); R(0, 7, 14, 9, TH.pild); R(0, 7, 13, 9, TH.pil); R(9, 7, 2, 9, TH.pild); break;
      case 'pilL': R(2, 0, 14, 16, TH.pild); R(3, 0, 13, 16, TH.pil); R(4, 0, 2, 16, TH.pill); break;
      case 'pilR': R(0, 0, 14, 16, TH.pild); R(0, 0, 13, 16, TH.pil); R(9, 0, 2, 16, TH.pild); break;
      case 'lavatop': {
        R(0, 0, 16, 16, '#e83a10'); R(0, 6, 16, 10, '#c82a08');
        for (let x = 0; x < 16; x++) { const y = 2 + Math.round(Math.sin((x + f * 4) * 0.8) * 1.5); R(x, 0, 1, y, 'rgba(0,0,0,0)'); g.clearRect(x, 0, 1, y); R(x, y, 1, 2, '#ffd23a'); }
        R((f * 5) % 13, 9, 3, 1, '#ff8a1a'); R((f * 7 + 6) % 13, 12, 2, 1, '#ff8a1a');
        break;
      }
      case 'lava': R(0, 0, 16, 16, '#c82a08'); R((f * 3) % 12, 4, 4, 1, '#ff6a1a'); R((f * 5 + 7) % 12, 10, 3, 1, '#ff6a1a'); break;
    }
  });
}

/* ================= 背景（多重スクロール） ================= */
function silhouette(g, base, waves, color, peaks) {
  g.fillStyle = color;
  for (let x = 0; x < 512; x++) {
    let y = base;
    for (const [k, a, ph] of waves) {
      if (peaks) { const fr = ((x / 512) * k + ph) % 1; y -= a * (1 - Math.abs(2 * fr - 1)); }
      else y += Math.sin((x / 512) * Math.PI * 2 * k + ph) * a;
    }
    y = Math.round(y); g.fillRect(x, y, 1, 240 - y);
  }
}
function heightAt(x, base, waves, peaks) {
  let y = base;
  for (const [k, a, ph] of waves) {
    if (peaks) { const fr = ((x / 512) * k + ph) % 1; y -= a * (1 - Math.abs(2 * fr - 1)); }
    else y += Math.sin((x / 512) * Math.PI * 2 * k + ph) * a;
  }
  return y;
}
function cloudPuff(g, x, y, w, c1, c2) {
  g.fillStyle = c2; g.fillRect(x, y + 6, w, 6);
  g.fillStyle = c1;
  g.fillRect(x + 2, y + 2, w - 4, 8); g.fillRect(x + w * 0.2, y - 2, w * 0.35, 6); g.fillRect(x + w * 0.5, y, w * 0.3, 4);
}
function bgLayer(th, which) {
  return spr(`bg_${th}_${which}`, 512, 240, g => {
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    const rng = makeRng(th.length * 97 + (which === 'far' ? 1 : 2));
    if (which === 'far') {
      switch (th) {
        case 'grass':
          for (let i = 0; i < 6; i++) cloudPuff(g, i * 86 + rng.i(0, 30), rng.i(20, 70), rng.i(36, 60), '#ffffff', '#d8f0ff');
          silhouette(g, 170, [[2, 26, 0.3], [5, 8, 1.2]], '#8fdc9a'); break;
        case 'desert':
          R(400, 40, 22, 22, '#fff2b0'); R(396, 44, 30, 14, '#fff2b0');
          for (let i = 0; i < 3; i++) { const px = 60 + i * 170, h = 50 + i * 12; for (let y = 0; y < h; y++) R(px - y * 0.9, 175 - h + y, y * 1.8, 1, y % 6 === 0 ? '#e8a060' : '#f0b878'); }
          silhouette(g, 182, [[3, 10, 0.5], [7, 4, 2]], '#f5c48a'); break;
        case 'ice':
          silhouette(g, 190, [[4, 70, 0.1], [9, 20, 0.6]], '#a8c8e8', true);
          for (let x = 0; x < 512; x++) { const y = heightAt(x, 190, [[4, 70, 0.1], [9, 20, 0.6]], true); if (y < 140) R(x, Math.round(y), 1, Math.round((140 - y) * 0.5) + 2, '#ffffff'); }
          break;
        case 'forest':
          for (let i = 0; i < 70; i++) R(rng.i(0, 511), rng.i(0, 110), 1, 1, rng.chance(0.3) ? '#ffffff' : '#8aa0ff');
          R(400, 30, 20, 20, '#fff8d0'); R(396, 34, 28, 12, '#fff8d0'); R(408, 32, 10, 8, '#e8e0b0');
          for (let i = 0; i < 26; i++) { const x = i * 20 + rng.i(0, 8), h = rng.i(60, 110); for (let y = 0; y < h; y++) { const w = Math.round((y / h) * 18) + 2; R(x - w / 2, 200 - h + y, w, 1, '#16244a'); } }
          R(0, 200, 512, 40, '#16244a'); break;
        case 'sky':
          for (let i = 0; i < 9; i++) cloudPuff(g, i * 58 + rng.i(0, 20), rng.i(120, 200), rng.i(50, 90), '#ffffff', '#ffe0f0');
          for (let i = 0; i < 5; i++) cloudPuff(g, i * 104 + rng.i(0, 40), rng.i(30, 80), rng.i(30, 50), '#ffffffcc', '#f0e8ff');
          break;
        case 'volcano':
          silhouette(g, 200, [[2, 90, 0.25]], '#3a1418', true);
          for (let k = 0; k < 2; k++) { const cx = 128 + k * 256; R(cx - 8, 112, 16, 6, '#ff5a1a'); R(cx - 4, 106, 8, 6, '#ffb02e'); }
          break;
        case 'star':
          for (let i = 0; i < 120; i++) R(rng.i(0, 511), rng.i(0, 200), 1, 1, rng.pick(['#ffffff', '#c8a0ff', '#9ae8ff', '#ffe14d']));
          for (let i = 0; i < 5; i++) { const x = i * 104 + 40, h = rng.i(60, 120); R(x, 220 - h, 14, h, '#2a1a5a'); R(x + 3, 220 - h - 10, 8, 10, '#2a1a5a'); R(x + 6, 220 - h - 16, 2, 6, '#c8a0ff'); }
          break;
        case 'cave':
          for (let i = 0; i < 20; i++) { const x = rng.i(0, 500), h = rng.i(20, 70); for (let y = 0; y < h; y++) R(x + y * 0.15, y, Math.max(1, 12 - y * 0.17), 1, '#141a2c'); }
          for (let i = 0; i < 30; i++) R(rng.i(0, 511), rng.i(60, 200), 1, 1, '#4a6aa0');
          break;
        case 'water':
          for (let i = 0; i < 8; i++) { const x = i * 64 + rng.i(0, 20); R(x, 0, 10 + rng.i(0, 8), 240, 'rgba(160,220,255,0.06)'); }
          silhouette(g, 200, [[3, 16, 0.4], [7, 6, 1]], '#0a4a7a'); break;
        case 'castle':
          R(0, 40, 512, 200, '#1a1424');
          for (let x = 0; x < 512; x += 64) { R(x + 4, 40, 56, 160, '#221a2e'); R(x + 24, 70, 16, 26, '#0c0814'); R(x + 26, 72, 12, 22, '#3a2040'); R(x + 31, 72, 2, 22, '#1a1424'); }
          break;
      }
    } else {
      switch (th) {
        case 'grass':
          silhouette(g, 200, [[3, 18, 1], [8, 5, 0.2]], '#3fb04a');
          for (let i = 0; i < 9; i++) { const x = i * 57 + rng.i(0, 20), y = heightAt(x, 200, [[3, 18, 1], [8, 5, 0.2]]); R(x - 1, y - 18, 3, 18, '#7a4a20'); R(x - 8, y - 30, 17, 14, '#2e9a3a'); R(x - 5, y - 34, 11, 5, '#2e9a3a'); R(x - 5, y - 28, 4, 3, '#5fd06a'); }
          break;
        case 'desert':
          silhouette(g, 205, [[2, 10, 1.4], [5, 5, 0]], '#e8b060');
          for (let i = 0; i < 7; i++) { const x = i * 73 + rng.i(0, 30), y = heightAt(x, 205, [[2, 10, 1.4], [5, 5, 0]]); R(x - 3, y - 30, 6, 30, '#3a9a4a'); R(x - 10, y - 22, 4, 10, '#3a9a4a'); R(x - 10, y - 14, 8, 3, '#3a9a4a'); R(x + 6, y - 26, 4, 10, '#3a9a4a'); R(x + 3, y - 18, 7, 3, '#3a9a4a'); R(x - 2, y - 28, 1, 26, '#6ac87a'); }
          break;
        case 'ice':
          silhouette(g, 210, [[3, 10, 0.7]], '#d8ecfa');
          for (let i = 0; i < 12; i++) { const x = i * 43 + rng.i(0, 15), y = heightAt(x, 210, [[3, 10, 0.7]]), h = rng.i(30, 50); for (let j = 0; j < h; j++) { const w = Math.round((j / h) * 18) + 1; R(x - w / 2, y - h + j, w, 1, (j % 8) < 2 ? '#ffffff' : '#3a7a8a'); } R(x - 1, y - 2, 3, 4, '#5a4030'); }
          break;
        case 'forest':
          for (let i = 0; i < 6; i++) { const x = i * 86 + rng.i(0, 30); R(x, 0, 18, 240, '#241a14'); R(x + 3, 0, 3, 240, '#3a2a1e'); R(x - 20, 0, 60, 40, '#0f2a1a'); }
          for (let i = 0; i < 16; i++) { const x = rng.i(0, 500), y = rng.i(190, 215); R(x, y, 2, 6, '#e8d8c0'); R(x - 3, y - 3, 8, 3, rng.pick(['#5affd8', '#ff7ae0', '#ffe14d'])); }
          R(0, 215, 512, 25, '#0f1a14'); break;
        case 'sky':
          for (let i = 0; i < 4; i++) { const x = i * 128 + rng.i(10, 50), y = rng.i(110, 170); R(x, y, 50, 8, '#7ad07a'); R(x + 4, y + 8, 42, 6, '#c8a070'); R(x + 10, y + 14, 30, 6, '#a88050'); R(x + 18, y + 20, 14, 6, '#a88050'); R(x + 8, y - 12, 3, 12, '#7a4a20'); R(x + 2, y - 20, 15, 10, '#3fb04a'); }
          break;
        case 'volcano':
          silhouette(g, 212, [[4, 14, 0.3], [11, 6, 1]], '#2a1010');
          for (let i = 0; i < 10; i++) { const x = rng.i(0, 500), h = rng.i(25, 60); R(x, 212 - h, 8, h, '#3a1a1a'); R(x + 2, 212 - h - 6, 4, 6, '#3a1a1a'); }
          break;
        case 'star':
          for (let i = 0; i < 10; i++) { const x = rng.i(0, 500), y = rng.i(60, 200), s = rng.i(4, 9); R(x, y - s, 2, s * 2, '#b08aff'); R(x - s / 2, y - 1, s + 2, 2, '#b08aff'); R(x, y - 1, 2, 2, '#ffffff'); }
          silhouette(g, 222, [[3, 8, 0.9]], '#24124a'); break;
        case 'cave':
          for (let i = 0; i < 9; i++) { const x = rng.i(0, 500), h = rng.i(30, 70); for (let y = 0; y < h; y++) R(x + y * 0.12, 240 - y, Math.max(1, 14 - y * 0.2), 1, '#1e2840'); }
          for (let i = 0; i < 8; i++) { const x = rng.i(0, 500), y = rng.i(150, 210); R(x, y, 4, 10, '#4ae8ff'); R(x + 1, y - 4, 2, 4, '#9af4ff'); R(x + 5, y + 4, 3, 6, '#2ab0e0'); }
          break;
        case 'water':
          for (let i = 0; i < 14; i++) { const x = rng.i(0, 500), h = rng.i(30, 80); for (let y = 0; y < h; y += 2) R(x + Math.round(Math.sin(y * 0.15) * 3), 240 - y, 3, 2, '#1a8a5a'); }
          for (let i = 0; i < 6; i++) { const x = rng.i(0, 500); R(x, 220, 14, 20, '#e86a8a'); R(x + 3, 210, 3, 10, '#e86a8a'); R(x + 9, 214, 3, 6, '#e86a8a'); }
          break;
        case 'castle':
          for (let x = 0; x < 512; x += 128) { R(x + 10, 0, 22, 240, '#2c2438'); R(x + 12, 0, 4, 240, '#3a3048'); R(x + 60, 30, 20, 50, '#7a1a2a'); R(x + 60, 80, 10, 8, '#7a1a2a'); R(x + 70, 80, 10, 4, '#7a1a2a'); R(x + 67, 45, 6, 6, '#ffc83a'); }
          break;
      }
    }
  });
}
const SKY_GRAD = {};
function drawSky(th) {
  let gr = SKY_GRAD[th];
  if (!gr) { const T = THEMES[th]; gr = ctx.createLinearGradient(0, 0, 0, VIEW_H); gr.addColorStop(0, T.sky[0]); gr.addColorStop(1, T.sky[1]); SKY_GRAD[th] = gr; }
  ctx.fillStyle = gr; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}
function drawLayer(img, off, y = 0) {
  let x = -Math.round(((off % 512) + 512) % 512);
  for (; x < VIEW_W; x += 512) ctx.drawImage(img, x, y);
}
function drawBackground(th, camX) {
  drawSky(th);
  drawLayer(bgLayer(th, 'far'), camX * 0.15);
  drawLayer(bgLayer(th, 'mid'), camX * 0.4);
}

/* ================= デコレーション ================= */
const DECO = {
  grass: ['bush', 'flower', 'bush', 'fence'], desert: ['cactus', 'rock', 'palm'], ice: ['pine', 'snowman', 'pine'], forest: ['mush', 'tuft', 'mush'],
  sky: ['puff', 'flower', 'puff'], volcano: ['rock', 'bones', 'rock'], star: ['crystal', 'crystal', 'orbpost'], cave: ['crystal', 'stalag', 'mush'],
  water: ['weed', 'coral', 'weed'], castle: ['torch', 'banner']
};
function decoSpr(kind, f = 0) {
  return spr('dc' + kind + f, 32, 32, g => {
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    switch (kind) {
      case 'bush': R(4, 22, 24, 10, '#1f7a2a'); R(6, 18, 20, 12, '#2ea83a'); R(9, 14, 8, 6, '#2ea83a'); R(17, 16, 8, 4, '#2ea83a'); R(9, 17, 4, 3, '#6ad86a'); R(18, 19, 3, 2, '#6ad86a'); break;
      case 'flower': R(15, 22, 2, 10, '#2e9a3a'); R(11, 26, 4, 2, '#3fbf4a'); R(12, 16, 8, 6, '#ff6aa8'); R(14, 14, 4, 10, '#ff6aa8'); R(14, 18, 4, 2, '#ffe14d'); R(5, 28, 2, 4, '#2e9a3a'); R(3, 25, 6, 3, '#fff'); R(5, 26, 2, 1, '#ffe14d'); break;
      case 'fence': for (let x = 2; x < 32; x += 10) { R(x, 18, 4, 14, '#c8904a'); R(x, 17, 4, 1, '#f0c080'); } R(0, 21, 32, 3, '#a87038'); R(0, 27, 32, 3, '#a87038'); break;
      case 'cactus': R(13, 6, 6, 26, '#3a9a4a'); R(6, 12, 4, 10, '#3a9a4a'); R(6, 20, 8, 3, '#3a9a4a'); R(22, 10, 4, 10, '#3a9a4a'); R(18, 18, 8, 3, '#3a9a4a'); R(14, 8, 1, 22, '#6ac87a'); R(15, 4, 2, 2, '#ff7ab0'); break;
      case 'rock': R(6, 22, 20, 10, '#8a7060'); R(9, 18, 14, 6, '#8a7060'); R(10, 19, 5, 3, '#b09a88'); R(6, 30, 20, 2, '#5a4438'); break;
      case 'palm': R(15, 10, 3, 22, '#a07040'); R(5, 6, 12, 3, '#3a9a4a'); R(16, 6, 12, 3, '#3a9a4a'); R(8, 3, 16, 4, '#3a9a4a'); R(4, 9, 4, 3, '#3a9a4a'); R(25, 9, 4, 3, '#3a9a4a'); R(14, 9, 5, 4, '#7a4a20'); break;
      case 'pine': for (let j = 0; j < 22; j++) { const w = Math.round(j * 0.9) + 2; R(16 - w / 2, 4 + j, w, 1, (j % 7) < 2 ? '#ffffff' : '#2a7a6a'); } R(14, 26, 4, 6, '#5a4030'); break;
      case 'snowman': R(9, 18, 14, 14, '#ffffff'); R(11, 8, 10, 11, '#ffffff'); R(13, 11, 2, 2, '#1b1033'); R(18, 11, 2, 2, '#1b1033'); R(15, 14, 4, 2, '#ff8a2a'); R(10, 18, 12, 2, '#ee3a52'); R(11, 4, 10, 4, '#3a3a5a'); R(9, 8, 14, 1, '#3a3a5a'); R(9, 30, 14, 2, '#c8e0f0'); break;
      case 'mush': R(13, 20, 6, 12, '#e8d8c0'); R(6, 14, 20, 7, f ? '#5affd8' : '#3ad8b8'); R(9, 11, 14, 4, f ? '#5affd8' : '#3ad8b8'); R(10, 15, 3, 3, '#ffffff'); R(19, 13, 3, 3, '#ffffff'); break;
      case 'tuft': R(8, 24, 2, 8, '#2f8a4a'); R(12, 20, 2, 12, '#3fa85a'); R(16, 22, 2, 10, '#2f8a4a'); R(20, 25, 2, 7, '#3fa85a'); R(11, 18, 4, 3, '#ffe14d'); break;
      case 'puff': R(4, 22, 24, 10, '#ffffff'); R(8, 18, 10, 6, '#ffffff'); R(16, 20, 8, 4, '#ffffff'); R(4, 30, 24, 2, '#d8e8ff'); break;
      case 'bones': R(6, 28, 20, 3, '#e8e0d0'); R(4, 27, 4, 5, '#e8e0d0'); R(24, 27, 4, 5, '#e8e0d0'); R(12, 20, 8, 7, '#e8e0d0'); R(13, 22, 2, 2, '#1b1033'); R(17, 22, 2, 2, '#1b1033'); break;
      case 'crystal': R(13, 8, 6, 24, '#8ae8ff'); R(14, 4, 4, 4, '#8ae8ff'); R(7, 18, 5, 14, '#6ab8ff'); R(20, 16, 5, 16, '#b8a0ff'); R(14, 8, 2, 20, '#e0faff'); break;
      case 'stalag': for (let j = 0; j < 20; j++) R(16 - (20 - j) * 0.35, 12 + j, (20 - j) * 0.7 + 2, 1, '#3a4660'); R(12, 30, 10, 2, '#3a4660'); break;
      case 'orbpost': R(14, 14, 4, 18, '#5a3a9a'); R(11, 6, 10, 9, f ? '#ffe14d' : '#ffc83a'); R(13, 8, 3, 3, '#ffffff'); break;
      case 'weed': for (let y = 6; y < 32; y += 2) { R(12 + Math.round(Math.sin(y * 0.3 + f) * 3), y, 3, 2, '#2ab06a'); R(19 + Math.round(Math.sin(y * 0.25 + f + 1) * 2), y + 6, 2, 2, '#1a8a5a'); } break;
      case 'coral': R(14, 14, 4, 18, '#ff6a8a'); R(8, 18, 4, 10, '#ff6a8a'); R(8, 26, 8, 3, '#ff6a8a'); R(20, 10, 4, 12, '#ff6a8a'); R(16, 20, 6, 3, '#ff6a8a'); R(15, 15, 1, 14, '#ffb0c0'); break;
      case 'torch': R(14, 14, 4, 18, '#5a4a3a'); R(12, 12, 8, 3, '#7a6a5a'); R(13, 4 + f, 6, 8 - f, '#ff7a1a'); R(14, 2 + f * 2, 4, 6, '#ffb02e'); R(15, 6, 2, 4, '#fff3a0'); break;
      case 'banner': R(15, 2, 2, 30, '#5a4a3a'); R(6, 4, 20, 2, '#7a6a5a'); R(8, 6, 16, 18, '#8a1a2a'); R(8, 24, 6, 4, '#8a1a2a'); R(18, 24, 6, 4, '#8a1a2a'); R(13, 10, 6, 6, '#ffc83a'); break;
    }
  });
}
function goalCastleSpr(th) {
  return spr('gcastle' + th, 64, 80, g => {
    const T = THEMES[th] || THEMES.grass; const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    const c1 = th === 'sky' ? '#f0d8a0' : '#b06a3a', c2 = th === 'sky' ? '#c0a060' : '#7a3a1a';
    R(0, 32, 64, 48, c1); for (let x = 0; x < 64; x += 12) R(x, 26, 8, 6, c1);
    R(16, 6, 32, 26, c1); for (let x = 16; x < 48; x += 10) R(x, 0, 6, 6, c1);
    for (let y = 36; y < 80; y += 8) R(0, y, 64, 1, c2); for (let y = 10; y < 32; y += 8) R(16, y, 32, 1, c2);
    R(24, 52, 16, 28, '#1b1033'); R(26, 48, 12, 4, '#1b1033'); R(28, 12, 8, 10, '#1b1033'); R(30, 14, 4, 6, '#ffe14d');
    R(31, -10, 2, 12, '#5a4a3a');
    void T;
  });
}

/* ================= タイル定義 & レベル ================= */
const T = { EMPTY: 0, GROUND: 1, BRICK: 2, QBLOCK: 3, USED: 4, STONE: 5, SEMI: 6, SPIKE: 7, COIN: 8, HIDDEN: 9, LAVA: 10, PTOP: 11, PIL: 12 };
const SOLID = new Uint8Array(16);
[T.GROUND, T.BRICK, T.QBLOCK, T.USED, T.STONE, T.SPIKE, T.PTOP, T.PIL].forEach(t => SOLID[t] = 1);
class Level {
  constructor(stride) { this.stride = stride; this.cols = stride; this.tiles = new Uint8Array(stride * ROWS); this.contents = new Map(); this.bumps = new Map(); this.multi = new Map(); }
  get(c, r) { if (c < 0 || c >= this.cols) return T.STONE; if (r < 0 || r >= ROWS) return T.EMPTY; return this.tiles[r * this.stride + c]; }
  set(c, r, v) { if (c < 0 || c >= this.stride || r < 0 || r >= ROWS) return; this.tiles[r * this.stride + c] = v; }
  idx(c, r) { return r * this.stride + c; }
}

/* ================= ワールド定義 ================= */
const WORLDS = [
  { name: 'はじまりの草原', theme: 'grass', music: 'grass', types: ['over', 'cave', 'athletic', 'over', 'castle'], stages: ['そよかぜの丘', 'こもれびの洞くつ', 'ゆらゆら空中散歩', 'ぽかぽか大平原', 'キングプニの砦'], boss: 'キングプニ' },
  { name: 'ゆうやけ砂漠', theme: 'desert', music: 'desert', types: ['over', 'cave', 'athletic', 'over', 'castle'], stages: ['さらさら砂丘', 'ピラミッドの迷宮', 'サボテン渓谷', 'しんきろうの道', 'ボムカブトの砦'], boss: 'ボムカブト' },
  { name: 'しろがね雪原', theme: 'ice', music: 'ice', types: ['over', 'water', 'athletic', 'over', 'castle'], stages: ['こなゆき街道', 'こおりの湖', 'つららの断崖', 'ふぶきの峠', 'ペンギン将軍の砦'], boss: 'ペンギン将軍' },
  { name: 'まよいの森', theme: 'forest', music: 'forest', types: ['over', 'cave', 'water', 'over', 'castle'], stages: ['ほたるの小道', 'ねむれる根っこ', 'しずくの泉', 'おばけ大木', 'ゴーストクイーンの館'], boss: 'ゴーストクイーン' },
  { name: 'くもの上の王国', theme: 'sky', music: 'sky', types: ['athletic', 'over', 'athletic', 'athletic', 'castle'], stages: ['にじの架け橋', 'ふわふわ雲海', 'かみなり回廊', 'てんくうの塔', 'かみなりダコの雲城'], boss: 'かみなりダコ' },
  { name: 'ほのおの火山', theme: 'volcano', music: 'volcano', types: ['over', 'cave', 'athletic', 'over', 'castle'], stages: ['マグマの河原', 'ようがん洞', 'ひばしら渓谷', 'まおうの道', '魔王ドラグーンの城'], boss: '魔王ドラグーン' },
  { name: '星の神殿', theme: 'star', music: 'star', types: ['over', 'water', 'athletic', 'cave', 'castle'], stages: ['ほしくずの庭', 'ぎんがの海', 'ながれぼし回廊', 'ときのはざま', 'カオスの玉座'], boss: 'カオスドラグーン' }
];
const ROSTER = {
  1: { walk: [['g', 6], ['k', 2]], fly: 0.08, plant: 0.12, cannon: false },
  2: { walk: [['g', 3], ['k', 3], ['s', 2], ['h', 2]], fly: 0.15, plant: 0.2, cannon: true },
  3: { walk: [['g', 3], ['k', 3], ['s', 2], ['h', 1]], fly: 0.25, plant: 0.15, cannon: true },
  4: { walk: [['g', 3], ['k', 2], ['s', 1], ['q', 2]], fly: 0.3, plant: 0.3, cannon: false },
  5: { walk: [['k', 3], ['s', 2], ['h', 3]], fly: 0.5, plant: 0.2, cannon: true },
  6: { walk: [['g', 2], ['k', 2], ['s', 4], ['h', 2]], fly: 0.3, plant: 0.35, cannon: true },
  7: { walk: [['g', 2], ['k', 3], ['s', 3], ['h', 2], ['q', 1]], fly: 0.4, plant: 0.35, cannon: true }
};
const SIGNS = {
  '1-1': [[10, IS_TOUCH ? 'スティックでいどう　Aでジャンプ（ながおしで高く）' : '←→でいどう　Aでジャンプ（ながおしで高く）'], [26, IS_TOUCH ? 'スティックを大きくたおすと ダッシュ！' : 'Bをおしながらいどうで ダッシュ！']],
  '1-2': [[10, '空中で↓：ヒップドロップ！ レンガもこわせる']],
  '1-3': [[10, 'かべに向かっておしながらジャンプで かべキック']],
  '1-4': [[10, 'ほのおの実をとったら Bでファイアボール']],
  '2-1': [[10, 'つばさの羽根：空中でもう1回ジャンプ＆Aでふんわり']],
  '3-2': [[10, '水の中ではAでおよぐ']]
};
function visualTheme(w, type) {
  if (type === 'castle') return 'castle';
  if (type === 'water') return 'water';
  if (type === 'cave') return w === 6 ? 'volcano' : w === 7 ? 'star' : w === 2 ? 'desert' : 'cave';
  return WORLDS[w - 1].theme;
}
function stageMusicFor(w, type) {
  if (type === 'castle') return 'castle';
  if (type === 'cave') return 'cave';
  if (type === 'water') return 'water';
  return WORLDS[w - 1].music;
}

/* ================= 生成ヘルパー ================= */
function top(B) { return ROWS - B.gh; }
function ground(B, x0, x1, gh = B.gh) { for (let c = x0; c < x1; c++) for (let r = ROWS - gh; r < ROWS; r++) B.L.set(c, r, T.GROUND); }
function pit(B, x0, x1) { if (B.lava) for (let c = x0; c < x1; c++) { B.L.set(c, 13, T.LAVA); B.L.set(c, 14, T.LAVA); } }
function ent(B, type, c, r, o = {}) { B.ents.push(Object.assign({ type, c, r }, o)); }
function setContent(B, c, r, kind) { B.L.contents.set(B.L.idx(c, r), kind); }
function groundEnemy(B, c, r) {
  const k = B.rng.weighted(B.roster.walk); const o = {};
  if ((k === 'g' && B.w >= 4) || (k === 'k' && B.w >= 3)) o.smart = B.rng.chance(0.5);
  ent(B, k, c, r, o);
}
function maybeFlyer(B, c, r) {
  if (B.rng.chance(B.roster.fly)) ent(B, 'f', c, r, { mode: B.w >= 4 && B.rng.chance(0.35) ? 'chase' : B.rng.pick(['hover', 'patrol']) });
}
function decoAt(B, c0, n) {
  if (B.water || B.type === 'castle') { if (B.rng.chance(0.5)) B.deco.push({ c: c0 + B.rng.i(0, Math.max(0, n - 2)), r: top(B), kind: B.rng.pick(DECO[B.theme]) }); return; }
  if (B.rng.chance(0.65)) B.deco.push({ c: c0 + B.rng.i(0, Math.max(0, n - 2)), r: top(B), kind: B.rng.pick(DECO[B.theme]) });
}
function coinArc(B, c0, w, rTop) { for (let i = 0; i < w; i++) { const r = rTop - Math.round(Math.sin(((i + 0.5) / w) * Math.PI) * 2); if (r > 1 && B.L.get(c0 + i, r) === T.EMPTY) B.L.set(c0 + i, r, T.COIN); } }
function coinRow(B, c0, c1, r) { for (let c = c0; c < c1; c++) if (r > 1 && B.L.get(c, r) === T.EMPTY) B.L.set(c, r, T.COIN); }
function powerKind(B) { return B.w === 5 || (B.type === 'athletic' && B.rng.chance(0.5)) ? 'powerW' : (B.rng.chance(0.65) ? 'power' : 'powerW'); }

/* ================= セグメント ================= */
const SEG = {
  flat(B, x) {
    const n = B.rng.i(5, 9); ground(B, x, x + n); decoAt(B, x, n);
    if (B.rng.chance(0.5 + B.d * 0.3)) groundEnemy(B, x + B.rng.i(2, n - 1), top(B) - 1);
    return x + n;
  },
  blocks(B, x) {
    const n = B.rng.i(8, 12); ground(B, x, x + n); decoAt(B, x, n);
    const t = top(B), r = t - 4, bx = x + B.rng.i(1, 3), bw = B.rng.i(3, 5);
    for (let i = 0; i < bw; i++) {
      const c = bx + i;
      const q = B.rng.chance(0.38) || (B.power === 0 && i === 1);
      B.L.set(c, r, q ? T.QBLOCK : T.BRICK);
      if (q) { if (B.power === 0 || B.rng.chance(0.22)) { setContent(B, c, r, powerKind(B)); B.power++; } }
      else if (B.rng.chance(0.1)) setContent(B, c, r, 'multi');
      else if (B.rng.chance(0.04)) setContent(B, c, r, 'star');
    }
    if (B.rng.chance(0.35) && r - 4 >= (B.ceil ? 3 : 2)) {
      const c = bx + B.rng.i(0, bw - 1);
      B.L.set(c, r - 4, B.rng.chance(0.3) ? T.HIDDEN : T.QBLOCK); setContent(B, c, r - 4, B.rng.chance(0.4) ? 'oneup' : powerKind(B));
    } else coinRow(B, bx, bx + bw, r - 1);
    const ec = B.rng.i(1, 1 + Math.round(B.d * 2));
    for (let i = 0; i < ec; i++) groundEnemy(B, x + B.rng.i(3, n - 1), t - 1);
    return x + n;
  },
  gap(B, x) {
    const maxW = 2 + Math.round(B.d * 2.4);
    let gw = B.rng.i(2, Math.max(2, Math.min(4, maxW)));
    let dh = B.rng.pick([-1, 0, 0, 1]); if (B.gh + dh < 2 || B.gh + dh > 6) dh = 0;
    if (dh > 0) gw = Math.min(gw, 3);
    pit(B, x, x + gw);
    if (B.rng.chance(0.5)) coinArc(B, x, gw, top(B) - 3);
    if (B.rng.chance(0.2 + B.d * 0.3)) maybeFlyer(B, x + Math.floor(gw / 2), top(B) - 4);
    B.gh += dh;
    const n = B.rng.i(3, 5); ground(B, x + gw, x + gw + n);
    return x + gw + n;
  },
  stairs(B, x) {
    const h = B.rng.i(3, 4 + Math.round(B.d)), t = top(B), withGap = B.rng.chance(0.3 + B.d * 0.4), ft = B.rng.i(1, 2);
    const total = 1 + h + ft + (withGap ? 2 : 0) + h + 2;
    ground(B, x, x + total);
    for (let i = 0; i < h; i++) for (let j = 0; j <= i; j++) B.L.set(x + 1 + i, t - 1 - j, T.STONE);
    for (let k = 0; k < ft; k++) for (let j = 0; j < h; j++) B.L.set(x + 1 + h + k, t - 1 - j, T.STONE);
    let c = x + 1 + h + ft;
    if (withGap) { for (let k = 0; k < 2; k++) for (let r = t; r < ROWS; r++) B.L.set(c + k, r, T.EMPTY); pit(B, c, c + 2); c += 2; }
    for (let i = 0; i < h; i++) for (let j = 0; j < h - i; j++) B.L.set(c + i, t - 1 - j, T.STONE);
    if (B.rng.chance(0.5)) groundEnemy(B, x + total - 1, t - 1);
    return x + total;
  },
  pillars(B, x) {
    const cnt = B.rng.i(3, 4), t0 = top(B), pits = B.rng.chance(0.3 + B.d * 0.5);
    let c = x; ground(B, c, c + 2); c += 2; let prevH = 0;
    for (let i = 0; i < cnt; i++) {
      const ph = clamp(prevH + B.rng.i(-1, 2), 1, 4);
      const gb = pits ? B.rng.i(2, 3) : B.rng.i(2, 4);
      if (!pits) { ground(B, c, c + gb); if (B.rng.chance(0.4)) groundEnemy(B, c + 1, t0 - 1); } else pit(B, c, c + gb);
      c += gb;
      for (const cc of [c, c + 1]) { B.L.set(cc, t0 - ph, T.PTOP); for (let r = t0 - ph + 1; r < ROWS; r++) B.L.set(cc, r, T.PIL); }
      if (B.rng.chance(B.roster.plant)) ent(B, 'p', c, t0 - ph - 1, { ox: 8 });
      else if (B.rng.chance(0.3)) coinRow(B, c, c + 2, t0 - ph - 1);
      prevH = ph; c += 2;
    }
    if (!pits) ground(B, c, c + 2); else pit(B, c, c + 2);
    c += 2; ground(B, c, c + 3);
    return c + 3;
  },
  platforms(B, x) {
    const t = top(B), pw = B.rng.i(8, 11 + Math.round(B.d * 4));
    pit(B, x, x + pw);
    let e = x, r = t - B.rng.i(1, 2);
    while (x + pw - e > 3) {
      const g = Math.min(B.rng.i(2, 3), x + pw - e - 2), c = e + g;
      let w = Math.min(B.rng.i(2, 3), x + pw - 1 - c); w = Math.max(1, w);
      for (let k = 0; k < w; k++) B.L.set(c + k, r, B.type === 'castle' ? T.STONE : T.SEMI);
      if (B.rng.chance(0.4)) coinRow(B, c, c + w, r - 1);
      e = c + w; r = clamp(r + B.rng.i(-1, 1), t - 3, t - 1);
    }
    if (B.rng.chance(B.roster.fly)) maybeFlyer(B, x + Math.floor(pw / 2), t - 5);
    ground(B, x + pw, x + pw + 4);
    return x + pw + 4;
  },
  movers(B, x) {
    const t = top(B), vertical = B.rng.chance(0.35);
    if (!vertical) {
      const pw = B.rng.i(9, 13); pit(B, x, x + pw);
      ent(B, 'mplat', x + 1, t - 1, { w: 3, ax: (pw - 5) * TILE, spd: 0.012 + B.d * 0.006, ph: B.rng.f() * 6 });
      coinRow(B, x + 3, x + pw - 3, t - 4);
      ground(B, x + pw, x + pw + 4); return x + pw + 4;
    }
    const pw = 11; pit(B, x, x + pw);
    ent(B, 'mplat', x + 2, t - 5, { w: 3, ay: 4 * TILE, spd: 0.018, ph: 0 });
    ent(B, 'mplat', x + 6, t - 5, { w: 3, ay: 4 * TILE, spd: 0.018, ph: Math.PI });
    ground(B, x + pw, x + pw + 4); return x + pw + 4;
  },
  falling(B, x) {
    const t = top(B), n = B.rng.i(3, 5); let c = x; pit(B, x, x + n * 3 + 1);
    for (let i = 0; i < n; i++) { ent(B, 'fplat', c + 1, t - 1 - (i % 2)); c += 3; }
    ground(B, x + n * 3 + 1, x + n * 3 + 5); return x + n * 3 + 5;
  },
  spikes(B, x) {
    const t = top(B), n = B.rng.i(11, 14); ground(B, x, x + n);
    const sw = B.rng.i(3, 5 + Math.round(B.d * 2)), s0 = x + B.rng.i(2, 3);
    for (let k = 0; k < sw; k++) B.L.set(s0 + k, t - 1, T.SPIKE);
    if (sw > 3) { for (let c = s0 - 1; c <= s0 + sw; c++) B.L.set(c, t - 4, T.SEMI); coinRow(B, s0, s0 + sw, t - 5); }
    return x + n;
  },
  cannons(B, x) {
    const t = top(B), n = B.rng.i(10, 14); ground(B, x, x + n);
    const cnt = B.rng.i(1, 2);
    for (let i = 0; i < cnt; i++) { const c = x + 3 + i * 5, h = B.rng.i(1, 2); for (let j = 0; j < h; j++) B.L.set(c, t - 1 - j, T.STONE); ent(B, 'c', c, t - h); }
    if (B.rng.chance(0.5)) groundEnemy(B, x + n - 2, t - 1);
    return x + n;
  },
  enemies(B, x) {
    const t = top(B), n = B.rng.i(10, 14); ground(B, x, x + n); decoAt(B, x, n);
    if (B.rng.chance(0.5)) B.L.set(x + B.rng.i(4, n - 4), t - 1, T.STONE);
    const cnt = B.rng.i(2, 3 + Math.round(B.d * 2));
    for (let i = 0; i < cnt; i++) groundEnemy(B, x + 2 + Math.floor((i + 0.5) * (n - 3) / cnt), t - 1);
    maybeFlyer(B, x + Math.floor(n / 2), t - 5);
    return x + n;
  },
  spring(B, x) {
    const t = top(B), n = 10; ground(B, x, x + n);
    ent(B, 'spring', x + 3, t - 1);
    const lr = Math.max(B.ceil ? 4 : 2, t - 8);
    for (let c = x + 5; c < x + 9; c++) B.L.set(c, lr, T.SEMI);
    coinRow(B, x + 5, x + 9, lr - 1);
    if (B.rng.chance(0.4)) { B.L.set(x + 7, lr - 3 > 1 ? lr - 3 : lr - 1, T.QBLOCK); setContent(B, x + 7, lr - 3 > 1 ? lr - 3 : lr - 1, B.rng.chance(0.5) ? 'oneup' : 'star'); }
    return x + n;
  },
  highroad(B, x) {
    const t = top(B), n = B.rng.i(14, 18); ground(B, x, x + n);
    B.L.set(x, t - 1, T.STONE); B.L.set(x + 1, t - 1, T.STONE); B.L.set(x + 1, t - 2, T.STONE);
    const r = t - 4;
    for (let c = x + 2; c < x + n - 2; c++) {
      const q = B.rng.chance(0.16); B.L.set(c, r, q ? T.QBLOCK : T.BRICK);
      if (q && B.rng.chance(0.3)) setContent(B, c, r, powerKind(B));
    }
    coinRow(B, x + 4, x + n - 4, r - 1);
    groundEnemy(B, x + Math.floor(n / 2), r - 1);
    groundEnemy(B, x + 4, t - 1); groundEnemy(B, x + n - 3, t - 1);
    return x + n;
  },
  thwomps(B, x) {
    const t = top(B), n = B.rng.i(12, 16); ground(B, x, x + n);
    const cnt = B.rng.i(1, 2 + Math.round(B.d));
    for (let i = 0; i < cnt && 3 + i * 5 < n - 2; i++) ent(B, 't', x + 3 + i * 5, 2);
    coinRow(B, x + 2, x + n - 2, t - 1);
    return x + n;
  },
  firebars(B, x) {
    const t = top(B), n = B.rng.i(12, 15); ground(B, x, x + n);
    const cnt = B.rng.i(1, 2);
    for (let i = 0; i < cnt; i++) { const c = x + 4 + i * 6, r = t - B.rng.i(3, 4); B.L.set(c, r, T.USED); ent(B, 'r', c, r, { n: 4 + Math.round(B.d * 2), dir: B.rng.chance(0.5) ? 1 : -1, a: B.rng.f() * 6 }); }
    return x + n;
  },
  lavapits(B, x) {
    const t = top(B); let c = x; ground(B, c, c + 3); c += 3;
    const reps = B.rng.i(2, 3);
    for (let i = 0; i < reps; i++) {
      const gw = B.rng.i(2, 3); pit(B, c, c + gw); ent(B, 'w', c + Math.floor(gw / 2), 13, { h: t - B.rng.i(3, 5) }); c += gw;
      const n = B.rng.i(2, 4); ground(B, c, c + n); c += n;
    }
    return c;
  }
};
const SEG_W = {
  over: { flat: 2, blocks: 3, gap: 3, stairs: 1.2, pillars: 1.5, enemies: 2.2, spring: 0.6, highroad: 1.4, spikes: 0.7, cannons: 0.8, platforms: 1.2, movers: 0.6, falling: 0.4 },
  cave: { flat: 1, blocks: 3, gap: 2.5, pillars: 2, enemies: 2, highroad: 2, spikes: 1, thwomps: 1, platforms: 1.2, movers: 0.8 },
  athletic: { gap: 2, pillars: 2.5, platforms: 3, movers: 2.5, falling: 2, spring: 0.8, cannons: 0.5, flat: 0.6 },
  castle: { firebars: 2.5, lavapits: 2, thwomps: 2, gap: 1, movers: 1, spikes: 1, enemies: 1, cannons: 0.6, flat: 0.5 }
};
function pickSeg(B) {
  const W = SEG_W[B.type] || SEG_W.over, list = [];
  for (const k in W) {
    if (k === B.lastSeg) continue;
    if (k === 'cannons' && !B.roster.cannon && B.type !== 'castle') continue;
    if (k === 'thwomps' && (!B.ceil || B.w < 2)) continue;
    if (k === 'falling' && B.w < 2) continue;
    if (k === 'spikes' && B.w < 2 && B.type !== 'castle') continue;
    if (k === 'movers' && B.w === 1 && B.s === 1) continue;
    list.push([k, W[k]]);
  }
  return B.rng.weighted(list);
}

/* ================= メダル・チェックポイント・ゴール ================= */
function medalSpot(B, x, idx) {
  const t = top(B), v = B.rng.i(0, 3);
  if (v === 0) {
    ground(B, x, x + 3); const gx = x + 3; pit(B, gx, gx + 3);
    ent(B, 'medal', gx + 1, t - 4, { idx }); ground(B, gx + 3, gx + 7); return gx + 7;
  }
  if (v === 1) {
    ground(B, x, x + 10); for (let c = x + 3; c < x + 7; c++) B.L.set(c, t - 3, T.STONE);
    ent(B, 'medal', x + 5, t - 6, { idx }); groundEnemy(B, x + 4, t - 4); return x + 10;
  }
  if (v === 2) {
    ground(B, x, x + 8); ent(B, 'spring', x + 2, t - 1);
    ent(B, 'medal', x + 2, Math.max(B.ceil ? 3 : 1, t - 8), { idx }); return x + 8;
  }
  ground(B, x, x + 9); const cx = x + 3;
  for (const r of [t - 1, t - 2, t - 3]) { B.L.set(cx, r, T.STONE); B.L.set(cx + 3, r, T.STONE); }
  B.L.set(cx + 1, t - 3, T.BRICK); B.L.set(cx + 2, t - 3, T.BRICK);
  B.L.set(cx + 1, t - 4, T.COIN); B.L.set(cx + 2, t - 4, T.COIN);
  ent(B, 'medal', cx + 1, t - 1, { idx, ox: 8 });
  return x + 9;
}
function checkpointSeg(B, x) { ground(B, x, x + 6); ent(B, 'cp', x + 3, top(B) - 1); B.cpC = x + 3; B.cpGh = B.gh; return x + 6; }
function goalArea(B, x) {
  B.gh = 2; const t = top(B); ground(B, x, x + 34);
  const h = Math.min(6, 3 + Math.floor(B.d * 3));
  for (let i = 0; i < h; i++) for (let j = 0; j <= i; j++) B.L.set(x + 2 + i, t - 1 - j, T.STONE);
  for (let j = 0; j < h; j++) B.L.set(x + 2 + h, t - 1 - j, T.STONE);
  const pole = x + 2 + h + 5;
  B.L.set(pole, t - 1, T.STONE);
  ent(B, 'goal', pole, t - 2);
  B.goalC = pole; B.castleC = pole + 6;
  return x + 34;
}
function buildArena(B, x) {
  B.gh = 2; const t = top(B);
  ground(B, x, x + 6); x += 6;
  const ax = x, aw = 20;
  ground(B, ax, ax + aw + 30);
  for (let c = ax + aw; c < ax + aw + 30; c++) for (let r = 0; r < t; r++) B.L.set(c, r, T.STONE);
  if (B.w === 4 || B.w === 5 || B.w === 7) { for (let c = ax + 3; c < ax + 6; c++) B.L.set(c, t - 4, T.SEMI); for (let c = ax + 14; c < ax + 17; c++) B.L.set(c, t - 4, T.SEMI); }
  B.arena = { x0: ax, x1: ax + aw };
  return ax + aw + 30;
}

/* ================= 水中ステージ ================= */
function buildWater(B, endX) {
  let x = 12; const marks = [0.22, 0.55, 0.82].map(f => Math.floor(endX * f)); let mi = 0, cp = false;
  while (x < endX) {
    if (mi < 3 && x >= marks[mi]) {
      const gh = 3; B.gh = gh; const t = top(B); ground(B, x, x + 10, gh);
      for (let c = x + 4; c < x + 6; c++) for (let r = t - 4; r < t; r++) B.L.set(c, r, T.STONE);
      ent(B, 'medal', x + 4, t - 7, { idx: mi, ox: 8 }); ent(B, 'u', x + 2, t - 6, { ay: 10 });
      x += 10; mi++; continue;
    }
    if (!cp && x >= endX * 0.5) { B.gh = 3; ground(B, x, x + 6); ent(B, 'cp', x + 3, top(B) - 1); B.cpC = x + 3; B.cpGh = 3; cp = true; x += 6; continue; }
    const n = B.rng.i(8, 14), gh = B.rng.i(2, 4); B.gh = gh; ground(B, x, x + n, gh);
    const t = top(B), kind = B.rng.i(0, 3);
    if (kind === 0) { const c = x + B.rng.i(2, n - 4), h = B.rng.i(2, 5); for (let j = 0; j < h; j++) { B.L.set(c, t - 1 - j, T.GROUND); B.L.set(c + 1, t - 1 - j, T.GROUND); } coinRow(B, c, c + 2, t - h - 2); }
    else if (kind === 1) { const c = x + B.rng.i(2, n - 4), h = B.rng.i(2, 5); for (let r = 0; r < h; r++) { B.L.set(c, r, T.GROUND); B.L.set(c + 1, r, T.GROUND); } coinRow(B, c - 1, c + 3, h + 1); }
    else if (kind === 2) { const c = x + B.rng.i(1, n - 5); for (let k = 0; k < 4; k++) B.L.set(c + k, B.rng.i(5, 8), T.COIN); if (B.rng.chance(0.4)) { B.L.set(c + 2, 4, T.QBLOCK); setContent(B, c + 2, 4, B.rng.chance(0.5) ? powerKind(B) : 'coin'); } }
    else B.deco.push({ c: x + 2, r: t, kind: 'coral' });
    const fc = B.rng.i(1, 2 + Math.round(B.d * 2));
    for (let i = 0; i < fc; i++) ent(B, 'x', x + B.rng.i(1, n - 1), B.rng.i(3, t - 2), { range: B.rng.i(2, 5) });
    if (B.w >= 3 && B.rng.chance(0.35)) ent(B, 'u', x + B.rng.i(2, n - 2), B.rng.i(4, t - 3), { ay: B.rng.i(8, 24) });
    if (B.rng.chance(0.4)) B.deco.push({ c: x + B.rng.i(0, n - 2), r: t, kind: 'weed' });
    x += n;
  }
  return x;
}

/* ================= ステージ生成 ================= */
function buildStage(w, s) {
  const type = WORLDS[w - 1].types[s - 1], theme = visualTheme(w, type);
  const rng = makeRng(w * 7919 + s * 104729 + 13);
  const d = clamp((w - 1) / 6 + (s - 1) * 0.035, 0, 1.1);
  const baseLen = type === 'castle' ? 110 + w * 8 : 160 + w * 12 + rng.i(0, 25);
  const L = new Level(baseLen + 220);
  const B = { L, rng, d, w, s, type, theme, ents: [], deco: [], gh: 2, roster: ROSTER[w], lava: theme === 'volcano' || type === 'castle',
    ceil: type === 'cave' || type === 'castle', water: type === 'water', lastSeg: '', power: 0, cpC: 0, cpGh: 2, arena: null, goalC: 0, castleC: 0 };
  ground(B, 0, 12, 2);
  const sid = `${w}-${s}`;
  (SIGNS[sid] || []).forEach(([c, txt]) => { if (c < 12) ent(B, 'sign', c, 12, { text: txt }); });
  let x = 12;
  if (type === 'water') x = buildWater(B, baseLen);
  else {
    const marks = [0.24, 0.55, 0.8].map(f => Math.floor(baseLen * f)); let mi = 0, cp = false;
    while (x < baseLen) {
      if (sid === '1-1' && x >= 22 && x < 34 && !B.signDone) { B.signDone = true; ground(B, x, x + 8); ent(B, 'sign', x + 4, top(B) - 1, { text: SIGNS['1-1'][1][1] }); x += 8; continue; }
      if (mi < 3 && x >= marks[mi]) { x = medalSpot(B, x, mi); mi++; continue; }
      if (!cp && x >= baseLen * 0.5) { x = checkpointSeg(B, x); cp = true; continue; }
      const seg = pickSeg(B); x = SEG[seg](B, x); B.lastSeg = seg;
    }
    while (mi < 3) { x = medalSpot(B, x, mi); mi++; }
    if (!cp) x = checkpointSeg(B, x);
  }
  if (type === 'castle') x = buildArena(B, x); else x = goalArea(B, x);
  L.cols = Math.min(x, L.stride);
  if (B.ceil) for (let c = 0; c < L.cols; c++) for (let r = 0; r < 2; r++) if (L.get(c, r) !== T.STONE) L.set(c, r, T.GROUND);
  return {
    L, ents: B.ents, deco: B.deco, type, theme, w, s, sid, startC: 7, cpC: B.cpC, cpGh: B.cpGh, arena: B.arena, goalC: B.goalC, castleC: B.castleC,
    time: type === 'castle' ? 400 : 400, ice: theme === 'ice', water: type === 'water', music: stageMusicFor(w, type)
  };
}

/* ================= 物理・当たり判定 ================= */
const PHY = { walkMax: 1.5, runMax: 2.6, grav: 0.62, gravHold: 0.26, maxFall: 6.5, jumpBase: 5.7, jumpBonus: 0.28 };
function collideX(e, dx) {
  if (dx === 0) return null;
  const L = G.L, r0 = Math.floor(e.y / TILE), r1 = Math.floor((e.y + e.h - 0.001) / TILE);
  if (dx > 0) { const c = Math.floor((e.x + e.w - 0.001) / TILE); for (let r = r0; r <= r1; r++) { const t = L.get(c, r); if (SOLID[t]) { e.x = c * TILE - e.w; return { c, r, t }; } } }
  else { const c = Math.floor(e.x / TILE); for (let r = r0; r <= r1; r++) { const t = L.get(c, r); if (SOLID[t]) { e.x = (c + 1) * TILE; return { c, r, t }; } } }
  return null;
}
function collideY(e, dy, oy, isPlayer) {
  const L = G.L, c0 = Math.floor(e.x / TILE), c1 = Math.floor((e.x + e.w - 0.001) / TILE);
  if (dy > 0) {
    const r = Math.floor((e.y + e.h - 0.001) / TILE), prevB = oy + e.h, topY = r * TILE; let hit = null;
    for (let c = c0; c <= c1; c++) { const t = L.get(c, r); if (SOLID[t] || (t === T.SEMI && prevB <= topY + 0.5)) (hit = hit || []).push({ c, r, t }); }
    if (hit) { e.y = topY - e.h; return hit; }
  } else if (dy < 0) {
    const r = Math.floor(e.y / TILE); let hit = null;
    for (let c = c0; c <= c1; c++) { const t = L.get(c, r); if (SOLID[t] || (isPlayer && t === T.HIDDEN)) (hit = hit || []).push({ c, r, t }); }
    if (hit) { e.y = (r + 1) * TILE; return hit; }
  }
  return null;
}
function boxSolid(x, y, w, h) {
  const L = G.L, c0 = Math.floor(x / TILE), c1 = Math.floor((x + w - 0.001) / TILE), r0 = Math.floor(y / TILE), r1 = Math.floor((y + h - 0.001) / TILE);
  for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) if (SOLID[L.get(c, r)]) return true;
  return false;
}
function edgeAhead(e) {
  const c = Math.floor((e.vx > 0 ? e.x + e.w + 1 : e.x - 1) / TILE), r = Math.floor((e.y + e.h + 2) / TILE);
  const t = G.L.get(c, r); return !SOLID[t] && t !== T.SEMI;
}
function touchWall(p, dir) {
  const c = Math.floor((dir > 0 ? p.x + p.w + 0.5 : p.x - 0.5) / TILE);
  for (let y = p.y + 3; y < p.y + p.h - 2; y += 4) if (SOLID[G.L.get(c, Math.floor(y / TILE))]) return true;
  return false;
}

/* ================= パーティクル & スコア ================= */
function part(o) { if (G.parts.length < 450) G.parts.push(Object.assign({ x: 0, y: 0, vx: 0, vy: 0, g: 0, life: 30, t: 0, kind: 'dot', color: '#fff', size: 2 }, o)); }
function burst(x, y, n, colors, spd = 2, kind = 'dot', life = 30) {
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = rand(0.4, spd); part({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.5, g: 0.06, life: life + randi(0, 15), kind, color: colors[i % colors.length], size: randi(1, 3) }); }
}
function addScore(n, e) { G.score += n; if (e) part({ x: e.x + (e.w || 0) / 2, y: e.y - 4, vy: -0.6, life: 45, kind: 'text', text: String(n), color: '#ffffff' }); }
function addLife(e) { G.lives = Math.min(99, G.lives + 1); Snd.play('oneup'); if (e) part({ x: e.x + (e.w || 0) / 2, y: e.y - 4, vy: -0.6, life: 60, kind: 'text', text: '1UP', color: '#5aff8a' }); }
function collectCoin(x, y, silent) {
  G.coins++; Save.data.totalCoins++; G.score += 100;
  if (!silent) Snd.play('coin');
  if (G.coins >= 100) { G.coins -= 100; addLife({ x, y, w: 0 }); }
}
function stompScore(p, e) {
  const tbl = [100, 200, 400, 800, 1000, 2000, 4000, 8000];
  if (p.combo >= tbl.length) addLife(e); else addScore(tbl[p.combo], e);
  p.combo++;
}
function shake(n) { if (Save.data.shake) G.cam.shake = Math.max(G.cam.shake, n); }

/* ================= ブロックを叩く ================= */
function bumpAbove(c, r) {
  const L = G.L;
  if (L.get(c, r - 1) === T.COIN) { L.set(c, r - 1, T.EMPTY); collectCoin(c * TILE + 8, (r - 1) * TILE); part({ x: c * TILE + 8, y: (r - 1) * TILE, vy: -3, g: 0.15, life: 26, kind: 'coin' }); }
  const zone = { x: c * TILE, y: (r - 1) * TILE, w: TILE, h: TILE };
  for (const e of G.ents) {
    if (!e.active || e.dying || e.dead) continue;
    if (e.enemy && e.shellable && e.stompable !== undefined && overlap(zone, e) && Math.abs(e.y + e.h - r * TILE) < 6) { e.dieFlip(e.x + e.w / 2 < c * TILE + 8 ? -1 : 1); addScore(100, e); Snd.play('kick'); }
    if (e instanceof Item && !e.emerge && overlap(zone, e)) { e.vy = -3.5; if (e.vx) e.vx = (e.x + e.w / 2 < c * TILE + 8 ? -1 : 1) * Math.abs(e.vx); }
  }
}
function breakBrick(c, r) {
  const L = G.L; L.set(c, r, T.EMPTY); L.contents.delete(L.idx(c, r));
  const x = c * TILE, y = r * TILE, col = THEMES[G.theme].br;
  [[-1.4, -4.5], [1.4, -4.5], [-1.1, -3], [1.1, -3]].forEach(([vx, vy], i) => part({ x: x + 4 + (i % 2) * 8, y: y + 4 + (i >> 1) * 8, vx, vy, g: 0.25, life: 60, kind: 'shard', color: col }));
  Snd.play('break'); addScore(50);
  bumpAbove(c, r);
}
function hitBlock(c, r, src) {
  const L = G.L, t = L.get(c, r), p = G.p, idx = L.idx(c, r);
  if (t !== T.BRICK && t !== T.QBLOCK && t !== T.HIDDEN) { if (src === 'head' && SOLID[t]) Snd.play('bump'); return; }
  const content = L.contents.get(idx);
  if (t === T.BRICK && !content) {
    if (src === 'shell' || src === 'pound' || p.big) breakBrick(c, r);
    else { L.bumps.set(idx, 8); Snd.play('bump'); bumpAbove(c, r); }
    return;
  }
  L.bumps.set(idx, 8);
  if (src !== 'pound') bumpAbove(c, r);
  if (content === 'multi') {
    let n = L.multi.has(idx) ? L.multi.get(idx) : 8; n--; L.multi.set(idx, n);
    collectCoin(c * TILE + 8, r * TILE); part({ x: c * TILE + 8, y: r * TILE - 8, vy: -4, g: 0.2, life: 28, kind: 'coin' });
    if (n <= 0) { L.set(c, r, T.USED); L.contents.delete(idx); }
    return;
  }
  L.set(c, r, T.USED); L.contents.delete(idx);
  const kind = content || 'coin';
  if (kind === 'coin') { collectCoin(c * TILE + 8, r * TILE); part({ x: c * TILE + 8, y: r * TILE - 8, vy: -4, g: 0.2, life: 28, kind: 'coin' }); return; }
  let it = kind;
  if (kind === 'power' || kind === 'powerW') it = p.form === 0 ? 'berry' : (kind === 'powerW' ? 'wing' : 'fire');
  if (src === 'pound') { if (it === 'oneup') addLife({ x: c * TILE, y: r * TILE, w: 16 }); else p.powerUp(it); return; }
  G.ents.push(new Item(it, c, r)); Snd.play('appear');
}

/* ================= エンティティ基底 ================= */
class Ent {
  constructor(w, h, s) {
    this.w = w; this.h = h; this.x = 0; this.y = 0;
    if (s) { this.x = s.c * TILE + (s.ox || 0) + (TILE - w) / 2; this.y = (s.r + 1) * TILE - h; }
    this.vx = 0; this.vy = 0; this.t = 0; this.dir = -1; this.dead = false; this.rm = false; this.dying = false;
    this.onGround = false; this.hitWall = false; this.wallInfo = null; this.active = false; this.layer = 1; this.enemy = false; this.solidTop = false;
    this.homeX = this.x; this.homeY = this.y;
  }
  move(grav = 0.35, maxFall = 5) {
    this.vy = Math.min(this.vy + grav, maxFall);
    const dx = this.vx; this.x += dx;
    this.wallInfo = collideX(this, dx); this.hitWall = !!this.wallInfo;
    const oy = this.y; this.y += this.vy;
    const hy = collideY(this, this.vy, oy, false);
    this.onGround = false;
    if (hy) { if (this.vy > 0) this.onGround = true; this.vy = 0; }
    if (this.y > VIEW_H + 48) this.rm = true;
  }
  dieFlip(dir) { if (this.dying) return; this.dying = true; this.vy = -3.5; this.vx = (dir || 1) * 1.2; Save.data.enemies++; }
  updDying() { this.vy += 0.3; this.x += this.vx; this.y += this.vy; if (this.y > VIEW_H + 40) this.rm = true; }
  update() {}
  draw() {}
}
class Enemy extends Ent {
  constructor(w, h, s) { super(w, h, s); this.enemy = true; this.stompable = true; this.fireable = true; this.shellable = true; this.starKillable = true; this.harmful = true; this.walker = false; }
  touch(p) {
    if (this.dead || this.dying) return;
    if (p.star > 0) { if (this.starKillable) { this.dieFlip(sgn(this.x - p.x) || 1); addScore(200, this); Snd.play('kick'); } return; }
    const prevBottom = p.y + p.h - p.vy;
    if (this.stompable && p.vy > 0 && prevBottom <= this.y + Math.max(5, this.h * 0.55)) { this.onStomp(p); p.bounce(); return; }
    if (this.harmful) p.hurt();
  }
  onStomp(p) { this.dieFlip(1); Snd.play('stomp'); stompScore(p, this); }
  onFire(dir) { this.dieFlip(dir); addScore(200, this); Snd.play('kick'); }
  sx() { return Math.round(this.x + this.w / 2 - 8 - G.camX); }
  sy(h = 16) { return Math.round(this.y + this.h - h); }
}

/* ---- プニ（スライム） ---- */
class Slime extends Enemy {
  constructor(s) { super(14, 12, s); this.walker = true; this.smart = !!(s && s.smart); this.speed = 0.45 + (G.world >= 4 ? 0.12 : 0); this.squish = 0;
    this.col = this.smart ? 'p' : ({ 3: 'i', 6: 'r', 7: 'y' }[G.world] || 'g'); }
  update() {
    this.t++; if (this.dying) return this.updDying();
    if (this.squish) { if (--this.squish <= 0) this.rm = true; return; }
    this.vx = this.dir * this.speed; this.move(0.35, 5);
    if (this.hitWall) this.dir *= -1;
    if (this.smart && this.onGround && edgeAhead(this)) this.dir *= -1;
  }
  onStomp(p) { this.squish = 30; this.dead = true; Snd.play('stomp'); stompScore(p, this); Save.data.enemies++; }
  draw() { blit(slimeSpr(this.col, this.squish ? 2 : (this.t >> 3) & 1), this.sx(), this.sy(), this.dir < 0, this.dying); }
}
/* ---- カブト（甲羅） ---- */
class Beetle extends Enemy {
  constructor(s) { super(14, 14, s); this.walker = true; this.smart = !!(s && s.smart); this.state = 'walk'; this.shellT = 0; this.grace = 0; this.kills = 0; this.spinDir = 1; }
  update() {
    this.t++; if (this.dying) return this.updDying();
    if (this.grace > 0) this.grace--;
    if (this.state === 'walk') {
      this.vx = this.dir * 0.45; this.move(0.35, 5);
      if (this.hitWall) this.dir *= -1;
      if (this.smart && this.onGround && edgeAhead(this)) this.dir *= -1;
    } else if (this.state === 'shell') {
      this.vx *= 0.8; this.move(0.35, 5);
      if (--this.shellT <= 0) { this.state = 'walk'; this.dir = G.p.x < this.x ? -1 : 1; }
    } else {
      this.vx = this.spinDir * 4.2; this.move(0.35, 6);
      if (this.hitWall) {
        const wi = this.wallInfo; this.spinDir *= -1;
        if (wi && this.x > G.camX - 32 && this.x < G.camX + VIEW_W + 32) { Snd.play('bump'); hitBlock(wi.c, wi.r, 'shell'); }
      }
      for (const e of G.ents) {
        if (e === this || !e.enemy || !e.active || e.dying || e.dead) continue;
        if (overlap(this, e.hitbox ? e.hitbox() : e)) {
          if (e instanceof Beetle && e.state === 'spin') { e.dieFlip(-this.spinDir); this.dieFlip(this.spinDir); return; }
          if (e.shellable) { e.dieFlip(this.spinDir); this.kills++; addScore([500, 800, 1000, 2000, 4000, 8000][Math.min(5, this.kills - 1)], e); Snd.play('kick'); }
        }
      }
    }
  }
  touch(p) {
    if (this.dead || this.dying) return;
    if (p.star > 0) { this.dieFlip(sgn(this.x - p.x) || 1); addScore(200, this); Snd.play('kick'); return; }
    const stomp = p.vy > 0 && p.y + p.h - p.vy <= this.y + 7;
    if (this.state === 'walk') {
      if (stomp) { this.state = 'shell'; this.shellT = 420; this.vx = 0; this.grace = 10; Snd.play('stomp'); stompScore(p, this); p.bounce(); } else p.hurt();
    } else if (this.state === 'shell') {
      if (this.grace > 0 && !stomp) return;
      const d = (p.x + p.w / 2 < this.x + this.w / 2) ? 1 : -1;
      this.state = 'spin'; this.spinDir = d; this.vx = d * 4.2; this.grace = 14; this.kills = 0; Snd.play('kick'); addScore(400, this);
      if (stomp) p.bounce();
    } else {
      if (stomp) { this.state = 'shell'; this.shellT = 420; this.vx = 0; this.grace = 10; Snd.play('stomp'); p.bounce(); }
      else if (this.grace === 0) p.hurt();
    }
  }
  onFire(dir) { this.dieFlip(dir); addScore(200, this); Snd.play('kick'); }
  draw() {
    const col = this.smart ? 'r' : 'g';
    if (this.state === 'walk') blit(beetleSpr(col, 'walk', (this.t >> 3) & 1), this.sx(), this.sy(), this.dir < 0, this.dying);
    else { const sh = this.state === 'shell' && this.shellT < 90 ? ((this.t >> 1) & 1) : 0; blit(beetleSpr(col, 'shell', this.state === 'spin' ? (this.t >> 2) & 1 : 0), this.sx() + sh, this.sy(), false, this.dying); }
  }
}
/* ---- トゲゾー ---- */
class Spiny extends Slime {
  constructor(s) { super(s); this.stompable = false; this.speed = 0.5; this.h = 13; }
  draw() { blit(spinySpr((this.t >> 3) & 1), this.sx(), this.sy(), this.dir < 0, this.dying); }
}
/* ---- コウモリ ---- */
class Bat extends Enemy {
  constructor(s) { super(14, 10, s); this.mode = (s && s.mode) || 'hover'; this.ph = Math.random() * 6; this.homeY = this.y - 8; }
  update() {
    this.t++; if (this.dying) return this.updDying();
    const p = G.p;
    if (this.mode === 'hover') { this.y = this.homeY + Math.sin(this.t * 0.04 + this.ph) * 26; this.x = this.homeX + Math.sin(this.t * 0.02) * 6; }
    else if (this.mode === 'patrol') { this.x = this.homeX + Math.sin(this.t * 0.018 + this.ph) * 48; this.y = this.homeY + Math.sin(this.t * 0.07) * 6; }
    else { this.vx = clamp(this.vx + sgn(p.x - this.x) * 0.03, -1.1, 1.1); this.vy = clamp(this.vy + sgn(p.y - this.y) * 0.02, -0.7, 0.7); this.x += this.vx; this.y += this.vy; }
    this.dir = p.x < this.x ? -1 : 1;
  }
  draw() { blit(batSpr((this.t >> 3) & 1), this.sx(), this.sy(12), this.dir < 0, this.dying); }
}
/* ---- カエル ---- */
class Frog extends Enemy {
  constructor(s) { super(14, 12, s); this.walker = true; this.wait = 60 + Math.random() * 60; }
  update() {
    this.t++; if (this.dying) return this.updDying();
    if (this.onGround) { this.vx *= 0.7; if (--this.wait <= 0) { this.dir = G.p.x < this.x ? -1 : 1; this.vy = -5.2 - Math.random() * 1.2; this.vx = this.dir * (1.1 + Math.random() * 0.6); this.wait = 70 + Math.random() * 50; } }
    this.move(0.3, 5); if (this.hitWall) this.vx = -this.vx;
  }
  draw() { blit(frogSpr(this.onGround ? 0 : 1), this.sx(), this.sy(), this.dir < 0, this.dying); }
}
/* ---- パクフラワー ---- */
class Plant extends Enemy {
  constructor(s) { super(12, 22, s); this.layer = 0; this.baseY = this.y; this.off = 22; this.state = 'hidden'; this.timer = 40 + Math.random() * 60; this.stompable = false; this.shoot = G.world >= 3; this.shot = false; this.h = 0; this.y = this.baseY + 22; }
  update() {
    this.t++; if (this.dying) return this.updDying();
    const p = G.p, near = Math.abs((p.x + p.w / 2) - (this.x + this.w / 2)) < 28;
    switch (this.state) {
      case 'hidden': if (--this.timer <= 0 && !near) this.state = 'up'; break;
      case 'up': this.off -= 0.6; if (this.off <= 0) { this.off = 0; this.state = 'out'; this.timer = 90; this.shot = false; } break;
      case 'out': this.timer--;
        if (this.shoot && !this.shot && this.timer < 50) { this.shot = true; const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy) || 1; G.ents.push(new EFire(this.x + 2, this.baseY + 2, dx / d * 1.3, dy / d * 1.3, 'fire')); Snd.play('efire'); }
        if (this.timer <= 0) this.state = 'down'; break;
      case 'down': this.off += 0.6; if (this.off >= 22) { this.off = 22; this.state = 'hidden'; this.timer = 80; } break;
    }
    this.y = this.baseY + this.off; this.h = 22 - this.off;
  }
  touch(p) { if (this.h < 4) return; super.touch(p); }
  dieFlip(d) { this.h = 22; this.y = this.baseY + this.off; super.dieFlip(d); this.layer = 2; }
  draw() { blit(plantSpr((this.t >> 4) & 1), this.sx(), Math.round(this.dying ? this.y : this.baseY + this.off + 1), false, this.dying); }
}
/* ---- 大砲 & 弾 ---- */
class Cannon extends Ent {
  constructor(s) { super(16, 16, s); this.timer = 90 + Math.random() * 90; }
  update() {
    const p = G.p, dx = (p.x + p.w / 2) - (this.x + 8);
    if (--this.timer <= 0) {
      this.timer = 200 + Math.random() * 80;
      if (Math.abs(dx) > 28 && Math.abs(dx) < VIEW_W * 0.75) { const d = sgn(dx); G.ents.push(new Bullet(this.x + (d > 0 ? 12 : -12), this.y + 1, d)); Snd.play('cannon'); burst(this.x + 8 + d * 8, this.y + 6, 6, ['#cccccc', '#888888'], 1, 'puff', 20); }
    }
  }
  draw() { blit(cannonSpr(), Math.round(this.x - G.camX), Math.round(this.y)); }
}
class Bullet extends Enemy {
  constructor(x, y, d) { super(16, 14, null); this.x = x; this.y = y; this.dir = d; this.vx = d * 1.4; this.active = true; this.fireable = false; this.life = 900; }
  update() { if (this.dying) return this.updDying(); this.x += this.vx; if (--this.life <= 0) this.rm = true; }
  onStomp(p) { this.dieFlip(this.dir); Snd.play('stomp'); stompScore(p, this); }
  draw() { blit(bulletSpr(), Math.round(this.x - G.camX), Math.round(this.y), this.dir < 0, this.dying); }
}
/* ---- イワドン（落ちてくる岩） ---- */
class Thwomp extends Enemy {
  constructor(s) { super(24, 30, null); this.x = s.c * TILE - 4; this.y = s.r * TILE; this.homeY = this.y; this.state = 'idle'; this.timer = 0; this.stompable = false; this.fireable = false; this.shellable = false; this.starKillable = false; }
  update() {
    const p = G.p; this.t++;
    switch (this.state) {
      case 'idle': if (Math.abs((p.x + p.w / 2) - (this.x + 12)) < 44 && p.y > this.y) { this.state = 'fall'; this.vy = 0; } break;
      case 'fall': { this.vy = Math.min(this.vy + 0.5, 7); const oy = this.y; this.y += this.vy; const hit = collideY(this, this.vy, oy, false);
        if (hit || this.y > VIEW_H) { this.state = 'land'; this.timer = 60; this.vy = 0; if (this.x > G.camX - 30 && this.x < G.camX + VIEW_W) { shake(6); Snd.play('thud'); burst(this.x + 12, this.y + this.h, 10, ['#d8d0c0', '#a89a88'], 1.5, 'puff', 20); } } break; }
      case 'land': if (--this.timer <= 0) this.state = 'rise'; break;
      case 'rise': this.y -= 1; if (this.y <= this.homeY) { this.y = this.homeY; this.state = 'wait'; this.timer = 40; } break;
      case 'wait': if (--this.timer <= 0) this.state = 'idle'; break;
    }
  }
  touch(p) {
    if (p.star > 0) return;
    if (p.vy > 0 && p.y + p.h - p.vy <= this.y + 6) { p.y = this.y - p.h; p.vy = Input.cur.jump ? -6 : -3.5; p.jumping = Input.cur.jump; return; }
    p.hurt();
  }
  draw() { blit(thwompSpr(this.state === 'fall' || this.state === 'land' ? 1 : 0), Math.round(this.x - G.camX), Math.round(this.y)); }
}
/* ---- マグマ玉 ---- */
class Podoboo extends Enemy {
  constructor(s) { super(10, 12, s); this.homeY = VIEW_H + 8; this.y = this.homeY; this.peakY = (s.h || 8) * TILE; this.timer = Math.random() * 100; this.state = 'wait'; this.stompable = false; this.fireable = false; this.shellable = false; }
  update() {
    this.t++; if (this.dying) return this.updDying();
    if (this.state === 'wait') { this.y = this.homeY; if (--this.timer <= 0) { this.state = 'jump'; this.vy = -Math.sqrt(2 * 0.22 * (this.homeY - this.peakY)); burst(this.x + 5, 13 * TILE, 6, ['#ffb02e', '#ff5a1a'], 1.5, 'dot', 20); } }
    else { this.vy += 0.22; this.y += this.vy; if (this.y >= this.homeY) { this.state = 'wait'; this.timer = 90 + Math.random() * 50; } }
  }
  draw() { if (this.y < VIEW_H) blit(podSpr((this.t >> 2) & 1), Math.round(this.x - 1 - G.camX), Math.round(this.y - 1), false, this.vy > 0); }
}
/* ---- ファイアバー ---- */
class Firebar extends Ent {
  constructor(s) { super(16, 16, s); this.cx = s.c * TILE + 8; this.cy = s.r * TILE + 8; this.n = s.n || 5; this.ang = s.a || 0; this.spd = (s.dir || 1) * (0.032 + G.lvlD * 0.014); this.layer = 2;
    const R = this.n * 8 + 4; this.x = this.cx - R; this.y = this.cy - R; this.w = R * 2; this.h = R * 2; this.enemy = false; }
  update() { this.ang += this.spd; }
  touch(p) {
    if (p.star > 0) return;
    for (let i = 0; i < this.n; i++) {
      const bx = this.cx + Math.cos(this.ang) * i * 8, by = this.cy + Math.sin(this.ang) * i * 8;
      if (bx + 3 > p.x + 1 && bx - 3 < p.x + p.w - 1 && by + 3 > p.y + 1 && by - 3 < p.y + p.h - 1) { p.hurt(); return; }
    }
  }
  draw() { for (let i = 0; i < this.n; i++) blit(orbSpr('fire', (this.t + i) & 1), this.cx + Math.cos(this.ang) * i * 8 - 4 - G.camX, this.cy + Math.sin(this.ang) * i * 8 - 4); this.t++; }
}
/* ---- おばけ ---- */
class Ghost extends Enemy {
  constructor(s) { super(14, 14, s); this.stompable = false; this.fireable = false; this.shellable = false; this.shy = false; }
  update() {
    this.t++; if (this.dying) return this.updDying();
    const p = G.p, pc = p.x + p.w / 2, gc = this.x + 7;
    this.shy = (p.dir > 0 && pc < gc) || (p.dir < 0 && pc > gc);
    if (this.shy) { this.vx *= 0.9; this.vy *= 0.9; }
    else { const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy) || 1; this.vx += dx / d * 0.025; this.vy += dy / d * 0.02; const sp = Math.hypot(this.vx, this.vy); if (sp > 0.75) { this.vx *= 0.75 / sp; this.vy *= 0.75 / sp; } }
    this.x += this.vx; this.y += this.vy; if (this.y < -20) this.y = -20;
    this.dir = p.x < this.x ? -1 : 1;
  }
  draw() { blit(ghostSpr(this.shy ? 1 : 0, (this.t >> 4) & 1), this.sx(), this.sy() + Math.sin(this.t * 0.08) * 2, this.dir < 0, this.dying, this.shy ? 0.7 : 1); }
}
/* ---- さかな ---- */
class Fish extends Enemy {
  constructor(s) { super(14, 10, s); this.range = (s.range || 4) * TILE; this.ph = Math.random() * 6; this.speed = 0.5 + Math.random() * 0.3 + G.lvlD * 0.4; }
  update() {
    this.t++; if (this.dying) return this.updDying();
    this.vx = this.dir * this.speed; this.x += this.vx;
    if (collideX(this, this.vx)) this.dir *= -1;
    else if (this.x > this.homeX + this.range) this.dir = -1; else if (this.x < this.homeX - this.range) this.dir = 1;
    this.y = this.homeY + Math.sin(this.t * 0.05 + this.ph) * 8;
  }
  draw() { blit(fishSpr((this.t >> 3) & 1), this.sx(), this.sy(12), this.dir < 0, this.dying); }
}
/* ---- ウニ ---- */
class Urchin extends Enemy {
  constructor(s) { super(14, 14, s); this.stompable = false; this.fireable = false; this.shellable = false; this.ay = s.ay || 16; }
  update() { this.t++; if (this.dying) return this.updDying(); this.y = this.homeY + Math.sin(this.t * 0.03) * this.ay; }
  draw() { blit(urchinSpr((this.t >> 4) & 1), this.sx(), this.sy(), false, this.dying); }
}
/* ---- 敵の弾 ---- */
class EFire extends Enemy {
  constructor(x, y, vx, vy, kind, grav) { super(8, 8, null); this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.kind = kind || 'fire'; this.grav = grav || 0;
    this.active = true; this.stompable = false; this.fireable = false; this.shellable = false; this.starKillable = false; this.layer = 2; this.life = 400; this.homing = 0; }
  update() {
    this.t++;
    if (this.homing > 0) { this.homing--; const p = G.p, dx = p.x + p.w / 2 - this.x, dy = p.y + p.h / 2 - this.y, d = Math.hypot(dx, dy) || 1; this.vx = lerp(this.vx, dx / d * 1.3, 0.04); this.vy = lerp(this.vy, dy / d * 1.3, 0.04); }
    this.vy += this.grav; this.x += this.vx; this.y += this.vy;
    if (--this.life <= 0 || this.y > VIEW_H + 20 || this.x < G.camX - 64 || this.x > G.camX + VIEW_W + 64) this.rm = true;
    if (this.kind === 'ice' && this.grav && SOLID[G.L.get(Math.floor((this.x + 4) / TILE), Math.floor((this.y + 8) / TILE))]) { this.rm = true; burst(this.x + 4, this.y + 6, 6, ['#ffffff', '#9ae8ff'], 1.5, 'dot', 18); }
  }
  touch(p) { if (p.star > 0) return; p.hurt(); }
  draw() { blit(orbSpr(this.kind, (this.t >> 2) & 1), this.x - G.camX, this.y); }
}

/* ================= ギミック ================= */
class Spring extends Ent {
  constructor(s) { super(16, 16, s); this.solidTop = true; this.squash = 0; }
  update() { if (this.squash > 0) this.squash--; }
  land(p) {
    this.squash = 10;
    p.vy = p.pound === 2 ? -11 : (Input.cur.jump ? -10 : -7.2);
    p.jumping = !!Input.cur.jump || p.pound === 2; p.pound = 0; p.onGround = false; p.plat = null; p.combo = 0;
    Snd.play('spring');
  }
  draw() { blit(springSpr(this.squash > 0 ? 1 : 0), Math.round(this.x - G.camX), Math.round(this.y)); }
}
function carry(pl) { const p = G.p; if (p.plat === pl && !p.dead) { p.x += pl.dx; collideX(p, pl.dx); p.y += pl.dy; } }
class MovePlat extends Ent {
  constructor(s) { super((s.w || 3) * TILE, 8, null); this.x = this.x0 = s.c * TILE; this.y = this.y0 = s.r * TILE; this.ax = s.ax || 0; this.ay = s.ay || 0; this.spd = s.spd || 0.012; this.ph = s.ph || 0; this.solidTop = true; this.dx = 0; this.dy = 0; this.layer = 1; }
  update() {
    const k = (1 - Math.cos(G.lt * this.spd + this.ph)) / 2;
    const nx = this.x0 + this.ax * k, ny = this.y0 + this.ay * k;
    this.dx = nx - this.x; this.dy = ny - this.y; this.x = nx; this.y = ny; carry(this);
  }
  draw() { drawPlat(this.x - G.camX, this.y, this.w, '#ffd84a', '#c08a14'); }
}
class FallPlat extends Ent {
  constructor(s) { super(32, 8, null); this.x = s.c * TILE; this.y = s.r * TILE; this.solidTop = true; this.timer = 0; this.falling = false; this.dx = 0; this.dy = 0; }
  update() {
    if (G.p.plat === this) this.timer++;
    if (this.timer > 24) this.falling = true;
    if (this.falling) { this.vy = Math.min(this.vy + 0.15, 4); this.dy = this.vy; this.y += this.vy; if (this.y > VIEW_H + 20) this.rm = true; } else this.dy = 0;
    this.dx = 0; carry(this);
  }
  draw() { const sh = this.timer > 10 && !this.falling ? ((G.t >> 1) & 1) : 0; drawPlat(this.x - G.camX + sh, this.y, this.w, '#ff9a6a', '#b04a2a'); }
}
function drawPlat(x, y, w, c1, c2) {
  x = Math.round(x); y = Math.round(y);
  ctx.fillStyle = OUT; ctx.fillRect(x - 1, y - 1, w + 2, 10);
  ctx.fillStyle = c1; ctx.fillRect(x, y, w, 8);
  ctx.fillStyle = c2; ctx.fillRect(x, y + 6, w, 2);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 1, y + 1, w - 2, 1);
  ctx.fillStyle = c2; for (let i = 8; i < w; i += 16) ctx.fillRect(x + i, y + 2, 2, 3);
}
class Checkpoint extends Ent {
  constructor(s) { super(12, 40, s); this.on = false; this.layer = 0; }
  touch(p) {
    if (this.on) return;
    this.on = true; G.cpOn = true; Snd.play('checkpoint');
    burst(this.x + 6, this.y + 4, 16, ['#ffe14d', '#ffffff', '#5affc8'], 2.5, 'spark', 40);
    G.banner = { text: 'チェックポイント！', t: 90 };
    if (p.form === 0) p.powerUp('berry');
  }
  draw() {
    const x = Math.round(this.x - G.camX), y = Math.round(this.y);
    ctx.fillStyle = '#5a4a3a'; ctx.fillRect(x + 5, y, 2, 40);
    ctx.fillStyle = '#ffe14d'; ctx.fillRect(x + 4, y - 2, 4, 3);
    const c = this.on ? '#5affc8' : '#9a9aaa', wave = Math.sin(G.t * 0.15) * 1.5;
    ctx.fillStyle = OUT; ctx.fillRect(x + 6, y + 2, 14, 11);
    ctx.fillStyle = c; ctx.fillRect(x + 7, y + 3, 12 + wave, 9);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 11, y + 6, 3, 3);
  }
}
class Goal extends Ent {
  constructor(s) { super(4, 10, null); this.x = s.c * TILE + 6; this.top = 3 * TILE; this.bottom = (s.r + 1) * TILE; this.y = -400; this.h = this.bottom + 400; this.poleH = this.bottom - this.top; this.flagY = this.top + 4; this.layer = 0; }
  touch(p) { if (!G.clear) startGoal(this); }
  draw() {
    const x = Math.round(this.x - G.camX);
    ctx.fillStyle = OUT; ctx.fillRect(x, this.top, 4, this.poleH);
    ctx.fillStyle = '#e8f0ff'; ctx.fillRect(x + 1, this.top, 2, this.poleH);
    ctx.fillStyle = OUT; ctx.fillRect(x - 2, this.top - 6, 8, 8);
    ctx.fillStyle = '#ffe14d'; ctx.fillRect(x - 1, this.top - 5, 6, 6);
    const fy = Math.round(this.flagY), w = Math.sin(G.t * 0.2) * 1.5;
    ctx.fillStyle = OUT; ctx.fillRect(x - 19, fy - 1, 19, 14);
    ctx.fillStyle = '#ee3a52'; ctx.fillRect(x - 18 + w, fy, 18 - w, 12);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 11, fy + 3, 4, 6); ctx.fillRect(x - 13, fy + 5, 8, 2);
  }
}
class Medal extends Ent {
  constructor(s) { super(16, 16, s); this.idx = s.idx; this.prev = !!(Save.data.medals[G.sid] || [])[this.idx]; this.baseY = this.y; }
  update() { this.t++; this.y = this.baseY + Math.sin(this.t * 0.08) * 2; if ((this.t & 15) === 0) part({ x: this.x + rand(2, 14), y: this.y + rand(2, 14), vy: -0.3, life: 25, kind: 'spark', color: '#fff6c8' }); }
  touch() {
    if (this.rm) return; this.rm = true; G.runMedals[this.idx] = true; Snd.play('medal'); addScore(2000, this);
    burst(this.x + 8, this.y + 8, 22, ['#ffe14d', '#ffffff', '#ffc83a'], 3, 'spark', 40);
    G.banner = { text: `スターメダル ${G.runMedals.filter(Boolean).length}/3`, t: 80 };
  }
  draw() { blit(itemSpr(this.prev ? 'medalG' : 'medal'), Math.round(this.x - G.camX), Math.round(this.y), false, false, this.prev ? 0.75 : 1); }
}
class Sign extends Ent {
  constructor(s) { super(16, 16, s); this.text = s.text; this.layer = 0; }
  update() { const p = G.p; if (Math.abs(p.x - this.x) < 44) G.signText = this.text; }
  draw() {
    const x = Math.round(this.x - G.camX), y = Math.round(this.y);
    ctx.fillStyle = OUT; ctx.fillRect(x + 6, y + 6, 4, 10); ctx.fillRect(x - 1, y - 1, 18, 11);
    ctx.fillStyle = '#c88a40'; ctx.fillRect(x + 7, y + 7, 2, 9); ctx.fillRect(x, y, 16, 9);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 7, y + 1, 2, 5); ctx.fillRect(x + 7, y + 7, 2, 1);
  }
}
class Item extends Ent {
  constructor(kind, c, r) { super(14, 14, null); this.kind = kind; this.x = c * TILE + 1; this.y = r * TILE + 2; this.emerge = 16; this.layer = 0; this.active = true; }
  update() {
    this.t++;
    if (this.emerge > 0) {
      this.y -= 1; this.emerge--;
      if (this.emerge === 0) { this.layer = 1; if (this.kind === 'berry' || this.kind === 'oneup') this.vx = (G.p.x + G.p.w / 2 > this.x + 7) ? -1 : 1; else if (this.kind === 'star') { this.vx = 1.2; this.vy = -3; } }
      return;
    }
    if (this.kind === 'berry' || this.kind === 'oneup') { this.move(0.3, 5); if (this.hitWall) this.vx = -this.vx; }
    else if (this.kind === 'star') { this.move(0.22, 5); if (this.onGround) this.vy = -4.2; if (this.hitWall) this.vx = -this.vx; }
    else { this.vx = 0; this.move(0.3, 5); }
  }
  touch(p) {
    if (this.emerge > 6 || this.rm) return; this.rm = true;
    if (this.kind === 'oneup') addLife(this); else p.powerUp(this.kind);
  }
  draw() { blit(itemSpr(this.kind, (this.t >> 3) % 3), Math.round(this.x - 1 - G.camX), Math.round(this.y - 2)); }
}
class PFire extends Ent {
  constructor(x, y, d) { super(8, 8, null); this.x = x; this.y = y; this.vx = d * 3.6; this.vy = 1.5; this.active = true; this.layer = 2; this.life = 180; }
  update() {
    this.t++; if (--this.life <= 0) return this.poof();
    this.vy = Math.min(this.vy + 0.35, 4.5);
    const dx = this.vx; this.x += dx; if (collideX(this, dx)) return this.poof();
    const oy = this.y; this.y += this.vy;
    if (collideY(this, this.vy, oy, false)) { this.vy = this.vy > 0 ? -2.7 : 0.5; }
    if (this.x < G.camX - 16 || this.x > G.camX + VIEW_W + 16 || this.y > VIEW_H) { this.rm = true; return; }
    for (const e of G.ents) {
      if (!e.enemy || e.dying || e.dead || !e.active) continue;
      const hb = e.hitbox ? e.hitbox() : e; if (hb.h <= 0) continue;
      if (overlap(this, hb)) { if (e.fireable) e.onFire(sgn(this.vx)); else if (e instanceof EFire) continue; this.poof(); return; }
    }
    const b = G.boss; if (b && !b.dying && !b.hidden && overlap(this, b.hitbox())) { b.fireHit(); this.poof(); }
  }
  poof() { this.rm = true; burst(this.x + 4, this.y + 4, 5, ['#ffb02e', '#ffffff'], 1.2, 'dot', 14); }
  draw() { blit(orbSpr('fire', (this.t >> 2) & 1), this.x - G.camX, this.y); }
}

/* ================= プレイヤー ================= */
class Player {
  constructor(x, y, form) {
    this.form = form || 0; this.w = 10; this.h = this.form ? 22 : 14; this.x = x; this.y = y - this.h;
    this.vx = 0; this.vy = 0; this.dir = 1; this.onGround = false; this.coyote = 0; this.jbuf = 0; this.jumping = false;
    this.inv = 0; this.star = 0; this.crouch = false; this.dead = false; this.pound = 0; this.poundT = 0; this.land = 0;
    this.airJ = 0; this.wall = 0; this.wallLock = 0; this.wallLockDir = 0; this.fireCd = 0; this.plat = null; this.combo = 0;
    this.skid = false; this.ctrl = true; this.swimT = 0; this.glide = false; this.walkDist = 0; this.hidden = false; this.deadT = 0;
  }
  get big() { return this.form > 0; }
  setHeight(h) { this.y += this.h - h; this.h = h; }
  fits(h) { return !boxSolid(this.x, this.y + this.h - h, this.w, h); }
  bounce() {
    if (this.pound === 2) return;
    this.vy = Input.cur.jump ? -6.4 : -4.0; this.jumping = !!Input.cur.jump; this.onGround = false;
    if (this.form === 3) this.airJ = 1;
  }
  powerUp(kind) {
    if (kind === 'star') { this.star = 600; Music.play('starman'); Snd.play('star'); addScore(1000, this); return; }
    const target = kind === 'berry' ? 1 : kind === 'fire' ? 2 : 3;
    addScore(1000, this);
    if (kind === 'berry' && this.form > 0) { Snd.play('power'); return; }
    if (this.form === target) { Snd.play('power'); return; }
    const wasSmall = this.form === 0;
    this.form = target; G.freeze = 36; G.growFx = 36; G.growSmall = wasSmall;
    if (wasSmall) { if (this.fits(22)) { this.setHeight(22); this.crouch = false; } else this.crouch = true; }
    Snd.play('power');
    burst(this.x + 5, this.y + this.h / 2, 12, ['#ffffff', '#ffe14d'], 2, 'spark', 30);
  }
  hurt() {
    if (this.inv > 0 || this.star > 0 || this.dead || G.clear) return;
    if (this.form >= 1) {
      const toSmall = this.form === 1;
      this.form = toSmall ? 0 : 1; this.inv = 120; G.freeze = 24; Snd.play('shrink');
      if (toSmall) { this.crouch = false; this.setHeight(14); }
      this.pound = 0;
    } else this.die();
  }
  die() {
    if (this.dead) return;
    this.dead = true; this.deadT = 0; this.vx = 0; this.vy = 0; this.star = 0; this.inv = 0; this.pound = 0;
    Music.play('death');
  }
  update() {
    const I = Input.cur, Pr = Input.pressed, water = G.water, ice = G.ice;
    if (this.inv > 0) this.inv--;
    if (this.star > 0) { this.star--; if (this.star === 0) Music.play(G.curMusic()); if ((this.star & 3) === 0 && this.star) part({ x: this.x + rand(0, 10), y: this.y + rand(0, this.h), life: 20, kind: 'spark', color: ['#ffe14d', '#ff5ab4', '#5affc8'][randi(0, 2)] }); }
    if (this.fireCd > 0) this.fireCd--;
    if (this.swimT > 0) this.swimT--;
    this.plat = null;
    let mv = this.ctrl ? ((I.right ? 1 : 0) - (I.left ? 1 : 0)) : (G.autoWalk ? 1 : 0);
    // しゃがみ
    if (this.big) {
      if (this.ctrl && I.down && this.onGround && !water && !this.crouch && !this.pound) { this.crouch = true; this.setHeight(14); }
      else if (this.crouch && !(I.down && this.ctrl) && this.fits(22)) { this.crouch = false; this.setHeight(22); }
    } else this.crouch = this.ctrl && I.down && this.onGround && !water;
    if (this.land > 0) { this.land--; mv = 0; }
    if (this.pound) mv = 0;
    if (this.crouch && this.onGround) mv = 0;
    if (this.wallLock > 0) { this.wallLock--; mv = this.wallLockDir; }
    // 横移動
    const g = this.onGround, run = (I.run || I.dash) && this.ctrl;
    const max = water ? 1.3 : (run ? PHY.runMax : PHY.walkMax);
    let acc = g ? (run ? 0.09 : 0.07) : 0.065, dec = g ? 0.09 : 0.02;
    if (water) { acc = 0.05; dec = 0.03; }
    if (ice && g) { acc *= 0.4; dec *= 0.15; }
    if (mv !== 0) {
      if (this.vx * mv < 0) { this.vx += mv * (g ? (ice ? 0.06 : 0.18) : 0.1); this.skid = g && !water && Math.abs(this.vx) > 0.6; if (this.skid && (G.t & 3) === 0) part({ x: this.x + 5, y: this.y + this.h, vy: -0.3, life: 15, kind: 'puff', color: '#ffffff' }); }
      else {
        this.skid = false;
        if (Math.abs(this.vx) < max) { this.vx += mv * acc; if (Math.abs(this.vx) > max) this.vx = mv * max; }
        else if (g) { this.vx -= mv * 0.04; if (Math.abs(this.vx) < max) this.vx = mv * max; }
      }
      if (!this.wallLock) this.dir = mv;
    } else { this.skid = false; if (Math.abs(this.vx) <= dec) this.vx = 0; else this.vx -= sgn(this.vx) * dec; }
    // ジャンプ
    if (Pr.jump && this.ctrl) this.jbuf = 7; else if (this.jbuf > 0) this.jbuf--;
    if (g) { this.coyote = 6; this.airJ = this.form === 3 ? 1 : 0; this.combo = 0; } else if (this.coyote > 0) this.coyote--;
    this.wall = 0;
    if (!g && !water && this.vy > 0.5 && mv !== 0 && !this.pound && this.ctrl && !this.wallLock && touchWall(this, mv)) this.wall = mv;
    if (water) {
      if (this.jbuf > 0) { this.jbuf = 0; this.vy = Math.max(-3.2, Math.min(this.vy, 0) - 2.4); Snd.play('swim'); this.swimT = 14; part({ x: this.x + 5, y: this.y, vy: -0.6, life: 50, kind: 'bubble', color: '#cfefff' }); }
    } else if (this.jbuf > 0 && this.coyote > 0 && !this.pound) {
      this.vy = -(PHY.jumpBase + Math.abs(this.vx) * PHY.jumpBonus); this.jumping = true; this.onGround = false; this.coyote = 0; this.jbuf = 0;
      Snd.play(this.big ? 'bigjump' : 'jump');
      if (this.crouch && !this.big) this.crouch = false;
    } else if (this.jbuf > 0 && this.wall) {
      this.vy = -5.9; this.vx = -this.wall * 2.3; this.dir = -this.wall; this.wallLockDir = -this.wall; this.wallLock = 10; this.jbuf = 0; this.jumping = true;
      Snd.play('wjump'); burst(this.x + (this.wall > 0 ? this.w : 0), this.y + this.h / 2, 6, ['#ffffff'], 1, 'puff', 15); this.wall = 0;
    } else if (Pr.jump && !g && this.airJ > 0 && this.coyote === 0 && !this.pound && this.ctrl) {
      this.airJ--; this.vy = -5.4; this.jumping = true; this.jbuf = 0; Snd.play('wjump');
      for (let i = 0; i < 6; i++) part({ x: this.x + 5, y: this.y + this.h, vx: rand(-1, 1), vy: rand(0.2, 1), g: 0.02, life: 40, kind: 'feather', color: '#ffffff' });
    }
    if (!I.jump) this.jumping = false;
    // ヒップドロップ
    if (Pr.down && !g && !water && !this.pound && this.ctrl && !this.wall) { this.pound = 1; this.poundT = 12; this.vx = 0; this.vy = 0; this.jumping = false; Snd.play('spin'); }
    // ファイア
    if (Pr.run && this.form === 2 && this.fireCd === 0 && this.ctrl && G.ents.filter(e => e instanceof PFire).length < 2) {
      G.ents.push(new PFire(this.x + (this.dir > 0 ? this.w : -8), this.y + (this.crouch ? 4 : 6), this.dir)); this.fireCd = 10; Snd.play('fire');
    }
    // 重力
    if (this.pound === 1) { this.vy = 0; if (--this.poundT <= 0) { this.pound = 2; this.vy = 7; } }
    else if (water) { this.vy = Math.min(this.vy + 0.075, 1.5); }
    else {
      this.vy += (this.vy < 0 && this.jumping) ? PHY.gravHold : PHY.grav;
      let mf = PHY.maxFall; this.glide = false;
      if (this.form === 3 && I.jump && this.vy > 0 && !this.pound) { mf = 1.0; this.glide = true; }
      if (this.wall) mf = 1.8;
      if (this.pound === 2) mf = 8.5;
      if (this.vy > mf) this.vy = (this.wall || this.glide) ? Math.max(mf, this.vy - 0.6) : mf;
    }
    // X移動
    const dx = this.vx; this.x += dx;
    const hx = collideX(this, dx);
    if (hx) { if (hx.t === T.SPIKE) this.hurt(); this.vx = 0; }
    if (this.x < G.cam.x + 1) { this.x = G.cam.x + 1; if (this.vx < 0) this.vx = 0; }
    // Y移動
    const oy = this.y; this.y += this.vy; this.onGround = false;
    if (this.vy < 0) {
      let hit = collideY(this, this.vy, oy, true);
      if (hit && hit.length === 1 && hit[0].t !== T.HIDDEN) {
        const tl = hit[0].c * TILE, tr = tl + TILE; let nx = null;
        if (this.x + this.w - tl <= 4) nx = tl - this.w; else if (tr - this.x <= 4) nx = tr;
        if (nx !== null && !boxSolid(nx, oy + this.vy, this.w, this.h)) { this.x = nx; this.y = oy + this.vy; hit = null; }
      }
      if (hit) {
        this.vy = 0.5; this.jumping = false;
        let best = hit[0], bd = 1e9; const cx = this.x + this.w / 2;
        for (const h of hit) { const d = Math.abs(h.c * TILE + 8 - cx); if (d < bd) { bd = d; best = h; } }
        hitBlock(best.c, best.r, 'head');
      }
    } else if (this.vy > 0) {
      const hit = collideY(this, this.vy, oy, true);
      if (hit) {
        if (this.pound === 2) {
          const br = hit.filter(h => h.t === T.BRICK || (h.t === T.QBLOCK));
          if (br.some(h => h.t === T.BRICK)) { br.forEach(h => { if (h.t === T.BRICK && !G.L.contents.has(G.L.idx(h.c, h.r))) breakBrick(h.c, h.r); else hitBlock(h.c, h.r, 'pound'); }); this.y = oy + this.vy; shake(3); }
          else { hit.forEach(h => { if (h.t === T.QBLOCK) hitBlock(h.c, h.r, 'pound'); }); this.landPound(); this.vy = 0; this.onGround = true; }
        } else { this.vy = 0; this.onGround = true; }
        if (hit.some(h => h.t === T.SPIKE)) this.hurt();
      }
    }
    // 乗れるエンティティ（足場・バネ）
    if (this.vy >= 0) {
      for (const e of G.ents) {
        if (!e.solidTop || !e.active || e.rm) continue;
        if (this.x + this.w > e.x + 1 && this.x < e.x + e.w - 1 && oy + this.h <= e.y + Math.max(1, (e.dy || 0) + 1) && this.y + this.h >= e.y) {
          if (e.land) { this.y = e.y - this.h; e.land(this); break; }
          this.y = e.y - this.h; this.vy = 0; this.onGround = true; this.plat = e;
          if (this.pound === 2) this.landPound();
          break;
        }
      }
    }
    if (water && this.y < 4) { this.y = 4; if (this.vy < 0) this.vy = 0; }
    this.walkDist += Math.abs(this.vx);
    // タイル接触（コイン・溶岩）
    const c0 = Math.floor(this.x / TILE), c1 = Math.floor((this.x + this.w - 0.001) / TILE), r0 = Math.floor(this.y / TILE), r1 = Math.floor((this.y + this.h - 0.001) / TILE);
    for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) {
      const t = G.L.get(c, r);
      if (t === T.COIN) { G.L.set(c, r, T.EMPTY); collectCoin(c * TILE + 8, r * TILE); burst(c * TILE + 8, r * TILE + 8, 4, ['#fff6c8', '#ffe14d'], 1, 'spark', 14); }
      else if (t === T.LAVA && this.y + this.h > r * TILE + 6) { this.die(); burst(this.x + 5, this.y + this.h, 14, ['#ffb02e', '#ff5a1a'], 2.5, 'dot', 30); }
    }
    if (this.y > VIEW_H + 20) this.die();
  }
  landPound() {
    this.pound = 0; this.land = 10; shake(4); Snd.play('pound');
    for (let i = 0; i < 8; i++) part({ x: this.x + 5, y: this.y + this.h, vx: (i < 4 ? -1 : 1) * rand(0.5, 2), vy: rand(-1, -0.2), life: 20, kind: 'puff', color: '#ffffff' });
    const zone = { x: this.x - 22, y: this.y + this.h - 10, w: this.w + 44, h: 12 };
    for (const e of G.ents) if (e.enemy && e.active && !e.dying && !e.dead && e.walker && e.stompable && e.onGround && overlap(zone, e)) { e.dieFlip(e.x < this.x ? -1 : 1); addScore(200, e); }
  }
  pose() {
    if (this.dead) return 'die';
    if (this.pound) return 'pound';
    if (this.crouch) return 'crouch';
    if (G.water && !this.onGround) return (this.swimT > 0 && ((G.t >> 2) & 1)) ? 'swim1' : 'swim2';
    if (this.wall) return 'wall';
    if (!this.onGround) return this.vy < 0 ? 'jump' : 'fall';
    if (this.skid) return 'skid';
    if (Math.abs(this.vx) > 0.1) return ['walk1', 'walk2', 'walk3', 'walk2'][Math.floor(this.walkDist / (Math.abs(this.vx) > 2 ? 9 : 7)) % 4];
    return 'stand';
  }
  draw() {
    if (this.hidden) return;
    if (this.inv > 0 && ((G.t >> 2) & 1) && !this.dead) return;
    let big = this.big, pal = this.form === 2 ? 'f' : this.form === 3 ? 'w' : 'n';
    if (G.growFx > 0) { const alt = (G.growFx >> 2) & 1; if (G.growSmall) big = !!alt; else pal = alt ? pal : 'n'; }
    if (this.star > 0) pal = 's' + ((G.t >> 2) & 3);
    const img = heroSprite(big, this.pose(), pal);
    const x = this.x + this.w / 2 - 8 - G.camX, y = this.y + this.h - img.height;
    blit(img, x, y + (this.pound === 1 ? -2 : 0), this.dir < 0);
    if (this.glide && (G.t & 7) === 0) part({ x: this.x + 5, y: this.y + this.h, vx: rand(-0.5, 0.5), vy: 0.3, life: 30, kind: 'feather', color: '#ffffff' });
  }
}

const MAKERS = {
  g: s => new Slime(s), k: s => new Beetle(s), s: s => new Spiny(s), f: s => new Bat(s), h: s => new Frog(s), p: s => new Plant(s),
  c: s => new Cannon(s), t: s => new Thwomp(s), w: s => new Podoboo(s), r: s => new Firebar(s), q: s => new Ghost(s), x: s => new Fish(s), u: s => new Urchin(s),
  spring: s => new Spring(s), mplat: s => new MovePlat(s), fplat: s => new FallPlat(s), cp: s => new Checkpoint(s), goal: s => new Goal(s), medal: s => new Medal(s), sign: s => new Sign(s)
};

/* ================= ボス ================= */
const BS = { 1: [36, 32], 2: [36, 28], 3: [32, 32], 4: [32, 34], 5: [40, 32], 6: [44, 40], 7: [44, 40] };
const BOSS_DEF = {
  1: { hits: 3, w: 30, h: 24 }, 2: { hits: 3, w: 30, h: 22 }, 3: { hits: 4, w: 24, h: 28 }, 4: { hits: 4, w: 26, h: 26, fly: true },
  5: { hits: 4, w: 32, h: 24, fly: true }, 6: { hits: 5, w: 32, h: 32 }, 7: { hits: 6, w: 32, h: 32 }
};
function bossSpr(k, f) {
  return spr(`boss${k}_${f}`, BS[k][0], BS[k][1], g => {
    const [L, R] = P();
    if (k === 1) {
      const c = '#5bd65b', d = '#2e8f3a', top = f === 1 ? 13 : 7;
      R(2, top + 8, 32, 32 - top - 8, c); R(5, top + 3, 26, 5, c); R(10, top, 16, 3, c);
      R(2, 29, 32, 3, d, true); R(7, top + 5, 5, 4, '#c8ffc8', true); R(25, top + 7, 3, 2, '#c8ffc8', true);
      const ey = top + 10;
      R(9, ey, 6, 6, '#ffffff', true); R(21, ey, 6, 6, '#ffffff', true); R(12, ey + 2, 2, 3, OUT, true); R(24, ey + 2, 2, 3, OUT, true);
      R(8, ey - 2, 7, 1, OUT, true); R(21, ey - 2, 7, 1, OUT, true);
      R(14, ey + 8, 8, 2, OUT, true); R(15, ey + 10, 6, 1, '#ff5a7a', true);
      const cy = top - 6;
      R(11, cy + 2, 14, 4, '#ffc83a'); R(11, cy, 2, 2, '#ffc83a'); R(17, cy - 1, 2, 3, '#ffc83a'); R(23, cy, 2, 2, '#ffc83a'); R(17, cy + 3, 2, 2, '#ee3a52', true);
    } else if (k === 2) {
      if (f < 2) {
        R(f ? 6 : 8, 24, 4, 4, '#3a2a1a'); R(f ? 16 : 14, 24, 4, 4, '#3a2a1a'); R(f ? 24 : 22, 24, 4, 4, '#3a2a1a');
        R(26, 11, 9, 10, '#3a3a5a'); R(30, 2, 3, 10, '#ffc83a'); R(33, 2, 2, 3, '#ffc83a'); R(31, 14, 2, 2, '#ff3a3a', true);
        R(2, 6, 26, 18, '#c83a2a'); R(5, 3, 20, 3, '#c83a2a'); R(2, 20, 26, 4, '#ffe0a0', true);
        R(14, 4, 2, 16, '#7a1a10', true); R(6, 8, 4, 4, '#ff9a8a', true); R(20, 9, 3, 3, '#ffd84a', true); R(8, 15, 3, 3, '#ffd84a', true);
        R(10, 0, 6, 4, '#2a2c3e'); R(12, -1, 2, 2, '#ffe14d');
      } else {
        R(4, 8, 28, 16, '#c83a2a'); R(7, 5, 22, 3, '#c83a2a'); R(4, 21, 28, 3, '#ffe0a0', true);
        R(f === 2 ? 10 : 22, 6, 3, 15, '#7a1a10', true); R(f === 2 ? 22 : 10, 10, 3, 3, '#ffd84a', true);
        for (let i = 0; i < 5; i++) R(6 + i * 5, 2, 2, 3, '#ffffff');
      }
    } else if (k === 3) {
      if (f < 2 || f === 3) {
        const cr = f === 3 ? 6 : 0;
        R(f === 1 ? 7 : 9, 29, 6, 3, '#ff9a2a'); R(f === 1 ? 19 : 17, 29, 6, 3, '#ff9a2a');
        R(2, 13 + cr, 4, 10, '#2a3050'); R(26, 13 + cr, 4, 10, '#2a3050');
        R(5, 6 + cr, 22, 23 - cr, '#2a3050'); R(8, 3 + cr, 16, 3, '#2a3050');
        R(9, 11 + cr, 14, 17 - cr, '#ffffff', true); R(9, 6 + cr, 14, 6, '#ffffff', true);
        R(11, 7 + cr, 2, 3, OUT, true); R(19, 7 + cr, 2, 3, OUT, true); R(10, 6 + cr, 4, 1, OUT, true); R(18, 6 + cr, 4, 1, OUT, true);
        R(14, 10 + cr, 5, 3, '#ff9a2a', true);
        R(9, 17 + cr, 14, 2, '#ee3a52', true); R(14, 20 + cr, 4, 3, '#ffc83a', true);
        R(4, 1 + cr, 24, 3, '#3a5a9a'); R(8, 0 + cr, 16, 1, '#3a5a9a'); R(15, 1 + cr, 2, 2, '#ffc83a', true);
      } else {
        R(0, 22, 4, 4, '#ff9a2a'); R(2, 16, 26, 13, '#2a3050'); R(4, 25, 22, 4, '#ffffff', true);
        R(22, 11, 10, 13, '#2a3050'); R(24, 13, 6, 7, '#ffffff', true); R(28, 14, 2, 2, OUT, true); R(30, 18, 2, 2, '#ff9a2a', true);
        R(21, 9, 10, 3, '#3a5a9a'); R(12, 18, 6, 2, '#ee3a52', true);
      }
    } else if (k === 4) {
      const c = '#f4f4ff', w = f & 1;
      R(0, 14, 4, 6, c); R(28, 14, 4, 6, c);
      R(4, 8, 24, 18, c); R(6, 6, 20, 2, c); R(8, 4, 16, 2, c);
      R(4, 26, 6, 4 + w * 2, c); R(13, 26, 6, 6 - w * 2, c); R(22, 26, 6, 4 + w * 2, c);
      R(9, 12, 5, 6, OUT, true); R(19, 12, 5, 6, OUT, true); R(11, 13, 2, 2, '#ff5ae0', true); R(21, 13, 2, 2, '#ff5ae0', true);
      if (f === 2) { R(12, 20, 8, 4, OUT, true); R(13, 21, 6, 2, '#ff5a7a', true); } else R(13, 21, 6, 1, OUT, true);
      R(6, 18, 3, 2, '#ffb0d0', true); R(23, 18, 3, 2, '#ffb0d0', true);
      R(10, 1, 12, 3, '#ffc83a'); R(10, 0, 2, 1, '#ffc83a'); R(15, 0, 2, 1, '#ffc83a'); R(20, 0, 2, 1, '#ffc83a'); R(15, 2, 2, 2, '#b16bff', true);
      parts(g, L, '#3a2a6a'); return;
    } else if (k === 5) {
      const c = '#c84ad8';
      for (let i = 0; i < 6; i++) { const x = 6 + i * 5, l = 9 + ((i + f) % 2) * 3; R(x, 18, 3, l, c); R(x + (((i + f) % 2) ? 1 : -1), 18 + l - 1, 3, 2, c); }
      R(8, 2, 24, 16, c); R(6, 6, 28, 10, c); R(12, 0, 16, 2, c);
      R(10, 4, 3, 3, '#e88af0', true); R(27, 5, 4, 3, '#e88af0', true);
      if (f === 2) { R(12, 10, 6, 1, OUT, true); R(14, 9, 2, 3, OUT, true); R(22, 10, 6, 1, OUT, true); R(24, 9, 2, 3, OUT, true); R(17, 15, 6, 2, OUT, true); }
      else { R(12, 9, 6, 5, '#ffffff', true); R(22, 9, 6, 5, '#ffffff', true); R(14, 11, 2, 3, OUT, true); R(24, 11, 2, 3, OUT, true); R(11, 8, 7, 1, OUT, true); R(22, 8, 7, 1, OUT, true); R(18, 15, 4, 2, OUT, true); }
      R(0, 10, 4, 3, '#ffe14d'); R(2, 13, 3, 3, '#ffe14d'); R(36, 10, 4, 3, '#ffe14d'); R(35, 13, 3, 3, '#ffe14d');
    } else {
      const C = k === 6 ? { b: '#3aa84a', d: '#1f6a2e', y: '#ffe08a', wg: '#c83a3a', eye: '#ffe14d' } : { b: '#6a3ad8', d: '#3a1a8a', y: '#ff9ae0', wg: '#1f1a3a', eye: '#ff3a3a' };
      R(f === 1 ? 9 : 12, 33, 7, 7, C.d); R(f === 1 ? 25 : 22, 33, 7, 7, C.d);
      R(0, 24, 10, 6, C.b); R(0, 19, 4, 6, C.b); R(0, 17, 2, 2, '#ffffff');
      R(6, 3, 14, 12, C.wg); R(3, 1, 7, 4, C.wg); R(10, 5, 1, 10, C.d, true); R(15, 5, 1, 10, C.d, true);
      R(8, 15, 24, 20, C.b); R(14, 19, 14, 14, C.y, true); R(14, 23, 14, 1, C.d, true); R(14, 27, 14, 1, C.d, true);
      for (let i = 0; i < 4; i++) R(9 + i * 5, 12, 3, 3, '#ffffff');
      R(26, 8, 10, 14, C.b); R(28, 2, 14, 12, C.b); R(38, 6, 6, 6, C.b);
      R(32, 4, 3, 3, C.eye, true); R(33, 5, 1, 2, OUT, true); R(29, 0, 3, 3, '#ffffff'); R(35, 0, 3, 2, '#ffffff');
      if (f === 2) { R(38, 10, 6, 4, '#ff5a1a', true); R(36, 14, 8, 3, C.b); } else R(36, 11, 8, 1, OUT, true);
      R(41, 7, 1, 1, OUT, true);
      if (k === 7) { R(30, -1, 2, 1, '#ffc83a'); R(26, 3, 2, 2, '#ff5ae0', true); }
    }
    parts(g, L, OUT);
  });
}
class Drop extends EFire {
  update() {
    this.t++; this.vy += this.grav; this.x += this.vx; this.y += this.vy;
    if (this.vy > 0 && SOLID[G.L.get(Math.floor((this.x + 4) / TILE), Math.floor((this.y + 8) / TILE))]) {
      this.rm = true; burst(this.x + 4, this.y + 6, 8, this.kind === 'rock' ? ['#b0a090', '#ff8a1a'] : ['#ffffff', '#ff5ae0'], 1.6, 'dot', 18);
      if (this.kind === 'rock') Snd.play('stomp');
    }
    if (this.y > VIEW_H + 20 || --this.life <= 0) this.rm = true;
  }
}
class Warn extends Ent {
  constructor(x, delay, then) { super(8, 8, null); this.x = x; this.y = 0; this.life = delay; this.then = then; this.active = true; this.layer = 2; }
  update() { this.t++; if (--this.life <= 0) { this.rm = true; this.then(); } }
  draw() {
    if ((this.t >> 2) & 1) return;
    const x = Math.round(this.x - G.camX);
    ctx.fillStyle = 'rgba(255,225,77,0.35)'; ctx.fillRect(x - 1, 32, 2, 176);
    ctx.fillStyle = '#ffe14d'; ctx.fillRect(x - 4, 202, 8, 2); ctx.fillRect(x - 1, 196, 2, 4);
  }
}
class Bolt extends Enemy {
  constructor(x) { super(10, 176, null); this.x = x - 5; this.y = 32; this.active = true; this.life = 26; this.layer = 2; this.stompable = false; this.fireable = false; this.shellable = false; this.starKillable = false; }
  update() { this.t++; if (--this.life <= 0) this.rm = true; }
  touch(p) { if (p.star > 0 || this.life < 4) return; p.hurt(); }
  draw() {
    const cx = Math.round(this.x + 5 - G.camX);
    let px = cx;
    for (let y = 32; y < 208; y += 8) {
      const nx = cx + randi(-4, 4);
      ctx.fillStyle = '#ffe14d'; ctx.fillRect(Math.min(px, nx) - 2, y, Math.abs(nx - px) + 5, 8);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.min(px, nx), y + 2, Math.abs(nx - px) + 1, 4);
      px = nx;
    }
  }
}
class BigStar extends Ent {
  constructor(x, y) { super(20, 20, null); this.x = x; this.y = y; this.active = true; this.layer = 2; }
  update() { this.t++; this.move(0.12, 2.2); if (this.t % 5 === 0) part({ x: this.x + rand(0, 20), y: this.y + rand(0, 20), vy: -0.4, life: 26, kind: 'spark', color: ['#ffffff', '#ffe14d', '#ff9ae0'][randi(0, 2)] }); }
  touch() { if (G.clear || this.rm) return; this.rm = true; castleClear(this); }
  draw() { blit(bigStarSpr((this.t >> 3) % 4), this.x - 2 - G.camX, this.y - 2 + Math.sin(this.t * 0.1) * 2); }
}

class Boss {
  constructor(w, arena) {
    const D = BOSS_DEF[w];
    this.kind = w; this.name = WORLDS[w - 1].boss; this.w = D.w; this.h = D.h; this.fly = !!D.fly;
    this.hpMax = D.hits * 4; this.hp = this.hpMax;
    this.ax0 = arena.x0 * TILE; this.ax1 = arena.x1 * TILE; this.floor = (ROWS - 2) * TILE;
    this.x = this.ax1 - 64; this.y = this.fly ? 60 : this.floor - this.h;
    this.vx = 0; this.vy = 0; this.dir = -1; this.t = 0; this.inv = 0; this.alpha = 1; this.hidden = false;
    this.state = 'sleep'; this.timer = 0; this.st = 0; this.dying = false; this.gone = false; this.dt = 0;
    this.onGround = false; this.landed = false; this.hitWall = false; this.cnt = 0; this.homeY = 50;
  }
  get pinch() { return this.hp <= this.hpMax / 2; }
  hitbox() { if (this.hidden || this.gone || this.dying) return { x: -999, y: -999, w: 0, h: 0 }; return { x: this.x + 2, y: this.y + 3, w: this.w - 4, h: this.h - 3 }; }
  set(s, t) { this.state = s; this.timer = t || 0; this.st = 0; }
  face() { this.dir = (G.p.x + 5 < this.x + this.w / 2) ? -1 : 1; }
  pdx() { return (G.p.x + 5) - (this.x + this.w / 2); }
  phys(grav = 0.35) {
    this.vy = Math.min(this.vy + grav, 7);
    const dx = this.vx; this.x += dx; this.hitWall = !!collideX(this, dx);
    const oy = this.y; this.y += this.vy;
    const h = collideY(this, this.vy, oy, false), was = this.onGround;
    this.onGround = false;
    if (h) { if (this.vy > 0) this.onGround = true; this.vy = 0; }
    this.landed = this.onGround && !was;
    if (this.y > this.floor) { this.y = this.floor - this.h; this.vy = 0; this.onGround = true; }
  }
  clampFly() {
    if (this.x < this.ax0 + 4) { this.x = this.ax0 + 4; this.vx = Math.abs(this.vx); }
    if (this.x > this.ax1 - 4 - this.w) { this.x = this.ax1 - 4 - this.w; this.vx = -Math.abs(this.vx); }
  }
  stompable() {
    switch (this.kind) {
      case 2: return this.state !== 'spin';
      case 4: return this.state === 'float' || this.state === 'swoop';
      case 5: return this.state === 'stun';
      default: return true;
    }
  }
  touch(p) {
    if (this.dying || this.hidden || this.gone || this.state === 'sleep' || this.state === 'appear') return;
    if (p.star > 0) { if (this.inv === 0) this.damage(2); return; }
    const fromTop = p.vy > 0 && p.y + p.h - p.vy <= this.y + 10;
    if (fromTop) {
      if (this.stompable()) {
        if (this.inv === 0) this.damage(4);
        p.y = this.y - p.h; p.vy = Input.cur.jump ? -7 : -5.5; p.jumping = !!Input.cur.jump; p.pound = 0; p.onGround = false; p.airJ = p.form === 3 ? 1 : 0;
        return;
      }
      if (this.kind === 2 && this.state === 'spin') { p.y = this.y - p.h; p.vy = -5; p.jumping = false; Snd.play('bump'); return; }
    }
    if (this.inv > 50) return;
    p.hurt();
  }
  fireHit() { if (this.dying || this.inv > 0 || this.hidden || this.state === 'sleep') return; this.damage(1, true); }
  damage(n, fire) {
    this.hp -= n; this.inv = fire ? 16 : 70;
    Snd.play('bosshit'); shake(fire ? 2 : 6);
    burst(this.x + this.w / 2, this.y + 6, fire ? 5 : 14, ['#ffffff', '#ffe14d'], 2.5, 'spark', 24);
    if (this.hp <= 0) { this.die(); return; }
    if (!fire) this.onHurt();
  }
  die() {
    this.dying = true; this.dt = 0; Music.stop(); Snd.play('explode'); shake(10); Save.data.enemies++;
    addScore(10000, this);
    for (const e of G.ents) if (e instanceof EFire || e instanceof Bolt || e instanceof Warn || (e.enemy && e !== this)) { if (e instanceof Warn) e.rm = true; else if (e.enemy && !e.dying) { e.rm = e instanceof EFire || e instanceof Bolt; if (!e.rm) e.dieFlip(1); } }
  }
  onHurt() {
    const p = G.p;
    switch (this.kind) {
      case 1: {
        this.face(); this.vx = -this.dir * 2.4; this.vy = -6; this.set('air');
        const n = G.ents.filter(e => e instanceof Slime && !e.dying && !e.dead).length;
        for (let i = 0; i < (this.pinch ? 2 : 1) && n + i < 3; i++) { const m = new Slime(null); m.x = this.x + 8; m.y = this.y; m.active = true; m.dir = i ? 1 : -1; m.vy = -4; G.ents.push(m); }
        break;
      }
      case 2: this.face(); this.set('spin', this.pinch ? 240 : 180); this.vx = this.dir * (this.pinch ? 3.8 : 3.2); break;
      case 3: this.face(); this.vx = -this.dir * 2.5; this.vy = -5; this.set('jump'); this.noIce = true; break;
      case 4: this.set('fade', 30); break;
      case 5: this.set('rise'); break;
      case 6: this.face(); this.vx = -this.dir * 2; this.vy = -5; this.set('jump'); break;
      case 7: this.set('fade', 26); break;
    }
    void p;
  }
  start() {
    switch (this.kind) {
      case 4: this.set('float', 140); break;
      case 5: this.set('hover', 260); break;
      default: this.set(this.kind === 1 ? 'wait' : 'walk', 50);
    }
  }
  shootAt(kind, spd, ox = 0, oy = 0, spread = 0) {
    const p = G.p, sx = this.x + this.w / 2 + ox - 4, sy = this.y + this.h / 2 + oy - 4;
    const a = Math.atan2(p.y + p.h / 2 - sy, p.x + 5 - sx) + spread;
    const e = new EFire(sx, sy, Math.cos(a) * spd, Math.sin(a) * spd, kind); G.ents.push(e); return e;
  }
  update() {
    this.t++;
    if (this.gone) return;
    if (this.inv > 0) this.inv--;
    if (this.dying) {
      this.dt++;
      if (this.dt % 7 === 0) { burst(this.x + rand(0, this.w), this.y + rand(0, this.h), 10, ['#ffffff', '#ffb02e', '#ff5a1a'], 2.5, 'spark', 28); if (this.dt % 14 === 0) Snd.play('explode'); }
      this.alpha = Math.max(0, 1 - this.dt / 110);
      if (this.dt === 110) { this.gone = true; G.ents.push(new BigStar((this.ax0 + this.ax1) / 2 - 10, 40)); Snd.play('appear'); }
      return;
    }
    if (this.state === 'sleep') {
      if (!this.fly) this.phys();
      if (G.bossFight && ++this.timer > 70) this.start();
      return;
    }
    this.st++;
    this['ai' + this.kind]();
  }
  /* --- キングプニ --- */
  ai1() {
    switch (this.state) {
      case 'wait':
        this.vx *= 0.8; this.phys();
        if (--this.timer <= 0) {
          this.face(); const big = Math.random() < 0.35;
          this.vy = big ? -8.2 : -5.6; this.vx = this.dir * (big ? 1.4 : 2.1) * (this.pinch ? 1.25 : 1);
          this.set('air'); Snd.play('bigjump');
        }
        break;
      case 'air':
        this.phys(); if (this.hitWall) this.vx = -this.vx;
        if (this.landed) {
          shake(4); Snd.play('thud'); burst(this.x + this.w / 2, this.y + this.h, 10, ['#ffffff', '#c8ffc8'], 2, 'puff', 20);
          this.vx = 0; this.cnt++; this.set('wait', this.pinch ? 22 : 42);
          if (this.cnt % 3 === 0) {
            for (let i = -1; i <= 1; i += 2) { const e = new Drop(this.x + this.w / 2 - 4, this.y, i * 1.6, -4, 'ghost', 0.18); G.ents.push(e); }
          }
        }
        break;
    }
  }
  /* --- ボムカブト --- */
  ai2() {
    switch (this.state) {
      case 'walk':
        this.vx = this.dir * (this.pinch ? 1.3 : 0.9); this.phys();
        if (this.hitWall) this.dir *= -1;
        if (--this.timer <= 0) { this.set('throw', 40); this.vx = 0; this.face(); }
        break;
      case 'throw':
        this.vx = 0; this.phys();
        if (this.st === 15 || (this.pinch && this.st === 28)) {
          const dx = this.pdx(), tt = 50, vx = clamp(dx / tt, -3, 3);
          G.ents.push(new Drop(this.x + this.w / 2 - 4, this.y - 4, vx, -4.5, 'rock', 0.18)); Snd.play('cannon');
        }
        if (--this.timer <= 0) { this.face(); this.set('walk', 90 + Math.random() * 40); }
        break;
      case 'spin':
        this.phys(); if (this.hitWall) { this.vx = -this.vx; shake(3); Snd.play('bump'); }
        if (--this.timer <= 0) { this.face(); this.set('walk', 60); }
        break;
    }
  }
  /* --- ペンギン将軍 --- */
  ai3() {
    switch (this.state) {
      case 'walk':
        this.face(); this.vx = this.dir * 0.6; this.phys(); if (this.hitWall) this.vx = 0;
        if (--this.timer <= 0) { const r = Math.random(); if (r < 0.4) this.set('prep', 24); else if (r < 0.7) { this.vy = -8; this.vx = clamp(this.pdx() / 45, -2, 2); this.set('jump'); this.noIce = false; Snd.play('bigjump'); } else this.set('throw', 50); }
        break;
      case 'prep': this.vx = 0; this.phys(); if (--this.timer <= 0) { this.face(); this.vx = this.dir * (this.pinch ? 4 : 3.3); this.set('slide'); this.bounced = false; Snd.play('spin'); } break;
      case 'slide':
        this.phys(0.35);
        if ((this.t & 3) === 0) part({ x: this.x + this.w / 2, y: this.y + this.h, vy: -0.4, life: 16, kind: 'puff', color: '#ffffff' });
        if (this.hitWall) { shake(3); Snd.play('bump'); if (!this.bounced) { this.bounced = true; this.vx = -this.vx * 0.8; } else this.vx = 0; }
        if (this.bounced) this.vx *= 0.985;
        if (this.bounced && Math.abs(this.vx) < 0.4) this.set('walk', 60);
        break;
      case 'jump':
        this.phys(); if (this.hitWall) this.vx = 0;
        if (this.landed) {
          shake(5); Snd.play('thud'); this.vx = 0;
          if (!this.noIce) {
            const n = this.pinch ? 5 : 3;
            for (let i = 0; i < n; i++) { const x = this.ax0 + 24 + Math.random() * (this.ax1 - this.ax0 - 48); G.ents.push(new Warn(x, 30 + i * 8, () => { G.ents.push(new EFire(x - 4, 34, 0, 0.5, 'ice', 0.14)); Snd.play('icicle'); })); }
          }
          this.set('walk', 60);
        }
        break;
      case 'throw':
        this.vx = 0; this.phys(); this.face();
        if (this.st % 14 === 0 && this.st <= 42) { const dx = this.pdx(); G.ents.push(new EFire(this.x + this.w / 2 - 4, this.y + 4, clamp(dx / 45, -3, 3) + rand(-0.4, 0.4), -3.6, 'ice', 0.15)); Snd.play('fire'); }
        if (--this.timer <= 0) this.set('walk', 70);
        break;
    }
  }
  /* --- ゴーストクイーン --- */
  ai4() {
    const p = G.p;
    switch (this.state) {
      case 'float': {
        const tx = clamp(p.x - this.w / 2, this.ax0 + 8, this.ax1 - 8 - this.w), ty = 70 + Math.sin(this.t * 0.04) * 22;
        this.x += clamp((tx - this.x) * 0.02, -1, 1); this.y += (ty - this.y) * 0.05; this.face();
        if (this.st % (this.pinch ? 60 : 85) === 40) { for (const s of [-0.35, 0, 0.35]) { const e = this.shootAt('ghost', 1.2, 0, 4, s); if (this.pinch) e.homing = 50; } Snd.play('efire'); }
        if (--this.timer <= 0) { if (this.pinch && Math.random() < 0.5) { this.set('swoop'); this.sx0 = this.x; this.sy0 = this.y; this.tx = p.x; this.ty = this.floor - this.h; } else this.set('fade', 30); }
        break;
      }
      case 'swoop': {
        const k = this.st / 70, kk = Math.sin(k * Math.PI);
        this.x = lerp(this.sx0, this.tx, Math.min(1, k * 2)); this.y = lerp(this.sy0, this.ty, kk);
        this.clampFly();
        if (this.st >= 70) this.set('float', 120);
        break;
      }
      case 'fade': this.alpha = Math.max(0, this.timer / 30); if (--this.timer <= 0) { this.hidden = true; this.set('hidden', 50); } break;
      case 'hidden':
        if (--this.timer <= 0) { this.hidden = false; this.x = clamp(p.x + (Math.random() < 0.5 ? -80 : 60), this.ax0 + 8, this.ax1 - 8 - this.w); this.y = 50; this.alpha = 0; this.set('appear', 30); }
        break;
      case 'appear': this.alpha = 1 - this.timer / 30; if (--this.timer <= 0) { this.alpha = 1; this.set('float', 150); } break;
    }
  }
  /* --- かみなりダコ --- */
  ai5() {
    const p = G.p;
    switch (this.state) {
      case 'hover': {
        const cx = (this.ax0 + this.ax1) / 2 - this.w / 2, amp = (this.ax1 - this.ax0) / 2 - 30;
        this.x = cx + Math.sin(this.t * (this.pinch ? 0.022 : 0.016)) * amp; this.y = lerp(this.y, this.homeY + Math.sin(this.t * 0.05) * 6, 0.1); this.face();
        if (this.st % (this.pinch ? 42 : 62) === 30) { const x = p.x + 5; G.ents.push(new Warn(x, 34, () => { G.ents.push(new Bolt(x)); Snd.play('thunder'); shake(3); })); Snd.play('warn'); }
        if (this.pinch && this.st % 90 === 60) { for (const s of [-0.25, 0.25]) this.shootAt('bolt', 1.6, 0, 6, s); }
        if (--this.timer <= 0) this.set('dive');
        break;
      }
      case 'dive': this.y += 2.4; if (this.y >= this.floor - this.h) { this.y = this.floor - this.h; shake(4); Snd.play('thud'); this.set('stun', this.pinch ? 100 : 130); } break;
      case 'stun': if (--this.timer <= 0) this.set('rise'); break;
      case 'rise': this.y -= 1.6; if (this.y <= this.homeY) { this.y = this.homeY; this.set('hover', this.pinch ? 200 : 260); } break;
    }
  }
  /* --- ドラグーン（魔王・カオス） --- */
  aiDragon(chaos) {
    switch (this.state) {
      case 'walk':
        this.face(); this.vx = this.dir * (this.pinch ? 1.0 : 0.7); this.phys(); if (this.hitWall) this.vx = 0;
        if (--this.timer <= 0) {
          const r = Math.random();
          if (chaos && r < 0.22) this.set('orbs', 70);
          else if (chaos && r < 0.4) this.set('rain', 90);
          else if (r < 0.7) this.set('breath', 60 + (this.pinch ? 24 : 0));
          else { this.vy = -8.5; this.vx = clamp(this.pdx() / 50, -2.2, 2.2); this.set('jump'); Snd.play('bigjump'); }
        }
        break;
      case 'breath':
        this.vx = 0; this.phys();
        if (this.st > 20 && this.st % 12 === 0) {
          const mx = this.dir > 0 ? this.w + 4 : -10, e = new EFire(this.x + mx, this.y + 6, this.dir * 2.3, (this.pinch ? rand(-0.6, 0.6) : rand(-0.2, 0.3)), chaos ? 'dark' : 'fire');
          G.ents.push(e); Snd.play('efire');
        }
        if (--this.timer <= 0) this.set('walk', 70 + Math.random() * 40);
        break;
      case 'jump':
        this.phys(); if (this.hitWall) this.vx = 0;
        if (this.landed) {
          shake(7); Snd.play('thud'); this.vx = 0;
          burst(this.x + this.w / 2, this.y + this.h, 14, ['#ffffff', '#c8b8a8'], 2.5, 'puff', 22);
          if (this.pinch) for (const d of [-1, 1]) G.ents.push(new Drop(this.x + this.w / 2 - 4, this.y + this.h - 10, d * 1.8, -3.5, chaos ? 'dark' : 'rock', 0.2));
          this.set('walk', 50);
        }
        break;
      case 'orbs':
        this.vx = 0; this.phys();
        if (this.st % 15 === 5 && this.st < 65) { const e = this.shootAt('dark', 1.0, 0, -8, rand(-1, 1)); e.homing = 80; e.life = 300; Snd.play('efire'); }
        if (--this.timer <= 0) this.set('walk', 60);
        break;
      case 'rain':
        this.vx = 0; this.phys();
        if (this.st % 10 === 1 && this.st < 80) { const x = this.ax0 + 16 + Math.random() * (this.ax1 - this.ax0 - 32); G.ents.push(new Warn(x, 26, () => G.ents.push(new Drop(x - 4, 34, 0, 0.6, 'dark', 0.12)))); }
        if (--this.timer <= 0) this.set('walk', 60);
        break;
      case 'fade': this.vx = 0; this.alpha = Math.max(0, this.timer / 26); if (--this.timer <= 0) { this.hidden = true; this.set('hidden', 40); } break;
      case 'hidden':
        if (--this.timer <= 0) {
          this.hidden = false; const p = G.p, left = p.x > (this.ax0 + this.ax1) / 2;
          this.x = left ? this.ax0 + 16 : this.ax1 - 16 - this.w; this.y = this.floor - this.h - 40; this.vy = 0; this.alpha = 0; this.set('appear', 26);
        }
        break;
      case 'appear': this.alpha = 1 - this.timer / 26; this.phys(); if (--this.timer <= 0) { this.alpha = 1; this.face(); this.set('breath', 60); } break;
    }
  }
  ai6() { this.aiDragon(false); }
  ai7() { this.aiDragon(true); }
  frame() {
    const k = this.kind, s = this.state, t = this.t;
    switch (k) {
      case 1: return (s === 'wait' && this.st < 10) || (s === 'wait' && this.timer < 8) ? 1 : 0;
      case 2: return s === 'spin' ? 2 + ((t >> 2) & 1) : (Math.abs(this.vx) > 0.1 ? (t >> 3) & 1 : 0);
      case 3: return s === 'slide' ? 2 : s === 'prep' ? 3 : (Math.abs(this.vx) > 0.1 ? (t >> 3) & 1 : 0);
      case 4: return s === 'float' && this.st % 85 > 30 && this.st % 85 < 46 ? 2 : (t >> 4) & 1;
      case 5: return s === 'stun' ? 2 : (t >> 3) & 1;
      default: return s === 'breath' && this.st > 16 ? 2 : (Math.abs(this.vx) > 0.1 ? (t >> 3) & 1 : 0);
    }
  }
  draw() {
    if (this.gone || this.hidden) return;
    const [sw, sh] = BS[this.kind];
    let x = this.x + this.w / 2 - sw / 2 - G.camX, y = this.y + this.h - sh;
    if (this.dying) { x += rand(-2, 2); y += rand(-1, 1); }
    let a = this.alpha; if (this.inv > 0 && ((this.t >> 2) & 1)) a *= 0.35;
    blit(bossSpr(this.kind, this.frame()), x, y, this.dir < 0, false, a);
    if (this.kind === 5 && this.state === 'stun') for (let i = 0; i < 3; i++) { const an = this.t * 0.1 + i * 2.1; ctx.fillStyle = '#ffe14d'; ctx.fillRect(Math.round(this.x + this.w / 2 + Math.cos(an) * 14 - G.camX), Math.round(this.y - 6 + Math.sin(an) * 4), 3, 3); }
  }
}

/* ================= ゲーム状態 ================= */
const G = {
  state: 'title', t: 0, lt: 0, stateT: 0, menus: [], L: null, ents: [], parts: [], p: null, cam: { x: 0, shake: 0, lead: 0 }, camX: 0, shakeY: 0,
  theme: 'grass', world: 1, stageNum: 1, lvlD: 0, sid: '1-1', water: false, ice: false, runMedals: [false, false, false],
  banner: null, signText: null, freeze: 0, growFx: 0, growSmall: false, clear: null, cpOn: false, boss: null, bossFight: false,
  score: 0, coins: 0, lives: Save.data.lives, form: 0, time: 400, timeT: 0, stage: null, autoWalk: false, stageFrames: 0,
  mapW: 1, mapS: 1, mapX: 0, mapMsg: null, intro: null, result: null, ending: null, story: null, hurry: false,
  curMusic() { if (this.bossFight && this.boss && !this.boss.dying && !this.boss.gone) return this.world === 7 ? 'final' : 'boss'; return this.stage ? this.stage.music : 'grass'; }
};
function setState(s) {
  G.state = s; G.stateT = 0; G.menus = [];
  document.body.classList.toggle('ingame', s === 'play' || s === 'intro');
}
const maxCam = () => Math.max(0, G.L.cols * TILE - VIEW_W);
function timeFor(st) { return clamp(Math.ceil(st.L.cols * TILE / 0.6 / 24 / 50) * 50, 300, 600) + (st.arena ? 100 : 0); }

function loadStage(w, s, fromCp) {
  const st = buildStage(w, s);
  G.stage = st; G.L = st.L; G.theme = st.theme; G.world = w; G.stageNum = s; G.sid = st.sid;
  G.lvlD = clamp((w - 1) / 6 + (s - 1) * 0.035, 0, 1.1);
  G.water = st.water; G.ice = st.ice;
  if (!fromCp) { G.runMedals = [false, false, false]; G.stageFrames = 0; }
  G.parts = []; G.banner = null; G.clear = null; G.autoWalk = false; G.freeze = 0; G.growFx = 0; G.bossFight = false; G.hurry = false; G.signText = null;
  G.cpOn = !!fromCp; G.lt = 0; G.timeT = 0; Music.rate = 1;
  G.ents = [];
  for (const sp of st.ents) {
    const mk = MAKERS[sp.type]; if (!mk) continue;
    if (sp.type === 'medal' && G.runMedals[sp.idx]) continue;
    const e = mk(sp);
    if (sp.type === 'cp' && fromCp) e.on = true;
    e.roam = e instanceof Slime || e instanceof Beetle || e instanceof Bat || e instanceof Frog || e instanceof Ghost || e instanceof Fish;
    G.ents.push(e);
  }
  G.boss = st.arena ? new Boss(w, st.arena) : null;
  const c = fromCp && st.cpC ? st.cpC : st.startC;
  let r = (st.type === 'castle' || st.type === 'cave') ? 2 : 0;
  while (r < ROWS - 1 && !SOLID[G.L.get(c, r)]) r++;
  G.p = new Player(c * TILE + 3, r * TILE, G.form);
  G.cam.x = clamp(G.p.x - VIEW_W * 0.35, 0, maxCam()); G.cam.lead = 0; G.cam.shake = 0; G.camX = Math.round(G.cam.x);
  G.time = timeFor(st);
}

/* ================= メニュー ================= */
function openMenu(m) { m.cur = m.cur || 0; m.t = 0; G.menus.push(m); }
function closeMenu() { G.menus.pop(); }
function updateMenu(m) {
  const I = Input.pressed; m.t++;
  const n = m.items.length;
  if (I.up) { m.cur = (m.cur + n - 1) % n; Snd.play('cursor'); }
  if (I.down) { m.cur = (m.cur + 1) % n; Snd.play('cursor'); }
  const it = m.items[m.cur];
  if ((I.left || I.right) && it.adj) { it.adj(I.left ? -1 : 1); }
  else if (I.jump || (I.pause && !m.pauseCloses)) { if (it.act) { Snd.play('ok'); it.act(); } else if (it.adj) it.adj(1); }
  else if (I.run || I.back || (I.pause && m.pauseCloses)) { if (m.cancel) { Snd.play('cancel'); m.cancel(); } }
}
function drawMenu(m) {
  ctx.font = `12px ${FONT_JP}`;
  let w = m.title ? ctx.measureText(m.title).width + 30 : 120;
  const labels = m.items.map(it => typeof it.label === 'function' ? it.label() : it.label);
  for (const l of labels) w = Math.max(w, ctx.measureText(l).width + 44);
  w = Math.min(VIEW_W - 16, Math.ceil(w));
  const h = m.items.length * 18 + (m.title ? 28 : 12), x = Math.round((VIEW_W - w) / 2), y = Math.round(m.y !== undefined ? m.y : (VIEW_H - h) / 2);
  box(x, y, w, h, 'rgba(12,14,40,.94)', '#ffe14d');
  let yy = y + 8;
  if (m.title) { text(m.title, VIEW_W / 2, yy, 12, '#ffe14d', 'center'); yy += 20; }
  labels.forEach((l, i) => {
    const on = i === m.cur;
    if (on) { ctx.fillStyle = 'rgba(255,225,77,.18)'; ctx.fillRect(x + 6, yy - 2, w - 12, 16); if ((m.t >> 4) & 1 || true) text('▶', x + 12, yy, 12, '#ffe14d'); }
    text(l, x + 28, yy, 12, on ? '#ffffff' : '#a8b0d0');
    yy += 18;
  });
}
function confirmMenu(title, yes) {
  openMenu({ title, cur: 1, items: [{ label: 'はい', act: () => { closeMenu(); yes(); } }, { label: 'いいえ', act: closeMenu }], cancel: closeMenu });
}
function settingsMenu() {
  return {
    title: 'せってい', items: [
      { label: () => `BGM　◀ ${Save.data.bgm} ▶`, adj: d => { Save.data.bgm = clamp(Save.data.bgm + d, 0, 10); Snd.applyVolume(); Save.save(); Snd.play('cursor'); } },
      { label: () => `こうかおん　◀ ${Save.data.sfx} ▶`, adj: d => { Save.data.sfx = clamp(Save.data.sfx + d, 0, 10); Snd.applyVolume(); Save.save(); Snd.play('coin'); } },
      { label: () => `がめんのゆれ　${Save.data.shake ? 'ON' : 'OFF'}`, adj: () => { Save.data.shake = !Save.data.shake; Save.save(); Snd.play('cursor'); } },
      { label: () => `スティックでダッシュ　${Save.data.autoDash ? 'ON' : 'OFF'}`, adj: () => { Save.data.autoDash = !Save.data.autoDash; Save.save(); Snd.play('cursor'); } },
      { label: () => `ボタンのこさ　◀ ${Save.data.padAlpha} ▶`, adj: d => { Save.data.padAlpha = clamp(Save.data.padAlpha + d, 1, 10); applyPadStyle(); Save.save(); Snd.play('cursor'); } },
      { label: () => `ボタンのおおきさ　◀ ${['小', '中', '大'][Save.data.padSize]} ▶`, adj: d => { Save.data.padSize = clamp(Save.data.padSize + d, 0, 2); applyPadStyle(); Save.save(); Snd.play('cursor'); } },
      { label: () => { const v = Save.data.padLayout | 0, n = padName(); return `コントローラー　◀ ${['じどう', 'Xbox式', 'Switch式'][v]}${v === 0 && n ? '（' + n + '）' : ''} ▶`; }, adj: d => { Save.data.padLayout = ((Save.data.padLayout | 0) + d + 3) % 3; Save.save(); Snd.play('cursor'); } },
      { label: 'セーブデータをけす', act: () => confirmMenu('ほんとうに けしますか？', () => { Save.reset(); G.lives = Save.data.lives; G.score = 0; G.form = 0; applyPadStyle(); setState('title'); Music.play('title'); }) },
      { label: 'もどる', act: closeMenu }
    ], cancel: closeMenu
  };
}
function titleMenu() {
  const items = [];
  if (Save.data.started) items.push({ label: 'つづきから', act: () => { G.lives = Save.data.lives; G.score = 0; G.form = 0; goMap(Save.data.lastW, Save.data.lastS); } });
  items.push({ label: 'はじめから', act: () => { if (Save.data.started) confirmMenu('セーブデータを けして はじめから？', newGame); else newGame(); } });
  items.push({ label: 'せってい', act: () => openMenu(settingsMenu()) });
  return { items, cancel: closeMenu, y: 132 };
}
function pauseMenu() {
  return {
    title: 'ポーズ', pauseCloses: true, items: [
      { label: 'つづける', act: resume },
      { label: 'さいしょからやりなおす', act: () => { G.form = G.p.form; Music.paused = false; startIntro(G.world, G.stageNum, false); } },
      { label: 'マップにもどる', act: () => { G.form = G.p.form; Music.paused = false; goMap(G.world, G.stageNum); } },
      { label: 'せってい', act: () => openMenu(settingsMenu()) }
    ], cancel: resume
  };
}
function resume() { closeMenu(); Music.paused = false; }
function mapMenu() {
  return {
    title: 'メニュー', items: [
      { label: 'とじる', act: closeMenu },
      { label: 'せってい', act: () => openMenu(settingsMenu()) },
      { label: 'タイトルへ', act: () => { setState('title'); Music.play('title'); } }
    ], cancel: closeMenu
  };
}
function newGame() {
  Save.data.started = true; Save.data.lives = 5; Save.save();
  G.lives = 5; G.score = 0; G.form = 0; G.mapW = 1; G.mapS = 1;
  G.story = { page: 0, t: 0 }; setState('story'); Music.play('map');
}
function goMap(w, s) {
  w = clamp(w || 1, 1, 7); s = clamp(s || 1, 1, 5);
  while (w > 1 && !isUnlocked(w, 1)) w--;
  while (s > 1 && !isUnlocked(w, s)) s--;
  G.mapW = w; G.mapS = s; G.mapX = nodePos(s).x;
  setState('map'); Music.play('map');
}
function startIntro(w, s, cp) { G.intro = { w, s, cp }; setState('intro'); Music.stop(); }

/* ================= プレイ中の更新 ================= */
function updateCamera() {
  const p = G.p, c = G.cam;
  let target;
  if (G.bossFight && G.stage.arena) { const a = G.stage.arena; target = (a.x0 + a.x1) * TILE / 2 - VIEW_W / 2; }
  else { c.lead = lerp(c.lead, p.dir * 34 + p.vx * 6, 0.04); target = p.x + p.w / 2 - VIEW_W / 2 + c.lead; }
  target = clamp(target, 0, maxCam());
  c.x = lerp(c.x, target, G.bossFight ? 0.08 : 0.16);
  if (!p.hidden) {
    if (p.x - c.x < 28) c.x = p.x - 28;
    if (p.x + p.w - c.x > VIEW_W - 28) c.x = p.x + p.w - VIEW_W + 28;
  }
  c.x = clamp(c.x, 0, maxCam());
  let sx = 0, sy = 0;
  if (c.shake > 0) { sx = (Math.random() * 2 - 1) * c.shake; sy = (Math.random() * 2 - 1) * c.shake * 0.6; c.shake *= 0.86; if (c.shake < 0.3) c.shake = 0; }
  G.camX = Math.round(c.x + sx); G.shakeY = Math.round(sy);
}
function startBoss() {
  G.bossFight = true; const a = G.stage.arena;
  for (let r = 2; r < ROWS - 2; r++) G.L.set(a.x0 - 1, r, T.STONE);
  Snd.play('door'); shake(5); Music.play(G.curMusic());
  G.banner = { text: G.boss.name, t: 130, big: true };
}
function startGoal(g) {
  const p = G.p; if (G.clear || p.dead) return;
  const frac = clamp(1 - (p.y + p.h - g.top) / g.poleH, 0, 1);
  const pts = [100, 400, 800, 2000, 5000][Math.min(4, Math.floor(frac * 5))];
  addScore(pts, { x: g.x + 4, y: p.y, w: 0 });
  const ld = G.time % 10;
  G.clear = { kind: 'goal', phase: 'slide', t: 0, g, fw: [1, 3, 6].includes(ld) ? ld : 0, wait: 0 };
  p.vx = 0; p.vy = 0; p.ctrl = false; p.pound = 0; p.star = 0; p.x = g.x - p.w + 1; if (p.y < g.top - 8) p.y = g.top - 8; p.dir = 1; p.wall = 1; p.jumping = false; p.crouch = false;
  if (p.big && p.h !== 22) p.setHeight(22);
  Music.stop(); Snd.play('flag');
}
function castleClear() {
  const p = G.p;
  G.clear = { kind: 'star', phase: 'pose', t: 0, fw: 0 };
  p.ctrl = false; p.star = 0; Music.play('castleclear');
  burst(p.x + 5, p.y + p.h / 2, 30, ['#ffffff', '#ffe14d', '#ff9ae0', '#9ae8ff'], 3.5, 'spark', 50);
  G.ents = G.ents.filter(e => !(e instanceof EFire) && !(e instanceof Bolt) && !(e instanceof Warn));
  G.banner = { text: 'ボス げきは！', t: 150, big: true };
}
function updateClear() {
  const c = G.clear, p = G.p; c.t++;
  switch (c.phase) {
    case 'slide': {
      const g = c.g, pb = g.bottom - p.h; p.wall = 1; p.vx = 0;
      if (p.y < pb) p.y = Math.min(pb, p.y + 2.2);
      if (g.flagY < g.bottom - 16) g.flagY += 2.2;
      if (p.y >= pb && g.flagY >= g.bottom - 16 && ++c.wait > 24) { c.phase = 'walk'; p.wall = 0; p.x = g.x + 5; p.dir = 1; G.autoWalk = true; Music.play('clear'); }
      return false;
    }
    case 'walk':
      if (p.x >= G.stage.castleC * TILE + 18 || c.t > 600) { p.hidden = true; G.autoWalk = false; c.phase = 'tally'; c.t = 0; }
      return true;
    case 'pose': if (c.t > 100) { c.phase = 'tally'; c.t = 0; } return true;
    case 'tally':
      if (c.t > 20) {
        if (G.time > 0) { const n = Math.min(3, G.time); G.time -= n; G.score += n * 50; if ((c.t & 3) === 0) Snd.play('tick'); }
        else { c.phase = c.fw ? 'fw' : 'done'; c.t = 0; }
      }
      return !p.hidden;
    case 'fw':
      if (c.t % 34 === 1) {
        c.fw--; const x = G.camX + rand(VIEW_W * 0.35, VIEW_W * 0.9), y = rand(40, 100);
        burst(x, y, 34, ['#ff5ab4', '#ffe14d', '#5affc8', '#9ae8ff', '#ffffff'], 3.2, 'spark', 50); Snd.play('firework'); G.score += 500;
        part({ x, y: y - 10, vy: -0.4, life: 40, kind: 'text', text: '500', color: '#ffffff' });
        if (c.fw <= 0) { c.phase = 'done'; c.t = 0; }
      }
      return !p.hidden;
    case 'done': if (c.t > 80) finishStage(); return !p.hidden;
  }
  return true;
}
function finishStage() {
  const sid = G.sid, d = Save.data, old = (d.medals[sid] || [false, false, false]).slice();
  const hadBest = !!d.best[sid];
  d.cleared[sid] = true;
  d.medals[sid] = old.map((v, i) => v || G.runMedals[i]);
  let rec = false;
  if (!d.best[sid] || G.stageFrames < d.best[sid]) { d.best[sid] = G.stageFrames; rec = hadBest; }
  d.high = Math.max(d.high, G.score); d.lives = G.lives;
  G.form = G.p.form;
  G.result = { sid, w: G.world, s: G.stageNum, run: G.runMedals.slice(), old, time: G.stageFrames, rec, castle: G.stage.type === 'castle', name: WORLDS[G.world - 1].stages[G.stageNum - 1] };
  const nx = G.stageNum < 5 ? [G.world, G.stageNum + 1] : (G.world < 7 && isUnlocked(G.world + 1, 1) ? [G.world + 1, 1] : [G.world, G.stageNum]);
  d.lastW = nx[0]; d.lastS = nx[1];
  Save.save();
  if (sid === '6-5' && !d.endA) { d.endA = true; Save.save(); startEnding(false); return; }
  if (sid === '7-5' && !d.endB) { d.endB = true; Save.save(); startEnding(true); return; }
  setState('result'); Music.play('map');
}
function handleDeath() {
  Save.data.deaths++; G.form = 0; G.lives--;
  if (G.lives < 0) { Save.data.lives = 5; Save.save(); setState('gameover'); Music.play('gameover'); return; }
  Save.data.lives = G.lives; Save.save();
  startIntro(G.world, G.stageNum, G.cpOn);
}
function updateDeath() {
  const p = G.p; p.deadT++;
  if (p.deadT === 30) p.vy = -6.5;
  if (p.deadT > 30) { p.vy = Math.min(p.vy + 0.3, 6); p.y += p.vy; }
  if (p.deadT === 175) handleDeath();
}
function weather() {
  const th = G.theme, r = Math.random(), X = G.camX + Math.random() * VIEW_W;
  if (th === 'ice' && r < 0.3) part({ x: X + 40, y: -4, vy: 0.5 + Math.random() * 0.5, life: 460, kind: 'snow', size: randi(1, 2) });
  else if ((th === 'volcano' || th === 'castle') && r < 0.1) part({ x: X, y: VIEW_H, vy: -0.5 - Math.random(), vx: rand(-0.2, 0.2), life: 220, kind: 'ember', color: Math.random() < 0.5 ? '#ff8a1a' : '#ffd23a' });
  else if (th === 'forest' && r < 0.05) part({ x: X, y: rand(60, 200), vx: rand(-0.3, 0.3), vy: rand(-0.2, 0.2), life: 240, kind: 'firefly' });
  else if (th === 'star' && r < 0.1) part({ x: X, y: rand(10, 190), life: 30, kind: 'spark', color: Math.random() < 0.5 ? '#ffffff' : '#c8a0ff' });
  else if (th === 'water' && r < 0.08) part({ x: X, y: VIEW_H, vy: -0.4 - Math.random() * 0.5, life: 460, kind: 'bubble', color: '#bfe8ff' });
  else if (th === 'cave' && r < 0.03) part({ x: X, y: 34, vy: 1.5, g: 0.1, life: 120, kind: 'dot', color: '#7ab8ff', size: 1 });
}
function updateParts() {
  for (const q of G.parts) {
    q.t++; q.vy += q.g; q.x += q.vx; q.y += q.vy;
    if (q.kind === 'bubble') { q.x += Math.sin(q.t * 0.2) * 0.3; if (q.y < 6) q.t = q.life; }
    else if (q.kind === 'feather') q.vx = Math.sin(q.t * 0.15) * 0.6;
    else if (q.kind === 'snow') q.vx = -0.3 + Math.sin(q.t * 0.05) * 0.3;
  }
  if (G.parts.length) G.parts = G.parts.filter(q => q.t < q.life && q.y < VIEW_H + 40);
}
function updatePlay() {
  const p = G.p;
  if ((Input.pressed.pause || Input.pressed.back) && !G.clear && !p.dead) { openMenu(pauseMenu()); Snd.play('pause'); Music.paused = true; return; }
  G.t++;
  if (G.banner && --G.banner.t <= 0) G.banner = null;
  if (G.freeze > 0) { G.freeze--; if (G.growFx > 0) G.growFx--; return; }
  if (p.dead) { updateDeath(); updateParts(); return; }
  G.lt++;
  if (!G.clear) {
    G.stageFrames++;
    if (++G.timeT >= 24) {
      G.timeT = 0; G.time--;
      if (G.time === 100) { Snd.play('warn'); G.hurry = true; Music.rate = 1.3; G.banner = { text: 'いそげ！', t: 80 }; }
      if (G.time <= 0) { G.time = 0; p.die(); return; }
    }
  }
  G.signText = null;
  let doPlayer = true;
  if (G.clear) doPlayer = updateClear();
  if (G.state !== 'play') return;
  if (doPlayer && !p.hidden) p.update();
  if (p.dead) return;
  updateCamera();
  // ブロックのバウンド
  if (G.L.bumps.size) for (const [k, v] of G.L.bumps) { if (v <= 1) G.L.bumps.delete(k); else G.L.bumps.set(k, v - 1); }
  // エンティティ
  const ax0 = G.camX - 48, ax1 = G.camX + VIEW_W + 40, ux0 = G.camX - 112, ux1 = G.camX + VIEW_W + 112;
  const list = G.ents;
  for (let i = 0; i < list.length; i++) {
    const e = list[i]; if (e.rm) continue;
    if (!e.active) { if (e.x + e.w > ax0 && e.x < ax1) e.active = true; else continue; }
    if (e.roam) {
      if (!e.dying && (e.x + e.w < G.camX - 220 || e.x > G.camX + VIEW_W + 280)) { e.rm = true; continue; }
      e.update();
    } else if (e instanceof Item || e instanceof PFire || e instanceof EFire || e instanceof Bolt || e instanceof Warn || e instanceof BigStar || e.dying) e.update();
    else if (e.x + e.w > ux0 && e.x < ux1) e.update();
    else if (e instanceof MovePlat) e.update();
  }
  if (G.boss) G.boss.update();
  // 当たり判定
  if (!p.hidden) {
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.active || e.rm || e.dying || !e.touch) continue;
      if (G.clear && (e.enemy || e instanceof Firebar)) continue;
      const hb = e.hitbox ? e.hitbox() : e;
      if (overlap(p, hb)) e.touch(p);
      if (p.dead) break;
    }
    if (G.boss && G.bossFight && !G.clear && !p.dead && overlap(p, G.boss.hitbox())) G.boss.touch(p);
  }
  if (G.boss && !G.bossFight && !G.clear && p.x > (G.stage.arena.x0 + 3) * TILE) startBoss();
  if (Math.random() < 0.9) weather();
  if (G.water && !p.dead && (G.t % 50) === 0) part({ x: p.x + 5 + p.dir * 4, y: p.y + 2, vy: -0.6, life: 160, kind: 'bubble', color: '#e0f6ff' });
  updateParts();
  if (G.ents.some(e => e.rm)) G.ents = G.ents.filter(e => !e.rm);
}

/* ================= プレイ中の描画 ================= */
function drawTiles() {
  const L = G.L, th = G.theme, ceil = G.stage.type === 'castle' || G.stage.type === 'cave';
  const c0 = Math.max(0, Math.floor(G.camX / TILE)), c1 = Math.min(L.cols - 1, Math.floor((G.camX + VIEW_W) / TILE));
  const qf = [0, 1, 2, 1][(G.t >> 3) & 3], cf = (G.t >> 3) & 3, lf = (G.t >> 4) & 3;
  for (let c = c0; c <= c1; c++) {
    const x = c * TILE - G.camX;
    for (let r = 0; r < ROWS; r++) {
      const i = r * L.stride + c, t = L.tiles[i];
      if (!t || t === T.HIDDEN) continue;
      let img;
      switch (t) {
        case T.GROUND: img = tileImg(th, (ceil && r < 2) || (r > 0 && L.tiles[i - L.stride] === T.GROUND) ? 'gfill' : 'gtop'); break;
        case T.BRICK: img = tileImg(th, 'brick'); break;
        case T.QBLOCK: img = tileImg(th, 'q', qf); break;
        case T.USED: img = tileImg(th, 'used'); break;
        case T.STONE: img = tileImg(th, 'stone'); break;
        case T.SEMI: img = tileImg(th, 'semi'); break;
        case T.SPIKE: img = tileImg(th, 'spike'); break;
        case T.COIN: img = coinSpr(cf); break;
        case T.LAVA: img = tileImg(th, r > 0 && L.tiles[i - L.stride] === T.LAVA ? 'lava' : 'lavatop', lf); break;
        case T.PTOP: img = tileImg(th, L.get(c - 1, r) === T.PTOP ? 'ptopR' : 'ptopL'); break;
        case T.PIL: img = tileImg(th, L.get(c - 1, r) === T.PIL || L.get(c - 1, r) === T.PTOP ? 'pilR' : 'pilL'); break;
        default: continue;
      }
      let y = r * TILE; const b = L.bumps.get(i); if (b) y -= Math.round(Math.sin(((8 - b) / 8) * Math.PI) * 5);
      ctx.drawImage(img, x, y);
    }
  }
}
function drawEnts(layer) {
  const x0 = G.camX - 64, x1 = G.camX + VIEW_W + 64;
  for (const e of G.ents) { if (e.rm || e.layer !== layer || !e.active) continue; if (e.x + e.w < x0 || e.x > x1) continue; e.draw(); }
}
function drawParts() {
  for (const q of G.parts) {
    const x = Math.round(q.x - G.camX), y = Math.round(q.y), k = 1 - q.t / q.life;
    if (x < -24 || x > VIEW_W + 24) continue;
    switch (q.kind) {
      case 'dot': ctx.fillStyle = q.color; ctx.fillRect(x, y, q.size, q.size); break;
      case 'spark': if (k < 0.4 && ((q.t >> 1) & 1)) break; ctx.fillStyle = q.color; ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3); break;
      case 'puff': { const s = 2 + (1 - k) * 5; ctx.globalAlpha = k; ctx.fillStyle = q.color; ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), Math.round(s), Math.round(s)); ctx.globalAlpha = 1; break; }
      case 'shard': ctx.fillStyle = OUT; ctx.fillRect(x - 3, y - 3, 7, 7); ctx.fillStyle = q.color; ctx.fillRect(x - 2, y - 2, 5, 5); break;
      case 'coin': ctx.drawImage(coinSpr((q.t >> 2) & 3), x - 8, y - 8); break;
      case 'text': text(q.text, x, y, 8, q.color, 'center', FONT_EN, '#1b1033'); break;
      case 'feather': ctx.fillStyle = q.color; ctx.fillRect(x, y, 3, 1); ctx.fillRect(x + 1, y + 1, 1, 1); break;
      case 'bubble': ctx.fillStyle = q.color; ctx.fillRect(x - 1, y - 2, 3, 1); ctx.fillRect(x - 1, y + 2, 3, 1); ctx.fillRect(x - 2, y - 1, 1, 3); ctx.fillRect(x + 2, y - 1, 1, 3); break;
      case 'snow': ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, q.size, q.size); break;
      case 'ember': ctx.globalAlpha = k; ctx.fillStyle = q.color; ctx.fillRect(x, y, 2, 2); ctx.globalAlpha = 1; break;
      case 'firefly': ctx.globalAlpha = 0.5 + Math.sin(q.t * 0.1) * 0.5; ctx.fillStyle = '#d8ff6a'; ctx.fillRect(x, y, 2, 2); ctx.globalAlpha = 1; break;
    }
  }
}
function miniMedal(x, y, state) {
  const C = state === 2 ? ['#ffc83a', '#fff3a0'] : state === 1 ? ['#7aa8e8', '#d0e0ff'] : ['#3a3e5a', '#5a5e7a'];
  ctx.fillStyle = OUT; ctx.fillRect(x, y + 1, 9, 7); ctx.fillRect(x + 1, y, 7, 9);
  ctx.fillStyle = C[0]; ctx.fillRect(x + 1, y + 2, 7, 5); ctx.fillRect(x + 2, y + 1, 5, 7);
  ctx.fillStyle = C[1]; ctx.fillRect(x + 2, y + 2, 2, 2);
}
function drawHUD() {
  ctx.fillStyle = 'rgba(8,10,30,.5)'; ctx.fillRect(0, 0, VIEW_W, 19);
  ctx.drawImage(heroSprite(false, 'stand', 'n'), 2, 1);
  text('×' + Math.max(0, G.lives), 19, 6, 8, '#ffffff', 'left', FONT_EN);
  text(String(G.score).padStart(7, '0'), 44, 6, 8, '#ffffff', 'left', FONT_EN);
  ctx.drawImage(coinSpr(0), 102, 1);
  text('×' + String(G.coins).padStart(2, '0'), 116, 6, 8, '#ffe14d', 'left', FONT_EN);
  const saved = Save.data.medals[G.sid] || [];
  for (let i = 0; i < 3; i++) miniMedal(150 + i * 11, 5, G.runMedals[i] ? 2 : saved[i] ? 1 : 0);
  text(`W${G.world}-${G.stageNum}`, 190, 6, 8, '#9ae8ff', 'left', FONT_EN);
  text(String(G.time).padStart(3, '0'), VIEW_W - 6, 6, 8, G.hurry && ((G.t >> 3) & 1) ? '#ff5a5a' : '#ffffff', 'right', FONT_EN);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(VIEW_W - 40, 7, 6, 6); ctx.fillStyle = '#1b1033'; ctx.fillRect(VIEW_W - 39, 8, 4, 4); ctx.fillStyle = '#ffffff'; ctx.fillRect(VIEW_W - 37, 9, 1, 2); ctx.fillRect(VIEW_W - 37, 10, 2, 1);
  if (G.signText) {
    ctx.font = `10px ${FONT_JP}`; const w = Math.min(VIEW_W - 16, ctx.measureText(G.signText).width + 20);
    box(Math.round((VIEW_W - w) / 2), 24, Math.round(w), 20, 'rgba(255,248,225,.95)', '#8a5a20');
    text(G.signText, VIEW_W / 2, 29, 10, '#3a2010', 'center', FONT_JP, null);
  }
  if (G.banner) {
    const b = G.banner, s = b.big ? 20 : 14, y = b.big ? 64 : 72;
    textOutline(b.text, VIEW_W / 2, y + (b.t > 120 ? (b.t - 120) * -1 : 0), s, b.big ? '#ffe14d' : '#ffffff', '#1b1033', 'center', FONT_JP);
  }
  const B = G.boss;
  if (B && G.bossFight && !B.gone) {
    const w = Math.min(160, VIEW_W - 120), x = Math.round((VIEW_W - w) / 2), y = VIEW_H - 14;
    text(B.name, x, y - 12, 10, '#ffffff', 'left', FONT_JP);
    ctx.fillStyle = OUT; ctx.fillRect(x - 1, y - 1, w + 2, 8);
    ctx.fillStyle = '#3a1a2a'; ctx.fillRect(x, y, w, 6);
    const f = Math.max(0, B.hp / B.hpMax);
    ctx.fillStyle = f > 0.5 ? '#ff5a5a' : (G.t >> 3) & 1 ? '#ff9a3a' : '#ff3a3a'; ctx.fillRect(x, y, Math.round(w * f), 6);
    ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(x, y, Math.round(w * f), 2);
  }
}
function drawPlay() {
  const th = G.theme;
  ctx.save(); ctx.translate(0, G.shakeY);
  drawBackground(th, G.camX);
  for (const d of G.stage.deco) {
    const x = d.c * TILE - G.camX; if (x < -40 || x > VIEW_W + 8) continue;
    ctx.drawImage(decoSpr(d.kind, (G.t >> 4) & 1), Math.round(x - 8), d.r * TILE - 32);
  }
  if (G.stage.castleC) { const x = G.stage.castleC * TILE - 8 - G.camX; if (x > -70 && x < VIEW_W) ctx.drawImage(goalCastleSpr(th), Math.round(x), (ROWS - 2) * TILE - 80); }
  drawEnts(0);
  drawTiles();
  drawEnts(1);
  if (G.boss) G.boss.draw();
  G.p.draw();
  drawEnts(2);
  drawParts();
  if (G.water) {
    ctx.fillStyle = 'rgba(40,130,230,.16)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    for (let x = 0; x < VIEW_W; x += 6) ctx.fillRect(x, 3 + Math.round(Math.sin((x + G.camX + G.t * 1.5) * 0.05) * 2), 4, 1);
  }
  if (th === 'cave' || th === 'forest') {
    const p = G.p, px = p.x + 5 - G.camX, py = p.y + p.h / 2;
    const gr = ctx.createRadialGradient(px, py, 40, px, py, 230);
    gr.addColorStop(0, 'rgba(0,0,12,0)'); gr.addColorStop(1, th === 'cave' ? 'rgba(0,0,12,.6)' : 'rgba(0,0,20,.35)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  if (G.freeze > 0 && G.p.dead === false && G.growFx <= 0) { ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
  ctx.restore();
  drawHUD();
}

/* ================= マップ ================= */
function nodePos(s) { return { x: Math.round(VIEW_W * (0.12 + (s - 1) * 0.19)), y: Math.round(118 + Math.sin(s * 1.5) * 20) }; }
function lastUnlocked(w) { let s = 1; while (s < 5 && isUnlocked(w, s + 1)) s++; return s; }
const TYPE_JP = { over: 'コース', cave: 'ちか', athletic: 'アスレチック', water: 'すいちゅう', castle: 'とりで' };
function updateMap() {
  const I = Input.pressed;
  if (G.mapMsg && --G.mapMsg.t <= 0) G.mapMsg = null;
  G.mapX = lerp(G.mapX, nodePos(G.mapS).x, 0.22);
  if (I.right) { if (G.mapS < 5 && isUnlocked(G.mapW, G.mapS + 1)) { G.mapS++; Snd.play('cursor'); } else Snd.play('bump'); }
  if (I.left) { if (G.mapS > 1) { G.mapS--; Snd.play('cursor'); } }
  if (I.up) {
    if (G.mapW < 7 && isUnlocked(G.mapW + 1, 1)) { G.mapW++; G.mapS = lastUnlocked(G.mapW); G.mapX = nodePos(G.mapS).x; Snd.play('ok'); }
    else if (G.mapW === 6 && Save.data.cleared['6-5']) { G.mapMsg = { text: `スターメダル ${W7_NEED}まいで ほしの神殿がひらく（いま ${medalCount(1, 6)}まい）`, t: 180 }; Snd.play('cancel'); }
    else Snd.play('bump');
  }
  if (I.down) { if (G.mapW > 1) { G.mapW--; G.mapS = lastUnlocked(G.mapW); G.mapX = nodePos(G.mapS).x; Snd.play('ok'); } else Snd.play('bump'); }
  if (I.jump) { Snd.play('ok'); Save.data.lastW = G.mapW; Save.data.lastS = G.mapS; Save.save(); startIntro(G.mapW, G.mapS, false); }
  else if (I.pause || I.back) { Snd.play('pause'); openMenu(mapMenu()); }
}
function drawMap() {
  const W = WORLDS[G.mapW - 1], th = W.theme;
  drawBackground(th, G.t * 0.3);
  ctx.fillStyle = 'rgba(5,6,20,.28)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // ヘッダー
  box(6, 6, VIEW_W - 12, 26, 'rgba(12,14,40,.88)', '#ffe14d');
  text(`WORLD ${G.mapW}`, 14, 11, 8, '#ffe14d', 'left', FONT_EN);
  text(W.name, 14, 20, 10, '#ffffff', 'left', FONT_JP, null);
  const total = medalCount(1, 7);
  miniMedal(VIEW_W - 112, 10, 2); text(`${total}/105`, VIEW_W - 99, 11, 8, '#ffffff', 'left', FONT_EN);
  ctx.drawImage(heroSprite(false, 'stand', 'n'), VIEW_W - 46, 12);
  text('×' + G.lives, VIEW_W - 30, 20, 8, '#ffffff', 'left', FONT_EN);
  // ワールド切りかえ矢印
  const canUp = G.mapW < 7 && isUnlocked(G.mapW + 1, 1);
  if (canUp) text('▲ ↑でつぎのワールド', VIEW_W / 2, 38, 8, '#ffffff', 'center');
  if (G.mapW > 1) text('▼ ↓でまえのワールド', VIEW_W / 2, VIEW_H - 74, 8, '#ffffff', 'center');
  // みち
  for (let s = 1; s < 5; s++) {
    const a = nodePos(s), b = nodePos(s + 1), open = isUnlocked(G.mapW, s + 1);
    for (let k = 0.08; k < 0.95; k += 0.1) { const x = lerp(a.x, b.x, k), y = lerp(a.y, b.y, k); ctx.fillStyle = OUT; ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 5, 5); ctx.fillStyle = open ? '#fff3c8' : '#6a6e8a'; ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3); }
  }
  for (let s = 1; s <= 5; s++) {
    const n = nodePos(s), sid = `${G.mapW}-${s}`, open = isUnlocked(G.mapW, s), clr = !!Save.data.cleared[sid];
    const sz = s === 5 ? 12 : 9;
    ctx.fillStyle = OUT; ctx.fillRect(n.x - sz - 1, n.y - sz + 1, sz * 2 + 2, sz * 2 - 2); ctx.fillRect(n.x - sz + 1, n.y - sz - 1, sz * 2 - 2, sz * 2 + 2);
    ctx.fillStyle = clr ? '#ffc83a' : open ? '#ffffff' : '#4a4e6a';
    ctx.fillRect(n.x - sz, n.y - sz + 2, sz * 2, sz * 2 - 4); ctx.fillRect(n.x - sz + 2, n.y - sz, sz * 2 - 4, sz * 2);
    if (s === 5) { ctx.fillStyle = clr ? '#c88a20' : open ? '#7a1a2a' : '#2a2e44'; ctx.fillRect(n.x - 6, n.y - 4, 12, 9); ctx.fillRect(n.x - 6, n.y - 7, 3, 3); ctx.fillRect(n.x - 1, n.y - 7, 3, 3); ctx.fillRect(n.x + 4, n.y - 7, 2, 3); ctx.fillStyle = '#1b1033'; ctx.fillRect(n.x - 2, n.y, 4, 5); }
    else text(String(s), n.x, n.y - 4, 8, clr ? '#7a4a10' : open ? '#1b1033' : '#2a2e44', 'center', FONT_EN, null);
    const m = Save.data.medals[sid] || [];
    for (let i = 0; i < 3; i++) { ctx.fillStyle = OUT; ctx.fillRect(n.x - 11 + i * 8, n.y + sz + 3, 6, 6); ctx.fillStyle = m[i] ? '#ffe14d' : '#4a4e6a'; ctx.fillRect(n.x - 10 + i * 8, n.y + sz + 4, 4, 4); }
  }
  // ヒーロー
  const n = nodePos(G.mapS), bob = Math.abs(Math.sin(G.t * 0.12)) * 3;
  const moving = Math.abs(G.mapX - n.x) > 1;
  ctx.drawImage(heroSprite(false, moving ? ['walk1', 'walk2', 'walk3', 'walk2'][(G.t >> 3) & 3] : 'stand', 'n'), Math.round(G.mapX - 8), Math.round(n.y - 30 - (moving ? 0 : bob)));
  // 下パネル
  const sid = `${G.mapW}-${G.mapS}`, type = W.types[G.mapS - 1], py = VIEW_H - 62;
  box(6, py, VIEW_W - 12, 56, 'rgba(12,14,40,.9)', '#ffffff');
  text(`${sid}`, 14, py + 7, 8, '#ffe14d', 'left', FONT_EN);
  text(W.stages[G.mapS - 1], 54, py + 5, 12, '#ffffff', 'left', FONT_JP, null);
  text(`【${TYPE_JP[type]}】`, VIEW_W - 14, py + 6, 10, type === 'castle' ? '#ff7a7a' : '#9ae8ff', 'right', FONT_JP, null);
  const m = Save.data.medals[sid] || [];
  for (let i = 0; i < 3; i++) blit(itemSpr(m[i] ? 'medal' : 'medalG'), 14 + i * 18, py + 22, false, false, m[i] ? 1 : 0.3);
  text('ベスト ' + fmtTime(Save.data.best[sid]), 74, py + 26, 10, '#ffffff', 'left', FONT_JP, null);
  text(type === 'castle' ? 'ボス：' + W.boss : '', VIEW_W - 14, py + 26, 10, '#ffb0b0', 'right', FONT_JP, null);
  text('A：スタート　II：メニュー', VIEW_W / 2, py + 42, 8, '#a8b0d0', 'center', FONT_JP, null);
  if (G.mapMsg) { ctx.font = `10px ${FONT_JP}`; const w = Math.min(VIEW_W - 12, ctx.measureText(G.mapMsg.text).width + 16); box(Math.round((VIEW_W - w) / 2), 48, Math.round(w), 20, 'rgba(60,20,60,.95)', '#ff9ae0'); text(G.mapMsg.text, VIEW_W / 2, 53, 10, '#ffffff', 'center', FONT_JP, null); }
}

/* ================= タイトル・ストーリー・イントロ ================= */
const LOGO = 'ホップヒーロー', LOGO_COL = ['#ff5a6a', '#ffb02e', '#ffe14d', '#5ad66a', '#5ac8ff', '#8a7aff', '#ff7ae0'];
function drawTitle() {
  const off = G.t * 0.6;
  drawBackground('grass', off);
  const go = (G.t * 1.2) % 16;
  for (let x = -16; x < VIEW_W + 16; x += 16) { ctx.drawImage(tileImg('grass', 'gtop'), Math.round(x - go), 208); ctx.drawImage(tileImg('grass', 'gfill'), Math.round(x - go), 224); }
  const hx = Math.round(VIEW_W * 0.22), jump = Math.max(0, Math.sin(G.t * 0.05)) ** 2 * 40;
  ctx.drawImage(heroSprite(true, jump > 2 ? 'jump' : ['walk1', 'walk2', 'walk3', 'walk2'][(G.t >> 3) & 3], 'n'), hx, Math.round(184 - jump));
  const sx = VIEW_W * 0.75 - ((G.t * 0.4) % (VIEW_W * 0.6));
  ctx.drawImage(slimeSpr('g', (G.t >> 3) & 1), Math.round(VIEW_W - (G.t * 0.7) % (VIEW_W + 40)), 192);
  for (let i = 0; i < 5; i++) ctx.drawImage(coinSpr(((G.t >> 3) + i) & 3), Math.round(hx + 30 + i * 18), Math.round(150 - Math.sin(i / 4 * Math.PI) * 16));
  void sx;
  // ロゴ
  const n = LOGO.length, cw = 30, x0 = VIEW_W / 2 - (n - 1) * cw / 2;
  for (let i = 0; i < n; i++) textOutline(LOGO[i], x0 + i * cw, 30 + Math.sin(G.t * 0.07 + i * 0.7) * 3, 28, LOGO_COL[i], '#1b1033', 'center', FONT_JP);
  textOutline('～七色の星と浮遊大陸～', VIEW_W / 2, 72, 12, '#ffffff', '#1b1033', 'center', FONT_JP);
  if (!G.menus.length && ((G.t >> 5) & 1)) textOutline(IS_TOUCH ? 'タップしてスタート' : 'Aボタン / Zキーでスタート', VIEW_W / 2, 112, 12, '#ffe14d', '#1b1033', 'center', FONT_JP);
  text('HI ' + String(Save.data.high).padStart(7, '0'), 8, VIEW_H - 12, 8, '#ffffff', 'left', FONT_EN);
  text('made by hiro/ヒロ', VIEW_W - 8, VIEW_H - 14, 10, '#ffffff', 'right', FONT_JP);
}
function updateTitle() { if (!G.menus.length && (Input.pressed.jump || Input.pressed.pause)) { Snd.play('ok'); openMenu(titleMenu()); } }
const STORY = [
  ['そらに うかぶ ふしぎな浮遊大陸。', '七色の星が この世界を', 'やさしく てらしていた。'],
  ['ところが ある日、まおうドラグーンが', 'あらわれ、七色の星を', 'うばいさってしまった！'],
  ['星のひかりを うしなった大陸は', 'すこしずつ そらから', 'しずみはじめている…'],
  ['フードの少年 ポップは', '星をとりもどすため', 'たびに でることにした！']
];
function updateStory() {
  const s = G.story; s.t++;
  if (Input.pressed.pause) { goMap(1, 1); return; }
  if (Input.pressed.jump) { if (s.t < 60) s.t = 60; else { s.page++; s.t = 0; Snd.play('cursor'); if (s.page >= STORY.length) goMap(1, 1); } }
}
function drawStory() {
  ctx.fillStyle = '#0a0c24'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const s = G.story, pg = STORY[Math.min(s.page, STORY.length - 1)];
  for (let i = 0; i < 40; i++) { ctx.fillStyle = (i + (G.t >> 4)) % 5 ? '#3a3e7a' : '#ffffff'; ctx.fillRect((i * 97) % VIEW_W, (i * 53) % 120, 1, 1); }
  const cx = VIEW_W / 2;
  if (s.page === 0) for (let i = 0; i < 7; i++) { const a = G.t * 0.02 + i * 0.9; ctx.drawImage(itemSpr('star', i % 3), Math.round(cx - 8 + Math.cos(a) * 50), Math.round(70 + Math.sin(a) * 18)); }
  else if (s.page === 1) ctx.drawImage(bossSpr(6, (G.t >> 5) & 1 ? 2 : 0), Math.round(cx - 22), 50);
  else if (s.page === 2) { ctx.fillStyle = '#5a7a4a'; ctx.fillRect(cx - 60, 80 + (G.t % 120) / 20, 120, 14); ctx.fillStyle = '#8a6a48'; ctx.fillRect(cx - 50, 94 + (G.t % 120) / 20, 100, 10); }
  else ctx.drawImage(heroSprite(true, ['walk1', 'walk2', 'walk3', 'walk2'][(G.t >> 3) & 3], 'n'), Math.round(cx - 8), 60);
  let shown = Math.floor(s.t * 0.7);
  pg.forEach((ln, i) => { const str = ln.slice(0, Math.max(0, shown)); shown -= ln.length; text(str, cx, 130 + i * 20, 12, '#ffffff', 'center', FONT_JP); });
  if (s.t > 60 && ((G.t >> 4) & 1)) text('▼ A', VIEW_W - 30, VIEW_H - 20, 8, '#ffe14d', 'center', FONT_EN);
  text('II：スキップ', 10, VIEW_H - 18, 8, '#6a6e9a', 'left', FONT_JP, null);
}
function updateIntro() {
  if (G.stateT > 110 || (G.stateT > 30 && Input.pressed.jump)) {
    const it = G.intro; loadStage(it.w, it.s, it.cp); setState('play'); Music.play(G.curMusic(), true);
  }
}
function drawIntro() {
  ctx.fillStyle = '#05060f'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const it = G.intro, W = WORLDS[it.w - 1], cx = VIEW_W / 2, type = W.types[it.s - 1];
  text(`WORLD ${it.w}-${it.s}`, cx, 54, 16, '#ffffff', 'center', FONT_EN);
  text(W.name, cx, 82, 12, '#9ae8ff', 'center', FONT_JP);
  textOutline(W.stages[it.s - 1], cx, 102, 18, '#ffe14d', '#1b1033', 'center', FONT_JP);
  if (type === 'castle') text('ボス：' + W.boss, cx, 130, 12, '#ff7a7a', 'center', FONT_JP);
  if (it.cp) text('チェックポイントから', cx, 130, 10, '#5affc8', 'center', FONT_JP);
  ctx.drawImage(heroSprite(G.form > 0, 'stand', G.form === 2 ? 'f' : G.form === 3 ? 'w' : 'n'), Math.round(cx - 30), G.form > 0 ? 154 : 162);
  text('× ' + Math.max(0, G.lives), cx - 8, 166, 12, '#ffffff', 'left', FONT_EN);
  const m = Save.data.medals[`${it.w}-${it.s}`] || [];
  for (let i = 0; i < 3; i++) miniMedal(cx - 16 + i * 12, 196, m[i] ? 2 : 0);
}

/* ================= リザルト・ゲームオーバー・エンディング ================= */
function updateResult() { if (G.stateT > 50 && (Input.pressed.jump || Input.pressed.pause)) { Snd.play('ok'); goMap(Save.data.lastW, Save.data.lastS); } }
function drawResult() {
  const R0 = G.result, W = WORLDS[R0.w - 1];
  drawBackground(W.theme, G.t * 0.4);
  ctx.fillStyle = 'rgba(5,6,20,.55)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const cx = VIEW_W / 2;
  textOutline(R0.castle ? 'とりで クリア！' : 'コース クリア！', cx, 22, 22, '#ffe14d', '#1b1033', 'center', FONT_JP);
  text(`${R0.sid}　${R0.name}`, cx, 56, 12, '#ffffff', 'center', FONT_JP);
  for (let i = 0; i < 3; i++) {
    const got = R0.run[i], had = R0.old[i], x = cx - 40 + i * 32 - 8, y = 80;
    const show = G.stateT > 20 + i * 14;
    if (show) { blit(itemSpr(got || had ? 'medal' : 'medalG'), x, y, false, false, got || had ? 1 : 0.25); if (got && !had && G.stateT < 20 + i * 14 + 30) burst(G.camX + x + 8, y + 8, 2, ['#ffffff', '#ffe14d'], 1.5, 'spark', 20); if (got && !had) text('NEW', x + 8, y + 18, 8, '#5affc8', 'center', FONT_EN); }
  }
  text('タイム　' + fmtTime(R0.time), cx, 122, 12, '#ffffff', 'center', FONT_JP);
  if (R0.rec && (G.t >> 4) & 1) text('ベストきろく こうしん！', cx, 140, 10, '#ff9ae0', 'center', FONT_JP);
  text('スコア　' + String(G.score).padStart(7, '0'), cx, 160, 12, '#ffffff', 'center', FONT_JP);
  text(`スターメダル　${medalCount(1, 7)} / 105`, cx, 180, 10, '#ffe14d', 'center', FONT_JP);
  if (G.stateT > 50 && ((G.t >> 4) & 1)) text('Aボタンで つぎへ', cx, 208, 10, '#a8b0d0', 'center', FONT_JP);
  G.camX = 0; drawParts(); updateParts();
}
function updateGameOver() {
  if (G.stateT === 110) openMenu({
    items: [
      { label: 'つづける', act: () => { G.lives = 5; Save.data.lives = 5; Save.save(); G.score = 0; G.form = 0; goMap(G.world, G.stageNum); } },
      { label: 'タイトルへ', act: () => { G.lives = 5; G.score = 0; G.form = 0; setState('title'); Music.play('title'); } }
    ], y: 150
  });
}
function drawGameOver() {
  ctx.fillStyle = '#05060f'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const k = Math.min(1, G.stateT / 60);
  textOutline('GAME OVER', VIEW_W / 2, 60 + (1 - k) * -30, 24, '#ee3a52', '#1b1033', 'center', FONT_EN);
  text('あきらめないで！ ポップはまだまだ たたかえる！', VIEW_W / 2, 110, 10, '#ffffff', 'center', FONT_JP);
  ctx.drawImage(heroSprite(false, 'die', 'n'), Math.round(VIEW_W / 2 - 8), 124);
}
function startEnding(trueEnd) {
  const d = Save.data, open = world7Open();
  const story = trueEnd
    ? ['カオスドラグーンは ひかりのなかへ きえていった。', '', '七色の星は かがやきを とりもどし、', '浮遊大陸は ふたたび そらたかく うかびあがった。', '', 'ポップの ぼうけんは', 'いつまでも かたりつがれるだろう。', '', '～ しんの エンディング ～']
    : ['まおうドラグーンは たおれ、', '七色の星は 浮遊大陸に もどってきた！', '', 'しかし… そらのかなたの「ほしの神殿」から', 'なにやら あやしい ひかりが…', '', open ? 'ほしの神殿への みちが ひらいた！' : `スターメダルを ${W7_NEED}まい あつめると`, open ? 'さいごの たたかいが まっている！' : 'あたらしい みちが ひらくらしい…'];
  const lines = ['ホップヒーロー', '～七色の星と浮遊大陸～', '', '', ...story, '', '', '― STAFF ―', '', 'ゲームデザイン', 'hiro/ヒロ', '', 'プログラム', 'hiro/ヒロ', '', 'ドット絵', 'hiro/ヒロ', '', 'サウンド', 'hiro/ヒロ', '', 'SPECIAL THANKS', 'あそんでくれた あなた', '', '', '― きろく ―', '',
    `スターメダル　${medalCount(1, 7)} / 105`, `あつめたコイン　${d.totalCoins}`, `たおしたてき　${d.enemies}`, `ミスした回数　${d.deaths}`, `プレイ時間　${Math.floor(d.playSec / 3600)}じかん ${Math.floor(d.playSec / 60) % 60}ふん`, '', '', 'made by hiro/ヒロ', 'github.com/h1ro223'];
  G.ending = { lines, y: VIEW_H + 10, trueEnd, done: false };
  setState('ending'); Music.play('ending');
}
function updateEnding() {
  const e = G.ending;
  if (!e.done) { e.y -= Input.cur.jump ? 1.6 : 0.4; if (e.y + e.lines.length * 18 < VIEW_H * 0.45) e.done = true; if ((G.t % 50) === 0) burst(rand(20, VIEW_W - 20), rand(20, 120), 24, ['#ff5ab4', '#ffe14d', '#5affc8', '#9ae8ff'], 2.5, 'spark', 45); }
  else if (Input.pressed.jump || Input.pressed.pause) { Snd.play('ok'); goMap(Save.data.lastW, Save.data.lastS); }
  G.t++; G.camX = 0; updateParts();
}
function drawEnding() {
  const e = G.ending;
  ctx.fillStyle = e.trueEnd ? '#120a2a' : '#0a0c24'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  for (let i = 0; i < 60; i++) { ctx.fillStyle = (i + (G.t >> 4)) % 6 ? '#3a3e7a' : '#ffffff'; ctx.fillRect((i * 97 + 13) % VIEW_W, (i * 61) % VIEW_H, 1, 1); }
  drawParts();
  e.lines.forEach((ln, i) => {
    const y = e.y + i * 18; if (y < -20 || y > VIEW_H) return;
    const head = i < 2 || ln.startsWith('―') || ln.startsWith('～') || ln.startsWith('made');
    text(ln, VIEW_W / 2, y, head ? (i === 0 ? 18 : 12) : 10, head ? '#ffe14d' : '#ffffff', 'center', FONT_JP);
  });
  ctx.drawImage(heroSprite(true, ['walk1', 'walk2', 'walk3', 'walk2'][(G.t >> 3) & 3], 'n'), 14, VIEW_H - 34);
  if (e.done) { textOutline('THE END', VIEW_W / 2, VIEW_H - 56, 18, '#ffe14d', '#1b1033', 'center', FONT_EN); if ((G.t >> 4) & 1) text('Aボタンで マップへ', VIEW_W / 2, VIEW_H - 24, 10, '#a8b0d0', 'center', FONT_JP); }
}

/* ================= メインループ ================= */
function step() {
  Input.poll();
  Save.data.playSec += 1 / 60;
  G.stateT++;
  if (G.menus.length) { updateMenu(G.menus[G.menus.length - 1]); if (G.state !== 'play') G.t++; return; }
  switch (G.state) {
    case 'title': G.t++; updateTitle(); break;
    case 'story': G.t++; updateStory(); break;
    case 'map': G.t++; updateMap(); break;
    case 'intro': G.t++; updateIntro(); break;
    case 'play': updatePlay(); break;
    case 'result': G.t++; updateResult(); break;
    case 'gameover': G.t++; updateGameOver(); break;
    case 'ending': updateEnding(); break;
  }
}
function render() {
  ctx.setTransform(RES, 0, 0, RES, 0, 0);
  ctx.imageSmoothingEnabled = false;
  switch (G.state) {
    case 'title': drawTitle(); break;
    case 'story': drawStory(); break;
    case 'map': drawMap(); break;
    case 'intro': drawIntro(); break;
    case 'play': drawPlay(); break;
    case 'result': drawResult(); break;
    case 'gameover': drawGameOver(); break;
    case 'ending': drawEnding(); break;
  }
  if (G.menus.length) {
    if (G.state === 'play') { ctx.fillStyle = 'rgba(0,0,10,.45)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
    drawMenu(G.menus[G.menus.length - 1]);
  }
}
let last = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = now - last; last = now;
  if (dt > 250) dt = 250; if (dt < 0) dt = 0;
  acc += dt;
  let n = 0;
  while (acc >= FIXED_DT && n < 5) { try { step(); } catch (err) { console.error(err); } acc -= FIXED_DT; n++; }
  if (n >= 5) acc = 0;
  try { render(); } catch (err) { console.error(err); }
  if (!Music.paused) Music.update();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (G.state === 'play' && !G.menus.length && G.p && !G.p.dead && !G.clear) { openMenu(pauseMenu()); Music.paused = true; }
    Save.save();
  }
});
['touchend', 'click', 'keydown'].forEach(ev => window.addEventListener(ev, () => Snd.unlock(), { passive: true }));
window.addEventListener('pagehide', () => Save.save());
if (document.fonts && document.fonts.load) { document.fonts.load('16px "DotGothic16"').catch(() => {}); document.fonts.load('8px "Press Start 2P"').catch(() => {}); }
G.lives = Save.data.lives;
setState('title'); Music.play('title');
requestAnimationFrame(frame);
window.__HOPHERO = G;
})();
