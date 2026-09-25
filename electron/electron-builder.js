/**
 * macOS pack config.
 * FIELDY_UNSIGNED=1 → local unpacked .app, no signature (npm run pack).
 * FIELDY_DIST=1 → Developer ID DMG, hardened runtime, notarize (npm run dist:mac).
 * Notarization itself is skipped by electron-builder when Apple env vars are absent;
 * scripts/dist-mac.sh refuses to start without them.
 */
const unsigned = process.env.FIELDY_UNSIGNED === "1";
const dist = process.env.FIELDY_DIST === "1";

module.exports = {
  appId: "app.fieldy",
  productName: "Fieldy",
  asar: true,
  forceCodeSigning: dist,
  directories: {
    output: "dist",
  },
  files: [
    "main.js",
    "preload.js",
    "renderer/**/*",
    "icons/**/*",
    "drag-icon.png",
    "package.json",
  ],
  extraResources: [
    {
      from: "../python",
      to: "python",
      filter: ["**/*", "!**/__pycache__/**", "!**/*.pyc", "!**/tests/**", "!pytest.ini"],
    },
    {
      from: "../config",
      to: "config",
    },
    {
      from: "../models",
      to: "models",
    },
    {
      from: process.env.FIELDY_RUNTIME_DIR || "../python-runtime",
      to: "python-runtime",
      filter: ["**/*", "!**/__pycache__/**", "!**/*.pyc", "!.fieldy-python-stamp"],
    },
    {
      from: "icons",
      to: "icons",
    },
  ],
  mac: {
    icon: "build/icon.icns",
    category: "public.app-category.music",
    hardenedRuntime: true,
    gatekeeperAssess: false,
    notarize: !unsigned,
    identity: unsigned ? null : undefined,
    entitlements: "build/entitlements.mac.plist",
    entitlementsInherit: "build/entitlements.mac.inherit.plist",
    target: unsigned ? ["dir"] : ["dmg"],
    extendInfo: {
      CFBundleName: "Fieldy",
      CFBundleDisplayName: "Fieldy",
      CFBundleSpokenName: "Fieldy",
    },
  },
  win: {
    icon: "icons/icon.ico",
    target: ["dir"],
    // Unsigned website build. Skips rcedit so this Mac can pack Windows without Wine.
    signAndEditExecutable: false,
  },
};
