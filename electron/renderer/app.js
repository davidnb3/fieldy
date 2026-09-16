const onboarding = document.getElementById("onboarding");
const library = document.getElementById("library");
const dropzone = document.getElementById("dropzone");
const dropzoneTitle = document.getElementById("dropzone-title");
const ingestJobs = document.getElementById("ingest-jobs");
const libraryRootInput = document.getElementById("library-root");
const onboardingError = document.getElementById("onboarding-error");
const saveButton = document.getElementById("save-config");

let ingesting = false;
let libraryBusy = false;
let libraryTree = null;
let selectedFolder = "Mixed";
const jobRows = new Map();

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
    const filePath = window.soundly.pathForFile(file);
    if (!filePath) continue;
    const info = await window.soundly.statPath(filePath);
    if (!info?.ok) continue;
    if (info.isDirectory || (info.isFile && isWavPath(filePath))) {
      accepted.push(filePath);
    }
  }
  return accepted;
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

async function refresh() {
  showOnboardingError("");
  const cfg = await window.soundly.call("get_config");
  if (!cfg || cfg.needsOnboarding) {
    onboarding.classList.remove("hidden");
    library.classList.add("hidden");
    return;
  }
  onboarding.classList.add("hidden");
  library.classList.remove("hidden");
  const tree = await window.soundly.call("list_library");
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
  if (heading) heading.textContent = selectedFolder;
  list.replaceChildren();
  const files = folder?.files || [];
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
    row.className = "file-row";

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
    renameBtn.addEventListener("click", () => {
      const next = window.prompt("New file name", file.name);
      if (!next || next.trim() === file.name) return;
      mutateLibrary("rename_file", { path: file.path, newName: next.trim() });
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "secondary";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => {
      if (!window.confirm(`Delete ${file.name}? This cannot be undone.`)) return;
      mutateLibrary("delete_file", { path: file.path });
    });

    actions.append(renameBtn, deleteBtn);
    row.append(name, duration, tags, actions);
    list.appendChild(row);
  }
}

async function mutateLibrary(method, params) {
  if (libraryBusy) return;
  libraryBusy = true;
  showLibraryError("");
  try {
    await window.soundly.call(method, params);
    await refresh();
  } catch (err) {
    showLibraryError(err.message || String(err));
  } finally {
    libraryBusy = false;
  }
}

document.getElementById("browse-library").addEventListener("click", async () => {
  const picked = await window.soundly.chooseLibraryRoot();
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
    await window.soundly.call("save_config", { libraryRoot });
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

dropzone.addEventListener("drop", async (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  if (ingesting) return;
  const paths = await collectIngestPaths(e.dataTransfer.files);
  if (!paths.length) {
    dropzoneTitle.textContent = "Drop WAV files or folders (WAV only)";
    return;
  }
  ingesting = true;
  dropzone.classList.add("busy");
  dropzoneTitle.textContent = "Ingesting… first file may load YAMNet";
  jobRows.clear();
  ingestJobs.replaceChildren();
  ingestJobs.hidden = false;
  for (const filePath of paths) {
    if (isWavPath(filePath)) setJobStatus(filePath, "queued", "stage");
  }
  try {
    const result = await window.soundly.call("classify_and_ingest", { paths });
    for (const job of result.jobs || []) {
      if (job.ok) {
        setJobStatus(job.path, `→ ${job.destination}`, "ok");
      } else {
        setJobStatus(job.path, job.error || "failed", "err");
      }
    }
    const okCount = (result.jobs || []).filter((j) => j.ok).length;
    dropzoneTitle.textContent = `Done: ${okCount} ingested. Drop more WAV files when you want.`;
    await refresh();
  } catch (err) {
    dropzoneTitle.textContent = err.message || String(err);
  } finally {
    ingesting = false;
    dropzone.classList.remove("busy");
  }
});

window.soundly.onEvent((msg) => {
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
