import { db, uid } from './db.js';
import { $, $$, esc, state, loadState, toast, confirmTap, shareOrDownload } from './ui.js';
import { estimateSeconds, fmt } from './engine.js';
import { exportWorkout } from './db.js';

function newWorkout() {
  const s = state.settings;
  return { id: uid('w'), name: 'New workout', type: 'amrap', durationSec: 1800, countdown: s.countdown, cardio: { ...s.cardio }, notes: '', updatedAt: Date.now(),
    blocks: [{ name: 'Circuit', rounds: 3, restAfterRound: s.restAfterRound, items: [] }] };
}

export async function renderBuilder(root, id) {
  let w = id ? await db.get('workouts', id) : null;
  if (!w) { w = newWorkout(); await db.put('workouts', w); history.replaceState(null, '', '#/edit/' + encodeURIComponent(w.id)); }
  let saveT = 0;
  const save = (rerender = true) => {
    w.updatedAt = Date.now(); clearTimeout(saveT);
    saveT = setTimeout(async () => { await db.put('workouts', w); const st = $('#savest', root); if (st) st.textContent = 'Saved'; }, 250);
    const st = $('#savest', root); if (st) st.textContent = 'Saving…';
    if (rerender) paint();
  };

  const bellOpts = () => {
    const b = state.settings.bells || [];
    return [...b.map(String), ...b.map(x => '2x' + x)];
  };

  function itemRow(it, bi, ii, n) {
    const items = w.blocks[bi].items;
    const acts = `<div class="acts"><button class="sm" data-act="up" ${ii === 0 ? 'disabled' : ''} aria-label="Move up">↑</button><button class="sm" data-act="down" ${ii === items.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button><button class="sm" data-act="dup" aria-label="Duplicate">⧉</button><button class="sm danger" data-act="del" aria-label="Remove">✕</button></div>`;
    if (it.kind === 'cardio') return `<div class="item cardio" data-bi="${bi}" data-ii="${ii}"><span class="num">${n}</span><div class="fields">⚡ Cardio burst <span class="small muted">(${w.cardio.len}s, type set above)</span></div>${acts}</div>`;
    const ex = state.exMap.get(it.exId);
    const isT = it.mode === 'time';
    return `<div class="item" data-bi="${bi}" data-ii="${ii}"><span class="num">${n}</span><div class="fields">
      <select class="exsel" aria-label="Exercise">${ex ? '' : '<option value="">(missing exercise)</option>'}${state.exercises.map(e => `<option value="${esc(e.id)}" ${e.id === it.exId ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select>
      <div class="sub"><span class="seg" role="group" aria-label="Count by"><button type="button" data-mode="reps" aria-pressed="${!isT}">Reps</button><button type="button" data-mode="time" aria-pressed="${isT}">Time</button></span>
        ${isT ? `<label>Work s <input class="n" type="number" inputmode="numeric" min="5" max="600" step="5" data-f="work" value="${esc(it.work || 40)}"></label>
                 <label>Transition s <input class="n" type="number" inputmode="numeric" min="0" max="180" step="5" data-f="trans" value="${esc(it.trans ?? 10)}"></label>`
              : `<label>Reps <input data-f="reps" value="${esc(it.reps || '')}" placeholder="10, 8 / side"></label>`}
        <label>Bell lb <input data-f="bell" list="belllist" value="${esc(it.bell || '')}" placeholder="${esc(ex && ex.bell ? ex.bell : 'none')}"></label></div></div>${acts}</div>`;
  }

  function paint() {
    const isRounds = w.type === 'rounds';
    let n = 0;
    root.innerHTML = `
    <div class="spread"><a class="btn sm" href="#/">← Workouts</a><span class="small muted" id="savest">Saved</span></div>
    <label class="field">Workout name<input id="wname" value="${esc(w.name)}"></label>
    <section class="card stack">
      <div class="spread"><span class="seg" role="group" aria-label="Workout type">${['amrap', 'rounds', 'emom'].map(t => `<button type="button" data-type="${t}" aria-pressed="${w.type === t}">${{ amrap: 'AMRAP', rounds: 'Rounds', emom: 'EMOM' }[t]}</button>`).join('')}</span>
        <span class="small muted">${isRounds ? 'About ' + Math.round(estimateSeconds(w, w.cardio.len) / 60) + ' min' : ''}</span></div>
      <p class="small muted" style="margin:0">${{ amrap: 'As many rounds as possible before the clock runs out. Tap Done after reps moves; timed moves run themselves.', rounds: 'Work through each block for its number of rounds, then finish. Great for interval workouts.', emom: 'Every minute on the minute: a new move starts at the top of each minute; rest for whatever is left.' }[w.type]}</p>
      <div class="grid2">
        ${isRounds ? '' : `<label class="field">Duration (minutes)<input id="dur" type="number" inputmode="numeric" min="1" max="120" value="${Math.round(w.durationSec / 60)}"></label>`}
        <label class="field">Countdown beeps<select id="cd">${[5, 10, 15].map(v => `<option value="${v}" ${w.countdown == v ? 'selected' : ''}>Last ${v} s</option>`).join('')}</select></label>
        <label class="field">Cardio type<select id="ct">${[['mix', 'Mix (rotate)'], ['rope', 'Jump rope'], ['feet', 'Fast feet'], ['hops', 'Side-to-side hops']].map(([v, l]) => `<option value="${v}" ${w.cardio.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field">Cardio length<select id="cl">${[20, 30, 45, 60].map(v => `<option value="${v}" ${w.cardio.len == v ? 'selected' : ''}>${v} s</option>`).join('')}</select></label>
      </div>
    </section>
    ${w.blocks.map((b, bi) => `<section class="card blockcard" data-block="${bi}">
      <div class="spread"><input class="bname" value="${esc(b.name)}" aria-label="Block name" style="font-weight:700;flex:1">
        ${w.blocks.length > 1 ? `<button class="sm" data-bact="up" ${bi === 0 ? 'disabled' : ''} aria-label="Move block up">↑</button><button class="sm danger" data-bact="del">Remove block</button>` : ''}</div>
      <div class="grid2">
        ${isRounds ? `<label class="field">Rounds<input class="brounds" type="number" inputmode="numeric" min="1" max="50" value="${esc(b.rounds || 1)}"></label>` : ''}
        ${w.type === 'emom' ? '' : `<label class="field">Rest after each round (s)<input class="brest" type="number" inputmode="numeric" min="0" max="600" step="5" value="${esc(b.restAfterRound || 0)}"></label>`}
      </div>
      <div>${b.items.map((it, ii) => itemRow(it, bi, ii, ++n)).join('') || '<p class="small muted">No moves yet. Add one below.</p>'}</div>
      <div class="row"><input class="addname" list="exlist" placeholder="Add exercise: type or pick" style="flex:1;min-width:180px"><button class="sm primary" data-add="move">Add</button><button class="sm" data-add="cardio">+ ⚡ Cardio</button></div>
      <div class="row small"><button class="sm ghost" data-all="time">All → Time</button><button class="sm ghost" data-all="reps">All → Reps</button></div>
    </section>`).join('')}
    ${isRounds ? '<button id="addblock">+ Add block</button>' : ''}
    <label class="field">Notes<textarea id="wnotes" placeholder="Anything to remember about this workout">${esc(w.notes || '')}</textarea></label>
    <div class="row"><a class="btn primary" href="#/play/${encodeURIComponent(w.id)}">▶ Start workout</a><button id="share">Share file</button><button id="delw" class="danger ghost">Delete workout</button></div>
    <datalist id="exlist">${state.exercises.map(e => `<option value="${esc(e.name)}">`).join('')}</datalist>
    <datalist id="belllist">${bellOpts().map(b => `<option value="${esc(b)}">`).join('')}</datalist>`;
    wire();
  }

  function wire() {
    $('#wname', root).oninput = e => { w.name = e.target.value || 'Untitled'; save(false); };
    $('#wnotes', root).oninput = e => { w.notes = e.target.value; save(false); };
    $$('[data-type]', root).forEach(b => b.onclick = () => {
      w.type = b.dataset.type;
      if (w.type !== 'rounds' && w.blocks.length > 1) toast('AMRAP and EMOM run all blocks as one circuit');
      if (w.type !== 'rounds' && !w.durationSec) w.durationSec = 1800;
      save();
    });
    const dur = $('#dur', root); if (dur) dur.onchange = () => { w.durationSec = Math.max(1, Math.min(120, +dur.value || 30)) * 60; save(); };
    $('#cd', root).onchange = e => { w.countdown = +e.target.value; save(false); };
    $('#ct', root).onchange = e => { w.cardio.type = e.target.value; save(false); };
    $('#cl', root).onchange = e => { w.cardio.len = +e.target.value; save(); };
    $$('[data-block]', root).forEach(sec => {
      const bi = +sec.dataset.block, b = w.blocks[bi];
      $('.bname', sec).oninput = e => { b.name = e.target.value; save(false); };
      const r = $('.brounds', sec); if (r) r.onchange = () => { b.rounds = Math.max(1, +r.value || 1); save(); };
      const rs = $('.brest', sec); if (rs) rs.onchange = () => { b.restAfterRound = Math.max(0, +rs.value || 0); save(); };
      $$('[data-bact]', sec).forEach(btn => {
        if (btn.dataset.bact === 'up') btn.onclick = () => { [w.blocks[bi - 1], w.blocks[bi]] = [w.blocks[bi], w.blocks[bi - 1]]; save(); };
        else confirmTap(btn, 'Tap again to remove', () => { w.blocks.splice(bi, 1); save(); });
      });
      $('[data-add="move"]', sec).onclick = async () => {
        const name = $('.addname', sec).value.trim(); if (!name) { $('.addname', sec).focus(); return; }
        let ex = state.exercises.find(e => e.name.toLowerCase() === name.toLowerCase());
        if (!ex) {
          ex = { id: uid('ex'), name, vname: name.toLowerCase(), cue: '', q: name, bell: '', mode: 'reps', reps: '10', work: 40, trans: 10, tags: [] };
          await db.put('exercises', ex); await loadState(); toast('Added "' + name + '" to your library');
        }
        b.items.push({ kind: 'move', exId: ex.id, mode: ex.mode || 'reps', reps: ex.reps || '10', work: ex.work || 40, trans: ex.trans ?? 10, bell: ex.bell || '' });
        save();
      };
      $('.addname', sec).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('[data-add="move"]', sec).click(); } });
      $('[data-add="cardio"]', sec).onclick = () => { b.items.push({ kind: 'cardio' }); save(); };
      $$('[data-all]', sec).forEach(btn => btn.onclick = () => { b.items.forEach(it => { if (it.kind === 'move') { it.mode = btn.dataset.all; it.work = it.work || 40; it.trans = it.trans ?? 10; } }); save(); });
    });
    $$('.item', root).forEach(row => {
      const bi = +row.dataset.bi, ii = +row.dataset.ii, items = w.blocks[bi].items, it = items[ii];
      const sel = $('.exsel', row); if (sel) sel.onchange = () => { it.exId = sel.value; const ex = state.exMap.get(sel.value); if (ex && !it.bell) it.bell = ex.bell || ''; save(); };
      $$('[data-mode]', row).forEach(b => b.onclick = () => { it.mode = b.dataset.mode; it.work = it.work || 40; it.trans = it.trans ?? 10; save(); });
      $$('[data-f]', row).forEach(inp => inp.onchange = () => {
        const f = inp.dataset.f; let v = inp.value.trim();
        if (f === 'work') v = Math.max(5, Math.min(600, +v || 40)); if (f === 'trans') v = Math.max(0, Math.min(180, +v || 0));
        if (f === 'bell') v = v.replace(/\s*(lb|lbs|#)$/i, '');
        it[f] = v; save(f === 'work' || f === 'trans');
      });
      $$('[data-act]', row).forEach(b => {
        const a = b.dataset.act;
        if (a === 'up') b.onclick = () => { [items[ii - 1], items[ii]] = [items[ii], items[ii - 1]]; save(); };
        if (a === 'down') b.onclick = () => { [items[ii + 1], items[ii]] = [items[ii], items[ii + 1]]; save(); };
        if (a === 'dup') b.onclick = () => { items.splice(ii + 1, 0, JSON.parse(JSON.stringify(it))); save(); };
        if (a === 'del') b.onclick = () => { items.splice(ii, 1); save(); };
      });
    });
    const ab = $('#addblock', root); if (ab) ab.onclick = () => { w.blocks.push({ name: 'Block ' + (w.blocks.length + 1), rounds: 3, restAfterRound: state.settings.restAfterRound, items: [] }); save(); };
    $('#share', root).onclick = async () => { const d = await exportWorkout(w.id); await shareOrDownload(w.name.replace(/[^\w-]+/g, '_') + '.json', JSON.stringify(d, null, 1)); };
    confirmTap($('#delw', root), 'Tap again to delete', async () => { await db.del('workouts', w.id); toast('Deleted'); location.hash = '#/'; });
  }
  paint();
}
