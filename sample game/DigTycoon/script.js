/* =========================================================
   ピクセルドリル999 〜地底999階への挑戦〜
   made by hiro / ヒロ  https://github.com/h1ro223
   ========================================================= */
(() => {
'use strict';

// ============================================================
//  1. ユーティリティ
// ============================================================
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const chance = p => p > 0 && Math.random() * 100 < p;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash3(x, y, z) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x61c88647);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function noise2(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash3(xi, yi, s), b = hash3(xi + 1, yi, s), c = hash3(xi, yi + 1, s), d = hash3(xi + 1, yi + 1, s);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
function fmt(n) {
  if (!isFinite(n)) return '∞';
  n = Math.floor(n);
  if (n < 100000) return n.toLocaleString('ja-JP');
  const units = [[1e16, '京'], [1e12, '兆'], [1e8, '億'], [1e4, '万']];
  for (const [v, s] of units) {
    if (n >= v) {
      const x = n / v;
      const str = x >= 1000 ? Math.floor(x).toLocaleString('ja-JP') : x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2);
      return str + s;
    }
  }
  return String(n);
}
const hexA = h => { const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
const shadeA = (a, f) => (f >= 0 ? a.map(c => c + (255 - c) * f) : a.map(c => c * (1 + f)));
const rgb = a => `rgb(${a[0] | 0},${a[1] | 0},${a[2] | 0})`;
const floorName = r => (r <= 0 ? '地表' : `B${r}F`);

// ============================================================
//  2. ゲームデータ
// ============================================================
const COLS = 13;
const TILE = 16;
const LAST = 999;
const CENTER = 6;
const T = { AIR: 0, SOIL: 1, HARD: 2, ORE: 3, COIN: 4, TORCH: 5, BOMB: 6, CHEST: 7, ENERGY: 8, SEAL: 9 };
const TYPE_HP = [0, 1, 2.5, 1.4, 1, 0.6, 0.8, 2, 1, 4];

const BIOMES = [
  { n: '草原の土層',   base: '#8a5a34', wall: '#2b1a0e', sp: 'grass',    key: 0 },
  { n: '赤土の粘土層', base: '#b0623a', wall: '#341a0e', sp: 'clay',     key: 2 },
  { n: '灰色の岩盤層', base: '#6e6e7a', wall: '#1e1e26', sp: 'rock',     key: -2 },
  { n: '苔むす洞窟',   base: '#4f6b45', wall: '#142018', sp: 'moss',     key: 3 },
  { n: '氷結の層',     base: '#78aed0', wall: '#14263a', sp: 'ice',      key: 5 },
  { n: '灼熱の溶岩層', base: '#6a2a22', wall: '#1c0806', sp: 'lava',     key: -3 },
  { n: '水晶の洞',     base: '#6a4a9a', wall: '#1a1230', sp: 'crystal',  key: 4 },
  { n: '黒曜石の層',   base: '#34304a', wall: '#0b0912', sp: 'obsidian', key: -4 },
  { n: '古代遺跡層',   base: '#a08a52', wall: '#272010', sp: 'ruins',    key: 1 },
  { n: '深淵',         base: '#2c1c44', wall: '#06030d', sp: 'abyss',    key: -5 },
  { n: '虚空回廊',     base: '#123236', wall: '#020909', sp: 'void',     key: 6 },
];
const biomeOf = r => (r >= 1000 ? 10 : clamp(Math.floor((r - 1) / 100), 0, 9));

const ORES = [
  { n: '銅',       c: '#d9824a', h: '#ffc08a', d: '#7a3d1c', s: [[0, 0]], a: ['eco', 'bag'] },
  { n: '鉄',       c: '#9aa4b0', h: '#e6edf2', d: '#4a525c', s: [[0, 0], [1, 0]], a: ['str', 'bomb'] },
  { n: '銀',       c: '#cfd6e2', h: '#ffffff', d: '#6a7488', s: [[0, 0], [1, 0], [0, 1]], a: ['haste', 'light'] },
  { n: '金',       c: '#f2c230', h: '#fff27a', d: '#8a6410', s: [[0, 0], [1, 0], [2, 0], [1, 1]], a: ['coin', 'lucky'] },
  { n: '翠玉',     c: '#2fbf71', h: '#a8ffd0', d: '#145c34', s: [[1, 0], [2, 0], [0, 1], [1, 1]], a: ['double', 'bag'] },
  { n: '紅玉',     c: '#e0314a', h: '#ffa0b0', d: '#701020', s: [[0, 0], [1, 0], [0, 1], [1, 1]], a: ['crit', 'str'] },
  { n: '蒼玉',     c: '#3a74e8', h: '#a8c8ff', d: '#16306e', s: [[0, 0], [0, 1], [0, 2], [1, 2]], a: ['charge', 'eco'] },
  { n: 'ミスリル', c: '#5fe0d4', h: '#e0fffb', d: '#1f6e68', s: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]], a: ['combo', 'haste'] },
  { n: 'アダマン', c: '#9a5cf0', h: '#e1c4ff', d: '#45237a', s: [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2]], a: ['pierce', 'wide'] },
  { n: '星鉱',     c: '#ffd84a', h: '#ffffff', d: '#9a6a10', s: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], a: ['execute', 'crit'] },
  { n: '虚晶',     c: '#3cf0c8', h: '#d0fff4', d: '#0e6a58', s: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]], a: ['execute', 'double'] },
  { n: '原初鉱',   c: '#ff5ad2', h: '#ffd6f4', d: '#7a1a62', s: [[1, 0], [0, 1], [1, 1], [2, 1], [0, 2], [2, 2]], a: ['combo', 'wide'] },
];
const oreVal = t => 1.2 * Math.pow(1.75, t);
const orePrice = t => Math.round(3 * Math.pow(3, t));
const oreCenter = t => (t <= 9 ? 20 + t * 100 : t === 10 ? 1150 : 1400);

const EFFECTS = {
  eco:     { n: '省エネ',   f: '{v}%の確率でエネルギーを消費しない', min: 4, max: 14, cap: 70 },
  str:     { n: '怪力',     f: '採掘力 +{v}%', min: 5, max: 25, cap: 400 },
  haste:   { n: '高速',     f: '採掘速度 +{v}%', min: 5, max: 20, cap: 200 },
  coin:    { n: '金運',     f: 'コイン獲得量 +{v}%', min: 10, max: 40, cap: 1000 },
  double:  { n: '鉱石倍化', f: '{v}%の確率で鉱石が2倍', min: 5, max: 16, cap: 90 },
  crit:    { n: '会心',     f: '{v}%の確率でダメージ3倍', min: 4, max: 14, cap: 80 },
  charge:  { n: '充電',     f: '破壊時{v}%の確率でエネルギー回復', min: 5, max: 16, cap: 80 },
  combo:   { n: '連撃',     f: '{v}%の確率で追加の一撃', min: 5, max: 18, cap: 90 },
  pierce:  { n: '貫通',     f: '{v}%の確率で奥のブロックにも命中', min: 8, max: 28, cap: 100 },
  wide:    { n: '範囲',     f: '{v}%の確率で左右のブロックにも命中', min: 8, max: 28, cap: 100 },
  execute: { n: '粉砕',     f: '残り耐久{v}%以下のブロックを即破壊', min: 4, max: 12, cap: 50 },
  light:   { n: '夜目',     f: '視界 +{v}', min: 1, max: 2, int: true, cap: 5 },
  bag:     { n: '運搬',     f: 'かばん容量 +{v}', min: 3, max: 10, int: true, cap: 999 },
  bomb:    { n: '爆破',     f: '爆弾の範囲 +{v}', min: 1, max: 1, int: true, cap: 3 },
  lucky:   { n: '宝運',     f: '宝箱の中身 +{v}%', min: 10, max: 40, cap: 500 },
};
const EFF_KEYS = Object.keys(EFFECTS);
const effText = e => EFFECTS[e.k].f.replace('{v}', e.v);

const BP = [
  { n: '見習いの設計図', s: '見習い', t: 0, m: 1.00, sp: 3.0, mask: ['###', '###', '###'] },
  { n: 'ほそみの設計図', s: 'ほそみ', t: 0, m: 1.10, sp: 3.8, mask: ['##', '##', '##', '##'] },
  { n: 'くさびの設計図', s: 'くさび', t: 1, m: 1.20, sp: 3.2, mask: ['#...', '##..', '###.', '####'] },
  { n: 'まるの設計図',   s: 'まる',   t: 1, m: 1.25, sp: 3.0, mask: ['.##.', '####', '####', '.##.'] },
  { n: 'ダイヤの設計図', s: 'ダイヤ', t: 2, m: 1.35, sp: 3.3, mask: ['..#..', '.###.', '#####', '.###.', '..#..'] },
  { n: '門の設計図',     s: '門',     t: 2, m: 1.45, sp: 3.6, mask: ['####', '#..#', '#..#', '####'] },
  { n: '大型の設計図',   s: '大型',   t: 3, m: 1.50, sp: 2.8, mask: ['####', '####', '####', '####'] },
  { n: '螺旋の設計図',   s: '螺旋',   t: 3, m: 1.62, sp: 3.4, mask: ['#####', '....#', '###.#', '#...#', '#####'] },
  { n: '双頭の設計図',   s: '双頭',   t: 4, m: 1.75, sp: 3.2, mask: ['##.##', '##.##', '#####', '.###.', '.###.'] },
  { n: '疾風の設計図',   s: '疾風',   t: 4, m: 1.60, sp: 5.2, mask: ['######', '######'] },
  { n: '重爪の設計図',   s: '重爪',   t: 5, m: 1.90, sp: 3.0, mask: ['#.#.#', '#####', '#####', '#####'] },
  { n: '王冠の設計図',   s: '王冠',   t: 6, m: 2.05, sp: 3.5, mask: ['#.#.#', '#####', '#####', '.###.', '.###.'] },
  { n: '竜骨の設計図',   s: '竜骨',   t: 7, m: 2.20, sp: 3.6, mask: ['#.##.#', '######', '.####.', '######', '#.##.#'] },
  { n: '星詠みの設計図', s: '星詠み', t: 8, m: 2.35, sp: 4.0, mask: ['..##..', '.####.', '######', '######', '.####.', '..##..'] },
  { n: '神鉄の設計図',   s: '神鉄',   t: 9, m: 2.60, sp: 4.2, mask: ['.####.', '######', '######', '######', '######', '.####.'] },
  { n: '虚空の設計図',   s: '虚空',   t: 10, m: 3.00, sp: 4.5, mask: ['#######', '#######', '#######', '#######', '#######'] },
  { n: '原初の設計図',   s: '原初',   t: 11, m: 3.40, sp: 5.0, mask: ['###.###', '#######', '#######', '.#####.', '#######', '###.###'] },
];
BP.forEach(b => {
  b.h = b.mask.length;
  b.w = Math.max(...b.mask.map(r => r.length));
  b.cells = b.mask.join('').split('').filter(ch => ch === '#').length;
  b.base = 1 + b.t * 2;
  b.cost = Math.round(15 * Math.pow(1.7, b.t));
  b.price = Math.round(120 * Math.pow(2.3, b.t));
});
const bpHas = (b, x, y) => (b.mask[y] || '')[x] === '#';

const UPG = [
  { k: 'energy',   n: 'エネルギータンク', d: '最大エネルギー +15',          max: 40, cost: lv => Math.round(20 * Math.pow(1.33, lv)) },
  { k: 'bag',      n: 'かばん拡張',       d: 'かばんの容量 +4',             max: 40, cost: lv => Math.round(25 * Math.pow(1.33, lv)) },
  { k: 'drill',    n: '研磨機',           d: 'すべてのドリルの採掘力 +5%',  max: 60, cost: lv => Math.round(60 * Math.pow(1.42, lv)) },
  { k: 'light',    n: 'ヘッドライト',     d: '視界 +0.5',                   max: 8,  cost: lv => Math.round(50 * Math.pow(1.9, lv)) },
  { k: 'move',     n: '移動ブースター',   d: '移動速度 +10%',               max: 10, cost: lv => Math.round(40 * Math.pow(1.7, lv)) },
  { k: 'treasure', n: '宝の地図',         d: '宝箱の中身 +15%',             max: 10, cost: lv => Math.round(150 * Math.pow(1.75, lv)) },
  { k: 'bomb',     n: '爆薬改良',         d: '爆弾の範囲 +1',               max: 2,  cost: lv => Math.round(800 * Math.pow(10, lv)) },
];

const SLOT_FLOORS = [0, 40, 120, 250, 450, 700, 1200];
const RAR = ['コモン', 'レア', 'エピック', 'レジェンド'];
const MAX_DRILLS = 80;

// ============================================================
//  3. 設定・セーブ
// ============================================================
const SAVE_KEY = 'pixeldrill999_save_v1';
const SET_KEY = 'pixeldrill999_settings_v1';
const defaultSettings = () => ({ bgm: 0.5, se: 0.7, shake: true, dmg: true, swapAB: false, swapXY: false });
let SET = defaultSettings();
let S = null;

function loadSettings() {
  try {
    const raw = localStorage.getItem(SET_KEY);
    if (raw) SET = Object.assign(defaultSettings(), JSON.parse(raw));
  } catch (e) { SET = defaultSettings(); }
}
function saveSettings() {
  try { localStorage.setItem(SET_KEY, JSON.stringify(SET)); } catch (e) { /* 保存不可 */ }
}

function starterDrill() {
  return { id: 1, bp: 0, name: 'はじめてのドリル', power: 3, speed: 3, cost: 1, eff: [], rar: 0, ore: -1, lock: true };
}
function newSave() {
  const s = {
    v: 1,
    seed: ((Math.random() * 0x7ffffffe) | 0) + 1,
    coins: 30,
    deepest: 0,
    ores: Array(ORES.length).fill(0),
    bps: [0],
    drills: [starterDrill()],
    nid: 2,
    equip: Array(SLOT_FLOORS.length).fill(null),
    upg: {},
    dug: [],
    torches: [],
    stats: { broken: 0, ores: 0, coins: 0, crafted: 0, time: 0, trips: 0, chests: 0, bombs: 0, clearTime: 0 },
    dex: { ores: [], eff: [], bio: [] },
    cleared: false,
  };
  s.equip[0] = 1;
  s.ores[0] = 4;
  return s;
}
function encodeDug(arr) {
  let last = arr.length - 1;
  while (last >= 0 && !arr[last]) last--;
  const out = [];
  for (let i = 0; i <= last; i++) out.push(arr[i] ? arr[i].toString(36) : '');
  return out.join(',');
}
function decodeDug(str) {
  if (Array.isArray(str)) return str.map(v => v | 0);
  if (typeof str !== 'string' || !str) return [];
  return str.split(',').map(s => (s ? parseInt(s, 36) || 0 : 0));
}
function sanitize(o) {
  if (!o || typeof o !== 'object' || !o.seed) return null;
  const d = newSave();
  const s = Object.assign({}, d, o);
  s.stats = Object.assign({}, d.stats, o.stats || {});
  s.dex = Object.assign({}, d.dex, o.dex || {});
  ['ores', 'eff', 'bio'].forEach(k => { if (!Array.isArray(s.dex[k])) s.dex[k] = []; });
  s.upg = Object.assign({}, o.upg || {});
  s.ores = d.ores.map((_, i) => Math.max(0, Math.floor(+((o.ores || [])[i]) || 0)));
  s.bps = Array.isArray(o.bps) ? o.bps.filter(i => BP[i]) : [0];
  if (!s.bps.includes(0)) s.bps.unshift(0);
  s.drills = Array.isArray(o.drills) ? o.drills.filter(x => x && x.id && BP[x.bp] && Array.isArray(x.eff)) : [];
  s.equip = d.equip.map((_, i) => {
    const id = (o.equip || [])[i];
    return s.drills.some(x => x.id === id) ? id : null;
  });
  s.nid = Math.max(s.nid | 0, ...s.drills.map(x => x.id + 1), 2);
  s.dug = decodeDug(o.dug);
  s.torches = Array.isArray(o.torches) ? o.torches.filter(t => Array.isArray(t) && t.length === 2) : [];
  s.coins = Math.max(0, +s.coins || 0);
  s.deepest = Math.max(0, s.deepest | 0);
  s.cleared = !!s.cleared;
  return s;
}
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return sanitize(JSON.parse(raw));
  } catch (e) { return null; }
}
function serialize() {
  return JSON.stringify(Object.assign({}, S, { dug: encodeDug(S.dug) }));
}
let saveDirty = false, saveTimer = 0;
function saveNow() {
  if (!S) return;
  saveDirty = false;
  try { localStorage.setItem(SAVE_KEY, serialize()); } catch (e) { /* 容量超過など */ }
}
function saveSoon() { saveDirty = true; }

