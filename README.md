# Fieldy

Desktop app for automated audio ingest, classification, metadata tagging, library management, and in-app playback. Inspired by a highly simplified Soundly workflow: drop recordings, keep the original file untouched, classify from an in-memory 16 kHz mono view using **0.96 s patches**, then move or copy the original into a folder named after the winning **AudioSet class** (or `Mixed`).

Architecture for agents: `.cursor/rules/` (always-on `00-architecture.mdc`) plus `docs/ARCHITECTURE.md`. History of the original 11 phases: `docs/IMPLEMENTATION.md`.

**Status (2026-09-22):** Original phases **1–11 are done**, plus later UX: move/copy ingest, undo/redo, WAV/AIFF/FLAC/MP3, drop-zone progress, library-root relocate/fresh, placement why, row select + keyboard/batch, sample-tool player (level, loop, autoplay, pitch/tempo), window chrome and empty states. Product name is **Fieldy** (repo `/Users/davidpieri/Fieldy`). Tests: `python -m pytest python/tests -q` only — no Electron UI tests.

## What the app does

- First run: pick a **library root** and whether drops **move or copy**. Folders are AudioSet class names created on demand, plus **`Mixed`**.
- Drop WAV, AIFF, FLAC, or MP3 files or folders. Python classifies them. **Move** (default) tags the original and relocates it; **Copy** (Settings) leaves the original untagged and adds a tagged library file. Undo reverses the last drop. The drop zone shows overall progress while files are added.
- Destination is the top **non-Silence** class from YAMNet frames (mean-pool active patches so long quiet forest takes are not all filed as Silence). Silence may still appear as a tag.
- Library explorer: **Libraries** (Recently added, Starred, user collections) plus class folders. Top **app bar** (inline logo, Show/Hide drop zone, Undo/Redo, Settings). Click rows to select; Space / arrows / Delete / F2 / S. Move (existing folders only, or drag onto a folder; batch on selection), star, collections (Fieldy-only lists, not disk folders), rename / delete / reclassify / Settings via the shared in-app **dialog** (not `window.prompt` / `window.confirm`). **Reclassify** on a file or folder. Right-click for Show in Finder and the same actions. Drag originals out to Finder or a DAW.
- **▶** plays in a bottom player (waveform, level, loop, rewind, pitch/tempo, autoplay) when a file is selected. Chromium hears a temp 16-bit copy; the library file stays in its original format.

## Stack

| Layer | Tech |
| --- | --- |
| Desktop UI | Electron (HTML/CSS/JS), context isolation + preload (`window.fieldy`) |
| Backend | Python 3.12 child process, NDJSON over stdin/stdout |
| Analysis | YAMNet via TensorFlow Hub (native long-file framing) |
| Audio I/O | `soundfile` + `soxr` for 16 kHz mono analysis; temp PCM_16 for playback only |
| Tags | `mutagen` (`Fieldy`) on the **original** file (ID3 on WAV/AIFF/MP3, Vorbis on FLAC) |

## Dev environment

Python **3.12** (not macOS `/usr/bin/python3`) and **Node.js**. On this machine: Homebrew `python@3.12` and `node`.

```bash
brew install python@3.12 node

cd /Users/davidpieri/Fieldy
/opt/homebrew/bin/python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -U pip wheel
pip install -r python/requirements.txt

cd electron
npm install
# if Electron’s binary is missing:
node node_modules/electron/install.js

cd /Users/davidpieri/Fieldy
python -c "import tensorflow as tf, tensorflow_hub as hub; print(tf.__version__, hub.__version__)"
python -m pytest python/tests -q
python scripts/fetch_yamnet.py
printf '%s\n' '{"id":"1","method":"ping"}' | python python/main.py
npm start
```

Electron spawns `.venv/bin/python` when developing (`PYTHONUNBUFFERED=1`, `FIELDY_ROOT` = repo). Packaged builds spawn `python-runtime` from extraResources. The listening model is `models/yamnet` (gitignored; fetch script above) — not downloaded on first drop.

Root `npm start` runs `npm start --prefix electron`. Optional unpacked `.app`: `npm run pack` (copies `.venv` → `python-runtime` on this Mac only; not a signed installer).

Reset onboarding: quit the app, delete `~/.Fieldy/pointer.json` (legacy `~/.soundly-lite/pointer.json` is still read if the new pointer is missing).

## Directory layout

```
Fieldy/
├── electron/                 # Desktop shell (main, preload, renderer)
├── python/                   # Automation + classifier
│   └── core/                 # config, preprocess, classifier, mapper, playback, …
├── config/                   # yamnet_class_map.csv, audioset_ontology.json, schema
├── data/                     # Optional library root (gitignored audio)
└── .cursor/rules/
```

## IPC

See `.cursor/rules/03-ipc-bridge.mdc`. Python is long-lived. Renderer never mutates the filesystem.

## Not in the app yet

Auto-slicing long takes into shorter files; score-o-gram UI; signed/notarized installer. Packager-ready extraResources + on-disk YAMNet are in place (`npm run pack` is an unsigned unpacked `.app` for local testing).
