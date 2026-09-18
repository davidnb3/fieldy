const onboarding = document.getElementById("onboarding");
const library = document.getElementById("library");
const dropzone = document.getElementById("dropzone");
const dropzoneTitle = document.getElementById("dropzone-title");
const closeDropzone = document.getElementById("close-dropzone");
const toggleDropzone = document.getElementById("toggle-dropzone");
const openSettings = document.getElementById("open-settings");
const undoBtn = document.getElementById("undo");
const redoBtn = document.getElementById("redo");
const ingestPanel = document.getElementById("ingest-panel");
const ingestJobs = document.getElementById("ingest-jobs");
const closeIngest = document.getElementById("close-ingest");
const folderSearch = document.getElementById("folder-search");
const folderSort = document.getElementById("folder-sort");
const folderFilter = document.getElementById("folder-filter");
const fileSearch = document.getElementById("file-search");
const fileSort = document.getElementById("file-sort");
const fileFilter = document.getElementById("file-filter");
const libraryRootInput = document.getElementById("library-root");
const onboardingIngestMode = document.getElementById("onboarding-ingest-mode");
const onboardingError = document.getElementById("onboarding-error");
const saveButton = document.getElementById("save-config");

const reclassifyFolder = document.getElementById("reclassify-folder");
const player = document.getElementById("player");
const playerToggle = document.getElementById("player-toggle");
const playerName = document.getElementById("player-name");
const playerTime = document.getElementById("player-time");
const playerWave = document.getElementById("player-wave");
const dialog = document.getElementById("dialog");
const dialogCard = dialog.querySelector(".dialog-card");
const dialogTitle = document.getElementById("dialog-title");
const dialogBody = document.getElementById("dialog-body");
const dialogInput = document.getElementById("dialog-input");
const dialogCancel = document.getElementById("dialog-cancel");
const dialogOk = document.getElementById("dialog-ok");
const dialogSettings = document.getElementById("dialog-settings");
const settingsLibraryRoot = document.getElementById("settings-library-root");
const settingsBrowse = document.getElementById("settings-browse");
const settingsIngestMode = document.getElementById("settings-ingest-mode");
const settingsThreshold = document.getElementById("settings-threshold");
const settingsDropzoneOnLaunch = document.getElementById("settings-dropzone-on-launch");
const dropzoneHint = document.getElementById("dropzone-hint");
const RECENT_VIEW = "Recently added";
const STARRED_VIEW = "Starred";
const PINNED_VIEWS = new Set([RECENT_VIEW, STARRED_VIEW]);
const COLLECTION_PREFIX = "collection:";
let ingesting = false;
let libraryBusy = false;
let historyState = { canUndo: false, canRedo: false };
let appConfig = null;
let dropzonePrefApplied = false;
let libraryTree = null;
let selectedFolder = "Mixed";
const selectedPaths = new Set();
let selectionAnchor = null;
let suppressFileClick = false;
let draggingOut = false;
let pendingDragPaths = [];
const jobRows = new Map();
const playback = {
  audio: new Audio(),
  path: "",
  name: "",
  peaksMin: [],
  peaksMax: [],
  blobUrl: "",
  loading: false,
};
playback.audio.addEventListener("timeupdate", drawPlayhead);
playback.audio.addEventListener("ended", () => {
  playerToggle.textContent = "Play";
  drawWaveform();
  renderFiles();
});
playback.audio.addEventListener("play", () => {
  playerToggle.textContent = "Pause";
  renderFiles();
});
playback.audio.addEventListener("pause", () => {
  playerToggle.textContent = "Play";
  renderFiles();
});

function showOnboardingError(message) {
  onboardingError.textContent = message;
  onboardingError.classList.toggle("hidden", !message);
}

function baseName(filePath) {
  return filePath.split(/[/\\]/).pop() || filePath;
}

function isWavPath(filePath) {
  return /\.(wav|wave)$/i.test(filePath);
}

function showIngestPanel() {
  ingestPanel.hidden = false;
}

function hideIngestPanel() {
  ingestPanel.hidden = true;
}

function ensureJobRow(filePath) {
  showIngestPanel();
  let row = jobRows.get(filePath);
  if (!row) {
    row = document.createElement("li");
    row.innerHTML = `<span class="name"></span><span class="status stage"></span>`;
    row.querySelector(".name").textContent = baseName(filePath);
    ingestJobs.appendChild(row);
    jobRows.set(filePath, row);
  }
  return row;
}

function setJobStatus(filePath, text, kind) {
  const row = ensureJobRow(filePath);
  const status = row.querySelector(".status");
  status.textContent = text;
  status.className = `status ${kind || "stage"}`;
}

async function collectIngestPaths(fileList) {
  const accepted = [];
  for (const file of fileList) {
    const filePath = window.fieldy.pathForFile(file);
    if (!filePath) continue;
    const info = await window.fieldy.statPath(filePath);
    if (!info?.ok) continue;
    if (info.isDirectory || (info.isFile && isWavPath(filePath))) {
      accepted.push(filePath);
    }
  }
  return accepted;
}

let dialogClose = null;

function closeDialog(result) {
  if (!dialogClose) return;
  const finish = dialogClose;
  dialogClose = null;
  finish(result);
}

