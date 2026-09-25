# Implementation phases

Build in this order. Do not start Electron until the Python ingest pipeline works from the CLI.

**Status (2026-09-22):** Phases **1–11 are done**. After that (also done): Silence-aware destination, reclassify, shared `#dialog`, playback scrub, Fieldy rename, Recently added / Starred / collections, move vs copy, undo/redo, WAV/AIFF/FLAC/MP3, drop-zone progress, library-root relocate/fresh, placement why on last drop, row select + keyboard/batch. Automated coverage is Python pytest only (`python -m pytest python/tests -q`); there are no Electron UI tests.

## Phase 1 — Config core (Python) — done

- Schema: `libraryRoot` plus optional thresholds / `analyzeChunkSeconds`.
- Reserved folder: `Mixed` only. Class folders are sanitized AudioSet names, created on demand.
- `assert_legal_destination`: `Mixed` or name in the official 521-class list (after sanitize).
- Persist `{libraryRoot}/.Fieldy.json`.
- First-run: missing config → `needsOnboarding: true`.

Exit criteria: tests reject non-AudioSet folder names; accept e.g. `Speech` and `Mixed`.

## Phase 2 — Audio preparation (Python) — done

- `soundfile.info` for duration, channels, samplerate, subtype.
- `yamnet_waveform(path)`: full file → 16 kHz mono float32 in RAM via **soundfile + soxr** (not librosa in the Electron child); original untouched.
- `yamnet_waveform_chunks(...)` for multi-hour files: 16 kHz slices with 0.96 s overlap.

Exit criteria: 32-bit float 48 kHz stereo fixture → 16 kHz mono; original PCM unchanged.

## Phase 3 — YAMNet frames + destination — done

- Load YAMNet once. Use native 0.96 s / 0.48 s framing; scores `(N, 521)`.
- Clip scores = mean over frames. Destination = **top foreground class** above threshold (Silence/noise do not win when a real class qualifies). Mean-pool non-Silence patches so sparse events in long quiet files still count.
- `Mixed` only if nothing is above threshold, or time splits between **unrelated** AudioSet families (water then speech). Overlapping water labels are not Mixed. Ignore Silence / noise patches when deciding Mixed; Silence may still be a tag.
- Tags = all classes ≥ threshold.
- Files longer than 60 s still produce many frames and a real destination.

Exit criteria: synthetic clip vectors (top class, none → Mixed); related water labels stay on top class; water-then-speech frames → Mixed.

## Phase 4 — Metadata on the original — done

- `python/core/metadata.py`: mutagen WAVE ID3 `TXXX`/`COMM` with desc `Fieldy`.
- Tag in place **before** any move. Never transcode PCM.
- Exit: round-trip `read_tags`; 32-bit float PCM checksum unchanged.

## Phase 5 — Ingest orchestrator — done

- `python/core/ingest.py`: validate WAV → classify full timeline → `write_tags` → `move_into_folder` with `unique_dest`.
- Batch continues on per-file errors. IPC `classify_and_ingest` + CLI `python -m core.ingest`.
- Exit: tests move a float WAV into `Speech/` with tags; one missing file does not abort siblings; name collisions get `_1`.

## Phase 6 — NDJSON IPC server — done

- All methods: `ping`, `get_config`, `save_config`, `classify_and_ingest`, `list_library`, `move_file`, `rename_file`, `delete_file`, `prepare_playback`.
- Mutations must stay inside `libraryRoot`. stdout JSON only.
- Exit: tests list Mixed + existing class folders; refuse outside paths and illegal dest folders. `prepare_playback` was added later (temp 16-bit preview).

## Phase 7 — Electron main + preload — done

- `electron/main.js`: spawn Python (`python-runtime` when packaged, else `.venv`), NDJSON by `id`, progress events, respawn on crash, reject in-flight calls.
- `preload.js`: `window.fieldy.call`, `onEvent`, `pathForFile` (`webUtils`), `statPath`, `readPlaybackFile`. `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Exit: app starts; `get_config` reaches Python. Full onboarding/drop UX is Phases 8–10.

## Phase 8 — Onboarding UI — done

- Library folder via native directory picker, move vs copy, plus Save. Creates `Mixed/` through `save_config`.
- Reset for testing: quit app, delete `~/.Fieldy/pointer.json`, relaunch.

## Phase 9 — Drop zone — done

- WAV, AIFF, FLAC, MP3 files or folders; overall drop-zone progress bar + job list; first model load can be slow.
- Drop zone can be closed; reopen from `#app-bar`.
- `pathForFile` + `statPath`; window drag defaults prevented.

