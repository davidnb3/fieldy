# Fieldy

Fieldy is a desktop library for your own recordings. Drop WAV, AIFF, FLAC, or MP3 files or folders and it files each original into a folder named after the sound, or into `Mixed` when no class wins. The file on disk stays in its original format. You can search the library, star files, group them into collections, and play them in the app. There is no account and no cloud library.

## Stack

- Electron
- Python 3.12
- YAMNet (TensorFlow)
- soundfile, soxr, mutagen
- Vite and React (the website)

## Run locally

Install Python 3.12 and Node.js first.

**Python 3.12**

- Mac: [python.org/downloads/macos](https://www.python.org/downloads/macos/). Install the Python 3.12 release.
- Windows: [python.org/downloads/windows](https://www.python.org/downloads/windows/). Install the Python 3.12 release and leave **Add python.exe to PATH** checked.

**Node.js 22 or newer**

- Mac and Windows: [nodejs.org](https://nodejs.org/). The long-term support installer includes npm.

From the repo root, the Python commands need the internet once. They install the Python packages and download the listening model. After that, `npm start` is enough.

### Mac

```bash
python3.12 -m venv .venv
.venv/bin/python -m pip install -r python/requirements.txt
.venv/bin/python scripts/fetch_yamnet.py
npm install --prefix electron
npm start
```

### Windows

In PowerShell or Command Prompt:

```bat
py -3.12 -m venv .venv
.venv\Scripts\python.exe -m pip install -r python\requirements.txt
.venv\Scripts\python.exe scripts\fetch_yamnet.py
npm install --prefix electron
npm start
```

`py -3.12` is the Windows Python launcher. If the terminal does not find it, close the terminal, open a new one, and try again.
