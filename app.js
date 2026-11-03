'use strict';
/* global icon, hydrateIcons, Equalizer, EQ_FREQS, EQ_PRESETS */

// ============================================================ helpers
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
const fmtLong = (s) => { const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h ? `${h} ч ${m} мин` : `${m} мин`; };
const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c; };
const tracksWord = (n) => `${n} ${plural(n, 'трек', 'трека', 'треков')}`;

function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), kind === 'err' ? 5000 : 3000);
}

function hashColor(str) {
  let h = 0; for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return `hsl(${Math.abs(h) % 360}, 40%, 36%)`;
}

const colorCache = new Map();
function dominantColor(url) {
  if (!url) return Promise.resolve(null);
  if (colorCache.has(url)) return Promise.resolve(colorCache.get(url));
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = c.height = 24;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0, 24, 24);
        const d = x.getImageData(0, 0, 24, 24).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) {
          const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
          const w = 1 + (mx - mn) / 32; // favour saturated pixels
          r += d[i] * w; g += d[i + 1] * w; b += d[i + 2] * w; n += w;
        }
        r /= n; g /= n; b /= n;
        const k = Math.min(1, 150 / Math.max(r, g, b, 1)); // keep it dark enough for white text
        const col = `rgb(${Math.round(r * k)}, ${Math.round(g * k)}, ${Math.round(b * k)})`;
        colorCache.set(url, col); resolve(col);
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// ============================================================ appearance
// Every theme colour is derived from one hue; sat scales how colourful the glass is.
const THEMES = [
  ['spruce', 'Ель', 160, 1], ['ocean', 'Океан', 205, 1], ['night', 'Ночь', 228, 0.85], ['violet', 'Аметист', 270, 0.9],
  ['cherry', 'Вишня', 340, 0.9], ['sunset', 'Закат', 14, 0.95], ['amber', 'Янтарь', 38, 0.9], ['olive', 'Олива', 85, 0.75],
  ['graphite', 'Графит', 210, 0.12],
];
// Hue and saturation of the most prominent colour of a cover (a hue histogram weighted by
// saturation, so a small bright detail beats a large grey area). hue is null for greyscale art.
const hsCache = new Map();
function dominantHS(url) {
  if (!url) return Promise.resolve(null);
  if (hsCache.has(url)) return Promise.resolve(hsCache.get(url));
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = c.height = 32;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0, 32, 32);
        const d = x.getImageData(0, 0, 32, 32).data;
        const bins = Array.from({ length: 36 }, () => ({ w: 0, h: 0, s: 0 }));
        let total = 0;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b), dd = mx - mn;
          if (mx < 0.12 || !dd) continue;
          const s = dd / mx;
          let h = mx === r ? ((g - b) / dd) % 6 : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
          h = (h * 60 + 360) % 360;
          const w = s * s * mx;
          const bin = bins[Math.floor(h / 10) % 36];
          bin.w += w; bin.h += h * w; bin.s += s * w; total += w;
        }
        let best = 0, bestScore = -1;
        bins.forEach((bn, i) => { const sc = bn.w + 0.5 * (bins[(i + 35) % 36].w + bins[(i + 1) % 36].w); if (sc > bestScore) { bestScore = sc; best = i; } });
        const bn = bins[best];
        const res = total < 18 || !bn.w ? { hue: null, sat: 0.15 } : { hue: bn.h / bn.w, sat: Math.min(1.3, 0.3 + (bn.s / bn.w) * 1.1) };
        hsCache.set(url, res); resolve(res);
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

let coverHS = null; // colour of the cover that is playing now
// The theme colour is pulled towards the cover colour; coverStrength 0 = theme only, 1 = cover only.
function effectiveTheme(th) {
  const k = th.coverStrength == null ? 0.6 : th.coverStrength;
  if (!coverHS || !k || !th.ambient) return { hue: th.hue, sat: th.sat };
  if (coverHS.hue == null) return { hue: th.hue, sat: th.sat * (1 - k) + coverHS.sat * k };
  const delta = ((coverHS.hue - th.hue + 540) % 360) - 180;
  return { hue: (th.hue + delta * k + 360) % 360, sat: th.sat * (1 - k) + coverHS.sat * k };
}
function applyTheme(th) {
  const { hue: h, sat: k } = effectiveTheme(th);
  const glass = (lib && lib.settings.glass) || { frost: 1, blur: 30 };
  const solid = (a) => Math.min(0.97, a * (0.55 + 0.45 * glass.frost));
  const c = (sat, light, a) => `hsla(${h.toFixed(1)}, ${Math.min(100, sat * k).toFixed(1)}%, ${light}%, ${a == null ? 1 : a})`;
  const acc = (sat, light) => `hsl(${h.toFixed(1)}, ${Math.min(100, sat * Math.max(k, 0.35)).toFixed(1)}%, ${light}%)`;
  const vars = {
    '--g1': c(26, 41), '--g2': c(36, 28), '--g3': c(30, 33), '--g4': c(29, 28), '--g5': c(30, 22),
    '--bg': c(28, 23), '--panel-solid': c(28, 21, solid(0.82)), '--menu-bg': c(27, 23, solid(0.8)), '--dialog-bg': c(26, 25, solid(0.85)),
    '--toast-bg': c(27, 26, 0.88), '--toast-ok': c(33, 41, 0.9), '--hero': c(41, 31),
    '--accent': acc(66, 79), '--accent-hi': acc(75, 86), '--accent-ink': acc(52, 15),
    '--liked1': acc(45, 34), '--liked2': acc(50, 66), '--switch': acc(45, 57),
    '--glass': String(glass.frost), '--blur-px': glass.blur + 'px',
    '--amb-op': String(0.22 + 0.4 * (th.coverStrength == null ? 0.6 : th.coverStrength)),
  };
  for (const [n, v] of Object.entries(vars)) document.documentElement.style.setProperty(n, v);
  document.body.classList.toggle('no-ambient', !th.ambient);
}
let coverUrlNow = '';
function followCover(t) {
  const url = (t && t.cover) || '';
  if (url === coverUrlNow) return;
  coverUrlNow = url;
  if (!url) { coverHS = null; applyTheme(lib.settings.theme); return; }
  dominantHS(url).then((hs) => { if (coverUrlNow !== url) return; coverHS = hs; applyTheme(lib.settings.theme); });
}
function hexToHueSat(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const sat = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  return { hue: Math.round((h * 60 + 360) % 360), sat: Math.max(0.08, Math.min(1.3, sat * 1.3)) };
}
function themeSwatch(hue, sat) {
  const k = sat;
  return `background:linear-gradient(135deg, hsl(${hue}, ${Math.min(100, 30 * k)}%, 45%) 0%, hsl(${hue}, ${Math.min(100, 32 * k)}%, 24%) 70%), hsl(${hue}, 30%, 30%)`;
}
function setTheme(patch) {
  Object.assign(lib.settings.theme, patch);
  applyTheme(lib.settings.theme);
  save();
}

// ============================================================ library state
// lib holds only the user's own data; the tracks themselves come from scanning the music folders.
const DEFAULT_LIB = {
  version: 2,
  playlists: [],      // { id, name, created, paths: [] }
  liked: [],          // file paths
  recent: [],         // file paths
  recentLists: [],    // list contexts
  extraCover: {},     // file path -> cover url (for files without embedded art)
  web: {},            // page url -> track found by web search (kept while it is liked / in a playlist / recent)
  downloaded: {},     // web track sid -> downloaded file path
  settings: {
    volume: 0.8, muted: false, shuffle: false, repeat: 'off', folders: [], sort: 'added',
    eq: { enabled: true, preset: 'Ровный', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], preamp: 0 },
    eqCustom: {},
    theme: { id: 'spruce', hue: 160, sat: 1, ambient: true, coverStrength: 0.6 },
    glass: { frost: 1, blur: 30 }, // frost: 0 clear … 1 standard … 2 milky; blur in px
    wave: { seed: 'liked', onlyNew: true },
    fx: { speed: 1, pitch: true, reverb: 0 }, // pitch: the tone follows the speed, as in slowed / nightcore edits
  },
};
let lib = structuredClone(DEFAULT_LIB);
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => api.saveLibrary(lib).catch((e) => toast('Не удалось сохранить: ' + e.message, 'err')), 400);
}

// Converts the old (streaming/import) library format into the folder-based one.
function migrate(old) {
  if (!old || old.version === 2) return old;
  const isLocal = (t) => t && t.source === 'local' && t.sid;
  const extraCover = {};
  const visit = (t) => { if (isLocal(t) && t.cover) extraCover[t.sid] = t.cover; };
  (old.playlists || []).forEach((p) => (p.tracks || []).forEach(visit));
  (old.liked || []).forEach(visit);
  (old.recent || []).forEach(visit);
  return {
    ...DEFAULT_LIB,
    playlists: (old.playlists || []).filter((p) => !p.srcUrl && !p.from).map((p) => ({ id: p.id, name: p.name, created: p.created, paths: (p.tracks || []).filter(isLocal).map((t) => t.sid) })),
    liked: (old.liked || []).filter(isLocal).map((t) => t.sid),
    recent: (old.recent || []).filter(isLocal).map((t) => t.sid),
    extraCover,
    settings: { ...DEFAULT_LIB.settings, ...(old.settings || {}), folders: [] },
  };
}

let allTracks = [];
let byPath = new Map();
let musicRoots = [];
let scanned = false;

async function rescan(quiet) {
  musicRoots = lib.settings.folders.length ? lib.settings.folders : [await api.defaultFolder()];
  try {
    const list = await api.scan(musicRoots);
    for (const t of list) if (!t.cover && lib.extraCover[t.sid]) t.cover = lib.extraCover[t.sid];
    allTracks = list;
    byPath = new Map(list.map((t) => [t.sid, t]));
    scanned = true;
    if (player.current && byPath.has(player.current.sid)) player.current = byPath.get(player.current.sid);
  } catch (e) { if (!quiet) toast('Не удалось прочитать папку: ' + e.message, 'err'); }
  const sc = $('#view').scrollTop;
  render();
  $('#view').scrollTop = sc;
}

const resolvePaths = (paths) => paths.map((p) => byPath.get(p) || lib.web[p]).filter(Boolean);
const isWeb = (t) => !!t && t.source === 'web';
// Web tracks are not in any folder, so the library keeps a copy of each one it refers to.
const remember = (tracks) => { for (const t of tracks) if (isWeb(t)) lib.web[t.sid] = { ...t }; };
const isLiked = (t) => !!t && lib.liked.includes(t.sid);
function toggleLike(t) {
  if (!t) return;
  if (isLiked(t)) { lib.liked = lib.liked.filter((p) => p !== t.sid); toast('Удалено из любимых'); }
  else { remember([t]); lib.liked.unshift(t.sid); toast('Добавлено в любимые', 'ok'); if (queue.ctx === 'wave') wave.good.push(t, t); }
  save(); refreshLikes(); renderSidebar();
}
const getPlaylist = (id) => lib.playlists.find((p) => p.id === id);
function createPlaylist(name, tracks = []) {
  remember(tracks);
  const p = { id: uid(), name: name || `Мой плейлист № ${lib.playlists.length + 1}`, created: Date.now(), paths: tracks.map((t) => t.sid) };
  lib.playlists.unshift(p);
  save(); renderSidebar();
  return p;
}
function addToPlaylist(p, tracks) {
  remember(tracks);
  const add = tracks.map((t) => t.sid).filter((s) => !p.paths.includes(s));
  p.paths.push(...add);
  save(); renderSidebar();
  toast(add.length ? `Добавлено в «${p.name}»` : 'Уже есть в плейлисте', add.length ? 'ok' : '');
  if (state.view.name === 'playlist' && state.view.arg === p.id) render();
}
function pushRecent(t) {
  remember([t]);
  lib.recent = [t.sid, ...lib.recent.filter((p) => p !== t.sid)].slice(0, 60);
  if (queue.ctx && queue.ctx !== 'recent' && !queue.ctx.startsWith('queue')) {
    lib.recentLists = [queue.ctx, ...lib.recentLists.filter((c) => c !== queue.ctx)].slice(0, 12);
  }
  save();
}

