/* =========================================================
   BLAZE DODGE ～灼熱の50秒～
   made by hiro / ヒロ  https://github.com/h1ro223
   ---------------------------------------------------------
   1. 定数・設定
   2. ユーティリティ
   3. マップ
   4. セーブデータ
   5. サウンド
   6. 入力（キーボード / タッチ / ゲームパッド）
   7. ゲーム状態・生成
   8. プレイヤー
   9. 敵（フレイムインプ）
   10. 火の玉
   11. パーティクル・画面揺れ
   12. 描画（背景・タイル）
   13. 描画（キャラ・エフェクト）
   14. 進行・UI
   15. レイアウト
   16. メインループ
   ========================================================= */
(() => {
  'use strict';

  /* ===== 1. 定数・設定 ===== */
  const TILE = 32;
  let COLS = 34;   // ステージによって変わる
  const ROWS = 19;
  let LW = COLS * TILE; // 論理幅（ステージによって変わる）
  const LH = ROWS * TILE; // 論理高さ 608
  const TIME_LIMIT = 50;
  const STEP = 1 / 120;
  const TAU = Math.PI * 2;
  const STORE_KEY = 'blazeDodge_v1';

  // プレイヤーの物理（単位：px, 秒）
  const PH = {
    W: 20, H: 40, CROUCH_H: 26,
    WALK: 150, RUN: 255,
    ACC: 820, ACC_RUN: 980, DEC: 950, SKID: 1900, ACC_AIR: 640, AIR_DRAG: 150,
    JUMP_V: 681, JUMP_RUN_BONUS: 0.22,
    G_UP: 1450, G_UP_RELEASE: 3600, G_DOWN: 2300, MAX_FALL: 640,
    WALL_SLIDE: 115, WALL_KICK_VX: 235, WALL_KICK_VY: 620, WALL_LOCK: 0.17,
    SPIN_JUMP_V: 510, SPIN_TIME: 0.45, SPIN_GROUND_TIME: 0.75, // 地上スピンジャンプ：約2.8ブロック
    // 空中スピン：落下だけを抑える（上昇は止めない）。0.3秒ゆっくり落下 → 0.25秒で通常の落下速度へ
    SPIN_HOVER: 0.3, SPIN_RECOVER: 0.25, SPIN_FALL: 40, SPIN_COOL: 0.55,
    SPIN_CD: 0.12,
    GP_WAIT: 0.22, GP_V: 980, GP_ACC: 7000, GP_STUN: 0.2, // 急降下は一気に加速して最高速へ
    SPIN_ANIM: 0.32,  // 空中スピンの回転アニメ（1回転）の長さ
    COYOTE: 0.08, JUMP_BUF: 0.12
  };

  // 火の玉
  const FB = { R: 7, G: 1500, BOUNCE_MIN: 305, BOUNCE_MAX: 350, MAX_VY: 720, LIFE: 9 };

  // 敵
  // 連投なし。投げてから次に投げるまで INT_MIN〜INT_MAX 秒（構える時間込み）
  const IMP = { W: 22, H: 38, WALK: 42, AIM: 0.38, INT_MIN: 0.6, INT_MAX: 2.4 };

  // ハードモード：15秒ごとにレベルアップ、Lv.8で頭打ち
  const HARD = { LV_SEC: 15, LV_MAX: 8, INT_MAX_END: 1.2, SPD_END: 1.4, WALK_END: 1.5 };
  // ノーマルモードのメダル（秒数に達するとストップウォッチのプレートが変化）
  const MEDALS = [
    { t: 15, key: 'bronze', name: '銅メダル' },
    { t: 25, key: 'silver', name: '銀メダル' },
    { t: 40, key: 'gold', name: '金メダル' },
    { t: 50, key: 'platinum', name: 'プラチナメダル' }
  ];
  const medalLevel = (sec) => MEDALS.reduce((lv, m, i) => (sec >= m.t - 1e-6 ? i + 1 : lv), 0); // 0=なし 1=銅…4=プラチナ
  const MODE_NAMES = { normal: 'ノーマルモード', endless: 'エンドレスモード', hard: 'ハードモード' };


  /* ===== 2. ユーティリティ ===== */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const approach = (v, target, delta) => (v < target ? Math.min(v + delta, target) : Math.max(v - delta, target));
  const rand = (a, b) => a + Math.random() * (b - a);
  const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash2(x, y) {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function rrect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + w - r, y);
    g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r);
    g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r);
    g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }
  function circ(g, x, y, r) {
    g.beginPath();
    g.arc(x, y, Math.max(0.01, r), 0, TAU);
    g.fill();
  }
  function ell(g, x, y, rx, ry, rot) {
    g.beginPath();
    g.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot || 0, 0, TAU);
    g.fill();
  }

  /* ===== 3. マップ ===== */
  // '#' 石ブロック  '^' トゲ  'B' 唯一の安全ブロック  '.' 空間
  let map = [];
  function fillTiles(c0, r0, c1, r1, ch) {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) map[r][c] = ch;
  }

  const STAGES = {
    // ステージ1：右の高台に2体
    1: {
      cols: 34,
      safe: [13, 16],
      build() {
        fillTiles(0, 0, 3, 18, '#');    // 左の壁
        fillTiles(26, 0, 33, 4, '#');   // 右上の天井
        fillTiles(31, 5, 33, 18, '#');  // 右の壁
        fillTiles(25, 11, 33, 18, '#'); // 上段の高台
        fillTiles(25, 10, 30, 10, '^'); // 上段のトゲ
        fillTiles(21, 14, 24, 18, '#'); // 中段の高台
        fillTiles(21, 13, 24, 13, '^'); // 中段のトゲ
        fillTiles(4, 17, 20, 18, '#');  // 床
        fillTiles(4, 16, 20, 16, '^');  // 床一面のトゲ
        map[16][13] = 'B';              // 安全ブロック
      },
      imps: [
        { x: 745, row: 13, minX: 21 * TILE + 13, maxX: 25 * TILE - 13, delay: 0.9 }, // 中段
        { x: 885, row: 10, minX: 25 * TILE + 13, maxX: 31 * TILE - 13, delay: 2.0 }  // 上段
      ],
      torches: [{ x: 250, y: 270 }, { x: 905, y: 232 }],
      enemyText: '右の高台から2体',
      theme: {
        bg: 'ruins', stoneH: 224, stoneHV: 12, stoneS: 20, stoneSV: 10, stoneL: 25,
        rim: 'rgba(140,210,255,.13)', cap: false,
        glow: '255,150,60', flame: ['#ff6a2a', '#ffc24a', '#fff6cf']
      }
    },
    // ステージ2：左右対称、左右の高台と段に1体ずつ（計4体）
    2: {
      cols: 35,
      safe: [17, 16],
      build() {
        fillTiles(0, 0, 4, 4, '#');     // 左上の天井
        fillTiles(30, 0, 34, 4, '#');   // 右上の天井
        fillTiles(0, 10, 5, 10, '^');   // 左の高台のトゲ
        fillTiles(0, 11, 5, 18, '#');   // 左の高台
        fillTiles(29, 10, 34, 10, '^'); // 右の高台のトゲ
        fillTiles(29, 11, 34, 18, '#'); // 右の高台
        fillTiles(6, 13, 9, 13, '^');   // 左の段のトゲ
        fillTiles(6, 14, 9, 18, '#');   // 左の段
        fillTiles(25, 13, 28, 13, '^'); // 右の段のトゲ
        fillTiles(25, 14, 28, 18, '#'); // 右の段
        fillTiles(10, 16, 24, 16, '^'); // 床一面のトゲ
        fillTiles(10, 17, 24, 18, '#'); // 床
        map[16][17] = 'B';              // 安全ブロック（ちょうど中央）
      },
      imps: [
        { x: 3 * TILE + 16, row: 10, minX: 13, maxX: 6 * TILE - 13, delay: 1.4 },               // 左の高台
        { x: 8 * TILE, row: 13, minX: 6 * TILE + 13, maxX: 10 * TILE - 13, delay: 0.8 },        // 左の段
        { x: 27 * TILE, row: 13, minX: 25 * TILE + 13, maxX: 29 * TILE - 13, delay: 2.0 },      // 右の段
        { x: 32 * TILE, row: 10, minX: 29 * TILE + 13, maxX: 35 * TILE - 13, delay: 2.7 }       // 右の高台
      ],
      torches: [{ x: 560, y: 286 }],
      enemyText: '左右の高台から4体',
      theme: {
        bg: 'castle', stoneH: 205, stoneHV: 10, stoneS: 16, stoneSV: 8, stoneL: 30,
        rim: 'rgba(200,232,255,.16)', cap: true,
        glow: '90,170,255', flame: ['#2f7bff', '#7cc8ff', '#eaf8ff']
      }
    }
  };

  let stageNo = 1;
  let curStage = STAGES[1];
  let staticDirty = true; // 背景・地形の描き直しが必要か
  function buildMap(n) {
    stageNo = STAGES[n] ? n : 1;
    curStage = STAGES[stageNo];
    COLS = curStage.cols;
    LW = COLS * TILE;
    map = [];
    for (let r = 0; r < ROWS; r++) map.push(new Array(COLS).fill('.'));
    curStage.build();
    staticDirty = true;
  }
  buildMap(1);

  function tileAt(c, r) {
    if (c < 0 || c >= COLS || r >= ROWS) return '#';
    if (r < 0) return '.';
    return map[r][c];
  }
  const isSolidCh = (ch) => ch === '#' || ch === 'B';
  const solidAt = (c, r) => isSolidCh(tileAt(c, r));
  function rectSolid(l, t, r, b) {
    const c0 = Math.floor(l / TILE), c1 = Math.floor((r - 0.001) / TILE);
    const r0 = Math.floor(t / TILE), r1 = Math.floor((b - 0.001) / TILE);
    for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) if (solidAt(cc, rr)) return true;
    return false;
  }

  /* ===== 4. セーブデータ ===== */
  const defaultCtl = () => ({ pad: 100, btn: 100, op: 80, pos: { land: {}, port: {} } });
  const emptyBests = () => ({ normal: 0, endless: 0, hard: 0 });
  const save = {
    bests: { 1: emptyBests(), 2: emptyBests() }, // ステージ × モードごとのベスト
    clears: { 1: 0, 2: 0 },                      // ステージごとのノーマルクリア回数
    hardUnlocked: false,                         // ハードモード解放済み
    stage2: false,                               // ステージ2解放済み
    stage: 1,                                    // 選択中のステージ
    muted: false, lastMode: 'normal', ctl: defaultCtl(),
    padSwap: false                               // コントローラーのA/B・X/Y入れ替え
  };
  const okNum = (v) => typeof v === 'number' && isFinite(v);
  function readBests(src, dst) {
    if (!src || typeof src !== 'object') return;
    for (const k of ['normal', 'endless', 'hard']) if (okNum(src[k])) dst[k] = Math.max(0, src[k]);
    dst.normal = Math.min(dst.normal, TIME_LIMIT);
  }
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    if (okNum(s.best)) save.bests[1].normal = clamp(s.best, 0, TIME_LIMIT); // 最初のバージョンの記録
    if (s.bests && typeof s.bests === 'object') {
      if (s.bests[1] || s.bests[2]) { readBests(s.bests[1], save.bests[1]); readBests(s.bests[2], save.bests[2]); }
      else readBests(s.bests, save.bests[1]); // ステージ追加前の記録はステージ1へ
    }
    if (okNum(s.clears)) save.clears[1] = Math.max(0, s.clears | 0);
    else if (s.clears && typeof s.clears === 'object') {
      for (const k of [1, 2]) if (okNum(s.clears[k])) save.clears[k] = Math.max(0, s.clears[k] | 0);
    }
    save.hardUnlocked = s.hardUnlocked === true || save.clears[1] + save.clears[2] > 0;
    save.stage2 = s.stage2 === true;
    if (save.stage2 && s.stage === 2) save.stage = 2;
    if (typeof s.muted === 'boolean') save.muted = s.muted;
    if (typeof s.padSwap === 'boolean') save.padSwap = s.padSwap;
    if (s.lastMode === 'normal' || s.lastMode === 'endless' || s.lastMode === 'hard') save.lastMode = s.lastMode;
    if (s.ctl && typeof s.ctl === 'object') {
      if (okNum(s.ctl.pad)) save.ctl.pad = clamp(Math.round(s.ctl.pad), 60, 150);
      if (okNum(s.ctl.btn)) save.ctl.btn = clamp(Math.round(s.ctl.btn), 60, 150);
      if (okNum(s.ctl.op)) save.ctl.op = clamp(Math.round(s.ctl.op), 30, 100);
      if (s.ctl.pos && typeof s.ctl.pos === 'object') {
        for (const o of ['land', 'port']) {
          const src = s.ctl.pos[o];
          if (!src || typeof src !== 'object') continue;
          for (const k of ['pad', 'jump', 'spin']) {
            const v = src[k];
            if (Array.isArray(v) && v.length === 2 && okNum(v[0]) && okNum(v[1])) {
              save.ctl.pos[o][k] = [clamp(v[0], -1, 1), clamp(v[1], -1, 1)];
            }
          }
        }
      }
    }
  } catch (e) { /* 読み込み失敗時は初期値 */ }
  if (save.stage === 2) buildMap(2);
  function persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(save)); } catch (e) { /* 保存できない環境 */ }
  }

  /* ===== 5. サウンド（WebAudioで全て合成） ===== */
  const AudioSys = (() => {
    let ac = null, master = null, sfxBus = null, bgmBus = null, noiseBuf = null;
    let muted = false, userPaused = false;
    const bgm = { on: false, next: 0, step: 0 };
    const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const BASS = [45, 0, 45, 52, 45, 0, 43, 0, 41, 0, 41, 48, 40, 0, 44, 0];
    const LEAD = [69, 0, 72, 0, 76, 0, 74, 72, 71, 0, 69, 0, 71, 72, 74, 0,
                  72, 0, 69, 0, 65, 0, 69, 72, 71, 0, 68, 0, 64, 0, 0, 0];

    function init() {
      if (ac) {
        if (ac.state === 'suspended' && !userPaused) ac.resume().catch(() => {});
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { ac = new AC(); } catch (e) { ac = null; return; }
      master = ac.createGain(); master.gain.value = muted ? 0 : 0.55; master.connect(ac.destination);
      sfxBus = ac.createGain(); sfxBus.gain.value = 1; sfxBus.connect(master);
      bgmBus = ac.createGain(); bgmBus.gain.value = 0.3; bgmBus.connect(master);
      noiseBuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.6), ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      if (ac.state === 'suspended') ac.resume().catch(() => {});
    }
    function toneAt(type, f0, f1, dur, vol, t, bus) {
      if (!ac) return;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(bus || sfxBus);
      o.start(t); o.stop(t + dur + 0.03);
    }
    function noiseAt(dur, vol, ftype, freq, t, bus) {
      if (!ac) return;
      const s = ac.createBufferSource(); s.buffer = noiseBuf;
      const f = ac.createBiquadFilter(); f.type = ftype; f.frequency.value = freq;
      const g = ac.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(bus || sfxBus);
      s.start(t); s.stop(t + dur + 0.03);
    }
    const tone = (type, f0, f1, dur, vol, delay) => toneAt(type, f0, f1, dur, vol, ac.currentTime + (delay || 0));
    const noise = (dur, vol, ftype, freq, delay) => noiseAt(dur, vol, ftype, freq, ac.currentTime + (delay || 0));

    function play(name) {
      if (!ac || muted || userPaused) return;
      switch (name) {
        case 'jump': tone('square', 330, 720, 0.13, 0.09); break;
        case 'spin': tone('triangle', 520, 1500, 0.16, 0.16); tone('sine', 1600, 800, 0.14, 0.07, 0.07); break;
        case 'wallkick': noise(0.06, 0.22, 'highpass', 2200); tone('square', 260, 900, 0.12, 0.09); break;
        case 'gpStart': tone('triangle', 1300, 420, 0.2, 0.14); break;
        case 'gpLand': noise(0.28, 0.5, 'lowpass', 520); tone('sine', 150, 40, 0.3, 0.45); break;
        case 'land': noise(0.05, 0.1, 'lowpass', 800); break;
        case 'throw': noise(0.16, 0.16, 'bandpass', 950); tone('sawtooth', 240, 90, 0.14, 0.045); break;
        case 'fizz': noise(0.1, 0.05, 'highpass', 3200); break;
        case 'stomp': tone('square', 700, 240, 0.09, 0.12); tone('square', 520, 1200, 0.12, 0.1, 0.08); break;
        case 'death': {
          tone('square', 900, 120, 0.3, 0.12);
          [784, 740, 659, 587, 523, 392, 330, 262].forEach((f, i) => tone('square', f, f * 0.98, 0.12, 0.09, 0.4 + i * 0.1));
          break;
        }
        case 'clear': {
          [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => {
            tone('square', f, 0, 0.14, 0.07, i * 0.1);
            tone('triangle', f / 2, 0, 0.14, 0.12, i * 0.1);
          });
          [1047, 1319, 1568].forEach((f) => tone('triangle', f, 0, 0.9, 0.08, 0.75));
          break;
        }
        case 'ready': tone('square', 660, 0, 0.12, 0.08); break;
        case 'go': tone('square', 990, 0, 0.28, 0.09); tone('square', 1485, 0, 0.28, 0.05); break;
        case 'tick': tone('sine', 1320, 0, 0.07, 0.14); break;
        case 'tickHi': tone('square', 1760, 0, 0.1, 0.08); break;
        case 'ui': tone('triangle', 880, 1320, 0.07, 0.08); break;
        case 'crackle': noise(0.07, 0.14, 'bandpass', 1900); tone('triangle', 420, 760, 0.07, 0.05); break;
        case 'burn': {
          noise(0.55, 0.32, 'lowpass', 1300);
          tone('sawtooth', 140, 55, 0.5, 0.07);
          [784, 1047, 1319, 1568].forEach((f, i) => tone('triangle', f, 0, 0.3, 0.09, 0.5 + i * 0.08));
          break;
        }
        case 'hipCancel': tone('triangle', 900, 1600, 0.09, 0.1); noise(0.05, 0.1, 'highpass', 2500); break;
        case 'medal': [1047, 1319, 1568].forEach((f, i) => tone('triangle', f, 0, 0.16, 0.1, i * 0.06)); break;
        case 'medalTop': [1319, 1568, 2093, 2637].forEach((f, i) => tone('triangle', f, 0, 0.22, 0.09, i * 0.06)); break;
        case 'deny': tone('square', 230, 150, 0.13, 0.07); break;
        case 'levelup': [660, 880, 1320].forEach((f, i) => tone('square', f, 0, 0.1, 0.08, i * 0.07)); break;
      }
    }
    function startBgm() {
      if (!ac) return;
      bgm.on = true; bgm.step = 0; bgm.next = ac.currentTime + 0.06;
    }
    function stopBgm() { bgm.on = false; }
    function schedule(fast) {
      if (!ac || !bgm.on || userPaused) return;
      const stepDur = 60 / (152 * (fast ? 1.14 : 1)) / 2;
      if (bgm.next < ac.currentTime - 0.05) bgm.next = ac.currentTime + 0.02; // タブ復帰時の一気再生を防ぐ
      while (bgm.next < ac.currentTime + 0.15) {
        const s = bgm.step, t = bgm.next;
        const b = BASS[s % BASS.length];
        if (b) toneAt('square', mtof(b), 0, stepDur * 0.85, 0.1, t, bgmBus);
        const l = LEAD[s % LEAD.length];
        if (l) toneAt('triangle', mtof(l), 0, stepDur * 0.95, 0.17, t, bgmBus);
        if (s % 4 === 0) toneAt('sine', 150, 45, 0.12, 0.32, t, bgmBus);
        if (s % 2 === 1) noiseAt(0.03, 0.05, 'highpass', 7000, t, bgmBus);
        bgm.next += stepDur;
        bgm.step++;
      }
    }
    function setMuted(m) {
      muted = m;
      if (master && ac) master.gain.setTargetAtTime(m ? 0 : 0.55, ac.currentTime, 0.02);
    }
    function setPaused(p) {
      userPaused = p;
      if (!ac) return;
      if (p) ac.suspend().catch(() => {});
      else ac.resume().catch(() => {});
    }
    return { init, play, startBgm, stopBgm, schedule, setMuted, setPaused };
  })();
  const sfx = (n) => AudioSys.play(n);
  AudioSys.setMuted(save.muted);

  /* ===== 6. 入力 ===== */
  const input = { left: false, right: false, up: false, down: false, jump: false, dash: false, spin: false };
  const buf = { jump: 0, spin: 0, down: 0, up: 0 };
  const kb = { left: false, right: false, up: false, down: false, jump: false, dash: false, spin: false };
  const kbEdge = { left: false, right: false, up: false, down: false, jump: false, dash: false, spin: false };
  const tc = { left: false, right: false, up: false, down: false, jump: false, spin: false, dash: false };
  const KEY_UP = { ArrowUp: true, KeyW: true }; // ↑はジャンプ兼ヒップキャンセル
  const tcEdge = { jump: false, spin: false };
  const gpPrev = { jump: false, start: false };

  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowDown: 'down', KeyS: 'down',
    ArrowUp: 'jump', KeyW: 'jump', Space: 'jump', KeyZ: 'jump', KeyK: 'jump',
    ShiftLeft: 'dash', ShiftRight: 'dash', KeyX: 'dash', KeyJ: 'dash',
    KeyC: 'spin', KeyL: 'spin'
  };

  function pollGamepad() {
    const r = {
      left: false, right: false, up: false, down: false, jump: false, dash: false, spin: false, start: false,
      connected: false, mUp: false, mDown: false, mLeft: false, mRight: false, a: false, b: false // メニュー操作用
    };
    if (!navigator.getGamepads) return r;
    let pads;
    try { pads = navigator.getGamepads(); } catch (e) { return r; }
    if (!pads) return r;
    for (let i = 0; i < pads.length; i++) {
      const gp = pads[i];
      if (!gp || !gp.connected) continue;
      r.connected = true;
      // A/B・X/Y入れ替え（Switch系のコントローラー向け）
      const SWAP = [1, 0, 3, 2];
      const b = (n) => {
        const m = save.padSwap && n < 4 ? SWAP[n] : n;
        return !!(gp.buttons[m] && gp.buttons[m].pressed);
      };
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      if (b(12) || ay < -0.5) r.mUp = true;
      if (b(12) || ay < -0.6) r.up = true;
      if (b(13) || ay > 0.5) r.mDown = true;
      if (b(14) || ax < -0.5) r.mLeft = true;
      if (b(15) || ax > 0.5) r.mRight = true;
      if (b(0)) r.a = true;
      if (b(1)) r.b = true;
      if (b(14) || ax < -0.25) r.left = true;
      if (b(15) || ax > 0.25) r.right = true;
      if (Math.abs(ax) > 0.75) r.dash = true; // スティックを大きく倒すとダッシュ
      if (b(13) || ay > 0.6) r.down = true;
      if (b(0) || b(1)) r.jump = true;
      if (b(2) || b(3) || b(4) || b(5) || b(6) || b(7)) r.spin = true; // X・Y・LB・RB・LT・RT
      if (b(9)) r.start = true;
    }
    return r;
  }

  function pollInput() {
    const gp = pollGamepad();
    const cur = {
      left: kb.left || tc.left || gp.left,
      right: kb.right || tc.right || gp.right,
      up: kb.up || tc.up || gp.up,
      down: kb.down || tc.down || gp.down,
      jump: kb.jump || tc.jump || gp.jump,
      dash: kb.dash || tc.dash || gp.dash,
      spin: kb.spin || tc.spin || gp.spin
    };
    if ((cur.jump && !input.jump) || kbEdge.jump || tcEdge.jump) buf.jump = PH.JUMP_BUF;
    if ((cur.spin && !input.spin) || kbEdge.spin || tcEdge.spin) buf.spin = 0.1;
    if ((cur.down && !input.down) || kbEdge.down) buf.down = 0.1;
    if ((cur.up && !input.up) || kbEdge.up) buf.up = 0.05;
    for (const k in kbEdge) kbEdge[k] = false;
    tcEdge.jump = tcEdge.spin = false;

    setPadConnected(gp.connected);
    if (gp.start && !gpPrev.start) onStartButton();
    gpPrev.start = gp.start;
    menuGamepad(gp);

    Object.assign(input, cur);
  }

  /* ===== 7. ゲーム状態・生成 ===== */
  let state = 'title'; // title / ready / play / dead / clear
  let stateT = 0;
  let paused = false;
  let elapsed = 0;
  let lastSec = 99;
  let resultShown = false;
  let resultAt = 0;
  let lastNew = false;
  let mode = save.lastMode; // normal / endless / hard
  let hardLv = 1;
  let unlockedNow = false; // このクリアでハードモードが解放されたか
  let medalNow = 0;         // このプレイで獲得したメダル（ノーマルモード）

  let player = null;
  let imps = [];
  let fireballs = [];
  let particles = [];

  function makePlayer() {
    return {
      x: curStage.safe[0] * TILE + 16, y: curStage.safe[1] * TILE, vx: 0, vy: 0, face: 1, h: PH.H,
      onGround: true, coyote: 0, jumpHeld: false, crouch: false,
      wallSide: 0, sliding: false, lockT: 0,
      spinT: 0, spinCD: 0, spinPhase: 0, spinJump: false,
      hoverT: 0, recoverT: 0, spinCool: 0,
      gp: 0, gpT: 0, gpFallT: 0, spinAnim: 0,
      walkPhase: 0, squash: 1, blinkT: rand(2, 4),
      skidFx: 0, slideFx: 0,
      dead: false, deadT: 0, deadJump: false, win: false
    };
  }

  function makeImp(x, groundY, minX, maxX, delay) {
    return {
      x, y: groundY, groundY, minX, maxX,
      vy: 0, onGround: true, dir: Math.random() < 0.5 ? -1 : 1, face: -1,
      state: 'walk', t: delay, volley: 0, throwT: 0, throwAnim: 0,
      hopT: rand(0.4, 1.2), anim: rand(0, 10), alive: true, rot: 0, vx: 0
    };
  }

  function resetWorld() {
    player = makePlayer();
    imps = curStage.imps.map((d) => makeImp(d.x, d.row * TILE, d.minX, d.maxX, d.delay));
    fireballs = [];
    particles = [];
    elapsed = 0;
    lastSec = 99;
    hardLv = 1;
    stateT = 0;
    resultShown = false;
    shakeT = 0; shakeX = 0; shakeY = 0;
    setMedal(0, false);
  }

  /* ===== 8. プレイヤー ===== */
  function updatePlayer(dt) {
    const p = player;
    if (p.dead) { updateDeadPlayer(dt); return; }

    const ctl = state === 'play';
    const L = ctl && input.left, R = ctl && input.right, D = ctl && input.down;
    const dir = (R ? 1 : 0) - (L ? 1 : 0);
    const dash = ctl && input.dash;

    p.lockT = Math.max(0, p.lockT - dt);
    p.spinCD = Math.max(0, p.spinCD - dt);
    p.spinCool = Math.max(0, p.spinCool - dt);
    if (p.spinT > 0) {
      p.spinT -= dt;
      p.spinPhase += dt * 28;
      if (p.spinT <= 0) p.spinT = 0; // 地上スピンジャンプの状態（spinJump）は着地か壁キックまで続く
    }
    if (p.spinAnim > 0) p.spinAnim = Math.max(0, p.spinAnim - dt);
    p.coyote = p.onGround ? PH.COYOTE : Math.max(0, p.coyote - dt);
    p.squash = approach(p.squash, 1, dt * 3.2);
    p.blinkT -= dt;
    if (p.blinkT < -0.13) p.blinkT = rand(1.8, 4.2);

    // ヒップドロップ着地後の硬直
    if (p.gp === 3) {
      p.gpT -= dt;
      if (p.gpT <= 0) p.gp = 0;
    }

    // ヒップドロップ開始（空中で↓）
    if (ctl && buf.down > 0 && !p.onGround && p.gp === 0 && !p.spinJump) { // 地上スピンジャンプ中は不可
      buf.down = 0;
      p.gp = 1; p.gpT = PH.GP_WAIT;
      p.vx = 0; p.vy = 0;
      p.spinT = 0; p.spinJump = false; p.sliding = false;
      p.hoverT = 0; p.recoverT = 0; p.spinAnim = 0;
      sfx('gpStart');
    }

    // しゃがみ
    const wantCrouch = p.onGround && D && p.gp === 0;
    if (wantCrouch && !p.crouch) {
      p.crouch = true; p.h = PH.CROUCH_H;
    } else if (!wantCrouch && p.crouch && !rectSolid(p.x - PH.W / 2, p.y - PH.H, p.x + PH.W / 2, p.y)) {
      p.crouch = false; p.h = PH.H;
    }

    if (p.gp === 1) {
      // ヒップドロップ：空中で一回転して溜める
      p.gpT -= dt;
      p.vx = 0; p.vy = 0;
      if (p.gpT <= 0) { p.gp = 2; p.vy = 0; p.gpFallT = 0; }
    } else if (p.gp === 2) {
      // ヒップドロップ：真下へ急降下（一気に加速）
      p.gpFallT += dt;
      p.vx = 0;
      p.vy = Math.min(PH.GP_V, p.vy + PH.GP_ACC * dt);
      if (Math.random() < 0.5) {
        addP({ kind: 'line', x: p.x + rand(-11, 11), y: p.y - rand(30, 48), vx: 0, vy: -80, life: 0.16, size: rand(10, 18) });
      }
      // ヒップキャンセル：落ち始めたら↑で解除。すぐ空中スピンを出せる
      if (ctl && buf.up > 0) {
        buf.up = 0;
        buf.jump = 0; // ↑がジャンプキーを兼ねていても、勝手にスピンしないように
        p.gp = 0;
        p.vy = 0;
        p.spinCool = 0;
        p.hoverT = 0; p.recoverT = 0;
        sfx('hipCancel');
        sparks(p.x, p.y - 18, 8, '#cfe8ff', 140);
        addP({ kind: 'ring', x: p.x, y: p.y - 18, life: 0.25, size: 6, grow: 22, color: 'rgba(200,235,255,.8)' });
      }
    } else {
      // --- 横移動 ---
      if (p.gp === 3) {
        p.vx = approach(p.vx, 0, PH.SKID * dt);
      } else {
        const maxS = dash ? PH.RUN : PH.WALK;
        const cdir = p.lockT > 0 ? 0 : dir;
        if (p.onGround) {
          if (p.crouch) {
            p.vx = approach(p.vx, 0, PH.DEC * dt);
          } else if (cdir !== 0) {
            if (p.vx !== 0 && sign(p.vx) !== cdir) {
              p.vx = approach(p.vx, 0, PH.SKID * dt); // 切り返しブレーキ
              if (Math.abs(p.vx) > 60) {
                p.skidFx -= dt;
                if (p.skidFx <= 0) { p.skidFx = 0.05; dust(p.x - cdir * 6, p.y, 1); }
              }
            } else {
              const acc = Math.abs(p.vx) > maxS ? PH.DEC : (dash ? PH.ACC_RUN : PH.ACC);
              p.vx = approach(p.vx, cdir * maxS, acc * dt);
            }
          } else {
            p.vx = approach(p.vx, 0, PH.DEC * dt);
          }
        } else if (p.lockT <= 0) {
          if (cdir !== 0) {
            // 空中では勢いを殺さない（同じ向きで最高速より速ければそのまま）
            if (!(sign(p.vx) === cdir && Math.abs(p.vx) > maxS)) p.vx = approach(p.vx, cdir * maxS, PH.ACC_AIR * dt);
          } else {
            p.vx = approach(p.vx, 0, PH.AIR_DRAG * dt);
          }
        }
        if (cdir !== 0 && !p.sliding && !(p.onGround && p.crouch)) p.face = cdir;
      }

      // --- ジャンプ / 壁キック ---
      if (ctl && p.gp === 0 && buf.jump > 0) {
        if (p.onGround || p.coyote > 0) {
          p.vy = -(PH.JUMP_V + Math.abs(p.vx) * PH.JUMP_RUN_BONUS);
          p.onGround = false; p.coyote = 0; buf.jump = 0;
          p.jumpHeld = true; p.hoverT = 0; p.recoverT = 0; p.squash = 1.22;
          sfx('jump');
          dust(p.x, p.y, 4);
        } else if (p.wallSide !== 0 && p.vy > -150) {
          const s = p.wallSide;
          p.vx = -s * PH.WALL_KICK_VX;
          p.vy = -PH.WALL_KICK_VY;
          p.face = -s; p.lockT = PH.WALL_LOCK; p.sliding = false;
          p.spinT = 0; p.spinJump = false;
          p.spinCool = 0; p.hoverT = 0; p.recoverT = 0; // 壁キックで空中スピンのクールタイム解除
          p.jumpHeld = true; buf.jump = 0; p.squash = 1.2;
          sfx('wallkick');
          sparks(p.x + s * PH.W / 2, p.y - p.h * 0.5, 8, '#cfe8ff', 160);
          dust(p.x + s * PH.W / 2, p.y - p.h * 0.4, 3);
        } else if (p.spinCool <= 0 && !p.crouch && !p.spinJump) {
          // 空中でジャンプボタン → 空中スピン（壁キックできる場所では壁キック優先）
          buf.jump = 0;
          buf.spin = Math.max(buf.spin, 0.05);
        }
      }
      if (!input.jump || !ctl) p.jumpHeld = false;

      // --- スピン ---
      const canSpin = p.onGround ? p.spinCD <= 0 : p.spinCool <= 0 && !p.spinJump; // 地上スピンジャンプ中は空中スピン不可
      if (ctl && p.gp === 0 && buf.spin > 0 && canSpin && !p.crouch) {
        buf.spin = 0;
        if (p.onGround) {
          // スピンジャンプ
          p.vy = -PH.SPIN_JUMP_V;
          p.onGround = false; p.coyote = 0;
          p.spinT = PH.SPIN_GROUND_TIME; p.spinJump = true;
          dust(p.x, p.y, 4);
        } else {
          // 空中スピン：上昇は止めず、落下だけをゆっくりにする（着地まで何回でも／0.55秒のクールタイム）
          p.hoverT = PH.SPIN_HOVER; p.recoverT = 0;
          p.spinT = PH.SPIN_HOVER; p.spinJump = false;
          p.spinAnim = PH.SPIN_ANIM; // 1回だけくるっと回る
        }
        p.spinCool = PH.SPIN_COOL;
        p.spinCD = PH.SPIN_CD; p.sliding = false;
        sfx('spin');
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU;
          addP({ kind: 'star', x: p.x + Math.cos(a) * 14, y: p.y - 20 + Math.sin(a) * 14, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70, life: 0.35, size: 4.5, rot: a, vr: 7, color: '#fff3a8' });
        }
      }

      // --- 重力 ---
      let g, maxF = PH.MAX_FALL;
      if (p.spinJump) g = PH.G_UP; // 地上スピンジャンプは上昇も下降も同じ重力（ゆっくり落ちない）
      else if (p.vy < 0) g = p.jumpHeld ? PH.G_UP : PH.G_UP_RELEASE;
      else g = PH.G_DOWN;
      let hardCap = false;
      if (p.hoverT > 0) {
        // 空中スピン中：上昇はそのまま、落下速度だけ小さく抑える
        p.hoverT -= dt;
        maxF = Math.min(maxF, PH.SPIN_FALL);
        hardCap = true;
        if (p.hoverT <= 0) { p.hoverT = 0; p.recoverT = PH.SPIN_RECOVER; }
      } else if (p.recoverT > 0) {
        // スピン明け：0.25秒かけて落下速度の上限を通常の最高速まで戻す
        p.recoverT = Math.max(0, p.recoverT - dt);
        const k = 1 - p.recoverT / PH.SPIN_RECOVER;
        maxF = Math.min(maxF, PH.SPIN_FALL + (PH.MAX_FALL - PH.SPIN_FALL) * k);
        hardCap = true;
      }
      if (p.sliding) { maxF = Math.min(maxF, PH.WALL_SLIDE); p.recoverT = 0; }
      p.vy += g * dt;
      if (p.vy > maxF) p.vy = hardCap ? maxF : approach(p.vy, maxF, 3200 * dt);
    }

    // --- 移動と当たり判定 ---
    const wasGround = p.onGround;
    const vyBefore = p.vy;
    moveX(p, dt);
    moveY(p, dt);
    if (!wasGround && p.onGround) onLand(p, vyBefore);

    // --- 壁の検出・壁ずり ---
    p.wallSide = 0;
    p.sliding = false;
    if (!p.onGround && p.gp === 0) {
      if (wallAt(p, -1)) p.wallSide = -1;
      else if (wallAt(p, 1)) p.wallSide = 1;
      if (p.wallSide !== 0 && p.vy > 0 && dir === p.wallSide && p.lockT <= 0 && p.spinT <= 0 && !p.spinJump) {
        p.sliding = true;
        p.face = -p.wallSide;
        p.slideFx -= dt;
        if (p.slideFx <= 0) { p.slideFx = 0.07; dust(p.x + p.wallSide * PH.W / 2, p.y - 6, 1, 0.4); }
      }
    }

    if (p.onGround && !p.crouch) p.walkPhase += Math.abs(p.vx) * dt * 0.085;

    if (ctl) checkHazards(p);
  }

  function moveX(p, dt) {
    p.x += p.vx * dt;
    const hw = PH.W / 2;
    const r0 = Math.floor((p.y - p.h) / TILE), r1 = Math.floor((p.y - 0.001) / TILE);
    if (p.vx > 0) {
      const c = Math.floor((p.x + hw - 0.001) / TILE);
      for (let r = r0; r <= r1; r++) if (solidAt(c, r)) { p.x = c * TILE - hw; p.vx = 0; break; }
    } else if (p.vx < 0) {
      const c = Math.floor((p.x - hw) / TILE);
      for (let r = r0; r <= r1; r++) if (solidAt(c, r)) { p.x = (c + 1) * TILE + hw; p.vx = 0; break; }
    }
  }

  function moveY(p, dt) {
    p.y += p.vy * dt;
    const hw = PH.W / 2;
    const c0 = Math.floor((p.x - hw) / TILE), c1 = Math.floor((p.x + hw - 0.001) / TILE);
    p.onGround = false;
    if (p.vy >= 0) {
      const row = Math.floor(p.y / TILE);
      for (let c = c0; c <= c1; c++) {
        if (solidAt(c, row)) { p.y = row * TILE; p.vy = 0; p.onGround = true; break; }
      }
    } else {
      const top = p.y - p.h;
      if (top < 0) { p.y = p.h; p.vy = 0; return; } // 画面上端は見えない天井
      const row = Math.floor(top / TILE);
      for (let c = c0; c <= c1; c++) {
        if (solidAt(c, row)) { p.y = (row + 1) * TILE + p.h; p.vy = 0; break; }
      }
    }
  }

  function wallAt(p, side) {
    const hw = PH.W / 2;
    const x = side < 0 ? p.x - hw - 1.5 : p.x + hw + 1.5;
    const c = Math.floor(x / TILE);
    const r0 = Math.floor((p.y - p.h + 6) / TILE), r1 = Math.floor((p.y - 6) / TILE);
    for (let r = r0; r <= r1; r++) if (solidAt(c, r)) return true;
    return false;
  }

  function onLand(p, vy) {
    p.spinT = 0; p.spinJump = false; p.sliding = false;
    p.spinCool = 0; p.hoverT = 0; p.recoverT = 0; p.spinAnim = 0;
    if (p.gp === 2) {
      p.gp = 3; p.gpT = PH.GP_STUN;
      p.squash = 0.6;
      addShake(5, 0.25);
      sfx('gpLand');
      dust(p.x, p.y, 10, 2.2);
      addP({ kind: 'ring', x: p.x, y: p.y - 2, life: 0.35, size: 6, grow: 36, color: 'rgba(200,235,255,.9)' });
      for (let i = 0; i < 5; i++) {
        addP({ kind: 'star', x: p.x + rand(-14, 14), y: p.y - 4, vx: rand(-120, 120), vy: rand(-180, -60), g: 500, life: 0.4, size: 4, rot: rand(0, TAU), vr: 8, color: '#fff3a8' });
      }
    } else if (vy > 180) {
      p.squash = clamp(1 - vy / 1800, 0.7, 0.92);
      dust(p.x, p.y, 3);
      sfx('land');
    }
  }

  function checkHazards(p) {
    if (p.dead) return;
    const hw = PH.W / 2 - 1.5;
    const l = p.x - hw, r = p.x + hw, t = p.y - p.h + 3, b = p.y - 0.5;

    // トゲ
    const c0 = Math.floor(l / TILE), c1 = Math.floor((r - 0.001) / TILE);
    const r0 = Math.floor(t / TILE), r1 = Math.floor((b - 0.001) / TILE);
    for (let rr = r0; rr <= r1; rr++) {
      for (let cc = c0; cc <= c1; cc++) {
        if (tileAt(cc, rr) !== '^') continue;
        const sx = cc * TILE + 4, sy = rr * TILE + 12, sw = TILE - 8, sh = TILE - 12;
        if (r > sx && l < sx + sw && b > sy && t < sy + sh) { killPlayer(); return; }
      }
    }

    // 火の玉
    for (const f of fireballs) {
      const fr = f.r * 0.85;
      const nx = clamp(f.x, l, r), ny = clamp(f.y, t, b);
      const dx = f.x - nx, dy = f.y - ny;
      if (dx * dx + dy * dy < fr * fr) { killPlayer(); return; }
    }

    // 敵本体（上から踏めば倒せる）
    for (const m of imps) {
      if (!m.alive) continue;
      const ml = m.x - IMP.W / 2, mr = m.x + IMP.W / 2, mt = m.y - IMP.H, mb = m.y;
      if (r > ml && l < mr && b > mt && t < mb) {
        if (p.vy > 50 && p.y - p.vy * STEP <= mt + 10) {
          m.alive = false; m.vy = -380; m.vx = p.x < m.x ? 80 : -80;
          p.vy = input.jump ? -600 : -420;
          p.gp = 0; p.spinCool = 0; p.hoverT = 0; p.recoverT = 0; p.spinJump = false; p.spinT = 0;
          sfx('stomp');
          puff(m.x, m.y - 20, 6);
          sparks(m.x, m.y - 30, 10, '#ffcf5a', 180);
        } else {
          killPlayer(); return;
        }
      }
    }
  }

  function killPlayer() {
    const p = player;
    p.dead = true; p.deadT = 0; p.deadJump = false;
    p.vx = 0; p.vy = 0; p.gp = 0; p.spinT = 0; p.hoverT = 0; p.recoverT = 0; p.crouch = false; p.h = PH.H;
    state = 'dead'; stateT = 0;
    AudioSys.stopBgm();
    sfx('death');
    addShake(6, 0.3);
    try { if (navigator.vibrate) navigator.vibrate(120); } catch (e) { /* 非対応 */ }
    sparks(p.x, p.y - 20, 16, '#ffb43a', 240);
    for (let i = 0; i < 6; i++) {
      addP({ kind: 'star', x: p.x, y: p.y - 22, vx: rand(-160, 160), vy: rand(-220, -40), g: 400, life: 0.6, size: 5, rot: rand(0, TAU), vr: 9, color: '#ffe9a8' });
    }
    if (mode === 'hard') hardLv = hardLevel();
    const rec = save.bests[stageNo];
    lastNew = elapsed > rec[mode] + 1e-6;
    if (lastNew) { rec[mode] = elapsed; persist(); }
  }

  function updateDeadPlayer(dt) {
    const p = player;
    p.deadT += dt;
    if (p.deadT > 0.55) {
      if (!p.deadJump) { p.deadJump = true; p.vy = -560; }
      p.vy += 1500 * dt;
      p.y += p.vy * dt;
    }
  }

  /* ===== 9. 敵（フレイムインプ） ===== */
  // ノーマル・エンドレスは難易度一定。ハードだけレベルで変化する
  function hardLevel() {
    if (mode !== 'hard') return 1;
    return Math.min(HARD.LV_MAX, 1 + Math.floor(elapsed / HARD.LV_SEC));
  }
  function diffParams() {
    const k = mode === 'hard' ? (hardLevel() - 1) / (HARD.LV_MAX - 1) : 0;
    return {
      intMax: IMP.INT_MAX + (HARD.INT_MAX_END - IMP.INT_MAX) * k, // 投げる間隔の上限
      spd: 1 + (HARD.SPD_END - 1) * k,                           // 火の玉の速さ倍率
      walk: 1 + (HARD.WALK_END - 1) * k                          // 歩く速さ倍率
    };
  }
  // 次に構え始めるまでの時間（構える時間と合わせて最低0.6秒）
  function nextThrowWait() {
    const d = diffParams();
    return Math.max(0, rand(IMP.INT_MIN, Math.max(IMP.INT_MIN, d.intMax)) - IMP.AIM);
  }

  function updateImp(m, dt) {
    m.anim += dt;
    if (!m.alive) {
      m.vy += 1400 * dt; m.y += m.vy * dt; m.x += m.vx * dt; m.rot += dt * 8;
      return;
    }
    m.throwAnim = Math.max(0, m.throwAnim - dt);

    // 重力（ジャンプ中）
    if (!m.onGround) {
      m.vy += 1300 * dt;
      m.y += m.vy * dt;
      if (m.y >= m.groundY) { m.y = m.groundY; m.vy = 0; m.onGround = true; }
    }
    m.face = player.x < m.x ? -1 : 1;

    if (state !== 'play') {
      // 待機中・クリア後はその場で跳ねるだけ
      if (m.onGround && Math.random() < dt * (state === 'clear' ? 2.2 : 0.5)) {
        m.vy = -rand(200, 300); m.onGround = false;
      }
      return;
    }

    switch (m.state) {
      case 'walk': {
        m.x += m.dir * IMP.WALK * diffParams().walk * dt;
        if (m.x < m.minX) { m.x = m.minX; m.dir = 1; }
        else if (m.x > m.maxX) { m.x = m.maxX; m.dir = -1; }
        if (Math.random() < dt * 0.5) m.dir *= -1;
        m.hopT -= dt;
        if (m.hopT <= 0 && m.onGround) {
          m.vy = -rand(230, 350); m.onGround = false;
          m.hopT = rand(0.6, 1.7);
        }
        m.t -= dt;
        if (m.t <= 0 && m.onGround) { m.state = 'aim'; m.t = IMP.AIM; }
        break;
      }
      case 'aim':
        m.t -= dt;
        if (m.t <= 0) {
          throwFireball(m); // 1回に1個だけ（連投なし）
          m.state = 'walk';
          m.t = nextThrowWait();
          m.dir = Math.random() < 0.5 ? -1 : 1;
        }
        break;
    }
  }

  function throwFireball(m) {
    const hx = m.x + m.face * 12, hy = m.y - 34;
    fireballs.push({
      x: hx, y: hy,
      vx: m.face * rand(175, 240) * diffParams().spd,
      vy: -rand(110, 330),
      r: FB.R, rot: 0, life: FB.LIFE, trailT: 0,
      bounce: rand(FB.BOUNCE_MIN, FB.BOUNCE_MAX)
    });
    m.throwAnim = 0.2;
    sfx('throw');
    sparks(hx, hy, 6, '#ffcf5a', 120);
  }

  /* ===== 10. 火の玉 ===== */
  function fbBlocked(c, r) {
    if (r < 0) return false;
    const ch = tileAt(c, r);
    return ch === '#' || ch === 'B' || ch === '^';
  }
  let fizzCD = 0;

  function stepFireball(f, dt) {
    f.life -= dt;
    f.rot += dt * 14;
    if (f.life <= 0 || f.x < -40 || f.x > LW + 40 || f.y > LH + 40) return false;

    // 横移動：壁に当たったら消える
    f.x += f.vx * dt;
    const fc = Math.floor((f.x + sign(f.vx) * f.r * 0.8) / TILE);
    if (fbBlocked(fc, Math.floor(f.y / TILE))) {
      puff(f.x, f.y, 4);
      sparks(f.x, f.y, 5, '#ff9a3a', 100);
      if (fizzCD <= 0) { sfx('fizz'); fizzCD = 0.08; }
      return false;
    }

    // 縦移動：床やトゲの上で弾む
    f.vy = Math.min(f.vy + FB.G * dt, FB.MAX_VY);
    f.y += f.vy * dt;
    const cc = Math.floor(f.x / TILE);
    if (f.vy > 0) {
      const rb = Math.floor((f.y + f.r) / TILE);
      if (fbBlocked(cc, rb)) {
        f.y = rb * TILE - f.r;
        f.vy = -f.bounce;
        sparks(f.x, f.y + f.r, 3, '#ffb43a', 70);
      }
    } else {
      const rt = Math.floor((f.y - f.r) / TILE);
      if (rt >= 0 && fbBlocked(cc, rt)) { f.y = (rt + 1) * TILE + f.r; f.vy = 0; }
    }

    // 尾を引く火の粉
    f.trailT -= dt;
    if (f.trailT <= 0) {
      f.trailT = 0.028;
      addP({ kind: 'spark', x: f.x + rand(-2, 2), y: f.y + rand(-2, 2), vx: -f.vx * 0.1 + rand(-20, 20), vy: rand(-40, -5), g: -20, life: rand(0.18, 0.32), size: rand(2, 3.6), color: Math.random() < 0.5 ? '#ffb43a' : '#ff6a2a' });
    }
    return true;
  }

  function updateFireballs(dt) {
    fizzCD = Math.max(0, fizzCD - dt);
    for (let i = fireballs.length - 1; i >= 0; i--) {
      if (!stepFireball(fireballs[i], dt)) fireballs.splice(i, 1);
    }
  }

  /* ===== 11. パーティクル・画面揺れ ===== */
  function addP(o) {
    o.max = o.life;
    if (particles.length > 650) particles.shift();
    particles.push(o);
  }
  function dust(x, y, n, spread) {
    const s = spread || 1;
    for (let i = 0; i < n; i++) {
      addP({ kind: 'dust', x: x + rand(-6, 6), y: y - rand(0, 3), vx: rand(-60, 60) * s, vy: rand(-60, -10), g: 120, drag: 2, life: rand(0.25, 0.45), size: rand(2, 4), grow: 1.5 });
    }
  }
  function sparks(x, y, n, color, speed) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), v = rand(0.3, 1) * speed;
      addP({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 300, drag: 1.5, life: rand(0.2, 0.45), size: rand(1.5, 3), color });
    }
  }
  function puff(x, y, n) {
    for (let i = 0; i < n; i++) {
      addP({ kind: 'puff', x: x + rand(-4, 4), y: y + rand(-4, 4), vx: rand(-40, 40), vy: rand(-50, -10), drag: 2, life: rand(0.3, 0.5), size: rand(3, 6) });
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const q = particles[i];
      q.life -= dt;
      if (q.life <= 0) { particles.splice(i, 1); continue; }
      q.vy = (q.vy || 0) + (q.g || 0) * dt;
      if (q.drag) {
        const k = Math.max(0, 1 - q.drag * dt);
        q.vx *= k; q.vy *= k;
      }
      q.x += (q.vx || 0) * dt;
      q.y += q.vy * dt;
      if (q.vr) q.rot += q.vr * dt;
    }
  }

  let shakeT = 0, shakeDur = 1, shakeMag = 0, shakeX = 0, shakeY = 0;
  function addShake(mag, dur) {
    const cur = shakeT > 0 ? shakeMag * (shakeT / shakeDur) : 0;
    if (mag >= cur) { shakeMag = mag; shakeT = dur; shakeDur = dur; }
  }
  function updateShake(dt) {
    if (shakeT > 0) {
      shakeT -= dt;
      const k = Math.max(0, shakeT / shakeDur);
      shakeX = rand(-1, 1) * shakeMag * k;
      shakeY = rand(-1, 1) * shakeMag * k;
    } else {
      shakeX = 0; shakeY = 0;
    }
  }

  /* ===== 12. 描画（背景・タイル：リサイズ時に1回だけ生成） ===== */
  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d');
  const staticCv = document.createElement('canvas');
  let dpr = 1, scale = 1;

  function buildStatic() {
    staticCv.width = cv.width;
    staticCv.height = cv.height;
    const g = staticCv.getContext('2d');
    g.setTransform(scale, 0, 0, scale, 0, 0);
    drawBackground(g);
    drawTiles(g);
  }

  function drawBackground(g) {
    if (curStage.theme.bg === 'castle') drawBackgroundCastle(g);
    else drawBackgroundRuins(g);
  }

  // ステージ2：青い炎の古城の広間
  function archPath(g, cx, top, w, h) {
    const r = w / 2;
    g.beginPath();
    g.moveTo(cx - r, top + h);
    g.lineTo(cx - r, top + r);
    g.arc(cx, top + r, r, Math.PI, TAU);
    g.lineTo(cx + r, top + h);
    g.closePath();
  }
  function drawBackgroundCastle(g) {
    const rnd = mulberry32(352026);
    let gr = g.createLinearGradient(0, 0, 0, LH);
    gr.addColorStop(0, '#0c1a22');
    gr.addColorStop(0.6, '#0a141c');
    gr.addColorStop(1, '#0b0f17');
    g.fillStyle = gr;
    g.fillRect(0, 0, LW, LH);

    // 奥の壁の石積み
    for (let y = 0, row = 0; y < LH; y += 24, row++) {
      const off = row % 2 ? 0 : 28;
      for (let x = -off; x < LW; x += 56) {
        const v = rnd();
        g.fillStyle = `rgba(${(70 + v * 30) | 0},${(110 + v * 30) | 0},${(130 + v * 30) | 0},${(0.05 + v * 0.06).toFixed(3)})`;
        g.fillRect(x + 2, y + 2, 52, 20);
      }
    }

    // 天井のアーチ
    g.strokeStyle = 'rgba(120,190,200,.10)';
    g.lineWidth = 14;
    for (const [cx, rad] of [[200, 170], [560, 230], [920, 170]]) {
      g.beginPath();
      g.arc(cx, 120, rad, Math.PI, TAU);
      g.stroke();
    }

    // アーチ窓と差し込む光
    for (const wx of [150, 345, 775, 970]) {
      const top = 300, w = 56, h = 150;
      const dir = wx < LW / 2 ? 1 : -1;
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = 'rgba(140,200,240,.05)';
      g.beginPath();
      g.moveTo(wx - w / 2, top + 40);
      g.lineTo(wx + w / 2, top + 40);
      g.lineTo(wx + w / 2 + dir * 130, 570);
      g.lineTo(wx - w / 2 + dir * 130, 570);
      g.closePath();
      g.fill();
      const gl = g.createRadialGradient(wx, top + 60, 4, wx, top + 60, 110);
      gl.addColorStop(0, 'rgba(150,215,255,.2)');
      gl.addColorStop(1, 'rgba(150,215,255,0)');
      g.fillStyle = gl;
      g.fillRect(wx - 110, top - 50, 220, 230);
      g.restore();
      archPath(g, wx, top - 6, w + 14, h + 12);
      g.fillStyle = 'rgba(18,32,42,.92)';
      g.fill();
      archPath(g, wx, top, w, h);
      const wg = g.createLinearGradient(0, top, 0, top + h);
      wg.addColorStop(0, 'rgba(190,232,255,.55)');
      wg.addColorStop(1, 'rgba(70,130,170,.32)');
      g.fillStyle = wg;
      g.fill();
      g.fillStyle = 'rgba(15,26,34,.88)';
      g.fillRect(wx - 2, top, 4, h);
      g.fillRect(wx - w / 2, top + 72, w, 4);
    }

    // 細い柱
    for (const px of [250, 870]) {
      gr = g.createLinearGradient(px - 26, 0, px + 26, 0);
      gr.addColorStop(0, '#0b1d24');
      gr.addColorStop(0.4, '#245159');
      gr.addColorStop(1, '#0a1a20');
      g.fillStyle = gr;
      g.fillRect(px - 24, 90, 48, 480);
      g.fillStyle = 'rgba(0,0,0,.22)';
      for (let k = -14; k <= 14; k += 10) g.fillRect(px + k - 1, 106, 2, 460);
      g.fillStyle = '#1d3e46';
      g.fillRect(px - 36, 84, 72, 14);
      g.fillRect(px - 30, 98, 60, 8);
    }

    // 中央のルーンの大柱
    const cx = 560;
    gr = g.createLinearGradient(cx - 100, 0, cx + 100, 0);
    gr.addColorStop(0, '#0d232a');
    gr.addColorStop(0.45, '#2a5c66');
    gr.addColorStop(1, '#0b1d23');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(cx - 95, 70);
    g.lineTo(cx + 95, 70);
    g.lineTo(cx + 55, 570);
    g.lineTo(cx - 55, 570);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,.25)';
    g.lineWidth = 1.5;
    for (let y = 110; y < 570; y += 34) {
      const hw = 95 - (40 * (y - 70)) / 500;
      g.beginPath();
      g.moveTo(cx - hw, y);
      g.lineTo(cx + hw, y);
      g.stroke();
    }
    g.fillStyle = '#16363d';
    ell(g, cx, 54, 122, 16);
    g.fillStyle = '#1f4952';
    ell(g, cx, 72, 108, 16);
    // 柱に刻まれたルーン
    g.fillStyle = 'rgba(110,230,230,.22)';
    for (let i = 0; i < 9; i++) {
      const ry = 380 + i * 14, w = 4 + rnd() * 8;
      g.fillRect(cx - 24 + rnd() * 40, ry, w, 3);
    }
    // たいまつの台座
    for (const t of curStage.torches) {
      g.fillStyle = '#152a30';
      g.fillRect(t.x - 3, t.y, 6, 22);
      g.fillStyle = '#26474f';
      g.beginPath();
      g.moveTo(t.x - 12, t.y - 2); g.lineTo(t.x + 12, t.y - 2);
      g.lineTo(t.x + 6, t.y + 8); g.lineTo(t.x - 6, t.y + 8);
      g.closePath();
      g.fill();
    }

    // 床の冷たい霧
    gr = g.createLinearGradient(0, 400, 0, 600);
    gr.addColorStop(0, 'rgba(120,190,220,0)');
    gr.addColorStop(1, 'rgba(120,190,220,.12)');
    g.fillStyle = gr;
    g.fillRect(0, 400, LW, 200);
  }

  // ステージ1：ルーンの遺跡
  function drawBackgroundRuins(g) {
    const rnd = mulberry32(20261005);
    let gr = g.createLinearGradient(0, 0, 0, LH);
    gr.addColorStop(0, '#161a38');
    gr.addColorStop(0.55, '#0f1229');
    gr.addColorStop(1, '#1c0f1c');
    g.fillStyle = gr;
    g.fillRect(0, 0, LW, LH);

    // 奥の壁のレンガ
    for (let y = 0, row = 0; y < LH; y += 22, row++) {
      const off = row % 2 ? 0 : 24;
      for (let x = -off; x < LW; x += 48) {
        const v = rnd();
        g.fillStyle = `rgba(${(110 + v * 40) | 0},${(120 + v * 40) | 0},${(185 + v * 40) | 0},${(0.035 + v * 0.05).toFixed(3)})`;
        g.fillRect(x + 1.5, y + 1.5, 45, 19);
      }
    }

    // 巨大なルーンの円窓
    const cx = 470, cy = 230;
    g.fillStyle = 'rgba(4,6,18,.5)';
    circ(g, cx, cy, 165);
    gr = g.createRadialGradient(cx, cy, 10, cx, cy, 160);
    gr.addColorStop(0, 'rgba(70,200,210,.11)');
    gr.addColorStop(1, 'rgba(70,200,210,0)');
    g.fillStyle = gr;
    circ(g, cx, cy, 160);
    g.strokeStyle = 'rgba(100,215,225,.15)';
    g.lineWidth = 10;
    g.beginPath(); g.arc(cx, cy, 150, 0, TAU); g.stroke();
    g.strokeStyle = 'rgba(100,215,225,.22)';
    g.lineWidth = 2;
    g.beginPath(); g.arc(cx, cy, 128, 0, TAU); g.stroke();
    g.beginPath(); g.arc(cx, cy, 92, 0, TAU); g.stroke();
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * TAU;
      g.save();
      g.translate(cx + Math.cos(a) * 110, cy + Math.sin(a) * 110);
      g.rotate(a + Math.PI / 2);
      g.fillStyle = 'rgba(130,235,240,.22)';
      const w = 3 + rnd() * 5;
      g.fillRect(-w / 2, -6, w, 12);
      if (rnd() < 0.5) g.fillRect(-5, -1, 10, 2);
      g.restore();
    }
    g.strokeStyle = 'rgba(100,215,225,.12)';
    g.lineWidth = 2;
    for (let k = 0; k < 2; k++) {
      g.beginPath();
      for (let i = 0; i <= 3; i++) {
        const a = -Math.PI / 2 + k * Math.PI + (i / 3) * TAU;
        const px = cx + Math.cos(a) * 92, py = cy + Math.sin(a) * 92;
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.stroke();
    }

    // 柱
    for (const px of [250, 905]) {
      gr = g.createLinearGradient(px - 30, 0, px + 30, 0);
      gr.addColorStop(0, 'rgba(10,12,28,.92)');
      gr.addColorStop(0.35, 'rgba(38,44,82,.88)');
      gr.addColorStop(1, 'rgba(8,9,22,.92)');
      g.fillStyle = gr;
      g.fillRect(px - 30, 0, 60, LH);
      g.fillStyle = 'rgba(0,0,0,.25)';
      for (let k = -18; k <= 18; k += 12) g.fillRect(px + k - 1, 0, 2, LH);
      g.fillStyle = 'rgba(44,50,90,.95)';
      g.fillRect(px - 40, 120, 80, 14);
      g.fillRect(px - 36, 134, 72, 6);
    }

    // たいまつの台座
    for (const t of curStage.torches) {
      g.fillStyle = '#2b2f45';
      g.fillRect(t.x - 2, t.y, 4, 18);
      g.fillStyle = '#3c425f';
      g.beginPath();
      g.moveTo(t.x - 9, t.y - 2); g.lineTo(t.x + 9, t.y - 2);
      g.lineTo(t.x + 5, t.y + 6); g.lineTo(t.x - 5, t.y + 6);
      g.closePath(); g.fill();
    }

    // 吊り下がる鎖
    for (const chx of [360, 640]) {
      const len = 6 + Math.floor(rnd() * 4);
      g.strokeStyle = 'rgba(130,140,185,.32)';
      g.lineWidth = 2.2;
      for (let i = 0; i < len; i++) {
        const y = i * 15 + 6;
        g.beginPath();
        if (i % 2) g.ellipse(chx, y, 2.5, 7.5, 0, 0, TAU);
        else g.ellipse(chx, y, 5.5, 8, 0, 0, TAU);
        g.stroke();
      }
    }

    // 床の熱気
    gr = g.createLinearGradient(0, 360, 0, 560);
    gr.addColorStop(0, 'rgba(255,90,30,0)');
    gr.addColorStop(1, 'rgba(255,90,30,.22)');
    g.fillStyle = gr;
    g.fillRect(0, 360, LW, 200);
  }

  function computeDepth() {
    const d = [];
    for (let r = 0; r < ROWS; r++) {
      const row = [];
      for (let c = 0; c < COLS; c++) {
        if (!isSolidCh(map[r][c])) { row.push(0); continue; }
        let best = 4;
        for (let dr = -3; dr <= 3; dr++) {
          for (let dc = -3; dc <= 3; dc++) {
            const rr = r + dr, cc = c + dc;
            if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue;
            if (!isSolidCh(map[rr][cc])) best = Math.min(best, Math.max(Math.abs(dr), Math.abs(dc)));
          }
        }
        row.push(best);
      }
      d.push(row);
    }
    return d;
  }

  function drawTiles(g) {
    const depth = computeDepth();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (map[r][c] === '#') drawStone(g, c, r, depth[r][c]);
      }
    }
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (map[r][c] === '^') drawSpikeTile(g, c, r);
        else if (map[r][c] === 'B') drawSafeBlock(g, c, r);
      }
    }
    // 周辺減光
    const gr = g.createRadialGradient(LW / 2, LH * 0.45, LH * 0.35, LW / 2, LH * 0.45, LW * 0.72);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,.5)');
    g.fillStyle = gr;
    g.fillRect(0, 0, LW, LH);
  }

  function drawStone(g, c, r, d) {
    const x = c * TILE, y = r * TILE;
    const h = hash2(c, r);
    const LK = [1, 1, 0.8, 0.64, 0.52];
    const lk = d < LK.length ? LK[d] : 0.52;
    const th = curStage.theme;
    const L = (th.stoneL + h * 6) * lk;
    g.fillStyle = `hsl(${(th.stoneH + h * th.stoneHV).toFixed(1)},${(th.stoneS + h * th.stoneSV).toFixed(1)}%,${L.toFixed(1)}%)`;
    g.fillRect(x, y, TILE, TILE);

    // レンガの目地
    for (let k = 0; k < 2; k++) {
      const by = y + k * 16;
      const off = ((r * 2 + k) % 2) ? 16 : 0;
      g.fillStyle = `rgba(255,255,255,${(0.07 * lk).toFixed(3)})`;
      g.fillRect(x, by, TILE, 1);
      g.fillStyle = 'rgba(0,0,0,.32)';
      g.fillRect(x, by + 15, TILE, 1.2);
      g.fillRect(x + off, by, 1.2, 16);
    }

    // ざらつき・ひび
    const rr = mulberry32((Math.imul(c, 73856093) ^ Math.imul(r, 19349663)) | 0);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = rr() < 0.5 ? `rgba(255,255,255,${(0.05 * lk).toFixed(3)})` : 'rgba(0,0,0,.12)';
      g.fillRect(x + rr() * 28, y + rr() * 28, 1 + rr() * 3, 1 + rr() * 2);
    }
    if (h > 0.88) {
      g.strokeStyle = 'rgba(0,0,0,.35)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x + 6, y + 4); g.lineTo(x + 12, y + 12); g.lineTo(x + 9, y + 19);
      g.stroke();
    }
    if (d !== 1) return;

    // 外に面した辺の装飾
    const up = r > 0 ? map[r - 1][c] : '#';
    const dn = r < ROWS - 1 ? map[r + 1][c] : '#';
    const lf = c > 0 ? map[r][c - 1] : '#';
    const rt = c < COLS - 1 ? map[r][c + 1] : '#';
    if (th.cap && (up === '.' || up === '^')) {
      drawCapSlab(g, c, x, y);
    } else if (up === '.') {
      const lg = g.createLinearGradient(0, y, 0, y + 6);
      lg.addColorStop(0, '#b9fff6');
      lg.addColorStop(0.4, '#4fd1c5');
      lg.addColorStop(1, 'rgba(30,120,115,0)');
      g.fillStyle = lg;
      g.fillRect(x, y, TILE, 6);
    }
    if (lf === '.' || lf === '^') {
      g.fillStyle = th.rim;
      g.fillRect(x, y, 3, TILE);
    }
    if (rt === '.' || rt === '^') {
      g.fillStyle = th.rim;
      g.fillRect(x + TILE - 3, y, 3, TILE);
    }
    if (dn === '.' && th.cap) {
      drawCapSlab(g, c, x, y + TILE - 9);
    } else if (dn === '.') {
      g.fillStyle = 'rgba(0,0,0,.38)';
      g.fillRect(x, y + TILE - 4, TILE, 4);
      // 氷のつらら
      g.fillStyle = 'rgba(120,230,235,.45)';
      for (let i = 0; i < 2; i++) {
        const dx = x + 5 + rr() * 22, len = 4 + rr() * 9;
        g.beginPath();
        g.moveTo(dx - 2.2, y + TILE);
        g.lineTo(dx + 2.2, y + TILE);
        g.lineTo(dx, y + TILE + len);
        g.closePath();
        g.fill();
      }
    }
  }

  // ステージ2：足場のふちの明るい石板
  function drawCapSlab(g, c, x, y) {
    const sg = g.createLinearGradient(0, y, 0, y + 9);
    sg.addColorStop(0, '#e6f0f4');
    sg.addColorStop(0.5, '#b2c4cf');
    sg.addColorStop(1, '#7d93a1');
    g.fillStyle = sg;
    g.fillRect(x, y, TILE, 9);
    g.fillStyle = 'rgba(40,60,75,.55)';
    g.fillRect(x, y + 9, TILE, 1.5);
    if (c % 3 === 0) g.fillRect(x, y, 1.2, 9);
  }

  function drawSpikeTile(g, c, r) {
    const x = c * TILE, y = r * TILE;
    g.fillStyle = '#262b3f';
    g.fillRect(x, y + TILE - 5, TILE, 5);
    g.fillStyle = 'rgba(255,255,255,.12)';
    g.fillRect(x, y + TILE - 5, TILE, 1);
    for (let k = 0; k < 2; k++) {
      const bx = x + k * 16;
      const gr = g.createLinearGradient(bx, 0, bx + 16, 0);
      gr.addColorStop(0, '#f2f6ff');
      gr.addColorStop(0.45, '#b4bfdc');
      gr.addColorStop(0.55, '#5d6788');
      gr.addColorStop(1, '#3a425e');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(bx + 8, y + 2);
      g.lineTo(bx + 15, y + TILE - 5);
      g.lineTo(bx + 1, y + TILE - 5);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(10,12,24,.6)';
      g.lineWidth = 1;
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.5)';
      g.beginPath();
      g.moveTo(bx + 8, y + 3);
      g.lineTo(bx + 4, y + TILE - 7);
      g.stroke();
    }
  }

  function drawSafeBlock(g, c, r) {
    const x = c * TILE, y = r * TILE;
    g.fillStyle = '#1b2035';
    rrect(g, x, y, TILE, TILE, 4); g.fill();
    const gr = g.createLinearGradient(0, y, 0, y + TILE);
    gr.addColorStop(0, '#eef4ff');
    gr.addColorStop(0.5, '#a9b8d8');
    gr.addColorStop(1, '#5d6b8e');
    g.fillStyle = gr;
    rrect(g, x + 1.5, y + 1.5, TILE - 3, TILE - 3, 3.5); g.fill();
    g.fillStyle = 'rgba(255,255,255,.6)';
    g.fillRect(x + 4, y + 3, TILE - 8, 1.5);
    g.fillStyle = 'rgba(0,0,0,.25)';
    g.fillRect(x + 4, y + TILE - 4.5, TILE - 8, 1.5);
    const pts = [[6, 6], [TILE - 6, 6], [6, TILE - 6], [TILE - 6, TILE - 6]];
    for (const [rx, ry] of pts) {
      g.fillStyle = '#56627f'; circ(g, x + rx, y + ry, 2.2);
      g.fillStyle = 'rgba(255,255,255,.7)'; circ(g, x + rx - 0.6, y + ry - 0.7, 0.8);
    }
    g.strokeStyle = '#1f8f84';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x + 16, y + 8.5); g.lineTo(x + 23.5, y + 16); g.lineTo(x + 16, y + 23.5); g.lineTo(x + 8.5, y + 16);
    g.closePath(); g.stroke();
    g.fillStyle = '#2fb3a2';
    circ(g, x + 16, y + 16, 2.4);
  }

  /* ===== 13. 描画（キャラ・エフェクト） ===== */
  function drawTorches(g, t) {
    const th = curStage.theme;
    for (const tr of curStage.torches) {
      const fl = 1 + Math.sin(t * 17 + tr.x) * 0.08 + Math.sin(t * 31 + tr.y) * 0.05;
      g.save();
      g.translate(tr.x, tr.y - 2);
      g.globalCompositeOperation = 'lighter';
      const gr = g.createRadialGradient(0, -8, 0, 0, -8, 70 * fl);
      gr.addColorStop(0, `rgba(${th.glow},.32)`);
      gr.addColorStop(1, `rgba(${th.glow},0)`);
      g.fillStyle = gr;
      circ(g, 0, -8, 70 * fl);
      const sway = Math.sin(t * 9 + tr.x) * 1.5;
      const layers = [[1, th.flame[0]], [0.68, th.flame[1]], [0.38, th.flame[2]]];
      for (const [k, col] of layers) {
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(sway * k, -24 * fl * k);
        g.quadraticCurveTo(8 * k, -8 * k, 0, 0);
        g.quadraticCurveTo(-8 * k, -8 * k, sway * k, -24 * fl * k);
        g.fill();
      }
      g.restore();
    }
  }

  function drawSafeGlow(g, t) {
    const x = curStage.safe[0] * TILE + 16, y = curStage.safe[1] * TILE + 16;
    const k = 0.5 + 0.5 * Math.sin(t * 3);
    g.save();
    g.globalCompositeOperation = 'lighter';
    const gr = g.createRadialGradient(x, y, 2, x, y, 42);
    gr.addColorStop(0, `rgba(80,230,220,${(0.16 + k * 0.12).toFixed(3)})`);
    gr.addColorStop(1, 'rgba(80,230,220,0)');
    g.fillStyle = gr;
    g.fillRect(x - 42, y - 42, 84, 84);
    g.strokeStyle = `rgba(150,255,245,${(0.3 + k * 0.45).toFixed(3)})`;
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(x, y - 6); g.lineTo(x + 6, y); g.lineTo(x, y + 6); g.lineTo(x - 6, y);
    g.closePath(); g.stroke();
    g.restore();
  }

  // ---- 主人公（ネコ耳フードの冒険者）----
  function drawPlayer(g, t) {
    const p = player;
    if (p.dead && p.y > LH + 80) return;
    let pose = 'stand';
    if (p.dead) pose = 'dead';
    else if (p.gp === 1) pose = 'ball';
    else if (p.gp === 2) pose = 'pound';
    else if (p.gp === 3 || p.crouch) pose = 'crouch';
    else if (p.sliding) pose = 'slide';
    else if (!p.onGround) pose = p.vy < 0 ? 'jump' : 'fall';
    else if (p.win) pose = 'win';
    else if (Math.abs(p.vx) > 10) pose = 'run';

    let sy = p.squash, sx = 1 + (1 - p.squash) * 0.55;
    if (pose === 'crouch' || pose === 'ball' || pose === 'pound') { sy *= 0.72; sx *= 1.08; }
    let face = p.face;
    let spinning = false, spinPh = 0;
    if (!p.dead && p.spinAnim > 0) {
      const k = 1 - p.spinAnim / PH.SPIN_ANIM;
      spinPh = (1 - (1 - k) * (1 - k)) * TAU; // 最初は速く、最後はゆっくり止まる1回転
      spinning = true;
    } else if (!p.dead && p.spinJump) {
      spinPh = p.spinPhase;
      spinning = true;
    }
    if (spinning) {
      let cs = Math.cos(spinPh);
      if (Math.abs(cs) < 0.12) cs = cs < 0 ? -0.12 : 0.12;
      face *= cs;
    }

    g.save();
    g.translate(p.x, p.y);
    if (pose === 'ball') {
      const k = 1 - p.gpT / PH.GP_WAIT;
      g.translate(0, -14);
      g.rotate(k * TAU * p.face);
      g.translate(0, 14);
    }
    g.scale(face * sx, sy);
    drawHero(g, pose, t, p);
    g.restore();

    // スピン中のきらめき
    if (spinning) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = 'rgba(160,255,240,.5)';
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(p.x, p.y - 20, 17, 6, 0, spinPh, spinPh + 2.4);
      g.stroke();
      g.restore();
    }
  }

  function drawHero(g, pose, t, p) {
    const ph = p.walkPhase;
    const spd = clamp(Math.abs(p.vx) / PH.RUN, 0, 1);
    let legF = 0, legB = 0, armF = 0.25, armB = -0.25, bodyY = 0, mouth = 'smile';
    switch (pose) {
      case 'stand': bodyY = Math.sin(t * 3.2) * 0.5; break;
      case 'run':
        legF = Math.sin(ph) * (0.6 + spd * 0.5); legB = -legF;
        armF = -legF * 0.9; armB = legF * 0.9;
        bodyY = -Math.abs(Math.cos(ph)) * 1.4;
        break;
      case 'jump': legF = 0.9; legB = -0.5; armF = 2.6; armB = -0.7; mouth = 'open'; break;
      case 'fall': legF = 0.35; legB = -0.35; armF = 1.9; armB = -1.9; mouth = 'o'; break;
      case 'slide': legF = 0.6; legB = 1.1; armF = 0.6; armB = -2.2; mouth = 'flat'; break;
      case 'crouch': case 'ball': case 'pound': legF = 1.3; legB = -1.0; armF = 0.9; armB = -0.9; mouth = 'flat'; break;
      case 'win': bodyY = -Math.abs(Math.sin(t * 6)) * 2; armF = 2.9; armB = -2.9; mouth = 'open'; break;
      case 'dead': armF = 2.6; armB = -2.6; legF = 0.4; legB = -0.4; mouth = 'sad'; break;
    }
    g.translate(0, bodyY);
    g.lineCap = 'round';
    g.lineJoin = 'round';

    drawLeg(g, -2.5, legB, true);
    drawArm(g, -3, armB, true);
    drawScarf(g, t, p, spd);

    // 胴体（チュニック）
    const gr = g.createLinearGradient(0, -27, 0, -11);
    gr.addColorStop(0, '#49d6c2');
    gr.addColorStop(1, '#259384');
    g.fillStyle = gr;
    rrect(g, -7.5, -27, 15, 16, 4); g.fill();
    g.fillStyle = '#6b4a2e';
    g.fillRect(-7.5, -15.5, 15, 2.6);
    g.fillStyle = '#ffd34a';
    g.fillRect(1.2, -16.2, 3.2, 4);
    // マフラーの巻き部分
    g.fillStyle = '#e2453c';
    rrect(g, -6.5, -28.5, 13, 4.2, 2); g.fill();

    drawLeg(g, 2.5, legF, false);

    // フード
    g.fillStyle = '#2a9d8f';
    circ(g, -0.5, -36, 11);
    g.beginPath(); g.moveTo(-7, -43.5); g.lineTo(-4.5, -52); g.lineTo(-0.5, -46); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(2.5, -46.5); g.lineTo(7.5, -51.5); g.lineTo(8.2, -43.2); g.closePath(); g.fill();
    g.fillStyle = '#ff9fb1';
    g.beginPath(); g.moveTo(-4.8, -45.5); g.lineTo(-4.2, -49.5); g.lineTo(-2.4, -46.4); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(4.2, -46.4); g.lineTo(6.9, -49.2); g.lineTo(7, -45); g.closePath(); g.fill();

    // 顔
    g.fillStyle = '#ffdcbf';
    circ(g, 2.5, -34.5, 7.8);
    g.fillStyle = '#7a4a2a';
    g.beginPath();
    g.moveTo(-4.2, -37.5);
    g.quadraticCurveTo(2, -46.5, 10.2, -38.2);
    g.quadraticCurveTo(6.5, -40.2, 3.8, -37.6);
    g.quadraticCurveTo(1, -40.4, -4.2, -37.5);
    g.fill();

    // 目
    if (pose === 'dead') {
      g.strokeStyle = '#1b1b2a'; g.lineWidth = 1.3;
      for (const ex of [4.6, 8.6]) {
        g.beginPath();
        g.moveTo(ex - 1.5, -36.3); g.lineTo(ex + 1.5, -33.3);
        g.moveTo(ex + 1.5, -36.3); g.lineTo(ex - 1.5, -33.3);
        g.stroke();
      }
    } else if (p.blinkT < 0) {
      g.strokeStyle = '#1b1b2a'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(3.3, -34.6); g.lineTo(5.9, -34.6); g.moveTo(7.3, -34.6); g.lineTo(9.9, -34.6); g.stroke();
    } else {
      g.fillStyle = '#1b1b2a';
      ell(g, 4.6, -34.8, 1.35, 2.35);
      ell(g, 8.6, -34.8, 1.35, 2.35);
      g.fillStyle = '#fff';
      circ(g, 4.9, -35.8, 0.55);
      circ(g, 8.9, -35.8, 0.55);
    }
    // ほっぺ
    g.fillStyle = 'rgba(255,140,150,.55)';
    ell(g, 6.2, -31.4, 1.9, 1.05);
    // 口
    g.strokeStyle = '#7a3a2a'; g.fillStyle = '#7a3a2a'; g.lineWidth = 1;
    switch (mouth) {
      case 'smile': g.beginPath(); g.arc(7.2, -31.4, 1.4, 0.2, Math.PI - 0.2); g.stroke(); break;
      case 'open': ell(g, 7.4, -30.6, 1.4, 1.6); break;
      case 'o': ell(g, 7.4, -30.6, 0.9, 1.1); break;
      case 'flat': g.beginPath(); g.moveTo(6.2, -30.8); g.lineTo(8.6, -30.8); g.stroke(); break;
      case 'sad': g.beginPath(); g.arc(7.4, -29.6, 1.4, Math.PI + 0.3, TAU - 0.3); g.stroke(); break;
    }

    drawArm(g, 3, armF, false);
  }

  function drawLeg(g, hx, a, back) {
    const hy = -12;
    const fx = hx + Math.sin(a) * 9, fy = hy + Math.cos(a) * 9;
    g.strokeStyle = back ? '#283152' : '#323d66';
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(hx, hy); g.lineTo(fx, fy); g.stroke();
    g.fillStyle = back ? '#4a3020' : '#6b4429';
    ell(g, fx + 1.5, fy, 4.6, 3);
  }

  function drawArm(g, sx, a, back) {
    const sy = -23;
    const hx = sx + Math.sin(a) * 8, hy = sy + Math.cos(a) * 8;
    g.strokeStyle = back ? '#1f7d72' : '#2fb3a2';
    g.lineWidth = 4.2;
    g.beginPath(); g.moveTo(sx, sy); g.lineTo(hx, hy); g.stroke();
    g.fillStyle = back ? '#e8bf9e' : '#ffd9b8';
    circ(g, hx, hy, 2.8);
  }

  function drawScarf(g, t, p, spd) {
    const air = !p.onGround;
    const len = 7 + spd * 11 + (air ? 5 : 0);
    const lift = air ? clamp(-p.vy * 0.012, -6, 6) : 0;
    g.strokeStyle = '#e2453c';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(0, -26);
    for (let i = 1; i <= 5; i++) {
      const k = i / 5;
      g.lineTo(-2 - k * len, -26 + k * (5 - spd * 4) + lift * k + Math.sin(t * 13 - i * 1.1) * k * 2.2);
    }
    g.stroke();
  }

  // ---- 敵（フレイムインプ）----
  function drawImp(g, m, t) {
    if (!m.alive && m.y > LH + 80) return;
    g.save();
    g.translate(m.x, m.y);
    if (!m.alive) { g.translate(0, -20); g.rotate(m.rot); g.translate(0, 20); }
    g.scale(m.face < 0 ? -1 : 1, 1); // 右向きで描いて反転
    g.lineCap = 'round';
    g.lineJoin = 'round';

    const air = !m.onGround;
    const bob = air ? -1 : Math.sin(m.anim * 7) * 0.8;
    const aiming = m.alive && m.state === 'aim' && state === 'play';
    const throwing = m.throwAnim > 0;
    const step = m.alive && m.state === 'walk' && !air && state === 'play' ? Math.sin(m.anim * 14) * 2 : 0;

    // 足
    g.fillStyle = '#1d0f2c';
    ell(g, -5 + step, -1.8, 4.6, 2.6);
    ell(g, 5 - step, -1.8, 4.6, 2.6);

    g.translate(0, bob);

    // ローブ
    let gr = g.createLinearGradient(0, -30, 0, 0);
    gr.addColorStop(0, '#7a3fb0');
    gr.addColorStop(0.6, '#4a2075');
    gr.addColorStop(1, '#2c1147');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(-12, -3);
    g.quadraticCurveTo(-12, -18, -7, -26);
    g.lineTo(7, -26);
    g.quadraticCurveTo(12, -18, 13, -3);
    g.quadraticCurveTo(0, 0, -12, -3);
    g.closePath();
    g.fill();
    // 裾の炎模様
    g.fillStyle = '#ff8a2a';
    g.beginPath();
    g.moveTo(-12, -3);
    for (let i = 0; i <= 6; i++) {
      const x = -12 + i * 4.16;
      g.lineTo(x + 2.08, -7 - (i % 2) * 2);
      g.lineTo(x + 4.16, -3);
    }
    g.quadraticCurveTo(0, 0, -12, -3);
    g.fill();
    // 帯
    g.fillStyle = '#ffb43a';
    g.fillRect(-10, -14, 21, 2.4);

    // 後ろの手
    g.fillStyle = '#2a1240';
    circ(g, -9, -14 + Math.sin(m.anim * 7) * 0.8, 3.2);

    // フードと角
    g.fillStyle = '#6a34a0';
    circ(g, 0, -32, 11.5);
    g.beginPath(); g.moveTo(-6, -41); g.quadraticCurveTo(-13, -45, -15, -49); g.quadraticCurveTo(-12, -40, -10, -33); g.closePath(); g.fill();
    g.fillStyle = '#efe2bd';
    g.beginPath(); g.moveTo(-3.5, -42); g.quadraticCurveTo(-7, -50, -11, -52.5); g.quadraticCurveTo(-5.5, -47.5, 0, -41.5); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(3, -42.5); g.quadraticCurveTo(6.5, -51, 10.5, -53); g.quadraticCurveTo(7.5, -46.5, 7.5, -40); g.closePath(); g.fill();
    // 顔の暗がり
    g.fillStyle = '#0d0618';
    ell(g, 3.5, -31, 7, 6.5);
    // 光る目
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = 'rgba(255,200,60,.35)';
    circ(g, 2.2, -32.5, 3.6);
    circ(g, 6.6, -32.5, 3.6);
    g.restore();
    g.fillStyle = m.alive ? '#ffd84a' : '#888';
    ell(g, 2.2, -32.5, 1.5, 2.3);
    ell(g, 6.6, -32.5, 1.5, 2.3);
    // 牙
    g.fillStyle = '#f5f0e0';
    g.beginPath(); g.moveTo(3, -27.6); g.lineTo(4, -25.6); g.lineTo(5, -27.6); g.closePath(); g.fill();

    // 前の手（構え・投げ）
    let hx, hy;
    const kAim = aiming ? 1 - m.t / IMP.AIM : 0;
    if (aiming) { hx = -2; hy = -46 - kAim * 2; }
    else if (throwing) { hx = 15; hy = -30; }
    else { hx = 9; hy = -15 + Math.sin(m.anim * 7) * 1; }
    g.strokeStyle = '#4a2075';
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(4, -22); g.lineTo(hx, hy); g.stroke();
    g.fillStyle = '#2a1240';
    circ(g, hx, hy, 3.5);

    // 頭上で火の玉を溜める
    if (aiming) {
      const rr = 3 + kAim * 5;
      g.save();
      g.globalCompositeOperation = 'lighter';
      const og = g.createRadialGradient(hx, hy - 7, 0, hx, hy - 7, rr * 2.4);
      og.addColorStop(0, 'rgba(255,240,180,.95)');
      og.addColorStop(0.35, 'rgba(255,160,50,.8)');
      og.addColorStop(1, 'rgba(255,80,20,0)');
      g.fillStyle = og;
      circ(g, hx, hy - 7, rr * 2.4);
      g.restore();
    }
    g.restore();
  }

  function drawFireballs(g) {
    if (!fireballs.length) return;
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const f of fireballs) {
      const gr = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, 22);
      gr.addColorStop(0, 'rgba(255,170,60,.55)');
      gr.addColorStop(1, 'rgba(255,80,20,0)');
      g.fillStyle = gr;
      circ(g, f.x, f.y, 22);
    }
    g.globalCompositeOperation = 'source-over';
    for (const f of fireballs) {
      const gr = g.createRadialGradient(f.x - 2, f.y - 2, 0, f.x, f.y, f.r + 1.5);
      gr.addColorStop(0, '#fffbe0');
      gr.addColorStop(0.35, '#ffd34a');
      gr.addColorStop(0.75, '#ff7a1c');
      gr.addColorStop(1, '#d8350c');
      g.fillStyle = gr;
      circ(g, f.x, f.y, f.r + 1.5);
      g.strokeStyle = 'rgba(255,250,210,.85)';
      g.lineWidth = 1.4;
      g.beginPath();
      g.arc(f.x, f.y, f.r - 2, f.rot, f.rot + 1.6);
      g.stroke();
    }
    g.restore();
  }

  function drawStar(g, x, y, s, rot) {
    g.save();
    g.translate(x, y);
    g.rotate(rot || 0);
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? s * 0.38 : s;
      const a = (i / 8) * TAU;
      if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    g.restore();
  }

  function drawParticles(g) {
    for (const q of particles) {
      const a = clamp(q.life / q.max, 0, 1);
      switch (q.kind) {
        case 'dust':
          g.globalAlpha = a * 0.55;
          g.fillStyle = q.color || '#c8cfe8';
          circ(g, q.x, q.y, q.size * (1 + (1 - a) * (q.grow || 1)));
          break;
        case 'puff':
          g.globalAlpha = a * 0.7;
          g.fillStyle = '#f2ecdf';
          circ(g, q.x, q.y, q.size * (1 + (1 - a) * 2));
          break;
        case 'spark':
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = a;
          g.fillStyle = q.color;
          circ(g, q.x, q.y, q.size * (0.4 + a * 0.6));
          g.globalCompositeOperation = 'source-over';
          break;
        case 'ring':
          g.globalAlpha = a;
          g.strokeStyle = q.color;
          g.lineWidth = 3 * a + 0.5;
          g.beginPath();
          g.ellipse(q.x, q.y, q.size + (1 - a) * q.grow, (q.size + (1 - a) * q.grow) * 0.35, 0, 0, TAU);
          g.stroke();
          break;
        case 'star':
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = a;
          g.fillStyle = q.color;
          drawStar(g, q.x, q.y, q.size * (0.5 + a * 0.5), q.rot);
          g.globalCompositeOperation = 'source-over';
          break;
        case 'confetti':
          g.globalAlpha = Math.min(1, a * 2);
          g.save();
          g.translate(q.x, q.y);
          g.rotate(q.rot);
          g.fillStyle = q.color;
          g.fillRect(-q.size / 2, -q.size / 4, q.size, q.size / 2);
          g.restore();
          break;
        case 'line':
          g.globalAlpha = a * 0.6;
          g.strokeStyle = '#dfe8ff';
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(q.x, q.y);
          g.lineTo(q.x, q.y - q.size);
          g.stroke();
          break;
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  function drawLights(g) {
    if (!fireballs.length) return;
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const f of fireballs) {
      const gr = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, 95);
      gr.addColorStop(0, 'rgba(255,120,40,.13)');
      gr.addColorStop(1, 'rgba(255,120,40,0)');
      g.fillStyle = gr;
      g.fillRect(f.x - 95, f.y - 95, 190, 190);
    }
    g.restore();
  }

  /* ===== 14. 進行・UI ===== */
  const $ = (id) => document.getElementById(id);
  const gameEl = $('game');
  const stageEl = $('stage');
  const watchEl = $('watch');
  const remainEl = $('remain');
  const remainBox = $('hud-remain');
  const watchBox = $('hud-watch');
  // ストップウォッチのプレートをメダルの色に変える
  function setMedal(lv, effect) {
    medalNow = lv;
    for (const m of MEDALS) watchBox.classList.remove('medal-' + m.key);
    if (lv > 0) watchBox.classList.add('medal-' + MEDALS[lv - 1].key);
    if (effect && lv > 0) {
      watchBox.classList.remove('medal-up');
      void watchBox.offsetWidth;
      watchBox.classList.add('medal-up');
      sfx(lv >= MEDALS.length ? 'medalTop' : 'medal');
    }
  }
  const bannerEl = $('banner');
  const soundBtn = $('btn-sound');
  const overlays = [$('ov-title'), $('ov-pause'), $('ov-result'), $('ov-settings'), $('ov-help')];
  let overlayId = 'ov-title';

  function showOverlay(id) {
    for (const el of overlays) el.classList.toggle('show', el.id === id);
    overlayId = id;
    clearGpFocus();
    fitOverlay();
    if (id && padConnected) setGpFocus(defaultFocus(id)); // コントローラー接続中は最初のボタンを選択
  }

  // 表示中の画面を、スクロールなしで1画面に収まる大きさに自動で縮める
  function fitOverlay() {
    const ov = overlayId ? $(overlayId) : null;
    const card = ov ? ov.querySelector('.card') : null;
    if (!card) return;
    const cs = getComputedStyle(ov);
    let avail = ov.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
    // 縦画面の設定中は、下のボタンが見えるように上半分に収める
    if (overlayId === 'ov-settings' && document.body.classList.contains('touch') && document.body.classList.contains('portrait')) {
      avail = Math.min(avail, vpH() * 0.56);
    }
    if (!(avail > 0)) return;
    card.style.maxHeight = 'none';
    let fit = 1;
    for (let i = 0; i < 2; i++) { // 縮めると横幅が広がり高さが変わるので2回計算
      card.style.setProperty('--fit', fit.toFixed(3));
      const need = card.offsetHeight / pageZoomNow; // 見た目の高さ（拡大補正後）
      fit = need > 0 ? Math.min(1, avail / need) : 1;
    }
    const MIN_FIT = 0.55;
    if (fit < MIN_FIT) {
      // それでも入りきらない極端に小さい画面だけ、カード内スクロールにする
      fit = MIN_FIT;
      card.style.maxHeight = ((avail / MIN_FIT) * pageZoomNow).toFixed(0) + 'px';
    }
    card.style.setProperty('--fit', fit.toFixed(3));
  }

  // ===== コントローラーでのメニュー操作 =====
  let padConnected = false;
  let gpFocusEl = null;
  const gpMenu = { a: false, b: false, dir: '', next: 0 };

  function isShown(el) {
    return !!el && el.getClientRects().length > 0 && !el.closest('[hidden]');
  }
  function focusables(ov) {
    return [...ov.querySelectorAll('button, input[type="range"]')].filter((el) => !el.disabled && isShown(el));
  }
  function clearGpFocus() {
    if (gpFocusEl) gpFocusEl.classList.remove('gp-focus');
    gpFocusEl = null;
  }
  function setGpFocus(el) {
    if (!el) return;
    clearGpFocus();
    gpFocusEl = el;
    el.classList.add('gp-focus');
    try { el.focus({ preventScroll: true }); } catch (e) { /* 非対応 */ }
    try { el.scrollIntoView({ block: 'nearest' }); } catch (e) { /* 非対応 */ }
    if (el.classList.contains('tab')) selectHelpTab(el.dataset.tab); // タブは選んだ時点で切り替え
  }
  function defaultFocus(id) {
    switch (id) {
      case 'ov-title': {
        const m = save.lastMode === 'hard' && !save.hardUnlocked ? 'normal' : save.lastMode;
        return document.querySelector(`.mode-btn[data-mode="${m}"]`);
      }
      case 'ov-pause': return $('btn-resume');
      case 'ov-result': return $('btn-retry');
      case 'ov-settings': return $('set-pad');
      case 'ov-help': return document.querySelector('#ov-help .tab.on') || $('btn-help-back');
    }
    return null;
  }
  // 押した方向にある一番近いボタンを探す
  function spatialNext(ov, cur, dir) {
    const r0 = cur.getBoundingClientRect();
    const cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
    let best = null, bestScore = Infinity;
    for (const el of focusables(ov)) {
      if (el === cur) continue;
      const r = el.getBoundingClientRect();
      const dx = r.left + r.width / 2 - cx, dy = r.top + r.height / 2 - cy;
      let main, side;
      if (dir === 'up') { if (dy > -4) continue; main = -dy; side = Math.abs(dx); }
      else if (dir === 'down') { if (dy < 4) continue; main = dy; side = Math.abs(dx); }
      else if (dir === 'left') { if (dx > -4) continue; main = -dx; side = Math.abs(dy); }
      else { if (dx < 4) continue; main = dx; side = Math.abs(dy); }
      const score = main + side * 2.2;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    return best;
  }
  function stepRange(el, d) {
    const step = +el.step || 1;
    const v = clamp(+el.value + d * step, +el.min, +el.max);
    if (v === +el.value) return;
    el.value = v;
    el.dispatchEvent(new Event('input'));
    el.dispatchEvent(new Event('change'));
  }
  function gpBack() {
    if (overlayId === 'ov-settings') closeSettings();
    else if (overlayId === 'ov-help') closeHelp();
    else if (overlayId === 'ov-pause') togglePause(false);
    else if (overlayId === 'ov-result' && performance.now() - resultAt > 700) showTitle();
  }
  function menuGamepad(gp) {
    const aEdge = gp.a && !gpMenu.a;
    const bEdge = gp.b && !gpMenu.b;
    gpMenu.a = gp.a;
    gpMenu.b = gp.b;
    // 方向入力：押した瞬間に1回、押しっぱなしなら少し待ってから連続
    const dir = gp.mUp ? 'up' : gp.mDown ? 'down' : gp.mLeft ? 'left' : gp.mRight ? 'right' : '';
    const now = performance.now();
    let fire = '';
    if (dir && dir !== gpMenu.dir) { fire = dir; gpMenu.next = now + 380; }
    else if (dir && now >= gpMenu.next) { fire = dir; gpMenu.next = now + 120; }
    gpMenu.dir = dir;

    if (!overlayId || editMode) return;
    const ov = $(overlayId);
    if (!ov) return;
    const cur = gpFocusEl && ov.contains(gpFocusEl) && isShown(gpFocusEl) ? gpFocusEl : null;
    if (!cur) {
      if (fire || aEdge) setGpFocus(defaultFocus(overlayId));
      else if (bEdge) gpBack();
      return;
    }
    if (fire) {
      if (cur.type === 'range' && (fire === 'left' || fire === 'right')) { stepRange(cur, fire === 'right' ? 1 : -1); return; }
      const nx = spatialNext(ov, cur, fire);
      if (nx) setGpFocus(nx);
      return;
    }
    if (aEdge) {
      if (overlayId === 'ov-result' && now - resultAt < 700) return; // 連打で即リトライしないように
      if (cur.type === 'range') return;
      cur.click();
      return;
    }
    if (bEdge) gpBack();
  }
  // コントローラーがつながっている間はタッチボタンを隠す
  function setPadConnected(c) {
    if (c === padConnected) return;
    padConnected = c;
    document.body.classList.toggle('pad-on', c);
    layout();
    if (c && overlayId && !gpFocusEl) setGpFocus(defaultFocus(overlayId));
    if (!c) clearGpFocus();
  }
  // 画面をタッチ・クリックしたら選択枠を消す
  window.addEventListener('pointerdown', () => clearGpFocus(), true);

  function banner(text, cls) {
    bannerEl.className = '';
    bannerEl.textContent = text;
    void bannerEl.offsetWidth; // アニメーションを再スタート
    bannerEl.className = cls || '';
  }

  // タイトルのモードボタン用
  function bestText(m) {
    const b = save.bests[stageNo][m] || 0;
    const cl = save.clears[stageNo];
    if (m === 'normal' && cl > 0) return `クリア ${cl} 回`;
    return b > 0 ? `ベスト ${b.toFixed(2)} 秒` : 'まだ記録なし';
  }
  // リザルト用
  function resultBestText(m) {
    const b = save.bests[stageNo][m] || 0;
    const cl = save.clears[stageNo];
    if (b <= 0) return 'まだ記録なし';
    let s = `${b.toFixed(2)} 秒`;
    if (m === 'normal' && cl > 0) s += `（クリア ${cl} 回）`;
    return s;
  }
  function updateTitleBests() {
    for (const m of ['normal', 'endless', 'hard']) $('best-' + m).textContent = bestText(m);
    // ノーマルはこのステージで取った最高のメダルを表示
    const ml = medalLevel(save.bests[stageNo].normal || 0);
    if (ml) {
      const dot = document.createElement('span');
      dot.className = 'medal-dot medal-' + MEDALS[ml - 1].key;
      dot.title = MEDALS[ml - 1].name;
      $('best-normal').prepend(dot);
    }
    // ハードモードはノーマルを1回クリアするまで「？？？」
    const hb = document.querySelector('.mode-btn[data-mode="hard"]');
    const locked = !save.hardUnlocked;
    hb.classList.toggle('locked', locked);
    hb.setAttribute('aria-disabled', locked ? 'true' : 'false');
    hb.querySelector('.m-name').textContent = locked ? '？？？' : 'ハードモード';
    hb.querySelector('.m-sub').textContent = locked ? '？？？' : '∞ 15秒ごとにレベルアップ';
    $('best-hard').hidden = locked;
    document.querySelectorAll('.mode-btn').forEach((b) => b.classList.toggle('last', b.dataset.mode === save.lastMode));
  }
  function updateModeHud() {
    remainBox.classList.toggle('is-endless', mode === 'endless');
    remainBox.classList.toggle('is-hard', mode === 'hard');
    lastRemain = '';
  }

  function updateSoundBtn() {
    soundBtn.textContent = save.muted ? '🔇' : '🔊';
  }

  function showTitle() {
    paused = false;
    AudioSys.setPaused(false);
    AudioSys.stopBgm();
    resetWorld();
    state = 'title';
    banner('', '');
    updateTitleBests();
    showOverlay('ov-title');
  }

  function startGame(m) {
    if (logoBusy) return; // ステージ2解放の演出中は開始しない
    if (m === 'normal' || m === 'endless' || m === 'hard') mode = m;
    if (mode === 'hard' && !save.hardUnlocked) mode = 'normal';
    if (save.lastMode !== mode) { save.lastMode = mode; persist(); }
    updateModeHud();
    AudioSys.init();
    paused = false;
    AudioSys.setPaused(false);
    AudioSys.stopBgm();
    resetWorld();
    state = 'ready';
    stateT = 0;
    showOverlay(null);
    banner('READY', 'ready');
    sfx('ready');
  }

  function clearGame() {
    state = 'clear';
    stateT = 0;
    elapsed = TIME_LIMIT;
    setMedal(MEDALS.length, true); // 50秒でプラチナ
    for (const f of fireballs) { puff(f.x, f.y, 5); sparks(f.x, f.y, 5, '#ffb43a', 120); }
    fireballs = [];
    player.win = true;
    AudioSys.stopBgm();
    sfx('clear');
    banner('CLEAR!!', 'clear');
    const cols = ['#ffd34a', '#4fd1c5', '#ff6a2a', '#ffffff', '#b58cff'];
    for (let i = 0; i < 90; i++) {
      addP({ kind: 'confetti', x: rand(140, 660), y: rand(-60, 0), vx: rand(-40, 40), vy: rand(60, 170), g: 60, drag: 0.5, life: rand(2, 3.2), size: rand(5, 8), rot: rand(0, TAU), vr: rand(-8, 8), color: pick(cols) });
    }
    save.clears[stageNo]++;
    lastNew = save.bests[stageNo].normal < TIME_LIMIT;
    save.bests[stageNo].normal = TIME_LIMIT;
    unlockedNow = !save.hardUnlocked;
    save.hardUnlocked = true;
    persist();
  }

  function resultMessage(t) {
    if (mode === 'hard') {
      const head = `レベル ${hardLv} まで到達！ `;
      if (hardLv < 3) return head + 'レベルが上がるほど火の玉が速く、多くなるよ。';
      if (hardLv < 6) return head + 'かなりの腕前！空中スピンで落下のタイミングをずらそう。';
      if (hardLv < HARD.LV_MAX) return head + '最高レベルまであと少し！';
      return head + '最高レベルで粘った！まさに達人！！';
    }
    if (mode === 'endless') {
      if (t < 30) return 'まずは50秒の壁を目指そう！';
      if (t < 50) return 'あと少しで50秒！';
      if (t < 100) return '50秒突破！その調子でどこまでも！';
      return '驚異の集中力！！';
    }
    if (t < 10) return '火の玉が跳ねるリズムをよく見て、引きつけてからジャンプ！';
    if (t < 25) return 'いい感じ！空中スピンで落下をゆっくりにすると避けやすいよ。';
    if (t < 40) return '集中を切らさずに、ブロックの真ん中をキープ！';
    return 'あと少し！本当に惜しかった！！';
  }

  function showResult(cleared) {
    resultShown = true;
    resultAt = performance.now();
    const t = cleared ? TIME_LIMIT : elapsed;
    const title = $('res-title');
    title.textContent = cleared ? 'CLEAR!!' : 'MISS…';
    title.className = 'res-title ' + (cleared ? 'clear' : 'miss');
    $('res-time').textContent = t.toFixed(2);
    $('res-new').hidden = !lastNew;
    $('res-unlock').hidden = !(cleared && unlockedNow);
    // 獲得メダル（ノーマルのみ）
    const rm = $('res-medal');
    const ml = mode === 'normal' ? medalLevel(t) : 0;
    rm.hidden = ml === 0;
    if (ml) {
      rm.className = 'res-medal medal-' + MEDALS[ml - 1].key;
      $('res-medal-name').textContent = MEDALS[ml - 1].name + ' 獲得！';
    }
    unlockedNow = false;
    $('res-mode').textContent = MODE_NAMES[mode] + (mode === 'hard' ? `（Lv.${hardLv}）` : '');
    $('res-msg').textContent = cleared ? '50秒間よけきった！見事なクリア！' : resultMessage(t);
    $('res-best').textContent = resultBestText(mode);
    showOverlay('ov-result');
  }

  function togglePause(force) {
    if (state !== 'play' && state !== 'ready') return;
    if (editMode || overlayId === 'ov-settings' || overlayId === 'ov-help') return; // 設定・操作方法の表示中は切り替えない
    const next = typeof force === 'boolean' ? force : !paused;
    if (next === paused) return;
    paused = next;
    AudioSys.setPaused(paused);
    showOverlay(paused ? 'ov-pause' : null);
  }

  function onMenuConfirm() {
    if (overlayId === 'ov-title') startGame(save.lastMode === 'hard' && !save.hardUnlocked ? 'normal' : save.lastMode);
    else if (overlayId === 'ov-result' && performance.now() - resultAt > 700) startGame();
    else if (overlayId === 'ov-pause') togglePause(false);
  }

  function onStartButton() {
    if (editMode) { endEdit(); return; }
    if (overlayId === 'ov-settings') { closeSettings(); return; }
    if (overlayId === 'ov-help') { closeHelp(); return; }
    if (state === 'play' || state === 'ready') togglePause();
    else onMenuConfirm();
  }

  function toggleMute() {
    AudioSys.init();
    save.muted = !save.muted;
    AudioSys.setMuted(save.muted);
    persist();
    updateSoundBtn();
  }

  // ボタン
  document.querySelectorAll('.mode-btn').forEach((b) => {
    b.addEventListener('click', () => {
      AudioSys.init();
      if (b.classList.contains('locked')) {
        b.classList.remove('deny');
        void b.offsetWidth;
        b.classList.add('deny');
        sfx('deny');
        return;
      }
      startGame(b.dataset.mode);
    });
  });
  $('btn-settings').addEventListener('click', () => openSettings());
  $('btn-p-settings').addEventListener('click', () => openSettings());
  $('btn-help').addEventListener('click', () => openHelp());
  $('btn-p-help').addEventListener('click', () => openHelp());
  $('btn-retry').addEventListener('click', () => { AudioSys.init(); startGame(); });
  $('btn-r-title').addEventListener('click', showTitle);
  $('btn-resume').addEventListener('click', () => togglePause(false));
  $('btn-p-retry').addEventListener('click', () => startGame());
  $('btn-p-title').addEventListener('click', showTitle);
  $('btn-pause').addEventListener('click', () => togglePause());
  soundBtn.addEventListener('click', toggleMute);

  // キーボード
  window.addEventListener('keydown', (e) => {
    AudioSys.init();
    const k = KEYMAP[e.code];
    if (k) {
      e.preventDefault();
      kb[k] = true;
      if (!e.repeat) kbEdge[k] = true;
    }
    if (KEY_UP[e.code]) {
      kb.up = true;
      if (!e.repeat) kbEdge.up = true;
    }
    if (e.repeat) return;
    if (e.code === 'Escape' || e.code === 'KeyP') { e.preventDefault(); onStartButton(); return; }
    if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); onMenuConfirm(); }
  });
  window.addEventListener('keyup', (e) => {
    const k = KEYMAP[e.code];
    if (k) kb[k] = false;
    if (KEY_UP[e.code]) kb.up = false;
  });
  window.addEventListener('blur', () => { for (const k in kb) kb[k] = false; });

  // タッチ：左パッド
  const dpad = $('dpad');
  const knob = $('dpad-knob');
  const dpadPointers = new Map();
  function dpadUpdate() {
    let L = false, R = false, U = false, D = false, DS = false, kx = 0, ky = 0;
    const rect = dpad.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2, rad = rect.width / 2 || 1;
    for (const pos of dpadPointers.values()) {
      const dx = (pos.x - cx) / rad, dy = (pos.y - cy) / rad;
      if (dx < -0.22) L = true;
      if (dx > 0.22) R = true;
      if (Math.abs(dx) > 0.62) DS = true; // 横に大きくずらすとダッシュ
      if (dy > 0.42 && dy > Math.abs(dx) * 0.7) D = true;
      if (dy < -0.42 && -dy > Math.abs(dx) * 0.7) U = true;
      kx = clamp(dx, -1, 1); ky = clamp(dy, -1, 1);
    }
    tc.left = L; tc.right = R; tc.up = U; tc.down = D; tc.dash = DS;
    knob.style.transform = `translate(${(kx * rad * 0.45).toFixed(1)}px, ${(ky * rad * 0.45).toFixed(1)}px)`;
    dpad.classList.toggle('l', L);
    dpad.classList.toggle('r', R);
    dpad.classList.toggle('d', D);
    dpad.classList.toggle('u', U);
    dpad.classList.toggle('dash', DS);
  }
  dpad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (editMode) return;
    if (!paused) AudioSys.init();
    try { dpad.setPointerCapture(e.pointerId); } catch (err) { /* 非対応 */ }
    dpadPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dpadUpdate();
  });
  dpad.addEventListener('pointermove', (e) => {
    if (!dpadPointers.has(e.pointerId)) return;
    e.preventDefault();
    dpadPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dpadUpdate();
  });
  const dpadEnd = (e) => {
    if (!dpadPointers.has(e.pointerId)) return;
    dpadPointers.delete(e.pointerId);
    dpadUpdate();
  };
  dpad.addEventListener('pointerup', dpadEnd);
  dpad.addEventListener('pointercancel', dpadEnd);
  dpad.addEventListener('lostpointercapture', dpadEnd);

  // タッチ：右ボタン
  document.querySelectorAll('.cbtn').forEach((btn) => {
    const k = btn.dataset.k;
    const ids = new Set();
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (editMode) return;
      if (!paused) AudioSys.init();
      try { btn.setPointerCapture(e.pointerId); } catch (err) { /* 非対応 */ }
      ids.add(e.pointerId);
      tc[k] = true;
      tcEdge[k] = true;
      btn.classList.add('on');
    });
    const end = (e) => {
      if (!ids.has(e.pointerId)) return;
      ids.delete(e.pointerId);
      if (ids.size === 0) { tc[k] = false; btn.classList.remove('on'); }
    };
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
    btn.addEventListener('lostpointercapture', end);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  // ===== 設定：タッチボタンの大きさ・不透明度・位置 =====
  const controlsEl = $('controls');
  const dragEls = { pad: $('pad-left'), jump: $('b-jump'), spin: $('b-spin') };
  const setPad = $('set-pad'), setBtn = $('set-btn'), setOp = $('set-op');
  let editMode = false;
  let settingsFrom = null;
  const vpW = () => document.documentElement.clientWidth || window.innerWidth;
  const vpH = () => document.documentElement.clientHeight || window.innerHeight;
  const orientKey = () => (vpH() > vpW() ? 'port' : 'land');

  function setOffset(el, x, y) {
    el._ox = x; el._oy = y;
    el.style.setProperty('--tx', x.toFixed(1) + 'px');
    el.style.setProperty('--ty', y.toFixed(1) + 'px');
  }
  // 画面からはみ出さないように補正
  function clampOffset(el, x, y) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return [x, y];
    const bl = r.left - (el._ox || 0), bt = r.top - (el._oy || 0), m = 4;
    const fit = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : clamp(v, lo, hi));
    return [
      fit(x, m - bl, vpW() - m - (bl + r.width)),
      fit(y, m - bt, vpH() - m - (bt + r.height))
    ];
  }
  function clampAllOffsets() {
    if (!isTouch) return;
    for (const k in dragEls) {
      const el = dragEls[k];
      const [x, y] = clampOffset(el, el._ox || 0, el._oy || 0);
      setOffset(el, x, y);
    }
  }
  function applyControlSettings() {
    const c = save.ctl;
    controlsEl.style.setProperty('--padScale', (c.pad / 100).toFixed(2));
    controlsEl.style.setProperty('--btnScale', (c.btn / 100).toFixed(2));
    controlsEl.style.setProperty('--ctlOpacity', (c.op / 100).toFixed(2));
    const pos = c.pos[orientKey()] || {};
    for (const k in dragEls) {
      const v = pos[k];
      setOffset(dragEls[k], v ? v[0] * vpW() : 0, v ? v[1] * vpH() : 0);
    }
    clampAllOffsets();
  }
  function storePositions() {
    const o = {};
    for (const k in dragEls) {
      const el = dragEls[k];
      o[k] = [+((el._ox || 0) / vpW()).toFixed(4), +((el._oy || 0) / vpH()).toFixed(4)];
    }
    save.ctl.pos[orientKey()] = o;
    persist();
  }
  function syncSwapUI() {
    const sw = $('set-swap');
    sw.setAttribute('aria-checked', save.padSwap ? 'true' : 'false');
    sw.classList.toggle('on', save.padSwap);
    $('out-swap').textContent = save.padSwap ? 'ON' : 'OFF';
  }
  function syncSettingsUI() {
    syncSwapUI();
    setPad.value = save.ctl.pad; setBtn.value = save.ctl.btn; setOp.value = save.ctl.op;
    $('out-pad').textContent = save.ctl.pad + '%';
    $('out-btn').textContent = save.ctl.btn + '%';
    $('out-op').textContent = save.ctl.op + '%';
    $('btn-edit-pos').disabled = !isTouch;
    // データ初期化はタイトルから開いたときだけ（プレイ中の記録が消えないように）
    disarmDataReset();
    const dr = $('btn-data-reset');
    dr.disabled = settingsFrom !== 'ov-title';
    dr.textContent = dr.disabled ? 'データ初期化はタイトルから' : 'データを初期化';
    $('set-note').textContent = isTouch
      ? 'タッチ操作ボタンの見た目と位置を調整できます。位置は縦画面・横画面で別々に保存されます。'
      : 'スマホ・タブレットで表示されるタッチ操作ボタンの設定です。位置の調整はタッチ操作の端末で行えます。';
  }
  function openSettings() {
    if (overlayId !== 'ov-title' && overlayId !== 'ov-pause') return;
    settingsFrom = overlayId;
    syncSettingsUI();
    document.body.classList.add('settings-open');
    showOverlay('ov-settings');
    if (padConnected) layout();
  }
  // ===== 操作方法 =====
  function defaultHelpTab() {
    let pad = false;
    try {
      const ps = navigator.getGamepads ? navigator.getGamepads() : [];
      for (let i = 0; i < (ps ? ps.length : 0); i++) if (ps[i] && ps[i].connected) pad = true;
    } catch (e) { /* 非対応 */ }
    return pad ? 'pad' : isTouch ? 'touch' : 'pc';
  }
  function selectHelpTab(t) {
    document.querySelectorAll('#ov-help .tab').forEach((b) => {
      const on = b.dataset.tab === t;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('#ov-help .tab-panel').forEach((p) => { p.hidden = p.dataset.panel !== t; });
    if (overlayId === 'ov-help') fitOverlay();
  }
  function openHelp() {
    if (overlayId !== 'ov-title' && overlayId !== 'ov-pause') return;
    settingsFrom = overlayId;
    selectHelpTab(defaultHelpTab());
    showOverlay('ov-help');
  }
  function closeHelp() {
    showOverlay(settingsFrom || (paused ? 'ov-pause' : 'ov-title'));
    settingsFrom = null;
  }
  document.querySelectorAll('#ov-help .tab').forEach((b) => b.addEventListener('click', () => selectHelpTab(b.dataset.tab)));
  $('btn-help-back').addEventListener('click', closeHelp);

  // ===== タイトルの🔥：初回は10回タップでステージ2解放、以降はタップで切り替え =====
  const logoMark = $('logo-mark');
  const logoEl = document.querySelector('#ov-title .logo');
  let flameTaps = 0;
  let logoBusy = false;
  function retrigger(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }
  function updateLogo() {
    const two = stageNo === 2;
    logoMark.textContent = two ? '2' : '🔥';
    logoMark.classList.toggle('is-two', two);
    logoMark.setAttribute('aria-label', two ? 'ステージを切り替える（現在：2）' : 'ステージを切り替える');
    document.title = `BLAZE DODGE ${two ? '2' : '🔥'} | made by hiro`;
    $('mission-enemy').textContent = curStage.enemyText;
  }
  function switchStage(n, quiet) {
    save.stage = n;
    persist();
    buildMap(n);
    layout();
    resetWorld();
    updateLogo();
    updateTitleBests();
    logoMark.classList.remove('burnout', 'wobble');
    logoMark.style.removeProperty('--heat');
    retrigger(logoMark, 'pop');
    if (!quiet) sfx('ui');
  }
  function spawnEmbers() {
    const base = logoEl.getBoundingClientRect();
    const r = logoMark.getBoundingClientRect();
    const k = logoEl.offsetWidth ? base.width / logoEl.offsetWidth : 1; // 拡大補正中の縮尺
    const cx = (r.left + r.width / 2 - base.left) / k;
    const cy = (r.top + r.height / 2 - base.top) / k;
    for (let i = 0; i < 18; i++) {
      const e = document.createElement('span');
      e.className = 'ember';
      const a = Math.random() * TAU, d = 40 + Math.random() * 90;
      e.style.left = cx.toFixed(1) + 'px';
      e.style.top = cy.toFixed(1) + 'px';
      e.style.setProperty('--dx', (Math.cos(a) * d).toFixed(0) + 'px');
      e.style.setProperty('--dy', (Math.sin(a) * d - 30).toFixed(0) + 'px');
      e.style.animationDelay = (Math.random() * 0.12).toFixed(2) + 's';
      logoEl.appendChild(e);
      setTimeout(() => e.remove(), 1300);
    }
  }
  logoMark.addEventListener('click', () => {
    AudioSys.init();
    if (overlayId !== 'ov-title' || logoBusy) return;
    if (!save.stage2) {
      flameTaps++;
      logoMark.style.setProperty('--heat', Math.min(1, flameTaps / 10).toFixed(2));
      retrigger(logoMark, 'wobble');
      sfx('crackle');
      if (flameTaps >= 10) {
        logoBusy = true;
        save.stage2 = true;
        persist();
        logoMark.classList.remove('wobble');
        logoMark.classList.add('burnout');
        retrigger(logoEl, 'quake');
        spawnEmbers();
        sfx('burn');
        setTimeout(() => {
          switchStage(2, true);
          flameTaps = 0;
          logoBusy = false;
        }, 700);
      }
      return;
    }
    switchStage(stageNo === 1 ? 2 : 1);
  });


  function closeSettings() {
    disarmDataReset();
    document.body.classList.remove('settings-open');
    showOverlay(settingsFrom || (paused ? 'ov-pause' : 'ov-title'));
    settingsFrom = null;
    if (padConnected) layout();
  }
  function releaseTouchInputs() {
    dpadPointers.clear();
    dpadUpdate();
    tc.jump = tc.spin = false;
    document.querySelectorAll('.cbtn').forEach((b) => b.classList.remove('on'));
  }
  function startEdit() {
    if (!isTouch) return;
    editMode = true;
    releaseTouchInputs();
    document.body.classList.remove('settings-open');
    document.body.classList.add('edit-controls');
    showOverlay(null);
    applyControlSettings();
  }
  function endEdit() {
    if (!editMode) return;
    editMode = false;
    for (const k in dragEls) { dragEls[k]._drag = null; dragEls[k].classList.remove('dragging'); }
    storePositions();
    document.body.classList.remove('edit-controls');
    document.body.classList.add('settings-open');
    showOverlay('ov-settings');
  }

  [[setPad, 'pad', 'out-pad'], [setBtn, 'btn', 'out-btn'], [setOp, 'op', 'out-op']].forEach(([el, key, out]) => {
    el.addEventListener('input', () => {
      save.ctl[key] = +el.value;
      $(out).textContent = el.value + '%';
      applyControlSettings();
    });
    el.addEventListener('change', () => persist());
  });
  $('btn-edit-pos').addEventListener('click', startEdit);
  $('btn-set-reset').addEventListener('click', () => {
    save.ctl = defaultCtl();
    persist();
    syncSettingsUI();
    applyControlSettings();
  });
  $('btn-set-back').addEventListener('click', closeSettings);
  $('set-swap').addEventListener('click', () => {
    save.padSwap = !save.padSwap;
    persist();
    syncSwapUI();
    sfx('ui');
    // 押したままのボタンの意味が入れ替わって「戻る」扱いにならないよう、離すまで無視
    gpMenu.a = true;
    gpMenu.b = true;
  });

  // ===== データ初期化（2回押しで実行） =====
  let resetTimer = 0;
  function disarmDataReset() {
    clearTimeout(resetTimer);
    const b = $('btn-data-reset');
    if (!b.classList.contains('armed')) return;
    b.classList.remove('armed');
    b.textContent = 'データを初期化';
  }
  function wipeAllData() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* 保存できない環境 */ }
    save.bests = { 1: emptyBests(), 2: emptyBests() };
    save.clears = { 1: 0, 2: 0 };
    save.hardUnlocked = false;
    save.stage2 = false;
    save.stage = 1;
    save.muted = false;
    save.padSwap = false;
    save.lastMode = 'normal';
    save.ctl = defaultCtl();
    mode = 'normal';
    flameTaps = 0;
    AudioSys.setMuted(false);
    updateSoundBtn();
    updateModeHud();
    if (stageNo !== 1) { buildMap(1); layout(); resetWorld(); }
    logoMark.style.removeProperty('--heat');
    updateLogo();
    updateTitleBests();
    syncSettingsUI();
    applyControlSettings();
  }
  $('btn-data-reset').addEventListener('click', () => {
    const b = $('btn-data-reset');
    if (b.disabled || settingsFrom !== 'ov-title') return;
    if (!b.classList.contains('armed')) {
      b.classList.add('armed');
      b.textContent = '本当に消す？ もう一度押す';
      sfx('deny');
      clearTimeout(resetTimer);
      resetTimer = setTimeout(disarmDataReset, 3500);
      return;
    }
    wipeAllData();
    sfx('ui');
    b.textContent = '初期化しました';
    b.disabled = true;
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => { b.disabled = false; b.textContent = 'データを初期化'; }, 1500);
  });
  $('btn-edit-done').addEventListener('click', endEdit);
  $('btn-edit-reset').addEventListener('click', () => {
    for (const k in dragEls) setOffset(dragEls[k], 0, 0);
    storePositions();
  });

  // 位置調整：ドラッグで移動
  for (const k in dragEls) {
    const el = dragEls[k];
    el.addEventListener('pointerdown', (e) => {
      if (!editMode) return;
      e.preventDefault();
      e.stopPropagation();
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* 非対応 */ }
      el._drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: el._ox || 0, oy: el._oy || 0 };
      el.classList.add('dragging');
    }, true);
    el.addEventListener('pointermove', (e) => {
      const d = el._drag;
      if (!editMode || !d || d.id !== e.pointerId) return;
      e.preventDefault();
      const [x, y] = clampOffset(el, d.ox + e.clientX - d.sx, d.oy + e.clientY - d.sy);
      setOffset(el, x, y);
    }, true);
    const dragEnd = (e) => {
      const d = el._drag;
      if (!d || d.id !== e.pointerId) return;
      el._drag = null;
      el.classList.remove('dragging');
      storePositions();
    };
    el.addEventListener('pointerup', dragEnd, true);
    el.addEventListener('pointercancel', dragEnd, true);
  }

  // iOS Safari：長押しメニュー・選択・ピンチ／ダブルタップ拡大の防止
  document.addEventListener('touchmove', (e) => {
    if (!(e.target instanceof Element) || !e.target.closest('.scroll')) e.preventDefault();
  }, { passive: false });
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((ev) => {
    document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  });
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    const t = e.target instanceof Element ? e.target : null;
    if (now - lastTouchEnd <= 320 && !(t && t.closest('button:not(.cbtn), a, .scroll'))) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('selectstart', (e) => e.preventDefault());

  // タブ切り替えで自動ポーズ
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (state === 'play' || state === 'ready') && !paused) togglePause(true);
  });

  /* ===== 15. レイアウト ===== */
  let isTouch = !!((window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
                   ('ontouchstart' in window && navigator.maxTouchPoints > 0));

  function layout() {
    applyZoomFix();
    const portrait = vpH() > vpW();
    document.body.classList.toggle('touch', isTouch);
    document.body.classList.toggle('portrait', portrait);
    // 拡大縮小の変形に影響されない実寸を使う
    const margin = isTouch ? 0 : 18 / pageZoomNow;
    const aw = Math.max(100, stageEl.clientWidth - margin * 2);
    const ah = Math.max(60, stageEl.clientHeight - margin * 2);
    let gw = aw, gh = (aw * LH) / LW;
    if (gh > ah) { gh = ah; gw = (ah * LW) / LH; }
    gw = Math.floor(gw); gh = Math.floor(gh);
    gameEl.style.width = gw + 'px';
    gameEl.style.height = gh + 'px';
    gameEl.style.setProperty('--u', (gw / 100) + 'px');
    dpr = Math.min(window.devicePixelRatio || 1, 2, 2600 / gw);
    const cw = Math.max(1, Math.round(gw * dpr)), ch = Math.max(1, Math.round(gh * dpr));
    if (staticDirty || cv.width !== cw || cv.height !== ch) {
      staticDirty = false;
      cv.width = cw;
      cv.height = ch;
      scale = cw / LW;
      buildStatic();
    }
    applyControlSettings();
    fitOverlay();
  }

  let resizeTimer = 0;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layout, 60);
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(layout, 250));
  // ===== ページ拡大（ブラウザの拡大・Safariのページ拡大・ピンチ）の影響を打ち消す =====
  let pageZoomNow = 1;
  const appEl = document.getElementById('app');
  const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.85, 0.9, 1, 1.1, 1.15, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
  function snapZoom(z, tol) {
    let best = null, bd = Infinity;
    for (const st of ZOOM_STEPS) {
      const d = Math.abs(z - st) / st;
      if (d < bd) { bd = d; best = st; }
    }
    return bd <= tol ? best : null;
  }
  function detectPageZoom() {
    const cw = document.documentElement.clientWidth;
    if (!(cw > 0)) return 1;
    const ow = window.outerWidth;
    if (isTouch) {
      // スマホ・タブレット：本来の画面幅と、実際のレイアウト幅の比
      const sLong = Math.max(screen.width || 0, screen.height || 0);
      const sShort = Math.min(screen.width || 0, screen.height || 0);
      let z = 0;
      if (ow > 0 && ow <= sLong * 1.05) z = ow / cw;           // iPadの分割表示などにも対応
      else if (sLong > 0) z = (vpW() > vpH() ? sLong : sShort) / cw;
      if (!(z > 0) || !isFinite(z)) return 1;
      z = snapZoom(z, 0.05) || z;
      return Math.abs(z - 1) < 0.04 ? 1 : clamp(z, 0.25, 5);
    }
    // PC：ウィンドウ幅とレイアウト幅の比（ブラウザの拡大率の段階に近い時だけ採用）
    if (!(ow > 0)) return 1;
    const z = snapZoom(ow / cw, 0.035);
    if (!z || z === 1) return 1;
    // サイドバー等で幅がずれただけの誤検出を防ぐ：画面本来の倍率（1, 1.25, 1.5, 2…）と矛盾しないか確認
    const base = (window.devicePixelRatio || 1) / z;
    const ok = [1, 1.25, 1.5, 1.75, 2, 2.5, 3].some((b) => Math.abs(base - b) < 0.04);
    return ok ? z : 1;
  }
  function applyPinchFix() {
    const vv = window.visualViewport;
    if (vv && vv.scale > 1.01) {
      // ピンチで拡大されても、ゲーム画面全体が見えている範囲にぴったり収まるように逆変形
      appEl.style.transformOrigin = '0 0';
      appEl.style.transform = `translate(${vv.offsetLeft.toFixed(1)}px, ${vv.offsetTop.toFixed(1)}px) scale(${(1 / vv.scale).toFixed(4)})`;
    } else if (appEl.style.transform) {
      appEl.style.transform = '';
    }
  }
  function applyZoomFix() {
    const z = detectPageZoom();
    pageZoomNow = z;
    const rs = document.documentElement.style;
    rs.setProperty('--z', String(z));
    rs.setProperty('--uiz', (1 / z).toFixed(4));
    applyPinchFix();
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => { applyPinchFix(); onResize(); });
    window.visualViewport.addEventListener('scroll', applyPinchFix);
  }

  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' && !isTouch) {
      isTouch = true;
      layout();
      if (overlayId === 'ov-settings') syncSettingsUI();
    }
  }, true);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout).catch(() => {});

  /* ===== 16. メインループ ===== */
  function tick(dt) {
    buf.jump = Math.max(0, buf.jump - dt);
    buf.spin = Math.max(0, buf.spin - dt);
    buf.down = Math.max(0, buf.down - dt);
    buf.up = Math.max(0, buf.up - dt);
    stateT += dt;

    switch (state) {
      case 'title':
        updatePlayer(dt);
        for (const m of imps) updateImp(m, dt);
        updateParticles(dt);
        break;
      case 'ready':
        updatePlayer(dt);
        for (const m of imps) updateImp(m, dt);
        updateParticles(dt);
        if (stateT >= 1.4) {
          state = 'play';
          stateT = 0;
          banner('GO!', 'go');
          sfx('go');
          AudioSys.startBgm();
        }
        break;
      case 'play': {
        elapsed += dt;
        if (mode === 'normal' && elapsed >= TIME_LIMIT) { clearGame(); break; }
        updatePlayer(dt);
        if (state !== 'play') break; // このステップでミスした
        for (const m of imps) updateImp(m, dt);
        updateFireballs(dt);
        updateParticles(dt);
        if (mode === 'normal') {
          const ml = medalLevel(elapsed);
          if (ml > medalNow) setMedal(ml, true);
          const sec = Math.ceil(TIME_LIMIT - elapsed);
          if (sec !== lastSec) {
            if (sec <= 10 && sec > 0) sfx(sec <= 3 ? 'tickHi' : 'tick');
            lastSec = sec;
          }
        } else if (mode === 'hard') {
          const lv = hardLevel();
          if (lv > hardLv) {
            hardLv = lv;
            banner(lv >= HARD.LV_MAX ? 'MAX LEVEL!' : 'LEVEL UP!', 'go');
            sfx('levelup');
          }
        }
        break;
      }
      case 'dead':
        updatePlayer(dt);
        updateParticles(dt);
        if (stateT > 2.4 && !resultShown) showResult(false);
        break;
      case 'clear':
        updatePlayer(dt);
        for (const m of imps) updateImp(m, dt);
        updateParticles(dt);
        if (stateT > 3 && !resultShown) showResult(true);
        break;
    }
    updateShake(dt);
  }

  let lastWatch = '', lastRemain = '', lastWarn = false;
  function render(time) {
    // HUD
    const w = elapsed.toFixed(2);
    if (w !== lastWatch) { watchEl.textContent = w; lastWatch = w; }
    const rem = Math.max(0, Math.ceil(TIME_LIMIT - elapsed - 1e-6));
    let rs;
    if (mode === 'endless') rs = '∞';
    else if (mode === 'hard') rs = 'Lv.' + (state === 'play' ? hardLevel() : hardLv);
    else rs = String(rem).padStart(3, '0');
    if (rs !== lastRemain) { remainEl.textContent = rs; lastRemain = rs; }
    const warn = mode === 'normal' && state === 'play' && rem <= 10;
    if (warn !== lastWarn) { remainBox.classList.toggle('warn', warn); lastWarn = warn; }

    // キャンバス
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05060c';
    ctx.fillRect(0, 0, cv.width, cv.height);
    const ox = shakeX * scale, oy = shakeY * scale;
    ctx.drawImage(staticCv, ox, oy);
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    drawTorches(ctx, time);
    drawSafeGlow(ctx, time);
    for (const m of imps) drawImp(ctx, m, time);
    drawFireballs(ctx);
    drawPlayer(ctx, time);
    drawParticles(ctx);
    drawLights(ctx);
  }

  let last = performance.now();
  let acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.25) dt = 0.25;
    pollInput();
    if (!paused) {
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < 40) { tick(STEP); acc -= STEP; n++; }
      if (n >= 40) acc = 0;
    } else {
      acc = 0;
    }
    render(now / 1000);
    const fast = state === 'play' && (mode === 'normal' ? TIME_LIMIT - elapsed <= 10 : mode === 'hard' && hardLevel() >= 6);
    if (!paused) AudioSys.schedule(fast);
  }

  // 起動
  resetWorld();
  updateSoundBtn();
  updateModeHud();
  updateLogo();
  updateTitleBests();
  layout();
  requestAnimationFrame((t) => { last = t; frame(t); });
})();
