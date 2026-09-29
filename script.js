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

  // ============================================================
  //  状態
  // ============================================================
  const state = {
    code: { html: '', css: '', js: '' },
    names: { html: '', css: '', js: '' },
    edited: { html: false, css: false, js: false },
    savedAt: 0,
  };

  let activeTab = 'html';
  let saveTimer = null;
  let persistRequested = false;
  let blobUrls = [];
  let blobNameMap = {};
  let hasRun = false;
  let errorCount = 0;

  const $ = (id) => document.getElementById(id);

  const els = {
    bulkInput: $('input-bulk'),
    runBtn: $('runBtn'),
    exportBtn: $('exportBtn'),
    clearAllBtn: $('clearAllBtn'),
    logText: $('logText'),
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

  function formatBytes(text) {
    const size = new Blob([text]).size;
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / 1024 / 1024).toFixed(2)} MB`;
  }

  function basename(path) {
    const clean = String(path || '').split('#')[0].split('?')[0];
    const parts = clean.split('/');
    return (parts[parts.length - 1] || '').toLowerCase();
  }

  // http: / https: / data: / blob: / // で始まらないもの = ローカル参照
  function isLocalRef(url) {
    const u = String(url || '').trim();
    if (!u) return false;
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

  function readText(file) {
    if (typeof file.text === 'function') return file.text();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('読み込みエラー'));
      reader.readAsText(file, 'UTF-8');
    });
  }

  function setLog(message, kind) {
    els.logText.textContent = message;
    els.logText.className = 'log' + (kind ? ` is-${kind}` : '');
  }

  // ============================================================
  //  表示更新
  // ============================================================
  function renderSlot(type) {
    const s = slotEls[type];
    const text = state.code[type];
    if (text) {
      s.root.classList.add('is-loaded');
      s.name.textContent = state.names[type] || DEFAULT_NAME[type];
      s.meta.textContent = `${formatBytes(text)}${state.edited[type] ? ' / 編集済み' : ''}`;
      s.clear.hidden = false;
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
    const hasAny = TYPES.some((t) => state.code[t]);
    if (!hasAny) {
      await Store.remove('project');
      state.savedAt = 0;
      renderBadge();
      return;
    }
    state.savedAt = Date.now();
    const ok = await Store.set('project', {
      code: { ...state.code },
      names: { ...state.names },
      edited: { ...state.edited },
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

    TYPES.forEach((t) => {
      state.code[t] = typeof data.code[t] === 'string' ? data.code[t] : '';
      state.names[t] = (data.names && data.names[t]) || (state.code[t] ? DEFAULT_NAME[t] : '');
      state.edited[t] = !!(data.edited && data.edited[t]);
    });
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

  // ============================================================
  //  ファイル読み込み
  // ============================================================
  async function importFiles(fileList, forcedType) {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    const assigned = {};
    const loaded = [];
    const notes = [];

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
        setCode(type, text, file.name, false);
        loaded.push(`${LABEL[type]}: ${file.name}`);
      } catch (err) {
        notes.push(`${file.name} の読み込みに失敗(${err && err.message ? err.message : 'エラー'})`);
      }
    }

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
  //  プレビュー用HTMLの組み立て
  // ============================================================
  // iframe内のconsoleやエラーを親画面に送るブリッジ
  const BRIDGE_CODE = '(function(){' +
    'var send=function(level,args,extra){try{' +
      'var msg=Array.prototype.map.call(args,function(a){' +
        'if(a instanceof Error)return a.name+": "+a.message;' +
        'if(a!==null&&typeof a==="object"){try{return JSON.stringify(a)}catch(_){return String(a)}}' +
        'return String(a)}).join(" ");' +
      'parent.postMessage({__lcBridge:true,level:level,msg:msg,file:(extra&&extra.file)||"",line:(extra&&extra.line)||0},"*")' +
    '}catch(_){}};' +
    '["log","info","warn","error"].forEach(function(k){var o=console[k];console[k]=function(){send(k,arguments);if(o)return o.apply(console,arguments)}});' +
    'window.addEventListener("error",function(e){' +
      'if(e.target&&e.target!==window&&e.target.tagName){var src=e.target.src||e.target.href||"";send("warn",["読み込み失敗: <"+e.target.tagName.toLowerCase()+"> "+src]);return}' +
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

  /**
   * mode: 'preview' … Blob URLで差し替え(行番号がファイル通りになる)
   *       'inline'  … style/scriptタグに直接埋め込み(書き出し用)
   */
  function buildDocument(mode) {
    const source = state.code.html;
    const doc = new DOMParser().parseFromString(source, 'text/html');
    const hadDoctype = /^\s*(<!--[\s\S]*?-->\s*)*<!doctype/i.test(source);
    const notes = [];

    const cssText = state.code.css;
    const jsText = state.code.js;
    const cssName = state.names.css || DEFAULT_NAME.css;
    const jsName = state.names.js || DEFAULT_NAME.js;

    const cssUrl = mode === 'preview' && cssText ? makeBlobUrl(cssText, 'text/css', cssName) : '';
    const jsUrl = mode === 'preview' && jsText ? makeBlobUrl(jsText, 'text/javascript', jsName) : '';

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
      if (mode === 'preview') {
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
        if (mode === 'preview') {
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
        if (mode === 'preview') {
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
      if (mode === 'preview') s.setAttribute('src', jsUrl);
      else s.textContent = escapeInlineScript(jsText);
      doc.body.appendChild(s);
    }

    if (mode === 'preview') {
      const bridge = doc.createElement('script');
      bridge.textContent = BRIDGE_CODE;
      doc.head.insertBefore(bridge, doc.head.firstChild);
    }

    const html = (hadDoctype ? '<!DOCTYPE html>\n' : '') + doc.documentElement.outerHTML;
    return { html, notes };
  }

  // ============================================================
  //  実行・書き出し
  // ============================================================
  function runPreview() {
    if (!state.code.html.trim()) {
      setLog('HTMLが未選択です。まずHTMLを読み込んでください。', 'warn');
      return;
    }
    revokeBlobs();
    clearConsole();
    let result;
    try {
      result = buildDocument('preview');
    } catch (err) {
      setLog(`プレビューの組み立てに失敗しました: ${err.message}`, 'error');
      return;
    }
    addConsole('system', `実行 ${timeText(Date.now(), true)}`);
    result.notes.forEach((n) => addConsole('warn', n));

    els.previewFrame.srcdoc = result.html;
    els.previewEmpty.hidden = true;
    hasRun = true;
    els.previewState.textContent = `実行中 ${timeText(Date.now(), true)}`;
    els.previewState.classList.remove('is-stale');
  }

  function exportFile() {
    if (!state.code.html.trim()) return;
    let result;
    try {
      result = buildDocument('inline');
    } catch (err) {
      setLog(`書き出しに失敗しました: ${err.message}`, 'error');
      return;
    }
    const blob = new Blob([result.html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'index.html';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    setLog('CSS/JSを埋め込んだ1ファイル(index.html)を書き出しました。', 'ok');
  }

  async function clearAll() {
    if (!window.confirm('保存中のHTML/CSS/JSをすべて削除します。よろしいですか?')) return;
    TYPES.forEach((t) => {
      state.code[t] = '';
      state.names[t] = '';
      state.edited[t] = false;
    });
    state.savedAt = 0;
    clearTimeout(saveTimer);
    await Store.remove('project');
    revokeBlobs();
    els.previewFrame.srcdoc = '';
    els.previewEmpty.hidden = false;
    hasRun = false;
    els.previewState.textContent = '未実行';
    els.previewState.classList.remove('is-stale');
    els.editor.value = '';
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

  window.addEventListener('message', (e) => {
    if (e.source !== els.previewFrame.contentWindow) return;
    const data = e.data;
    if (!data || data.__lcBridge !== true) return;
    const level = ['log', 'info', 'warn', 'error'].includes(data.level) ? data.level : 'log';
    let where = '';
    if (data.file && blobNameMap[data.file]) {
      where = `${blobNameMap[data.file]}${data.line ? ':' + data.line : ''}`;
    } else if (data.line) {
      where = 'HTML内';
    }
    addConsole(level, String(data.msg || ''), where);
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
      state.names[type] = '';
      state.edited[type] = false;
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
      setCode(type, '', '', false);
      markPreviewStale();
      setLog(`${LABEL[type]}を外しました。`, 'ok');
    });
  });

  els.runBtn.addEventListener('click', () => { saveNow(); runPreview(); });
  els.reloadBtn.addEventListener('click', runPreview);
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

  // ノッチ等を避けた「置ける範囲」
  function handleArea() {
    const pRect = els.preview.getBoundingClientRect();
    const sRect = els.previewFrame.getBoundingClientRect();
    const size = floatHandle.offsetWidth || 38;
    const margin = 6;
    const minX = sRect.left - pRect.left + margin;
    const minY = sRect.top - pRect.top + margin;
    const maxX = Math.max(minX, sRect.right - pRect.left - size - margin);
    const maxY = Math.max(minY, sRect.bottom - pRect.top - size - margin);
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
    jszipUrl: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  };

  const sampleEls = {
    root: document.querySelector('.samples'),
    list: $('sampleList'),
    status: $('sampleStatus'),
    refresh: $('sampleRefreshBtn'),
  };

  let sampleBusy = false;
  let jszipPromise = null;

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

  // JSZipは使う時だけ読み込む(初回表示を軽くするため)
  function loadJSZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (jszipPromise) return jszipPromise;
    jszipPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SAMPLE.jszipUrl;
      s.async = true;
      s.onload = () => (window.JSZip ? resolve(window.JSZip) : reject(new Error('JSZipの初期化に失敗')));
      s.onerror = () => reject(new Error('JSZipを読み込めませんでした(通信を確認してください)'));
      document.head.appendChild(s);
    });
    jszipPromise.catch(() => { jszipPromise = null; });
    return jszipPromise;
  }

  // zip内から html/css/js を1つずつ選ぶ(フォルダに入っていてもOK)
  function pickZipEntries(zip) {
    const found = { html: [], css: [], js: [] };
    zip.forEach((path, entry) => {
      if (entry.dir) return;
      if (/(^|\/)__MACOSX\//.test(path) || /(^|\/)\.[^/]*$/.test(path)) return;
      const type = detectType({ name: path, type: '' });
      if (type) found[type].push(entry);
    });
    const score = (entry, type) => {
      const base = entry.name.split('/').pop().toLowerCase();
      const depth = entry.name.split('/').length;
      return (base === DEFAULT_NAME[type] ? 0 : 1000) + depth * 10 + entry.name.length / 1000;
    };
    const picked = {};
    TYPES.forEach((t) => {
      found[t].sort((a, b) => score(a, t) - score(b, t));
      picked[t] = found[t][0] || null;
    });
    return picked;
  }

  async function loadSample(name, card) {
    if (sampleBusy) return;
    if (TYPES.some((t) => state.edited[t])) {
      const ok = window.confirm('エディタで編集した内容があります。サンプルで置き換えてよろしいですか?');
      if (!ok) return;
    }

    const label = SAMPLE.labels[name] || name;
    sampleBusy = true;
    sampleEls.root.classList.add('is-busy');
    card.classList.add('is-loading');
    setLog(`${label}(${name}.zip)を読み込み中...`);

    try {
      const [JSZip, buffer] = await Promise.all([
        loadJSZip(),
        fetch(sampleZipUrl(name), { cache: 'no-cache' }).then((res) => {
          if (!res.ok) throw new Error(`zipを取得できませんでした(HTTP ${res.status})`);
          return res.arrayBuffer();
        }),
      ]);

      const zip = await JSZip.loadAsync(buffer);
      const picked = pickZipEntries(zip);
      if (!picked.html) throw new Error('zipの中にHTMLファイルが見つかりません');

      for (const t of TYPES) {
        const entry = picked[t];
        const text = entry ? (await entry.async('string')).replace(/^\uFEFF/, '') : '';
        setCode(t, text, entry ? entry.name.split('/').pop() : '', false);
      }

      await saveNow();
      runPreview();

      sampleEls.list.querySelectorAll('.sample-card').forEach((el) => el.classList.remove('is-current'));
      card.classList.add('is-current');

      const loaded = TYPES.filter((t) => picked[t]).map((t) => LABEL[t]).join(' / ');
      setLog(`${label} を読み込みました(${loaded})`, 'ok');

      // スマホ(縦並び)ではプレビューまで自動スクロール
      if (window.matchMedia('(max-width: 800px)').matches) {
        els.preview.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (err) {
      setLog(`${label} の読み込みに失敗しました: ${err && err.message ? err.message : 'エラー'}`, 'error');
    } finally {
      sampleBusy = false;
      sampleEls.root.classList.remove('is-busy');
      card.classList.remove('is-loading');
    }
  }

  sampleEls.refresh.addEventListener('click', () => refreshSamples(true));

  // ============================================================
  //  初期化
  // ============================================================
  async function init() {
    showTab('html');
    renderAll();
    refreshSamples(false);
    const restored = await loadProject();
    renderAll();
    showTab(activeTab);
    if (restored) {
      setLog('前回の内容を復元しました。', 'ok');
      if (state.code.html.trim()) runPreview();
    }
  }

  init();
})();