// Folder playlists: every first-level subfolder of a music folder.
function folders() {
  const map = new Map();
  for (const t of allTracks) {
    if (!t.folder) continue;
    const key = 'f:' + t.root + '|' + t.folder;
    if (!map.has(key)) map.set(key, { ctx: key, name: t.folder, dir: t.root + '\\' + t.folder, tracks: [] });
    map.get(key).tracks.push(t);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}
const folderByCtx = (ctx) => folders().find((f) => f.ctx === ctx);

function sortChips(ctx) {
  const k = sortKey(), rev = !!lib.settings.sortRev;
  const arrows = { date: rev ? 'сначала старые' : 'сначала новые', title: rev ? 'Я → А' : 'А → Я', artist: rev ? 'Я → А' : 'А → Я' };
  const chips = [['date', 'Дата'], ['title', 'Название'], ['artist', 'Исполнитель']];
  if ((lib.customOrder || {})[ctx]) chips.push(['custom', 'Свой порядок']);
  return chips.map(([id, n]) => {
    const on = k === id;
    const arrow = on && id !== 'custom' ? `<span class="arr">${(id === 'date' ? !rev : rev) ? '↓' : '↑'}</span>` : '';
    return `<button class="chip ${on ? 'on' : ''}" data-sort="${id}" title="${on && arrows[id] ? arrows[id] + ' · нажми ещё раз, чтобы развернуть' : ''}">${n}${arrow}</button>`;
  }).join('');
}

// ------------------------------------------------------------ drag to reorder
// A row is held and dropped onto another one. Own playlists and liked tracks change their order;
// folders and "all tracks" switch to their own saved order ("Свой порядок").
let dragRow = null;
const canReorder = (ctx) => ctx === 'liked' || ctx === 'all' || ctx.startsWith('pl:') || ctx.startsWith('f:');
function moveTrack(ctx, from, to) {
  const list = (lists[ctx] || []).slice();
  if (!list[from] || from === to || from + 1 === to) return;
  const [t] = list.splice(from, 1);
  list.splice(to > from ? to - 1 : to, 0, t);
  const sids = list.map((x) => x.sid);
  const keepMissing = (old) => [...sids, ...old.filter((p) => !sids.includes(p))]; // unresolved entries stay at the end
  if (ctx === 'liked') lib.liked = keepMissing(lib.liked);
  else if (ctx.startsWith('pl:')) { const p = getPlaylist(ctx.slice(3)); if (p) p.paths = keepMissing(p.paths); }
  else { lib.customOrder = lib.customOrder || {}; lib.customOrder[ctx] = sids; if (sortKey() !== 'custom') { lib.settings.sort = 'custom'; toast('Включён «Свой порядок» — вернуть сортировку можно кнопками сверху'); } }
  save();
  const sc = $('#view').scrollTop; render(); $('#view').scrollTop = sc;
}
document.addEventListener('dragstart', (e) => {
  const r = e.target.closest && e.target.closest('.tr[draggable="true"]');
  if (!r) return;
  dragRow = { ctx: r.dataset.ctx, i: +r.dataset.i };
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('application/x-melodia-track', '1');
  requestAnimationFrame(() => r.classList.add('dragging'));
});
document.addEventListener('dragend', () => { dragRow = null; $$('.tr.dragging, .tr.drop-above, .tr.drop-below').forEach((r) => r.classList.remove('dragging', 'drop-above', 'drop-below')); });

// sort: 'date' (file modified time) | 'title' | 'artist' | 'custom' (dragged by hand, per list);
// sortRev flips the direction: newest ↔ oldest first, А→Я ↔ Я→А.
const sortKey = () => (lib.settings.sort === 'added' ? 'date' : lib.settings.sort || 'date');
const timeOf = (t) => t.modified || t.added || 0;
function sorted(tracks, ctx) {
  const s = sortKey(), rev = lib.settings.sortRev ? -1 : 1;
  const arr = tracks.slice();
  const order = s === 'custom' && ctx && (lib.customOrder || {})[ctx];
  if (order) {
    // Files that are not in the saved order yet (new ones) go on top, newest first.
    const pos = new Map(order.map((sid, i) => [sid, i]));
    arr.sort((a, b) => { const pa = pos.get(a.sid), pb = pos.get(b.sid); if (pa == null && pb == null) return timeOf(b) - timeOf(a); if (pa == null) return -1; if (pb == null) return 1; return pa - pb; });
  } else if (s === 'title') arr.sort((a, b) => rev * a.title.localeCompare(b.title, 'ru'));
  else if (s === 'artist') arr.sort((a, b) => rev * ((a.artist || '').localeCompare(b.artist || '', 'ru') || a.title.localeCompare(b.title, 'ru')));
  else arr.sort((a, b) => rev * (timeOf(b) - timeOf(a)));
  return arr;
}

function listFromCtx(ctx) {
  if (ctx === 'all') return sorted(allTracks, 'all');
  if (ctx === 'liked') return resolvePaths(lib.liked);
  if (ctx === 'recent') return resolvePaths(lib.recent);
  if (ctx.startsWith('f:')) { const f = folderByCtx(ctx); return f ? sorted(f.tracks, ctx) : []; }
  if (ctx.startsWith('pl:')) { const p = getPlaylist(ctx.slice(3)); return p ? resolvePaths(p.paths) : []; }
  return lists[ctx] || [];
}
function ctxTitle(ctx) {
  if (ctx === 'all') return 'Все треки';
  if (ctx === 'liked') return 'Любимые треки';
  if (ctx === 'recent') return 'Недавно прослушанные';
  if (ctx === 'search') return 'Поиск';
  if (ctx === 'wave') return 'Моя волна';
  if (ctx.startsWith('f:')) { const f = folderByCtx(ctx); return f ? f.name : ''; }
  if (ctx.startsWith('pl:')) { const p = getPlaylist(ctx.slice(3)); return p ? p.name : ''; }
  return '';
}
const ctxExists = (ctx) => ctx === 'all' || ctx === 'liked' || (ctx.startsWith('f:') && !!folderByCtx(ctx)) || (ctx.startsWith('pl:') && !!getPlaylist(ctx.slice(3)));

// ============================================================ covers
function coverHtml(t, cls = '') {
  if (t && t.cover) return `<div class="cv ${cls}" style="background-image:url('${esc(t.cover)}')"></div>`;
  return `<div class="cv ${cls}">${icon('note')}</div>`;
}
function listCover(ctx, cls = '') {
  if (ctx === 'liked') return `<div class="cv liked ${cls}">${icon('heartFill')}</div>`;
  if (ctx === 'all') return `<div class="cv all ${cls}">${icon('library')}</div>`;
  const covers = [...new Set(listFromCtx(ctx).map((t) => t.cover).filter(Boolean))];
  if (covers.length >= 4) return `<div class="cv mosaic ${cls}">${covers.slice(0, 4).map((c) => `<div style="background-image:url('${esc(c)}')"></div>`).join('')}</div>`;
  if (covers.length) return `<div class="cv ${cls}" style="background-image:url('${esc(covers[0])}')"></div>`;
  return `<div class="cv ${cls}">${icon(ctx.startsWith('f:') ? 'folder' : 'note')}</div>`;
}
const listCoverUrl = (ctx) => (listFromCtx(ctx).find((t) => t.cover) || {}).cover;
const kindOf = (ctx) => (ctx.startsWith('f:') ? 'Папка' : 'Плейлист');

// ============================================================ navigation
const state = { view: { name: 'home' }, back: [], fwd: [] };
const lists = {}; // ctx id -> array of tracks currently rendered

function go(name, arg, opts = {}) {
  if (!opts.noHistory) {
    state.back.push({ ...state.view, scroll: $('#view').scrollTop });
    state.fwd = [];
  }
  state.view = { name, arg };
  render();
  $('#view').scrollTop = 0;
}
function openCtx(ctx) {
  if (ctx === 'all' || ctx === 'liked' || ctx === 'recent') go(ctx);
  else if (ctx.startsWith('f:')) go('folder', ctx);
  else if (ctx.startsWith('pl:')) go('playlist', ctx.slice(3));
}
$('#backBtn').onclick = () => { if (!state.back.length) return; state.fwd.push({ ...state.view, scroll: $('#view').scrollTop }); const v = state.back.pop(); state.view = { name: v.name, arg: v.arg }; render(); $('#view').scrollTop = v.scroll || 0; };
$('#fwdBtn').onclick = () => { if (!state.fwd.length) return; state.back.push({ ...state.view, scroll: $('#view').scrollTop }); const v = state.fwd.pop(); state.view = { name: v.name, arg: v.arg }; render(); $('#view').scrollTop = v.scroll || 0; };
$('#view').addEventListener('scroll', () => $('#topbar').classList.toggle('solid', $('#view').scrollTop > 40));

// iPhone: offline only — no web search, wave or import. The tabs sit at the bottom of the screen.
const NAV = [
  ['home', 'home', 'Главная'],
  ['search', 'search', 'Поиск'],
  ['library', 'library', 'Медиатека'],
  ['eq', 'eq', 'Звук'],
  ['settings', 'settings', 'Настройки'],
];
const TAB_OF = { all: 'library', liked: 'library', folder: 'library', playlist: 'library', recent: 'home', queue: '', nowplaying: '', lyrics: '' };
function renderNav() {
  const cur = state.view.name in TAB_OF ? TAB_OF[state.view.name] : state.view.name;
  $('#nav').innerHTML = NAV.map(([id, ic, label]) => `<a data-go="${id}" class="${state.view.name === id ? 'active' : ''}">${icon(ic)}${label}</a>`).join('');
  $('#tabbar').innerHTML = NAV.map(([id, ic, label]) => `<a data-tab="${id}" class="${cur === id ? 'active' : ''}">${icon(ic)}<span>${label}</span></a>`).join('');
}

function sidebarLists() {
  return [
    { ctx: 'liked', name: 'Любимые треки', sub: `Плейлист · ${tracksWord(resolvePaths(lib.liked).length)}` },
    ...folders().map((f) => ({ ctx: f.ctx, name: f.name, sub: `Папка · ${tracksWord(f.tracks.length)}` })),
    ...lib.playlists.map((p) => ({ ctx: 'pl:' + p.id, name: p.name, sub: `Плейлист · ${tracksWord(resolvePaths(p.paths).length)}` })),
  ];
}
function currentCtx() {
  const v = state.view;
  if (v.name === 'folder') return v.arg;
  if (v.name === 'playlist') return 'pl:' + v.arg;
  return v.name;
}
function renderSidebar() {
  const cur = queue.ctx;
  const active = currentCtx();
  $('#libList').innerHTML = sidebarLists().map((l) => `<div class="lib-item ${active === l.ctx ? 'active' : ''} ${cur === l.ctx && player.playing ? 'playing' : ''}" data-open="${esc(l.ctx)}">
    ${listCover(l.ctx)}<div class="meta"><div class="tt">${esc(l.name)}</div><div class="st">${l.sub}</div></div>
    ${cur === l.ctx && player.playing ? icon('volume', 'spk') : ''}</div>`).join('');
}

function render() {
  renderNav();
  renderSidebar();
  $('#searchBox').classList.toggle('hidden', state.view.name !== 'search');
  $('#lyricsBtn').classList.toggle('on', state.view.name === 'lyrics');
  document.body.classList.toggle('np-mode', state.view.name === 'nowplaying' && !!player.current);
  document.body.classList.toggle('side-collapsed', !!lib.settings.sideCollapsed);
  $('#backBtn').disabled = !state.back.length;
  $('#fwdBtn').disabled = !state.fwd.length;
  const view = $('#view');
  const fn = VIEWS[state.view.name] || VIEWS.home;
  view.innerHTML = '';
  fn(view, state.view.arg);
  markPlaying();
  fixCardFab();
}

// ============================================================ track list
function trackRow(t, i, ctx, drag) {
  const playing = player.current && player.current.uid === t.uid;
  const liked = isLiked(t);
  return `<div class="tr ${playing ? 'playing' : ''}" data-ctx="${esc(ctx)}" data-i="${i}" ${drag ? 'draggable="true"' : ''}>
    <div class="num"><span class="idx">${i + 1}</span><span class="eqbars"><i></i><i></i><i></i><i></i></span><button class="pl" data-act="play">${icon('play')}</button></div>
    <div class="ti">${coverHtml(t)}<div class="tx"><div class="tt">${esc(t.title)}</div><div class="ar"><span>${esc(t.artist || 'Неизвестный исполнитель')}</span></div></div></div>
    <div class="col-album">${esc(t.album || '')}</div>
    <button class="icon-btn likebtn ${liked ? 'on' : ''}" data-act="like" title="${liked ? 'Удалить из любимых' : 'Добавить в любимые'}">${icon(liked ? 'heartFill' : 'heart')}</button>
    ${dlButton(t)}
    <div class="dur">${t.duration ? fmt(t.duration) : '—'}</div>
    <button class="icon-btn morebtn" data-act="more" title="Ещё">${icon('more')}</button>
  </div>`;
}

const PAGE = 300;
function trackList(tracks, ctx, opts = {}) {
  lists[ctx] = tracks;
  const limit = opts.limit || PAGE;
  const head = opts.noHead ? '' : `<div class="tl-head"><div class="num">#</div><div>Название</div><div class="col-album">Альбом</div><div></div><div></div><div class="dur" style="text-align:right">${icon('clock')}</div><div></div></div>`;
  const drag = !!opts.drag && canReorder(ctx);
  const rows = tracks.slice(0, limit).map((t, i) => trackRow(t, i, ctx, drag)).join('');
  const more = tracks.length > limit ? `<div class="tl-more"><button class="btn ghost small" data-more="${esc(ctx)}" data-limit="${limit}">Показать ещё ${tracks.length - limit}</button></div>` : '';
  const noAlbum = opts.noAlbum || !tracks.some((t) => t.album);
  return `<div class="tl ${noAlbum ? 'no-album' : ''}">${head}${rows}${more}</div>`;
}

function markPlaying() {
  const cur = player.current;
  $$('.tr').forEach((r) => {
    const t = (lists[r.dataset.ctx] || [])[+r.dataset.i];
    const on = !!(cur && t && t.uid === cur.uid);
    r.classList.toggle('playing', on);
    r.classList.toggle('live', on && player.playing);
  });
  $$('[data-playctx]').forEach((b) => {
    const on = queue.ctx === b.dataset.playctx && player.playing;
    b.innerHTML = icon(on ? 'pause' : 'play');
  });
  $$('.quick-item, .tcard').forEach((el) => el.classList.toggle('playing', !!el.dataset.open && queue.ctx === el.dataset.open && player.playing));
}
function refreshLikes() {
  $$('.tr').forEach((r) => {
    const t = (lists[r.dataset.ctx] || [])[+r.dataset.i];
    const b = r.querySelector('.likebtn');
    if (!t || !b) return;
    const on = isLiked(t);
    b.classList.toggle('on', on);
    b.innerHTML = icon(on ? 'heartFill' : 'heart');
  });
  updateNowPlaying();
  if (state.view.name === 'liked') render();
}

function playCtx(ctx, startIndex = -1, shuffleStart = false) {
  const tracks = listFromCtx(ctx);
  if (!tracks.length) return toast('Здесь пока нет треков');
  if (queue.ctx === ctx && player.current && startIndex === -1 && !shuffleStart) return player.toggle();
  if (shuffleStart && !lib.settings.shuffle) { lib.settings.shuffle = true; save(); updateModeButtons(); }
  const start = startIndex === -1 ? (lib.settings.shuffle ? Math.floor(Math.random() * tracks.length) : 0) : startIndex;
  queue.set(tracks, start, ctx);
  player.playIndex();
}

// ============================================================ views
const VIEWS = {};

function emptyLibraryHtml() {
  return `<div class="empty">${icon('note')}<h3>Здесь будет твоя музыка</h3>
    <p>Добавь mp3, m4a, flac или другие аудиофайлы из приложения «Файлы» — Melodia сохранит их у себя, и они будут играть без интернета.</p>
    <div class="row" style="justify-content:center;margin-top:20px"><button class="btn green" data-act="addfiles">${icon('add')}Добавить музыку</button></div></div>`;
}

// ------------------------------------------------------------ media library tab (the desktop sidebar)
VIEWS.library = (el) => {
  const items = [{ ctx: 'all', name: 'Все треки', sub: `Вся музыка · ${tracksWord(allTracks.length)}` }, ...sidebarLists()];
  el.innerHTML = `<div class="page"><h1 class="page-title">Медиатека</h1>
    <div class="row lib-actions"><button class="btn green small" data-act="addfiles">${icon('add')}Добавить музыку</button><button class="btn ghost small" data-act="newpl">${icon('note')}Новый плейлист</button></div>
    <div class="lib-list phone-lib">${items.map((l) => `<div class="lib-item ${queue.ctx === l.ctx && player.playing ? 'playing' : ''}" data-open="${esc(l.ctx)}">
      ${listCover(l.ctx)}<div class="meta"><div class="tt">${esc(l.name)}</div><div class="st">${l.sub}</div></div>
      ${queue.ctx === l.ctx && player.playing ? icon('volume', 'spk') : ''}</div>`).join('')}</div>
    ${allTracks.length ? '' : emptyLibraryHtml()}</div>`;
};

VIEWS.home = (el) => {
  const h = new Date().getHours();
  const greet = h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';
  if (scanned && !allTracks.length) { el.innerHTML = `<div class="page"><h1 class="page-title">${greet}</h1>${emptyLibraryHtml()}</div>`; return; }
  const quick = ['all', 'liked', ...folders().map((f) => f.ctx), ...lib.playlists.map((p) => 'pl:' + p.id)].slice(0, 8);
  const recentCtx = lib.recentLists.filter(ctxExists).slice(0, 8);
  let html = `<div class="home-bg" id="homeBg" style="background:linear-gradient(180deg, ${hashColor(greet)} 0%, transparent 100%)"></div><div class="page" style="position:relative">
    <h1 class="page-title">${greet}</h1>
    <div class="quick">${quick.map((c) => `<div class="quick-item" data-open="${esc(c)}">${listCover(c)}<div class="tt">${esc(ctxTitle(c))}</div><button class="fab" data-playctx="${esc(c)}">${icon('play')}</button></div>`).join('')}</div>`;
  if (recentCtx.length) {
    html += `<h2 class="sec">Недавние плейлисты</h2><div class="cards">${recentCtx.map((c) => `<div class="tcard" data-open="${esc(c)}">${listCover(c)}<button class="fab" data-playctx="${esc(c)}">${icon('play')}</button><div class="tt">${esc(ctxTitle(c))}</div><div class="st">${kindOf(c)} · ${tracksWord(listFromCtx(c).length)}</div></div>`).join('')}</div>`;
  }
  const recent = resolvePaths(lib.recent);
  if (recent.length) {
    lists.recent = recent;
    html += `<h2 class="sec">Недавно прослушанные <span class="sec-links"><small data-act="clearrecent">Очистить</small><small data-go="recent">Показать все</small></span></h2>
      <div class="home-list">${trackList(recent.slice(0, 8), 'recent', { noHead: true })}</div>`;
  }
  const fresh = allTracks.slice().sort((a, b) => b.added - a.added).slice(0, 12);
  if (fresh.length) {
    lists['all:new'] = fresh;
    html += `<h2 class="sec">Недавно добавленные <small data-go="all">Все треки</small></h2>
      <div class="home-list">${trackList(fresh.slice(0, 8), 'all:new', { noHead: true })}</div>`;
  }
  el.innerHTML = html + '</div>';
  const firstCover = (allTracks.find((t) => t.cover) || {}).cover;
  if (firstCover) dominantColor(firstCover).then((c) => { const bg = $('#homeBg'); if (c && bg) bg.style.background = `linear-gradient(180deg, ${c} 0%, transparent 100%)`; });
};

VIEWS.recent = (el) => {
  const recent = resolvePaths(lib.recent);
  el.innerHTML = `<div class="page"><h1 class="page-title">Недавно прослушанные</h1>
    ${recent.length ? `<div class="actions" style="padding-top:0"><button class="btn ghost small" data-act="clearrecent">${icon('trash')}Очистить историю</button></div>${trackList(recent, 'recent')}` : `<div class="empty">${icon('clock')}<h3>История пуста</h3><p>Здесь появятся треки, которые ты слушал.</p></div>`}</div>`;
};

function fixCardFab() {
  // Position the hover play button at the bottom-right of each card cover.
  const card = $('.tcard .cv');
  if (card) $('#view').style.setProperty('--cvw', card.offsetWidth + 'px');
}
window.addEventListener('resize', fixCardFab);

// One page layout for every list: all tracks, liked, folders and own playlists.
function listPage(el, ctx) {
  const tracks = listFromCtx(ctx);
  const total = tracks.reduce((a, t) => a + (t.duration || 0), 0);
  const name = ctxTitle(ctx);
  const own = ctx.startsWith('pl:');
  const sortable = ctx === 'all' || ctx.startsWith('f:');
  const filter = state.view.filter || '';
  const shown = filter ? tracks.filter((t) => `${t.artist} ${t.title} ${t.album}`.toLowerCase().includes(filter.toLowerCase())) : tracks;
  const kind = ctx === 'all' ? 'Вся музыка' : kindOf(ctx);
  el.innerHTML = `
    <div class="hero"><div class="hero-bg" id="heroBg"></div>
      ${listCover(ctx)}
      <div style="min-width:0">
        <div class="kind">${kind}</div>
        <h1 class="${name.length > 22 ? 'long' : ''}" ${own ? 'data-act="rename" title="Переименовать"' : ''}>${esc(name)}</h1>
        <div class="info"><b>Melodia</b> · ${tracksWord(tracks.length)}${total ? ', ' + fmtLong(total) : ''}</div>
      </div>
    </div>
    <div class="page-body"><div class="page-body-bg" id="bodyBg"></div>
      <div class="actions">
        <button class="fab" data-playctx="${esc(ctx)}" title="Слушать">${icon('play')}</button>
        <button class="icon-btn ${lib.settings.shuffle ? 'on' : ''}" data-act="shuffleplay" title="Перемешать и слушать">${icon('shuffle')}</button>
        ${ctx === 'all' || own ? `<button class="icon-btn" data-act="addfiles" title="Добавить музыку из Файлов">${icon('add')}</button>` : ''}
        ${own ? `<button class="icon-btn" data-act="plmenu" title="Ещё">${icon('more')}</button>` : ''}
        ${sortable ? `<div class="chips sort-chips">${sortChips(ctx)}</div>` : ''}
        <label class="filter">${icon('search')}<input id="plFilter" placeholder="Искать здесь" value="${esc(filter)}"></label>
      </div>
      ${tracks.length ? trackList(shown, filter ? ctx + '#f' : ctx, { drag: !filter })
        : ctx === 'all' ? emptyLibraryHtml()
        : `<div class="empty">${icon('note')}<h3>${ctx === 'liked' ? 'Нажми ♥ у любого трека' : 'Здесь пока пусто'}</h3><p>${ctx === 'liked' ? 'Любимые треки появятся здесь.' : own ? 'Нажми ⋯ у любого трека → «Добавить в плейлист» или + сверху, чтобы добавить файлы прямо сюда.' : ''}</p></div>`}
    </div>`;
  const inp = $('#plFilter');
  inp.oninput = () => { state.view.filter = inp.value; const pos = inp.selectionStart; render(); const n = $('#plFilter'); n.focus(); n.setSelectionRange(pos, pos); };
  const apply = (c) => {
    if (!c) c = hashColor(name);
    const hb = $('#heroBg'), bb = $('#bodyBg');
    if (hb) hb.style.background = `linear-gradient(180deg, ${c} 0%, ${c} 40%, rgba(18,18,18,.6) 100%)`;
    if (bb) bb.style.background = `linear-gradient(180deg, rgba(0,0,0,.2) 0%, transparent 100%)`;
  };
  if (ctx === 'liked' || ctx === 'all') apply('var(--hero)');
  else { apply(null); dominantColor(listCoverUrl(ctx)).then((c) => c && apply(c)); }
}
VIEWS.all = (el) => listPage(el, 'all');
VIEWS.liked = (el) => listPage(el, 'liked');
VIEWS.folder = (el, ctx) => (folderByCtx(ctx) ? listPage(el, ctx) : VIEWS.home(el));
VIEWS.playlist = (el, id) => (getPlaylist(id) ? listPage(el, 'pl:' + id) : VIEWS.home(el));

// ------------------------------------------------------------ equalizer page
VIEWS.eq = (el) => {
  const cfg = lib.settings.eq;
  const presets = { ...EQ_PRESETS, ...lib.settings.eqCustom };
  const hz = (f) => (f >= 1000 ? f / 1000 + 'k' : f);
  el.innerHTML = `<div class="page"><h1 class="page-title">Эквалайзер</h1>
    <div class="eq-wrap ${cfg.enabled ? '' : 'off'}" id="eqWrap">
      <div class="eq-top"><h3>${esc(cfg.preset || 'Свой')}</h3>
        <span class="muted">${cfg.enabled ? 'Включён' : 'Выключен'}</span><div class="switch ${cfg.enabled ? 'on' : ''}" data-act="eqtoggle"></div></div>
      <canvas id="eqCurve"></canvas>
      <div class="eq-bands">
        <div class="eq-band"><div class="db" id="db-pre">${fmtDb(cfg.preamp)}</div><div class="vslider" data-band="pre"><div class="track"></div><div class="zero"></div><div class="fill"></div><div class="knob"></div></div><div class="hz">Усиление</div></div>
        <div class="eq-sep"></div>
        ${EQ_FREQS.map((f, i) => `<div class="eq-band"><div class="db" id="db-${i}">${fmtDb(cfg.gains[i])}</div><div class="vslider" data-band="${i}"><div class="track"></div><div class="zero"></div><div class="fill"></div><div class="knob"></div></div><div class="hz">${hz(f)} Гц</div></div>`).join('')}
      </div>
    </div>
    <div class="eq-presets"><h2 class="sec">Пресеты</h2><div class="chips">
      ${Object.keys(presets).map((n) => `<button class="chip ${cfg.preset === n ? 'on' : ''}" data-preset="${esc(n)}">${esc(n)}${lib.settings.eqCustom[n] ? ` <span class="cnt" data-delpreset="${esc(n)}" title="Удалить">✕</span>` : ''}</button>`).join('')}
    </div>
    <div class="row"><button class="btn ghost small" data-act="eqsave">Сохранить как пресет</button><button class="btn ghost small" data-act="eqreset">Сбросить</button></div>
    <p class="hint">На iPhone: пока эквалайзер стоит на «Ровном» (или выключен) и нет реверберации, музыка играет и при выключенном экране. Если настроить звук, iOS может ставить музыку на паузу при блокировке — так устроен Safari. Скорость работает всегда.</p></div>
    <h2 class="sec">Эффекты</h2>
    <div class="panel fx-panel">
      <div class="chips">${FX_PRESETS.map(([n, sp, pi, rv]) => `<button class="chip ${fxIs(sp, pi, rv) ? 'on' : ''}" data-fx="${sp},${pi ? 1 : 0},${rv}">${n}</button>`).join('')}</div>
      ${rangeSetting('speed', 'Скорость', 'Медленнее — тягучий звук, быстрее — энергичнее', 50, 150, Math.round(lib.settings.fx.speed * 100), '%')}
      ${rangeSetting('reverb', 'Реверберация', 'Эхо большого зала, как в «slowed + reverb»', 0, 100, Math.round(lib.settings.fx.reverb * 100), '%')}
      <div class="setting toggle" data-act="fxpitch"><div class="sd"><b>Тон меняется вместе со скоростью</b><span>Включено — как в slowed / nightcore (ниже или выше голос). Выключено — голос остаётся обычным</span></div><div class="switch ${lib.settings.fx.pitch ? 'on' : ''}"></div></div>
    </div>
  </div>`;
  $$('.vslider', el).forEach(initVSlider);
  drawEqCurve();
};
const fmtDb = (v) => (v > 0 ? '+' : '') + (Math.round(v * 10) / 10) + ' дБ';
function setVSlider(s, v) {
  const pct = (12 - v) / 24 * 100;
  s.querySelector('.knob').style.top = pct + '%';
  const f = s.querySelector('.fill');
  f.style.top = Math.min(pct, 50) + '%';
  f.style.height = Math.abs(pct - 50) + '%';
}
function initVSlider(s) {
  const band = s.dataset.band;
  const cfg = lib.settings.eq;
  const get = () => (band === 'pre' ? cfg.preamp : cfg.gains[+band]);
  setVSlider(s, get());
  const setFrom = (e) => {
    const r = s.getBoundingClientRect();
    let v = 12 - ((e.clientY - r.top) / r.height) * 24;
    v = Math.max(-12, Math.min(12, Math.round(v * 2) / 2));
    if (band === 'pre') cfg.preamp = v; else cfg.gains[+band] = v;
    if (cfg.preset) { cfg.preset = ''; const h = $('.eq-top h3'); if (h) h.textContent = 'Свой'; $$('.chip[data-preset]').forEach((c) => c.classList.remove('on')); }
    setVSlider(s, v);
    $('#db-' + band).textContent = fmtDb(v);
    eq.apply(cfg); drawEqCurve(); save();
  };
  s.addEventListener('pointerdown', (e) => { s.setPointerCapture(e.pointerId); setFrom(e); s.onpointermove = setFrom; });
  s.addEventListener('pointerup', () => { s.onpointermove = null; });
  s.addEventListener('dblclick', () => { if (band === 'pre') cfg.preamp = 0; else cfg.gains[+band] = 0; setVSlider(s, 0); $('#db-' + band).textContent = fmtDb(0); eq.apply(cfg); drawEqCurve(); save(); });
}
function drawEqCurve() {
  const c = $('#eqCurve'); if (!c) return;
  const dpr = devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
  c.width = w * dpr; c.height = h * dpr;
  const x = c.getContext('2d'); x.scale(dpr, dpr);
  const N = 200, fmin = 20, fmax = 20000;
  const freqs = new Float32Array(N).map((_, i) => fmin * Math.pow(fmax / fmin, i / (N - 1)));
  const resp = eq.response(freqs, lib.settings.eq);
  const yOf = (db) => h / 2 - (db / 18) * (h / 2 - 8);
  x.strokeStyle = 'rgba(255,255,255,.07)'; x.lineWidth = 1;
  for (const db of [-12, -6, 0, 6, 12]) { x.beginPath(); x.moveTo(0, yOf(db)); x.lineTo(w, yOf(db)); x.stroke(); }
  for (const f of [100, 1000, 10000]) { const px = Math.log(f / fmin) / Math.log(fmax / fmin) * w; x.beginPath(); x.moveTo(px, 0); x.lineTo(px, h); x.stroke(); }
  const grad = x.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(166,236,206,.35)'); grad.addColorStop(1, 'rgba(166,236,206,0)');
  x.beginPath();
  resp.forEach((db, i) => { const px = (i / (N - 1)) * w, py = yOf(Math.max(-18, Math.min(18, db))); i ? x.lineTo(px, py) : x.moveTo(px, py); });
  x.strokeStyle = '#a6ecce'; x.lineWidth = 2.5; x.stroke();
  x.lineTo(w, h); x.lineTo(0, h); x.closePath(); x.fillStyle = grad; x.fill();
}


// ------------------------------------------------------------ web search
// Every site is queried separately; results appear as they arrive and more pages load on scroll.
const SOURCES = [['ytmusic', 'YouTube Music'], ['youtube', 'YouTube'], ['mailru', 'Mail.ru'], ['soundcloud', 'SoundCloud'], ['audius', 'Audius'], ['hearthis', 'hearthis']];
const SLOW = new Set(['mailru']); // the first batch is not held back waiting for these
const search = { q: '', token: 0, src: {}, merged: [], seen: new Set(), settled: false, filter: 'all' };

function interleave(batches) {
  const out = [];
  for (let i = 0; batches.some((b) => i < b.length); i++) for (const b of batches) if (i < b.length) out.push(b[i]);
  return out;
}
function addResults(items) {
  for (const t of items) if (!search.seen.has(t.sid)) { search.seen.add(t.sid); search.merged.push(t); }
}
// The first screen is built once the fast sites have answered, so rows don't jump around later.
function settle() {
  if (search.settled) return;
  search.settled = true;
  addResults(interleave(SOURCES.map(([id]) => search.src[id].items)));
}

let renderQueued = false;
function renderSearchSoon() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    if (state.view.name !== 'search') return;
    const sc = $('#view').scrollTop;
    render();
    $('#view').scrollTop = sc;
  });
}