// ============================================================
//  4. ワールド生成
// ============================================================
const isDug = (r, c) => r >= 0 && (((S.dug[r] || 0) >> c) & 1) === 1;
function setDug(r, c) { S.dug[r] = (S.dug[r] || 0) | (1 << c); }
const maxRow = () => (S.cleared ? 1000000 : LAST);
const inWorld = (r, c) => c >= 0 && c < COLS && r >= 1 && r <= maxRow();

const tierCache = new Map();
function tierWeights(r) {
  let w = tierCache.get(r);
  if (w) return w;
  w = [];
  let sum = 0;
  const maxT = r >= 1000 ? 11 : 9;
  for (let t = 0; t <= maxT; t++) {
    const c = oreCenter(t);
    let x = 0;
    if (r >= c - 170) {
      const dd = (r - c) / 90;
      x = Math.exp(-dd * dd);
      if (r > c) x = Math.max(x, 0.12 * Math.exp(-(r - c) / 260));
    }
    if (t === 0) x = Math.max(x, 0.02);
    w.push(x);
    sum += x;
  }
  for (let i = 0; i < w.length; i++) w[i] /= sum;
  if (tierCache.size > 4000) tierCache.clear();
  tierCache.set(r, w);
  return w;
}
function pickTier(r, h) {
  const w = tierWeights(r);
  let acc = 0;
  for (let t = 0; t < w.length; t++) { acc += w[t]; if (h < acc) return t; }
  return w.length - 1;
}
function genCell(r, c) {
  if (r <= 0) return T.AIR;
  if (r === LAST) return T.SEAL;
  const sd = S.seed;
  const h = hash3(c, r, sd);
  const n = noise2(c * 0.42 + 3.1, r * 0.27, sd ^ 0x5bd1);
  let acc = 0.007;
  if (h < acc) return T.CHEST;
  if (h < (acc += 0.010)) return T.TORCH;
  if (h < (acc += 0.014)) return T.BOMB;
  if (h < (acc += 0.009)) return T.ENERGY;
  if (h < (acc += 0.055)) return T.COIN;
  if (h < (acc += 0.05 + Math.max(0, n - 0.5) * 0.5)) return T.ORE | (pickTier(r, hash3(c, r, sd + 101)) << 4);
  if (h < (acc += Math.min(0.3, 0.05 + r * 0.0002) + Math.max(0, 0.45 - n) * 0.25)) return T.HARD;
  return T.SOIL;
}
const cellAt = (r, c) => (isDug(r, c) ? T.AIR : genCell(r, c));
function baseHP(r) {
  return r <= LAST ? 4 * Math.pow(1.0105, r) : 4 * Math.pow(1.0105, LAST) * Math.pow(1.004, Math.min(r - LAST, 150000));
}
const maxHP = (r, type) => Math.ceil(baseHP(r) * TYPE_HP[type]);
const coinValue = r => Math.round((6 + r * 0.5) * Math.pow(1.009, Math.min(r, 4000)));

// ============================================================
//  5. ドット絵スプライト（すべてコードで生成）
// ============================================================
const SPR = {};
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function px(x, X, Y, col) { x.fillStyle = col; x.fillRect(X, Y, 1, 1); }
function drawMap(x, X, Y, rows, pal) {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let i = 0; i < row.length; i++) {
      const col = pal[row[i]];
      if (col) { x.fillStyle = col; x.fillRect(X + i, Y + y, 1, 1); }
    }
  }
}
function fromMap(rows, pal) {
  const w = Math.max(...rows.map(r => r.length));
  const c = mk(w, rows.length);
  drawMap(c.getContext('2d'), 0, 0, rows, pal);
  return c;
}
function mirror(src) {
  const c = mk(src.width, src.height), x = c.getContext('2d');
  x.translate(src.width, 0); x.scale(-1, 1); x.drawImage(src, 0, 0);
  return c;
}

function genBlock(b, v, hard) {
  const B = BIOMES[b], c = mk(16, 16), x = c.getContext('2d');
  const R = mulberry32(b * 977 + v * 131 + (hard ? 7777 : 0) + 3);
  let base = hexA(B.base);
  if (hard) base = shadeA(base, -0.32);
  const L = rgb(shadeA(base, 0.2)), D = rgb(shadeA(base, -0.22)), DD = rgb(shadeA(base, -0.5)), LL = rgb(shadeA(base, 0.38));
  x.fillStyle = rgb(base); x.fillRect(0, 0, 16, 16);
  for (let y = 1; y < 15; y++) for (let i = 1; i < 15; i++) {
    const r = R();
    if (r < 0.09) px(x, i, y, L); else if (r < 0.22) px(x, i, y, D);
  }
  if (hard) {
    for (let k = 0; k < 3; k++) {
      const cx = 2 + Math.floor(R() * 8), cy = 2 + Math.floor(R() * 8), sw = 3 + Math.floor(R() * 2);
      x.fillStyle = rgb(shadeA(base, 0.16)); x.fillRect(cx, cy, sw, 3);
      x.fillStyle = LL; x.fillRect(cx, cy, sw - 1, 1);
      x.fillStyle = DD; x.fillRect(cx + 1, cy + 3, sw, 1); x.fillRect(cx + sw, cy + 1, 1, 2);
    }
  }
  switch (B.sp) {
    case 'clay': x.fillStyle = D; x.fillRect(1, 5, 14, 1); x.fillRect(1, 11, 14, 1); break;
    case 'rock': for (let k = 0; k < 6; k++) px(x, 1 + ((R() * 14) | 0), 1 + ((R() * 14) | 0), LL); break;
    case 'moss': x.fillStyle = '#6fa84a'; for (let i = 1; i < 15; i++) if (R() < 0.7) x.fillRect(i, 1, 1, 1 + ((R() * 3) | 0)); break;
    case 'ice': x.fillStyle = 'rgba(255,255,255,.55)'; for (let k = 0; k < 5; k++) x.fillRect(3 + k, 9 - k, 1, 1); x.fillRect(9, 4, 1, 1); x.fillRect(10, 3, 1, 1); break;
    case 'lava': for (let k = 0; k < 5; k++) px(x, 1 + ((R() * 14) | 0), 1 + ((R() * 14) | 0), R() < 0.5 ? '#ff8a2a' : '#ffd040'); break;
    case 'crystal':
      for (let k = 0; k < 2; k++) {
        const X = 3 + ((R() * 9) | 0), Y = 3 + ((R() * 9) | 0);
        x.fillStyle = '#d9b8ff'; x.fillRect(X, Y - 1, 1, 3); x.fillRect(X - 1, Y, 3, 1); px(x, X, Y, '#fff');
      }
      break;
    case 'obsidian': x.fillStyle = 'rgba(170,150,255,.35)'; x.fillRect(4, 3, 1, 4); x.fillRect(5, 3, 1, 2); x.fillRect(10, 9, 1, 3); break;
    case 'ruins': x.fillStyle = D; x.fillRect(1, 5, 14, 1); x.fillRect(1, 10, 14, 1); x.fillRect(5, 1, 1, 4); x.fillRect(11, 6, 1, 4); x.fillRect(7, 11, 1, 4); break;
    case 'abyss': for (let k = 0; k < 3; k++) px(x, 1 + ((R() * 14) | 0), 1 + ((R() * 14) | 0), R() < 0.5 ? '#ffffff' : '#ff9ae8'); break;
    case 'void': x.fillStyle = 'rgba(80,255,220,.35)'; x.fillRect(1, 7, 14, 1); x.fillRect(7, 1, 1, 14); break;
    default: break;
  }
  x.fillStyle = L; x.fillRect(0, 0, 16, 1); x.fillRect(0, 0, 1, 16);
  x.fillStyle = DD; x.fillRect(0, 15, 16, 1); x.fillRect(15, 0, 1, 16);
  return c;
}
function genWall(b, v) {
  const B = BIOMES[b], c = mk(16, 16), x = c.getContext('2d'), R = mulberry32(b * 313 + v * 17 + 99);
  const base = hexA(B.wall);
  x.fillStyle = rgb(base); x.fillRect(0, 0, 16, 16);
  const L = rgb(shadeA(base, 0.14)), D = rgb(shadeA(base, -0.4));
  for (let y = 0; y < 16; y++) for (let i = 0; i < 16; i++) {
    const r = R();
    if (r < 0.07) px(x, i, y, L); else if (r < 0.15) px(x, i, y, D);
  }
  if (v === 1) { x.fillStyle = L; x.fillRect(4, 10, 3, 2); x.fillStyle = D; x.fillRect(5, 12, 3, 1); }
  return c;
}
function genSeal() {
  const c = mk(16, 16), x = c.getContext('2d');
  x.fillStyle = '#b8901e'; x.fillRect(0, 0, 16, 16);
  x.fillStyle = '#7a5a10'; x.fillRect(0, 15, 16, 1); x.fillRect(15, 0, 1, 16);
  x.fillStyle = '#ffe680'; x.fillRect(0, 0, 16, 1); x.fillRect(0, 0, 1, 16);
  drawMap(x, 3, 3, [
    '..####..',
    '.#....#.',
    '#..##..#',
    '#.#..#.#',
    '#.#..#.#',
    '#..##..#',
    '.#....#.',
    '..####..',
  ], { '#': '#fff3b0' });
  px(x, 7, 7, '#ff5a6a'); px(x, 8, 8, '#ff5a6a');
  return c;
}
function genOreOverlay(t) {
  const o = ORES[t], c = mk(16, 16), x = c.getContext('2d');
  const gem = ['.cc.', 'chcc', 'cccd', '.dd.'];
  const pal = { c: o.c, h: o.h, d: o.d };
  const pos = [[2, 2], [9, 3], [4, 9], [10, 10]];
  if (t >= 3) pos.push([7, 6]);
  pos.forEach(([X, Y]) => drawMap(x, X, Y, gem, pal));
  if (t >= 7) { px(x, 1, 13, '#fff'); px(x, 14, 1, '#fff'); px(x, 8, 13, '#fff'); }
  return c;
}
function genOreIcon(t) {
  const o = ORES[t], c = mk(12, 12), x = c.getContext('2d');
  const hw = [2, 3, 4, 5, 5, 5, 5, 4, 3, 2];
  const inside = (i, y) => y >= 0 && y < 10 && Math.abs(i + 0.5 - 6) <= hw[y];
  const out = rgb(shadeA(hexA(o.d), -0.5));
  for (let y = 0; y < 10; y++) for (let i = 0; i < 12; i++) {
    if (!inside(i, y)) continue;
    const edge = !inside(i - 1, y) || !inside(i + 1, y) || !inside(i, y - 1) || !inside(i, y + 1);
    let col = o.c;
    if (edge) col = out;
    else if (i + y < 8) col = o.h;
    else if (i - y > 3 || y > 6) col = o.d;
    px(x, i, y + 1, col);
  }
  px(x, 4, 3, '#fff');
  return c;
}
const COIN_MAP = ['..kkkk..', '.kyyyyk.', 'kyYyyyyk', 'kyYyGyyk', 'kyyyGyyk', 'kyyyyyyk', '.kyyyyk.', '..kkkk..'];
const COIN_PAL = { k: '#7a4a08', y: '#f2c230', Y: '#fff6a0', G: '#c99a10' };
const TORCH_A = ['..rr..', '.rYYr.', '.rYyr.', '..Yy..', '..ww..', '..bb..', '..bb..', '..bb..', '..bb..', '..BB..'];
const TORCH_B = ['...r..', '..rYr.', '.rYyYr', '..yY..', '..ww..', '..bb..', '..bb..', '..bb..', '..bb..', '..BB..'];
const TORCH_PAL = { r: '#ff6a1a', Y: '#ffe14a', y: '#fff8c0', w: '#7a5a30', b: '#a0703a', B: '#5a3a18' };

function buildSprites() {
  SPR.block = []; SPR.hard = []; SPR.wall = [];
  for (let b = 0; b < BIOMES.length; b++) {
    SPR.block[b] = [0, 1, 2].map(v => genBlock(b, v, false));
    SPR.hard[b] = [0, 1].map(v => genBlock(b, v + 5, true));
    SPR.wall[b] = [0, 1].map(v => genWall(b, v));
  }
  SPR.seal = genSeal();
  SPR.ore = ORES.map((_, t) => genOreOverlay(t));
  SPR.oreIcon = ORES.map((_, t) => genOreIcon(t));

  let c = mk(16, 16), x = c.getContext('2d');
  drawMap(x, 4, 4, COIN_MAP, COIN_PAL);
  SPR.coin = c;
  c = mk(16, 16); x = c.getContext('2d'); drawMap(x, 5, 3, TORCH_A, TORCH_PAL); SPR.torch = c;
  SPR.wtorch = [TORCH_A, TORCH_B].map(m => { const k = mk(16, 16); drawMap(k.getContext('2d'), 5, 3, m, TORCH_PAL); return k; });
  c = mk(16, 16); x = c.getContext('2d');
  drawMap(x, 2, 2, [
    '........yr',
    '.......yk.',
    '......k...',
    '...kkkkk..',
    '..kgggggk.',
    '.kgWWggggk',
    '.kgWggggGk',
    '.kggggggGk',
    '.kgggggGGk',
    '..kgggGGk.',
    '...kkkkk..',
  ], { k: '#0a0a12', g: '#3a3a4a', W: '#8a8aa0', G: '#26263a', y: '#ffe14a', r: '#ff5a2a' });
  SPR.bomb = c;
  c = mk(16, 16); x = c.getContext('2d');
  drawMap(x, 2, 4, [
    '.kkkkkkkkkk.',
    'kbbbbbbbbbbk',
    'kbBBBBBBBBbk',
    'kkkkkYYkkkkk',
    'kbbbbYYbbbbk',
    'kbbbbkkbbbbk',
    'kbbbbbbbbbbk',
    'kBBBBBBBBBBk',
    '.kkkkkkkkkk.',
  ], { k: '#2a1408', b: '#b8702e', B: '#7a4418', Y: '#ffd23f' });
  SPR.chest = c;
  c = mk(16, 16); x = c.getContext('2d');
  drawMap(x, 4, 2, [
    '...cc...', '..cCCc..', '.cCwCCc.', '.cCwCCc.', 'cCCwCCCc', 'cCCCwCCc',
    'cCCCwCCc', '.cCCwCc.', '.cCCCCc.', '..cCCc..', '...cc...',
  ], { c: '#1a6a9a', C: '#4ad8ff', w: '#e8ffff' });
  SPR.energy = c;

  SPR.crack = [1, 2, 3].map(stage => {
    const k = mk(16, 16), kx = k.getContext('2d'), R = mulberry32(stage * 53 + 7);
    kx.fillStyle = 'rgba(0,0,0,.62)';
    for (let b = 0; b < stage * 2; b++) {
      let X = 7 + ((R() * 3) | 0), Y = 7 + ((R() * 3) | 0);
      const dx = R() < 0.5 ? -1 : 1, dy = R() < 0.5 ? -1 : 1;
      const len = 3 + ((R() * 4) | 0);
      for (let i = 0; i < len; i++) {
        kx.fillRect(X, Y, 1, 1);
        if (R() < 0.5) X += dx; else Y += dy;
        if (X < 1 || X > 14 || Y < 1 || Y > 14) break;
      }
    }
    return k;
  });

  c = mk(16, 16); x = c.getContext('2d');
  const RG = mulberry32(42);
  for (let i = 0; i < 16; i++) {
    x.fillStyle = '#4fae35'; x.fillRect(i, 0, 1, 3);
    x.fillStyle = '#8de05a'; if (RG() < 0.6) x.fillRect(i, 0, 1, 1);
    x.fillStyle = '#3a8a28'; x.fillRect(i, 3, 1, RG() < 0.5 ? 1 : 2);
  }
  SPR.grass = c;

  const PMAP = [
    '................',
    '.....kkkkkk.....',
    '....kyyyyyYk....',
    '...kyyyyyyyllk..',
    '...kkkkkkkkkkk..',
    '....kssssssk....',
    '....kskssksk....',
    '....kssssssk....',
    '...krrbbbbrrk...',
    '..ksrbbBBbbrsk..',
    '..ksrbbbbbbrsk..',
    '...kbbbbbbbbk...',
    '...kbbBkkBbbk...',
    '...kbbbk.kbbbk..',
    '...kgggk.kgggk..',
    '...kkkkk.kkkkk..',
  ];
  const PPAL = { k: '#1a1020', y: '#f2c230', Y: '#fff09a', l: '#ffffff', s: '#f5c79a', r: '#d8443b', b: '#3b6fd8', B: '#24479a', g: '#5a3a20' };
  SPR.player = fromMap(PMAP, PPAL);
  SPR.playerL = mirror(SPR.player);

  SPR.drill = new Map();
  SPR.sky = genSky();

  const coinIc = mk(8, 8); drawMap(coinIc.getContext('2d'), 0, 0, COIN_MAP, COIN_PAL);
  const bagIc = fromMap(['..kkkk..', '..k..k..', '.kbbbbk.', 'kbbBBbbk', 'kbBYYBbk', 'kbbBBbbk', 'kbbbbbbk', '.kkkkkk.'],
    { k: '#2a1408', b: '#b8702e', B: '#7a4418', Y: '#ffd23f' });
  try {
    document.documentElement.style.setProperty('--ic-coin', `url(${coinIc.toDataURL()})`);
    document.documentElement.style.setProperty('--ic-bag', `url(${bagIc.toDataURL()})`);
  } catch (e) { /* toDataURL不可環境 */ }
}