function openDialog({
  title,
  body = "",
  input = null,
  selectStem = false,
  okLabel = "OK",
  cancelLabel = "Cancel",
  showCancel = true,
  tone = "accent",
  settings = false,
} = {}) {
  closeDialog(null);
  return new Promise((resolve) => {
    const isPrompt = input !== null && input !== false;
    dialogTitle.textContent = title || "";
    dialogBody.textContent = body || "";
    dialogBody.classList.toggle("hidden", !body);
    dialogInput.classList.toggle("hidden", !isPrompt);
    dialogSettings.classList.toggle("hidden", !settings);
    dialogInput.value = isPrompt ? String(input || "") : "";
    dialogCancel.textContent = cancelLabel;
    dialogCancel.classList.toggle("hidden", !showCancel);
    dialogOk.textContent = okLabel;
    dialogOk.classList.toggle("tone-danger", tone === "danger");
    dialogCard.classList.toggle("tone-danger", tone === "danger");
    dialog.classList.remove("hidden");

    const finish = (result) => {
      dialogCancel.removeEventListener("click", onCancel);
      dialogOk.removeEventListener("click", onOk);
      dialog.removeEventListener("keydown", onKey);
      dialog.removeEventListener("click", onBackdrop);
      dialogCard.removeEventListener("click", stopCard);
      dialog.classList.add("hidden");
      dialogOk.classList.remove("tone-danger");
      dialogCard.classList.remove("tone-danger");
      dialogCancel.classList.remove("hidden");
      dialogSettings.classList.add("hidden");
      resolve(result);
    };
    dialogClose = finish;
    const onCancel = () => closeDialog(isPrompt ? null : false);
    const onOk = () => closeDialog(isPrompt ? dialogInput.value.trim() : true);
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }
      if (event.key === "Enter") {
        if (event.target.closest("button") && event.target !== dialogOk) return;
        event.preventDefault();
        event.stopPropagation();
        onOk();
      }
    };
    const stopCard = (event) => event.stopPropagation();
    const onBackdrop = () => onCancel();
    dialogCancel.addEventListener("click", onCancel);
    dialogOk.addEventListener("click", onOk);
    dialog.addEventListener("keydown", onKey);
    dialogCard.addEventListener("click", stopCard);
    dialog.addEventListener("click", onBackdrop);
    requestAnimationFrame(() => {
      if (isPrompt) {
        dialogInput.focus();
        if (selectStem) {
          const value = String(input || "");
          const dot = value.lastIndexOf(".");
          const end = dot > 0 ? dot : value.length;
          dialogInput.setSelectionRange(0, end);
        } else {
          dialogInput.select();
        }
      } else if (settings) {
        settingsIngestMode.focus();
      } else {
        dialogOk.focus();
      }
    });
  });
}

function askText({ title, okLabel, value, selectStem }) {
  return openDialog({
    title,
    okLabel: okLabel || "OK",
    input: value || "",
    selectStem,
  });
}

function askConfirm({ title, body, okLabel, tone }) {
  return openDialog({
    title,
    body,
    input: null,
    okLabel: okLabel || "OK",
    tone: tone || "accent",
  });
}

function askRename(currentName) {
  return askText({ title: "Rename file", okLabel: "Rename", value: currentName, selectStem: true });
}

function dropzoneOpen() {
  return !dropzone.classList.contains("hidden");
}

function setDropzoneOpen(open) {
  dropzone.classList.toggle("hidden", !open);
  if (!open) dropzone.classList.remove("dragover");
  toggleDropzone.textContent = open ? "Hide drop zone" : "Show drop zone";
  toggleDropzone.setAttribute("aria-pressed", open ? "true" : "false");
}

function applyAppConfig(cfg, { applyDropzonePref = false } = {}) {
  appConfig = cfg && !cfg.needsOnboarding ? cfg : null;
  if (!appConfig) return;
  const copy = appConfig.ingestMode === "copy";
  if (dropzoneHint) {
    dropzoneHint.textContent = copy
      ? "WAV only. A tagged copy is added to the library; the original stays where it is. First classify loads YAMNet and can take a minute."
      : "WAV only. Files are tagged and moved into your library. First classify loads YAMNet and can take a minute.";
  }
  if (applyDropzonePref) {
    setDropzoneOpen(appConfig.dropzoneOnLaunch !== false);
    dropzonePrefApplied = true;
  }
}

async function openSettingsDialog() {
  const cfg = appConfig || (await window.fieldy.call("get_config"));
  if (!cfg || cfg.needsOnboarding) return;
  settingsLibraryRoot.value = cfg.libraryRoot || "";
  settingsIngestMode.value = cfg.ingestMode === "copy" ? "copy" : "move";
  settingsThreshold.value = String(cfg.confidenceThreshold ?? 0.3);
  settingsDropzoneOnLaunch.checked = cfg.dropzoneOnLaunch !== false;
  const ok = await openDialog({
    title: "Settings",
    okLabel: "Save",
    settings: true,
  });
  if (!ok) return;
  const threshold = Number(settingsThreshold.value);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    showLibraryError("Threshold must be between 0 and 1.");
    return;
  }
  const libraryRoot = settingsLibraryRoot.value.trim();
  if (!libraryRoot) {
    showLibraryError("Choose a library folder first.");
    return;
  }
  try {
    await window.fieldy.call("save_config", {
      libraryRoot,
      ingestMode: settingsIngestMode.value,
      confidenceThreshold: threshold,
      dropzoneOnLaunch: settingsDropzoneOnLaunch.checked,
      ...(Number.isFinite(Number(cfg.analyzeChunkSeconds))
        ? { analyzeChunkSeconds: Number(cfg.analyzeChunkSeconds) }
        : {}),
    });
    applyAppConfig(
      {
        ...cfg,
        libraryRoot,
        ingestMode: settingsIngestMode.value,
        confidenceThreshold: threshold,
        dropzoneOnLaunch: settingsDropzoneOnLaunch.checked,
      },
      { applyDropzonePref: true }
    );
    await refresh();
  } catch (err) {
    showLibraryError(err.message || String(err));
  }
}

function showLibraryError(message) {
  const el = document.getElementById("library-error");
  if (!el) return;
  el.textContent = message || "";
  el.classList.toggle("hidden", !message);
}

function applyHistoryButtons() {
  const locked = ingesting || libraryBusy;
  if (undoBtn) undoBtn.disabled = locked || !historyState.canUndo;
  if (redoBtn) redoBtn.disabled = locked || !historyState.canRedo;
}

async function syncHistory() {
  try {
    historyState = await window.fieldy.call("history_state");
  } catch {
    historyState = { canUndo: false, canRedo: false };
  }
  applyHistoryButtons();
}

async function runHistory(method) {
  if (ingesting || libraryBusy) return;
  libraryBusy = true;
  applyHistoryButtons();
  showLibraryError("");
  try {
    historyState = await window.fieldy.call(method);
  } catch (err) {
    showLibraryError(err.message || String(err));
  } finally {
    libraryBusy = false;
  }
  try {
    await refresh();
  } catch (err) {
    showLibraryError(err.message || String(err));
    applyHistoryButtons();
  }
}

function formatDuration(seconds) {
  if (seconds == null || Number.isNaN(Number(seconds))) return "—";
  return `${Number(seconds).toFixed(1)}s`;
}

