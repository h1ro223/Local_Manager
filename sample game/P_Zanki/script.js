/* ==========================================================
   P 斬鬼 ～百鬼夜行～  パチンコシミュレーター
   made by hiro/ヒロ  https://github.com/h1ro223
   ========================================================== */
(() => {
'use strict';

/* ---------- ユーティリティ ---------- */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const chance = p => Math.random() < p;
function pickW(w) {
  let tot = 0;
  for (const k in w) tot += w[k];
  let r = Math.random() * tot;
  for (const k in w) { r -= w[k]; if (r < 0) return k; }
  return Object.keys(w)[0];
}
const E = {
  lin: t => t,
  inQ: t => t * t,
  outQ: t => 1 - (1 - t) * (1 - t),
  outC: t => 1 - Math.pow(1 - t, 3),
  inC: t => t * t * t,
  ioC: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  ioS: t => -(Math.cos(Math.PI * t) - 1) / 2,
  outB: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  outEl: t => t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1
};
const fmt = n => Math.round(n).toLocaleString('ja-JP');
const TAU = Math.PI * 2;

/* ---------- フォント ---------- */
const F_BRUSH = '"Yuji Syuku", "Hiragino Mincho ProN", "Yu Mincho", "YuMincho", serif';
const F_MIN = '"Shippori Mincho B1", "Hiragino Mincho ProN", "Yu Mincho", "YuMincho", serif';
const F_GOTH = '"Dela Gothic One", "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif';

/* ---------- 機種スペック ---------- */
const SPEC = {
  pNormal: 1 / 319.6,      // 通常時・時短時の大当たり確率
  pST: 1 / 99.4,           // RUSH(ST)中の大当たり確率
  stCount: 130,            // RUSH(ST)回数
  jitanCount: 100,         // 時短回数
  rushRate1: 0.5,          // ヘソ当選時のRUSH突入率
  r10Rate2: 0.7,           // 電チュー当選時の10R比率
  hesoPay: 3, denPay: 1, atkPay: 15, pocketPay: 3,
  atkMax: 10, roundTime: 29.5, interval: 1.6,
  lendBalls: 125, lendYen: 500,
  fireInterval: 0.6,       // 100発/分
  holdMax: 4,
  presetL: 0.22, presetR: 0.9,
  hesoR: 3,                // ヘソ大当りのラウンド数
  hesoRushR: 3,            // ヘソ大当りでRUSH突入時の総ラウンド(PREMIUM)
  rushR: 0,                // RUSH中大当りのラウンド(0=10R/3R振り分け)
  loop: 0,                 // MAXループ継続率
  key: 'middle'
};
/* ---------- スペックのプリセット(設定画面から変更可能) ---------- */
const SPEC_PRESETS = {
  ama: { name: '甘デジ', pN: 99.9, pS: 39.9, st: 50, jt: 50, rush: 50, r10: 30, hesoR: 3, hrR: 3, rR: 0, loop: 0 },
  light: { name: 'ライトミドル', pN: 199.8, pS: 79.9, st: 120, jt: 100, rush: 50, r10: 50, hesoR: 3, hrR: 3, rR: 0, loop: 0 },
  middle: { name: 'ミドル(標準)', pN: 319.6, pS: 99.4, st: 130, jt: 100, rush: 50, r10: 70, hesoR: 3, hrR: 3, rR: 0, loop: 0 },
  high: { name: 'ハイミドル', pN: 349.9, pS: 109.9, st: 163, jt: 100, rush: 60, r10: 80, hesoR: 3, hrR: 3, rR: 0, loop: 0 },
  max: { name: 'MAX', pN: 399.9, pS: 99.9, st: 163, jt: 100, rush: 70, r10: 100, hesoR: 4, hrR: 4, rR: 0, loop: 0 },
  kuishu: { name: '超一撃(喰種999風)', pN: 349.9, pS: 7.7, st: 5, jt: 0, rush: 50, r10: 100, hesoR: 20, hrR: 50, rR: 20, loop: 30 }
};
const SPEC_LIMIT = { pN: [10, 999.9], pS: [2, 999.9], st: [1, 999], jt: [0, 999], rush: [0, 100], r10: [0, 100], hesoR: [1, 60], hrR: [1, 60], rR: [0, 60], loop: [0, 90] };
function specNum(k, v, d) {
  v = Number(v); if (!isFinite(v)) v = d;
  const L = SPEC_LIMIT[k]; v = Math.min(L[1], Math.max(L[0], v));
  return (k === 'pN' || k === 'pS') ? Math.round(v * 10) / 10 : Math.round(v);
}
function specGet() {
  return { key: SPEC.key, pN: Math.round(1 / SPEC.pNormal * 10) / 10, pS: Math.round(1 / SPEC.pST * 10) / 10, st: SPEC.stCount, jt: SPEC.jitanCount, rush: Math.round(SPEC.rushRate1 * 100), r10: Math.round(SPEC.r10Rate2 * 100), hesoR: SPEC.hesoR, hrR: SPEC.hesoRushR, rR: SPEC.rushR, loop: Math.round(SPEC.loop * 100) };
}
function applySpec(o) {
  const m = SPEC_PRESETS.middle, c = {};
  for (const k in SPEC_LIMIT) c[k] = specNum(k, o && o[k], m[k]);
  SPEC.pNormal = 1 / c.pN; SPEC.pST = 1 / c.pS; SPEC.stCount = c.st; SPEC.jitanCount = c.jt;
  c.hrR = Math.max(c.hrR, c.hesoR);
  SPEC.rushRate1 = c.rush / 100; SPEC.r10Rate2 = c.r10 / 100; SPEC.hesoR = c.hesoR;
  SPEC.hesoRushR = c.hrR; SPEC.rushR = c.rR; SPEC.loop = c.loop / 100;
  SPEC.key = (o && SPEC_PRESETS[o.key]) ? o.key : 'custom';
  return c;
}
const contPct = () => Math.round((1 - Math.pow(1 - SPEC.pST, SPEC.stCount)) * 100);

/* ---------- 色 ---------- */
const COL = {
  white: ['#ffffff', '#c9d2e0'], blue: ['#6fd0ff', '#1e5fd8'], green: ['#8dff8a', '#16a34a'],
  red: ['#ff7a6b', '#d4141c'], gold: ['#fff2a8', '#d99a10'], rainbow: ['#ffffff', '#ff4dd2']
};
const RANK = { white: 0, blue: 1, green: 2, red: 3, gold: 4, rainbow: 5 };

// @@PHYS_START
/* ==========================================================
   盤面ジオメトリ & 物理エンジン(DOM非依存)
   ========================================================== */
const PHYS = (() => {
  const D2R = Math.PI / 180, TAU = Math.PI * 2;
  const W = 600, H = 690, CX = 300, CY = 350, RAIL_R = 288;
  const BALL_R = 6, NAIL_R = 2.2, G = 1500;
  const RI = 274, RAIL_T = 1, RAIL_A0 = 138 * D2R, RAIL_A1 = 206 * D2R;
  const RF = 263;
  const LAUNCH_A = 146 * D2R, LAUNCH_D = 281.5;
  const OUT_HALF = 22;
  const V_MIN = 1000, V_MAX = 1290;
  const ST = { x0: 136, x1: 464, cy: 420, depth: 24, half: 166, fr: 0.55 };
  const stY = x => { const u = Math.min(1, Math.abs(x - 300) / ST.half); return ST.cy - ST.depth * (0.55 * u + 0.45 * u * u); };
  const SUB = 1 / 480, CELL = 24;
  const SH = { x0: 569.3, y0: 452, x1: 456, y1: 487 };
  const shelfY = x => SH.y0 + (SH.x0 - x) * (SH.y1 - SH.y0) / (SH.x0 - SH.x1);
  const DEN = [514, 536], ATK = [466, 506];
  const LCD = { x: 128, y: 118, w: 344, h: 260 };
  const polar = (r, deg) => [CX + r * Math.cos(deg * D2R), CY + r * Math.sin(deg * D2R)];
  const angN = a => { a %= TAU; return a < 0 ? a + TAU : a; };

  let _cx = 0, _cy = 0;
  function segClosest(px, py, s) {
    const dx = s.bx - s.ax, dy = s.by - s.ay;
    let t = ((px - s.ax) * dx + (py - s.ay) * dy) / (dx * dx + dy * dy);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    _cx = s.ax + dx * t; _cy = s.ay + dy * t;
    return Math.hypot(px - _cx, py - _cy);
  }
  function inPoly(x, y, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }
  function bez(p, t) {
    const u = 1 - t;
    return [
      u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0],
      u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1]
    ];
  }

  /* ---------- 盤面生成 ---------- */
  function build(opt) {
    const P = Object.assign({
      hesoGap: 17, hesoY: 516, meiGap: 23, meiY: 494, meiR: [0, 0], shoulder: [36, 520],
      roadSp: 6.5, kob: 16.3, kobIdx: [17], roadFr: 0.4, nailE: 0.32,
      roadL: [64, 451, 272, 495.3], roadR: [412, 460, 334, 494], yori: null,
      stageVC: 45, stageVCw: 60, stageVS: 50, stageVSw: 60, stageExitVx: 50, stageSide: 228
    }, opt || {});
    const nails = [], segs = [], dyn = [], wms = [], pockets = [];
    const nail = (x, y, kind) => { nails.push({ x, y, r: NAIL_R, e: 0.5, kind: kind || 'n' }); };
    const cap = (x, y, r) => { nails.push({ x, y, r: r || 1.2, e: 0.3, kind: 'cap' }); };
    const seg = (ax, ay, bx, by, kind, e, fr) => {
      const s = { ax, ay, bx, by, t: 0.5, e: e == null ? 0.3 : e, fr: fr == null ? 0.5 : fr, kind: kind || 'wall', on: true };
      segs.push(s); return s;
    };

    // センター役物(枠)
    const frame = [];
    for (let a = 232; a <= 308.01; a += 4) frame.push(polar(RF, a));
    frame.push([490, 196], [490, 432], [110, 432], [110, 346], [110, 330], [110, 196]);
    for (let i = 0; i < frame.length; i++) {
      const p = frame[i], q = frame[(i + 1) % frame.length];
      if (p[0] === 110 && p[1] === 346) continue; // ワープ入口(枠左側の穴)
      seg(p[0], p[1], q[0], q[1], 'frame', 0.3);
    }
    // ワープ入口(左サイドのカップ)
    // ステージ
    // 左サイドのキッカー(枠沿いに落ちる玉を弾き出す)
    seg(110, 228, 90, 246, 'kicker', 0.35);
    // 内レールの返し(レール沿いに落ちる玉を中央へ戻す)
    const ra = polar(RI - 1, 176), rbp = polar(RI - 19, 170);
    seg(ra[0], ra[1], rbp[0], rbp[1], 'kicker', 0.3);
    seg(110, 362, 96, 375, 'kicker', 0.35);
    // ヘソ(スタートチャッカー)
    // ヘソ上は空間を空け、命釘2本でV字の流れを受ける
    const hx = 300, hy = P.hesoY, hg = P.hesoGap / 2;
    seg(hx - hg, hy, hx - hg + 1.5, hy + 18, 'heso', 0.2);
    seg(hx + hg, hy, hx + hg - 1.5, hy + 18, 'heso', 0.2);
    seg(hx - hg + 1.5, hy + 18, hx + hg - 1.5, hy + 18, 'heso', 0.1);
    nail(hx - P.meiGap / 2, P.meiY, 'heso'); nail(hx + P.meiGap / 2 + P.meiR[0], P.meiY + P.meiR[1], 'heso');
    for (const d of [-1, 1]) nail(hx + d * P.shoulder[0], P.shoulder[1], 'n');
    // 一般入賞口
    const pocket = (x, y) => {
      seg(x - 8, y - 6, x - 7.5, y + 8, 'pocket', 0.2);
      seg(x + 8, y - 6, x + 7.5, y + 8, 'pocket', 0.2);
      seg(x - 7.5, y + 8, x + 7.5, y + 8, 'pocket', 0.1);
      pockets.push({ x, y });
      nail(x, y - 20, 'n');
    };
    pocket(152, 562); pocket(234, 606);
    // 右打ちルート
    seg(434, 432, 434, 572, 'wall', 0.3);
    const rb1 = polar(289, 321), rb2 = polar(268, 323);
    seg(rb1[0], rb1[1], rb2[0], rb2[1], 'rubber', 0.6, 0.3);
    seg(490, 262, 522, 298, 'guide', 0.3); seg(574.2, 262, 552, 298, 'guide', 0.3);
    seg(490, 388, 516, 414, 'guide', 0.3); seg(586.4, 380, 548, 414, 'guide', 0.3);
    seg(SH.x0, SH.y0, DEN[1], shelfY(DEN[1]), 'shelf', 0.25);
    const lidD = seg(DEN[1], shelfY(DEN[1]), DEN[0], shelfY(DEN[0]), 'lidD', 0.25);
    seg(DEN[0], shelfY(DEN[0]), ATK[1], shelfY(ATK[1]), 'shelf', 0.25);
    const lidA = seg(ATK[1], shelfY(ATK[1]), ATK[0], shelfY(ATK[0]), 'lidA', 0.25);
    seg(ATK[0], shelfY(ATK[0]), SH.x1, SH.y1, 'shelf', 0.25);
    // 風車
    wms.push({ x: 66, y: 270, r: 8.5, ang: 0, om: 0 });
    wms.push({ x: 537, y: 352, r: 8.5, ang: 0.4, om: 0 });
    // キャップ類(レール端・アウト口)
    const ra0 = polar(RI, 138), ra1 = polar(RI, 206);
    cap(ra0[0], ra0[1], RAIL_T); cap(ra1[0], ra1[1], RAIL_T);

    // 道釘(左)・右側寄せ釘
    const road = (r, gapIdx, kind) => {
      const [x0, y0, x1, y1] = r, L = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / L, uy = (y1 - y0) / L;
      let s = 0, i = 0;
      while (s <= L + 0.01) { nail(x0 + ux * s, y0 + uy * s, kind); s += gapIdx.indexOf(i) >= 0 ? P.kob : P.roadSp; i++; }
    };
    road(P.roadL, P.kobIdx, 'road');
    road(P.roadR, [6], 'road');
    if (P.yori) nail(P.yori[0], P.yori[1], 'n');

    // 釘の自動配置(安全な間隔を保証)
    const statics = segs.filter(s => s.kind !== 'lidD' && s.kind !== 'lidA');
    const allWalls = segs;
    function tryNail(x, y) {
      const dx = x - CX, dy = y - CY, d = Math.hypot(dx, dy);
      if (d > RAIL_R - 17) return false;
      const th = angN(Math.atan2(dy, dx));
      if (th >= RAIL_A0 - 0.03 && th <= RAIL_A1 + 0.03 && d > RI - 17) return false;
      if (Math.abs(dx) < 42 && dy > 0 && d > RAIL_R - 40) return false;
      if (inPoly(x, y, frame)) return false;
      for (const s of allWalls) if (segClosest(x, y, s) < 17) return false;
      for (const w of wms) if (Math.hypot(x - w.x, y - w.y) < w.r + 21) return false;
      for (const n of nails) if (Math.hypot(x - n.x, y - n.y) < 17.6) return false;
      if (th > 196 * D2R && th < 344 * D2R && d > RAIL_R - 30) return false;
      nail(x, y, 'n'); return true;
    }
    const grid = (x0, x1, y0, y1, sx, sy) => {
      let row = 0;
      for (let y = y0; y <= y1; y += sy, row++) {
        for (let x = x0 + (row % 2 ? sx / 2 : 0); x <= x1; x += sx) tryNail(x, y);
      }
    };
    grid(5, 110, 150, 420, 22, 19);        // 左レーン
    grid(492, 592, 160, 250, 24, 22);      // 右レーン上部
    grid(492, 592, 318, 378, 26, 22);      // 右レーン中部
    grid(16, 300, 488, 630, 24, 21);       // 左下
    grid(310, 432, 488, 630, 24, 21);      // 右下(ヘソ右)
    grid(440, 592, 500, 630, 26, 22);      // 右アウト側

    // 空間グリッド
    const gw = Math.ceil(W / CELL), gh = Math.ceil(H / CELL);
    const cells = new Array(gw * gh);
    for (let i = 0; i < cells.length; i++) cells[i] = [];
    const reach = BALL_R + 3;
    const addCells = (o, x0, y0, x1, y1) => {
      const cx0 = Math.max(0, Math.floor((x0 - reach) / CELL)), cx1 = Math.min(gw - 1, Math.floor((x1 + reach) / CELL));
      const cy0 = Math.max(0, Math.floor((y0 - reach) / CELL)), cy1 = Math.min(gh - 1, Math.floor((y1 + reach) / CELL));
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) cells[cy * gw + cx].push(o);
    };
    for (const n of nails) addCells(n, n.x - n.r, n.y - n.r, n.x + n.r, n.y + n.r);
    for (const s of statics) {
      addCells(s, Math.min(s.ax, s.bx), Math.min(s.ay, s.by), Math.max(s.ax, s.bx), Math.max(s.ay, s.by));
    }
    dyn.push(lidD, lidA);
    // 戻り球防止弁(発射中以外の玉は発射レールへ戻れない)
    const fa = polar(RI, 206), fb = polar(RAIL_R, 206);
    const flap = { ax: fa[0], ay: fa[1], bx: fb[0], by: fb[1], t: 0.8, e: 0.35, fr: 0.3, kind: 'flap', on: true };

    return {
      P, nails, segs, dyn, wms, pockets, frame, cells, gw, gh, lidD, lidA, flap,
      heso: { x: hx, y: hy, g: hg },
      warpPath: [[108, 338], [126, 340], [128, 368], [140, 389]],
      gate: { x: 537, y: 310, r: 13 },
      rubber: [rb1, rb2]
    };
  }

  /* ---------- 物理ワールド ---------- */
  class World {
    constructor(board, rnd) {
      this.b = board; this.balls = []; this.events = []; this.acc = 0; this.t = 0; this.id = 1;
      this.rnd = rnd || Math.random; this.denOpen = false; this.atkOpen = false; this.denUntil = -1; this.atkUntil = -1;
    }
    launcherClear() {
      const lx = CX + LAUNCH_D * Math.cos(LAUNCH_A), ly = CY + LAUNCH_D * Math.sin(LAUNCH_A);
      for (const b of this.balls) if (!b.dead && Math.hypot(b.x - lx, b.y - ly) < 16) return false;
      return true;
    }
    launch(power) {
      const p = Math.max(0, Math.min(1, power));
      const v = (V_MIN + (V_MAX - V_MIN) * p) * (1 + (this.rnd() - 0.5) * 0.024);
      const a = LAUNCH_A;
      const b = {
        id: this.id++, x: CX + LAUNCH_D * Math.cos(a), y: CY + LAUNCH_D * Math.sin(a),
        vx: -Math.sin(a) * v, vy: Math.cos(a) * v, px: 0, py: 0,
        dead: false, launching: true, kin: null, still: 0, age: 0, gate: false, warped: false, onStage: false, tag: ''
      };
      b.px = b.x; b.py = b.y;
      this.balls.push(b);
      return b;
    }
    emit(type, b) { this.events.push({ type, x: b.x, y: b.y, ball: b }); }
    kill(b, type) { if (b.dead) return; b.dead = true; if (type) this.emit(type, b); }
    update(dt) {
      this.acc += Math.min(dt, 0.05);
      let n = 0;
      while (this.acc >= SUB && n < 40) { this.step(SUB); this.acc -= SUB; n++; }
      if (n >= 40) this.acc = 0;
      if (this.balls.length && this.balls.some(b => b.dead)) this.balls = this.balls.filter(b => !b.dead);
    }
    startKin(b, pts, dur, vx, vy, then) {
      b.kin = { pts, dur, t: 0, vx, vy, then };
    }
    step(dt) {
      const B = this.b, balls = this.balls, rnd = this.rnd;
      this.t += dt;
      B.lidD.on = !this.denOpen; B.lidA.on = !this.atkOpen;
      if (this.denOpen) this.denUntil = this.t + 0.12;
      if (this.atkOpen) this.atkUntil = this.t + 0.12;
      for (const w of B.wms) { w.ang += w.om * dt; w.om *= (1 - 0.9 * dt); }
      for (let i = 0; i < balls.length; i++) {
        const b = balls[i];
        if (b.dead) continue;
        b.age += dt;
        if (b.kin) {
          const k = b.kin; k.t += dt;
          const u = Math.min(1, k.t / k.dur), e = u * u * (3 - 2 * u);
          const p = bez(k.pts, e); b.px = b.x; b.py = b.y; b.x = p[0]; b.y = p[1];
          if (u >= 1) {
            b.kin = null; b.vx = k.vx; b.vy = k.vy; b.still = 0;
            if (k.then) k.then(b);
          }
          continue;
        }
        if (b.stage) { this.stageStep(b, dt); continue; }
        b.vy += G * dt;
        const dmp = 1 - 0.015 * dt; b.vx *= dmp; b.vy *= dmp;
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > 2000) { b.vx *= 2000 / sp; b.vy *= 2000 / sp; }
        b.px = b.x; b.py = b.y;
        b.x += b.vx * dt; b.y += b.vy * dt;
        this.collide(b, dt);
        // 停滞対策
        if (sp < 18) { b.still += dt; if (b.still > 1.0) { b.vx += (rnd() - 0.5) * 160; b.vy -= 60; b.still = 0.4; } }
        else b.still = 0;
        if (b.age > 30) this.kill(b, 'lost');
      }
      // 玉同士の衝突
      for (let i = 0; i < balls.length; i++) {
        const a = balls[i]; if (a.dead || a.kin) continue;
        for (let j = i + 1; j < balls.length; j++) {
          const c = balls[j]; if (c.dead || c.kin) continue;
          const dx = c.x - a.x, dy = c.y - a.y;
          if (dx > 12 || dx < -12 || dy > 12 || dy < -12) continue;
          const d2 = dx * dx + dy * dy;
          if (d2 >= 144 || d2 < 1e-6) continue;
          const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, pen = (12 - d) / 2;
          a.x -= nx * pen; a.y -= ny * pen; c.x += nx * pen; c.y += ny * pen;
          const vr = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
          if (vr < 0) {
            const j2 = -(1 + 0.72) * vr / 2;
            a.vx -= j2 * nx; a.vy -= j2 * ny; c.vx += j2 * nx; c.vy += j2 * ny;
          }
        }
      }
      for (let i = 0; i < balls.length; i++) { const b = balls[i]; if (!b.dead && !b.kin) this.sense(b); }
    }
    stageStep(b, dt) {
      const s = b.stage, P = this.b.P;
      const u = Math.min(1, Math.abs(s.x - 300) / ST.half), sg = s.x < 300 ? 1 : s.x > 300 ? -1 : 0;
      const slope = sg * ST.depth * (0.55 + 0.9 * u) / ST.half;
      const inv = 1 / Math.sqrt(1 + slope * slope);
      s.v += G * slope * inv * dt;
      s.v *= (1 - s.fr * dt);
      const ox = s.x;
      s.x += s.v * inv * dt;
      if (s.x < ST.x0) { s.x = ST.x0; s.v = Math.abs(s.v) * 0.45; }
      if (s.x > ST.x1) { s.x = ST.x1; s.v = -Math.abs(s.v) * 0.45; }
      // 他のステージ玉との接触
      for (const o of this.balls) {
        if (o === b || !o.stage || o.dead) continue;
        const d = s.x - o.stage.x;
        if (Math.abs(d) < 12) {
          if ((s.v - o.stage.v) * d < 0) { const t = s.v; s.v = o.stage.v * 0.92; o.stage.v = t * 0.92; }
          const push = (12 - Math.abs(d)) / 2 * Math.sign(d || 1); s.x += push; o.stage.x -= push;
        }
      }
      b.px = b.x; b.py = b.y; b.x = s.x; b.y = stY(s.x) - 6.5; b.vx = s.v; b.vy = 0;
      const av = Math.abs(s.v);
      const cross = h => (ox - h) * (s.x - h) <= 0 && ox !== s.x;
      let tag = '', ex = 0;
      if (cross(300)) {
        const p = av < P.stageVC ? 1 : Math.max(0, 1 - (av - P.stageVC) / P.stageVCw);
        if (this.rnd() < p) { tag = 'stageC'; ex = 300; }
      } else if (cross(P.stageSide) || cross(600 - P.stageSide)) {
        const p = av < P.stageVS ? 1 : Math.max(0, 1 - (av - P.stageVS) / P.stageVSw);
        if (this.rnd() < p) { tag = s.x < 300 ? 'stageL' : 'stageR'; ex = s.x < 300 ? P.stageSide : 600 - P.stageSide; }
      }
      if (!tag && Math.abs(s.x - 300) < 5 && av < P.stageVC) { tag = 'stageC'; ex = 300; }
      if (av < 8) { s.still = (s.still || 0) + dt; if (s.still > 0.8) { s.v += (s.x < 300 ? 1 : -1) * 60; s.still = 0; } } else s.still = 0;
      if (b.age > 25) { tag = 'stageC'; ex = 300; }
      if (tag) {
        b.stage = null; b.onStage = false; b.tag = tag; this.emit(tag, b);
        const y0 = stY(ex) - 6.5;
        const vx = (this.rnd() - 0.5) * (tag === 'stageC' ? P.stageExitVx : 50);
        this.startKin(b, [[ex, y0], [ex, y0 + 10], [ex, 434], [ex, 441]], 0.16, vx, 70, null);
      }
    }
    resolve(b, nx, ny, pen, e, fr, dt, jit) {
      b.x += nx * pen; b.y += ny * pen;
      let vn = b.vx * nx + b.vy * ny;
      if (vn >= 0) return;
      if (jit) {
        const a = (this.rnd() - 0.5) * jit, c = Math.cos(a), s = Math.sin(a);
        const tx = nx * c - ny * s; ny = nx * s + ny * c; nx = tx;
        vn = b.vx * nx + b.vy * ny;
        if (vn >= 0) return;
      }
      const tx = -ny, ty = nx;
      let vt = b.vx * tx + b.vy * ty;
      if (vn < -45) { vn = -vn * e; vt *= (1 - fr * 0.08); }
      else { vn = 0; vt *= (1 - fr * dt); }
      b.vx = nx * vn + tx * vt; b.vy = ny * vn + ty * vt;
    }
    collide(b, dt) {
      const B = this.b, r = BALL_R;
      let dx = b.x - CX, dy = b.y - CY, d = Math.hypot(dx, dy);
      // 外レール
      if (!(dy > 0 && Math.abs(dx) < OUT_HALF) && d > RAIL_R - r) {
        this.resolve(b, -dx / d, -dy / d, d - (RAIL_R - r), 0.22, b.y > 560 ? 0.8 : 0.12, dt, 0);
        dx = b.x - CX; dy = b.y - CY; d = Math.hypot(dx, dy);
      }
      // 内レール(弧)
      const th = angN(Math.atan2(dy, dx));
      if (th >= RAIL_A0 && th <= RAIL_A1) {
        const pd = Math.hypot(b.px - CX, b.py - CY);
        if (pd >= RI) {
          const lim = RI + RAIL_T + r;
          if (d < lim) this.resolve(b, dx / d, dy / d, lim - d, 0.2, 0.12, dt, 0);
        } else {
          const lim = RI - RAIL_T - r;
          if (d > lim) this.resolve(b, -dx / d, -dy / d, d - lim, 0.3, 0.3, dt, 0);
        }
      }
      // 静的オブジェクト
      const gx = Math.floor(b.x / CELL), gy = Math.floor(b.y / CELL);
      if (gx >= 0 && gy >= 0 && gx < B.gw && gy < B.gh) {
        const list = B.cells[gy * B.gw + gx];
        for (let i = 0; i < list.length; i++) {
          const o = list[i];
          if (o.ax !== undefined) {
            const dd = segClosest(b.x, b.y, o), lim = r + o.t;
            if (dd < lim && dd > 1e-6) this.resolve(b, (b.x - _cx) / dd, (b.y - _cy) / dd, lim - dd, o.e, o.fr, dt, 0);
          } else {
            const ox = b.x - o.x, oy = b.y - o.y, lim = r + o.r;
            if (ox > lim || ox < -lim || oy > lim || oy < -lim) continue;
            const dd = Math.hypot(ox, oy);
            if (dd < lim && dd > 1e-6) {
              const e = o.kind === 'cap' ? 0.3 : o.kind === 'road' ? 0.14 + this.rnd() * 0.08 : B.P.nailE + this.rnd() * 0.12;
              this.resolve(b, ox / dd, oy / dd, lim - dd, e, o.kind === 'road' ? B.P.roadFr : 0.15, dt, o.kind === 'cap' ? 0 : 0.07);
            }
          }
        }
      }
      // 可動部(フタ)
      for (const s of B.dyn) {
        if (!s.on) continue;
        const dd = segClosest(b.x, b.y, s), lim = r + s.t;
        if (dd < lim && dd > 1e-6) this.resolve(b, (b.x - _cx) / dd, (b.y - _cy) / dd, lim - dd, s.e, s.fr, dt, 0);
      }
      // 戻り球防止弁
      if (!b.launching) {
        const s = B.flap, dd = segClosest(b.x, b.y, s), lim = r + s.t;
        if (dd < lim && dd > 1e-6) this.resolve(b, (b.x - _cx) / dd, (b.y - _cy) / dd, lim - dd, s.e, s.fr, dt, 0);
      }
      // 風車
      for (const w of B.wms) {
        const ox = b.x - w.x, oy = b.y - w.y, lim = r + w.r, dd = Math.hypot(ox, oy);
        if (dd < lim && dd > 1e-6) {
          const nx = ox / dd, ny = oy / dd, tx = -ny, ty = nx;
          const vt = b.vx * tx + b.vy * ty, sv = w.om * w.r;
          this.resolve(b, nx, ny, lim - dd, 0.35, 0.2, dt, 0.05);
          const dv = (sv - vt) * 0.25;
          b.vx += tx * dv; b.vy += ty * dv;
          w.om += (vt - sv) * 0.25 / w.r;
          if (w.om > 40) w.om = 40; else if (w.om < -40) w.om = -40;
        }
      }
    }
    sense(b) {
      const B = this.b, x = b.x, y = b.y;
      if (b.launching) {
        const dx = x - CX, dy = y - CY, d = Math.hypot(dx, dy), th = angN(Math.atan2(dy, dx));
        if (d > RI && th < LAUNCH_A - 0.05) { this.kill(b, 'foul'); return; }
        if (th > RAIL_A1 + 0.032 || d < RI - 2) b.launching = false;
      }
      // ヘソ
      const h = B.heso;
      if (y > h.y + 5 && y < h.y + 22 && x > h.x - h.g + 1 && x < h.x + h.g - 1) { this.kill(b, 'heso'); return; }
      // 電チュー・アタッカー
      if (y > shelfY(x) + 3 && y < shelfY(x) + 30 && b.py <= shelfY(b.px) + 3.5) {
        if (x > DEN[0] && x < DEN[1] && this.t < this.denUntil) { this.kill(b, 'denchu'); return; }
        if (x > ATK[0] && x < ATK[1] && this.t < this.atkUntil) { this.kill(b, 'attacker'); return; }
      }
      // 一般入賞口
      for (const p of B.pockets) if (x > p.x - 5 && x < p.x + 5 && y > p.y - 1 && y < p.y + 9) { this.kill(b, 'pocket'); return; }
      // スルーゲート
      if (!b.gate) { const g = B.gate; if (Math.hypot(x - g.x, y - g.y) < g.r) { b.gate = true; this.emit('gate', b); } }
      // ワープ
      if (x > 105.5 && x < 122 && y > 331 && y < 345) {
        b.warped = true; this.emit('warp', b);
        const vx = 40 + this.rnd() * 130;
        this.startKin(b, B.warpPath, 0.62, 0, 0, bb => { bb.stage = { x: ST.x0 + 4, v: vx, fr: ST.fr * (0.45 + this.rnd() * 1.1) }; bb.x = ST.x0 + 4; bb.y = stY(bb.x) - 6.5; this.emit('stage', bb); });
        return;
      }
      // アウト
      if (y > CY + RAIL_R + 6) { this.kill(b, 'out'); return; }
      const dx = x - CX, dy = y - CY;
      if (dx * dx + dy * dy > (RAIL_R + 10) * (RAIL_R + 10)) this.kill(b, 'out');
    }
  }

  return {
    W, H, CX, CY, RAIL_R, RI, RF, BALL_R, NAIL_R, RAIL_A0, RAIL_A1, LAUNCH_A, LAUNCH_D, OUT_HALF,
    SH, DEN, ATK, LCD, ST, stY, shelfY, polar, build, World
  };
})();
// @@PHYS_END

