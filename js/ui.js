// Shared UI helpers and cached app state.
import { db, getSettings, saveSettings } from './db.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const state = { settings: null, exercises: [], exMap: new Map() };

export async function loadState() {
  state.settings = await getSettings();
  state.exercises = (await db.all('exercises')).sort((a, b) => a.name.localeCompare(b.name));
  state.exMap = new Map(state.exercises.map(e => [e.id, e]));
}
export const isStarred = id => (state.settings.starred || []).includes(id);
export async function toggleStar(id) {
  const s = new Set(state.settings.starred || []); s.has(id) ? s.delete(id) : s.add(id);
  await updateSettings({ starred: [...s] }); return s.has(id);
}
export const starButton = id => `<button type="button" class="star sm ghost" data-star="${esc(id)}" aria-pressed="${isStarred(id)}" aria-label="${isStarred(id) ? 'Unstar' : 'Star'} workout" title="${isStarred(id) ? 'Unstar' : 'Star'}">${isStarred(id) ? '★' : '☆'}</button>`;
export function wireStars(root, after) {
  root.querySelectorAll('[data-star]').forEach(b => b.onclick = async () => {
    const on = await toggleStar(b.dataset.star);
    b.textContent = on ? '★' : '☆'; b.setAttribute('aria-pressed', on); b.setAttribute('aria-label', (on ? 'Unstar' : 'Star') + ' workout'); b.title = on ? 'Unstar' : 'Star';
    toast(on ? 'Starred' : 'Unstarred'); if (after) after();
  });
}
export async function updateSettings(patch) {
  state.settings = Object.assign({}, state.settings, patch);
  await saveSettings(state.settings);
}

let toastT = 0;
export function toast(msg) {
  let el = $('.toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2600);
}

// Two-tap confirm for destructive buttons (no browser dialogs).
export function confirmTap(btn, label, fn) {
  btn.addEventListener('click', () => {
    if (btn.dataset.armed) { delete btn.dataset.armed; fn(); return; }
    const orig = btn.textContent; btn.dataset.armed = '1'; btn.textContent = label;
    setTimeout(() => { if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = orig; } }, 3000);
  });
}

export function download(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
export async function shareOrDownload(filename, text) {
  try {
    const file = new File([text], filename, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: filename }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  download(filename, text);
}
export function pickFile(accept = '.json,application/json') {
  return new Promise(resolve => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept;
    i.onchange = () => { const f = i.files[0]; if (!f) return resolve(null); const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsText(f); };
    i.click();
  });
}

export const typeLabel = t => ({ amrap: 'AMRAP', rounds: 'Rounds', emom: 'EMOM' }[t] || t);
export function dateLabel(ts) {
  const d = new Date(ts); const today = new Date(); const y = new Date(); y.setDate(today.getDate() - 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (same(d, today)) return 'Today ' + time;
  if (same(d, y)) return 'Yesterday ' + time;
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + ' ' + time;
}

export const ICONS = {
  workouts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6a3 3 0 1 1 6 0"/><path d="M7.5 9h9l1.5 10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"/></svg>',
  library: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 5h6v14H4zM14 5h6v14h-6z"/><path d="M7 9h0M17 9h0"/></svg>',
  history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
};
