#!/usr/bin/env bash
# electron-builder's PNG→icns converter panics on this 1024 RGBA icon.
# iconutil produces the icns the Mac build actually embeds.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/electron/icons/icon.png"
SET="$ROOT/electron/build/icon.iconset"
OUT="$ROOT/electron/build/icon.icns"
if [[ ! -f "$SRC" ]]; then
  echo "Missing $SRC" >&2
  exit 1
fi
if [[ -f "$OUT" && "$OUT" -nt "$SRC" ]]; then
  exit 0
fi
rm -rf "$SET"
mkdir -p "$SET"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$SRC" --out "$SET/icon_${size}x${size}.png" >/dev/null
  dbl=$((size * 2))
  sips -z "$dbl" "$dbl" "$SRC" --out "$SET/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$SET" -o "$OUT"
rm -rf "$SET"
echo "Wrote $OUT"