/* ==========================================================
   サウンド(WebAudioによる合成。外部ファイル不要)
   ========================================================== */
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const seq = s => s.trim().split(/\s+/).map(x => x === '.' ? 0 : +x);
const chords = m => { const a = new Array(32).fill(null); for (const k in m) a[k] = m[k]; return a; };
const SONGS = {
  normal: {
    bpm: 76, k: 'x...............x...........x...', t: '........x...............x...x.x.', s: '', h: '',
    bass: seq('38 . . . . . . . . . . . . . . . 33 . . . . . . . . . . . . . . .'), bassLen: 14,
    pl: seq('74 . . 70 . 69 . . 67 . . . 63 . 62 . 62 . . 63 . 67 . . 69 . 70 . 69 . . .')
  },
  battle: {
    bpm: 150, k: 'x...x...x...x...x...x...x...x.x.', s: '....x.......x.......x.......x...', h: '..x...x...x...x...x...x...x...x.', t: 'x.......x.....x.x.......x...x...',
    bass: seq('38 38 50 38 38 50 41 43 38 38 50 38 46 45 43 41 38 38 50 38 38 50 41 43 46 46 45 45 43 43 41 40'),
    lead: seq('74 . . . 72 . 70 . 69 . . . 70 . 72 . 74 . . . 77 . 76 . 74 . 72 . 70 . 69 .')
  },
  boss: {
    bpm: 162, k: 'x.x.x...x.x.x...x.x.x...x.x.x.x.', s: '....x.......x.......x.......x.xx', h: '.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x', t: 'x...............x.......x.x.x.x.',
    bass: seq('38 38 38 51 38 38 50 49 38 38 38 51 38 38 46 45 38 38 38 51 38 38 50 49 46 46 45 45 44 44 43 43'),
    lead: seq('62 . 63 . 66 . 67 . 70 . . . 69 . 66 . 67 . 70 . 75 . 74 . 70 . . . 67 . 66 .')
  },
  bonus: {
    bpm: 140, k: 'x...x...x...x...x...x...x...x...', s: '....x.......x.......x.......x...', h: '..x...x...x...x...x...x...x...x.', t: 'x...............x.......x...x.x.',
    bass: seq('38 . 38 50 . 50 38 . 45 . 45 57 . 57 45 . 47 . 47 59 . 59 47 . 43 . 43 55 . 55 45 .'),
    lead: seq('74 . . . 78 . 81 . 86 . . 85 83 . 81 . 79 . 81 . 83 . 86 . 85 . . . 81 . . .'),
    arp: seq('62 66 69 74 62 66 69 74 57 61 64 69 57 61 64 69 59 62 66 71 59 62 66 71 55 59 62 67 57 61 64 69'),
    ch: chords({ 0: [62, 66, 69], 8: [57, 61, 64], 16: [59, 62, 66], 24: [55, 59, 62] })
  },
  rush: {
    bpm: 168, k: 'x...x...x...x...x...x...x...x...', s: '....x.......x.......x.......x.x.', h: '.xxx.xxx.xxx.xxx.xxx.xxx.xxx.xxx', t: 'x.......x.......x.......x...x.x.',
    bass: seq('38 38 50 38 41 41 53 41 43 43 55 43 45 45 57 45 46 46 58 46 45 45 57 45 43 43 55 43 45 45 57 49'),
    lead: seq('74 . 77 . 81 . 79 77 76 . 74 . 76 77 79 . 81 . 82 . 81 79 77 . 76 . 77 . 79 . 81 .'),
    arp: seq('62 65 69 74 62 65 69 74 65 69 72 77 67 70 74 79 70 74 77 82 69 73 76 81 67 70 74 79 69 73 76 81'),
    ch: chords({ 0: [62, 65, 69], 8: [65, 69, 72], 16: [70, 74, 77], 24: [69, 73, 76] })
  },
  premium: {
    bpm: 150, k: 'x...x...x...x...x...x...x...x...', s: '....x.......x.......x.......x.x.', h: '.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x', t: 'x.......x.......x.......x.x.x.x.',
    bass: seq('38 50 38 50 47 59 47 59 43 55 43 55 45 57 45 57 38 50 38 50 47 59 47 59 43 55 43 55 45 57 49 57'),
    lead: seq('86 . 85 . 86 . 90 . 88 . 86 . 83 . . . 86 . 88 . 90 . 93 . 91 . 90 . 88 . . .'),
    arp: seq('74 78 81 86 74 78 81 86 71 74 78 83 71 74 78 83 67 71 74 79 67 71 74 79 69 73 76 81 69 73 76 81'),
    ch: chords({ 0: [62, 66, 69, 74], 8: [59, 62, 66, 71], 16: [55, 59, 62, 67], 24: [57, 61, 64, 69] })
  },
  rainbow: {
    bpm: 172, k: 'x...x...x...x...x...x...x...x.x.', s: '....x.......x.......x.......x.xx', h: '.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x', t: 'x.......x.......x.......x...x.x.',
    bass: seq('38 50 38 50 43 55 43 55 45 57 45 57 47 59 47 59 38 50 38 50 43 55 43 55 45 57 45 57 49 61 49 61'),
    lead: seq('86 . 85 . 83 . 81 . 83 . . 79 . . 81 83 85 . 86 . 88 . 90 . 88 . 86 . . . . .')
  },
  jitan: {
    bpm: 118, k: 'x.......x.......x.......x.......', s: '', h: '..x...x...x...x...x...x...x...x.', t: '',
    bass: seq('38 . . . 45 . . . 43 . . . 45 . . . 38 . . . 45 . . . 46 . . . 45 . . .'), bassLen: 3,
    pl: seq('69 . 74 . 76 . 77 . 76 . 74 . 72 . . . 69 . 74 . 76 . 81 . 79 . 77 . 76 . . .')
  }
};

const AU = {
  ctx: null, ok: false, out: null, sfxG: null, bgmG: null, nbuf: null,
  song: null, step: 0, next: 0, duckV: 1, tickT: 0,
  init() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const c = this.ctx = new AC();
        const comp = c.createDynamicsCompressor();
        comp.threshold.value = -12; comp.knee.value = 8; comp.ratio.value = 5;
        comp.attack.value = 0.004; comp.release.value = 0.2;
        this.out = c.createGain(); this.sfxG = c.createGain(); this.bgmG = c.createGain();
        this.sfxG.connect(comp); this.bgmG.connect(comp); comp.connect(this.out); this.out.connect(c.destination);
        const len = c.sampleRate, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.nbuf = buf; this.ok = true; this.vol();
      }
      if (this.ctx.state !== 'running') this.ctx.resume();
    } catch (e) { this.ok = false; }
  },
  vol() {
    if (!this.ok) return;
    const s = S.set, t = this.ctx.currentTime;
    this.out.gain.setTargetAtTime(s.master, t, 0.03);
    this.sfxG.gain.setTargetAtTime(s.sfx, t, 0.03);
    this.bgmG.gain.setTargetAtTime(s.bgm * 0.5 * this.duckV, t, 0.08);
  },
  duck(v) { this.duckV = v; this.vol(); },
  o(type, f, t, dur, v, x) {
    x = x || {};
    const c = this.ctx, os = c.createOscillator(), g = c.createGain();
    os.type = type; os.frequency.setValueAtTime(f, t);
    if (x.to) os.frequency.exponentialRampToValueAtTime(Math.max(20, x.to), t + (x.tt || dur));
    if (x.det) os.detune.setValueAtTime(x.det, t);
    const a = x.a || 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t + a);
    if (x.hold) g.gain.setValueAtTime(Math.max(0.0002, v), t + a + x.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let n = os;
    if (x.lp || x.hp || x.bp) {
      const fl = c.createBiquadFilter();
      fl.type = x.lp ? 'lowpass' : x.hp ? 'highpass' : 'bandpass';
      fl.frequency.setValueAtTime(x.lp || x.hp || x.bp, t);
      if (x.fto) fl.frequency.exponentialRampToValueAtTime(x.fto, t + dur);
      if (x.q) fl.Q.value = x.q;
      os.connect(fl); n = fl;
    }
    n.connect(g); g.connect(x.bus || this.sfxG);
    os.start(t); os.stop(t + dur + 0.05);
  },
  n(t, dur, v, x) {
    x = x || {};
    const c = this.ctx, s = c.createBufferSource(), g = c.createGain();
    s.buffer = this.nbuf; s.loop = true; s.playbackRate.value = x.rate || 1;
    const a = x.a || 0.003;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t + a);
    if (x.hold) g.gain.setValueAtTime(Math.max(0.0002, v), t + a + x.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let n = s;
    if (x.lp || x.hp || x.bp) {
      const fl = c.createBiquadFilter();
      fl.type = x.lp ? 'lowpass' : x.hp ? 'highpass' : 'bandpass';
      fl.frequency.setValueAtTime(x.lp || x.hp || x.bp, t);
      if (x.fto) fl.frequency.exponentialRampToValueAtTime(x.fto, t + dur);
      if (x.q) fl.Q.value = x.q;
      s.connect(fl); n = fl;
    }
    n.connect(g); g.connect(x.bus || this.sfxG);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  },
  boom(t, v) { this.o('sine', 150, t, 0.7, v || 0.6, { to: 34, tt: 0.5 }); this.n(t, 0.35, (v || 0.6) * 0.5, { lp: 700, fto: 120 }); },
  kyuin(t) {
    this.o('sawtooth', 640, t, 0.34, 0.12, { to: 2700, tt: 0.3, lp: 5000 });
    this.o('square', 1280, t, 0.34, 0.05, { to: 5200, tt: 0.3, lp: 6000 });
    this.o('sawtooth', 640, t + 0.38, 0.4, 0.12, { to: 2700, tt: 0.32, lp: 5000 });
    this.o('square', 1280, t + 0.38, 0.4, 0.05, { to: 5200, tt: 0.32, lp: 6000 });
  },
  chord(t, notes, dur, v, type) { for (const m of notes) this.o(type || 'sawtooth', mtof(m), t, dur, v, { lp: 3000, a: 0.02, det: rand(-8, 8) }); },
  play(name, arg) {
    if (!this.ok) return;
    const t = this.ctx.currentTime + 0.005;
    switch (name) {
      case 'launch': this.n(t, 0.03, 0.05, { hp: 3500 }); this.o('square', 900, t, 0.03, 0.015, { to: 320 }); break;
      case 'tick': this.o('triangle', rand(2600, 3800), t, 0.03, 0.025); break;
      case 'heso': this.o('sine', 1318.5, t, 0.16, 0.16); this.o('sine', 1975.5, t + 0.06, 0.22, 0.13); break;
      case 'denIn': this.o('sine', 1568, t, 0.1, 0.09); break;
      case 'pocket': this.o('sine', 987.8, t, 0.14, 0.12); this.o('sine', 1318.5, t + 0.05, 0.16, 0.1); break;
      case 'atk': this.o('sine', 2093, t, 0.09, 0.08); this.n(t, 0.05, 0.04, { hp: 6000 }); break;
      case 'pay': for (let i = 0; i < (arg || 6); i++) this.n(t + i * 0.022, 0.03, 0.035, { hp: 5000 }); break;
      case 'spin': this.o('square', 220, t, 0.09, 0.05, { to: 520, lp: 2000 }); break;
      case 'stop': this.n(t, 0.05, 0.16, { bp: 1400, q: 1.2 }); this.o('sine', 190, t, 0.13, 0.25, { to: 60 }); break;
      case 'reach':
        this.o('sawtooth', 300, t, 0.62, 0.11, { to: 1300, tt: 0.55, lp: 3500 });
        this.o('square', 600, t, 0.55, 0.04, { to: 2500, tt: 0.5, lp: 4000 });
        this.boom(t + 0.55, 0.4); break;
      case 'develop':
        this.n(t, 0.55, 0.22, { hp: 300, fto: 7000 }); this.boom(t + 0.45, 0.6);
        this.chord(t + 0.45, [50, 57, 62, 65], 0.9, 0.04); break;
      case 'boom': this.boom(t, arg || 0.6); break;
      case 'slash':
        this.n(t, 0.2, 0.32, { bp: 2200, fto: 9000, q: 0.7 });
        this.o('sawtooth', 1700, t, 0.12, 0.04, { to: 200 }); break;
      case 'enemyAtk':
        this.o('sawtooth', 95, t, 0.55, 0.16, { to: 55, lp: 600 }); this.boom(t + 0.1, 0.5);
        this.n(t, 0.4, 0.15, { bp: 600, q: 2 }); break;
      case 'charge':
        this.o('sawtooth', 90, t, 1.5, 0.1, { to: 900, tt: 1.4, lp: 400, fto: 5000 });
        this.n(t, 1.4, 0.08, { hp: 800, fto: 6000, a: 0.8 }); break;
      case 'clash':
        this.boom(t, 0.8); this.n(t, 0.7, 0.45, { hp: 200, fto: 3000 });
        this.o('square', 2400, t, 0.5, 0.05, { lp: 6000 }); this.o('square', 3150, t, 0.6, 0.04, { lp: 7000 }); break;
      case 'kill':
        this.boom(t, 0.7); this.n(t, 0.5, 0.35, { bp: 3000, fto: 9000 });
        this.o('sine', 1046, t + 0.1, 0.9, 0.08); this.o('sine', 1568, t + 0.16, 0.9, 0.07); this.o('sine', 2093, t + 0.22, 1.1, 0.06); break;
      case 'lose':
        this.o('sawtooth', 420, t, 1.0, 0.12, { to: 55, lp: 1500, fto: 200 }); this.n(t, 0.6, 0.16, { lp: 900, fto: 100 }); break;
      case 'revive':
        this.chord(t, [62, 66, 69, 74], 1.8, 0.05, 'triangle'); this.chord(t + 0.05, [74, 78, 81], 1.6, 0.03);
        this.o('sine', 2349, t + 0.2, 1.2, 0.06); this.kyuin(t + 0.4); break;
      case 'align':
        this.boom(t, 0.5);
        for (const [i, m] of [84, 88, 91, 96].entries()) this.o('sine', mtof(m), t + i * 0.05, 1.0, 0.07); break;
      case 'fanfare': {
        const br = (m, at, d, v) => { this.o('sawtooth', mtof(m), t + at, d, v || 0.07, { lp: 3200, a: 0.01 }); this.o('square', mtof(m + 12), t + at, d * 0.8, 0.022, { lp: 4200 }); };
        [[62, 0, 0.16], [62, 0.17, 0.08], [62, 0.26, 0.08], [66, 0.35, 0.16], [69, 0.52, 0.16], [74, 0.69, 0.55]].forEach(([m, a, d]) => br(m, a, d + 0.1));
        [[69, 1.1, 0.12], [71, 1.23, 0.12], [73, 1.36, 0.12], [74, 1.5, 1.6]].forEach(([m, a, d]) => br(m, a, d, 0.08));
        this.chord(t + 1.5, [50, 57, 62, 66, 69, 74, 78], 2.3, 0.045);
        for (let i = 0; i < 10; i++) this.o('sine', 98, t + 0.95 + i * 0.05, 0.25, 0.1 + i * 0.02, { to: 70 });
        this.boom(t + 1.5, 0.8); this.n(t + 1.5, 1.6, 0.12, { hp: 5000, a: 0.02 });
        break;
      }
      case 'round': this.o('sine', 1760, t, 0.3, 0.09); this.o('sine', 2637, t + 0.08, 0.35, 0.07); break;
      case 'rushIn':
        this.boom(t, 1); this.kyuin(t + 0.05);
        this.o('sine', 55, t, 2.5, 0.35, { to: 50 }); this.n(t, 1.8, 0.14, { bp: 300, q: 0.7, a: 0.01 });
        this.chord(t + 0.3, [50, 57, 62, 66, 69, 74, 78], 3.0, 0.05);
        [74, 78, 81, 86, 90, 93, 98].forEach((m, i) => this.o('square', mtof(m), t + 0.3 + i * 0.07, 0.5, 0.04, { lp: 5000 }));
        this.kyuin(t + 1.0);
        break;
      case 'premium':
        this.boom(t, 1); this.o('sine', 49, t, 3.0, 0.4, { to: 45 }); this.n(t, 2.4, 0.16, { bp: 260, q: 0.6, a: 0.01 });
        this.kyuin(t + 0.1); this.kyuin(t + 0.55); this.kyuin(t + 1.0);
        this.chord(t + 0.2, [50, 57, 62, 66, 69, 74, 78, 81], 3.4, 0.045);
        for (let i = 0; i < 16; i++) this.o('square', mtof([74, 78, 81, 86][i % 4] + Math.floor(i / 4) * 12 - 12), t + 0.2 + i * 0.06, 0.25, 0.035, { lp: 6000 });
        break;
      case 'sakibare':
        this.o('sawtooth', 160, t, 0.6, 0.16, { to: 3200, tt: 0.55, lp: 6000 });
        this.o('square', 320, t, 0.6, 0.06, { to: 6400, tt: 0.55, lp: 7000 });
        this.boom(t + 0.5, 1); this.o('sine', 55, t + 0.5, 2.5, 0.35, { to: 50 }); this.n(t + 0.5, 2, 0.15, { bp: 280, q: 0.6, a: 0.01 });
        this.kyuin(t + 0.6); this.kyuin(t + 1.0); this.kyuin(t + 1.4);
        this.chord(t + 0.6, [62, 66, 69, 74, 78, 81, 86], 2.8, 0.05);
        break;
      case 'handDrop':
        this.o('sawtooth', 300, t, 0.3, 0.08, { to: 60, lp: 1500 });
        this.boom(t + 0.28, 1); this.boom(t + 0.36, 0.7); this.n(t + 0.28, 1.0, 0.35, { lp: 400, fto: 80 });
        this.o('sawtooth', 70, t + 0.3, 1.2, 0.18, { to: 45, lp: 400 });
        this.o('square', 1800, t + 0.3, 0.6, 0.04, { lp: 5000 }); this.o('square', 2390, t + 0.3, 0.7, 0.03, { lp: 6000 });
        this.kyuin(t + 0.5);
        break;
      case 'nyokki':
        this.o('sawtooth', 120, t, 0.55, 0.1, { to: 900, lp: 2500 }); this.n(t, 0.5, 0.12, { hp: 800, fto: 6000, a: 0.2 }); this.n(t + 0.5, 0.06, 0.25, { bp: 1500 });
        break;
      case 'nyoCol': {
        const r = arg || 0, base = [69, 72, 74, 76, 79, 81][clamp(r, 0, 5)];
        [0, 4, 7, 12].forEach((d, i) => this.o('sine', mtof(base + d), t + i * 0.05, 0.6 + r * 0.15, 0.06 + r * 0.01));
        if (r >= 3) { this.boom(t, 0.5 + r * 0.1); this.kyuin(t + 0.05); }
        if (r >= 4) this.chord(t + 0.1, [base - 12, base - 5, base], 1.8, 0.05);
        if (r >= 5) this.play('sakibare');
        break;
      }
      case 'roulTick': this.o('square', 1400, t, 0.03, 0.04, { lp: 5000 }); break;
      case 'roulStart': this.n(t, 0.4, 0.15, { hp: 600, fto: 6000 }); this.chord(t, [62, 66, 69], 0.5, 0.04, 'square'); break;
      case 'roulDecide': this.boom(t, 0.8); this.chord(t, [62, 66, 69, 74], 1.2, 0.05); this.o('sine', 2349, t, 0.8, 0.06); break;
      case 'loopAdd':
        this.kyuin(t); for (let i = 0; i < 24; i++) this.n(t + 0.2 + i * 0.03, 0.03, 0.05, { hp: 5000 });
        this.chord(t + 0.2, [74, 78, 81, 86], 1.6, 0.05, 'square'); this.boom(t + 0.2, 0.7);
        break;
      case 'kyuin': this.kyuin(t); break;
      case 'gekiatsu': this.kyuin(t); this.boom(t + 0.05, 0.7); this.chord(t + 0.1, [50, 53, 57, 62], 1.2, 0.05); break;
      case 'hold': [1760, 2349, 2794, 3520].forEach((f, i) => this.o('sine', f, t + i * 0.05, 0.18, 0.07)); break;
      case 'holdBig': this.kyuin(t); [1760, 2349, 2794, 3520].forEach((f, i) => this.o('sine', f, t + i * 0.05, 0.25, 0.08)); break;
      case 'step': {
        const f = [392, 440, 523, 659, 784, 988][clamp(arg || 0, 0, 5)];
        this.o('square', f, t, 0.18, 0.07, { lp: 3000 }); this.o('square', f * 1.5, t + 0.02, 0.16, 0.04, { lp: 3000 });
        this.boom(t, 0.3 + (arg || 0) * 0.06); break;
      }
      case 'pseudo': this.n(t, 0.35, 0.15, { hp: 1500, fto: 7000 }); this.chord(t + 0.05, [69, 74, 78], 0.6, 0.05, 'square'); this.boom(t, 0.35); break;
      case 'swarm': this.n(t, 1.1, 0.12, { bp: 900, fto: 2500, q: 0.6, a: 0.25 }); break;
      case 'dialog': this.o('square', 880, t, 0.05, 0.03); this.o('square', 1320, t + 0.06, 0.05, 0.03); break;
      case 'cutin': this.n(t, 0.25, 0.2, { hp: 1200, fto: 8000 }); this.boom(t + 0.18, 0.45); this.chord(t + 0.18, [62, 65, 69], 0.6, 0.05, 'square'); break;
      case 'btnShow': this.o('square', 1200, t, 0.08, 0.05); this.o('square', 1600, t + 0.09, 0.1, 0.05); break;
      case 'btn': this.boom(t, 0.8); this.n(t, 0.3, 0.25, { hp: 1500 }); break;
      case 'rapid': this.o('square', rand(900, 1300), t, 0.05, 0.05); break;
      case 'gimmick':
        this.n(t, 0.25, 0.3, { lp: 500 }); this.o('square', 70, t, 0.3, 0.12, { lp: 300 });
        for (let i = 0; i < 4; i++) this.n(t + 0.25 + i * 0.07, 0.06, 0.12 - i * 0.02, { bp: 900 });
        this.kyuin(t + 0.2); break;
      case 'warn': for (let i = 0; i < 3; i++) this.o('square', 1046, t + i * 0.16, 0.1, 0.05, { lp: 3000 }); break;
      case 'lend': this.o('sine', 2093, t, 0.12, 0.08); this.play('pay', 10); break;
      case 'blackout': this.o('sawtooth', 80, t, 0.8, 0.12, { to: 40, lp: 300 }); break;
      case 'zen': for (let i = 0; i < 12; i++) this.o('square', mtof(74 + (i % 6) * 2), t + i * 0.06, 0.08, 0.04, { lp: 4000 }); this.kyuin(t + 0.7); break;
      case 'stage': this.n(t, 0.5, 0.1, { bp: 600, fto: 2400 }); break;
      case 'end': this.chord(t, [50, 57, 62, 65], 2.5, 0.04, 'triangle'); break;
      case 'lever': this.n(t, 0.06, 0.25, { lp: 900 }); this.o('square', 140, t, 0.08, 0.1, { lp: 600 }); this.o('sine', 700, t + 0.05, 0.25, 0.06, { to: 300 }); break;
      case 'leverShow': this.o('sawtooth', 300, t, 0.5, 0.1, { to: 1800, lp: 4000 }); this.o('square', 600, t, 0.45, 0.04, { to: 3600, lp: 5000 }); this.boom(t + 0.4, 0.55); break;
      case 'rbFreeze': this.o('sawtooth', 260, t, 0.55, 0.14, { to: 28, lp: 1200, fto: 120 }); this.n(t, 0.2, 0.1, { lp: 500 }); break;
      case 'rbBreak':
        this.boom(t, 1); this.boom(t + 0.08, 0.8);
        for (let i = 0; i < 16; i++) this.n(t + i * 0.025 + rand(0, 0.02), 0.08, 0.2, { hp: 3000 + rand(0, 5000) });
        this.kyuin(t + 0.15); this.kyuin(t + 0.95);
        this.chord(t + 0.2, [62, 66, 69, 74, 78, 81, 86], 3, 0.045);
        [86, 90, 93, 98].forEach((m, i) => this.o('sine', mtof(m), t + 0.3 + i * 0.09, 1.6, 0.06));
        break;
      case 'rbSlash': this.n(t, 0.6, 0.4, { hp: 400, fto: 9000 }); this.boom(t + 0.05, 0.9); this.chord(t + 0.05, [74, 78, 81, 86], 1.6, 0.05, 'square'); break;
    }
  },
  bgm(name) {
    if (!this.ok) { this.song = name; return; }
    if (this.song === name) return;
    this.song = name; this.step = 0; this.next = this.ctx.currentTime + 0.08;
  },
  tick() {
    if (!this.ok || !this.song || S.set.bgm <= 0.001) return;
    const sg = SONGS[this.song]; if (!sg) return;
    const c = this.ctx, sd = 60 / sg.bpm / 4, L = 32, B = this.bgmG;
    if (this.next < c.currentTime - 0.25) this.next = c.currentTime + 0.05;
    while (this.next < c.currentTime + 0.14) {
      const i = this.step % L, t = this.next;
      if (sg.k[i] === 'x') this.o('sine', 150, t, 0.24, 0.5, { to: 45, tt: 0.12, bus: B });
      if (sg.s && sg.s[i] === 'x') { this.n(t, 0.14, 0.2, { bp: 1800, q: 0.8, bus: B }); this.o('triangle', 190, t, 0.1, 0.1, { bus: B }); }
      if (sg.h && sg.h[i] === 'x') this.n(t, 0.035, 0.05, { hp: 7000, bus: B });
      if (sg.t && sg.t[i] === 'x') { this.o('sine', 118, t, 0.42, 0.42, { to: 52, tt: 0.26, bus: B }); this.n(t, 0.08, 0.12, { lp: 500, bus: B }); }
      if (sg.bass && sg.bass[i]) this.o('sawtooth', mtof(sg.bass[i]), t, sd * (sg.bassLen || 1.8), 0.15, { lp: 520, bus: B, a: 0.01 });
      if (sg.lead && sg.lead[i]) {
        const f = mtof(sg.lead[i]);
        this.o('square', f, t, sd * 1.9, 0.055, { lp: 2600, bus: B, a: 0.01 });
        this.o('sawtooth', f, t, sd * 1.9, 0.035, { det: 9, lp: 2200, bus: B, a: 0.01 });
      }
      if (sg.arp && sg.arp[i]) this.o('square', mtof(sg.arp[i]), t, sd * 0.9, 0.022, { lp: 3800, bus: B });
      if (sg.ch && sg.ch[i]) for (const m of sg.ch[i]) this.o('sawtooth', mtof(m), t, sd * 3, 0.026, { lp: 2400, bus: B, a: 0.005, det: rand(-7, 7) });
      if (sg.pl && sg.pl[i]) {
        const f = mtof(sg.pl[i]);
        this.o('sawtooth', f, t, 0.7, 0.1, { lp: 3200, fto: 280, bus: B });
        this.o('triangle', f * 2, t, 0.35, 0.03, { bus: B });
      }
      this.step++; this.next += sd;
    }
  }
};

/* ==========================================================
   ゲーム状態
   ========================================================== */
