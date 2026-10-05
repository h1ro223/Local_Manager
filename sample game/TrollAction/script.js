'use strict';
/* =====================================================================
   鬼罠 ONIWANA ～超鬼畜トラップアクション～
   made by hiro/ヒロ  https://github.com/h1ro223
   ===================================================================== */

// ---------- 基本定数 ----------
const TS = 32, COLS = 25, ROWS = 19, VW = COLS * TS, VH = ROWS * TS;
const PHYS = { grav: 0.4, maxFall: 9, jump1: 8.5, jump2: 7, speed: 3, cut: 0.45, waterFall: 2.4, tramp: 11.5 };
const PW = 12, PH = 20;
const FONT = '"DotGothic16","Hiragino Kaku Gothic ProN","Meiryo",sans-serif';
const DIFFS = [
  { name: 'NORMAL', jp: 'ノーマル', desc: 'セーブポイント多め。まずはここから。' },
  { name: 'HARD', jp: 'ハード', desc: 'セーブポイント少なめ。本物の地獄。' },
  { name: 'ONI', jp: '鬼', desc: '中間セーブなし。部屋の入口からやり直し。' }
];

const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');
cvs.width = VW; cvs.height = VH;

// ---------- ユーティリティ ----------
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const rndi = (a, b) => Math.floor(rnd(a, b + 1));
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rectOv = (ax, ay, aw, ah, bx, by, bw, bh) => ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
function circRect(cx, cy, r, x, y, w, h) {
  const nx = clamp(cx, x, x + w), ny = clamp(cy, y, y + h);
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}
// 三角形 vs 矩形 (分離軸)
function triRect(t, x, y, w, h) {
  const minx = Math.min(t[0], t[2], t[4]), maxx = Math.max(t[0], t[2], t[4]);
  if (maxx <= x || minx >= x + w) return false;
  const miny = Math.min(t[1], t[3], t[5]), maxy = Math.max(t[1], t[3], t[5]);
  if (maxy <= y || miny >= y + h) return false;
  const cx = [x, x + w, x + w, x], cy = [y, y, y + h, y + h];
  for (let i = 0; i < 3; i++) {
    const ax = t[i * 2], ay = t[i * 2 + 1], bx = t[(i * 2 + 2) % 6], by = t[(i * 2 + 3) % 6];
    const nx = -(by - ay), ny = bx - ax;
    let tmin = Infinity, tmax = -Infinity, rmin = Infinity, rmax = -Infinity;
    for (let j = 0; j < 3; j++) { const p = t[j * 2] * nx + t[j * 2 + 1] * ny; if (p < tmin) tmin = p; if (p > tmax) tmax = p; }
    for (let j = 0; j < 4; j++) { const p = cx[j] * nx + cy[j] * ny; if (p < rmin) rmin = p; if (p > rmax) rmax = p; }
    if (tmax <= rmin || rmax <= tmin) return false;
  }
  return true;
}
function spikeTri(x, y, w, h, dir, ins) {
  ins = ins === undefined ? 2 : ins;
  switch (dir) {
    case 'u': return [x + ins, y + h, x + w / 2, y + ins, x + w - ins, y + h];
    case 'd': return [x + ins, y, x + w - ins, y, x + w / 2, y + h - ins];
    case 'l': return [x + w, y + ins, x + w, y + h - ins, x + ins, y + h / 2];
    default: return [x, y + ins, x + w - ins, y + h / 2, x, y + h - ins];
  }
}
function fmtTime(f) {
  const s = Math.floor(f / 60), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, ss = s % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
}

// ---------- 入力 ----------
const Input = {
  codes: new Set(), touch: {}, cur: {}, prev: {}, p: {},
  MAP: {
    ArrowLeft: ['left'], KeyA: ['left'], ArrowRight: ['right'], KeyD: ['right'],
    ArrowUp: ['up', 'jump2'], KeyW: ['up', 'jump2'], ArrowDown: ['down'], KeyS: ['down'],
    ShiftLeft: ['jump', 'ok'], ShiftRight: ['jump', 'ok'], Space: ['jump', 'ok'], KeyK: ['jump'],
    KeyZ: ['shoot', 'ok'], KeyX: ['shoot', 'back'], KeyJ: ['shoot'],
    KeyR: ['retry'], Escape: ['pause', 'back'], KeyP: ['pause'], Enter: ['ok', 'pause'],
    Backspace: ['back'], KeyM: ['mute']
  },
  update(menu) {
    const c = {};
    for (const code of this.codes) { const a = this.MAP[code]; if (a) for (const x of a) c[x] = true; }
    if (!menu && c.jump2) c.jump = true;
    const t = this.touch;
    if (menu) {
      if (t.left) c.up = true; if (t.right) c.down = true;
      if (t.jump) c.ok = true; if (t.shoot || t.pause) c.back = true;
    } else {
      if (t.left) c.left = true; if (t.right) c.right = true;
      if (t.jump) c.jump = true; if (t.shoot) c.shoot = true; if (t.pause) c.pause = true;
    }
    if (t.retry) c.retry = true;
    this.pollPad(c);
    this.prev = this.cur; this.cur = c;
    const p = {};
    for (const k in c) if (c[k] && !this.prev[k]) p[k] = true;
    this.p = p;
  },
  pollPad(c) {
    let gps = [];
    try { gps = navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { gps = []; }
    for (const g of gps) {
      if (!g || !g.buttons) continue;
      const b = i => g.buttons[i] && g.buttons[i].pressed;
      const ax = g.axes[0] || 0, ay = g.axes[1] || 0;
      if (b(14) || ax < -0.45) c.left = true;
      if (b(15) || ax > 0.45) c.right = true;
      if (b(12) || ay < -0.55) c.up = true;
      if (b(13) || ay > 0.55) c.down = true;
      if (b(0)) { c.jump = true; c.ok = true; }
      if (b(2) || b(3)) c.shoot = true;
      if (b(1)) c.back = true;
      if (b(9)) c.pause = true;
      if (b(8)) c.retry = true;
    }
  },
  clear() { this.codes.clear(); this.touch = {}; }
};

// ---------- サウンド (WebAudio 完全自前合成) ----------
const MODES = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
  phryg: [0, 1, 3, 5, 7, 8, 10], harm: [0, 2, 3, 5, 7, 8, 11], mixo: [0, 2, 4, 5, 7, 9, 10]
};
const SONGDEFS = {
  title: { seed: 7, bpm: 124, root: 57, mode: 'harm', prog: [0, 5, 3, 4], arp: true, drum: 1, lead: 'square' },
  w1: { seed: 1201, bpm: 150, root: 60, mode: 'major', prog: [0, 3, 4, 0, 5, 3, 1, 4], arp: true, drum: 2, lead: 'square' },
  w1n: { seed: 77, bpm: 112, root: 57, mode: 'dorian', prog: [0, 3, 0, 4], arp: true, drum: 1, lead: 'triangle' },
  w2: { seed: 3303, bpm: 118, root: 62, mode: 'dorian', prog: [0, 6, 5, 4], arp: true, drum: 1, lead: 'triangle' },
  w3: { seed: 9150, bpm: 164, root: 52, mode: 'minor', prog: [0, 0, 5, 6, 0, 0, 3, 4], arp: true, drum: 3, lead: 'square' },
  w4: { seed: 4471, bpm: 176, root: 55, mode: 'phryg', prog: [0, 1, 0, 6], arp: true, drum: 3, lead: 'sawtooth' },
  w5: { seed: 6660, bpm: 138, root: 59, mode: 'harm', prog: [0, 5, 3, 4, 0, 5, 1, 4], arp: true, drum: 2, lead: 'square' },
  boss: { seed: 666, bpm: 184, root: 53, mode: 'harm', prog: [0, 0, 5, 4], arp: true, drum: 3, lead: 'sawtooth' },
  final: { seed: 31337, bpm: 196, root: 50, mode: 'harm', prog: [0, 5, 3, 4, 0, 1, 6, 4], arp: true, drum: 3, lead: 'square' },
  ending: { seed: 2026, bpm: 100, root: 60, mode: 'major', prog: [0, 4, 5, 3, 0, 4, 3, 4], arp: true, drum: 1, lead: 'triangle' }
};
function buildSong(def) {
  const rng = mulberry32(def.seed);
  const sc = MODES[def.mode];
  const bars = def.prog.length * 2, steps = bars * 16;
  const RH = [[4, 4, 4, 4], [2, 2, 4, 2, 2, 4], [3, 3, 2, 4, 4], [6, 2, 4, 4], [2, 2, 2, 2, 4, 4], [4, 2, 2, 8], [3, 3, 4, 2, 2, 2], [2, 4, 2, 4, 4]];
  const rA = RH[Math.floor(rng() * RH.length)], rB = RH[Math.floor(rng() * RH.length)];
  const lead = [];
  let cur = 9;
  const motif = [];
  for (let b = 0; b < bars; b++) {
    const chord = def.prog[Math.floor(b / 2) % def.prog.length];
    const rh = (b % 4 === 3) ? [4, 4, 8] : (b % 2 === 0 ? rA : rB);
    let pos = 0;
    const half = Math.floor(bars / 2);
    rh.forEach((len, i) => {
      let deg;
      if (b >= half && b < bars - 1 && motif[(b - half) * 8 + i] !== undefined && rng() < 0.75) {
        deg = motif[(b - half) * 8 + i] + (chord - def.prog[Math.floor((b - half) / 2) % def.prog.length]) % 3;
      } else if (pos % 4 === 0) {
        const tones = [chord, chord + 2, chord + 4, chord + 7, chord + 9, chord + 11];
        let best = tones[0], bd = 99;
        for (const tt of tones) { const d = Math.abs(tt - cur) + rng() * 2.2; if (d < bd) { bd = d; best = tt; } }
        deg = best;
      } else {
        deg = cur + [-2, -1, -1, 1, 1, 2][Math.floor(rng() * 6)];
      }
      if (b === bars - 1 && i === rh.length - 1) deg = 7;
      deg = clamp(deg, 5, 15);
      if (b < half) motif[b * 8 + i] = deg;
      lead.push({ s: b * 16 + pos, len, deg, rest: rng() < 0.06 && i > 0 });
      cur = deg; pos += len;
    });
  }
  const toMidi = deg => def.root + 12 * Math.floor(deg / 7) + sc[((deg % 7) + 7) % 7];
  const leadMap = {};
  for (const n of lead) if (!n.rest) leadMap[n.s] = { m: toMidi(n.deg) + 12, len: n.len };
  return { def, steps, leadMap, toMidi };
}
const SND = {
  ac: null, master: null, bgmG: null, sfxG: null, noiseBuf: null, timer: null,
  song: null, songName: '', step: 0, next: 0, pending: null, lastSfx: {}, duck: 1,
  opt: { bgm: true, se: true },
  init() {
    if (this.ac) { if (this.ac.state === 'suspended') { try { this.ac.resume(); } catch (e) { } } return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ac = new AC(); } catch (e) { this.ac = null; return; }
    const ac = this.ac;
    this.master = ac.createGain(); this.master.gain.value = 0.6;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(ac.destination);
    this.bgmG = ac.createGain(); this.bgmG.connect(this.master);
    this.sfxG = ac.createGain(); this.sfxG.connect(this.master);
    this.applyVol();
    const len = ac.sampleRate;
    const b = ac.createBuffer(1, len, ac.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = b;
    this.timer = setInterval(() => this.tick(), 25);
    if (this.pending) { const p = this.pending; this.pending = null; this.songName = ''; this.play(p); }
  },
  applyVol() {
    if (!this.ac) return;
    const t = this.ac.currentTime;
    this.bgmG.gain.cancelScheduledValues(t);
    this.bgmG.gain.setTargetAtTime(this.opt.bgm ? 0.3 * this.duck : 0, t, 0.05);
    this.sfxG.gain.setValueAtTime(this.opt.se ? 0.55 : 0, t);
  },
  setDuck(v) { this.duck = v; this.applyVol(); },
  osc(type, f, t, dur, vol, dest, f2) {
    const ac = this.ac, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.03);
  },
  noise(t, dur, vol, dest, freq, type) {
    const ac = this.ac, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = this.noiseBuf; f.type = type || 'highpass'; f.frequency.value = freq || 1000;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random() * 0.4, dur + 0.05);
  },
  sfx(n) {
    if (!this.ac || !this.opt.se) return;
    const now = performance.now();
    if (this.lastSfx[n] && now - this.lastSfx[n] < 45) return;
    this.lastSfx[n] = now;
    const t = this.ac.currentTime, d = this.sfxG;
    try {
      switch (n) {
        case 'jump': this.osc('square', 330, t, 0.1, 0.13, d, 700); break;
        case 'djump': this.osc('square', 520, t, 0.1, 0.11, d, 1040); break;
        case 'shoot': this.osc('square', 1100, t, 0.05, 0.05, d, 600); break;
        case 'death':
          this.noise(t, 0.55, 0.5, d, 500, 'lowpass');
          this.osc('sawtooth', 260, t, 0.5, 0.22, d, 35);
          this.osc('square', 130, t + 0.05, 0.45, 0.12, d, 30); break;
        case 'save': [784, 988, 1319].forEach((f, i) => this.osc('square', f, t + i * 0.06, 0.12, 0.1, d)); break;
        case 'warp': for (let i = 0; i < 7; i++) this.osc('triangle', 300 + i * 140, t + i * 0.04, 0.16, 0.18, d); break;
        case 'trap': this.osc('sawtooth', 180, t, 0.14, 0.16, d, 90); this.noise(t, 0.08, 0.1, d, 2000); break;
        case 'boing': this.osc('triangle', 180, t, 0.28, 0.32, d, 720); break;
        case 'orb': this.osc('sine', 880, t, 0.18, 0.2, d, 1760); this.osc('sine', 1320, t + 0.04, 0.14, 0.1, d, 2200); break;
        case 'gem': [1047, 1319, 1568, 2093].forEach((f, i) => this.osc('square', f, t + i * 0.07, 0.16, 0.1, d)); break;
        case 'crumble': this.noise(t, 0.18, 0.25, d, 900, 'bandpass'); break;
        case 'slam': this.noise(t, 0.35, 0.5, d, 220, 'lowpass'); this.osc('sine', 90, t, 0.35, 0.45, d, 28); break;
        case 'hit': this.osc('square', 420, t, 0.06, 0.09, d, 160); break;
        case 'bossdie': this.noise(t, 1.4, 0.6, d, 400, 'lowpass'); this.osc('sawtooth', 300, t, 1.3, 0.25, d, 30); break;
        case 'laser': this.osc('sawtooth', 1400, t, 0.12, 0.04, d, 700); break;
        case 'fire': this.noise(t, 0.12, 0.08, d, 1500, 'bandpass'); break;
        case 'move': this.osc('square', 660, t, 0.04, 0.06, d); break;
        case 'select': this.osc('square', 880, t, 0.06, 0.09, d); this.osc('square', 1320, t + 0.05, 0.08, 0.08, d); break;
        case 'cancel': this.osc('square', 440, t, 0.07, 0.08, d, 220); break;
        case 'pop': this.osc('square', 240, t, 0.07, 0.14, d, 900); break;
        case 'rumble': this.noise(t, 0.6, 0.3, d, 160, 'lowpass'); break;
        case 'clear': [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.osc('square', f, t + i * 0.09, 0.2, 0.1, d)); break;
      }
    } catch (e) { }
  },
  play(name) {
    if (this.songName === name) return;
    this.songName = name;
    if (!this.ac) { this.pending = name; return; }
    this.song = name && SONGDEFS[name] ? buildSong(SONGDEFS[name]) : null;
    this.step = 0; this.next = this.ac.currentTime + 0.08;
  },
  stop() { this.songName = ''; this.song = null; this.pending = null; },
  tick() {
    if (!this.ac || !this.song) return;
    const sp = 60 / this.song.def.bpm / 4;
    if (this.next < this.ac.currentTime - 0.3) this.next = this.ac.currentTime + 0.02;
    while (this.next < this.ac.currentTime + 0.12) {
      this.playStep(this.step, this.next, sp);
      this.next += sp; this.step = (this.step + 1) % this.song.steps;
    }
  },
  mf(m) { return 440 * Math.pow(2, (m - 69) / 12); },
  playStep(s, t, sp) {
    const S = this.song, def = S.def, d = this.bgmG;
    try {
      const n = S.leadMap[s];
      if (n) {
        const dur = n.len * sp * 0.92;
        this.osc(def.lead, this.mf(n.m), t, dur, def.lead === 'sawtooth' ? 0.045 : def.lead === 'triangle' ? 0.13 : 0.06, d);
        if (def.lead !== 'triangle') this.osc('triangle', this.mf(n.m), t, dur, 0.05, d);
      }
      const bar = Math.floor(s / 16), chord = def.prog[Math.floor(bar / 2) % def.prog.length];
      const pos = s % 16;
      if (pos % 2 === 0) {
        const bdeg = (pos % 8 === 4) ? chord + 4 : chord;
        this.osc('triangle', this.mf(S.toMidi(bdeg) - 12), t, sp * 1.8, 0.2, d);
      }
      if (def.arp) {
        const tones = [chord, chord + 2, chord + 4, chord + 7];
        this.osc('square', this.mf(S.toMidi(tones[pos % 4]) + 12), t, sp * 0.7, 0.018, d);
      }
      const dr = def.drum;
      if (dr) {
        if (pos === 0 || pos === 8 || (dr >= 2 && pos === 10) || (dr === 3 && pos === 14)) this.osc('sine', 150, t, 0.13, 0.42, d, 40);
        if (pos === 4 || pos === 12) this.noise(t, 0.12, dr === 1 ? 0.07 : 0.13, d, 1800, 'bandpass');
        if (pos % 2 === 0 || dr === 3) this.noise(t, 0.03, 0.035, d, 7000, 'highpass');
      }
    } catch (e) { }
  }
};