function formatClock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function bytesToWavBlob(data) {
  if (data instanceof ArrayBuffer) return new Blob([data], { type: "audio/wav" });
  if (ArrayBuffer.isView(data)) return new Blob([data], { type: "audio/wav" });
  if (data && data.type === "Buffer" && Array.isArray(data.data)) {
    return new Blob([new Uint8Array(data.data)], { type: "audio/wav" });
  }
  return new Blob([data], { type: "audio/wav" });
}

function drawWaveform() {
  if (!playerWave || player.classList.contains("hidden")) return;
  const cssWidth = playerWave.clientWidth || 600;
  const cssHeight = 72;
  const ratio = window.devicePixelRatio || 1;
  playerWave.width = Math.floor(cssWidth * ratio);
  playerWave.height = Math.floor(cssHeight * ratio);
  const ctx = playerWave.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  ctx.fillStyle = "#121316";
  ctx.fillRect(0, 0, cssWidth, cssHeight);
  const mins = playback.peaksMin;
  const maxs = playback.peaksMax;
  const n = Math.min(mins.length, maxs.length);
  if (!n) return;
  const mid = cssHeight / 2;
  ctx.fillStyle = "#ff8a3d";
  for (let i = 0; i < n; i += 1) {
    const x = (i / n) * cssWidth;
    const w = Math.max(1, cssWidth / n);
    const lo = mid - maxs[i] * (mid - 4);
    const hi = mid - mins[i] * (mid - 4);
    ctx.fillRect(x, Math.min(lo, hi), w, Math.max(1, Math.abs(hi - lo)));
  }
  const dur = playback.audio.duration;
  if (dur && Number.isFinite(dur) && dur > 0) {
    const x = (playback.audio.currentTime / dur) * cssWidth;
    ctx.strokeStyle = "#e8eaed";
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, cssHeight);
    ctx.stroke();
  }
  if (playerTime) {
    const now = playback.audio.currentTime || 0;
    const total = Number.isFinite(dur) ? dur : 0;
    playerTime.textContent = `${formatClock(now)} / ${formatClock(total)}`;
  }
}

function drawPlayhead() {
  drawWaveform();
}

async function togglePlayback(file) {
  if (playback.loading) return;
  if (file.path === playback.path && playback.audio.src) {
    if (playback.audio.paused) await playback.audio.play();
    else playback.audio.pause();
    return;
  }
  playback.loading = true;
  player.classList.remove("hidden");
  playerName.textContent = `Loading ${file.name}…`;
  playerTime.textContent = "";
  playerToggle.disabled = true;
  renderFiles();
  try {
    const prepared = await window.fieldy.call("prepare_playback", { path: file.path });
    const bytes = await window.fieldy.readPlaybackFile(prepared.previewPath);
    if (playback.blobUrl) URL.revokeObjectURL(playback.blobUrl);
    playback.blobUrl = URL.createObjectURL(bytesToWavBlob(bytes));
    playback.path = file.path;
    playback.name = file.name;
    playback.peaksMin = prepared.peaksMin || [];
    playback.peaksMax = prepared.peaksMax || [];
    playback.audio.src = playback.blobUrl;
    playerName.textContent = file.name;
    playerToggle.disabled = false;
    playerToggle.textContent = "Pause";
    drawWaveform();
    await playback.audio.play();
  } catch (err) {
    showLibraryError(err.message || String(err));
    playerName.textContent = file.name;
  } finally {
    playback.loading = false;
    playerToggle.disabled = false;
    renderFiles();
  }
}

playerToggle.addEventListener("click", () => {
  if (!playback.audio.src) return;
  if (playback.audio.paused) playback.audio.play();
  else playback.audio.pause();
});

playerWave.addEventListener("click", (event) => {
  const dur = playback.audio.duration;
  if (!dur || !Number.isFinite(dur)) return;
  const rect = playerWave.getBoundingClientRect();
  const ratio = (event.clientX - rect.left) / rect.width;
  playback.audio.currentTime = Math.min(dur, Math.max(0, ratio * dur));
  drawWaveform();
});

window.addEventListener("resize", () => drawWaveform());

async function refresh() {
  showOnboardingError("");
  const cfg = await window.fieldy.call("get_config");
  if (!cfg || cfg.needsOnboarding) {
    onboarding.classList.remove("hidden");
    library.classList.add("hidden");
    return;
  }
  onboarding.classList.add("hidden");
  library.classList.remove("hidden");
  applyAppConfig(cfg, { applyDropzonePref: !dropzonePrefApplied });
  const tree = await window.fieldy.call("list_library");
  renderTree(tree);
  await syncHistory();
}

function folderCount(folder) {
  return folder.files?.length || 0;
}

function visibleFolders() {
  const query = (folderSearch?.value || "").trim().toLowerCase();
  const filter = folderFilter?.value || "all";
  const sort = folderSort?.value || "mixed";
  let folders = (libraryTree?.folders || []).slice();
  if (query) {
    folders = folders.filter((folder) => folder.name.toLowerCase().includes(query));
  }
  if (filter === "with-files") {
    folders = folders.filter((folder) => folderCount(folder) > 0);
  } else if (filter === "empty") {
    folders = folders.filter((folder) => folderCount(folder) === 0);
  }
  folders.sort((a, b) => {
    if (sort === "name-asc") return a.name.localeCompare(b.name);
    if (sort === "name-desc") return b.name.localeCompare(a.name);
    if (sort === "count-desc") return folderCount(b) - folderCount(a) || a.name.localeCompare(b.name);
    if (sort === "count-asc") return folderCount(a) - folderCount(b) || a.name.localeCompare(b.name);
    if (a.name === "Mixed") return -1;
    if (b.name === "Mixed") return 1;
    return a.name.localeCompare(b.name);
  });
  return folders;
}

function durationValue(file) {
  const n = Number(file.duration);
  return Number.isFinite(n) ? n : -1;
}

function fileMatchesQuery(file, query) {
  if (!query) return true;
  if ((file.name || "").toLowerCase().includes(query)) return true;
  return (file.tags || []).some((tag) => String(tag).toLowerCase().includes(query));
}

