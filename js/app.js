import { db, ensureSeed, uid, exportAll, importAll, exportWorkout, DEFAULT_SETTINGS } from './db.js';
import { $, $$, esc, state, loadState, updateSettings, toast, isStarred, starButton, wireStars, confirmTap, download, shareOrDownload, pickFile, typeLabel, dateLabel, ICONS } from './ui.js';
import { estimateSeconds, fmt, LOADS, LOAD_KEYS, HIIT_LOAD_TIP } from './engine.js';
import { setAudioSettings } from './audio.js';
import { renderPlayer, leavePlayer } from './player.js';
import { renderBuilder } from './builder.js';
import { renderLibrary } from './library.js';
import { renderHistory, renderSession } from './history.js';
import { renderReview } from './review.js';
import { SEED } from './seed.js';

const BUILD = '1.10.0'; // keep in step with APP_VERSION in index.html, VERSION in sw.js and "app" in js/seed.js
const main = $('main');
const TABS = [['#/', 'Workouts', 'workouts'], ['#/library', 'Library', 'library'], ['#/history', 'History', 'history'], ['#/settings', 'Settings', 'settings']];

function renderTabs(active) {
  const nav = $('nav.tabs');
  nav.innerHTML = TABS.map(([href, label, icon]) => `<a href="${href}" ${active === icon ? 'aria-current="page"' : ''}>${ICONS[icon]}<span>${label}</span></a>`).join('');
}

async function route() {
  leavePlayer();
  const h = location.hash || '#/';
  const [, view, id] = h.split('/');
  document.body.classList.toggle('playing', view === 'play');
  window.scrollTo(0, 0);
  if (view === 'play') return renderPlayer(main, decodeURIComponent(id));
  if (view === 'review') { renderTabs('workouts'); return renderReview(main, decodeURIComponent(id)); }
  if (view === 'edit') { renderTabs('workouts'); return renderBuilder(main, id ? decodeURIComponent(id) : null); }
  if (view === 'library') { renderTabs('library'); return renderLibrary(main, id); }
  if (view === 'history') { renderTabs('history'); return id ? renderSession(main, decodeURIComponent(id)) : renderHistory(main); }
  if (view === 'settings') { renderTabs('settings'); return renderSettings(main); }
  renderTabs('workouts'); return renderWorkouts(main);
}

