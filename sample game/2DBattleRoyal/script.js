/* ============================================================
   BATTLE ROYALE 24  -  script.js
   24人バトルロイヤル・トップダウンシューター
   made by hiro/ヒロ  https://github.com/h1ro223
============================================================ */
'use strict';

/* ================= DOM ================= */
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
const mm = document.getElementById('minimap');
const mctx = mm.getContext('2d');
const $ = id => document.getElementById(id);

const ui = {
  hud: $('hud'), alive: $('aliveNum'), kills: $('killNum'), zoneMsg: $('zoneMsg'),
  feed: $('killfeed'), hpFill: $('hpFill'), hpText: $('hpText'), armorFill: $('armorFill'),
  healCast: $('healCast'), healCastFill: $('healCastFill'), healCastLabel: $('healCastLabel'),
  bandageNum: $('bandageNum'), medkitNum: $('medkitNum'),
  wslot: [$('wslot0'), $('wslot1')], ammoMag: $('ammoMag'), ammoReserve: $('ammoReserve'),
  prompt: $('prompt'), vignette: $('vignette'), countdown: $('countdown'),
  menu: $('menu'), result: $('result'), touchUI: $('touchUI'),
  btnPick: $('btnPick'), spectateBar: $('spectateBar'), specName: $('specName'),
};

/* ================= 定数 ================= */
const TAU = Math.PI * 2;
const MAP = 3200;                 // マップ一辺(px)
const TOTAL_PLAYERS = 24;
const PLAYER_R = 15;
const IS_TOUCH = (window.matchMedia && matchMedia('(pointer: coarse)').matches) ||
  (!window.matchMedia && 'ontouchstart' in window);
// roundRect 互換性ポリフィル
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
    return this;
  };
}

const WEAPONS = {
  fist:    { name: '素手',       short: '素手', dmg: 15, rate: 0.45, melee: true, range: 58 },
  pistol:  { name: 'ピストル',   short: 'HG',  dmg: 17, rate: 0.30, spread: 0.055, speed: 950,  mag: 12, reload: 1.2, auto: false, pellets: 1, life: 0.65, tier: 1, w: 40 },
  smg:     { name: 'サブマシンガン', short: 'SMG', dmg: 12, rate: 0.09, spread: 0.115, speed: 880,  mag: 30, reload: 1.6, auto: true,  pellets: 1, life: 0.52, tier: 2, w: 46 },
  shotgun: { name: 'ショットガン', short: 'SG',  dmg: 9,  rate: 0.95, spread: 0.21,  speed: 820,  mag: 5,  reload: 2.2, auto: false, pellets: 7, life: 0.30, tier: 2, w: 52 },
  ar:      { name: 'アサルトライフル', short: 'AR', dmg: 21, rate: 0.125, spread: 0.045, speed: 1150, mag: 30, reload: 1.9, auto: true, pellets: 1, life: 0.80, tier: 3, w: 54 },
  sniper:  { name: 'スナイパー', short: 'SR',  dmg: 80, rate: 1.55, spread: 0.004, speed: 1700, mag: 5,  reload: 2.6, auto: false, pellets: 1, life: 1.25, tier: 3, w: 62 },
};
// 出現率(重み)
const WEAPON_POOL = [
  ['pistol', 30], ['smg', 24], ['shotgun', 20], ['ar', 18], ['sniper', 8],
];
const HEAL_ITEMS = {
  bandage: { name: '包帯',     heal: 30, time: 2.0 },
  medkit:  { name: '医療キット', heal: 80, time: 4.0 },
};
const BOT_NAMES = ['タカシ', 'ケンジ', 'ユウキ', 'サトシ', 'アキラ', 'ヒカル', 'レン', 'ソラ',
  'カイト', 'リク', 'ハルト', 'ミナト', 'ダイチ', 'ツバサ', 'ショウ', 'ゴウ',
  'ライト', 'ジン', 'ノア', 'レオ', 'イツキ', 'カズマ', 'トモヤ'];
const BOT_COLORS = ['#c94f4f', '#4f74c9', '#c9a24f', '#7d4fc9', '#4fc9b0', '#c94f9d',
  '#8ec94f', '#c9784f', '#4fa6c9', '#a0a0a0'];

/* ================= ユーティリティ ================= */
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
function pickWeighted(pool) {
  let total = 0;
  for (const [, w] of pool) total += w;
  let r = Math.random() * total;
  for (const [k, w] of pool) { r -= w; if (r <= 0) return k; }
  return pool[0][0];
}

/* ================= オーディオ(WebAudio合成) ================= */
let AC = null, master = null;
function initAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain();
    master.gain.value = 0.22;
    master.connect(AC.destination);
  } catch (e) { AC = null; }
}
function noiseBuf(len) {
  const b = AC.createBuffer(1, AC.sampleRate * len, AC.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function sfxShot(type, vol = 1) {
  if (!AC || vol <= 0.02) return;
  const t = AC.currentTime;
  const cfg = {
    pistol:  { f: 900,  len: 0.12 }, smg: { f: 1100, len: 0.09 },
    shotgun: { f: 500,  len: 0.22 }, ar:  { f: 800,  len: 0.13 },
    sniper:  { f: 380,  len: 0.30 }, fist: { f: 300, len: 0.06 },
  }[type] || { f: 800, len: 0.12 };
  const src = AC.createBufferSource();
  src.buffer = noiseBuf(cfg.len);
  const flt = AC.createBiquadFilter();
  flt.type = 'lowpass';
  flt.frequency.setValueAtTime(cfg.f * 3, t);
  flt.frequency.exponentialRampToValueAtTime(120, t + cfg.len);
  const g = AC.createGain();
  g.gain.setValueAtTime(0.9 * vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + cfg.len);
  src.connect(flt); flt.connect(g); g.connect(master);
  src.start(t); src.stop(t + cfg.len);
}
function sfxTone(freq, len, vol, type = 'square') {
  if (!AC) return;
  const t = AC.currentTime;
  const o = AC.createOscillator();
  o.type = type; o.frequency.value = freq;
  const g = AC.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + len);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + len);
}
const sfxPickup = () => { sfxTone(660, 0.08, 0.25); sfxTone(990, 0.12, 0.2); };
const sfxHit = () => sfxTone(220, 0.06, 0.3, 'sawtooth');
const sfxHitMe = () => sfxTone(140, 0.12, 0.4, 'sawtooth');
const sfxHeal = () => { sfxTone(520, 0.1, 0.2, 'sine'); sfxTone(780, 0.18, 0.2, 'sine'); };
const sfxZone = () => { sfxTone(300, 0.35, 0.25, 'triangle'); sfxTone(240, 0.5, 0.2, 'triangle'); };
const sfxEmpty = () => sfxTone(1400, 0.04, 0.15);
const sfxKill = () => { sfxTone(880, 0.08, 0.25); sfxTone(1320, 0.14, 0.22); };

/* ================= 画面サイズ ================= */
let VW = 0, VH = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  VW = window.innerWidth; VH = window.innerHeight;
  cv.width = VW * DPR; cv.height = VH * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize);
resize();

/* ================= 地面テクスチャ ================= */
const grassPat = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 220;
  const g = c.getContext('2d');
  g.fillStyle = '#5c7a45';
  g.fillRect(0, 0, 220, 220);
  for (let i = 0; i < 220; i++) {
    g.fillStyle = `rgba(${randi(60, 90)},${randi(95, 130)},${randi(45, 70)},${rand(0.15, 0.4)})`;
    g.fillRect(rand(0, 220), rand(0, 220), rand(2, 6), rand(2, 6));
  }
  for (let i = 0; i < 26; i++) {
    g.fillStyle = `rgba(70, 92, 50, ${rand(0.12, 0.25)})`;
    g.beginPath();
    g.ellipse(rand(0, 220), rand(0, 220), rand(12, 34), rand(8, 22), rand(0, TAU), 0, TAU);
    g.fill();
  }
  return ctx.createPattern(c, 'repeat');
})();

