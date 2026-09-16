"""Clip-level destination from YAMNet frame scores (class folder or Mixed)."""

from __future__ import annotations

from typing import Any

import numpy as np

from core.classifier import PATCH_HOP_SECONDS, PATCH_WINDOW_SECONDS, YamnetClassifier
from core.mapper import decide_destination, temporal_mix
from core.preprocess import DEFAULT_CHUNK_SECONDS, yamnet_waveform_chunks


def destination_from_frames(
    frames: np.ndarray,
    class_names: list[str],
    *,
    threshold: float,
) -> tuple[str, list[str], dict[str, float]]:
    """Mean-pool patches; Mixed only if nothing is above threshold or time-split unrelated events."""
    if frames.size == 0:
        clip = {name: 0.0 for name in class_names}
        dest, matching = decide_destination(clip, threshold=threshold)
        return dest, matching, clip

    mean = frames.mean(axis=0)
    clip = {name: float(mean[i]) for i, name in enumerate(class_names)}
    dest, matching = decide_destination(clip, threshold=threshold)
    if temporal_mix(frames, class_names, threshold=threshold):
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
    return {
        "destination": dest,
        "tags": matching,
        "frames": int(frames.shape[0]),
        "top": [{"class": name, "score": score} for name, score in ranked],
    }


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
) -> np.ndarray:
    """Run YAMNet on the whole file, stitching ~60 s chunks (RAM bound, not a skip)."""
    chunk_s = aligned_chunk_seconds(
        DEFAULT_CHUNK_SECONDS if chunk_seconds is None else float(chunk_seconds)
    )
    skip_n = int(round(PATCH_WINDOW_SECONDS / PATCH_HOP_SECONDS)) - 1
    parts: list[np.ndarray] = []
    first = True
    n_classes = len(classifier.class_names)
    for waveform in yamnet_waveform_chunks(
        path,
        chunk_seconds=chunk_s,
        overlap_seconds=PATCH_WINDOW_SECONDS,
    ):
        frames = classifier.frame_scores(waveform)
        if not first and skip_n > 0:
            frames = frames[skip_n:]
        first = False
        if frames.size:
            parts.append(np.asarray(frames, dtype=np.float32))
    if not parts:
        return np.zeros((0, n_classes), dtype=np.float32)
    return np.concatenate(parts, axis=0)


def classify_path(
    path: str,
    classifier: YamnetClassifier,
    *,
    threshold: float,
    chunk_seconds: float | None = None,
) -> dict[str, Any]:
    frames = frame_scores_for_path(path, classifier, chunk_seconds=chunk_seconds)
    dest, matching, clip = destination_from_frames(
        frames,
        classifier.class_names,
        threshold=threshold,
    )
    ranked = sorted(clip.items(), key=lambda kv: kv[1], reverse=True)[:5]
    return {
        "path": path,
        "destination": dest,
        "tags": matching,
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