// ---------------- Workouts ----------------
let onlyStarred = false, wquery = '';
// Everything a search can match: name, notes, type, tags, block names, exercise names and tags.
const searchText = w => [w.name, w.notes, typeLabel(w.type), ...(w.tags || []), ...w.blocks.flatMap(b => [b.name, ...b.items.flatMap(i => {
  const e = state.exMap.get(i.exId); return i.kind === 'cardio' ? ['cardio'] : e ? [e.name, ...(e.tags || [])] : [];
})])].join(' ').toLowerCase();
async function renderWorkouts(el) {
  const [wos, sessions] = await Promise.all([db.all('workouts'), db.all('sessions')]);
  const lastBy = new Map();
  for (const s of sessions) { const p = lastBy.get(s.workoutId); if (!p || p.endedAt < s.endedAt) lastBy.set(s.workoutId, s); }
  wos.sort((a, b) => (isStarred(b.id) - isStarred(a.id)) || ((lastBy.get(b.id) || {}).endedAt || b.updatedAt || 0) - ((lastBy.get(a.id) || {}).endedAt || a.updatedAt || 0));
  const nStar = wos.filter(w => isStarred(w.id)).length; if (!nStar) onlyStarred = false;
  const card = w => {
    const moves = w.blocks.flatMap(b => b.items).filter(i => i.kind === 'move');
    const names = moves.map(i => (state.exMap.get(i.exId) || {}).name || 'Exercise');
    const len = w.type === 'rounds' ? '~' + Math.round(estimateSeconds(w, state.settings.cardio.len) / 60) + ' min' : Math.round(w.durationSec / 60) + ' min';
    const last = lastBy.get(w.id);
    return `<article class="card wcard">
      <div class="spread"><a class="title" href="#/review/${encodeURIComponent(w.id)}" style="color:inherit;text-decoration:none;flex:1">${esc(w.name)}</a><span class="row" style="gap:6px"><span class="chip">${typeLabel(w.type)}</span>${starButton(w.id)}</span></div>
      <div class="meta"><span>${len}</span><span>·</span><span>${moves.length} moves</span>${last ? `<span>·</span><span>Last: ${esc(dateLabel(last.endedAt))}${last.score ? ' · ' + esc(last.score) : ''}</span>` : ''}</div>
      <div class="moves">${esc([...new Set(names)].join(', '))}</div>
      <div class="row"><a class="btn primary" href="#/play/${encodeURIComponent(w.id)}">▶ Start</a><a class="btn" href="#/review/${encodeURIComponent(w.id)}">☰ Review</a><a class="btn" href="#/edit/${encodeURIComponent(w.id)}">✎ Edit</a>
      <button class="sm ghost" data-dup="${esc(w.id)}">Duplicate</button><button class="sm ghost" data-share="${esc(w.id)}">Share</button></div>
    </article>`;
  };
  el.innerHTML = `<div class="spread"><h1>Workouts</h1><div class="row"><button id="refresh" class="sm" aria-label="Check for app updates" title="Check for updates">⟳</button><button id="imp" class="sm">Import</button><a class="btn primary sm" href="#/edit">+ New</a></div></div>
    ${nStar ? `<span class="seg" role="group" aria-label="Show" style="justify-self:start"><button type="button" data-show="all" aria-pressed="${!onlyStarred}">All ${wos.length}</button><button type="button" data-show="starred" aria-pressed="${onlyStarred}">★ Starred ${nStar}</button></span>` : ''}
    ${wos.length ? `<input id="wq" type="search" placeholder="Search workouts, exercises, tags (e.g. hiit, curls)" aria-label="Search workouts" value="${esc(wquery)}">` : ''}
    <div id="wlist" class="stack" style="gap:16px"></div>`;
  $$('[data-show]', el).forEach(b => b.onclick = () => { onlyStarred = b.dataset.show === 'starred'; renderWorkouts(el); });
  const texts = new Map(wos.map(w => [w.id, searchText(w)]));
  const list = $('#wlist', el);
  const paintList = () => {
    const terms = wquery.toLowerCase().split(/\s+/).filter(Boolean);
    const shown = wos.filter(w => (!onlyStarred || isStarred(w.id)) && terms.every(t => texts.get(w.id).includes(t)));
    list.innerHTML = shown.length ? shown.map(card).join('')
      : !wos.length ? '<div class="empty">No workouts yet. Tap + New to build one.</div>'
      : `<div class="empty">No workouts match “${esc(wquery)}”.</div>`;
    wireCards();
  };
  const wq = $('#wq', el); if (wq) wq.oninput = () => { wquery = wq.value; paintList(); };
  const wireCards = () => {
  wireStars(list, () => renderWorkouts(el));
  $$('[data-dup]', list).forEach(b => b.onclick = async () => {
    const w = await db.get('workouts', b.dataset.dup); const c = JSON.parse(JSON.stringify(w));
    c.id = uid('w'); c.name = w.name + ' (copy)'; c.builtIn = false; c.updatedAt = Date.now();
    await db.put('workouts', c); toast('Duplicated'); location.hash = '#/edit/' + encodeURIComponent(c.id);
  });
  $$('[data-share]', list).forEach(b => b.onclick = async () => {
    const data = await exportWorkout(b.dataset.share);
    await shareOrDownload(data.workouts[0].name.replace(/[^\w-]+/g, '_') + '.json', JSON.stringify(data, null, 1));
  });
  };
  paintList();
  $('#refresh', el).onclick = () => checkForUpdates($('#refresh', el));
  $('#imp', el).onclick = async () => {
    const text = await pickFile(); if (!text) return;
    try { const c = await importAll(JSON.parse(text), 'merge'); await loadState(); toast(`Imported ${c.workouts} workout(s), ${c.exercises} exercise(s)`); route(); }
    catch (e) { toast(e.message || 'Could not read that file'); }
  };
}