function drillSprite(t, frame) {
  const key = t * 2 + frame;
  if (SPR.drill.has(key)) return SPR.drill.get(key);
  const o = ORES[t];
  const M = o ? o.c : '#c0c8d8', m = o ? o.d : '#6d7789';
  const A = ['kkkk......', 'kMMMkk....', 'kMmMMMkk..', 'kMMmMMMMkk', 'kMmMMMkk..', 'kMMMkk....', 'kkkk......'];
  const B = ['kkkk......', 'kMmMkk....', 'kMMmMMkk..', 'kMMMmMMMkk', 'kMMmMMkk..', 'kMmMkk....', 'kkkk......'];
  const c = fromMap(frame ? B : A, { k: '#14101c', M, m });
  SPR.drill.set(key, c);
  return c;
}

const iconCache = new Map();
function oreIconURL(t) {
  const k = 'o' + t;
  if (!iconCache.has(k)) { try { iconCache.set(k, SPR.oreIcon[t].toDataURL()); } catch (e) { iconCache.set(k, ''); } }
  return iconCache.get(k);
}
function drillIconURL(t) {
  const k = 'd' + t;
  if (!iconCache.has(k)) {
    const c = mk(16, 16), x = c.getContext('2d');
    x.fillStyle = '#14101c'; x.fillRect(0, 5, 4, 6);
    x.fillStyle = '#7a5a30'; x.fillRect(1, 6, 2, 4);
    x.drawImage(drillSprite(t, 0), 4, 4);
    try { iconCache.set(k, c.toDataURL()); } catch (e) { iconCache.set(k, ''); }
  }
  return iconCache.get(k);
}

function genSky() {
  const c = mk(208, 80), x = c.getContext('2d');
  const bands = ['#2f6fd0', '#3f82dc', '#5096e4', '#64aaec', '#7cbff2', '#98d2f6', '#b4e2fa'];
  const bh = 80 / bands.length;
  bands.forEach((col, i) => { x.fillStyle = col; x.fillRect(0, Math.floor(i * bh), 208, Math.ceil(bh) + 1); });
  for (let i = 1; i < bands.length; i++) {
    const y = Math.floor(i * bh);
    x.fillStyle = bands[i];
    for (let X = 0; X < 208; X += 2) x.fillRect(X + (i % 2), y - 1, 1, 1);
  }
  x.fillStyle = '#fff2a0'; x.beginPath(); x.arc(34, 16, 7, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#fffbe0'; x.fillRect(31, 13, 5, 5);
  const cloud = (X, Y, w) => { x.fillStyle = '#ffffff'; x.fillRect(X, Y, w, 4); x.fillRect(X + 3, Y - 3, w - 8, 3); x.fillStyle = '#d8ecff'; x.fillRect(X, Y + 4, w, 1); };
  cloud(70, 14, 26); cloud(130, 26, 20); cloud(176, 10, 18);
  for (let X = 0; X < 208; X++) {
    const y1 = Math.round(56 + 5 * Math.sin(X * 0.045) + 3 * Math.sin(X * 0.13));
    x.fillStyle = '#7cc46a'; x.fillRect(X, y1, 1, 80 - y1);
    const y2 = Math.round(66 + 3 * Math.sin(X * 0.08 + 1.7));
    x.fillStyle = '#5aa848'; x.fillRect(X, y2, 1, 80 - y2);
  }
  // テント
  drawMap(x, 148, 64, [
    '.......k.......',
    '......krk......',
    '.....krrrk.....',
    '....krwrrrk....',
    '...krrwrrrrk...',
    '..krrrwrrrrrk..',
    '.krrrrkkkrrrrk.',
    'krrrrrkkkrrrrrk',
    'kkkkkkkkkkkkkkk',
  ], { k: '#3a1010', r: '#d8443b', w: '#f6efdc' });
  // やぐら
  x.fillStyle = '#4a4050';
  x.fillRect(184, 38, 2, 42); x.fillRect(198, 38, 2, 42);
  for (let y = 40; y < 80; y += 8) { x.fillRect(184, y, 16, 1); for (let i = 0; i < 8; i++) { x.fillRect(184 + i * 2, y + i, 1, 1); } }
  x.fillStyle = '#c9862a'; x.fillRect(181, 34, 22, 4);
  x.fillStyle = '#ff5a6a'; x.fillRect(191, 24, 1, 10); x.fillRect(192, 24, 6, 4);
  // 看板
  x.fillStyle = '#7a5a30'; x.fillRect(16, 70, 2, 10); x.fillStyle = '#b8823a'; x.fillRect(10, 64, 16, 7);
  x.fillStyle = '#3a2410'; x.fillRect(12, 66, 2, 1); x.fillRect(15, 66, 4, 1); x.fillRect(20, 66, 3, 1); x.fillRect(12, 68, 10, 1);
  return c;
}

// ============================================================
//  6. サウンド（WebAudioで全部合成）
// ============================================================
const SND = {
  ctx: null, master: null, sfx: null, bgm: null, nbuf: null, ok: false, last: {},
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain(); this.sfx.connect(this.master);
      this.bgm = this.ctx.createGain(); this.bgm.connect(this.master);
      const len = this.ctx.sampleRate;
      this.nbuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.nbuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.ok = true;
      this.setVol();
      BGM.restart();
    } catch (e) { this.ok = false; }
  },
  setVol() {
    if (!this.ok) return;
    this.sfx.gain.value = SET.se * 0.9;
    this.bgm.gain.value = SET.bgm * 0.55;
  },
  tone(f, dur, type = 'square', vol = 0.15, slide = 0, delay = 0, dest) {
    if (!this.ok) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfx);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol = 0.2, freq = 1200, delay = 0, type = 'lowpass') {
    if (!this.ok) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.nbuf;
    f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfx);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  },
  play(name, p = 0) {
    if (!this.ok || SET.se <= 0) return;
    const now = performance.now();
    const gap = { hit: 45, ore: 60, coin: 50, ui: 30, place: 30 }[name] || 0;
    if (gap && this.last[name] && now - this.last[name] < gap) return;
    this.last[name] = now;
    switch (name) {
      case 'hit': this.noise(0.05, 0.12, 900 + p * 120); this.tone(140 + p * 10, 0.04, 'square', 0.05); break;
      case 'break': this.noise(0.14, 0.22, 1400); this.tone(220, 0.12, 'square', 0.06, 70); break;
      case 'ore': [660, 880, 1320].forEach((f, i) => this.tone(f, 0.09, 'triangle', 0.14, 0, i * 0.05)); break;
      case 'coin': this.tone(988, 0.06, 'square', 0.08); this.tone(1319, 0.14, 'square', 0.08, 0, 0.06); break;
      case 'bomb': this.noise(0.6, 0.5, 500); this.tone(90, 0.5, 'sawtooth', 0.14, 30); break;
      case 'chest': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.14, 'square', 0.08, 0, i * 0.07)); break;
      case 'rare': [784, 988, 1175, 1568, 1976].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.13, 0, i * 0.06)); break;
      case 'energy': this.tone(300, 0.25, 'sine', 0.16, 1100); break;
      case 'torch': this.noise(0.25, 0.1, 3000, 0, 'highpass'); this.tone(520, 0.1, 'triangle', 0.08, 780); break;
      case 'error': this.tone(110, 0.1, 'square', 0.1); this.tone(98, 0.14, 'square', 0.1, 0, 0.11); break;
      case 'ui': this.tone(880, 0.035, 'square', 0.05); break;
      case 'place': this.tone(620, 0.05, 'square', 0.07); break;
      case 'remove': this.tone(380, 0.06, 'square', 0.07); break;
      case 'buy': this.tone(784, 0.06, 'square', 0.08); this.tone(1175, 0.12, 'square', 0.08, 0, 0.06); break;
      case 'craft': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.12, 'square', 0.08, 0, i * 0.06)); this.noise(0.3, 0.06, 4000, 0.3, 'highpass'); break;
      case 'warp': this.tone(200, 0.4, 'triangle', 0.14, 1600); break;
      case 'level': [659, 784, 988, 1319].forEach((f, i) => this.tone(f, 0.1, 'square', 0.07, 0, i * 0.05)); break;
      case 'clear':
        [523, 659, 784, 1047, 784, 1047, 1319, 1568].forEach((f, i) => this.tone(f, 0.22, 'square', 0.09, 0, i * 0.13));
        [262, 330, 392, 523].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.12, 0, i * 0.26));
        break;
      default: break;
    }
  },
};

const BGM = {
  scene: null, key: 0, step: 0, next: 0,
  SONGS: {
    camp: {
      tempo: 0.15,
      lead: [72, null, 76, null, 79, null, 76, null, 74, null, 77, null, 81, null, 77, null, 76, null, 79, null, 84, null, 79, null, 77, 76, 74, null, 72, null, null, null],
      bass: [48, null, null, null, 55, null, null, null, 50, null, null, null, 57, null, null, null, 52, null, null, null, 55, null, null, null, 53, null, 55, null, 48, null, null, null],
    },
    dig: {
      tempo: 0.17,
      lead: [69, null, null, 72, null, null, 76, null, 74, null, 72, null, 71, null, null, null, 69, null, null, 72, null, null, 77, null, 76, null, 74, null, 72, null, 71, null],
      bass: [45, null, 52, null, 45, null, 52, null, 43, null, 50, null, 43, null, 50, null, 41, null, 48, null, 41, null, 48, null, 40, null, 47, null, 40, null, 47, null],
    },
  },
  play(scene, key = 0) {
    if (this.scene === scene && this.key === key) return;
    this.scene = scene; this.key = key; this.step = 0;
    this.next = SND.ok ? SND.ctx.currentTime + 0.1 : 0;
  },
  restart() { if (SND.ok) this.next = SND.ctx.currentTime + 0.1; },
  tick() {
    if (!SND.ok || !this.scene || SET.bgm <= 0 || SND.ctx.state !== 'running') return;
    const song = this.SONGS[this.scene];
    const ct = SND.ctx.currentTime;
    if (this.next < ct - 0.5) this.next = ct + 0.05;
    while (this.next < ct + 0.25) {
      const i = this.step % song.lead.length;
      const mf = m => 440 * Math.pow(2, (m + this.key - 69) / 12);
      const L = song.lead[i], Bn = song.bass[i];
      const delay = Math.max(0, this.next - ct);
      if (L != null) SND.tone(mf(L), song.tempo * 1.7, 'square', 0.045, 0, delay, SND.bgm);
      if (Bn != null) SND.tone(mf(Bn), song.tempo * 2.4, 'triangle', 0.11, 0, delay, SND.bgm);
      this.next += song.tempo;
      this.step++;
    }
  },
};

// ============================================================
//  7. 入力（キーボード・タッチ・コントローラー）
// ============================================================
const Input = { stack: [], kdir: null, tdir: null, pdir: null };
Input.dir = () => Input.pdir || Input.tdir || Input.kdir;
const KEYDIR = { ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd', ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r' };
const DV = { u: [-1, 0], d: [1, 0], l: [0, -1], r: [0, 1] };
let padMode = false;

function setPadMode(on) {
  if (on === padMode) return;
  padMode = on;
  document.body.classList.toggle('pad', on);
  if (on && !inDiveControl()) {
    const a = document.activeElement;
    if (!a || a === document.body || !navTargets().includes(a)) focusFirst();
  }
}
const inDiveControl = () => G.on && !Modal.isOpen();

const Pad = {
  prev: {}, navT: 0, navDir: null,
  poll(dt) {
    let gp = null;
    try {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const p of pads) if (p && p.connected) { gp = p; break; }
    } catch (e) { gp = null; }
    if (!gp) { Input.pdir = null; this.prev = {}; this.navDir = null; return; }
    const b = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    let dir = null;
    if (b(12)) dir = 'u'; else if (b(13)) dir = 'd'; else if (b(14)) dir = 'l'; else if (b(15)) dir = 'r';
    else if (Math.abs(ax) > 0.55 || Math.abs(ay) > 0.55) dir = Math.abs(ax) > Math.abs(ay) ? (ax < 0 ? 'l' : 'r') : (ay < 0 ? 'u' : 'd');
    const A = SET.swapAB ? 1 : 0, Bk = SET.swapAB ? 0 : 1, X = SET.swapXY ? 3 : 2, Y = SET.swapXY ? 2 : 3;
    const cur = { A: b(A), B: b(Bk), X: b(X), Y: b(Y), S: b(9), L: b(4), R: b(5), dir };
    const pressed = k => cur[k] && !this.prev[k];
    if (cur.A || cur.B || cur.X || cur.Y || cur.S || cur.L || cur.R || dir) { setPadMode(true); SND.init(); }

    if (inDiveControl()) {
      Input.pdir = dir;
      this.navDir = dir;
      if (pressed('S')) pauseMenu();
      else if (pressed('Y')) askReturn();
    } else {
      Input.pdir = null;
      if (dir) {
        if (dir !== this.navDir) { this.navDir = dir; this.navT = 0.32; navMove(dir); }
        else { this.navT -= dt; if (this.navT <= 0) { this.navT = 0.1; navMove(dir); } }
      } else this.navDir = null;
      if (pressed('A')) navActivate();
      else if (pressed('B')) goBack();
      else if (pressed('X')) ctxAction('x');
      else if (pressed('Y')) ctxAction('y');
      else if (pressed('S')) goBack(true);
      else if (pressed('L')) switchTab(-1);
      else if (pressed('R')) switchTab(1);
    }
    this.prev = cur;
  },
};

