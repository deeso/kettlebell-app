import { db, uid } from './db.js';
import { $, $$, esc, state, toast, confirmTap } from './ui.js';
import { Runner, fmt, bellLabel } from './engine.js';
import { beep, speak, unlockAudio, keepAwake, isAwake, setAudioSettings } from './audio.js';

let runner = null, raf = 0, last = 0, el = null;

export function leavePlayer() {
  cancelAnimationFrame(raf); raf = 0;
  if (runner && runner.running) runner.running = false;
  runner = null; keepAwake(false);
}

export async function renderPlayer(root, id) {
  el = root;
  const w = await db.get('workouts', id);
  if (!w) { root.innerHTML = '<div class="empty">That workout no longer exists. <a href="#/">Back to workouts</a></div>'; return; }
  setAudioSettings(state.settings);
  runner = new Runner(w, state.exMap, state.settings, {
    speak: (parts, delay) => speak(parts, delay),
    beep: (k, n, N) => beep(k, n, N),
    change: () => paint(),
    finish: s => showSummary(s),
  });
  const timed = runner.type !== 'rounds';
  root.innerHTML = `
  <div class="spread"><a class="btn sm" href="#/" id="back">← Workouts</a><span class="chip">${esc(w.type.toUpperCase())}</span></div>
  <h1 style="font-size:26px">${esc(w.name)}</h1>
  <section class="stage" aria-live="polite">
    <div class="spread"><span class="row" style="gap:8px"><span id="phase" class="chip rest">Ready</span><span id="bell" class="chip outline" hidden></span></span>
      <span class="row" style="gap:6px"><span class="small muted" id="scorelbl">${runner.type === 'amrap' ? 'Rounds' : ''}</span><b class="score" id="score"></b></span></div>
    <div class="clock" id="clock"></div>
    ${timed ? `<div class="row" role="group" aria-label="Adjust time" style="flex-wrap:nowrap;gap:6px"><button class="sm" data-adj="-300" aria-label="Remove 5 minutes">−5</button><button class="sm" data-adj="-60" aria-label="Remove 1 minute">−1</button><span class="small muted" id="tot" style="flex:1;text-align:center;white-space:nowrap"></span><button class="sm" data-adj="60" aria-label="Add 1 minute">+1</button><button class="sm" data-adj="300" aria-label="Add 5 minutes">+5</button></div>` : `<div class="small muted" id="tot"></div>`}
    <div class="bar"><i id="fill"></i></div>
    <div><div class="repsbig" id="reps"></div><h2 class="exname" id="exname"></h2></div>
    <p class="cue" id="cue"></p>
    <div class="links" id="links"></div>
    <button class="big" id="primary" disabled>Press Start</button>
    <div class="spread small"><span class="muted">Then: <b id="next" style="color:var(--ink)"></b></span><span class="status" id="awake">Screen sleeps normally</span></div>
    <div class="row"><button class="primary" id="play" style="min-width:120px">Start</button><button id="undo">↶ Undo</button><button id="end" class="ghost">Finish</button>
      <label class="row small" style="gap:6px;margin-left:auto"><input type="checkbox" id="pvoice" ${state.settings.voice ? 'checked' : ''}> Voice</label></div>
  </section>
  <section class="stack"><h2>Plan</h2><ul class="plist" id="plan"></ul></section>`;

  $('#play', root).onclick = async () => {
    unlockAudio();
    runner.toggle();
    if (runner.running) { last = performance.now(); loop(); if (state.settings.keepAwake) await keepAwake(true); }
    else keepAwake(false);
    paint();
  };
  $('#primary', root).onclick = () => runner.primary();
  $('#undo', root).onclick = () => runner.undo();
  $('#pvoice', root).onchange = e => setAudioSettings({ voice: e.target.checked });
  $$('[data-adj]', root).forEach(b => b.onclick = () => runner.adjustTime(+b.dataset.adj));
  confirmTap($('#end', root), 'Tap again to finish', () => { if (!runner.started) { location.hash = '#/'; return; } runner.finish(); });
  $('#back', root).addEventListener('click', e => {
    if (runner && runner.started && !runner.finished) {
      e.preventDefault();
      const b = e.currentTarget; if (b.dataset.armed) { location.hash = '#/'; return; }
      b.dataset.armed = '1'; b.textContent = 'Tap again to quit'; setTimeout(() => { delete b.dataset.armed; b.textContent = '← Workouts'; }, 3000);
    }
  });
  paint();
}