function visibleFiles() {
  const query = (fileSearch?.value || "").trim().toLowerCase();
  const filter = fileFilter?.value || "all";
  const sort = fileSort?.value || "default";
  let files = selectedFiles().slice();
  files = files.filter((file) => {
    if (!fileMatchesQuery(file, query)) return false;
    const tags = file.tags || [];
    if (filter === "tagged") return tags.length > 0;
    if (filter === "untagged") return tags.length === 0;
    if (filter.startsWith("tag:")) return tags.includes(filter.slice(4));
    return true;
  });
  if (sort === "name-asc") files.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === "name-desc") files.sort((a, b) => b.name.localeCompare(a.name));
  else if (sort === "dur-desc") files.sort((a, b) => durationValue(b) - durationValue(a) || a.name.localeCompare(b.name));
  else if (sort === "dur-asc") files.sort((a, b) => durationValue(a) - durationValue(b) || a.name.localeCompare(b.name));
  return files;
}

function syncFileTagFilter() {
  if (!fileFilter) return;
  const current = fileFilter.value;
  const tags = new Set();
  for (const file of selectedFiles()) {
    for (const tag of file.tags || []) tags.add(tag);
  }
  fileFilter.replaceChildren();
  const builtins = [
    ["all", "All files"],
    ["tagged", "Has tags"],
    ["untagged", "No tags"],
  ];
  for (const [value, label] of builtins) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    fileFilter.appendChild(option);
  }
  for (const tag of [...tags].sort((a, b) => a.localeCompare(b))) {
    const option = document.createElement("option");
    option.value = `tag:${tag}`;
    option.textContent = tag;
    fileFilter.appendChild(option);
  }
  const allowed = new Set([...fileFilter.options].map((opt) => opt.value));
  fileFilter.value = allowed.has(current) ? current : "all";
}

function appendFolderButton(parent, label, count, selected, droppable, extra = {}) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "folder-item" + (selected ? " selected" : "");
  const name = document.createElement("span");
  name.className = "folder-name";
  name.textContent = label;
  const countEl = document.createElement("span");
  countEl.className = "folder-count";
  countEl.textContent = String(count);
  el.append(name, countEl);
  el.addEventListener("click", () => {
    const next = extra.collectionId ? COLLECTION_PREFIX + extra.collectionId : label;
    if (selectedFolder !== next) {
      selectedPaths.clear();
      selectionAnchor = null;
    }
    selectedFolder = next;
    showLibraryError("");
    renderTree(libraryTree);
  });
  if (extra.collectionId) {
    el.dataset.collectionId = extra.collectionId;
    bindCollectionDrop(el, extra.collectionId);
  } else if (droppable) {
    bindFolderDrop(el, label);
  }
  parent.appendChild(el);
}

function bindFolderDrop(el, destFolder) {
  const clearHover = () => el.classList.remove("drop-target");
  el.addEventListener("dragenter", (event) => {
    event.preventDefault();
    if (!canDropOnFolder(destFolder)) return;
    el.classList.add("drop-target");
  });
  el.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (!canDropOnFolder(destFolder)) return;
    el.classList.add("drop-target");
  });
  el.addEventListener("dragleave", (event) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    clearHover();
  });
  el.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    clearHover();
    dropOnFolder(destFolder, event);
  });
}

function bindCollectionDrop(el, collectionId) {
  const clearHover = () => el.classList.remove("drop-target");
  el.addEventListener("dragenter", (event) => {
    event.preventDefault();
    if (!draggingOut && !pendingDragPaths.length) return;
    el.classList.add("drop-target");
  });
  el.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (!draggingOut && !pendingDragPaths.length) return;
    el.classList.add("drop-target");
  });
  el.addEventListener("dragleave", (event) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    clearHover();
  });
  el.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    clearHover();
    dropOnCollection(collectionId, event);
  });
}

function canDropOnFolder(destFolder) {
  if (!destFolder || PINNED_VIEWS.has(destFolder)) return false;
  if (ingesting || libraryBusy) return false;
  return draggingOut || pendingDragPaths.length > 0;
}

async function dropOnFolder(destFolder, event) {
  if (PINNED_VIEWS.has(destFolder) || ingesting || libraryBusy) return;
  let paths = pendingDragPaths.slice();
  if (!paths.length && event?.dataTransfer?.files) {
    paths = (await collectIngestPaths(event.dataTransfer.files)).filter(isUnderLibraryRoot);
  }
  paths = paths.filter((filePath) => currentFolderName({ path: filePath }) !== destFolder);
  if (!paths.length) return;
  await moveLibraryPaths(paths, destFolder);
}

async function dropOnCollection(collectionId, event) {
  if (ingesting || libraryBusy || !collectionId) return;
  let paths = pendingDragPaths.slice();
  if (!paths.length && event?.dataTransfer?.files) {
    paths = (await collectIngestPaths(event.dataTransfer.files)).filter(isUnderLibraryRoot);
  }
  if (!paths.length) return;
  await addPathsToCollection(collectionId, paths);
}

function dropTargetFromPoint(x, y) {
  for (const node of document.elementsFromPoint(x, y)) {
    const item = node.closest?.(".folder-item");
    if (!item) continue;
    if (item.parentElement?.id === "folder-list") {
      const name = item.querySelector(".folder-name")?.textContent;
      if (name && !PINNED_VIEWS.has(name)) return { kind: "folder", el: item, name };
    }
    if (item.parentElement?.id === "collection-list") {
      const id = item.dataset.collectionId;
      if (id) return { kind: "collection", el: item, id };
    }
  }
  return null;
}

function highlightFolderDropTarget(event) {
  document.querySelectorAll(".folder-item.drop-target").forEach((item) => {
    item.classList.remove("drop-target");
  });
  const target = dropTargetFromPoint(event.clientX, event.clientY);
  if (!target) return;
  if (target.kind === "folder" && canDropOnFolder(target.name)) {
    target.el.classList.add("drop-target");
  }
  if (target.kind === "collection" && (draggingOut || pendingDragPaths.length)) {
    target.el.classList.add("drop-target");
  }
}

