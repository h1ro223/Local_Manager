(() => {
  'use strict';

  const TYPES = ['html', 'css', 'js'];
  const LABEL = { html: 'HTML', css: 'CSS', js: 'JS' };
  const DEFAULT_NAME = { html: 'index.html', css: 'style.css', js: 'script.js' };
  const PLACEHOLDER = {
    html: 'ここにHTMLを貼り付けることもできます',
    css: 'ここにCSSを貼り付けることもできます',
    js: 'ここにJSを貼り付けることもできます',
  };
  const CONSOLE_MAX = 300;
  // zipモードでHTMLから参照されていないCSS/JSを追加した時の配信名
  const ADDED_PATH = { css: '__lc_added.css', js: '__lc_added.js' };
  const JSZIP_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';

  // ============================================================
  //  状態
  // ============================================================
  const state = {
    mode: 'files', // 'files' = html/css/jsの3ファイル / 'zip' = zip(画像・音声なども含む)
    code: { html: '', css: '', js: '' },
    names: { html: '', css: '', js: '' },
    edited: { html: false, css: false, js: false },
    paths: { html: '', css: '', js: '' }, // zipモード時のzip内パス
    zipName: '',
    assetSummary: null,
    savedAt: 0,
  };

  let activeTab = 'html';
  let saveTimer = null;
  let persistRequested = false;
  let blobUrls = [];
  let blobNameMap = {};
  let hasRun = false;
  let errorCount = 0;
  let runToken = 0;
  let currentRun = null; // { id, mode: 'sw' | 'srcdoc', checked }
  let vfsBaseUrl = '';
  let zipBusy = false;
  let jszipPromise = null;

  const $ = (id) => document.getElementById(id);

  const els = {
    bulkInput: $('input-bulk'),
    runBtn: $('runBtn'),
    exportBtn: $('exportBtn'),
    clearAllBtn: $('clearAllBtn'),
    logText: $('logText'),
    assetInfo: $('assetInfo'),
    cacheBadge: $('cacheBadge'),
    cacheBadgeText: $('cacheBadgeText'),
    preview: $('preview'),
    previewFrame: $('previewFrame'),
    previewState: $('previewState'),
    previewEmpty: $('previewEmpty'),
    reloadBtn: $('reloadBtn'),
    fullBtn: $('fullBtn'),
    consolePanel: $('consolePanel'),
    consoleList: $('consoleList'),
    consoleCount: $('consoleCount'),
    consoleCopyBtn: $('consoleCopyBtn'),
    consoleClearBtn: $('consoleClearBtn'),
    consoleToggleBtn: $('consoleToggleBtn'),
    editor: $('editor'),
    tabs: Array.from(document.querySelectorAll('.tab')),
    dropOverlay: $('dropOverlay'),
  };

  const slotEls = {};
  TYPES.forEach((t) => {
    slotEls[t] = {
      root: $(`slot-${t}`),
      name: $(`name-${t}`),
      meta: $(`meta-${t}`),
      input: $(`input-${t}`),
      clear: $(`clear-${t}`),
    };
  });

  // ============================================================
  //  保存領域(IndexedDB優先 / 使えない環境はlocalStorage)
  // ============================================================
  const Store = (() => {
    const DB_NAME = 'local-cartridge';
    const STORE_NAME = 'kv';
    const LS_PREFIX = 'lc2_';
    let dbPromise = null;

    function openDB() {
      if (dbPromise) return dbPromise;
      dbPromise = new Promise((resolve, reject) => {
        if (!('indexedDB' in window) || !window.indexedDB) {
          reject(new Error('IndexedDB非対応'));
          return;
        }
        let req;
        try {
          req = indexedDB.open(DB_NAME, 1);
        } catch (err) {
          reject(err);
          return;
        }
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('IndexedDBがブロックされました'));
      });
      dbPromise.catch(() => { dbPromise = null; });
      return dbPromise;
    }

    async function get(key) {
      try {
        const db = await openDB();
        return await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const req = tx.objectStore(STORE_NAME).get(key);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      } catch (err) {
        try {
          const raw = localStorage.getItem(LS_PREFIX + key);
          return raw ? JSON.parse(raw) : undefined;
        } catch (_) {
          return undefined;
        }
      }
    }

    async function set(key, value) {
      try {
        const db = await openDB();
        await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).put(value, key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
        return true;
      } catch (err) {
        try {
          localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
          return true;
        } catch (_) {
          return false;
        }
      }
    }

    async function remove(key) {
      try {
        const db = await openDB();
        await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).delete(key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } catch (_) { /* 何もしない */ }
      try { localStorage.removeItem(LS_PREFIX + key); } catch (_) { /* 何もしない */ }
    }

    return { get, set, remove };
  })();

  // ============================================================
  //  仮想ファイル置き場(sw.jsと共有するIndexedDB)
  //   main   … 実行ごとに書き換えるHTML/CSS/JS
  //   assets … zip内のそれ以外のファイル(画像・音声・フォント等)
  // ============================================================
  const VFS = (() => {
    const DB_NAME = 'lc-vfs';
    const DB_VERSION = 1;
    let dbPromise = null;

    function openDB() {
      if (dbPromise) return dbPromise;
      dbPromise = new Promise((resolve, reject) => {
        if (!window.indexedDB) {
          reject(new Error('IndexedDB非対応'));
          return;
        }
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('main')) db.createObjectStore('main');
          if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets');
        };
        req.onsuccess = () => {
          const db = req.result;
          db.onversionchange = () => { db.close(); dbPromise = null; };
          db.onclose = () => { dbPromise = null; };
          resolve(db);
        };
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('IndexedDBがブロックされました'));
      });
      dbPromise.catch(() => { dbPromise = null; });
      return dbPromise;
    }

    async function run(storeNames, mode, work) {
      const attempt = async () => {
        const db = await openDB();
        return new Promise((resolve, reject) => {
          let result;
          let tx;
          try {
            tx = db.transaction(storeNames, mode);
            result = work(tx);
          } catch (err) {
            if (tx) { try { tx.abort(); } catch (_) { /* 何もしない */ } }
            reject(err);
            return;
          }
          tx.oncomplete = () => resolve(result);
          tx.onerror = () => reject(tx.error || new Error('保存エラー'));
          tx.onabort = () => reject(tx.error || new Error('保存が中断されました(容量不足の可能性)'));
        });
      };
      try {
        return await attempt();
      } catch (err) {
        // 接続が切れていた場合だけ1回やり直す
        if (err && err.name === 'InvalidStateError') {
          dbPromise = null;
          return attempt();
        }
        throw err;
      }
    }

    const writeMain = (files) => run(['main'], 'readwrite', (tx) => {
      const store = tx.objectStore('main');
      store.clear();
      files.forEach((f) => store.put({ data: f.data }, f.path));
    });

    const replaceAssets = (files) => run(['assets'], 'readwrite', (tx) => {
      const store = tx.objectStore('assets');
      store.clear();
      files.forEach((f) => store.put({ data: f.data }, f.path));
    });

    const clearAssets = () => run(['assets'], 'readwrite', (tx) => { tx.objectStore('assets').clear(); });

    const clearAll = () => run(['main', 'assets'], 'readwrite', (tx) => {
      tx.objectStore('main').clear();
      tx.objectStore('assets').clear();
    });

    const readAssets = () => run(['assets'], 'readonly', (tx) => {
      const out = [];
      const req = tx.objectStore('assets').openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          out.push({ path: cursor.key, data: cursor.value.data });
          cursor.continue();
        }
      };
      return out;
    });

    return { writeMain, replaceAssets, clearAssets, clearAll, readAssets };
  })();

  // ============================================================
  //  ユーティリティ
  // ============================================================
  function pad2(n) { return String(n).padStart(2, '0'); }

  function timeText(ms, withSeconds) {
    const d = new Date(ms);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}${withSeconds ? ':' + pad2(d.getSeconds()) : ''}`;
    return sameDay ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
  }

  function formatSize(size) {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / 1024 / 1024).toFixed(2)} MB`;
  }

  function formatBytes(text) {
    return formatSize(new Blob([text]).size);
  }

  function basename(path) {
    const clean = String(path || '').split('#')[0].split('?')[0];
    const parts = clean.split('/');
    return (parts[parts.length - 1] || '').toLowerCase();
  }

  function lastSegment(path) {
    const parts = String(path || '').split('/');
    return parts[parts.length - 1] || '';
  }

  function stripBom(text) {
    return String(text || '').replace(/^\uFEFF/, '');
  }

  function safeDecode(s) {
    try { return decodeURIComponent(s); } catch (_) { return s; }
  }

  function encodePath(path) {
    return String(path).split('/').map(encodeURIComponent).join('/');
  }

  // http: / https: / data: / blob: / // で始まらないもの = ローカル参照
  function isLocalRef(url) {
    const u = String(url || '').trim();
    if (!u || u.startsWith('#')) return false;
    return !/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(u);
  }

  // 拡張子とMIMEから種類を判定(iOSで「.js.txt」になる場合も考慮)
  function detectType(file) {
    let name = String(file.name || '').toLowerCase().trim();
    name = name.replace(/\.txt$/, '');
    if (/\.(html?|xhtml)$/.test(name)) return 'html';
    if (/\.css$/.test(name)) return 'css';
    if (/\.(m?js|cjs)$/.test(name)) return 'js';
    const mime = String(file.type || '').toLowerCase();
    if (mime.includes('html')) return 'html';
    if (mime.includes('css')) return 'css';
    if (mime.includes('javascript') || mime.includes('ecmascript')) return 'js';
    return null;
  }

  function isZipFile(file) {
    const name = String(file.name || '').toLowerCase();
    const mime = String(file.type || '').toLowerCase();
    return /\.zip$/.test(name) || mime.includes('zip');
  }

  function assetKind(path) {
    const ext = (/\.([a-z0-9]+)$/i.exec(path) || [])[1];
    const e = String(ext || '').toLowerCase();
    if (/^(png|jpe?g|gif|webp|avif|bmp|ico|svg)$/.test(e)) return 'image';
    if (/^(mp3|wav|ogg|oga|m4a|aac|flac)$/.test(e)) return 'audio';
    if (/^(ttf|otf|woff2?)$/.test(e)) return 'font';
    return 'other';
  }

  function readText(file) {
    if (typeof file.text === 'function') return file.text();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('読み込みエラー'));
      reader.readAsText(file, 'UTF-8');
    });
  }

  function readBuffer(file) {
    if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('読み込みエラー'));
      reader.readAsArrayBuffer(file);
    });
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function setLog(message, kind) {
    els.logText.textContent = message;
    els.logText.className = 'log' + (kind ? ` is-${kind}` : '');
  }

  function hasEdits() {
    return TYPES.some((t) => state.edited[t]);
  }

  // JSZipは使う時だけ読み込む(初回表示を軽くするため)
  function loadJSZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (jszipPromise) return jszipPromise;
    jszipPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = JSZIP_URL;
      s.async = true;
      s.onload = () => (window.JSZip ? resolve(window.JSZip) : reject(new Error('JSZipの初期化に失敗')));
      s.onerror = () => reject(new Error('JSZipを読み込めませんでした(通信を確認してください)'));
      document.head.appendChild(s);
    });
    jszipPromise.catch(() => { jszipPromise = null; });
    return jszipPromise;
  }

  // ============================================================
  //  表示更新
  // ============================================================
  function renderSlot(type) {
    const s = slotEls[type];
    const text = state.code[type];
    const inZip = state.mode === 'zip' && !!state.paths[type];
    if (text || inZip) {
      s.root.classList.add('is-loaded');
      s.name.textContent = (inZip ? state.paths[type] : state.names[type]) || DEFAULT_NAME[type];
      const parts = [formatBytes(text)];
      if (inZip) parts.push('zip内');
      if (state.edited[type]) parts.push('編集済み');
      s.meta.textContent = parts.join(' / ');
      s.clear.hidden = !text;
    } else {
      s.root.classList.remove('is-loaded');
      s.name.textContent = '未選択';
      s.meta.textContent = type === 'html' ? '必須' : '任意';
      s.clear.hidden = true;
    }
  }

  function renderButtons() {
    const hasHtml = state.code.html.trim().length > 0;
    els.runBtn.disabled = !hasHtml;
    els.exportBtn.disabled = !hasHtml;
    els.reloadBtn.disabled = !hasHtml;
    els.exportBtn.textContent = state.mode === 'zip' ? 'zipで書き出し' : '1ファイルに書き出し';
  }

  function renderAssetInfo() {
    const sum = state.assetSummary;
    if (state.mode !== 'zip' || !sum) {
      els.assetInfo.hidden = true;
      els.assetInfo.textContent = '';
      return;
    }
    const kinds = [];
    if (sum.kinds.image) kinds.push(`画像${sum.kinds.image}`);
    if (sum.kinds.audio) kinds.push(`音声${sum.kinds.audio}`);
    if (sum.kinds.font) kinds.push(`フォント${sum.kinds.font}`);
    if (sum.kinds.other) kinds.push(`その他${sum.kinds.other}`);
    const detail = kinds.length ? `(${kinds.join('・')})` : '';
    els.assetInfo.textContent = `${state.zipName || 'zip'}.zip のアセット ${sum.count}ファイル / ${formatSize(sum.bytes)}${detail}`;
    els.assetInfo.hidden = false;
  }

  function renderBadge(status) {
    els.cacheBadge.classList.remove('is-active', 'is-error');
    if (status === 'error') {
      els.cacheBadge.classList.add('is-error');
      els.cacheBadgeText.textContent = '保存失敗';
      return;
    }
    const hasAny = TYPES.some((t) => state.code[t]);
    if (hasAny && state.savedAt) {
      els.cacheBadge.classList.add('is-active');
      els.cacheBadgeText.textContent = `保存済み ${timeText(state.savedAt)}`;
    } else {
      els.cacheBadgeText.textContent = '未保存';
    }
  }

  function renderAll() {
    TYPES.forEach(renderSlot);
    renderButtons();
    renderAssetInfo();
    renderBadge();
  }

  function markPreviewStale() {
    if (!hasRun) return;
    els.previewState.textContent = '変更あり(未反映)';
    els.previewState.classList.add('is-stale');
  }

  // ============================================================
  //  保存・復元
  // ============================================================
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 400);
  }

  async function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    const hasAny = TYPES.some((t) => state.code[t]) || state.mode === 'zip';
    if (!hasAny) {
      await Store.remove('project');
      state.savedAt = 0;
      renderBadge();
      return;
    }
    state.savedAt = Date.now();
    const ok = await Store.set('project', {
      mode: state.mode,
      code: { ...state.code },
      names: { ...state.names },
      edited: { ...state.edited },
      paths: { ...state.paths },
      zipName: state.zipName,
      assetSummary: state.assetSummary,
      savedAt: state.savedAt,
    });
    if (!ok) {
      renderBadge('error');
      setLog('保存に失敗しました(容量不足の可能性)。プレビューは実行できます。', 'error');
      return;
    }
    renderBadge();
    // ストレージを消されにくくする(対応ブラウザのみ)
    if (!persistRequested && navigator.storage && typeof navigator.storage.persist === 'function') {
      persistRequested = true;
      navigator.storage.persist().catch(() => {});
    }
  }

  // v1(localStorage版)のデータがあれば引き継ぐ
  function readLegacy() {
    try {
      const html = localStorage.getItem('lc_cartridge_html');
      if (!html) return null;
      let names = {};
      try { names = JSON.parse(localStorage.getItem('lc_cartridge_names') || '{}') || {}; } catch (_) { names = {}; }
      const data = {
        code: {
          html,
          css: localStorage.getItem('lc_cartridge_css') || '',
          js: localStorage.getItem('lc_cartridge_js') || '',
        },
        names,
        edited: {},
        savedAt: Number(localStorage.getItem('lc_cartridge_saved_at')) || Date.now(),
      };
      ['lc_cartridge_html', 'lc_cartridge_css', 'lc_cartridge_js', 'lc_cartridge_names', 'lc_cartridge_saved_at']
        .forEach((k) => localStorage.removeItem(k));
      return data;
    } catch (_) {
      return null;
    }
  }

  async function loadProject() {
    let data = await Store.get('project');
    let migrated = false;
    if (!data) {
      data = readLegacy();
      migrated = !!data;
    }
    if (!data || !data.code) return false;

    state.mode = data.mode === 'zip' ? 'zip' : 'files';
    TYPES.forEach((t) => {
      state.code[t] = typeof data.code[t] === 'string' ? data.code[t] : '';
      state.names[t] = (data.names && data.names[t]) || (state.code[t] ? DEFAULT_NAME[t] : '');
      state.edited[t] = !!(data.edited && data.edited[t]);
      state.paths[t] = (state.mode === 'zip' && data.paths && data.paths[t]) || '';
    });
    state.zipName = state.mode === 'zip' ? (data.zipName || '') : '';
    state.assetSummary = state.mode === 'zip' ? (data.assetSummary || null) : null;
    state.savedAt = Number(data.savedAt) || 0;

    if (migrated) await saveNow();
    return TYPES.some((t) => state.code[t]);
  }

  // ============================================================
  //  コードのセット
  // ============================================================
  function setCode(type, text, name, edited) {
    state.code[type] = text;
    state.names[type] = text ? (name || state.names[type] || DEFAULT_NAME[type]) : '';
    state.edited[type] = !!edited && !!text;
    renderSlot(type);
    renderButtons();
    if (type === activeTab && els.editor.value !== text) {
      els.editor.value = text;
    }
    scheduleSave();
  }

  // zipモードを抜けて、通常の3ファイルモードに戻す
  async function leaveZipMode() {
    if (state.mode !== 'zip') return;
    state.mode = 'files';
    state.paths = { html: '', css: '', js: '' };
    state.zipName = '';
    state.assetSummary = null;
    try { await VFS.clearAssets(); } catch (_) { /* 何もしない */ }
    renderAll();
  }

  // ============================================================
  //  zipの読み込み(画像・音声・フォント等もすべて取り込む)
  // ============================================================
  async function loadZipBuffer(buffer, zipName) {
    const JSZip = await loadJSZip();
    const zip = await JSZip.loadAsync(buffer);

    const entries = [];
    zip.forEach((rawPath, entry) => {
      if (entry.dir) return;
      const path = rawPath.replace(/\\/g, '/');
      if (/(^|\/)__MACOSX\//.test(path) || /(^|\/)\.[^/]*$/.test(path)) return;
      entries.push({ path, entry });
    });

    // 起点になるHTML(index.html優先 / 浅い階層優先)
    const htmls = entries.filter((e) => detectType({ name: e.path, type: '' }) === 'html');
    if (!htmls.length) throw new Error('zipの中にHTMLファイルが見つかりません');
    const htmlScore = (p) => (basename(p) === 'index.html' ? 0 : 100) + p.split('/').length;
    htmls.sort((a, b) => htmlScore(a.path) - htmlScore(b.path) || a.path.length - b.path.length);

    const entryFull = htmls[0].path;
    const root = entryFull.includes('/') ? entryFull.slice(0, entryFull.lastIndexOf('/') + 1) : '';
    const files = entries
      .filter((e) => e.path.startsWith(root))
      .map((e) => ({ rel: e.path.slice(root.length), entry: e.entry }));
    const byRel = new Map(files.map((f) => [f.rel, f]));
    const htmlRel = entryFull.slice(root.length);
    const htmlText = stripBom(await htmls[0].entry.async('string'));

    // HTMLが実際に読み込んでいるCSS/JSを「メインファイル」としてエディタに出す
    const doc = new DOMParser().parseFromString(htmlText, 'text/html');
    const resolveRef = (ref) => {
      if (!isLocalRef(ref)) return null;
      try {
        const u = new URL(ref, 'https://vfs.invalid/');
        return u.pathname.slice(1).split('/').map(safeDecode).join('/');
      } catch (_) {
        return null;
      }
    };
    const findRef = (elements, attr, type) => {
      for (const el of elements) {
        const rel = resolveRef(el.getAttribute(attr));
        if (rel && byRel.has(rel) && detectType({ name: rel, type: '' }) === type) return rel;
      }
      return null;
    };
    const links = Array.from(doc.querySelectorAll('link[href]'))
      .filter((el) => /(^|\s)stylesheet(\s|$)/i.test(el.getAttribute('rel') || ''));
    const scripts = Array.from(doc.querySelectorAll('script[src]'));

    const cssRel = findRef(links, 'href', 'css') || (byRel.has(DEFAULT_NAME.css) ? DEFAULT_NAME.css : null);
    const jsRel = findRef(scripts, 'src', 'js') || (byRel.has(DEFAULT_NAME.js) ? DEFAULT_NAME.js : null);

    const cssText = cssRel ? stripBom(await byRel.get(cssRel).entry.async('string')) : '';
    const jsText = jsRel ? stripBom(await byRel.get(jsRel).entry.async('string')) : '';

    // それ以外はすべてアセットとして保存
    const mainSet = new Set([htmlRel, cssRel, jsRel].filter(Boolean));
    const assets = [];
    const summary = { count: 0, bytes: 0, kinds: { image: 0, audio: 0, font: 0, other: 0 } };
    for (const f of files) {
      if (mainSet.has(f.rel)) continue;
      const data = await f.entry.async('arraybuffer');
      assets.push({ path: f.rel, data });
      summary.count += 1;
      summary.bytes += data.byteLength;
      summary.kinds[assetKind(f.rel)] += 1;
    }

    // 保存に成功してから状態を切り替える(失敗時は元の状態のまま)
    await VFS.replaceAssets(assets);

    state.mode = 'zip';
    state.zipName = zipName;
    state.assetSummary = summary;
    state.paths = { html: htmlRel, css: cssRel || '', js: jsRel || '' };
    state.code = { html: htmlText, css: cssText, js: jsText };
    state.names = {
      html: lastSegment(htmlRel),
      css: cssRel ? lastSegment(cssRel) : '',
      js: jsRel ? lastSegment(jsRel) : '',
    };
    state.edited = { html: false, css: false, js: false };

    renderAll();
    showTab(activeTab);
    await saveNow();
    return summary;
  }

  // zip読み込みの共通処理(サンプル・手動アップロード共通)
  async function importZip(label, zipName, getBuffer, hooks) {
    if (zipBusy) {
      setLog('別のzipを読み込み中です。少し待ってください。', 'warn');
      return false;
    }
    if (hasEdits() && !window.confirm('エディタで編集した内容があります。zipの内容で置き換えてよろしいですか?')) {
      return false;
    }
    zipBusy = true;
    if (hooks && hooks.start) hooks.start();
    setLog(`${label} を読み込み中...`);
    try {
      const buffer = await getBuffer();
      const summary = await loadZipBuffer(buffer, zipName);
      document.querySelectorAll('.sample-card.is-current').forEach((el) => el.classList.remove('is-current'));
      if (hooks && hooks.success) hooks.success();
      setLog(`${label} を読み込みました(アセット${summary.count}ファイル / ${formatSize(summary.bytes)})`, 'ok');
      await runPreview();
      if (window.matchMedia('(max-width: 800px)').matches) {
        els.preview.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return true;
    } catch (err) {
      setLog(`${label} の読み込みに失敗しました: ${err && err.message ? err.message : 'エラー'}`, 'error');
      return false;
    } finally {
      zipBusy = false;
      if (hooks && hooks.end) hooks.end();
    }
  }

  // ============================================================
  //  ファイル読み込み
  // ============================================================
  async function importFiles(fileList, forcedType) {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    // zipが含まれていたらzipとして読み込む
    const zips = files.filter(isZipFile);
    if (zips.length) {
      const zipFile = zips[0];
      const zipName = zipFile.name.replace(/\.zip$/i, '');
      await importZip(zipFile.name, zipName, () => readBuffer(zipFile));
      if (files.length > 1) {
        els.logText.textContent += '(zip以外・2個目以降のzipは無視しました)';
      }
      return;
    }

    const assigned = {};
    const loaded = [];
    const notes = [];
    const pending = [];

    for (const file of files) {
      const detected = detectType(file);
      let type = detected;

      if (forcedType) {
        if (detected && detected !== forcedType) {
          notes.push(`${file.name} は${LABEL[detected]}として読み込み`);
        } else {
          type = forcedType; // 判別不能でも押したスロットに入れる
        }
      }

      if (!type) {
        notes.push(`${file.name} は種類を判別できないのでスキップ`);
        continue;
      }
      if (assigned[type]) {
        notes.push(`${file.name} はスキップ(${LABEL[type]}が複数)`);
        continue;
      }

      try {
        const text = await readText(file);
        if (text.indexOf('\u0000') !== -1) {
          notes.push(`${file.name} はテキストファイルではありません`);
          continue;
        }
        assigned[type] = true;
        pending.push({ type, text: stripBom(text), name: file.name });
        loaded.push(`${LABEL[type]}: ${file.name}`);
      } catch (err) {
        notes.push(`${file.name} の読み込みに失敗(${err && err.message ? err.message : 'エラー'})`);
      }
    }

    // 新しいHTMLを読み込んだらzipモードは終了(CSS/JSだけならzipのまま差し替え)
    if (assigned.html && state.mode === 'zip') {
      await leaveZipMode();
      notes.push('HTMLを読み込んだのでzipモードを終了しました');
    }
    pending.forEach((p) => setCode(p.type, p.text, p.name, false));

    const parts = [];
    if (loaded.length) parts.push(`読み込み完了 ${loaded.join(' / ')}`);
    if (notes.length) parts.push(notes.join(' / '));
    setLog(parts.join('  ') || '読み込めるファイルがありませんでした。', notes.length ? 'warn' : 'ok');

    if (loaded.length) {
      document.querySelectorAll('.sample-card.is-current').forEach((el) => el.classList.remove('is-current'));
      await saveNow();
      if (state.code.html.trim()) runPreview();
    }
  }

  // ============================================================
  //  実行用ファイルの組み立て
  // ============================================================
  // iframe内のconsoleやエラーを親画面に送るブリッジ(簡易モード用。仮想サーバー時はsw.jsが差し込む)
  const BRIDGE_CODE = '(function(){' +
    'if(window.__lcBridgeInstalled)return;window.__lcBridgeInstalled=true;' +
    'var send=function(level,args,extra){try{' +
      'var msg=Array.prototype.map.call(args,function(a){' +
        'if(a instanceof Error)return a.name+": "+a.message;' +
        'if(a!==null&&typeof a==="object"){try{return JSON.stringify(a)}catch(_){return String(a)}}' +
        'return String(a)}).join(" ");' +
      'parent.postMessage({__lcBridge:true,level:level,msg:msg,file:(extra&&extra.file)||"",line:(extra&&extra.line)||0},"*")' +
    '}catch(_){}};' +
    '["log","info","warn","error"].forEach(function(k){var o=console[k];console[k]=function(){send(k,arguments);if(o)return o.apply(console,arguments)}});' +
    'window.addEventListener("error",function(e){' +
      'if(e.target&&e.target!==window&&e.target.tagName){var src=e.target.currentSrc||e.target.src||e.target.href||"";send("warn",["読み込み失敗: <"+e.target.tagName.toLowerCase()+"> "+src]);return}' +
      'send("error",[e.message||"Error"],{file:e.filename,line:e.lineno})},true);' +
    'window.addEventListener("unhandledrejection",function(e){var r=e.reason;send("error",["Promise: "+(r&&r.message?r.message:String(r))])});' +
  '})();';

  function escapeInlineScript(js) {
    return js.replace(/<\/script/gi, '<\\/script');
  }

  function revokeBlobs() {
    blobUrls.forEach((u) => URL.revokeObjectURL(u));
    blobUrls = [];
    blobNameMap = {};
  }

  function makeBlobUrl(text, mime, name) {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    blobUrls.push(url);
    blobNameMap[url] = name;
    return url;
  }

  function serializeDoc(doc, source) {
    const hadDoctype = /^\s*(<!--[\s\S]*?-->\s*)*<!doctype/i.test(source);
    return (hadDoctype ? '<!DOCTYPE html>\n' : '') + doc.documentElement.outerHTML;
  }

  // 3ファイルモードで仮想サーバーに置く時のファイル名
  function filesModePaths() {
    const clean = (name, fallback) => {
      let b = lastSegment(String(name || '').trim());
      if (!b) b = fallback;
      if (b.toLowerCase() === 'index.html') b = `_${b}`;
      return b;
    };
    return {
      html: 'index.html',
      css: clean(state.names.css, DEFAULT_NAME.css),
      js: clean(state.names.js, DEFAULT_NAME.js),
    };
  }

  /**
   * 3ファイルモード用のHTML組み立て
   * mode: 'preview' … Blob URLで差し替え(簡易モード / srcdoc)
   *       'vfs'     … 仮想サーバー上のファイル名に差し替え
   *       'inline'  … style/scriptタグに直接埋め込み(書き出し用)
   */
  function buildDocument(mode) {
    const source = state.code.html;
    const doc = new DOMParser().parseFromString(source, 'text/html');
    const notes = [];

    const cssText = state.code.css;
    const jsText = state.code.js;
    const cssName = state.names.css || DEFAULT_NAME.css;
    const jsName = state.names.js || DEFAULT_NAME.js;

    let cssUrl = '';
    let jsUrl = '';
    if (mode === 'preview') {
      if (cssText) cssUrl = makeBlobUrl(cssText, 'text/css', cssName);
      if (jsText) jsUrl = makeBlobUrl(jsText, 'text/javascript', jsName);
    } else if (mode === 'vfs') {
      const p = filesModePaths();
      cssUrl = encodePath(p.css);
      jsUrl = encodePath(p.js);
    }

    const localLinks = Array.from(doc.querySelectorAll('link[href]')).filter((el) =>
      /(^|\s)stylesheet(\s|$)/i.test(el.getAttribute('rel') || '') && isLocalRef(el.getAttribute('href')));
    const localScripts = Array.from(doc.querySelectorAll('script[src]')).filter((el) =>
      isLocalRef(el.getAttribute('src')));

    const pickTarget = (list, attr, name, fallback) => {
      const wanted = [basename(name), basename(fallback)];
      return list.find((el) => wanted.includes(basename(el.getAttribute(attr)))) || list[0] || null;
    };

    const cssTarget = cssText ? pickTarget(localLinks, 'href', cssName, DEFAULT_NAME.css) : null;
    const jsTarget = jsText ? pickTarget(localScripts, 'src', jsName, DEFAULT_NAME.js) : null;

    const makeStyleNode = () => {
      if (mode !== 'inline') {
        const link = doc.createElement('link');
        link.setAttribute('rel', 'stylesheet');
        link.setAttribute('href', cssUrl);
        return link;
      }
      const style = doc.createElement('style');
      style.textContent = cssText;
      return style;
    };

    // CSS参照の処理(読み込んだCSSに差し替え、それ以外のローカル参照は除去)
    localLinks.forEach((link) => {
      if (link === cssTarget) {
        if (mode !== 'inline') {
          link.setAttribute('href', cssUrl);
          link.removeAttribute('integrity');
        } else {
          link.replaceWith(makeStyleNode());
        }
      } else {
        notes.push(`未読み込みのCSS参照を除外: ${link.getAttribute('href')}`);
        link.remove();
      }
    });
    if (cssText && !cssTarget) doc.head.appendChild(makeStyleNode());

    // JS参照の処理
    localScripts.forEach((script) => {
      if (script === jsTarget) {
        if (mode !== 'inline') {
          script.setAttribute('src', jsUrl);
          script.removeAttribute('integrity');
        } else {
          const inline = doc.createElement('script');
          Array.from(script.attributes).forEach((attr) => {
            if (!['src', 'integrity', 'defer', 'async'].includes(attr.name)) inline.setAttribute(attr.name, attr.value);
          });
          inline.textContent = escapeInlineScript(jsText);
          const isModule = (script.getAttribute('type') || '').toLowerCase() === 'module';
          if (script.hasAttribute('defer') && !isModule) {
            script.remove();
            doc.body.appendChild(inline);
          } else {
            script.replaceWith(inline);
          }
        }
      } else {
        notes.push(`未読み込みのJS参照を除外: ${script.getAttribute('src')}`);
        script.remove();
      }
    });
    if (jsText && !jsTarget) {
      const s = doc.createElement('script');
      if (mode !== 'inline') s.setAttribute('src', jsUrl);
      else s.textContent = escapeInlineScript(jsText);
      doc.body.appendChild(s);
    }

    if (mode === 'preview') {
      const bridge = doc.createElement('script');
      bridge.textContent = BRIDGE_CODE;
      doc.head.insertBefore(bridge, doc.head.firstChild);
    }

    return { html: serializeDoc(doc, source), notes };
  }

  // zipモードのHTML(基本はそのまま。zipに無いCSS/JSを追加した時だけ参照を足す)
  function buildZipEntryHtml() {
    const needCss = !!state.code.css && !state.paths.css;
    const needJs = !!state.code.js && !state.paths.js;
    if (!needCss && !needJs) return state.code.html;
    const doc = new DOMParser().parseFromString(state.code.html, 'text/html');
    if (needCss) {
      const link = doc.createElement('link');
      link.setAttribute('rel', 'stylesheet');
      link.setAttribute('href', ADDED_PATH.css);
      doc.head.appendChild(link);
    }
    if (needJs) {
      const s = doc.createElement('script');
      s.setAttribute('src', ADDED_PATH.js);
      doc.body.appendChild(s);
    }
    return serializeDoc(doc, state.code.html);
  }

  // 仮想サーバーに置くメインファイル一式
  function buildRunFiles() {
    if (state.mode === 'zip') {
      const files = [{ path: state.paths.html || 'index.html', data: buildZipEntryHtml() }];
      if (state.paths.css || state.code.css) files.push({ path: state.paths.css || ADDED_PATH.css, data: state.code.css });
      if (state.paths.js || state.code.js) files.push({ path: state.paths.js || ADDED_PATH.js, data: state.code.js });
      return { files, entry: files[0].path, notes: [] };
    }
    const p = filesModePaths();
    const built = buildDocument('vfs');
    const files = [{ path: p.html, data: built.html }];
    if (state.code.css) files.push({ path: p.css, data: state.code.css });
    if (state.code.js) files.push({ path: p.js, data: state.code.js });
    return { files, entry: p.html, notes: built.notes };
  }

  // ============================================================
  //  Service Worker(仮想サーバー)
  // ============================================================
  let swPromise = null;

  function ensureServiceWorker() {
    if (swPromise) return swPromise;
    swPromise = (async () => {
      if (!('serviceWorker' in navigator) || !window.isSecureContext) {
        throw new Error('この環境ではService Workerが使えません');
      }
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
      if (reg.active) return reg;
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Service Workerの起動がタイムアウトしました')), 10000)),
      ]);
      if (!reg.active) throw new Error('Service Workerが有効になりませんでした');
      return reg;
    })();
    swPromise.catch(() => { swPromise = null; });
    return swPromise;
  }

  // ============================================================
  //  実行・書き出し
  // ============================================================
  function setRunningState() {
    els.previewEmpty.hidden = true;
    hasRun = true;
    els.previewState.textContent = `実行中 ${timeText(Date.now(), true)}${currentRun && currentRun.mode === 'srcdoc' ? '(簡易モード)' : ''}`;
    els.previewState.classList.remove('is-stale');
  }

  // 簡易モード(Service Workerが使えない時の予備。画像・音声などは読み込めない)
  function runFallback(token) {
    if (token !== runToken) return;
    revokeBlobs();
    let result;
    try {
      result = buildDocument('preview');
    } catch (err) {
      setLog(`プレビューの組み立てに失敗しました: ${err.message}`, 'error');
      return;
    }
    if (state.mode === 'zip') {
      addConsole('warn', '簡易モードのため、zip内の画像・音声・フォントなどは読み込めません');
    }
    result.notes.forEach((n) => addConsole('warn', n));
    currentRun = { id: '', mode: 'srcdoc', checked: true };
    vfsBaseUrl = '';
    els.previewFrame.srcdoc = result.html;
    setRunningState();
  }

  async function runPreview() {
    if (!state.code.html.trim()) {
      setLog('HTMLが未選択です。まずHTMLを読み込んでください。', 'warn');
      return;
    }
    const token = ++runToken;
    clearConsole();
    addConsole('system', `実行 ${timeText(Date.now(), true)}`);

    let reg = null;
    try {
      reg = await ensureServiceWorker();
    } catch (err) {
      reg = null;
      if (token === runToken) addConsole('warn', `${err.message}。簡易モードで実行します。`);
    }
    if (token !== runToken) return;

    if (reg) {
      try {
        const built = buildRunFiles();
        await VFS.writeMain(built.files);
        if (token !== runToken) return;
        built.notes.forEach((n) => addConsole('warn', n));
        revokeBlobs();
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        currentRun = { id, mode: 'sw', checked: false };
        vfsBaseUrl = new URL(`./__vfs__/${id}/`, location.href).href;
        els.previewFrame.removeAttribute('srcdoc');
        els.previewFrame.src = vfsBaseUrl + encodePath(built.entry);
        setRunningState();
        return;
      } catch (err) {
        if (token !== runToken) return;
        addConsole('warn', `仮想サーバーで実行できなかったため簡易モードで実行します(${err && err.message ? err.message : 'エラー'})`);
      }
    }
    runFallback(token);
  }

  // 仮想サーバーがちゃんと応答したか確認(しなかったら簡易モードへ)
  els.previewFrame.addEventListener('load', () => {
    const run = currentRun;
    if (!run || run.mode !== 'sw' || run.checked) return;
    let win;
    try {
      win = els.previewFrame.contentWindow;
      if (!win || !String(win.location.href).startsWith(vfsBaseUrl)) return;
    } catch (_) {
      return;
    }
    run.checked = true;
    if (!win.__lcBridgeInstalled) {
      addConsole('warn', '仮想サーバーが応答しなかったため簡易モードに切り替えました(ページを再読み込みすると直る場合があります)');
      swPromise = null;
      runFallback(runToken);
    }
  });

  async function exportZip() {
    try {
      setLog('zipを作成中...');
      const JSZip = await loadJSZip();
      const zip = new JSZip();
      const assets = await VFS.readAssets();
      assets.forEach((a) => zip.file(a.path, a.data));
      buildRunFiles().files.forEach((f) => zip.file(f.path, f.data));
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      downloadBlob(blob, `${state.zipName || 'project'}.zip`);
      setLog(`編集内容を含めて ${state.zipName || 'project'}.zip を書き出しました。`, 'ok');
    } catch (err) {
      setLog(`zipの書き出しに失敗しました: ${err && err.message ? err.message : 'エラー'}`, 'error');
    }
  }

  async function exportFile() {
    if (!state.code.html.trim()) return;
    if (state.mode === 'zip') {
      await exportZip();
      return;
    }
    let result;
    try {
      result = buildDocument('inline');
    } catch (err) {
      setLog(`書き出しに失敗しました: ${err.message}`, 'error');
      return;
    }
    downloadBlob(new Blob([result.html], { type: 'text/html' }), 'index.html');
    setLog('CSS/JSを埋め込んだ1ファイル(index.html)を書き出しました。', 'ok');
  }

  async function clearAll() {
    if (!window.confirm('保存中のファイル(zipのアセットを含む)をすべて削除します。よろしいですか?')) return;
    runToken += 1;
    TYPES.forEach((t) => {
      state.code[t] = '';
      state.names[t] = '';
      state.edited[t] = false;
      state.paths[t] = '';
    });
    state.mode = 'files';
    state.zipName = '';
    state.assetSummary = null;
    state.savedAt = 0;
    clearTimeout(saveTimer);
    saveTimer = null;
    await Store.remove('project');
    try { await VFS.clearAll(); } catch (_) { /* 何もしない */ }
    revokeBlobs();
    currentRun = null;
    vfsBaseUrl = '';
    els.previewFrame.removeAttribute('srcdoc');
    els.previewFrame.src = 'about:blank';
    els.previewEmpty.hidden = false;
    hasRun = false;
    els.previewState.textContent = '未実行';
    els.previewState.classList.remove('is-stale');
    els.editor.value = '';
    document.querySelectorAll('.sample-card.is-current').forEach((el) => el.classList.remove('is-current'));
    clearConsole();
    renderAll();
    setLog('キャッシュを削除しました。', 'ok');
  }

  // ============================================================
  //  コンソール
  // ============================================================
  function updateErrorCount() {
    els.consoleCount.hidden = errorCount === 0;
    els.consoleCount.textContent = String(errorCount);
  }

  function clearConsole() {
    els.consoleList.innerHTML = '';
    errorCount = 0;
    updateErrorCount();
  }

  function addConsole(level, message, where) {
    const list = els.consoleList;
    while (list.children.length >= CONSOLE_MAX) list.removeChild(list.firstChild);

    const li = document.createElement('li');
    li.className = `console__item console__item--${level}`;
    li.textContent = message;
    if (where) {
      const span = document.createElement('span');
      span.className = 'console__where';
      span.textContent = where;
      li.appendChild(span);
    }
    list.appendChild(li);
    list.scrollTop = list.scrollHeight;

    if (level === 'error') {
      errorCount += 1;
      updateErrorCount();
    }
  }

  // 仮想サーバーのURLを「js/game.js」のような見やすいパスにする
  function prettyUrl(text) {
    if (!vfsBaseUrl) return text;
    return String(text).split(vfsBaseUrl).join('./');
  }

  window.addEventListener('message', (e) => {
    if (e.source !== els.previewFrame.contentWindow) return;
    const data = e.data;
    if (!data || data.__lcBridge !== true) return;
    const level = ['log', 'info', 'warn', 'error'].includes(data.level) ? data.level : 'log';
    let where = '';
    const file = String(data.file || '');
    const line = data.line ? `:${data.line}` : '';
    if (file && blobNameMap[file]) {
      where = `${blobNameMap[file]}${line}`;
    } else if (file && vfsBaseUrl && file.startsWith(vfsBaseUrl)) {
      const rel = file.slice(vfsBaseUrl.length).split(/[?#]/)[0];
      where = `${rel.split('/').map(safeDecode).join('/')}${line}`;
    } else if (data.line) {
      where = 'HTML内';
    }
    addConsole(level, prettyUrl(String(data.msg || '')), where);
  });

  async function copyConsole() {
    const text = Array.from(els.consoleList.children).map((li) => li.textContent).join('\n');
    if (!text) {
      setLog('コンソールは空です。', 'warn');
      return;
    }
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      setLog('コンソールの内容をコピーしました。', 'ok');
    } catch (_) {
      setLog('コピーに失敗しました。', 'error');
    }
  }

  // ============================================================
  //  エディタ
  // ============================================================
  function showTab(type) {
    activeTab = type;
    els.tabs.forEach((tab) => {
      const on = tab.dataset.tab === type;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    els.editor.value = state.code[type];
    els.editor.placeholder = PLACEHOLDER[type];
    els.editor.scrollTop = 0;
    els.editor.scrollLeft = 0;
  }

  function onEditorInput() {
    const type = activeTab;
    const text = els.editor.value;
    state.code[type] = text;
    if (text) {
      if (!state.names[type]) state.names[type] = DEFAULT_NAME[type];
      state.edited[type] = true;
    } else {
      if (!(state.mode === 'zip' && state.paths[type])) state.names[type] = '';
      state.edited[type] = state.mode === 'zip' && !!state.paths[type];
    }
    renderSlot(type);
    renderButtons();
    markPreviewStale();
    scheduleSave();
  }

  els.tabs.forEach((tab) => {
    tab.addEventListener('click', () => showTab(tab.dataset.tab));
  });

  els.editor.addEventListener('input', onEditorInput);

  els.editor.addEventListener('keydown', (e) => {
    // Tabキーでインデント
    if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const start = els.editor.selectionStart;
      const end = els.editor.selectionEnd;
      if (typeof els.editor.setRangeText === 'function') {
        els.editor.setRangeText('  ', start, end, 'end');
      } else {
        const v = els.editor.value;
        els.editor.value = v.slice(0, start) + '  ' + v.slice(end);
        els.editor.selectionStart = els.editor.selectionEnd = start + 2;
      }
      onEditorInput();
      return;
    }
    // Ctrl/Cmd + Enter で実行
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      saveNow();
      runPreview();
    }
  });

  // ============================================================
  //  イベント登録
  // ============================================================
  els.bulkInput.addEventListener('change', async (e) => {
    const input = e.target;
    await importFiles(input.files, null);
    input.value = '';
  });

  TYPES.forEach((type) => {
    const s = slotEls[type];
    s.input.addEventListener('change', async (e) => {
      const input = e.target;
      await importFiles(input.files, type);
      input.value = '';
    });
    s.clear.addEventListener('click', () => {
      setCode(type, '', state.names[type], state.mode === 'zip' && !!state.paths[type]);
      markPreviewStale();
      setLog(`${LABEL[type]}を外しました。`, 'ok');
    });
  });

  els.runBtn.addEventListener('click', () => { saveNow(); runPreview(); });
  els.reloadBtn.addEventListener('click', () => { runPreview(); });
  els.exportBtn.addEventListener('click', exportFile);
  els.clearAllBtn.addEventListener('click', clearAll);

  // ============================================================
  //  全画面(バーは隠して、フローティングボタンで呼び出す)
  // ============================================================
  const floatHandle = $('floatHandle');
  const previewBar = els.preview.querySelector('.preview__bar');
  const HANDLE_KEY = 'lc2_handle_pos';
  const BAR_AUTO_HIDE_MS = 3500;
  let barTimer = null;
  // 位置は画面サイズに対する割合で保持(縦横切り替えしてもズレない)
  let handlePos = { x: 0, y: 0.5 };

  try {
    const saved = JSON.parse(localStorage.getItem(HANDLE_KEY) || 'null');
    if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
      handlePos = { x: Math.min(1, Math.max(0, saved.x)), y: Math.min(1, Math.max(0, saved.y)) };
    }
  } catch (_) { /* 何もしない */ }

  const isFull = () => els.preview.classList.contains('is-full');

  // セーフエリア(ノッチ・ホームバー)の幅を測る
  let safeProbe = null;
  function getSafeInsets() {
    if (!safeProbe) {
      safeProbe = document.createElement('div');
      safeProbe.setAttribute('aria-hidden', 'true');
      safeProbe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
        'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);';
      document.body.appendChild(safeProbe);
    }
    const cs = getComputedStyle(safeProbe);
    return {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0,
    };
  }

  // ノッチ等を避けた「置ける範囲」
  function handleArea() {
    const pRect = els.preview.getBoundingClientRect();
    const sRect = els.previewFrame.getBoundingClientRect();
    const ins = isFull() ? getSafeInsets() : { top: 0, right: 0, bottom: 0, left: 0 };
    const size = floatHandle.offsetWidth || 38;
    const margin = 6;
    const minX = sRect.left - pRect.left + ins.left + margin;
    const minY = sRect.top - pRect.top + ins.top + margin;
    const maxX = Math.max(minX, sRect.right - pRect.left - ins.right - size - margin);
    const maxY = Math.max(minY, sRect.bottom - pRect.top - ins.bottom - size - margin);
    return { minX, minY, maxX, maxY };
  }

  function applyHandlePos() {
    if (!isFull()) return;
    const a = handleArea();
    const x = a.minX + (a.maxX - a.minX) * handlePos.x;
    const y = a.minY + (a.maxY - a.minY) * handlePos.y;
    floatHandle.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  function openBar() {
    els.preview.classList.add('is-bar-open');
    restartBarTimer();
  }

  function closeBar() {
    clearTimeout(barTimer);
    barTimer = null;
    els.preview.classList.remove('is-bar-open');
    if (isFull()) requestAnimationFrame(applyHandlePos);
  }

  function restartBarTimer() {
    clearTimeout(barTimer);
    barTimer = setTimeout(closeBar, BAR_AUTO_HIDE_MS);
  }

  function setFull(on) {
    els.preview.classList.toggle('is-full', on);
    document.body.classList.toggle('is-locked', on);
    els.fullBtn.textContent = on ? '閉じる' : '全画面';
    if (on) {
      closeBar();
      requestAnimationFrame(applyHandlePos);
    } else {
      clearTimeout(barTimer);
      barTimer = null;
      els.preview.classList.remove('is-bar-open');
    }
  }

  els.fullBtn.addEventListener('click', () => setFull(!isFull()));

  // 全画面時の表示倍率(押すたびに 100 → 90 → 80 → 70 → 100…)
  const zoomBtn = $('zoomBtn');
  const ZOOM_KEY = 'lc2_fs_zoom';
  const ZOOM_LEVELS = [1, 0.9, 0.8, 0.7];
  let fsZoom = 0.9;

  try {
    const savedZoom = Number(localStorage.getItem(ZOOM_KEY));
    if (ZOOM_LEVELS.includes(savedZoom)) fsZoom = savedZoom;
  } catch (_) { /* 何もしない */ }

  function applyZoom() {
    els.preview.style.setProperty('--fs-zoom', String(fsZoom));
    zoomBtn.textContent = `表示 ${Math.round(fsZoom * 100)}%`;
    requestAnimationFrame(applyHandlePos);
  }

  zoomBtn.addEventListener('click', () => {
    const i = ZOOM_LEVELS.indexOf(fsZoom);
    fsZoom = ZOOM_LEVELS[(i + 1) % ZOOM_LEVELS.length];
    try { localStorage.setItem(ZOOM_KEY, String(fsZoom)); } catch (_) { /* 何もしない */ }
    applyZoom();
    restartBarTimer();
  });

  applyZoom();

  // バーを触っている間は自動で隠れないようにする
  previewBar.addEventListener('pointerdown', () => {
    if (isFull() && els.preview.classList.contains('is-bar-open')) restartBarTimer();
  });

  // バーが開いている時にプレビュー部分を触ったら閉じる
  els.preview.querySelector('.preview__stage').addEventListener('pointerdown', () => {
    if (isFull() && els.preview.classList.contains('is-bar-open')) closeBar();
  });

  // フローティングボタン:タップでバー表示 / ドラッグで移動
  let drag = null;

  floatHandle.addEventListener('pointerdown', (e) => {
    if (!isFull()) return;
    e.preventDefault();
    const a = handleArea();
    drag = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseX: a.minX + (a.maxX - a.minX) * handlePos.x,
      baseY: a.minY + (a.maxY - a.minY) * handlePos.y,
      area: a,
      moved: false,
    };
    try { floatHandle.setPointerCapture(e.pointerId); } catch (_) { /* 何もしない */ }
  });

  floatHandle.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    floatHandle.classList.add('is-dragging');
    const a = drag.area;
    const x = Math.min(a.maxX, Math.max(a.minX, drag.baseX + dx));
    const y = Math.min(a.maxY, Math.max(a.minY, drag.baseY + dy));
    handlePos = {
      x: a.maxX > a.minX ? (x - a.minX) / (a.maxX - a.minX) : 0,
      y: a.maxY > a.minY ? (y - a.minY) / (a.maxY - a.minY) : 0,
    };
    floatHandle.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  });

  function endDrag(e, cancelled) {
    if (!drag || e.pointerId !== drag.id) return;
    const wasMoved = drag.moved;
    drag = null;
    floatHandle.classList.remove('is-dragging');
    try { floatHandle.releasePointerCapture(e.pointerId); } catch (_) { /* 何もしない */ }
    if (wasMoved) {
      try { localStorage.setItem(HANDLE_KEY, JSON.stringify(handlePos)); } catch (_) { /* 何もしない */ }
    } else if (!cancelled) {
      openBar();
    }
  }

  floatHandle.addEventListener('pointerup', (e) => endDrag(e, false));
  floatHandle.addEventListener('pointercancel', (e) => endDrag(e, true));

  // キーボード操作用(Enter / Space)
  floatHandle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openBar();
    }
  });

  window.addEventListener('resize', () => requestAnimationFrame(applyHandlePos));
  window.addEventListener('orientationchange', () => setTimeout(applyHandlePos, 250));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isFull()) setFull(false);
  });

  // コンソール操作
  els.consoleClearBtn.addEventListener('click', clearConsole);
  els.consoleCopyBtn.addEventListener('click', copyConsole);
  els.consoleToggleBtn.addEventListener('click', () => {
    const collapsed = els.consolePanel.classList.toggle('is-collapsed');
    els.consoleToggleBtn.textContent = collapsed ? '開く' : '閉じる';
    els.consoleToggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  });

  // ドラッグ&ドロップ(PC)
  let dragDepth = 0;
  const hasFiles = (e) => !!(e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files'));

  document.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth += 1;
    document.body.classList.add('is-dragging');
  });
  document.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  document.addEventListener('dragleave', (e) => {
    if (!hasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) document.body.classList.remove('is-dragging');
  });
  document.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    document.body.classList.remove('is-dragging');
    importFiles(e.dataTransfer.files, null);
  });

  // ページを離れる直前に未保存分を保存
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && saveTimer) saveNow();
  });

  // ============================================================
  //  スマホ(Safari)対策:ダブルタップ拡大・ピンチ拡大・長押しメニュー
  // ============================================================
  const isEditable = (el) => !!(el && el.closest && el.closest('textarea, input, select, [contenteditable="true"]'));

  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 320 && !isEditable(e.target)) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });

  ['gesturestart', 'gesturechange', 'gestureend'].forEach((type) => {
    document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  });

  document.addEventListener('dblclick', (e) => {
    if (!isEditable(e.target)) e.preventDefault();
  }, { passive: false });

  document.addEventListener('contextmenu', (e) => {
    if (!isEditable(e.target)) e.preventDefault();
  });

  // ============================================================
  //  サンプルゲーム(GitHubの sample game フォルダのzipを読み込む)
  // ============================================================
  const SAMPLE = {
    owner: 'h1ro223',
    repo: 'Local_Manager',
    branch: 'main',
    dir: 'sample game',
    // API制限などで一覧が取れない時用の固定リスト
    fallback: ['Boxing', 'English', 'MOBA', 'Race', 'Romance', 'Survivors', 'Tycoon'],
    labels: {
      Boxing: 'ボクシング',
      English: '英語学習',
      MOBA: 'MOBA',
      Race: 'レース',
      Romance: '恋愛ADV',
      Survivors: 'サバイバー',
      Tycoon: '経営シミュ',
    },
    cacheKey: 'lc2_sample_list',
    cacheMs: 60 * 60 * 1000, // 1時間はAPIを叩かずキャッシュを使う
  };

  const sampleEls = {
    root: document.querySelector('.samples'),
    list: $('sampleList'),
    status: $('sampleStatus'),
    refresh: $('sampleRefreshBtn'),
  };

  function readSampleCache() {
    try {
      const raw = JSON.parse(localStorage.getItem(SAMPLE.cacheKey) || 'null');
      if (raw && Array.isArray(raw.list) && raw.list.length) return raw;
    } catch (_) { /* 何もしない */ }
    return null;
  }

  async function fetchSampleList(force) {
    const cached = readSampleCache();
    if (!force && cached && Date.now() - (cached.at || 0) < SAMPLE.cacheMs) {
      return { list: cached.list, source: 'cache' };
    }
    try {
      const url = `https://api.github.com/repos/${SAMPLE.owner}/${SAMPLE.repo}/contents/${encodeURIComponent(SAMPLE.dir)}?ref=${SAMPLE.branch}`;
      const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('形式エラー');
      const list = data
        .filter((f) => f && f.type === 'file' && /\.zip$/i.test(f.name))
        .map((f) => f.name.replace(/\.zip$/i, ''))
        .sort((a, b) => a.localeCompare(b));
      if (!list.length) throw new Error('zipなし');
      try { localStorage.setItem(SAMPLE.cacheKey, JSON.stringify({ list, at: Date.now() })); } catch (_) { /* 何もしない */ }
      return { list, source: 'api' };
    } catch (_) {
      if (cached) return { list: cached.list, source: 'stale' };
      return { list: SAMPLE.fallback.slice(), source: 'fallback' };
    }
  }

  function sampleZipUrl(name) {
    return `./${encodeURIComponent(SAMPLE.dir)}/${encodeURIComponent(name)}.zip`;
  }

  function renderSamples(list, source) {
    sampleEls.list.innerHTML = '';
    if (!list.length) {
      const p = document.createElement('p');
      p.className = 'samples__empty';
      p.textContent = 'サンプルがありません';
      sampleEls.list.appendChild(p);
      return;
    }
    list.forEach((name) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sample-card';
      btn.setAttribute('role', 'listitem');
      btn.dataset.name = name;
      if (state.mode === 'zip' && state.zipName === name) btn.classList.add('is-current');

      const badge = document.createElement('span');
      badge.className = 'sample-card__badge';
      badge.textContent = name.slice(0, 2).toUpperCase();

      const text = document.createElement('span');
      text.className = 'sample-card__text';
      const title = document.createElement('span');
      title.className = 'sample-card__title';
      title.textContent = SAMPLE.labels[name] || name;
      const file = document.createElement('span');
      file.className = 'sample-card__file';
      file.textContent = `${name}.zip`;
      text.append(title, file);

      btn.append(badge, text);
      btn.addEventListener('click', () => loadSample(name, btn));
      sampleEls.list.appendChild(btn);
    });

    const count = `${list.length}本`;
    sampleEls.status.classList.toggle('is-warn', source === 'fallback' || source === 'stale');
    if (source === 'fallback') {
      sampleEls.status.textContent = `${count}(一覧の取得に失敗したため固定リストを表示)`;
    } else if (source === 'stale') {
      sampleEls.status.textContent = `${count}(前回取得した一覧を表示)`;
    } else {
      sampleEls.status.textContent = `${count} / タップで読み込んで実行`;
    }
  }

  async function refreshSamples(force) {
    sampleEls.refresh.disabled = true;
    sampleEls.status.classList.remove('is-warn');
    sampleEls.status.textContent = '一覧を読み込み中...';
    const { list, source } = await fetchSampleList(force);
    renderSamples(list, source);
    sampleEls.refresh.disabled = false;
  }

  async function loadSample(name, card) {
    const label = SAMPLE.labels[name] || name;
    await importZip(`${label}(${name}.zip)`, name, async () => {
      const res = await fetch(sampleZipUrl(name), { cache: 'no-cache' });
      if (!res.ok) throw new Error(`zipを取得できませんでした(HTTP ${res.status})`);
      return res.arrayBuffer();
    }, {
      start: () => {
        sampleEls.root.classList.add('is-busy');
        card.classList.add('is-loading');
      },
      success: () => {
        card.classList.add('is-current');
      },
      end: () => {
        sampleEls.root.classList.remove('is-busy');
        card.classList.remove('is-loading');
      },
    });
  }

  sampleEls.refresh.addEventListener('click', () => refreshSamples(true));

  // ============================================================
  //  初期化
  // ============================================================
  async function init() {
    showTab('html');
    renderAll();
    // 仮想サーバーは先に起動しておく(初回実行を速くするため)
    ensureServiceWorker().catch(() => {});
    const restored = await loadProject();
    renderAll();
    showTab(activeTab);
    refreshSamples(false);
    if (restored) {
      setLog(state.mode === 'zip' ? `前回の内容(${state.zipName}.zip)を復元しました。` : '前回の内容を復元しました。', 'ok');
      if (state.code.html.trim()) runPreview();
    }
  }

  init();
})();