function bindInput() {
  window.addEventListener('keydown', e => {
    SND.init();
    if (e.target && (e.target.tagName === 'TEXTAREA' || (e.target.tagName === 'INPUT' && e.target.type !== 'range'))) return;
    const d = KEYDIR[e.code];
    if (d) {
      if (!Input.stack.includes(d)) Input.stack.push(d);
      Input.kdir = Input.stack[Input.stack.length - 1];
    }
    if (padMode) setPadMode(false);
    if (inDiveControl()) {
      if (d || e.code === 'Space') e.preventDefault();
      if (e.code === 'Escape' || e.code === 'KeyP') { e.preventDefault(); pauseMenu(); }
      else if (e.code === 'KeyR') { e.preventDefault(); askReturn(); }
      return;
    }
    if (e.code.startsWith('Arrow')) { e.preventDefault(); navMove(d); }
    else if (e.code === 'Escape') { e.preventDefault(); goBack(); }
    else if (e.code === 'KeyR' && !e.repeat) ctxAction('x');
    else if (e.code === 'KeyF' && !e.repeat) ctxAction('y');
  });
  window.addEventListener('keyup', e => {
    const d = KEYDIR[e.code];
    if (d) {
      Input.stack = Input.stack.filter(k => k !== d);
      Input.kdir = Input.stack[Input.stack.length - 1] || null;
    }
  });
  window.addEventListener('blur', () => { Input.stack = []; Input.kdir = null; Input.tdir = null; });

  const dp = $('#dpad');
  let dpId = null;
  const dpUpdate = e => {
    const r = dp.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    let d = null;
    if (Math.hypot(dx, dy) > r.width * 0.1) d = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'l' : 'r') : (dy < 0 ? 'u' : 'd');
    if (d !== Input.tdir) { Input.tdir = d; dp.dataset.dir = d || ''; }
  };
  dp.addEventListener('pointerdown', e => {
    e.preventDefault();
    SND.init();
    dpId = e.pointerId;
    try { dp.setPointerCapture(e.pointerId); } catch (err) { /* 無視 */ }
    dpUpdate(e);
  });
  dp.addEventListener('pointermove', e => { if (e.pointerId === dpId) dpUpdate(e); });
  const dpEnd = e => { if (e.pointerId === dpId) { dpId = null; Input.tdir = null; dp.dataset.dir = ''; } };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => dp.addEventListener(ev, dpEnd));

  // タッチ検出 → タッチボタン表示 / コントローラーモード解除
  const onTouch = () => { document.body.classList.add('touch'); setPadMode(false); SND.init(); };
  window.addEventListener('touchstart', onTouch, { passive: true });
  window.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') onTouch(); else SND.init(); });
  window.addEventListener('touchend', () => SND.init(), { passive: true });

  // 拡大・長押しメニュー・コピー対策
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('gesturechange', e => e.preventDefault());
  document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
  document.addEventListener('contextmenu', e => { if (!e.target.closest('textarea')) e.preventDefault(); });
  document.addEventListener('selectstart', e => { if (!e.target.closest || !e.target.closest('textarea,input')) e.preventDefault(); });
  document.addEventListener('touchmove', e => { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });
}

// ============================================================
//  8. 採掘パート
// ============================================================
const cv = $('#game');
const ctx = cv.getContext('2d');
const fxLayer = $('#fx');
let viewRows = 16, viewScale = 1;

const G = {
  on: false, r: 0, c: CENTER, px: CENTER, py: 0, face: 'd',
  energy: 0, bag: [], bagN: 0, hp: new Map(), parts: [], floats: [],
  shake: 0, flash: 0, camY: -4, hitT: 0, moveT: 0, tgt: -1, digging: false, anim: 0,
  lastBiome: -1, lo: null, trip: null, noEn: false, errT: 0, overWarned: false, statusT: 0,
};

function slotCount() { return SLOT_FLOORS.filter(f => S.deepest >= f).length; }
const drillById = id => (id == null ? null : S.drills.find(d => d.id === id) || null);

function loadout() {
  const eff = {};
  EFF_KEYS.forEach(k => { eff[k] = 0; });
  const n = slotCount();
  for (let i = 0; i < n; i++) {
    const d = drillById(S.equip[i]);
    if (d) d.eff.forEach(e => { eff[e.k] += e.v; });
  }
  EFF_KEYS.forEach(k => { eff[k] = Math.min(EFFECTS[k].cap, eff[k]); });
  const main = drillById(S.equip[0]);
  const u = k => S.upg[k] || 0;
  return {
    main, eff,
    power: (main ? main.power : 1) * (1 + eff.str / 100) * (1 + 0.05 * u('drill')),
    speed: (main ? main.speed : 2.2) * (1 + eff.haste / 100),
    cost: main ? main.cost : 1,
    maxE: 60 + 15 * u('energy'),
    cap: 12 + 4 * u('bag') + eff.bag,
    light: 3 + 0.5 * u('light') + eff.light,
    moveMult: 1 + 0.1 * u('move'),
    bombR: 2 + u('bomb') + eff.bomb,
    treasure: 1 + 0.15 * u('treasure') + eff.lucky / 100,
  };
}

function resizeView() {
  const wrap = $('#view');
  const W = wrap.clientWidth, H = wrap.clientHeight;
  if (!W || !H) return;
  viewRows = clamp(Math.round((H / W) * COLS), 10, 30);
  if (cv.width !== COLS * TILE || cv.height !== viewRows * TILE) {
    cv.width = COLS * TILE;
    cv.height = viewRows * TILE;
  }
  viewScale = Math.min(W / cv.width, H / cv.height);
  const cw = Math.floor(cv.width * viewScale), ch = Math.floor(cv.height * viewScale);
  cv.style.width = cw + 'px';
  cv.style.height = ch + 'px';
  viewScale = cw / cv.width;
  ctx.imageSmoothingEnabled = false;
}

function startDive(floor) {
  floor = clamp(floor | 0, 0, Math.floor(S.deepest / 10) * 10);
  G.lo = loadout();
  G.on = true;
  G.r = floor;
  G.c = CENTER;
  if (floor > 0) {
    let best = -1;
    for (let d = 0; d < COLS && best < 0; d++) {
      if (CENTER - d >= 0 && isDug(floor, CENTER - d)) best = CENTER - d;
      else if (CENTER + d < COLS && isDug(floor, CENTER + d)) best = CENTER + d;
    }
    if (best < 0) { setDug(floor, CENTER); best = CENTER; }
    G.c = best;
  }
  G.px = G.c; G.py = G.r; G.face = 'd';
  G.energy = G.lo.maxE;
  G.bag = Array(ORES.length).fill(0); G.bagN = 0;
  G.hp.clear(); G.parts = []; clearFloats();
  G.shake = 0; G.flash = 0; G.hitT = 0; G.moveT = 0; G.tgt = -1; G.digging = false;
  G.noEn = false; G.overWarned = false; G.lastBiome = -1;
  document.body.classList.remove('noen');
  G.trip = { coins: 0, start: floor, maxR: floor, broken: 0, chests: 0, bps: [] };
  S.stats.trips++;
  showScreen('dive');
  resizeView();
  G.camY = Math.max(-4, G.py - viewRows * 0.38);
  setStatus('', 0);
  onEnterRow(true);
  if (floor === 0) BGM.play('dig', BIOMES[0].key);
  SND.play('warp');
  saveSoon();
}

function update(dt) {
  G.anim += dt;
  const lo = G.lo;
  const dir = Input.dir();
  G.moveT -= dt;
  let digging = false;
  if (dir) {
    G.face = dir;
    const [dr, dc] = DV[dir];
    const tr = G.r + dr, tc = G.c + dc;
    if (tc >= 0 && tc < COLS && tr >= 0 && tr <= maxRow()) {
      const code = cellAt(tr, tc);
      if ((code & 15) === T.AIR) {
        if (G.moveT <= 0) {
          G.r = tr; G.c = tc;
          G.moveT = 0.13 / lo.moveMult;
          G.tgt = -1;
          onEnterRow(false);
        }
      } else {
        digging = true;
        const key = tr * COLS + tc;
        const over = G.bagN > lo.cap ? clamp(lo.cap / G.bagN, 0.35, 1) : 1;
        const interval = 1 / Math.max(0.2, lo.speed * over);
        if (G.tgt !== key) { G.tgt = key; G.hitT = interval; }
        else G.hitT += dt;
        let guard = 0;
        while (G.hitT >= interval && guard++ < 8) {
          G.hitT -= interval;
          if (!doHit(tr, tc, dr, dc)) { G.hitT = 0; break; }
          if ((cellAt(tr, tc) & 15) === T.AIR) { G.tgt = -1; break; }
        }
      }
    }
  } else {
    G.tgt = -1;
  }
  G.digging = digging;

  // 表示位置の補間
  const k = Math.min(1, dt * 18);
  G.px += (G.c - G.px) * k; G.py += (G.r - G.py) * k;
  if (Math.abs(G.c - G.px) < 0.01) G.px = G.c;
  if (Math.abs(G.r - G.py) < 0.01) G.py = G.r;
  const target = Math.max(-4, G.py - viewRows * 0.38);
  G.camY += (target - G.camY) * Math.min(1, dt * 7);

  G.shake = Math.max(0, G.shake - dt * 30);
  G.flash = Math.max(0, G.flash - dt * 3);
  for (let i = G.parts.length - 1; i >= 0; i--) {
    const p = G.parts[i];
    p.life -= dt;
    if (p.life <= 0) { G.parts.splice(i, 1); continue; }
    p.vy += 220 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
  }
  if (G.statusT > 0) { G.statusT -= dt; if (G.statusT <= 0) setStatus('', 0); }
  G.errT -= dt;
}

function doHit(tr, tc, dr, dc) {
  const lo = G.lo;
  if (!chance(lo.eff.eco)) {
    if (G.energy < lo.cost) { noEnergy(); return false; }
    G.energy -= lo.cost;
  }
  const n = 1 + (chance(lo.eff.combo) ? 1 : 0);
  const code = cellAt(tr, tc);
  for (let i = 0; i < n; i++) damage(tr, tc, lo.power);
  if (chance(lo.eff.pierce)) damage(tr + dr, tc + dc, lo.power * 0.6);
  if (chance(lo.eff.wide)) { damage(tr + dc, tc + dr, lo.power * 0.6); damage(tr - dc, tc - dr, lo.power * 0.6); }
  SND.play('hit', code & 15);
  if (G.energy < lo.cost && G.energy < lo.maxE * 0.05) noEnergy();
  return true;
}

function damage(r, c, dmg) {
  if (!inWorld(r, c)) return;
  const code = cellAt(r, c), type = code & 15;
  if (!type) return;
  const key = r * COLS + c;
  const mx = maxHP(r, type);
  let hp = G.hp.has(key) ? G.hp.get(key) : mx;
  const crit = chance(G.lo.eff.crit);
  if (crit) dmg *= 3;
  dmg = Math.max(1, Math.round(dmg));
  hp -= dmg;
  if (SET.dmg) floatText(fmt(dmg), r, c, crit ? '#ffd23f' : '#ffffff', crit);
  burst(r, c, blockColor(r, code), 3, 50);
  if (hp <= 0 || (G.lo.eff.execute > 0 && (hp / mx) * 100 <= G.lo.eff.execute)) {
    G.hp.delete(key);
    breakCell(r, c, code);
  } else {
    G.hp.set(key, hp);
  }
}

function blockColor(r, code) {
  const t = code & 15;
  if (t === T.ORE) return ORES[code >> 4].c;
  if (t === T.SEAL) return '#ffe680';
  return BIOMES[biomeOf(r)].base;
}

function addCoins(v) {
  S.coins += v; S.stats.coins += v;
  if (G.trip) G.trip.coins += v;
}

function breakCell(r, c, code) {
  const type = code & 15, tier = code >> 4, lo = G.lo;
  setDug(r, c);
  S.stats.broken++; G.trip.broken++;
  burst(r, c, blockColor(r, code), 10, 90);
  switch (type) {
    case T.ORE: {
      const n = chance(lo.eff.double) ? 2 : 1;
      G.bag[tier] += n; G.bagN += n; S.stats.ores += n;
      if (!S.dex.ores.includes(tier)) S.dex.ores.push(tier);
      floatText(`+${ORES[tier].n}${n > 1 ? '×2' : ''}`, r, c, ORES[tier].h, true);
      sparkle(r, c, ORES[tier].h);
      SND.play('ore');
      if (G.bagN > lo.cap && !G.overWarned) { G.overWarned = true; setStatus('かばんが重い！ 採掘が遅くなる', 2.5); }
      break;
    }
    case T.COIN: {
      const v = Math.round(coinValue(r) * (1 + lo.eff.coin / 100));
      addCoins(v);
      floatText(`+${fmt(v)}`, r, c, '#ffe680', true);
      sparkle(r, c, '#ffe680');
      SND.play('coin');
      break;
    }
    case T.TORCH:
      S.torches.push([r, c]);
      floatText('たいまつ', r, c, '#ffb050', false);
      SND.play('torch');
      break;
    case T.BOMB: explode(r, c); break;
    case T.CHEST: openChest(r, c); break;
    case T.ENERGY:
      G.energy = Math.min(lo.maxE, G.energy + lo.maxE * 0.35);
      energyBack();
      floatText('エネルギー回復', r, c, '#7ff0ff', true);
      SND.play('energy');
      break;
    default: SND.play('break'); break;
  }
  if (chance(lo.eff.charge)) {
    G.energy = Math.min(lo.maxE, G.energy + lo.maxE * 0.06);
    energyBack();
    floatText('充電', r, c, '#7ff0ff', false);
  }
  saveSoon();
}

function explode(r0, c0) {
  const R = G.lo.bombR;
  const q = [[r0, c0]];
  let count = 0;
  while (q.length && count < 40) {
    const [br, bc] = q.shift();
    count++;
    S.stats.bombs++;
    for (let dr = -R; dr <= R; dr++) for (let dc = -R; dc <= R; dc++) {
      if (dr * dr + dc * dc > R * R + 0.5) continue;
      const r = br + dr, c = bc + dc;
      if (!inWorld(r, c)) continue;
      const code = cellAt(r, c), t = code & 15;
      if (t === T.SOIL || t === T.HARD) {
        setDug(r, c);
        G.hp.delete(r * COLS + c);
        S.stats.broken++; G.trip.broken++;
        burst(r, c, blockColor(r, code), 4, 140);
      } else if (t === T.BOMB) {
        setDug(r, c);
        q.push([r, c]);
      }
    }
    for (let i = 0; i < 26; i++) {
      G.parts.push({ x: bc * TILE + 8, y: br * TILE + 8, vx: rand(-160, 160), vy: rand(-200, 60), life: rand(0.3, 0.8), col: Math.random() < 0.5 ? '#ffb040' : '#ffe680', s: 2 });
    }
  }
  G.shake = Math.max(G.shake, 7);
  G.flash = 0.5;
  SND.play('bomb');
  floatText('ドカーン!', r0, c0, '#ff9a40', true);
}

function rollBlueprint(b, extra) {
  const cands = BP.map((bp, i) => i).filter(i => !S.bps.includes(i) && BP[i].t <= b + (extra ? 1 : 0));
  if (!cands.length) return null;
  const lowest = Math.min(...cands.map(i => BP[i].t));
  const pool = Math.random() < 0.6 ? cands.filter(i => BP[i].t === lowest) : cands;
  return pool[Math.floor(Math.random() * pool.length)];
}

function openChest(r, c) {
  S.stats.chests++; G.trip.chests++;
  const tm = G.lo.treasure;
  const roll = Math.random();
  sparkle(r, c, '#ffd23f');
  if (roll < 0.42) {
    const id = rollBlueprint(biomeOf(r), Math.random() < 0.15);
    if (id != null) {
      S.bps.push(id);
      G.trip.bps.push(id);
      floatText('設計図!', r, c, '#ffd23f', true);
      toast(`宝箱から「${BP[id].n}」を手に入れた！`, 'gold');
      SND.play('rare');
      return;
    }
  }
  if (roll < 0.74) {
    const v = Math.round(coinValue(r) * rand(8, 14) * tm * (1 + G.lo.eff.coin / 100));
    addCoins(v);
    floatText(`+${fmt(v)}`, r, c, '#ffe680', true);
    SND.play('chest');
  } else {
    const t = pickTier(r, Math.random());
    const n = Math.max(2, Math.round(rand(2, 4) * tm));
    G.bag[t] += n; G.bagN += n; S.stats.ores += n;
    if (!S.dex.ores.includes(t)) S.dex.ores.push(t);
    floatText(`${ORES[t].n}×${n}`, r, c, ORES[t].h, true);
    SND.play('chest');
  }
}

function energyBack() {
  if (G.noEn && G.energy >= G.lo.cost) {
    G.noEn = false;
    document.body.classList.remove('noen');
    setStatus('', 0);
  }
}
function noEnergy() {
  if (!G.noEn) {
    G.noEn = true;
    document.body.classList.add('noen');
    setStatus('エネルギー切れ！ 帰還しよう', 999);
  }
  if (G.errT <= 0) { SND.play('error'); G.errT = 1.2; }
}

