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
const ingestSummary = document.getElementById("ingest-summary");
const libraryChrome = document.getElementById("library-chrome");
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
const playerLoop = document.getElementById("player-loop");
const playerRewind = document.getElementById("player-rewind");
const playerMute = document.getElementById("player-mute");
const playerAuto = document.getElementById("player-auto");
const playerClose = document.getElementById("player-close");
const playerName = document.getElementById("player-name");
const playerTime = document.getElementById("player-time");
const playerWave = document.getElementById("player-wave");
const playerVolume = document.getElementById("player-volume");
const playerPitch = document.getElementById("player-pitch");
const playerPitchToggle = document.getElementById("player-pitch-toggle");
const playerPitchValue = document.getElementById("player-pitch-value");
const playerPitchRangeBtn = document.getElementById("player-pitch-range");
const pitchMenu = document.getElementById("pitch-menu");
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
const settingsAutoplay = document.getElementById("settings-autoplay");
const libraryRootDialog = document.getElementById("library-root-dialog");
const libraryRootRelocate = document.getElementById("library-root-relocate");
const libraryRootFresh = document.getElementById("library-root-fresh");
const libraryRootCancel = document.getElementById("library-root-cancel");
const dropzoneHint = document.getElementById("dropzone-hint");
const dropzoneProgress = document.getElementById("dropzone-progress");
const dropzoneProgressLabel = document.getElementById("dropzone-progress-label");
const dropzoneProgressCount = document.getElementById("dropzone-progress-count");
const dropzoneProgressFill = document.getElementById("dropzone-progress-fill");
const dropzoneProgressBar = document.getElementById("dropzone-progress-bar");
const RECENT_VIEW = "Recently added";
const STARRED_VIEW = "Starred";
const PINNED_VIEWS = new Set([RECENT_VIEW, STARRED_VIEW]);
const COLLECTION_PREFIX = "collection:";
let ingesting = false;
let libraryBusy = false;
let historyState = { canUndo: false, canRedo: false };
let appConfig = null;
let pendingLibraryRootMode = null;
let dropzonePrefApplied = false;
let lastIngestFailed = false;
let persistPlaybackTimer = 0;
let lastAutoPlayPath = "";
let playerClosedByUser = false;
let playerClosedSelectionKey = "";
let libraryTree = null;
let selectedFolder = RECENT_VIEW;
const selectedPaths = new Set();
let selectionAnchor = null;
let selectionCursor = null;
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
  failedPath: "",
  wantPlay: false,
};
playback.audio.addEventListener("timeupdate", drawPlayhead);
playback.audio.addEventListener("ended", () => {
  if (!playback.audio.loop) syncPlayerTransport();
  drawWaveform();
  renderFiles();
});
playback.audio.addEventListener("play", () => {
  syncPlayerTransport();
  renderFiles();
});
playback.audio.addEventListener("pause", () => {
  syncPlayerTransport();
  renderFiles();
});
playback.audio.addEventListener("loadedmetadata", () => {
  applyOutput();
  applyPitch();
  drawWaveform();
});

function showOnboardingError(message) {
  onboardingError.textContent = message;
  onboardingError.classList.toggle("hidden", !message);
}

function baseName(filePath) {
  return filePath.split(/[/\\]/).pop() || filePath;
}

function isAudioPath(filePath) {
  return /\.(wav|wave|aif|aiff|flac|mp3)$/i.test(filePath);
}

function showIngestPanel() {
  ingestPanel.hidden = false;
}

function hideIngestPanel() {
  ingestPanel.hidden = true;
}

const STAGE_LABELS = {
  queued: "Waiting",
  inspect: "Checking file",
  analyze: "Listening",
  tag: "Writing tags",
  move: "Saving to library",
  done: "Done",
  error: "Couldn’t add",
};

const STAGE_WEIGHT = {
  queued: 0,
  inspect: 0.08,
  analyze: 0.62,
  tag: 0.84,
  move: 0.94,
  done: 1,
  error: 1,
};

let dropzoneProgressHideTimer = 0;

function showDropzoneProgress() {
  if (!dropzoneProgress) return;
  window.clearTimeout(dropzoneProgressHideTimer);
  dropzoneProgress.classList.remove("hidden");
}

function hideDropzoneProgress() {
  window.clearTimeout(dropzoneProgressHideTimer);
  if (!dropzoneProgress) return;
  dropzoneProgress.classList.add("hidden");
  if (dropzoneProgressFill) dropzoneProgressFill.style.width = "0%";
  if (dropzoneProgressBar) dropzoneProgressBar.setAttribute("aria-valuenow", "0");
}

function hideDropzoneProgressSoon() {
  window.clearTimeout(dropzoneProgressHideTimer);
  dropzoneProgressHideTimer = window.setTimeout(hideDropzoneProgress, 700);
}