// ---------- セーブデータ ----------
const Store = {
  key: 'oniwana_save_v1',
  data: { slots: [null, null, null], opt: { bgm: true, se: true, shake: true } },
  load() {
    try {
      const s = localStorage.getItem(this.key);
      if (s) {
        const d = JSON.parse(s);
        if (d && Array.isArray(d.slots)) {
          this.data.slots = [0, 1, 2].map(i => (d.slots[i] && typeof d.slots[i] === 'object') ? d.slots[i] : null);
          Object.assign(this.data.opt, d.opt || {});
        }
      }
    } catch (e) { }
    SND.opt.bgm = !!this.data.opt.bgm; SND.opt.se = !!this.data.opt.se;
  },
  save() { try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { } }
};
// =====================================================================
//  ステージデータ  (25x19 タイル)
//  # 壁  . 空  ^v<> トゲ  = すり抜け床  I 氷  C 崩れる床  F 偽ブロック
//  H 隠しブロック  K/k コンベア(右/左)  T トランポリン  ~ 水
//  P スタート  S セーブ(全難易度)  s セーブ(NORMALのみ)  W ワープ  X 偽ワープ
//  g 宝石  O オーブ(空中ジャンプ回復)
// =====================================================================
const B25 = '#########################', E25 = '#.......................#';
const fill = (n, s) => Array(n).fill(s);
const WORLD_INFO = [null,
  { name: 'はじまりの草原', en: 'GRASSLAND' },
  { name: '氷結の洞窟', en: 'ICE CAVERN' },
  { name: '機械要塞', en: 'IRON FORTRESS' },
  { name: '灼熱の塔', en: 'BLAZING TOWER' },
  { name: '虚空の城', en: 'VOID CASTLE' }
];
const ROOMS = [
  // ---------------- WORLD 1 ----------------
  {
    id: '1-1', name: 'ようこそ地獄へ', w: 1,
    map: [B25, ...fill(14, E25),
      '#..............#........#',
      '#..............#........#',
      '#.P.......^^^..#..S...W.#',
      B25],
    ents: [
      { k: 'sign', x: 4, y: 17, text: 'ようこそ『鬼罠』へ！\n←→ / ◀▶ で移動\nSHIFT・SPACE / JUMP でジャンプ' },
      { k: 'sign', x: 13, y: 17, text: '空中でもう1回ジャンプできる！\n高い壁も二段ジャンプで越えろ' },
      { k: 'sign', x: 17, y: 17, text: 'セーブポイントは Z / SHOT で撃つと\nセーブできる。R でいつでもリトライ' },
      { k: 'fruit', x: 11, y: 9, trig: [8, 13, 2, 5], vy: 6 },
      { k: 'spike', x: 21, y: 18, dir: 'u', under: true, trig: [19, 14, 1, 4], vy: -4, stop: 32 }
    ]
  },
  {
    id: '1-2', name: 'チェリーの木', w: 1, gem: true,
    map: [B25, E25, E25, E25,
      '#g......................#',
      '#==.....................#',
      E25, E25,
      '#..==...................#',
      E25, E25,
      '#==.....................#',
      '#.........HH............#',
      E25,
      '#..==...................#',
      E25,
      '#.......##..##..##......#',
      '#P....^^^^^^^^^^^^^^^.W.#',
      B25],
    ents: [
      { k: 'sign', x: 3, y: 17, text: '上にも何かあるかも…？' },
      { k: 'fruit', x: 23, y: 15, trig: [14, 6, 2, 11], vx: -7 },
      { k: 'fruit', x: 4, y: 9, trig: [3, 11, 3, 4], ay: 0.5 }
    ]
  },
  {
    id: '1-3', name: '月の綺麗な夜に', w: 1, night: true,
    map: [B25, ...fill(6, E25),
      '#...W...................#',
      '#...#####...............#',
      E25, E25,
      '#...........=====.......#',
      E25, E25,
      '#..................######',
      '#..................######',
      '#P...........S.....######',
      '#######FFFF##############',
      '#######^^^^##############'],
    ents: [
      { k: 'sign', x: 3, y: 16, text: '今夜は月がきれいだ…' },
      { k: 'moon', x: 13, y: 1, sz: 4, trig: [12, 8, 5, 3], delay: 26, rumble: true, aim: 4.6 },
      { k: 'spike', x: 0, y: 7, dir: 'r', under: true, trig: [6, 5, 3, 3], vx: 4.5 }
    ]
  },
  {
    id: '1-4', name: 'トゲの階段', w: 1, gem: true,
    map: [B25, E25,
      '#.....................W.#',
      '#.................#######',
      '#...............HH......#',
      '#g............s.........#',
      '#==.........====........#',
      E25, E25,
      '#.....====..............#',
      E25, '#............S..........#',
      '#...........====........#',
      E25, E25,
      '#.....====..............#',
      E25,
      '#.P..^^^^^^^^^^^^^^^^^^^#',
      B25],
    ents: [
      { k: 'sign', x: 3, y: 17, text: '上を目指せ！' },
      { k: 'spike', x: 24, y: 11, dir: 'l', under: true, trig: [10, 10, 2, 5], vx: -8 },
      { k: 'spike', x: 7, y: 4, n: 2, dir: 'd', trig: [6, 5, 3, 4], ay: 0.6 }
    ]
  },
  {
    id: '1-5', name: '偽りのゴール', w: 1,
    map: [B25, ...fill(7, E25),
      '#................#####..#',
      E25, E25,
      '#..........##F#.........#',
      E25, E25,
      '#...#####...............#',
      E25, E25,
      '#P..........X..^^^^^^^..#',
      B25],
    ents: [
      { k: 'sign', x: 2, y: 17, text: 'ゴールはすぐそこだ！' },
      { k: 'sign', x: 17, y: 7, text: 'あのゴールは本物…？' },
      { k: 'warp', x: 6, y: 17, seq: [{ trig: [3, 15, 2, 3], to: [6, 13], spd: 6 }, { trig: [4, 11, 5, 3], to: [19, 7], spd: 7 }, { trig: [17, 5, 5, 3], to: [22, 17], spd: 7 }] },
      { k: 'fruit', x: 15, y: 14, trig: [22, 9, 2, 3], vx: 6 }
    ]
  },
  {
    id: 'BOSS', name: 'デリシャス大王', w: 1, boss: 1, nosolve: true,
    map: [B25, ...fill(12, E25),
      '#...===...........===...#',
      E25, E25, E25,
      '#P....................W.#',
      B25],
    ents: [{ k: 'boss', type: 1 }]
  },
  // ---------------- WORLD 2 ----------------
  {
    id: '2-1', name: 'すべる床', w: 2,
    map: [...fill(11, B25), ...fill(5, E25),
      '#P......s.............W.#',
      '##IIII..IIII...III..IIII#',
      '######^^####^^^###^^#####'],
    ents: [
      { k: 'sign', x: 3, y: 16, text: '氷の床はよくすべるぞ' },
      ...[7, 11, 14, 18, 21].map(c => ({ k: 'spike', x: c, y: 11, dir: 'd', trig: [c - 2, 11, 2, 6], ay: 0.7, brk: true }))
    ]
  },
  {
    id: '2-2', name: '崩れる氷橋', w: 2, gem: true,
    map: [B25, E25, E25, E25,
      '#............g..........#',
      E25,
      '#............O..........#',
      E25,
      '#............O..........#',
      E25, E25, E25, E25,
      '#P......s....S........W.#',
      '####CCCC#CCCC#CCCC#CC####',
      '####.................####',
      '####.................####',
      '####^^^^^^^^^^^^^^^^^####',
      B25],
    ents: [
      { k: 'sign', x: 2, y: 13, text: '止まると落ちるぞ\n水色のオーブは空中ジャンプを回復' },
      ...[[11, 9], [16, 14], [20, 19]].map(([c, t]) => ({ k: 'fruit', x: c, y: 16, under: true, trig: [t, 10, 1, 4], vy: -10, ay: 0.35 }))
    ]
  },
  {
    id: '2-3', name: '水中洞窟', w: 2, gem: true, water: [[6, 5, 13, 13]],
    map: [B25, E25, E25,
      '#P....................W.#',
      '######.............######',
      '######.....#F#.....######',
      '######.....#g#.....######',
      ...fill(6, '######....<###>....######'),
      '######.....vvv.....######',
      '######.............######',
      '######.............######',
      '######.............######',
      '######.s.^^^^^^^...######',
      B25],
    ents: [
      { k: 'sign', x: 3, y: 3, text: '水の中では何度でもジャンプできる' },
      { k: 'spike', x: 5, y: 9, dir: 'r', under: true, trig: [6, 8, 4, 1], vx: 3 },
      { k: 'fruit', x: 9, y: 15, path: [[9, 15], [16, 15]], spd: 2 },
      { k: 'fruit', x: 24, y: 3, under: true, trig: [15, 4, 4, 2], vx: -5 }
    ]
  },
  {
    id: '2-4', name: 'つらら回廊', w: 2, gem: true,
    map: [B25,
      '############g############',
      '############.############',
      E25, E25,
      '#W...................S..#',
      '#IIIIII..IIIIIIIIIIIII==#',
      '#######^^#############..#',
      '######################..#',
      '######################..#',
      '######################==#',
      '######################..#',
      '######################.s#',
      '######################==#',
      E25, E25,
      '#P......................#',
      '##########IIIIII#########',
      B25],
    ents: [
      { k: 'sign', x: 3, y: 16, text: '止まるな！走れ！' },
      ...Array.from({ length: 19 }, (_, i) => i + 3).map(c => ({ k: 'spike', x: c, y: 14, dir: 'd', trig: [2, 14, 1, 3], delay: (c - 3) * 11 + 20, ay: 0.9, brk: true, quiet: c > 3 })),
      ...[7, 12, 18].map(c => ({ k: 'spike', x: c, y: 17, dir: 'u', under: true, trig: [c - 2, 14, 1, 3], vy: -5, stop: 32 })),
      ...[19, 15, 11, 5].map(c => ({ k: 'spike', x: c, y: 3, dir: 'd', trig: [c + 1, 3, 1, 3], ay: 1.0, brk: true }))
    ]
  },
  {
    id: '2-5', name: '凍てつく縦穴', w: 2,
    map: [B25, E25, E25, E25, E25,
      '#P......^^....^^........#',
      '####################....#',
      E25, E25,
      '#..........^....^....S^^#',
      '#....####################',
      E25, E25,
      '#.s...^.....^....^......#',
      '#IIIIIIIIIIIIIIIIIII....#',
      E25, E25,
      '#W......^......^........#',
      B25],
    ents: [
      { k: 'sign', x: 3, y: 5, text: '下へ、下へ…' },
      { k: 'spike', x: 17, y: 1, n: 3, dir: 'd', trig: [16, 1, 1, 5], ay: 1.2, brk: true },
      { k: 'saw', x: 6, y: 9, sz: 1.15, path: [[6, 9], [18, 9]], spd: 2 },
      { k: 'spike', x: 12, y: 18, dir: 'u', under: true, trig: [14, 15, 1, 3], vy: -5, stop: 32 },
      { k: 'spike', x: 5, y: 18, dir: 'u', under: true, trig: [7, 15, 1, 3], vy: -5, stop: 32 }
    ]
  },
  // ---------------- WORLD 3 ----------------
  {
    id: '3-1', name: 'ベルトコンベア', w: 3,
    map: [B25, E25, E25, E25, E25,
      '#.................HH....#',
      E25,
      '#.....................W.#',
      '#...KKKKKKKKKKKKKK^^#####',
      '#.................##....#',
      '#>......................#',
      '#>......................#',
      '###kkkkkkkkkkkkkkkkkk...#',
      E25, E25,
      '#.....................###',
      '#P...................S..#',
      '####kkkkkkkkkkkkkkkkk####',
      B25],
    ents: [
      { k: 'sign', x: 2, y: 16, text: 'ベルトコンベアに逆らって進め' },
      { k: 'saw', x: 9, y: 13, path: [[9, 13], [9, 16]], spd: 2.5 },
      { k: 'saw', x: 15, y: 16, path: [[15, 16], [15, 13]], spd: 3 },
      { k: 'saw', x: 6, y: 11, path: [[6, 11], [16, 11]], spd: 2.5 },
      { k: 'saw', x: 5, y: 7, path: [[5, 7], [15, 7]], spd: 3 }
    ]
  },
  {
    id: '3-2', name: 'プレス工場', w: 3, gem: true,
    map: [B25,
      '############g.###########',
      ...fill(14, E25),
      '#P.....^...S...^.......W#',
      B25, B25],
    ents: [
      { k: 'sign', x: 2, y: 16, text: 'プレス機に注意\n…上に乗れたりしないかな？' },
      { k: 'crush', x: 3, y: 2, w: 2, h: 2, loop: true, seq: [{ trig: [3, 4, 2, 13], delay: 4, to: [3, 15], spd: 16, acc: 1.2 }, { delay: 40, to: [3, 2], spd: 2.2 }] },
      { k: 'crush', x: 9, y: 2, w: 2, h: 2, loop: true, seq: [{ delay: 40, to: [9, 15], spd: 16, acc: 1.2 }, { delay: 40, to: [9, 2], spd: 2.2 }] },
      { k: 'crush', x: 12, y: 2, w: 2, h: 2, loop: true, seq: [{ trig: [12, 4, 2, 13], delay: 10, to: [12, 15], spd: 16, acc: 1.2 }, { delay: 50, to: [12, 2], spd: 2 }] },
      { k: 'crush', x: 17, y: 2, w: 2, h: 2, loop: true, seq: [{ trig: [15, 4, 2, 13], to: [17, 15], spd: 16, acc: 1.3 }, { delay: 40, to: [17, 2], spd: 2.2 }] },
      { k: 'crush', x: 20, y: 2, w: 2, h: 2, loop: true, seq: [{ trig: [19, 4, 1, 13], to: [20, 15], spd: 16, acc: 2 }, { delay: 40, to: [20, 2], spd: 2.2 }] }
    ]
  },
  {
    id: '3-3', name: 'レーザー区画', w: 3,
    map: [B25, E25,
      '#.....................W.#',
      '#....................####',
      E25,
      '#...............s.......#',
      '#..............####.....#',
      E25, E25,
      '#........####...........#',
      E25, E25,
      '#..............####.....#',
      E25,
      '#.........S.............#',
      '#........####...........#',
      E25,
      '#P.....^^^^^^^^^^^^^^^^^#',
      B25],
    ents: [
      { k: 'sign', x: 3, y: 17, text: '光のリズムを読め' },
      { k: 'laser', x: 8, y: 1, dir: 'v', len: 16, per: 120, on: 40, off: 0 },
      { k: 'laser', x: 14, y: 1, dir: 'v', len: 16, per: 100, on: 35, off: 50 },
      { k: 'laser', x: 1, y: 11, dir: 'h', len: 23, per: 90, on: 28, off: 20 },
      { k: 'laser', x: 20, y: 1, dir: 'v', len: 16, per: 80, on: 30, off: 20 }
    ]
  },
  {
    id: '3-4', name: '動く足場', w: 3, gem: true, nosolve: true,
    map: [B25, ...fill(5, E25),
      '#.....................W.#',
      '#.....................###',
      E25, E25,
      '#..g....................#',
      '#.###...................#',
      ...fill(5, E25),
      '#P.^^^^^^^^^^^^^^^^^^^^^#',
      B25],
    ents: [
      { k: 'plat', x: 3, y: 15, w: 3, path: [[3, 15], [8, 15]], spd: 1.5 },
      { k: 'plat', x: 12, y: 15, w: 2, path: [[12, 15], [12, 9]], spd: 1.5 },
      { k: 'plat', x: 14, y: 6, w: 3, path: [[14, 6], [18, 6]], spd: 2 },
      { k: 'turret', x: 24, y: 13, ang: 180, per: 70, spd: 3.5, off: 30 },
      { k: 'turret', x: 16, y: 0, aim: true, per: 90, spd: 3, off: 60 }
    ]
  },
  {
    id: '3-5', name: '暴走ライン', w: 3,
    map: [B25, ...fill(12, E25),
      '#...........####........#',
      E25,
      '#.........#.............#',
      '#.........#.....#.......#',
      '#P....^^....^^^...^^...W#',
      B25],
    ents: [
      { k: 'sign', x: 3, y: 17, text: '振り返るな。逃げろ！！' },
      { k: 'spike', x: -1, y: 1, n: 17, dir: 'r', trig: [2, 1, 1, 17], vx: 2.25, body: true },
      { k: 'saw', x: 20, y: 13, path: [[20, 13], [20, 16]], spd: 3 },
      { k: 'crush', x: 7, y: 10, w: 2, h: 2, loop: true, seq: [{ delay: 30, to: [7, 16], spd: 14, acc: 1.2 }, { delay: 30, to: [7, 10], spd: 3 }] }
    ]
  },
  {
    id: 'BOSS', name: 'ギガ・クラッシャー', w: 3, boss: 2, nosolve: true,
    map: [B25, ...fill(11, E25),
      '#..===.............===..#',
      E25, E25, E25, E25,
      '#P....................W.#',
      B25],
    ents: [{ k: 'boss', type: 2 }]
  },
  // ---------------- WORLD 4 ----------------
  {
    id: '4-1', name: '跳ねる地獄', w: 4,
    map: [B25,
      '#..................Hvvvv#',
      E25,
      '#....................W..#',
      '#...................#####',
      E25,
      '#..............####.....#',
      E25, E25, E25, E25,
      '#..vvv....S.............#',
      '#........###T...........#',
      E25, E25, E25,
      '#P......................#',
      '####T^^T^^^^^^^^^^^^^^^^#',
      B25],
    ents: [{ k: 'sign', x: 2, y: 16, text: 'トランポリンで高く跳べ\n…どこに落ちるかは知らない' }]
  },
  {
    id: '4-2', name: '火炎砲台', w: 4, gem: true,
    map: [B25, E25, E25,
      '#g......................#',
      '###...............W.....#',
      '#.......####....#####...#',
      E25, E25,
      '#.###...................#',
      E25,
      '#........s..............#',
      '#.......###.............#',
      E25,
      '#..............S........#',
      '#.............###.......#',
      E25,
      '#.....................P.#',
      '#^^^^^^^^^^^^^^^^^^######',
      B25],
    ents: [
      { k: 'sign', x: 20, y: 16, text: '火の玉は跳んでかわせ' },
      { k: 'turret', x: 0, y: 13, ang: 0, per: 60, spd: 4, off: 40 },
      { k: 'turret', x: 24, y: 10, ang: 180, per: 75, spd: 4, off: 20 },
      { k: 'turret', x: 6, y: 0, aim: true, per: 80, spd: 3.5, off: 50 },
      { k: 'turret', x: 24, y: 4, ang: 180, per: 50, spd: 5, off: 10 }
    ]
  },
  {
    id: '4-3', name: 'マグマ上昇', w: 4,
    map: [B25, E25,
      '#......W................#',
      '#....#####..............#',
      E25, E25,
      '#...........####........#',
      E25, E25,
      '#.................====..#',
      '#...............HH......#',
      '#............S..........#',
      '#...........====........#',
      E25, E25,
      '#.....====..............#',
      E25,
      '#.P.....................#',
      B25],
    ents: [
      { k: 'sign', x: 4, y: 17, text: 'マグマが来る！急げ！' },
      { k: 'lava', y: 19, spd: 0.8, trig: 60, top: 4 },
      { k: 'spike', x: 20, y: 5, dir: 'd', trig: [19, 6, 3, 3], ay: 0.8 },
      { k: 'spike', x: 0, y: 5, dir: 'r', under: true, trig: [12, 4, 4, 2], vx: 5 }
    ]
  },
  {
    id: '4-4', name: '落ちる足場', w: 4, gem: true, nosolve: true,
    map: [B25, E25, E25,
      '#............g..........#',
      E25, E25,
      '#...........O...........#',
      E25,
      '#.....................W.#',
      '#....................####',
      E25,
      '#.P.....................#',
      '####....................#',
      ...fill(6, E25)],
    ents: [
      { k: 'sign', x: 1, y: 11, text: '足場は長くはもたない' },
      { k: 'fall', x: 5, y: 12, w: 2, delay: 15 },
      { k: 'fall', x: 9, y: 11, w: 2, delay: 15 },
      { k: 'fall', x: 13, y: 12, w: 2, delay: 2 },
      { k: 'fall', x: 17, y: 10, w: 2, delay: 15 },
      { k: 'spawn', per: 70, x0: 3, x1: 22, vy: 3 }
    ]
  },
  {
    id: '4-5', name: '灼熱の頂', w: 4,
    map: [B25, E25,
      '#..........W............#',
      '#.........####..........#',
      '#.............HH........#',
      E25,
      '#...............###.....#',
      E25, E25,
      '#....................####',
      E25,
      '#...............###.....#',
      '#...........S...........#',
      '#..........###..........#',
      E25,
      '#.....###...............#',
      '#P......................#',
      '####^^^^^^^^^^^^^^^^^^^^#',
      B25],
    ents: [
      { k: 'lava', y: 19, spd: 0.55, trig: 90, top: 4 },
      { k: 'laser', x: 5, y: 1, dir: 'v', len: 15, per: 110, on: 40, off: 0 },
      { k: 'laser', x: 15, y: 1, dir: 'v', len: 15, per: 90, on: 30, off: 30 },
      { k: 'laser', x: 20, y: 1, dir: 'v', len: 15, per: 100, on: 35, off: 60 },
      { k: 'laser', x: 1, y: 5, dir: 'h', len: 23, per: 80, on: 25, off: 10 }
    ]
  },
  // ---------------- WORLD 5 ----------------
  {
    id: '5-1', name: 'オーブの回廊', w: 5,
    map: [B25, E25, E25, E25,
      '#....################...#',
      '#....vvvvvvvvvvvvvvvv...#',
      E25, E25, E25,
      '#.P...O..O.....O..O...W.#',
      '####.................####',
      '#...........O...........#',
      ...fill(7, E25)],
    ents: [
      { k: 'sign', x: 3, y: 9, text: 'オーブを渡り歩け\n…すべてのオーブが味方とは限らない' },
      { k: 'orb', x: 12, y: 9, fake: true }
    ]
  },
  {
    id: '5-2', name: '裏切りの城', w: 5, gem: true,
    map: [B25, E25, E25, E25,
      '#.................#######',
      '#........HHH......FFFFg##',
      '#.................#######',
      '#W......................#',
      '##########F####F######..#',
      E25, E25,
      '#.....................###',
      E25, E25,
      '#...................##..#',
      E25,
      '#P....................S.#',
      '#####HHHHH.HHHH.HHHHFF###',
      '#####^^^^^^^^^^^^^^^^^###'],
    ents: [
      { k: 'sign', x: 3, y: 16, text: '見えない道を信じろ' },
      { k: 'sign', x: 17, y: 7, text: 'この先の床は本物です' },
      { k: 'sign', x: 12, y: 7, text: 'ジャンプは控えめにね' },
      { k: 'sign', x: 7, y: 7, text: 'ここにトゲはないよ' },
      { k: 'spike', x: 4, y: 8, dir: 'u', under: true, trig: [6, 6, 1, 2], vy: -4, stop: 32 }
    ]
  },
  {
    id: '5-3', name: '見つめる者', w: 5,
    map: [B25, E25, E25, E25,
      '#...........W...........#',
      '#.........#####.........#',
      E25, E25,
      '#...####.........####...#',
      E25, E25,
      '#.........#####.........#',
      E25, '#....s..................#',
      '#...####.........####...#',
      E25, E25,
      '#P......^^^^^^^^........#',
      B25],
    ents: [
      { k: 'sign', x: 3, y: 17, text: '何かに見られている…' },
      { k: 'spike', x: 23, y: 1, dir: 'l', trig: 40, home: 0.07, spd: 2.1, life: 900 },
      { k: 'spike', x: 1, y: 1, dir: 'r', trig: [10, 9, 5, 2], home: 0.08, spd: 2.4, life: 800 },
      { k: 'stalker', y: 1, spd: 2.4 }
    ]
  },
  {
    id: '5-4', name: '最後の試練Ⅰ', w: 5, gem: true,
    map: [B25, E25, E25,
      '#.....W.................#',
      '#...#####.............g.#',
      '#....................####',
      '#................O......#',
      '#.........####..........#',
      E25, E25,
      '#...............####....#',
      E25,
      '#.....................S.#',
      '#....................####',
      E25, E25,
      '#P......................#',
      '#####kkkkk^^KKKK^^#######',
      B25],
    ents: [
      { k: 'sign', x: 3, y: 16, text: '最後の試練が始まる' },
      { k: 'crush', x: 13, y: 9, w: 2, h: 2, loop: true, seq: [{ delay: 35, to: [13, 15], spd: 14, acc: 1.2 }, { delay: 30, to: [13, 9], spd: 3 }] },
      { k: 'laser', x: 19, y: 11, dir: 'v', len: 6, per: 90, on: 30, off: 0 },
      { k: 'fruit', x: 24, y: 9, under: true, trig: [16, 8, 4, 2], vx: -6 },
      { k: 'turret', x: 0, y: 1, aim: true, per: 70, spd: 3, off: 40 }
    ]
  },
  {
    id: '5-5', name: '最後の試練Ⅱ', w: 5,
    map: [B25, E25,
      '#......W................#',
      '#.....###...............#',
      E25, E25,
      '#..........###..........#',
      '#.............HH........#',
      E25,
      '#...............##......#',
      E25, E25,
      '#...................##..#',
      E25,
      '#...............S.......#',
      '#...............##......#',
      E25,
      '#...........P...........#',
      B25],
    ents: [
      { k: 'lava', style: 'spike', y: 19, spd: 0.9, trig: 90, top: 4 },
      { k: 'laser', x: 1, y: 8, dir: 'h', len: 23, per: 100, on: 30, off: 20 },
      { k: 'turret', x: 0, y: 11, ang: 0, per: 60, spd: 4, off: 30 },
      { k: 'spike', x: 20, y: 8, n: 2, dir: 'd', trig: [20, 10, 2, 2], ay: 0.7 },
      { k: 'spike', x: 23, y: 1, dir: 'l', trig: [11, 4, 3, 2], home: 0.07, spd: 2.3, life: 600 }
    ]
  },
  {
    id: 'FINAL', name: '鬼神', w: 5, boss: 3, nosolve: true,
    map: [B25, ...fill(8, E25),
      '#........=======........#',
      E25, E25, E25,
      '#...====.........====...#',
      E25, E25, E25,
      '#P..........W...........#',
      B25],
    ents: [{ k: 'boss', type: 3 }]
  }
];
const GEM_TOTAL = ROOMS.filter(r => r.gem).length;
// =====================================================================
//  ゲーム状態 & エンジン
// =====================================================================
const G = {
  scene: 'boot', t: 0, rt: 0, slot: -1, data: null, R: null, p: null,
  ents: [], solids: [], spawnQ: [], bullets: [], ebul: [], parts: [],
  shake: 0, deadT: 0, trans: null, card: null, msg: null, solver: false,
  menu: null, click: null, deathMsg: '', saveT: 0, flash: 0, endT: 0, boss: null
};
const SPK = { '^': 'u', 'v': 'd', '<': 'l', '>': 'r' };
const DEATH_MSGS = [
  'またトゲか…', '罠は見えない所にある', 'チェリーは食べ物じゃない', 'それ、本当に安全だった？',
  '深呼吸しよう', '覚えれば必ず越えられる', '今のは惜しかった！', '鬼はまだ笑っている',
  '月を信用するな', '床を疑え', 'R で即リトライ', '死んで覚えるゲームです'
];

