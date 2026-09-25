# Fieldy

Fieldy is a desktop library for your own recordings. Drop WAV, AIFF, FLAC, or MP3 files or folders and it files each original into a folder named after the sound, or into `Mixed` when no class wins. The file on disk stays in its original format. You can search the library, star files, group them into collections, and play them in the app. There is no account and no cloud library.

## Stack

- Electron
- Python 3.12
- YAMNet (TensorFlow)
- soundfile, soxr, mutagen
- Vite and React (the website)

## Run locally

Python 3.12 and Node.js.

App, from the repo root:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r python/requirements.txt
python scripts/fetch_yamnet.py
npm install --prefix electron
npm start
```

Site:

```bash
npm install --prefix web
npm run site
```