function setDropzoneProgress(payload) {
  if (!dropzoneProgressFill) return;
  showDropzoneProgress();
  const stage = payload.stage || "analyze";
  const n = Math.max(1, Number(payload.fileCount) || 1);
  const i = Math.max(0, Number(payload.fileIndex) || 0);
  let inner = STAGE_WEIGHT[stage] ?? 0.5;
  if (stage === "analyze" && payload.pct != null) {
    inner = 0.08 + 0.54 * (Math.min(100, Math.max(0, Number(payload.pct))) / 100);
  }
  const pct = Math.min(100, Math.round(((i + inner) / n) * 100));
  dropzoneProgressFill.style.width = `${pct}%`;
  if (dropzoneProgressBar) dropzoneProgressBar.setAttribute("aria-valuenow", String(pct));
  const name = baseName(payload.file || "");
  const label = STAGE_LABELS[stage] || "Working";
  if (dropzoneProgressLabel) {
    dropzoneProgressLabel.textContent = name ? `${label} · ${name}` : label;
  }
  if (dropzoneProgressCount) dropzoneProgressCount.textContent = `${i + 1} of ${n} · ${pct}%`;
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

function jobWhyLine(job) {
  if (job && job.why) return `→ ${job.why}`;
  if (job && job.destination) return `→ ${job.destination}`;
  return "→ done";
}

function setJobStatus(filePath, text, kind) {
  const row = ensureJobRow(filePath);
  const status = row.querySelector(".status");
  status.textContent = text;
  status.className = `status ${kind || "stage"}`;
  row.classList.toggle("has-error", kind === "err");
}

function setIngestSummary(text, { danger = false } = {}) {
  if (!ingestSummary) return;
  ingestSummary.textContent = text || "";
  ingestSummary.classList.toggle("hidden", !text);
  ingestSummary.classList.toggle("tone-danger", Boolean(text && danger));
  ingestPanel?.classList.toggle("has-errors", Boolean(danger && text));
}

async function collectIngestPaths(fileList) {
  const accepted = [];
  for (const file of fileList) {
    const filePath = window.fieldy.pathForFile(file);
    if (!filePath) continue;
    const info = await window.fieldy.statPath(filePath);
    if (!info?.ok) continue;
    if (info.isDirectory || (info.isFile && isAudioPath(filePath))) {
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

function sameLibraryPath(a, b) {
  const left = String(a || "").replace(/\/+$/, "");
  const right = String(b || "").replace(/\/+$/, "");
  return left === right;
}

function openLibraryRootChoice() {
  return new Promise((resolve) => {
    if (!libraryRootDialog) {
      resolve(null);
      return;
    }
    libraryRootDialog.classList.remove("hidden");
    const finish = (value) => {
      libraryRootRelocate.removeEventListener("click", onRelocate);
      libraryRootFresh.removeEventListener("click", onFresh);
      libraryRootCancel.removeEventListener("click", onCancel);
      libraryRootDialog.removeEventListener("keydown", onKey);
      libraryRootDialog.removeEventListener("click", onBackdrop);
      libraryRootDialog.querySelector(".dialog-card").removeEventListener("click", stopCard);
      libraryRootDialog.classList.add("hidden");
      resolve(value);
    };
    const onRelocate = () => finish("relocate");
    const onFresh = () => finish("fresh");
    const onCancel = () => finish(null);
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }
    };
    const stopCard = (event) => event.stopPropagation();
    const onBackdrop = () => onCancel();
    libraryRootRelocate.addEventListener("click", onRelocate);
    libraryRootFresh.addEventListener("click", onFresh);
    libraryRootCancel.addEventListener("click", onCancel);
    libraryRootDialog.addEventListener("keydown", onKey);
    libraryRootDialog.querySelector(".dialog-card").addEventListener("click", stopCard);
    libraryRootDialog.addEventListener("click", onBackdrop);
    requestAnimationFrame(() => libraryRootRelocate.focus());
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
      ? "WAV, AIFF, FLAC, and MP3. Fieldy listens, tags, and adds a copy to your library — the original stays where it is. The first file can take a minute while Fieldy gets ready."
      : "WAV, AIFF, FLAC, and MP3. Fieldy listens, tags, and moves them into your library. The first file can take a minute while Fieldy gets ready.";
  }
  if (applyDropzonePref) {
    setDropzoneOpen(appConfig.dropzoneOnLaunch !== false);
    dropzonePrefApplied = true;
  }
  applyPlaybackPrefs(appConfig);
}

function playbackVolumeValue() {
  const n = Number(appConfig?.playbackVolume);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1;
}

function pitchRangeMax() {
  const rng = Number(appConfig?.playbackPitchRange);
  return rng === 4 || rng === 8 ? rng * 100 : 200;
}

function playbackPitchValue() {
  const max = pitchRangeMax();
  const n = Number(appConfig?.playbackPitch);
  if (!Number.isFinite(n)) return 100;
  return Math.min(max, Math.max(0.1, n));
}

function applyOutput() {
  const muted = Boolean(appConfig?.playbackMuted);
  const volume = playbackVolumeValue();
  playback.audio.volume = muted ? 0 : volume;
  if (playerVolume) playerVolume.value = String(Math.round((muted ? 0 : volume) * 100));
  if (playerMute) {
    playerMute.setAttribute("aria-pressed", muted ? "true" : "false");
    playerMute.setAttribute("aria-label", muted ? "Unmute" : "Mute");
    playerMute.title = muted ? "Unmute" : "Mute";
  }
}

function applyPitch() {
  const enabled = Boolean(appConfig?.playbackPitchEnabled);
  const percent = playbackPitchValue();
  const rate = enabled ? Math.min(16, Math.max(0.0625, percent / 100)) : 1;
  const keepTune = appConfig?.playbackPreservePitch !== false;
  try {
    playback.audio.preservesPitch = keepTune;
    playback.audio.webkitPreservesPitch = keepTune;
    playback.audio.mozPreservesPitch = keepTune;
  } catch {
    /* older Chromium */
  }
  try {
    playback.audio.playbackRate = rate;
  } catch {
    playback.audio.playbackRate = 1;
  }
  if (playerPitch) {
    playerPitch.max = String(pitchRangeMax());
    playerPitch.value = String(percent);
    playerPitch.classList.toggle("is-off", !enabled);
  }
  if (playerPitchValue) playerPitchValue.textContent = percent.toFixed(1);
  if (playerPitchToggle) {
    playerPitchToggle.setAttribute("aria-pressed", enabled ? "true" : "false");
  }
  if (playerPitchRangeBtn) {
    const rng = Number(appConfig?.playbackPitchRange) === 4 || Number(appConfig?.playbackPitchRange) === 8
      ? Number(appConfig.playbackPitchRange)
      : 2;
    playerPitchRangeBtn.textContent = `${rng}x`;
  }
}

function applyPlaybackPrefs(cfg) {
  playback.audio.loop = Boolean(cfg?.playbackLoop);
  if (playerLoop) playerLoop.setAttribute("aria-pressed", cfg?.playbackLoop ? "true" : "false");
  if (playerAuto) playerAuto.checked = Boolean(cfg?.autoPlayOnSelect);
  if (settingsAutoplay) settingsAutoplay.checked = Boolean(cfg?.autoPlayOnSelect);
  applyOutput();
  applyPitch();
  syncPlayerTransport();
}

function syncPlayerTransport() {
  const playing = Boolean(playback.audio.src) && !playback.audio.paused;
  if (playerToggle) {
    playerToggle.classList.toggle("is-playing", playing);
    playerToggle.setAttribute("aria-label", playing ? "Pause" : "Play");
    playerToggle.title = playing ? "Pause" : "Play";
    playerToggle.disabled = playback.loading;
  }
  if (playerRewind) playerRewind.disabled = !playback.audio.src || playback.loading;
}

function configPayload(extra = {}) {
  if (!appConfig) return extra;
  return {
    libraryRoot: appConfig.libraryRoot,
    ingestMode: appConfig.ingestMode,
    confidenceThreshold: appConfig.confidenceThreshold,
    dropzoneOnLaunch: appConfig.dropzoneOnLaunch,
    analyzeChunkSeconds: appConfig.analyzeChunkSeconds,
    playbackVolume: playbackVolumeValue(),
    playbackLoop: Boolean(appConfig.playbackLoop),
    autoPlayOnSelect: Boolean(appConfig.autoPlayOnSelect),
    playbackMuted: Boolean(appConfig.playbackMuted),
    playbackPitch: playbackPitchValue(),
    playbackPitchEnabled: Boolean(appConfig.playbackPitchEnabled),
    playbackPitchRange: Number(appConfig.playbackPitchRange) === 4 || Number(appConfig.playbackPitchRange) === 8
      ? Number(appConfig.playbackPitchRange)
      : 2,
    playbackPitchResetOnNew: appConfig.playbackPitchResetOnNew !== false,
    playbackPreservePitch: appConfig.playbackPreservePitch !== false,
    ...extra,
  };
}

function persistPlaybackPrefs() {
  if (!appConfig) return;
  window.clearTimeout(persistPlaybackTimer);
  persistPlaybackTimer = window.setTimeout(() => {
    window.fieldy.call("save_config", configPayload()).catch((err) => {
      console.error(err);
    });
  }, 280);
}

function setPlaybackLoop(on) {
  if (!appConfig) return;
  appConfig.playbackLoop = Boolean(on);
  playback.audio.loop = appConfig.playbackLoop;
  if (playerLoop) playerLoop.setAttribute("aria-pressed", appConfig.playbackLoop ? "true" : "false");
  persistPlaybackPrefs();
}

function setAutoPlayOnSelect(on) {
  if (!appConfig) return;
  appConfig.autoPlayOnSelect = Boolean(on);
  if (playerAuto) playerAuto.checked = appConfig.autoPlayOnSelect;
  if (settingsAutoplay) settingsAutoplay.checked = appConfig.autoPlayOnSelect;
  persistPlaybackPrefs();
}

function setPlaybackVolume(value, { fromSlider = false } = {}) {
  const volume = Math.min(1, Math.max(0, Number(value)));
  if (!appConfig) {
    playback.audio.volume = volume;
    if (playerVolume) playerVolume.value = String(Math.round(volume * 100));
    return;
  }
  if (fromSlider) {
    appConfig.playbackMuted = volume === 0;
    if (volume > 0) appConfig.playbackVolume = volume;
  } else {
    appConfig.playbackVolume = volume;
    appConfig.playbackMuted = volume === 0;
  }
  applyOutput();
  persistPlaybackPrefs();
}

function toggleMute() {
  if (!appConfig) return;
  if (appConfig.playbackMuted || playbackVolumeValue() === 0) {
    appConfig.playbackMuted = false;
    if (playbackVolumeValue() === 0) appConfig.playbackVolume = 1;
  } else {
    appConfig.playbackMuted = true;
  }
  applyOutput();
  persistPlaybackPrefs();
}

function setPitchEnabled(on) {
  if (!appConfig) return;
  appConfig.playbackPitchEnabled = Boolean(on);
  applyPitch();
  persistPlaybackPrefs();
}

function setPitchPercent(value) {
  if (!appConfig) return;
  appConfig.playbackPitch = Math.min(pitchRangeMax(), Math.max(0.1, Number(value)));
  applyPitch();
  persistPlaybackPrefs();
}

function setPitchRange(range) {
  if (!appConfig) return;
  const rng = range === 4 || range === 8 ? range : 2;
  appConfig.playbackPitchRange = rng;
  appConfig.playbackPitch = Math.min(rng * 100, playbackPitchValue());
  applyPitch();
  persistPlaybackPrefs();
}

function hidePitchMenu() {
  if (!pitchMenu) return;
  pitchMenu.classList.add("hidden");
  pitchMenu.hidden = true;
  pitchMenu.replaceChildren();
  if (playerPitchRangeBtn) playerPitchRangeBtn.setAttribute("aria-expanded", "false");
}

function openPitchMenu() {
  if (!pitchMenu || !playerPitchRangeBtn) return;
  const current = Number(appConfig?.playbackPitchRange) === 4 || Number(appConfig?.playbackPitchRange) === 8
    ? Number(appConfig.playbackPitchRange)
    : 2;
  const resetOn = appConfig?.playbackPitchResetOnNew !== false;
  const keepTune = appConfig?.playbackPreservePitch !== false;
  pitchMenu.replaceChildren();
  for (const rng of [2, 4, 8]) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "context-item";
    item.setAttribute("role", "menuitem");
    item.textContent = `${rng === current ? "✓ " : ""}${rng}x`;
    item.addEventListener("click", () => {
      hidePitchMenu();
      setPitchRange(rng);
    });
    pitchMenu.appendChild(item);
  }
  const sep = document.createElement("div");
  sep.className = "context-sep";
  pitchMenu.appendChild(sep);
  const tune = document.createElement("button");
  tune.type = "button";
  tune.className = "context-item";
  tune.setAttribute("role", "menuitem");
  tune.textContent = `${keepTune ? "✓ " : ""}Keep master tune`;
  tune.title = "When on, speed changes without shifting pitch. When off, faster is higher and slower is lower.";
  tune.addEventListener("click", () => {
    if (!appConfig) return;
    appConfig.playbackPreservePitch = !keepTune;
    hidePitchMenu();
    applyPitch();
    persistPlaybackPrefs();
  });
  pitchMenu.appendChild(tune);
  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "context-item";
  reset.setAttribute("role", "menuitem");
  reset.textContent = `${resetOn ? "✓ " : ""}Reset pitch slider on new file`;
  reset.addEventListener("click", () => {
    if (!appConfig) return;
    appConfig.playbackPitchResetOnNew = !resetOn;
    hidePitchMenu();
    persistPlaybackPrefs();
  });
  pitchMenu.appendChild(reset);
  pitchMenu.classList.remove("hidden");
  pitchMenu.hidden = false;
  playerPitchRangeBtn.setAttribute("aria-expanded", "true");
  const rect = playerPitchRangeBtn.getBoundingClientRect();
  const pad = 8;
  pitchMenu.style.left = `${Math.min(rect.left, window.innerWidth - pitchMenu.offsetWidth - pad)}px`;
  pitchMenu.style.top = `${Math.max(pad, rect.top - pitchMenu.offsetHeight - 6)}px`;
}

async function openSettingsDialog() {
  const cfg = appConfig || (await window.fieldy.call("get_config"));
  if (!cfg || cfg.needsOnboarding) return;
  pendingLibraryRootMode = null;
  settingsLibraryRoot.value = cfg.libraryRoot || "";
  settingsIngestMode.value = cfg.ingestMode === "copy" ? "copy" : "move";
  settingsThreshold.value = String(cfg.confidenceThreshold ?? 0.3);
  settingsDropzoneOnLaunch.checked = cfg.dropzoneOnLaunch !== false;
  if (settingsAutoplay) settingsAutoplay.checked = Boolean(cfg.autoPlayOnSelect);
  const ok = await openDialog({
    title: "Settings",
    okLabel: "Save",
    settings: true,
  });
  if (!ok) {
    pendingLibraryRootMode = null;
    return;
  }
  const threshold = Number(settingsThreshold.value);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    showLibraryError("Threshold must be between 0 and 1.");
    pendingLibraryRootMode = null;
    return;
  }
  const libraryRoot = settingsLibraryRoot.value.trim();
  if (!libraryRoot) {
    showLibraryError("Choose a library folder first.");
    pendingLibraryRootMode = null;
    return;
  }
  const rootChanged = !sameLibraryPath(libraryRoot, cfg.libraryRoot);
  try {
    await window.fieldy.call("save_config", {
      ...configPayload({
        libraryRoot,
        ingestMode: settingsIngestMode.value,
        confidenceThreshold: threshold,
        dropzoneOnLaunch: settingsDropzoneOnLaunch.checked,
        autoPlayOnSelect: Boolean(settingsAutoplay?.checked),
      }),
      ...(rootChanged ? { libraryRootMode: pendingLibraryRootMode || "fresh" } : {}),
    });
    if (rootChanged) {
      selectedPaths.clear();
      selectionAnchor = null;
      selectionCursor = null;
    }
    applyAppConfig(
      {
        ...cfg,
        libraryRoot,
        ingestMode: settingsIngestMode.value,
        confidenceThreshold: threshold,
        dropzoneOnLaunch: settingsDropzoneOnLaunch.checked,
        autoPlayOnSelect: Boolean(settingsAutoplay?.checked),
      },
      { applyDropzonePref: true }
    );
    await refresh();
  } catch (err) {
    showLibraryError(err.message || String(err));
  } finally {
    pendingLibraryRootMode = null;
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
  if (!playerWave) return;
  const cssWidth = playerWave.clientWidth || 600;
  const cssHeight = 52;
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
  if (n) {
    const mid = cssHeight / 2;
    ctx.fillStyle = "#ff8a3d";
    for (let i = 0; i < n; i += 1) {
      const x = (i / n) * cssWidth;
      const w = Math.max(1, cssWidth / n);
      const lo = mid - maxs[i] * (mid - 4);
      const hi = mid - mins[i] * (mid - 4);
      ctx.fillRect(x, Math.min(lo, hi), w, Math.max(1, Math.abs(hi - lo)));
    }
  }
  const dur = playback.audio.duration;
  if (n && dur && Number.isFinite(dur) && dur > 0) {
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

function selectionKey() {
  return [...selectedPaths].sort().join("\n");
}

function showPlayer() {
  playerClosedByUser = false;
  playerClosedSelectionKey = "";
  player?.classList.remove("hidden");
  requestAnimationFrame(() => drawWaveform());
}

function closePlayer({ byUser = false } = {}) {
  if (playback.loading) return;
  if (playback.audio.src && !playback.audio.paused) playback.audio.pause();
  player?.classList.add("hidden");
  if (byUser) {
    playerClosedByUser = true;
    playerClosedSelectionKey = selectionKey();
  } else {
    playerClosedByUser = false;
    playerClosedSelectionKey = "";
  }
}

function syncPlayerForSelection() {
  const file = primarySelectedFile();
  if (playback.loading) {
    if (file || playback.path) player?.classList.remove("hidden");
    return;
  }
  if (!file) {
    closePlayer({ byUser: false });
    return;
  }
  if (playerClosedByUser && playerClosedSelectionKey === selectionKey()) return;
  playerClosedByUser = false;
  playerClosedSelectionKey = "";
  player?.classList.remove("hidden");
  const shouldPlay = Boolean(appConfig?.autoPlayOnSelect) && selectedPaths.size === 1;
  if (playback.path === file.path && playback.audio.src) {
    requestAnimationFrame(() => drawWaveform());
    if (shouldPlay && playback.audio.paused && lastAutoPlayPath !== file.path) {
      lastAutoPlayPath = file.path;
      playback.audio.currentTime = 0;
      playPreview();
    }
    return;
  }
  if (playback.failedPath === file.path) {
    requestAnimationFrame(() => drawWaveform());
    return;
  }
  if (shouldPlay) lastAutoPlayPath = file.path;
  loadPreview(file, { play: shouldPlay, restart: shouldPlay });
}

function isPlayAbort(err) {
  const message = err && err.message ? String(err.message) : "";
  return Boolean(err && (err.name === "AbortError" || message.includes("interrupted by a call to pause")));
}

async function playPreview() {
  try {
    await playback.audio.play();
    applyPitch();
  } catch (err) {
    if (isPlayAbort(err)) return;
    throw err;
  }
}

async function loadPreview(file, { play = false, restart = false } = {}) {
  if (!file) return;
  if (play) playback.wantPlay = true;
  if (playback.loading) return;
  player?.classList.remove("hidden");
  if (file.path === playback.path && playback.audio.src) {
    if (restart) playback.audio.currentTime = 0;
    if (playback.wantPlay || play) await playPreview();
    playback.wantPlay = false;
    drawWaveform();
    return;
  }
  playback.loading = true;
  playerName.textContent = `Loading ${file.name}…`;
  playerTime.textContent = "";
  syncPlayerTransport();
  renderFiles();
  try {
    const prepared = await window.fieldy.call("prepare_playback", { path: file.path });
    const bytes = await window.fieldy.readPlaybackFile(prepared.previewPath);
    if (playback.blobUrl) URL.revokeObjectURL(playback.blobUrl);
    playback.blobUrl = URL.createObjectURL(bytesToWavBlob(bytes));
    playback.path = file.path;
    playback.name = file.name;
    playback.failedPath = "";
    playback.peaksMin = prepared.peaksMin || [];
    playback.peaksMax = prepared.peaksMax || [];
    if (appConfig?.playbackPitchResetOnNew !== false) {
      appConfig.playbackPitch = 100;
      persistPlaybackPrefs();
    }
    playback.audio.pause();
    playback.audio.loop = Boolean(appConfig?.playbackLoop);
    playback.audio.src = playback.blobUrl;
    applyOutput();
    applyPitch();
    playerName.textContent = file.name;
    drawWaveform();
    if (play || playback.wantPlay) await playPreview();
  } catch (err) {
    if (isPlayAbort(err)) return;
    playback.failedPath = file.path;
    showLibraryError(err.message || String(err));
    playerName.textContent = file.name || "No file selected";
  } finally {
    playback.wantPlay = false;
    playback.loading = false;
    syncPlayerTransport();
    renderFiles();
  }
}

async function playFile(file, { restart = false } = {}) {
  showPlayer();
  playback.wantPlay = true;
  await loadPreview(file, { play: true, restart });
}

async function togglePlayback(file) {
  if (!file) {
    file = primarySelectedFile();
    if (!file) return;
  }
  showPlayer();
  if (file.path === playback.path && playback.audio.src && !playback.loading) {
    if (playback.audio.paused) await playPreview();
    else playback.audio.pause();
    return;
  }
  playback.wantPlay = true;
  await loadPreview(file, { play: true });
}

playerToggle.addEventListener("click", () => {
  togglePlayback(primarySelectedFile() || (playback.path ? { path: playback.path, name: playback.name } : null));
});

if (playerRewind) {
  playerRewind.addEventListener("click", () => {
    if (!playback.audio.src) return;
    playback.audio.currentTime = 0;
    drawWaveform();
  });
}

if (playerLoop) {
  playerLoop.addEventListener("click", () => {
    setPlaybackLoop(playerLoop.getAttribute("aria-pressed") !== "true");
  });
}

if (playerAuto) {
  playerAuto.addEventListener("change", () => {
    setAutoPlayOnSelect(playerAuto.checked);
  });
}

if (playerClose) {
  playerClose.addEventListener("click", () => closePlayer({ byUser: true }));
}

if (playerMute) {
  playerMute.addEventListener("click", () => toggleMute());
}

if (playerVolume) {
  playerVolume.addEventListener("input", () => {
    setPlaybackVolume(Number(playerVolume.value) / 100, { fromSlider: true });
  });
}

if (playerPitchToggle) {
  playerPitchToggle.addEventListener("click", () => {
    setPitchEnabled(playerPitchToggle.getAttribute("aria-pressed") !== "true");
  });
}

if (playerPitch) {
  playerPitch.addEventListener("input", () => {
    setPitchPercent(Number(playerPitch.value));
  });
}

if (playerPitchRangeBtn) {
  playerPitchRangeBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    if (pitchMenu && !pitchMenu.hidden) hidePitchMenu();
    else openPitchMenu();
  });
}

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
    libraryChrome?.classList.add("hidden");
    return;
  }
  onboarding.classList.add("hidden");
  library.classList.remove("hidden");
  libraryChrome?.classList.remove("hidden");
  applyAppConfig(cfg, { applyDropzonePref: !dropzonePrefApplied });
  const tree = await window.fieldy.call("list_library");
  renderTree(tree);
  await syncHistory();
  drawWaveform();
}