// ---------- パーティクル ----------
function addPart(o) {
  if (G.solver) return;
  if (G.parts.length > 900) G.parts.splice(0, 50);
  const p = Object.assign({ x: 0, y: 0, vx: 0, vy: 0, g: 0.2, life: 40, sz: 3, col: '#fff', stick: false, fr: 0.98, glow: false }, o);
  p.max = p.life; G.parts.push(p);
}
function burst(x, y, n, col, spd, opt) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = Math.random() * spd;
    addPart(Object.assign({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, col: Array.isArray(col) ? col[i % col.length] : col, life: rndi(18, 45) }, opt || {}));
  }
}
function updParts() {
  const P = G.parts;
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i];
    if (p.stuck) continue;
    p.vx *= p.fr; p.vy += p.g; p.x += p.vx; p.y += p.vy;
    if (p.stick && solidAt(Math.floor(p.x / TS), Math.floor(p.y / TS))) { p.stuck = true; p.x -= p.vx; p.y -= p.vy; continue; }
    p.life--;
    if (p.life <= 0 || p.y > VH + 60) P.splice(i, 1);
  }
}

// ---------- 部屋の構築 ----------
function buildRoom(idx) {
  const def = ROOMS[idx];
  const R = {
    idx, def, w: def.w, g: [], cr: new Int16Array(COLS * ROWS), rev: new Uint8Array(COLS * ROWS),
    tramp: new Uint8Array(COLS * ROWS), water: (def.water || []).map(a => [a[0] * TS, a[1] * TS, a[2] * TS, a[3] * TS]),
    spawn: { x: 48, y: 576 }, defs: [], hasWaterTile: false, bg: null, tiles: null
  };
  const diff = G.data ? G.data.diff : 0;
  for (let y = 0; y < ROWS; y++) {
    const row = def.map[y] || E25;
    R.g[y] = [];
    for (let x = 0; x < COLS; x++) {
      let c = row[x] || '#';
      switch (c) {
        case 'P': R.spawn = { x: x * TS + TS / 2, y: (y + 1) * TS }; c = '.'; break;
        case 'S': case 's':
          if (!G.solver && ((c === 'S' && diff <= 1) || (c === 's' && diff === 0))) R.defs.push({ k: 'save', x, y });
          c = '.'; break;
        case 'W': R.defs.push({ k: 'warp', x, y }); c = '.'; break;
        case 'X': R.defs.push({ k: 'fwarp', x, y }); c = '.'; break;
        case 'g': R.defs.push({ k: 'gem', x, y }); c = '.'; break;
        case 'O': R.defs.push({ k: 'orb', x, y }); c = '.'; break;
        case '~': R.hasWaterTile = true; break;
      }
      R.g[y][x] = c;
    }
  }
  for (const d of def.ents || []) R.defs.push(d);
  return R;
}
const MOTION_KEYS = ['vx', 'vy', 'ax', 'ay', 'aim', 'to', 'home'];
function tOff(e) { return e.k === 'saw' ? TS / 2 - e.r : 0; }
function mkEnt(d) {
  const e = {
    k: d.k, d, x: (d.x || 0) * TS, y: (d.y || 0) * TS, w: TS, h: TS, vx: 0, vy: 0, ax: 0, ay: 0,
    vis: !d.hide, done: false, si: 0, ph: 'wait', tm: 0, mv: 0, t: 0, solid: false, kill: null, under: !!d.under, riding: 0
  };
  const sz = d.sz || 1;
  switch (d.k) {
    case 'spike': {
      const n = d.n || 1, s = TS * sz;
      e.n = n; e.s = s; e.dir = d.dir || 'u';
      if (e.dir === 'u' || e.dir === 'd') { e.w = n * s; e.h = s; } else { e.w = s; e.h = n * s; }
      e.kill = d.home ? 'home' : 'spike'; break;
    }
    case 'fruit': e.w = e.h = TS * sz; e.r = 11 * sz; e.kill = 'circle'; break;
    case 'moon': e.w = e.h = TS * sz; e.r = e.w / 2 - 6; e.kill = 'circle'; break;
    case 'saw': e.r = 15 * sz; e.w = e.h = e.r * 2; e.x = (d.x + 0.5) * TS - e.r; e.y = (d.y + 0.5) * TS - e.r; e.kill = 'circle'; break;
    case 'crush': e.w = (d.w || 2) * TS; e.h = (d.h || 2) * TS; e.solid = true; break;
    case 'plat': e.w = (d.w || 2) * TS; e.h = 16; e.solid = true; break;
    case 'fall': e.w = (d.w || 2) * TS; e.h = 16; e.solid = true; break;
    case 'warp': e.r = 13; if (G.R && G.R.def.boss) { e.vis = false; e.locked = true; } break;
    case 'fwarp': e.r = 13; break;
    case 'save': e.saved = 0; break;
    case 'orb': e.cd = 0; e.fake = !!d.fake; break;
    case 'gem': e.got = !!(G.data && G.data.gems && G.R && G.data.gems.includes(G.R.idx)); break;
    case 'lava': e.surf = (d.y || 19) * TS; e.active = false; break;
    case 'spawn': e.rng = mulberry32(4321); break;
    case 'stalker': e.w = e.h = 32; e.x = VW / 2 - 16; e.y = (d.y || 1) * TS; e.st = 'track'; e.kill = 'spike'; e.dir = 'd'; e.n = 1; e.s = 32; break;
    case 'turret': e.ang = (d.ang || 0) * Math.PI / 180; break;
    case 'boss': initBoss(e); break;
  }
  if (d.k === 'fall') e.steps = [{ trig: 'ride', delay: d.delay === undefined ? 15 : d.delay, ay: 0.45, max: 10 }];
  else if (d.seq) e.steps = d.seq;
  else if (MOTION_KEYS.some(k => d[k] !== undefined)) e.steps = [d];
  else e.steps = [];
  if (d.path) {
    const o = tOff(e);
    e.path = d.path.map(pt => [pt[0] * TS + o, pt[1] * TS + o]);
    e.pi = 1; e.spd = d.spd || 2;
  }
  return e;
}
function spawnEnt(d) { const e = mkEnt(d); e.bossSpawn = true; G.spawnQ.push(e); return e; }

function loadRoom(idx) {
  G.R = buildRoom(idx);
  G.rt = 0;
  G.ents = G.R.defs.map(mkEnt);
  G.spawnQ = []; G.bullets = []; G.ebul = []; G.parts = []; G.trans = null; G.solids = [];
  G.boss = G.ents.find(e => e.k === 'boss') || null;
  if (!G.solver) { renderRoomCache(); SND.play(roomSong(idx)); }
}
function roomSong(idx) {
  const d = ROOMS[idx];
  if (d.boss === 3) return 'final';
  if (d.boss) return 'boss';
  if (d.night) return 'w1n';
  return 'w' + d.w;
}

// ---------- タイル判定 ----------
function solidAt(tx, ty) {
  if (tx < 0 || tx >= COLS || ty < 0) return true;
  if (ty >= ROWS) return false;
  const c = G.R.g[ty][tx];
  switch (c) {
    case '#': case 'I': case 'K': case 'k': case 'T': case 'H': return true;
    case 'C': return G.R.cr[ty * COLS + tx] >= 0;
  }
  return false;
}
function collide(x, y, w, h, skip) {
  const x0 = Math.floor(x / TS), x1 = Math.floor((x + w - 0.001) / TS), y0 = Math.floor(y / TS), y1 = Math.floor((y + h - 0.001) / TS);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (solidAt(tx, ty)) {
      if (ty >= 0 && ty < ROWS && tx >= 0 && tx < COLS && G.R.g[ty][tx] === 'H' && !G.R.rev[ty * COLS + tx]) {
        G.R.rev[ty * COLS + tx] = 1;
        if (!G.solver) { SND.sfx('pop'); burst(tx * TS + 16, ty * TS + 16, 10, '#fff', 3, { g: 0, life: 18 }); }
      }
      return true;
    }
  }
  const S = G.solids;
  for (let i = 0; i < S.length; i++) {
    const s = S[i];
    if (s !== skip && x < s.x + s.w && x + w > s.x && y < s.y + s.h && y + h > s.y) return true;
  }
  return false;
}
function onewayAt(row, x, w) {
  if (row < 0 || row >= ROWS) return false;
  const x0 = Math.floor(x / TS), x1 = Math.floor((x + w - 0.001) / TS);
  for (let tx = x0; tx <= x1; tx++) if (tx >= 0 && tx < COLS && G.R.g[row][tx] === '=') return true;
  return false;
}
function pMoveX(p, dx, skip) {
  const s = Math.sign(dx); let rem = Math.abs(dx);
  while (rem > 0) {
    const st = Math.min(1, rem), nx = p.x + s * st;
    if (collide(nx, p.y, p.w, p.h, skip)) return true;
    p.x = nx; rem -= st;
  }
  return false;
}
function pMoveY(p, dy) {
  const s = Math.sign(dy); let rem = Math.abs(dy);
  while (rem > 0) {
    const st = Math.min(1, rem), ny = p.y + s * st;
    if (collide(p.x, ny, p.w, p.h, null)) return true;
    if (s > 0) {
      const b0 = p.y + p.h, b1 = ny + p.h, row = Math.floor(b1 / TS), top = row * TS;
      if (b0 <= top + 1e-6 && b1 > top && onewayAt(row, p.x, p.w)) { p.y = top - p.h; return true; }
    }
    p.y = ny; rem -= st;
  }
  return false;
}
function checkGround(p) {
  if (collide(p.x, p.y + 1, p.w, p.h, null)) return true;
  const b = p.y + p.h, row = Math.round(b / TS);
  return Math.abs(b - row * TS) < 0.01 && onewayAt(row, p.x, p.w);
}
function footInfo(p) {
  const row = Math.floor((p.y + p.h + 1) / TS), r = { ice: false, conv: 0, tramp: -1, crumble: [] };
  if (row < 0 || row >= ROWS) return r;
  const x0 = Math.floor(p.x / TS), x1 = Math.floor((p.x + p.w - 0.001) / TS);
  for (let tx = x0; tx <= x1; tx++) {
    if (tx < 0 || tx >= COLS) continue;
    const c = G.R.g[row][tx], i = row * COLS + tx;
    if (c === 'I') r.ice = true;
    else if (c === 'K') r.conv = 1;
    else if (c === 'k') r.conv = -1;
    else if (c === 'T') r.tramp = i;
    else if (c === 'C' && G.R.cr[i] === 0) r.crumble.push(i);
  }
  return r;
}
function inWater(p) {
  const R = G.R;
  for (const w of R.water) if (rectOv(p.x, p.y, p.w, p.h, w[0], w[1], w[2], w[3])) return true;
  if (R.hasWaterTile) {
    const x0 = Math.floor(p.x / TS), x1 = Math.floor((p.x + p.w - 0.001) / TS), y0 = Math.floor(p.y / TS), y1 = Math.floor((p.y + p.h - 0.001) / TS);
    for (let ty = Math.max(0, y0); ty <= Math.min(ROWS - 1, y1); ty++) for (let tx = Math.max(0, x0); tx <= Math.min(COLS - 1, x1); tx++) if (R.g[ty][tx] === '~') return true;
  }
  return false;
}
function tileHazard(p) {
  const x0 = Math.max(0, Math.floor(p.x / TS)), x1 = Math.min(COLS - 1, Math.floor((p.x + p.w - 0.001) / TS));
  const y0 = Math.max(0, Math.floor(p.y / TS)), y1 = Math.min(ROWS - 1, Math.floor((p.y + p.h - 0.001) / TS));
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const d = SPK[G.R.g[ty][tx]];
    if (d && triRect(spikeTri(tx * TS, ty * TS, TS, TS, d), p.x, p.y, p.w, p.h)) return true;
  }
  return false;
}

// ---------- プレイヤー ----------
function newPlayer(cx, by) {
  return {
    x: cx - PW / 2, y: by - PH, w: PW, h: PH, vx: 0, vy: 0, face: 1, onGround: false, wasGround: true,
    djump: true, co: 0, coMax: 5, jbuf: 0, jbMax: 6, cut: true, icy: false, water: false, dead: false,
    anim: 0, ev: 0, shootT: 0, tdead: false
  };
}
function physStep(p, inp) {
  p.ev = 0;
  const water = inWater(p);
  p.water = water;
  const dir = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
  if (dir) p.face = dir;
  const ground = p.onGround;
  const fi = ground ? footInfo(p) : null;
  if (ground) { p.co = p.coMax; p.djump = true; p.icy = fi.ice; }
  else if (p.co > 0) p.co--;
  const tv = dir * PHYS.speed;
  if (p.icy) p.vx += (tv - p.vx) * (ground ? 0.06 : 0.05); else p.vx = tv;
  if (inp.jp) p.jbuf = p.jbMax;
  if (p.jbuf > 0) {
    if (p.co > 0) { p.vy = -PHYS.jump1; p.co = 0; p.jbuf = 0; p.cut = false; p.ev |= 1; }
    else if (water) { p.vy = -PHYS.jump2; p.jbuf = 0; p.cut = false; p.ev |= 2; }
    else if (p.djump) { p.vy = -PHYS.jump2; p.djump = false; p.jbuf = 0; p.cut = false; p.ev |= 2; }
    else p.jbuf--;
  }
  if (!inp.jh && p.vy < 0 && !p.cut) { p.vy *= PHYS.cut; p.cut = true; }
  p.vy += PHYS.grav;
  const mf = water ? PHYS.waterFall : PHYS.maxFall;
  if (p.vy > mf) p.vy = mf;
  const conv = (ground && fi.conv) ? fi.conv * 1.6 : 0;
  const mx = p.vx + conv;
  if (mx !== 0 && pMoveX(p, mx, null) && p.icy) p.vx = 0;
  if (pMoveY(p, p.vy)) p.vy = 0;
  p.onGround = p.vy >= 0 && checkGround(p);
  if (p.onGround) {
    const f2 = footInfo(p);
    if (f2.tramp >= 0) {
      p.vy = -PHYS.tramp; p.onGround = false; p.djump = true; p.cut = true; p.co = 0; p.ev |= 4;
      G.R.tramp[f2.tramp] = 14;
    } else {
      for (const i of f2.crumble) G.R.cr[i] = 1;
      if (!p.wasGround) p.ev |= 8;
    }
  }
  p.wasGround = p.onGround;
  p.tdead = tileHazard(p) || p.y > VH + 10;
}
function isRiding(p, e) {
  return p && !p.dead && p.vy >= 0 && Math.abs(p.y + p.h - e.y) <= 1.5 && p.x + p.w > e.x && p.x < e.x + e.w;
}