const BOARD = PHYS.build();
const WORLD = new PHYS.World(BOARD);
const LW = PHYS.LCD.w, LH = PHYS.LCD.h;
const HERO_X = 92, HERO_Y = 238, FOE_X = 252, FOE_Y = 240;
const STAGES = ['night', 'bamboo', 'shrine'];
const ENEMY = {
  tengu: { name: '天狗', sub: '烏天狗・疾風', col: '#ffab3d', bg: 'tengu', scale: 1.0 },
  orochi: { name: '大蛇', sub: '八つ首の大蛇', col: '#3fe0b0', bg: 'orochi', scale: 1.05 },
  kyubi: { name: '九尾', sub: '九尾の妖狐', col: '#7ab6ff', bg: 'kyubi', scale: 1.05 },
  shuten: { name: '酒呑童子', sub: '百鬼の総大将', col: '#ff3b2f', bg: 'shuten', scale: 1.22 }
};
const DEF_SET = {
  master: 0.8, bgm: 0.55, sfx: 0.85, nail: true, autoBtn: false, fast: false, autoLend: true,
  autoHandle: true, zoom: true, vib: true, swapAB: false, swapXY: false, lite: false, sv: 2, fastBonus: true
};
const S = {
  balls: 0, invest: 0, power: SPEC.presetL, auto: false, holding: false, padHold: false, fireT: 0,
  mode: 'normal', modeCnt: 0, hold1: [], hold2: [], cur: null, gap: 0.6, bonus: null,
  futo: { hold: 0, st: 'idle', t: 0, dur: 0, seq: null, si: 0 },
  data: { spins: 0, total: 0, hits: 0, rushHits: 0, chain: 0, chainPay: 0, maxChain: 0, hist: [], graph: [] },
  set: Object.assign({}, DEF_SET),
  stage: 0, lampO: null, lampOT: 0, zoom: 0, zoomT: 0, rightNeed: false,
  warnCD: 0, warnShow: 0, warnWhich: 'right', started: false, tickCD: 0, rbT: 0, leftPow: SPEC.presetL, prevNeedR: null
};
const vibrate = ms => { try { if (S.set.vib && navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* 非対応端末 */ } };
const densapo = () => S.mode !== 'normal';
const stageBg = () => S.mode === 'st' ? 'rush' : S.mode === 'jitan' ? 'jitan' : STAGES[S.stage % STAGES.length];
function setLamp(m, d) { S.lampO = m; S.lampOT = d || 1.5; }

/* ---------- トゥイーン ---------- */
const TW = [];
function tween(o, to, dur, ease, delay) {
  const t = { o, to, dur: Math.max(0.001, dur), e: ease || E.outC, t: -(delay || 0), from: null };
  TW.push(t); return t;
}
function updTweens(dt) {
  for (let i = TW.length - 1; i >= 0; i--) {
    const w = TW[i]; w.t += dt;
    if (w.t < 0) continue;
    if (!w.from) { w.from = {}; for (const k in w.to) w.from[k] = w.o[k]; }
    const k = Math.min(1, w.t / w.dur), e = w.e(k);
    for (const p in w.to) w.o[p] = w.from[p] + (w.to[p] - w.from[p]) * e;
    if (k >= 1) TW.splice(i, 1);
  }
}
function killTweens(o) { for (let i = TW.length - 1; i >= 0; i--) if (TW[i].o === o) TW.splice(i, 1); }

/* ---------- 演出ディレクター(ジェネレーター駆動) ---------- */
const DIR = {
  gen: null, wait: 0, btn: false, until: null, done: null, time: 0,
  run(gen, done) { this.gen = gen; this.wait = 0; this.btn = false; this.until = null; this.done = done || null; this.time = 0; this.adv(); },
  adv() {
    while (this.gen) {
      let r;
      try { r = this.gen.next(); } catch (err) { console.error(err); r = { done: true }; }
      if (r.done) { const cb = this.done; this.gen = null; this.done = null; if (cb) cb(); return; }
      const v = r.value;
      if (typeof v === 'number') { this.wait += v; if (this.wait > 0) return; }
      else if (v && v.btn) { this.btn = true; Push.show(v.type || 'push', v.btn); return; }
      else if (v && v.until) { this.until = v.until; return; }
    }
  },
  update(dt) {
    if (!this.gen) return;
    this.time += dt;
    if (this.btn) { if (Push.done) { this.btn = false; Push.hide(); this.wait = 0; this.adv(); } return; }
    if (this.until) { if (this.until()) { this.until = null; this.adv(); } return; }
    this.wait -= dt;
    if (this.wait <= 0) this.adv();
  },
  get busy() { return !!this.gen; }
};

/* ---------- PUSHボタン ---------- */
const Push = {
  active: false, type: 'push', t: 0, max: 4, gauge: 0, done: false, doneT: 0, hit: 0,
  show(type, max) {
    this.active = true; this.type = type; this.t = 0; this.max = max; this.gauge = 0; this.done = false; this.doneT = 0;
    AU.play(type === 'lever' ? 'leverShow' : 'btnShow'); setLamp(type === 'sword' || type === 'lever' ? 'gold' : 'red', max + 0.5); UI.pushState(true, type);
  },
  press() {
    this.hit = 1;
    if (!this.active || this.done) { AU.play('rapid'); return; }
    if (this.type === 'lever') { AU.play('rapid'); return; }
    if (this.type === 'rapid') {
      this.gauge += 0.12; AU.play('rapid'); vibrate(10);
      if (this.gauge >= 1) this.finish();
    } else this.finish();
  },
  pull() {
    AU.play('lever');
    if (this.active && !this.done && this.type === 'lever') { this.finish(); vibrate([30, 30, 60]); }
  },
  finish() { if (this.done) return; this.done = true; this.gauge = 1; AU.play('btn'); vibrate(40); LCD.flash('#fff', 0.7); LCD.shake(10); },
  update(dt) {
    this.hit = Math.max(0, this.hit - dt * 4);
    if (!this.active) return;
    if (this.done) { this.doneT += dt; return; }
    this.t += dt;
    if (S.set.autoBtn) { if (this.type === 'rapid') this.gauge += dt * 0.9; else if (this.t > 0.7) this.finish(); }
    if (this.type === 'rapid') { this.gauge = Math.max(0, this.gauge - dt * 0.05); if (this.gauge >= 1) this.finish(); }
    if (this.t >= this.max) this.finish();
  },
  hide() { this.active = false; UI.pushState(false); }
};

/* ==========================================================
   抽選・保留
   ========================================================== */
function styleEntry(e, style) {
  e.style = style;
  if (style === 'normal') {
    e.cls = e.hit ? pickW({ SPSP: 58, SP: 21, N: 5, ZEN: 4, SUDDEN: 12 }) : pickW({ none: 894, N: 75, SP: 26, SPSP: 5 });
    if (e.hit) {
      e.icon = (e.cls === 'ZEN' || e.cls === 'SUDDEN') ? pickW({ white: 60, gold: 25, rainbow: 15 })
        : pickW({ white: 28, blue: 14, green: 14, red: 28, gold: 12, rainbow: 4 });
    } else {
      e.icon = e.cls === 'none' ? pickW({ white: 985, blue: 15 })
        : e.cls === 'N' ? pickW({ white: 85, blue: 12, green: 3 })
          : e.cls === 'SP' ? pickW({ white: 55, blue: 25, green: 14, red: 6 })
            : pickW({ white: 40, blue: 25, green: 20, red: 15 });
    }
  } else {
    e.cls = e.hit ? pickW({ SUDDEN: 40, RREACH: 60 }) : pickW({ none: 92, RREACH: 8 });
    e.icon = e.hit ? pickW({ white: 55, red: 25, gold: 15, rainbow: 5 }) : e.cls === 'RREACH' ? pickW({ white: 80, red: 20 }) : 'white';
  }
  // 虹の超激アツ(大当り+RUSH確定の当選からのみ選ばれるので突入率は変わらない)
  if (e.hit && e.after === 'st' && chance(style === 'normal' ? 0.1 : 0.06)) { e.cls = 'RAINBOW'; e.icon = 'white'; }
  e.shown = 'white';
  if (e.icon !== 'white' && chance(0.4)) e.shown = e.icon;
  else if (RANK[e.icon] >= 3 && chance(0.35)) e.shown = pick(['blue', 'green']);
}
function makeEntry(from) {
  const p = S.mode === 'st' ? SPEC.pST : SPEC.pNormal;
  const e = { from, hit: Math.random() < p, rounds: 0, after: null, challenge: false };
  if (e.hit) {
    if (from === 1) { e.rounds = SPEC.hesoR; e.after = chance(SPEC.rushRate1) ? 'st' : 'jitan'; e.challenge = true; }
    else { e.rounds = SPEC.rushR > 0 ? SPEC.rushR : (chance(SPEC.r10Rate2) ? 10 : 3); e.after = 'st'; }
  }
  styleEntry(e, densapo() ? 'rush' : 'normal');
  return e;
}
function onStartIn(from) {
  const h = from === 1 ? S.hold1 : S.hold2;
  if (h.length >= SPEC.holdMax) return;
  const e = makeEntry(from);
  h.push(e);
  LCD.holdPop(from, h.length - 1);
  // 虹の先バレ(RUSH確定)。前触れなく、入賞した瞬間に来る
  if (e.hit && e.after === 'st' && from === 1 && e.style === 'normal' && e.cls !== 'RAINBOW' && chance(0.12)) { sakibare(e); return; }
  if (e.shown !== 'white') AU.play(RANK[e.shown] >= 3 ? 'holdBig' : 'hold');
}
function sakibare(e) {
  e.icon = e.shown = 'rainbow'; e.saki = true;
  AU.play('sakibare'); S.rbT = 3; UI.rbShock(); Board.shake(16); LCD.shake(14); LCD.flash('#ffffff', 0.9);
  setLamp('rainbow', 6); fxSakibare(); vibrate([60, 40, 120]);
}
function preChange() {
  if (densapo()) return;
  for (const e of S.hold1) {
    if (RANK[e.shown] < RANK[e.icon] && chance(0.3)) {
      e.shown = RANK[e.icon] >= 3 && chance(0.5) ? pick(['green', e.icon]) : e.icon;
      if (RANK[e.shown] > RANK[e.icon]) e.shown = e.icon;
      LCD.holdChangeFx(S.hold1.indexOf(e));
      AU.play(RANK[e.shown] >= 3 ? 'holdBig' : 'hold');
      break;
    }
  }
}

/* ---------- 変動内容の決定 ---------- */
function buildVar(e) {
  const v = { e, hit: e.hit, cls: e.cls, style: e.style };
  const n = randi(1, 9);
  const reachCls = ['N', 'SP', 'SPSP', 'RREACH'].includes(e.cls);
  if (e.hit) { v.num = n; v.L = v.R = v.C = n; }
  else if (reachCls) { v.L = v.R = n; v.C = chance(0.7) ? ((n + (chance(0.5) ? 0 : 7)) % 9) + 1 : ((n + randi(1, 7)) % 9) + 1; }
  else { v.L = n; v.R = ((n + randi(0, 7)) % 9) + 1; v.C = randi(1, 9); }
  v.reach = reachCls;
  const remain = e.from === 1 ? S.hold1.length : S.hold2.length;
  if (e.style === 'rush') {
    v.base = e.cls === 'none' ? (remain >= 2 ? 0.75 : 1.15) : 0.8;
    if (e.cls === 'RREACH') {
      v.enemy = pick(['tengu', 'orochi', 'kyubi']);
      v.button = e.hit ? pickW({ none: 35, push: 35, sword: 15, lever: 15 }) : pickW({ none: 70, push: 30 });
      if (v.button === 'none') v.button = null;
    }
    return v;
  }
  const H = e.hit, C = e.cls, tier = H ? 'hit' : C;
  v.base = C === 'none' ? (remain >= 3 ? 2.6 : remain === 2 ? 5.2 : 8.0) : 4.0;
  if (C === 'SUDDEN' || C === 'ZEN' || C === 'RAINBOW') { v.pseudo = 0; return v; }
  const T = (tbl) => tbl[tier] || tbl.none;
  v.pseudo = +pickW(T({ hit: { 0: 30, 1: 25, 2: 25, 3: 20 }, none: { 0: 97, 1: 3 }, N: { 0: 70, 1: 25, 2: 5 }, SP: { 0: 40, 1: 35, 2: 20, 3: 5 }, SPSP: { 0: 30, 1: 30, 2: 28, 3: 12 } }));
  v.su = +pickW(T({ hit: { 0: 25, 2: 10, 3: 20, 4: 25, 5: 20 }, none: { 0: 97, 2: 3 }, N: { 0: 80, 2: 15, 3: 5 }, SP: { 0: 50, 2: 25, 3: 20, 4: 5 }, SPSP: { 0: 35, 2: 20, 3: 28, 4: 15, 5: 2 } }));
  v.swarm = chance(T({ hit: 0.32, none: 0.005, N: 0.04, SP: 0.12, SPSP: 0.25 })) ? (H && chance(0.6) ? 'sakura' : pick(['crow', 'sakura', 'crow'])) : null;
  v.dialog = pickW(T({ hit: { none: 30, blue: 15, green: 15, red: 30, gold: 10 }, none: { none: 1 }, N: { none: 88, blue: 12 }, SP: { none: 62, blue: 25, green: 10, red: 3 }, SPSP: { none: 40, blue: 25, green: 20, red: 15 } }));
  if (v.dialog === 'none') v.dialog = null;
  if (C === 'SP' || C === 'SPSP') {
    v.dev = chance(0.55);
    v.enemy = C === 'SP' ? (H ? pickW({ tengu: 40, orochi: 60 }) : pickW({ tengu: 70, orochi: 30 })) : (H ? pickW({ kyubi: 40, shuten: 60 }) : pickW({ kyubi: 75, shuten: 25 }));
    v.chain = C === 'SPSP' && chance(0.4);
    v.spEnemy = pick(['tengu', 'orochi']);
    v.cutin = pickW(H ? { none: 30, blue: 10, green: 15, red: 30, gold: 15 } : C === 'SPSP' ? { none: 45, blue: 25, green: 20, red: 10 } : { none: 70, blue: 20, green: 10 });
    if (v.cutin === 'none') v.cutin = null;
    v.gek = H ? (chance(0.38) ? (chance(0.22) ? 'gold' : 'red') : null) : (C === 'SPSP' && chance(0.07) ? 'red' : null);
    v.gim = H ? chance(0.35) : (C === 'SPSP' ? chance(0.08) : chance(0.02));
    v.button = H ? pickW({ push: 40, rapid: 20, sword: 20, lever: 20 }) : pickW({ push: 74, rapid: 22.65, sword: 3, lever: 0.35 });
    v.revival = H && chance(0.15);
    // 鬼の大手(激アツ役物)・斬鬼刀ニョッキ(色で信頼度)
    v.hand = H ? chance(0.3) : C === 'SPSP' ? chance(0.03) : chance(0.005);
    v.handAt = pick(['pre', 'reach', 'battle']);
    v.nyo = H ? chance(0.45) : chance(C === 'SPSP' ? 0.08 : 0.05);
    v.nyoCol = H ? pickW({ blue: 10, green: 15, red: 35, gold: 30, rainbow: 10 }) : pickW({ white: 35, blue: 35, green: 20, red: 10 });
    v.nyoAt = pick(['reach', 'final']);
  }
  return v;
}

/* ==========================================================
   変動シナリオ
   ========================================================== */
function resetScene() {
  const B = LCD.bt;
  killTweens(B.hero); killTweens(B.foe); killTweens(B); killTweens(LCD);
  B.on = false; B.aura = 0; LCD.dark = 0; LCD.desat = 0; LCD.black = 0;
  S.zoomT = 0;
  Reels.reachGlow = 0; Reels.win = 0; Reels.zen = false; Reels.rb = 0; Roul.on = false;
  LCD.rb.on = 0; LCD.freeze = 0; AU.duck(1);
  if (Reels.mini > 0.01) Reels.toBig();
}
function setupBattle(en) {
  const D = ENEMY[en], B = LCD.bt;
  killTweens(B.hero); killTweens(B.foe);
  B.on = true; B.enemy = en; B.aura = 0;
  Object.assign(B.hero, { x: -60, y: HERO_Y, rot: 0, a: 1, pose: 'ready' });
  Object.assign(B.foe, { x: LW + 130, y: FOE_Y, a: 0, hurt: 0, split: 0, s: D.scale, lunge: 0 });
  tween(B.foe, { x: FOE_X, a: 1 }, 0.8, E.outC);
  tween(B.hero, { x: HERO_X }, 0.6, E.outC, 0.25);
}
function* sNormal(v) {
  resetScene();
  LCD.setBg(stageBg());
  Reels.spinAll(24); AU.play('spin');
  const t0 = DIR.time;
  if (RANK[v.e.shown] < RANK[v.e.icon]) {
    yield 0.35;
    v.e.shown = v.e.icon; LCD.holdChangeFx(-1);
    AU.play(RANK[v.e.icon] >= 3 ? 'holdBig' : 'hold'); LCD.shake(4);
    yield 0.6;
  }
  if (v.cls === 'RAINBOW') { yield* sRainbow(v); return; }
  if (v.cls === 'SUDDEN') { yield* sSudden(v); return; }
  if (v.cls === 'ZEN') { yield* sZen(v); return; }
  for (let i = 0; i < v.pseudo; i++) {
    yield 1.05;
    const a = randi(1, 9), b = ((a + randi(0, 7)) % 9) + 1;
    Reels.stop(0, a, 0.3); yield 0.25;
    Reels.stop(2, b, 0.3); yield 0.25;
    Reels.stop(1, 1, 0.38, '続'); yield 0.62;
    AU.play('pseudo'); LCD.flash('#ffffff', 0.55); LCD.shake(7); setLamp('chance', 0.9);
    fxBand('擬似連', { col: ['blue', 'green', 'red'][Math.min(i, 2)], life: 1.0 });
    fxStamp('×' + (i + 2), { size: 70, col: ['blue', 'green', 'red'][Math.min(i, 2)], y: LH * 0.52, life: 0.9 });
    yield 0.8;
    Reels.spinAll(26); AU.play('spin');
  }
  if (v.su) yield* stepUp(v.su, v.hit);
  if (v.swarm) { fxSwarm(v.swarm); AU.play('swarm'); setLamp('chance', 1.2); yield 1.5; }
  if (v.dialog) { fxDialog(v.dialog); AU.play('dialog'); yield 1.7; }
  if (v.hand && v.handAt === 'pre') yield* handDrop();
  const el = DIR.time - t0;
  if (el < v.base) yield v.base - el;
  Reels.stop(0, v.L); yield 0.55;
  Reels.stop(2, v.R); yield 0.45;
  if (!v.reach) { Reels.stop(1, v.C); yield 0.55; return; }
  yield* sReach(v);
}
function* stepUp(lv, hit) {
  const cols = ['white', 'blue', 'green', 'red', 'red'];
  for (let i = 1; i <= lv; i++) {
    const c = i === 5 ? (hit && chance(0.45) ? 'gold' : 'red') : cols[i - 1];
    fxStepPanel(i, c); AU.play('step', i); LCD.shake(2 + i * 1.6); setLamp(i >= 4 ? 'red' : 'chance', 0.7);
    yield i === lv ? 1.05 : 0.62;
  }
}
function* sReach(v) {
  AU.play('reach'); fxReach(); setLamp('chance', 2.5); Reels.reachGlow = 1; LCD.shake(6);
  yield 0.9;
  if (v.hand && v.handAt === 'reach') yield* handDrop();
  if (v.nyo && v.nyoAt === 'reach') yield* nyokki(v.nyoCol);
  if (v.cls === 'N' || v.dev) {
    LCD.setBg('reachN'); AU.duck(0.45);
    Reels.slowTo(1, 7); yield 1.2;
    if (v.cls === 'N') {
      Reels.slowTo(1, 3.2); yield 1.4;
      Reels.slowTo(1, 1.5); yield 1.0;
      Reels.stop(1, v.C, 0.9); yield 1.1;
      AU.duck(1);
      if (v.hit) yield* alignWin(v);
      return;
    }
    Reels.slowTo(1, 3.6); yield 1.0;
  }
  yield* develop(v);
  yield* sBattle(v);
}
function* develop(v) {
  AU.duck(1);
  AU.play('develop'); LCD.flash('#ffffff', 0.8); fxInk(); LCD.shake(10);
  setLamp(v.cls === 'SPSP' ? 'red' : 'chance', 2);
  fxStamp('発展', { size: 72, col: v.cls === 'SPSP' ? 'red' : 'gold', life: 1.0 });
  Reels.toMini(); Reels.slowTo(1, 14);
  yield 1.1;
}
function* battleIntro(en, boss) {
  AU.bgm(boss ? 'boss' : 'battle');
  fxInk(); AU.play('develop');
  yield 0.35;
  LCD.setBg(ENEMY[en].bg);
  setupBattle(en);
  yield 0.75;
  AU.play('boom', 0.7); LCD.shake(12);
  fxEnemyName(en);
  yield 1.7;
  fxBand(boss ? '鬼神決戦' : '百鬼迎撃', { col: boss ? 'red' : 'gold' });
  yield 0.9;
}
function* exchange(en, i) {
  const D = ENEMY[en], B = LCD.bt;
  tween(B.foe, { x: FOE_X - 58, lunge: 1 }, 0.22, E.inQ);
  yield 0.2;
  AU.play('enemyAtk'); LCD.flash(D.col, 0.45); LCD.shake(11); fxClaw(D.col);
  tween(B.hero, { y: HERO_Y - 36 }, 0.14, E.outQ);
  tween(B.hero, { y: HERO_Y }, 0.28, E.inQ, 0.16);
  yield 0.45;
  tween(B.foe, { x: FOE_X, lunge: 0 }, 0.4, E.outC);
  yield 0.3;
  B.hero.pose = 'slash';
  tween(B.hero, { x: FOE_X - 34 }, 0.12, E.inQ);
  yield 0.12;
  AU.play('slash'); fxSlash(FOE_X - 70, FOE_Y - 120, FOE_X + 50, FOE_Y - 20, '#ffffff', 5);
  B.foe.hurt = 1; fxSparks(FOE_X, FOE_Y - 60, 18, '#ffffff'); LCD.shake(7);
  fxStamp('斬閃穿裂'[i % 4], { size: 46, col: 'white', x: rand(LW * 0.6, LW * 0.82), y: rand(52, 88), life: 0.8 });
  yield 0.35;
  B.hero.pose = 'ready';
  tween(B.hero, { x: HERO_X }, 0.35, E.outC);
  yield 0.5;
}
function* sBattle(v) {
  const boss = v.cls === 'SPSP';
  if (S.set.zoom) S.zoomT = 1;
  if (v.chain) {
    yield* battleIntro(v.spEnemy, false);
    yield* exchange(v.spEnemy, 0);
    LCD.shake(16); AU.play('boom', 0.9); LCD.flash('#ff2a1a', 0.7); setLamp('red', 2);
    fxStamp('乱入', { size: 84, col: 'red', life: 1.2 });
    tween(LCD.bt.foe, { a: 0, x: LW + 120 }, 0.4, E.inQ);
    yield 1.3;
  }
  yield* battleIntro(v.enemy, boss);
  const n = boss ? 3 : 2;
  for (let i = 0; i < n; i++) yield* exchange(v.enemy, i);
  if (v.gim) { Gimmick.drop(); AU.play('gimmick'); setLamp('gold', 2.5); LCD.shake(14); yield 2.0; }
  if (v.gek) { fxGekiatsu(v.gek); AU.play('gekiatsu'); setLamp(v.gek === 'gold' ? 'gold' : 'red', 2); yield 1.7; }
  if (v.cutin) { fxCutin(v.cutin); AU.play('cutin'); yield 1.4; }
  if (v.hand && v.handAt === 'battle') yield* handDrop();
  if (v.nyo && v.nyoAt === 'final') yield* nyokki(v.nyoCol);
  yield* finale(v.button);
  yield* clash();
  if (v.hit && !v.revival) yield* winSeq(v);
  else {
    yield* loseSeq();
    if (v.hit) { yield* reviveSeq(); yield* winSeq(v); }
    else yield* missEnd(v);
  }
  S.zoomT = 0;
}
function* handDrop(col) {
  Hand.drop(col || 'red'); AU.play('handDrop');
  yield 0.3;
  Board.shake(20); LCD.shake(18); LCD.flash(col === 'rainbow' ? '#ffffff' : '#ff2a1a', 0.6);
  setLamp(col === 'rainbow' ? 'rainbow' : 'red', 2.5); vibrate([80, 30, 80]);
  fxStamp('激アツ', { size: 70, col: col === 'rainbow' ? 'rainbow' : 'red', y: LH * 0.8, life: 1.4 });
  yield 1.9;
}
function* nyokki(col) {
  Nyo.start(col); AU.play('nyokki');
  yield 0.7;
  const r = RANK[col];
  AU.play('nyoCol', r); LCD.shake(4 + r * 3); Board.shake(r >= 3 ? 10 : 3);
  setLamp(col === 'rainbow' ? 'rainbow' : r >= 4 ? 'gold' : r >= 3 ? 'red' : 'chance', 1.6);
  if (col === 'rainbow') { S.rbT = 2.5; UI.rbShock(); }
  yield 1.5;
}
function* finale(btn) {
  const B = LCD.bt;
  fxBand('決着', { col: 'red', big: true }); AU.play('charge'); AU.duck(0.35);
  tween(B, { aura: 1 }, 1.2); tween(LCD, { dark: 0.45 }, 0.8);
  yield 1.4;
  if (btn) yield { btn: btn === 'rapid' ? 4.5 : 4, type: btn };
  else yield 0.5;
}
// ボタン(レバー)を押した瞬間の一撃。ここで勝敗が決まる
function* clash() {
  const B = LCD.bt;
  killTweens(B.hero); killTweens(B.foe); killTweens(B); killTweens(LCD);
  B.aura = 0; LCD.dark = 0; AU.duck(0.05);
  B.hero.x = FOE_X + 26; B.hero.y = HERO_Y; B.hero.rot = 0; B.hero.a = 1; B.hero.pose = 'slash';
  LCD.flash('#ffffff', 1); AU.play('clash'); LCD.shake(20); fxShock(LW / 2, LH * 0.55, '#ffffff');
  fxSlash(HERO_X - 20, FOE_Y - 20, FOE_X + 70, FOE_Y - 130, '#ffffff', 8);
  vibrate(60);
  yield 0.18;
}
function* winSeq(v) {
  const B = LCD.bt, col = ENEMY[B.enemy].col;
  AU.play('kill'); AU.duck(1); tween(B.foe, { split: 1 }, 0.7, E.outC); fxSplat(B.foe.x, B.foe.y - 70, col);
  LCD.flash(col, 0.4); LCD.shake(12); setLamp('rainbow', 3); vibrate(80);
  fxStamp('斬', { size: 124, col: 'gold', life: 1.1 });
  Reels.toBig(); Reels.stop(1, v.num, 0.32);
  yield 0.8;
  B.on = false; LCD.setBg('win');
  yield* alignWin(v);
}
function* loseSeq() {
  const B = LCD.bt;
  AU.play('lose');
  tween(B.hero, { rot: -1.25, y: HERO_Y + 8, a: 0.75 }, 0.35, E.outC);
  LCD.shake(10); fxCrack(); tween(LCD, { desat: 1 }, 0.3);
  fxStamp('敗', { size: 100, col: 'gray', life: 1.2 });
  yield 1.1;
}
function* reviveSeq() {
  const B = LCD.bt;
  yield 0.3;
  fxText('……まだだ', { size: 26, y: LH * 0.72, life: 0.9 });
  yield 0.8;
  AU.play('revive'); LCD.flash('#ffe28a', 0.9); setLamp('rainbow', 4);
  killTweens(LCD); LCD.desat = 0;
  tween(B.hero, { rot: 0, y: HERO_Y, a: 1 }, 0.3, E.outB);
  fxStamp('復活', { size: 86, col: 'rainbow', life: 1.2 }); fxShock(B.hero.x, B.hero.y - 50, '#ffe28a');
  yield 1.0;
  yield* clash();
}
function* missEnd(v) {
  const B = LCD.bt;
  B.on = false; killTweens(LCD); LCD.desat = 0; LCD.dark = 0; AU.duck(1); AU.bgm('normal');
  LCD.setBg(stageBg()); Reels.toBig(); yield 0.35;
  Reels.stop(1, v.C, 0.5); yield 0.8;
}
function* alignWin(v) {
  setLamp('rainbow', 4);
  LCD.flash('#ffffff', 1); LCD.shake(14); vibrate(120);
  AU.play('align'); Reels.win = 1;
  yield 0.35;
  AU.play('fanfare'); AU.bgm(null); AU.duck(1);
  fxStamp('大当り', { size: 76, col: 'gold', life: 2.6, y: LH * 0.24 });
  fxShock(LW / 2, LH / 2, '#ffd36b'); fxSparks(LW / 2, LH * 0.5, 44, '#ffe08a');
  yield 2.4;
}
// 虹の超激アツ「百鬼覚醒」(大当り+RUSH確定)
function* sRainbow(v) {
  yield rand(1.3, 2.4);
  Reels.stop(0, ((v.num + randi(1, 7)) % 9) + 1, 0.3);
  yield 0.45;
  AU.bgm(null); AU.play('rbFreeze'); AU.duck(0);
  Reels.freeze(); LCD.freeze = 1; tween(LCD, { dark: 0.6 }, 0.1);
  yield 0.9;
  killTweens(LCD); LCD.freeze = 0; LCD.dark = 0;
  AU.duck(1); AU.play('rbBreak'); vibrate([90, 40, 200]);
  LCD.flash('#ffffff', 1); LCD.shake(26); fxShatter(); setLamp('rainbow', 14); S.rbT = 3.5; UI.rbShock();
  LCD.setBg('rainbow'); LCD.prev = null; LCD.bgK = 1;
  Reels.toMini();
  fxStamp('虹', { size: 150, col: 'rainbow', life: 1.7 });
  yield 1.6;
  LCD.rb.on = 1; LCD.rb.cut = 0; AU.bgm('rainbow');
  fxBand('百鬼覚醒', { col: 'gold', big: true, life: 1.9 });
  yield 2.1;
  AU.play('rbSlash'); LCD.flash('#ffffff', 1); LCD.shake(22); fxRbSlash(); vibrate(120);
  tween(LCD.rb, { cut: 1 }, 1.0, E.outC);
  fxStamp('一閃', { size: 92, col: 'rainbow', life: 1.3, y: LH * 0.3 });
  yield 1.3;
  LCD.rb.on = 0; Reels.toBig(); Reels.rb = 1;
  Reels.stop(0, v.num, 0.25); Reels.stop(2, v.num, 0.3); Reels.stop(1, v.num, 0.36);
  yield 0.5;
  yield* alignWin(v);
  fxBand('RUSH突入確定', { col: 'gold', big: true, life: 2.2, y: LH * 0.74 }); AU.play('rushIn');
  yield 2.0;
}
function* sSudden(v) {
  yield rand(1.2, 2.2);
  AU.bgm(null); AU.play('blackout'); tween(LCD, { black: 1 }, 0.25);
  yield 1.0;
  AU.play('kyuin'); killTweens(LCD); LCD.black = 0; LCD.flash('#ffffff', 1); setLamp('rainbow', 3); LCD.shake(16);
  fxStamp('一撃', { size: 98, col: 'rainbow', life: 1.4 });
  Reels.stop(0, v.num, 0.2); Reels.stop(2, v.num, 0.24); Reels.stop(1, v.num, 0.3);
  yield 1.2;
  yield* alignWin(v);
}
function* sZen(v) {
  yield 1.4;
  AU.play('zen'); LCD.flash('#ffd36b', 0.9); setLamp('gold', 6); LCD.setBg('zen');
  fxStamp('全回転', { size: 72, col: 'gold', life: 1.6 });
  Reels.zen = true; Reels.spinAll(4);
  yield 4.0;
  Reels.stop(0, v.num, 0.6); Reels.stop(1, v.num, 0.6); Reels.stop(2, v.num, 0.6);
  yield 0.8;
  Reels.zen = false;
  yield* alignWin(v);
}
function* sRush(v) {
  resetScene();
  LCD.setBg(stageBg());
  Reels.spinAll(30); AU.play('spin');
  if (v.cls === 'RAINBOW') { yield* sRainbow(v); return; }
  if (v.cls === 'none') {
    yield v.base;
    Reels.stop(0, v.L, 0.2); yield 0.1; Reels.stop(2, v.R, 0.2); yield 0.1; Reels.stop(1, v.C, 0.2); yield 0.3;
    return;
  }
  if (v.cls === 'SUDDEN') {
    yield 0.75;
    LCD.flash('#ffffff', 1); AU.play('kyuin'); setLamp('rainbow', 2.5); LCD.shake(14);
    fxStamp('撃破', { size: 98, col: 'gold', life: 1.3 });
    Reels.stop(0, v.num, 0.18); Reels.stop(2, v.num, 0.22); Reels.stop(1, v.num, 0.26);
    yield 1.0;
    yield* alignWin(v);
    return;
  }
  yield 0.55; Reels.stop(0, v.L, 0.22); yield 0.15; Reels.stop(2, v.R, 0.22); yield 0.25;
  AU.play('reach'); fxReach(); Reels.reachGlow = 1; setLamp('chance', 2);
  yield 0.5;
  Reels.toMini(); Reels.slowTo(1, 14); fxInk();
  LCD.setBg(ENEMY[v.enemy].bg); setupBattle(v.enemy);
  fxBand('瞬斬', { col: 'gold' }); AU.play('boom', 0.6);
  yield 1.0;
  yield* exchange(v.enemy, 0);
  if (v.button) { fxBand('決着', { col: 'red' }); yield { btn: 3.5, type: v.button }; }
  else yield 0.4;
  yield* clash();
  const B = LCD.bt;
  if (v.hit) {
    yield* winSeq(v);
  } else {
    AU.duck(1);
    tween(B.foe, { x: LW + 130, a: 0 }, 0.6, E.inQ);
    fxText('取り逃した…', { size: 24, y: LH * 0.7, life: 1.0 });
    yield 0.9;
    B.on = false; LCD.setBg(stageBg()); Reels.toBig(); yield 0.3;
    Reels.stop(1, v.C, 0.4); yield 0.5;
  }
}

/* ==========================================================
   変動の開始・終了
   ========================================================== */
function startVariation(e) {
  const style = densapo() ? 'rush' : 'normal';
  if (e.style !== style) styleEntry(e, style);
  if (densapo()) S.modeCnt = Math.max(0, S.modeCnt - 1);
  S.data.spins++; S.data.total++;
  if (style === 'normal' && S.data.total % 45 === 0) { S.stage = (S.stage + 1) % STAGES.length; fxInk(); AU.play('stage'); }
  preChange();
  const v = buildVar(e);
  S.cur = { e, v };
  DIR.run(style === 'normal' ? sNormal(v) : sRush(v), () => endVariation(v));
}
function endVariation(v) {
  S.cur = null;
  S.zoomT = 0;
  if (v.e.from === 1) S.lastSeg1 = v.hit ? String(v.num) : '-'; else S.lastSeg2 = v.hit ? String(v.num) : '-';
  S.gap = densapo() ? 0.2 : 0.45;
  Reels.lock();
  const g = S.data.graph;
  g.push([S.data.total, Math.round(S.balls - S.invest / 4)]);
  if (g.length > 1600) S.data.graph = g.filter((_, i) => i % 2 === 0);
  if (v.hit) { startBonus(v.e); return; }
  if (densapo() && S.modeCnt <= 0) endMode();
}
function tryStart(dt) {
  if (S.cur || S.bonus || DIR.busy) return;
  if (S.gap > 0) { S.gap -= dt; return; }
  const e = S.hold2.length ? S.hold2.shift() : S.hold1.length ? S.hold1.shift() : null;
  if (e) startVariation(e);
}
function endMode() {
  const prev = S.mode, chain = S.data.chain, pay = S.data.chainPay;
  S.mode = 'normal'; S.modeCnt = 0; S.rightNeed = false;
  S.data.chain = 0; S.data.chainPay = 0;
  DIR.run(sModeEnd(prev, chain, pay), null);
}
function* sModeEnd(prev, chain, pay) {
  resetScene(); LCD.setBg('end'); AU.bgm(null); AU.play('end');
  fxBand(prev === 'st' ? 'RUSH終了' : '時短終了', { col: prev === 'st' ? 'gold' : 'blue', big: true, life: 3.4 });
  if (prev === 'st') fxText(chain + '連  総獲得 ' + fmt(pay) + '個', { size: 26, y: LH * 0.64, life: 3.2 });
  else fxText('左打ちに戻してください', { size: 22, y: LH * 0.64, life: 3.2 });
  yield 3.4;
  LCD.setBg(stageBg()); AU.bgm('normal');
}

/* ==========================================================
   大当たり(ラウンド)
   ========================================================== */
function startBonus(e) {
  const b = S.bonus = { e, rounds: e.rounds, round: 0, count: 0, t: 0, phase: 'intro', pay: 0, after: e.after, challenge: e.challenge };
  const d = S.data;
  d.hits++;
  if (!e.challenge) d.rushHits++;
  d.hist.unshift({ spins: d.spins, r: e.rounds, kind: e.challenge ? 'ヘソ' : '電チュー', mode: S.mode, time: Date.now() });
  if (d.hist.length > 60) d.hist.length = 60;
  d.spins = 0;
  S.rightNeed = true;
  DIR.run(sBonusIntro(b), () => { b.phase = 'open'; b.round = 1; b.t = 0; b.count = 0; AU.play('round'); });
}
function* sBonusIntro(b) {
  resetScene();
  Reels.win = 1; Reels.toMini();
  LCD.setBg(b.challenge ? 'challenge' : 'bonus'); AU.bgm('bonus');
  fxBand(b.challenge ? 'RUSH突入チャレンジ' : b.rounds + 'R BONUS', { col: 'gold', big: true, life: 2.2 });
  AU.play('round');
  yield 1.2;
  fxStamp('右打ち', { size: 64, col: 'red', life: 1.4 }); AU.play('warn');
  yield 1.4;
}
function updateBonus(dt) {
  const b = S.bonus;
  if (!b) return;
  if (b.phase === 'open') {
    b.t += dt;
    if (b.count >= SPEC.atkMax || b.t >= SPEC.roundTime) { b.phase = b.round >= b.rounds ? 'tail' : 'interval'; b.t = 0; }
  } else if (b.phase === 'interval') {
    b.t += dt;
    if (b.t >= (S.set.fastBonus ? 0.5 : SPEC.interval)) { b.round++; b.count = 0; b.t = 0; b.phase = 'open'; AU.play('round'); }
  } else if (b.phase === 'tail') {
    b.t += dt;
    if (b.t >= 1.4) { b.phase = 'ending'; DIR.run(sBonusEnd(b), () => finishBonus(b)); }
  }
}
const ROUL_TXT = { tengu: '天狗 ── 突破期待度 ★★★★', orochi: '大蛇 ── 突破期待度 ★★★', kyubi: '九尾 ── 突破期待度 ★★', shuten: '酒呑童子 ── 突破期待度 ★' };
function* sBonusEnd(b) {
  if (b.challenge && !b.chDone) {
    b.chDone = true;
    const ok = b.after === 'st', B = LCD.bt;
    resetScene(); Reels.toMini();
    AU.bgm('boss'); LCD.setBg('challenge');
    if (S.set.zoom) S.zoomT = 1;
    fxBand('RUSH突入をかけた最終決戦', { col: 'red', big: true, life: 1.6 }); AU.play('boom', 0.8); LCD.shake(12);
    yield 1.6;
    // 敵選択ルーレット(弱い敵ほど突破期待度が高い)
    const en = pickW(ok ? { tengu: 40, orochi: 30, kyubi: 20, shuten: 10 } : { tengu: 10, orochi: 20, kyubi: 30, shuten: 40 });
    Roul.start(); AU.play('roulStart');
    yield { btn: 6, type: 'push' };
    Roul.stopAt(en);
    yield { until: () => Roul.done };
    AU.play('roulDecide'); LCD.flash(ENEMY[en].col, 0.6); LCD.shake(10);
    fxText(ROUL_TXT[en], { size: 18, y: LH * 0.88, life: 1.5, col: '#ffe6a8' });
    yield 1.6;
    Roul.on = false;
    LCD.setBg(ENEMY[en].bg); setupBattle(en);
    yield 0.9;
    fxEnemyName(en); AU.play('boom', 0.7);
    yield 1.4;
    yield* exchange(en, 1);
    yield* finale(ok ? pickW({ push: 45, sword: 25, rapid: 10, lever: 20 }) : pickW({ push: 79, rapid: 20, lever: 1 }));
    yield* clash();
    if (ok) {
      AU.duck(1); AU.play('kill'); tween(B.foe, { split: 1 }, 1.0, E.outC); fxSplat(B.foe.x, B.foe.y - 70, ENEMY[en].col);
      LCD.shake(14); setLamp('rainbow', 3);
      fxStamp('突破', { size: 100, col: 'rainbow', life: 1.3 });
      yield 1.1;
      B.on = false; LCD.flash('#ffe08a', 1); vibrate(150);
      if (SPEC.hesoRushR > b.rounds) {
        LCD.setBg('rainbow'); AU.bgm(null); AU.play('premium'); S.rbT = 2.5; UI.rbShock(); Hand.drop('rainbow'); Board.shake(16);
        fxPremium(fmt(SPEC.hesoRushR * SPEC.atkMax * SPEC.atkPay), 'PREMIUM BONUS');
        yield 3.2;
        b.rounds = SPEC.hesoRushR; b.premium = true; b.extend = true; S.zoomT = 0;
        return;
      }
      LCD.setBg('rush'); AU.play('rushIn');
      fxBand('百鬼討滅RUSH', { col: 'gold', big: true, life: 2.8 });
      fxText('ST' + SPEC.stCount + '回 / 継続率 約' + contPct() + '%', { size: 22, y: LH * 0.66, life: 2.6 });
      yield 2.9;
    } else {
      yield* loseSeq();
      B.on = false; killTweens(LCD); LCD.desat = 0; LCD.setBg('jitan'); AU.duck(1);
      fxBand(SPEC.jitanCount > 0 ? '時短' + SPEC.jitanCount + '回' : '通常へ', { col: 'blue', big: true, life: 2.6 });
      fxText(SPEC.jitanCount > 0 ? '時短中の大当りでRUSH突入' : '左打ちに戻してください', { size: 22, y: LH * 0.66, life: 2.4 });
      AU.play('end');
      yield 2.6;
    }
    S.zoomT = 0;
    return;
  }
  // 百鬼MAXループ(RUSH中の大当り後、鬼の大手が落ちるたびに上乗せ)
  if (!b.challenge && SPEC.loop > 0 && (b.loops || 0) < 2 && chance(SPEC.loop)) {
    b.loops = (b.loops || 0) + 1;
    resetScene(); Reels.win = 1; Reels.toMini(); LCD.setBg('rainbow');
    yield* handDrop('rainbow');
    AU.play('loopAdd'); AU.bgm('premium');
    const add = SPEC.rushR > 0 ? SPEC.rushR : 10;
    fxPremium('+' + fmt(add * SPEC.atkMax * SPEC.atkPay), '百鬼MAXループ ×' + b.loops);
    yield 2.6;
    b.rounds += add; b.extend = true;
    return;
  }
  if (b.premium) {
    LCD.setBg('rush'); AU.play('rushIn');
    fxBand('百鬼討滅RUSH 突入', { col: 'gold', big: true, life: 2.6 });
    fxText('獲得 ' + fmt(b.pay) + '個', { size: 30, y: LH * 0.64, life: 2.4 });
    yield 2.7;
    return;
  }
  fxBand('BONUS終了', { col: 'gold', life: 2.4 });
  fxText('獲得 ' + fmt(b.pay) + '個', { size: 30, y: LH * 0.62, life: 2.4 });
  AU.play('round');
  yield 2.4;
}
function finishBonus(b) {
  if (b.extend) {
    b.extend = false; b.phase = 'interval'; b.t = 0;
    resetScene(); Reels.win = 1; Reels.toMini(); LCD.setBg('bonus'); AU.bgm('premium');
    return;
  }
  const d = S.data;
  if (b.challenge) {
    if (b.after === 'st') { d.chain = 1; d.chainPay = b.pay; } else { d.chain = 0; d.chainPay = 0; }
  } else if (S.mode === 'st') { d.chain++; d.chainPay += b.pay; }
  else { d.chain = 1; d.chainPay = b.pay; }
  d.maxChain = Math.max(d.maxChain, d.chain);
  if (d.hist[0]) d.hist[0].pay = b.pay;
  S.mode = b.after; S.modeCnt = b.after === 'st' ? SPEC.stCount : SPEC.jitanCount;
  if (S.mode !== 'normal' && S.modeCnt <= 0) { S.mode = 'normal'; S.modeCnt = 0; d.chain = 0; d.chainPay = 0; }
  S.bonus = null; S.rightNeed = densapo(); S.gap = 0.5;
  resetScene();
  LCD.setBg(stageBg()); AU.bgm(S.mode === 'st' ? 'rush' : S.mode === 'jitan' ? 'jitan' : 'normal');
  if (S.mode === 'st' && d.chain > 1) fxBand('RUSH継続  ' + d.chain + '連', { col: 'gold', life: 1.8 });
}

/* ==========================================================
   普図(スルーゲート → 電チュー)
   ========================================================== */
function updateFuto(dt) {
  const f = S.futo, ds = densapo() && !S.bonus;
  if (f.st === 'idle') {
    if (f.hold > 0) { f.hold--; f.st = 'spin'; f.t = 0; f.dur = ds ? 0.45 : 6; }
  } else if (f.st === 'spin') {
    f.t += dt;
    if (f.t >= f.dur) {
      const win = ds ? Math.random() < 0.996 : Math.random() < 1 / 12;
      if (win) { f.st = 'open'; f.t = 0; f.si = 0; f.seq = ds ? [2.8, 0.25, 2.8] : [0.15]; }
      else f.st = 'idle';
    }
  } else if (f.st === 'open') {
    f.t += dt;
    if (f.t >= f.seq[f.si]) { f.t = 0; f.si++; if (f.si >= f.seq.length) f.st = 'idle'; }
  }
  WORLD.denOpen = f.st === 'open' && f.si % 2 === 0;
}

/* ==========================================================
   発射・入賞処理
   ========================================================== */
function lend() {
  S.balls += SPEC.lendBalls; S.invest += SPEC.lendYen;
  AU.play('lend'); UI.toast('玉貸 +' + SPEC.lendBalls + '玉(' + SPEC.lendYen + '円)');
}
function updateFire(dt) {
  const want = (S.auto || S.holding || S.padHold) && S.power > 0.004;
  S.fireT = Math.max(-0.01, S.fireT - dt);
  if (!want || S.fireT > 0) return;
  if (S.balls <= 0) {
    if (S.set.autoLend) lend();
    else { if (S.auto) { S.auto = false; UI.toast('玉がありません。玉貸ボタンを押してください'); } return; }
  }
  if (!WORLD.launcherClear()) return;
  S.balls--; WORLD.launch(S.power); S.fireT = (S.bonus && S.set.fastBonus) ? 0.16 : SPEC.fireInterval;
  AU.play('launch');
}
function pay(n) { S.balls += n; UI.bump(); }
function handleEvents() {
  const ev = WORLD.events;
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i];
    switch (e.type) {
      case 'heso': pay(SPEC.hesoPay); onStartIn(1); AU.play('heso'); Board.flash('heso'); break;
      case 'denchu': pay(SPEC.denPay); onStartIn(2); AU.play('denIn'); Board.flash('den'); break;
      case 'attacker':
        pay(SPEC.atkPay); AU.play('atk'); Board.flash('atk');
        if (S.bonus) { S.bonus.count++; S.bonus.pay += SPEC.atkPay; }
        break;
      case 'pocket': pay(SPEC.pocketPay); AU.play('pocket'); break;
      case 'gate': if (S.futo.hold < 4) S.futo.hold++; Board.flash('gate'); break;
      case 'foul': S.balls++; break;
      case 'warp': AU.play('stage'); Board.flash('warp'); break;
      case 'stageC': Board.flash('stageC'); AU.play('heso'); break;
    }
  }
  ev.length = 0;
}
function laneCheck(dt) {
  S.warnCD -= dt; S.warnShow = Math.max(0, S.warnShow - dt);
  const ds = densapo() || !!S.bonus;
  for (const b of WORLD.balls) {
    if (b.chk || b.launching || b.dead || b.kin) continue;
    if (b.y > 160 && b.y < 430) {
      if (b.x < 112) { b.chk = 1; if (ds && S.warnCD <= 0) warn('right'); }
      else if (b.x > 490) { b.chk = 1; if (!ds && S.warnCD <= 0) warn('left'); }
    }
  }
  if (S.set.nail && S.tickCD <= 0) {
    for (const b of WORLD.balls) {
      if (!b.kin && !b.stage && Math.abs(b.vy) + Math.abs(b.vx) > 260 && b.y > 140 && Math.random() < 0.05) { AU.play('tick'); S.tickCD = 0.045; break; }
    }
  }
  S.tickCD -= dt;
}
function warn(which) { S.warnCD = 7; S.warnShow = 3.2; S.warnWhich = which; AU.play('warn'); }

