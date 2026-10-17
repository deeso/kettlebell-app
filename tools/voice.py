"""Generate the recorded voice pack: voice/*.mp3 plus voice/index.json (spoken text -> file).

Uses the Kokoro text-to-speech model (https://github.com/thewh1teagle/kokoro-onnx).
  pip install kokoro-onnx soundfile
  download kokoro-v1.0.int8.onnx and voices-v1.0.bin from that repo's releases
  python tools/voice.py --model kokoro.onnx --voices voices.bin [--cache DIR]

Re-run it after adding exercises to js/seed.js so new names get recordings.
Custom exercises you add in the app use the phone's own voice until recorded.
"""
import argparse, hashlib, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def say_text(t):  # must match sayText() in js/audio.js
    t = re.sub(r'\bKB\b', 'kettlebell', t).replace('&', ' and ').replace('+', ' and ')
    t = re.sub(r'\s*[—–]\s*', ', ', t).replace('(', '').replace(')', '')
    return re.sub(r'\s+', ' ', t).strip()

def phrases():
    seed_js = open(os.path.join(ROOT, 'js', 'seed.js'), encoding='utf-8').read()
    seed = json.loads(seed_js[seed_js.index('{'):seed_js.rindex('}') + 1])
    p = []
    p += [e['vname'].strip() + '.' for e in seed['exercises'] if e.get('vname')]
    p += [b['name'] + '.' for w in seed['workouts'] for b in w['blocks']]
    p += [str(n) for n in range(1, 51)]
    p += ['Next.', 'each side.', 'each way.', 'Go!', 'Transition.', 'Rest.', 'Resume.', 'Paused.', 'Workout. Go!',
          'Time! Nice work.', 'One minute left. Finish strong.', '30 seconds.', '10 seconds. Get ready.', 'Rest over. Go!',
          'Restart round.', 'Added 5 minutes.', 'Added 1 minute.', 'Removed 5 minutes.', 'Removed 1 minute.']
    p += [f'{n} seconds.' for n in list(range(5, 305, 5)) + [360, 420, 480, 540, 600]]
    p += [f'Rest, {n} seconds.' for n in list(range(5, 185, 5)) + [240, 300]]
    p += [f'Round {n} done.' for n in range(1, 41)]
    p += [f'Aim for {n}.' for n in range(1, 81)]
    p += [f'{n} minutes left.' for n in range(5, 120, 5)]
    p += [f'{n} minute AMRAP. Go!' for n in range(5, 125, 5)] + [f'{n} minute EMOM. Go!' for n in range(5, 125, 5)]
    for L in (20, 30, 45, 60):
        for say in ('jump rope', 'fast feet', 'side to side hops'):
            p.append(f'{L} seconds, {say}. Go!')
    bells = sorted(set(list(range(5, 105, 5)) + [8, 12, 18, 26, 53, 62, 70, 88]))
    p += [f'{b} pound bell.' for b in bells] + [f'two {b} pound bells.' for b in range(10, 80, 5)]
    loads = ['light', 'medium', 'heavy', 'extra heavy']  # must match LOADS in js/engine.js
    p += [f'{l} bell.' for l in loads] + [f'two {l} bells.' for l in loads]
    seen, out = set(), []
    for x in p:
        k = say_text(x)
        if k and k not in seen: seen.add(k); out.append(k)
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', required=True); ap.add_argument('--voices', required=True)
    ap.add_argument('--voice', default='am_michael'); ap.add_argument('--cache', default=None)
    a = ap.parse_args()
    from kokoro_onnx import Kokoro
    import soundfile as sf
    k = Kokoro(a.model, a.voices)
    outdir = os.path.join(ROOT, 'voice'); os.makedirs(outdir, exist_ok=True)
    index = {}
    for t in phrases():
        h = hashlib.md5(t.encode()).hexdigest()[:12]; fn = h + '.mp3'; dst = os.path.join(outdir, fn)
        index[t] = fn
        if os.path.exists(dst): continue
        if a.cache and os.path.exists(os.path.join(a.cache, fn)):
            subprocess.run(['cp', os.path.join(a.cache, fn), dst], check=True); continue
        spoken = t.replace('60 seconds', 'sixty seconds')
        audio, sr = k.create(spoken, voice=a.voice, speed=1.05, lang='en-us')
        wav = dst[:-4] + '.wav'; sf.write(wav, audio, sr)
        trim = 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse'
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', wav, '-af', 'loudnorm=I=-14:TP=-1,' + trim,
                        '-ac', '1', '-ar', '22050', '-b:a', '40k', dst], check=True)
        os.remove(wav)
    # remove clips no longer referenced
    keep = set(index.values())
    for f in os.listdir(outdir):
        if f.endswith('.mp3') and f not in keep: os.remove(os.path.join(outdir, f))
    json.dump(index, open(os.path.join(outdir, 'index.json'), 'w'), indent=0, sort_keys=True)
    print(len(index), 'clips')

if __name__ == '__main__':
    main()