// ---------- エンティティ更新 ----------
function trigOK(e, trig) {
  if (trig === undefined || trig === null) return true;
  if (typeof trig === 'number') return G.rt >= trig;
  if (trig === 'ride') return e.riding > 0;
  const p = G.p;
  if (!p || p.dead) return false;
  return rectOv(p.x, p.y, p.w, p.h, trig[0] * TS, trig[1] * TS, trig[2] * TS, trig[3] * TS);
}
function moveSolid(e, dx, dy) {
  const p = G.p, alive = p && !p.dead && !G.trans;
  const ride = alive && isRiding(p, e);
  e.x += dx; e.y += dy;
  if (!alive) return;
  if (ride) {
    if (dx) pMoveX(p, dx, e);
    p.y = e.y - p.h;
    if (collide(p.x, p.y, p.w, p.h, e)) killPlayer();
  } else if (rectOv(p.x, p.y, p.w, p.h, e.x, e.y, e.w, e.h)) {
    if (Math.abs(dy) >= Math.abs(dx)) {
      if (dy > 0) p.y = e.y + e.h; else { p.y = e.y - p.h; if (p.vy < 0) p.vy = 0; }
    } else {
      if (dx > 0) p.x = e.x + e.w; else p.x = e.x - p.w;
    }
    if (collide(p.x, p.y, p.w, p.h, null)) killPlayer();
  }
}
function applyMove(e, dx, dy) { if (e.solid) moveSolid(e, dx, dy); else { e.x += dx; e.y += dy; } }
function startStep(e, s) {
  e.vis = true; e.mv = 0;
  e.vx = s.vx || 0; e.vy = s.vy || 0; e.ax = s.ax || 0; e.ay = s.ay || 0;
  const p = G.p;
  if ((s.aim || s.home) && p) {
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2, px = p.x + p.w / 2, py = p.y + p.h / 2;
    const d = Math.hypot(px - cx, py - cy) || 1, sp = s.aim || s.spd || 2;
    e.vx = (px - cx) / d * sp; e.vy = (py - cy) / d * sp;
  }
  if (s.to) { e.tgx = s.to[0] * TS + tOff(e); e.tgy = s.to[1] * TS + tOff(e); e.cs = s.acc ? 0 : (s.spd || 4); }
  e.lifeT = 0;
}
function moveStep(e, s) {
  let dx, dy, fin = false;
  if (s.to) {
    if (s.acc) e.cs = Math.min(s.spd || 4, e.cs + s.acc);
    const ddx = e.tgx - e.x, ddy = e.tgy - e.y, dist = Math.hypot(ddx, ddy);
    if (dist <= e.cs || dist < 0.01) { dx = ddx; dy = ddy; fin = true; }
    else { dx = ddx / dist * e.cs; dy = ddy / dist * e.cs; }
  } else if (s.home) {
    const p = G.p, sp = s.spd || 2;
    let a = Math.atan2(e.vy, e.vx);
    if (p && !p.dead) {
      const ta = Math.atan2(p.y + p.h / 2 - (e.y + e.h / 2), p.x + p.w / 2 - (e.x + e.w / 2));
      let da = ta - a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      a += clamp(da, -s.home, s.home);
    }
    e.vx = Math.cos(a) * sp; e.vy = Math.sin(a) * sp; dx = e.vx; dy = e.vy;
    e.lifeT++;
    if (s.life && e.lifeT > s.life) { e.done = true; burst(e.x + e.w / 2, e.y + e.h / 2, 14, '#e8b8ff', 3, { g: 0 }); return; }
  } else {
    e.vx += e.ax; e.vy += e.ay;
    if (s.max) { const m = Math.hypot(e.vx, e.vy); if (m > s.max) { e.vx *= s.max / m; e.vy *= s.max / m; } }
    dx = e.vx; dy = e.vy;
    if (s.stop) {
      const d = Math.hypot(dx, dy);
      if (d > 0 && e.mv + d >= s.stop) { const k = (s.stop - e.mv) / d; dx *= k; dy *= k; fin = true; }
      e.mv += Math.hypot(dx, dy);
    }
  }
  applyMove(e, dx, dy);
  if (e.d.brk && !e.solid) {
    const cx = e.x + e.w / 2, by = e.dir === 'd' ? e.y + e.h - 6 : e.y + e.h / 2;
    if (by > 0 && solidAt(Math.floor(cx / TS), Math.floor(by / TS))) {
      e.done = true;
      burst(cx, by, 14, ['#e9f7ff', '#a8d4f5', '#ffffff'], 3.5, { g: 0.3, life: 25, sz: 3 });
      SND.sfx('crumble'); return;
    }
  }
  if (fin) {
    if (e.k === 'crush' && dy > 0) { SND.sfx('slam'); G.shake = Math.max(G.shake, 8); burst(e.x + e.w / 2, e.y + e.h, 16, '#bbb', 3, { g: 0.15, life: 22 }); }
    e.vx = e.vy = e.ax = e.ay = 0; e.si++; e.ph = 'wait';
    if (e.si >= e.steps.length && e.d.loop) e.si = 0;
  }
  if (!e.solid && (e.x > VW + 200 || e.x + e.w < -200 || e.y > VH + 200 || e.y + e.h < -500)) e.done = true;
  if (e.solid && e.y > VH + 100) e.done = true;
}
function updateEnt(e) {
  e.t++;
  switch (e.k) {
    case 'save': if (e.saved > 0) e.saved--; return;
    case 'orb': if (e.cd > 0) { e.cd--; if (e.cd === 0) burst(e.x + 16, e.y + 16, 8, '#8ff', 2, { g: 0, life: 16 }); } return;
    case 'sign': case 'gem': case 'fwarp': return;
    case 'laser': {
      const st = laserState(e);
      if (st === 2 && e.lst !== 2) SND.sfx('laser');
      e.lst = st; return;
    }
    case 'turret': updTurret(e); return;
    case 'lava': {
      const d = e.d;
      if (!e.active) { if (trigOK(e, d.trig)) { e.active = true; SND.sfx('rumble'); } else return; }
      const top = (d.top || 0) * TS;
      if (e.surf > top) e.surf = Math.max(top, e.surf - d.spd);
      return;
    }
    case 'spawn': {
      const d = e.d;
      if (G.rt > 20 && G.rt % d.per === 0) {
        const x = d.x0 + e.rng() * (d.x1 - d.x0);
        const n = mkEnt({ k: 'fruit', x, y: -1.2, vy: d.vy || 3 });
        G.spawnQ.push(n);
      }
      return;
    }
    case 'stalker': updStalker(e); return;
    case 'boss': updBoss(e); return;
  }
  if (e.done) return;
  if (e.solid) e.riding = isRiding(G.p, e) ? e.riding + 1 : 0;
  if (e.path) {
    const tg = e.path[e.pi], dx = tg[0] - e.x, dy = tg[1] - e.y, dist = Math.hypot(dx, dy);
    if (dist <= e.spd) { applyMove(e, dx, dy); e.pi = (e.pi + 1) % e.path.length; }
    else applyMove(e, dx / dist * e.spd, dy / dist * e.spd);
  }
  if (e.si < e.steps.length) {
    const s = e.steps[e.si];
    if (e.ph === 'wait' && trigOK(e, s.trig)) {
      e.ph = 'delay'; e.tm = 0;
      if (Array.isArray(s.trig) && !e.d.quiet && e.k !== 'crush') SND.sfx(e.k === 'warp' ? 'warp' : 'trap');
      if (e.d.rumble) SND.sfx('rumble');
    }
    if (e.ph === 'delay') {
      if (e.d.rumble) G.shake = Math.max(G.shake, 4);
      if (e.tm >= (s.delay || 0)) { e.ph = 'move'; startStep(e, s); } else e.tm++;
    }
    if (e.ph === 'move') moveStep(e, s);
  }
}
function laserState(e) {
  const d = e.d, t = (G.rt + (d.off || 0)) % d.per;
  if (t >= d.per - d.on) return 2;
  if (t >= d.per - d.on - 40) return 1;
  return 0;
}
function laserRect(e) {
  const d = e.d;
  return d.dir === 'v' ? [(d.x + 0.5) * TS - 5, d.y * TS, 10, d.len * TS] : [d.x * TS, (d.y + 0.5) * TS - 5, d.len * TS, 10];
}
function updTurret(e) {
  const d = e.d, cx = (d.x + 0.5) * TS, cy = (d.y + 0.5) * TS, p = G.p;
  if (d.aim && p && !p.dead) {
    const ta = Math.atan2(p.y + 10 - cy, p.x + 6 - cx);
    let da = ta - e.ang; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
    e.ang += clamp(da, -0.08, 0.08);
  }
  e.fireT = Math.max(0, (e.fireT || 0) - 1);
  if (G.rt > 10 && (G.rt + (d.off || 0)) % d.per === 0) {
    const c = Math.cos(e.ang), s = Math.sin(e.ang);
    G.ebul.push({ x: cx + c * 20, y: cy + s * 20, vx: c * d.spd, vy: s * d.spd, r: 6, col: 'fire', age: 0 });
    e.fireT = 8; SND.sfx('fire');
  }
}
function updStalker(e) {
  const p = G.p, d = e.d;
  switch (e.st) {
    case 'track':
      if (p && !p.dead) {
        const tx = p.x + p.w / 2 - 16;
        e.x += clamp(tx - e.x, -d.spd, d.spd);
        if (Math.abs(tx - e.x) < 4 && e.t > 70 && p.y > e.y + 40) { e.st = 'warn'; e.tm = 0; }
      }
      break;
    case 'warn': if (++e.tm > 18) { e.st = 'drop'; e.vy = 0; SND.sfx('trap'); } break;
    case 'drop': e.vy = Math.min(e.vy + 0.9, 14); e.y += e.vy; if (e.y > VH + 40) { e.st = 'back'; e.y = -40; } break;
    case 'back': e.y += 2; if (e.y >= d.y * TS) { e.y = d.y * TS; e.st = 'track'; e.t = 0; } break;
  }
}
function entHit(e, p) {
  if (!e.vis || e.done) return false;
  switch (e.kill) {
    case 'spike': {
      for (let i = 0; i < e.n; i++) {
        let x = e.x, y = e.y;
        if (e.dir === 'u' || e.dir === 'd') x += i * e.s; else y += i * e.s;
        if (triRect(spikeTri(x, y, e.s, e.s, e.dir), p.x, p.y, p.w, p.h)) return true;
      }
      return false;
    }
    case 'circle': return circRect(e.x + e.w / 2, e.y + e.h / 2, e.r, p.x, p.y, p.w, p.h);
    case 'home': return circRect(e.x + e.w / 2, e.y + e.h / 2, 10, p.x, p.y, p.w, p.h);
  }
  return false;
}
function playerEntInteract(p) {
  for (const e of G.ents) {
    if (e.done) continue;
    const cx = e.x + 16, cy = e.y + 16;
    switch (e.k) {
      case 'warp': if (e.vis && !e.locked && circRect(e.x + 16, e.y + 16, e.r, p.x, p.y, p.w, p.h)) enterWarp(); break;
      case 'fwarp': if (circRect(cx, cy, e.r, p.x, p.y, p.w, p.h)) killPlayer(); break;
      case 'orb':
        if (e.cd === 0 && circRect(cx, cy, 13, p.x, p.y, p.w, p.h)) {
          if (e.fake) killPlayer();
          else { p.djump = true; e.cd = 100; SND.sfx('orb'); burst(cx, cy, 14, ['#8ff', '#fff'], 3, { g: 0, life: 20 }); }
        }
        break;
      case 'gem': if (!e.got && circRect(cx, cy, 15, p.x, p.y, p.w, p.h)) collectGem(e); break;
      case 'laser': if (laserState(e) === 2) { const r = laserRect(e); if (rectOv(p.x, p.y, p.w, p.h, r[0], r[1], r[2], r[3])) killPlayer(); } break;
      case 'lava': if (e.active && p.y + p.h > e.surf + 6) killPlayer(); break;
      case 'boss': bossTouch(e, p); break;
      default: if (e.kill && entHit(e, p)) killPlayer();
    }
    if (p.dead || G.trans) return;
  }
  for (const b of G.ebul) if (circRect(b.x, b.y, b.r - 1, p.x, p.y, p.w, p.h)) { killPlayer(); return; }
}

// ---------- 弾 ----------
function shoot() {
  const p = G.p;
  if (G.bullets.length >= 4) return;
  G.bullets.push({ x: p.face > 0 ? p.x + p.w + 2 : p.x - 2, y: p.y + 11, vx: p.face * 11, life: 42 });
  p.shootT = 8; SND.sfx('shoot');
}
function updBullets() {
  for (const b of G.bullets) {
    b.x += b.vx; b.life--;
    if (b.life <= 0) b.dead = true;
    else if (solidAt(Math.floor(b.x / TS), Math.floor(b.y / TS))) { b.dead = true; burst(b.x, b.y, 4, '#ff8', 2, { g: 0, life: 10, sz: 2 }); }
    if (b.dead) continue;
    for (const e of G.ents) {
      if (e.k === 'save' && rectOv(b.x - 3, b.y - 3, 6, 6, e.x, e.y, TS, TS)) { doSave(e); b.dead = true; break; }
      if (e.k === 'boss' && !e.dead && e.st !== 'intro' && bossHitTest(e, b.x, b.y)) { bossDamage(e); b.dead = true; break; }
    }
  }
  G.bullets = G.bullets.filter(b => !b.dead);
  for (const b of G.ebul) {
    b.age = (b.age || 0) + 1;
    if (b.g) b.vy += b.g;
    b.x += b.vx; b.y += b.vy;
    if (b.col === 'fire' && b.age > 3 && solidAt(Math.floor(b.x / TS), Math.floor(b.y / TS))) { b.dead = true; burst(b.x, b.y, 6, ['#ff6a1a', '#ffd060'], 2, { g: 0, life: 12 }); }
    if (b.x < -40 || b.x > VW + 40 || b.y < -80 || b.y > VH + 40) b.dead = true;
  }
  G.ebul = G.ebul.filter(b => !b.dead);
}
function doSave(e) {
  const p = G.p;
  if (!p || p.dead || G.trans) return;
  const d = G.data;
  d.room = G.R.idx; d.sx = e.x + 16; d.sy = e.y + 32;
  e.saved = 50; SND.sfx('save'); Store.save();
  burst(e.x + 16, e.y + 16, 12, ['#7f7', '#fff'], 3, { g: 0, life: 20 });
}
function collectGem(e) {
  e.got = true;
  if (!G.data.gems.includes(G.R.idx)) G.data.gems.push(G.R.idx);
  Store.save(); SND.sfx('gem');
  burst(e.x + 16, e.y + 16, 30, ['#fff', '#ff6', '#6ff', '#f6f'], 4, { g: 0.05, life: 40 });
  G.msg = { text: '宝石を手に入れた！ (' + G.data.gems.length + '/' + GEM_TOTAL + ')', t: 150 };
}
function killPlayer() {
  const p = G.p;
  if (!p || p.dead || G.trans || G.solver) return;
  p.dead = true; G.deadT = 0;
  G.data.deaths++;
  G.data.roomDeaths = G.data.roomDeaths || {};
  G.data.roomDeaths[G.R.idx] = (G.data.roomDeaths[G.R.idx] || 0) + 1;
  Store.save();
  const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
  for (let i = 0; i < 90; i++) {
    const a = Math.random() * Math.PI * 2, s = Math.random() * 6 + 1;
    addPart({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2, g: 0.28, life: 2000, sz: rndi(2, 4), col: ['#c00010', '#ff2030', '#8a0010'][i % 3], stick: true, fr: 0.99 });
  }
  SND.sfx('death'); SND.setDuck(0.25);
  if (Store.data.opt.shake) G.shake = 12;
  G.flash = 6;
  G.deathMsg = DEATH_MSGS[Math.floor(Math.random() * DEATH_MSGS.length)];
}
function respawn() {
  const d = G.data;
  loadRoom(d.room);
  if (d.sx === null || d.sx === undefined) { d.sx = G.R.spawn.x; d.sy = G.R.spawn.y; }
  G.p = newPlayer(d.sx, d.sy);
  SND.setDuck(1);
}
function enterWarp() {
  if (G.trans || G.p.dead) return;
  G.trans = { t: 0, x: G.p.x + 6, y: G.p.y + 10 };
  SND.sfx('warp');
}
function updTrans() {
  const T = G.trans;
  T.t++;
  if (T.t === 40) {
    const next = G.R.idx + 1;
    if (next >= ROOMS.length) { finishGame(); return; }
    const pw = ROOMS[G.R.idx].w;
    G.data.room = next;
    loadRoom(next);
    G.data.sx = G.R.spawn.x; G.data.sy = G.R.spawn.y;
    G.p = newPlayer(G.data.sx, G.data.sy);
    G.data.maxRoom = Math.max(G.data.maxRoom || 0, next);
    Store.save();
    G.trans = { t: 41 };
    if (ROOMS[next].w !== pw) G.card = { t: 0, w: ROOMS[next].w };
  } else if (T.t >= 60) G.trans = null;
}
function finishGame() {
  G.data.clear = true; G.data.clears = (G.data.clears || 0) + 1;
  if (!G.data.best || G.data.time < G.data.best) G.data.best = G.data.time;
  G.data.room = 0; G.data.sx = null; G.data.sy = null;
  G.data.endDeaths = G.data.deaths; G.data.endTime = G.data.time;
  Store.save();
  G.trans = null; G.scene = 'ending'; G.endT = 0;
  SND.setDuck(1); SND.play('ending');
}
function updCrumble() {
  const cr = G.R.cr, tr = G.R.tramp;
  for (let i = 0; i < cr.length; i++) {
    const v = cr[i];
    if (tr[i] > 0) tr[i]--;
    if (v > 0) {
      cr[i] = v + 1;
      if (v + 1 >= 24) {
        cr[i] = -150; SND.sfx('crumble');
        burst((i % COLS) * TS + 16, Math.floor(i / COLS) * TS + 16, 12, ['#e9f7ff', '#a8d4f5', '#5f8fb8'], 3, { g: 0.35, life: 30 });
      }
    } else if (v < 0) {
      cr[i] = v + 1;
      if (cr[i] === 0) {
        const tx = i % COLS, ty = Math.floor(i / COLS), p = G.p;
        if (p && !p.dead && rectOv(p.x, p.y, p.w, p.h, tx * TS, ty * TS, TS, TS)) cr[i] = -1;
      }
    }
  }
}