function fetchPage(id) {
  const s = search.src[id], token = search.token;
  if (s.loading || s.done) return;
  s.loading = true;
  api.webSearch(id, search.q, s.next).then((r) => {
    if (token !== search.token) return;
    s.items.push(...r.items);
    s.next = r.next; s.done = !r.next; s.pages++;
    if (search.settled) addResults(r.items);
  }, (e) => { if (token === search.token) { s.error = e.message; s.done = true; } }).finally(() => {
    if (token !== search.token) return;
    s.loading = false;
    if (!search.settled && SOURCES.every(([k]) => SLOW.has(k) || !search.src[k].loading)) settle();
    if (search.settled && s.pages === 1) search.merged.slice(0, 2).forEach((t) => api.webPrefetch(t.sid).catch(() => {}));
    renderSearchSoon();
  });
}

// iPhone: the search looks only through the music on the phone.
function runSearch(q, force) {
  q = q.trim();
  if (q === search.q && !force) return;
  search.q = q;
  if (state.view.name === 'search') { render(); $('#view').scrollTop = 0; }
}

function loadMore() {
  if (!search.q || !search.settled || !search.src.ytmusic) return;
  const ids = search.filter === 'all' ? SOURCES.map(([id]) => id) : [search.filter];
  ids.forEach((id) => { const s = search.src[id]; if (!s.loading && !s.done) fetchPage(id); });
}
$('#view').addEventListener('scroll', () => {
  const v = $('#view');
  if (state.view.name === 'search' && v.scrollTop + v.clientHeight > v.scrollHeight - 800) loadMore();
});

VIEWS.search = (el) => {
  const q = search.q;
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!q) {
    el.innerHTML = `<div class="page"><div class="empty">${icon('search')}<h3>Поиск по твоей музыке</h3><p>Ищет среди ${tracksWord(allTracks.length)} на телефоне: по названию, исполнителю и альбому. Можно писать несколько слов, например «сплин романс».</p></div></div>`;
    return;
  }
  const found = allTracks.filter((t) => { const s = `${t.artist} ${t.title} ${t.album}`.toLowerCase(); return words.every((w) => s.includes(w)); });
  const pls = lib.playlists.filter((p) => words.every((w) => p.name.toLowerCase().includes(w)));
  el.innerHTML = `<div class="page">
    ${pls.length ? `<h2 class="sec" style="margin-top:0">Плейлисты</h2><div class="lib-list phone-lib">${pls.map((p) => `<div class="lib-item" data-open="pl:${esc(p.id)}">${listCover('pl:' + p.id)}<div class="meta"><div class="tt">${esc(p.name)}</div><div class="st">Плейлист · ${tracksWord(resolvePaths(p.paths).length)}</div></div></div>`).join('')}</div>` : ''}
    ${found.length ? `<h2 class="sec" ${pls.length ? '' : 'style="margin-top:0"'}>Треки <small>${tracksWord(found.length)}</small></h2>${trackList(sorted(found, 'all'), 'search', { noHead: true })}`
      : pls.length ? '' : `<div class="empty">${icon('search')}<h3>Ничего не нашлось</h3><p>Попробуй написать иначе — или добавь этот трек с телефона.</p></div>`}
  </div>`;
};
VIEWS.searchWeb = (el) => {
  const q = search.q;
  if (!q) {
    el.innerHTML = `<div class="page"><div class="empty">${icon('search')}<h3>Найди любой трек</h3><p>Набери название песни или исполнителя — Melodia поищет сразу на ${SOURCES.map(([, n]) => n).join(', ')}<br>и в твоей медиатеке. Найденное можно сразу слушать, лайкать, добавлять в плейлисты и скачивать.</p></div></div>`;
    return;
  }
  const needle = q.toLowerCase();
  const local = allTracks.filter((t) => `${t.artist} ${t.title} ${t.album}`.toLowerCase().includes(needle)).slice(0, 50);
  const siteName = Object.fromEntries(SOURCES);
  const shown = search.filter === 'all' ? search.merged : search.merged.filter((t) => t.site === siteName[search.filter]);
  const busy = SOURCES.filter(([id]) => search.src[id].loading).map(([, n]) => n);
  const failed = SOURCES.filter(([id]) => search.src[id].error && !search.src[id].items.length).map(([, n]) => n);
  const counts = Object.fromEntries(SOURCES.map(([id, n]) => [id, search.merged.filter((t) => t.site === n).length]));
  let html = '<div class="page">';
  if (local.length) html += `<h2 class="sec" style="margin-top:0">В твоей медиатеке</h2>${trackList(local, 'search:local', { noHead: true })}`;
  html += `<h2 class="sec" ${local.length ? '' : 'style="margin-top:0"'}>Из интернета ${search.merged.length ? `<span class="muted" style="font-size:14px;font-weight:400">· ${tracksWord(search.merged.length)}</span>` : ''}</h2>`;
  if (search.settled && search.merged.length) {
    html += `<div class="chips src-chips"><button class="chip ${search.filter === 'all' ? 'on' : ''}" data-srcfilter="all">Все</button>${SOURCES.filter(([id]) => counts[id] || search.src[id].loading)
      .map(([id, n]) => `<button class="chip ${search.filter === id ? 'on' : ''}" data-srcfilter="${id}">${esc(n)} <span class="cnt">${search.src[id].loading && !counts[id] ? '…' : counts[id]}</span></button>`).join('')}</div>`;
  }
  if (!search.settled) {
    html += `<div class="spinner"></div><p class="hint" style="text-align:center">Ищу «${esc(q)}» по интернету…</p>`;
  } else if (!shown.length && busy.length) {
    html += `<div class="spinner"></div><p class="hint" style="text-align:center">Ещё ищу: ${esc(busy.join(', '))}…</p>`;
  } else if (!shown.length) {
    html += failed.length === SOURCES.length
      ? `<div class="empty">${icon('search')}<h3>Поиск не удался</h3><p>Ни одна площадка не ответила — проверь интернет.</p><div class="row" style="justify-content:center;margin-top:16px"><button class="btn ghost" data-act="research">Повторить</button></div></div>`
      : `<div class="empty">${icon('search')}<h3>Ничего не нашлось</h3><p>Попробуй написать иначе, например «исполнитель название».</p></div>`;
  } else {
    lists.search = shown;
    const top = shown[0];
    html += `<div class="search-top">
        <div class="top-card" data-ctx="search" data-i="0" data-act="playcard">${coverHtml(top)}<div class="tt">${esc(top.title)}</div>
          <div class="st"><b>${esc(top.artist || '')}</b> · ${esc(top.site)}${top.duration ? ' · ' + fmt(top.duration) : ''}</div>
          <button class="fab" data-act="playcard">${icon('play')}</button></div>
        <div>${trackList(shown.slice(1, 5), 'search:top', { noHead: true })}</div>
      </div>
      ${shown.length > 5 ? trackList(shown.slice(5), 'search:more', { limit: shown.length }) : ''}
      ${busy.length ? `<div class="spinner" style="margin:24px auto"></div><p class="hint" style="text-align:center">Ещё ищу: ${esc(busy.join(', '))}…</p>` : ''}`;
  }
  el.innerHTML = html + '</div>';
};

// ------------------------------------------------------------ downloads
// The download button saves a web track into the "Любимые" folder and puts the file into liked tracks.
const downloading = new Set();
const dlState = (t) => (downloading.has(t.sid) ? 'busy' : lib.downloaded[t.sid] ? 'done' : '');
function dlButton(t) {
  if (!isWeb(t)) return '<div></div>';
  const st = dlState(t);
  const title = st === 'busy' ? 'Скачивается…' : st === 'done' ? 'Скачан в «Любимые»' : 'Скачать в «Любимые»';
  return `<button class="icon-btn dlbtn ${st}" data-act="download" title="${title}">${icon(st === 'done' ? 'check' : 'download')}</button>`;
}
function refreshDl() {
  $$('.tr').forEach((r) => {
    const t = (lists[r.dataset.ctx] || [])[+r.dataset.i];
    const b = r.querySelector('.dlbtn');
    if (t && b) b.outerHTML = dlButton(t);
  });
}