/* ================= ワールド ================= */
let walls = [], floors = [], trees = [], rocks = [], patches = [];
let loots = [], players = [], bullets = [], parts = [], feed = [];
let me = null, camX = MAP / 2, camY = MAP / 2, camTarget = null, shake = 0;
let zone = null;
let state = 'menu'; // menu / count / play / over
let countT = 0, matchT = 0, hurtT = 0, myRank = 0, spectating = false;
let promptLoot = null;

function pointInRect(x, y, r, m = 0) {
  return x > r.x - m && x < r.x + r.w + m && y > r.y - m && y < r.y + r.h + m;
}
function inAnyFloor(x, y, m = 0) {
  for (const f of floors) if (pointInRect(x, y, f, m)) return true;
  return false;
}
function inAnyWall(x, y, m = 0) {
  for (const w of walls) if (pointInRect(x, y, w, m)) return true;
  return false;
}

function addBuilding(bx, by, bw, bh) {
  floors.push({ x: bx, y: by, w: bw, h: bh });
  const T = 14, DOOR = 74;
  const sides = [0, 1, 2, 3].sort(() => Math.random() - 0.5).slice(0, 2); // 扉2ヶ所
  // side: 0=上 1=下 2=左 3=右
  for (let s = 0; s < 4; s++) {
    const horizontal = s < 2;
    const len = horizontal ? bw : bh;
    const hasDoor = sides.includes(s) && len > DOOR + 80;
    const segs = [];
    if (hasDoor) {
      const dStart = rand(30, len - DOOR - 30);
      segs.push([0, dStart], [dStart + DOOR, len]);
    } else segs.push([0, len]);
    for (const [a, b] of segs) {
      if (b - a < 4) continue;
      if (horizontal) walls.push({ x: bx + a, y: s === 0 ? by : by + bh - T, w: b - a, h: T });
      else walls.push({ x: s === 2 ? bx : bx + bw - T, y: by + a, w: T, h: b - a });
    }
  }
  // 建物内にレア寄りの物資
  const n = randi(3, 5);
  for (let i = 0; i < n; i++) {
    spawnLoot(rand(bx + 44, bx + bw - 44), rand(by + 44, by + bh - 44), true);
  }
}

function spawnLoot(x, y, rich = false) {
  const r = Math.random();
  let item;
  if (r < (rich ? 0.42 : 0.32)) {
    const w = pickWeighted(WEAPON_POOL);
    item = { type: 'weapon', weapon: w, rounds: WEAPONS[w].mag };
  } else if (r < 0.55) item = { type: 'ammo', amount: 40 };
  else if (r < 0.72) item = { type: 'bandage' };
  else if (r < (rich ? 0.84 : 0.88)) item = { type: 'medkit' };
  else item = { type: 'armor', amount: 50 };
  item.x = x; item.y = y; item.bob = rand(0, TAU);
  loots.push(item);
  return item;
}

function genWorld() {
  walls = []; floors = []; trees = []; rocks = []; patches = [];
  loots = []; bullets = []; parts = []; feed = [];
  // 建物
  const spots = [];
  for (let tries = 0; tries < 400 && spots.length < 8; tries++) {
    const bw = rand(240, 380), bh = rand(200, 320);
    const bx = rand(220, MAP - 220 - bw), by = rand(220, MAP - 220 - bh);
    let ok = true;
    for (const s of spots) {
      if (bx < s.x + s.w + 160 && bx + bw + 160 > s.x && by < s.y + s.h + 160 && by + bh + 160 > s.y) { ok = false; break; }
    }
    if (ok) spots.push({ x: bx, y: by, w: bw, h: bh });
  }
  for (const s of spots) addBuilding(s.x, s.y, s.w, s.h);
  // 土のパッチ(装飾)
  for (let i = 0; i < 22; i++) {
    patches.push({ x: rand(100, MAP - 100), y: rand(100, MAP - 100), rx: rand(60, 170), ry: rand(40, 110), a: rand(0, TAU) });
  }
  // 木と岩
  for (let i = 0; i < 140; i++) {
    const x = rand(60, MAP - 60), y = rand(60, MAP - 60);
    if (inAnyFloor(x, y, 60)) continue;
    if (Math.random() < 0.68) trees.push({ x, y, r: 12, cr: rand(36, 52) });
    else rocks.push({ x, y, r: rand(18, 34) });
  }
  // 野良の物資
  for (let i = 0; i < 95; i++) {
    const x = rand(80, MAP - 80), y = rand(80, MAP - 80);
    if (inAnyWall(x, y, 26)) continue;
    spawnLoot(x, y);
  }
  // ゾーン
  zone = {
    cx: MAP / 2, cy: MAP / 2, r: 1580,
    tcx: MAP / 2, tcy: MAP / 2, tr: 1580,
    phase: 0, waiting: true, timer: 25, dps: 1, done: false,
  };
  setNextZone();
}

const ZONE_PHASES = [
  { wait: 25, shrink: 18, mult: 0.62, dps: 1 },
  { wait: 20, shrink: 14, mult: 0.58, dps: 2.5 },
  { wait: 16, shrink: 12, mult: 0.55, dps: 5 },
  { wait: 13, shrink: 10, mult: 0.50, dps: 8 },
  { wait: 10, shrink: 8,  mult: 0.45, dps: 12 },
  { wait: 8,  shrink: 7,  mult: 0.40, dps: 16 },
];
function setNextZone() {
  const p = ZONE_PHASES[Math.min(zone.phase, ZONE_PHASES.length - 1)];
  zone.tr = Math.max(zone.r * p.mult, 60);
  const maxOff = zone.r - zone.tr;
  const a = rand(0, TAU), d = rand(0, maxOff * 0.85);
  zone.tcx = clamp(zone.cx + Math.cos(a) * d, zone.tr, MAP - zone.tr);
  zone.tcy = clamp(zone.cy + Math.sin(a) * d, zone.tr, MAP - zone.tr);
  zone.waiting = true;
  zone.timer = p.wait;
  zone.dps = p.dps;
}
function updateZone(dt) {
  if (zone.done) return;
  zone.timer -= dt;
  if (zone.waiting) {
    if (zone.timer <= 0) {
      const p = ZONE_PHASES[Math.min(zone.phase, ZONE_PHASES.length - 1)];
      zone.waiting = false;
      zone.timer = p.shrink;
      zone.startR = zone.r; zone.startX = zone.cx; zone.startY = zone.cy;
      zone.shrinkLen = p.shrink;
      if (me && me.alive) sfxZone();
    }
  } else {
    const p = 1 - clamp(zone.timer / zone.shrinkLen, 0, 1);
    zone.r = zone.startR + (zone.tr - zone.startR) * p;
    zone.cx = zone.startX + (zone.tcx - zone.startX) * p;
    zone.cy = zone.startY + (zone.tcy - zone.startY) * p;
    if (zone.timer <= 0) {
      zone.r = zone.tr; zone.cx = zone.tcx; zone.cy = zone.tcy;
      zone.phase++;
      if (zone.r <= 62) { zone.done = true; zone.dps = 20; }
      else setNextZone();
    }
  }
}

/* ================= プレイヤー ================= */
function makePlayer(isBot, name, color) {
  return {
    isBot, name, color,
    x: 0, y: 0, angle: 0, r: PLAYER_R,
    hp: 100, armor: 0, alive: true,
    weapons: [{ type: 'fist', magNow: 0 }, null],
    slot: 0, ammo: 60, bandages: isBot ? 2 : 1, medkits: 0,
    fireCd: 0, reloadT: 0, healT: 0, healType: null,
    kills: 0, dmgDealt: 0, hurtT: 0, zoneTick: 0,
    // bot用
    think: rand(0, 0.3), tx: 0, ty: 0, roamT: 0, strafe: Math.random() < 0.5 ? 1 : -1,
    strafeT: 0, stuckT: 0, lastX: 0, lastY: 0, target: null, aimErr: rand(0.15, 0.28),
    burstT: 0, losOk: false,
  };
}
function curWeapon(p) { return p.weapons[p.slot]; }
function weaponDef(p) { return WEAPONS[curWeapon(p).type]; }

