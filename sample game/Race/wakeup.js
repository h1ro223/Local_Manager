/*!
 * wakeup.js — 3ゲーム共用「サーバー起こし＆起動待ち表示」
 * Turbo Pixel GP (/race) ・ Action Master (/action) ・ Last Landing (/battle)
 * made by hiro / ヒロ  https://github.com/h1ro223
 *
 * 使い方（index.html で script.js より前に読み込む）
 *   <script src="./wakeup.js"></script>
 *   <script src="./script.js"></script>
 *
 *   ServerWakeup.prewarm();                       // タイトル表示時など：裏でこっそり起こし始める
 *   ServerWakeup.wake(() => {                     // オンラインを選んだ時
 *     const peer = new Peer(ServerWakeup.peerOptions('/race'));
 *   }, { label: 'TURBO PIXEL GP', onCancel: backToTitle, swapAB: () => settings.swapAB });
 */
(() => {
  'use strict';
  if (window.ServerWakeup) return; // 二重読み込み防止

  /* ---------------------------------------------------------------- */
  /* 設定                                                              */
  /* ---------------------------------------------------------------- */
  const cfg = {
    // ★ Render のURLに書き換える（末尾スラッシュ不要）
    serverUrl: 'https://h1ro-game-server.onrender.com',
    healthPath: '/health',
    totalTimeout: 120000, // この時間起きなければエラー表示（ms）
    attemptTimeout: 20000, // 1回の /health 待ち上限（ms）
    retryInterval: 2500, // 失敗後の再試行間隔（ms）
    showDelay: 450, // これより早く応答したら表示自体を出さない（チラつき防止）
    freshFor: 60000, // 直近この時間内に応答済みなら待たずに即コールバック
  };

  let lastOkAt = 0;
  let session = null; // 進行中の起動待ち（同時に1つだけ）
  let prewarmPromise = null;

  const now = () => Date.now();
  const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
  const trimUrl = (u) => String(u || '').trim().replace(/\/+$/, '');
  const isFresh = () => lastOkAt > 0 && now() - lastOkAt < cfg.freshFor;
  cfg.serverUrl = trimUrl(cfg.serverUrl);

  function configure(opts) {
    Object.assign(cfg, opts || {});
    cfg.serverUrl = trimUrl(cfg.serverUrl);
    return api;
  }

  /* ---------------------------------------------------------------- */
  /* 通信                                                              */
  /* ---------------------------------------------------------------- */
  async function ping(timeoutMs, outerSignal) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const onOuterAbort = () => ctrl.abort();
    if (outerSignal) {
      if (outerSignal.aborted) ctrl.abort();
      else outerSignal.addEventListener('abort', onOuterAbort, { once: true });
    }
    try {
      const res = await fetch(`${cfg.serverUrl}${cfg.healthPath}?t=${now()}`, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-store',
        credentials: 'omit',
        signal: ctrl.signal,
      });
      if (!res.ok) return false;
      // 起動途中の中継ページ(HTML)などは JSON にならないので失敗扱い
      const data = await res.json().catch(() => null);
      const ok = !!data && data.status === 'ok';
      if (ok) lastOkAt = now();
      return ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
      if (outerSignal) outerSignal.removeEventListener('abort', onOuterAbort);
    }
  }

  /** 表示なしで起こし始める（結果は Promise<boolean>） */
  function prewarm() {
    if (isFresh()) return Promise.resolve(true);
    if (!prewarmPromise) {
      prewarmPromise = ping(60000).finally(() => {
        prewarmPromise = null;
      });
    }
    return prewarmPromise;
  }

  /** PeerJS の new Peer() にそのまま渡せるオプション */
  function peerOptions(path, extra) {
    const u = new URL(cfg.serverUrl);
    const secure = u.protocol === 'https:';
    return Object.assign(
      {
        host: u.hostname,
        port: u.port ? Number(u.port) : secure ? 443 : 80,
        secure,
        path: path || '/',
        key: 'peerjs',
      },
      extra || {}
    );
  }

  /* ---------------------------------------------------------------- */
  /* 起動待ち本体                                                      */
  /* ---------------------------------------------------------------- */
  /**
   * サーバーを起こし、応答したら onReady を呼ぶ。
   * wake(onReady, opts) / wake({ onReady, ...opts }) どちらでもOK。
   * opts: label, onCancel, onError, swapAB(boolean | () => boolean), container, force, totalTimeout
   * 戻り値: Promise<boolean>（接続OK=true / キャンセル=false）
   */
  function wake(onReady, opts) {
    if (onReady && typeof onReady === 'object') {
      opts = onReady;
      onReady = opts.onReady;
    }
    opts = opts || {};

    return new Promise((resolve) => {
      const waiter = { onReady, onCancel: opts.onCancel, onError: opts.onError, resolve };

      // 既に起動待ち中なら相乗り
      if (session) {
        session.waiters.push(waiter);
        return;
      }
      // ついさっき応答があったなら待たない（呼び出しの順序を揃えるため非同期で）
      if (isFresh() && !opts.force) {
        setTimeout(() => settle([waiter], true), 0);
        return;
      }

      const s = {
        waiters: [waiter],
        opts,
        gen: 0,
        abort: null,
        startedAt: 0,
        done: false,
        showTimer: 0,
        tickTimer: 0,
        ui: null,
      };
      session = s;
      s.ui = createUI(s);
      run(s);
    });
  }

  function settle(waiters, ok, info) {
    for (const w of waiters) {
      try {
        if (ok) {
          if (typeof w.onReady === 'function') w.onReady(info);
        } else if (typeof w.onCancel === 'function') {
          w.onCancel(info);
        }
      } catch (e) {
        console.error('[wakeup] callback error:', e);
      }
      w.resolve(ok);
    }
  }

  async function run(s) {
    const gen = ++s.gen;
    if (s.abort) s.abort.abort();
    s.abort = new AbortController();
    const signal = s.abort.signal;
    const total = Number(s.opts.totalTimeout) > 0 ? Number(s.opts.totalTimeout) : cfg.totalTimeout;

    s.startedAt = now();
    s.ui.setState('waiting');
    s.ui.update(0);

    clearTimeout(s.showTimer);
    if (!s.ui.visible) {
      s.showTimer = setTimeout(() => {
        if (!s.done && s.gen === gen) s.ui.show();
      }, cfg.showDelay);
    }

    clearInterval(s.tickTimer);
    s.tickTimer = setInterval(() => {
      if (!s.done && s.gen === gen) s.ui.update(now() - s.startedAt);
    }, 250);

    while (!s.done && s.gen === gen) {
      const remain = total - (now() - s.startedAt);
      if (remain <= 0) {
        fail(s);
        return;
      }
      if (navigator.onLine === false) {
        s.ui.setState('offline');
        await sleep(1000);
        continue;
      }
      if (s.ui.state === 'offline') s.ui.setState('waiting');

      const ok = await ping(Math.min(cfg.attemptTimeout, remain), signal);
      if (s.done || s.gen !== gen) return;
      if (ok) {
        succeed(s);
        return;
      }
      await sleep(Math.min(cfg.retryInterval, total - (now() - s.startedAt)));
    }
  }

  function stopTimers(s) {
    clearTimeout(s.showTimer);
    clearInterval(s.tickTimer);
  }

  function fail(s) {
    stopTimers(s);
    s.ui.show();
    s.ui.setState('error');
    const info = {
      reason: navigator.onLine === false ? 'offline' : 'timeout',
      elapsed: now() - s.startedAt,
    };
    for (const w of s.waiters) {
      try {
        if (typeof w.onError === 'function') w.onError(info);
      } catch (e) {
        console.error('[wakeup] callback error:', e);
      }
    }
  }

  async function succeed(s) {
    s.done = true;
    stopTimers(s);
    if (s.ui.visible) {
      s.ui.setState('ready');
      await sleep(380);
      await s.ui.hide();
    } else {
      s.ui.destroy();
    }
    finish(s, true, { elapsed: now() - s.startedAt });
  }

  async function cancelSession(s) {
    if (!s || s.done) return;
    s.done = true;
    s.gen++;
    if (s.abort) s.abort.abort();
    stopTimers(s);
    await s.ui.hide();
    finish(s, false, { reason: 'cancel' });
  }

  function retrySession(s) {
    if (!s || s.done || s.ui.state !== 'error') return;
    run(s);
  }

  function finish(s, ok, info) {
    if (session === s) session = null;
    settle(s.waiters, ok, info);
  }

  /* ---------------------------------------------------------------- */
  /* 表示（Shadow DOM でゲーム側のCSSと完全に分離）                    */
  /* ---------------------------------------------------------------- */
  const CSS = `
:host{all:initial}
*{box-sizing:border-box}
.veil{position:fixed;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;
  padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));
  background:rgba(9,11,26,.74);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);
  opacity:0;transition:opacity .18s ease;
  font-family:system-ui,-apple-system,"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic UI",Meiryo,sans-serif;
  color:#f2f4ff;-webkit-text-size-adjust:100%;
  -webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;touch-action:none}
.veil.is-in{opacity:1}
.panel{width:100%;max-width:340px;background:#141833;border:2px solid #2b3263;border-radius:14px;
  padding:22px 22px 18px;text-align:center;box-shadow:0 18px 50px rgba(0,0,0,.45);
  transform:translateY(6px) scale(.98);transition:transform .2s ease}
.is-in .panel{transform:none}
.game{font-size:12px;color:#9aa3c7;letter-spacing:.04em;margin:0 0 14px;min-height:1em}
.game:empty{display:none}
.meter{display:flex;gap:4px;justify-content:center;margin:0 0 16px}
.meter i{display:block;width:18px;height:10px;border-radius:2px;background:#262c57}
.is-waiting .meter i{animation:scan 1.1s steps(1,end) infinite}
.meter i:nth-child(1){animation-delay:0s}.meter i:nth-child(2){animation-delay:.09s}
.meter i:nth-child(3){animation-delay:.18s}.meter i:nth-child(4){animation-delay:.27s}
.meter i:nth-child(5){animation-delay:.36s}.meter i:nth-child(6){animation-delay:.45s}
.meter i:nth-child(7){animation-delay:.54s}.meter i:nth-child(8){animation-delay:.63s}
.meter i:nth-child(9){animation-delay:.72s}.meter i:nth-child(10){animation-delay:.81s}
@keyframes scan{0%{background:#ffc94a}14%{background:#9a7426}28%,100%{background:#262c57}}
.is-offline .meter i:first-child{animation:blink 1.4s steps(1,end) infinite}
@keyframes blink{0%{background:#ffc94a}50%,100%{background:#262c57}}
.is-ready .meter i{background:#5ce1a6}
.is-error .meter i{background:#3d1f33}
.is-error .meter i:first-child{background:#ff6b6b}
.title{font-size:17px;font-weight:700;margin:0 0 6px;line-height:1.45}
.desc{font-size:13px;line-height:1.65;color:#9aa3c7;margin:0;min-height:3.3em}
.time{font-size:12px;color:#ffc94a;margin:8px 0 0;font-variant-numeric:tabular-nums;min-height:1.3em}
.actions{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:16px;min-height:44px}
.is-ready .actions{visibility:hidden}
.btn{-webkit-appearance:none;appearance:none;font:inherit;font-size:14px;font-weight:700;line-height:1;
  min-height:44px;padding:0 18px;border-radius:10px;border:2px solid transparent;background:none;color:inherit;
  cursor:pointer;touch-action:manipulation;display:inline-flex;align-items:center;justify-content:center;gap:8px}
.btn[hidden]{display:none}
.primary{background:#ffc94a;color:#141833}
.ghost{border-color:#3a4280;color:#f2f4ff}
.btn:focus-visible{outline:3px solid #8fb4ff;outline-offset:2px}
.btn:active{transform:translateY(1px)}
@media (hover:hover){.primary:hover{filter:brightness(1.07)}.ghost:hover{background:#1c2147}}
.pad{display:none;width:20px;height:20px;border-radius:50%;font-size:11px;line-height:20px;text-align:center;background:rgba(0,0,0,.22)}
.ghost .pad{background:#2b3263}
.is-pad .pad{display:inline-block}
@media (prefers-reduced-motion:reduce){
  .veil,.panel{transition:none}
  .is-waiting .meter i,.is-offline .meter i:first-child{animation:none}
  .is-waiting .meter i:nth-child(odd){background:#ffc94a}
}`;

  const TEXT = {
    waiting: [
      { until: 15000, title: 'サーバーを起こしています', desc: 'しばらく使われていないと、起動まで30秒〜1分ほどかかります。' },
      { until: 45000, title: 'サーバーを起動中です', desc: '起動したら自動で次へ進みます。このままお待ちください。' },
      { until: Infinity, title: 'もう少しで起動します', desc: 'いつもより時間がかかっています。通信環境も確認してください。' },
    ],
    offline: { title: 'インターネットに接続されていません', desc: 'つながると自動で続行します。' },
    error: { title: 'サーバーに接続できませんでした', desc: '通信環境を確認して、もう一度試してください。' },
    ready: { title: '接続しました', desc: '' },
  };

  const BLOCK_EVENTS = [
    'pointerdown', 'pointerup', 'pointermove', 'mousedown', 'mouseup', 'click', 'dblclick',
    'touchstart', 'touchend', 'touchmove', 'wheel', 'keydown', 'keyup', 'contextmenu',
  ];

  function createUI(s) {
    const host = document.createElement('div');
    host.setAttribute('data-server-wakeup', '');
    host.style.cssText =
      'all:initial;position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483000;display:none;';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${CSS}</style>
<div class="veil">
  <div class="panel" role="dialog" aria-modal="true" aria-labelledby="hw-title" aria-describedby="hw-desc">
    <p class="game"></p>
    <div class="meter" aria-hidden="true">${'<i></i>'.repeat(10)}</div>
    <h2 class="title" id="hw-title" aria-live="polite"></h2>
    <p class="desc" id="hw-desc"></p>
    <p class="time" aria-hidden="true"></p>
    <div class="actions">
      <button type="button" class="btn primary" data-act="retry"><span class="pad"></span>もう一度試す</button>
      <button type="button" class="btn ghost" data-act="cancel"><span class="pad"></span>キャンセル</button>
    </div>
  </div>
</div>`;

    const $ = (sel) => root.querySelector(sel);
    const veil = $('.veil');
    const el = {
      game: $('.game'),
      title: $('.title'),
      desc: $('.desc'),
      time: $('.time'),
      retry: $('[data-act="retry"]'),
      cancel: $('[data-act="cancel"]'),
    };
    el.game.textContent = s.opts.label ? String(s.opts.label) : '';

    const ui = {
      visible: false,
      state: '',
      lastFocus: null,
      raf: 0,
      padPrev: new Map(),
      textKey: '',

      setState(state) {
        ui.state = state;
        veil.className = `veil${ui.visible ? ' is-in' : ''} is-${state}${veil.classList.contains('is-pad') ? ' is-pad' : ''}`;
        el.retry.hidden = state !== 'error';
        el.cancel.hidden = state === 'ready';
        if (state === 'waiting') {
          ui.textKey = '';
          ui.update(now() - s.startedAt);
        } else {
          ui.setText(TEXT[state].title, TEXT[state].desc);
          if (state !== 'offline') el.time.textContent = '';
        }
        if (ui.visible) ui.focusPrimary();
      },

      setText(title, desc) {
        if (el.title.textContent !== title) el.title.textContent = title;
        if (el.desc.textContent !== desc) el.desc.textContent = desc;
      },

      update(elapsed) {
        if (ui.state !== 'waiting' && ui.state !== 'offline') return;
        if (ui.state === 'waiting') {
          const t = TEXT.waiting.find((x) => elapsed < x.until);
          if (ui.textKey !== t.title) {
            ui.textKey = t.title;
            ui.setText(t.title, t.desc);
          }
        }
        el.time.textContent = `${Math.floor(elapsed / 1000)}秒経過`;
      },

      focusPrimary() {
        const target = !el.retry.hidden ? el.retry : !el.cancel.hidden ? el.cancel : null;
        if (target) {
          try {
            target.focus({ preventScroll: true });
          } catch {
            target.focus();
          }
        }
      },

      show() {
        if (ui.visible) return;
        if (!document.body) {
          document.addEventListener('DOMContentLoaded', () => ui.show(), { once: true });
          return;
        }
        // ポインターロック中（FPSなど）はマウスを解放してボタンを押せるようにする
        if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();

        const parent = mountParent(s.opts.container);
        if (host.parentNode !== parent) parent.appendChild(host);
        ui.lastFocus = document.activeElement;
        host.style.display = 'block';
        ui.visible = true;
        veil.classList.remove('is-in');
        void veil.offsetWidth; // フェードインを確実に発火
        veil.classList.add('is-in');
        ui.focusPrimary();
        ui.startPad();
      },

      hide() {
        return new Promise((resolve) => {
          ui.stopPad();
          if (!ui.visible) {
            ui.destroy();
            resolve();
            return;
          }
          veil.classList.remove('is-in');
          const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          setTimeout(() => {
            ui.destroy();
            resolve();
          }, reduce ? 0 : 190);
        });
      },

      destroy() {
        ui.stopPad();
        const hadFocus = ui.visible;
        ui.visible = false;
        if (host.parentNode) host.parentNode.removeChild(host);
        const lf = ui.lastFocus;
        ui.lastFocus = null;
        if (hadFocus && lf && lf.isConnected && typeof lf.focus === 'function') {
          try {
            lf.focus({ preventScroll: true });
          } catch {
            /* noop */
          }
        }
      },

      setPadMode(on) {
        veil.classList.toggle('is-pad', on);
      },

      /* ----- コントローラー ----- */
      startPad() {
        if (!navigator.getGamepads || ui.raf) return;
        ui.padPrev.clear();
        // 表示した瞬間に押しっぱなしのボタンは無視する
        for (const p of navigator.getGamepads()) {
          if (p) ui.padPrev.set(p.index, p.buttons.map((b) => b.pressed));
        }
        const loop = () => {
          ui.raf = requestAnimationFrame(loop);
          ui.pollPad();
        };
        ui.raf = requestAnimationFrame(loop);
      },

      stopPad() {
        if (ui.raf) cancelAnimationFrame(ui.raf);
        ui.raf = 0;
      },

      pollPad() {
        const pads = navigator.getGamepads();
        const swap = typeof s.opts.swapAB === 'function' ? !!s.opts.swapAB() : !!s.opts.swapAB;
        const ci = swap ? 1 : 0; // 決定
        const bi = swap ? 0 : 1; // 戻る
        el.retry.querySelector('.pad').textContent = swap ? 'B' : 'A';
        el.cancel.querySelector('.pad').textContent = swap ? 'A' : 'B';

        let confirm = false;
        let back = false;
        for (const p of pads) {
          if (!p) continue;
          const cur = p.buttons.map((b) => b.pressed);
          const prev = ui.padPrev.get(p.index) || [];
          const down = (i) => !!cur[i] && !prev[i];
          if (cur.some((v, i) => v && !prev[i]) || p.axes.some((a) => Math.abs(a) > 0.6)) ui.setPadMode(true);
          if (down(ci)) confirm = true;
          if (down(bi)) back = true;
          ui.padPrev.set(p.index, cur);
        }
        if (confirm && ui.state === 'error') retrySession(s);
        else if (back && ui.state !== 'ready') cancelSession(s);
      },
    };

    // ボタン操作
    root.addEventListener('click', (e) => {
      const btn = e.target.closest && e.target.closest('[data-act]');
      if (!btn) return;
      if (btn.dataset.act === 'retry') retrySession(s);
      else if (btn.dataset.act === 'cancel') cancelSession(s);
    });

    // キーボード：Esc でキャンセル
    host.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && ui.state !== 'ready') {
        e.preventDefault();
        cancelSession(s);
      }
    });

    // タッチ/マウスに戻ったらコントローラー表示を消す
    host.addEventListener('pointerdown', (e) => {
      if (e.pointerType) ui.setPadMode(false);
    });

    // 表示中の入力がゲーム側へ漏れないようにする＋長押しメニュー・拡大を防ぐ
    for (const type of BLOCK_EVENTS) {
      host.addEventListener(
        type,
        (e) => {
          e.stopPropagation();
          if (type === 'touchmove' || type === 'contextmenu' || type === 'dblclick') e.preventDefault();
        },
        { passive: false }
      );
    }
    host.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });

    return ui;
  }

  function mountParent(container) {
    if (container && container.nodeType === 1) return container;
    const fs = document.fullscreenElement || document.webkitFullscreenElement;
    // 全画面中は全画面要素の中に出さないと見えない（canvas/video 直下には置けないので除外）
    if (fs && fs.tagName !== 'CANVAS' && fs.tagName !== 'VIDEO') return fs;
    return document.body;
  }

  /* ---------------------------------------------------------------- */
  /* 公開API                                                           */
  /* ---------------------------------------------------------------- */
  const api = {
    configure,
    wake,
    prewarm,
    peerOptions,
    cancel: () => cancelSession(session),
    isBusy: () => !!session,
    get serverUrl() {
      return cfg.serverUrl;
    },
  };

  window.ServerWakeup = api;
})();