async function downloadTrack(t) {
  if (downloading.has(t.sid)) return;
  if (lib.downloaded[t.sid] && byPath.has(lib.downloaded[t.sid])) return toast(`«${t.title}» уже в «Любимых»`);
  downloading.add(t.sid); refreshDl();
  try {
    const { file, existed } = await api.webDownload(t, musicRoots[0]);
    lib.downloaded[t.sid] = file;
    if (t.cover && !lib.extraCover[file]) lib.extraCover[file] = t.cover;
    lib.liked = [file, ...lib.liked.filter((p) => p !== file && p !== t.sid)];
    save();
    toast(existed ? `«${t.title}» уже был в папке «Любимые»` : `«${t.title}» скачан в «Любимые»`, 'ok');
    await rescan(true);
  } catch (e) { toast(`Не удалось скачать «${t.title}»: ${e.message}`, 'err'); }
  downloading.delete(t.sid); refreshDl();
}

// Hovering a web track gets its stream ready, so a click starts it almost instantly.
const prefetched = new Set();
let hoverTimer = null;
document.addEventListener('mouseover', (e) => {
  const row = e.target.closest('.tr[data-ctx], .top-card[data-ctx]');
  clearTimeout(hoverTimer);
  if (!row) return;
  const t = (lists[row.dataset.ctx] || [])[+row.dataset.i];
  if (!isWeb(t) || prefetched.has(t.sid)) return;
  hoverTimer = setTimeout(() => { prefetched.add(t.sid); api.webPrefetch(t.sid).catch(() => {}); }, 250);
});

document.addEventListener('input', (e) => {
  if (e.target.id !== 'themeColor') return;
  const v = e.target.value;
  applyTheme({ ...lib.settings.theme, ...hexToHueSat(v) });
  e.target.closest('.dot').classList.remove('custom');
  e.target.closest('.dot').setAttribute('style', themeSwatch(hexToHueSat(v).hue, hexToHueSat(v).sat));
});
document.addEventListener('change', (e) => {
  if (e.target.id !== 'themeColor') return;
  setTheme({ id: 'custom', color: e.target.value, ...hexToHueSat(e.target.value) });
  render();
});

let searchTimer = null;
$('#searchInput').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  $('#searchClear').classList.toggle('hidden', !e.target.value);
  searchTimer = setTimeout(() => runSearch(e.target.value), 700);
});
$('#searchInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(searchTimer); runSearch(e.target.value); } });
$('#searchClear').onclick = (e) => { e.preventDefault(); $('#searchInput').value = ''; $('#searchClear').classList.add('hidden'); runSearch(''); $('#searchInput').focus(); };
function openSearch() { if (state.view.name !== 'search') go('search'); const i = $('#searchInput'); i.focus(); i.select(); }

// ------------------------------------------------------------ settings
const FX_PRESETS = [['Обычный', 1, true, 0], ['Slowed + Reverb', 0.85, true, 0.35], ['Slowed', 0.85, true, 0], ['Sped up', 1.15, true, 0], ['Nightcore', 1.25, true, 0.05], ['Концертный зал', 1, true, 0.45]];
const fxIs = (sp, pi, rv) => { const f = lib.settings.fx; return Math.abs(f.speed - sp) < 0.005 && f.pitch === pi && Math.abs(f.reverb - rv) < 0.005; };
const GLASS_PRESETS = [['Прозрачное', 0.35, 16], ['Стандарт', 1, 30], ['Матовое', 1.6, 44], ['Молочное', 2, 60]];
function rangeSetting(id, title, hint, min, max, value, unit, disabled) {
  return `<div class="setting ${disabled ? 'disabled' : ''}"><div class="sd"><b>${title}</b><span>${hint}</span></div>
    <input type="range" class="range" data-range="${id}" min="${min}" max="${max}" value="${value}" style="--p:${((value - min) / (max - min)) * 100}%" ${disabled ? 'disabled' : ''}>
    <span class="range-val" id="rv-${id}">${value}${unit}</span></div>`;
}
const RANGE_UNIT = { cover: '%', frost: '%', blur: ' px', speed: '%', reverb: '%' };
document.addEventListener('input', (e) => {
  const r = e.target.closest('input[data-range]');
  if (!r) return;
  const v = +r.value, id = r.dataset.range;
  r.style.setProperty('--p', ((v - r.min) / (r.max - r.min)) * 100 + '%');
  $('#rv-' + id).textContent = v + RANGE_UNIT[id];
  if (id === 'cover') lib.settings.theme.coverStrength = v / 100;
  if (id === 'frost') lib.settings.glass.frost = v / 100;
  if (id === 'blur') lib.settings.glass.blur = v;
  if (id === 'speed' || id === 'reverb') {
    lib.settings.fx[id] = v / 100;
    eq.effects(lib.settings.fx);
    $$('[data-fx]').forEach((c) => c.classList.remove('on'));
    updateFxBadge();
    return save();
  }
  if (id !== 'cover') $$('[data-glass]').forEach((c) => c.classList.remove('on'));
  applyTheme(lib.settings.theme);
  save();
});
VIEWS.settings = (el) => {
  el.innerHTML = `<div class="page"><h1 class="page-title">Настройки</h1>
    <div class="panel"><h3>Музыка на телефоне</h3>
      <p>Треки хранятся внутри Melodia и играют без интернета. Сейчас: <b>${tracksWord(allTracks.length)}</b>.<span id="storeInfo"></span></p>
      <div class="row"><button class="btn green small" data-act="addfiles">${icon('add')}Добавить из «Файлов»</button></div>
      <p class="hint">Добавляй музыку в приложении с иконки на экране «Домой», а не во вкладке Safari — у них разная память. Если удалить иконку, добавленная музыка сотрётся.</p>
    </div>
    <div class="panel"><h3>Оформление</h3>
      <p>Цвет фона и стеклянных панелей. Можно выбрать готовый или свой.</p>
      <div class="swatches">
        ${THEMES.map(([id, name, hue, sat]) => `<button class="swatch ${lib.settings.theme.id === id ? 'on' : ''}" data-theme="${id}"><span class="dot" style="${themeSwatch(hue, sat)}"></span>${name}</button>`).join('')}
        <label class="swatch ${lib.settings.theme.id === 'custom' ? 'on' : ''}" title="Свой цвет"><span class="dot ${lib.settings.theme.id === 'custom' ? '' : 'custom'}" style="${lib.settings.theme.id === 'custom' ? themeSwatch(lib.settings.theme.hue, lib.settings.theme.sat) : ''}"><input type="color" id="themeColor" value="${esc(lib.settings.theme.color || '#3a7d6a')}"></span>Свой</label>
      </div>
      <div class="setting toggle" data-act="ambienttoggle"><div class="sd"><b>Цвета из обложки трека</b><span>Фон и стекло окрашиваются в цвета обложки того, что играет</span></div><div class="switch ${lib.settings.theme.ambient ? 'on' : ''}"></div></div>
      ${rangeSetting('cover', 'Сила цвета обложки', 'Левее — больше цвета темы, правее — больше цвета обложки', 0, 100, Math.round((lib.settings.theme.coverStrength == null ? 0.6 : lib.settings.theme.coverStrength) * 100), '%', !lib.settings.theme.ambient)}
    </div>
    <div class="panel"><h3>Стекло</h3>
      <p>Как в iPhone: насколько панели прозрачные и насколько сильно размывают то, что за ними.</p>
      <div class="chips glass-presets">${GLASS_PRESETS.map(([n, f, b]) => `<button class="chip ${Math.abs(lib.settings.glass.frost - f) < 0.01 && lib.settings.glass.blur === b ? 'on' : ''}" data-glass="${f},${b}">${n}</button>`).join('')}</div>
      ${rangeSetting('frost', 'Матовость', 'Левее — прозрачное стекло, правее — молочное', 0, 200, Math.round(lib.settings.glass.frost * 100), '%')}
      ${rangeSetting('blur', 'Размытие', 'Насколько размыт фон под панелями', 0, 60, lib.settings.glass.blur, ' px')}
    </div>
    <p class="hint">Melodia для iPhone · версия ${esc(window.MELODIA_VERSION || '')} · музыка, плейлисты и настройки хранятся только на этом телефоне</p>
  </div>`;
  api.storage().then((s) => {
    const box = $('#storeInfo');
    if (!s || !box) return;
    const mb = (b) => (b >= 1e9 ? (b / 1e9).toFixed(1) + ' ГБ' : Math.round(b / 1e6) + ' МБ');
    box.textContent = ` Занято ${mb(s.used)}${s.quota ? ` из ${mb(s.quota)}` : ''}.`;
  }).catch(() => {});
};

// ------------------------------------------------------------ queue
VIEWS.queue = (el) => {
  const cur = player.current;
  const upcoming = queue.upcoming(80);
  lists['queue:now'] = cur ? [cur] : [];
  el.innerHTML = `<div class="page"><h1 class="page-title">Очередь</h1>
    ${cur ? `<h2 class="sec" style="margin-top:0">Сейчас играет</h2>${trackList([cur], 'queue:now', { noHead: true })}` : `<div class="empty">${icon('queue')}<h3>Очередь пуста</h3><p>Включи что-нибудь — и здесь появятся следующие треки.</p></div>`}
    ${queue.manual.length ? `<h2 class="sec">Далее в очереди <small data-act="clearmanual">Очистить</small></h2>${trackList(queue.manual, 'queue:manual', { noHead: true })}` : ''}
    ${upcoming.length ? `<h2 class="sec">Далее${queue.ctx && ctxTitle(queue.ctx) ? ': ' + esc(ctxTitle(queue.ctx)) : ''}</h2>${trackList(upcoming, 'queue:next', { noHead: true })}` : ''}
  </div>`;
};

// ------------------------------------------------------------ now playing (big player)
// The whole window turns into the cover (Settings-coloured glass on top of it): a stage with the
// beat-reactive wave and the title on the left, synced lyrics in a glass panel on the right.
VIEWS.nowplaying = (el) => {
  const t = player.current;
  if (!t) {
    delete el.dataset.uid;
    el.innerHTML = `<div class="page"><div class="empty">${icon('note')}<h3>Сейчас ничего не играет</h3><p>Включи любой трек — и здесь появится большой плеер с обложкой.</p></div></div>`;
    return;
  }
  const liked = isLiked(t);
  const where = [isWeb(t) ? t.site : 'Медиатека', t.album && t.album !== t.site && t.album !== t.title ? t.album : ''].filter(Boolean).join(' · ');
  el.dataset.uid = t.uid;
  loadLyrics(t);
  el.innerHTML = `<div class="npx ${lib.settings.npLyrics === false ? 'no-lyrics' : ''}">
    <div class="npx-stage ${lib.settings.viz === false ? 'viz-off' : ''}">
      <canvas id="viz"></canvas>
      <div class="npx-meta">
        <div class="npx-state" id="npxState">${player.playing ? 'Сейчас играет' : 'На паузе'}${where ? ' · ' + esc(where) : ''}</div>
        <h1 class="${t.title.length > 24 ? 'long' : ''}">${esc(t.title)}</h1>
        <button class="npx-artist" data-big="artist" title="Найти другие треки исполнителя">${esc((t.artist || '').trim() || 'Неизвестный исполнитель')}</button>
        <div class="npx-acts">
          <button class="icon-btn likebtn ${liked ? 'on' : ''}" id="bigLike" data-big="like" title="${liked ? 'Удалить из любимых' : 'Добавить в любимые'}">${icon(liked ? 'heartFill' : 'heart')}</button>
          ${isWeb(t) ? `<button class="icon-btn dlbtn ${dlState(t)}" data-big="dl" title="Скачать в «Любимые»">${icon(dlState(t) === 'done' ? 'check' : 'download')}</button>`
            : `<button class="icon-btn" data-big="more" title="Ещё">${icon('more')}</button>`}
          <button class="icon-btn ${lib.settings.viz === false ? '' : 'on'}" data-big="viz" title="Волна">${icon('wave')}</button>
          <button class="icon-btn ${lib.settings.npLyrics === false ? '' : 'on'}" id="npLyrToggle" data-act="lytoggle" title="Показать или скрыть текст">${icon('lyrics')}</button>
          ${queue.ctx === 'wave' ? `<button class="icon-btn" data-act="wavedislike" title="Не нравится">${icon('dislike')}</button>` : ''}
        </div>
      </div>
    </div>
    <aside class="npx-lyrics">
      <div class="npx-lh" id="lyHead">${npLyricsHead()}</div>
      <div class="npx-lb ${lyr.lines.length ? 'synced' : ''}" id="lyBox">${lyricsBodyHtml(t, true)}</div>
    </aside>
  </div>`;
  lyr.active = -1;
  syncLyrics(true);
};

// ------------------------------------------------------------ my wave (endless recommendations)
// Seeds are random tracks of the chosen playlist plus wave tracks the user liked or listened to the end;
// YouTube Music radios of those seeds give the next batch. The queue grows by itself as it plays.
const trackKey = (t) => `${t.artist || ''}|${t.title || ''}`.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^\p{L}\p{N}|]+/gu, '');
const wave = { loading: false, good: [], banned: new Set() };
function sample(arr, n) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}
const seedOf = (t) => ({ sid: isWeb(t) ? t.sid : '', artist: t.artist || '', title: t.title || '' });
function waveSeedList() {
  const s = lib.settings.wave.seed;
  const list = ctxExists(s) ? listFromCtx(s) : [];
  return list.length ? list : resolvePaths(lib.liked).length ? resolvePaths(lib.liked) : allTracks;
}
function waveExclude(extra = []) {
  const keys = new Set([...queue.ctx === 'wave' ? queue.tracks : [], ...extra].map(trackKey));
  if (lib.settings.wave.onlyNew) for (const t of [...allTracks, ...resolvePaths(lib.liked)]) keys.add(trackKey(t));
  return [...keys];
}
const notBanned = (t) => !wave.banned.has((t.artist || '').toLowerCase());
async function waveStart() {
  if (wave.loading) return;
  const src = waveSeedList();
  if (!src.length) return toast('Волне не от чего оттолкнуться: добавь треки в медиатеку или в любимые');
  wave.loading = true; wave.good = [];
  if (state.view.name === 'wave') render();
  try {
    const items = (await api.webWave(sample(src, 6).map(seedOf), waveExclude())).filter(notBanned);
    if (!items.length) throw new Error('похожих треков не нашлось');
    queue.set(items, 0, 'wave');
    queue.order = items.map((_, i) => i); queue.pos = 0; // the wave keeps its own order
    queue.manual = [];
    player.playIndex();
  } catch (e) { toast('Волна не запустилась: ' + e.message, 'err'); }
  wave.loading = false;
  if (state.view.name === 'wave') render();
}
async function waveExtend() {
  if (wave.loading || queue.ctx !== 'wave') return;
  wave.loading = true;
  try {
    const seeds = [...sample(waveSeedList(), 3), ...sample(wave.good.slice(-8), 3)].map(seedOf);
    const items = (await api.webWave(seeds, waveExclude())).filter(notBanned);
    if (queue.ctx === 'wave') queue.append(items);
    if (state.view.name === 'wave' || state.view.name === 'queue') { const sc = $('#view').scrollTop; render(); $('#view').scrollTop = sc; }
  } catch { /* try again on the next track */ }
  wave.loading = false;
}
function waveDislike() {
  const t = player.current;
  if (!t || queue.ctx !== 'wave') return;
  const a = (t.artist || '').toLowerCase();
  if (a) wave.banned.add(a);
  // Drop the rest of this artist from what is still ahead.
  const ahead = queue.order.slice(queue.pos + 1).filter((i) => notBanned(queue.tracks[i]));
  queue.order = [...queue.order.slice(0, queue.pos + 1), ...ahead];
  toast(a ? `Больше не будет: ${t.artist}` : 'Пропускаю');
  player.next();
}

VIEWS.wave = (el) => {
  const s = lib.settings.wave;
  const on = queue.ctx === 'wave' && !!player.current;
  const seeds = [['liked', 'Любимые треки'], ['all', 'Вся медиатека'], ...folders().map((f) => [f.ctx, f.name]), ...lib.playlists.map((p) => ['pl:' + p.id, p.name])];
  const ahead = on ? [player.current, ...queue.upcoming(60)] : [];
  el.innerHTML = `<div class="page wave-page">
    <div class="wave-hero ${on && player.playing ? 'live' : ''}">
      <div class="wave-orb"><i></i><i></i><i></i><i></i><b></b><span class="bars"><s></s><s></s><s></s><s></s><s></s></span></div>
      <div class="wave-info">
        <div class="kind">Рекомендации</div>
        <h1>Моя волна</h1>
        <p class="muted">Бесконечный поток похожей музыки по вкусу выбранного плейлиста. Лайкай то, что нравится, — волна станет точнее. Не нравится — жми ${icon('dislike', 'inline')}, и этого исполнителя больше не будет.</p>
        <div class="row">
          <button class="btn green big" data-act="${on ? 'waveplay' : 'wavestart'}" ${wave.loading && !on ? 'disabled' : ''}>${icon(on && player.playing ? 'pause' : 'play')}${wave.loading && !on ? 'Подбираю треки…' : on ? (player.playing ? 'Пауза' : 'Продолжить') : 'Запустить волну'}</button>
          ${on ? `<button class="btn ghost" data-act="wavestart">Новая волна</button><button class="icon-btn" data-act="wavedislike" title="Не нравится: пропустить и больше не ставить этого исполнителя">${icon('dislike')}</button>` : ''}
        </div>
      </div>
    </div>
    <h2 class="sec">На основе</h2>
    <div class="chips">${seeds.map(([c, n]) => `<button class="chip ${s.seed === c ? 'on' : ''}" data-waveseed="${esc(c)}">${esc(n)}</button>`).join('')}</div>
    <div class="setting toggle" data-act="wavenew" style="max-width:640px"><div class="sd"><b>Только новые треки</b><span>Не ставить то, что уже есть в медиатеке и любимых</span></div><div class="switch ${s.onlyNew ? 'on' : ''}"></div></div>
    ${ahead.length ? `<h2 class="sec">Сейчас в волне ${wave.loading ? '<span class="muted" style="font-size:14px;font-weight:400">· подбираю ещё…</span>' : ''}</h2>${trackList(ahead, 'wave:ahead', { noHead: true })}` : ''}
  </div>`;
};