function spawnPlayers() {
  players = [];
  me = makePlayer(false, 'あなた', '#ffd45e');
  players.push(me);
  const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  for (let i = 0; i < TOTAL_PLAYERS - 1; i++) {
    players.push(makePlayer(true, names[i % names.length], pick(BOT_COLORS)));
  }
  // 重ならないように配置
  for (const p of players) {
    for (let t = 0; t < 300; t++) {
      // 試行を重ねるごとに要求間隔を緩和(440px→最低260px)
      const minD = Math.max(260, 440 - Math.max(0, t - 120) * 2);
      const a = rand(0, TAU), d = rand(0, zone.r * 0.9);
      const x = zone.cx + Math.cos(a) * d, y = zone.cy + Math.sin(a) * d;
      if (x < 60 || y < 60 || x > MAP - 60 || y > MAP - 60) continue;
      if (inAnyFloor(x, y, 40)) continue;
      let ok = true;
      for (const q of players) {
        if (q !== p && q.x && dist(x, y, q.x, q.y) < minD) { ok = false; break; }
      }
      if (ok || t === 299) { p.x = x; p.y = y; if (ok) break; }
    }
    p.lastX = p.x; p.lastY = p.y;
  }
  camX = me.x; camY = me.y; camTarget = me;
}

/* ================= 衝突 ================= */
function resolveCollisions(p) {
  // 壁(矩形)
  for (const w of walls) {
    const cx = clamp(p.x, w.x, w.x + w.w);
    const cy = clamp(p.y, w.y, w.y + w.h);
    const dx = p.x - cx, dy = p.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < p.r * p.r) {
      const d = Math.sqrt(d2) || 0.001;
      p.x = cx + dx / d * p.r;
      p.y = cy + dy / d * p.r;
    }
  }
  // 木の幹・岩(円)
  for (const arr of [trees, rocks]) {
    for (const o of arr) {
      const dx = p.x - o.x, dy = p.y - o.y;
      const min = p.r + o.r;
      const d2 = dx * dx + dy * dy;
      if (d2 < min * min && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        p.x = o.x + dx / d * min;
        p.y = o.y + dy / d * min;
      }
    }
  }
  p.x = clamp(p.x, p.r, MAP - p.r);
  p.y = clamp(p.y, p.r, MAP - p.r);
}
function blockedAt(x, y) {
  if (inAnyWall(x, y)) return true;
  for (const t of trees) { const dx = x - t.x, dy = y - t.y; if (dx * dx + dy * dy < t.r * t.r) return true; }
  for (const rk of rocks) { const dx = x - rk.x, dy = y - rk.y; if (dx * dx + dy * dy < rk.r * rk.r) return true; }
  return false;
}
function hasLOS(x1, y1, x2, y2) {
  const d = dist(x1, y1, x2, y2);
  const steps = Math.ceil(d / 18);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (blockedAt(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return false;
  }
  return true;
}

/* ================= 戦闘 ================= */
function tryFire(p) {
  if (p.fireCd > 0 || p.reloadT > 0 || !p.alive) return;
  const w = curWeapon(p), def = WEAPONS[w.type];
  if (p.healT > 0) { p.healT = 0; p.healType = null; } // 射撃で回復キャンセル
  if (def.melee) {
    p.fireCd = def.rate;
    meleeAttack(p, def);
    return;
  }
  if (w.magNow <= 0) {
    if (p.ammo > 0) startReload(p);
    else if (p === me) sfxEmpty();
    return;
  }
  w.magNow--;
  p.fireCd = def.rate;
  const dmgMul = p.isBot ? 0.75 : 1; // BOTの与ダメージは控えめに
  const n = def.pellets || 1;
  for (let i = 0; i < n; i++) {
    const a = p.angle + rand(-def.spread, def.spread);
    bullets.push({
      x: p.x + Math.cos(p.angle) * (p.r + 14),
      y: p.y + Math.sin(p.angle) * (p.r + 14),
      vx: Math.cos(a) * def.speed, vy: Math.sin(a) * def.speed,
      dmg: def.dmg * dmgMul, owner: p, life: def.life, wname: def.name,
    });
  }
  // マズルフラッシュ
  parts.push({
    type: 'muzzle', x: p.x + Math.cos(p.angle) * (p.r + 18), y: p.y + Math.sin(p.angle) * (p.r + 18),
    life: 0.05, maxLife: 0.05, size: w.type === 'shotgun' || w.type === 'sniper' ? 16 : 11,
  });
  const vol = p === me ? 1 : clamp(1 - dist(p.x, p.y, camX, camY) / 950, 0, 0.8);
  sfxShot(w.type, vol);
  if (p === me) shake = Math.min(shake + (def.pellets > 1 ? 5 : 2.5), 9);
}
function meleeAttack(p, def) {
  const vol = p === me ? 0.7 : clamp(0.6 - dist(p.x, p.y, camX, camY) / 700, 0, 0.5);
  sfxShot('fist', vol);
  parts.push({ type: 'muzzle', x: p.x + Math.cos(p.angle) * (p.r + 16), y: p.y + Math.sin(p.angle) * (p.r + 16), life: 0.07, maxLife: 0.07, size: 8 });
  for (const q of players) {
    if (q === p || !q.alive) continue;
    const d = dist(p.x, p.y, q.x, q.y);
    if (d > def.range + q.r) continue;
    const ang = Math.atan2(q.y - p.y, q.x - p.x);
    let diff = Math.abs(ang - p.angle) % TAU;
    if (diff > Math.PI) diff = TAU - diff;
    if (diff < 0.9) damagePlayer(q, def.dmg * (p.isBot ? 0.75 : 1), p, def.name);
  }
}
function startReload(p) {
  const w = curWeapon(p), def = WEAPONS[w.type];
  if (def.melee || p.reloadT > 0) return;
  if (w.magNow >= def.mag || p.ammo <= 0) return;
  p.reloadT = def.reload;
}
function finishReload(p) {
  const w = curWeapon(p), def = WEAPONS[w.type];
  const need = def.mag - w.magNow;
  const take = Math.min(need, p.ammo);
  w.magNow += take; p.ammo -= take;
}
function switchSlot(p, s) {
  if (s === p.slot || !p.weapons[s]) return;
  p.slot = s;
  p.reloadT = 0;
  p.fireCd = Math.max(p.fireCd, 0.18);
}

function damagePlayer(t, dmg, attacker, wname) {
  if (!t.alive) return;
  let d = dmg;
  if (t.armor > 0) {
    const absorbed = Math.min(t.armor, d * 0.5);
    t.armor -= absorbed;
    d -= absorbed;
  }
  t.hp -= d;
  t.hurtT = 0.25;
  if (attacker) attacker.dmgDealt += Math.min(d, Math.max(t.hp + d, 0));
  // 血しぶき
  for (let i = 0; i < 5; i++) {
    parts.push({
      type: 'blood', x: t.x + rand(-6, 6), y: t.y + rand(-6, 6),
      vx: rand(-70, 70), vy: rand(-70, 70),
      life: rand(0.3, 0.6), maxLife: 0.6, size: rand(2, 4.5),
    });
  }
  if (t === me) { hurtT = 0.6; sfxHitMe(); shake = Math.min(shake + 4, 10); }
  else if (attacker === me) {
    sfxHit();
    parts.push({ type: 'text', x: t.x, y: t.y - 24, vy: -45, life: 0.6, maxLife: 0.6, text: Math.round(dmg) + '', color: '#ffd45e' });
  }
  if (t.hp <= 0) killPlayer(t, attacker, wname);
}
function killPlayer(t, attacker, wname) {
  t.alive = false; t.hp = 0;
  if (attacker && attacker !== t) attacker.kills++;
  addFeed(attacker, t, wname);
  dropLoot(t);
  for (let i = 0; i < 14; i++) {
    parts.push({
      type: 'blood', x: t.x, y: t.y,
      vx: rand(-140, 140), vy: rand(-140, 140),
      life: rand(0.4, 0.9), maxLife: 0.9, size: rand(2.5, 6),
    });
  }
  if (attacker === me) { sfxKill(); }
  if (t === me) {
    myRank = players.filter(p => p.alive).length + 1;
    setTimeout(() => { if (state === 'play') showResult(false); }, 1200);
  } else if (camTarget === t) {
    pickSpectateTarget(attacker);
  }
  checkGameEnd();
}
function addFeed(attacker, victim, wname) {
  const an = attacker ? nameSpan(attacker) : null;
  const vn = nameSpan(victim);
  let html;
  if (!attacker || attacker === victim) html = `${vn} はブルーゾーンで倒れた`;
  else html = `${an} が ${vn} を倒した <b>[${wname}]</b>`;
  feed.push({ html, t: 6 });
  if (feed.length > 5) feed.shift();
  renderFeed();
}
function nameSpan(p) {
  return p === me ? `<span class="fk-me">あなた</span>` : p.name;
}
function renderFeed() {
  ui.feed.innerHTML = feed.map(f => `<div class="feed-line" style="opacity:${clamp(f.t / 1.5, 0, 1)}">${f.html}</div>`).join('');
}
function dropLoot(p) {
  for (const w of p.weapons) {
    if (w && w.type !== 'fist') {
      const l = { type: 'weapon', weapon: w.type, rounds: w.magNow, x: p.x + rand(-26, 26), y: p.y + rand(-26, 26), bob: rand(0, TAU) };
      loots.push(l);
    }
  }
  if (p.ammo > 15) loots.push({ type: 'ammo', amount: Math.min(p.ammo, 60), x: p.x + rand(-26, 26), y: p.y + rand(-26, 26), bob: 0 });
  if (p.medkits > 0) loots.push({ type: 'medkit', x: p.x + rand(-26, 26), y: p.y + rand(-26, 26), bob: 0 });
  else if (p.bandages > 0) loots.push({ type: 'bandage', x: p.x + rand(-26, 26), y: p.y + rand(-26, 26), bob: 0 });
}

function checkGameEnd() {
  const alive = players.filter(p => p.alive);
  if (alive.length <= 1 && state === 'play') {
    state = 'over';
    const winner = alive[0];
    if (winner === me) {
      setTimeout(() => showResult(true), 900);
    } else {
      setTimeout(() => {
        showResult(false, winner ? winner.name : '---');
      }, 900);
    }
  }
}

/* ================= 回復 ================= */
function useHeal(p, type) {
  if (!p.alive || p.healT > 0 || p.hp >= 100) return;
  if (type === 'bandage' && p.bandages <= 0) return;
  if (type === 'medkit' && p.medkits <= 0) return;
  p.healType = type;
  p.healT = HEAL_ITEMS[type].time;
  p.healMax = HEAL_ITEMS[type].time;
}
function autoHealChoice(p) {
  if (p.hp >= 100) return;
  if (p.medkits > 0 && (100 - p.hp >= 55 || p.bandages <= 0)) useHeal(p, 'medkit');
  else if (p.bandages > 0) useHeal(p, 'bandage');
  else if (p.medkits > 0) useHeal(p, 'medkit');
}
function updateHeal(p, dt) {
  if (p.healT <= 0) return;
  p.healT -= dt;
  if (p.healT <= 0) {
    const item = HEAL_ITEMS[p.healType];
    if (p.healType === 'bandage') p.bandages--; else p.medkits--;
    p.hp = Math.min(100, p.hp + item.heal);
    p.healType = null;
    if (p === me) sfxHeal();
  }
}

/* ================= 物資取得 ================= */
function pickupLoot(p, l) {
  const idx = loots.indexOf(l);
  if (idx < 0) return false;
  if (l.type === 'ammo') { p.ammo = Math.min(240, p.ammo + l.amount); }
  else if (l.type === 'bandage') { if (p.bandages >= 8) return false; p.bandages++; }
  else if (l.type === 'medkit') { if (p.medkits >= 4) return false; p.medkits++; }
  else if (l.type === 'armor') { if (p.armor >= 100) return false; p.armor = Math.min(100, p.armor + l.amount); }
  else if (l.type === 'weapon') {
    // 素手スロット or 空きスロットへ
    let s = -1;
    for (let i = 0; i < 2; i++) if (!p.weapons[i] || p.weapons[i].type === 'fist') { s = i; break; }
    if (s < 0) return false; // 満杯(交換はswapで)
    p.weapons[s] = { type: l.weapon, magNow: l.rounds };
    if (WEAPONS[curWeapon(p).type].melee) p.slot = s; // 素手なら持ち替え
  }
  loots.splice(idx, 1);
  if (p === me) sfxPickup();
  return true;
}
function swapWeapon(p, l) {
  const idx = loots.indexOf(l);
  if (idx < 0 || l.type !== 'weapon') return;
  const cur = p.weapons[p.slot];
  loots.splice(idx, 1);
  if (cur && cur.type !== 'fist') {
    loots.push({ type: 'weapon', weapon: cur.type, rounds: cur.magNow, x: l.x, y: l.y, bob: 0 });
  }
  p.weapons[p.slot] = { type: l.weapon, magNow: l.rounds };
  p.reloadT = 0;
  if (p === me) sfxPickup();
}
function updatePickups(p) {
  promptLoot = p === me ? null : promptLoot;
  let nearestSwap = null, nsD = 52;
  for (let i = loots.length - 1; i >= 0; i--) {
    const l = loots[i];
    const d = dist(p.x, p.y, l.x, l.y);
    if (d > 60) continue;
    if (l.type !== 'weapon') { pickupLoot(p, l); continue; }
    // 武器: 空きがあれば自動、満杯なら交換候補
    let hasSpace = false;
    for (let s = 0; s < 2; s++) if (!p.weapons[s] || p.weapons[s].type === 'fist') hasSpace = true;
    if (hasSpace) pickupLoot(p, l);
    else if (p === me && d < nsD) { nearestSwap = l; nsD = d; }
    else if (p.isBot) {
      const cur = p.weapons[p.slot];
      if ((WEAPONS[l.weapon].tier || 0) > (WEAPONS[cur.type].tier || 0)) swapWeapon(p, l);
    }
  }
  if (p === me) promptLoot = nearestSwap;
}

/* ================= BOT AI ================= */
function botTier(p) {
  let best = 0;
  for (const w of p.weapons) if (w && WEAPONS[w.type].tier) best = Math.max(best, WEAPONS[w.type].tier);
  return best;
}
function updateBot(p, dt) {
  p.think -= dt;
  if (p.think <= 0) {
    p.think = rand(0.2, 0.35);
    botThink(p);
  }
  // 移動実行
  let spd = 215 * (p.healT > 0 ? 0.5 : 1);
  const dx = p.tx - p.x, dy = p.ty - p.y;
  const d = Math.hypot(dx, dy);
  if (d > 8) {
    let mx = dx / d, my = dy / d;
    if (p.target && p.target.alive && p.losOk) {
      // 戦闘中はストレイフ
      p.strafeT -= dt;
      if (p.strafeT <= 0) { p.strafeT = rand(0.5, 1.2); p.strafe *= -1; }
      const ta = Math.atan2(p.target.y - p.y, p.target.x - p.x);
      const td = dist(p.x, p.y, p.target.x, p.target.y);
      const w = curWeapon(p), def = WEAPONS[w.type];
      const idealD = def.melee ? 40 : def.pellets > 1 ? 130 : w.type === 'sniper' ? 430 : 250;
      const rad = td > idealD ? 1 : -1; // 距離調整
      mx = Math.cos(ta) * rad * 0.6 + Math.cos(ta + Math.PI / 2) * p.strafe * 0.8;
      my = Math.sin(ta) * rad * 0.6 + Math.sin(ta + Math.PI / 2) * p.strafe * 0.8;
      const mm2 = Math.hypot(mx, my) || 1;
      mx /= mm2; my /= mm2;
    }
    p.x += mx * spd * dt;
    p.y += my * spd * dt;
  }
  resolveCollisions(p);
  // スタック検知
  p.stuckT += dt;
  if (p.stuckT > 0.7) {
    if (dist(p.x, p.y, p.lastX, p.lastY) < 30 && d > 40) {
      p.tx = p.x + rand(-320, 320);
      p.ty = p.y + rand(-320, 320);
    }
    p.lastX = p.x; p.lastY = p.y; p.stuckT = 0;
  }
  // 照準と射撃
  if (p.target && p.target.alive && p.losOk) {
    const t = p.target;
    const td = dist(p.x, p.y, t.x, t.y);
    const err = p.aimErr * (0.6 + td / 380); // 距離が離れるほど不正確
    const ta = Math.atan2(t.y - p.y, t.x - p.x) + rand(-err, err);
    p.angle = ta;
    const def = weaponDef(p);
    const range = def.melee ? def.range + 6 : def.speed * def.life * 0.85;
    if (td < range) {
      p.burstT -= dt;
      if (p.burstT <= -rand(0.5, 0.9)) p.burstT = rand(0.15, 0.35); // バースト射撃
      if (p.burstT > 0) tryFire(p);
    }
  } else if (p.tx || p.ty) {
    const d2 = Math.hypot(p.tx - p.x, p.ty - p.y);
    if (d2 > 8) p.angle = Math.atan2(p.ty - p.y, p.tx - p.x);
  }
  updateHeal(p, dt);
  if (p.fireCd > 0) p.fireCd -= dt;
  if (p.reloadT > 0) { p.reloadT -= dt; if (p.reloadT <= 0) finishReload(p); }
  updatePickups(p);
  // 弾切れ処理
  const w = curWeapon(p), def = WEAPONS[w.type];
  if (!def.melee && w.magNow === 0 && p.reloadT <= 0) {
    if (p.ammo > 0) startReload(p);
    else {
      // 別武器へ
      const other = p.slot === 0 ? 1 : 0;
      if (p.weapons[other]) switchSlot(p, other);
    }
  }
}
function botThink(p) {
  // 1. ゾーン外なら安全圏へ
  const zd = dist(p.x, p.y, zone.tcx, zone.tcy);
  const urgent = dist(p.x, p.y, zone.cx, zone.cy) > zone.r - 60;
  const outsideNext = zd > zone.tr - 100;
  // 2. 敵探索
  let enemy = null, ed = 300;
  for (const q of players) {
    if (q === p || !q.alive) continue;
    const d = dist(p.x, p.y, q.x, q.y);
    if (d < ed) { ed = d; enemy = q; }
  }
  const armed = botTier(p) > 0;
  if (enemy && (armed || ed < 90)) {
    p.losOk = hasLOS(p.x, p.y, enemy.x, enemy.y);
  } else p.losOk = false;

  if (urgent) {
    p.target = null; p.losOk = false;
    const a = Math.atan2(zone.tcy - p.y, zone.tcx - p.x);
    p.tx = p.x + Math.cos(a) * 500 + rand(-80, 80);
    p.ty = p.y + Math.sin(a) * 500 + rand(-80, 80);
    return;
  }
  // 低HPなら撤退して回復を狙う
  if (enemy && p.hp < 35 && ed > 120 && (p.bandages > 0 || p.medkits > 0)) {
    p.target = null; p.losOk = false;
    const fa = Math.atan2(p.y - enemy.y, p.x - enemy.x);
    p.tx = clamp(p.x + Math.cos(fa) * 420, 40, MAP - 40);
    p.ty = clamp(p.y + Math.sin(fa) * 420, 40, MAP - 40);
    return;
  }
  if (enemy && p.losOk && (armed || ed < 90)) {
    if (p.target !== enemy) p.burstT = -rand(0.35, 0.7); // 反応ディレイ
    p.target = enemy;
    p.tx = enemy.x; p.ty = enemy.y;
    return;
  }
  p.target = null;
  // 3. 低HPで回復
  if (p.hp < 55 && p.healT <= 0 && (p.bandages > 0 || p.medkits > 0) && (!enemy || ed > 380)) {
    autoHealChoice(p);
  }
  // 4. 丸腰 or 弾不足なら物資へ
  const needWeapon = !armed;
  const needAmmo = p.ammo < 20 && armed;
  if (needWeapon || needAmmo || Math.random() < 0.35) {
    let best = null, bd = needWeapon ? 900 : 500;
    for (const l of loots) {
      if (needWeapon && l.type !== 'weapon') continue;
      if (needAmmo && l.type !== 'ammo') continue;
      if (!needWeapon && !needAmmo && l.type === 'weapon') {
        if ((WEAPONS[l.weapon].tier || 0) <= botTier(p)) continue;
      }
      const zcx = zone.waiting ? zone.cx : zone.tcx;
      const zcy = zone.waiting ? zone.cy : zone.tcy;
      const zr = zone.waiting ? zone.r : zone.tr;
      const d = dist(p.x, p.y, l.x, l.y);
      if (d < bd && dist(l.x, l.y, zcx, zcy) < zr) { bd = d; best = l; }
    }
    if (best) { p.tx = best.x; p.ty = best.y; return; }
  }
  // 5. 徘徊(次ゾーン内)
  p.roamT -= 0.3;
  if (p.roamT <= 0 || dist(p.x, p.y, p.tx, p.ty) < 60) {
    p.roamT = rand(3, 7);
    const zcx = zone.waiting ? zone.cx : zone.tcx;
    const zcy = zone.waiting ? zone.cy : zone.tcy;
    const zr = zone.waiting ? zone.r : zone.tr;
    const a = rand(0, TAU), d = rand(0, Math.max(zr - 120, 80));
    p.tx = clamp(zcx + Math.cos(a) * d, 40, MAP - 40);
    p.ty = clamp(zcy + Math.sin(a) * d, 40, MAP - 40);
  }
}

/* ================= 入力 ================= */
const keys = {};
const mouse = { x: VW / 2, y: VH / 2, down: false };
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (state !== 'play' || !me.alive) return;
  if (e.code === 'KeyR') startReload(me);
  if (e.code === 'KeyH') autoHealChoice(me);
  if (e.code === 'Digit1') switchSlot(me, 0);
  if (e.code === 'Digit2') switchSlot(me, 1);
  if (e.code === 'KeyQ') switchSlot(me, me.slot === 0 ? 1 : 0);
  if (e.code === 'KeyE' && promptLoot) swapWeapon(me, promptLoot);
  if (e.code === 'Digit3') useHeal(me, 'bandage');
  if (e.code === 'Digit4') useHeal(me, 'medkit');
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
cv.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
cv.addEventListener('mousedown', e => { if (e.button === 0) mouse.down = true; });
window.addEventListener('mouseup', e => { if (e.button === 0) mouse.down = false; });
window.addEventListener('wheel', () => {
  if (state === 'play' && me.alive) switchSlot(me, me.slot === 0 ? 1 : 0);
}, { passive: true });
window.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('pointerdown', initAudio, { once: false });

/* --- 仮想スティック --- */
function makeStick(el) {
  const st = { id: null, dx: 0, dy: 0, mag: 0 };
  const knob = el.querySelector('.stick-knob');
  const R = 44;
  function setKnob() {
    knob.style.transform = `translate(calc(-50% + ${st.dx * R}px), calc(-50% + ${st.dy * R}px))`;
  }
  function move(e) {
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    let dx = (e.clientX - cx) / R, dy = (e.clientY - cy) / R;
    const m = Math.hypot(dx, dy);
    if (m > 1) { dx /= m; dy /= m; }
    st.dx = dx; st.dy = dy; st.mag = Math.min(m, 1);
    setKnob();
  }
  el.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (st.id !== null) return;
    st.id = e.pointerId;
    el.setPointerCapture(e.pointerId);
    move(e);
  });
  el.addEventListener('pointermove', e => { if (e.pointerId === st.id) move(e); });
  const end = e => {
    if (e.pointerId !== st.id) return;
    st.id = null; st.dx = st.dy = st.mag = 0;
    setKnob();
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  return st;
}
const stickL = makeStick($('stickL'));
const stickR = makeStick($('stickR'));

