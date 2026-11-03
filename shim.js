'use strict';
window.MELODIA_VERSION = '1.0.0';
/* global jsmediatags */
// iPhone version: the desktop interface (app.js) talks to window.api. Here api is backed by the
// phone itself — music, covers and the library live in IndexedDB, added from the Files app.

const db = {
  h: null,
  open() {
    // Its own database name: the older phone app on the same github.io origin uses 'melodia'.
    if (!this.h) this.h = new Promise((res, rej) => {
      const r = indexedDB.open('melodia-iphone', 1);
      r.onupgradeneeded = () => { for (const s of ['tracks', 'audio', 'covers', 'kv']) r.result.createObjectStore(s); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return this.h;
  },
  async run(store, mode, fn) {
    const d = await this.open();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => res(req ? req.result : undefined);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('запись не удалась'));
    });
  },
  get: (s, k) => db.run(s, 'readonly', (st) => st.get(k)),
  put: (s, k, v) => db.run(s, 'readwrite', (st) => { st.put(v, k); }),
  del: (s, k) => db.run(s, 'readwrite', (st) => { st.delete(k); }),
  async entries(s) {
    const d = await this.open();
    return new Promise((res, rej) => {
      const out = [];
      const req = d.transaction(s).objectStore(s).openCursor();
      req.onsuccess = () => { const c = req.result; if (c) { out.push([c.key, c.value]); c.continue(); } else res(out); };
      req.onerror = () => rej(req.error);
    });
  },
};

const coverUrls = new Map(); // cover key -> object URL
async function coverUrl(key) {
  if (!key) return '';
  if (coverUrls.has(key)) return coverUrls.get(key);
  const b = await db.get('covers', key).catch(() => null);
  const u = b ? URL.createObjectURL(b) : '';
  coverUrls.set(key, u);
  return u;
}
// Desktop track shape: sid/uid are the id, cover is a ready URL.
async function toTrack(r) {
  return {
    uid: r.id, sid: r.id, source: 'local', title: r.title, artist: r.artist || '', album: r.album || '',
    duration: r.duration || 0, cover: await coverUrl(r.cover), folder: '', root: 'phone',
    added: r.added, modified: r.added, name: r.name, size: r.size,
  };
}

// ------------------------------------------------------------ reading tags
function readTags(file) {
  return new Promise((res) => {
    try { jsmediatags.read(file, { onSuccess: (r) => res(r.tags || {}), onError: () => res({}) }); } catch { res({}); }
  });
}
function readDuration(blob) {
  return new Promise((res) => {
    const a = new Audio();
    const url = URL.createObjectURL(blob);
    let done = false;
    const fin = (d) => { if (done) return; done = true; URL.revokeObjectURL(url); a.removeAttribute('src'); res(isFinite(d) ? Math.round(d) : 0); };
    a.preload = 'metadata';
    a.onloadedmetadata = () => fin(a.duration);
    a.onerror = () => fin(0);
    setTimeout(() => fin(0), 8000);
    a.src = url;
  });
}
function fromFileName(name) {
  const base = name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
  const m = base.match(/^(?:\d{1,3}[.\s-]+)?(.+?)\s+[-–—]\s+(.+)$/);
  return m ? { artist: m[1].trim(), title: m[2].trim() } : { artist: '', title: base };
}
// Old Russian mp3s keep tags in cp1251, shown as «Ïåñíÿ»: turn those back into Cyrillic.
function fixText(x) {
  x = String(x || '').trim();
  if (!/[À-ÿ]{3}/.test(x) || /[^\u0000-ÿ]/.test(x)) return x;
  return x.replace(/[¨¸À-ÿ]/g, (ch) => { const n = ch.charCodeAt(0); return n === 0xa8 ? 'Ё' : n === 0xb8 ? 'ё' : String.fromCharCode(0x410 + n - 0xc0); });
}
function hashBytes(bytes) {
  let h = 2166136261;
  const step = Math.max(1, Math.floor(bytes.length / 4096));
  for (let i = 0; i < bytes.length; i += step) h = Math.imul(h ^ bytes[i], 16777619);
  return (h >>> 0).toString(36) + '-' + bytes.length.toString(36);
}
const AUDIO_RE = /\.(mp3|m4a|aac|flac|wav|ogg|opus|webm|mp4|alac|aiff?)$/i;

