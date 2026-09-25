#!/usr/bin/env bash
# Relocatable CPython (python-build-standalone) + app deps for electron-builder extraResources.
# mac: this machine's arch, installed and imported here.
# win: Windows x64 tree (python-runtime-win). Wheels are cross-installed from this Mac;
#      python.exe is not run here.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="$ROOT/python-runtime-cache"
REQ="$ROOT/python/requirements-pack.txt"
TAG="20260924"
PY_VER="3.12.14"
TARGET="${1:-mac}"

case "$TARGET" in
  mac)
    DEST="$ROOT/python-runtime"
    case "$(uname -m)" in
      arm64) TRIPLE="aarch64-apple-darwin" ;;
      x86_64) TRIPLE="x86_64-apple-darwin" ;;
      *)
        echo "Unsupported arch $(uname -m). Build on Apple Silicon or Intel macOS." >&2
        exit 1
        ;;
    esac
    ;;
  win)
    DEST="$ROOT/python-runtime-win"
    TRIPLE="x86_64-pc-windows-msvc"
    ;;
  *)
    echo "Usage: $0 [mac|win]" >&2
    exit 1
    ;;
esac

ASSET="cpython-${PY_VER}+${TAG}-${TRIPLE}-install_only.tar.gz"
URL="https://github.com/astral-sh/python-build-standalone/releases/download/${TAG}/${ASSET}"
STAMP_KEY="${PY_VER}+${TAG} ${TRIPLE} $(shasum -a 256 "$REQ" | awk '{print $1}')"
STAMP_FILE="$DEST/.fieldy-python-stamp"

runtime_ready() {
  if [[ "$TARGET" == "win" ]]; then
    [[ -f "$DEST/python.exe" && -f "$STAMP_FILE" && "$(cat "$STAMP_FILE")" == "$STAMP_KEY" ]]
  else
    [[ -x "$DEST/bin/python" && -f "$STAMP_FILE" && "$(cat "$STAMP_FILE")" == "$STAMP_KEY" ]]
  fi
}

if runtime_ready; then
  echo "python-runtime is current ($STAMP_KEY)"
else
  mkdir -p "$CACHE"
  TARBALL="$CACHE/$ASSET"
  if [[ ! -f "$TARBALL" ]]; then
    echo "Downloading $ASSET"
    curl -fL --retry 3 -o "$TARBALL.partial" "$URL"
    mv "$TARBALL.partial" "$TARBALL"
  fi
  STAGE="$(mktemp -d)"
  trap 'rm -rf "$STAGE"' EXIT
  tar -xzf "$TARBALL" -C "$STAGE"
  if [[ ! -d "$STAGE/python" ]]; then
    echo "Expected $ASSET to contain a python/ directory" >&2
    exit 1
  fi
  rm -rf "$DEST"
  mv "$STAGE/python" "$DEST"
  trap - EXIT
  rm -rf "$STAGE"
  if [[ "$TARGET" == "mac" && ! -e "$DEST/bin/python" ]]; then
    ln -s python3 "$DEST/bin/python"
  fi
  if [[ "$TARGET" == "win" ]]; then
    HOST_PY="$ROOT/python-runtime/bin/python"
    if [[ ! -x "$HOST_PY" ]]; then HOST_PY="$ROOT/.venv/bin/python"; fi
    if [[ ! -x "$HOST_PY" ]]; then
      echo "Need python-runtime or .venv on this Mac to install Windows wheels." >&2
      exit 1
    fi
    mkdir -p "$DEST/Lib/site-packages"
    "$HOST_PY" -m pip install --disable-pip-version-check \
      --target "$DEST/Lib/site-packages" \
      --python-version 3.12 \
      --only-binary=:all: \
      --platform win_amd64 \
      --implementation cp \
      --abi cp312 \
      -r "$REQ"
    python_pth="$(echo "$DEST"/python*._pth)"
    if [[ -f "$python_pth" ]] && ! grep -qx 'import site' "$python_pth"; then
      printf '\nLib\\site-packages\nimport site\n' >> "$python_pth"
    fi
  else
    "$DEST/bin/python" -m pip install --disable-pip-version-check --no-warn-script-location -r "$REQ"
  fi
  find "$DEST" -type d -name '__pycache__' -prune -exec rm -rf {} +
  find "$DEST" -type f -name '*.pyc' -delete
  if [[ "$TARGET" == "win" ]]; then
    "$HOST_PY" - "$DEST" <<'PY'