function onEnterRow(first) {
  const r = G.r;
  if (r > G.trip.maxR) G.trip.maxR = r;
  if (r >= 1) {
    const b = biomeOf(r);
    if (b !== G.lastBiome) {
      G.lastBiome = b;
      if (!S.dex.bio.includes(b)) S.dex.bio.push(b);
      showBanner(BIOMES[b].n, floorName(r));
      BGM.play('dig', BIOMES[b].key);
    }
  } else if (first) {
    showBanner('地表', 'ここから掘り進もう');
  }
  if (r > S.deepest) {
    const prev = S.deepest;
    S.deepest = r;
    if (Math.floor(r / 10) > Math.floor(prev / 10)) {
      toast(`ワープ地点 ${floorName(Math.floor(r / 10) * 10)} を解放！`, 'good');
    }
    SLOT_FLOORS.forEach((f, i) => {
      if (i > 0 && prev < f && r >= f) { toast(`装備スロットが${i + 1}つに増えた！（次の出発から）`, 'gold'); SND.play('level'); }
    });
    if (r >= LAST && !S.cleared) gameClear();
    saveSoon();
  }
}

// ---- 演出 ----
function burst(r, c, col, n, spd) {
  if (G.parts.length > 320) return;
  for (let i = 0; i < n; i++) {
    G.parts.push({ x: c * TILE + 8 + rand(-5, 5), y: r * TILE + 8 + rand(-5, 5), vx: rand(-1, 1) * spd, vy: rand(-1.3, 0.3) * spd, life: rand(0.25, 0.6), col, s: Math.random() < 0.3 ? 2 : 1 });
  }
}
function sparkle(r, c, col) {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    G.parts.push({ x: c * TILE + 8, y: r * TILE + 8, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70 - 40, life: 0.5, col, s: 1 });
  }
}
function floatText(text, r, c, color, big) {
  if (G.floats.length > 26) { const o = G.floats.shift(); o.el.remove(); }
  const el = document.createElement('div');
  el.className = 'fl' + (big ? ' big' : '');
  el.textContent = text;
  el.style.color = color || '#fff';
  fxLayer.appendChild(el);
  G.floats.push({ el, x: c * TILE + 8 + rand(-3, 3), y: r * TILE + 4, life: 0, max: big ? 1.1 : 0.7 });
}
function updateFloats(dt) {
  const camPx = G.camY * TILE;
  for (let i = G.floats.length - 1; i >= 0; i--) {
    const f = G.floats[i];
    f.life += dt;
    f.y -= 18 * dt;
    if (f.life >= f.max) { f.el.remove(); G.floats.splice(i, 1); continue; }
    const X = Math.round(f.x * viewScale), Y = Math.round((f.y - camPx) * viewScale);
    f.el.style.transform = `translate(${X}px, ${Y}px) translate(-50%, -50%)`;
    f.el.style.opacity = f.life > f.max * 0.6 ? String(1 - (f.life - f.max * 0.6) / (f.max * 0.4)) : '1';
  }
}
function clearFloats() { G.floats.forEach(f => f.el.remove()); G.floats = []; }
function setStatus(msg, sec, info) {
  const el = $('#status');
  el.textContent = msg;
  el.classList.toggle('show', !!msg);
  el.classList.toggle('info', !!info);
  G.statusT = msg ? sec : 0;
}
function showBanner(title, sub) {
  const el = $('#banner');
  el.innerHTML = `<span class="bt"></span><span class="bs"></span>`;
  el.querySelector('.bt').textContent = title;
  el.querySelector('.bs').textContent = sub || '';
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

// ---- 描画 ----
function collectLights(r0, r1) {
  const arr = [[G.py, G.px, G.lo.light]];
  for (const t of S.torches) if (t[0] >= r0 - 6 && t[0] <= r1 + 6) arr.push([t[0], t[1], 4.5]);
  return arr;
}
function lightAt(r, c, t, lights) {
  let L = r <= 12 ? clamp(1 - (r - 1) / 12, 0, 1) : 0;
  for (let i = 0; i < lights.length; i++) {
    const l = lights[i];
    const dy = r - l[0], dx = c - l[1];
    const v = (l[2] + 0.5 - Math.sqrt(dy * dy + dx * dx)) / 1.6;
    if (v > L) L = v;
  }
  if (!t) L = Math.max(L, 0.3);
  else if (L < 0.12) L = 0.12;
  if (t === T.TORCH) L = Math.max(L, 0.75);
  else if (t === T.SEAL) L = Math.max(L, 0.5);
  return L >= 0.95 ? 1 : L < 0.2 ? L : Math.round(clamp(L, 0, 1) * 5) / 5;
}

function render() {
  const W = cv.width, H = cv.height;
  let ox = 0, oy = 0;
  if (G.shake > 0.3 && SET.shake) { ox = Math.round(rand(-G.shake, G.shake)); oy = Math.round(rand(-G.shake, G.shake)); }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const camPx = Math.round(G.camY * TILE);
  const r0 = Math.floor(G.camY) - 1, r1 = r0 + viewRows + 2;
  if (r0 <= 0) {
    ctx.fillStyle = '#2f6fd0';
    ctx.fillRect(0, 0, W, Math.max(0, -4 * TILE - camPx + oy));
    ctx.drawImage(SPR.sky, ox, -4 * TILE - camPx + oy);
  }
  const lights = collectLights(r0, r1);
  const mr = maxRow();
  for (let r = Math.max(1, r0); r <= r1; r++) {
    if (r > mr + 1) break;
    const y = r * TILE - camPx + oy;
    const b = biomeOf(r);
    for (let c = 0; c < COLS; c++) {
      const x = c * TILE + ox;
      const code = cellAt(r, c), t = code & 15;
      const hv = hash3(c, r, 77);
      if (!t) {
        ctx.drawImage(SPR.wall[b][hv < 0.85 ? 0 : 1], x, y);
      } else {
        if (t === T.SEAL) ctx.drawImage(SPR.seal, x, y);
        else if (t === T.HARD) ctx.drawImage(SPR.hard[b][hv < 0.5 ? 0 : 1], x, y);
        else ctx.drawImage(SPR.block[b][Math.floor(hv * 3) % 3], x, y);
        if (r === 1 && t !== T.SEAL) ctx.drawImage(SPR.grass, x, y);
        switch (t) {
          case T.ORE: ctx.drawImage(SPR.ore[code >> 4], x, y); break;
          case T.COIN: ctx.drawImage(SPR.coin, x, y); break;
          case T.TORCH: ctx.drawImage(SPR.torch, x, y); break;
          case T.BOMB: ctx.drawImage(SPR.bomb, x, y); break;
          case T.CHEST: ctx.drawImage(SPR.chest, x, y); break;
          case T.ENERGY: ctx.drawImage(SPR.energy, x, y); break;
          default: break;
        }
        const key = r * COLS + c;
        if (G.hp.has(key)) {
          const f = G.hp.get(key) / maxHP(r, t);
          ctx.drawImage(SPR.crack[f > 0.66 ? 0 : f > 0.33 ? 1 : 2], x, y);
        }
      }
      const L = lightAt(r, c, t, lights);
      if (L < 1) { ctx.fillStyle = `rgba(0,0,0,${(1 - L).toFixed(2)})`; ctx.fillRect(x, y, TILE, TILE); }
    }
  }
  const tf = Math.floor(G.anim * 6) % 2;
  for (const t of S.torches) {
    if (t[0] < r0 || t[0] > r1) continue;
    ctx.drawImage(SPR.wtorch[tf], t[1] * TILE + ox, t[0] * TILE - camPx + oy);
  }
  drawPlayer(camPx, ox, oy);
  for (const p of G.parts) {
    ctx.globalAlpha = clamp(p.life * 3, 0, 1);
    ctx.fillStyle = p.col;
    ctx.fillRect(Math.round(p.x) + ox, Math.round(p.y) - camPx + oy, p.s, p.s);
  }
  ctx.globalAlpha = 1;
  if (G.flash > 0) { ctx.fillStyle = `rgba(255,240,200,${(G.flash * 0.6).toFixed(2)})`; ctx.fillRect(0, 0, W, H); }
}

function drawPlayer(camPx, ox, oy) {
  const x = Math.round(G.px * TILE) + ox;
  let y = Math.round(G.py * TILE) - camPx + oy;
  const dig = G.digging;
  const jit = dig ? (Math.floor(G.anim * 30) % 2) : 0;
  if (!dig && G.px === G.c && G.py === G.r) y += Math.floor(G.anim * 2) % 2 === 0 ? 0 : 1;
  const main = G.lo.main;
  const dsp = drillSprite(main ? main.ore : -1, dig ? Math.floor(G.anim * 16) % 2 : 0);
  const f = G.face;
  const body = f === 'l' ? SPR.playerL : SPR.player;
  const drawDrill = () => {
    ctx.save();
    if (f === 'r') { ctx.translate(x + 10 + jit, y + 8); }
    else if (f === 'l') { ctx.translate(x + 6 - jit, y + 8); ctx.scale(-1, 1); }
    else if (f === 'd') { ctx.translate(x + 8, y + 10 + jit); ctx.rotate(Math.PI / 2); }
    else { ctx.translate(x + 8, y + 4 - jit); ctx.rotate(-Math.PI / 2); }
    ctx.drawImage(dsp, 0, -3);
    ctx.restore();
  };
  if (f === 'u') drawDrill();
  ctx.drawImage(body, x + (dig && (f === 'u' || f === 'd') ? jit : 0), y);
  if (f !== 'u') drawDrill();
}

const hudCache = {};
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $('#' + id).textContent = v; } }
function hud() {
  const lo = G.lo;
  setText('h-floor', floorName(G.r));
  setText('h-biome', G.r >= 1 ? BIOMES[biomeOf(G.r)].n : 'キャンプ前');
  const pct = clamp(G.energy / lo.maxE, 0, 1);
  const w = (pct * 100).toFixed(1) + '%';
  if (hudCache.ebar !== w) { hudCache.ebar = w; const e = $('#h-ebar'); e.style.width = w; e.classList.toggle('low', pct < 0.2); }
  setText('h-etext', `${Math.floor(G.energy)} / ${lo.maxE}`);
  setText('h-bag', `${G.bagN}/${lo.cap}`);
  const over = G.bagN > lo.cap;
  if (hudCache.over !== over) { hudCache.over = over; $('#h-bagbox').classList.toggle('over', over); }
  setText('h-coin', fmt(S.coins));
}

function askReturn() {
  if (!G.on || Modal.isOpen()) return;
  if (G.noEn || G.r === 0) { returnToCamp(); return; }
  SND.play('ui');
  Modal.open({
    title: '帰還',
    html: '<p>地上キャンプへ帰還しますか？<br>かばんの鉱石は倉庫へ運ばれます。</p>',
    buttons: [{ label: '帰還する', cls: 'primary', onClick: () => { returnToCamp(); } }, { label: 'つづける' }],
  });
}

function returnToCamp() {
  if (!G.on) return;
  G.on = false;
  Input.tdir = null;
  $('#dpad').dataset.dir = '';
  document.body.classList.remove('noen');
  const got = [];
  G.bag.forEach((n, t) => { if (n > 0) { S.ores[t] += n; got.push([t, n]); } });
  clearFloats();
  setStatus('', 0);
  const trip = G.trip;
  SND.play('warp');
  saveNow();
  showScreen('camp');
  let html = `<p>到達：<b class="lamp-t">${floorName(trip.maxR)}</b>　壊したブロック：${fmt(trip.broken)}</p>`;
  html += `<p>獲得コイン：<span class="ic ic-coin"></span> <b class="lamp-t">${fmt(trip.coins)}</b></p>`;
  if (got.length) {
    html += '<p>持ち帰った鉱石：</p><div class="got">' + got.map(([t, n]) => `<span><img class="px" src="${oreIconURL(t)}" alt="">${ORES[t].n} ×${n}</span>`).join('') + '</div>';
  } else html += '<p class="note">今回は鉱石なし。次は鉱石ブロックを狙おう！</p>';
  if (trip.bps.length) html += `<p>手に入れた設計図：<b class="lamp-t">${trip.bps.map(i => BP[i].n).join('、')}</b></p>`;
  Modal.open({ title: 'おかえりなさい！', html, buttons: [{ label: 'OK', cls: 'primary' }] });
}

function gameClear() {
  S.cleared = true;
  S.stats.clearTime = S.stats.time;
  saveNow();
  SND.play('clear');
  G.flash = 1;
  const t = S.stats.time;
  const tt = `${Math.floor(t / 3600)}時間${Math.floor((t % 3600) / 60)}分`;
  Modal.open({
    title: '★ 地底999階 到達 ★',
    cls: 'clear legend',
    html: `<p>おめでとう！ついに地底999階の封印石までたどり着いた！</p>
      <p>プレイ時間：<b class="lamp-t">${tt}</b><br>壊したブロック：<b class="lamp-t">${fmt(S.stats.broken)}</b><br>作ったドリル：<b class="lamp-t">${fmt(S.stats.crafted)}</b></p>
      <p>封印の先に<b class="lamp-t">「虚空回廊」</b>が開いた。ここからは果てのない深さ。新しい鉱石「虚晶」「原初鉱」と、新しい設計図が眠っている。どこまで掘れるか挑戦しよう！</p>`,
    buttons: [{ label: '掘りつづける', cls: 'primary' }],
  });
}

function pauseMenu() {
  if (!G.on || Modal.isOpen()) return;
  SND.play('ui');
  const lo = G.lo;
  const effs = EFF_KEYS.filter(k => lo.eff[k] > 0).map(k => `${EFFECTS[k].n} ${lo.eff[k]}${EFFECTS[k].int ? '' : '%'}`);
  Modal.open({
    title: 'ポーズ',
    html: `<p>${floorName(G.r)}（最深 ${floorName(S.deepest)}）</p>
      <p class="note">採掘力 ${fmt(lo.power)}　速度 ${lo.speed.toFixed(1)}/秒　消費 ${lo.cost}</p>
      ${effs.length ? `<p class="note">効果：${effs.join('　')}</p>` : ''}
      <p class="note">PC：Rキーで帰還／Escでポーズ<br>コントローラー：Yで帰還／STARTでポーズ</p>`,
    buttons: [
      { label: '再開', cls: 'primary' },
      { label: '地上へ帰還', onClick: () => { setTimeout(askReturn, 0); } },
      { label: 'せってい', onClick: () => { setTimeout(openSettings, 0); } },
    ],
  });
}

// ============================================================
//  9. UI共通（モーダル・トースト・画面切替・フォーカス移動）
// ============================================================
const Modal = {
  stack: [],
  isOpen() { return this.stack.length > 0; },
  top() { return this.stack[this.stack.length - 1]; },
  open(o) {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal ${o.cls || ''}" role="dialog"><h2></h2><div class="m-body">${o.html || ''}</div><div class="m-btns"></div></div>`;
    bg.querySelector('h2').textContent = o.title || '';
    const m = { el: bg, o };
    const box = bg.querySelector('.m-btns');
    (o.buttons || [{ label: '閉じる' }]).forEach(b => {
      const btn = document.createElement('button');
      btn.className = 'btn ' + (b.cls || '');
      btn.textContent = b.label;
      btn.dataset.k = 'mb-' + b.label;
      if (b.disabled) btn.disabled = true;
      btn.addEventListener('click', () => {
        SND.play('ui');
        if (b.onClick && b.onClick() === false) return;
        if (b.close !== false) Modal.close(m);
      });
      box.appendChild(btn);
    });
    if (!o.buttons || !o.buttons.length) box.remove();
    $('#modal-root').appendChild(bg);
    this.stack.push(m);
    Input.tdir = null;
    if (padMode) setTimeout(() => focusFirst(), 0);
    return m;
  },
  close(m, cancel) {
    m = m || this.top();
    const i = this.stack.indexOf(m);
    if (i < 0) return;
    this.stack.splice(i, 1);
    m.el.remove();
    if (cancel && m.o.onCancel) m.o.onCancel();
    if (m.o.onClose) m.o.onClose();
    if (padMode) setTimeout(() => { const a = document.activeElement; if (!a || a === document.body || !navTargets().includes(a)) focusFirst(); }, 0);
  },
  closeAll() { while (this.stack.length) this.close(this.top()); },
};

function toast(msg, cls) {
  const box = $('#toasts');
  while (box.children.length >= 4) box.firstChild.remove();
  const el = document.createElement('div');
  el.className = 'toast ' + (cls || '');
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3000);
}

