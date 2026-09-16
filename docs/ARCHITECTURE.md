# Architecture

## Goals

1. On first launch the user only chooses a **library root**. Folders are **YAMNet / AudioSet class names**, created when the first file lands in that class. `Mixed` is the only extra bucket.
2. Drop Zoom H6 (and other) audio → Python classifies with YAMNet on a **temporary in-memory 16 kHz mono** view (full duration, native patch framing) → tags the **original** with matching class names → moves the original into `{class}` or `Mixed`.
3. Electron shows that library; manual drag/rename/delete mutate the real filesystem immediately.

## Process topology

```
Renderer (HTML/CSS/JS)
    │  ipcRenderer.invoke / ipcRenderer.on
    ▼
Electron main
    │  NDJSON stdin/stdout (child_process.spawn)
    ▼
Python main.py  ── TensorFlow Hub YAMNet (loaded once)
    │
    ▼
Local disk: {libraryRoot}/{AudioSet class | Mixed}/file.wav
```

Python is the only process that writes tags or moves files.

## Folders = AudioSet classes

Legal destinations = sanitized official YAMNet class names ∪ `{"Mixed"}`.

- No onboarding folder checklist (no Wind/Noise/Voices product taxonomy).
- `mkdir` the winning class folder on first use (do not pre-create 521 empty dirs).
- Manual UI moves may only target `Mixed` or a real AudioSet class name.

## How YAMNet handles long files (this is the app logic)

YAMNet is a **sliding-window** classifier, not a “one shot for the whole clip” network:

| Parameter | Value |
| --- | --- |
| Analysis sample rate | 16 kHz mono |
| Patch / window | **0.96 s** (96 mel frames × 10 ms hop) |
| Patch hop | **0.48 s** (50% overlap) |
| Classes | 521 AudioSet events |
| Scores tensor | `(N, 521)` — one row per patch |

The Hub model accepts a 1-D waveform of **any length**. Internally it frames it and returns `N` score vectors. Official `inference.py` **mean-pools** those frames for a clip-level ranking; per-frame scores show events that change over time.

Soundly Lite uses the same mechanism:

1. Resample the original to 16 kHz mono in RAM (or in ~60 s chunks with 0.96 s overlap if the 16 kHz buffer would be huge).
2. Run YAMNet on every chunk; concatenate frame scores so the whole file is represented.
3. Clip-level scores = mean over frames.
4. Destination from clip-level `decide_destination`; tags = every class ≥ threshold.
5. If **unrelated** classes dominate different time regions (water then speech) → `Mixed`. Related labels (Pour vs Water) do not.

There is **no** `Long Samples` bypass and **no** “skip YAMNet after 60 seconds.” The old phrase “no full-file YAMNet” was a mistaken shortcut; the model is designed to run on the full timeline as patches.

## Classification decision

```
clip_score[c] = mean_t(frame_score[t, c])   # c in 521 AudioSet names
candidates = {c : clip_score[c] >= confidenceThreshold}

if len(candidates) == 0:
    dest = Mixed
elif unrelated classes each dominate a large share of patches:
    dest = Mixed
else:
    dest = sanitize(argmax clip_score among candidates)

tags_to_write = all candidate class names
```

Tags are written even when destination is `Mixed`.

## Original vs analysis copy

| Artifact | 32-bit float / original SR / channels | 16 kHz mono |
| --- | --- | --- |
| On disk after ingest | Yes (moved, tagged header only) | No |
| YAMNet input | Never | Yes, RAM (or RAM chunks) |

## Config shape

```json
{
  "libraryRoot": "/absolute/path",
  "confidenceThreshold": 0.3,
  "analyzeChunkSeconds": 60
}
```

`analyzeChunkSeconds` only bounds 16 kHz RAM while stitching YAMNet frames. It is not a classification skip.