/* ==========================================================
   セーブ / ロード
   ========================================================== */
const SAVE_KEY = 'zanki_pachinko_v1';
function saveGame() {
  try {
    let balls = S.balls, mode = S.mode, cnt = S.modeCnt;
    const h1 = S.hold1.slice(), h2 = S.hold2.slice();
    if (S.cur) (S.cur.e.from === 2 ? h2 : h1).unshift(S.cur.e);
    if (S.bonus) {
      const b = S.bonus;
      const rem = b.phase === 'intro' ? b.rounds : Math.max(0, b.rounds - b.round + (b.phase === 'open' ? 1 : 0));
      balls += Math.max(0, rem * SPEC.atkMax * SPEC.atkPay - (b.phase === 'open' ? b.count * SPEC.atkPay : 0));
      mode = b.after; cnt = b.after === 'st' ? SPEC.stCount : SPEC.jitanCount;
      if (cnt <= 0) mode = 'normal';
    }
    const o = {
      v: 1, balls, invest: S.invest, power: S.power, mode, cnt, stage: S.stage,
      h1: h1.slice(0, 4), h2: h2.slice(0, 4), data: S.data, set: S.set, spec: specGet()
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(o));
  } catch (e) { /* 保存できない環境 */ }
}
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const o = JSON.parse(raw);
    if (!o || o.v !== 1) return false;
    const num = (x, d) => (typeof x === 'number' && isFinite(x)) ? x : d;
    S.balls = Math.max(0, Math.floor(num(o.balls, 0)));
    S.invest = Math.max(0, num(o.invest, 0));
    S.power = clamp(num(o.power, SPEC.presetL), 0, 1);
    S.mode = ['normal', 'st', 'jitan'].includes(o.mode) ? o.mode : 'normal';
    S.modeCnt = Math.max(0, Math.floor(num(o.cnt, 0)));
    if (S.mode !== 'normal' && S.modeCnt <= 0) S.mode = 'normal';
    S.stage = Math.floor(num(o.stage, 0)) % STAGES.length;
    const okE = e => e && typeof e === 'object' && (e.from === 1 || e.from === 2) && typeof e.hit === 'boolean' && RANK[e.icon] !== undefined;
    S.hold1 = Array.isArray(o.h1) ? o.h1.filter(okE).slice(0, 4) : [];
    S.hold2 = Array.isArray(o.h2) ? o.h2.filter(okE).slice(0, 4) : [];
    if (o.data && typeof o.data === 'object') {
      const d = S.data;
      for (const k of ['spins', 'total', 'hits', 'rushHits', 'chain', 'chainPay', 'maxChain']) d[k] = Math.max(0, num(o.data[k], 0));
      d.hist = Array.isArray(o.data.hist) ? o.data.hist.slice(0, 60) : [];
      d.graph = Array.isArray(o.data.graph) ? o.data.graph.filter(p => Array.isArray(p) && p.length === 2).slice(-1600) : [];
    }
    if (o.set && typeof o.set === 'object') for (const k in DEF_SET) if (typeof o.set[k] === typeof DEF_SET[k]) S.set[k] = o.set[k];
    if (o.spec && typeof o.spec === 'object') applySpec(o.spec);
    if (!o.set || o.set.sv !== 2) { S.set.autoHandle = true; S.set.sv = 2; }
    if (S.mode !== 'normal') S.rightNeed = true;
    return true;
  } catch (e) { return false; }
}
function resetData() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 無視 */ }
  const set = S.set;
  Object.assign(S, {
    balls: 0, invest: 0, mode: 'normal', modeCnt: 0, hold1: [], hold2: [], rightNeed: false,
    data: { spins: 0, total: 0, hits: 0, rushHits: 0, chain: 0, chainPay: 0, maxChain: 0, hist: [], graph: [] }
  });
  S.set = set;
  if (!S.cur && !S.bonus) { LCD.setBg(stageBg()); AU.bgm('normal'); }
  UI.toast('データをリセットしました');
}

/* ==========================================================
   液晶(LCD)
   ========================================================== */
const LCD = {
  bg: 'night', prev: null, bgK: 1, t: 0,
  shk: 0, sx: 0, sy: 0, fl: 0, flC: '#ffffff', dark: 0, desat: 0, black: 0,
  fx: [], parts: [], bolt: 0, boltX: 0, spawnAcc: 0,
  bt: {
    on: false, enemy: 'tengu', aura: 0,
    hero: { x: HERO_X, y: HERO_Y, rot: 0, a: 1, pose: 'ready' },
    foe: { x: FOE_X, y: FOE_Y, a: 1, hurt: 0, split: 0, s: 1, lunge: 0 }
  },
  holdFx: [0, 0, 0, 0], curFx: 0, pop: [0, 0, 0, 0, 0, 0, 0, 0],
  tmp: null, rb: { on: 0, cut: 0 }, freeze: 0,
  setBg(n) { if (n === this.bg) return; this.prev = this.bg; this.bg = n; this.bgK = 0; },
  flash(c, a) { this.flC = c; this.fl = Math.max(this.fl, a); },
  shake(a) { this.shk = Math.max(this.shk, a); },
  holdPop(from, i) { this.pop[(from - 1) * 4 + clamp(i, 0, 3)] = 1; },
  holdChangeFx(i) { if (i < 0) this.curFx = 1; else this.holdFx[clamp(i, 0, 3)] = 1; },
  update(dt) {
    if (this.freeze) return;
    this.t += dt;
    this.bgK = Math.min(1, this.bgK + dt * 2.6);
    this.shk = Math.max(0, this.shk - dt * 30);
    this.sx = (Math.random() - 0.5) * this.shk; this.sy = (Math.random() - 0.5) * this.shk;
    this.fl = Math.max(0, this.fl - dt * 2.2);
    this.curFx = Math.max(0, this.curFx - dt * 1.4);
    for (let i = 0; i < 4; i++) this.holdFx[i] = Math.max(0, this.holdFx[i] - dt * 1.4);
    for (let i = 0; i < 8; i++) this.pop[i] = Math.max(0, this.pop[i] - dt * 3);
    this.bt.foe.hurt = Math.max(0, this.bt.foe.hurt - dt * 3);
    Roul.update(dt);
    for (let i = this.fx.length - 1; i >= 0; i--) { const f = this.fx[i]; f.t += dt; if (f.t >= f.life) this.fx.splice(i, 1); }
    const P = this.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i]; p.t += dt;
      if (p.t >= p.life) { P.splice(i, 1); continue; }
      p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += (p.vr || 0) * dt;
      if (p.drag) { p.vx *= 1 - p.drag * dt; p.vy *= 1 - p.drag * dt; }
    }
    this.spawn(dt);
    if (this.bg === 'orochi') {
      this.bolt = Math.max(0, this.bolt - dt * 3);
      if (Math.random() < dt * 0.35) { this.bolt = 1; this.boltX = rand(40, LW - 40); }
    }
  },
  spawn(dt) {
    const lite = S.set.lite, max = lite ? 120 : 260;
    if (this.parts.length > max) return;
    const rate = { night: 7, bamboo: 5, shrine: 6, reachN: 14, tengu: 6, orochi: 50, kyubi: 7, shuten: 20, win: 18, zen: 22, bonus: 14, challenge: 14, rush: 16, jitan: 8, end: 4, rainbow: 34 }[this.bg] || 0;
    this.spawnAcc += dt * rate * (lite ? 0.5 : 1);
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      const b = this.bg, p = { x: rand(0, LW), y: -10, vx: 0, vy: 0, t: 0, life: 6, r: rand(0, TAU), vr: rand(-3, 3), s: 1, type: 'petal' };
      if (b === 'night' || b === 'shrine') { p.type = 'petal'; p.vx = rand(-30, -8); p.vy = rand(18, 34); p.x = rand(0, LW + 60); p.s = rand(0.7, 1.3); if (b === 'shrine' && chance(0.5)) { p.type = 'fly'; p.y = rand(LH * 0.4, LH); p.vy = rand(-8, 8); p.vx = rand(-8, 8); p.life = 4; p.c = '#9fe8ff'; } }
      else if (b === 'bamboo') { p.type = 'fly'; p.y = rand(LH * 0.3, LH); p.vx = rand(-10, 10); p.vy = rand(-10, 6); p.life = 4; p.c = '#d8ff8a'; }
      else if (b === 'reachN' || b === 'shuten' || b === 'challenge') { p.type = 'ember'; p.y = LH + 6; p.vx = rand(-20, 20); p.vy = rand(-90, -40); p.life = 3.5; p.s = rand(0.6, 1.6); }
      else if (b === 'tengu') { p.type = 'leaf'; p.x = LW + 10; p.y = rand(0, LH); p.vx = rand(-90, -50); p.vy = rand(-10, 20); p.life = 5; }
      else if (b === 'orochi') { p.type = 'rain'; p.x = rand(-20, LW + 40); p.vx = -90; p.vy = rand(420, 520); p.life = 0.8; }
      else if (b === 'kyubi') { p.type = 'fox'; p.y = rand(LH * 0.25, LH * 0.95); p.vx = rand(-6, 6); p.vy = rand(-16, -6); p.life = 3; p.s = rand(0.6, 1.3); }
      else if (b === 'jitan') { p.type = 'fly'; p.y = LH + 4; p.vx = rand(-6, 6); p.vy = rand(-40, -20); p.life = 6; p.c = '#8fd3ff'; }
      else if (b === 'end') { p.type = 'fly'; p.y = rand(0, LH); p.vx = rand(-4, 4); p.vy = rand(-4, 4); p.life = 4; p.c = '#8890aa'; }
      else { p.type = 'star'; p.x = rand(0, LW); p.y = rand(0, LH); p.vx = rand(-20, 20); p.vy = rand(-30, -5); p.life = 1.4; p.s = rand(0.5, 1.4); p.c = b === 'rush' ? '#ffcf6a' : b === 'rainbow' ? 'hsl(' + randi(0, 359) + ',100%,70%)' : '#fff1b8'; }
      this.parts.push(p);
    }
  }
};
function addFx(o) { o.t = 0; o.layer = o.layer || 2; LCD.fx.push(o); return o; }

/* ---------- テキスト描画 ---------- */
const GRAD = {
  gold: ['#fffbe0', '#ffd75a', '#c07a0a', '#4a2200'], red: ['#fff0e0', '#ff5a3a', '#8a0a0a', '#2a0000'],
  blue: ['#f0faff', '#6fd0ff', '#1a4fb8', '#001040'], green: ['#f2fff0', '#7dff7a', '#108a30', '#002a0a'],
  white: ['#ffffff', '#eef2f8', '#9aa6ba', '#10141c'], gray: ['#dddddd', '#999999', '#555555', '#111111']
};
function stampText(ctx, txt, x, y, size, col, font, t) {
  ctx.font = '400 ' + size + 'px ' + (font || F_BRUSH);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.2; ctx.strokeStyle = 'rgba(0,0,0,0.88)'; ctx.strokeText(txt, x, y);
  let g;
  if (col === 'rainbow') {
    g = ctx.createLinearGradient(x - size, y - size / 2, x + size, y + size / 2);
    for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, 'hsl(' + ((i * 60 + (t || 0) * 240) % 360) + ',100%,65%)');
    ctx.lineWidth = size * 0.08; ctx.strokeStyle = '#ffffff'; ctx.strokeText(txt, x, y);
  } else {
    const c = GRAD[col] || GRAD.gold;
    g = ctx.createLinearGradient(0, y - size * 0.5, 0, y + size * 0.5);
    g.addColorStop(0, c[0]); g.addColorStop(0.5, c[1]); g.addColorStop(1, c[2]);
    ctx.lineWidth = size * 0.08; ctx.strokeStyle = c[3]; ctx.strokeText(txt, x, y);
  }
  ctx.fillStyle = g; ctx.fillText(txt, x, y);
}
function fxStamp(text, o) {
  o = Object.assign({ size: 64, col: 'gold', x: LW / 2, y: LH * 0.45, life: 1.2, font: F_BRUSH }, o);
  return addFx({
    life: o.life, layer: 2, draw(ctx, f) {
      const t = f.t, k = clamp(t / 0.14, 0, 1), sc = lerp(2.4, 1, E.outC(k));
      const a = t < 0.14 ? k : clamp((f.life - t) / 0.25, 0, 1);
      ctx.save(); ctx.globalAlpha = a; ctx.translate(o.x, o.y); ctx.scale(sc, sc);
      stampText(ctx, text, 0, 0, o.size, o.col, o.font, t);
      ctx.restore();
    }
  });
}
function fxText(text, o) {
  o = Object.assign({ size: 22, x: LW / 2, y: LH * 0.6, life: 1.6, col: '#ffffff' }, o);
  return addFx({
    life: o.life, layer: 2, draw(ctx, f) {
      const a = Math.min(clamp(f.t / 0.2, 0, 1), clamp((f.life - f.t) / 0.3, 0, 1));
      ctx.save(); ctx.globalAlpha = a;
      ctx.font = '800 ' + o.size + 'px ' + F_MIN; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round'; ctx.lineWidth = o.size * 0.25; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(text, o.x, o.y); ctx.fillStyle = o.col; ctx.fillText(text, o.x, o.y);
      ctx.restore();
    }
  });
}
function fxBand(text, o) {
  o = Object.assign({ col: 'gold', big: false, life: 1.4, y: LH * 0.3 }, o);
  const h = o.big ? 58 : 44, c = GRAD[o.col] || GRAD.gold;
  return addFx({
    life: o.life, layer: 2, draw(ctx, f) {
      const t = f.t, inK = E.outC(clamp(t / 0.22, 0, 1)), outK = clamp((f.life - t) / 0.25, 0, 1);
      ctx.save(); ctx.globalAlpha = outK;
      const y = o.y, w = LW * inK;
      const g = ctx.createLinearGradient(0, 0, LW, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.15, c[3]); g.addColorStop(0.5, c[2]); g.addColorStop(0.85, c[3]); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(LW / 2 - w / 2, y - h / 2, w, h);
      ctx.fillStyle = c[1]; ctx.globalAlpha = outK * 0.9;
      ctx.fillRect(LW / 2 - w / 2, y - h / 2, w, 2); ctx.fillRect(LW / 2 - w / 2, y + h / 2 - 2, w, 2);
      ctx.globalAlpha = outK * inK;
      let sz = o.big ? 40 : 30;
      ctx.font = '400 ' + sz + 'px ' + F_MIN;
      const tw = ctx.measureText(text).width * 1.15;
      if (tw > LW - 28) sz = sz * (LW - 28) / tw;
      ctx.translate(lerp(-60, 0, inK), 0);
      stampText(ctx, text, LW / 2, y + 1, sz, o.col, F_MIN, t);
      ctx.restore();
    }
  });
}
function fxShock(x, y, col) {
  return addFx({
    life: 0.55, layer: 2, draw(ctx, f) {
      const k = f.t / f.life;
      ctx.save(); ctx.globalAlpha = 1 - k; ctx.strokeStyle = col; ctx.lineWidth = 14 * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(x, y, 10 + 190 * E.outC(k), 0, TAU); ctx.stroke(); ctx.restore();
    }
  });
}
function fxReach() {
  fxStamp('リーチ', { font: F_GOTH, size: 52, col: 'red', y: LH * 0.18, life: 1.25 });
  fxShock(LW / 2, LH * 0.47, '#ff6a4a');
}
function fxSlash(x1, y1, x2, y2, col, w) {
  return addFx({
    life: 0.42, layer: 2, draw(ctx, f) {
      const p = clamp(f.t / 0.07, 0, 1), a = clamp((f.life - f.t) / 0.3, 0, 1);
      const ex = lerp(x1, x2, p), ey = lerp(y1, y2, p);
      ctx.save(); ctx.globalAlpha = a; ctx.lineCap = 'round';
      ctx.strokeStyle = col; ctx.lineWidth = w * 3.2; ctx.globalAlpha = a * 0.35;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.globalAlpha = a; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = w * (1 - f.t / f.life * 0.6);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.restore();
    }
  });
}
function fxClaw(col) {
  for (let i = 0; i < 3; i++) {
    const o = i * 16 - 16;
    fxSlash(HERO_X - 40 + o, HERO_Y - 120, HERO_X + 40 + o, HERO_Y - 20, col, 3.5);
  }
}
function fxSparks(x, y, n, col) {
  const max = S.set.lite ? n / 2 : n;
  for (let i = 0; i < max; i++) {
    const a = rand(0, TAU), v = rand(80, 420);
    LCD.parts.push({ type: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 300, drag: 2, t: 0, life: rand(0.3, 0.8), r: 0, s: rand(0.6, 1.4), c: col });
  }
}
function fxSplat(x, y, col) {
  for (let i = 0; i < (S.set.lite ? 14 : 30); i++) {
    const a = rand(0, TAU), v = rand(60, 360);
    LCD.parts.push({ type: 'ink', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 420, drag: 1.5, t: 0, life: rand(0.6, 1.2), r: 0, s: rand(2, 6), c: chance(0.6) ? '#050307' : col });
  }
}
function fxInk() {
  return addFx({
    life: 0.75, layer: 2, draw(ctx, f) {
      const p = f.t / f.life;
      const front = lerp(-80, LW + 140, E.ioC(clamp(p / 0.55, 0, 1)));
      const back = lerp(-80, LW + 140, E.ioC(clamp((p - 0.45) / 0.55, 0, 1)));
      ctx.save(); ctx.fillStyle = '#060406';
      ctx.beginPath(); ctx.moveTo(back, -10);
      for (let y = -10; y <= LH + 10; y += 10) ctx.lineTo(front + Math.sin(y * 0.09 + f.t * 20) * 18 + Math.sin(y * 0.031) * 30, y);
      for (let y = LH + 10; y >= -10; y -= 10) ctx.lineTo(back + Math.sin(y * 0.07 - f.t * 10) * 14 + Math.sin(y * 0.027) * 26, y);
      ctx.closePath(); ctx.fill(); ctx.restore();
    }
  });
}
function fxCrack() {
  const lines = [];
  const cx = LW * rand(0.35, 0.65), cy = LH * rand(0.35, 0.6);
  for (let i = 0; i < 9; i++) {
    let a = i / 9 * TAU + rand(-0.2, 0.2), x = cx, y = cy; const pts = [[x, y]];
    for (let j = 0; j < 6; j++) { a += rand(-0.5, 0.5); const l = rand(14, 40); x += Math.cos(a) * l; y += Math.sin(a) * l; pts.push([x, y]); }
    lines.push(pts);
  }
  return addFx({
    life: 1.7, layer: 2, draw(ctx, f) {
      ctx.save(); ctx.globalAlpha = clamp((f.life - f.t) / 0.5, 0, 1);
      for (const [w, c] of [[3, 'rgba(0,0,0,0.8)'], [1.2, 'rgba(255,255,255,0.9)']]) {
        ctx.lineWidth = w; ctx.strokeStyle = c; ctx.beginPath();
        for (const pts of lines) { ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts) ctx.lineTo(p[0], p[1]); }
        ctx.stroke();
      }
      ctx.restore();
    }
  });
}
function fxStepPanel(i, col) {
  const c = GRAD[col] || GRAD.white, kan = '壱弐参肆伍'[i - 1];
  return addFx({
    life: 0.95, layer: 2, draw(ctx, f) {
      const k = E.outB(clamp(f.t / 0.18, 0, 1)), a = clamp((f.life - f.t) / 0.25, 0, 1);
      const w = 120 + i * 18, h = 96 + i * 10, x = lerp(LW + w, LW / 2, k), y = LH * 0.46;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.rotate(-0.06);
      ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8);
      const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, c[2]); g.addColorStop(1, c[3]);
      ctx.fillStyle = g; ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.strokeStyle = c[1]; ctx.lineWidth = 3; ctx.strokeRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10);
      stampText(ctx, kan, 0, 4, 52 + i * 4, col, F_BRUSH, f.t);
      ctx.font = '400 13px ' + F_GOTH; ctx.textAlign = 'center'; ctx.fillStyle = c[0];
      ctx.fillText('STEP ' + i, 0, -h / 2 + 16);
      ctx.restore();
    }
  });
}
function fxSwarm(type) {
  if (type === 'sakura') {
    for (let i = 0; i < (S.set.lite ? 60 : 130); i++) LCD.parts.push({ type: 'petal', x: LW + rand(0, 160), y: rand(-20, LH), vx: rand(-420, -220), vy: rand(-40, 60), t: 0, life: 1.6, r: rand(0, TAU), vr: rand(-8, 8), s: rand(0.8, 1.6) });
    addFx({ life: 1.4, layer: 1, draw(ctx, f) { ctx.save(); ctx.globalAlpha = Math.sin(f.t / f.life * Math.PI) * 0.35; ctx.fillStyle = '#ff7ab8'; ctx.fillRect(0, 0, LW, LH); ctx.restore(); } });
    return;
  }
  const birds = [];
  for (let i = 0; i < 26; i++) birds.push({ x: LW + rand(0, 220), y: rand(20, LH - 40), v: rand(300, 440), s: rand(0.7, 1.4), ph: rand(0, TAU) });
  addFx({
    life: 1.5, layer: 2, draw(ctx, f) {
      ctx.save(); ctx.fillStyle = '#050307';
      for (const b of birds) {
        const x = b.x - b.v * f.t, y = b.y + Math.sin(f.t * 6 + b.ph) * 6, fl = Math.sin(f.t * 22 + b.ph) * 7 * b.s;
        ctx.beginPath(); ctx.moveTo(x - 12 * b.s, y - fl); ctx.quadraticCurveTo(x - 4 * b.s, y - 2, x, y + 2);
        ctx.quadraticCurveTo(x + 4 * b.s, y - 2, x + 12 * b.s, y - fl); ctx.quadraticCurveTo(x, y - 2, x - 12 * b.s, y - fl); ctx.fill();
      }
      ctx.restore();
    }
  });
}
const LINES = { blue: '……来るか', green: 'ここで斬る', red: '鬼よ、覚悟しろ', gold: 'この一太刀に、全てを' };
function fxDialog(col) {
  const c = GRAD[col] || GRAD.blue, line = LINES[col] || LINES.blue;
  return addFx({
    life: 1.75, layer: 2, draw(ctx, f) {
      const a = Math.min(clamp(f.t / 0.15, 0, 1), clamp((f.life - f.t) / 0.25, 0, 1));
      const n = Math.floor(clamp(f.t / 0.5, 0, 1) * line.length);
      const x = 18, y = LH - 74, w = LW - 36, h = 46;
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(8,6,12,0.82)'; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = c[1]; ctx.lineWidth = 2; ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
      ctx.fillStyle = c[1]; ctx.fillRect(x, y - 16, 52, 17);
      ctx.font = '800 12px ' + F_MIN; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#000';
      ctx.fillText('朧', x + 26, y - 7);
      ctx.font = '800 20px ' + F_MIN; ctx.textAlign = 'left'; ctx.fillStyle = col === 'gold' ? '#ffe28a' : '#ffffff';
      ctx.fillText(line.slice(0, n), x + 14, y + h / 2 + 1);
      ctx.restore();
    }
  });
}
function fxCutin(col) {
  const c = GRAD[col] || GRAD.blue;
  return addFx({
    life: 1.35, layer: 2, draw(ctx, f) {
      const k = E.outC(clamp(f.t / 0.16, 0, 1)), a = clamp((f.life - f.t) / 0.22, 0, 1);
      const y = LH * 0.42, h = 92, off = lerp(-LW * 1.2, 0, k);
      ctx.save(); ctx.globalAlpha = a; ctx.translate(off, 0);
      ctx.beginPath(); ctx.moveTo(-20, y - h / 2 + 18); ctx.lineTo(LW + 20, y - h / 2 - 18); ctx.lineTo(LW + 20, y + h / 2 - 18); ctx.lineTo(-20, y + h / 2 + 18); ctx.closePath();
      const g = ctx.createLinearGradient(0, y - h, 0, y + h); g.addColorStop(0, c[2]); g.addColorStop(1, c[3]);
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = c[0]; ctx.lineWidth = 3; ctx.stroke();
      ctx.save(); ctx.clip();
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, y - 26, LW, 52);
      for (const ex of [LW * 0.36, LW * 0.64]) {
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(ex - 34, y + 4); ctx.quadraticCurveTo(ex, y - 18, ex + 34, y - 4); ctx.quadraticCurveTo(ex, y + 10, ex - 34, y + 4); ctx.fill();
        ctx.fillStyle = c[1]; ctx.beginPath(); ctx.arc(ex + 2, y - 3, 7, 0, TAU); ctx.fill();
        ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(ex + 2, y - 3, 3, 0, TAU); ctx.fill();
      }
      ctx.restore();
      stampText(ctx, '見切った', LW * 0.5, y + 34, 22, col, F_MIN, f.t);
      ctx.restore();
    }
  });
}
function fxGekiatsu(col) {
  addFx({ life: 1.7, layer: 1, draw(ctx, f) { ctx.save(); ctx.globalAlpha = Math.sin(f.t / f.life * Math.PI) * 0.45; ctx.fillStyle = col === 'gold' ? '#ffb000' : '#ff1a00'; ctx.fillRect(0, 0, LW, LH); ctx.restore(); } });
  for (let i = 0; i < (S.set.lite ? 30 : 70); i++) LCD.parts.push({ type: 'ember', x: rand(0, LW), y: LH + 4, vx: rand(-30, 30), vy: rand(-260, -120), t: 0, life: 1.5, r: 0, s: rand(1, 2.4) });
  fxStamp('激熱', { size: 96, col: col === 'gold' ? 'gold' : 'red', life: 1.7 });
}
function fxEnemyName(en) {
  const D = ENEMY[en];
  return addFx({
    life: 1.8, layer: 2, draw(ctx, f) {
      const k = E.outC(clamp(f.t / 0.2, 0, 1)), a = clamp((f.life - f.t) / 0.3, 0, 1);
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, LH * 0.14, LW * k, 84);
      ctx.fillStyle = D.col; ctx.fillRect(0, LH * 0.14 + 82, LW * k, 2);
      ctx.font = '800 14px ' + F_MIN; ctx.textAlign = 'left'; ctx.fillStyle = D.col;
      ctx.fillText(D.sub, 16, LH * 0.14 + 16);
      const sc = lerp(1.8, 1, k);
      ctx.translate(LW * 0.52, LH * 0.14 + 52); ctx.scale(sc, sc);
      stampText(ctx, D.name, 0, 0, D.name.length > 2 ? 46 : 58, en === 'shuten' ? 'red' : 'white', F_BRUSH, f.t);
      ctx.restore();
    }
  });
}