// ------------------------------------------------------------ lyrics (lrclib.net, needs internet)
const EDIT = /slowed|sped\s*up|speed\s*up|nightcore|reverb|замедл|ускор/i;
const cleanTitle = (s) => String(s || '').replace(/\s*[([][^)\]]*(slowed|sped|speed|reverb|nightcore|remix|edit|version|official|audio|video|lyrics?)[^)\]]*[)\]]/gi, '').replace(/\s+-\s+(slowed|sped up).*$/i, '').trim();
const cleanArtist = (s) => String(s || '').replace(/\s*-\s*topic$/i, '').split(/\s*(?:,|&|feat\.?|ft\.?)\s*/i)[0].trim();
const lyricsCache = new Map();
async function lyrics(t) {
  const edited = EDIT.test(t.title || '');
  const title = cleanTitle(t.title) || String(t.title || ''), artist = cleanArtist(t.artist);
  const dur = edited ? 0 : Math.round(t.duration || 0);
  const key = `${artist}|${title}|${dur}`.toLowerCase();
  if (lyricsCache.has(key)) return lyricsCache.get(key);
  const base = 'https://lrclib.net/api';
  const getJson = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
  const pick = (r) => (r && (r.syncedLyrics || r.plainLyrics || r.instrumental) ? { synced: r.syncedLyrics || '', plain: r.plainLyrics || '', instrumental: !!r.instrumental, source: `${r.artistName} — ${r.trackName}`, duration: Math.round(r.duration || 0), edited } : null);
  let found = null;
  try {
    if (artist && title && dur) found = pick(await getJson(`${base}/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}&duration=${dur}`).catch(() => null));
    if (!found) {
      const qs = artist ? `track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}` : `q=${encodeURIComponent(title)}`;
      let list = await getJson(`${base}/search?${qs}`).catch(() => []);
      if (!list.length && artist) list = await getJson(`${base}/search?q=${encodeURIComponent(`${artist} ${title}`)}`).catch(() => []);
      const score = (x) => (x.syncedLyrics ? 0 : 30) + (dur && x.duration ? Math.min(60, Math.abs(x.duration - dur)) : 10);
      list = list.filter((x) => !dur || !x.duration || Math.abs(x.duration - dur) < 20).sort((a, b) => score(a) - score(b));
      found = pick(list[0]);
    }
  } catch { /* offline */ }
  if (!found && !navigator.onLine) throw new Error('нужен интернет');
  const res = found || { synced: '', plain: '', instrumental: false, source: '', duration: 0, edited };
  lyricsCache.set(key, res);
  return res;
}

// ------------------------------------------------------------ the api
let playUrl = null; // object URL of the file that plays now (one at a time, the rest is freed)
const off = () => Promise.resolve(null);
window.api = {
  async loadLibrary() { return (await db.get('kv', 'lib')) || null; },
  async saveLibrary(lib) { await db.put('kv', 'lib', JSON.parse(JSON.stringify(lib))); return true; },
  defaultFolder: async () => 'phone',
  async scan() {
    const rows = (await db.entries('tracks')).map(([, v]) => v);
    return Promise.all(rows.map(toTrack));
  },
  async fileUrl(id) {
    const b = await db.get('audio', id);
    if (!b) throw new Error('файл не найден на телефоне');
    if (playUrl) URL.revokeObjectURL(playUrl);
    playUrl = URL.createObjectURL(b);
    return playUrl;
  },
  async blob(id) { return db.get('audio', id); },
  async setDuration(id, d) { const r = await db.get('tracks', id); if (r && !r.duration) { r.duration = d; await db.put('tracks', id, r); } return true; },
  async trash(id) {
    const r = await db.get('tracks', id);
    await db.del('audio', id); await db.del('tracks', id);
    if (r && r.cover) {
      const still = (await db.entries('tracks')).some(([, v]) => v.cover === r.cover);
      if (!still) { await db.del('covers', r.cover); coverUrls.delete(r.cover); }
    }
    return true;
  },
  // Files picked in the Files app are copied into the phone's storage for the app.
  async addFiles(files, known, progress) {
    files = [...files].filter((f) => (f.type || '').startsWith('audio/') || AUDIO_RE.test(f.name));
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    const added = [];
    let skipped = 0, failed = 0, full = false;
    for (const [i, f] of files.entries()) {
      progress(i, files.length, f.name);
      if (known.has(`${f.name}|${f.size}`)) { skipped++; continue; }
      try {
        const tags = await readTags(f);
        const guess = fromFileName(f.name);
        const r = {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), name: f.name, size: f.size, type: f.type || '',
          title: fixText(tags.title) || guess.title || f.name, artist: fixText(tags.artist) || guess.artist || '', album: fixText(tags.album),
          duration: await readDuration(f), added: Date.now() + i, cover: '',
        };
        const pic = tags.picture;
        if (pic && pic.data && pic.data.length) {
          const bytes = Uint8Array.from(pic.data);
          const key = hashBytes(bytes);
          if (!(await db.get('covers', key))) await db.put('covers', key, new Blob([bytes], { type: pic.format && pic.format.includes('/') ? pic.format : 'image/jpeg' }));
          r.cover = key;
        }
        await db.put('audio', r.id, f);
        await db.put('tracks', r.id, r);
        known.add(`${f.name}|${f.size}`);
        added.push(await toTrack(r));
      } catch (e) {
        failed++;
        if (/quota/i.test(e && (e.name + e.message))) { full = true; break; }
      }
    }
    progress(files.length, files.length, '');
    return { added, skipped, failed, full, notAudio: files.length === 0 };
  },
  async storage() {
    if (!navigator.storage || !navigator.storage.estimate) return null;
    const [est, kept] = await Promise.all([navigator.storage.estimate(), navigator.storage.persisted ? navigator.storage.persisted() : false]);
    return { used: est.usage || 0, quota: est.quota || 0, kept };
  },
  lyrics,
  // Not on a phone: folders, file manager, web search, downloads.
  pickFolder: off, openPath: off, showFile: off, copyIn: async () => 0, pathOf: () => '',
  onLibraryChanged() {}, openExternal: async (u) => { window.open(u, '_blank'); },
  win() {},
};
