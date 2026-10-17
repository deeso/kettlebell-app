// Workout engine: turns a workout definition into a running session.
// Types: 'amrap' (loop the circuit until the clock runs out), 'rounds' (blocks × rounds, then finish),
// 'emom' (a new move at the top of every minute). Items are reps (tap Done) or timed (work + transition).

export const CARDIO = {
  rope: { name: 'Jump rope', say: 'jump rope', cue: 'Light bounces on the balls of your feet, wrists turning the rope, elbows in. No rope? Shadow-skip the same rhythm.', q: 'jump rope basics beginner' },
  feet: { name: 'Fast feet', say: 'fast feet', cue: 'Quick, tiny steps on the balls of your feet, slight squat, arms pumping. As fast as you can.', q: 'fast feet drill' },
  hops: { name: 'Side-to-side hops', say: 'side to side hops', cue: 'Feet together, hop side to side over a line. Quick, light landings, knees soft.', q: 'lateral line hops exercise' },
};
const CARDIO_KEYS = ['rope', 'feet', 'hops'];

export const fmt = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

// Load categories. Workouts say "heavy" instead of a weight; Settings maps each category to one of your bells.
export const LOAD_KEYS = ['light', 'medium', 'heavy', 'xheavy'];
export const LOADS = {
  light: { label: 'Light', say: 'light', guide: '20+ fast, clean reps. Curls, triceps extensions, halos, bottoms-up work and warm-ups.' },
  medium: { label: 'Medium', say: 'medium', guide: '12 to 15 crisp reps. Presses, thrusters, flows, lunges, twists and snatches.' },
  heavy: { label: 'Heavy', say: 'heavy', guide: '8 to 10 strong reps. Swings, goblet squats, rows, cleans and floor press.' },
  xheavy: { label: 'Extra heavy', say: 'extra heavy', guide: '5 or 6 hard reps. Deadlifts, heavy swings, glute bridges and carries.' },
};
export const DEFAULT_LOADS = { light: 30, medium: 35, heavy: 45, xheavy: 60 };
export const HIIT_LOAD_TIP = 'For timed intervals, choose a bell you can keep moving for the whole work period with good form. If your form breaks before the beep, go down one category next round.';