// ------------------------------------------------------------ playlist import
const IMPORT_PLATS = [['vk', 'VK Музыка', 'плейлисты и альбомы (вход в окне VK)'], ['sp', 'Spotify', 'плейлисты и альбомы'], ['ya', 'Яндекс Музыка', 'плейлисты и альбомы'], ['ap', 'Apple Music', 'плейлисты и альбомы'],
  ['dz', 'Deezer', 'плейлисты и альбомы'], ['yt', 'YouTube / YouTube Music', 'плейлисты'], ['sc', 'SoundCloud', 'плейлисты']];
const imp = { url: '', busy: false, phase: '', done: 0, total: 0, result: null, error: '' };
async function runImport(url) {
  if (imp.busy || !url.trim()) return;
  Object.assign(imp, { url, busy: true, phase: 'Читаю плейлист…', done: 0, total: 0, result: null, error: '' });
  const rerender = () => { if (state.view.name === 'import') { const sc = $('#view').scrollTop; render(); $('#view').scrollTop = sc; } };
  rerender();
  try {
    const isVk = /(^|\/\/|\.)vk\.(com|ru)\//i.test(url.trim()) || /^https?:\/\/(m\.)?vk\.(com|ru)/i.test(url.trim());
    if (isVk) { imp.phase = 'Открываю VK… Если появится окно VK — войди в свой аккаунт, дальше всё само'; rerender(); }
    const r = isVk ? await api.importVk(url.trim()) : await api.importList(url.trim());
    const found = (r.ready || []).slice();
    const missing = [];
    const items = r.items || [];
    imp.total = items.length;
    imp.phase = `Ищу треки «${r.name}»…`;
    rerender();
    for (let i = 0; i < items.length; i += 8) {
      const part = items.slice(i, i + 8);
      const res = await api.importMatch(part);
      res.forEach((t, k) => (t ? found.push(t) : missing.push(`${part[k].artist} — ${part[k].title}`)));
      imp.done = Math.min(items.length, i + 8);
      const bar = $('#impBar'); if (bar) { bar.style.width = (imp.done / imp.total) * 100 + '%'; $('#impCount').textContent = `${imp.done} из ${imp.total}`; }
    }
    // The same song can be matched twice (e.g. a version and its remaster) — keep one.
    const seen = new Set();
    const uniq = found.filter((t) => !seen.has(t.sid) && seen.add(t.sid));
    if (!uniq.length) throw new Error('ни один трек не нашёлся');
    const p = createPlaylist(r.name || 'Импорт', uniq);
    imp.result = { pid: p.id, name: p.name, found: uniq.length, missing };
    toast(`Плейлист «${p.name}» добавлен: ${tracksWord(uniq.length)}`, 'ok');
  } catch (e) { imp.error = String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); }
  imp.busy = false;
  rerender();
}
VIEWS.import = (el) => {
  const r = imp.result;
  el.innerHTML = `<div class="page"><h1 class="page-title">Импорт плейлиста</h1>
    <div class="panel import-hero">
      <h3>Перенеси музыку из другого сервиса</h3>
      <p>Вставь ссылку на открытый плейлист или альбом — Melodia найдёт каждый трек и соберёт из них свой плейлист. Слушать, лайкать и скачивать можно будет как обычно.</p>
      <div class="row"><input class="field big" id="impUrl" placeholder="https://open.spotify.com/playlist/…" value="${esc(imp.url)}" spellcheck="false" ${imp.busy ? 'disabled' : ''}>
        <button class="btn green" data-act="import" ${imp.busy ? 'disabled' : ''}>${icon('import')}Импортировать</button></div>
      <div class="plats">${IMPORT_PLATS.map(([c, n, s]) => `<span class="plat"><span class="plat-dot ${c}"></span><span>${n}</span><span>${s}</span></span>`).join('')}</div>
      ${imp.busy ? `<div style="margin-top:20px"><div class="row" style="justify-content:space-between"><span>${esc(imp.phase)}</span><span class="muted" id="impCount">${imp.total ? `${imp.done} из ${imp.total}` : ''}</span></div>
        <div class="progressbar ${imp.total ? '' : 'indet'}"><div id="impBar" style="width:${imp.total ? (imp.done / imp.total) * 100 : 35}%"></div></div></div>` : ''}
      ${imp.error ? `<p class="status bad" style="margin:16px 0 0">Не получилось: ${esc(imp.error)}</p>` : ''}
    </div>
    ${r ? `<div class="panel"><h3>Готово: «${esc(r.name)}»</h3>
      <p>Нашлось ${tracksWord(r.found)}${r.missing.length ? `, не нашлось ${r.missing.length}` : ' — все до одного'}.</p>
      <div class="row"><button class="btn green" data-act="openimported">${icon('play')}Открыть плейлист</button></div>
      ${r.missing.length ? `<details class="imp-miss"><summary>Что не нашлось (${r.missing.length})</summary>${r.missing.map((m) => `<div>${esc(m)}</div>`).join('')}</details>` : ''}</div>` : ''}
    <p class="hint">Ссылку берут в сервисе через «Поделиться» → «Скопировать ссылку». Закрытые (личные) плейлисты сервисы не отдают — сделай плейлист открытым.</p>
  </div>`;
  const inp = $('#impUrl');
  inp.onkeydown = (e) => { if (e.key === 'Enter') runImport(inp.value); };
  inp.oninput = () => { imp.url = inp.value; };
};

// ------------------------------------------------------------ lyrics
const lyr = { uid: null, data: null, lines: [], loading: false, error: '', active: -1, userScroll: 0 };
function parseLrc(s) {
  const out = [];
  for (const line of String(s).split(/\r?\n/)) {
    const tags = [...line.matchAll(/\[(\d+):(\d+(?:[.:]\d+)?)\]/g)];
    if (!tags.length) continue;
    const text = line.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of tags) out.push({ t: +m[1] * 60 + parseFloat(m[2].replace(':', '.')), text });
  }
  return out.sort((a, b) => a.t - b.t);
}
async function loadLyrics(t) {
  if (!t || (lyr.uid === t.uid && (lyr.data || lyr.loading))) return;
  Object.assign(lyr, { uid: t.uid, data: null, lines: [], loading: true, error: '', active: -1 });
  try {
    const d = await api.lyrics({ artist: t.artist, title: t.title, album: t.album, duration: t.duration });
    if (lyr.uid !== t.uid) return;
    lyr.data = d;
    lyr.lines = d.synced ? parseLrc(d.synced) : [];
  } catch (e) { if (lyr.uid === t.uid) lyr.error = e.message; }
  if (lyr.uid !== t.uid) return;
  lyr.loading = false;
  if (state.view.name === 'lyrics') render();
  if (state.view.name === 'nowplaying') fillNpLyrics();
}
function lyricsBodyHtml(t, compact) {
  const d = lyr.uid === t.uid ? lyr.data : null;
  if (lyr.loading || lyr.uid !== t.uid) return '<div class="spinner"></div>';
  if (lyr.lines.length) return lyr.lines.map((l, i) => `<p class="ly" data-ly="${i}">${l.text ? esc(l.text) : '♪'}</p>`).join('');
  if (d && d.plain) return `<div class="ly-plain">${esc(d.plain)}</div>`;
  if (d && d.instrumental) return `<div class="empty">${icon('note')}<h3>Это инструментал</h3><p>В треке нет слов.</p></div>`;
  return `<div class="empty ${compact ? 'small' : ''}">${icon('lyrics')}<h3>Текст не найден</h3><p>${lyr.error ? esc(lyr.error) : 'Для этого трека в базе текстов пока ничего нет.'}</p>${compact ? '<button class="btn ghost small" data-act="lyhide">Скрыть текст</button>' : ''}</div>`;
}
VIEWS.lyrics = (el) => {
  const t = player.current;
  if (!t) { delete el.dataset.uid; el.innerHTML = `<div class="page"><div class="empty">${icon('lyrics')}<h3>Сейчас ничего не играет</h3><p>Включи трек — и здесь появится его текст.</p></div></div>`; return; }
  el.dataset.uid = t.uid;
  loadLyrics(t);
  const d = lyr.uid === t.uid ? lyr.data : null;
  lyr.active = -1;
  el.innerHTML = `<div class="lyv">
    <div class="npv-bg" ${t.cover ? `style="background-image:url('${esc(t.cover)}')"` : ''}></div>
    <div class="lyv-head">${coverHtml(t)}<div class="tx"><div class="tt">${esc(t.title)}</div><div class="st">${esc(t.artist || '')}</div></div></div>
    <div class="lyv-body ${lyr.lines.length ? 'synced' : ''}">${lyricsBodyHtml(t)}</div>
    ${d && d.source ? `<p class="hint lyv-src">Текст: lrclib.net${d.edited ? ' · текст оригинала, время подогнано под эту версию' : ''}${lyr.lines.length ? ' · нажми на строку, чтобы перемотать' : ''}</p>` : ''}
  </div>`;
  syncLyrics(true);
};
// The lyrics panel of the now-playing screen is refilled in place, so the visualizer keeps running.
function npLyricsHead() {
  const sh = lyrShift();
  return `<span>Текст песни${lyr.lines.length ? ' · синхронный' : ''}</span>${lyr.lines.length ? `<div class="ly-shift"><button class="icon-btn" data-act="lyshift" data-d="-0.25" title="Текст раньше">−</button><span title="Сдвиг текста относительно музыки">${sh ? (sh > 0 ? '+' : '') + sh.toFixed(2) + ' с' : 'сдвиг'}</span><button class="icon-btn" data-act="lyshift" data-d="0.25" title="Текст позже">+</button></div>` : ''}<button class="icon-btn ly-hide" data-act="lyhide" title="Скрыть текст">${icon('close')}</button>`;
}
function fillNpLyrics() {
  const t = player.current, box = $('#lyBox'), head = $('#lyHead');
  if (!t || !box) return;
  head.innerHTML = npLyricsHead();
  box.classList.toggle('synced', lyr.lines.length > 0);
  box.innerHTML = lyricsBodyHtml(t, true);
  lyr.active = -1;
  syncLyrics(true);
}
// A slowed / sped-up edit plays the original lyrics at a different pace: stretch the timing to fit.
function lyrRatio() {
  const d = lyr.data;
  if (!d || !d.edited || !d.duration) return 1;
  const td = isFinite(audio.duration) && audio.duration ? audio.duration : (player.current && player.current.duration) || 0;
  const r = td / d.duration;
  return td && Math.abs(r - 1) > 0.02 && r > 0.5 && r < 2 ? r : 1;
}
// Manual offset per track (seconds): + shows lines later, − earlier.
const lyrShift = () => ((lib.lyricsShift || {})[(player.current || {}).sid] || 0);
const lyrTime = (i) => (lyr.lines[i].t + lyrShift()) * lyrRatio();
function syncLyrics(jump) {
  const v = state.view.name;
  if ((v !== 'lyrics' && v !== 'nowplaying') || !lyr.lines.length || lyr.uid !== (player.current || {}).uid) return;
  const scroller = v === 'lyrics' ? $('#view') : $('#lyBox');
  if (!scroller) return;
  const now = audio.currentTime + 0.3;
  let i = -1;
  for (let k = 0; k < lyr.lines.length && lyrTime(k) <= now; k++) i = k;
  if (i === lyr.active && !jump) return;
  lyr.active = i;
  $$('.ly').forEach((p, k) => { p.classList.toggle('on', k === i); p.classList.toggle('past', k < i); });
  const cur = $(`.ly[data-ly="${Math.max(0, i)}"]`);
  if (!cur || Date.now() - lyr.userScroll < 3000) return;
  const vr = scroller.getBoundingClientRect(), r = cur.getBoundingClientRect();
  scroller.scrollTo({ top: scroller.scrollTop + r.top - vr.top - scroller.clientHeight * (v === 'lyrics' ? 0.38 : 0.3), behavior: jump ? 'auto' : 'smooth' });
}
// ------------------------------------------------------------ beat-reactive wave over the cover (big player)
// Three translucent waves in the cover's colours rise with the bass; a kick makes the cover pulse.
const viz = { bins: null, smooth: new Float32Array(48), bass: 0, bassAvg: 0, beat: 0, t: 0, hueAt: 0, hue: 160, sat: 70 };
function vizBands() {
  const a = eq.analyser;
  const out = viz.smooth;
  if (!a || !player.playing) { for (let i = 0; i < out.length; i++) out[i] *= 0.94; viz.bass *= 0.94; return; }
  if (!viz.bins || viz.bins.length !== a.frequencyBinCount) viz.bins = new Uint8Array(a.frequencyBinCount);
  a.getByteFrequencyData(viz.bins);
  const n = viz.bins.length, nyq = eq.ctx.sampleRate / 2;
  const bin = (f) => Math.min(n - 1, Math.max(1, Math.round((f / nyq) * n)));
  // 48 log-spaced bands from 30 Hz to 14 kHz
  for (let i = 0; i < out.length; i++) {
    const lo = bin(30 * Math.pow(14000 / 30, i / out.length)), hi = Math.max(lo + 1, bin(30 * Math.pow(14000 / 30, (i + 1) / out.length)));
    let s = 0; for (let k = lo; k < hi; k++) s += viz.bins[k];
    const v = s / (hi - lo) / 255;
    out[i] += (v - out[i]) * (v > out[i] ? 0.5 : 0.12);
  }
  let b = 0; for (let k = bin(35); k <= bin(140); k++) b += viz.bins[k];
  b = b / (bin(140) - bin(35) + 1) / 255;
  viz.bass += (b - viz.bass) * 0.45;
  viz.bassAvg += (b - viz.bassAvg) * 0.02;
  if (b > viz.bassAvg * 1.25 && b > 0.45 && viz.beat < 0.4) viz.beat = 1; // kick
}
function drawViz() {
  const cv = $('#viz');
  if (!cv || state.view.name !== 'nowplaying' || lib.settings.viz === false) return;
  vizBands();
  viz.t += 1 / 60;
  viz.beat *= 0.9;
  const box = cv.parentElement;
  box.style.setProperty('--beat', viz.beat.toFixed(3));
  box.style.setProperty('--bass', viz.bass.toFixed(3));
  const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const x = cv.getContext('2d');
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.clearRect(0, 0, w, h);
  if (Date.now() - viz.hueAt > 500) { // follow the cover colour
    viz.hueAt = Date.now();
    const e = effectiveTheme(lib.settings.theme);
    viz.hue = coverHS && coverHS.hue != null ? coverHS.hue : e.hue;
    viz.sat = Math.max(35, Math.min(95, (coverHS ? coverHS.sat : e.sat) * 75));
  }
  const soft = cv.closest('.npx-stage') ? 0.5 : 1; // softer on the full-window screen, the cover shows through
  (VIZ_STYLES[lib.settings.vizStyle] || VIZ_STYLES.waves).draw(x, w, h, soft);
  x.shadowBlur = 0;
  x.globalCompositeOperation = 'source-over';
}

