import { db, uid } from './db.js';
import { $, $$, esc, state, loadState, updateSettings, toast, confirmTap } from './ui.js';
import { hasClip } from './audio.js';
import { LOAD_KEYS, LOADS, bellShort, bellLabel } from './engine.js';

let tab = 'exercises', query = '';

export async function renderLibrary(root, id) {
  if (id && id !== 'bells') return renderExercise(root, decodeURIComponent(id));
  if (id === 'bells') tab = 'bells';
  root.innerHTML = `<h1>Library</h1>
    <span class="seg" role="group" aria-label="Library section"><button type="button" data-tab="exercises" aria-pressed="${tab === 'exercises'}">Exercises</button><button type="button" data-tab="bells" aria-pressed="${tab === 'bells'}">Bells</button></span>
    <div id="body" class="stack"></div>`;
  $$('[data-tab]', root).forEach(b => b.onclick = () => { tab = b.dataset.tab; renderLibrary(root); });
  const body = $('#body', root);
  if (tab === 'bells') return renderBells(body);

  body.innerHTML = `<div class="row"><input id="q" type="search" placeholder="Search ${state.exercises.length} exercises" value="${esc(query)}" style="flex:1"><a class="btn primary sm" href="#/library/new">+ New</a></div><ul class="plist" id="exl"></ul>`;
  const list = () => {
    const q = query.toLowerCase();
    const items = state.exercises.filter(e => !q || e.name.toLowerCase().includes(q) || (e.tags || []).join(' ').toLowerCase().includes(q));
    $('#exl', body).innerHTML = items.map(e => `<li><a href="#/library/${encodeURIComponent(e.id)}" style="display:grid;grid-template-columns:1fr auto;gap:2px 10px;padding:11px 4px;color:var(--ink);text-decoration:none">
      <span>${esc(e.name)}${e.bell ? `<span class="bk">${esc(bellShort(e.bell, state.settings.loads))}</span>` : ''}</span><span class="small muted">${e.mode === 'time' ? (e.work || 40) + 's' : esc(e.reps || '')}</span>
      <span class="small muted" style="grid-column:1/-1">${esc((e.cue || '').slice(0, 90))}${(e.cue || '').length > 90 ? '…' : ''}</span></a></li>`).join('') || '<li class="empty">No matches.</li>';
  };
  $('#q', body).oninput = e => { query = e.target.value; list(); };
  list();
}

function renderBells(body) {
  const bells = (state.settings.bells || []).slice().sort((a, b) => a - b);
  body.innerHTML = `<section class="card stack"><h2>Your bells</h2>
    <p class="small muted">Workouts use load categories (light, medium, heavy, extra heavy). Choose which of these bells each category means in <a href="#/settings">Settings → Load presets</a>.</p>
    <div class="bellchips">${bells.map(b => `<span class="chip">${b} lb <button class="sm ghost" data-rm="${b}" aria-label="Remove ${b} lb" style="min-height:28px;padding:2px 8px">✕</button></span>`).join('') || '<span class="muted">None yet</span>'}</div>
    <div class="row"><input id="nb" type="number" inputmode="decimal" min="1" max="300" placeholder="Weight in lb" style="width:150px"><button id="addb" class="primary sm">Add bell</button></div></section>`;
  $$('[data-rm]', body).forEach(b => b.onclick = async () => { await updateSettings({ bells: bells.filter(x => x !== +b.dataset.rm) }); renderBells(body); });
  $('#addb', body).onclick = async () => { const v = +$('#nb', body).value; if (!v) return; await updateSettings({ bells: [...new Set([...bells, v])] }); renderBells(body); };
}