function fxShatter() {
  const cx = LW * 0.5, cy = LH * 0.45, shards = [];
  for (let i = 0; i < (S.set.lite ? 16 : 30); i++) {
    const a = rand(0, TAU), d = rand(10, 160), sz = rand(14, 40);
    shards.push({
      x: cx + Math.cos(a) * d * 0.4, y: cy + Math.sin(a) * d * 0.4, vx: Math.cos(a) * rand(120, 420), vy: Math.sin(a) * rand(120, 420) - 80,
      r: rand(0, TAU), vr: rand(-8, 8), hue: rand(0, 360),
      pts: [[0, -sz], [sz * rand(0.4, 0.9), sz * rand(0.2, 0.7)], [-sz * rand(0.4, 0.9), sz * rand(0.1, 0.6)]]
    });
  }
  fxCrack();
  return addFx({
    life: 1.5, layer: 2, draw(ctx, f) {
      const t = f.t;
      ctx.save(); ctx.globalAlpha = clamp((f.life - t) / 0.5, 0, 1);
      for (const s of shards) {
        ctx.save(); ctx.translate(s.x + s.vx * t, s.y + s.vy * t + 380 * t * t); ctx.rotate(s.r + s.vr * t);
        ctx.beginPath(); ctx.moveTo(s.pts[0][0], s.pts[0][1]); ctx.lineTo(s.pts[1][0], s.pts[1][1]); ctx.lineTo(s.pts[2][0], s.pts[2][1]); ctx.closePath();
        ctx.fillStyle = 'hsla(' + ((s.hue + t * 400) % 360) + ',100%,75%,0.35)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }
  });
}
function fxRbSlash() {
  return addFx({
    life: 1.0, layer: 2, draw(ctx, f) {
      const p = clamp(f.t / 0.12, 0, 1), a = clamp((f.life - f.t) / 0.5, 0, 1);
      const x1 = -30, y1 = LH * 0.85, x2 = lerp(x1, LW + 30, p), y2 = lerp(y1, LH * 0.1, p);
      ctx.save(); ctx.globalAlpha = a; ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const o = (i - 3) * 6;
        ctx.strokeStyle = 'hsl(' + ((i * 51 + f.t * 300) % 360) + ',100%,60%)'; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(x1, y1 + o); ctx.lineTo(x2, y2 + o); ctx.stroke();
      }
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.restore();
    }
  });
}
function drawRainbowScene(ctx, t) {
  const cut = LCD.rb.cut;
  for (const [en, fx, sc] of [['tengu', 0.44, 0.52], ['orochi', 0.6, 0.52], ['kyubi', 0.76, 0.55], ['shuten', 0.92, 0.62]]) {
    drawEnemy(ctx, { enemy: en, foe: { x: LW * fx, y: LH * 0.93, s: sc, a: 1, hurt: 0, split: cut, lunge: 0 } }, t);
  }
  drawAura(ctx, LW * 0.2, LH * 0.62, 'hsla(' + ((t * 200) % 360) + ',100%,60%,0.9)', 1, t, 110);
  drawHero(ctx, { x: LW * 0.2, y: LH * 0.97, rot: 0, a: 1, pose: cut > 0 ? 'slash' : 'ready', rb: 1 }, t, 1.3);
}

/* ---------- 先バレ・PREMIUM・ルーレット ---------- */
function fxSakibare() {
  return addFx({
    life: 2.4, layer: 2, draw(ctx, f) {
      const t = f.t, k = clamp(t / 0.14, 0, 1), a = clamp((f.life - t) / 0.5, 0, 1);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      rays(ctx, LW / 2, LH / 2, 24, 'hsl(' + ((t * 400) % 360) + ',100%,60%)', t * 4, 0.35 * a);
      ctx.restore();
      ctx.save(); ctx.globalAlpha = a;
      const sc = lerp(3, 1, E.outB(k));
      ctx.translate(LW / 2, LH * 0.42); ctx.scale(sc, sc);
      stampText(ctx, '確定', 0, 0, 96, 'rainbow', F_BRUSH, t);
      stampText(ctx, 'RUSH', 0, 60, 30, 'gold', F_GOTH, t);
      ctx.restore();
    }
  });
}
function fxPremium(num, label) {
  return addFx({
    life: 3.0, layer: 2, draw(ctx, f) {
      const t = f.t, k = E.outB(clamp(t / 0.25, 0, 1)), a = clamp((f.life - t) / 0.4, 0, 1);
      ctx.save(); ctx.globalAlpha = a;
      stampText(ctx, label, LW / 2, LH * 0.2, 24, 'gold', F_GOTH, t);
      let sz = 84; ctx.font = '400 ' + sz + 'px ' + F_GOTH;
      const w = ctx.measureText(num).width * 1.12; if (w > LW - 24) sz = sz * (LW - 24) / w;
      const sc = lerp(2.2, 1, k);
      ctx.translate(LW / 2, LH * 0.54); ctx.scale(sc, sc);
      stampText(ctx, num, 0, 0, sz, 'rainbow', F_GOTH, t);
      ctx.restore();
    }
  });
}
const ROUL_EN = ['tengu', 'orochi', 'kyubi', 'shuten'];
const Roul = {
  on: false, idx: 0, acc: 0, spd: 14, left: 0, stopping: false, done: false, sel: -1,
  start() { this.on = true; this.idx = randi(0, 3); this.acc = 0; this.spd = 14; this.stopping = false; this.done = false; this.sel = -1; },
  stopAt(en) { const ti = Math.max(0, ROUL_EN.indexOf(en)); this.left = ((ti - this.idx + 4) % 4) + 8; this.stopping = true; },
  update(dt) {
    if (!this.on || this.done) return;
    this.acc += dt * this.spd;
    while (this.acc >= 1 && !this.done) {
      this.acc -= 1; this.idx = (this.idx + 1) % 4; AU.play('roulTick');
      if (this.stopping) { this.left--; this.spd = Math.max(2.4, this.spd * 0.8); if (this.left <= 0) { this.done = true; this.sel = this.idx; } }
    }
  }
};
function drawRoul(ctx, t) {
  stampText(ctx, '討伐する鬼を決めろ!', LW / 2, 22, 20, 'gold', F_MIN, t);
  for (let i = 0; i < 4; i++) {
    const en = ROUL_EN[i], D = ENEMY[en], x = LW * (0.14 + i * 0.24), y = LH * 0.44, w = 70, h = 104;
    const on = Roul.idx === i, fin = Roul.done && Roul.sel === i, dim = Roul.done && !fin;
    const sc = fin ? 1.12 + 0.04 * Math.sin(t * 12) : on ? 1.06 : 0.94, al = dim ? 0.35 : (on || fin) ? 1 : 0.62;
    ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.globalAlpha = al;
    if (fin) { const gg = ctx.createRadialGradient(0, 0, 10, 0, 0, 90); gg.addColorStop(0, 'rgba(255,220,120,0.6)'); gg.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gg; ctx.fillRect(-90, -90, 180, 180); }
    ctx.fillStyle = 'rgba(0,0,0,0.78)'; ctx.fillRect(-w / 2, -h / 2, w, h);
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, D.col); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = al * 0.4; ctx.fillStyle = g; ctx.fillRect(-w / 2, -h / 2, w, h); ctx.globalAlpha = al;
    ctx.save(); ctx.beginPath(); ctx.rect(-w / 2, -h / 2, w, h); ctx.clip();
    drawEnemy(ctx, { enemy: en, foe: { x: 0, y: h / 2 - 6, s: en === 'shuten' ? 0.42 : 0.5, a: al, hurt: 0, split: 0, lunge: 0 } }, t);
    ctx.restore();
    ctx.globalAlpha = al;
    ctx.strokeStyle = (on || fin) ? '#ffd36b' : '#6a4a20'; ctx.lineWidth = (on || fin) ? 3 : 1.5; ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.font = '800 12px ' + F_MIN; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffffff';
    ctx.fillText(D.name, 0, h / 2 + 10);
    ctx.font = '400 10px ' + F_GOTH; ctx.fillStyle = '#ffd36b'; ctx.fillText('★★★★'.slice(0, 4 - i), 0, -h / 2 - 8);
    ctx.restore();
  }
}

/* ==========================================================
   図柄(リール)
   ========================================================== */
const KANJI_NUM = '壱弐参肆伍陸漆捌玖';
const SYM = { w: 96, h: 108, sp: 112, scale: 0, sharp: {}, blur: {} };
function drawSymbolArt(g, d) {
  const cx = 48, cy = 52;
  if (d === '続') {
    const rg = g.createRadialGradient(cx, cy, 4, cx, cy, 46); rg.addColorStop(0, 'rgba(255,220,120,0.7)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, 46, 0, TAU); g.fill();
    g.lineWidth = 3; g.strokeStyle = '#f2c14e'; g.beginPath(); g.arc(cx, cy, 38, 0, TAU); g.stroke();
    stampText(g, '続', cx, cy + 2, 58, 'gold', F_BRUSH, 0);
    return;
  }
  const seven = d === 7, odd = d % 2 === 1;
  const c = seven ? ['#fff3b0', '#e0a020', 'rgba(255,190,60,0.6)'] : odd ? ['#ffb3a6', '#c0141c', 'rgba(200,30,40,0.55)'] : ['#b5dcff', '#1f56c8', 'rgba(40,100,230,0.5)'];
  const rg = g.createRadialGradient(cx, cy, 6, cx, cy, 47); rg.addColorStop(0, c[2]); rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, 47, 0, TAU); g.fill();
  g.lineWidth = 2.4; g.strokeStyle = c[1]; g.beginPath(); g.arc(cx, cy, 40, 0, TAU); g.stroke();
  g.lineWidth = 1; g.strokeStyle = 'rgba(255,230,160,0.6)'; g.beginPath(); g.arc(cx, cy, 36, 0, TAU); g.stroke();
  g.fillStyle = 'rgba(255,230,160,0.75)';
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + 0.39; g.beginPath(); g.arc(cx + Math.cos(a) * 40, cy + Math.sin(a) * 40, 2.2, 0, TAU); g.fill(); }
  g.font = '400 82px ' + F_GOTH; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.lineWidth = 13; g.strokeStyle = '#000000'; g.strokeText(String(d), cx, cy + 3);
  g.lineWidth = 5.5; g.strokeStyle = c[1]; g.strokeText(String(d), cx, cy + 3);
  const lg = g.createLinearGradient(0, cy - 34, 0, cy + 38);
  lg.addColorStop(0, '#ffffff'); lg.addColorStop(0.42, c[0]); lg.addColorStop(0.55, c[1]); lg.addColorStop(1, seven ? '#7a3a00' : odd ? '#4a0006' : '#06164a');
  g.fillStyle = lg; g.fillText(String(d), cx, cy + 3);
  g.font = '400 19px ' + F_BRUSH; g.lineWidth = 4; g.strokeStyle = '#000';
  g.strokeText(KANJI_NUM[d - 1], cx + 31, cy + 40); g.fillStyle = '#ffe9b0'; g.fillText(KANJI_NUM[d - 1], cx + 31, cy + 40);
}
function buildSymbols(scale) {
  scale = clamp(scale, 0.5, 4);
  SYM.scale = scale; SYM.sharp = {}; SYM.blur = {};
  const W = Math.ceil(SYM.w * scale), H = Math.ceil(SYM.h * scale);
  for (const d of [1, 2, 3, 4, 5, 6, 7, 8, 9, '続']) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.scale(scale, scale); drawSymbolArt(g, d);
    SYM.sharp[d] = c;
    const b = document.createElement('canvas'); b.width = W; b.height = Math.ceil(H * 1.3);
    const gb = b.getContext('2d');
    for (let k = -5; k <= 5; k++) { gb.globalAlpha = 0.16; gb.drawImage(c, 0, H * 0.15 + k * 4 * scale); }
    SYM.blur[d] = b;
  }
}
const Reels = {
  r: [0, 1, 2].map(() => ({ pos: randi(0, 8), v: 0, vt: 0, st: 'stop', a: 0, b: 0, t: 0, d: 0.36, wob: 0, wt: 0, ov: null })),
  mini: 0, miniT: 0, reachGlow: 0, win: 0, zen: false, rb: 0,
  freeze() { for (const r of this.r) if (r.st !== 'stop') { r.st = 'stop'; r.v = 0; r.wob = 0; } },
  digit(p) { return ((Math.round(p) % 9) + 9) % 9 + 1; },
  spin(i, v) { const r = this.r[i]; r.st = 'spin'; r.v = Math.max(r.v, v * 0.5); r.vt = v; r.ov = null; r.wob = 0; },
  spinAll(v) { for (let i = 0; i < 3; i++) this.spin(i, v); this.reachGlow = 0; this.win = 0; this.rb = 0; },
  slowTo(i, v) { const r = this.r[i]; if (r.st !== 'spin') { r.st = 'spin'; r.v = v; r.ov = null; } r.vt = v; },
  stop(i, d, dur, ov) {
    const r = this.r[i], minAdv = Math.max(1, r.v * 0.11) + 0.6;
    let P = Math.ceil(r.pos + minAdv), guard = 0;
    while (this.digit(P) !== d && guard++ < 20) P++;
    r.st = 'stopping'; r.a = r.pos; r.b = P; r.t = 0; r.d = dur || 0.36; r.ov = ov || null;
  },
  lock() { for (const r of this.r) { r.wob = 0; if (r.st !== 'stop') { r.st = 'stop'; r.v = 0; r.pos = Math.round(r.pos); } } },
  toMini() { this.miniT = 1; }, toBig() { this.miniT = 0; },
  update(dt) {
    this.mini += (this.miniT - this.mini) * Math.min(1, dt * 7);
    if (Math.abs(this.mini - this.miniT) < 0.002) this.mini = this.miniT;
    for (let i = 0; i < 3; i++) {
      const r = this.r[i];
      if (r.st === 'spin') { r.v += (r.vt - r.v) * Math.min(1, dt * 4); r.pos += r.v * dt; }
      else if (r.st === 'stopping') {
        r.t += dt; const k = Math.min(1, r.t / r.d);
        r.pos = r.a + (r.b - r.a) * E.outB(k);
        if (k >= 1) { r.pos = r.b; r.st = 'stop'; r.v = 0; r.wob = 1; r.wt = 0; AU.play('stop'); }
      }
      r.wt += dt; r.wob = Math.max(0, r.wob - dt * 1.6);
      if (r.pos > 9000) { r.pos -= 9000; if (r.st === 'stopping') { r.a -= 9000; r.b -= 9000; } }
    }
    if (this.zen && this.r[0].st === 'spin') { this.r[1].pos = this.r[2].pos = this.r[0].pos; this.r[1].v = this.r[2].v = this.r[0].v; }
  }
};
function drawReels(ctx, t) {
  if (!SYM.scale) return;
  const k = Reels.mini;
  if (k > 0.5) {
    ctx.save(); ctx.globalAlpha = (k - 0.5) * 2 * 0.7; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(4, 4, 84, 32, 6) : ctx.rect(4, 4, 84, 32); ctx.fill(); ctx.restore();
  }
  const sp = SYM.sp, hw = SYM.w / 2, hh = SYM.h / 2;
  for (let i = 0; i < 3; i++) {
    const r = Reels.r[i];
    const cx = lerp(LW * [0.2, 0.5, 0.8][i], 20 + i * 26, k), cy = lerp(LH * 0.47, 20, k), s = lerp(1, 0.25, k);
    const stopped = r.st === 'stop';
    const glow = (Reels.win || Reels.rb || (Reels.reachGlow && i !== 1 && stopped)) ? 1 : 0;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
    if (glow) {
      const pulse = 0.6 + 0.4 * Math.sin(t * 9);
      const g = ctx.createRadialGradient(0, 0, 10, 0, 0, 70);
      g.addColorStop(0, Reels.rb ? 'hsla(' + ((t * 300 + i * 120) % 360) + ',100%,62%,' + (0.9 * pulse) + ')' : Reels.win ? 'rgba(255,220,120,' + (0.8 * pulse) + ')' : 'rgba(255,60,40,' + (0.7 * pulse) + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 70, 0, TAU); ctx.fill();
    }
    ctx.beginPath(); ctx.rect(-hw - 8, -sp * 0.95, SYM.w + 16, sp * 1.9); ctx.clip();
    const fast = r.v > 9 && !stopped;
    const wy = stopped ? Math.sin(r.wt * 40) * r.wob * 4 : 0;
    const base = Math.floor(r.pos);
    for (let idx = base - 1; idx <= base + 2; idx++) {
      const dy = (r.pos - idx) * sp + wy;
      if (Math.abs(dy) > sp * 1.4) continue;
      let d = Reels.digit(idx);
      if (r.ov && stopped && idx === Math.round(r.pos)) d = r.ov;
      const a = clamp(1 - Math.abs(dy) / (sp * 1.05), 0, 1);
      if (a <= 0.02) continue;
      ctx.globalAlpha = (k > 0.5 && Math.abs(dy) > sp * 0.5) ? 0 : a;
      const sc = (Reels.win && stopped) ? 1 + 0.06 * Math.sin(t * 9) : 1;
      if (fast) ctx.drawImage(SYM.blur[d], -hw * sc, dy - hh * 1.3 * sc, SYM.w * sc, SYM.h * 1.3 * sc);
      else ctx.drawImage(SYM.sharp[d], -hw * sc, dy - hh * sc, SYM.w * sc, SYM.h * sc);
    }
    ctx.restore();
  }
}

/* ==========================================================
   背景
   ========================================================== */
function ridge(ctx, y0, amp, f1, f2, ph, col) {
  ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, LH + 2);
  for (let x = 0; x <= LW + 8; x += 8) ctx.lineTo(x, y0 - amp * (0.6 * Math.sin(x * f1 + ph) + 0.4 * Math.sin(x * f2 + ph * 2.3)) - amp * 0.25 * Math.abs(Math.sin(x * f1 * 3.1 + ph)));
  ctx.lineTo(LW + 8, LH + 2); ctx.closePath(); ctx.fill();
}
function skyG(ctx, a, b, c) {
  const g = ctx.createLinearGradient(0, 0, 0, LH); g.addColorStop(0, a); g.addColorStop(0.6, b); g.addColorStop(1, c);
  ctx.fillStyle = g; ctx.fillRect(0, 0, LW, LH);
}
function orb(ctx, x, y, r, c0, c1, glow) {
  const gg = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 3); gg.addColorStop(0, glow); gg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, y, r * 3, 0, TAU); ctx.fill();
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r); g.addColorStop(0, c0); g.addColorStop(1, c1);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}
function castle(ctx, x, y, s, col) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.fillStyle = col;
  ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(-34, -22); ctx.lineTo(34, -22); ctx.lineTo(40, 0); ctx.closePath(); ctx.fill();
  for (let i = 0; i < 3; i++) {
    const w = 40 - i * 10, yy = -22 - i * 17;
    ctx.fillRect(-w + 8, yy - 12, (w - 8) * 2, 13);
    ctx.beginPath(); ctx.moveTo(-w - 10, yy - 9); ctx.quadraticCurveTo(-w + 2, yy - 12, -w + 6, yy - 19); ctx.lineTo(w - 6, yy - 19); ctx.quadraticCurveTo(w - 2, yy - 12, w + 10, yy - 9); ctx.closePath(); ctx.fill();
  }
  ctx.beginPath(); ctx.moveTo(-12, -73); ctx.lineTo(0, -84); ctx.lineTo(12, -73); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function torii(ctx, x, y, s, col) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.fillStyle = col;
  ctx.fillRect(-27, -62, 6, 62); ctx.fillRect(21, -62, 6, 62);
  ctx.beginPath(); ctx.moveTo(-44, -64); ctx.quadraticCurveTo(0, -58, 44, -64); ctx.lineTo(46, -72); ctx.quadraticCurveTo(0, -65, -46, -72); ctx.closePath(); ctx.fill();
  ctx.fillRect(-34, -54, 68, 5); ctx.fillRect(-3, -60, 6, 8);
  ctx.restore();
}
function rays(ctx, cx, cy, n, col, t, a) {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 0.25); ctx.globalAlpha = a; ctx.fillStyle = col;
  for (let i = 0; i < n; i++) { const r = i / n * TAU; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, LW, r, r + TAU / n / 2); ctx.closePath(); ctx.fill(); }
  ctx.restore();
}
function speedLines(ctx, cx, cy, col, n, a) {
  ctx.save(); ctx.strokeStyle = col; ctx.globalAlpha = a;
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * TAU, r0 = rand(70, 120), r1 = r0 + rand(80, 260);
    ctx.lineWidth = rand(0.5, 2.5); ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0); ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1); ctx.stroke();
  }
  ctx.restore();
}
function drawBg(ctx, name, t) {
  switch (name) {
    case 'night': {
      skyG(ctx, '#080a24', '#2a0f2e', '#4a1420');
      orb(ctx, LW * 0.73, 62, 36, '#fff1e4', '#c8302a', 'rgba(255,70,50,0.28)');
      ctx.fillStyle = 'rgba(10,6,20,0.55)';
      for (let i = 0; i < 3; i++) { const x = ((t * 8 + i * 140) % (LW + 220)) - 110; ctx.beginPath(); ctx.ellipse(x, 52 + i * 16, 90, 7, 0, 0, TAU); ctx.fill(); }
      ridge(ctx, LH * 0.62, 26, 0.02, 0.05, 1.3, '#1d1030');
      castle(ctx, LW * 0.24, LH * 0.74, 1.0, '#120a1a');
      ridge(ctx, LH * 0.82, 12, 0.04, 0.09, 4.1, '#0b0610');
      ctx.fillStyle = '#07040a';
      for (let x = -10; x < LW; x += 46) { ctx.beginPath(); ctx.moveTo(x, LH); ctx.lineTo(x, LH * 0.9); ctx.lineTo(x + 20, LH * 0.86); ctx.lineTo(x + 40, LH * 0.9); ctx.lineTo(x + 40, LH); ctx.fill(); }
      break;
    }
    case 'bamboo': {
      skyG(ctx, '#02100c', '#0b2a1e', '#061510');
      orb(ctx, LW * 0.2, 48, 22, '#f2fff2', '#9fd8b0', 'rgba(180,255,200,0.18)');
      ctx.save(); ctx.globalAlpha = 0.07; ctx.fillStyle = '#d8ffe0';
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(40 + i * 80, 0); ctx.lineTo(80 + i * 80, 0); ctx.lineTo(10 + i * 80, LH); ctx.lineTo(-30 + i * 80, LH); ctx.fill(); }
      ctx.restore();
      for (let layer = 0; layer < 2; layer++) {
        ctx.fillStyle = layer ? '#03100a' : '#0c2a18';
        for (let i = 0; i < 8; i++) {
          const x = (i * 47 + layer * 23) % (LW + 30) - 10 + Math.sin(t * 0.8 + i) * (layer ? 2 : 1), w = layer ? 11 : 7;
          ctx.fillRect(x, 0, w, LH);
          ctx.fillStyle = layer ? '#020805' : '#082014';
          for (let y = 20 + i * 7 % 30; y < LH; y += 46) ctx.fillRect(x - 1, y, w + 2, 2);
          ctx.fillStyle = layer ? '#03100a' : '#0c2a18';
        }
      }
      break;
    }
    case 'shrine': {
      skyG(ctx, '#03081c', '#0f1d45', '#0a1028');
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 40; i++) { const x = (i * 97) % LW, y = (i * 53) % (LH * 0.55); ctx.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(t * 1.5 + i)); ctx.fillRect(x, y, 1.4, 1.4); }
      ctx.globalAlpha = 1;
      ridge(ctx, LH * 0.7, 14, 0.03, 0.07, 2.2, '#0a1230');
      torii(ctx, LW * 0.32, LH * 0.94, 1.5, '#05081a');
      for (const x of [LW * 0.62, LW * 0.82]) {
        const g = ctx.createRadialGradient(x, LH * 0.7, 2, x, LH * 0.7, 30); g.addColorStop(0, 'rgba(255,170,80,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(x - 30, LH * 0.7 - 30, 60, 60);
        ctx.fillStyle = '#05081a'; ctx.fillRect(x - 3, LH * 0.74, 6, LH * 0.26); ctx.fillStyle = '#ff9a4a'; ctx.fillRect(x - 6, LH * 0.66, 12, 12);
      }
      break;
    }
    case 'reachN': {
      const g = ctx.createRadialGradient(LW / 2, LH * 0.47, 10, LW / 2, LH * 0.47, LW * 0.75);
      g.addColorStop(0, '#5a0a10'); g.addColorStop(1, '#0a0204'); ctx.fillStyle = g; ctx.fillRect(0, 0, LW, LH);
      rays(ctx, LW / 2, LH * 0.47, 16, '#ff3a2a', t, 0.08);
      speedLines(ctx, LW / 2, LH * 0.47, '#ffb0a0', S.set.lite ? 8 : 18, 0.25);
      break;
    }
    case 'tengu': {
      skyG(ctx, '#2b0b3a', '#b2401a', '#ffb04a');
      orb(ctx, LW * 0.72, LH * 0.6, 40, '#fff4d0', '#ff8a2a', 'rgba(255,150,60,0.3)');
      ridge(ctx, LH * 0.68, 34, 0.018, 0.045, 0.5, '#5a1a3a');
      ridge(ctx, LH * 0.82, 26, 0.027, 0.06, 3.0, '#2a0a20');
      ridge(ctx, LH * 0.95, 14, 0.05, 0.1, 5.1, '#12040e');
      break;
    }
    case 'orochi': {
      skyG(ctx, '#030c12', '#0b2f35', '#04161a');
      ctx.save(); ctx.globalAlpha = 0.2; ctx.fillStyle = '#123c44';
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(((t * 12 + i * 120) % (LW + 200)) - 100, 30 + i * 18, 110, 16, 0, 0, TAU); ctx.fill(); }
      ctx.restore();
      if (LCD.bolt > 0) {
        ctx.save(); ctx.globalAlpha = LCD.bolt * 0.5; ctx.fillStyle = '#cfffff'; ctx.fillRect(0, 0, LW, LH);
        ctx.globalAlpha = LCD.bolt; ctx.strokeStyle = '#e8ffff'; ctx.lineWidth = 2.5; ctx.beginPath();
        let x = LCD.boltX, y = 0; ctx.moveTo(x, y);
        for (let i = 0; i < 9; i++) { x += rand(-18, 18); y += LH * 0.07; ctx.lineTo(x, y); }
        ctx.stroke(); ctx.restore();
      }
      ridge(ctx, LH * 0.72, 22, 0.022, 0.05, 1.7, '#06181c');
      const g = ctx.createLinearGradient(0, LH * 0.8, 0, LH); g.addColorStop(0, '#08282e'); g.addColorStop(1, '#020a0c');
      ctx.fillStyle = g; ctx.fillRect(0, LH * 0.8, LW, LH * 0.2);
      break;
    }
    case 'kyubi': {
      skyG(ctx, '#040620', '#10204d', '#070c26');
      orb(ctx, LW * 0.5, LH * 0.36, 58, '#ffffff', '#a8c8ff', 'rgba(140,180,255,0.25)');
      for (let i = 0; i < 4; i++) torii(ctx, LW * (0.08 + i * 0.28), LH * 0.98, 0.9 - i * 0.04, '#03051a');
      const g = ctx.createLinearGradient(0, LH * 0.7, 0, LH); g.addColorStop(0, 'rgba(120,160,255,0)'); g.addColorStop(1, 'rgba(120,160,255,0.25)');
      ctx.fillStyle = g; ctx.fillRect(0, LH * 0.7, LW, LH * 0.3);
      break;
    }
    case 'shuten': case 'challenge': {
      skyG(ctx, '#160202', '#6a0d05', '#ff5a1a');
      castle(ctx, LW * 0.7, LH * 0.9, 1.5, '#1a0302');
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 9; i++) {
        const x = LW * 0.42 + i * 26, h = 40 + Math.sin(t * 7 + i * 1.7) * 14 + (i % 3) * 10;
        const g = ctx.createLinearGradient(0, LH * 0.9 - h - 60, 0, LH * 0.9);
        g.addColorStop(0, 'rgba(255,200,60,0)'); g.addColorStop(0.5, 'rgba(255,110,20,0.35)'); g.addColorStop(1, 'rgba(255,60,0,0.6)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 18, LH * 0.9); ctx.quadraticCurveTo(x - 10, LH * 0.9 - h, x + Math.sin(t * 9 + i) * 6, LH * 0.9 - h - 60); ctx.quadraticCurveTo(x + 10, LH * 0.9 - h, x + 18, LH * 0.9); ctx.fill();
      }
      ctx.restore();
      ridge(ctx, LH * 0.95, 10, 0.05, 0.1, 2.0, '#0c0101');
      if (name === 'challenge') { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, LW, LH); }
      break;
    }
    case 'win': case 'zen': case 'bonus': {
      const g = ctx.createRadialGradient(LW / 2, LH / 2, 10, LW / 2, LH / 2, LW * 0.7);
      g.addColorStop(0, name === 'bonus' ? '#ff7a2a' : '#ffd36b'); g.addColorStop(1, name === 'bonus' ? '#3a0606' : '#3a1400');
      ctx.fillStyle = g; ctx.fillRect(0, 0, LW, LH);
      rays(ctx, LW / 2, LH / 2, 18, name === 'zen' ? 'hsl(' + ((t * 90) % 360) + ',100%,70%)' : '#fff3b0', t, 0.16);
      if (name === 'bonus') {
        ctx.save(); ctx.globalAlpha = 0.14; ctx.font = '400 110px ' + F_GOTH; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff'; ctx.fillText('BONUS', LW / 2, LH * 0.52); ctx.restore();
        drawHero(ctx, { x: LW * 0.2, y: LH * 0.98, rot: 0, a: 0.9, pose: 'slash' }, t, 1.15);
      }
      break;
    }
    case 'rush': {
      const g = ctx.createLinearGradient(0, 0, LW, LH); g.addColorStop(0, '#3a0303'); g.addColorStop(0.55, '#8a1a06'); g.addColorStop(1, '#d48a14');
      ctx.fillStyle = g; ctx.fillRect(0, 0, LW, LH);
      rays(ctx, LW / 2, LH * 0.5, 12, '#ffd36b', t * 1.6, 0.1);
      ctx.save(); ctx.translate(LW / 2, LH * 0.5); ctx.rotate(t * 0.4); ctx.globalAlpha = 0.18;
      ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 96, 0, TAU); ctx.stroke();
      ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, 84, 0, TAU); ctx.stroke(); ctx.restore();
      ctx.save(); ctx.globalAlpha = 0.16; ctx.font = '400 96px ' + F_BRUSH; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText('討滅', LW / 2, LH * 0.5); ctx.restore();
      break;
    }
    case 'jitan': {
      skyG(ctx, '#03081e', '#0c2252', '#071234');
      ctx.save(); ctx.strokeStyle = 'rgba(120,190,255,0.25)'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 7; i++) { ctx.beginPath(); for (let x = 0; x <= LW; x += 12) ctx.lineTo(x, LH * (0.3 + i * 0.1) + Math.sin(x * 0.03 + t * 1.5 + i) * 6); ctx.stroke(); }
      ctx.globalAlpha = 0.12; ctx.font = '400 100px ' + F_BRUSH; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#bfe2ff'; ctx.fillText('時短', LW / 2, LH * 0.5);
      ctx.restore();
      break;
    }
    case 'rainbow': {
      const g = ctx.createLinearGradient(0, 0, LW, LH);
      for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, 'hsl(' + ((i * 60 + t * 120) % 360) + ',85%,22%)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, LW, LH);
      rays(ctx, LW / 2, LH * 0.55, 20, 'hsl(' + ((t * 200) % 360) + ',100%,75%)', t * 2, 0.2);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = 'hsla(' + ((i * 120 + t * 160) % 360) + ',100%,60%,0.35)'; ctx.lineWidth = 18;
        ctx.beginPath(); for (let x = -10; x <= LW + 10; x += 12) ctx.lineTo(x, LH * (0.25 + i * 0.12) + Math.sin(x * 0.025 + t * 3 + i) * 16); ctx.stroke();
      }
      ctx.restore();
      break;
    }
    default: {
      skyG(ctx, '#05040a', '#0c0a18', '#05040a');
    }
  }
}
function drawParts(ctx, t) {
  const P = LCD.parts;
  for (let i = 0; i < P.length; i++) {
    const p = P[i], k = p.t / p.life, a = Math.min(1, k * 5, (1 - k) * 3);
    ctx.globalAlpha = clamp(a, 0, 1);
    switch (p.type) {
      case 'petal':
        ctx.fillStyle = '#ffb7d2'; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.scale(1, Math.abs(Math.sin(p.r * 1.7)) * 0.7 + 0.3);
        ctx.beginPath(); ctx.ellipse(0, 0, 3.4 * p.s, 2.2 * p.s, 0, 0, TAU); ctx.fill(); ctx.restore(); break;
      case 'leaf':
        ctx.fillStyle = '#1a0612'; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillRect(-4, -1.5, 8, 3); ctx.restore(); break;
      case 'rain':
        ctx.strokeStyle = 'rgba(170,230,240,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 3, p.y + 12); ctx.stroke(); break;
      case 'ink':
        ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (1 - k * 0.4), 0, TAU); ctx.fill(); break;
      default: {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        if (p.type === 'ember') {
          ctx.fillStyle = k < 0.5 ? '#ffd27a' : '#ff6a1a'; ctx.beginPath(); ctx.arc(p.x + Math.sin(p.t * 6 + p.r) * 4, p.y, 1.6 * p.s, 0, TAU); ctx.fill();
        } else if (p.type === 'fox') {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 9 * p.s); g.addColorStop(0, 'rgba(200,230,255,0.9)'); g.addColorStop(0.4, 'rgba(80,140,255,0.5)'); g.addColorStop(1, 'rgba(40,60,255,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(p.x, p.y - 3 * p.s, 7 * p.s, 11 * p.s, 0, 0, TAU); ctx.fill();
        } else if (p.type === 'fly') {
          ctx.globalAlpha *= 0.5 + 0.5 * Math.sin(p.t * 5 + p.r);
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 5); g.addColorStop(0, p.c); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g; ctx.fillRect(p.x - 5, p.y - 5, 10, 10);
        } else if (p.type === 'spark') {
          ctx.strokeStyle = p.c; ctx.lineWidth = 1.6 * p.s; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke();
        } else {
          ctx.fillStyle = p.c || '#fff1b8'; const s = 2.6 * p.s * (1 - k);
          ctx.beginPath(); ctx.moveTo(p.x, p.y - s * 2); ctx.lineTo(p.x + s * 0.5, p.y); ctx.lineTo(p.x, p.y + s * 2); ctx.lineTo(p.x - s * 0.5, p.y); ctx.closePath(); ctx.fill();
          ctx.beginPath(); ctx.moveTo(p.x - s * 2, p.y); ctx.lineTo(p.x, p.y + s * 0.5); ctx.lineTo(p.x + s * 2, p.y); ctx.lineTo(p.x, p.y - s * 0.5); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }
    }
  }
  ctx.globalAlpha = 1;
}