// '45', '2x45', 'heavy', '2x heavy', 'extra heavy' -> { n: bells, cat, lb: pounds per bell }
export function parseBell(b, loads = DEFAULT_LOADS) {
  let s = String(b || '').trim().toLowerCase().replace(/\s*(lb|lbs|#)$/, ''); if (!s) return null;
  let n = 1; const m2 = /^2\s*[x×*]\s*(.+)$/.exec(s); if (m2) { n = 2; s = m2[1].trim(); }
  const cat = { light: 'light', l: 'light', medium: 'medium', med: 'medium', m: 'medium', heavy: 'heavy', h: 'heavy',
    xheavy: 'xheavy', 'x-heavy': 'xheavy', 'extra heavy': 'xheavy', 'extra-heavy': 'xheavy', xh: 'xheavy' }[s];
  if (cat) return { n, cat, lb: +((loads || DEFAULT_LOADS)[cat] || DEFAULT_LOADS[cat]) };
  const m1 = /(\d+(?:\.\d+)?)/.exec(s); return m1 ? { n, cat: null, lb: +m1[1] } : null;
}
export function bellPhrase(b) {
  const p = parseBell(b); if (!p) return '';
  if (p.cat) return p.n === 2 ? `two ${LOADS[p.cat].say} bells.` : `${LOADS[p.cat].say} bell.`;
  return p.n === 2 ? `two ${p.lb} pound bells.` : `${p.lb} pound bell.`;
}
export function bellLabel(b, loads) { // "Heavy bell · 45 lb", "2× Heavy bells · 45 lb each", "35 lb bell"
  const p = parseBell(b, loads); if (!p) return '';
  if (p.cat) return p.n === 2 ? `2× ${LOADS[p.cat].label} bells · ${p.lb} lb each` : `${LOADS[p.cat].label} bell · ${p.lb} lb`;
  return p.n === 2 ? `2×${p.lb} lb bells` : `${p.lb} lb bell`;
}
export function bellShort(b, loads) { // compact badge: "Heavy 45", "2× Light 30", "35#"
  const p = parseBell(b, loads); if (!p) return '';
  return p.cat ? `${p.n === 2 ? '2× ' : ''}${LOADS[p.cat].label} ${p.lb}` : `${p.n === 2 ? '2×' : ''}${p.lb}#`;
}
export function bellLoad(b, loads) { // total pounds moved per rep
  const p = parseBell(b, loads); return p ? p.n * p.lb : 0;
}
export function repCount(reps) { // numeric reps per set, doubling "/ side" and "each way"
  const n = /(\d+)/.exec(reps || ''); if (!n) return 0;
  return +n[1] * (/side|way/i.test(reps) ? 2 : 1);
}

// Resolve a workout item against the exercise library.
export function resolveItem(it, exMap, cardioKey, cardioLen, defTrans = 10) {
  if (it.kind === 'cardio') {
    const d = CARDIO[cardioKey] || CARDIO.rope;
    return { kind: 'cardio', name: d.name, vname: d.say, cue: d.cue, q: d.q, timed: true, work: cardioLen, trans: 0, bell: '', reps: fmt(cardioLen), cardioKey };
  }
  const ex = exMap.get(it.exId) || { name: it.name || 'Exercise', vname: (it.name || 'exercise').toLowerCase(), cue: '', q: it.name || 'kettlebell' };
  const timed = it.mode === 'time';
  const work = +it.work || 40, trans = it.trans == null || it.trans === '' ? +defTrans : +it.trans;
  const bell = it.bell != null && it.bell !== '' ? it.bell : (ex.bell || '');
  return { kind: 'move', exId: it.exId, name: ex.name, vname: ex.vname || ex.name.toLowerCase(), cue: ex.cue || '', q: ex.q || ex.name,
    timed, work, trans: timed ? trans : 0, reps: timed ? fmt(work) + (trans ? ` +${trans}s` : '') : (it.reps || ex.reps || '10'), repsRaw: it.reps || ex.reps || '', bell };
}

export function moveSeq(c, withNext) {
  if (c.kind === 'cardio') return [`${c.work} seconds, ${c.vname}. Go!`];
  const out = []; if (withNext) out.push('Next.');
  if (c.timed) out.push(`${c.work} seconds.`);
  else { const n = /(\d+)/.exec(c.repsRaw || c.reps || ''); if (n) out.push(n[1]); }
  out.push(c.vname.trim() + '.');
  if (!c.timed) { if (/side/i.test(c.repsRaw)) out.push('each side.'); else if (/way/i.test(c.repsRaw)) out.push('each way.'); }
  const bp = bellPhrase(c.bell); if (bp) out.push(bp);
  return out;
}

// Estimated length of a 'rounds' workout, counting reps moves as ~40 s.
export function estimateSeconds(w, cardioLen = 30) {
  if (w.type !== 'rounds') return w.durationSec || 0;
  let t = 0;
  w.blocks.forEach((b, bi) => {
    const one = b.items.reduce((s, it) => s + (it.kind === 'cardio' ? cardioLen : it.mode === 'time' ? (+it.work || 40) + (+it.trans || 0) : 40), 0);
    const r = Math.max(1, +b.rounds || 1);
    t += one * r + (+b.restAfterRound || 0) * (bi === w.blocks.length - 1 ? r - 1 : r);
  });
  return t;
}

export class Runner {
  constructor(workout, exMap, settings, hooks) {
    this.w = workout; this.exMap = exMap; this.s = settings; this.h = hooks;
    this.type = workout.type || 'amrap';
    this.cardioType = (workout.cardio && workout.cardio.type) || settings.cardio.type || 'mix';
    this.cardioLen = +((workout.cardio && workout.cardio.len) || settings.cardio.len || 30);
    this.countdown = +(workout.countdown || settings.countdown || 10);
    this.defTrans = settings.transition ?? 10; this.loads = settings.loads || DEFAULT_LOADS;
    // AMRAP and EMOM treat all blocks as one circuit.
    this.flat = this.type === 'rounds' ? null : workout.blocks.flatMap(b => b.items);
    this.total = this.type === 'rounds' ? estimateSeconds(workout, this.cardioLen) : (+workout.durationSec || 1800);
    this.reset();
  }

  reset() {
    this.running = false; this.started = false; this.finished = false;
    this.elapsed = 0; this.left = this.type === 'rounds' ? 0 : this.total;
    this.bi = 0; this.ri = 0; this.ii = 0; this.roundsDone = 0; this.movesDone = 0;
    this.phase = 'ready'; this.phaseLeft = 0; this.minute = 0;
    this.log = []; this.history = []; this.said = new Set(); this.cardioSlot = 0;
    this.startedAt = null;
  }

  // ---- position helpers ----
  items() { return this.type === 'rounds' ? this.w.blocks[this.bi].items : this.flat; }
  block() { return this.type === 'rounds' ? this.w.blocks[this.bi] : (this.w.blocks[0] || {}); }
  roundsInBlock() { return this.type === 'rounds' ? Math.max(1, +this.block().rounds || 1) : 0; }
  cardioKeyAt(slot) { return this.cardioType !== 'mix' ? this.cardioType : CARDIO_KEYS[slot % 3]; }
  current() { return this.resolveAt(this.ii, this.cardioSlot); }
  resolveAt(ii, slot) {
    const its = this.items(); const it = its[ii]; if (!it) return null;
    return resolveItem(it, this.exMap, this.cardioKeyAt(slot), this.cardioLen, this.defTrans);
  }
  peekNext() {
    const its = this.items();
    if (this.type === 'emom') return this.resolveAt((this.minute + 1) % its.length, this.cardioSlot + 1);
    const slot = this.cardioSlot + (its[this.ii] && its[this.ii].kind === 'cardio' ? 1 : 0);
    if (this.ii + 1 < its.length) return this.resolveAt(this.ii + 1, slot);
    if (this.type === 'rounds') {
      if (this.ri + 1 < this.roundsInBlock()) return this.resolveAt(0, slot);
      const nb = this.w.blocks[this.bi + 1]; if (!nb) return null;
      const it = nb.items[0]; return it ? resolveItem(it, this.exMap, this.cardioKeyAt(slot), this.cardioLen, this.defTrans) : null;
    }
    return this.resolveAt(0, slot);
  }
  scoreText() {
    if (this.type === 'rounds') return `Block ${this.bi + 1}/${this.w.blocks.length} · Round ${Math.min(this.ri + 1, this.roundsInBlock())}/${this.roundsInBlock()}`;
    if (this.type === 'emom') return `Minute ${this.minute + 1}`;
    const its = this.items(); const m = its.slice(0, this.ii).filter(x => x.kind !== 'cardio').length;
    return `${this.roundsDone}${m ? ' + ' + m : ''}`;
  }

  // ---- controls ----
  start() {
    if (this.finished) return;
    this.running = true;
    if (!this.started) {
      this.started = true; this.startedAt = Date.now();
      const intro = this.type === 'amrap' ? `${Math.round(this.total / 60)} minute AMRAP. Go!` : this.type === 'emom' ? `${Math.round(this.total / 60)} minute EMOM. Go!` : 'Workout. Go!';
      this.h.speak([intro]);
      this.enter(true, 1800);
    } else this.h.speak(['Resume.']);
    this.h.change();
  }
  pause() { this.running = false; this.h.speak(['Paused.']); this.h.change(); }
  toggle() { this.running ? this.pause() : this.start(); }

  snapshot() { const { bi, ri, ii, roundsDone, movesDone, phase, phaseLeft, cardioSlot, minute } = this; this.history.push({ bi, ri, ii, roundsDone, movesDone, phase, phaseLeft, cardioSlot, minute, logLen: this.log.length }); if (this.history.length > 50) this.history.shift(); }
  undo() { const s = this.history.pop(); if (!s) return; Object.assign(this, s); this.log.length = s.logLen; this.h.change(); }

  adjustTime(delta) {
    if (this.type === 'rounds') return 0;
    const nl = Math.max(60, Math.min(120 * 60, this.left + delta)); const d = nl - this.left; if (!d) return 0;
    this.left = nl; this.total = Math.max(60, this.total + d);
    for (const k of [...this.said]) if (typeof k === 'number' && k * 60 < this.left) this.said.delete(k);
    if (this.left > 60) this.said.delete('1m'); if (this.left > 30) this.said.delete('30s');
    if (this.finished && d > 0) { this.finished = false; this.phase = 'move'; }
    if (this.running) this.h.speak([d > 0 ? (Math.abs(d) >= 300 ? 'Added 5 minutes.' : 'Added 1 minute.') : (Math.abs(d) >= 300 ? 'Removed 5 minutes.' : 'Removed 1 minute.')]);
    this.h.change(); return d;
  }

  // Tap the big button: finish a reps move, or skip the current timed phase.
  primary() {
    if (!this.running || this.finished) return;
    if (this.phase === 'rest' || this.phase === 'trans' || this.phase === 'work' || this.phase === 'cardio') { this.phaseLeft = 0.001; return; }
    if (this.phase === 'emomrest') return;
    this.completeMove(); this.advance(false);
  }
  // Restart the current move's timer, or go back to the first move of this round (both can be undone).
  restartMove() {
    if (!this.started || this.finished || this.type === 'emom') return;
    this.snapshot();
    if ((this.phase === 'trans' || this.phase === 'rest') && this.phaseMax) this.phaseLeft = this.phaseMax;
    else this.enter(this.running);
    this.h.change();
  }
  restartRound() {
    if (!this.started || this.finished || this.type === 'emom') return;
    this.snapshot();
    const its = this.items(), round = this.type === 'rounds' ? `${this.bi + 1}.${this.ri + 1}` : String(this.roundsDone + 1);
    if (this.phase === 'rest') { this.history.pop(); return this.restartMove(); }
    this.cardioSlot -= its.slice(0, this.ii).filter(x => x.kind === 'cardio').length;
    while (this.log.length && this.log[this.log.length - 1].round === round) { this.log.pop(); this.movesDone--; }
    this.ii = 0; this.enter(false);
    if (this.running) this.h.speak(['Restart round.'].concat(moveSeq(this.current())));
    this.h.change();
  }
  jumpTo(ii) { this.snapshot(); this.ii = Math.max(0, Math.min(this.items().length - 1, ii)); if (this.running) this.enter(true); this.h.change(); }

  // ---- flow ----
  enter(announce, delay = 0) {
    const c = this.current(); if (!c) return;
    if (this.type === 'emom') {
      this.phase = c.timed ? (c.kind === 'cardio' ? 'cardio' : 'work') : 'move';
      this.phaseLeft = c.timed ? Math.min(c.work, Math.max(5, 60 - (this.elapsed % 60))) : 0;
    } else {
      this.phase = c.kind === 'cardio' ? 'cardio' : c.timed ? 'work' : 'move';
      this.phaseLeft = c.timed ? c.work : 0;
    }
    if (announce) this.h.speak(moveSeq(c, false), delay);
  }

  completeMove() {
    const c = this.current(); if (!c || c.kind === 'cardio') return;
    this.movesDone++;
    this.log.push({ exId: c.exId, name: c.name, timed: c.timed, work: c.timed ? c.work : 0, reps: c.timed ? '' : c.repsRaw, bell: c.bell, bellText: bellLabel(c.bell, this.loads), lb: bellLoad(c.bell, this.loads), round: this.type === 'rounds' ? `${this.bi + 1}.${this.ri + 1}` : String(this.roundsDone + 1), t: Math.round(this.elapsed) });
  }

  advance(auto, quiet) {
    this.snapshot();
    const its = this.items();
    if (its[this.ii] && its[this.ii].kind === 'cardio') this.cardioSlot++;
    this.h.beep(auto ? 'switch' : 'tap');
    if (this.type === 'emom') { this.phase = 'emomrest'; this.phaseLeft = 0; this.h.change(); return; }
    this.ii++;
    if (this.ii >= its.length) { this.endRound(); return; }
    this.enter(false);
    const c = this.current();
    this.h.speak(c.kind === 'cardio' ? moveSeq(c) : quiet ? ['Go!'] : moveSeq(c, true));
    this.h.change();
  }

  endRound() {
    this.ii = 0;
    if (this.type === 'amrap') {
      this.roundsDone++;
      const r = +(this.block().restAfterRound ?? this.s.restAfterRound) || 0;
      if (r > 0 && this.left > r + 5) { this.phase = 'rest'; this.phaseLeft = r; this.h.speak([`Round ${this.roundsDone} done.`, `Rest, ${r} seconds.`]); }
      else { this.enter(false); this.h.speak([`Round ${this.roundsDone} done.`].concat(moveSeq(this.current()))); }
      this.h.change(); return;
    }
    // rounds
    const b = this.block(); const r = +b.restAfterRound || 0;
    this.ri++;
    const lastBlock = this.bi === this.w.blocks.length - 1;
    let lead = [];
    if (this.ri >= this.roundsInBlock()) {
      if (lastBlock) { this.finish(); return; }
      this.bi++; this.ri = 0;
      lead = [`${this.block().name}.`];
    }
    if (r > 0) { this.phase = 'rest'; this.phaseLeft = r; const n = this.current(); this.h.speak([`Rest, ${r} seconds.`].concat(lead, ['Next.'], moveSeq(n, false))); }
    else { this.enter(false); this.h.speak(lead.concat(moveSeq(this.current(), !lead.length))); }
    this.h.change();
  }

  finish() {
    this.running = false; this.finished = true; this.phase = 'done'; this.left = 0;
    this.h.beep('end'); this.h.speak(['Time! Nice work.'], 400);
    this.h.change(); this.h.finish && this.h.finish(this.summary());
  }

  summary() {
    let reps = 0, volume = 0, timedSec = 0;
    for (const l of this.log) {
      if (l.timed) timedSec += l.work; else { const n = repCount(l.reps); reps += n; volume += n * (l.lb ?? bellLoad(l.bell, this.loads)); }
    }
    return {
      workoutId: this.w.id, workoutName: this.w.name, type: this.type,
      startedAt: this.startedAt || Date.now(), endedAt: Date.now(), durationSec: Math.round(this.elapsed),
      plannedSec: Math.round(this.total), rounds: this.roundsDone,
      partialMoves: this.type === 'amrap' ? this.items().slice(0, this.ii).filter(x => x.kind !== 'cardio').length : 0,
      moves: this.movesDone, reps, volume: Math.round(volume), timedSec, log: this.log.slice(),
      score: this.type === 'amrap' ? this.scoreText() : this.type === 'emom' ? `${this.movesDone} moves` : `${this.movesDone} moves`,
    };
  }

  // ---- clock ----
  tick(dt) {
    if (!this.running || this.finished) return;
    this.elapsed += dt;
    if (this.type !== 'rounds') {
      const prev = Math.ceil(this.left); this.left -= dt; const w = Math.ceil(this.left);
      if (w !== prev) {
        if (w > 0 && w <= this.countdown) this.h.beep('count', w, this.countdown);
        const m = w / 60;
        if (Number.isInteger(m) && m > 0 && m % 5 === 0 && w < this.total - 5 && !this.said.has(m)) { this.said.add(m); this.h.speak([`${m} minutes left.`]); }
        if (w === 60 && !this.said.has('1m')) { this.said.add('1m'); this.h.speak(['One minute left. Finish strong.']); }
        if (w === 30 && !this.said.has('30s')) { this.said.add('30s'); this.h.speak(['30 seconds.']); }
      }
      if (this.left <= 0) { this.finish(); return; }
    }
    if (this.type === 'emom') {
      const minNow = Math.floor(this.elapsed / 60);
      const intoMin = this.elapsed - minNow * 60;
      if (60 - intoMin <= 3 && !this.said.has('m' + minNow + '-' + Math.ceil(60 - intoMin))) {
        this.said.add('m' + minNow + '-' + Math.ceil(60 - intoMin)); this.h.beep('count', Math.ceil(60 - intoMin), 3);
      }
      if (minNow !== this.minute) {
        if (this.phase === 'work') this.completeMove();
        if (this.items()[this.ii] && this.items()[this.ii].kind === 'cardio') this.cardioSlot++;
        this.minute = minNow; this.ii = minNow % this.items().length; this.h.beep('switch');
        this.enter(false); this.h.speak(moveSeq(this.current(), false)); this.h.change(); return;
      }
    }
    if (this.phaseLeft > 0 && ['work', 'cardio', 'trans', 'rest'].includes(this.phase)) {
      const key = [this.phase, this.bi, this.ri, this.ii].join('.');
      if (key !== this.phaseKey) { this.phaseKey = key; this.phaseMax = this.phaseLeft; }
      const before = Math.ceil(this.phaseLeft); this.phaseLeft -= dt; const after = Math.ceil(this.phaseLeft);
      if (after !== before && after > 0) {
        const len = this.phase === 'trans' ? Math.min(3, this.countdown) : this.phase === 'rest' ? this.countdown : Math.min(this.countdown, Math.max(1, Math.floor((this.current() || {}).work / 2 || 5)));
        if (after <= len && !(this.type !== 'rounds' && Math.ceil(this.left) <= this.countdown)) this.h.beep('count', after, len);
        if (this.phase === 'rest' && after === 10 && this.type === 'amrap') this.h.speak(['10 seconds. Get ready.']);
      }
      if (this.phaseLeft <= 0) { this.phaseLeft = 0; this.phaseEnd(); }
    }
  }

  phaseEnd() {
    const c = this.current();
    if (this.phase === 'rest') {
      this.h.beep('switch'); this.enter(false);
      this.h.speak(this.type === 'amrap' ? ['Rest over. Go!'].concat(moveSeq(this.current())) : ['Go!']);
      this.h.change(); return;
    }
    if (this.type === 'emom' && (this.phase === 'work' || this.phase === 'cardio')) { this.completeMove(); this.phase = 'emomrest'; this.h.beep('switch'); this.h.speak(['Rest.']); this.h.change(); return; }
    if (this.phase === 'work') {
      this.completeMove();
      const its = this.items(); const lastInRound = this.ii === its.length - 1;
      const restOn = +(this.block().restAfterRound || 0) > 0;
      if (c.trans > 0 && !(lastInRound && restOn)) {
        this.snapshot(); this.phase = 'trans'; this.phaseLeft = c.trans; this.h.beep('switch');
        const n = this.peekNext(); this.h.speak(['Transition.'].concat(n ? moveSeq(n, true) : []));
        this.h.change(); return;
      }
      this.advance(true); return;
    }
    if (this.phase === 'trans') { this.phase = 'work'; this.advance(true, true); return; }
    if (this.phase === 'cardio') { this.advance(true); return; }
  }
}