async function addPathsToCollection(collectionId, paths) {
  if (libraryBusy || ingesting || !paths.length || !collectionId) return;
  libraryBusy = true;
  applyHistoryButtons();
  showLibraryError("");
  renderFiles();
  try {
    for (const path of paths) {
      await window.fieldy.call("add_to_collection", { id: collectionId, path });
    }
  } catch (err) {
    showLibraryError(err.message || String(err));
  } finally {
    libraryBusy = false;
  }
  try {
    await refresh();
  } catch (err) {
    showLibraryError(err.message || String(err));
    renderFiles();
  }
}

async function addFileToNewCollection(file) {
  const name = await askText({
    title: "New collection",
    okLabel: "Create",
    value: "",
  });
  if (!name) return;
  try {
    const created = await window.fieldy.call("create_collection", { name });
    await addPathsToCollection(created.id, [file.path]);
  } catch (err) {
    showLibraryError(err.message || String(err));
  }
}

async function createNewCollection() {
  const name = await askText({
    title: "New collection",
    okLabel: "Create",
    value: "",
  });
  if (!name) return;
  try {
    const created = await window.fieldy.call("create_collection", { name });
    selectedFolder = COLLECTION_PREFIX + created.id;
    selectedPaths.clear();
    selectionAnchor = null;
    await refresh();
  } catch (err) {
    showLibraryError(err.message || String(err));
  }
}

async function moveLibraryPaths(paths, destFolder) {
  if (libraryBusy || ingesting || !paths.length) return;
  libraryBusy = true;
  applyHistoryButtons();
  showLibraryError("");
  renderFiles();
  try {
    for (const src of paths) {
      await window.fieldy.call("move_file", { src, destFolder });
    }
  } catch (err) {
    showLibraryError(err.message || String(err));
  } finally {
    libraryBusy = false;
  }
  try {
    await refresh();
  } catch (err) {
    showLibraryError(err.message || String(err));
    renderFiles();
  }
}

function renderTree(tree) {
  libraryTree = tree;
  if (selectedFolder === "Favorites") selectedFolder = STARRED_VIEW;
  const folders = tree?.folders || [];
  const names = folders.map((folder) => folder.name);
  const collectionIds = new Set(
    (tree?.collections || []).map((item) => COLLECTION_PREFIX + item.id)
  );
  if (
    !PINNED_VIEWS.has(selectedFolder) &&
    !names.includes(selectedFolder) &&
    !collectionIds.has(selectedFolder)
  ) {
    selectedFolder = names[0] || "Mixed";
  }

  const viewList = document.getElementById("view-list");
  viewList.replaceChildren();
  appendFolderButton(
    viewList,
    RECENT_VIEW,
    (tree?.recentlyAdded || []).length,
    selectedFolder === RECENT_VIEW,
    false
  );
  appendFolderButton(
    viewList,
    STARRED_VIEW,
    (tree?.favorites || []).length,
    selectedFolder === STARRED_VIEW,
    false
  );

  const collectionList = document.getElementById("collection-list");
  collectionList.replaceChildren();
  for (const collection of tree?.collections || []) {
    const key = COLLECTION_PREFIX + collection.id;
    appendFolderButton(
      collectionList,
      collection.name,
      collection.files?.length || 0,
      selectedFolder === key,
      false,
      { collectionId: collection.id }
    );
  }

  const folderList = document.getElementById("folder-list");
  folderList.replaceChildren();
  const shown = visibleFolders();
  if (!shown.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No folders match.";
    folderList.appendChild(empty);
  } else {
    for (const folder of shown) {
      appendFolderButton(
        folderList,
        folder.name,
        folderCount(folder),
        folder.name === selectedFolder,
        true
      );
    }
  }
  syncFileTagFilter();
  pruneSelection();
  renderFiles();
}

function currentFolderName(file) {
  const parts = String(file.path || "").split(/[/\\]/);
  return parts.length >= 2 ? parts[parts.length - 2] : "";
}

function selectedCollection() {
  if (!String(selectedFolder).startsWith(COLLECTION_PREFIX)) return null;
  const id = selectedFolder.slice(COLLECTION_PREFIX.length);
  return (libraryTree?.collections || []).find((item) => item.id === id) || null;
}

function selectedFiles() {
  if (selectedFolder === RECENT_VIEW) return libraryTree?.recentlyAdded || [];
  if (selectedFolder === STARRED_VIEW) return libraryTree?.favorites || [];
  const collection = selectedCollection();
  if (collection) return collection.files || [];
  const folder = (libraryTree?.folders || []).find((item) => item.name === selectedFolder);
  return folder?.files || [];
}

function pruneSelection() {
  const allowed = new Set(selectedFiles().map((file) => file.path));
  for (const filePath of [...selectedPaths]) {
    if (!allowed.has(filePath)) selectedPaths.delete(filePath);
  }
  if (selectionAnchor && !allowed.has(selectionAnchor)) selectionAnchor = null;
}

function isToggleModifier(event) {
  return event.metaKey || event.ctrlKey;
}

function selectOnNameClick(filePath, event) {
  const visible = visibleFiles().map((file) => file.path);
  if (event.shiftKey && selectionAnchor && visible.includes(selectionAnchor)) {
    const from = visible.indexOf(selectionAnchor);
    const to = visible.indexOf(filePath);
    if (from < 0 || to < 0) return;
    const start = Math.min(from, to);
    const end = Math.max(from, to);
    if (!isToggleModifier(event)) selectedPaths.clear();
    for (let i = start; i <= end; i += 1) selectedPaths.add(visible[i]);
    return;
  }
  if (isToggleModifier(event)) {
    if (selectedPaths.has(filePath)) selectedPaths.delete(filePath);
    else selectedPaths.add(filePath);
    selectionAnchor = filePath;
    return;
  }
  selectedPaths.clear();
  selectedPaths.add(filePath);
  selectionAnchor = filePath;
}

function clearFileSelection() {
  if (!selectedPaths.size && !selectionAnchor) return;
  selectedPaths.clear();
  selectionAnchor = null;
  renderFiles();
}

function pathsForDrag(filePath) {
  if (!selectedPaths.has(filePath)) {
    selectedPaths.clear();
    selectedPaths.add(filePath);
    selectionAnchor = filePath;
  }
  return visibleFiles()
    .map((file) => file.path)
    .filter((item) => selectedPaths.has(item));
}

