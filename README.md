# Kettlebell Timer

An installable, offline-first workout app for kettlebell and bodyweight training. It runs in Chrome on Android (and other modern browsers) and installs to the home screen.

## What it does

- **Workout builder:** AMRAP, Rounds (blocks × rounds, good for intervals) and EMOM workouts. Each move is **reps** (tap Done) or **time** (work + transition). It also supports cardio bursts, rest after rounds, countdown beeps, and duration you can change mid-workout.
- **Player:** recorded voice calls ("Next. 10. Romanian deadlifts. 60 pound bell."), beeps that get louder as they count down, form cues and demo links. It keeps the screen on and plays alongside your music without pausing it.
- **Library:** your exercises (name, spoken name, form cue, defaults, tags) and bell inventory.
- **Load categories:** workouts say *light*, *medium*, *heavy* or *extra heavy* (or *2x heavy* for two bells) instead of exact weights. Settings → Load presets sets which bell each category means, and every workout follows it. Each category has a short guide for choosing a bell, aimed at timed HIIT intervals.
- **Stars:** tap ☆ on a workout card or its Review screen to star it. Starred workouts sort to the top, and an All / Starred switch filters the list.
- **Review:** open any workout to read every block, move, time, load, form cue and demo link before you start.
- **Transitions and restarts:** set a default transition time in Settings (or apply one to every timed move in a block in the builder). During a workout, *Restart move* restarts the current timer and *Restart round* goes back to the first move of the round.
- **History:** every finished workout is saved with score, time, reps, pounds moved, effort (RPE) and notes. It shows weekly minutes and per-workout progress charts.
- **Your data:** stored on the device (IndexedDB). Back up or restore to a JSON file, export history as CSV, and share single workouts as files.

## Install on your phone

1. Open the GitHub Pages link in **Chrome**.
2. Menu ⋮ → **Install app** (or **Add to Home screen**).
3. Open it once while online so everything (including the voice clips) is saved for offline use.

## Project layout

```
index.html, manifest.webmanifest, sw.js   app shell, install metadata, offline cache
css/app.css                               styles (light and dark)
js/app.js        routing, Workouts and Settings screens
js/player.js     workout player screen
js/engine.js     workout engine (AMRAP / Rounds / EMOM state machine)
js/builder.js    workout editor
js/library.js    exercises and bells
js/history.js    history, charts, session detail
js/review.js     read-through of a workout before starting
js/db.js         IndexedDB storage, seeding, backup/restore
js/audio.js      beeps, recorded voice, wake lock
js/seed.js       built-in exercises and workouts (generated)
voice/           recorded voice clips + index.json
tools/           scripts that generate seed.js and the voice pack
```

No build step: it's plain ES modules, so you can edit and push. GitHub Pages serves it as-is.

## Updating

- After changing files, bump `VERSION` in `sw.js` (and `APP_VERSION` in `index.html`) so phones pick up the new version on the next launch.
- New exercise names need recorded voice: run `python tools/voice.py --model kokoro.onnx --voices voices.bin` (see the script header). Until then the phone's built-in voice is used for those names.

## Run locally

```
python3 -m http.server 8080
```
Then open http://localhost:8080.