function bindBtn(el, fn) {
  el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); fn(); });
}
bindBtn(ui.btnPick, () => { if (promptLoot && me.alive) swapWeapon(me, promptLoot); });
bindBtn($('btnHeal'), () => { if (me && me.alive) autoHealChoice(me); });
bindBtn($('btnReload'), () => { if (me && me.alive) startReload(me); });
bindBtn($('btnSwap'), () => { if (me && me.alive) switchSlot(me, me.slot === 0 ? 1 : 0); });

/* ================= プレイヤー操作 ================= */
function updateMe(dt) {
  if (!me.alive) return;
  let mx = 0, my = 0;
  if (keys['KeyW'] || keys['ArrowUp']) my -= 1;
  if (keys['KeyS'] || keys['ArrowDown']) my += 1;
  if (keys['KeyA'] || keys['ArrowLeft']) mx -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) mx += 1;
  if (stickL.mag > 0.15) { mx = stickL.dx; my = stickL.dy; }
  const m = Math.hypot(mx, my);
  if (m > 1) { mx /= m; my /= m; }
  const spd = 220 * (me.healT > 0 ? 0.5 : 1);
  me.x += mx * spd * dt;
  me.y += my * spd * dt;
  resolveCollisions(me);
  // 照準
  let firing = false;
  if (stickR.mag > 0.2) {
    me.angle = Math.atan2(stickR.dy, stickR.dx);
    if (stickR.mag > 0.42) firing = true;
  } else if (!IS_TOUCH) {
    me.angle = Math.atan2(mouse.y - VH / 2, mouse.x - VW / 2);
  }
  if (!IS_TOUCH && mouse.down) firing = true;
  if (firing) tryFire(me);
  if (me.fireCd > 0) me.fireCd -= dt;
  if (me.reloadT > 0) { me.reloadT -= dt; if (me.reloadT <= 0) finishReload(me); }
  updateHeal(me, dt);
  updatePickups(me);
}