## Phase 10 — Library explorer — done

- Sidebar: `Mixed` + existing class folders. File list: play, name, duration, tags.
- Move/rename/delete via Python IPC. Move dropdown uses folders that already exist (no typed dest). Rename / delete / reclassify use the shared in-app `#dialog` (`window.prompt` / `window.confirm` do not work well in Electron).
- Reclassify: **Reclassify** on the open folder, or **Reclassify** in the file context menu (`classify_and_ingest` on library paths). No per-row Reclassify button.

## Phase 11 — Edge-case hardening — done

See `.cursor/rules/07-edge-cases.mdc`. Confirm with tests (add tests rather than rewriting working mapper/preprocess):

- 96/48 kHz stereo 32-bit float originals stay pristine; analysis buffer is 16 kHz mono.
- Multi-minute file still classified (many YAMNet frames), not dumped into `Long Samples` or skipped at 60 s. `classify_path` stitches YAMNet scores across `analyzeChunkSeconds` windows (patch-hop aligned, 0.96 s overlap).
- Ambiguous **unrelated** time split → Mixed with all tags. Overlapping labels (Pour/Water) use the top class folder. Silence patches do not force Mixed.
- Illegal folder name on move → error, no mkdir.

## After the original 11 phases — done

Not numbered in the first plan; treat as current product:

- **Silence-aware destination:** folder from mean of non-Silence patches; Silence still allowed as a tag (`destination_from_frames` / `decide_destination`).
- **Reclassify in place:** library UI → `classify_and_ingest` on existing paths; retag; move if class changed. Busy flag must be cleared **before** `list_library` refresh so Reclassify buttons re-enable.
- **Dialogs:** renderer `#dialog` (`openDialog` / `askText` / `askConfirm`). Do not use `window.prompt` or `window.confirm`. Delete uses danger (red) styling. Settings uses the same dialog (`#dialog-settings`). Changing library folder uses `#library-root-dialog` then relocate vs fresh (`python/core/library_root.py`).
- **App bar:** persistent `#app-bar` (hiddenInset traffic lights, inline SVG lockup: white 4-bar mark + Fieldy wordmark in one SVG, no orange tile). Dock/taskbar: `electron/icons/icon.png` (macOS `dock.setIcon`) / `icon.ico` (orange `#ff8a3d` tile, same bars). Library actions: Show/Hide drop zone, Undo/Redo, Settings gear. Drop zone **X** hides the drop zone.
- **Undo/redo:** Python session stack (`undo` / `redo` / `history_state`). Ingest (move restores the original path; copy deletes the library copy), move, rename, delete (stash in `.Fieldy-undo`), star, collections. Batches are one stack entry. Cmd/Ctrl+Z.
- **Formats:** WAV, AIFF, FLAC, MP3 (`python/core/audio_formats.py`).
- **Placement why:** last-drop job list only (`placement_why`). Tags column empty copy: “No tags (nothing reached the threshold)”.
- **Selection:** click row; Cmd/Ctrl, Shift, Cmd+A; Space, arrows, Delete, F2/Enter, S; batch move/star/delete/reclassify/collections.
- **Playback:** `prepare_playback` + full-width waveform, scrub, mute/level, loop, rewind, pitch/tempo (`playbackRate`; Keep master tune = `preservesPitch`), autoplay, close. Temp PCM_16 only. See `.cursor/rules/11-playback.mdc`.
- **Name:** Fieldy. Config `.Fieldy.json` / `~/.Fieldy/`. Legacy Soundly Lite paths and ID3 `SoundlyLite` still read.
- **On-disk YAMNet:** `models/yamnet` via `scripts/fetch_yamnet.py`; Electron passes `FIELDY_ROOT` / `FIELDY_YAMNET_DIR`. Packager extraResources (`python`, `config`, `models`, `python-runtime`).
- **Unsigned downloads:** `npm run pack` is the Mac `.app`. `npm run pack:win` is the Windows x64 zip (`Fieldy-windows-x64.zip`) with its own `python-runtime-win`. `npm run dist:mac` is the optional signed DMG.

## Suggested next work (not scheduled)

Paid Developer ID / Windows signing, only if Gatekeeper and SmartScreen prompts should go away.