let curScreen = 'title';
function showScreen(name) {
  curScreen = name;
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'scr-' + name));
  if (name === 'camp') { renderCamp(); BGM.play('camp', 0); }
  if (name === 'title') { refreshTitle(); BGM.play('camp', -5); }
  if (padMode && name !== 'dive') setTimeout(focusFirst, 0);
}

function navRoot() {
  if (Modal.isOpen()) return Modal.top().el;
  return $('#scr-' + curScreen);
}
function navTargets() {
  const root = navRoot();
  if (!root) return [];
  return $$('button:not(:disabled), input[type=range], a[href]', root).filter(el => {
    if (el.offsetParent === null) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}
function focusFirst() {
  if (inDiveControl()) return;
  const els = navTargets();
  const pref = els.find(e => e.classList.contains('primary')) || els[0];
  if (pref) { pref.focus({ preventScroll: true }); pref.scrollIntoView({ block: 'nearest' }); }
}
function navMove(dir) {
  if (!dir) return;
  const els = navTargets();
  if (!els.length) return;
  const cur = document.activeElement;
  if (!cur || !els.includes(cur)) { focusFirst(); return; }
  if (cur.type === 'range' && (dir === 'l' || dir === 'r')) {
    const step = +cur.step || 1;
    cur.value = String(clamp(+cur.value + (dir === 'r' ? step : -step), +cur.min, +cur.max));
    cur.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  const a = cur.getBoundingClientRect();
  const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bs = Infinity;
  for (const el of els) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect();
    const bx = b.left + b.width / 2, by = b.top + b.height / 2;
    const dx = bx - ax, dy = by - ay;
    let main, side;
    if (dir === 'r') { main = dx; side = dy; } else if (dir === 'l') { main = -dx; side = dy; }
    else if (dir === 'd') { main = dy; side = dx; } else { main = -dy; side = dx; }
    if (main < 4) continue;
    const score = main + Math.abs(side) * 2.2;
    if (score < bs) { bs = score; best = el; }
  }
  if (best) {
    best.focus({ preventScroll: true });
    best.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    SND.play('ui');
  }
}
function navActivate() {
  const a = document.activeElement;
  if (a && a !== document.body && navTargets().includes(a)) {
    if (a.type === 'range') return;
    a.click();
  } else focusFirst();
}
function goBack(isStart) {
  if (Modal.isOpen()) {
    const m = Modal.top();
    if (m.o.noCancel) return;
    SND.play('ui');
    Modal.close(m, true);
    return;
  }
  if (isStart && G.on) pauseMenu();
}
function ctxAction(k) {
  if (Modal.isOpen() || curScreen !== 'camp' || tab !== 'forge') return;
  if (k === 'x') ACT.rot(); else ACT.flip();
}
const TAB_LIST = ['depart', 'forge', 'equip', 'store', 'shop', 'dex', 'rec'];
function switchTab(d) {
  if (Modal.isOpen() || curScreen !== 'camp') return;
  const i = (TAB_LIST.indexOf(tab) + d + TAB_LIST.length) % TAB_LIST.length;
  tab = TAB_LIST[i];
  SND.play('ui');
  renderCamp(true);
  if (padMode) setTimeout(focusFirst, 0);
}

// ============================================================
// 10. 地上キャンプ
// ============================================================
let tab = 'depart';
let departFloor = -1;
let selSlot = 0;
const F = { bp: 0, boardBp: -1, grid: [], pieces: [], sel: null, rot: 0, flip: false, hover: null };

function renderCamp(resetScroll) {
  if (!S) return;
  const body = $('#tab-body');
  const ae = document.activeElement;
  const k = ae && ae.dataset ? ae.dataset.k : null;
  const st = body.scrollTop;
  $('#c-coins').textContent = fmt(S.coins);
  $('#c-deep').textContent = floorName(S.deepest);
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  const fn = { depart: tabDepart, forge: tabForge, equip: tabEquip, store: tabStore, shop: tabShop, dex: tabDex, rec: tabRec }[tab];
  body.innerHTML = fn();
  body.scrollTop = resetScroll ? 0 : st;
  if (k && !resetScroll) {
    const el = $(`[data-k="${k}"]`);
    if (el && !el.disabled) el.focus({ preventScroll: true });
    else if (padMode) focusFirst();
  }
  if (tab === 'forge') applyHover();
}
function rerender() { if (curScreen === 'camp') renderCamp(false); }

// ---- 出発 ----
function tabDepart() {
  const maxWarp = Math.floor(S.deepest / 10) * 10;
  if (departFloor < 0 || departFloor > maxWarp) departFloor = maxWarp;
  const lo = loadout();
  const fr = Math.max(1, departFloor + 1);
  const hp = maxHP(fr, T.SOIL);
  const hits = Math.ceil(hp / Math.max(1, lo.power));
  const effs = EFF_KEYS.filter(k => lo.eff[k] > 0).map(k => `${EFFECTS[k].n} ${lo.eff[k]}${EFFECTS[k].int ? '' : '%'}`);
  const warn = !lo.main ? '<p class="bad-t">メインスロットにドリルがありません（素手で掘ることになります）</p>' : '';
  return `
  <div class="panel">
    <h3>出発する階を選ぶ</h3>
    <div class="floor-pick">
      <button class="btn" data-act="fl" data-d="-100" data-k="fl-100" ${departFloor <= 0 ? 'disabled' : ''}>«</button>
      <button class="btn" data-act="fl" data-d="-10" data-k="fl-10" ${departFloor <= 0 ? 'disabled' : ''}>‹</button>
      <div class="fl-val">${floorName(departFloor)}</div>
      <button class="btn" data-act="fl" data-d="10" data-k="fl+10" ${departFloor >= maxWarp ? 'disabled' : ''}>›</button>
      <button class="btn" data-act="fl" data-d="100" data-k="fl+100" ${departFloor >= maxWarp ? 'disabled' : ''}>»</button>
    </div>
    <p class="small" style="text-align:center">10階ごとにワープ地点が解放されます（最深 ${floorName(S.deepest)}）</p>
    <div class="stat-grid">
      <div>採掘力<b>${fmt(lo.power)}</b></div>
      <div>採掘速度<b>${lo.speed.toFixed(1)}/秒</b></div>
      <div>消費エネルギー<b>${lo.cost}/回</b></div>
      <div>最大エネルギー<b>${lo.maxE}</b></div>
      <div>かばん<b>${lo.cap}</b></div>
      <div>視界<b>${lo.light.toFixed(1)}</b></div>
      <div class="full">${floorName(fr)}の土の耐久<b>${fmt(hp)}（約${fmt(hits)}回）</b></div>
      ${effs.length ? `<div class="full" style="display:block">効果：<span class="good-t">${effs.join('　')}</span></div>` : ''}
    </div>
    ${warn}
    <button class="btn big primary wide" data-act="go" data-k="go">出発する</button>
  </div>
  <div class="panel tips">
    <h3>あそびかた</h3>
    <ul>
      <li>向いている方向のブロックを掘る。掘った場所は自由に移動できる。</li>
      <li>エネルギーが切れても大丈夫。帰還すれば全回復。</li>
      <li>持ち帰った鉱石を「鍛冶」で設計図にはめて、新しいドリルを作ろう。</li>
      <li>設計図のマスを多く埋めるほど、強いドリルや特殊効果が出やすい。</li>
      <li>爆弾ブロックは周りの土と岩をまとめて壊す。アイテムは壊れない。</li>
      <li>たいまつを壊すとその場所がずっと明るくなる。</li>
    </ul>
  </div>`;
}

// ---- 鍛冶 ----
function orient(shape, rot, flip) {
  let pts = shape.map(([x, y]) => [flip ? -x : x, y]);
  for (let i = 0; i < rot; i++) pts = pts.map(([x, y]) => [-y, x]);
  const mx = Math.min(...pts.map(p => p[0])), my = Math.min(...pts.map(p => p[1]));
  return pts.map(([x, y]) => [x - mx, y - my]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}
function resetBoard() {
  const b = BP[F.bp];
  F.boardBp = F.bp;
  F.grid = Array(b.w * b.h).fill(-1);
  F.pieces = [];
  F.hover = null;
}
function rebuildGrid() {
  const b = BP[F.bp];
  F.grid = Array(b.w * b.h).fill(-1);
  F.pieces.forEach((p, i) => p.cells.forEach(([x, y]) => { F.grid[y * b.w + x] = i; }));
}
function usedOres() {
  const u = Array(ORES.length).fill(0);
  F.pieces.forEach(p => { u[p.t]++; });
  return u;
}
const availOre = t => S.ores[t] - usedOres()[t];
function fixBoard() {
  let changed = false;
  for (let t = 0; t < ORES.length; t++) {
    while (usedOres()[t] > S.ores[t]) {
      const i = F.pieces.map(p => p.t).lastIndexOf(t);
      if (i < 0) break;
      F.pieces.splice(i, 1);
      changed = true;
    }
  }
  if (changed) rebuildGrid();
}
function pieceCells(t, gx, gy) {
  const pts = orient(ORES[t].s, F.rot, F.flip);
  const [ax, ay] = pts[0];
  return pts.map(([x, y]) => [gx + x - ax, gy + y - ay]);
}
function canPlace(cells) {
  const b = BP[F.bp];
  return cells.every(([x, y]) => x >= 0 && y >= 0 && x < b.w && y < b.h && bpHas(b, x, y) && F.grid[y * b.w + x] < 0);
}
function forgeCalc() {
  const b = BP[F.bp];
  let raw = 0, cells = 0, tsum = 0;
  const aff = {};
  F.pieces.forEach(p => {
    const n = p.cells.length;
    raw += n * oreVal(p.t); cells += n; tsum += p.t * n;
    ORES[p.t].a.forEach(k => { aff[k] = (aff[k] || 0) + n; });
  });
  const f = cells / b.cells;
  const basePow = (b.base + raw) * b.m * (1 + 0.6 * f);
  const p1 = cells ? 0.12 + 0.55 * f : 0;
  const p2 = 0.04 + 0.36 * f * f;
  const p3 = 0.01 + 0.2 * f * f * f;
  return { f, cells, basePow, p1, p2, p3, aff, avgT: cells ? tsum / cells : 0 };
}
function tabForge() {
  if (!S.bps.includes(F.bp)) F.bp = S.bps[0];
  if (F.boardBp !== F.bp) resetBoard();
  fixBoard();
  const b = BP[F.bp];
  const used = usedOres();
  let cells = '';
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    if (!bpHas(b, x, y)) { cells += '<div class="fcell void"></div>'; continue; }
    const pi = F.grid[y * b.w + x];
    if (pi >= 0) {
      const o = ORES[F.pieces[pi].t];
      cells += `<button class="fcell on" data-act="cell" data-x="${x}" data-y="${y}" data-k="fc-${x}-${y}" style="--oc:${o.c};--oh:${o.h};--od:${o.d}" aria-label="${o.n}"></button>`;
    } else cells += `<button class="fcell" data-act="cell" data-x="${x}" data-y="${y}" data-k="fc-${x}-${y}" aria-label="空きマス"></button>`;
  }
  const known = ORES.map((_, t) => t).filter(t => S.dex.ores.includes(t) || S.ores[t] > 0);
  const pal = known.length ? known.map(t => {
    const av = S.ores[t] - used[t];
    const sel = F.sel === t;
    return `<button class="orebtn ${sel ? 'sel' : ''}" data-act="ore" data-t="${t}" data-k="ore-${t}" ${av <= 0 && !sel ? 'disabled' : ''}>
      <img class="px" src="${oreIconURL(t)}" alt="">
      <span class="on">${ORES[t].n} ×${av}<small>${ORES[t].a.map(k => EFFECTS[k].n).join('・')}</small></span>
      ${shapeHTML(t, sel)}
    </button>`;
  }).join('') : '<p class="note">まだ鉱石がありません。採掘して持ち帰ろう！</p>';
  const fc = forgeCalc();
  const affList = Object.entries(fc.aff).sort((a, z) => z[1] - a[1]).slice(0, 4)
    .map(([k, n]) => `<span>${EFFECTS[k].n} ${Math.round((n / fc.cells) * 100)}%</span>`).join('');
  const full = S.drills.length >= MAX_DRILLS;
  const canCraft = fc.cells > 0 && S.coins >= b.cost && !full;
  return `
  <div class="panel">
    <div class="row"><h3>鍛冶</h3><button class="btn sm" data-act="bpsel" data-k="bpsel">設計図を変える（${S.bps.length}）</button></div>
    <div class="bp-title">${b.n}<small>${b.cells}マス・倍率×${b.m.toFixed(2)}・速度${b.sp.toFixed(1)}</small></div>
    <div class="board-wrap" id="board-wrap"><div class="board" id="board" style="--cols:${b.w}">${cells}</div></div>
    <div class="fbtns">
      <button class="btn" data-act="rot" data-k="rot">回転</button>
      <button class="btn" data-act="flip" data-k="flip">反転${F.flip ? '中' : ''}</button>
      <button class="btn" data-act="auto" data-k="auto">自動配置</button>
      <button class="btn" data-act="fclear" data-k="fclear">全部外す</button>
    </div>
    <p class="small" style="margin-bottom:6px">鉱石を選んでマスをタップで配置。置いた鉱石をタップで外す。（PC：R回転／F反転、コントローラー：X回転／Y反転）</p>
    <div class="ore-pal">${pal}</div>
    <div class="preview">
      充填率 <b>${Math.round(fc.f * 100)}%</b>（${fc.cells}/${b.cells}マス）
      <div class="fill-bar"><i style="width:${(fc.f * 100).toFixed(0)}%"></i></div>
      採掘力 <b>${fc.cells ? `${fmt(fc.basePow * 0.85)} 〜 ${fmt(fc.basePow * 1.15)}` : '-'}</b><br>
      特殊効果　1つ以上 <b>${Math.round(fc.p1 * 100)}%</b>　2つ以上 <b>${Math.round(fc.p1 * fc.p2 * 100)}%</b>　3つ <b>${Math.round(fc.p1 * fc.p2 * fc.p3 * 100)}%</b>
      ${affList ? `<div class="aff">付きやすい効果：${affList}</div>` : ''}
    </div>
    ${full ? `<p class="bad-t">ドリルがいっぱい（${MAX_DRILLS}本）です。装備タブで解体してください。</p>` : ''}
    <button class="btn big primary wide" data-act="craft" data-k="craft" ${canCraft ? '' : 'disabled'}>作成する（<span class="ic ic-coin"></span> ${fmt(b.cost)}）</button>
  </div>`;
}
function shapeHTML(t, oriented) {
  const pts = oriented ? orient(ORES[t].s, F.rot, F.flip) : ORES[t].s;
  const w = Math.max(...pts.map(p => p[0])) + 1, h = Math.max(...pts.map(p => p[1])) + 1;
  const set = new Set(pts.map(([x, y]) => x + ',' + y));
  let s = `<span class="mshape" style="grid-template-columns:repeat(${w},6px)">`;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) s += `<i style="background:${set.has(x + ',' + y) ? ORES[t].c : 'transparent'}"></i>`;
  return s + '</span>';
}
function maskHTML(b) {
  let s = `<span class="mmask" style="grid-template-columns:repeat(${b.w},7px)">`;
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) s += `<i class="${bpHas(b, x, y) ? 'c' : ''}"></i>`;
  return s + '</span>';
}
function applyHover() {
  const board = $('#board');
  if (!board) return;
  $$('.fcell', board).forEach(el => el.classList.remove('pv-ok', 'pv-bad', 'pv-del'));
  if (!F.hover) return;
  const b = BP[F.bp];
  const [hx, hy] = F.hover;
  const cellEl = (x, y) => board.querySelector(`[data-x="${x}"][data-y="${y}"]`);
  const pi = F.grid[hy * b.w + hx];
  if (pi >= 0) {
    F.pieces[pi].cells.forEach(([x, y]) => { const el = cellEl(x, y); if (el) el.classList.add('pv-del'); });
    return;
  }
  if (F.sel == null) return;
  const cells = pieceCells(F.sel, hx, hy);
  const ok = canPlace(cells) && availOre(F.sel) > 0;
  cells.forEach(([x, y]) => { const el = cellEl(x, y); if (el) el.classList.add(ok ? 'pv-ok' : 'pv-bad'); });
}
function autoFill() {
  F.pieces = []; rebuildGrid();
  const b = BP[F.bp];
  const counts = S.ores.slice();
  for (let t = ORES.length - 1; t >= 0; t--) {
    if (counts[t] <= 0) continue;
    const oris = [];
    const seen = new Set();
    for (let fl = 0; fl < 2; fl++) for (let r = 0; r < 4; r++) {
      const pts = orient(ORES[t].s, r, !!fl);
      const key = pts.map(p => p.join(',')).join('|');
      if (!seen.has(key)) { seen.add(key); oris.push(pts); }
    }
    let placed = true;
    while (placed && counts[t] > 0) {
      placed = false;
      outer:
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
        for (const pts of oris) {
          const cells = pts.map(([px2, py2]) => [x + px2, y + py2]);
          if (canPlace(cells)) {
            F.pieces.push({ t, cells });
            cells.forEach(([cx, cy]) => { F.grid[cy * b.w + cx] = F.pieces.length - 1; });
            counts[t]--;
            placed = true;
            break outer;
          }
        }
      }
    }
  }
}
function makeDrill() {
  const b = BP[F.bp];
  const fc = forgeCalc();
  const power = Math.max(1, Math.round(fc.basePow * rand(0.85, 1.15)));
  const speed = Math.round(b.sp * rand(0.9, 1.12) * 10) / 10;
  const cost = Math.max(1, Math.round((1 + b.t * 0.6) * rand(0.85, 1.2)));
  let n = 0;
  if (Math.random() < fc.p1) { n = 1; if (Math.random() < fc.p2) { n = 2; if (Math.random() < fc.p3) n = 3; } }
  const eff = [];
  const pool = EFF_KEYS.slice();
  for (let i = 0; i < n; i++) {
    const ws = pool.map(k => 1 + 4 * ((fc.aff[k] || 0) / fc.cells));
    let r = Math.random() * ws.reduce((a, z) => a + z, 0);
    let idx = 0;
    for (; idx < ws.length - 1; idx++) { r -= ws[idx]; if (r <= 0) break; }
    const k = pool.splice(idx, 1)[0];
    const E = EFFECTS[k];
    const q = Math.random() * (0.55 + 0.45 * fc.f);
    let v = E.min + (E.max - E.min) * q;
    if (k !== 'bomb') v *= 1 + fc.avgT * 0.07;
    v = E.int ? Math.max(E.min, Math.round(v)) : Math.max(1, Math.round(v));
    if (k === 'bomb') v = 1;
    eff.push({ k, v });
  }
  const cnt = {};
  F.pieces.forEach(p => { cnt[p.t] = (cnt[p.t] || 0) + p.cells.length; });
  let ore = -1, best = -1;
  Object.keys(cnt).forEach(t => { t = +t; if (cnt[t] > best || (cnt[t] === best && t > ore)) { best = cnt[t]; ore = t; } });
  return { id: S.nid++, bp: F.bp, name: `${b.s}ドリル`, power, speed, cost, eff, rar: n, ore, lock: false };
}
function drillCard(d) {
  const eq = S.equip.indexOf(d.id);
  return `<div class="dcard r${d.rar}">
    <img class="px dico" src="${drillIconURL(d.ore)}" alt="">
    <div class="dc-main">
      <div class="dc-name"><span class="rar r${d.rar}">${RAR[d.rar]}</span>${d.name}${d.lock ? '<span class="lockb">ロック</span>' : ''}</div>
      <div class="dc-st">採掘力 ${fmt(d.power)}／速度 ${d.speed.toFixed(1)}／消費 ${d.cost}</div>
      ${d.eff.length ? `<div class="dc-eff">${d.eff.map(e => `<span>${EFFECTS[e.k].n} ${e.v}${EFFECTS[e.k].int ? '' : '%'}</span>`).join('')}</div>` : ''}
    </div>
  </div>${eq >= 0 ? `<span class="eqb">${eq === 0 ? 'メイン' : 'サブ' + eq}</span>` : ''}`;
}
function openBpSelect() {
  const list = S.bps.slice().sort((a, z) => BP[a].t - BP[z].t || a - z).map(i => {
    const b = BP[i];
    return `<button class="bpbtn ${i === F.bp ? 'cur' : ''}" data-act="pickbp" data-id="${i}" data-k="pbp-${i}">
      ${maskHTML(b)}
      <span class="bpi"><b>${b.n}</b><br>${b.cells}マス／倍率×${b.m.toFixed(2)}／速度${b.sp.toFixed(1)}<br>作成 <span class="ic ic-coin"></span>${fmt(b.cost)}</span>
    </button>`;
  }).join('');
  Modal.open({ title: '設計図を選ぶ', html: `<div class="bp-list">${list}</div><p class="small" style="margin-top:8px">新しい設計図は宝箱や「強化」タブで手に入ります。</p>`, buttons: [{ label: '閉じる' }] });
}