/* ================= 弾丸/パーティクル ================= */
function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.life -= dt;
    let dead = b.life <= 0;
    if (!dead) {
      const step = Math.hypot(b.vx, b.vy) * dt;
      const n = Math.max(1, Math.ceil(step / 10));
      const sx = b.vx * dt / n, sy = b.vy * dt / n;
      outer:
      for (let s = 0; s < n; s++) {
        b.x += sx; b.y += sy;
        if (b.x < 0 || b.y < 0 || b.x > MAP || b.y > MAP) { dead = true; break; }
        if (blockedAt(b.x, b.y)) {
          dead = true;
          for (let k = 0; k < 3; k++) parts.push({ type: 'spark', x: b.x, y: b.y, vx: rand(-90, 90), vy: rand(-90, 90), life: 0.2, maxLife: 0.2, size: 2 });
          break;
        }
        for (const p of players) {
          if (!p.alive || p === b.owner) continue;
          const dx = b.x - p.x, dy = b.y - p.y;
          if (dx * dx + dy * dy < (p.r + 3) * (p.r + 3)) {
            damagePlayer(p, b.dmg, b.owner, b.wname);
            dead = true;
            break outer;
          }
        }
      }
    }
    if (dead) bullets.splice(i, 1);
  }
}
function updateParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    if (p.vx) p.x += p.vx * dt;
    if (p.vy) p.y += p.vy * dt;
    if (p.type === 'blood') { p.vx *= 0.92; p.vy *= 0.92; }
  }
}

