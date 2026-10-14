// Beeps (Web Audio), recorded voice clips (voice/index.json), speech fallback, and screen wake lock.
// Web Audio does not take audio focus on Android, so your music keeps playing.

let ctx = null, master = null, input = null;
let settings = { beeps: true, voice: true, beepVolume: 100 };
export function setAudioSettings(s) { settings = Object.assign(settings, s); }

export function getCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 6; comp.ratio.value = 8; comp.attack.value = 0.002; comp.release.value = 0.1;
    master = ctx.createGain(); master.gain.value = 2.2;
    comp.connect(master); master.connect(ctx.destination); input = comp;
  }
  return ctx;
}
export function unlockAudio() { try { const a = getCtx(); if (a.state !== 'running') a.resume(); } catch (e) { } preloadVoice(); }

function tone(f, d, level) {
  if (!settings.beeps) return;
  try {
    const a = getCtx(), t = a.currentTime, vol = Math.max(.05, Math.min(1, level)) * (settings.beepVolume / 100);
    [['square', 1, .55], ['triangle', 2, .45]].forEach(([type, mult, mix]) => {
      const o = a.createOscillator(), g = a.createGain();
      o.type = type; o.frequency.value = f * mult; o.connect(g); g.connect(input);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * mix, t + .008);
      g.gain.setValueAtTime(vol * mix, t + d * .7); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.start(t); o.stop(t + d + .02);
    });
  } catch (e) { }
}
// kind: 'count' (n of N, louder and higher toward 1), 'switch', 'tap', 'end', 'rest'
export function beep(kind, n, N) {
  if (kind === 'count') { const step = N > 1 ? (N - n) / (N - 1) : 1; tone(600 + step * 500, .12 + step * .08, .3 + step * .7); }
  else if (kind === 'switch') tone(1320, .4, 1);
  else if (kind === 'tap') tone(1100, .12, .7);
  else if (kind === 'end') tone(1320, .8, 1);
  else if (kind === 'rest') tone(520, .4, 1);
}

// ---------- voice ----------
export function sayText(t) {
  return String(t).replace(/\bKB\b/g, 'kettlebell').replace(/&/g, ' and ').replace(/\+/g, ' and ')
    .replace(/\s*[—–]\s*/g, ', ').replace(/[()]/g, '').replace(/\s+/g, ' ').trim();
}
let index = null, indexP = null;
const bufs = new Map();
function loadIndex() {
  if (!indexP) indexP = fetch('voice/index.json').then(r => r.ok ? r.json() : {}).catch(() => ({})).then(j => (index = j));
  return indexP;
}
loadIndex();
function decode(key) {
  if (!index || !index[key]) return Promise.resolve(null);
  if (!bufs.has(key)) {
    bufs.set(key, fetch('voice/' + index[key]).then(r => r.arrayBuffer())
      .then(ab => new Promise((res, rej) => { const p = getCtx().decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); }))
      .catch(() => null));
  }
  return bufs.get(key);
}
let preloaded = false;
export async function preloadVoice() {
  if (preloaded) return; preloaded = true;
  await loadIndex();
  // Fetch all clips so they play instantly and are cached for offline use.
  const keys = Object.keys(index || {});
  for (let i = 0; i < keys.length; i += 12) await Promise.all(keys.slice(i, i + 12).map(decode));
}
export function hasClip(text) { return !!(index && index[sayText(text)]); }

let sources = [];
const synth = window.speechSynthesis || null;
function tts(text) {
  if (!synth) return;
  try { const u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.rate = 1.02; synth.speak(u); } catch (e) { }
}
export function speak(parts, delay = 0) {
  if (!settings.voice || !parts || !parts.length) return;
  const keys = parts.map(sayText).filter(Boolean);
  setTimeout(async () => {
    await loadIndex();
    let a; try { a = getCtx(); if (a.state !== 'running') a.resume(); } catch (e) { return; }
    sources.forEach(s => { try { s.stop(); } catch (e) { } }); sources = [];
    try { synth && synth.cancel(); } catch (e) { }
    const list = await Promise.all(keys.map(decode));
    let t = a.currentTime + 0.04;
    keys.forEach((k, i) => {
      const b = list[i];
      if (b) { const src = a.createBufferSource(); src.buffer = b; src.connect(input); src.start(t); sources.push(src); t += b.duration + 0.06; }
      else { const at = Math.max(0, (t - a.currentTime) * 1000); setTimeout(() => tts(k), at); t += 0.9; }
    });
  }, delay);
}

// ---------- screen wake lock ----------
let lock = null, wantLock = false;
export async function keepAwake(on) {
  wantLock = on;
  if (!on) { try { lock && await lock.release(); } catch (e) { } lock = null; return false; }
  try { if ('wakeLock' in navigator) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); return true; } } catch (e) { }
  return false;
}
export function isAwake() { return !!lock; }
document.addEventListener('visibilitychange', () => { if (wantLock && document.visibilityState === 'visible' && !lock) keepAwake(true); });