import os, sys
root = sys.argv[1]
need = ("numpy", "soundfile", "soxr", "mutagen", "tensorflow", "tensorflow_hub")
site = os.path.join(root, "Lib", "site-packages")
missing = [name for name in need if not any(os.path.exists(os.path.join(site, cand)) for cand in (name, name + ".py", name.replace("-", "_")))]
# dist-info / package dir
for name in list(missing):
    token = name.replace("-", "_")
    if any(entry.lower().startswith(token) for entry in os.listdir(site)):
        missing.remove(name)
if missing:
    print("Windows runtime is missing:", ", ".join(missing), file=sys.stderr)
    sys.exit(1)
macho = []
for dirpath, dirnames, files in os.walk(root):
    dirnames[:] = [d for d in dirnames if d != "__pycache__"]
    for name in files:
        path = os.path.join(dirpath, name)
        if os.path.islink(path):
            continue
        try:
            with open(path, "rb") as fh:
                magic = fh.read(4)
        except OSError:
            continue
        if magic in (b"\xcf\xfa\xed\xfe", b"\xce\xfa\xed\xfe", b"\xfe\xed\xfa\xcf", b"\xfe\xed\xfa\xce", b"\xca\xfe\xba\xbe"):
            macho.append(path)
if macho:
    print("Windows runtime contains Mac binaries:", file=sys.stderr)
    print("\n".join(macho[:20]), file=sys.stderr)
    sys.exit(1)
if not os.path.isfile(os.path.join(root, "python.exe")):
    print("Windows runtime has no python.exe", file=sys.stderr)
    sys.exit(1)
print("windows runtime layout ok")
PY
  else
  # Fail if any Mach-O still points at a machine-local Python (Homebrew / Cellar).
  "$DEST/bin/python" - "$DEST" <<'PY'
import os, subprocess, sys
root = sys.argv[1]
bad = []
for dirpath, dirnames, files in os.walk(root):
    dirnames[:] = [d for d in dirnames if d != "__pycache__"]
    for name in files:
        path = os.path.join(dirpath, name)
        if os.path.islink(path):
            continue
        try:
            with open(path, "rb") as fh:
                magic = fh.read(4)
        except OSError:
            continue
        if magic not in (
            b"\xcf\xfa\xed\xfe",
            b"\xce\xfa\xed\xfe",
            b"\xfe\xed\xfa\xcf",
            b"\xfe\xed\xfa\xce",
            b"\xca\xfe\xba\xbe",
        ):
            continue
        out = subprocess.check_output(["otool", "-L", path], text=True, stderr=subprocess.DEVNULL)
        for line in out.splitlines()[1:]:
            dep = line.strip().split(" ", 1)[0]
            if (
                dep.startswith("/opt/homebrew")
                or dep.startswith("/usr/local/")
                or "/Cellar/" in dep
            ):
                bad.append(f"{path}: {dep}")
if bad:
    print("python-runtime is not relocatable:", file=sys.stderr)
    print("\n".join(bad[:40]), file=sys.stderr)
    sys.exit(1)
print("no Homebrew or /usr/local links in python-runtime")
PY
  "$DEST/bin/python" -c "import numpy, soundfile, soxr, mutagen, tensorflow, tensorflow_hub; print('runtime imports ok', tensorflow.__version__)"
  fi
  printf '%s\n' "$STAMP_KEY" > "$STAMP_FILE"
fi

if [[ "$TARGET" == "mac" ]]; then
  xattr -cr "$DEST" 2>/dev/null || true
  bash "$ROOT/scripts/make-mac-icon.sh"
  "$DEST/bin/python" "$ROOT/scripts/fetch_yamnet.py"
else
  HOST_PY="$ROOT/python-runtime/bin/python"
  if [[ ! -x "$HOST_PY" ]]; then HOST_PY="$ROOT/.venv/bin/python"; fi
  "$HOST_PY" "$ROOT/scripts/fetch_yamnet.py"
fi
echo "python-runtime ($TARGET) and models/yamnet are ready."
