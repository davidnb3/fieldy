const onboarding = document.getElementById("onboarding");
const library = document.getElementById("library");
const dropzone = document.getElementById("dropzone");
const dropzoneTitle = document.getElementById("dropzone-title");
const ingestJobs = document.getElementById("ingest-jobs");
const libraryRootInput = document.getElementById("library-root");
const onboardingError = document.getElementById("onboarding-error");
const saveButton = document.getElementById("save-config");

const reclassifyFolder = document.getElementById("reclassify-folder");
const player = document.getElementById("player");
const playerToggle = document.getElementById("player-toggle");
const playerName = document.getElementById("player-name");
const playerTime = document.getElementById("player-time");
const playerWave = document.getElementById("player-wave");
const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modal-title");
const modalInput = document.getElementById("modal-input");
const modalCancel = document.getElementById("modal-cancel");
const modalOk = document.getElementById("modal-ok");
let ingesting = false;
let libraryBusy = false;
let libraryTree = null;
let selectedFolder = "Mixed";
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

function ensureJobRow(filePath) {
  ingestJobs.hidden = false;
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

function askRename(currentName) {
  return new Promise((resolve) => {
    modalTitle.textContent = "Rename file";
    modalInput.value = currentName;
    modal.classList.remove("hidden");
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      modalCancel.removeEventListener("click", onCancel);
      modalOk.removeEventListener("click", onOk);
      modalInput.removeEventListener("keydown", onKey);
      modal.classList.add("hidden");
      resolve(value);
    };
    const onCancel = () => finish(null);
    const onOk = () => finish(modalInput.value.trim());
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish(null);
      }
      if (event.key === "Enter") {
        event.preventDefault();
        finish(modalInput.value.trim());
      }
    };
    modalCancel.addEventListener("click", onCancel);
    modalOk.addEventListener("click", onOk);
    modalInput.addEventListener("keydown", onKey);
    const dot = currentName.lastIndexOf(".");
    const end = dot > 0 ? dot : currentName.length;
    requestAnimationFrame(() => {
      modalInput.focus();
      modalInput.setSelectionRange(0, end);
    });
  });
}

function showLibraryError(message) {
  const el = document.getElementById("library-error");
  if (!el) return;
  el.textContent = message || "";
  el.classList.toggle("hidden", !message);
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
  const tree = await window.fieldy.call("list_library");
  renderTree(tree);
}

function renderTree(tree) {
  libraryTree = tree;
  const folders = tree?.folders || [];
  const names = folders.map((folder) => folder.name);
  if (!names.includes(selectedFolder)) selectedFolder = names[0] || "Mixed";

  const folderList = document.getElementById("folder-list");
  folderList.replaceChildren();
  for (const folder of folders) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "folder-item" + (folder.name === selectedFolder ? " selected" : "");
    const name = document.createElement("span");
    name.className = "folder-name";
    name.textContent = folder.name;
    const count = document.createElement("span");
    count.className = "folder-count";
    count.textContent = String(folder.files?.length || 0);
    el.append(name, count);
    el.addEventListener("click", () => {
      selectedFolder = folder.name;
      showLibraryError("");
      renderTree(libraryTree);
    });
    folderList.appendChild(el);
  }
  renderFiles();
}

