#!/usr/bin/env bash
# Copy this machine’s .venv to python-runtime for electron-builder extraResources.
# Same-Mac test only: a Homebrew-backed venv still needs that Python installed.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$ROOT/.venv"
DEST="$ROOT/python-runtime"
if [[ ! -x "$VENV/bin/python" && ! -x "$VENV/Scripts/python.exe" ]]; then
  echo "Missing $VENV — create it and pip install -r python/requirements.txt" >&2
  exit 1
fi
mkdir -p "$DEST"
if command -v rsync >/dev/null 2>&1; then
  rsync -a "$VENV/" "$DEST/"
else
  rm -rf "$DEST"
  cp -R "$VENV" "$DEST"
fi
"$ROOT/.venv/bin/python" "$ROOT/scripts/fetch_yamnet.py"
echo "python-runtime and models/yamnet are ready. From electron/: npm run pack"