// =====================================================================
//  ボス
// =====================================================================
const BOSS_DEF = {
  1: { name: 'デリシャス大王', hp: 28 },
  2: { name: 'ギガ・クラッシャー', hp: 36 },
  3: { name: '鬼神', hp: 60 }
};
function initBoss(e) {
  const t = e.d.type, D = BOSS_DEF[t];
  Object.assign(e, { type: t, name: D.name, hp: D.hp, max: D.hp, st: 'intro', tm: 0, cnt: 0, flash: 0, inv: 0, dead: false, deathT: 0, ph: 1, ang: 0 });
  if (t === 2) { e.bx = 352; e.by = -130; e.bw = 96; e.bh = 96; }
  else { e.cx = t === 1 ? 560 : 400; e.cy = -90; e.r = t === 1 ? 44 : 46; }
  e.x = 0; e.y = 0; e.w = 0; e.h = 0;
}
function bossCenter(e) { return e.type === 2 ? [e.bx + e.bw / 2, e.by + e.bh / 2] : [e.cx, e.cy]; }
function bossHitTest(e, x, y) {
  if (e.type === 2) return x > e.bx && x < e.bx + e.bw && y > e.by && y < e.by + e.bh;
  return Math.hypot(x - e.cx, y - e.cy) < e.r;
}
function bossTouch(e, p) {
  if (e.dead || e.st === 'intro') return;
  if (e.type === 2) { if (rectOv(p.x, p.y, p.w, p.h, e.bx + 4, e.by + 4, e.bw - 8, e.bh - 6)) killPlayer(); }
  else if (circRect(e.cx, e.cy, e.r - 5, p.x, p.y, p.w, p.h)) killPlayer();
}
function bossDamage(e) {
  if (e.inv > 0) { burst(...bossCenter(e), 3, '#888', 2, { g: 0, life: 8 }); return; }
  e.hp--; e.flash = 6; SND.sfx('hit');
  const [cx, cy] = bossCenter(e);
  burst(cx + rnd(-20, 20), cy + rnd(-20, 20), 5, ['#fff', '#ff6'], 3, { g: 0, life: 12 });
  if (e.type === 3) {
    const np = e.hp > 40 ? 1 : e.hp > 20 ? 2 : 3;
    if (np !== e.ph && e.hp > 0) {
      e.ph = np; e.inv = 70; G.ebul = []; G.flash = 10; G.shake = 14; SND.sfx('rumble');
      G.msg = { text: np === 2 ? '鬼神の怒りが増していく…！' : '鬼神が本気を出した！！', t: 120 };
      e.st = 'rise'; e.tm = 0;
    }
  }
  if (e.hp <= 0) {
    e.dead = true; e.deathT = 0; G.ebul = [];
    for (const x of G.ents) if (x.bossSpawn) x.done = true;
    SND.sfx('bossdie'); SND.stop(); G.shake = 20;
  }
}
function fan(cx, cy, n, spread, spd, col, r) {
  const p = G.p; if (!p) return;
  const base = Math.atan2(p.y + 10 - cy, p.x + 6 - cx);
  for (let i = 0; i < n; i++) {
    const a = base + (n > 1 ? (i / (n - 1) - 0.5) * spread : 0);
    G.ebul.push({ x: cx, y: cy, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: r || 7, col: col || 'orb' });
  }
}
function ringShot(cx, cy, n, spd, off, col) {
  for (let i = 0; i < n; i++) {
    const a = off + i / n * Math.PI * 2;
    G.ebul.push({ x: cx, y: cy, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: 7, col: col || 'orb' });
  }
}
function updBoss(e) {
  if (e.flash > 0) e.flash--;
  if (e.inv > 0) e.inv--;
  const p = G.p, px = p ? p.x + 6 : 400;
  if (e.dead) {
    e.deathT++;
    const [cx, cy] = bossCenter(e);
    if (e.deathT % 6 === 0 && e.deathT < 110) {
      burst(cx + rnd(-50, 50), cy + rnd(-50, 50), 16, ['#fff', '#ff6', '#f80', '#f22'], 5, { g: 0.05, life: 30 });
      SND.sfx('slam'); G.shake = Math.max(G.shake, 6);
    }
    if (e.deathT === 120) {
      burst(cx, cy, 80, ['#fff', '#ff6', '#f80'], 9, { g: 0.08, life: 50 });
      G.flash = 14; e.gone = true;
      for (const w of G.ents) if (w.k === 'warp') { w.vis = true; w.locked = false; }
      SND.sfx('clear');
      G.msg = { text: e.type === 3 ? '鬼神を討ち果たした！' : e.name + ' を倒した！', t: 200 };
      SND.play(e.type === 3 ? 'ending' : 'w' + G.R.w);
    }
    return;
  }
  e.tm++;
  if (e.type === 1) bossCherry(e, px);
  else if (e.type === 2) bossCrusher(e, px);
  else bossOni(e, px);
}
function bossCherry(e, px) {
  const ground = 576 - e.r, p2 = e.hp <= e.max / 2;
  switch (e.st) {
    case 'intro':
      e.cy += 6;
      if (e.cy >= ground) { e.cy = ground; G.shake = 12; SND.sfx('slam'); e.st = 'roar'; e.tm = 0; }
      break;
    case 'roar': if (e.tm > 70) { e.st = 'wait'; e.tm = 0; } break;
    case 'wait':
      if (e.tm > (p2 ? 16 : 26)) {
        if (e.cnt >= 3) { e.cnt = 0; e.st = 'fire'; e.tm = 0; e.vol = 0; }
        else {
          e.st = 'air'; e.vy = -(9 + (p2 ? 1.5 : 0) + Math.random() * 1.5);
          e.vx = Math.sign(px - e.cx || 1) * (2.2 + Math.random() * 1.2) * (p2 ? 1.35 : 1); e.cnt++;
        }
      }
      break;
    case 'air':
      e.vy += 0.38; e.cx += e.vx; e.cy += e.vy;
      if (e.cx < 32 + e.r) { e.cx = 32 + e.r; e.vx = Math.abs(e.vx); }
      if (e.cx > 768 - e.r) { e.cx = 768 - e.r; e.vx = -Math.abs(e.vx); }
      if (e.cy >= ground) {
        e.cy = ground; e.st = 'wait'; e.tm = 0; G.shake = Math.max(G.shake, 6); SND.sfx('slam');
        burst(e.cx, 576, 14, '#8b5a2b', 3, { g: 0.2, life: 20 });
        if (p2) for (const s of [-1, 1]) G.ebul.push({ x: e.cx + s * 30, y: ground, vx: s * 2.6, vy: -6, g: 0.25, r: 7, col: 'cherry' });
      }
      break;
    case 'fire':
      if (e.tm % 34 === 1 && e.vol < 3) { fan(e.cx, e.cy - 10, p2 ? 7 : 5, 1.1, 3.6, 'cherry', 8); e.vol++; SND.sfx('fire'); }
      if (e.tm > 115) { e.st = p2 ? 'rain' : 'wait'; e.tm = 0; }
      break;
    case 'rain':
      if (e.tm % 8 === 0 && e.tm <= 96) G.ebul.push({ x: rnd(48, 752), y: -10, vx: 0, vy: rnd(3, 4.5), r: 8, col: 'cherry' });
      if (e.tm > 110) { e.st = 'wait'; e.tm = 0; }
      break;
  }
}
function bossCrusher(e, px) {
  const floorY = 576 - e.bh, p2 = e.hp <= e.max / 2, cx = e.bx + e.bw / 2, cy = e.by + e.bh / 2;
  switch (e.st) {
    case 'intro': e.by += 3; if (e.by >= 64) { e.by = 64; e.st = 'roar'; e.tm = 0; G.shake = 8; SND.sfx('slam'); } break;
    case 'roar': if (e.tm > 60) { e.st = 'track'; e.tm = 0; } break;
    case 'track': {
      const sp = p2 ? 5 : 3.5;
      e.bx = clamp(e.bx + clamp(px - 48 - e.bx, -sp, sp), 32, 768 - e.bw);
      if (e.tm > (p2 ? 50 : 70)) { e.st = 'warn'; e.tm = 0; }
      break;
    }
    case 'warn': G.shake = Math.max(G.shake, 2); if (e.tm > 18) { e.st = 'slam'; e.vy = 0; } break;
    case 'slam':
      e.vy = Math.min(e.vy + 1.2, 18); e.by += e.vy;
      if (e.by >= floorY) {
        e.by = floorY; G.shake = 14; SND.sfx('slam'); e.st = 'rest'; e.tm = 0; e.cnt++;
        burst(cx, 576, 24, '#aaa', 4, { g: 0.2, life: 24 });
        const sp = p2 ? 5 : 4;
        spawnEnt({ k: 'spike', x: (e.bx - 32) / TS, y: 17, dir: 'u', vx: -sp });
        spawnEnt({ k: 'spike', x: (e.bx + e.bw) / TS, y: 17, dir: 'u', vx: sp });
        if (p2) for (let i = 0; i < 4; i++) spawnEnt({ k: 'spike', x: rndi(1, 23), y: 1, dir: 'd', delay: 26, ay: 0.5 });
      }
      break;
    case 'rest': if (e.tm > (p2 ? 40 : 55)) { e.st = 'rise'; e.tm = 0; } break;
    case 'rise':
      e.by -= 3;
      if (e.by <= 64) { e.by = 64; e.tm = 0; if (e.cnt >= 3) { e.cnt = 0; e.st = 'barrage'; } else e.st = 'track'; }
      break;
    case 'barrage':
      e.bx += clamp(352 - e.bx, -4, 4);
      if (e.tm % 40 === 20) { ringShot(cx, cy, p2 ? 16 : 12, 3, e.tm * 0.01, 'orb'); SND.sfx('fire'); }
      if (e.tm > (p2 ? 170 : 130)) { e.st = 'track'; e.tm = 0; }
      break;
  }
}
function bossOni(e, px) {
  const ph = e.ph;
  switch (e.st) {
    case 'intro': e.cy += 3; if (e.cy >= 200) { e.cy = 200; e.st = 'roar'; e.tm = 0; G.shake = 10; SND.sfx('rumble'); } break;
    case 'roar': if (e.tm > 80) { e.st = 'float'; e.tm = 0; } break;
    case 'float': {
      e.ang += 0.011 + ph * 0.003;
      const tx = 400 + Math.sin(e.ang) * 260, ty = 215 + Math.sin(e.ang * 2) * 60;
      e.cx += (tx - e.cx) * 0.08; e.cy += (ty - e.cy) * 0.08;
      if (e.tm % (ph === 1 ? 80 : ph === 2 ? 64 : 50) === 0) { fan(e.cx, e.cy, ph + 4, 0.9, 3.3 + ph * 0.35, 'oni', 7); SND.sfx('fire'); }
      if (ph === 3 && e.tm % 90 === 45) for (let i = 0; i < 3; i++) spawnEnt({ k: 'spike', x: rndi(1, 23), y: 1, dir: 'd', delay: 28, ay: 0.55 });
      if (ph >= 2 && e.tm === 120) { e.st = 'spiral'; e.tm = 0; }
      else if (e.tm >= (ph === 3 ? 210 : 300)) { e.st = 'dprep'; e.tm = 0; e.side = (G.p && G.p.x < 400) ? 1 : -1; }
      break;
    }
    case 'spiral':
      e.cx += (400 - e.cx) * 0.06; e.cy += (195 - e.cy) * 0.06;
      if (e.tm > 20 && e.tm % 4 === 0) {
        const arms = ph === 3 ? 3 : 2, a = e.tm * 0.13;
        for (let k = 0; k < arms; k++) {
          const aa = a + k * Math.PI * 2 / arms;
          G.ebul.push({ x: e.cx, y: e.cy, vx: Math.cos(aa) * 2.7, vy: Math.sin(aa) * 2.7, r: 6, col: 'oni' });
        }
      }
      if (e.tm % 30 === 0) G.ebul.push({ x: rnd(48, 752), y: -10, vx: 0, vy: rnd(3, 4), r: 8, col: 'cherry' });
      if (e.tm > 170) { e.st = 'float'; e.tm = 130; }
      break;
    case 'dprep': {
      const tx = e.side > 0 ? 715 : 85;
      e.cx += (tx - e.cx) * 0.1; e.cy += (522 - e.cy) * 0.1;
      if (e.tm > 62) { e.st = 'dash'; e.tm = 0; e.vx = -e.side * (8.5 + ph); SND.sfx('trap'); }
      break;
    }
    case 'dash':
      e.cx += e.vx;
      if (e.tm % 6 === 0) burst(e.cx, e.cy, 4, ['#f4f', '#a0f'], 2, { g: 0, life: 16 });
      if (e.cx < 60 || e.cx > 740) { e.st = 'rise'; e.tm = 0; }
      break;
    case 'rise':
      e.cy += (215 - e.cy) * 0.06; e.cx += (400 - e.cx) * 0.03;
      if (e.tm > 50) { e.st = 'float'; e.tm = 0; e.ang = Math.asin(clamp((e.cx - 400) / 260, -1, 1)); }
      break;
  }
}