// ---------------------------------------------------------------- visualizer styles
const hsl = (dh, l, a) => `hsla(${viz.hue + dh}, ${viz.sat}%, ${l}%, ${a})`;
const VIZ_STYLES = {
  // Three translucent waves in the cover's colours rise from the bottom with the bass.
  waves: { name: 'Волны', draw(x, w, h, k) {
    const bands = viz.smooth, N = bands.length;
    const layers = [[0.62, 0.55 * k, 0, 1.0], [0.70, 0.42 * k, 22, 0.8], [0.78, 0.32 * k, -20, 0.6]];
    layers.forEach(([base, alpha, dh, amp], L) => {
      const y0 = h * base - viz.bass * h * 0.22 * amp;
      const pts = [];
      for (let i = 0; i <= 24; i++) {
        const f = i / 24;
        const band = bands[Math.min(N - 1, Math.floor(Math.pow(f, 1.4) * N))];
        const swell = Math.sin(f * Math.PI * (2 + L) + viz.t * (1.1 + L * 0.35)) * h * 0.025;
        pts.push([f * w, y0 - band * h * 0.28 * amp + swell]);
      }
      const g = x.createLinearGradient(0, y0 - h * 0.3, 0, h);
      g.addColorStop(0, hsl(dh, 68 - L * 6, alpha));
      g.addColorStop(1, hsl(dh, 34 - L * 4, alpha + 0.2));
      x.beginPath(); x.moveTo(0, h); x.lineTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) { const [px, py] = pts[i - 1], [cx, cy] = pts[i]; x.quadraticCurveTo(px, py, (px + cx) / 2, (py + cy) / 2); }
      x.lineTo(w, pts[pts.length - 1][1]); x.lineTo(w, h); x.closePath();
      x.fillStyle = g;
      x.shadowColor = hsl(dh, 70, 0.5 * (0.3 + viz.bass)); x.shadowBlur = 24;
      x.fill();
    });
  } },

  // Northern lights: soft curtains of light sway across the upper half and flare with the music.
  aurora: { name: 'Аврора', draw(x, w, h, k) {
    const bands = viz.smooth, N = bands.length;
    x.globalCompositeOperation = 'lighter';
    const curtains = [[0.26, 0, 1], [0.34, 40, 0.8], [0.22, -35, 0.65]];
    curtains.forEach(([base, dh, amp], c) => {
      const S = 60, top = [], bot = [];
      for (let i = 0; i <= S; i++) {
        const f = i / S;
        const sway = Math.sin(f * 5 + viz.t * (0.5 + c * 0.2) + c * 2) * 0.06 + Math.sin(f * 11 - viz.t * 0.8 + c) * 0.025;
        const fb = (0.15 + 0.7 * Math.abs(Math.sin(f * Math.PI * 2 + c))) * (N - 1), i0 = Math.floor(fb);
        const band = bands[i0] + (bands[Math.min(N - 1, i0 + 1)] - bands[i0]) * (fb - i0);
        const y = h * (base + sway);
        top.push([f * w, y]);
        bot.push([f * w, y + h * (0.5 + band * 0.25 * amp)]);
      }
      const g = x.createLinearGradient(0, h * (base - 0.08), 0, h * (base + 0.62));
      g.addColorStop(0, hsl(dh, 75, 0));
      g.addColorStop(0.16, hsl(dh, 72, (0.12 + viz.bass * 0.3 + viz.beat * 0.1) * k * 1.6));
      g.addColorStop(0.55, hsl(dh + 30, 60, (0.08 + viz.bass * 0.1) * k * 1.6));
      g.addColorStop(1, hsl(dh + 40, 55, 0));
      x.beginPath();
      top.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py)));
      for (let i = bot.length - 1; i >= 0; i--) x.lineTo(bot[i][0], bot[i][1]);
      x.closePath();
      x.fillStyle = g; x.shadowColor = hsl(dh, 70, 0.6); x.shadowBlur = 30;
      x.fill();
    });
  } },

  // Fireflies: soft lights drift upwards, faster and brighter on the bass.
  fireflies: { name: 'Светлячки', draw(x, w, h, k) {
    const P = viz.flies || (viz.flies = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), r: 1 + Math.random() * 3, v: 0.0006 + Math.random() * 0.0016, p: Math.random() * 6.28, dh: (Math.random() - 0.5) * 60 })));
    x.globalCompositeOperation = 'lighter';
    for (const f of P) {
      f.y -= f.v * (1 + viz.bass * 4);
      f.x += Math.sin(viz.t * 0.7 + f.p) * 0.0006;
      if (f.y < -0.05) { f.y = 1.05; f.x = Math.random(); }
      const tw = 0.5 + 0.5 * Math.sin(viz.t * 2 + f.p);
      const r = f.r * (1 + viz.bass * 1.6 + viz.beat * 0.8) * Math.min(w, h) / 300;
      const cx = f.x * w, cy = f.y * h;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r * 5);
      g.addColorStop(0, hsl(f.dh, 85, (0.35 + tw * 0.45) * k * 1.6));
      g.addColorStop(0.35, hsl(f.dh, 70, (0.12 + tw * 0.15) * k * 1.6));
      g.addColorStop(1, hsl(f.dh, 60, 0));
      x.fillStyle = g;
      x.beginPath(); x.arc(cx, cy, r * 5, 0, Math.PI * 2); x.fill();
    }
  } },

  // Ripples: every kick sends a ring across the stage, like a drop falling into water.
  ripples: { name: 'Круги на воде', draw(x, w, h, k) {
    const R = viz.rings || (viz.rings = []);
    const now = viz.t;
    if (viz.beat > 0.95 || (player.playing && now - (viz.lastRing || 0) > 1.6)) { R.push({ t: now, s: 0.6 + viz.bass }); viz.lastRing = now; }
    const cx = w / 2, cy = h * 0.46, maxR = Math.hypot(w, h) * 0.6;
    const glow = x.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * (0.12 + viz.bass * 0.12));
    glow.addColorStop(0, hsl(0, 80, 0.45 * k * 1.6)); glow.addColorStop(1, hsl(0, 60, 0));
    x.fillStyle = glow; x.fillRect(0, 0, w, h);
    for (let i = R.length - 1; i >= 0; i--) {
      const age = now - R[i].t, r = age * maxR * 0.28;
      if (r > maxR) { R.splice(i, 1); continue; }
      const a = Math.max(0, 1 - r / maxR) * R[i].s;
      x.strokeStyle = hsl((i % 3) * 18, 75, 0.55 * a * k * 1.6);
      x.lineWidth = 1.5 + 3 * a;
      x.beginPath(); x.ellipse(cx, cy, r, r * 0.55, 0, 0, Math.PI * 2); x.stroke();
    }
  } },

  // Horizon: a mountain line drawn by the spectrum with its reflection in still water.
  horizon: { name: 'Горизонт', draw(x, w, h, k) {
    const bands = viz.smooth, N = bands.length;
    const base = h * 0.6, S = 48, pts = [];
    for (let i = 0; i <= S; i++) {
      const f = i / S, d = Math.abs(f - 0.5) * 2;
      const band = bands[Math.min(N - 1, Math.floor(Math.pow(d, 1.2) * N * 0.9))];
      const env = 0.35 + 0.65 * Math.pow(Math.sin(Math.PI * f), 0.6);
      pts.push([f * w, base - (band * 0.32 + viz.bass * 0.05 + Math.sin(f * 9 + viz.t * 0.4) * 0.012) * h * env]);
    }
    const shape = (flip) => {
      x.beginPath(); x.moveTo(0, base);
      for (let i = 0; i < pts.length; i++) { const [px, py] = pts[i]; x.lineTo(px, flip ? 2 * base - py : py); }
      x.lineTo(w, base); x.closePath();
    };
    let g = x.createLinearGradient(0, base - h * 0.35, 0, base);
    g.addColorStop(0, hsl(0, 70, 0.75 * k)); g.addColorStop(1, hsl(25, 40, 0.35 * k));
    shape(false); x.fillStyle = g; x.shadowColor = hsl(0, 70, 0.5); x.shadowBlur = 18 + viz.bass * 20; x.fill();
    x.shadowBlur = 0;
    g = x.createLinearGradient(0, base, 0, base + h * 0.3);
    g.addColorStop(0, hsl(0, 60, 0.35 * k)); g.addColorStop(1, hsl(0, 50, 0));
    shape(true); x.fillStyle = g; x.fill();
    x.strokeStyle = hsl(0, 88, 0.7 * k + viz.beat * 0.2); x.lineWidth = 1.2 + viz.beat;
    x.beginPath(); x.moveTo(w * 0.05, base); x.lineTo(w * 0.95, base); x.stroke();
  } },
};
function lyricsLoop() { syncLyrics(false); drawViz(); requestAnimationFrame(lyricsLoop); }
function updateFxBadge() { const f = lib.settings.fx; $('#eqBtn').classList.toggle('on', f.speed !== 1 || f.reverb > 0); }
$('#view').addEventListener('wheel', (e) => { if (state.view.name === 'lyrics' || e.target.closest('#lyBox')) lyr.userScroll = Date.now(); }, { passive: true });

// ------------------------------------------------------------ waveform seek bar
// The track is decoded once in the background and its loudness drawn as bars in the progress bar.
const wf = { sid: null, peaks: null };
async function loadWaveform(t) {
  if (!t || wf.sid === t.sid) return;
  wf.sid = t.sid; wf.peaks = null;
  $('#seek').classList.remove('has-wf');
  try {
    const url = isWeb(t) ? (await api.webUrl(t.sid)).url : await api.fileUrl(t.sid);
    const r = await fetch(url);
    if (!r.ok || +(r.headers.get('content-length') || 0) > 40e6) return;
    const buf = await r.arrayBuffer();
    if (wf.sid !== t.sid) return;
    const ab = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(buf);
    if (wf.sid !== t.sid) return;
    const ch = ab.getChannelData(0), N = 220, step = Math.floor(ch.length / N);
    const peaks = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let s = 0; for (let k = i * step, e = k + step; k < e; k += 8) s += ch[k] * ch[k];
      peaks[i] = Math.sqrt(s / (step / 8));
    }
    const mx = Math.max(...peaks) || 1;
    for (let i = 0; i < N; i++) peaks[i] = Math.pow(peaks[i] / mx, 0.8);
    wf.peaks = peaks;
    $('#seek').classList.add('has-wf');
    drawProgress();
  } catch { /* plain bar stays */ }
}
function drawWaveform(p) {
  const cv = $('#seek .wf');
  if (!cv || !wf.peaks) return;
  const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if (!w) return;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const x = cv.getContext('2d');
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.clearRect(0, 0, w, h);
  const bw = 2.5, gap = 1.6, n = Math.floor(w / (bw + gap));
  const acc = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#a6ecce';
  for (let i = 0; i < n; i++) {
    const v = wf.peaks[Math.floor((i / n) * wf.peaks.length)];
    const bh = Math.max(2, v * (h - 2));
    x.fillStyle = (i + 0.5) / n <= p ? acc : 'rgba(255,255,255,.28)';
    x.beginPath();
    x.roundRect(i * (bw + gap), (h - bh) / 2, bw, bh, 1.2);
    x.fill();
  }
}

// ============================================================ queue & player
const queue = {
  tracks: [], order: [], pos: 0, ctx: null, manual: [],
  set(tracks, start, ctx) {
    this.tracks = tracks.slice();
    this.ctx = ctx;
    this.order = this.tracks.map((_, i) => i);
    if (lib.settings.shuffle) this.shuffle(start); else this.pos = start;
  },
  shuffle(keepIndex) {
    const rest = this.order.filter((i) => i !== keepIndex);
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    this.order = keepIndex == null ? rest : [keepIndex, ...rest];
    this.pos = 0;
  },
  unshuffle() {
    const cur = this.order[this.pos];
    this.order = this.tracks.map((_, i) => i);
    this.pos = cur == null ? 0 : cur;
  },
  append(tracks) {
    const base = this.tracks.length;
    this.tracks.push(...tracks);
    this.order.push(...tracks.map((_, i) => base + i));
  },
  current() { return this.tracks[this.order[this.pos]]; },
  upcoming(n) { const out = []; for (let k = this.pos + 1; k < this.order.length && out.length < n; k++) out.push(this.tracks[this.order[k]]); return out; },
};

const audio = new Audio();
audio.preload = 'auto';
audio.setAttribute('playsinline', '');
const eq = new Equalizer(audio);
function needAudioGraph() {
  const q = lib.settings.eq, fx = lib.settings.fx;
  return (q.enabled && (q.preamp !== 0 || q.gains.some((g) => g !== 0))) || fx.reverb > 0;
}
// Turning on EQ or reverb mid-song attaches the graph right away.
function ensureGraph() { if (!eq.ctx && player.current && needAudioGraph()) { eq.init(); eq.resume(); } }
{
  const apply = eq.apply.bind(eq), effects = eq.effects.bind(eq);
  eq.apply = (cfg) => { apply(cfg); ensureGraph(); };
  eq.effects = (fx) => { effects(fx); ensureGraph(); };
}

const player = {
  current: null, playing: false, loading: false, token: 0, errors: 0,

  async load(track) {
    const token = ++this.token;
    document.body.classList.remove('player-closed');
    this.current = track;
    this.loading = true;
    updateNowPlaying(); markPlaying(); renderSidebar();
    try {
      // iOS stops music on a locked screen once Web Audio is attached: only build it when it changes the sound.
      if (needAudioGraph()) { eq.init(); eq.resume(); }
      let url;
      if (isWeb(track)) {
        const w = await api.webUrl(track.sid);
        url = w.url;
        if (!track.duration && w.duration) track.duration = w.duration;
      } else url = await api.fileUrl(track.sid);
      if (token !== this.token) return;
      audio.src = url;
      await audio.play();
      this.errors = 0;
      pushRecent(track);
      const nxt = queue.manual[0] || queue.upcoming(1)[0];
      // The next track is downloaded in full while this one plays, so the switch has no pause.
      if (isWeb(nxt)) api.webPreload(nxt.sid).catch(() => {});
      if (queue.ctx === 'wave' && queue.order.length - queue.pos <= 5) waveExtend();
      loadLyrics(track);
    } catch (e) {
      if (token !== this.token || e.name === 'AbortError') return;
      this.fail(track, e);
    } finally {
      if (token === this.token) { this.loading = false; updatePlayButton(); }
    }
  },
  fail(track, e) {
    this.loading = false;
    updatePlayButton();
    const msg = String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
    toast(`«${track.title}» не играет: ${msg}`, 'err');
    if (++this.errors < 5) setTimeout(() => { if (this.current === track) this.next(true); }, 1200);
    else { this.errors = 0; toast(isWeb(track) ? 'Несколько треков подряд не открываются — проверь интернет' : 'Несколько файлов подряд не открываются — проверь папку с музыкой', 'err'); }
  },
  playIndex() { const t = queue.current(); if (t) this.load(t); },
  // Stops the music and hides the player bar until something is played again.
  close() {
    this.token++;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    Object.assign(this, { current: null, playing: false, loading: false });
    queue.manual = [];
    document.body.classList.add('player-closed');
    $('#ambient').classList.remove('on');
    document.title = 'Melodia';
    if ('mediaSession' in navigator) { navigator.mediaSession.metadata = null; navigator.mediaSession.playbackState = 'none'; }
    updatePlayButton(); updateNowPlaying(); markPlaying(); renderSidebar();
    if (state.view.name === 'queue') render();
  },
  toggle() {
    if (!this.current) { playCtx(lib.recentLists.find(ctxExists) || 'all'); return; }
    if (!audio.getAttribute('src') && !this.loading) return this.load(this.current);
    eq.resume();
    if (audio.paused) audio.play().catch(() => {}); else audio.pause();
  },
  next(auto = false) {
    if (queue.manual.length) { const t = queue.manual.shift(); return this.load(t); }
    if (auto && lib.settings.repeat === 'one') { audio.currentTime = 0; return audio.play(); }
    if (queue.pos + 1 < queue.order.length) queue.pos++;
    else if (lib.settings.repeat === 'all' || !auto) { if (!queue.order.length) return; queue.pos = 0; if (lib.settings.shuffle) queue.shuffle(); }
    else { audio.pause(); return; }
    this.playIndex();
  },
  prev() {
    if (audio.currentTime > 3 || queue.pos === 0) { audio.currentTime = 0; return; }
    queue.pos--; this.playIndex();
  },
};

const refreshWaveHero = () => {
  if (state.view.name === 'wave') { const sc = $('#view').scrollTop; render(); $('#view').scrollTop = sc; }
  const st = $('#npxState');
  if (st) st.textContent = st.textContent.replace(/^(Сейчас играет|На паузе)/, player.playing ? 'Сейчас играет' : 'На паузе');
};
audio.addEventListener('play', () => { player.playing = true; updatePlayButton(); markPlaying(); renderSidebar(); refreshWaveHero(); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; });
audio.addEventListener('pause', () => { player.playing = false; updatePlayButton(); markPlaying(); renderSidebar(); refreshWaveHero(); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; });
audio.addEventListener('ended', () => { if (queue.ctx === 'wave' && player.current) wave.good.push(player.current); player.next(true); });
audio.addEventListener('waiting', () => { player.loading = true; updatePlayButton(); });
audio.addEventListener('playing', () => { player.loading = false; updatePlayButton(); });
audio.addEventListener('error', () => {
  if (!audio.getAttribute('src') || !player.current) return;
  const t = player.current;
  // A file that stops in the middle was not fully downloaded: say so and how to fix it.
  const cut = !isWeb(t) && audio.currentTime > 3 && t.duration && audio.currentTime < t.duration - 5;
  player.fail(t, new Error(cut ? `файл обрывается — в нём только ${fmt(audio.currentTime)} из ${fmt(t.duration)}` : 'iPhone не умеет играть этот формат или файл повреждён'));
});

// Replaces a broken local file: finds the song online, downloads it into «Любимые», moves likes and
// playlist entries over to the new file and puts the old one into the Recycle Bin.
// ------------------------------------------------------------ music from the phone (Files app)
let importing = false, importTarget = null;
function pickFiles(playlist) {
  importTarget = playlist || null;
  const inp = $('#fileInput');
  inp.value = '';
  inp.click();
}
$('#fileInput').addEventListener('change', (e) => { const files = [...e.target.files]; if (files.length) importFiles(files, importTarget); importTarget = null; });
function showProgress() {
  const el = document.createElement('div');
  el.className = 'toast progress';
  $('#toasts').appendChild(el);
  return (i, total, name) => {
    if (i >= total) { el.remove(); return; }
    el.innerHTML = `<div>Добавляю ${i + 1} из ${total}</div><div class="pname">${esc(name || '')}</div><div class="pbar"><div style="width:${(i / total) * 100}%"></div></div>`;
  };
}
async function importFiles(files, playlist) {
  if (importing) return toast('Подожди, предыдущие файлы ещё добавляются');
  importing = true;
  try {
    const known = new Set(allTracks.map((t) => `${t.name}|${t.size}`));
    const r = await api.addFiles(files, known, showProgress());
    if (r.notAudio) { toast('Это не аудиофайлы'); return; }
    await rescan(true);
    if (playlist && r.added.length) addToPlaylist(playlist, r.added.map((t) => byPath.get(t.sid) || t));
    const parts = [r.added.length ? `Добавлено ${tracksWord(r.added.length)}` : 'Новых треков нет'];
    if (r.skipped) parts.push(`${r.skipped} уже были`);
    if (r.failed) parts.push(`${r.failed} не удалось прочитать`);
    toast(parts.join(' · '), r.added.length ? 'ok' : '');
    if (r.full) toast('На телефоне закончилось место для музыки', 'err');
  } catch (e) { toast('Не удалось добавить: ' + e.message, 'err'); } finally { importing = false; }
}
async function deleteTrack(t) {
  if (!await confirm2('Удалить трек с телефона?', `«${t.title}» пропадёт из Melodia, из любимых и всех плейлистов.`)) return;
  if (player.current && player.current.sid === t.sid) player.close();
  await api.trash(t.sid).catch(() => {});
  lib.liked = lib.liked.filter((p) => p !== t.sid);
  lib.recent = lib.recent.filter((p) => p !== t.sid);
  for (const p of lib.playlists) p.paths = p.paths.filter((x) => x !== t.sid);
  save();
  await rescan(true);
  toast('Трек удалён');
}
audio.addEventListener('loadedmetadata', () => {
  const t = player.current;
  if (t && !t.duration && isFinite(audio.duration)) { t.duration = Math.round(audio.duration); if (!isWeb(t)) api.setDuration(t.sid, t.duration).catch(() => {}); }
});

