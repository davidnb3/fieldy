# Fieldy

Desktop MVP for automated audio ingest, YAMNet classification, metadata tagging, and library file management. Inspired by a highly simplified Soundly workflow: drop Zoom H6 recordings, keep the original 32-bit float WAV untouched, classify from an in-memory 16 kHz mono view using YAMNet’s **0.96 s patches**, then move the original into a folder named after the winning **AudioSet class** (or `Mixed`).

Architecture for agents: `.cursor/rules/` (always-on `00-architecture.mdc`) plus `docs/ARCHITECTURE.md`. Build order and **done vs next**: `docs/IMPLEMENTATION.md`.

**Status (2026-09-16):** Phases **1–11 are done** (Python pipeline, IPC, Electron onboarding, drop zone, library explorer, edge-case hardening). Tests: `python -m pytest python/tests -q` only — no Electron UI tests. There is no Phase 12 in the original plan.

## Stack

| Layer | Tech |
| --- | --- |
| Desktop UI | Electron (HTML/CSS/JS), context isolation + preload |
| Backend | Python 3.12 child process, NDJSON over stdin/stdout |
| Analysis | YAMNet via TensorFlow Hub (native long-file framing) |
| Audio I/O | `soundfile` + `soxr` for the 16 kHz mono analysis buffer; original WAV never transcoded |
| Tags | `mutagen` WAVE ID3 (`Fieldy`) on the **original** file |

## Dev environment

This project needs **Python 3.12** (not macOS `/usr/bin/python3`, which is 3.9) and **Node.js** for Electron. On this machine they are Homebrew `python@3.12` and `node`.

```bash
# once per machine, if missing:
brew install python@3.12 node

cd /path/to/Fieldy
/opt/homebrew/bin/python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -U pip wheel
pip install -r python/requirements.txt

cd electron
npm install
# if Electron’s binary is missing (npm skipped install scripts):
node node_modules/electron/install.js

# smoke checks
cd ..
python -c "import tensorflow as tf, tensorflow_hub as hub; print(tf.__version__, hub.__version__)"
python -m pytest python/tests -q
printf '%s\n' '{"id":"1","method":"ping"}' | python python/main.py
```

Electron must spawn `.venv/bin/python` with `PYTHONUNBUFFERED=1`. From the repo root: `npm start` (or `cd electron && npm start`). First time: `cd electron && npm install`.

Reset onboarding: quit the app, delete `~/.Fieldy/pointer.json`, relaunch.

## Directory layout

```
Fieldy/
├── electron/                 # Desktop shell (main, preload, renderer)
├── python/                   # Automation + classifier
│   └── core/                 # config, preprocess, classifier, mapper, …
├── config/                   # yamnet_class_map.csv, audioset_ontology.json, schema
├── data/                     # Default library root (gitignored audio)
└── .cursor/rules/
```

Onboarding asks only for **library root**. Folders are AudioSet class names created on demand, plus **`Mixed`**.

## IPC protocol

See `.cursor/rules/03-ipc-bridge.mdc`. Python is long-lived; Electron main relays NDJSON. Renderer never mutates the filesystem.

## Implementation phases

Follow `docs/IMPLEMENTATION.md`. Phases 1–11 are done. Next work is using the app on real files, not another numbered phase.