async function renderExercise(root, id) {
  const isNew = id === 'new';
  const e = isNew ? { id: uid('ex'), name: '', vname: '', cue: '', q: '', bell: '', mode: 'reps', reps: '10', work: 40, trans: state.settings.transition ?? 10, tags: [] } : await db.get('exercises', id);
  if (!e) { root.innerHTML = '<div class="empty">Exercise not found. <a href="#/library">Back</a></div>'; return; }
  const opts = [...LOAD_KEYS.map(k => [k, LOADS[k].label]), ...LOAD_KEYS.map(k => ['2x ' + k, '2× ' + LOADS[k].label])];
  const uses = (await db.all('workouts')).filter(w => w.blocks.some(b => b.items.some(i => i.exId === e.id)));
  root.innerHTML = `<div class="spread"><a class="btn sm" href="#/library">← Library</a>${isNew ? '' : `<span class="small muted">Used in ${uses.length} workout${uses.length === 1 ? '' : 's'}</span>`}</div>
  <h1>${isNew ? 'New exercise' : esc(e.name)}</h1>
  <section class="card stack">
    <label class="field">Name<input id="f-name" value="${esc(e.name)}" placeholder="e.g. Goblet squats"></label>
    <label class="field">Spoken name<input id="f-vname" value="${esc(e.vname || '')}" placeholder="what the voice says"><span class="small" id="vstat"></span></label>
    <label class="field">Form cue<textarea id="f-cue" placeholder="One or two lines of form reminders">${esc(e.cue || '')}</textarea></label>
    <label class="field">Demo search words<input id="f-q" value="${esc(e.q || '')}" placeholder="used for Watch demo and See diagram"></label>
  </section>
  <section class="card stack"><h2>Defaults when added to a workout</h2>
    <span class="seg" role="group" aria-label="Count by"><button type="button" data-mode="reps" aria-pressed="${e.mode !== 'time'}">Reps</button><button type="button" data-mode="time" aria-pressed="${e.mode === 'time'}">Time</button></span>
    <div class="grid2">
      <label class="field">Reps<input id="f-reps" value="${esc(e.reps || '')}" placeholder="10 or 8 / side"></label>
      <label class="field">Work seconds<input id="f-work" type="number" inputmode="numeric" value="${esc(e.work || 40)}"></label>
      <label class="field">Transition seconds<input id="f-trans" type="number" inputmode="numeric" value="${esc(e.trans ?? 10)}"></label>
      <label class="field">Load<select id="f-bell"><option value="">None</option>${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(e.bell || '').toLowerCase() === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}${e.bell && !opts.some(([v]) => v === String(e.bell).toLowerCase()) ? `<option value="${esc(e.bell)}" selected>${esc(bellLabel(e.bell, state.settings.loads))}</option>` : ''}</select></label>
    </div>
    <label class="field">Tags<input id="f-tags" value="${esc((e.tags || []).join(', '))}" placeholder="core, hinge, cardio"></label>
  </section>
  <div class="row"><button id="save" class="primary">${isNew ? 'Add exercise' : 'Save'}</button>${isNew ? '' : '<button id="del" class="danger ghost">Delete</button>'}</div>`;
  let mode = e.mode || 'reps';
  $$('[data-mode]', root).forEach(b => b.onclick = () => { mode = b.dataset.mode; $$('[data-mode]', root).forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
  const vstat = () => { const v = $('#f-vname').value.trim() || $('#f-name').value.trim().toLowerCase(); $('#vstat').textContent = !v ? '' : hasClip(v + '.') ? '✓ Recorded voice available' : 'Uses your phone’s voice (no recording for this name)'; };
  $('#f-vname').oninput = vstat; $('#f-name').oninput = vstat; setTimeout(vstat, 300);
  $('#save', root).onclick = async () => {
    const name = $('#f-name').value.trim(); if (!name) { toast('Give it a name'); $('#f-name').focus(); return; }
    Object.assign(e, { name, vname: $('#f-vname').value.trim() || name.toLowerCase(), cue: $('#f-cue').value.trim(), q: $('#f-q').value.trim() || name,
      mode, reps: $('#f-reps').value.trim(), work: +$('#f-work').value || 40, trans: Math.max(0, +$('#f-trans').value || 0),
      bell: $('#f-bell').value, tags: $('#f-tags').value.split(',').map(t => t.trim()).filter(Boolean) });
    await db.put('exercises', e); await loadState(); toast('Saved'); location.hash = '#/library';
  };
  const del = $('#del', root);
  if (del) confirmTap(del, uses.length ? `Used in ${uses.length}: tap again` : 'Tap again to delete', async () => { await db.del('exercises', e.id); await loadState(); toast('Deleted'); location.hash = '#/library'; });
}