// ------------------------------------------------------------ player bar UI
function updatePlayButton() {
  const b = $('#playBtn');
  b.innerHTML = icon(player.playing ? 'pause' : 'play');
  b.title = player.playing ? 'Пауза' : 'Играть';
  b.classList.toggle('loading', player.loading && !!player.current);
  const big = $('#bigPlay');
  if (big) { big.innerHTML = icon(player.playing ? 'pause' : 'play'); big.classList.toggle('loading', player.loading && !!player.current); }
}
function updateNowPlaying() {
  const t = player.current;
  $('.np').classList.toggle('idle', !t);
  // The big player follows the current track.
  if ((state.view.name === 'nowplaying' || state.view.name === 'lyrics') && ($('#view').dataset.uid || '') !== (t ? t.uid : '')) { render(); $('#view').scrollTop = 0; }
  if (state.view.name === 'wave' && $('#view').dataset.waveUid !== (t ? t.uid : '')) { $('#view').dataset.waveUid = t ? t.uid : ''; const sc = $('#view').scrollTop; render(); $('#view').scrollTop = sc; }
  followCover(t);
  if (!t) return;
  const bl = $('#bigLike');
  if (bl) { const on = isLiked(t); bl.classList.toggle('on', on); bl.innerHTML = icon(on ? 'heartFill' : 'heart'); }
  $('#npTitle').textContent = t.title;
  $('#npArtist').textContent = t.artist || 'Неизвестный исполнитель';
  const cv = $('#npCover');
  cv.style.backgroundImage = t.cover ? `url('${t.cover}')` : '';
  cv.innerHTML = t.cover ? '' : icon('note');
  const amb = $('#ambient');
  if (t.cover) { amb.style.backgroundImage = `url('${t.cover}')`; amb.classList.add('on'); } else amb.classList.remove('on');
  $('#npBackdrop').style.backgroundImage = t.cover ? `url('${t.cover}')` : '';
  loadWaveform(t);
  const liked = isLiked(t);
  const lb = $('#npLike');
  lb.classList.toggle('on', liked);
  lb.innerHTML = icon(liked ? 'heartFill' : 'heart');
  lb.title = liked ? 'Удалить из любимых' : 'Добавить в любимые';
  document.title = `${t.title} · ${t.artist}`;
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist || 'Неизвестный исполнитель', album: t.album || '',
      artwork: t.cover ? [{ src: t.cover, sizes: '512x512' }] : [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }] });
  }
}
function updateModeButtons() {
  const s = lib.settings;
  $('#shuffleBtn').classList.toggle('on', s.shuffle);
  $('#repeatBtn').classList.toggle('on', s.repeat !== 'off');
  $('#repeatBtn').innerHTML = icon(s.repeat === 'one' ? 'repeatOne' : 'repeat');
  $('#repeatBtn').title = { off: 'Повтор', all: 'Повторять всё', one: 'Повторять трек' }[s.repeat];
  $('#shuffleBtn').title = s.shuffle ? 'Не перемешивать' : 'Перемешать';
  const bs = $('#bigShuffle'), br = $('#bigRepeat');
  if (bs) bs.classList.toggle('on', s.shuffle);
  if (br) { br.classList.toggle('on', s.repeat !== 'off'); br.innerHTML = icon(s.repeat === 'one' ? 'repeatOne' : 'repeat'); }
}
function updateVolumeUI() {
  const s = lib.settings;
  const v = s.muted ? 0 : s.volume;
  audio.volume = v * v; // perceptual curve
  $('#volume .fill').style.width = v * 100 + '%';
  $('#volume .knob').style.left = v * 100 + '%';
  $('#muteBtn').innerHTML = icon(v === 0 ? 'mute' : v < 0.5 ? 'volumeLow' : 'volume');
}

function makeSlider(el, onChange, onEnd) {
  const pick = (e) => { const r = el.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); };
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId); el.classList.add('drag'); onChange(pick(e));
    el.onpointermove = (ev) => onChange(pick(ev));
  });
  el.addEventListener('pointerup', (e) => { el.classList.remove('drag'); el.onpointermove = null; if (onEnd) onEnd(pick(e)); });
}
let seeking = null;
makeSlider($('#seek'), (p) => { seeking = p; drawProgress(); }, (p) => { if (isFinite(audio.duration)) audio.currentTime = p * audio.duration; seeking = null; });
makeSlider($('#volume'), (p) => { lib.settings.volume = p; lib.settings.muted = false; updateVolumeUI(); save(); });
$('#volume').addEventListener('wheel', (e) => { lib.settings.volume = Math.max(0, Math.min(1, lib.settings.volume - Math.sign(e.deltaY) * 0.05)); lib.settings.muted = false; updateVolumeUI(); save(); }, { passive: true });

function drawProgress() {
  const d = isFinite(audio.duration) ? audio.duration : (player.current && player.current.duration) || 0;
  const p = seeking != null ? seeking : d ? audio.currentTime / d : 0;
  $('#seek .fill').style.width = p * 100 + '%';
  $('#seek .knob').style.left = p * 100 + '%';
  let buf = 0;
  if (audio.buffered.length && d) buf = audio.buffered.end(audio.buffered.length - 1) / d;
  $('#seek .buf').style.width = Math.min(1, buf) * 100 + '%';
  drawWaveform(p);
  $('#curTime').textContent = fmt(seeking != null ? seeking * d : audio.currentTime);
  $('#durTime').textContent = fmt(d);
  const big = $('#bigSeek');
  if (big) {
    big.querySelector('.fill').style.width = p * 100 + '%';
    big.querySelector('.knob').style.left = p * 100 + '%';
    big.querySelector('.buf').style.width = Math.min(1, buf) * 100 + '%';
    $('#bigCur').textContent = $('#curTime').textContent;
    $('#bigDur').textContent = $('#durTime').textContent;
  }
}
audio.addEventListener('timeupdate', drawProgress);
audio.addEventListener('durationchange', drawProgress);

$('#playBtn').onclick = () => player.toggle();
$('#nextBtn').onclick = () => player.next();
$('#prevBtn').onclick = () => player.prev();
$('#shuffleBtn').onclick = () => {
  lib.settings.shuffle = !lib.settings.shuffle;
  if (lib.settings.shuffle) queue.shuffle(queue.order[queue.pos]); else queue.unshuffle();
  updateModeButtons(); save();
  if (state.view.name === 'queue') render();
};
$('#repeatBtn').onclick = () => { const s = lib.settings; s.repeat = { off: 'all', all: 'one', one: 'off' }[s.repeat]; updateModeButtons(); save(); };
$('#muteBtn').onclick = () => { lib.settings.muted = !lib.settings.muted; if (!lib.settings.muted && lib.settings.volume === 0) lib.settings.volume = 0.5; updateVolumeUI(); save(); };
$('#npLike').onclick = () => toggleLike(player.current);
$('#closePlayerBtn').onclick = () => player.close();
$('#eqBtn').onclick = () => go('eq');
$('#lyricsBtn').onclick = () => (state.view.name === 'lyrics' ? $('#backBtn').click() : go('lyrics'));
$('#sideBtn').onclick = () => {
  lib.settings.sideCollapsed = !lib.settings.sideCollapsed; save();
  document.body.classList.toggle('side-collapsed', lib.settings.sideCollapsed);
  $('#sideBtn').title = lib.settings.sideCollapsed ? 'Показать панель' : 'Свернуть панель';
};
$('#queueBtn').onclick = () => (state.view.name === 'queue' ? $('#backBtn').click() : go('queue'));
$('#npCover').onclick = () => (state.view.name === 'nowplaying' ? $('#backBtn').click() : go('nowplaying'));
$('#npTitle').onclick = () => { if (state.view.name !== 'nowplaying') go('nowplaying'); };

if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  const set = (a, fn) => { try { ms.setActionHandler(a, fn); } catch { /* unsupported action */ } };
  set('play', () => player.toggle());
  set('pause', () => player.toggle());
  set('nexttrack', () => player.next());
  set('previoustrack', () => player.prev());
  set('seekto', (d) => { if (d.seekTime != null) audio.currentTime = d.seekTime; });
  // iOS shows ±15 s instead of previous/next on the lock screen whenever seek handlers exist.
  set('seekbackward', null);
  set('seekforward', null);
  let posAt = 0;
  audio.addEventListener('timeupdate', () => {
    if (!ms.setPositionState || Date.now() - posAt < 5000 || !isFinite(audio.duration)) return;
    posAt = Date.now();
    try { ms.setPositionState({ duration: audio.duration, position: Math.min(audio.duration, audio.currentTime), playbackRate: audio.playbackRate || 1 }); } catch { /* not supported */ }
  });
  audio.addEventListener('loadedmetadata', () => { posAt = 0; });
}

// ============================================================ context menu & dialogs
function closeMenu() { $('#ctxMenu').classList.add('hidden'); }
function openMenu(x, y, html, bind) {
  const m = $('#ctxMenu');
  m.innerHTML = html;
  m.classList.remove('hidden');
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px';
  m.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
  m.onclick = (e) => { const b = e.target.closest('button[data-m]'); if (!b) return; e.stopPropagation(); closeMenu(); bind(b.dataset.m, b.dataset.v); };
}
document.addEventListener('click', (e) => { if (!e.target.closest('#ctxMenu')) closeMenu(); }, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeMenu(); closeModal(); } });