// ---------------- Settings ----------------
async function renderSettings(el) {
  const s = state.settings;
  el.innerHTML = `<h1>Settings</h1>
  <section class="card stack"><h2>Sound</h2>
    <label class="row"><input type="checkbox" id="st-voice" ${s.voice ? 'checked' : ''}> Voice announcements</label>
    <label class="row"><input type="checkbox" id="st-beeps" ${s.beeps ? 'checked' : ''}> Beeps</label>
    <label class="field">Beep volume <input type="range" id="st-vol" min="10" max="100" value="${s.beepVolume}"></label>
    <p class="small muted">Sounds play alongside your music without pausing it.</p>
  </section>
  <section class="card stack"><h2>Load presets</h2>
    <p class="small muted" style="margin:0">Workouts say <b>light</b>, <b>medium</b>, <b>heavy</b> or <b>extra heavy</b> instead of exact weights. Pick the weight each one means for you (5 to 100 lb), and every workout updates to match.</p>
    <div class="loadgrid">${LOAD_KEYS.map(k => `<label class="field">${LOADS[k].label}<select data-load="${k}">${[...new Set([...Array.from({ length: 20 }, (_, i) => 5 * (i + 1)), +s.loads[k]])].sort((a, b) => a - b).map(b => `<option value="${b}" ${+s.loads[k] === +b ? 'selected' : ''}>${b} lb</option>`).join('')}</select><span class="small">${LOADS[k].guide}</span></label>`).join('')}</div>
    <p class="small muted" style="margin:0">${HIIT_LOAD_TIP}</p>
  </section>
  <section class="card stack"><h2>Defaults for new workouts</h2>
    <div class="grid2">
      <label class="field">Countdown beeps<select id="st-cd">${[5, 10, 15].map(n => `<option value="${n}" ${s.countdown == n ? 'selected' : ''}>Last ${n} s</option>`).join('')}</select></label>
      <label class="field">Rest after each round<select id="st-rest">${[0, 30, 45, 60, 90, 120].map(n => `<option value="${n}" ${s.restAfterRound == n ? 'selected' : ''}>${n ? n + ' s' : 'None'}</option>`).join('')}</select></label>
      <label class="field">Cardio type<select id="st-ct">${[['mix', 'Mix (rotate)'], ['rope', 'Jump rope'], ['feet', 'Fast feet'], ['hops', 'Side-to-side hops']].map(([v, l]) => `<option value="${v}" ${s.cardio.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field">Transition between moves<select id="st-tr">${[0, 5, 10, 15, 20, 30].map(n => `<option value="${n}" ${(s.transition ?? 10) == n ? 'selected' : ''}>${n ? n + ' s' : 'None'}</option>`).join('')}</select></label>
      <label class="field">Cardio length<select id="st-cl">${[20, 30, 45, 60].map(n => `<option value="${n}" ${s.cardio.len == n ? 'selected' : ''}>${n} s</option>`).join('')}</select></label>
    </div>
    <label class="row"><input type="checkbox" id="st-awake" ${s.keepAwake ? 'checked' : ''}> Keep screen on during workouts</label>
  </section>
  <section class="card stack"><h2>Your data</h2>
    <p class="small muted">Everything is stored on this phone. Back it up to a file now and then, and use the file to move to a new phone.</p>
    <div class="row"><button id="exp" class="primary">Back up everything</button><button id="csv">History as CSV</button></div>
    <div class="row"><button id="impm">Restore (merge)</button><button id="impr" class="danger">Restore (replace all)</button></div>
    <div class="row"><button id="reseed">Re-add built-in workouts</button></div>
  </section>
  <section class="card stack"><h2>App updates</h2><p class="small muted" style="margin:0">Your workouts, history and settings are kept when the app updates.</p><div class="row"><button id="upd" class="primary">⟳ Check for updates</button><span class="small muted" id="updst"></span></div></section>
  <section class="card stack small muted"><h2>About</h2>
    <p>Kettlebell Timer · v<span id="ver"></span>. Works offline once installed. To install: open the Chrome menu ⋮ → <b>Install app</b> (or Add to Home screen).</p>
  </section>`;
  $('#ver', el).textContent = window.APP_VERSION || '1';
  $('#upd', el).onclick = () => checkForUpdates($('#upd', el), $('#updst', el));
  const save = async () => {
    await updateSettings({ voice: $('#st-voice').checked, beeps: $('#st-beeps').checked, beepVolume: +$('#st-vol').value,
      countdown: +$('#st-cd').value, restAfterRound: +$('#st-rest').value, cardio: { type: $('#st-ct').value, len: +$('#st-cl').value }, keepAwake: $('#st-awake').checked, transition: +$('#st-tr').value,
      loads: Object.fromEntries($$('[data-load]', el).map(x => [x.dataset.load, +x.value])) });
    setAudioSettings(state.settings); toast('Saved');
  };
  $$('input,select', el).forEach(i => i.addEventListener('change', save));
  $('#exp', el).onclick = async () => download(`kettlebell-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await exportAll(), null, 1));
  $('#csv', el).onclick = async () => {
    const ss = (await db.all('sessions')).sort((a, b) => a.endedAt - b.endedAt);
    const rows = [['date', 'workout', 'type', 'minutes', 'score', 'rounds', 'moves', 'reps', 'volume_lb', 'rpe', 'notes']];
    for (const x of ss) rows.push([new Date(x.endedAt).toISOString(), x.workoutName, x.type, (x.durationSec / 60).toFixed(1), x.score || '', x.rounds, x.moves, x.reps, x.volume, x.rpe || '', (x.notes || '').replace(/\n/g, ' ')]);
    download('kettlebell-history.csv', rows.map(r => r.map(v => /[",]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(',')).join('\n'), 'text/csv');
  };
  const imp = async mode => {
    const text = await pickFile(); if (!text) return;
    try { const c = await importAll(JSON.parse(text), mode); await loadState(); setAudioSettings(state.settings); toast(`Restored ${c.workouts} workouts, ${c.sessions} sessions`); route(); }
    catch (e) { toast(e.message || 'Could not read that file'); }
  };
  $('#impm', el).onclick = () => imp('merge');
  confirmTap($('#impr', el), 'Tap again: replaces everything', () => imp('replace'));
  $('#reseed', el).onclick = async () => {
    const have = new Set((await db.all('workouts')).map(w => w.id)); const exHave = new Set(state.exercises.map(e => e.id));
    const addW = SEED.workouts.filter(w => !have.has(w.id)); const addE = SEED.exercises.filter(e => !exHave.has(e.id));
    { const now = Date.now(); await db.putMany('workouts', addW.map(w => ({ ...w, builtIn: true, updatedAt: now, seededAt: now }))); }
    await db.putMany('exercises', addE.map(e => ({ ...e, builtIn: true })));
    await loadState(); toast(addW.length || addE.length ? `Added ${addW.length} workouts, ${addE.length} exercises` : 'All built-ins are already here');
  };
}


// ---------------- updates ----------------
let swReg = null, reloading = false;
function showUpdateBanner() {
  if (document.body.classList.contains('playing') || $('#updbanner')) return;
  const b = document.createElement('button'); b.id = 'updbanner'; b.className = 'toast'; b.style.cursor = 'pointer';
  b.textContent = 'New version ready · Tap to refresh'; b.onclick = () => hardReload();
  document.body.appendChild(b);
}
async function hardReload() {
  reloading = true;
  // Refresh the browser's HTTP cache too, or the reload can pick up old copies of the app files.
  try { await Promise.all(['index.html', 'js/app.js', 'js/ui.js', 'js/db.js', 'js/seed.js', 'js/engine.js', 'js/audio.js', 'js/player.js', 'js/builder.js', 'js/library.js', 'js/history.js', 'js/review.js', 'css/app.css', 'sw.js'].map(f => fetch(f, { cache: 'reload' }).catch(() => null))); } catch (e) { }
  try { const keys = await caches.keys(); await Promise.all(keys.filter(k => k.startsWith('shell-')).map(k => caches.delete(k))); } catch (e) { }
  location.reload();
}
async function checkForUpdates(btn, statusEl) {
  const say = t => { if (statusEl) statusEl.textContent = t; else toast(t); };
  if (!navigator.onLine) { say('You’re offline. Connect to the internet and try again.'); return; }
  const label = btn.textContent; btn.disabled = true; btn.textContent = statusEl ? 'Checking…' : '…';
  try {
    const res = await fetch('index.html?check=' + Date.now(), { cache: 'no-store' });
    const html = await res.text(); const m = /APP_VERSION\s*=\s*"([^"]+)"/.exec(html);
    const latest = m ? m[1] : null, current = window.APP_VERSION;
    if (swReg) await swReg.update().catch(() => { });
    if (latest && latest !== current) { say(`Updating to v${latest}…`); setTimeout(hardReload, 600); return; }
    say(`You’re up to date (v${current}).`);
  } catch (e) { say('Couldn’t reach the server. Try again in a moment.'); }
  btn.disabled = false; btn.textContent = label;
}

// ---------------- boot ----------------
(async function boot() {
  // index.html, app.js and seed.js must come from the same version; if not, fetch fresh copies once.
  if (window.APP_VERSION !== BUILD || SEED.app !== BUILD) {
    let tried = true; try { tried = !!sessionStorage.getItem('fixedMix'); sessionStorage.setItem('fixedMix', '1'); } catch (e) { }
    if (!tried) return hardReload();
  }
  try { await ensureSeed(); await loadState(); }
  catch (e) { main.innerHTML = `<div class="card">Storage is unavailable in this browser mode (${esc(e.message)}). Open the app normally, not in a private window.</div>`; return; }
  setAudioSettings(state.settings);
  window.addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    swReg = await navigator.serviceWorker.register('sw.js').catch(() => null);
    // A new version took over in the background: offer a one-tap reload.
    let hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloading) showUpdateBanner(); hadController = true; });
    // Check quietly when the app comes back to the foreground.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && swReg) swReg.update().catch(() => { }); });
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
})();
export { route };
