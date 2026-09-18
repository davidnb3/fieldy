/**
 * Electron main: BrowserWindow + long-lived Python NDJSON child.
 * The renderer never talks to Python and never uses Node fs.
 */
const { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const repoRoot = path.join(__dirname, "..");

let py = null;
let win = null;
let quitting = false;
let crashCount = 0;
const pending = new Map();
let nextId = 1;

function pythonBin() {
  if (process.platform === "win32") {
    return path.join(repoRoot, ".venv", "Scripts", "python.exe");
  }
  return path.join(repoRoot, ".venv", "bin", "python");
}

function failPending(message) {
  for (const waiter of pending.values()) {
    waiter({ ok: false, error: message });
  }
  pending.clear();
}

function spawnPython() {
  const bin = pythonBin();
  if (!fs.existsSync(bin)) {
    dialog.showErrorBox(
      "Python not found",
      `Expected ${bin}\nCreate the venv and pip install -r python/requirements.txt`
    );
    return;
  }

  py = spawn(bin, ["-u", path.join(repoRoot, "python", "main.py")], {
    cwd: repoRoot,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      PYTHONUNBUFFERED: "1",
      PYTHONPATH: path.join(repoRoot, "python"),
    },
  });

  let buf = "";
  py.stdout.on("data", (chunk) => {
    buf += chunk.toString("utf8");
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (!line.trim()) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch (err) {
        console.error("[python] bad JSON line:", line, err);
        continue;
      }
      if (msg.type === "event") {
        win?.webContents.send("python-event", msg);
        continue;
      }
      const waiter = pending.get(msg.id);
      if (waiter) {
        pending.delete(msg.id);
        waiter(msg);
        crashCount = 0;
      }
    }
  });

  py.stderr.on("data", (d) => console.error("[python]", d.toString()));

  py.on("error", (err) => {
    console.error("[python] spawn error", err);
    failPending(err.message);
    py = null;
  });

  py.on("exit", (code, signal) => {
    py = null;
    failPending(`python exited (${code ?? signal})`);
    if (quitting) return;
    crashCount += 1;
    if (crashCount > 5) {
      dialog.showErrorBox(
        "Python backend crashed",
        "The classifier process exited repeatedly. Check the terminal for [python] logs."
      );
      return;
    }
    setTimeout(spawnPython, 400);
  });
}

const dragIcon = nativeImage.createFromPath(path.join(__dirname, "drag-icon.png"));

function readPointerLibraryRoot() {
  const candidates = [
    path.join(os.homedir(), ".Fieldy", "pointer.json"),
    path.join(os.homedir(), ".soundly-lite", "pointer.json"),
  ];
  for (const pointer of candidates) {
    try {
      if (!fs.existsSync(pointer)) continue;
      const data = JSON.parse(fs.readFileSync(pointer, "utf8"));
      const root = data && data.libraryRoot;
      if (typeof root === "string" && root.trim()) return path.resolve(root);
    } catch {
      continue;
    }
  }
  return null;
}

function isPathInsideRoot(filePath, root) {
  let resolved;
  let base;
  try {
    resolved = fs.realpathSync(path.resolve(filePath));
    base = fs.realpathSync(path.resolve(root));
  } catch {
    return false;
  }
  return resolved === base || resolved.startsWith(base + path.sep);
}

function libraryFilesForDrag(rawPaths) {
  const root = readPointerLibraryRoot();
  if (!root || !Array.isArray(rawPaths)) return [];
  const files = [];
  const seen = new Set();
  for (const raw of rawPaths) {
    if (typeof raw !== "string" || !raw) continue;
    const resolved = path.resolve(raw);
    if (seen.has(resolved)) continue;
    let st;
    try {
      st = fs.statSync(resolved);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    const ext = path.extname(resolved).toLowerCase();
    if (ext !== ".wav" && ext !== ".wave") continue;
    if (!isPathInsideRoot(resolved, root)) continue;
    seen.add(resolved);
    files.push(resolved);
  }
  return files;
}

function pythonCall(method, params = {}) {
  if (!py || !py.stdin || !py.stdin.writable) {
    return Promise.reject(new Error("Python backend is not running"));
  }
  const id = String(nextId++);
  return new Promise((resolve, reject) => {
    pending.set(id, (msg) => {
      if (msg.ok) resolve(msg.result);
      else reject(new Error(msg.error || "python error"));
    });
    py.stdin.write(JSON.stringify({ id, method, params }) + "\n");
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: "#1a1b1e",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  const openHttps = (url) => {
    if (typeof url === "string" && url.startsWith("https://")) {
      shell.openExternal(url);
    }
  };
  win.webContents.setWindowOpenHandler(({ url }) => {
    openHttps(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (url === win.webContents.getURL()) return;
    event.preventDefault();
    openHttps(url);
  });
}

app.whenReady().then(() => {
  spawnPython();
  ipcMain.handle("python-call", (_e, method, params) => pythonCall(method, params));
  ipcMain.handle("pick-library-root", async () => {
    const result = await dialog.showOpenDialog(win, {
      title: "Choose library folder",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return result.filePaths[0];
  });
  ipcMain.handle("stat-path", (_e, target) => {
    try {
      const st = fs.statSync(target);
      return { ok: true, isDirectory: st.isDirectory(), isFile: st.isFile() };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
  ipcMain.handle("read-playback-file", (_e, target) => {
    if (typeof target !== "string" || !target) {
      throw new Error("path required");
    }
    const resolved = path.resolve(target);
    const tmpRoot = path.resolve(os.tmpdir()) + path.sep;
    const name = path.basename(resolved);
    if (!resolved.startsWith(tmpRoot) || !name.startsWith("fieldy-play-") || !name.toLowerCase().endsWith(".wav")) {
      throw new Error("not a Fieldy playback file");
    }
    return fs.readFileSync(resolved);
  });
  ipcMain.on("start-library-drag", (event, paths) => {
    const files = libraryFilesForDrag(paths);
    if (!files.length) return;
    const icon = dragIcon.isEmpty()
      ? nativeImage.createFromPath(path.join(__dirname, "drag-icon.png"))
      : dragIcon;
    try {
      event.sender.startDrag({ files, icon });
    } catch (err) {
      console.error("[drag]", err);
    }
  });
  ipcMain.handle("show-in-finder", (_e, target) => {
    const files = libraryFilesForDrag([target]);
    if (files.length !== 1) {
      throw new Error("not a library WAV");
    }
    shell.showItemInFolder(files[0]);
    return { ok: true };
  });
  ipcMain.handle("open-external", async (_e, url) => {
    if (typeof url !== "string" || !url.startsWith("https://")) {
      throw new Error("https URL required");
    }
    await shell.openExternal(url);
    return { ok: true };
  });
  createWindow();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  quitting = true;
  failPending("app quitting");
  if (py) {
    py.kill();
    py = null;
  }
});
