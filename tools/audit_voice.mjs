// List every phrase the app speaks for the built-in workouts that has no recorded clip in voice/index.json.
//   node tools/audit_voice.mjs
// Phrases without a clip fall back to the phone's own voice; run tools/voice.py to record them.
// Exits 1 if anything is missing.
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
globalThis.window = {}; globalThis.document = { addEventListener() {} }; globalThis.fetch = async () => ({ ok: false });
const { SEED } = await import(pathToFileURL(root + '/js/seed.js'));
const E = await import(pathToFileURL(root + '/js/engine.js'));
const { sayText } = await import(pathToFileURL(root + '/js/audio.js'));
const index = JSON.parse(fs.readFileSync(root + '/voice/index.json', 'utf8'));
const ex = new Map(SEED.exercises.map(e => [e.id, e]));
const need = new Map(); const add = (p, where) => { const k = sayText(p); if (k && !need.has(k)) need.set(k, where); };
['Workout. Go!', 'Resume.', 'Paused.', 'Added 5 minutes.', 'Added 1 minute.', 'Removed 5 minutes.', 'Removed 1 minute.', 'Restart round.',
 'Time! Nice work.', 'One minute left. Finish strong.', '30 seconds.', '10 seconds. Get ready.', 'Rest over. Go!', 'Go!', 'Rest.', 'Transition.', 'Next.']
  .forEach(p => add(p, 'engine'));
for (const w of SEED.workouts) {
  const total = w.type === 'rounds' ? E.estimateSeconds(w, w.cardio?.len || 30) : w.durationSec || 1800;
  if (w.type === 'amrap') add(`${Math.round(total / 60)} minute AMRAP. Go!`, w.id);
  if (w.type === 'emom') add(`${Math.round(total / 60)} minute EMOM. Go!`, w.id);
  if (w.type !== 'rounds') for (let m = 5; m * 60 < total; m += 5) add(`${m} minutes left.`, w.id);
  const rounds = w.type === 'rounds' ? 0 : 40; // AMRAP and EMOM say "Round N done."
  for (const b of w.blocks) {
    add(`${b.name}.`, w.id);
    if (+b.restAfterRound > 0) add(`Rest, ${+b.restAfterRound} seconds.`, w.id);
    for (const it of b.items) for (const ck of ['rope', 'feet', 'hops']) {
      const c = E.resolveItem(it, ex, ck, w.cardio?.len || 30);
      for (const p of E.moveSeq(c, true)) add(p, w.id + ' / ' + (c.name));
    }
  }
  for (let r = 1; r <= rounds; r++) add(`Round ${r} done.`, w.id);
}
const missing = [...need].filter(([k]) => !index[k]);
console.log(need.size, 'phrases,', missing.length, 'missing');
for (const [k, where] of missing) console.log(' ', JSON.stringify(k), '<-', where);
process.exit(missing.length ? 1 : 0);