// ---- 装備 ----
function tabEquip() {
  const n = slotCount();
  if (selSlot >= n) selSlot = 0;
  let slots = '';
  for (let i = 0; i < SLOT_FLOORS.length; i++) {
    if (i >= n) { slots += `<div class="slot locked">スロット${i + 1}：${floorName(SLOT_FLOORS[i])}到達で解放</div>`; continue; }
    const d = drillById(S.equip[i]);
    slots += `<button class="slot ${i === selSlot ? 'sel' : ''}" data-act="slot" data-i="${i}" data-k="slot-${i}">
      <span class="sl ${i === 0 ? 'main' : ''}">${i === 0 ? 'メイン<br>全性能' : `サブ${i}<br>効果のみ`}</span>
      ${d ? `<img class="px" src="${drillIconURL(d.ore)}" alt=""><span class="sn"><span class="rar r${d.rar}">${RAR[d.rar]}</span>${d.name}<br><span class="small">力 ${fmt(d.power)}${d.eff.length ? '／' + d.eff.map(e => EFFECTS[e.k].n).join('・') : ''}</span></span>` : '<span class="sn small">空き（下のリストから選んで装備）</span>'}
    </button>`;
  }
  const lo = loadout();
  const effs = EFF_KEYS.filter(k => lo.eff[k] > 0).map(k => `${EFFECTS[k].n} ${lo.eff[k]}${EFFECTS[k].int ? '' : '%'}`);
  const sorted = S.drills.slice().sort((a, z) => z.power - a.power || z.rar - a.rar);
  const list = sorted.map(d => `<button class="dbtn" data-act="drill" data-id="${d.id}" data-k="dr-${d.id}">${drillCard(d)}</button>`).join('');
  return `
  <div class="panel">
    <h3>装備スロット</h3>
    <p class="small" style="margin-bottom:6px">メインは全性能、サブは特殊効果だけが反映されます。スロットを選んでからドリルを選択。</p>
    <div class="slots">${slots}</div>
    <div class="sum">合計　採掘力 <b>${fmt(lo.power)}</b>　速度 <b>${lo.speed.toFixed(1)}</b>　消費 <b>${lo.cost}</b><br>${effs.length ? `効果：<span class="good-t">${effs.join('　')}</span>` : '<span class="small">特殊効果なし</span>'}</div>
  </div>
  <div class="panel">
    <div class="row"><h3>所持ドリル（${S.drills.length}/${MAX_DRILLS}）</h3><button class="btn sm" data-act="bulk" data-k="bulk">コモン一括解体</button></div>
    <div class="dlist" style="margin-top:8px">${list || '<p class="note">ドリルがありません。</p>'}</div>
  </div>`;
}
const scrapValue = d => Math.max(1, Math.round(BP[d.bp].cost * 0.3 + d.eff.length * BP[d.bp].cost * 0.2));
function equipTo(id, slot) {
  const cur = S.equip.indexOf(id);
  if (cur === slot) return;
  if (cur >= 0) S.equip[cur] = S.equip[slot];
  S.equip[slot] = id;
}
function openDrill(id) {
  const d = drillById(id);
  if (!d) return;
  const eq = S.equip.indexOf(id);
  const btns = [];
  btns.push({ label: `スロット${selSlot + 1}に装備`, cls: 'primary', disabled: eq === selSlot, onClick: () => { equipTo(id, selSlot); SND.play('place'); saveSoon(); rerender(); } });
  if (eq >= 0) btns.push({ label: '外す', onClick: () => { S.equip[eq] = null; SND.play('remove'); saveSoon(); rerender(); } });
  btns.push({ label: d.lock ? 'ロック解除' : 'ロック', onClick: () => { d.lock = !d.lock; saveSoon(); rerender(); } });
  btns.push({ label: `解体（+${fmt(scrapValue(d))}）`, cls: 'danger', disabled: d.lock || eq >= 0, onClick: () => {
    S.drills = S.drills.filter(x => x.id !== id);
    S.equip = S.equip.map(x => (x === id ? null : x));
    addCoins(scrapValue(d));
    SND.play('coin'); saveSoon(); rerender();
  } });
  btns.push({ label: '閉じる' });
  const html = `${drillCard(d)}
    <ul class="efflist">${d.eff.length ? d.eff.map(e => `<li>${EFFECTS[e.k].n}：${effText(e)}</li>`).join('') : '<li>特殊効果なし</li>'}</ul>
    <p class="small" style="margin-top:6px">元の設計図：${BP[d.bp].n}${d.lock ? '／ロック中は解体できません' : ''}${eq >= 0 ? '／装備中は解体できません' : ''}</p>`;
  Modal.open({ title: 'ドリル', html, buttons: btns });
}

// ---- 倉庫 ----
function tabStore() {
  const rows = ORES.map((o, t) => {
    const known = S.dex.ores.includes(t) || S.ores[t] > 0;
    if (!known) return `<div class="li"><span class="lt"><b>？？？</b><br><span class="small">まだ見つけていない鉱石</span></span></div>`;
    const n = S.ores[t];
    return `<div class="li">
      <img class="px" src="${oreIconURL(t)}" alt="">
      <span class="lt"><b>${o.n}</b> ×${fmt(n)}<br><span class="small">売値 ${fmt(orePrice(t))}／付きやすい効果：${o.a.map(k => EFFECTS[k].n).join('・')}</span></span>
      <span class="lb">
        <button class="btn sm" data-act="sell" data-t="${t}" data-n="1" data-k="s1-${t}" ${n < 1 ? 'disabled' : ''}>1</button>
        <button class="btn sm" data-act="sell" data-t="${t}" data-n="10" data-k="s10-${t}" ${n < 10 ? 'disabled' : ''}>10</button>
        <button class="btn sm" data-act="sell" data-t="${t}" data-n="all" data-k="sa-${t}" ${n < 1 ? 'disabled' : ''}>全部</button>
      </span>
    </div>`;
  }).join('');
  return `<div class="panel"><h3>倉庫</h3><p class="small" style="margin-bottom:8px">鉱石を売ってコインに換えられます。ドリル作りに使う分は残しておこう。</p><div class="list">${rows}</div></div>`;
}

// ---- 強化 ----
function tabShop() {
  const ups = UPG.map(u => {
    const lv = S.upg[u.k] || 0;
    const max = lv >= u.max;
    const cost = u.cost(lv);
    return `<div class="li">
      <span class="lt"><b>${u.n}</b> <span class="lv">Lv${lv}/${u.max}</span><br><span class="small">${u.d}</span></span>
      <button class="btn sm ${max ? '' : 'primary'}" data-act="upg" data-u="${u.k}" data-k="up-${u.k}" ${max || S.coins < cost ? 'disabled' : ''}>${max ? 'MAX' : `<span class="ic ic-coin"></span> ${fmt(cost)}`}</button>
    </div>`;
  }).join('');
  const reach = biomeOf(Math.max(1, S.deepest));
  const bps = BP.map((b, i) => i).filter(i => !S.bps.includes(i) && BP[i].t <= reach);
  const bpRows = bps.length ? bps.map(i => {
    const b = BP[i];
    return `<div class="li">${maskHTML(b)}
      <span class="lt"><b>${b.n}</b><br><span class="small">${b.cells}マス／倍率×${b.m.toFixed(2)}／速度${b.sp.toFixed(1)}</span></span>
      <button class="btn sm primary" data-act="buybp" data-id="${i}" data-k="bb-${i}" ${S.coins < b.price ? 'disabled' : ''}><span class="ic ic-coin"></span> ${fmt(b.price)}</button>
    </div>`;
  }).join('') : '<p class="note">いま買える設計図はありません。もっと深い層に到達すると品ぞろえが増えます。</p>';
  return `<div class="panel"><h3>強化</h3><div class="list">${ups}</div></div>
  <div class="panel"><h3>設計図屋</h3><p class="small" style="margin-bottom:8px">到達した層までの設計図が買えます（宝箱からも出ます）。</p><div class="list">${bpRows}</div></div>`;
}

// ---- 図鑑・記録 ----
function tabDex() {
  const oreN = S.dex.ores.length, effN = S.dex.eff.length, bpN = S.bps.length, bioN = S.dex.bio.length;
  const total = ORES.length + EFF_KEYS.length + BP.length + BIOMES.length;
  const pct = Math.floor(((oreN + effN + bpN + bioN) / total) * 100);
  const ores = ORES.map((o, t) => S.dex.ores.includes(t)
    ? `<div><img class="px" src="${oreIconURL(t)}" alt="">${o.n}</div>` : '<div class="no">？？？</div>').join('');
  const effs = EFF_KEYS.map(k => S.dex.eff.includes(k)
    ? `<div>${EFFECTS[k].n}</div>` : '<div class="no">？？？</div>').join('');
  const bps = BP.map((b, i) => S.bps.includes(i) ? `<div>${b.s}</div>` : '<div class="no">？？？</div>').join('');
  const bios = BIOMES.map((b, i) => S.dex.bio.includes(i) ? `<div>${b.n}</div>` : '<div class="no">？？？</div>').join('');
  return `<div class="panel"><div class="row"><h3>図鑑</h3><span class="pct">収集率 ${pct}%</span></div></div>
    <div class="panel"><h3>鉱石（${oreN}/${ORES.length}）</h3><div class="dex-grid">${ores}</div></div>
    <div class="panel"><h3>特殊効果（${effN}/${EFF_KEYS.length}）</h3><div class="dex-grid">${effs}</div></div>
    <div class="panel"><h3>設計図（${bpN}/${BP.length}）</h3><div class="dex-grid">${bps}</div></div>
    <div class="panel"><h3>地層（${bioN}/${BIOMES.length}）</h3><div class="dex-grid">${bios}</div></div>`;
}
function tabRec() {
  const s = S.stats, t = s.time;
  const tt = `${Math.floor(t / 3600)}時間${Math.floor((t % 3600) / 60)}分`;
  const ct = s.clearTime ? `${Math.floor(s.clearTime / 3600)}時間${Math.floor((s.clearTime % 3600) / 60)}分` : '-';
  const rows = [
    ['最深到達', floorName(S.deepest)], ['999階クリア', S.cleared ? `達成（${ct}）` : 'まだ'],
    ['プレイ時間', tt], ['出発回数', fmt(s.trips)], ['壊したブロック', fmt(s.broken)],
    ['掘った鉱石', fmt(s.ores)], ['稼いだコイン', fmt(s.coins)], ['作ったドリル', fmt(s.crafted)],
    ['開けた宝箱', fmt(s.chests)], ['爆発させた爆弾', fmt(s.bombs)], ['たいまつ', fmt(S.torches.length)],
  ];
  return `<div class="panel"><h3>記録</h3><div class="reclist">${rows.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('')}</div></div>`;
}

