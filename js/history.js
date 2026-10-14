import { db } from './db.js';
import { $, $$, esc, state, toast, confirmTap, dateLabel } from './ui.js';
import { fmt } from './engine.js';

const DAY = 864e5;
function weekStart(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return d.getTime(); }

// Single-series SVG chart (bars or line) with tap/hover tooltips. One scale for marks, ticks and labels.
function chart(svgEl, points, { kind = 'bar', unit = '', fmtY = v => String(v) } = {}) {
  const W = 340, H = 180, padL = 34, padR = 10, padT = 14, padB = 26;
  const max = Math.max(1, ...points.map(p => p.y));
  const nice = (() => { const p = Math.pow(10, Math.floor(Math.log10(max))); const m = max / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; })();
  const x = i => padL + (points.length === 1 ? (W - padL - padR) / 2 : i * (W - padL - padR) / (points.length - (kind === 'bar' ? 0 : 1)));
  const bw = kind === 'bar' ? Math.max(6, (W - padL - padR) / points.length - 6) : 0;
  const y = v => padT + (H - padT - padB) * (1 - v / nice);
  const ticks = [0, nice / 2, nice];
  let s = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img">`;
  ticks.forEach(t => { s += `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}"/><text x="${padL - 6}" y="${y(t) + 4}" text-anchor="end">${fmtY(t)}</text>`; });
  const every = Math.ceil(points.length / 6);
  points.forEach((p, i) => { if (i % every === 0 || i === points.length - 1) s += `<text x="${x(i) + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(p.label)}</text>`; });
  if (kind === 'bar') points.forEach((p, i) => { const h = Math.max(0, y(0) - y(p.y)); if (h >= 5) s += `<path class="barf" d="M${x(i) + 1},${y(0)} v${-(h - 4)} q0,-4 4,-4 h${bw - 10} q4,0 4,4 v${h - 4} z"/>`; else if (h > 0) s += `<rect class="barf" x="${x(i) + 1}" y="${y(0) - h}" width="${bw - 2}" height="${h}"/>`; });
  else {
    s += `<path class="line" d="${points.map((p, i) => (i ? 'L' : 'M') + x(i) + ',' + y(p.y)).join(' ')}"/>`;
    points.forEach((p, i) => { s += `<circle class="dot" cx="${x(i)}" cy="${y(p.y)}" r="${i === points.length - 1 ? 5 : 4}"/>`; });
  }
  points.forEach((p, i) => { const cx = kind === 'bar' ? x(i) : x(i) - 12; s += `<rect class="hit" data-i="${i}" x="${cx}" y="${padT}" width="${kind === 'bar' ? bw : 24}" height="${H - padT - padB}"><title>${esc(p.tip)}</title></rect>`; });
  s += `<g class="tipg" visibility="hidden"><rect class="tip" rx="6" height="24"/><text class="tiptext"></text></g></svg>`;
  svgEl.innerHTML = s;
  const svg = svgEl.querySelector('svg'), g = svg.querySelector('.tipg'), tr = g.querySelector('rect'), tt = g.querySelector('text');
  const show = i => {
    const p = points[i]; tt.textContent = p.tip; const w = Math.min(W - 8, p.tip.length * 6.6 + 16);
    let tx = (kind === 'bar' ? x(i) + bw / 2 : x(i)) - w / 2; tx = Math.max(4, Math.min(W - w - 4, tx));
    const ty = Math.max(2, y(p.y) - 30); tr.setAttribute('x', tx); tr.setAttribute('y', ty); tr.setAttribute('width', w);
    tt.setAttribute('x', tx + 8); tt.setAttribute('y', ty + 16); g.setAttribute('visibility', 'visible');
  };
  svg.querySelectorAll('.hit').forEach(r => { r.addEventListener('pointerenter', () => show(+r.dataset.i)); r.addEventListener('click', () => show(+r.dataset.i)); });
  svg.addEventListener('pointerleave', () => g.setAttribute('visibility', 'hidden'));
}

