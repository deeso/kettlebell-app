// Tiny IndexedDB wrapper. Stores: exercises, workouts, sessions, kv (settings).
import { SEED } from './seed.js';

const DB_NAME = 'kettlebell-app';
const DB_VERSION = 1;
const STORES = ['exercises', 'workouts', 'sessions', 'kv'];
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: s === 'kv' ? 'key' : 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const st = t.objectStore(store);
    let out;
    Promise.resolve(fn(st)).then(v => { out = v; });
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}
const req2p = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const db = {
  all: store => tx(store, 'readonly', st => req2p(st.getAll())),
  get: (store, id) => tx(store, 'readonly', st => req2p(st.get(id))),
  put: (store, obj) => tx(store, 'readwrite', st => req2p(st.put(obj))),
  del: (store, id) => tx(store, 'readwrite', st => req2p(st.delete(id))),
  clear: store => tx(store, 'readwrite', st => req2p(st.clear())),
  putMany: (store, arr) => tx(store, 'readwrite', st => Promise.all(arr.map(o => req2p(st.put(o))))),
};

export const uid = (p = 'id') => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const DEFAULT_SETTINGS = {
  bells: SEED.bells,
  voice: true, beeps: true, beepVolume: 100,
  countdown: 10, restAfterRound: 60,
  cardio: { type: 'mix', len: 30 },
  keepAwake: true,
  units: 'lb',
};

export async function getSettings() {
  const row = await db.get('kv', 'settings');
  return Object.assign({}, DEFAULT_SETTINGS, row ? row.value : {});
}
export async function saveSettings(value) { await db.put('kv', { key: 'settings', value }); }

// First run: load the seed. Later seed versions add new items without touching edits.
export async function ensureSeed() {
  const row = await db.get('kv', 'seedVersion');
  const have = row ? row.value : 0;
  if (have >= SEED.version) return;
  const [exs, wos] = await Promise.all([db.all('exercises'), db.all('workouts')]);
  const exIds = new Set(exs.map(e => e.id)), woIds = new Set(wos.map(w => w.id));
  await db.putMany('exercises', SEED.exercises.filter(e => !exIds.has(e.id)).map(e => ({ ...e, builtIn: true })));
  await db.putMany('workouts', SEED.workouts.filter(w => !woIds.has(w.id)).map(w => ({ ...w, builtIn: true, updatedAt: Date.now() })));
  if (!row) await saveSettings(DEFAULT_SETTINGS);
  await db.put('kv', { key: 'seedVersion', value: SEED.version });
}

// ---------- Backup ----------
export async function exportAll() {
  const [exercises, workouts, sessions, settings] = await Promise.all([db.all('exercises'), db.all('workouts'), db.all('sessions'), getSettings()]);
  return { app: 'kettlebell-app', format: 1, exportedAt: new Date().toISOString(), settings, exercises, workouts, sessions };
}

export async function importAll(data, mode = 'merge') {
  if (!data || data.app !== 'kettlebell-app') throw new Error('This file is not a Kettlebell app backup.');
  if (mode === 'replace') { for (const s of ['exercises', 'workouts', 'sessions']) await db.clear(s); }
  const counts = {};
  for (const s of ['exercises', 'workouts', 'sessions']) {
    const arr = Array.isArray(data[s]) ? data[s].filter(o => o && o.id) : [];
    await db.putMany(s, arr); counts[s] = arr.length;
  }
  if (data.settings && mode === 'replace') await saveSettings(Object.assign({}, DEFAULT_SETTINGS, data.settings));
  return counts;
}

// A single workout (with the exercises it uses) as a shareable file.
export async function exportWorkout(id) {
  const w = await db.get('workouts', id);
  const exIds = new Set(w.blocks.flatMap(b => b.items.filter(i => i.kind === 'move').map(i => i.exId)));
  const exercises = (await db.all('exercises')).filter(e => exIds.has(e.id));
  return { app: 'kettlebell-app', format: 1, kind: 'workout', exportedAt: new Date().toISOString(), workouts: [w], exercises, sessions: [] };
}