function trackMenu(x, y, t, ctx) {
  const base = ctx.replace(/#f$/, '');
  const pl = base.startsWith('pl:') ? getPlaylist(base.slice(3)) : null;
  const liked = isLiked(t);
  const html = `<div class="menu-title">${esc(t.artist)} — ${esc(t.title)}</div>
    <button data-m="playnext">${icon('playNext')}Играть следующим</button>
    <button data-m="enqueue">${icon('queue')}Добавить в очередь</button>
    <hr>
    <button data-m="like">${icon(liked ? 'heartFill' : 'heart')}${liked ? 'Удалить из любимых' : 'Добавить в любимые'}</button>
    <div class="menu-title">Добавить в плейлист</div>
    <div class="sub-list"><button data-m="newpl">${icon('add')}Новый плейлист</button>${lib.playlists.map((p) => `<button data-m="addto" data-v="${p.id}">${icon('note')}${esc(p.name)}</button>`).join('')}</div>
    <hr>
    ${isWeb(t) ? `<button data-m="download">${icon('download')}Скачать в «Любимые»</button><button data-m="openweb">${icon('import')}Открыть на ${esc(t.site || 'сайте')}</button>`
    : `<button data-m="deletefile" class="danger">${icon('trash')}Удалить с телефона</button>`}
    ${pl ? `<hr><button data-m="remove" class="danger">${icon('trash')}Убрать из плейлиста</button>` : ''}
    ${base === 'recent' ? `<hr><button data-m="unrecent" class="danger">${icon('trash')}Удалить из истории</button>` : ''}`;
  openMenu(x, y, html, async (m, v) => {
    if (m === 'playnext') { queue.manual.unshift(t); toast('Сыграет следующим'); if (!player.current) player.next(); else if (state.view.name === 'nowplaying') render(); }
    else if (m === 'enqueue') { queue.manual.push(t); toast('Добавлено в очередь'); if (!player.current) player.next(); else if (state.view.name === 'nowplaying') render(); }
    else if (m === 'like') toggleLike(t);
    else if (m === 'addto') addToPlaylist(getPlaylist(v), [t]);
    else if (m === 'newpl') { const n = await prompt2('Новый плейлист', `Мой плейлист № ${lib.playlists.length + 1}`, 'Создать'); if (n) { const p = createPlaylist(n, [t]); toast(`Создан «${p.name}»`, 'ok'); } }
    else if (m === 'deletefile') deleteTrack(t);
    else if (m === 'download') downloadTrack(t);
    else if (m === 'openweb') api.openExternal(t.page || t.sid);
    else if (m === 'unrecent') { lib.recent = lib.recent.filter((p) => p !== t.sid); save(); render(); }
    else if (m === 'remove' && pl) { pl.paths = pl.paths.filter((p) => p !== t.sid); save(); render(); toast('Убрано из плейлиста'); }
  });
}

function closeModal() { $('#modal').classList.add('hidden'); $('#modal').innerHTML = ''; }
function prompt2(title, value, okText = 'Сохранить') {
  return new Promise((resolve) => {
    const m = $('#modal');
    m.innerHTML = `<div class="dialog"><h3>${esc(title)}</h3><input class="field" id="dlgInput" value="${esc(value || '')}"><div class="btns"><button class="btn ghost" id="dlgCancel">Отмена</button><button class="btn" id="dlgOk">${esc(okText)}</button></div></div>`;
    m.classList.remove('hidden');
    const inp = $('#dlgInput'); inp.focus(); inp.select();
    const done = (v) => { closeModal(); resolve(v); };
    $('#dlgOk').onclick = () => done(inp.value.trim());
    $('#dlgCancel').onclick = () => done(null);
    inp.onkeydown = (e) => { if (e.key === 'Enter') done(inp.value.trim()); };
    m.onclick = (e) => { if (e.target === m) done(null); };
  });
}
function confirm2(title, text, okText = 'Удалить') {
  return new Promise((resolve) => {
    const m = $('#modal');
    m.innerHTML = `<div class="dialog"><h3>${esc(title)}</h3><p class="muted">${esc(text)}</p><div class="btns"><button class="btn ghost" id="dlgCancel">Отмена</button><button class="btn green" id="dlgOk">${esc(okText)}</button></div></div>`;
    m.classList.remove('hidden');
    $('#dlgOk').onclick = () => { closeModal(); resolve(true); };
    $('#dlgCancel').onclick = () => { closeModal(); resolve(false); };
  });
}
async function renamePlaylist(p) { const n = await prompt2('Переименовать плейлист', p.name); if (n) { p.name = n; save(); render(); } }
async function deletePlaylist(p) {
  if (!await confirm2('Удалить плейлист?', `«${p.name}» пропадёт из медиатеки. Сами файлы останутся на месте.`)) return false;
  lib.playlists = lib.playlists.filter((x) => x !== p);
  save();
  return true;
}

// ============================================================ global event delegation
document.addEventListener('click', async (e) => {
  const t = e.target;
  const winBtn = t.closest('[data-win]'); if (winBtn) return api.win(winBtn.dataset.win);
  const lyLine = t.closest('.ly[data-ly]');
  if (lyLine && lyr.lines[+lyLine.dataset.ly]) { audio.currentTime = Math.max(0, lyrTime(+lyLine.dataset.ly)); lyr.userScroll = 0; if (audio.paused) player.toggle(); return; }
  const goEl = t.closest('[data-go]'); if (goEl) return go(goEl.dataset.go);

  const big = t.closest('[data-big]');
  if (big) {
    const cur = player.current;
    const acts = {
      play: () => player.toggle(), prev: () => player.prev(), next: () => player.next(),
      shuffle: () => $('#shuffleBtn').click(), repeat: () => $('#repeatBtn').click(),
      like: () => toggleLike(cur), folder: () => api.showFile(cur.sid), lyrics: () => go('lyrics'),
      viz: () => {
        const r = big.getBoundingClientRect(), cur = lib.settings.viz === false ? 'off' : (lib.settings.vizStyle || 'waves');
        openMenu(r.left, r.top - 8, `<div class="menu-title">Стиль визуализации</div>${Object.entries(VIZ_STYLES).map(([id, s]) => `<button data-m="${id}">${icon(cur === id ? 'check' : 'wave')}${s.name}</button>`).join('')}<hr><button data-m="off">${icon(cur === 'off' ? 'check' : 'close')}Выключить</button>`, (m) => {
          lib.settings.viz = m !== 'off';
          if (m !== 'off') lib.settings.vizStyle = m;
          viz.flies = null; viz.rings = null;
          save();
          const st = $('.npx-stage'); if (st) st.classList.toggle('viz-off', !lib.settings.viz);
          big.classList.toggle('on', lib.settings.viz);
        });
        const menu = $('#ctxMenu'); menu.style.top = Math.max(8, r.top - menu.offsetHeight - 8) + 'px';
      },
      dl: async () => { await downloadTrack(cur); if (state.view.name === 'nowplaying') render(); },
      artist: () => { if (!cur || !cur.artist) return; $('#searchInput').value = cur.artist; $('#searchClear').classList.remove('hidden'); search.q = cur.artist; go('search'); },
      more: () => { if (cur) trackMenu(0, 0, cur, 'nowplaying'); },
    };
    if (acts[big.dataset.big]) acts[big.dataset.big]();
    return;
  }

  const playCtxBtn = t.closest('[data-playctx]');
  if (playCtxBtn) { e.stopPropagation(); return playCtx(playCtxBtn.dataset.playctx, -1); }

  const open = t.closest('[data-open]');
  if (open && !t.closest('[data-act]')) return openCtx(open.dataset.open);

  const row = t.closest('[data-ctx][data-i]');
  const act = t.closest('[data-act]');
  if (row && act) {
    const ctx = row.dataset.ctx, i = +row.dataset.i;
    const track = (lists[ctx] || [])[i];
    if (!track) return;
    const a = act.dataset.act;
    if (a === 'play' || a === 'playcard') return playFromRow(ctx, i);
    if (a === 'like') return toggleLike(track);
    if (a === 'download') return downloadTrack(track);
    if (a === 'more') { const r = act.getBoundingClientRect(); return trackMenu(r.left - 200, r.bottom + 4, track, ctx); }
  }
  // A tap on a row plays it (the desktop needs a double click).
  if (row && row.classList.contains('tr') && !t.closest('button')) return playFromRow(row.dataset.ctx, +row.dataset.i);

  const tab = t.closest('[data-tab]');
  if (tab) {
    const id = tab.dataset.tab;
    if (id === 'search') { if (state.view.name !== 'search') go('search'); setTimeout(() => $('#searchInput').focus(), 50); return; }
    if (state.view.name === id) { $('#view').scrollTo({ top: 0, behavior: 'smooth' }); return; }
    return go(id);
  }

  const more = t.closest('[data-more]');
  if (more) {
    const ctx = more.dataset.more, limit = +more.dataset.limit + PAGE;
    const wrap = more.closest('.tl');
    const tmp = document.createElement('div');
    tmp.innerHTML = trackList(lists[ctx], ctx, { limit, noHead: true });
    wrap.querySelectorAll('.tr, .tl-more').forEach((n) => n.remove());
    tmp.querySelectorAll('.tr, .tl-more').forEach((n) => wrap.appendChild(n));
    markPlaying();
    return;
  }

  const srcChip = t.closest('[data-srcfilter]');
  if (srcChip) { search.filter = srcChip.dataset.srcfilter; render(); $('#view').scrollTop = 0; loadMore(); return; }

  const sortChip = t.closest('[data-sort]');
  if (sortChip) {
    const k = sortChip.dataset.sort;
    // The active chip flips the direction (newest ↔ oldest, А→Я ↔ Я→А); another chip starts from the default one.
    if (sortKey() === k && k !== 'custom') lib.settings.sortRev = !lib.settings.sortRev;
    else { lib.settings.sort = k; lib.settings.sortRev = false; }
    save(); const sc = $('#view').scrollTop; render(); $('#view').scrollTop = sc; return;
  }

  const gp = t.closest('[data-glass]');
  if (gp) { const [frost, blur] = gp.dataset.glass.split(',').map(Number); Object.assign(lib.settings.glass, { frost, blur }); applyTheme(lib.settings.theme); save(); const sc = $('#view').scrollTop; render(); $('#view').scrollTop = sc; return; }

  const fxb = t.closest('[data-fx]');
  if (fxb) { const [speed, pitch, reverb] = fxb.dataset.fx.split(',').map(Number); Object.assign(lib.settings.fx, { speed, pitch: !!pitch, reverb }); eq.effects(lib.settings.fx); save(); const sc = $('#view').scrollTop; render(); $('#view').scrollTop = sc; updateFxBadge(); return; }

  const ws = t.closest('[data-waveseed]');
  if (ws) { lib.settings.wave.seed = ws.dataset.waveseed; save(); render(); if (queue.ctx === 'wave') waveStart(); return; }

  const th = t.closest('[data-theme]');
  if (th) { const [id, , hue, sat] = THEMES.find((x) => x[0] === th.dataset.theme); setTheme({ id, hue, sat }); return render(); }

  const pr = t.closest('[data-preset]');
  if (pr) {
    if (t.closest('[data-delpreset]')) { delete lib.settings.eqCustom[pr.dataset.preset]; save(); return render(); }
    const n = pr.dataset.preset;
    const g = EQ_PRESETS[n] || lib.settings.eqCustom[n];
    Object.assign(lib.settings.eq, { preset: n, gains: g.slice(), enabled: true, preamp: Math.min(0, -Math.max(0, ...g) / 2) });
    eq.apply(lib.settings.eq); save(); return render();
  }

  if (!act) return;
  const ctxNow = currentCtx();
  switch (act.dataset.act) {
    case 'addfiles': pickFiles(ctxNow.startsWith('pl:') ? getPlaylist(ctxNow.slice(3)) : null); break;
    case 'newpl': { const n = await prompt2('Новый плейлист', `Мой плейлист № ${lib.playlists.length + 1}`, 'Создать'); if (n) { const p = createPlaylist(n); go('playlist', p.id); } break; }
    case 'rename': { const p = getPlaylist(state.view.arg); if (p) renamePlaylist(p); break; }
    case 'plmenu': {
      const p = getPlaylist(state.view.arg); if (!p) break;
      const r = act.getBoundingClientRect();
      openMenu(r.left, r.bottom + 4, `<button data-m="rename">${icon('edit')}Переименовать</button><hr><button data-m="delete" class="danger">${icon('trash')}Удалить плейлист</button>`, async (m) => {
        if (m === 'rename') renamePlaylist(p);
        if (m === 'delete' && await deletePlaylist(p)) go('home');
      });
      break;
    }
    case 'shuffleplay': playCtx(ctxNow, -1, true); render(); break;
    case 'openfolder': { const f = folderByCtx(ctxNow); api.openPath(f ? f.dir : musicRoots[0]); break; }
    case 'openmusic': api.openPath(musicRoots[0]); break;
    case 'openpath': api.openPath(act.dataset.path); break;
    case 'addfolder': {
      const dir = await api.pickFolder(); if (!dir) break;
      if (!lib.settings.folders.length) lib.settings.folders = [...musicRoots];
      if (!lib.settings.folders.includes(dir)) lib.settings.folders.push(dir);
      save(); toast('Папка добавлена, читаю файлы…'); await rescan(); break;
    }
    case 'removefolder': {
      lib.settings.folders = lib.settings.folders.filter((f) => f !== act.dataset.path);
      save(); await rescan(); break;
    }
    case 'research': runSearch(search.q, true); break;
    case 'rescan': await rescan(); toast(`Найдено ${tracksWord(allTracks.length)}`, 'ok'); break;
    case 'clearmanual': queue.manual = []; render(); break;
    case 'clearrecent': lib.recent = []; lib.recentLists = []; save(); render(); toast('История прослушиваний очищена'); break;
    case 'ambienttoggle': { setTheme({ ambient: !lib.settings.theme.ambient }); const sc = $('#view').scrollTop; render(); $('#view').scrollTop = sc; break; }
    case 'lyhide': case 'lytoggle': {
      lib.settings.npLyrics = act.dataset.act === 'lytoggle' ? lib.settings.npLyrics === false : false;
      save();
      const n = $('.npx'); if (n) n.classList.toggle('no-lyrics', lib.settings.npLyrics === false);
      const b = $('#npLyrToggle'); if (b) b.classList.toggle('on', lib.settings.npLyrics !== false);
      if (lib.settings.npLyrics !== false) { lyr.userScroll = 0; syncLyrics(true); }
      break;
    }
    case 'lyshift': {
      const cur = player.current; if (!cur) break;
      lib.lyricsShift = lib.lyricsShift || {};
      const v = Math.round(((lib.lyricsShift[cur.sid] || 0) + +act.dataset.d) * 100) / 100;
      if (v) lib.lyricsShift[cur.sid] = v; else delete lib.lyricsShift[cur.sid];
      save(); $('#lyHead').innerHTML = npLyricsHead(); lyr.userScroll = 0; syncLyrics(true);
      break;
    }
    case 'fxpitch': { lib.settings.fx.pitch = !lib.settings.fx.pitch; eq.effects(lib.settings.fx); save(); updateFxBadge(); const sc = $('#view').scrollTop; render(); $('#view').scrollTop = sc; break; }
    case 'import': runImport(($('#impUrl') || {}).value || ''); break;
    case 'openimported': if (imp.result && getPlaylist(imp.result.pid)) go('playlist', imp.result.pid); break;
    case 'wavestart': waveStart(); break;
    case 'waveplay': player.toggle(); break;
    case 'wavedislike': waveDislike(); break;
    case 'wavenew': lib.settings.wave.onlyNew = !lib.settings.wave.onlyNew; save(); render(); break;
    case 'eqtoggle': lib.settings.eq.enabled = !lib.settings.eq.enabled; eq.apply(lib.settings.eq); save(); render(); break;
    case 'eqreset': Object.assign(lib.settings.eq, { preset: 'Ровный', gains: Array(10).fill(0), preamp: 0 }); eq.apply(lib.settings.eq); save(); render(); break;
    case 'eqsave': { const n = await prompt2('Название пресета', 'Мой пресет'); if (n) { lib.settings.eqCustom[n] = lib.settings.eq.gains.slice(); lib.settings.eq.preset = n; save(); render(); toast('Пресет сохранён', 'ok'); } break; }
    default: break;
  }
});

function playFromRow(ctx, i) {
  // Rows of a filtered list, the home cards or the queue map back onto the full list.
  const track = lists[ctx][i];
  if (ctx.startsWith('queue:')) {
    if (ctx === 'queue:manual') { queue.manual.splice(i, 1); return player.load(track); }
    if (ctx === 'queue:next') { queue.pos += i + 1; return player.playIndex(); }
    return player.toggle();
  }
  if (player.current && player.current.uid === track.uid) return player.toggle();
  if (ctx === 'wave:ahead') { queue.pos += i; return player.playIndex(); } // row 0 is the current track
  const base = ctx === 'all:new' ? 'all' : ctx === 'search:top' || ctx === 'search:more' ? 'search' : ctx.replace(/#f$/, '');
  const full = listFromCtx(base);
  const idx = Math.max(0, full.findIndex((x) => x.uid === track.uid));
  queue.set(full, idx, base);
  player.playIndex();
}

document.addEventListener('dblclick', (e) => {
  const row = e.target.closest('.tr[data-ctx]');
  if (row && !e.target.closest('button')) playFromRow(row.dataset.ctx, +row.dataset.i);
});
document.addEventListener('contextmenu', (e) => {
  const row = e.target.closest('[data-ctx][data-i]');
  if (row) {
    e.preventDefault();
    const t = (lists[row.dataset.ctx] || [])[+row.dataset.i];
    if (t) trackMenu(e.clientX, e.clientY, t, row.dataset.ctx);
    return;
  }
  const item = e.target.closest('[data-open]');
  if (!item) return;
  e.preventDefault();
  const ctx = item.dataset.open;
  const p = ctx.startsWith('pl:') ? getPlaylist(ctx.slice(3)) : null;
  const f = ctx.startsWith('f:') ? folderByCtx(ctx) : null;
  openMenu(e.clientX, e.clientY, `<button data-m="play">${icon('play')}Слушать</button><button data-m="shuffle">${icon('shuffle')}Перемешать</button>
    ${f ? `<button data-m="folder">${icon('folder')}Открыть папку</button>` : ''}
    ${p ? `<button data-m="rename">${icon('edit')}Переименовать</button><hr><button data-m="delete" class="danger">${icon('trash')}Удалить плейлист</button>` : ''}`, async (m) => {
    if (m === 'play') playCtx(ctx, -1);
    if (m === 'shuffle') playCtx(ctx, -1, true);
    if (m === 'folder') api.openPath(f.dir);
    if (m === 'rename') renamePlaylist(p);
    if (m === 'delete' && await deletePlaylist(p)) { if (currentCtx() === ctx) go('home'); else render(); }
  });
});

$('#newPlaylistBtn').onclick = async () => { const n = await prompt2('Новый плейлист', `Мой плейлист № ${lib.playlists.length + 1}`, 'Создать'); if (n) { const p = createPlaylist(n); go('playlist', p.id); } };

// Files dropped onto the window are copied into the open folder (or the main music folder).
// A row held inside the list marks where it will land (above or below the row under the pointer).
function dropTarget(e) {
  const r = e.target.closest && e.target.closest('.tr[draggable="true"]');
  if (!r || !dragRow || r.dataset.ctx !== dragRow.ctx) return null;
  const b = r.getBoundingClientRect();
  return { row: r, below: e.clientY > b.top + b.height / 2 };
}
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  if (dragRow) {
    e.dataTransfer.dropEffect = 'move';
    $$('.tr.drop-above, .tr.drop-below').forEach((r) => r.classList.remove('drop-above', 'drop-below'));
    const d = dropTarget(e);
    if (d) d.row.classList.add(d.below ? 'drop-below' : 'drop-above');
    const v = $('#view'), vr = v.getBoundingClientRect(); // scroll while dragging near the edges
    if (e.clientY < vr.top + 80) v.scrollTop -= 14; else if (e.clientY > vr.bottom - 60) v.scrollTop += 14;
    return;
  }
  document.body.classList.add('dropping');
});
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dropping'); });
document.addEventListener('drop', async (e) => {
  e.preventDefault();
  document.body.classList.remove('dropping');
  if (dragRow) {
    const d = dropTarget(e), from = dragRow;
    dragRow = null;
    if (d) moveTrack(from.ctx, from.i, +d.row.dataset.i + (d.below ? 1 : 0));
    return;
  }
  const files = [...e.dataTransfer.files].map((f) => api.pathOf(f)).filter(Boolean);
  if (!files.length) return;
  const f = folderByCtx(currentCtx());
  const dest = f ? f.dir : musicRoots[0];
  try {
    const n = await api.copyIn(files, dest);
    toast(n ? `Добавлено ${tracksWord(n)} в «${f ? f.name : 'Музыка'}»` : 'Эти файлы уже есть или это не аудио', n ? 'ok' : '');
    if (n) rescan(true);
  } catch (err) { toast(err.message, 'err'); }
});

document.addEventListener('keydown', (e) => {
  const typing = /INPUT|TEXTAREA/.test(document.activeElement.tagName);
  if (e.ctrlKey && e.code === 'KeyK') { e.preventDefault(); openSearch(); return; }
  if (e.ctrlKey && e.code === 'KeyF') { e.preventDefault(); const f = $('#plFilter'); if (f) f.focus(); else go('all'); return; }
  if (typing) return;
  if (e.code === 'Space') { e.preventDefault(); player.toggle(); }
  else if (e.ctrlKey && e.key === 'ArrowRight') player.next();
  else if (e.ctrlKey && e.key === 'ArrowLeft') player.prev();
  else if (e.ctrlKey && e.key === 'ArrowUp') { lib.settings.volume = Math.min(1, lib.settings.volume + 0.05); lib.settings.muted = false; updateVolumeUI(); save(); }
  else if (e.ctrlKey && e.key === 'ArrowDown') { lib.settings.volume = Math.max(0, lib.settings.volume - 0.05); updateVolumeUI(); save(); }
  else if (e.ctrlKey && e.code === 'KeyL') toggleLike(player.current);
  else if (e.key === 'ArrowRight' && isFinite(audio.duration)) audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
  else if (e.key === 'ArrowLeft') audio.currentTime = Math.max(0, audio.currentTime - 5);
});

api.onLibraryChanged(() => rescan(true));

// ============================================================ boot
(async function boot() {
  hydrateIcons();
  try {
    const saved = migrate(await api.loadLibrary());
    if (saved) {
      lib = { ...structuredClone(DEFAULT_LIB), ...saved };
      lib.settings = { ...DEFAULT_LIB.settings, ...saved.settings, eq: { ...DEFAULT_LIB.settings.eq, ...(saved.settings || {}).eq },
        theme: { ...DEFAULT_LIB.settings.theme, ...(saved.settings || {}).theme },
        glass: { ...DEFAULT_LIB.settings.glass, ...(saved.settings || {}).glass },
        wave: { ...DEFAULT_LIB.settings.wave, ...(saved.settings || {}).wave },
        fx: { ...DEFAULT_LIB.settings.fx, ...(saved.settings || {}).fx } };
      save();
    }
  } catch (e) { toast('Не удалось загрузить медиатеку: ' + e.message, 'err'); }
  eq.apply(lib.settings.eq);
  eq.effects(lib.settings.fx);
  applyTheme(lib.settings.theme);
  updateVolumeUI(); updateModeButtons(); updatePlayButton(); updateNowPlaying();
  render();
  updateFxBadge();
  lyricsLoop();
  await rescan();
  const last = resolvePaths(lib.recent)[0];
  if (last && !player.current) {
    player.current = last;
    const ctx = lib.recentLists.find(ctxExists);
    const list = ctx ? listFromCtx(ctx) : [last];
    const i = list.findIndex((t) => t.uid === last.uid);
    queue.set(i >= 0 ? list : [last], Math.max(0, i), i >= 0 ? ctx : 'recent');
    updateNowPlaying(); markPlaying();
  }
  // Checks for a new version on every start and switches to it at once (iOS keeps old copies for long).
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((r) => r.update()).catch(() => {});
    document.addEventListener('visibilitychange', () => { if (!document.hidden) navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {}); });
  }
})();
$('#addTopBtn').onclick = () => { const c = currentCtx(); pickFiles(c.startsWith('pl:') ? getPlaylist(c.slice(3)) : null); };