export async function renderHistory(root) {
  const ss = (await db.all('sessions')).sort((a, b) => b.endedAt - a.endedAt);
  const now = Date.now(), wk = weekStart(now);
  const thisWeek = ss.filter(s => s.endedAt >= wk);
  const days = new Set(ss.map(s => new Date(s.endedAt).toDateString()));
  let streak = 0; for (let d = new Date(); ; d.setDate(d.getDate() - 1)) { if (days.has(d.toDateString())) streak++; else if (streak || d.toDateString() !== new Date().toDateString()) break; }
  root.innerHTML = `<h1>History</h1>
  <div class="tiles"><div class="tile"><b>${thisWeek.length}</b><span>Workouts this week</span></div>
    <div class="tile"><b>${Math.round(thisWeek.reduce((a, s) => a + s.durationSec, 0) / 60)}</b><span>Minutes this week</span></div>
    <div class="tile"><b>${streak}</b><span>Day streak</span></div></div>
  ${ss.length ? `<section class="card stack"><h2>Minutes per week</h2><div id="wkchart"></div></section>
  <section class="card stack"><div class="spread"><h2>Progress</h2><select id="wsel" aria-label="Workout"></select></div><div id="pchart"></div><p class="small muted" id="pnote"></p></section>` : ''}
  <section class="stack"><h2>Sessions</h2>${ss.length ? `<ul class="slist">${ss.map(s => `<li><a href="#/history/${encodeURIComponent(s.id)}">
    <span><b>${esc(s.workoutName)}</b><br><span class="when">${esc(dateLabel(s.endedAt))} · ${fmt(s.durationSec)}${s.rpe ? ' · RPE ' + s.rpe : ''}</span></span>
    <span class="sc">${esc(s.score || '')}<br><span class="when">${s.volume ? s.volume.toLocaleString() + ' lb' : (s.reps ? s.reps + ' reps' : '')}</span></span></a></li>`).join('')}</ul>`
    : '<div class="empty">Finish a workout and save it to start your history.</div>'}</section>`;
  if (!ss.length) return;

  const weeks = []; for (let i = 7; i >= 0; i--) weeks.push(wk - i * 7 * DAY);
  chart($('#wkchart', root), weeks.map(w0 => { const m = Math.round(ss.filter(s => s.endedAt >= w0 && s.endedAt < w0 + 7 * DAY).reduce((a, s) => a + s.durationSec, 0) / 60); const d = new Date(w0); const lbl = (d.getMonth() + 1) + '/' + d.getDate(); return { label: lbl, y: m, tip: `Week of ${lbl}: ${m} min` }; }), { kind: 'bar' });

  const byW = new Map(); ss.slice().reverse().forEach(s => { if (!byW.has(s.workoutId)) byW.set(s.workoutId, { name: s.workoutName, list: [] }); byW.get(s.workoutId).list.push(s); });
  const sel = $('#wsel', root);
  sel.innerHTML = [...byW.entries()].map(([id, v]) => `<option value="${esc(id)}">${esc(v.name)} (${v.list.length})</option>`).join('');
  const drawP = () => {
    const v = byW.get(sel.value); if (!v) return;
    const amrap = v.list[0].type === 'amrap';
    const pts = v.list.slice(-12).map(s => {
      const moves = s.log ? s.log.length : s.moves; const perRound = s.rounds ? Math.max(1, (moves - (s.partialMoves || 0)) / s.rounds) : 1;
      const val = amrap ? +(s.rounds + (s.partialMoves || 0) / perRound).toFixed(2) : (s.volume || s.reps || Math.round(s.durationSec / 60));
      const d = new Date(s.endedAt); return { label: (d.getMonth() + 1) + '/' + d.getDate(), y: val, tip: amrap ? `${s.score} rounds` : s.volume ? `${s.volume.toLocaleString()} lb` : `${val}` };
    });
    chart($('#pchart', root), pts, { kind: 'line', fmtY: v => Number.isInteger(v) ? String(v) : v.toFixed(1) });
    $('#pnote', root).textContent = amrap ? 'Rounds completed (partial rounds count as a fraction).' : v.list.some(s => s.volume) ? 'Total pounds moved (reps × bell weight).' : 'Reps completed.';
  };
  sel.onchange = drawP; drawP();
}

export async function renderSession(root, id) {
  const s = await db.get('sessions', id);
  if (!s) { root.innerHTML = '<div class="empty">Session not found. <a href="#/history">Back</a></div>'; return; }
  const rows = s.log || [];
  root.innerHTML = `<div class="spread"><a class="btn sm" href="#/history">← History</a><a class="btn sm primary" href="#/play/${encodeURIComponent(s.workoutId)}">▶ Do it again</a></div>
  <h1>${esc(s.workoutName)}</h1><p class="muted" style="margin:0">${esc(dateLabel(s.endedAt))}</p>
  <div class="tiles"><div class="tile"><b>${esc(s.score || '–')}</b><span>${s.type === 'amrap' ? 'Rounds' : 'Completed'}</span></div>
    <div class="tile"><b>${fmt(s.durationSec)}</b><span>Time</span></div>
    <div class="tile"><b>${s.volume ? s.volume.toLocaleString() : s.reps}</b><span>${s.volume ? 'lb moved' : 'Reps'}</span></div></div>
  <section class="card stack">
    <label class="field">Effort (RPE)<input type="range" id="rpe" min="1" max="10" value="${s.rpe || 7}"><span id="rpev" class="small">${s.rpe || 7}</span></label>
    <label class="field">Notes<textarea id="notes">${esc(s.notes || '')}</textarea></label>
    <div class="row"><button id="save" class="primary sm">Save notes</button><button id="del" class="danger ghost sm">Delete session</button></div>
  </section>
  <section class="stack"><h2>What you did</h2>${rows.length ? `<div class="tablewrap"><table class="log"><thead><tr><th>Round</th><th>Exercise</th><th>Reps / time</th><th>Bell</th><th>At</th></tr></thead><tbody>
    ${rows.map(l => `<tr><td>${esc(l.round)}</td><td>${esc(l.name)}</td><td>${l.timed ? l.work + ' s' : esc(l.reps)}</td><td>${esc(l.bell || '')}</td><td class="num">${fmt(l.t)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No moves were logged.</p>'}</section>`;
  $('#rpe', root).oninput = e => { $('#rpev', root).textContent = e.target.value; };
  $('#save', root).onclick = async () => { s.rpe = +$('#rpe', root).value; s.notes = $('#notes', root).value.trim(); await db.put('sessions', s); toast('Saved'); };
  confirmTap($('#del', root), 'Tap again to delete', async () => { await db.del('sessions', s.id); toast('Deleted'); location.hash = '#/history'; });
}