function renderFiles() {
  const list = document.getElementById("file-list");
  const heading = document.getElementById("folder-heading");
  const folder = (libraryTree?.folders || []).find((item) => item.name === selectedFolder);
  const files = folder?.files || [];
  if (heading) heading.textContent = selectedFolder;
  if (reclassifyFolder) {
    reclassifyFolder.disabled = ingesting || libraryBusy || !files.length;
    reclassifyFolder.title = files.length
      ? `Run YAMNet again on ${files.length} file(s) in ${selectedFolder}`
      : "No files in this folder";
  }
  list.replaceChildren();
  if (!files.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No WAV files in this folder.";
    list.appendChild(empty);
    return;
  }

  const otherFolders = (libraryTree?.folders || [])
    .map((item) => item.name)
    .filter((name) => name !== selectedFolder);

  for (const file of files) {
    const row = document.createElement("div");
    row.className = "file-row" + (file.path === playback.path ? " playing" : "");

    const playBtn = document.createElement("button");
    playBtn.type = "button";
    playBtn.className = "play-btn";
    playBtn.setAttribute("aria-label", `Play ${file.name}`);
    playBtn.textContent = file.path === playback.path && !playback.audio.paused ? "⏸" : "▶";
    playBtn.disabled = playback.loading;
    playBtn.addEventListener("click", () => togglePlayback(file));

    const name = document.createElement("div");
    name.className = "file-name";
    name.textContent = file.name;
    name.title = file.path;

    const duration = document.createElement("div");
    duration.className = "file-duration";
    duration.textContent = formatDuration(file.duration);

    const tags = document.createElement("div");
    tags.className = "file-tags";
    tags.textContent = (file.tags || []).join(" · ") || "No tags";
    tags.title = tags.textContent;

    const actions = document.createElement("div");
    actions.className = "file-actions";

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

    const renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.className = "secondary";
    renameBtn.textContent = "Rename";
    renameBtn.addEventListener("click", async () => {
      const next = await askRename(file.name);
      if (!next || next === file.name) return;
      mutateLibrary("rename_file", { path: file.path, newName: next });
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "secondary";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => {
      if (!window.confirm(`Delete ${file.name}? This cannot be undone.`)) return;
      mutateLibrary("delete_file", { path: file.path });
    });

    const reclassifyBtn = document.createElement("button");
    reclassifyBtn.type = "button";
    reclassifyBtn.className = "secondary";
    reclassifyBtn.textContent = "Reclassify";
    reclassifyBtn.disabled = ingesting || libraryBusy;
    reclassifyBtn.addEventListener("click", () => {
      if (
        !window.confirm(
          `Re-run YAMNet on ${file.name}? It will be retagged and moved if the class changes.`
        )
      ) {
        return;
      }
      classifyExisting([file.path]);
    });

    actions.append(renameBtn, deleteBtn, reclassifyBtn);
    row.append(playBtn, name, duration, tags, actions);
    list.appendChild(row);
  }
}

async function mutateLibrary(method, params) {
  if (libraryBusy || ingesting) return;
  libraryBusy = true;
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
    await window.fieldy.call("save_config", { libraryRoot });
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
  });
});

["dragenter", "dragover"].forEach((ev) => {
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    if (!ingesting) dropzone.classList.add("dragover");
  });
});

dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));

async function runClassifyAndIngest(paths, { busyTitle, doneLabel }) {
  if (ingesting || libraryBusy || !paths.length) return;
  ingesting = true;
  dropzone.classList.add("busy");
  dropzoneTitle.textContent = busyTitle;
  renderFiles();
  jobRows.clear();
  ingestJobs.replaceChildren();
  ingestJobs.hidden = false;
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
    dropzone.classList.remove("busy");
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

reclassifyFolder.addEventListener("click", () => {
  const folder = (libraryTree?.folders || []).find((item) => item.name === selectedFolder);
  const files = folder?.files || [];
  if (!files.length) return;
  if (
    !window.confirm(
      `Re-run YAMNet on ${files.length} file(s) in ${selectedFolder}? Files are retagged and moved if the class changes. Originals are not copied.`
    )
  ) {
    return;
  }
  classifyExisting(files.map((file) => file.path));
});

dropzone.addEventListener("drop", async (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  if (ingesting) return;
  const paths = await collectIngestPaths(e.dataTransfer.files);
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

refresh().catch((err) => {
  console.error(err);
  onboarding.classList.remove("hidden");
  library.classList.add("hidden");
  showOnboardingError(err.message || String(err));
});