/* ==========================================================
   キャラクター(シルエット+リムライト)
   ========================================================== */
function heroShape(ctx, pose, t) {
  const sw = Math.sin(t * 3.2) * 3;
  ctx.beginPath();
  ctx.moveTo(-2, -94); ctx.bezierCurveTo(-16, -101, -30 + sw, -97, -42 + sw, -84); ctx.bezierCurveTo(-30 + sw, -88, -18, -86, -6, -84); ctx.closePath();
  ctx.moveTo(13, -88); ctx.ellipse(4, -88, 9, 10, 0, 0, TAU);
  ctx.moveTo(-8, -78); ctx.lineTo(12, -78); ctx.lineTo(16, -54); ctx.lineTo(14, -44); ctx.lineTo(-10, -44); ctx.lineTo(-12, -60); ctx.closePath();
  ctx.moveTo(-8, -78); ctx.bezierCurveTo(-26, -70, -40 + sw * 1.5, -52, -48 + sw * 2, -30); ctx.lineTo(-32 + sw, -34); ctx.lineTo(-22, -26); ctx.lineTo(-10, -44); ctx.closePath();
  ctx.moveTo(-12, -46); ctx.lineTo(14, -46); ctx.lineTo(29, -12); ctx.lineTo(14, -14); ctx.lineTo(4, -26); ctx.lineTo(-6, -14); ctx.lineTo(-27, -12); ctx.closePath();
  ctx.fill();
  ctx.lineCap = 'round'; ctx.lineWidth = 7.5; ctx.beginPath();
  ctx.moveTo(18, -16); ctx.lineTo(26, 0); ctx.moveTo(-18, -16); ctx.lineTo(-29, 0);
  if (pose === 'slash') { ctx.moveTo(10, -72); ctx.lineTo(36, -66); } else { ctx.moveTo(10, -72); ctx.lineTo(24, -58); }
  ctx.stroke();
}
function drawHero(ctx, h, t, sc) {
  if (h.a <= 0.01) return;
  sc = sc || 1.05;
  ctx.save(); ctx.globalAlpha = h.a; ctx.translate(h.x, h.y); ctx.rotate(h.rot || 0); ctx.scale(sc, sc);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 1, 34, 5, 0, 0, TAU); ctx.fill();
  ctx.save(); ctx.translate(-1.6, -1.2); ctx.fillStyle = '#9fe2ff'; ctx.strokeStyle = '#9fe2ff'; heroShape(ctx, h.pose, t); ctx.restore();
  ctx.fillStyle = '#05040a'; ctx.strokeStyle = '#05040a'; heroShape(ctx, h.pose, t);
  const hand = h.pose === 'slash' ? [36, -66] : [24, -58], tip = h.pose === 'slash' ? [96, -72] : [70, -88];
  ctx.lineCap = 'round';
  if (h.rb) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) { ctx.strokeStyle = 'hsla(' + ((i * 60 + t * 400) % 360) + ',100%,60%,0.55)'; ctx.lineWidth = 16 - i * 2; ctx.beginPath(); ctx.moveTo(hand[0], hand[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke(); }
    ctx.restore();
  } else { ctx.strokeStyle = 'rgba(140,220,255,0.45)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(hand[0], hand[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke(); }
  ctx.strokeStyle = '#f2fbff'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(hand[0], hand[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
  ctx.fillStyle = '#05040a'; ctx.beginPath(); ctx.arc(hand[0] + (tip[0] - hand[0]) * 0.1, hand[1] + (tip[1] - hand[1]) * 0.1, 3.5, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#7ff0ff'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(7, -90); ctx.lineTo(12, -89.5); ctx.stroke();
  ctx.restore();
}
function enemyShape(ctx, type, t, lunge) {
  const sw = Math.sin(t * 2.4);
  ctx.beginPath();
  if (type === 'tengu') {
    const fw = Math.sin(t * 3) * 4;
    for (const d of [-1, 1]) {
      ctx.moveTo(d * 8, -86);
      ctx.quadraticCurveTo(d * 40, -128 - fw, d * 84, -128 - fw);
      ctx.lineTo(d * 74, -114 - fw * 0.6); ctx.lineTo(d * 88, -105 - fw * 0.5); ctx.lineTo(d * 72, -95 - fw * 0.4);
      ctx.lineTo(d * 82, -85 - fw * 0.3); ctx.lineTo(d * 64, -79); ctx.lineTo(d * 70, -67); ctx.lineTo(d * 50, -67); ctx.lineTo(d * 16, -72);
      ctx.closePath();
    }
    ctx.moveTo(-17, -84); ctx.lineTo(17, -84); ctx.lineTo(27, 0); ctx.lineTo(-27, 0); ctx.closePath();
    ctx.moveTo(6, -98); ctx.ellipse(-4, -98, 11, 12, 0, 0, TAU);
    ctx.moveTo(-12, -100); ctx.lineTo(-38, -95 + sw); ctx.lineTo(-12, -92); ctx.closePath();
    ctx.moveTo(-8, -108); ctx.lineTo(0, -120); ctx.lineTo(6, -108); ctx.closePath();
    ctx.moveTo(-24, -62); ctx.arc(-34 - lunge * 10, -62, 18, Math.PI * 0.5, Math.PI * 1.5); ctx.closePath();
  } else if (type === 'orochi') {
    ctx.moveTo(56, 0); ctx.ellipse(0, -10, 56, 18, 0, 0, TAU);
    ctx.fill(); ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const bx = -30 + i * 15, hx = -70 + i * 30 + Math.sin(t * 2 + i) * 8 - lunge * 30, hy = -110 - Math.abs(2 - i) * -14 + Math.cos(t * 2.3 + i) * 6;
      ctx.moveTo(bx - 7, -10); ctx.bezierCurveTo(bx - 20, -50, hx - 8, hy + 40, hx - 7, hy + 6); ctx.lineTo(hx + 7, hy + 6); ctx.bezierCurveTo(hx + 8, hy + 40, bx - 4, -50, bx + 7, -10); ctx.closePath();
      ctx.moveTo(hx + 8, hy); ctx.ellipse(hx - 2, hy, 11, 8, -0.3, 0, TAU);
      ctx.moveTo(hx - 10, hy - 2); ctx.lineTo(hx - 24, hy + 2); ctx.lineTo(hx - 10, hy + 6); ctx.closePath();
    }
  } else if (type === 'kyubi') {
    for (let i = 0; i < 9; i++) {
      const a = -0.2 - i * 0.24 + Math.sin(t * 2 + i) * 0.08, L = 70 + (i % 3) * 8;
      const tx = 20 + Math.cos(a) * L, ty = -40 + Math.sin(a) * L;
      ctx.moveTo(18, -36); ctx.bezierCurveTo(30, -60, tx - 20, ty + 10, tx, ty); ctx.bezierCurveTo(tx + 10, ty + 14, 40, -30, 24, -28); ctx.closePath();
    }
    ctx.moveTo(36, -36); ctx.ellipse(0, -36, 36, 21, 0, 0, TAU);
    ctx.moveTo(-26, -50); ctx.ellipse(-40 - lunge * 8, -62, 15, 13, 0, 0, TAU);
    ctx.moveTo(-50, -68); ctx.lineTo(-48, -88); ctx.lineTo(-40, -72); ctx.closePath();
    ctx.moveTo(-36, -72); ctx.lineTo(-30, -90); ctx.lineTo(-28, -70); ctx.closePath();
    ctx.moveTo(-52, -64); ctx.lineTo(-72 - lunge * 8, -58); ctx.lineTo(-50, -55); ctx.closePath();
    for (const lx of [-22, -8, 14, 26]) { ctx.rect(lx - 3, -22, 6, 22); }
  } else {
    for (const d of [-1, 1]) {
      ctx.moveTo(d * 36, 0); ctx.quadraticCurveTo(d * 44, -28, d * 26, -54); ctx.lineTo(d * 8, -54); ctx.quadraticCurveTo(d * 12, -26, d * 14, 0); ctx.closePath();
    }
    ctx.moveTo(-34, -60); ctx.lineTo(34, -60); ctx.lineTo(28, -30); ctx.lineTo(16, -40); ctx.lineTo(5, -26); ctx.lineTo(-6, -40); ctx.lineTo(-18, -28); ctx.lineTo(-29, -38); ctx.closePath();
    ctx.moveTo(-30, -56); ctx.bezierCurveTo(-38, -72, -62, -86, -56, -106); ctx.bezierCurveTo(-30, -122, 30, -122, 56, -106); ctx.bezierCurveTo(62, -86, 38, -72, 30, -56); ctx.closePath();
    ctx.moveTo(-40, -104); ctx.ellipse(-56, -102, 17, 14, -0.3, 0, TAU);
    ctx.moveTo(72, -102); ctx.ellipse(56, -102, 17, 14, 0.3, 0, TAU);
    ctx.moveTo(64, -98); ctx.quadraticCurveTo(80, -74, 70, -50); ctx.lineTo(56, -52); ctx.quadraticCurveTo(64, -74, 50, -94); ctx.closePath();
    ctx.moveTo(74, -48); ctx.arc(64, -48, 10, 0, TAU);
    ctx.moveTo(-66, -106); ctx.quadraticCurveTo(-88, -98, -84, -74); ctx.lineTo(-70, -70); ctx.quadraticCurveTo(-72, -90, -50, -96); ctx.closePath();
    ctx.moveTo(-68, -72); ctx.arc(-77, -72, 10, 0, TAU);
    ctx.moveTo(19, -124); ctx.ellipse(0, -126, 19, 20, 0, 0, TAU);
    ctx.moveTo(-15, -114); ctx.lineTo(0, -98 + sw); ctx.lineTo(15, -114); ctx.closePath();
    ctx.moveTo(-12, -138); ctx.quadraticCurveTo(-24, -156, -18, -170); ctx.quadraticCurveTo(-10, -152, -3, -142); ctx.closePath();
    ctx.moveTo(12, -138); ctx.quadraticCurveTo(24, -156, 18, -170); ctx.quadraticCurveTo(10, -152, 3, -142); ctx.closePath();
    for (let i = 0; i < 7; i++) { const a = -2.8 + i * 0.42; ctx.moveTo(Math.cos(a) * 17, -128 + Math.sin(a) * 17); ctx.lineTo(Math.cos(a + 0.1) * 34, -128 + Math.sin(a + 0.1) * 34 + sw * 2); ctx.lineTo(Math.cos(a + 0.24) * 17, -128 + Math.sin(a + 0.24) * 17); }
    ctx.save(); ctx.translate(-77, -72); ctx.rotate(-0.75 - lunge * 1.2 + sw * 0.05);
    ctx.moveTo(-5, 0); ctx.lineTo(-8, -100); ctx.quadraticCurveTo(0, -108, 8, -100); ctx.lineTo(5, 0); ctx.closePath();
    for (let k = 0; k < 6; k++) { const yy = -30 - k * 13; ctx.moveTo(-8, yy); ctx.lineTo(-12, yy - 4); ctx.lineTo(-8, yy - 8); ctx.moveTo(8, yy); ctx.lineTo(12, yy - 4); ctx.lineTo(8, yy - 8); }
    ctx.restore();
  }
  ctx.fill();
}
function enemyEyes(ctx, type, col, t) {
  const pts = type === 'tengu' ? [[-10, -100]] : type === 'kyubi' ? [[-46, -66]] : type === 'shuten' ? [[-7, -128], [7, -128]] : [];
  if (type === 'orochi') for (let i = 0; i < 5; i++) pts.push([-72 + i * 30 + Math.sin(t * 2 + i) * 8 - LCD.bt.foe.lunge * 30, -112 - Math.abs(2 - i) * -14 + Math.cos(t * 2.3 + i) * 6]);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const p of pts) {
    const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], 8); g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(p[0] - 8, p[1] - 8, 16, 16);
  }
  ctx.restore();
}
function drawEnemy(ctx, B, t) {
  const f = B.foe, D = ENEMY[B.enemy], type = B.enemy;
  if (f.a <= 0.01) return;
  const breathe = 1 + Math.sin(t * 2.2) * 0.012;
  const body = () => {
    ctx.save(); ctx.translate(-2, -1.6); ctx.fillStyle = f.hurt > 0.3 ? '#ffffff' : D.col; enemyShape(ctx, type, t, f.lunge); ctx.restore();
    ctx.fillStyle = '#05030a'; enemyShape(ctx, type, t, f.lunge);
    if (f.hurt > 0) { ctx.save(); ctx.globalAlpha = f.hurt * 0.6; ctx.fillStyle = '#ffffff'; enemyShape(ctx, type, t, f.lunge); ctx.restore(); }
    enemyEyes(ctx, type, type === 'shuten' ? '#ffd23a' : D.col, t);
  };
  ctx.save(); ctx.globalAlpha = f.a * (f.split > 0.6 ? 1 - (f.split - 0.6) / 0.4 : 1);
  ctx.translate(f.x, f.y); ctx.scale(f.s * breathe, f.s * breathe);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 1, 52, 7, 0, 0, TAU); ctx.fill();
  if (f.split <= 0) body();
  else {
    const k = f.split, ang = -0.55, cy = -70;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * k * 16, side * k * 14 * -1 + (side > 0 ? k * 20 : -k * 6));
      ctx.rotate(side * k * 0.1);
      ctx.beginPath();
      const ca = Math.cos(ang), sa = Math.sin(ang), L = 400;
      const nx = -sa * side, ny = ca * side;
      ctx.moveTo(-ca * L, cy - sa * L); ctx.lineTo(ca * L, cy + sa * L);
      ctx.lineTo(ca * L + nx * L, cy + sa * L + ny * L); ctx.lineTo(-ca * L + nx * L, cy - sa * L + ny * L); ctx.closePath();
      ctx.clip(); body(); ctx.restore();
    }
    ctx.save(); ctx.globalAlpha = Math.max(0, 1 - k * 1.5); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-Math.cos(ang) * 120, cy - Math.sin(ang) * 120); ctx.lineTo(Math.cos(ang) * 120, cy + Math.sin(ang) * 120); ctx.stroke(); ctx.restore();
  }
  ctx.restore();
}
function drawAura(ctx, x, y, col, k, t, r) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {
    const ph = t * 6 + i * 1.3, rr = r * (0.8 + 0.25 * Math.sin(ph));
    const g = ctx.createRadialGradient(x, y, 0, x, y, rr); g.addColorStop(0, 'rgba(255,255,255,' + 0.12 * k + ')'); g.addColorStop(0.5, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.18 * k; ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y - i * 3, rr * 0.7, rr, 0, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
function drawBattle(ctx, t) {
  const B = LCD.bt, D = ENEMY[B.enemy];
  if (B.aura > 0.01) {
    drawAura(ctx, B.hero.x, B.hero.y - 52, 'rgba(110,200,255,0.8)', B.aura, t, 80);
    drawAura(ctx, B.foe.x, B.foe.y - 70 * B.foe.s, D.col, B.aura, t, 100 * B.foe.s);
  }
  drawEnemy(ctx, B, t);
  drawHero(ctx, B.hero, t);
}

/* ==========================================================
   HUD(保留・モード表示・ボタン)
   ========================================================== */
function drawIcon(ctx, x, y, r, col, t) {
  ctx.save();
  if (RANK[col] >= 3) {
    const g = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 2.4);
    g.addColorStop(0, col === 'red' ? 'rgba(255,60,40,0.6)' : 'rgba(255,220,100,0.7)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.4, 0, TAU); ctx.fill();
  }
  if (col === 'rainbow') {
    for (let i = 0; i < 6; i++) { ctx.fillStyle = 'hsl(' + ((i * 60 + t * 200) % 360) + ',100%,60%)'; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, i / 6 * TAU, (i + 1) / 6 * TAU); ctx.closePath(); ctx.fill(); }
  } else {
    const c = COL[col] || COL.white, g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    g.addColorStop(0, c[0]); g.addColorStop(1, c[1]); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ctx.ellipse(x - r * 0.35, y - r * 0.4, r * 0.35, r * 0.2, -0.5, 0, TAU); ctx.fill();
  ctx.restore();
}
function drawHUD(ctx, t) {
  const ds = densapo(), main = ds ? S.hold2 : S.hold1, sub = ds ? S.hold1 : S.hold2, mo = ds ? 4 : 0;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(LW / 2, LH - 12, 30, 7, 0, 0, TAU); ctx.fill();
  for (let i = 0; i < 4; i++) {
    const x = 20 + i * 20, y = LH - 13;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 6.5, 0, TAU); ctx.stroke();
    const e = main[i];
    if (e) {
      const pp = LCD.pop[mo + i], hf = LCD.holdFx[i];
      drawIcon(ctx, x, y - pp * 6, 6.5 * (1 + pp * 0.5 + hf * 0.4), e.shown, t);
      if (hf > 0) { ctx.strokeStyle = 'rgba(255,255,255,' + hf + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 6 + (1 - hf) * 16, 0, TAU); ctx.stroke(); }
    }
  }
  for (let i = 0; i < sub.length; i++) drawIcon(ctx, LW - 70 + i * 11, LH - 10, 3.6, sub[i].shown, t);
  if (S.cur) {
    const e = S.cur.e, k = LCD.curFx;
    drawIcon(ctx, LW / 2, LH - 16, 9 * (1 + k * 0.5), e.shown, t);
    if (k > 0) { ctx.strokeStyle = 'rgba(255,255,255,' + k + ')'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(LW / 2, LH - 16, 9 + (1 - k) * 26, 0, TAU); ctx.stroke(); }
  }
  ctx.textBaseline = 'middle';
  if (S.mode !== 'normal' && !S.bonus) {
    const st = S.mode === 'st';
    ctx.textAlign = 'right'; ctx.font = '400 13px ' + F_GOTH;
    const lab = (st ? 'RUSH 残り ' : '時短 残り ') + S.modeCnt + '回';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(lab, LW - 8, 14);
    ctx.fillStyle = st ? '#ffd36b' : '#8fd3ff'; ctx.fillText(lab, LW - 8, 14);
    if (st && S.data.chain > 0) {
      const c2 = S.data.chain + '連中  ' + fmt(S.data.chainPay) + '個';
      ctx.font = '800 11px ' + F_MIN; ctx.strokeText(c2, LW - 8, 30); ctx.fillStyle = '#ffffff'; ctx.fillText(c2, LW - 8, 30);
    }
  }
  const b = S.bonus;
  if (b && b.phase !== 'intro' && b.phase !== 'ending') {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(LW - 150, 6, 144, 48);
    ctx.strokeStyle = '#ffd36b'; ctx.lineWidth = 1.5; ctx.strokeRect(LW - 148, 8, 140, 44);
    ctx.textAlign = 'left'; ctx.font = '400 15px ' + F_GOTH; ctx.fillStyle = '#ffd36b';
    ctx.fillText('ROUND ' + Math.max(1, b.round) + '/' + b.rounds, LW - 140, 21);
    ctx.font = '800 12px ' + F_MIN; ctx.fillStyle = '#ffffff';
    ctx.fillText('カウント ' + Math.min(b.count, 99) + '/' + SPEC.atkMax + '   獲得 ' + fmt(b.pay), LW - 140, 40);
    if (b.premium || b.loops) stampText(ctx, b.premium ? 'PREMIUM' : 'MAXループ ×' + b.loops, LW - 78, 68, 15, 'rainbow', F_GOTH, t);
    if (b.challenge && !b.chDone) {
      const rem = b.rounds - Math.max(1, b.round) + (b.phase === 'open' ? 1 : 0);
      stampText(ctx, rem > 0 ? '決戦まで あと' + rem + 'R' : '決戦へ', LW / 2, LH * 0.5, 24, 'red', F_MIN, t);
    }
  }
  const needR = (S.bonus && S.bonus.phase !== 'ending') || (densapo() && !DIR.busy) || (densapo() && S.cur);
  if (needR) {
    const blink = 0.55 + 0.45 * Math.sin(t * 8);
    ctx.globalAlpha = blink; ctx.textAlign = 'right'; ctx.font = '400 16px ' + F_GOTH;
    ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.strokeText('右打ち ▶▶', LW - 8, LH * 0.82);
    ctx.fillStyle = '#ff4a3a'; ctx.fillText('右打ち ▶▶', LW - 8, LH * 0.82); ctx.globalAlpha = 1;
  }
  if (S.warnShow > 0) {
    const a = Math.min(1, S.warnShow * 2);
    ctx.globalAlpha = a; ctx.fillStyle = 'rgba(160,0,0,0.85)'; ctx.fillRect(0, LH * 0.62, LW, 30);
    ctx.textAlign = 'center'; ctx.font = '800 16px ' + F_MIN; ctx.fillStyle = '#ffffff';
    ctx.fillText(S.warnWhich === 'right' ? '右打ちしてください' : '左打ちに戻してください', LW / 2, LH * 0.62 + 15);
    ctx.globalAlpha = 1;
  }
  if (Push.active) {
    if (Roul.on) { ctx.save(); ctx.translate(LW / 2, LH * 0.9); ctx.scale(0.45, 0.45); ctx.translate(-LW / 2, -LH * 0.56); drawPushPrompt(ctx, t); ctx.restore(); }
    else drawPushPrompt(ctx, t);
  }
  ctx.restore();
}
function drawLeverPrompt(ctx, t, k) {
  const x = LW / 2, y = LH * 0.58, P = Push;
  ctx.save(); ctx.globalAlpha = k;
  for (let i = 0; i < 3; i++) {
    const rr = 44 + ((t * 70 + i * 22) % 66);
    ctx.strokeStyle = 'rgba(255,210,90,' + (1 - (rr - 44) / 66) + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.stroke();
  }
  const shake = Math.sin(t * 60) * 2, pull = P.done ? 26 : 0;
  ctx.translate(x + shake, y);
  ctx.fillStyle = '#0a0406'; ctx.strokeStyle = '#d8b25a'; ctx.lineWidth = 2;
  ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(-9, -46, 18, 92, 9); else ctx.rect(-9, -46, 18, 92); ctx.fill(); ctx.stroke();
  const g = ctx.createLinearGradient(-4, 0, 4, 0); g.addColorStop(0, '#8a8a92'); g.addColorStop(0.5, '#f4f4f6'); g.addColorStop(1, '#5a5a62');
  ctx.fillStyle = g; ctx.fillRect(-4, -40 + pull, 8, 44);
  const bg = ctx.createRadialGradient(-6, -46 + pull, 2, 0, -40 + pull, 18);
  bg.addColorStop(0, '#fff6c0'); bg.addColorStop(0.5, '#f0b020'); bg.addColorStop(1, '#6a3a00');
  ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(0, -40 + pull, 16, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.save(); ctx.globalAlpha = k; stampText(ctx, 'レバーを引け!!', x, y - 74, 24, 'gold', F_MIN, t); ctx.restore();
}
function drawPushPrompt(ctx, t) {
  const P = Push, k = P.done ? Math.max(0, 1 - P.doneT * 4) : Math.min(1, P.t * 6);
  if (k <= 0) return;
  if (P.type === 'lever') { drawLeverPrompt(ctx, t, k); return; }
  const x = LW / 2, y = LH * 0.56, pulse = 1 + 0.06 * Math.sin(t * 14);
  ctx.save(); ctx.globalAlpha = k; ctx.translate(x, y); ctx.scale(pulse, pulse);
  for (let i = 0; i < 3; i++) {
    const rr = 40 + ((t * 60 + i * 20) % 60);
    ctx.strokeStyle = P.type === 'sword' ? 'rgba(255,210,90,' + (1 - (rr - 40) / 60) + ')' : 'rgba(255,60,40,' + (1 - (rr - 40) / 60) + ')';
    ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke();
  }
  const g = ctx.createRadialGradient(-10, -12, 4, 0, 0, 42);
  if (P.type === 'sword') { g.addColorStop(0, '#fff6c0'); g.addColorStop(0.5, '#f0b020'); g.addColorStop(1, '#6a3a00'); }
  else { g.addColorStop(0, '#ffb0a0'); g.addColorStop(0.5, '#e01818'); g.addColorStop(1, '#4a0000'); }
  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(0, 4, 42, 0, TAU); ctx.fill();
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 40, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 36, Math.PI * 1.1, Math.PI * 1.7); ctx.stroke();
  if (P.type === 'sword') stampText(ctx, '剣', 0, 2, 40, 'white', F_BRUSH, t);
  else { ctx.font = '400 20px ' + F_GOTH; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText('PUSH', 0, 2); }
  ctx.restore();
  ctx.save(); ctx.globalAlpha = k;
  const label = P.type === 'rapid' ? '連打!!' : P.type === 'sword' ? '剣ボタンを押せ!!' : 'ボタンを押せ!';
  stampText(ctx, label, x, y - 62, 24, P.type === 'sword' ? 'gold' : 'red', F_MIN, t);
  if (P.type === 'rapid') {
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x - 70, y + 52, 140, 12);
    const gg = ctx.createLinearGradient(x - 70, 0, x + 70, 0); gg.addColorStop(0, '#ff3a2a'); gg.addColorStop(1, '#ffd36b');
    ctx.fillStyle = gg; ctx.fillRect(x - 68, y + 54, 136 * clamp(P.gauge, 0, 1), 8);
  }
  ctx.restore();
}

/* ==========================================================
   液晶の合成
   ========================================================== */
function drawLCD(ctx, t, pxScale) {
  const L = LCD;
  ctx.save(); ctx.translate(L.sx, L.sy);
  if (L.prev && L.bgK < 1) {
    drawBg(ctx, L.prev, t);
    const w = Math.max(1, Math.ceil(LW * pxScale)), h = Math.max(1, Math.ceil(LH * pxScale));
    if (!L.tmp) L.tmp = document.createElement('canvas');
    if (L.tmp.width !== w || L.tmp.height !== h) { L.tmp.width = w; L.tmp.height = h; }
    const g = L.tmp.getContext('2d'); g.setTransform(pxScale, 0, 0, pxScale, 0, 0); g.clearRect(0, 0, LW, LH);
    drawBg(g, L.bg, t);
    ctx.globalAlpha = L.bgK; ctx.drawImage(L.tmp, 0, 0, LW, LH); ctx.globalAlpha = 1;
  } else drawBg(ctx, L.bg, t);
  if (L.dark > 0) { ctx.fillStyle = 'rgba(0,0,0,' + L.dark + ')'; ctx.fillRect(-10, -10, LW + 20, LH + 20); }
  drawParts(ctx, t);
  if (L.bt.on) drawBattle(ctx, t);
  if (L.rb.on) drawRainbowScene(ctx, t);
  if (Roul.on) drawRoul(ctx, t);
  for (const f of L.fx) if (f.layer === 1) f.draw(ctx, f);
  if (!Roul.on || Reels.mini > 0.5) drawReels(ctx, t);
  drawHUD(ctx, t);
  for (const f of L.fx) if (f.layer === 2) f.draw(ctx, f);
  if (L.desat > 0.01) {
    ctx.save(); ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = 'rgba(128,128,128,' + L.desat + ')';
    ctx.fillRect(-10, -10, LW + 20, LH + 20); ctx.restore();
  }
  if (L.black > 0) { ctx.fillStyle = 'rgba(0,0,0,' + L.black + ')'; ctx.fillRect(-10, -10, LW + 20, LH + 20); }
  ctx.restore();
  if (L.fl > 0) { ctx.save(); ctx.globalAlpha = Math.min(1, L.fl); ctx.fillStyle = L.flC; ctx.fillRect(0, 0, LW, LH); ctx.restore(); }
  const vg = ctx.createRadialGradient(LW / 2, LH / 2, LH * 0.45, LW / 2, LH / 2, LW * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, LW, LH);
}