// ---- アクション ----
const ACT = {
  fl(el) { const maxWarp = Math.floor(S.deepest / 10) * 10; departFloor = clamp(departFloor + (+el.dataset.d), 0, maxWarp); SND.play('ui'); rerender(); },
  go() { startDive(departFloor); },
  bpsel() { SND.play('ui'); openBpSelect(); },
  pickbp(el) {
    const id = +el.dataset.id;
    if (id !== F.bp) { F.bp = id; resetBoard(); }
    Modal.close(Modal.top());
    SND.play('ui');
    rerender();
  },
  cell(el) {
    const x = +el.dataset.x, y = +el.dataset.y;
    const b = BP[F.bp];
    const pi = F.grid[y * b.w + x];
    if (pi >= 0) {
      F.pieces.splice(pi, 1);
      rebuildGrid();
      SND.play('remove');
      F.hover = [x, y];
      rerender();
      return;
    }
    if (F.sel == null) { toast('先に下の鉱石を選んでください'); SND.play('error'); return; }
    if (availOre(F.sel) <= 0) { toast(`${ORES[F.sel].n}が足りません`); SND.play('error'); return; }
    const cells = pieceCells(F.sel, x, y);
    if (!canPlace(cells)) { SND.play('error'); flashBad(cells); return; }
    F.pieces.push({ t: F.sel, cells });
    rebuildGrid();
    SND.play('place');
    if (availOre(F.sel) <= 0) F.sel = null;
    F.hover = [x, y];
    rerender();
  },
  ore(el) { const t = +el.dataset.t; F.sel = F.sel === t ? null : t; SND.play('ui'); rerender(); },
  rot() { F.rot = (F.rot + 1) % 4; SND.play('ui'); rerender(); },
  flip() { F.flip = !F.flip; SND.play('ui'); rerender(); },
  auto() {
    autoFill();
    SND.play(F.pieces.length ? 'place' : 'error');
    if (!F.pieces.length) toast('置ける鉱石がありません');
    rerender();
  },
  fclear() { F.pieces = []; rebuildGrid(); SND.play('remove'); rerender(); },
  craft() {
    const b = BP[F.bp];
    if (!F.pieces.length || S.coins < b.cost || S.drills.length >= MAX_DRILLS) { SND.play('error'); return; }
    const d = makeDrill();
    S.coins -= b.cost;
    usedOres().forEach((n, t) => { S.ores[t] -= n; });
    S.drills.push(d);
    S.stats.crafted++;
    d.eff.forEach(e => { if (!S.dex.eff.includes(e.k)) S.dex.eff.push(e.k); });
    const bestPow = Math.max(0, ...S.drills.filter(x => x.id !== d.id).map(x => x.power));
    F.pieces = []; rebuildGrid(); F.sel = null;
    saveNow();
    SND.play(d.rar >= 2 ? 'rare' : 'craft');
    const main = drillById(S.equip[0]);
    const btns = [];
    if (!main || d.power > main.power) btns.push({ label: 'メインに装備', cls: 'primary', onClick: () => { equipTo(d.id, 0); saveSoon(); rerender(); } });
    btns.push({ label: 'OK', cls: btns.length ? '' : 'primary' });
    Modal.open({
      title: d.rar >= 3 ? '★ レジェンドドリル完成！ ★' : 'ドリル完成！',
      cls: d.rar >= 3 ? 'legend' : d.rar === 2 ? 'epic' : '',
      html: `${drillCard(d)}<ul class="efflist">${d.eff.length ? d.eff.map(e => `<li>${EFFECTS[e.k].n}：${effText(e)}</li>`).join('') : '<li>特殊効果なし</li>'}</ul>
        ${d.power > bestPow ? '<p class="good-t">所持ドリルの中で最強の採掘力！</p>' : ''}${main && d.power > main.power ? '' : '<p class="small">サブスロットに入れると特殊効果だけが働きます。</p>'}`,
      buttons: btns,
    });
    rerender();
  },
  slot(el) { selSlot = +el.dataset.i; SND.play('ui'); rerender(); },
  drill(el) { SND.play('ui'); openDrill(+el.dataset.id); },
  bulk() {
    const targets = S.drills.filter(d => d.rar === 0 && !d.lock && !S.equip.includes(d.id));
    if (!targets.length) { toast('解体できるコモンドリルはありません'); return; }
    const total = targets.reduce((a, d) => a + scrapValue(d), 0);
    Modal.open({
      title: '一括解体',
      html: `<p>ロック・装備中以外のコモンドリル <b class="lamp-t">${targets.length}本</b> を解体します。<br>獲得コイン：<span class="ic ic-coin"></span> ${fmt(total)}</p>`,
      buttons: [{ label: '解体する', cls: 'danger', onClick: () => {
        const ids = new Set(targets.map(d => d.id));
        S.drills = S.drills.filter(d => !ids.has(d.id));
        addCoins(total);
        SND.play('coin'); saveSoon(); rerender();
      } }, { label: 'やめる' }],
    });
  },
  sell(el) {
    const t = +el.dataset.t;
    const n = el.dataset.n === 'all' ? S.ores[t] : Math.min(+el.dataset.n, S.ores[t]);
    if (n <= 0) return;
    S.ores[t] -= n;
    addCoins(orePrice(t) * n);
    fixBoard();
    SND.play('coin');
    saveSoon();
    rerender();
  },
  upg(el) {
    const u = UPG.find(x => x.k === el.dataset.u);
    const lv = S.upg[u.k] || 0;
    const cost = u.cost(lv);
    if (lv >= u.max || S.coins < cost) { SND.play('error'); return; }
    S.coins -= cost;
    S.upg[u.k] = lv + 1;
    SND.play('buy');
    toast(`${u.n} が Lv${lv + 1} になった！`, 'good');
    saveSoon();
    rerender();
  },
  buybp(el) {
    const i = +el.dataset.id, b = BP[i];
    if (S.bps.includes(i) || S.coins < b.price) { SND.play('error'); return; }
    S.coins -= b.price;
    S.bps.push(i);
    SND.play('buy');
    toast(`「${b.n}」を手に入れた！`, 'gold');
    saveSoon();
    rerender();
  },
  tog(el) {
    const k = el.dataset.key;
    SET[k] = !SET[k];
    el.classList.toggle('on', SET[k]);
    el.textContent = `${el.dataset.label}：${SET[k] ? 'ON' : 'OFF'}`;
    saveSettings();
  },
};
function flashBad(cells) {
  const board = $('#board');
  if (!board) return;
  cells.forEach(([x, y]) => {
    const el = board.querySelector(`[data-x="${x}"][data-y="${y}"]`);
    if (el) { el.classList.add('pv-bad'); setTimeout(() => el.classList.remove('pv-bad'), 250); }
  });
}

// ============================================================
// 11. 設定・データ管理
// ============================================================
function openSettings() {
  const tg = (key, label) => `<button class="btn tog ${SET[key] ? 'on' : ''}" data-act="tog" data-key="${key}" data-label="${label}" data-k="tg-${key}">${label}：${SET[key] ? 'ON' : 'OFF'}</button>`;
  const html = `
    <div class="set-row"><label>BGM</label><input type="range" min="0" max="100" step="5" value="${Math.round(SET.bgm * 100)}" data-set="bgm" data-k="s-bgm"><output>${Math.round(SET.bgm * 100)}</output></div>
    <div class="set-row"><label>効果音</label><input type="range" min="0" max="100" step="5" value="${Math.round(SET.se * 100)}" data-set="se" data-k="s-se"><output>${Math.round(SET.se * 100)}</output></div>
    <div class="set-btns">${tg('shake', '画面の揺れ')}${tg('dmg', 'ダメージ表示')}</div>
    <p class="sec-t">コントローラー</p>
    <div class="set-btns">${tg('swapAB', 'A/B入れ替え')}${tg('swapXY', 'X/Y入れ替え')}</div>
    <p class="small">決定：A／戻る：B／鍛冶の回転：X・反転：Y／採掘中の帰還：Y／ポーズ：START／タブ切替：LB・RB</p>
    ${S ? `<p class="sec-t">データ</p>
    <div class="set-btns">
      <button class="btn" data-act="exp" data-k="d-exp">書き出し</button>
      <button class="btn" data-act="imp" data-k="d-imp">読み込み</button>
      <button class="btn danger" data-act="reset" data-k="d-reset" style="grid-column:1/-1">セーブデータを消す</button>
    </div>` : ''}
    <p class="sec-t">クレジット</p>
    <p class="small">ピクセルドリル999<br><a href="https://github.com/h1ro223" target="_blank" rel="noopener">made by hiro / ヒロ</a></p>`;
  Modal.open({ title: 'せってい', html, buttons: [{ label: '閉じる', cls: 'primary' }] });
}
ACT.exp = () => {
  saveNow();
  let code = '';
  try { code = btoa(unescape(encodeURIComponent(serialize()))); } catch (e) { code = ''; }
  Modal.open({
    title: 'データの書き出し',
    html: `<p class="small">この文字列を保存しておけば、別の端末で「読み込み」できます。</p><textarea class="code" id="exp-code" readonly>${code}</textarea>`,
    buttons: [
      { label: 'コピー', cls: 'primary', close: false, onClick: () => {
        const ta = $('#exp-code');
        const done = () => toast('コピーしました', 'good');
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(done, () => { ta.select(); document.execCommand('copy'); done(); });
        else { ta.select(); document.execCommand('copy'); done(); }
        return false;
      } },
      { label: '閉じる' },
    ],
  });
};
ACT.imp = () => {
  Modal.open({
    title: 'データの読み込み',
    html: '<p class="small">書き出した文字列を貼り付けてください。今のデータは上書きされます。</p><textarea class="code" id="imp-code"></textarea>',
    buttons: [
      { label: '読み込む', cls: 'primary', onClick: () => {
        try {
          const txt = $('#imp-code').value.trim();
          const o = sanitize(JSON.parse(decodeURIComponent(escape(atob(txt)))));
          if (!o) throw new Error('bad');
          S = o;
          saveNow();
          Modal.closeAll();
          F.boardBp = -1; departFloor = -1;
          toast('データを読み込みました', 'good');
          showScreen('camp');
        } catch (e) {
          toast('読み込めませんでした。文字列を確認してください');
          SND.play('error');
          return false;
        }
        return true;
      } },
      { label: 'やめる' },
    ],
  });
};
ACT.reset = () => {
  Modal.open({
    title: 'セーブデータを消す',
    html: '<p>すべての進行状況が消えます。<br>本当に消しますか？（元に戻せません）</p>',
    buttons: [
      { label: '消す', cls: 'danger', onClick: () => {
        try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 無視 */ }
        S = null;
        G.on = false;
        Modal.closeAll();
        showScreen('title');
        toast('セーブデータを消しました');
      } },
      { label: 'やめる', cls: 'primary' },
    ],
  });
};

// ============================================================
// 12. タイトル・ゲーム開始
// ============================================================
function refreshTitle() {
  const has = !!S;
  $('#btn-continue').style.display = has ? '' : 'none';
  $('#btn-new').classList.toggle('primary', !has);
}
function newGame() {
  S = newSave();
  F.boardBp = -1; F.sel = null; departFloor = 0; selSlot = 0; tab = 'depart';
  saveNow();
  showScreen('camp');
  Modal.open({
    title: 'ようこそ、採掘キャンプへ！',
    html: `<p>目指すは<b class="lamp-t">地底999階</b>。敵もタイムリミットもない、のんびり採掘の旅です。</p>
      <p>① 「出発」して地面を掘る<br>② 鉱石を集めて「帰還」<br>③ 「鍛冶」で設計図に鉱石をはめてドリルを作る<br>④ もっと深く！</p>
      <p class="note">10階ごとにワープ地点が解放され、次からそこへ直接出発できます。</p>`,
    buttons: [{ label: 'はじめる', cls: 'primary' }],
  });
}

let tbOffset = 0;
const tbx = $('#title-bg').getContext('2d');
function drawTitleBg(dt) {
  const c = tbx.canvas;
  tbOffset += dt * 14;
  tbx.imageSmoothingEnabled = false;
  const startRow = Math.floor(tbOffset / TILE);
  const off = tbOffset % TILE;
  for (let i = 0; i <= Math.ceil(c.height / TILE); i++) {
    const row = startRow + i;
    const b = Math.floor(row / 14) % 10;
    for (let col = 0; col < 13; col++) {
      const h = hash3(col, row, 9);
      const x = col * TILE, y = Math.round(i * TILE - off);
      if (h < 0.18) { tbx.drawImage(SPR.wall[b][0], x, y); continue; }
      tbx.drawImage(SPR.block[b][Math.floor(h * 3) % 3], x, y);
      if (h > 0.9) tbx.drawImage(SPR.ore[Math.floor(hash3(col, row, 3) * 10)], x, y);
      else if (h > 0.87) tbx.drawImage(SPR.coin, x, y);
    }
  }
}

function drawCampBanner() {
  const c = $('#camp-banner'), x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.drawImage(SPR.sky, 0, -24);
  for (let col = 0; col < 13; col++) {
    x.drawImage(SPR.block[0][col % 3], col * TILE, 56);
    x.drawImage(SPR.grass, col * TILE, 56);
  }
  x.drawImage(SPR.player, 96, 40);
  x.save(); x.translate(106, 48); x.drawImage(drillSprite(-1, 0), 0, -3); x.restore();
}

// ============================================================
// 13. メインループ・初期化
// ============================================================
let lastT = 0;
function frame(now) {
  const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0.016;
  lastT = now;
  Pad.poll(dt);
  if (S && !document.hidden) S.stats.time += dt;
  if (G.on) {
    if (!Modal.isOpen()) update(dt);
    render();
    updateFloats(dt);
    hud();
  } else if (curScreen === 'title') {
    drawTitleBg(dt);
  }
  BGM.tick();
  saveTimer += dt;
  if (saveDirty && saveTimer > 3) { saveTimer = 0; saveNow(); }
  requestAnimationFrame(frame);
}

function bindUI() {
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-act]');
    if (!t || t.disabled) return;
    const fn = ACT[t.dataset.act];
    if (fn) fn(t, e);
  });
  document.addEventListener('input', e => {
    const k = e.target.dataset && e.target.dataset.set;
    if (!k) return;
    SET[k] = (+e.target.value) / 100;
    const out = e.target.parentElement.querySelector('output');
    if (out) out.textContent = e.target.value;
    SND.setVol();
    saveSettings();
    if (k === 'se') SND.play('ui');
  });
  document.addEventListener('pointerover', e => {
    if (curScreen !== 'camp' || tab !== 'forge') return;
    const c = e.target.closest && e.target.closest('.fcell');
    if (c && c.dataset.x != null) { F.hover = [+c.dataset.x, +c.dataset.y]; applyHover(); }
    else if (F.hover && !(e.target.closest && e.target.closest('#board-wrap'))) { F.hover = null; applyHover(); }
  });
  document.addEventListener('focusin', e => {
    if (curScreen !== 'camp' || tab !== 'forge') return;
    const c = e.target.closest && e.target.closest('.fcell');
    if (c && c.dataset.x != null) { F.hover = [+c.dataset.x, +c.dataset.y]; applyHover(); }
  });
  $$('.tab').forEach(b => b.addEventListener('click', () => {
    if (tab === b.dataset.tab) return;
    tab = b.dataset.tab;
    SND.play('ui');
    renderCamp(true);
  }));
  $('#btn-continue').addEventListener('click', () => { if (S) { SND.play('ui'); departFloor = -1; showScreen('camp'); } });
  $('#btn-new').addEventListener('click', () => {
    SND.play('ui');
    if (S) {
      Modal.open({
        title: 'はじめから',
        html: '<p>今のセーブデータは消えてしまいます。<br>はじめから遊びますか？</p>',
        buttons: [{ label: 'はじめから', cls: 'danger', onClick: () => { setTimeout(newGame, 0); } }, { label: 'やめる', cls: 'primary' }],
      });
    } else newGame();
  });
  $('#btn-title-set').addEventListener('click', () => { SND.play('ui'); openSettings(); });
  $('#btn-camp-set').addEventListener('click', () => { SND.play('ui'); openSettings(); });
  $('#h-ret').addEventListener('click', askReturn);
  $('#tc-ret').addEventListener('click', askReturn);
  $('#h-pause').addEventListener('click', pauseMenu);

  window.addEventListener('resize', () => { if (G.on) resizeView(); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', () => { if (G.on) resizeView(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      saveNow();
      if (SND.ok) SND.ctx.suspend().catch(() => {});
      if (G.on && !Modal.isOpen()) pauseMenu();
    } else if (SND.ok) {
      SND.ctx.resume().catch(() => {});
      BGM.restart();
    }
  });
  window.addEventListener('pagehide', saveNow);
}

function init() {
  loadSettings();
  buildSprites();
  S = loadSave();
  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
  bindInput();
  bindUI();
  drawCampBanner();
  showScreen('title');
  requestAnimationFrame(frame);
}

init();
})();