// =====================================================================
//  ソルバー (全ステージ到達可能性チェック用・ゲーム中は未使用)
// =====================================================================
function solveRoom(idx, goal, limit) {
  const prevData = G.data;
  G.solver = true; G.data = { diff: 2, gems: [] };
  G.R = buildRoom(idx);
  G.ents = G.R.defs.filter(d => d.k === 'orb').map(mkEnt);
  G.solids = []; G.rt = 0;
  const p = newPlayer(G.R.spawn.x, G.R.spawn.y);
  p.coMax = 1; p.jbMax = 1;
  for (let i = 0; i < 4; i++) physStep(p, {});
  const orbs = G.ents;
  const save = q => [q.x, q.y, q.vx, q.vy, q.djump, q.cut, q.icy, q.onGround, q.wasGround];
  const load = s => { p.x = s[0]; p.y = s[1]; p.vx = s[2]; p.vy = s[3]; p.djump = s[4]; p.cut = s[5]; p.icy = s[6]; p.onGround = s[7]; p.wasGround = s[8]; p.co = 0; p.jbuf = 0; p.dead = false; };
  const key = q => {
    const kx = Math.round(q.x / 3), ky = Math.round(q.y / 3) + 80, kvy = Math.round(q.vy * 1.25) + 40, kvx = q.icy ? Math.round(q.vx * 2) + 20 : 0;
    return ((((kx * 900 + ky) * 100 + kvy) * 50 + kvx) * 2 + (q.djump ? 1 : 0)) * 4 + (q.vy < 0 && !q.cut ? 2 : 0) + (q.onGround ? 1 : 0);
  };
  const seen = new Set([key(p)]);
  const gx = goal[0] + goal[2] / 2, gy = goal[1] + goal[3] / 2;
  const B = [], bk = q => Math.floor(Math.hypot(q.x + 6 - gx, q.y + 10 - gy) / 6);
  let minB = bk(p); B[minB] = [save(p)];
  let found = false, cnt = 0;
  const lim = limit || 1500000;
  while (!found && seen.size < lim) {
    while (minB < B.length && (!B[minB] || !B[minB].length)) minB++;
    if (minB >= B.length) break;
    const s = B[minB].pop(); cnt++;
    for (let dir = -1; dir <= 1 && !found; dir++) for (let j = 0; j < 3; j++) {
      load(s);
      const canJump = p.onGround || p.djump || inWater(p);
      if (j === 1 && !canJump) continue;
      if (j === 2 && !(p.vy < 0 && !p.cut)) continue;
      physStep(p, { l: dir < 0, r: dir > 0, jp: j === 1, jh: j >= 1 });
      if (p.tdead) continue;
      let dead = false;
      for (const o of orbs) if (circRect(o.x + 16, o.y + 16, 13, p.x, p.y, p.w, p.h)) { if (o.fake) dead = true; else p.djump = true; }
      if (dead) continue;
      if (rectOv(p.x, p.y, p.w, p.h, goal[0], goal[1], goal[2], goal[3])) { found = true; break; }
      const k = key(p);
      if (seen.has(k)) continue;
      seen.add(k);
      const b = bk(p); (B[b] || (B[b] = [])).push(save(p)); if (b < minB) minB = b;
    }
  }
  G.solver = false; G.data = prevData;
  return { found, states: seen.size };
}
// =====================================================================
//  描画
// =====================================================================
const WP = [null,
  { sky: ['#4aa6f5', '#c4ebff'], night: ['#060a24', '#28306a'], blk: '#8b5a2b', lt: '#b07a42', dk: '#5a3a1a', top: '#3fbf3f', topLt: '#8ee88e', spk: '#eceef6', spkDk: '#9aa0b5', plat: '#c89a60' },
  { sky: ['#050d22', '#1f4a72'], blk: '#58819f', lt: '#9cc7e6', dk: '#2f5274', top: '#eef9ff', topLt: '#ffffff', spk: '#dcf6ff', spkDk: '#7fb4d6', plat: '#9cc7e6' },
  { sky: ['#0c1014', '#262d36'], blk: '#56606c', lt: '#8995a3', dk: '#2c3239', top: '#f0a020', topLt: '#ffd060', spk: '#e4e8ee', spkDk: '#8890a0', plat: '#8a96a3' },
  { sky: ['#1e0303', '#7a2008'], blk: '#5a2a1a', lt: '#86452a', dk: '#2a1008', top: '#ff6a1a', topLt: '#ffc070', spk: '#ffe6c0', spkDk: '#c06030', plat: '#a0583a' },
  { sky: ['#04020c', '#2a0f45'], blk: '#3a2a5a', lt: '#6a54a0', dk: '#1a1030', top: '#c070ff', topLt: '#ecc4ff', spk: '#f4ecff', spkDk: '#9a80c8', plat: '#6a54a0' }
];
const hash2 = (a, b) => (((a * 73856093) ^ (b * 19349663)) >>> 0) % 1000 / 1000;
function mkCanvas() { const c = document.createElement('canvas'); c.width = VW; c.height = VH; return c; }
function poly(c, pts) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); c.fill(); }
function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, Math.max(0, r), 0, Math.PI * 2); c.fill(); }
function rrect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function txt(s, x, y, size, col, align, outline) {
  ctx.font = size + 'px ' + FONT; ctx.textAlign = align || 'left'; ctx.textBaseline = 'top';
  if (outline) { ctx.lineWidth = outline; ctx.strokeStyle = '#000'; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
  ctx.fillStyle = col || '#fff'; ctx.fillText(s, x, y);
}
function drawSpike(c, px, py, w, h, dir, col, dk) {
  const t = spikeTri(px, py, w, h, dir, 0);
  c.fillStyle = col; poly(c, t);
  let half;
  switch (dir) {
    case 'u': half = [t[2], t[3], t[4], t[5], px + w / 2, py + h]; break;
    case 'd': half = [px + w / 2, py, t[2], t[3], t[4], t[5]]; break;
    case 'l': half = [t[2], t[3], t[4], t[5], px + w, py + h / 2]; break;
    default: half = [t[2], t[3], t[4], t[5], px, py + h / 2];
  }
  c.fillStyle = dk; poly(c, half);
  c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(t[0], t[1]); c.lineTo(t[2], t[3]); c.lineTo(t[4], t[5]); c.closePath(); c.stroke();
}
function drawBlock(c, px, py, w, topOpen, tx, ty, tint) {
  const pal = WP[w], r = hash2(tx, ty);
  c.fillStyle = pal.blk; c.fillRect(px, py, TS, TS);
  switch (w) {
    case 1:
      for (let i = 0; i < 4; i++) {
        c.fillStyle = i % 2 ? pal.dk : pal.lt;
        c.fillRect(px + 3 + Math.floor((r * 97 + i * 11) * 7) % 25, py + 9 + Math.floor((r * 53 + i * 17) * 5) % 20, 3, 2);
      }
      break;
    case 2:
      c.fillStyle = pal.dk; c.fillRect(px, py + 15, TS, 2);
      c.fillRect(px + (ty % 2 ? 8 : 22), py, 2, 15); c.fillRect(px + (ty % 2 ? 22 : 8), py + 17, 2, 15);
      c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(px + 2, py + 2, 12, 3);
      break;
    case 3:
      c.fillStyle = pal.lt; c.fillRect(px + 2, py + 2, 28, 28);
      c.fillStyle = pal.blk; c.fillRect(px + 4, py + 4, 25, 25);
      c.fillStyle = pal.dk; for (const [a, b] of [[5, 5], [25, 5], [5, 25], [25, 25]]) c.fillRect(px + a, py + b, 2, 2);
      break;
    case 4:
      c.strokeStyle = 'rgba(255,110,30,.55)'; c.lineWidth = 1.5; c.beginPath();
      c.moveTo(px + 4 + r * 10, py + 6); c.lineTo(px + 14, py + 16 + r * 6); c.lineTo(px + 26 - r * 6, py + 28); c.stroke();
      c.fillStyle = pal.dk; c.fillRect(px + 20 * r + 3, py + 5, 4, 3);
      break;
    case 5:
      c.fillStyle = pal.dk; c.fillRect(px, py + 15, TS, 2); c.fillRect(px, py + 31, TS, 1);
      c.fillRect(px + (ty % 2 ? 0 : 15), py, 2, 15); c.fillRect(px + (ty % 2 ? 15 : 0), py + 17, 2, 15);
      c.fillStyle = 'rgba(255,255,255,.07)'; c.fillRect(px + 3, py + 2, 10, 2);
      break;
  }
  c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(px + TS - 2, py, 2, TS); c.fillRect(px, py + TS - 2, TS, 2);
  if (topOpen) {
    switch (w) {
      case 1:
        c.fillStyle = pal.top; c.fillRect(px, py, TS, 7);
        for (let i = 0; i < 4; i++) c.fillRect(px + i * 8 + 2 + Math.floor(r * 4), py + 7, 3, 2 + ((i + tx) % 2) * 2);
        c.fillStyle = pal.topLt; c.fillRect(px, py, TS, 2); break;
      case 2:
        c.fillStyle = pal.top; c.fillRect(px, py, TS, 6);
        c.fillRect(px + 4 + Math.floor(r * 8), py + 6, 8, 3); c.fillRect(px + 20, py + 6, 5, 2); break;
      case 3:
        for (let i = 0; i < 4; i++) { c.fillStyle = i % 2 ? '#222' : pal.top; c.fillRect(px + i * 8, py, 8, 4); } break;
      case 4:
        c.fillStyle = pal.top; c.fillRect(px, py, TS, 3); c.fillStyle = 'rgba(255,140,40,.35)'; c.fillRect(px, py + 3, TS, 4); break;
      case 5:
        c.fillStyle = pal.top; c.fillRect(px, py, TS, 2); c.fillStyle = 'rgba(192,112,255,.25)'; c.fillRect(px, py + 2, TS, 4); break;
    }
  }
  if (tint) { c.strokeStyle = tint; c.lineWidth = 2; c.strokeRect(px + 1, py + 1, TS - 2, TS - 2); }
}
function drawIce(c, px, py) {
  const g = c.createLinearGradient(px, py, px + TS, py + TS);
  g.addColorStop(0, '#d8f6ff'); g.addColorStop(1, '#6fc6f0');
  c.fillStyle = g; c.fillRect(px, py, TS, TS);
  c.fillStyle = 'rgba(255,255,255,.7)'; poly(c, [px + 4, py + 26, px + 18, py + 4, px + 22, py + 4, px + 8, py + 26]);
  c.strokeStyle = '#3c9ad0'; c.lineWidth = 1; c.strokeRect(px + 0.5, py + 0.5, TS - 1, TS - 1);
}
function drawBG(c, R) {
  const w = R.w, pal = WP[w], rng = mulberry32(R.idx * 977 + 5);
  const sky = (w === 1 && R.def.night) ? pal.night : pal.sky;
  const g = c.createLinearGradient(0, 0, 0, VH); g.addColorStop(0, sky[0]); g.addColorStop(1, sky[1]);
  c.fillStyle = g; c.fillRect(0, 0, VW, VH);
  if (w === 1) {
    if (R.def.night) {
      for (let i = 0; i < 110; i++) { c.fillStyle = `rgba(255,255,255,${0.3 + rng() * 0.7})`; c.fillRect(rng() * VW, rng() * VH * 0.75, rng() < 0.15 ? 2 : 1, rng() < 0.15 ? 2 : 1); }
      c.fillStyle = '#121a36'; for (let i = 0; i < 6; i++) circle(c, i * 160 + rng() * 60, VH - 40, 140 + rng() * 60);
    } else {
      c.fillStyle = 'rgba(255,255,255,.85)';
      for (let i = 0; i < 6; i++) { const x = rng() * VW, y = 40 + rng() * 220; for (let j = 0; j < 4; j++) circle(c, x + j * 18, y + (j % 2) * -8, 16 + rng() * 8); }
      c.fillStyle = '#86d27a'; for (let i = 0; i < 6; i++) circle(c, i * 170 + rng() * 60, VH + 20, 170 + rng() * 60);
      c.fillStyle = '#5bb352'; for (let i = 0; i < 8; i++) circle(c, i * 120 + rng() * 40, VH + 60, 120 + rng() * 40);
    }
  } else if (w === 2) {
    for (let i = 0; i < 26; i++) {
      const x = rng() * VW, y = rng() * VH, s = 20 + rng() * 50;
      c.fillStyle = `rgba(140,210,255,${0.05 + rng() * 0.08})`; poly(c, [x, y - s, x + s * 0.35, y, x, y + s * 0.4, x - s * 0.35, y]);
    }
    c.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < 30; i++) { const x = rng() * VW, l = 30 + rng() * 80; poly(c, [x - 10, 0, x + 10, 0, x, l]); }
  } else if (w === 3) {
    c.strokeStyle = 'rgba(255,255,255,.035)'; c.lineWidth = 1;
    for (let x = 0; x < VW; x += 64) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, VH); c.stroke(); }
    for (let y = 0; y < VH; y += 64) { c.beginPath(); c.moveTo(0, y); c.lineTo(VW, y); c.stroke(); }
    for (let i = 0; i < 5; i++) {
      const y = 60 + rng() * 480; c.fillStyle = 'rgba(120,140,160,.12)'; c.fillRect(0, y, VW, 12);
      for (let x = 40; x < VW; x += 160) c.fillRect(x, y - 3, 10, 18);
    }
    for (let i = 0; i < 5; i++) {
      const x = rng() * VW, y = rng() * VH, r = 30 + rng() * 40;
      c.strokeStyle = 'rgba(160,170,190,.08)'; c.lineWidth = 8; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
      c.lineWidth = 6; for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; c.beginPath(); c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); c.lineTo(x + Math.cos(a) * (r + 10), y + Math.sin(a) * (r + 10)); c.stroke(); }
    }
  } else if (w === 4) {
    c.fillStyle = '#3a0a05';
    for (let i = 0; i < 4; i++) { const x = rng() * VW, h = 200 + rng() * 200; poly(c, [x - 220, VH, x - 40, VH - h, x + 40, VH - h, x + 220, VH]); }
    const rg = c.createRadialGradient(VW / 2, VH + 100, 50, VW / 2, VH + 100, 500);
    rg.addColorStop(0, 'rgba(255,120,20,.45)'); rg.addColorStop(1, 'rgba(255,60,0,0)');
    c.fillStyle = rg; c.fillRect(0, 0, VW, VH);
  } else {
    for (let i = 0; i < 140; i++) { c.fillStyle = `rgba(230,200,255,${0.2 + rng() * 0.7})`; c.fillRect(rng() * VW, rng() * VH, rng() < 0.1 ? 2 : 1, rng() < 0.1 ? 2 : 1); }
    c.fillStyle = 'rgba(220,190,255,.18)'; circle(c, 640, 120, 60);
    c.fillStyle = '#12061f';
    for (let i = 0; i < 7; i++) {
      const x = i * 120 + rng() * 40, h = 120 + rng() * 180, tw = 40 + rng() * 30;
      c.fillRect(x, VH - h, tw, h);
      for (let k = 0; k < tw; k += 12) c.fillRect(x + k, VH - h - 10, 7, 10);
      poly(c, [x - 4, VH - h - 10, x + tw / 2, VH - h - 50, x + tw + 4, VH - h - 10]);
    }
  }
}
function renderRoomCache() {
  const R = G.R;
  if (!R.bg) { R.bg = mkCanvas(); drawBG(R.bg.getContext('2d'), R); }
  R.tiles = mkCanvas();
  const c = R.tiles.getContext('2d'), pal = WP[R.w];
  for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
    const ch = R.g[ty][tx], px = tx * TS, py = ty * TS;
    const up = ty > 0 ? R.g[ty - 1][tx] : '#';
    const topOpen = !'#FI'.includes(up);
    if (ch === '#' || ch === 'F') drawBlock(c, px, py, R.w, topOpen && ty > 0, tx, ty);
    else if (ch === 'I') drawIce(c, px, py);
    else if (ch === '=') {
      c.fillStyle = pal.plat; c.fillRect(px, py, TS, 9);
      c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(px, py, TS, 2);
      c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(px, py + 8, TS, 2); c.fillRect(px + 6, py + 9, 3, 6); c.fillRect(px + 23, py + 9, 3, 6);
    } else if (SPK[ch]) drawSpike(c, px, py, TS, TS, SPK[ch], pal.spk, pal.spkDk);
  }
}
function drawDynTiles() {
  const R = G.R;
  for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
    const ch = R.g[ty][tx], i = ty * COLS + tx;
    let px = tx * TS, py = ty * TS;
    if (ch === 'C') {
      const v = R.cr[i];
      if (v < 0) continue;
      if (v > 0) { px += rnd(-2, 2); py += rnd(-1, 1); }
      ctx.fillStyle = '#a8dcf8'; ctx.fillRect(px, py, TS, TS - 6);
      ctx.fillStyle = '#e9f7ff'; ctx.fillRect(px, py, TS, 5);
      ctx.strokeStyle = '#4f8fb8'; ctx.lineWidth = 1.5; ctx.beginPath();
      ctx.moveTo(px + 6, py + 6); ctx.lineTo(px + 14, py + 16); ctx.lineTo(px + 10, py + 25); ctx.moveTo(px + 14, py + 16); ctx.lineTo(px + 25, py + 12); ctx.stroke();
      ctx.strokeStyle = '#2f5274'; ctx.strokeRect(px + 0.5, py + 0.5, TS - 1, TS - 7);
    } else if (ch === 'H') {
      if (R.rev[i]) drawBlock(ctx, px, py, R.w, false, tx, ty, 'rgba(255,255,255,.5)');
    } else if (ch === 'K' || ch === 'k') {
      const d = ch === 'K' ? 1 : -1;
      ctx.fillStyle = '#2b2f36'; ctx.fillRect(px, py, TS, TS);
      ctx.fillStyle = '#16181c'; ctx.fillRect(px, py + 4, TS, 10);
      const off = ((G.t * 1.6 * d) % 8 + 8) % 8;
      ctx.fillStyle = '#f0a020';
      for (let k = -8; k < TS + 8; k += 8) { const x = px + k + off; if (x >= px && x < px + TS - 3) ctx.fillRect(x, py + 6, 3, 6); }
      ctx.fillStyle = '#555c66'; circle(ctx, px + 8, py + 23, 5); circle(ctx, px + 24, py + 23, 5);
      ctx.fillStyle = '#ccc';
      const a = G.t * 0.2 * d; ctx.fillRect(px + 8 + Math.cos(a) * 3 - 1, py + 23 + Math.sin(a) * 3 - 1, 2, 2); ctx.fillRect(px + 24 + Math.cos(a) * 3 - 1, py + 23 + Math.sin(a) * 3 - 1, 2, 2);
      ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(px, py, TS, 2);
    } else if (ch === 'T') {
      const sq = R.tramp[i] > 0 ? Math.sin(R.tramp[i] / 14 * Math.PI) * 6 : 0;
      ctx.fillStyle = '#333'; ctx.fillRect(px + 2, py + 24, 28, 8);
      ctx.strokeStyle = '#ccc'; ctx.lineWidth = 2; ctx.beginPath();
      for (let k = 0; k < 4; k++) { ctx.moveTo(px + 6, py + 24 - k * (4 - sq / 4)); ctx.lineTo(px + 26, py + 22 - k * (4 - sq / 4)); }
      ctx.stroke();
      ctx.fillStyle = '#e83040'; ctx.fillRect(px, py + 4 + sq, TS, 6);
      ctx.fillStyle = '#ff8090'; ctx.fillRect(px, py + 4 + sq, TS, 2);
    } else if (ch === '~') {
      ctx.fillStyle = 'rgba(40,120,255,.35)'; ctx.fillRect(px, py, TS, TS);
    }
  }
  for (const w of R.water) {
    ctx.fillStyle = 'rgba(40,130,255,.32)'; ctx.fillRect(w[0], w[1], w[2], w[3]);
    ctx.strokeStyle = 'rgba(200,240,255,.7)'; ctx.lineWidth = 2; ctx.beginPath();
    for (let x = w[0]; x <= w[0] + w[2]; x += 4) { const y = w[1] + Math.sin((x + G.t * 2) * 0.06) * 2; if (x === w[0]) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.stroke();
  }
}
function drawCherry(c, cx, cy, r) {
  c.strokeStyle = '#2a7a1a'; c.lineWidth = Math.max(1.5, r * 0.18);
  c.beginPath(); c.moveTo(cx, cy - r * 0.8); c.quadraticCurveTo(cx + r * 0.1, cy - r * 1.5, cx + r * 0.6, cy - r * 1.7); c.stroke();
  c.fillStyle = '#3fbf3f'; c.beginPath(); c.ellipse(cx + r * 0.75, cy - r * 1.55, r * 0.45, r * 0.22, -0.5, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#8a0010'; circle(c, cx, cy, r);
  c.fillStyle = '#ff1f35'; circle(c, cx - r * 0.08, cy - r * 0.08, r * 0.86);
  c.fillStyle = 'rgba(255,255,255,.85)'; circle(c, cx - r * 0.35, cy - r * 0.35, r * 0.24);
}
function drawSaw(c, cx, cy, r, a) {
  c.save(); c.translate(cx, cy); c.rotate(a);
  c.fillStyle = '#d4d8e0'; c.beginPath();
  for (let i = 0; i < 24; i++) { const rr = i % 2 ? r * 0.78 : r, aa = i / 24 * Math.PI * 2; c.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr); }
  c.closePath(); c.fill();
  c.fillStyle = '#8a909c'; circle(c, 0, 0, r * 0.55);
  c.fillStyle = '#c03030'; circle(c, 0, 0, r * 0.22);
  c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(-r * 0.5, -1, r, 2);
  c.restore();
}
function drawKid(c, x, y, face, state, t, shootT, scale) {
  c.save(); c.translate(Math.round(x + PW / 2), Math.round(y + PH)); c.scale(face * (scale || 1), scale || 1);
  const bob = state === 'idle' ? Math.floor(t / 22) % 2 : 0;
  const fl = state === 'run' ? Math.sin(t * 0.45) * 2 : state === 'jump' ? -3 : 2;
  c.fillStyle = '#b00818'; poly(c, [-3, -14 + bob, -10 + fl * 0.4, -5 + (state === 'fall' ? -5 : 0), -8, -1, -2, -7 + bob]);
  c.fillStyle = '#22306a';
  if (state === 'run') {
    const k = Math.floor(t / 5) % 4, o = [2, 0, -2, 0][k];
    c.fillRect(-4 + o, -6, 3, 6); c.fillRect(1 - o, -6, 3, 6);
    c.fillStyle = '#111'; c.fillRect(-5 + o, -1, 4, 1); c.fillRect(1 - o, -1, 4, 1);
  } else if (state === 'jump' || state === 'fall') {
    c.fillRect(-4, -7, 3, 5); c.fillRect(1, -6, 3, 5);
    c.fillStyle = '#111'; c.fillRect(-5, -3, 4, 1); c.fillRect(1, -2, 4, 1);
  } else {
    c.fillRect(-4, -6, 3, 6); c.fillRect(1, -6, 3, 6);
    c.fillStyle = '#111'; c.fillRect(-5, -1, 4, 1); c.fillRect(1, -1, 4, 1);
  }
  c.fillStyle = '#ecedf5'; c.fillRect(-5, -13 + bob, 10, 7);
  c.fillStyle = '#3a2a1a'; c.fillRect(-5, -7 + bob, 10, 1);
  c.fillStyle = '#ff3040'; c.fillRect(-5, -14 + bob, 10, 2);
  c.fillStyle = '#ffd9b3'; c.fillRect(-5, -22 + bob, 10, 8);
  c.fillStyle = '#24160e';
  c.fillRect(-6, -25 + bob, 11, 4); c.fillRect(-6, -22 + bob, 3, 5); c.fillRect(-3, -27 + bob, 3, 2); c.fillRect(1, -26 + bob, 3, 2);
  c.fillStyle = '#111'; c.fillRect(2, -19 + bob, 2, 3);
  c.fillStyle = '#fff'; c.fillRect(2, -19 + bob, 1, 1);
  c.fillStyle = '#ffb0a0'; c.fillRect(-1, -16 + bob, 2, 1);
  if (shootT > 0) { c.fillStyle = '#666'; c.fillRect(3, -11 + bob, 7, 3); c.fillStyle = '#ff8'; c.fillRect(10, -11 + bob, 2, 3); }
  c.restore();
}
function drawWarp(c, cx, cy, t, rev) {
  const g = c.createRadialGradient(cx, cy, 2, cx, cy, 24);
  g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.45, 'rgba(170,90,255,.6)'); g.addColorStop(1, 'rgba(60,0,140,0)');
  c.fillStyle = g; circle(c, cx, cy, 24);
  const a = t * 0.09 * (rev ? -1 : 1);
  c.lineWidth = 3;
  for (let i = 0; i < 3; i++) {
    c.strokeStyle = i % 2 ? '#d8a8ff' : '#80e0ff';
    c.beginPath(); c.arc(cx, cy, 8 + i * 4, a + i * 2.1, a + i * 2.1 + Math.PI * 1.25); c.stroke();
  }
}
function drawEnt(e) {
  if (e.done && e.k !== 'boss') return;
  const pal = WP[G.R.w], c = ctx;
  switch (e.k) {
    case 'spike': {
      if (!e.vis) return;
      if (e.d.home) {
        const a = Math.atan2(e.vy, e.vx) || 0, cx = e.x + 16, cy = e.y + 16;
        c.save(); c.translate(cx, cy); c.rotate(a);
        c.fillStyle = 'rgba(255,80,200,.25)'; circle(c, 0, 0, 16);
        drawSpike(c, -16, -16, 32, 32, 'r', '#ffd0f0', '#c060a0');
        c.restore(); return;
      }
      if (e.d.body) {
        const gx = e.x - 400;
        c.fillStyle = '#1b1e24'; c.fillRect(gx, e.y - 8, 402, e.h + 16);
        c.fillStyle = '#f0a020';
        for (let y = e.y - 8; y < e.y + e.h + 8; y += 24) c.fillRect(e.x - 10, y, 6, 12);
        c.fillStyle = '#c33'; for (let y = e.y + 20; y < e.y + e.h; y += 96) circle(c, e.x - 30, y, 6 + Math.sin(G.t * 0.3) * 2);
      }
      for (let i = 0; i < e.n; i++) {
        let x = e.x, y = e.y;
        if (e.dir === 'u' || e.dir === 'd') x += i * e.s; else y += i * e.s;
        drawSpike(c, x, y, e.s, e.s, e.dir, pal.spk, pal.spkDk);
      }
      return;
    }
    case 'stalker': {
      let x = e.x, y = e.y;
      if (e.st === 'warn') x += rnd(-2, 2);
      drawSpike(c, x, y, 32, 32, 'd', '#ffe0ff', '#b070c0');
      c.fillStyle = '#fff'; circle(c, x + 16, y + 8, 5); c.fillStyle = e.st === 'warn' ? '#f00' : '#300'; circle(c, x + 16 + clamp((G.p ? G.p.x - x : 0) / 80, -2, 2), y + 9, 2.5);
      return;
    }
    case 'fruit': if (e.vis) drawCherry(c, e.x + e.w / 2, e.y + e.h / 2, e.r); return;
    case 'moon': {
      const cx = e.x + e.w / 2, cy = e.y + e.h / 2, r = e.w / 2 - 4;
      let ox = 0, oy = 0; if (e.ph === 'delay') { ox = rnd(-3, 3); oy = rnd(-3, 3); }
      const g = c.createRadialGradient(cx + ox, cy + oy, r * 0.3, cx + ox, cy + oy, r * 1.6);
      g.addColorStop(0, 'rgba(255,250,200,.5)'); g.addColorStop(1, 'rgba(255,250,200,0)');
      c.fillStyle = g; circle(c, cx + ox, cy + oy, r * 1.6);
      c.fillStyle = '#fff4b0'; circle(c, cx + ox, cy + oy, r);
      c.fillStyle = 'rgba(200,180,90,.35)'; circle(c, cx + ox - r * 0.3, cy + oy - r * 0.2, r * 0.22); circle(c, cx + ox + r * 0.35, cy + oy + r * 0.3, r * 0.15); circle(c, cx + ox + r * 0.1, cy + oy - r * 0.5, r * 0.1);
      if (e.ph !== 'wait') {
        c.fillStyle = '#300'; poly(c, [cx + ox - r * 0.5, cy + oy - r * 0.15, cx + ox - r * 0.15, cy + oy, cx + ox - r * 0.5, cy + oy + r * 0.05]);
        poly(c, [cx + ox + r * 0.5, cy + oy - r * 0.15, cx + ox + r * 0.15, cy + oy, cx + ox + r * 0.5, cy + oy + r * 0.05]);
        c.fillRect(cx + ox - r * 0.3, cy + oy + r * 0.35, r * 0.6, r * 0.12);
      }
      return;
    }
    case 'saw': drawSaw(c, e.x + e.r, e.y + e.r, e.r, e.t * 0.35); return;
    case 'crush': {
      const x = e.x, y = e.y, w = e.w, h = e.h;
      c.fillStyle = '#3a3f48'; c.fillRect(x, y, w, h);
      c.fillStyle = '#5a616c'; c.fillRect(x + 3, y + 3, w - 6, h - 14);
      for (let i = 0; i < w; i += 8) { c.fillStyle = (i / 8) % 2 ? '#222' : '#f0a020'; c.fillRect(x + i, y + h - 11, 8, 5); }
      c.fillStyle = '#ccd'; for (let i = 0; i < w; i += 8) poly(c, [x + i, y + h - 6, x + i + 8, y + h - 6, x + i + 4, y + h]);
      const ey = y + h * 0.35;
      c.fillStyle = '#111'; c.fillRect(x + w * 0.2, ey, w * 0.2, 8); c.fillRect(x + w * 0.6, ey, w * 0.2, 8);
      c.fillStyle = e.ph === 'move' ? '#ff3030' : '#a02020'; c.fillRect(x + w * 0.25, ey + 2, 6, 5); c.fillRect(x + w * 0.65, ey + 2, 6, 5);
      c.fillStyle = '#111'; poly(c, [x + w * 0.15, ey - 6, x + w * 0.45, ey - 1, x + w * 0.45, ey + 1]); poly(c, [x + w * 0.85, ey - 6, x + w * 0.55, ey - 1, x + w * 0.55, ey + 1]);
      return;
    }
    case 'plat': {
      c.fillStyle = '#4a525c'; c.fillRect(e.x, e.y, e.w, e.h);
      c.fillStyle = '#9aa6b3'; c.fillRect(e.x, e.y, e.w, 4);
      c.fillStyle = '#f0a020'; for (let i = 6; i < e.w - 6; i += 14) poly(c, [e.x + i, e.y + 14, e.x + i + 6, e.y + 6, e.x + i + 10, e.y + 6, e.x + i + 4, e.y + 14]);
      return;
    }
    case 'fall': {
      let x = e.x, y = e.y; if (e.ph === 'delay') { x += rnd(-2, 2); }
      c.fillStyle = '#6a3a1a'; c.fillRect(x, y, e.w, e.h);
      c.fillStyle = '#a0583a'; c.fillRect(x, y, e.w, 4);
      c.strokeStyle = '#2a1008'; c.lineWidth = 1.5; c.beginPath();
      c.moveTo(x + e.w * 0.3, y + 2); c.lineTo(x + e.w * 0.4, y + 10); c.lineTo(x + e.w * 0.35, y + 16); c.moveTo(x + e.w * 0.7, y + 4); c.lineTo(x + e.w * 0.62, y + 14); c.stroke();
      return;
    }
    case 'block': drawBlock(c, e.x, e.y, G.R.w, true, 0, 0); return;
    case 'warp': if (e.vis) drawWarp(c, e.x + 16, e.y + 16, G.t, false); return;
    case 'fwarp': drawWarp(c, e.x + 16, e.y + 16, G.t, true); return;
    case 'save': {
      const on = e.saved > 0 && (e.saved >> 2) % 2 === 0;
      c.fillStyle = '#1a1a1a'; c.fillRect(e.x + 2, e.y + 4, 28, 28);
      c.fillStyle = on ? '#30e050' : '#d02030'; c.fillRect(e.x + 4, e.y + 6, 24, 24);
      c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(e.x + 4, e.y + 6, 24, 4);
      ctx.font = '9px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText('SAVE', e.x + 16, e.y + 19);
      return;
    }
    case 'orb': {
      const cx = e.x + 16, cy = e.y + 16;
      if (e.cd > 0) { c.strokeStyle = 'rgba(128,255,255,.25)'; c.lineWidth = 1; c.beginPath(); c.arc(cx, cy, 10, 0, Math.PI * 2); c.stroke(); return; }
      const pr = 10 + Math.sin(G.t * 0.1 + e.x) * 1.5;
      const g = c.createRadialGradient(cx, cy, 1, cx, cy, pr + 8);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, '#80ffff'); g.addColorStop(1, 'rgba(0,200,255,0)');
      c.fillStyle = g; circle(c, cx, cy, pr + 8);
      c.strokeStyle = '#e0ffff'; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, pr, 0, Math.PI * 2); c.stroke();
      if (e.fake) { c.fillStyle = '#ff2030'; c.fillRect(cx - 1, cy - 1, 2, 2); }
      return;
    }
    case 'gem': {
      const cx = e.x + 16, cy = e.y + 16 + Math.sin(G.t * 0.06) * 3;
      const hue = (G.t * 3) % 360;
      c.globalAlpha = e.got ? 0.22 : 1;
      c.fillStyle = e.got ? '#fff' : `hsl(${hue},90%,65%)`; poly(c, [cx, cy - 12, cx + 10, cy - 2, cx, cy + 12, cx - 10, cy - 2]);
      c.fillStyle = 'rgba(255,255,255,.7)'; poly(c, [cx, cy - 12, cx + 4, cy - 2, cx, cy + 2, cx - 4, cy - 2]);
      c.globalAlpha = 1;
      if (!e.got && G.t % 20 === 0) addPart({ x: cx + rnd(-12, 12), y: cy + rnd(-12, 12), g: 0, vy: -0.3, life: 20, sz: 2, col: '#fff' });
      return;
    }
    case 'sign': {
      c.fillStyle = '#5a3a1a'; c.fillRect(e.x + 14, e.y + 16, 4, 16);
      c.fillStyle = '#c08a50'; c.fillRect(e.x + 3, e.y + 4, 26, 15);
      c.fillStyle = '#8a5a2a'; c.fillRect(e.x + 3, e.y + 17, 26, 2); c.fillRect(e.x + 7, e.y + 8, 18, 1); c.fillRect(e.x + 7, e.y + 12, 14, 1);
      return;
    }
    case 'laser': {
      const d = e.d, st = laserState(e), r = laserRect(e);
      if (st === 1 && (G.t >> 2) % 2 === 0) { c.fillStyle = 'rgba(255,60,90,.55)'; if (d.dir === 'v') c.fillRect(r[0] + 4, r[1], 2, r[3]); else c.fillRect(r[0], r[1] + 4, r[2], 2); }
      if (st === 2) {
        c.fillStyle = 'rgba(255,40,90,.35)'; if (d.dir === 'v') c.fillRect(r[0] - 5, r[1], 20, r[3]); else c.fillRect(r[0], r[1] - 5, r[2], 20);
        c.fillStyle = '#ff3a6a'; c.fillRect(r[0], r[1], r[2], r[3]);
        c.fillStyle = '#fff'; if (d.dir === 'v') c.fillRect(r[0] + 3, r[1], 4, r[3]); else c.fillRect(r[0], r[1] + 3, r[2], 4);
      }
      c.fillStyle = '#3a3f48';
      if (d.dir === 'v') { c.fillRect(d.x * TS + 6, d.y * TS - 6, 20, 10); c.fillStyle = st ? '#ff3a6a' : '#602030'; c.fillRect(d.x * TS + 12, d.y * TS + 1, 8, 3); }
      else { c.fillRect(d.x * TS - 6, d.y * TS + 6, 10, 20); c.fillStyle = st ? '#ff3a6a' : '#602030'; c.fillRect(d.x * TS + 1, d.y * TS + 12, 3, 8); }
      return;
    }
    case 'turret': {
      const cx = (e.d.x + 0.5) * TS, cy = (e.d.y + 0.5) * TS;
      c.save(); c.translate(cx, cy); c.rotate(e.ang);
      c.fillStyle = '#55555f'; c.fillRect(0, -5, 22, 10);
      c.fillStyle = e.fireT > 0 ? '#ffb040' : '#33333a'; c.fillRect(18, -6, 6, 12);
      c.restore();
      c.fillStyle = '#2a2a30'; circle(c, cx, cy, 13);
      c.fillStyle = e.fireT > 0 ? '#ff6a1a' : '#a02a10'; circle(c, cx, cy, 5);
      return;
    }
    case 'boss': drawBoss(e); return;
  }
}
function drawLava(e) {
  const s = e.surf, c = ctx;
  if (s >= VH) return;
  if (e.d.style === 'spike') {
    c.fillStyle = '#140826'; c.fillRect(0, s + 16, VW, VH - s);
    for (let x = 0; x < VW; x += 32) drawSpike(c, x, s, 32, 32, 'u', '#f4ecff', '#9a80c8');
    return;
  }
  const g = c.createLinearGradient(0, s, 0, VH);
  g.addColorStop(0, '#ffcf40'); g.addColorStop(0.15, '#ff6a10'); g.addColorStop(1, '#8a1000');
  c.fillStyle = g; c.beginPath(); c.moveTo(0, VH);
  for (let x = 0; x <= VW; x += 10) c.lineTo(x, s + Math.sin((x + G.t * 3) * 0.04) * 4 + Math.sin((x - G.t * 2) * 0.09) * 2);
  c.lineTo(VW, VH); c.closePath(); c.fill();
  if (G.t % 4 === 0) addPart({ x: rnd(0, VW), y: s, vy: -rnd(1, 3), g: 0.05, life: 30, sz: 3, col: '#ffb040' });
}
function drawBoss(e) {
  if (e.gone) return;
  const c = ctx, fl = e.flash > 0;
  if (e.type === 1) {
    const cx = e.cx, cy = e.cy, r = e.r;
    drawCherry(c, cx, cy, r);
    c.fillStyle = '#ffd030'; poly(c, [cx - 26, cy - r + 6, cx - 30, cy - r - 22, cx - 14, cy - r - 8, cx, cy - r - 28, cx + 14, cy - r - 8, cx + 30, cy - r - 22, cx + 26, cy - r + 6]);
    c.fillStyle = '#40a0ff'; circle(c, cx, cy - r - 10, 4);
    c.fillStyle = '#fff'; c.fillRect(cx - 22, cy - 10, 14, 10); c.fillRect(cx + 8, cy - 10, 14, 10);
    c.fillStyle = '#000'; c.fillRect(cx - 16 + clamp((G.p ? G.p.x - cx : 0) / 60, -4, 4), cy - 7, 5, 6); c.fillRect(cx + 14 + clamp((G.p ? G.p.x - cx : 0) / 60, -4, 4), cy - 7, 5, 6);
    c.fillStyle = '#300'; poly(c, [cx - 24, cy - 16, cx - 6, cy - 10, cx - 24, cy - 12]); poly(c, [cx + 24, cy - 16, cx + 6, cy - 10, cx + 24, cy - 12]);
    c.fillRect(cx - 14, cy + 12, 28, 6); c.fillStyle = '#fff'; c.fillRect(cx - 12, cy + 12, 4, 3); c.fillRect(cx + 8, cy + 12, 4, 3);
    if (fl) { c.fillStyle = 'rgba(255,255,255,.6)'; circle(c, cx, cy, r); }
  } else if (e.type === 2) {
    let x = e.bx, y = e.by; const w = e.bw, h = e.bh;
    if (e.st === 'warn') { x += rnd(-3, 3); y += rnd(-2, 2); }
    c.fillStyle = '#2c3038'; c.fillRect(x, y, w, h);
    c.fillStyle = '#5a616c'; c.fillRect(x + 4, y + 4, w - 8, h - 18);
    c.fillStyle = '#7a828e'; c.fillRect(x + 4, y + 4, w - 8, 5);
    for (let i = 0; i < w; i += 12) { c.fillStyle = (i / 12) % 2 ? '#222' : '#f0a020'; c.fillRect(x + i, y + h - 14, 12, 6); }
    c.fillStyle = '#dde'; for (let i = 0; i < w; i += 12) poly(c, [x + i, y + h - 8, x + i + 12, y + h - 8, x + i + 6, y + h]);
    const look = clamp((G.p ? G.p.x - (x + w / 2) : 0) / 50, -5, 5), hot = e.st === 'warn' || e.st === 'slam';
    c.fillStyle = '#111'; c.fillRect(x + 14, y + 26, 24, 16); c.fillRect(x + w - 38, y + 26, 24, 16);
    c.fillStyle = hot ? '#ff2020' : '#ff9020'; c.fillRect(x + 22 + look, y + 30, 8, 8); c.fillRect(x + w - 30 + look, y + 30, 8, 8);
    c.fillStyle = '#111'; poly(c, [x + 10, y + 16, x + 42, y + 24, x + 42, y + 27]); poly(c, [x + w - 10, y + 16, x + w - 42, y + 24, x + w - 42, y + 27]);
    c.fillRect(x + 26, y + 54, w - 52, 12);
    c.fillStyle = '#ccc'; for (let i = 0; i < w - 56; i += 8) c.fillRect(x + 28 + i, y + 54, 5, 5);
    if (fl) { c.fillStyle = 'rgba(255,255,255,.6)'; c.fillRect(x, y, w, h); }
  } else {
    const cx = e.cx, cy = e.cy, r = e.r;
    if (e.st === 'dprep') { c.fillStyle = `rgba(255,0,80,${0.12 + 0.1 * Math.sin(G.t * 0.5)})`; c.fillRect(0, 476, VW, 100); }
    const ag = c.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 2);
    ag.addColorStop(0, e.ph === 3 ? 'rgba(255,40,40,.5)' : 'rgba(180,60,255,.45)'); ag.addColorStop(1, 'rgba(120,0,200,0)');
    c.fillStyle = ag; circle(c, cx, cy, r * 2);
    c.fillStyle = '#f4f0e0'; poly(c, [cx - r * 0.7, cy - r * 0.6, cx - r * 1.05, cy - r * 1.55, cx - r * 0.3, cy - r * 0.85]); poly(c, [cx + r * 0.7, cy - r * 0.6, cx + r * 1.05, cy - r * 1.55, cx + r * 0.3, cy - r * 0.85]);
    c.fillStyle = e.ph === 3 ? '#8a0010' : '#c0182a'; circle(c, cx, cy, r);
    c.fillStyle = 'rgba(255,255,255,.15)'; circle(c, cx - r * 0.3, cy - r * 0.35, r * 0.4);
    c.fillStyle = '#1a0008'; poly(c, [cx - r * 0.75, cy - r * 0.45, cx - r * 0.1, cy - r * 0.2, cx - r * 0.75, cy - r * 0.3]); poly(c, [cx + r * 0.75, cy - r * 0.45, cx + r * 0.1, cy - r * 0.2, cx + r * 0.75, cy - r * 0.3]);
    c.fillStyle = '#ffe040'; circle(c, cx - r * 0.38, cy - r * 0.08, r * 0.15); circle(c, cx + r * 0.38, cy - r * 0.08, r * 0.15);
    c.fillStyle = '#000'; circle(c, cx - r * 0.38, cy - r * 0.06, r * 0.06); circle(c, cx + r * 0.38, cy - r * 0.06, r * 0.06);
    c.fillStyle = '#1a0008'; c.fillRect(cx - r * 0.55, cy + r * 0.3, r * 1.1, r * 0.3);
    c.fillStyle = '#fff'; poly(c, [cx - r * 0.45, cy + r * 0.3, cx - r * 0.3, cy + r * 0.3, cx - r * 0.38, cy + r * 0.62]); poly(c, [cx + r * 0.45, cy + r * 0.3, cx + r * 0.3, cy + r * 0.3, cx + r * 0.38, cy + r * 0.62]);
    if (fl || e.inv > 0 && (G.t >> 2) % 2) { c.fillStyle = 'rgba(255,255,255,.5)'; circle(c, cx, cy, r); }
  }
}
function drawEbul(b) {
  const c = ctx;
  if (b.col === 'cherry') { drawCherry(c, b.x, b.y, b.r); return; }
  const col = b.col === 'fire' ? ['#fff3b0', '#ff8a20', 'rgba(255,60,0,0)'] : b.col === 'oni' ? ['#fff', '#ff40e0', 'rgba(140,0,255,0)'] : ['#fff', '#ffe040', 'rgba(255,120,0,0)'];
  const g = c.createRadialGradient(b.x, b.y, 1, b.x, b.y, b.r + 5);
  g.addColorStop(0, col[0]); g.addColorStop(0.5, col[1]); g.addColorStop(1, col[2]);
  c.fillStyle = g; circle(c, b.x, b.y, b.r + 5);
}
function drawWeather() {
  const w = G.R.w, c = ctx, t = G.t;
  if (w === 2) {
    c.fillStyle = 'rgba(255,255,255,.75)';
    for (let i = 0; i < 45; i++) { const x = ((i * 137 + t * 0.4 * (1 + i % 3)) % 840) - 20, y = (i * 91 + t * (0.5 + (i % 4) * 0.25)) % 640 - 16; c.fillRect(x + Math.sin((t + i * 30) * 0.03) * 6, y, 2, 2); }
  } else if (w === 4) {
    for (let i = 0; i < 30; i++) { const x = (i * 157 + Math.sin((t + i * 40) * 0.02) * 30) % 800, y = VH - ((i * 113 + t * (0.8 + (i % 3) * 0.4)) % 680); c.fillStyle = i % 2 ? 'rgba(255,170,60,.8)' : 'rgba(255,90,20,.7)'; c.fillRect(x, y, 2, 2); }
  } else if (w === 5) {
    for (let i = 0; i < 18; i++) { const x = (i * 211 + t * 0.2) % 820, y = (i * 67 + Math.sin((t + i * 50) * 0.01) * 40) % 600; c.fillStyle = `rgba(220,160,255,${0.3 + 0.3 * Math.sin(t * 0.05 + i)})`; c.fillRect(x, y, 2, 2); }
  }
}
function drawParts() {
  for (const p of G.parts) {
    ctx.globalAlpha = p.stuck || p.stick ? 1 : clamp(p.life / p.max, 0, 1);
    ctx.fillStyle = p.col; ctx.fillRect(p.x, p.y, p.sz, p.sz);
  }
  ctx.globalAlpha = 1;
}
function drawBubbleText(lines, cx, y, size, maxW) {
  ctx.font = size + 'px ' + FONT;
  let w = 0; for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
  w = Math.min(maxW || 760, w + 28);
  const h = lines.length * (size + 6) + 18, x = clamp(cx - w / 2, 8, VW - w - 8);
  ctx.fillStyle = 'rgba(8,8,16,.88)'; rrect(ctx, x, y, w, h, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; rrect(ctx, x, y, w, h, 8); ctx.stroke();
  lines.forEach((l, i) => txt(l, x + w / 2, y + 10 + i * (size + 6), size, '#fff', 'center'));
}
function playerState(p) {
  if (!p.onGround) return p.vy < 0 ? 'jump' : 'fall';
  return Math.abs(p.vx) > 0.3 ? 'run' : 'idle';
}
function drawPlay() {
  const R = G.R, p = G.p;
  ctx.save();
  if (G.shake > 0.5) ctx.translate(rnd(-G.shake, G.shake), rnd(-G.shake, G.shake));
  ctx.drawImage(R.bg, 0, 0);
  for (const e of G.ents) if (e.under) drawEnt(e);
  ctx.drawImage(R.tiles, 0, 0);
  drawDynTiles();
  for (const e of G.ents) if (!e.under && e.k !== 'lava') drawEnt(e);
  if (p && !p.dead) {
    if (p.shootT > 0) p.shootT--;
    if (G.trans && G.trans.t < 40) {
      const k = 1 - G.trans.t / 40;
      drawKid(ctx, p.x, p.y, p.face, 'jump', G.t, 0, Math.max(0.05, k));
    } else drawKid(ctx, p.x, p.y, p.face, playerState(p), p.anim, p.shootT);
  }
  drawParts();
  ctx.fillStyle = '#ffee70';
  for (const b of G.bullets) { ctx.fillRect(b.x - 3, b.y - 2, 6, 4); ctx.fillStyle = 'rgba(255,240,120,.4)'; ctx.fillRect(b.x - 3 - b.vx * 0.6, b.y - 1, 6, 2); ctx.fillStyle = '#ffee70'; }
  for (const b of G.ebul) drawEbul(b);
  for (const e of G.ents) if (e.k === 'lava') drawLava(e);
  drawWeather();
  ctx.restore();
  drawHUD();
  if (p && !p.dead) {
    for (const e of G.ents) if (e.k === 'sign' && Math.abs(e.x + 16 - (p.x + 6)) < 44 && Math.abs(e.y + 16 - (p.y + 10)) < 44) { drawBubbleText(e.d.text.split('\n'), VW / 2, 60, 18); break; }
  }
  if (G.boss && !G.boss.gone && G.boss.st !== 'intro') {
    const b = G.boss, bw = 360, x = (VW - bw) / 2;
    txt(b.name, VW / 2, 30, 16, '#fff', 'center', 3);
    ctx.fillStyle = '#000'; ctx.fillRect(x - 2, 50, bw + 4, 12);
    ctx.fillStyle = '#3a0a10'; ctx.fillRect(x, 52, bw, 8);
    ctx.fillStyle = b.flash > 0 ? '#fff' : '#ff3040'; ctx.fillRect(x, 52, bw * Math.max(0, b.hp) / b.max, 8);
    if (b.st === 'roar') { const a = Math.min(1, b.tm / 15); ctx.globalAlpha = a; txt(b.name, VW / 2, 200, 44, '#ff4050', 'center', 6); txt('が現れた！', VW / 2, 256, 24, '#fff', 'center', 4); ctx.globalAlpha = 1; }
  }
  if (G.msg) { const a = Math.min(1, G.msg.t / 20); ctx.globalAlpha = a; drawBubbleText([G.msg.text], VW / 2, 90, 20); ctx.globalAlpha = 1; }
  if (G.card) {
    const t = G.card.t, a = t < 20 ? t / 20 : t > 160 ? (180 - t) / 20 : 1;
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(0, 230, VW, 110);
    txt('WORLD ' + G.card.w, VW / 2, 244, 22, WP[G.card.w].topLt, 'center');
    txt(WORLD_INFO[G.card.w].name, VW / 2, 274, 40, '#fff', 'center', 5);
    ctx.globalAlpha = 1;
  }
  if (p && p.dead && G.deadT > 18) {
    const a = Math.min(1, (G.deadT - 18) / 25);
    ctx.fillStyle = `rgba(0,0,0,${0.45 * a})`; ctx.fillRect(0, 0, VW, VH);
    ctx.globalAlpha = a;
    const sc = 1 + Math.max(0, 1 - (G.deadT - 18) / 12) * 0.6;
    ctx.save(); ctx.translate(VW / 2, 250); ctx.scale(sc, sc);
    txt('GAME OVER', 0, -40, 72, '#ff2030', 'center', 8);
    ctx.restore();
    txt(G.deathMsg, VW / 2, 296, 22, '#fff', 'center', 4);
    if ((G.t >> 5) % 2 === 0) txt(document.body.classList.contains('touch') ? 'R ボタンでリトライ' : 'R キーでリトライ', VW / 2, 340, 20, '#ffd060', 'center', 4);
    txt('DEATH ' + G.data.deaths, VW / 2, 380, 16, '#ccc', 'center', 3);
    ctx.globalAlpha = 1;
  }
  if (G.trans) {
    const t = G.trans.t;
    const a = t < 40 ? clamp((t - 20) / 20, 0, 1) : clamp(1 - (t - 40) / 20, 0, 1);
    ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.fillRect(0, 0, VW, VH);
  }
  if (G.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${G.flash / 16})`; ctx.fillRect(0, 0, VW, VH); }
}
function drawHUD() {
  const d = G.data, def = G.R.def;
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, VW, 24);
  txt(def.id + '  ' + def.name, 8, 4, 16, '#fff');
  txt('DEATH ' + d.deaths + '   TIME ' + fmtTime(d.time) + '   ◆' + d.gems.length + '/' + GEM_TOTAL + '   ' + DIFFS[d.diff].name, VW - 8, 4, 16, '#ffd060', 'right');
}

// =====================================================================
//  メニュー & シーン
// =====================================================================
function setMenu(items, back, sel) { G.menu = { items, back, sel: sel || 0, rects: [] }; }
function updMenu() {
  const M = G.menu, I = Input; if (!M) return;
  const n = M.items.length;
  const valid = i => !M.items[i].dis;
  if (I.p.up) { let s = M.sel; for (let k = 0; k < n; k++) { s = (s - 1 + n) % n; if (valid(s)) break; } M.sel = s; SND.sfx('move'); }
  if (I.p.down) { let s = M.sel; for (let k = 0; k < n; k++) { s = (s + 1) % n; if (valid(s)) break; } M.sel = s; SND.sfx('move'); }
  if (G.click) {
    for (let i = 0; i < M.rects.length; i++) {
      const r = M.rects[i];
      if (r && valid(i) && G.click.x >= r[0] && G.click.x <= r[0] + r[2] && G.click.y >= r[1] && G.click.y <= r[1] + r[3]) { M.sel = i; SND.sfx('select'); M.items[i].f(); return; }
    }
  }
  if (I.p.ok && valid(M.sel)) { SND.sfx('select'); M.items[M.sel].f(); return; }
  if (I.p.back && M.back) { SND.sfx('cancel'); M.back(); }
}
function drawMenu(cx, y, gap, size, w) {
  const M = G.menu; if (!M) return;
  M.rects = [];
  M.items.forEach((it, i) => {
    const yy = y + i * gap, sel = i === M.sel, lab = typeof it.t === 'function' ? it.t() : it.t;
    const ww = w || 340, x = cx - ww / 2, h = size + 16;
    M.rects[i] = [x, yy - 8, ww, h];
    if (sel) {
      ctx.fillStyle = 'rgba(220,30,50,.85)'; rrect(ctx, x, yy - 8, ww, h, 6); ctx.fill();
      ctx.strokeStyle = '#ffd060'; ctx.lineWidth = 2; rrect(ctx, x, yy - 8, ww, h, 6); ctx.stroke();
      txt('▶', x + 14, yy, size, '#ffd060');
    } else { ctx.fillStyle = 'rgba(0,0,0,.45)'; rrect(ctx, x, yy - 8, ww, h, 6); ctx.fill(); }
    if (Array.isArray(lab)) {
      txt(lab[0], x + 40, yy, size, it.dis ? '#666' : '#fff');
      txt(lab[1], x + ww - 14, yy + 2, size - 6, sel ? '#ffe' : '#bbb', 'right');
    } else txt(lab, cx, yy, size, it.dis ? '#666' : '#fff', 'center');
  });
}
function toggleMute() { Store.data.opt.bgm = !Store.data.opt.bgm; SND.opt.bgm = Store.data.opt.bgm; SND.applyVol(); Store.save(); }
let titleFX = [];
function drawTitleBG() {
  const g = ctx.createLinearGradient(0, 0, 0, VH); g.addColorStop(0, '#12020a'); g.addColorStop(1, '#4a0612');
  ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  if (titleFX.length < 26 && G.t % 9 === 0) titleFX.push({ x: rnd(0, VW), y: -40, vy: rnd(1, 3), k: Math.random() < 0.5 ? 's' : 'c', a: rnd(0, 6) });
  for (const f of titleFX) {
    f.y += f.vy;
    ctx.globalAlpha = 0.35;
    if (f.k === 's') drawSpike(ctx, f.x, f.y, 28, 28, 'd', '#f0e8ff', '#9a80c8'); else drawCherry(ctx, f.x, f.y, 10);
    ctx.globalAlpha = 1;
  }
  titleFX = titleFX.filter(f => f.y < VH + 40);
  for (let x = 0; x < VW; x += 32) drawSpike(ctx, x, VH - 32, 32, 32, 'u', '#e8e8f0', '#8890a0');
}
function slotLabel(i) {
  const s = Store.data.slots[i];
  if (!s) return ['SLOT ' + (i + 1), '― NEW GAME ―'];
  const def = ROOMS[Math.min(s.room || 0, ROOMS.length - 1)];
  return ['SLOT ' + (i + 1) + (s.clear ? ' ★' : ''), DIFFS[s.diff].name + '  ' + def.id + '  ✖' + s.deaths + '  ' + fmtTime(s.time) + '  ◆' + s.gems.length];
}
const STORY = ['鬼が棲むという城、「鬼罠城」。', 'その最上階には、どんな願いも叶える', '『鬼の宝玉』が眠っているという。', '', '数多の冒険者が挑み、誰一人帰らなかった。', '理由はただ一つ――', '城へ続く道が、罠だらけだからだ。', '', '少年ヒロは、今日も歩き出す。'];
const HOWTO = [
  ['移動', '← → / A D / ◀ ▶'],
  ['ジャンプ', 'SHIFT / SPACE / ↑ / JUMP'],
  ['二段ジャンプ', '空中でもう一度ジャンプ'],
  ['ショット', 'Z / X / SHOT'],
  ['セーブ', 'セーブポイントを撃つ'],
  ['リトライ', 'R / R ボタン'],
  ['ポーズ', 'ESC / P / ❚❚'],
  ['BGM 切替', 'M']
];
const HOWTO_TIPS = ['ジャンプボタンを短く押すと低く跳べる', 'トゲは三角の部分にだけ当たり判定がある', '怪しいものはだいたい罠。でも安全なものも罠かも', '宝石は全部で' + GEM_TOTAL + '個。すべて集めると…？'];
function newGame(slot, diff) {
  G.data = { diff, room: 0, sx: null, sy: null, deaths: 0, time: 0, gems: [], clear: false, clears: 0, roomDeaths: {}, maxRoom: 0 };
  Store.data.slots[slot] = G.data; G.slot = slot; Store.save();
  goScene('story');
}
function continueGame(slot) {
  G.slot = slot; G.data = Store.data.slots[slot];
  if (!Array.isArray(G.data.gems)) G.data.gems = [];
  startPlay(true);
}
function startPlay(showCard) {
  respawn();
  Store.save();
  G.scene = 'play'; G.menu = null; G.deadT = 0;
  G.card = showCard ? { t: 0, w: ROOMS[G.data.room].w } : null;
}
let optReturn = 'title';
function goScene(s) {
  G.scene = s; G.sceneT = 0; G.click = null;
  const SC = SCN[s]; if (SC.enter) SC.enter();
}
const SCN = {
  title: {
    enter() {
      SND.play('title');
      setMenu([
        { t: 'ゲームスタート', f: () => goScene('slots') },
        { t: 'オプション', f: () => { optReturn = 'title'; goScene('options'); } },
        { t: 'あそびかた', f: () => goScene('howto') }
      ], null);
    },
    update() { updMenu(); },
    draw() {
      drawTitleBG();
      const s = 1 + Math.sin(G.t * 0.05) * 0.02;
      ctx.save(); ctx.translate(VW / 2, 150); ctx.scale(s, s);
      ctx.shadowColor = '#ff0030'; ctx.shadowBlur = 30;
      txt('鬼罠', 0, -80, 120, '#ff2a40', 'center', 10);
      ctx.shadowBlur = 0; ctx.restore();
      txt('ONIWANA', VW / 2, 190, 30, '#ffd060', 'center', 5);
      txt('～ 超鬼畜トラップアクション ～', VW / 2, 232, 20, '#fff', 'center', 4);
      drawKid(ctx, VW / 2 - 6, 290, 1, 'idle', G.t, 0, 2);
      drawMenu(VW / 2, 330, 52, 22);
      txt('made by hiro/ヒロ', VW / 2, VH - 64, 16, '#ccc', 'center', 3);
    }
  },
  slots: {
    enter() {
      setMenu([0, 1, 2].map(i => ({ t: () => slotLabel(i), f: () => { G.slot = i; if (Store.data.slots[i]) goScene('slotmenu'); else goScene('diff'); } })).concat([{ t: 'もどる', f: () => goScene('title') }]), () => goScene('title'));
    },
    update() { updMenu(); },
    draw() { drawTitleBG(); txt('セーブデータを選択', VW / 2, 70, 32, '#fff', 'center', 5); drawMenu(VW / 2, 170, 70, 20, 680); }
  },
  slotmenu: {
    enter() {
      setMenu([
        { t: 'つづきから', f: () => continueGame(G.slot) },
        { t: 'はじめから（データ消去）', f: () => goScene('confirm') },
        { t: 'もどる', f: () => goScene('slots') }
      ], () => goScene('slots'));
    },
    update() { updMenu(); },
    draw() {
      drawTitleBG(); const s = Store.data.slots[G.slot], l = slotLabel(G.slot);
      txt(l[0], VW / 2, 70, 30, '#fff', 'center', 5); txt(l[1], VW / 2, 116, 18, '#ffd060', 'center', 3);
      if (s && s.clear) txt('クリア回数 ' + s.clears + '   ベストタイム ' + fmtTime(s.best || 0), VW / 2, 146, 16, '#aaf', 'center', 3);
      drawMenu(VW / 2, 230, 64, 22, 420);
    }
  },
  confirm: {
    enter() { setMenu([{ t: 'やめる', f: () => goScene('slotmenu') }, { t: '消去してはじめから', f: () => { Store.data.slots[G.slot] = null; Store.save(); goScene('diff'); } }], () => goScene('slotmenu')); },
    update() { updMenu(); },
    draw() { drawTitleBG(); txt('本当にデータを消去しますか？', VW / 2, 150, 28, '#ff6070', 'center', 5); txt('死亡回数も時間もすべて消えます', VW / 2, 196, 18, '#fff', 'center', 3); drawMenu(VW / 2, 280, 64, 22, 420); }
  },
  diff: {
    enter() {
      setMenu(DIFFS.map((d, i) => ({ t: () => [d.name + '  ' + d.jp, ''], f: () => newGame(G.slot, i) })).concat([{ t: 'もどる', f: () => goScene('slots') }]), () => goScene('slots'));
    },
    update() { updMenu(); },
    draw() {
      drawTitleBG(); txt('難易度を選択', VW / 2, 60, 32, '#fff', 'center', 5);
      drawMenu(VW / 2, 150, 70, 24, 420);
      const d = DIFFS[G.menu.sel];
      if (d) drawBubbleText([d.desc], VW / 2, 440, 18);
    }
  },
  story: {
    enter() { G.menu = null; SND.play('w1n'); },
    update() { if (G.sceneT++ > 20 && (Input.p.ok || Input.p.back || G.click)) { G.click = null; startPlay(true); } },
    draw() {
      ctx.fillStyle = '#05030a'; ctx.fillRect(0, 0, VW, VH);
      const n = Math.floor((G.sceneT || 0) / 40);
      STORY.forEach((l, i) => { if (i <= n) { ctx.globalAlpha = clamp(((G.sceneT || 0) - i * 40) / 30, 0, 1); txt(l, VW / 2, 110 + i * 40, 22, '#fff', 'center'); } });
      ctx.globalAlpha = 1;
      if ((G.t >> 5) % 2 === 0) txt('JUMP / ENTER / タップ ではじめる', VW / 2, VH - 70, 16, '#ffd060', 'center');
    }
  },
  howto: {
    enter() { setMenu([{ t: 'もどる', f: () => goScene('title') }], () => goScene('title')); },
    update() { updMenu(); },
    draw() {
      drawTitleBG(); txt('あそびかた', VW / 2, 30, 30, '#fff', 'center', 5);
      ctx.fillStyle = 'rgba(0,0,0,.6)'; rrect(ctx, 90, 80, 620, 400, 10); ctx.fill();
      HOWTO.forEach(([a, b], i) => { txt(a, 120, 98 + i * 30, 18, '#ffd060'); txt(b, 300, 98 + i * 30, 18, '#fff'); });
      HOWTO_TIPS.forEach((l, i) => txt('・' + l, 120, 350 + i * 28, 16, '#cfe'));
      drawMenu(VW / 2, 516, 50, 20, 240);
    }
  },
  options: {
    enter() {
      const o = Store.data.opt, on = v => v ? 'ON' : 'OFF';
      const apply = () => { SND.opt.bgm = o.bgm; SND.opt.se = o.se; SND.applyVol(); Store.save(); };
      setMenu([
        { t: () => ['BGM', on(o.bgm)], f: () => { o.bgm = !o.bgm; apply(); } },
        { t: () => ['効果音', on(o.se)], f: () => { o.se = !o.se; apply(); } },
        { t: () => ['画面の揺れ', on(o.shake)], f: () => { o.shake = !o.shake; apply(); } },
        { t: 'もどる', f: () => goScene(optReturn) }
      ], () => goScene(optReturn));
    },
    update() { updMenu(); },
    draw() {
      if (optReturn === 'pause') { drawPlay(); ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(0, 0, VW, VH); } else drawTitleBG();
      txt('オプション', VW / 2, 90, 32, '#fff', 'center', 5); drawMenu(VW / 2, 190, 64, 22, 420);
    }
  },
  play: {
    update() {
      const I = Input;
      if (I.p.pause) { goScene('pause'); return; }
      if (I.p.retry && !G.trans) { respawn(); return; }
      updatePlay();
    },
    draw() { drawPlay(); }
  },
  pause: {
    enter() {
      SND.setDuck(0.4);
      setMenu([
        { t: 'つづける', f: resume },
        { t: 'リトライ', f: () => { resume(); respawn(); } },
        { t: 'オプション', f: () => { optReturn = 'pause'; goScene('options'); } },
        { t: 'タイトルへ', f: () => { Store.save(); SND.setDuck(1); goScene('title'); } }
      ], resume);
    },
    update() { if (Input.p.pause && G.sceneT > 2) { resume(); return; } G.sceneT++; updMenu(); },
    draw() {
      drawPlay(); ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(0, 0, VW, VH);
      txt('PAUSE', VW / 2, 100, 48, '#fff', 'center', 6);
      const rd = (G.data.roomDeaths || {})[G.R.idx] || 0;
      txt('この部屋での死亡: ' + rd + '   宝石: ' + G.data.gems.length + '/' + GEM_TOTAL, VW / 2, 166, 16, '#ffd060', 'center', 3);
      drawMenu(VW / 2, 220, 60, 22, 360);
    }
  },
  ending: {
    enter() { G.menu = null; },
    update() {
      G.endT++;
      if (G.endT > 240 && (Input.p.ok || Input.p.back || G.click) && G.endT > endLen() * 0.4) { G.click = null; goScene('title'); }
    },
    draw() { drawEnding(); }
  }
};
function resume() { SND.setDuck(1); G.scene = 'play'; G.menu = null; }
function endLines() {
  const d = G.data, all = d.gems.length >= GEM_TOTAL;
  const L = ['鬼神を討ち果たしたヒロは、', 'ついに『鬼の宝玉』を手にした。', '', '願いはひとつ――', '「もう二度と、トゲを見ませんように」', ''];
  if (all) L.push('そのとき、集めた' + GEM_TOTAL + '個の宝石が宝玉に吸い込まれ、', 'まばゆい光が城を包み込んだ。', '「よくぞ辿り着いた、真の勇者よ」', '鬼罠城の罠は、すべて花に変わったという。', '');
  else L.push('……だが宝玉は少しだけ寂しそうに光った。', '城のどこかに、まだ宝石が眠っているようだ。', '');
  L.push('', '～ STAFF ～', '', 'GAME DESIGN', 'hiro / ヒロ', '', 'PROGRAM・GRAPHICS・SOUND', 'hiro / ヒロ', '', 'SPECIAL THANKS', 'ここまで死に続けたあなた', '', '', 'THANK YOU FOR PLAYING!');
  return L;
}
function endLen() { return endLines().length * 44 + VH; }
function drawEnding() {
  const d = G.data;
  const g = ctx.createLinearGradient(0, 0, 0, VH); g.addColorStop(0, '#05030f'); g.addColorStop(1, '#2a0f45');
  ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  for (let i = 0; i < 80; i++) { ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.5 * Math.abs(Math.sin(G.t * 0.02 + i))})`; ctx.fillRect((i * 97) % VW, (i * 53) % VH, 2, 2); }
  const L = endLines(), sy = VH - G.endT * 0.7;
  L.forEach((l, i) => { const y = sy + i * 44; if (y > -40 && y < VH) txt(l, VW / 2, y, l.startsWith('～') || l.startsWith('THANK') ? 30 : 22, l.startsWith('THANK') ? '#ffd060' : '#fff', 'center', 3); });
  if (sy + L.length * 44 < VH * 0.5) {
    const rank = d.endDeaths <= 300 ? 'S' : d.endDeaths <= 800 ? 'A' : d.endDeaths <= 2000 ? 'B' : 'C';
    ctx.fillStyle = 'rgba(0,0,0,.7)'; rrect(ctx, 160, 120, 480, 330, 12); ctx.fill();
    ctx.strokeStyle = '#ffd060'; ctx.lineWidth = 2; rrect(ctx, 160, 120, 480, 330, 12); ctx.stroke();
    txt('RESULT', VW / 2, 140, 30, '#ffd060', 'center', 4);
    txt('難易度   ' + DIFFS[d.diff].name, VW / 2, 200, 22, '#fff', 'center');
    txt('死亡回数   ' + d.endDeaths, VW / 2, 240, 22, '#fff', 'center');
    txt('クリア時間   ' + fmtTime(d.endTime), VW / 2, 280, 22, '#fff', 'center');
    txt('宝石   ' + d.gems.length + ' / ' + GEM_TOTAL, VW / 2, 320, 22, '#fff', 'center');
    txt('RANK ' + rank, VW / 2, 370, 40, rank === 'S' ? '#ffd060' : '#ff6070', 'center', 5);
    if ((G.t >> 5) % 2 === 0) txt('JUMP / タップでタイトルへ', VW / 2, 480, 18, '#ccc', 'center', 3);
    txt('made by hiro/ヒロ', VW / 2, VH - 50, 16, '#aaa', 'center');
  }
  drawKid(ctx, VW / 2 - 6 + Math.sin(G.t * 0.02) * 200, VH - 40, Math.cos(G.t * 0.02) > 0 ? 1 : -1, 'run', G.t, 0, 1.5);
}

