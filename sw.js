/*
 * LOCAL CARTRIDGE - Service Worker(ブラウザ内の仮想ファイルサーバー)
 * made by hiro / ヒロ  https://github.com/h1ro223
 *
 * ./__vfs__/<実行ID>/<パス> へのリクエストを横取りして、
 * IndexedDB(lc-vfs)に保存されたファイルを返します。
 * それ以外のリクエストには一切手を出しません。
 */
'use strict';

const VFS_DB_NAME = 'lc-vfs';
const VFS_DB_VERSION = 1;
const VFS_SEGMENT = '__vfs__';
const META_KEY = '\u0000meta'; // script.jsと共通(フォルダ読み込み時の元URLなど)

const MIME = {
  html: 'text/html', htm: 'text/html', xhtml: 'application/xhtml+xml',
  css: 'text/css',
  js: 'text/javascript', mjs: 'text/javascript', cjs: 'text/javascript',
  json: 'application/json', map: 'application/json',
  txt: 'text/plain', csv: 'text/csv', xml: 'application/xml', md: 'text/markdown',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', ico: 'image/x-icon',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg',
  m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2',
  wasm: 'application/wasm', pdf: 'application/pdf',
  glb: 'model/gltf-binary', gltf: 'model/gltf+json',
};

const TEXT_TYPES = /^(text\/|application\/(json|xml|xhtml\+xml)|image\/svg\+xml|model\/gltf\+json)/;

// プレビュー内の console / エラーを親画面へ送るブリッジ(HTMLを返す時に自動で差し込む)
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

// ------------------------------------------------------------
//  ライフサイクル(更新したら即反映)
// ------------------------------------------------------------
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ------------------------------------------------------------
//  IndexedDB
// ------------------------------------------------------------
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(VFS_DB_NAME, VFS_DB_VERSION);
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
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

function getFrom(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function lookupOnce(path) {
  const db = await openDB();
  const main = await getFrom(db, 'main', path);
  if (main) return main;
  return getFrom(db, 'assets', path);
}

// Safariは接続を勝手に閉じることがあるので、失敗したら1回だけ開き直す
async function lookup(path) {
  try {
    return await lookupOnce(path);
  } catch (_) {
    dbPromise = null;
    return lookupOnce(path);
  }
}

async function readMeta() {
  try {
    const db = await openDB();
    const rec = await getFrom(db, 'main', META_KEY);
    return (rec && rec.meta) || {};
  } catch (_) {
    return {};
  }
}

// ------------------------------------------------------------
//  ユーティリティ
// ------------------------------------------------------------
function safeDecode(s) {
  try { return decodeURIComponent(s); } catch (_) { return s; }
}

function mimeOf(path) {
  const m = /\.([a-z0-9]+)$/i.exec(path);
  const type = (m && MIME[m[1].toLowerCase()]) || 'application/octet-stream';
  return TEXT_TYPES.test(type) ? `${type}; charset=utf-8` : type;
}

function isHtmlPath(path) {
  return /\.(html?|xhtml)$/i.test(path);
}

function toText(data) {
  if (typeof data === 'string') return data;
  return new TextDecoder('utf-8').decode(data);
}

function toBytes(data) {
  if (typeof data === 'string') return new TextEncoder().encode(data);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return new Uint8Array(0);
}

function injectBridge(html) {
  const tag = '<script>' + BRIDGE_CODE + '</' + 'script>';
  const patterns = [/<head(\s[^>]*)?>/i, /<html(\s[^>]*)?>/i, /^\s*<!doctype[^>]*>/i];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m) {
      const i = m.index + m[0].length;
      return html.slice(0, i) + tag + html.slice(i);
    }
  }
  return tag + html;
}

// 保存されていないファイルは、元のフォルダ(GitHub Pages)から直接読む
async function fromNetwork(request, path) {
  const meta = await readMeta();
  if (!meta.remoteBase) return null;
  let base;
  try { base = new URL(meta.remoteBase); } catch (_) { return null; }
  if (base.origin !== self.location.origin) return null;

  const url = new URL(path.split('/').map(encodeURIComponent).join('/'), base).href;
  const headers = {};
  const range = request.headers.get('Range');
  if (range) headers.Range = range;

  let res;
  try {
    res = await fetch(url, { headers, cache: 'no-cache' });
  } catch (_) {
    return null;
  }
  if (!res.ok) return null;

  if (isHtmlPath(path)) {
    const html = injectBridge(await res.text());
    return new Response(request.method === 'HEAD' ? null : html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  return res;
}

function textResponse(status, message) {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// ------------------------------------------------------------
//  配信
// ------------------------------------------------------------
async function serve(request, rest) {
  // rest = "<実行ID>/<パス>"
  const slash = rest.indexOf('/');
  let path = slash === -1 ? '' : rest.slice(slash + 1);
  path = path.split('/').map(safeDecode).join('/');
  if (path === '' || path.endsWith('/')) path += 'index.html';

  if (path === META_KEY) return textResponse(404, 'LOCAL CARTRIDGE: not found');

  let record;
  try {
    record = await lookup(path);
  } catch (err) {
    return textResponse(500, `LOCAL CARTRIDGE: 保存領域を読めませんでした (${err && err.message ? err.message : err})`);
  }
  if (!record) {
    const remote = await fromNetwork(request, path);
    if (remote) return remote;
    return textResponse(404, `LOCAL CARTRIDGE: ファイルが見つかりません: ${path}`);
  }

  const type = mimeOf(path);
  const headers = new Headers({
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'Accept-Ranges': 'bytes',
  });

  // HTMLはブリッジを差し込んで返す
  if (isHtmlPath(path)) {
    const html = injectBridge(toText(record.data));
    return new Response(request.method === 'HEAD' ? null : html, { status: 200, headers });
  }

  const bytes = toBytes(record.data);
  const size = bytes.byteLength;
  const range = request.headers.get('Range');

  // iOS Safariの<audio>/<video>はRange対応が必須
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (m && (m[1] !== '' || m[2] !== '')) {
      let start;
      let end;
      if (m[1] === '') {
        const suffix = Number(m[2]);
        start = Math.max(0, size - suffix);
        end = size - 1;
      } else {
        start = Number(m[1]);
        end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
      }
      if (start >= size || start > end) {
        headers.set('Content-Range', `bytes */${size}`);
        return new Response(null, { status: 416, headers });
      }
      headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
      headers.set('Content-Length', String(end - start + 1));
      return new Response(request.method === 'HEAD' ? null : bytes.slice(start, end + 1), { status: 206, headers });
    }
  }

  headers.set('Content-Length', String(size));
  return new Response(request.method === 'HEAD' ? null : bytes, { status: 200, headers });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' && request.method !== 'HEAD') return;

  let url;
  try { url = new URL(request.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;

  const base = new URL(`./${VFS_SEGMENT}/`, self.registration.scope).pathname;
  if (!url.pathname.startsWith(base)) return;

  event.respondWith(serve(request, url.pathname.slice(base.length)));
});
