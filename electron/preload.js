const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("fieldy", {
  call: (method, params) => ipcRenderer.invoke("python-call", method, params),
  onEvent: (handler) => {
    const listener = (_event, msg) => handler(msg);
    ipcRenderer.on("python-event", listener);
    return () => ipcRenderer.removeListener("python-event", listener);
  },
  /** Absolute path for a dropped File (Chromium no longer exposes File.path). */
  pathForFile: (file) => webUtils.getPathForFile(file),
  chooseLibraryRoot: () => ipcRenderer.invoke("pick-library-root"),
  statPath: (target) => ipcRenderer.invoke("stat-path", target),
  readPlaybackFile: (target) => ipcRenderer.invoke("read-playback-file", target),
});
