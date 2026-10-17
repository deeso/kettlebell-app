// Review screen: read through a workout (blocks, moves, timing, loads, cues, videos) before starting it.
import { db } from './db.js';
import { esc, state, typeLabel, starButton, wireStars } from './ui.js';
import { targetText, CARDIO, LOADS, LOAD_KEYS, HIIT_LOAD_TIP, estimateSeconds, resolveItem, parseBell, bellShort } from './engine.js';

export async function renderReview(root, id) {
  const w = await db.get('workouts', id);
  if (!w) { root.innerHTML = '<div class="empty">That workout no longer exists. <a href="#/">Back to workouts</a></div>'; return; }
  const s = state.settings, loads = s.loads, cardioLen = +((w.cardio && w.cardio.len) || s.cardio.len || 30);
  const cardioType = (w.cardio && w.cardio.type) || s.cardio.type || 'mix';
  const cardioName = cardioType === 'mix' ? 'jump rope, fast feet or side-to-side hops' : (CARDIO[cardioType] || CARDIO.rope).name.toLowerCase();
  const moves = w.blocks.flatMap(b => b.items).filter(i => i.kind === 'move');
  const len = w.type === 'rounds' ? '~' + Math.round(estimateSeconds(w, cardioLen) / 60) + ' min' : Math.round(w.durationSec / 60) + ' min';
  const used = new Set(), resolved = w.blocks.map(b => b.items.map(it => {
    const c = resolveItem(it, state.exMap, cardioType === 'mix' ? 'rope' : cardioType, cardioLen, s.transition ?? 10);
    const p = parseBell(c.bell, loads); if (p && p.cat) used.add(p.cat);
    return c;
  }));
  const href = encodeURIComponent(w.id);
  const detail = c => c.timed ? `${c.work} s work${c.target ? ` · target ${esc(targetText(c.target))}` : ''}${c.trans ? ` · ${c.trans} s transition` : ''}` : `${esc(c.repsRaw || c.reps)} reps`;
  const blockHead = b => {
    const r = Math.max(1, +b.rounds || 1);
    if (w.type !== 'rounds') return 'Circuit';
    return `${r} round${r > 1 ? 's' : ''}${+b.restAfterRound ? ` · rest ${b.restAfterRound} s after each round` : ''}`;
  };
  const loadCats = LOAD_KEYS.filter(k => used.has(k));

  root.innerHTML = `
  <div class="spread"><a class="btn sm" href="#/">← Workouts</a><span class="chip">${esc(typeLabel(w.type))}</span></div>
  <div class="spread" style="flex-wrap:nowrap"><h1 style="font-size:28px">${esc(w.name)}</h1>${starButton(w.id)}</div>
  <div class="row small muted"><span>${len}</span><span>·</span><span>${moves.length} moves</span><span>·</span><span>${w.blocks.length} block${w.blocks.length === 1 ? '' : 's'}</span>
    ${w.type === 'amrap' ? '<span>·</span><span>As many rounds as possible</span>' : ''}</div>
  <div class="row"><a class="btn primary" href="#/play/${href}">▶ Start</a><a class="btn" href="#/edit/${href}">✎ Edit</a></div>
  ${w.notes ? `<section class="card stack"><h2>About this workout</h2><p class="small" style="margin:0">${esc(w.notes)}</p></section>` : ''}
  ${loadCats.length ? `<section class="card stack"><h2>Loads</h2>
    <ul class="rvloads">${loadCats.map(k => `<li><span class="chip">${esc(LOADS[k].label)} · ${esc(loads[k])} lb</span><span class="small muted">${esc(LOADS[k].guide)}</span></li>`).join('')}</ul>
    <p class="small muted" style="margin:0">${esc(HIIT_LOAD_TIP)} <a href="#/settings">Change load presets</a></p></section>` : ''}
  ${w.blocks.map((b, bi) => `<section class="card stack">
    <div class="spread"><h2>${esc(b.name)}</h2><span class="small muted">${blockHead(b)}</span></div>
    <ol class="rvlist">${resolved[bi].map((c, ii) => c.kind === 'cardio'
      ? `<li class="cardio"><span class="t">${ii + 1}</span><div><b>⚡ Cardio burst</b> <span class="small muted">· ${c.work} s, ${esc(cardioName)}</span></div></li>`
      : `<li><span class="t">${ii + 1}</span><div class="stack" style="gap:2px">
          <div class="spread" style="gap:6px"><b>${esc(c.name)}${c.bell ? `<span class="bk">${esc(bellShort(c.bell, loads))}</span>` : ''}</b><span class="small muted">${detail(c)}</span></div>
          ${c.cue ? `<span class="small muted">${esc(c.cue)}</span>` : ''}
          <a class="small" href="https://www.youtube.com/results?search_query=${encodeURIComponent(c.q || c.name)}+form+tutorial" target="_blank" rel="noopener">▶ Watch demo</a></div></li>`).join('')}</ol>
  </section>`).join('')}
  ${(w.links || []).length ? `<section class="card stack"><h2>Videos for this routine</h2><div class="links">${w.links.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener">▶ ${esc(l.title)}</a>`).join('')}</div></section>` : ''}
  <div class="row"><a class="btn primary" href="#/play/${href}">▶ Start workout</a><a class="btn" href="#/edit/${href}">✎ Edit</a></div>`;
  wireStars(root);
}