function libraryHasAudio(tree = libraryTree) {
  return (tree?.folders || []).some((folder) => (folder.files || []).length > 0);
}

function folderCount(folder) {
  return folder.files?.length || 0;
}

function appendEmptyState(parent, { title, body, danger = false } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "empty-state" + (danger ? " empty-state-danger" : "");
  const heading = document.createElement("h3");
  heading.textContent = title;
  const copy = document.createElement("p");
  copy.textContent = body;
  wrap.append(heading, copy);
  parent.appendChild(wrap);
}

function dropzoneHintForEmpty() {
  return dropzoneOpen()
    ? "Drop WAV, AIFF, FLAC, or MP3 on the drop zone above. Fieldy tags them and files them into AudioSet class folders."
    : "Show the drop zone from the toolbar, then drop WAV, AIFF, FLAC, or MP3. Fieldy tags them and files them into AudioSet class folders.";
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
      selectionCursor = null;
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
    await window.fieldy.call("add_to_collection", { id: collectionId, paths });
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

async function addFilesToNewCollection(files) {
  const name = await askText({
    title: "New collection",
    okLabel: "Create",
    value: "",
  });
  if (!name) return;
  try {
    const created = await window.fieldy.call("create_collection", { name });
    await addPathsToCollection(created.id, files.map((file) => file.path));
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
    selectionCursor = null;
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
    await window.fieldy.call("move_file", { paths, destFolder });
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
  if (selectionCursor && !allowed.has(selectionCursor)) selectionCursor = null;
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
    selectionCursor = filePath;
    return;
  }
  if (isToggleModifier(event)) {
    if (selectedPaths.has(filePath)) selectedPaths.delete(filePath);
    else selectedPaths.add(filePath);
    selectionAnchor = filePath;
    selectionCursor = filePath;
    return;
  }
  selectedPaths.clear();
  selectedPaths.add(filePath);
  selectionAnchor = filePath;
  selectionCursor = filePath;
}

function chosenFiles() {
  return visibleFiles().filter((file) => selectedPaths.has(file.path));
}

function actionTargets(file) {
  if (file && selectedPaths.has(file.path) && selectedPaths.size > 1) {
    return chosenFiles();
  }
  return file ? [file] : chosenFiles();
}

function primarySelectedFile() {
  const files = chosenFiles();
  if (!files.length) return null;
  return files.find((file) => file.path === selectionAnchor) || files[0];
}

function selectAllVisible() {
  const visible = visibleFiles();
  selectedPaths.clear();
  for (const file of visible) selectedPaths.add(file.path);
  selectionAnchor = visible[0]?.path || null;
  selectionCursor = visible[visible.length - 1]?.path || null;
  renderFiles();
}

function moveSelectionBy(delta, extend) {
  const visible = visibleFiles().map((file) => file.path);
  if (!visible.length) return;
  const head =
    extend && selectionCursor && visible.includes(selectionCursor)
      ? selectionCursor
      : selectionAnchor;
  let index = head ? visible.indexOf(head) : -1;
  if (index < 0) index = delta > 0 ? -1 : visible.length;
  const next = Math.min(visible.length - 1, Math.max(0, index + delta));
  const filePath = visible[next];
  if (extend && selectionAnchor && visible.includes(selectionAnchor)) {
    selectOnNameClick(filePath, { shiftKey: true, metaKey: false, ctrlKey: false });
    selectionCursor = filePath;
  } else {
    selectedPaths.clear();
    selectedPaths.add(filePath);
    selectionAnchor = filePath;
    selectionCursor = filePath;
  }
  renderFiles();
  document.querySelector("#file-list .file-row.selected")?.scrollIntoView({ block: "nearest" });
}

function shortcutBlocked(event) {
  if (event.target.closest("input, textarea, select")) return true;
  if (!dialog.classList.contains("hidden")) return true;
  if (libraryRootDialog && !libraryRootDialog.classList.contains("hidden")) return true;
  if (library.classList.contains("hidden")) return true;
  return false;
}

function clearFileSelection() {
  if (!selectedPaths.size && !selectionAnchor) return;
  selectedPaths.clear();
  selectionAnchor = null;
  selectionCursor = null;
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
  return starFiles(actionTargets(file), favorite);
}

function starFiles(files, favorite) {
  const paths = files.map((file) => file.path);
  if (!paths.length) return;
  return mutateLibrary("set_favorite", { paths, favorite });
}

async function renameLibraryFile(file) {
  const next = await askRename(file.name);
  if (!next || next === file.name) return;
  mutateLibrary("rename_file", { path: file.path, newName: next });
}

async function deleteLibraryFile(file) {
  return deleteLibraryFiles(actionTargets(file));
}

async function deleteLibraryFiles(files) {
  if (!files.length) return;
  const ok = await askConfirm({
    title: files.length === 1 ? "Delete file" : "Delete files",
    body:
      files.length === 1
        ? `Delete ${files[0].name}? This cannot be undone.`
        : `Delete ${files.length} files? This cannot be undone.`,
    okLabel: "Delete",
    tone: "danger",
  });
  if (!ok) return;
  mutateLibrary("delete_file", { paths: files.map((file) => file.path) });
}

async function reclassifyLibraryFile(file) {
  const files = actionTargets(file);
  const ok = await askConfirm({
    title: files.length === 1 ? "Reclassify file" : "Reclassify files",
    body:
      files.length === 1
        ? `Reclassify ${files[0].name}? It will be retagged and moved if the class changes. The original format is not changed.`
        : `Reclassify ${files.length} files? They will be retagged and moved if the class changes. Original formats are not changed.`,
    okLabel: "Reclassify",
  });
  if (!ok) return;
  classifyExisting(files.map((item) => item.path));
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
  if (!selectedPaths.has(file.path)) {
    selectedPaths.clear();
    selectedPaths.add(file.path);
    selectionAnchor = file.path;
  }
  const targets = chosenFiles().length ? chosenFiles() : [file];
  const n = targets.length;
  const paths = targets.map((item) => item.path);
  hideContextMenu();
  menu.hidden = false;
  menu.classList.remove("hidden");
  addContextItem(menu, "Show in Finder", () => {
    window.fieldy.showInFinder(file.path).catch((err) => {
      showLibraryError(err.message || String(err));
    });
  });
  const allStarred = targets.every((item) => item.favorite);
  addContextItem(
    menu,
    allStarred
      ? n > 1
        ? `Remove star from ${n} files`
        : "Remove star"
      : n > 1
        ? `Add ${n} to starred`
        : "Add to starred",
    () => starFiles(targets, !allStarred)
  );
  addContextSeparator(menu);
  addContextItem(menu, "Rename", () => renameLibraryFile(file), { disabled: n !== 1 });
  addContextItem(
    menu,
    n > 1 ? `Delete ${n} files` : "Delete",
    () => deleteLibraryFiles(targets),
    { danger: true }
  );
  addContextItem(
    menu,
    n > 1 ? `Reclassify ${n} files` : "Reclassify",
    () => reclassifyLibraryFile(file),
    { disabled: ingesting || libraryBusy }
  );
  const collections = libraryTree?.collections || [];
  addContextSeparator(menu);
  addContextSubmenu(menu, n > 1 ? `Add ${n} to collection` : "Add to collection", [
    {
      label: "New collection…",
      onClick: () => addFilesToNewCollection(targets),
    },
    ...collections.map((collection) => ({
      label: collection.name,
      onClick: () => addPathsToCollection(collection.id, paths),
    })),
  ]);
  if (otherFolders.length) {
    addContextSeparator(menu);
    addContextSubmenu(
      menu,
      n > 1 ? `Move ${n} to` : "Move to",
      otherFolders.map((dest) => ({
        label: dest,
        onClick: () => moveLibraryPaths(paths, dest),
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
    reclassifyFolder.hidden = !allFiles.length;
    reclassifyFolder.title = allFiles.length
      ? `Reclassify ${allFiles.length} file(s) in ${collection ? collection.name : selectedFolder}`
      : isRecent
        ? "Nothing added yet"
        : isStarred
          ? "No starred files yet"
          : collection
            ? "No files in this collection"
            : "No files in this folder";
  }
  list.replaceChildren();
  if (!allFiles.length) {
    const emptyLibrary = !libraryHasAudio();
    if (isRecent && lastIngestFailed && emptyLibrary) {
      appendEmptyState(list, {
        title: "Nothing was added",
        body: "The last drop did not land in the library. Check Last drop for the error, then try again.",
        danger: true,
      });
    } else if (isRecent && emptyLibrary) {
      appendEmptyState(list, {
        title: "Your library is empty",
        body: dropzoneHintForEmpty(),
      });
    } else if (isRecent) {
      appendEmptyState(list, {
        title: "No recent files",
        body: "Newly added audio shows up here. Drop more files, or open a class folder in the sidebar.",
      });
    } else if (isStarred) {
      appendEmptyState(list, {
        title: "No starred files",
        body: "Star a file to keep it in this list. Stars stay with the file if you move it.",
      });
    } else if (collection) {
      appendEmptyState(list, {
        title: "This collection is empty",
        body: "Drag files onto the collection in the sidebar, or use Add to collection from a file.",
      });
    } else {
      appendEmptyState(list, {
        title: "This folder is empty",
        body: "Files land here when they classify as this AudioSet class, or when you move them in.",
      });
    }
    syncPlayerForSelection();
    return;
  }
  if (!files.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No files match.";
    list.appendChild(empty);
    syncPlayerForSelection();
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
    playBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      selectedPaths.clear();
      selectedPaths.add(file.path);
      selectionAnchor = file.path;
      selectionCursor = file.path;
      togglePlayback(file);
    });

    const favBtn = document.createElement("button");
    favBtn.type = "button";
    favBtn.className = "favorite-btn" + (file.favorite ? " on" : "");
    favBtn.setAttribute("aria-label", file.favorite ? `Unfavorite ${file.name}` : `Favorite ${file.name}`);
    favBtn.setAttribute("aria-pressed", file.favorite ? "true" : "false");
    favBtn.textContent = file.favorite ? "★" : "☆";
    favBtn.disabled = ingesting || libraryBusy;
    favBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const targets = actionTargets(file);
      const next = targets.every((item) => item.favorite) ? false : true;
      starFiles(targets, next);
    });

    const handle = document.createElement("span");
    handle.className = "file-drag-handle";
    handle.title = "Drag to a folder or another app";
    handle.setAttribute("aria-label", `Drag ${file.name}`);
    for (let i = 0; i < 6; i += 1) handle.appendChild(document.createElement("i"));

    const nameCell = document.createElement("div");
    nameCell.className = "file-name-cell";

    const name = document.createElement("div");
    name.className = "file-name";
    name.textContent = file.name;
    name.title = file.path;

    bindFileDrag(handle, file);
    bindFileDrag(name, file);
    nameCell.append(name);

    const duration = document.createElement("div");
    duration.className = "file-duration";
    duration.textContent = formatDuration(file.duration);

    const tags = document.createElement("div");
    tags.className = "file-tags";
    const tagNames = file.tags || [];
    tags.textContent = tagNames.length
      ? tagNames.join(" · ")
      : "No tags (nothing reached the threshold)";
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
      moveSelect.addEventListener("click", (event) => event.stopPropagation());
      moveSelect.addEventListener("change", () => {
        const destFolder = moveSelect.value;
        moveSelect.value = "";
        if (!destFolder) return;
        const paths = actionTargets(file)
          .map((item) => item.path)
          .filter((filePath) => currentFolderName({ path: filePath }) !== destFolder);
        if (paths.length) moveLibraryPaths(paths, destFolder);
      });
      actions.appendChild(moveSelect);
    }

    const renameBtn = iconButton("Rename", [
      "M12 20h9",
      "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z",
    ]);
    renameBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      renameLibraryFile(file);
    });

    const deleteBtn = iconButton("Delete", [
      "M3 6h18",
      "M8 6V4h8v2",
      "M19 6l-1 14H6L5 6",
      "M10 11v6",
      "M14 11v6",
    ]);
    deleteBtn.classList.add("danger");
    deleteBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteLibraryFile(file);
    });

    actions.append(renameBtn, deleteBtn);
    row.append(handle, playBtn, favBtn, nameCell, duration, tags, actions);
    row.addEventListener("click", (event) => {
      if (suppressFileClick) {
        suppressFileClick = false;
        return;
      }
      if (event.target.closest("button, select")) return;
      selectOnNameClick(file.path, event);
      renderFiles();
    });
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openContextMenu(event, file, otherFolders);
    });
    list.appendChild(row);
  }
  syncPlayerForSelection();
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
  setDropzoneOpen(true);
  dropzone.classList.add("busy");
  dropzoneTitle.textContent = busyTitle;
  setDropzoneProgress({ stage: "inspect", fileIndex: 0, fileCount: paths.length, file: paths[0] });
  applyHistoryButtons();
  renderFiles();
  jobRows.clear();
  ingestJobs.replaceChildren();
  setIngestSummary("");
  showIngestPanel();
  for (const filePath of paths) {
    if (isAudioPath(filePath)) setJobStatus(filePath, "Waiting", "stage");
  }
  try {
    const result = await window.fieldy.call("classify_and_ingest", { paths });
    const jobs = result.jobs || [];
    for (const job of jobs) {
      if (job.ok) {
        setJobStatus(job.path, jobWhyLine(job), "ok");
      } else {
        setJobStatus(job.path, job.error || "failed", "err");
      }
    }
    const okCount = jobs.filter((j) => j.ok).length;
    const failCount = jobs.filter((j) => !j.ok).length;
    lastIngestFailed = failCount > 0 && okCount === 0;
    setDropzoneProgress({
      stage: "done",
      fileIndex: Math.max(0, jobs.length - 1),
      fileCount: Math.max(1, jobs.length || paths.length),
    });
    if (doneLabel === "reclassified") {
      dropzoneTitle.textContent =
        okCount === 1 ? "Updated 1 file." : `Updated ${okCount} files.`;
    } else if (okCount && failCount) {
      dropzoneTitle.textContent = `Added ${okCount} file${okCount === 1 ? "" : "s"}. ${failCount} could not be added.`;
    } else if (failCount) {
      dropzoneTitle.textContent =
        failCount === 1 ? "Couldn’t add that file." : `Couldn’t add ${failCount} files.`;
    } else {
      dropzoneTitle.textContent =
        okCount === 1
          ? "Added 1 file. Drop more whenever you like."
          : `Added ${okCount} files. Drop more whenever you like.`;
    }
    if (failCount) {
      setIngestSummary(
        okCount
          ? `${failCount} file${failCount === 1 ? "" : "s"} could not be added.`
          : "Nothing landed in the library. See the errors below.",
        { danger: true }
      );
    } else {
      setIngestSummary("");
    }
  } catch (err) {
    lastIngestFailed = true;
    dropzoneTitle.textContent = err.message || String(err);
    setIngestSummary("The drop did not finish. Nothing new was added.", { danger: true });
    showLibraryError(err.message || String(err));
  } finally {
    ingesting = false;
    if (closeIngest) closeIngest.disabled = false;
    dropzone.classList.remove("busy");
    hideDropzoneProgressSoon();
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
    busyTitle: "Updating files… the first one can take a minute",
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
  const current = settingsLibraryRoot.value.trim();
  const choice = await openLibraryRootChoice();
  if (!choice) return;
  const picked = await window.fieldy.chooseLibraryRoot();
  if (!picked) return;
  settingsLibraryRoot.value = picked;
  pendingLibraryRootMode = sameLibraryPath(picked, current) ? null : choice;
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
    title: "Reclassify files",
    body: `Reclassify ${files.length} file(s) in ${label}? Files are retagged and moved if the class changes. Original formats are not changed.`,
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
    dropzoneTitle.textContent = "Drop audio files or folders here";
    return;
  }
  await runClassifyAndIngest(paths, {
    busyTitle: "Adding to your library… the first file can take a minute",
    doneLabel: "ingested",
  });
});