/* ================= ゾーンダメージ ================= */
function applyZoneDamage(dt) {
  for (const p of players) {
    if (!p.alive) continue;
    if (dist(p.x, p.y, zone.cx, zone.cy) > zone.r) {
      p.zoneTick += dt;
      if (p.zoneTick >= 1) {
        p.zoneTick -= 1;
        p.hp -= zone.dps;
        p.hurtT = 0.2;
        if (p === me) { hurtT = 0.5; }
        if (p.hp <= 0) killPlayer(p, null, 'ゾーン');
      }
    } else p.zoneTick = 0;
  }
}

/* ================= 観戦 ================= */
function pickSpectateTarget(prefer) {
  const alive = players.filter(p => p.alive);
  if (alive.length === 0) return;
  camTarget = (prefer && prefer.alive) ? prefer : pick(alive);
  if (spectating) ui.specName.textContent = camTarget.name;
}

/* ================= ゲームフロー ================= */
function startMatch() {
  genWorld();
  spawnPlayers();
  matchT = 0; hurtT = 0; myRank = 0; spectating = false;
  promptLoot = null; shake = 0;
  mouse.down = false;
  ui.menu.classList.add('hidden');
  ui.result.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  ui.spectateBar.classList.add('hidden');
  if (IS_TOUCH) ui.touchUI.classList.remove('hidden');
  state = 'count';
  countT = 3.5;
  ui.countdown.classList.remove('hidden');
  renderFeed();
}
function showResult(win, winnerName) {
  state = 'over';
  ui.result.classList.remove('hidden');
  ui.touchUI.classList.add('hidden');
  ui.spectateBar.classList.add('hidden');
  const banner = $('resultBanner'), title = $('resultTitle');
  if (win) {
    banner.textContent = '勝利!チキンディナー!';
    banner.classList.add('win');
    title.textContent = '最後の1人まで生き残った!';
    myRank = 1;
  } else {
    banner.classList.remove('win');
    banner.textContent = '#' + (myRank || players.filter(p => p.alive).length + 1);
    title.textContent = winnerName ? `勝者: ${winnerName}` : '戦闘不能...';
  }
  $('rsRank').textContent = '#' + (myRank || '-');
  $('rsKills').textContent = me.kills;
  $('rsDmg').textContent = Math.round(me.dmgDealt);
  const mmin = Math.floor(matchT / 60), msec = Math.floor(matchT % 60);
  $('rsTime').textContent = `${mmin}:${String(msec).padStart(2, '0')}`;
  $('btnSpectate').style.display = (players.filter(p => p.alive).length > 1 && !win) ? '' : 'none';
}
$('btnPlay').addEventListener('click', () => { initAudio(); startMatch(); });
$('btnRetry').addEventListener('click', () => { initAudio(); startMatch(); });
$('btnSpectate').addEventListener('click', () => {
  spectating = true;
  state = 'play';
  ui.result.classList.add('hidden');
  ui.spectateBar.classList.remove('hidden');
  pickSpectateTarget(null);
});

