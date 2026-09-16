# Implementation phases

Build in this order. Do not start Electron until the Python ingest pipeline works from the CLI.

**Status (2026-09-16):** Phases **1–11 are done**. Automated coverage is Python pytest only (`python -m pytest python/tests -q`); there are no Electron UI tests.

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

- All methods: `ping`, `get_config`, `save_config`, `classify_and_ingest`, `list_library`, `move_file`, `rename_file`, `delete_file`.
- Mutations must stay inside `libraryRoot`. stdout JSON only.
- Exit: tests list Mixed + existing class folders; refuse outside paths and illegal dest folders.

## Phase 7 — Electron main + preload — done

- `electron/main.js`: spawn `.venv` Python, NDJSON by `id`, progress events, respawn on crash, reject in-flight calls.
- `preload.js`: `window.fieldy.call`, `onEvent`, `pathForFile` (`webUtils`), `statPath`. `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Exit: app starts; `get_config` reaches Python. Full onboarding/drop UX is Phases 8–10.

## Phase 8 — Onboarding UI — done

- Library folder via native directory picker + Save. Creates `Mixed/` through `save_config`.
- Reset for testing: quit app, delete `~/.Fieldy/pointer.json`, relaunch.

## Phase 9 — Drop zone — done

- WAV files or folders; job list + progress events; first YAMNet load can be slow.
- `pathForFile` + `statPath`; window drag defaults prevented.

## Phase 10 — Library explorer — done

- Sidebar: `Mixed` + existing class folders. File list: name, duration, tags.
- Move/rename/delete via Python IPC. Move dropdown uses folders that already exist (no typed dest).

## Phase 11 — Edge-case hardening — done

See `.cursor/rules/07-edge-cases.mdc`. Confirm with tests (add tests rather than rewriting working mapper/preprocess):

- 96/48 kHz stereo 32-bit float originals stay pristine; analysis buffer is 16 kHz mono.
- Multi-minute file still classified (many YAMNet frames), not dumped into `Long Samples` or skipped at 60 s. `classify_path` stitches YAMNet scores across `analyzeChunkSeconds` windows (patch-hop aligned, 0.96 s overlap).
- Ambiguous **unrelated** time split → Mixed with all tags. Overlapping labels (Pour/Water) use the top class folder. Silence patches do not force Mixed.
- Illegal folder name on move → error, no mkdir.

The original build order ends here. Next work is exercising the app on real Zoom H6 WAVs, not a numbered phase.