function bindFileDrag(el, file) {
  el.draggable = true;
  el.addEventListener("dragstart", (event) => {
    event.preventDefault();
    suppressFileClick = true;
    draggingOut = true;
    pendingDragPaths = pathsForDrag(file.path);
    if (pendingDragPaths.length) window.fieldy.startLibraryDrag(pendingDragPaths);
  });
  el.addEventListener("dragend", () => {
    draggingOut = false;
    document.querySelectorAll(".folder-item.drop-target").forEach((item) => {
      item.classList.remove("drop-target");
    });
    window.setTimeout(() => {
      if (!draggingOut) pendingDragPaths = [];
    }, 300);
  });
}

function isUnderLibraryRoot(filePath) {
  const root = String(libraryTree?.libraryRoot || "")
    .replace(/\\/g, "/")
    .replace(/\/$/, "");
  const normalized = String(filePath || "").replace(/\\/g, "/");
  if (!root || !normalized) return false;
  return normalized === root || normalized.startsWith(`${root}/`);
}

function setFileFavorite(file, favorite) {
  return mutateLibrary("set_favorite", { path: file.path, favorite });
}

async function renameLibraryFile(file) {
  const next = await askRename(file.name);
  if (!next || next === file.name) return;
  mutateLibrary("rename_file", { path: file.path, newName: next });
}

async function deleteLibraryFile(file) {
  const ok = await askConfirm({
    title: "Delete file",
    body: `Delete ${file.name}? This cannot be undone.`,
    okLabel: "Delete",
    tone: "danger",
  });
  if (!ok) return;
  mutateLibrary("delete_file", { path: file.path });
}

async function reclassifyLibraryFile(file) {
  const ok = await askConfirm({
    title: "Reclassify file",
    body: `Re-run YAMNet on ${file.name}? It will be retagged and moved if the class changes.`,
    okLabel: "Reclassify",
  });
  if (!ok) return;
  classifyExisting([file.path]);
}

function hideContextMenu() {
  const menu = document.getElementById("context-menu");
  if (!menu) return;
  menu.classList.add("hidden");
  menu.hidden = true;
  menu.replaceChildren();
}

function addContextItem(menu, label, onClick, { danger, disabled } = {}) {
  const item = document.createElement("button");
  item.type = "button";
  item.className = "context-item" + (danger ? " danger" : "");
  item.setAttribute("role", "menuitem");
  item.textContent = label;
  item.disabled = Boolean(disabled);
  item.addEventListener("click", () => {
    hideContextMenu();
    onClick();
  });
  menu.appendChild(item);
}

function addContextSeparator(menu) {
  const line = document.createElement("div");
  line.className = "context-sep";
  menu.appendChild(line);
}

function addContextSubmenu(menu, label, entries) {
  const wrap = document.createElement("div");
  wrap.className = "context-subwrap";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "context-item has-sub";
  btn.textContent = label;
  const sub = document.createElement("div");
  sub.className = "context-submenu";
  for (const entry of entries) {
    const subItem = document.createElement("button");
    subItem.type = "button";
    subItem.className = "context-item";
    subItem.textContent = entry.label;
    subItem.disabled = Boolean(entry.disabled);
    subItem.addEventListener("click", () => {
      hideContextMenu();
      entry.onClick();
    });
    sub.appendChild(subItem);
  }
  wrap.append(btn, sub);
  menu.appendChild(wrap);
}

function openContextMenu(event, file, otherFolders) {
  const menu = document.getElementById("context-menu");
  if (!menu) return;
  hideContextMenu();
  menu.hidden = false;
  menu.classList.remove("hidden");
  addContextItem(menu, "Show in Finder", () => {
    window.fieldy.showInFinder(file.path).catch((err) => {
      showLibraryError(err.message || String(err));
    });
  });
  addContextItem(menu, file.favorite ? "Remove star" : "Add to starred", () => {
    setFileFavorite(file, !file.favorite);
  });
  addContextSeparator(menu);
  addContextItem(menu, "Rename", () => renameLibraryFile(file));
  addContextItem(menu, "Delete", () => deleteLibraryFile(file), { danger: true });
  addContextItem(
    menu,
    "Reclassify",
    () => reclassifyLibraryFile(file),
    { disabled: ingesting || libraryBusy }
  );
  const collections = libraryTree?.collections || [];
  addContextSeparator(menu);
  addContextSubmenu(menu, "Add to collection", [
    {
      label: "New collection…",
      onClick: () => addFileToNewCollection(file),
    },
    ...collections.map((collection) => ({
      label: collection.name,
      onClick: () => addPathsToCollection(collection.id, [file.path]),
    })),
  ]);
  if (otherFolders.length) {
    addContextSeparator(menu);
    addContextSubmenu(
      menu,
      "Move to",
      otherFolders.map((dest) => ({
        label: dest,
        onClick: () => mutateLibrary("move_file", { src: file.path, destFolder: dest }),
      }))
    );
  }
  const pad = 8;
  const x = Math.min(event.clientX, window.innerWidth - menu.offsetWidth - pad);
  const y = Math.min(event.clientY, window.innerHeight - menu.offsetHeight - pad);
  menu.style.left = `${Math.max(pad, x)}px`;
  menu.style.top = `${Math.max(pad, y)}px`;
}

function iconButton(label, paths) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "secondary icon-btn";
  btn.setAttribute("aria-label", label);
  btn.title = label;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "15");
  svg.setAttribute("height", "15");
  svg.setAttribute("aria-hidden", "true");
  for (const d of paths) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);
  }
  btn.appendChild(svg);
  return btn;
}