/* ================= 更新 ================= */
function update(dt) {
  if (state === 'count') {
    countT -= dt;
    const n = Math.ceil(countT - 0.5);
    ui.countdown.textContent = n > 0 ? n : 'GO!';
    if (countT <= 0) {
      state = 'play';
      ui.countdown.classList.add('hidden');
    }
    return;
  }
  if (state !== 'play') return;
  matchT += dt;
  updateZone(dt);
  applyZoneDamage(dt);
  if (me.alive) updateMe(dt);
  for (const p of players) {
    if (p.isBot && p.alive) updateBot(p, dt);
    if (p.hurtT > 0) p.hurtT -= dt;
  }
  updateBullets(dt);
  updateParts(dt);
  // フィード減衰
  let feedDirty = false;
  for (let i = feed.length - 1; i >= 0; i--) {
    feed[i].t -= dt;
    if (feed[i].t <= 0) { feed.splice(i, 1); feedDirty = true; }
    else if (feed[i].t < 1.5) feedDirty = true;
  }
  if (feedDirty) renderFeed();
  // カメラ
  if (!camTarget || (!camTarget.alive && camTarget !== me)) pickSpectateTarget(null);
  const ct = (me.alive || !spectating) ? me : camTarget;
  if (ct) {
    camX += (ct.x - camX) * Math.min(1, dt * 8);
    camY += (ct.y - camY) * Math.min(1, dt * 8);
  }
  if (shake > 0) shake = Math.max(0, shake - dt * 30);
  if (hurtT > 0) hurtT -= dt;
  if (spectating && camTarget) ui.specName.textContent = camTarget.name;
}