// ---------- プレイ中の更新 ----------
function updatePlay() {
  const I = Input, p = G.p;
  G.rt++;
  if (!p.dead && !G.trans) G.data.time++;
  G.solids = G.ents.filter(e => e.solid && !e.done && e.vis);
  for (let i = 0; i < G.ents.length; i++) updateEnt(G.ents[i]);
  if (G.spawnQ.length) { for (const e of G.spawnQ) G.ents.push(e); G.spawnQ.length = 0; }
  G.solids = G.ents.filter(e => e.solid && !e.done && e.vis);
  if (!p.dead && !G.trans) {
    physStep(p, { l: I.cur.left, r: I.cur.right, jp: I.p.jump, jh: I.cur.jump });
    if (p.ev & 1) { SND.sfx('jump'); burst(p.x + 6, p.y + p.h, 6, '#ddd', 1.5, { g: 0, life: 14, sz: 2 }); }
    if (p.ev & 2) { SND.sfx('djump'); burst(p.x + 6, p.y + p.h, 10, ['#8ff', '#fff'], 2.2, { g: 0, life: 16, sz: 2 }); }
    if (p.ev & 4) SND.sfx('boing');
    if (p.ev & 8) burst(p.x + 6, p.y + p.h, 4, '#ccc', 1.2, { g: 0, vy: -0.5, life: 10, sz: 2 });
    if (p.tdead) killPlayer(); else playerEntInteract(p);
    if (!p.dead && I.p.shoot) shoot();
    p.anim++;
  }
  updBullets(); updCrumble(); updParts();
  if (G.ents.length > 60) G.ents = G.ents.filter(e => !e.done || e.k === 'boss');
  if (p.dead) G.deadT++;
  if (G.trans) updTrans();
  if (G.shake > 0) G.shake = G.shake < 0.5 ? 0 : G.shake * 0.86;
  if (G.flash > 0) G.flash--;
  if (G.card) { G.card.t++; if (G.card.t > 180) G.card = null; }
  if (G.msg) { G.msg.t--; if (G.msg.t <= 0) G.msg = null; }
  if (G.t % 600 === 0) Store.save();
}

