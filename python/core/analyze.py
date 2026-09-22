"""Clip-level destination from YAMNet frame scores (class folder or Mixed)."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import numpy as np

from core.classifier import PATCH_HOP_SECONDS, PATCH_WINDOW_SECONDS, YamnetClassifier
from core.mapper import decide_destination, foreground_frames, placement_why, tag_scores, temporal_mix
from core.preprocess import DEFAULT_CHUNK_SECONDS, audio_info, yamnet_waveform_chunks


def destination_from_frames(
    frames: np.ndarray,
    class_names: list[str],
    *,
    threshold: float,
) -> tuple[str, list[str], dict[str, float]]:
    """Mean-pool patches; Mixed only if nothing is above threshold or time-split unrelated events.

    Destination averages non-Silence patches. Tags use the max of full-file and
    foreground means so Silence can still be written when it is present.
    """
    if frames.size == 0:
        clip = {name: 0.0 for name in class_names}
        dest, matching = decide_destination(clip, threshold=threshold)
        return dest, matching, clip

    mean_all = frames.mean(axis=0)
    clip_all = {name: float(mean_all[i]) for i, name in enumerate(class_names)}
    active = foreground_frames(frames, class_names)
    if active.size:
        mean_fg = active.mean(axis=0)
        clip_fg = {name: float(mean_fg[i]) for i, name in enumerate(class_names)}
        dest, _ignored = decide_destination(clip_fg, threshold=threshold)
        mix_frames = active
    else:
        clip_fg = None
        dest, _ignored = decide_destination(clip_all, threshold=threshold)
        mix_frames = frames

    clip = tag_scores(clip_all, clip_fg)
    matching = [name for name in class_names if clip[name] >= threshold]
    if temporal_mix(mix_frames, class_names, threshold=threshold):
        dest = "Mixed"
    return dest, matching, clip


def classify_waveform(
    waveform_16k_mono: np.ndarray,
    classifier: YamnetClassifier,
    *,
    threshold: float,
) -> dict[str, Any]:
    frames = classifier.frame_scores(waveform_16k_mono)
    dest, matching, clip = destination_from_frames(
        frames,
        classifier.class_names,
        threshold=threshold,
    )
    ranked = sorted(clip.items(), key=lambda kv: kv[1], reverse=True)[:5]
    score = clip.get(dest)
    payload = {
        "destination": dest,
        "tags": matching,
        "score": None if score is None else float(score),
        "frames": int(frames.shape[0]),
        "top": [{"class": name, "score": score} for name, score in ranked],
    }
    payload["why"] = placement_why(dest, matching, payload["score"], threshold)
    return payload


def aligned_chunk_seconds(chunk_seconds: float) -> float:
    """Snap RAM chunk length so the hop is a whole number of YAMNet patch hops."""
    hops = int(round((float(chunk_seconds) - PATCH_WINDOW_SECONDS) / PATCH_HOP_SECONDS))
    hops = max(hops, 1)
    return PATCH_WINDOW_SECONDS + hops * PATCH_HOP_SECONDS


def frame_scores_for_path(
    path: str,
    classifier: YamnetClassifier,
    *,
    chunk_seconds: float | None = None,
    on_progress: Callable[[int, int], None] | None = None,
) -> np.ndarray:
    """Run YAMNet on the whole file, stitching ~60 s chunks (RAM bound, not a skip)."""
    chunk_s = aligned_chunk_seconds(
        DEFAULT_CHUNK_SECONDS if chunk_seconds is None else float(chunk_seconds)
    )
    skip_n = int(round(PATCH_WINDOW_SECONDS / PATCH_HOP_SECONDS)) - 1
    parts: list[np.ndarray] = []
    first = True
    n_classes = len(classifier.class_names)
    hop = chunk_s - PATCH_WINDOW_SECONDS
    duration = float(audio_info(path)["duration"])
    total = 1 if duration <= chunk_s else max(1, int(np.ceil((duration - PATCH_WINDOW_SECONDS) / hop)))
    for index, waveform in enumerate(
        yamnet_waveform_chunks(
            path,
            chunk_seconds=chunk_s,
            overlap_seconds=PATCH_WINDOW_SECONDS,
        )
    ):
        if on_progress:
            on_progress(index, total)
        frames = classifier.frame_scores(waveform)
        if not first and skip_n > 0:
            frames = frames[skip_n:]
        first = False
        if frames.size:
            parts.append(np.asarray(frames, dtype=np.float32))
    if on_progress:
        on_progress(total, total)
    if not parts:
        return np.zeros((0, n_classes), dtype=np.float32)
    return np.concatenate(parts, axis=0)


def classify_path(
    path: str,
    classifier: YamnetClassifier,
    *,
    threshold: float,
    chunk_seconds: float | None = None,
    on_progress: Callable[[int, int], None] | None = None,
) -> dict[str, Any]:
    frames = frame_scores_for_path(
        path, classifier, chunk_seconds=chunk_seconds, on_progress=on_progress
    )
    dest, matching, clip = destination_from_frames(
        frames,
        classifier.class_names,
        threshold=threshold,
    )
    ranked = sorted(clip.items(), key=lambda kv: kv[1], reverse=True)[:5]
    score = clip.get(dest)
    why = placement_why(dest, matching, None if score is None else float(score), threshold)
    return {
        "path": path,
        "destination": dest,
        "tags": matching,
        "score": None if score is None else float(score),
        "why": why,
        "frames": int(frames.shape[0]),
        "top": [{"class": name, "score": score} for name, score in ranked],
    }


def main() -> None:
    import argparse
    import json

    from core.config import DEFAULTS

    parser = argparse.ArgumentParser(description="Classify a file with YAMNet (no move/tag).")
    parser.add_argument("path")
    args = parser.parse_args()
    classifier = YamnetClassifier()
    classifier.load()
    result = classify_path(
        args.path,
        classifier,
        threshold=float(DEFAULTS["confidenceThreshold"]),
        chunk_seconds=float(DEFAULTS["analyzeChunkSeconds"]),
    )
    print(
        json.dumps(
            {k: result[k] for k in ("path", "destination", "tags", "frames", "top")},
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