/* ================= 描画 ================= */
function render() {
  ctx.clearRect(0, 0, VW, VH);
  const sx = shake > 0 ? rand(-shake, shake) : 0;
  const sy = shake > 0 ? rand(-shake, shake) : 0;
  const ox = camX - VW / 2 + sx, oy = camY - VH / 2 + sy;
  ctx.save();
  ctx.translate(-ox, -oy);
  const vL = ox - 60, vT = oy - 60, vR = ox + VW + 60, vB = oy + VH + 60;
  const vis = (x, y, m = 60) => x > vL - m && x < vR + m && y > vT - m && y < vB + m;

  // 水(マップ外) + 地面
  ctx.fillStyle = '#2c4a63';
  ctx.fillRect(vL, vT, vR - vL, vB - vT);
  ctx.fillStyle = grassPat;
  ctx.fillRect(Math.max(0, vL), Math.max(0, vT), Math.min(MAP, vR) - Math.max(0, vL), Math.min(MAP, vB) - Math.max(0, vT));

  // 土パッチ
  ctx.fillStyle = 'rgba(120, 100, 60, 0.3)';
  for (const p of patches) {
    if (!vis(p.x, p.y, 200)) continue;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, p.rx, p.ry, p.a, 0, TAU);
    ctx.fill();
  }
  // 建物の床
  for (const f of floors) {
    if (!vis(f.x + f.w / 2, f.y + f.h / 2, Math.max(f.w, f.h))) continue;
    ctx.fillStyle = '#8a8177';
    ctx.fillRect(f.x, f.y, f.w, f.h);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    for (let gx = f.x; gx < f.x + f.w; gx += 46) ctx.fillRect(gx, f.y, 1.5, f.h);
    for (let gy = f.y; gy < f.y + f.h; gy += 46) ctx.fillRect(f.x, gy, f.w, 1.5);
  }
  // 岩
  for (const rk of rocks) {
    if (!vis(rk.x, rk.y)) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(rk.x + 4, rk.y + 5, rk.r, rk.r * 0.8, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#7e8388';
    ctx.beginPath(); ctx.arc(rk.x, rk.y, rk.r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#969ba1';
    ctx.beginPath(); ctx.arc(rk.x - rk.r * 0.25, rk.y - rk.r * 0.3, rk.r * 0.55, 0, TAU); ctx.fill();
  }
  // 物資
  const now = performance.now() / 1000;
  for (const l of loots) {
    if (!vis(l.x, l.y)) continue;
    const bob = Math.sin(now * 2.4 + l.bob) * 2;
    const y = l.y + bob;
    ctx.save();
    ctx.translate(l.x, y);
    let col = '#cccccc', label = '';
    if (l.type === 'weapon') { col = '#f5a524'; label = WEAPONS[l.weapon].short; }
    else if (l.type === 'ammo') { col = '#b0b8bf'; label = '弾'; }
    else if (l.type === 'bandage') { col = '#8fd48f'; label = '包'; }
    else if (l.type === 'medkit') { col = '#e05a5a'; label = '＋'; }
    else if (l.type === 'armor') { col = '#5ec8f2'; label = '防'; }
    ctx.shadowColor = col; ctx.shadowBlur = 10;
    ctx.fillStyle = 'rgba(15, 18, 12, 0.85)';
    ctx.beginPath();
    ctx.roundRect(-13, -13, 26, 26, 6);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = col; ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.font = "bold 11px 'Noto Sans JP', sans-serif";
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 1);
    ctx.restore();
  }
  // 死体マーカー(倒れたプレイヤー)
  for (const p of players) {
    if (p.alive || !vis(p.x, p.y)) continue;
    ctx.fillStyle = 'rgba(60, 20, 20, 0.4)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 18, 12, 0.5, 0, TAU); ctx.fill();
  }
  // プレイヤー
  for (const p of players) {
    if (!p.alive || !vis(p.x, p.y)) continue;
    ctx.save();
    ctx.translate(p.x, p.y);
    // 影
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(2, 4, p.r, p.r * 0.85, 0, 0, TAU); ctx.fill();
    ctx.rotate(p.angle);
    // 銃
    const w = curWeapon(p), def = WEAPONS[w.type];
    if (!def.melee) {
      ctx.fillStyle = '#2b2b2b';
      ctx.fillRect(p.r - 4, -3, def.w, 6);
      ctx.fillStyle = '#4a4a4a';
      ctx.fillRect(p.r - 4, -3, 12, 6);
    }
    // 手
    ctx.fillStyle = '#e0b48c';
    ctx.beginPath(); ctx.arc(p.r - 2, -8, 5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(def.melee ? p.r - 2 : p.r + 8, 8, 5, 0, TAU); ctx.fill();
    // 体
    ctx.fillStyle = p.hurtT > 0 ? '#ff8a8a' : p.color;
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, p.r, 0, TAU); ctx.fill(); ctx.stroke();
    // 頭
    ctx.fillStyle = '#e8c39a';
    ctx.beginPath(); ctx.arc(0, 0, p.r * 0.55, 0, TAU); ctx.fill();
    ctx.restore();
    // 名前 + HPバー
    if (p !== me) {
      ctx.font = "10px 'Noto Sans JP', sans-serif";
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText(p.name, p.x, p.y - p.r - 14);
      if (p.hp < 100) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(p.x - 16, p.y - p.r - 10, 32, 4);
        ctx.fillStyle = p.hp > 40 ? '#64d96a' : '#e05a5a';
        ctx.fillRect(p.x - 16, p.y - p.r - 10, 32 * p.hp / 100, 4);
      }
    }
    // リロード表示
    if (p.reloadT > 0) {
      ctx.strokeStyle = '#f5a524'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 7, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - p.reloadT / WEAPONS[curWeapon(p).type].reload));
      ctx.stroke();
    }
  }
  // 弾丸
  ctx.lineWidth = 2.5;
  for (const b of bullets) {
    if (!vis(b.x, b.y)) continue;
    const L = 14;
    const d = Math.hypot(b.vx, b.vy) || 1;
    ctx.strokeStyle = 'rgba(255, 224, 130, 0.9)';
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - b.vx / d * L, b.y - b.vy / d * L);
    ctx.stroke();
  }
  // 壁
  for (const w of walls) {
    if (!vis(w.x + w.w / 2, w.y + w.h / 2, Math.max(w.w, w.h))) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(w.x + 4, w.y + 5, w.w, w.h);
    ctx.fillStyle = '#5c5148';
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.fillStyle = '#6e6156';
    ctx.fillRect(w.x, w.y, w.w, Math.min(4, w.h));
  }
  // 木(キャノピーは上に描画)
  for (const t of trees) {
    if (!vis(t.x, t.y, t.cr + 30)) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(t.x + 8, t.y + 9, t.cr * 0.9, t.cr * 0.75, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(42, 84, 38, 0.94)';
    ctx.beginPath(); ctx.arc(t.x, t.y, t.cr, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(62, 110, 52, 0.9)';
    ctx.beginPath(); ctx.arc(t.x - t.cr * 0.2, t.y - t.cr * 0.22, t.cr * 0.62, 0, TAU); ctx.fill();
  }
  // パーティクル
  for (const p of parts) {
    const a = clamp(p.life / p.maxLife, 0, 1);
    if (p.type === 'blood') {
      ctx.fillStyle = `rgba(160, 25, 25, ${a})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
    } else if (p.type === 'spark') {
      ctx.fillStyle = `rgba(255, 210, 120, ${a})`;
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    } else if (p.type === 'muzzle') {
      ctx.fillStyle = `rgba(255, 230, 150, ${a * 0.95})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (2 - a), 0, TAU); ctx.fill();
    } else if (p.type === 'text') {
      ctx.font = "bold 14px 'Orbitron', sans-serif";
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(255, 212, 94, ${a})`;
      ctx.fillText(p.text, p.x, p.y);
    }
  }
  // ゾーン(青い霧 + 次サークル)
  if (zone) {
    ctx.fillStyle = 'rgba(60, 120, 210, 0.28)';
    ctx.beginPath();
    ctx.rect(vL, vT, vR - vL, vB - vT);
    ctx.arc(zone.cx, zone.cy, zone.r, 0, TAU, true);
    ctx.fill('evenodd');
    ctx.strokeStyle = 'rgba(90, 160, 255, 0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(zone.cx, zone.cy, zone.r, 0, TAU); ctx.stroke();
    if (zone.waiting && !zone.done) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2;
      ctx.setLineDash([12, 10]);
      ctx.beginPath(); ctx.arc(zone.tcx, zone.tcy, zone.tr, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  ctx.restore();

  // 照準(PC)
  if (!IS_TOUCH && state === 'play' && me.alive) {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    const cx = mouse.x, cy = mouse.y, g = 5, l = 8;
    ctx.beginPath();
    ctx.moveTo(cx - g - l, cy); ctx.lineTo(cx - g, cy);
    ctx.moveTo(cx + g, cy); ctx.lineTo(cx + g + l, cy);
    ctx.moveTo(cx, cy - g - l); ctx.lineTo(cx, cy - g);
    ctx.moveTo(cx, cy + g); ctx.lineTo(cx, cy + g + l);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 1.5, 0, TAU); ctx.fill();
  }
  renderMinimap();
  updateHUD();
}

function renderMinimap() {
  const S = 300 / MAP;
  mctx.clearRect(0, 0, 300, 300);
  mctx.fillStyle = '#3e5433';
  mctx.fillRect(0, 0, 300, 300);
  mctx.fillStyle = '#7a7166';
  for (const f of floors) mctx.fillRect(f.x * S, f.y * S, f.w * S, f.h * S);
  if (zone) {
    // ゾーン外を青く
    mctx.fillStyle = 'rgba(60, 120, 210, 0.4)';
    mctx.beginPath();
    mctx.rect(0, 0, 300, 300);
    mctx.arc(zone.cx * S, zone.cy * S, zone.r * S, 0, TAU, true);
    mctx.fill('evenodd');
    mctx.strokeStyle = 'rgba(120, 180, 255, 0.9)';
    mctx.lineWidth = 2;
    mctx.beginPath(); mctx.arc(zone.cx * S, zone.cy * S, zone.r * S, 0, TAU); mctx.stroke();
    if (zone.waiting && !zone.done) {
      mctx.strokeStyle = 'rgba(255,255,255,0.9)';
      mctx.lineWidth = 1.5;
      mctx.beginPath(); mctx.arc(zone.tcx * S, zone.tcy * S, zone.tr * S, 0, TAU); mctx.stroke();
    }
  }
  const target = (me && me.alive) ? me : camTarget;
  if (target) {
    mctx.fillStyle = '#ffd45e';
    mctx.beginPath(); mctx.arc(target.x * S, target.y * S, 5, 0, TAU); mctx.fill();
    mctx.strokeStyle = '#fff'; mctx.lineWidth = 1.5;
    mctx.stroke();
  }
}

let hudTick = 0;
function updateHUD() {
  ui.alive.textContent = players.filter(p => p.alive).length;
  ui.kills.textContent = me.kills;
  // HP
  const hp = Math.max(0, Math.ceil(me.hp));
  ui.hpFill.style.width = hp + '%';
  ui.hpFill.style.background = hp > 55 ? '#64d96a' : hp > 25 ? '#f5a524' : '#e05a5a';
  ui.hpText.textContent = hp;
  ui.armorFill.style.width = me.armor + '%';
  ui.bandageNum.textContent = me.bandages;
  ui.medkitNum.textContent = me.medkits;
  // 回復キャスト
  if (me.healT > 0) {
    ui.healCast.classList.remove('hidden');
    ui.healCastFill.style.width = (100 * (1 - me.healT / me.healMax)) + '%';
    ui.healCastLabel.textContent = (me.healType === 'medkit' ? '医療キット' : '包帯') + ' 使用中...';
  } else ui.healCast.classList.add('hidden');
  // 武器スロット
  for (let i = 0; i < 2; i++) {
    const el = ui.wslot[i];
    const w = me.weapons[i];
    el.classList.toggle('active', me.slot === i);
    el.querySelector('.ws-name').textContent = w ? WEAPONS[w.type].name : '---';
    el.querySelector('.ws-mag').textContent = (w && !WEAPONS[w.type].melee) ? w.magNow : '';
  }
  const cw = curWeapon(me), cd = WEAPONS[cw.type];
  if (cd.melee) { ui.ammoMag.textContent = '-'; ui.ammoReserve.textContent = '-'; }
  else {
    ui.ammoMag.textContent = me.reloadT > 0 ? '...' : cw.magNow;
    ui.ammoReserve.textContent = me.ammo;
  }
  // ゾーンメッセージ
  const zt = Math.max(0, Math.ceil(zone.timer));
  if (zone.done) {
    ui.zoneMsg.textContent = '最終ゾーン!';
    ui.zoneMsg.className = 'tb-box zone-danger';
  } else if (zone.waiting) {
    ui.zoneMsg.textContent = `収縮まで ${zt}秒`;
    ui.zoneMsg.className = 'tb-box ' + (zt <= 5 ? 'zone-warn' : 'zone-safe');
  } else {
    ui.zoneMsg.textContent = 'ゾーン収縮中!';
    ui.zoneMsg.className = 'tb-box zone-danger';
  }
  // 交換プロンプト
  if (promptLoot && me.alive) {
    ui.prompt.classList.remove('hidden');
    ui.prompt.innerHTML = IS_TOUCH
      ? `✋ボタン: <b>${WEAPONS[promptLoot.weapon].name}</b> と交換`
      : `<b>[E]</b> ${WEAPONS[promptLoot.weapon].name} と交換`;
    ui.btnPick.classList.remove('hidden');
  } else {
    ui.prompt.classList.add('hidden');
    ui.btnPick.classList.add('hidden');
  }
  // 被弾ビネット
  const vig = me.alive ? Math.max(hurtT, me.hp < 30 ? 0.4 : 0) : 0;
  ui.vignette.style.opacity = clamp(vig, 0, 0.85);
}

/* ================= メインループ ================= */
let lastT = performance.now();
function loop(t) {
  const dt = Math.min((t - lastT) / 1000, 0.05);
  lastT = t;
  if (state === 'count' || state === 'play') {
    update(dt);
    render();
  } else if (state === 'over' && !ui.result.classList.contains('hidden')) {
    // リザルト裏でも世界を静止描画
    render();
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