function renderFiles() {
  const list = document.getElementById("file-list");
  const heading = document.getElementById("folder-heading");
  const allFiles = selectedFiles();
  const files = visibleFiles();
  const collection = selectedCollection();
  const isRecent = selectedFolder === RECENT_VIEW;
  const isStarred = selectedFolder === STARRED_VIEW;
  const isPinned = isRecent || isStarred;
  if (heading) heading.textContent = collection ? collection.name : selectedFolder;
  if (fileSort?.options?.[0]) {
    fileSort.options[0].textContent = isPinned ? "Newest first" : "Default order";
  }
  if (reclassifyFolder) {
    reclassifyFolder.disabled = ingesting || libraryBusy || !allFiles.length;
    reclassifyFolder.title = allFiles.length
      ? `Run YAMNet again on ${allFiles.length} file(s) in ${collection ? collection.name : selectedFolder}`
      : isRecent
        ? "Nothing ingested yet"
        : isStarred
          ? "No starred files yet"
          : collection
            ? "No files in this collection"
            : "No files in this folder";
  }
  list.replaceChildren();
  if (!allFiles.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = isRecent
      ? "Nothing ingested yet. Drop WAV files to see them here."
      : isStarred
        ? "No starred files yet. Star a file to see it here."
        : collection
          ? "No files in this collection yet."
          : "No WAV files in this folder.";
    list.appendChild(empty);
    return;
  }
  if (!files.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No files match.";
    list.appendChild(empty);
    return;
  }

  const folderNames = (libraryTree?.folders || []).map((item) => item.name);

  for (const file of files) {
    const row = document.createElement("div");
    row.className =
      "file-row" +
      (file.path === playback.path ? " playing" : "") +
      (selectedPaths.has(file.path) ? " selected" : "");

    const playBtn = document.createElement("button");
    playBtn.type = "button";
    playBtn.className = "play-btn";
    playBtn.setAttribute("aria-label", `Play ${file.name}`);
    playBtn.textContent = file.path === playback.path && !playback.audio.paused ? "⏸" : "▶";
    playBtn.disabled = playback.loading;
    playBtn.addEventListener("click", () => togglePlayback(file));

    const favBtn = document.createElement("button");
    favBtn.type = "button";
    favBtn.className = "favorite-btn" + (file.favorite ? " on" : "");
    favBtn.setAttribute("aria-label", file.favorite ? `Unfavorite ${file.name}` : `Favorite ${file.name}`);
    favBtn.setAttribute("aria-pressed", file.favorite ? "true" : "false");
    favBtn.textContent = file.favorite ? "★" : "☆";
    favBtn.disabled = ingesting || libraryBusy;
    favBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      setFileFavorite(file, !file.favorite);
    });

    const nameCell = document.createElement("div");
    nameCell.className = "file-name-cell";

    const handle = document.createElement("span");
    handle.className = "file-drag-handle";
    handle.title = "Drag to a folder or another app";
    handle.setAttribute("aria-label", `Drag ${file.name}`);
    for (let i = 0; i < 6; i += 1) handle.appendChild(document.createElement("i"));

    const name = document.createElement("div");
    name.className = "file-name";
    name.textContent = file.name;
    name.title = file.path;
    name.addEventListener("click", (event) => {
      event.stopPropagation();
      if (suppressFileClick) {
        suppressFileClick = false;
        return;
      }
      selectOnNameClick(file.path, event);
      renderFiles();
    });

    bindFileDrag(handle, file);
    bindFileDrag(name, file);
    nameCell.append(handle, name);

    const duration = document.createElement("div");
    duration.className = "file-duration";
    duration.textContent = formatDuration(file.duration);

    const tags = document.createElement("div");
    tags.className = "file-tags";
    tags.textContent = (file.tags || []).join(" · ") || "No tags";
    tags.title = tags.textContent;

    const actions = document.createElement("div");
    actions.className = "file-actions";

    const otherFolders = folderNames.filter((name) => name !== currentFolderName(file));
    if (otherFolders.length) {
      const moveSelect = document.createElement("select");
      moveSelect.setAttribute("aria-label", `Move ${file.name}`);
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Move to…";
      moveSelect.appendChild(placeholder);
      for (const dest of otherFolders) {
        const option = document.createElement("option");
        option.value = dest;
        option.textContent = dest;
        moveSelect.appendChild(option);
      }
      moveSelect.addEventListener("change", () => {
        const destFolder = moveSelect.value;
        moveSelect.value = "";
        if (destFolder) mutateLibrary("move_file", { src: file.path, destFolder });
      });
      actions.appendChild(moveSelect);
    }

    const renameBtn = iconButton("Rename", [
      "M12 20h9",
      "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z",
    ]);
    renameBtn.addEventListener("click", () => renameLibraryFile(file));

    const deleteBtn = iconButton("Delete", [
      "M3 6h18",
      "M8 6V4h8v2",
      "M19 6l-1 14H6L5 6",
      "M10 11v6",
      "M14 11v6",
    ]);
    deleteBtn.classList.add("danger");
    deleteBtn.addEventListener("click", () => deleteLibraryFile(file));

    actions.append(renameBtn, deleteBtn);
    row.append(playBtn, favBtn, nameCell, duration, tags, actions);
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openContextMenu(event, file, otherFolders);
    });
    list.appendChild(row);
  }
}

async function mutateLibrary(method, params) {
  if (libraryBusy || ingesting) return;
  libraryBusy = true;
  applyHistoryButtons();
  showLibraryError("");
  renderFiles();
  try {
    await window.fieldy.call(method, params);
  } catch (err) {
    showLibraryError(err.message || String(err));
  } finally {
    libraryBusy = false;
  }
  try {
    await refresh();
  } catch (err) {
    showLibraryError(err.message || String(err));
    renderFiles();
  }
}

document.getElementById("new-collection").addEventListener("click", () => {
  if (ingesting || libraryBusy) return;
  createNewCollection();
});

document.getElementById("browse-library").addEventListener("click", async () => {
  const picked = await window.fieldy.chooseLibraryRoot();
  if (picked) libraryRootInput.value = picked;
});

saveButton.addEventListener("click", async () => {
  const libraryRoot = libraryRootInput.value.trim();
  if (!libraryRoot) {
    showOnboardingError("Choose a library folder first.");
    return;
  }
  saveButton.disabled = true;
  try {
    await window.fieldy.call("save_config", {
      libraryRoot,
      ingestMode: onboardingIngestMode.value === "copy" ? "copy" : "move",
    });
    await refresh();
  } catch (err) {
    showOnboardingError(err.message || String(err));
  } finally {
    saveButton.disabled = false;
  }
});