window.fieldy.onEvent((msg) => {
  if (msg.name !== "progress") return;
  const payload = msg.payload || {};
  const { file, stage, destination, error, why } = payload;
  if (file) setDropzoneProgress(payload);
  if (!file) return;
  if (stage === "done") {
    setJobStatus(file, jobWhyLine({ why, destination }), "ok");
    return;
  }
  if (stage === "error") {
    setJobStatus(file, error || "error", "err");
    return;
  }
  setJobStatus(file, STAGE_LABELS[stage] || stage, "stage");
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
  if (shortcutBlocked(event)) {
    if (event.key === "Escape") hideContextMenu();
    return;
  }
  if (event.key === "Escape") {
    hideContextMenu();
    clearFileSelection();
    return;
  }
  if (combo && key === "a") {
    event.preventDefault();
    selectAllVisible();
    return;
  }
  if (event.key === " " || event.code === "Space") {
    if (event.target.closest("button")) return;
    event.preventDefault();
    const file = primarySelectedFile();
    if (file) togglePlayback(file);
    return;
  }
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    moveSelectionBy(event.key === "ArrowDown" ? 1 : -1, event.shiftKey);
    return;
  }
  if (event.key === "F2" || (event.key === "Enter" && !event.target.closest("button"))) {
    event.preventDefault();
    const file = chosenFiles().length === 1 ? chosenFiles()[0] : null;
    if (file) renameLibraryFile(file);
    return;
  }
  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    const files = chosenFiles();
    if (files.length) deleteLibraryFiles(files);
    return;
  }
  if (!combo && key === "s") {
    event.preventDefault();
    const files = chosenFiles();
    if (!files.length) return;
    const next = files.every((file) => file.favorite) ? false : true;
    starFiles(files, next);
  }
});

document.getElementById("file-list").addEventListener("click", (event) => {
  const list = event.currentTarget;
  if (event.target === list || event.target.closest(".empty, .empty-state")) {
    clearFileSelection();
  }
});

document.getElementById("file-list").addEventListener("contextmenu", (event) => {
  if (event.target === event.currentTarget || event.target.closest(".empty, .empty-state")) {
    event.preventDefault();
    hideContextMenu();
  }
});

window.addEventListener("pointerdown", (event) => {
  const menu = document.getElementById("context-menu");
  if (menu && !menu.hidden && !menu.contains(event.target)) hideContextMenu();
  if (
    pitchMenu &&
    !pitchMenu.hidden &&
    !pitchMenu.contains(event.target) &&
    event.target !== playerPitchRangeBtn
  ) {
    hidePitchMenu();
  }
});

window.addEventListener("dragend", () => {
  draggingOut = false;
});

refresh().catch((err) => {
  console.error(err);
  onboarding.classList.remove("hidden");
  library.classList.add("hidden");
  libraryChrome?.classList.add("hidden");
  showOnboardingError(err.message || String(err));
});