function loop() {
  cancelAnimationFrame(raf);
  const step = now => {
    if (!runner) return;
    const dt = Math.min(1, (now - last) / 1000); last = now;
    runner.tick(dt); paintClock();
    if (runner && runner.running) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

function paintClock() {
  if (!runner || !el) return;
  const r = runner, timed = r.type !== 'rounds';
  $('#clock', el).textContent = timed ? fmt(r.left) : fmt(r.elapsed);
  $('#tot', el).textContent = timed ? 'Total ' + fmt(r.total) + ' min' : `Elapsed · about ${fmt(Math.max(0, r.total - r.elapsed))} to go`;
  $('#fill', el).style.width = Math.min(100, (timed ? (r.total - r.left) / r.total : r.elapsed / Math.max(1, r.total)) * 100) + '%';
  if (['work', 'cardio', 'trans', 'rest'].includes(r.phase)) {
    $('#reps', el).textContent = fmt(r.phaseLeft);
    const lbl = { work: 'Work', cardio: 'Cardio', trans: 'Transition', rest: 'Rest' }[r.phase];
    $('#phase', el).textContent = `${lbl} ${Math.ceil(r.phaseLeft)}s`;
  } else if (r.phase === 'emomrest') {
    const leftInMin = 60 - (r.elapsed % 60); $('#reps', el).textContent = fmt(leftInMin); $('#phase', el).textContent = `Rest ${Math.ceil(leftInMin)}s`;
  }
}

function paint() {
  if (!runner || !el) return;
  const r = runner, c = r.current() || {}, n = r.peekNext();
  const ph = $('#phase', el), big = $('#primary', el);
  $('#score', el).textContent = r.scoreText();
  const show = (r.phase === 'trans' || r.phase === 'emomrest') && n ? n : c;
  $('#exname', el).textContent = (['rest', 'trans', 'emomrest'].includes(r.phase) ? 'Up next: ' : '') + (show.name || '');
  $('#cue', el).textContent = r.phase === 'rest' ? 'Breathe, shake it out, sip water.' : (show.cue || '');
  $('#reps', el).textContent = r.phase === 'move' || r.phase === 'ready' ? (c.reps || '') : $('#reps', el).textContent;
  const bl = $('#bell', el); const bb = show.bell; bl.hidden = !bb; if (bb) bl.textContent = bellLabel(bb);
  const q = encodeURIComponent((show.q || show.name || 'kettlebell'));
  $('#links', el).innerHTML = show.name ? `<a href="https://www.youtube.com/results?search_query=${q}+form+tutorial" target="_blank" rel="noopener">▶ Watch demo</a><a href="https://www.google.com/search?tbm=isch&q=${q}+exercise+diagram" target="_blank" rel="noopener">◧ See diagram</a>` : '';
  $('#next', el).textContent = n ? `${n.reps} ${n.name}` : 'Finish';
  const labels = { ready: 'Ready', move: r.type === 'emom' ? 'EMOM' : 'Go', work: 'Work', cardio: 'Cardio', trans: 'Transition', rest: 'Rest', emomrest: 'Rest', done: 'Finished' };
  ph.textContent = r.running || r.finished ? labels[r.phase] : (r.started ? 'Paused' : 'Ready');
  ph.className = 'chip ' + (['rest', 'trans', 'emomrest', 'done', 'ready'].includes(r.phase) || !r.running ? 'rest' : 'work');
  big.disabled = !r.running || r.finished || r.phase === 'emomrest';
  big.className = 'big' + (['rest', 'trans'].includes(r.phase) ? ' rest' : '');
  big.textContent = !r.started ? 'Press Start' : r.finished ? 'Finished' : r.phase === 'move' ? 'Done ✓ Next move' : r.phase === 'rest' ? 'Skip rest ▶' : r.phase === 'trans' ? 'Skip transition ▶' : r.phase === 'emomrest' ? 'Resting until next minute' : 'Skip ▶ (end early)';
  $('#play', el).textContent = r.finished ? 'Done' : r.running ? 'Pause' : r.started ? 'Resume' : 'Start';
  $('#play', el).disabled = r.finished;
  const aw = $('#awake', el); aw.classList.toggle('on', isAwake()); aw.textContent = isAwake() ? 'Screen stays on' : (r.running && state.settings.keepAwake ? 'Screen may sleep (set a longer timeout)' : 'Screen sleeps normally');
  paintPlan(); paintClock();
}

function paintPlan() {
  const r = runner, ul = $('#plan', el); ul.replaceChildren();
  const blocks = r.type === 'rounds' ? r.w.blocks.map((b, bi) => ({ b, bi })) : [{ b: { name: r.w.blocks.length > 1 ? 'Circuit' : (r.w.blocks[0] || {}).name || 'Circuit', items: r.flat }, bi: 0 }];
  blocks.forEach(({ b, bi }) => {
    const head = document.createElement('li'); head.className = 'blockhead';
    head.textContent = b.name + (r.type === 'rounds' ? ` · ${Math.max(1, +b.rounds || 1)} round${+b.rounds > 1 ? 's' : ''}${+b.restAfterRound ? ` · rest ${b.restAfterRound}s` : ''}` : '');
    ul.appendChild(head);
    let slot = 0;
    b.items.forEach((it, i) => {
      const c = r.type === 'rounds' && bi !== r.bi ? null : r.resolveAt(i, slot);
      if (it.kind === 'cardio') slot++;
      const rc = c || (r.type === 'rounds' ? (() => { const save = r.bi; r.bi = bi; const x = r.resolveAt(i, 0); r.bi = save; return x; })() : null);
      const li = document.createElement('li'); if (bi === r.bi && i === r.ii && r.started) li.className = 'now';
      const btn = document.createElement('button'); btn.type = 'button';
      btn.innerHTML = `<span class="t">${i + 1}</span><span class="n"></span><span class="r"></span>`;
      btn.querySelector('.n').textContent = rc ? rc.name : '';
      if (rc && rc.bell) btn.querySelector('.n').insertAdjacentHTML('beforeend', `<span class="bk">${esc(String(rc.bell))}#</span>`);
      btn.querySelector('.r').textContent = rc ? (rc.kind === 'cardio' ? '⚡ ' : '') + rc.reps : '';
      btn.disabled = !(bi === r.bi);
      btn.onclick = () => { if (bi === r.bi) r.jumpTo(i); };
      li.appendChild(btn); ul.appendChild(li);
    });
  });
}

function showSummary(s) {
  keepAwake(false); cancelAnimationFrame(raf);
  const sheet = document.createElement('div'); sheet.className = 'sheet';
  sheet.innerHTML = `<div class="panel" role="dialog" aria-label="Workout summary">
    <h2>Nice work</h2>
    <div class="tiles"><div class="tile"><b>${esc(s.score)}</b><span>${s.type === 'amrap' ? 'Rounds' : 'Completed'}</span></div>
      <div class="tile"><b>${fmt(s.durationSec)}</b><span>Time</span></div>
      <div class="tile"><b>${s.volume ? s.volume.toLocaleString() : s.reps}</b><span>${s.volume ? 'lb moved' : 'Reps'}</span></div></div>
    <label class="field">How hard was it? (1 easy, 10 max)<input type="range" id="rpe" min="1" max="10" value="7"><span id="rpev" class="small">7</span></label>
    <label class="field">Notes<textarea id="notes" placeholder="Bells used, how it felt, what to change next time"></textarea></label>
    <div class="row"><button class="primary" id="save">Save to history</button><button id="discard" class="ghost">Discard</button></div>
  </div>`;
  document.body.appendChild(sheet);
  $('#rpe', sheet).oninput = e => { $('#rpev', sheet).textContent = e.target.value; };
  $('#save', sheet).onclick = async () => {
    const rec = Object.assign({ id: uid('s') }, s, { rpe: +$('#rpe', sheet).value, notes: $('#notes', sheet).value.trim() });
    await db.put('sessions', rec); sheet.remove(); toast('Saved to history'); location.hash = '#/history/' + encodeURIComponent(rec.id);
  };
  confirmTap($('#discard', sheet), 'Tap again to discard', () => { sheet.remove(); location.hash = '#/'; });
}
