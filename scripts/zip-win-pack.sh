#!/usr/bin/env bash
# One zip to link from the website. User unzips and runs Fieldy.exe.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/electron/dist/win-unpacked"
OUT="$ROOT/electron/dist/Fieldy-windows-x64.zip"
if [[ ! -x "$SRC/Fieldy.exe" && ! -f "$SRC/Fieldy.exe" ]]; then
  echo "Missing $SRC/Fieldy.exe — run npm run pack:win first." >&2
  exit 1
fi
rm -f "$OUT"
ditto -c -k --keepParent "$SRC" "$OUT"
echo "Wrote $OUT"