["dragenter", "dragover", "drop"].forEach((ev) => {
  window.addEventListener(ev, (e) => {
    e.preventDefault();
    if (ev === "dragenter" || ev === "dragover") highlightFolderDropTarget(e);
    if (ev === "drop") {
      document.querySelectorAll(".folder-item.drop-target").forEach((item) => {
        item.classList.remove("drop-target");
      });
      const target = dropTargetFromPoint(e.clientX, e.clientY);
      if (!target) return;
      if (target.kind === "folder") dropOnFolder(target.name, e);
      if (target.kind === "collection") dropOnCollection(target.id, e);
    }
  });
});

["dragenter", "dragover"].forEach((ev) => {
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    if (!ingesting && !draggingOut) dropzone.classList.add("dragover");
  });
});

dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));

async function runClassifyAndIngest(paths, { busyTitle, doneLabel }) {
  if (ingesting || libraryBusy || !paths.length) return;
  ingesting = true;
  if (closeIngest) closeIngest.disabled = true;
  dropzone.classList.add("busy");
  dropzoneTitle.textContent = busyTitle;
  applyHistoryButtons();
  renderFiles();
  jobRows.clear();
  ingestJobs.replaceChildren();
  showIngestPanel();
  for (const filePath of paths) {
    if (isWavPath(filePath)) setJobStatus(filePath, "queued", "stage");
  }
  try {
    const result = await window.fieldy.call("classify_and_ingest", { paths });
    for (const job of result.jobs || []) {
      if (job.ok) {
        setJobStatus(job.path, `→ ${job.destination}`, "ok");
      } else {
        setJobStatus(job.path, job.error || "failed", "err");
      }
    }
    const okCount = (result.jobs || []).filter((j) => j.ok).length;
    dropzoneTitle.textContent = `Done: ${okCount} ${doneLabel}. Drop more WAV files when you want.`;
  } catch (err) {
    dropzoneTitle.textContent = err.message || String(err);
    showLibraryError(err.message || String(err));
  } finally {
    ingesting = false;
    if (closeIngest) closeIngest.disabled = false;
    dropzone.classList.remove("busy");
    applyHistoryButtons();
  }
  try {
    await refresh();
  } catch (err) {
    showLibraryError(err.message || String(err));
    renderFiles();
  }
}

function classifyExisting(paths) {
  return runClassifyAndIngest(paths, {
    busyTitle: "Reclassifying… first file may load YAMNet",
    doneLabel: "reclassified",
  });
}

closeIngest.addEventListener("click", () => {
  if (ingesting) return;
  hideIngestPanel();
});

closeDropzone.addEventListener("click", () => setDropzoneOpen(false));
toggleDropzone.addEventListener("click", () => setDropzoneOpen(!dropzoneOpen()));
openSettings.addEventListener("click", () => {
  openSettingsDialog();
});
settingsBrowse.addEventListener("click", async () => {
  const picked = await window.fieldy.chooseLibraryRoot();
  if (picked) settingsLibraryRoot.value = picked;
});
undoBtn.addEventListener("click", () => runHistory("undo"));
redoBtn.addEventListener("click", () => runHistory("redo"));

[folderSearch, folderSort, folderFilter].forEach((el) => {
  el.addEventListener(el.tagName === "INPUT" ? "input" : "change", () => {
    if (libraryTree) renderTree(libraryTree);
  });
});

[fileSearch, fileSort, fileFilter].forEach((el) => {
  el.addEventListener(el.tagName === "INPUT" ? "input" : "change", () => {
    renderFiles();
  });
});

reclassifyFolder.addEventListener("click", async () => {
  const files = selectedFiles();
  if (!files.length) return;
  const collection = selectedCollection();
  const label = collection ? collection.name : selectedFolder;
  const ok = await askConfirm({
    title: "Re-run YAMNet",
    body: `Re-run YAMNet on ${files.length} file(s) in ${label}? Files are retagged and moved if the class changes. Originals are not copied.`,
    okLabel: "Reclassify",
  });
  if (!ok) return;
  classifyExisting(files.map((file) => file.path));
});

dropzone.addEventListener("drop", async (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  if (ingesting || draggingOut) return;
  const paths = (await collectIngestPaths(e.dataTransfer.files)).filter(
    (filePath) => !isUnderLibraryRoot(filePath)
  );
  if (!paths.length) {
    dropzoneTitle.textContent = "Drop WAV files or folders (WAV only)";
    return;
  }
  await runClassifyAndIngest(paths, {
    busyTitle: "Ingesting… first file may load YAMNet",
    doneLabel: "ingested",
  });
});

window.fieldy.onEvent((msg) => {
  if (msg.name !== "progress") return;
  const { file, stage, destination, error } = msg.payload || {};
  if (!file) return;
  if (stage === "done") {
    setJobStatus(file, `→ ${destination || "done"}`, "ok");
    return;
  }
  if (stage === "error") {
    setJobStatus(file, error || "error", "err");
    return;
  }
  setJobStatus(file, stage, "stage");
});

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  const combo = event.metaKey || event.ctrlKey;
  if (combo && key === "z") {
    if (event.target.closest("input, textarea, select")) return;
    if (!dialog.classList.contains("hidden")) return;
    event.preventDefault();
    if (event.shiftKey) runHistory("redo");
    else runHistory("undo");
    return;
  }
  if (combo && key === "y") {
    if (event.target.closest("input, textarea, select")) return;
    if (!dialog.classList.contains("hidden")) return;
    event.preventDefault();
    runHistory("redo");
    return;
  }
  if (event.key !== "Escape") return;
  hideContextMenu();
  if (!dialog.classList.contains("hidden")) return;
  clearFileSelection();
});

document.getElementById("file-list").addEventListener("click", (event) => {
  const list = event.currentTarget;
  if (event.target === list || event.target.classList.contains("empty")) {
    clearFileSelection();
  }
});

document.getElementById("file-list").addEventListener("contextmenu", (event) => {
  if (event.target === event.currentTarget || event.target.classList.contains("empty")) {
    event.preventDefault();
    hideContextMenu();
  }
});

window.addEventListener("pointerdown", (event) => {
  const menu = document.getElementById("context-menu");
  if (!menu || menu.hidden) return;
  if (menu.contains(event.target)) return;
  hideContextMenu();
});

window.addEventListener("dragend", () => {
  draggingOut = false;
});

refresh().catch((err) => {
  console.error(err);
  onboarding.classList.remove("hidden");
  library.classList.add("hidden");
  showOnboardingError(err.message || String(err));
});
