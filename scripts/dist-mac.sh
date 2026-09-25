#!/usr/bin/env bash
# Signed + notarized Fieldy DMG (Developer ID). Fails if signing or notary credentials are missing.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "dist:mac must run on macOS." >&2
  exit 1
fi

has_sign=0
if [[ -n "${CSC_LINK:-}${CSC_NAME:-}" ]]; then
  has_sign=1
elif security find-identity -v -p codesigning 2>/dev/null | grep -q "Developer ID Application:"; then
  has_sign=1
fi
if [[ "$has_sign" -ne 1 ]]; then
  echo "No Developer ID Application certificate." >&2
  echo "Install one in the login keychain, or set CSC_LINK (p12 path or base64) and CSC_KEY_PASSWORD." >&2
  exit 1
fi

has_notary=0
if [[ -n "${APPLE_API_KEY:-}" && -n "${APPLE_API_KEY_ID:-}" && -n "${APPLE_API_ISSUER:-}" ]]; then
  has_notary=1
elif [[ -n "${APPLE_ID:-}" && -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" && -n "${APPLE_TEAM_ID:-}" ]]; then
  has_notary=1
elif [[ -n "${APPLE_KEYCHAIN_PROFILE:-}" ]]; then
  has_notary=1
fi
if [[ "$has_notary" -ne 1 ]]; then
  echo "Notarization credentials are missing. Set one of:" >&2
  echo "  APPLE_API_KEY (path to AuthKey_XXXX.p8) APPLE_API_KEY_ID APPLE_API_ISSUER" >&2
  echo "  APPLE_ID APPLE_APP_SPECIFIC_PASSWORD APPLE_TEAM_ID" >&2
  echo "  APPLE_KEYCHAIN_PROFILE  (notarytool keychain profile; optional APPLE_KEYCHAIN)" >&2
  exit 1
fi

bash "$ROOT/scripts/prepare-pack-resources.sh"
cd "$ROOT/electron"
export FIELDY_DIST=1
exec npx electron-builder --mac dmg --publish never