// =====================================================================
//  起動・DOM
// =====================================================================
function fit() {
  const touch = document.body.classList.contains('touch');
  const W = window.innerWidth, H = window.innerHeight, portrait = H > W;
  document.body.classList.toggle('portrait', portrait);
  const availH = touch && portrait ? H - 230 : H, availW = W;
  const s = Math.max(0.1, Math.min(availW / VW, availH / VH));
  cvs.style.width = Math.floor(VW * s) + 'px';
  cvs.style.height = Math.floor(VH * s) + 'px';
}
function setupDOM() {
  addEventListener('keydown', e => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Backspace'].includes(e.code)) e.preventDefault();
    Input.codes.add(e.code); SND.init();
  });
  addEventListener('keyup', e => Input.codes.delete(e.code));
  addEventListener('blur', () => Input.clear());
  document.addEventListener('visibilitychange', () => { if (document.hidden) { Input.clear(); if (G.scene === 'play') goScene('pause'); } });
  cvs.addEventListener('pointerdown', e => {
    SND.init();
    const r = cvs.getBoundingClientRect();
    G.click = { x: (e.clientX - r.left) * VW / r.width, y: (e.clientY - r.top) * VH / r.height };
  });
  const pad = document.getElementById('pad');
  const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
  if (isTouch && pad) {
    document.body.classList.add('touch');
    const upd = e => {
      if (e.cancelable) e.preventDefault();
      SND.init();
      const st = {};
      for (const t of e.touches) {
        const el = document.elementFromPoint(t.clientX, t.clientY);
        const b = el && el.closest ? el.closest('[data-btn]') : null;
        if (b) st[b.dataset.btn] = true;
      }
      Input.touch = st;
      pad.querySelectorAll('[data-btn]').forEach(b => b.classList.toggle('on', !!st[b.dataset.btn]));
    };
    ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(ev => pad.addEventListener(ev, upd, { passive: false }));
  }
  // Safari: 長押しメニュー・ダブルタップ拡大・ピンチ拡大を防止
  document.addEventListener('touchmove', e => { if (!e.target.closest('a') && e.cancelable) e.preventDefault(); }, { passive: false });
  let lastTouch = 0;
  document.addEventListener('touchend', e => {
    const now = Date.now();
    if (now - lastTouch < 350 && !e.target.closest('a') && e.cancelable) e.preventDefault();
    lastTouch = now;
  }, { passive: false });
  ['gesturestart', 'gesturechange', 'gestureend', 'dblclick', 'contextmenu', 'selectstart'].forEach(ev => document.addEventListener(ev, e => { if (!e.target.closest || !e.target.closest('a')) e.preventDefault(); }, { passive: false }));
  addEventListener('resize', fit);
  addEventListener('orientationchange', () => setTimeout(fit, 200));
  fit();
}
function step() {
  Input.update(G.scene !== 'play');
  if (Input.p.mute) toggleMute();
  G.t++;
  if (SCN[G.scene].update) SCN[G.scene].update();
  G.click = null;
  if (G.sceneT !== undefined && G.scene !== 'story' && G.scene !== 'pause') G.sceneT++;
}
let lastT = 0, accT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (!lastT) lastT = now;
  let dt = now - lastT; lastT = now;
  if (dt > 200) dt = 200;
  accT += dt;
  let n = 0;
  try {
    while (accT >= 1000 / 60 && n < 4) { step(); accT -= 1000 / 60; n++; }
    if (n >= 4) accT = 0;
    ctx.imageSmoothingEnabled = false;
    SCN[G.scene].draw();
  } catch (err) { console.error(err); }
  const cr = document.getElementById('credit');
  if (cr) cr.classList.toggle('hide', G.scene === 'play' || G.scene === 'pause');
}
function boot() {
  Store.load();
  setupDOM();
  goScene('title');
  if (document.fonts && document.fonts.load) document.fonts.load('20px "DotGothic16"').catch(() => { });
  requestAnimationFrame(frame);
}
window.ONIWANA = { G, ROOMS, solveRoom, loadRoom, buildRoom, mkEnt, physStep, newPlayer, step, SCN, goScene, Input, Store, updatePlay };
if (!window.__ONI_TEST__) boot();