/* ==========================================================
   盤面描画
   ========================================================== */
const BW = PHYS.W, BH = PHYS.H, LC = PHYS.LCD;
const ZOOM = BW / (LC.w + 20), LCDCX = LC.x + LC.w / 2, LCDCY = LC.y + LC.h / 2;
const R = { cv: null, ctx: null, scale: 1, cache: null, ball: null };
const Board = {
  fl: { heso: 0, den: 0, atk: 0, gate: 0, warp: 0, stageC: 0 },
  shk: 0,
  flash(k) { this.fl[k] = 1; },
  shake(a) { this.shk = Math.max(this.shk, a); },
  update(dt) { for (const k in this.fl) this.fl[k] = Math.max(0, this.fl[k] - dt * 2.5); this.shk = Math.max(0, this.shk - dt * 40); }
};
const Hand = {
  st: 'up', t: 0, y: 0, col: 'red',
  drop(col) { this.st = 'drop'; this.t = 0; this.col = col || 'red'; },
  update(dt) {
    if (this.st === 'up') return;
    this.t += dt;
    if (this.st === 'drop') { this.y = E.outB(Math.min(1, this.t / 0.32)); if (this.t > 2.0) { this.st = 'rise'; this.t = 0; } }
    else if (this.st === 'rise') { this.y = 1 - E.ioC(Math.min(1, this.t / 0.5)); if (this.t >= 0.5) { this.st = 'up'; this.y = 0; } }
  }
};
const Nyo = {
  st: 'off', t: 0, col: 'white',
  start(col) { this.st = 'on'; this.t = 0; this.col = col; },
  update(dt) { if (this.st === 'off') return; this.t += dt; if (this.t > 2.3) this.st = 'off'; }
};
const Gimmick = {
  y: 0, st: 'up', t: 0,
  drop() { this.st = 'drop'; this.t = 0; },
  update(dt) {
    this.t += dt;
    if (this.st === 'drop') { this.y = E.outB(Math.min(1, this.t / 0.45)) * 92; if (this.t > 2.2) { this.st = 'rise'; this.t = 0; } }
    else if (this.st === 'rise') { this.y = 92 * (1 - E.ioC(Math.min(1, this.t / 0.6))); if (this.t >= 0.6) { this.st = 'up'; this.y = 0; } }
  }
};
function metal(g, x0, y0, x1, y1) {
  const m = g.createLinearGradient(x0, y0, x1, y1);
  m.addColorStop(0, '#f6f6f6'); m.addColorStop(0.45, '#8c8c90'); m.addColorStop(0.55, '#5a5a60'); m.addColorStop(1, '#e8e8ec');
  return m;
}
function cloudScroll(g, x, y, s, a) {
  g.save(); g.translate(x, y); g.scale(s, s); g.globalAlpha = a; g.strokeStyle = '#d8b25a'; g.lineWidth = 2;
  g.beginPath(); g.arc(0, 0, 10, Math.PI, Math.PI * 2.6); g.stroke();
  g.beginPath(); g.arc(-12, 6, 7, Math.PI * 1.2, Math.PI * 2.7); g.stroke();
  g.beginPath(); g.arc(13, 5, 6, Math.PI * 0.9, Math.PI * 2.3); g.stroke();
  g.beginPath(); g.moveTo(-26, 12); g.quadraticCurveTo(0, 18, 26, 12); g.stroke();
  g.restore();
}
function buildStatic() {
  const c = R.cache || (R.cache = document.createElement('canvas'));
  c.width = R.cv.width; c.height = R.cv.height;
  const g = c.getContext('2d');
  g.setTransform(R.scale, 0, 0, R.scale, 0, 0);
  const { CX, CY, RAIL_R, RI, RF } = PHYS;
  // 筐体フェイス
  let lg = g.createLinearGradient(0, 0, BW, BH); lg.addColorStop(0, '#2a1012'); lg.addColorStop(0.5, '#140709'); lg.addColorStop(1, '#090304');
  g.fillStyle = lg; g.fillRect(0, 0, BW, BH);
  for (const [x, y, s] of [[40, 40, 1.4], [560, 40, 1.4], [40, 650, 1.2], [560, 645, 1.0]]) cloudScroll(g, x, y, s, 0.55);
  g.strokeStyle = 'rgba(216,178,90,0.55)'; g.lineWidth = 1.2; g.beginPath(); g.arc(CX, CY, RAIL_R + 19, 0, TAU); g.stroke();
  g.fillStyle = '#100608'; g.beginPath(); g.arc(CX, CY, RAIL_R + 15, 0, TAU); g.fill();
  // 盤面
  g.save(); g.beginPath(); g.arc(CX, CY, RAIL_R, 0, TAU); g.clip();
  let rg = g.createRadialGradient(CX, CY - 60, 40, CX, CY, RAIL_R);
  rg.addColorStop(0, '#2c3778'); rg.addColorStop(0.6, '#161c48'); rg.addColorStop(1, '#090b22');
  g.fillStyle = rg; g.fillRect(0, 0, BW, BH);
  g.strokeStyle = 'rgba(120,150,255,0.09)'; g.lineWidth = 1.2;
  for (let row = 0; row < 9; row++) {
    for (let col = -1; col < 14; col++) {
      const x = col * 48 + (row % 2) * 24, y = 470 + row * 22;
      for (let k = 1; k <= 3; k++) { g.beginPath(); g.arc(x, y, k * 8, Math.PI, TAU); g.stroke(); }
    }
  }
  g.save(); g.globalAlpha = 0.07; g.font = '400 190px ' + F_BRUSH; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffffff';
  g.fillText('斬', 170, 560); g.fillText('鬼', 470, 230); g.restore();
  for (const [x, y, s] of [[60, 180, 0.9], [540, 470, 0.8], [200, 610, 0.9], [420, 610, 0.8], [62, 560, 0.7]]) cloudScroll(g, x, y, s, 0.22);
  const lt = g.createLinearGradient(0, CY - RAIL_R, 0, CY); lt.addColorStop(0, 'rgba(255,255,255,0.08)'); lt.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = lt; g.fillRect(0, 0, BW, CY);
  g.restore();
  // 発射レール
  g.strokeStyle = '#05050a'; g.lineWidth = RAIL_R - RI; g.beginPath(); g.arc(CX, CY, (RAIL_R + RI) / 2, 138 * Math.PI / 180, 206 * Math.PI / 180); g.stroke();
  g.strokeStyle = metal(g, 0, 0, BW, BH); g.lineWidth = 4; g.beginPath(); g.arc(CX, CY, RAIL_R + 2, 0, TAU); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1; g.beginPath(); g.arc(CX, CY, RAIL_R + 0.5, Math.PI * 1.05, Math.PI * 1.6); g.stroke();
  g.strokeStyle = metal(g, 0, 300, 120, 500); g.lineWidth = 3; g.beginPath(); g.arc(CX, CY, RI, 138 * Math.PI / 180, 206 * Math.PI / 180); g.stroke();
  const fl = BOARD.flap; g.strokeStyle = '#2a2a30'; g.lineWidth = 3; g.beginPath(); g.moveTo(fl.ax, fl.ay); g.lineTo(fl.bx, fl.by); g.stroke();
  // 返しゴム
  const rb = BOARD.rubber; g.lineCap = 'round';
  g.strokeStyle = '#7a0a0a'; g.lineWidth = 7; g.beginPath(); g.moveTo(rb[0][0], rb[0][1]); g.lineTo(rb[1][0], rb[1][1]); g.stroke();
  g.strokeStyle = '#e03030'; g.lineWidth = 4; g.stroke();
  // センター役物
  const fp = BOARD.frame;
  g.save();
  g.beginPath(); g.moveTo(fp[0][0], fp[0][1]); for (const p of fp) g.lineTo(p[0], p[1]); g.closePath();
  g.shadowColor = 'rgba(0,0,0,0.7)'; g.shadowBlur = 14; g.shadowOffsetY = 4;
  lg = g.createLinearGradient(0, 80, 0, 440); lg.addColorStop(0, '#5a0d12'); lg.addColorStop(0.5, '#2a0508'); lg.addColorStop(1, '#3c080c');
  g.fillStyle = lg; g.fill(); g.restore();
  g.save(); g.beginPath(); g.moveTo(fp[0][0], fp[0][1]); for (const p of fp) g.lineTo(p[0], p[1]); g.closePath();
  g.strokeStyle = '#d8b25a'; g.lineWidth = 2.5; g.stroke(); g.strokeStyle = 'rgba(255,230,160,0.35)'; g.lineWidth = 1; g.stroke(); g.restore();
  // 役物上部の紋
  g.save(); g.translate(300, 100);
  g.strokeStyle = '#d8b25a'; g.lineWidth = 2;
  for (const d of [-1, 1]) { g.beginPath(); g.moveTo(d * 18, 0); g.bezierCurveTo(d * 50, -8, d * 80, 4, d * 120, 6); g.stroke(); g.beginPath(); g.moveTo(d * 20, 6); g.bezierCurveTo(d * 52, 2, d * 76, 12, d * 104, 12); g.stroke(); }
  g.fillStyle = '#1a0406'; g.beginPath(); g.arc(0, 0, 15, 0, TAU); g.fill(); g.stroke();
  g.font = '400 20px ' + F_BRUSH; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#f2c86a'; g.fillText('斬', 0, 1);
  g.restore();
  // 液晶ベゼル
  g.fillStyle = '#030204'; g.beginPath(); rrect(g, LC.x - 7, LC.y - 7, LC.w + 14, LC.h + 14, 8); g.fill();
  g.strokeStyle = '#d8b25a'; g.lineWidth = 1.2; g.beginPath(); rrect(g, LC.x - 4, LC.y - 4, LC.w + 8, LC.h + 8, 6); g.stroke();
  // LEDスロット
  g.fillStyle = '#0a0204';
  g.fillRect(113, 150, 10, 222); g.fillRect(477, 150, 10, 222);
  // ワープ
  g.save(); g.lineCap = 'round';
  g.strokeStyle = 'rgba(255,200,120,0.16)'; g.lineWidth = 15; bezPath(g, BOARD.warpPath); g.stroke();
  g.strokeStyle = 'rgba(255,230,180,0.35)'; g.lineWidth = 1; bezPath(g, BOARD.warpPath); g.stroke();
  g.fillStyle = '#000'; g.beginPath(); g.ellipse(110, 338, 5, 9, 0, 0, TAU); g.fill();
  g.strokeStyle = '#d8b25a'; g.lineWidth = 1.5; g.stroke();
  g.restore();
  // ステージ
  const ST = PHYS.ST;
  g.save();
  g.beginPath(); g.moveTo(ST.x0 - 4, 382); for (let x = ST.x0 - 4; x <= ST.x1 + 4; x += 4) g.lineTo(x, PHYS.stY(clamp(x, ST.x0, ST.x1))); g.lineTo(ST.x1 + 4, 430); g.lineTo(ST.x0 - 4, 430); g.closePath();
  lg = g.createLinearGradient(0, 390, 0, 430); lg.addColorStop(0, 'rgba(255,150,80,0.55)'); lg.addColorStop(1, 'rgba(90,10,10,0.9)');
  g.fillStyle = lg; g.fill();
  g.beginPath(); for (let x = ST.x0; x <= ST.x1; x += 4) { const y = PHYS.stY(x); x === ST.x0 ? g.moveTo(x, y) : g.lineTo(x, y); }
  g.strokeStyle = '#ffd9a0'; g.lineWidth = 1.5; g.stroke();
  for (const hx of [BOARD.P.stageSide, 600 - BOARD.P.stageSide]) { g.fillStyle = '#1a0204'; g.fillRect(hx - 7, PHYS.stY(hx) - 1, 14, 4); }
  g.fillStyle = '#000'; g.fillRect(293, PHYS.stY(300) - 1, 14, 5);
  g.restore();
  // 道具類(壁・ガイド・棚)
  g.lineCap = 'round';
  for (const s of BOARD.segs) {
    if (s.kind === 'frame' || s.kind === 'heso' || s.kind === 'pocket' || s.kind === 'lidD' || s.kind === 'lidA' || s.kind === 'rubber') continue;
    if (s.kind === 'shelf') { g.strokeStyle = '#4a0a0e'; g.lineWidth = 6; }
    else { g.strokeStyle = metal(g, s.ax, s.ay, s.bx, s.by); g.lineWidth = 3; }
    g.beginPath(); g.moveTo(s.ax, s.ay); g.lineTo(s.bx, s.by); g.stroke();
  }
  // 電チュー・アタッカーの筐体
  const sy = PHYS.shelfY, DEN = PHYS.DEN, ATK = PHYS.ATK;
  g.save();
  g.fillStyle = '#3a0608'; g.strokeStyle = '#d8b25a'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(ATK[0] - 4, sy(ATK[0] - 4) + 3); g.lineTo(ATK[1] + 4, sy(ATK[1] + 4) + 3); g.lineTo(ATK[1] + 4, sy(ATK[1] + 4) + 20); g.lineTo(ATK[0] - 4, sy(ATK[0] - 4) + 20); g.closePath(); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(DEN[0] - 3, sy(DEN[0] - 3) + 3); g.lineTo(DEN[1] + 3, sy(DEN[1] + 3) + 3); g.lineTo(DEN[1] + 3, sy(DEN[1] + 3) + 18); g.lineTo(DEN[0] - 3, sy(DEN[0] - 3) + 18); g.closePath(); g.fill(); g.stroke();
  g.font = '400 7px ' + F_GOTH; g.fillStyle = '#f2c86a'; g.textAlign = 'center';
  g.fillText('ATTACKER', (ATK[0] + ATK[1]) / 2, sy((ATK[0] + ATK[1]) / 2) + 16);
  g.fillText('電チュー', (DEN[0] + DEN[1]) / 2, sy((DEN[0] + DEN[1]) / 2) + 15);
  g.restore();
  // スルーゲート
  const gt = BOARD.gate;
  g.strokeStyle = '#d8b25a'; g.lineWidth = 2; g.beginPath(); g.arc(gt.x, gt.y, 13, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
  g.fillStyle = '#d8b25a'; g.beginPath(); g.arc(gt.x - 13, gt.y + 4, 2.4, 0, TAU); g.arc(gt.x + 13, gt.y + 4, 2.4, 0, TAU); g.fill();
  // ヘソ
  const hs = BOARD.heso;
  g.save(); g.translate(hs.x, hs.y);
  g.fillStyle = '#5a0a0e'; g.strokeStyle = '#f2c86a'; g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(-hs.g - 8, 2); g.lineTo(-hs.g, -2); g.lineTo(-hs.g + 1.5, 20); g.lineTo(hs.g - 1.5, 20); g.lineTo(hs.g, -2); g.lineTo(hs.g + 8, 2); g.lineTo(hs.g + 6, 26); g.lineTo(-hs.g - 6, 26); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#000'; g.fillRect(-hs.g + 2, 2, hs.g * 2 - 4, 16);
  g.font = '400 6px ' + F_GOTH; g.fillStyle = '#f2c86a'; g.textAlign = 'center'; g.fillText('START', 0, 24.5);
  for (const d of [-1, 1]) { g.beginPath(); g.moveTo(d * (hs.g + 8), 2); g.quadraticCurveTo(d * (hs.g + 22), -4, d * (hs.g + 26), 10); g.quadraticCurveTo(d * (hs.g + 16), 6, d * (hs.g + 6), 14); g.closePath(); g.fillStyle = '#7a0e14'; g.fill(); g.stroke(); }
  g.restore();
  // 一般入賞口
  for (const p of BOARD.pockets) {
    g.fillStyle = '#5a0a0e'; g.strokeStyle = '#f2c86a'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(p.x - 11, p.y - 6); g.lineTo(p.x - 8, p.y - 6); g.lineTo(p.x - 7.5, p.y + 8); g.lineTo(p.x + 7.5, p.y + 8); g.lineTo(p.x + 8, p.y - 6); g.lineTo(p.x + 11, p.y - 6); g.lineTo(p.x + 10, p.y + 12); g.lineTo(p.x - 10, p.y + 12); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#000'; g.fillRect(p.x - 6.5, p.y - 5, 13, 12);
  }
  // 釘
  for (const n of BOARD.nails) {
    if (n.kind === 'cap') continue;
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.arc(n.x + 1.1, n.y + 1.6, 2.5, 0, TAU); g.fill();
    const ng = g.createRadialGradient(n.x - 0.8, n.y - 0.8, 0.2, n.x, n.y, 2.6);
    ng.addColorStop(0, '#ffffff'); ng.addColorStop(0.4, '#d8d0bc'); ng.addColorStop(1, '#6a6254');
    g.fillStyle = ng; g.beginPath(); g.arc(n.x, n.y, 2.5, 0, TAU); g.fill();
  }
  // 表示パネル(右下)
  g.fillStyle = '#050304'; g.strokeStyle = '#d8b25a'; g.lineWidth = 1; g.beginPath(); rrect(g, 500, 628, 92, 54, 5); g.fill(); g.stroke();
  g.font = '400 7px ' + F_GOTH; g.fillStyle = '#b89a5a'; g.textAlign = 'left';
  g.fillText('特図1', 506, 640); g.fillText('特図2', 506, 656); g.fillText('普図', 506, 672);
  g.font = '400 18px ' + F_BRUSH; g.fillStyle = '#d8b25a'; g.fillText('斬鬼', 18, 676);
  g.font = '400 8px ' + F_MIN; g.fillStyle = '#9a7a4a'; g.fillText('百鬼夜行', 64, 676);
}
function rrect(g, x, y, w, h, r) {
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}
function bezPath(g, p) { g.beginPath(); g.moveTo(p[0][0], p[0][1]); g.bezierCurveTo(p[1][0], p[1][1], p[2][0], p[2][1], p[3][0], p[3][1]); }
function buildBallSprite() {
  const s = Math.min(6, R.scale * ZOOM), size = Math.ceil(14 * s);
  const c = R.ball || (R.ball = document.createElement('canvas'));
  c.width = size; c.height = size;
  const g = c.getContext('2d'); g.setTransform(s, 0, 0, s, 0, 0);
  const r = PHYS.BALL_R;
  const rg = g.createRadialGradient(5, 5, 0.5, 7, 7, r);
  rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.25, '#e4e8ee'); rg.addColorStop(0.7, '#8a9098'); rg.addColorStop(1, '#3a3e46');
  g.fillStyle = rg; g.beginPath(); g.arc(7, 7, r, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,120,80,0.35)'; g.beginPath(); g.ellipse(7.5, 10.5, 3.4, 1.2, 0, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.ellipse(5, 4.6, 1.6, 1.1, -0.6, 0, TAU); g.fill();
}

/* ---------- ランプ ---------- */
function curLamp() {
  if (S.lampOT > 0 && S.lampO) return S.lampO;
  if (S.bonus) return 'bonus';
  if (S.mode === 'st') return 'rush';
  if (S.mode === 'jitan') return 'jitan';
  return 'idle';
}
function lampCol(m, i, n, t) {
  switch (m) {
    case 'chance': return (Math.floor(t * 14) + i) % 2 ? 'rgba(255,40,30,1)' : 'rgba(255,255,255,0.9)';
    case 'red': return 'rgba(255,' + Math.floor(30 + 40 * Math.sin(t * 10)) + ',20,' + (0.7 + 0.3 * Math.sin(t * 10)) + ')';
    case 'gold': return ((i + Math.floor(t * 24)) % 6 < 3) ? '#ffd36b' : 'rgba(255,140,20,0.6)';
    case 'rainbow': return 'hsl(' + ((i / n * 360 + t * 420) % 360) + ',100%,62%)';
    case 'bonus': return ((i + Math.floor(t * 16)) % 4 < 2) ? '#ffcf4a' : '#ff3a2a';
    case 'rush': return 'hsl(' + ((i / n * 120 + t * 160) % 120 + 0) + ',100%,58%)';
    case 'jitan': { const d = ((i - t * 18) % n + n) % n; return d < 8 ? 'rgba(90,180,255,' + (1 - d / 8) + ')' : 'rgba(40,80,160,0.25)'; }
    default: { const d = ((i - t * 9) % n + n) % n; return d < 10 ? 'rgba(255,' + Math.floor(120 + d * 10) + ',60,' + (1 - d / 10) + ')' : 'rgba(120,30,20,0.3)'; }
  }
}
function drawLamps(g, t) {
  const m = curLamp(), n = 64, { CX, CY, RAIL_R } = PHYS;
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU - Math.PI / 2, x = CX + Math.cos(a) * (RAIL_R + 9), y = CY + Math.sin(a) * (RAIL_R + 9);
    g.fillStyle = lampCol(m, i, n, t); g.beginPath(); g.arc(x, y, 3, 0, TAU); g.fill();
  }
  for (let i = 0; i < 12; i++) {
    const y = 154 + i * 18;
    g.fillStyle = lampCol(m, i + 30, 24, t); g.fillRect(114.5, y, 7, 13);
    g.fillStyle = lampCol(m, 12 - i, 24, t); g.fillRect(478.5, y, 7, 13);
  }
}
function drawRbBoard(g, t) {
  const k = clamp(S.rbT / 3.5, 0, 1), { CX, CY, RAIL_R } = PHYS;
  g.save(); g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 24; i++) {
    const a0 = i / 24 * TAU + t * 3;
    g.strokeStyle = 'hsla(' + ((i * 15 + t * 500) % 360) + ',100%,60%,' + (0.8 * k) + ')'; g.lineWidth = 10 + 10 * k;
    g.beginPath(); g.arc(CX, CY, RAIL_R + 9, a0, a0 + TAU / 24 + 0.02); g.stroke();
  }
  if (k > 0.75) { g.fillStyle = 'hsla(' + ((t * 600) % 360) + ',100%,60%,' + ((k - 0.75) * 1.2) + ')'; g.fillRect(0, 0, BW, BH); }
  g.restore();
}
// 鬼の大手(上から落下する激アツ役物)
function drawHand(g, t) {
  if (Hand.y <= 0.01) return;
  const rb = Hand.col === 'rainbow';
  const shk = Hand.st === 'drop' && Hand.t < 1.2 ? Math.sin(t * 70) * 3 * (1 - Hand.t / 1.2) : 0;
  g.save(); g.translate(300 + shk, lerp(-230, 178, Hand.y)); g.rotate(0.06); g.scale(1.18, 1.18);
  const hue = (t * 200) % 360;
  const glow = g.createRadialGradient(0, 40, 20, 0, 40, 200);
  glow.addColorStop(0, rb ? 'hsla(' + hue + ',100%,65%,0.6)' : 'rgba(255,40,30,0.55)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = glow; g.fillRect(-210, -160, 420, 400);
  const skin = g.createLinearGradient(-90, -220, 90, 160);
  if (rb) { skin.addColorStop(0, 'hsl(' + hue + ',75%,48%)'); skin.addColorStop(0.5, 'hsl(' + ((hue + 120) % 360) + ',75%,42%)'); skin.addColorStop(1, 'hsl(' + ((hue + 240) % 360) + ',75%,36%)'); }
  else { skin.addColorStop(0, '#4a0812'); skin.addColorStop(0.45, '#b4182e'); skin.addColorStop(1, '#5a0a16'); }
  const edge = rb ? '#ffffff' : '#ff7a6a';
  g.lineJoin = 'round'; g.lineCap = 'round';
  // 腕と腕輪
  g.fillStyle = skin; g.strokeStyle = edge; g.lineWidth = 3;
  g.beginPath(); g.moveTo(-46, -300); g.lineTo(46, -300); g.lineTo(54, -80); g.lineTo(-54, -80); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#d8b25a'; g.fillRect(-60, -112, 120, 20); g.strokeStyle = '#6a4a10'; g.lineWidth = 2; g.strokeRect(-60, -112, 120, 20);
  g.fillStyle = '#7a5a20'; for (let i = -48; i <= 48; i += 16) { g.beginPath(); g.arc(i, -102, 3, 0, TAU); g.fill(); }
  // 手のひら
  g.fillStyle = skin; g.strokeStyle = edge; g.lineWidth = 3;
  g.beginPath(); g.moveTo(-62, -86); g.quadraticCurveTo(-82, -20, -60, 30); g.lineTo(60, 30); g.quadraticCurveTo(82, -20, 62, -86); g.closePath(); g.fill(); g.stroke();
  // 指(手のひらから下へ大きく伸びる)と爪
  const fingers = [[-50, 18, -78, 128], [-18, 26, -26, 162], [16, 26, 22, 164], [48, 18, 70, 132], [-66, -30, -126, 46]];
  for (const [bx, by, tx, ty] of fingers) {
    const mx = (bx + tx) / 2 + (tx - bx) * 0.2, my = (by + ty) / 2 - 10;
    g.strokeStyle = '#1a0206'; g.lineWidth = 34; g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(mx, my, tx, ty); g.stroke();
    g.strokeStyle = skin; g.lineWidth = 27; g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(mx, my, tx, ty); g.stroke();
    g.strokeStyle = rb ? 'rgba(255,255,255,0.35)' : 'rgba(255,140,120,0.35)'; g.lineWidth = 3;
    for (const k of [0.38, 0.68]) { const qx = lerp(lerp(bx, mx, k), lerp(mx, tx, k), k), qy = lerp(lerp(by, my, k), lerp(my, ty, k), k); g.beginPath(); g.moveTo(qx - 10, qy); g.lineTo(qx + 10, qy); g.stroke(); }
    const ang = Math.atan2(ty - my, tx - mx);
    g.save(); g.translate(tx, ty); g.rotate(ang - Math.PI / 2);
    g.fillStyle = '#0a0204'; g.beginPath(); g.moveTo(-11, -4); g.quadraticCurveTo(-2, 30, 4, 40); g.quadraticCurveTo(9, 18, 11, -4); g.closePath(); g.fill();
    g.strokeStyle = rb ? 'hsl(' + ((hue + 180) % 360) + ',100%,70%)' : '#ffcf4a'; g.lineWidth = 1.6; g.stroke();
    g.restore();
  }
  // 手のひらの紋と光る眼
  g.strokeStyle = rb ? 'rgba(255,255,255,0.5)' : 'rgba(255,120,100,0.5)'; g.lineWidth = 2;
  for (const x of [-30, 0, 30]) { g.beginPath(); g.moveTo(x, -70); g.quadraticCurveTo(x + 8, -36, x - 4, 4); g.stroke(); }
  g.save(); g.globalCompositeOperation = 'lighter';
  const eg = g.createRadialGradient(0, -32, 0, 0, -32, 30); eg.addColorStop(0, '#ffffff'); eg.addColorStop(0.4, rb ? 'hsl(' + hue + ',100%,65%)' : '#ffd23a'); eg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = eg; g.fillRect(-30, -62, 60, 60);
  g.restore();
  g.restore();
}
// 斬鬼刀(下からニョッキと出て、色で信頼度を示す役物)
function drawNyo(g, t) {
  if (Nyo.st === 'off') return;
  const T = Nyo.t, c = Nyo.col, rb = c === 'rainbow', r = RANK[c] || 0;
  const rise = T < 0.45 ? E.outB(T / 0.45) : T > 1.95 ? 1 - E.inC(Math.min(1, (T - 1.95) / 0.35)) : 1;
  const lit = T > 0.7 ? Math.min(1, (T - 0.7) / 0.15) : 0;
  const cx = 300, top = lerp(470, 212, rise) + (T > 0.45 && T < 0.7 ? Math.sin(t * 60) * 2 : 0);
  const cc = rb ? 'hsl(' + ((t * 300) % 360) + ',100%,62%)' : (COL[c] || COL.white)[1];
  g.save(); g.beginPath(); g.rect(LC.x, LC.y, LC.w, 432 - LC.y); g.clip();
  if (lit > 0) {
    g.save(); g.globalCompositeOperation = 'lighter'; g.translate(cx, top); g.rotate(t * 1.5);
    const n = 10 + r * 2, R2 = 70 + r * 30;
    g.globalAlpha = lit * (0.35 + r * 0.08); g.fillStyle = cc;
    for (let i = 0; i < n; i++) { const a = i / n * TAU; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R2, a, a + TAU / n / 2); g.closePath(); g.fill(); }
    g.restore();
  }
  const bg = g.createLinearGradient(cx - 10, 0, cx + 10, 0); bg.addColorStop(0, '#8a8a92'); bg.addColorStop(0.5, '#ffffff'); bg.addColorStop(1, '#5a5a62');
  g.fillStyle = bg; g.fillRect(cx - 9, top + 30, 18, 240);
  g.fillStyle = '#d8b25a';
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; g.beginPath(); g.moveTo(cx + Math.cos(a) * 34, top + Math.sin(a) * 34); g.lineTo(cx + Math.cos(a + 0.2) * 48, top + Math.sin(a + 0.2) * 48); g.lineTo(cx + Math.cos(a + 0.4) * 34, top + Math.sin(a + 0.4) * 34); g.fill(); }
  g.fillStyle = '#1a0406'; g.strokeStyle = '#d8b25a'; g.lineWidth = 3; g.beginPath(); g.arc(cx, top, 36, 0, TAU); g.fill(); g.stroke();
  const gem = g.createRadialGradient(cx - 8, top - 8, 2, cx, top, 28);
  if (lit > 0) { gem.addColorStop(0, '#ffffff'); gem.addColorStop(0.5, cc); gem.addColorStop(1, rb ? 'hsl(' + ((t * 300 + 180) % 360) + ',100%,30%)' : (COL[c] || COL.white)[1]); }
  else { gem.addColorStop(0, '#5a5a62'); gem.addColorStop(1, '#16161a'); }
  g.fillStyle = gem; g.beginPath(); g.arc(cx, top, 27, 0, TAU); g.fill();
  g.font = '400 30px ' + F_BRUSH; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.7)'; g.strokeText('斬', cx, top + 2); g.fillStyle = lit > 0 ? '#ffffff' : '#8a8a90'; g.fillText('斬', cx, top + 2);
  g.restore();
}
function drawMask(g, t) {
  if (Gimmick.y <= 0.5) return;
  g.save();
  g.beginPath(); g.rect(LC.x, LC.y, LC.w, LC.h); g.clip();
  const shakeX = Gimmick.st === 'drop' && Gimmick.t < 0.8 ? Math.sin(t * 60) * 2 : 0;
  g.translate(300 + shakeX, LC.y - 70 + Gimmick.y);
  const glow = g.createRadialGradient(0, 10, 10, 0, 10, 110); glow.addColorStop(0, 'rgba(255,200,80,0.5)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = glow; g.fillRect(-120, -100, 240, 220);
  g.fillStyle = '#d8b25a';
  for (const d of [-1, 1]) { g.beginPath(); g.moveTo(d * 22, -40); g.quadraticCurveTo(d * 40, -80, d * 30, -98); g.quadraticCurveTo(d * 52, -72, d * 40, -34); g.closePath(); g.fill(); }
  const fg = g.createLinearGradient(0, -50, 0, 60); fg.addColorStop(0, '#e8343a'); fg.addColorStop(1, '#6a0408');
  g.fillStyle = fg; g.strokeStyle = '#f2c86a'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(-52, -30); g.quadraticCurveTo(-58, 20, -36, 48); g.quadraticCurveTo(0, 70, 36, 48); g.quadraticCurveTo(58, 20, 52, -30); g.quadraticCurveTo(0, -60, -52, -30); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#1a0204';
  for (const d of [-1, 1]) { g.beginPath(); g.moveTo(d * 40, -14); g.lineTo(d * 10, -6); g.lineTo(d * 14, 6); g.lineTo(d * 38, 2); g.closePath(); g.fill(); }
  g.save(); g.globalCompositeOperation = 'lighter';
  for (const d of [-1, 1]) { const eg = g.createRadialGradient(d * 24, -2, 0, d * 24, -2, 14); eg.addColorStop(0, '#ffffff'); eg.addColorStop(0.4, '#ffd23a'); eg.addColorStop(1, 'rgba(255,120,0,0)'); g.fillStyle = eg; g.fillRect(d * 24 - 14, -16, 28, 28); }
  g.restore();
  g.fillStyle = '#1a0204'; g.beginPath(); g.moveTo(-30, 26); g.quadraticCurveTo(0, 46, 30, 26); g.quadraticCurveTo(0, 36, -30, 26); g.fill();
  g.fillStyle = '#fff6e0';
  for (const d of [-1, 1]) { g.beginPath(); g.moveTo(d * 22, 28); g.lineTo(d * 16, 44); g.lineTo(d * 12, 30); g.closePath(); g.fill(); }
  g.restore();
}
function drawDynamic(g, t) {
  const sy = PHYS.shelfY, DEN = PHYS.DEN, ATK = PHYS.ATK;
  // 風車
  for (const w of BOARD.wms) {
    g.save(); g.translate(w.x, w.y); g.rotate(w.ang);
    for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 2); g.fillStyle = i % 2 ? '#f2c86a' : '#c8282c'; g.beginPath(); g.moveTo(0, 0); g.lineTo(9.5, -2.6); g.lineTo(9.5, 2.6); g.closePath(); g.fill(); }
    g.fillStyle = '#f6f6f6'; g.beginPath(); g.arc(0, 0, 2.4, 0, TAU); g.fill();
    g.restore();
  }
  // 電チュー
  const dOpen = WORLD.denOpen;
  g.lineCap = 'round';
  if (dOpen) {
    const gl = g.createRadialGradient((DEN[0] + DEN[1]) / 2, sy(525) + 6, 0, (DEN[0] + DEN[1]) / 2, sy(525) + 6, 20);
    gl.addColorStop(0, 'rgba(120,255,200,0.9)'); gl.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gl; g.fillRect(DEN[0] - 10, sy(525) - 14, 44, 40);
    g.strokeStyle = '#f2c86a'; g.lineWidth = 3; g.beginPath(); g.moveTo(DEN[1], sy(DEN[1])); g.lineTo(DEN[1] - 4, sy(DEN[1]) + 16); g.stroke();
  } else {
    g.strokeStyle = '#f2c86a'; g.lineWidth = 4; g.beginPath(); g.moveTo(DEN[1], sy(DEN[1])); g.lineTo(DEN[0], sy(DEN[0])); g.stroke();
  }
  // アタッカー
  const aOpen = WORLD.atkOpen;
  if (aOpen) {
    const mx = (ATK[0] + ATK[1]) / 2;
    const gl = g.createRadialGradient(mx, sy(mx) + 6, 0, mx, sy(mx) + 6, 34);
    gl.addColorStop(0, 'rgba(255,90,60,0.95)'); gl.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gl; g.fillRect(mx - 36, sy(mx) - 22, 72, 52);
    g.strokeStyle = '#ff5a3a'; g.lineWidth = 4; g.beginPath(); g.moveTo(ATK[1], sy(ATK[1]) + 10); g.lineTo(ATK[0], sy(ATK[0]) + 10); g.stroke();
    if (S.bonus) {
      g.font = '400 11px ' + F_GOTH; g.textAlign = 'center'; g.fillStyle = '#ffd36b';
      g.fillText(String(Math.max(0, SPEC.atkMax - S.bonus.count)), mx, sy(mx) - 10);
    }
  } else {
    g.strokeStyle = '#c8282c'; g.lineWidth = 4; g.beginPath(); g.moveTo(ATK[1], sy(ATK[1])); g.lineTo(ATK[0], sy(ATK[0])); g.stroke();
  }
  // フラッシュ類
  const F = Board.fl;
  const glowAt = (x, y, r, col, a) => { if (a <= 0) return; const gg = g.createRadialGradient(x, y, 0, x, y, r); gg.addColorStop(0, col); gg.addColorStop(1, 'rgba(0,0,0,0)'); g.globalAlpha = a; g.fillStyle = gg; g.fillRect(x - r, y - r, r * 2, r * 2); g.globalAlpha = 1; };
  glowAt(BOARD.heso.x, BOARD.heso.y + 8, 30, 'rgba(255,220,120,1)', F.heso);
  glowAt(BOARD.gate.x, BOARD.gate.y, 20, 'rgba(255,230,140,1)', F.gate);
  glowAt(110, 338, 22, 'rgba(255,190,90,1)', F.warp);
  glowAt(300, 420, 28, 'rgba(255,90,60,1)', F.stageC);
  // 玉
  const balls = WORLD.balls, bs = R.ball;
  g.fillStyle = 'rgba(0,0,0,0.38)';
  for (const b of balls) { if (b.dead) continue; g.beginPath(); g.ellipse(b.x + 1.6, b.y + 2.2, 5.6, 4.4, 0, 0, TAU); g.fill(); }
  for (const b of balls) { if (!b.dead) g.drawImage(bs, b.x - 7, b.y - 7, 14, 14); }
  // 右下パネル
  const segOn = '#ff3a2a';
  g.font = '400 10px ' + F_GOTH; g.textAlign = 'center';
  const cur = S.cur;
  const d1 = cur && cur.e.from === 1 ? String(Math.floor(t * 30) % 10) : (S.lastSeg1 || '-');
  const d2 = cur && cur.e.from === 2 ? String(Math.floor(t * 30) % 10) : (S.lastSeg2 || '-');
  g.fillStyle = segOn; g.fillText(d1, 544, 641); g.fillText(d2, 544, 657);
  g.fillStyle = S.futo.st === 'spin' ? (Math.floor(t * 12) % 2 ? segOn : '#401010') : S.futo.st === 'open' ? '#5aff8a' : '#401010';
  g.beginPath(); g.arc(544, 669, 3, 0, TAU); g.fill();
  for (let i = 0; i < 4; i++) {
    g.fillStyle = S.hold1.length > i ? '#ff5a3a' : '#2a0a08'; g.fillRect(556 + i * 8, 635, 5, 5);
    g.fillStyle = S.hold2.length > i ? '#ff5a3a' : '#2a0a08'; g.fillRect(556 + i * 8, 651, 5, 5);
    g.fillStyle = S.futo.hold > i ? '#5aff8a' : '#0a2a10'; g.fillRect(556 + i * 8, 666, 5, 5);
  }
}
function render() {
  const g = R.ctx, t = LCD.t, z = 1 + S.zoom * (ZOOM - 1);
  if (!g || !R.cache) return;
  const px = lerp(BW / 2, LCDCX, S.zoom), py = lerp(BH / 2, LCDCY, S.zoom), ty = lerp(BH / 2, BH * 0.42, S.zoom);
  const sx = (Math.random() - 0.5) * Board.shk * R.scale, sy = (Math.random() - 0.5) * Board.shk * R.scale;
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (Board.shk > 0 || S.zoom >= 0.001) { g.fillStyle = '#090304'; g.fillRect(0, 0, R.cv.width, R.cv.height); }
  if (S.zoom < 0.001) g.drawImage(R.cache, sx, sy);
  g.setTransform(R.scale * z, 0, 0, R.scale * z, R.scale * (BW / 2 - px * z) + sx, R.scale * (ty - py * z) + sy);
  if (S.zoom >= 0.001) g.drawImage(R.cache, 0, 0, BW, BH);
  drawLamps(g, t);
  if (S.rbT > 0) drawRbBoard(g, t);
  g.save(); g.beginPath(); rrect(g, LC.x, LC.y, LC.w, LC.h, 4); g.clip(); g.translate(LC.x, LC.y);
  drawLCD(g, t, R.scale * z);
  g.restore();
  drawMask(g, t);
  drawNyo(g, t);
  drawDynamic(g, t);
  drawHand(g, t);
  const gl = g.createLinearGradient(0, 0, BW, BH);
  gl.addColorStop(0, 'rgba(255,255,255,0.07)'); gl.addColorStop(0.3, 'rgba(255,255,255,0)'); gl.addColorStop(0.62, 'rgba(255,255,255,0)'); gl.addColorStop(0.7, 'rgba(255,255,255,0.05)'); gl.addColorStop(0.78, 'rgba(255,255,255,0)');
  g.fillStyle = gl; g.beginPath(); g.arc(PHYS.CX, PHYS.CY, PHYS.RAIL_R, 0, TAU); g.fill();
}

/* ==========================================================
   UI
   ========================================================== */
const Handle = { drag: false };
const UI = {
  t: 0, bumpT: 0, tt: null, lampKey: '',
  init() {
    this.e = {
      balls: $('#vBalls'), invest: $('#vInvest'), diff: $('#vDiff'), pow: $('#vPow'), knob: $('#knob'),
      hits: $('#cHits'), rush: $('#cRush'), spins: $('#cSpins'), total: $('#cTotal'), auto: $('#bAuto'),
      push: $('#bPush'), mode: $('#vMode'), toast: $('#toast'), guide: $('#padGuide'), lever: $('#lever'), arm: $('#leverArm'), dial: $('#dial')
    };
  },
  bump() { this.bumpT = 0.2; },
  toast(msg) {
    const t = this.e.toast; if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(this.tt); this.tt = setTimeout(() => t.classList.remove('show'), 1800);
  },
  pushState(on, type) {
    const lev = type === 'lever';
    if (this.e.push) { this.e.push.classList.toggle('ready', on && !lev); this.e.push.classList.toggle('dim', on && lev); }
    if (this.e.lever) this.e.lever.classList.toggle('ready', on && lev);
  },
  rbShock() { document.body.classList.add('rb'); clearTimeout(this.rbt); this.rbt = setTimeout(() => document.body.classList.remove('rb'), 3800); },
  update(dt) {
    this.t += dt; this.bumpT = Math.max(0, this.bumpT - dt);
    if (this.t < 0.1) return;
    this.t = 0;
    const e = this.e, d = S.data;
    e.balls.textContent = fmt(S.balls);
    e.balls.classList.toggle('bump', this.bumpT > 0);
    e.invest.textContent = fmt(S.invest) + '円';
    const diff = S.balls * 4 - S.invest;
    e.diff.textContent = (diff > 0 ? '+' : diff < 0 ? '−' : '±') + fmt(Math.abs(diff)) + '円';
    e.diff.className = diff > 0 ? 'plus' : diff < 0 ? 'minus' : '';
    e.pow.textContent = (S.power * 100).toFixed(1);
    e.knob.style.transform = 'rotate(' + (-135 + S.power * 270) + 'deg)';
    e.hits.textContent = d.hits; e.rush.textContent = d.rushHits; e.spins.textContent = d.spins; e.total.textContent = d.total;
    e.auto.classList.toggle('on', S.auto);
    e.auto.setAttribute('aria-pressed', S.auto ? 'true' : 'false');
    const needR = !!S.bonus || densapo();
    e.dial.classList.toggle('needR', needR && Math.abs(S.power - SPEC.presetR) > 0.1);
    e.dial.classList.toggle('needL', !needR && S.power > 0.72);
    e.mode.textContent = S.bonus ? 'BONUS ' + Math.max(1, S.bonus.round) + '/' + S.bonus.rounds + 'R' : S.mode === 'st' ? 'RUSH 残り' + S.modeCnt : S.mode === 'jitan' ? '時短 残り' + S.modeCnt : '通常';
    const lk = curLamp();
    if (lk !== this.lampKey) { this.lampKey = lk; document.body.dataset.lamp = lk; }
  }
};
function setPower(p) { S.power = clamp(p, 0, 1); }
function nudge(d) { setPower(Math.round((S.power + d) * 1000) / 1000); }
function toggleAuto() { if (!S.started) return; S.auto = !S.auto; UI.toast(S.auto ? '自動発射 ON' : '自動発射 OFF'); }
function onLever(anim) {
  if (!S.started) return;
  Push.pull();
  if (anim && UI.e.arm) { UI.e.arm.style.setProperty('--lv', '40px'); setTimeout(() => UI.e.arm.style.setProperty('--lv', '0px'), 150); }
}
function onPush() { if (!S.started) return; Push.press(); UI.e.push.classList.add('hit'); setTimeout(() => UI.e.push.classList.remove('hit'), 120); }
function anyModal() { return $$('.modal.open').length > 0; }
function openModal(id) {
  $$('.modal.open').forEach(m => m.classList.remove('open'));
  const m = $(id); if (!m) return;
  m.classList.add('open');
  if (id === '#mData') drawData();
  if (id === '#mSet') { syncSettings(); specSync(); }
  if (id === '#mHelp') specTable();
}
function closeModals() { const had = anyModal(); $$('.modal.open').forEach(m => m.classList.remove('open')); return had; }

/* ---------- 設定 ---------- */
function syncSettings() {
  for (const el of $$('[data-k]')) {
    const k = el.dataset.k;
    if (el.type === 'checkbox') el.checked = !!S.set[k];
    else el.value = Math.round(S.set[k] * 100);
  }
}
function bindSettings() {
  for (const el of $$('[data-k]')) {
    el.addEventListener('input', () => {
      const k = el.dataset.k;
      if (el.type === 'checkbox') S.set[k] = el.checked;
      else S.set[k] = clamp(+el.value / 100, 0, 1);
      AU.vol();
      if (k === 'lite') resize();
      if (k === 'swapAB' || k === 'swapXY') padGuide();
      saveGame();
    });
  }
  $('#bReset').addEventListener('click', () => {
    if (confirm('持ち玉・投資額・データをすべてリセットします。よろしいですか?')) { resetData(); closeModals(); }
  });
}
/* ---------- 台のスペック ---------- */
const SP_FIELDS = { pN: '#spN', pS: '#spS', st: '#spST', jt: '#spJT', rush: '#spRush', r10: '#spR10', hesoR: '#spHR', hrR: '#spHRR', rR: '#spRR', loop: '#spLoop' };
function specFill(o) {
  for (const k in SP_FIELDS) { const el = $(SP_FIELDS[k]); if (el) el.value = o[k]; }
  specPreview();
}
function specRead() {
  const o = { key: $('#spPreset').value };
  for (const k in SP_FIELDS) o[k] = $(SP_FIELDS[k]).value;
  return o;
}
function specPreview() {
  const o = specRead(), pS = specNum('pS', o.pS, 99.4), st = specNum('st', o.st, 130);
  const cont = Math.round((1 - Math.pow(1 - 1 / pS, st)) * 100);
  $('#spCont').textContent = 'RUSH継続率 約' + cont + '%(1/' + pS + 'を' + st + '回転)';
}
function specTable() {
  const el = $('#specTbl'); if (!el) return;
  const s = specGet(), name = SPEC_PRESETS[s.key] ? SPEC_PRESETS[s.key].name : 'カスタム';
  el.innerHTML =
    '<tr><th>スペック</th><td>' + name + '</td></tr>' +
    '<tr><th>大当り確率</th><td>1/' + s.pN + '(RUSH中 1/' + s.pS + ')</td></tr>' +
    '<tr><th>ヘソ大当り</th><td>' + s.hesoR + 'R(約' + fmt(s.hesoR * SPEC.atkMax * SPEC.atkPay) + '個)+ RUSH突入チャレンジ(敵選択ルーレット)。突入率' + s.rush + '%' + (s.hrR > s.hesoR ? '・突入時は合計' + s.hrR + 'R(約' + fmt(s.hrR * SPEC.atkMax * SPEC.atkPay) + '個)のPREMIUM' : '') + '、失敗時は' + (s.jt > 0 ? '時短' + s.jt + '回' : '通常') + '</td></tr>' +
    '<tr><th>百鬼討滅RUSH</th><td>ST' + s.st + '回・継続率 約' + contPct() + '%</td></tr>' +
    '<tr><th>RUSH中大当り</th><td>' + (s.rR > 0 ? s.rR + 'R(約' + fmt(s.rR * SPEC.atkMax * SPEC.atkPay) + '個)' : '10R(約1500個)' + s.r10 + '% / 3R(約450個)' + (100 - s.r10) + '%') + (s.loop > 0 ? '。終了時に' + s.loop + '%で百鬼MAXループ(最大2回上乗せ)' : '') + '</td></tr>' +
    '<tr><th>賞球</th><td>ヘソ3個・電チュー1個・アタッカー15個・一般入賞3個</td></tr>' +
    '<tr><th>貸玉</th><td>500円で125玉(4円パチンコ)</td></tr>';
}
function bindSpec() {
  const sel = $('#spPreset');
  sel.innerHTML = Object.keys(SPEC_PRESETS).map(k => '<option value="' + k + '">' + SPEC_PRESETS[k].name + '</option>').join('') + '<option value="custom">カスタム</option>';
  sel.addEventListener('change', () => { const p = SPEC_PRESETS[sel.value]; if (p) specFill(p); else specPreview(); });
  for (const k in SP_FIELDS) $(SP_FIELDS[k]).addEventListener('input', () => { sel.value = 'custom'; specPreview(); });
  $('#bSpec').addEventListener('click', () => {
    const o = specRead();
    if (!confirm('台のスペックを変更します。\n保留中の抽選結果はそのまま、次の抽選から反映されます。よろしいですか?')) return;
    const c = applySpec(o);
    specFill(c); sel.value = SPEC.key; specTable(); saveGame();
    UI.toast('スペックを変更しました(1/' + c.pN + '・継続率 約' + contPct() + '%)');
  });
}
function specSync() { const s = specGet(); $('#spPreset').value = SPEC_PRESETS[s.key] ? s.key : 'custom'; specFill(s); }
function padGuide() {
  const a = S.set.swapAB ? 'B' : 'A', b = S.set.swapAB ? 'A' : 'B', x = S.set.swapXY ? 'Y' : 'X', y = S.set.swapXY ? 'X' : 'Y';
  if (UI.e.guide) UI.e.guide.textContent = a + ':PUSH  RB:レバー  ' + b + ':自動発射  ' + x + ':左打ち  ' + y + ':右打ち  左スティック/十字:強さ  RT:発射  SELECT:玉貸  START:設定';
}

/* ---------- データ表示 ---------- */
function drawData() {
  const d = S.data, diff = S.balls * 4 - S.invest;
  const rate = S.invest > 0 ? (d.total / (S.invest / 1000)).toFixed(1) : '-';
  $('#dStats').innerHTML = [
    ['総回転数', fmt(d.total)], ['大当り', d.hits + '回'], ['RUSH中の当り', d.rushHits + '回'], ['最大連チャン', d.maxChain + '連'],
    ['現在の回転数', fmt(d.spins)], ['1000円あたり', rate + '回転'], ['投資', fmt(S.invest) + '円'], ['収支', (diff >= 0 ? '+' : '−') + fmt(Math.abs(diff)) + '円']
  ].map(([k, v]) => '<div><span>' + k + '</span><b>' + v + '</b></div>').join('');
  const h = d.hist;
  $('#dHist').innerHTML = h.length ? h.slice(0, 30).map((x, i) =>
    '<li><span class="n">' + (d.hits - i) + '</span><span>' + fmt(x.spins) + '回転</span><span>' + x.kind + ' ' + x.r + 'R</span><span>' + (x.pay != null ? fmt(x.pay) + '個' : '消化中') + '</span></li>').join('')
    : '<li class="empty">まだ大当りはありません。左打ちでヘソを狙いましょう。</li>';
  const cv = $('#graph'), r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.max(10, Math.round(r.width * dpr)); cv.height = Math.max(10, Math.round(r.height * dpr));
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = r.width, H = r.height, pts = d.graph;
  g.fillStyle = '#0b0608'; g.fillRect(0, 0, W, H);
  if (pts.length < 2) { g.fillStyle = '#9a8a70'; g.font = '12px ' + F_MIN; g.textAlign = 'center'; g.fillText('回転するとスランプグラフが表示されます', W / 2, H / 2); return; }
  let mn = 0, mx = 0; for (const p of pts) { mn = Math.min(mn, p[1]); mx = Math.max(mx, p[1]); }
  const span = Math.max(500, mx - mn), x0 = pts[0][0], x1 = Math.max(x0 + 1, pts[pts.length - 1][0]);
  const X = v => 8 + (v - x0) / (x1 - x0) * (W - 16), Y = v => H - 10 - (v - mn) / span * (H - 20);
  g.strokeStyle = 'rgba(216,178,90,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, Y(0)); g.lineTo(W, Y(0)); g.stroke();
  g.strokeStyle = '#ff5a3a'; g.lineWidth = 1.6; g.beginPath();
  pts.forEach((p, i) => i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])));
  g.stroke();
  g.fillStyle = '#d8b25a'; g.font = '10px ' + F_GOTH; g.textAlign = 'left';
  g.fillText('+' + fmt(mx) + '玉', 4, 12); g.fillText((mn < 0 ? '−' : '') + fmt(Math.abs(mn)) + '玉', 4, H - 2);
}

/* ==========================================================
   入力
   ========================================================== */
function bindInputs() {
  const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('pointerdown', e => { e.preventDefault(); fn(e); }); };
  on('#bLend', () => { if (S.started) lend(); });
  on('#bPush', onPush);
  // レバー(下に引く/タップでも可)
  const lever = $('#lever'), arm = $('#leverArm');
  let lv = null;
  lever.addEventListener('pointerdown', e => {
    e.preventDefault(); if (!S.started) return;
    try { lever.setPointerCapture(e.pointerId); } catch (err) { /* 非対応 */ }
    lv = { y: e.clientY, t: performance.now(), pulled: false }; lever.classList.add('drag');
  });
  lever.addEventListener('pointermove', e => {
    if (!lv) return;
    const d = clamp(e.clientY - lv.y, 0, 40); arm.style.setProperty('--lv', d + 'px');
    if (d > 26 && !lv.pulled) { lv.pulled = true; onLever(false); }
  });
  const leverUp = () => {
    if (!lv) return;
    lever.classList.remove('drag');
    if (!lv.pulled && performance.now() - lv.t < 350) onLever(true); else arm.style.setProperty('--lv', '0px');
    lv = null;
  };
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) lever.addEventListener(ev, leverUp);
  for (const [id, p] of [['#mkL', SPEC.presetL], ['#mkR', SPEC.presetR]]) {
    const m = $(id); if (!m) continue;
    const a = -135 + p * 270; m.style.transform = 'rotate(' + a + 'deg)'; m.style.setProperty('--a', a + 'deg');
  }
  on('#bAuto', toggleAuto);
  let rep = null;
  const hold = (id, d) => {
    const el = $(id); if (!el) return;
    el.addEventListener('pointerdown', e => { e.preventDefault(); nudge(d); clearInterval(rep); let n = 0; rep = setInterval(() => { n++; if (n > 4) nudge(d * (n > 20 ? 4 : 1)); }, 70); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(ev, () => clearInterval(rep));
  };
  hold('#bDn', -0.005); hold('#bUp', 0.005);
  const dial = $('#dial');
  const setFrom = e => {
    const r = dial.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    if (Math.hypot(dx, dy) < r.width * 0.14) return;
    let p = clamp((Math.atan2(dx, -dy) * 180 / Math.PI + 135) / 270, 0, 1);
    if (Math.abs(p - S.power) > 0.6) return;
    for (const pp of [SPEC.presetL, SPEC.presetR]) if (Math.abs(p - pp) < 0.025) p = pp;
    S.power = p;
  };
  dial.addEventListener('pointerdown', e => {
    e.preventDefault(); if (!S.started) return;
    try { dial.setPointerCapture(e.pointerId); } catch (err) { /* 非対応 */ }
    Handle.drag = true; S.holding = true; dial.classList.add('grip'); setFrom(e);
  });
  dial.addEventListener('pointermove', e => { if (Handle.drag) setFrom(e); });
  const end = () => { Handle.drag = false; S.holding = false; dial.classList.remove('grip'); };
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) dial.addEventListener(ev, end);
  dial.addEventListener('wheel', e => { e.preventDefault(); nudge(e.deltaY > 0 ? -0.005 : 0.005); }, { passive: false });
  R.cv.addEventListener('pointerdown', () => { if (Push.active && !Push.done && Push.type !== 'lever') onPush(); });
  on('#bData', () => openModal('#mData'));
  on('#bHelp', () => openModal('#mHelp'));
  on('#bSet', () => openModal('#mSet'));
  for (const b of $$('.modal .close')) b.addEventListener('click', closeModals);
  for (const m of $$('.modal')) m.addEventListener('pointerdown', e => { if (e.target === m) closeModals(); });
  window.addEventListener('keydown', e => {
    if (e.target && e.target.matches && e.target.matches('input, select, textarea')) return;
    const k = e.key;
    if (k === 'Escape') { if (!closeModals()) openModal('#mSet'); return; }
    if (anyModal() || !S.started) { if ((k === 'Enter' || k === ' ') && !S.started) { e.preventDefault(); startGame(); } return; }
    if (k === ' ') { e.preventDefault(); toggleAuto(); }
    else if (k === 'ArrowLeft' || k === 'a' || k === 'A') { e.preventDefault(); nudge(e.shiftKey ? -0.05 : -0.005); }
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') { e.preventDefault(); nudge(e.shiftKey ? 0.05 : 0.005); }
    else if (k === 'q' || k === 'Q') setPower(SPEC.presetL);
    else if (k === 'e' || k === 'E') setPower(SPEC.presetR);
    else if (k === 'Enter' || k === 'z' || k === 'Z') { e.preventDefault(); if (!e.repeat) onPush(); }
    else if (k === 'b' || k === 'B') lend();
    else if (k === 'l' || k === 'L' || k === 'ArrowDown') { e.preventDefault(); if (!e.repeat) onLever(true); }
  });
  window.addEventListener('pointerdown', () => { if (Pad.active) { Pad.active = false; document.body.classList.remove('pad-mode'); } }, true);
  // 拡大・コピー対策(iOS Safari)
  document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  let lastTouch = 0;
  document.addEventListener('touchend', e => {
    const n = Date.now();
    if (n - lastTouch < 320 && !(e.target.closest && e.target.closest('input, label, .modal-body'))) e.preventDefault();
    lastTouch = n;
  }, { passive: false });
}
const Pad = {
  prev: [], active: false,
  poll(dt) {
    const gps = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const g of gps) if (g && g.connected) { gp = g; break; }
    if (!gp) { S.padHold = false; return; }
    const pr = i => !!(gp.buttons[i] && gp.buttons[i].pressed), down = i => pr(i) && !this.prev[i];
    let any = false;
    const A = S.set.swapAB ? 1 : 0, B = S.set.swapAB ? 0 : 1, X = S.set.swapXY ? 3 : 2, Y = S.set.swapXY ? 2 : 3;
    if (down(9)) { any = true; if (!S.started) startGame(); else if (!closeModals()) openModal('#mSet'); }
    if (anyModal()) { if (down(B) || down(A)) { closeModals(); any = true; } }
    else if (!S.started) { if (down(A)) { startGame(); any = true; } }
    else {
      if (down(A)) { onPush(); any = true; }
      if (down(B)) { toggleAuto(); any = true; }
      if (down(X)) { setPower(SPEC.presetL); any = true; }
      if (down(Y)) { setPower(SPEC.presetR); any = true; }
      if (down(8)) { lend(); any = true; }
      if (down(14)) { nudge(-0.005); any = true; }
      if (down(15)) { nudge(0.005); any = true; }
      if (down(4) || down(13)) { nudge(-0.05); any = true; }
      if (down(12)) { nudge(0.05); any = true; }
      if (down(5)) { onLever(true); any = true; }
      const ax = gp.axes[0] || 0;
      if (Math.abs(ax) > 0.25) { setPower(S.power + ax * 0.22 * dt); any = true; }
      const rt = gp.buttons[7] ? gp.buttons[7].value : 0;
      S.padHold = rt > 0.3; if (S.padHold) any = true;
    }
    if (any && !this.active) { this.active = true; document.body.classList.add('pad-mode'); padGuide(); }
    this.prev = gp.buttons.map(b => b.pressed);
  }
};

/* ==========================================================
   レイアウト・起動・メインループ
   ========================================================== */
function resize() {
  const wrap = $('#boardWrap'); if (!wrap || !R.cv) return;
  const r = wrap.getBoundingClientRect();
  let w = r.width, h = w * BH / BW;
  if (h > r.height) { h = r.height; w = h * BW / BH; }
  w = Math.max(120, Math.floor(w)); h = Math.floor(w * BH / BW);
  R.cv.style.width = w + 'px'; R.cv.style.height = h + 'px';
  const dpr = Math.min(window.devicePixelRatio || 1, S.set.lite ? 1.25 : 2.5);
  R.cv.width = Math.round(w * dpr); R.cv.height = Math.round(h * dpr);
  R.scale = R.cv.width / BW;
  buildStatic(); buildBallSprite(); buildSymbols(Math.min(3.6, R.scale * ZOOM));
}
function startGame() {
  if (S.started) return;
  S.started = true;
  AU.init(); AU.vol();
  AU.song = null;
  AU.bgm(S.bonus ? 'bonus' : S.mode === 'st' ? 'rush' : S.mode === 'jitan' ? 'jitan' : 'normal');
  $('#start').classList.add('hide');
  if (S.balls <= 0 && S.invest === 0) UI.toast('玉貸ボタンで玉を借りて、ハンドルを回して打ち出そう');
}
let last = 0, saveT = 0;
function update(dt) {
  Pad.poll(dt);
  if (S.started) {
    // 大当り・RUSH・時短に入った瞬間だけ右打ちへ、終わったら元の左打ちの強さへ戻す
    const needR = !!S.bonus || densapo();
    if (S.prevNeedR === null) S.prevNeedR = needR;
    else if (needR !== S.prevNeedR) {
      S.prevNeedR = needR;
      if (S.set.autoHandle && !Handle.drag) {
        if (needR) { S.leftPow = S.power < 0.7 ? S.power : SPEC.presetL; S.power = SPEC.presetR; UI.toast('右打ちに切り替えました'); }
        else { S.power = S.leftPow || SPEC.presetL; UI.toast('左打ちに戻しました'); }
      }
    }
    updateFire(dt);
  }
  updateFuto(dt);
  WORLD.atkOpen = !!(S.bonus && S.bonus.phase === 'open');
  WORLD.update(dt);
  handleEvents();
  laneCheck(dt);
  updateBonus(dt);
  const ldt = dt * (S.set.fast ? 1.35 : 1);
  DIR.update(ldt); Push.update(dt); updTweens(ldt); Reels.update(ldt); LCD.update(ldt);
  if (S.started) tryStart(ldt);
  S.lampOT = Math.max(0, S.lampOT - dt);
  S.rbT = Math.max(0, S.rbT - dt);
  Hand.update(ldt); Nyo.update(ldt);
  const zt = S.set.zoom ? S.zoomT : 0;
  S.zoom += (zt - S.zoom) * Math.min(1, dt * 4);
  if (zt === 0 && S.zoom < 0.002) S.zoom = 0;
  Board.update(dt); Gimmick.update(ldt);
  AU.tick();
  UI.update(dt);
  saveT += dt;
  if (saveT > 5) { saveT = 0; if (S.started) saveGame(); }
}
function loop(now) {
  let dt = last ? (now - last) / 1000 : 0.016;
  last = now;
  if (!(dt > 0)) dt = 0;
  dt = Math.min(dt, 0.05);
  try { update(dt); render(); } catch (err) { console.error(err); }
  requestAnimationFrame(loop);
}
function init() {
  UI.init();
  loadGame();
  R.cv = $('#board'); R.ctx = R.cv.getContext('2d');
  resize();
  let rz = null;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(resize, 90); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(resize, 90); });
  const fontsReady = () => { buildSymbols(Math.min(3.6, R.scale * ZOOM)); buildStatic(); };
  if (document.fonts && document.fonts.load) {
    Promise.all([
      document.fonts.load('400 40px "Dela Gothic One"'), document.fonts.load('400 40px "Yuji Syuku"'), document.fonts.load('800 20px "Shippori Mincho B1"')
    ]).then(fontsReady, fontsReady);
    if (document.fonts.ready) document.fonts.ready.then(fontsReady);
  }
  LCD.bg = stageBg(); LCD.prev = null; LCD.bgK = 1;
  Reels.r.forEach((r, i) => { r.pos = [7, 3, 7][i] - 1; });
  bindInputs(); bindSettings(); bindSpec(); specTable(); padGuide();
  $('#bStart').addEventListener('click', startGame);
  $('#cont').textContent = (S.data.total > 0 || S.balls > 0) ? '前回のデータを引き継いで遊べます(持ち玉 ' + fmt(S.balls) + '玉)' : '';
  document.addEventListener('visibilitychange', () => { if (document.hidden) { saveGame(); S.holding = false; } else last = 0; });
  window.addEventListener('pagehide', saveGame);
  if (/[?&]debug/.test(location.search)) window.__z = { S, WORLD, DIR, LCD, Reels, Push, update, render, styleEntry, makeEntry, startVariation, SPEC, BOARD, saveGame, loadGame, Hand, Nyo, Roul, sakibare, applySpec, SPEC_PRESETS, onStartIn, fxPremium, Board };
  requestAnimationFrame(loop);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();
