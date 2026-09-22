"""Turn YAMNet class scores into a destination folder (class name or Mixed)."""

from __future__ import annotations

import numpy as np

from core.config import sanitize_class_folder
from core.ontology import classes_related, is_background_class


def decide_destination(
    class_scores: dict[str, float],
    *,
    threshold: float,
    mixed_name: str = "Mixed",
) -> tuple[str, list[str]]:
    """Return (destination_folder, matching class names for tags).

    Destination is the top *foreground* class above threshold. Silence / noise
    stay in `matching` (tags) but do not win the folder when a real class qualifies.
    """
    candidates = {k: v for k, v in class_scores.items() if v >= threshold}
    matching = list(candidates.keys())
    if not candidates:
        return mixed_name, matching
    foreground = {k: v for k, v in candidates.items() if not is_background_class(k)}
    pool = foreground or candidates
    best_name, _best = max(pool.items(), key=lambda kv: kv[1])
    return sanitize_class_folder(best_name), matching


def placement_why(
    destination: str,
    tags: list[str] | None,
    score: float | None,
    threshold: float,
) -> str:
    """One-line reason a file is in this folder. No model names."""
    folder = (destination or "").strip() or "Mixed"
    names = [str(tag).strip() for tag in (tags or []) if str(tag).strip()]
    if folder != "Mixed":
        if score is None:
            return folder
        return f"{folder} · {float(score):.2f}"
    if not names:
        return f"Mixed · nothing reached {_threshold_label(threshold)}"
    shown = names[:3]
    if len(names) == 1:
        return f"Mixed · {shown[0]}"
    if len(names) == 2:
        return f"Mixed · {shown[0]} and {shown[1]}"
    extra = len(names) - 3
    joined = f"{shown[0]}, {shown[1]}, and {shown[2]}"
    if extra:
        return f"Mixed · {joined} +{extra} more"
    return f"Mixed · {joined}"


def _threshold_label(threshold: float) -> str:
    text = f"{float(threshold):.2f}".rstrip("0").rstrip(".")
    return text or "0"


def foreground_frames(
    frame_scores: np.ndarray,
    class_names: list[str],
) -> np.ndarray:
    """Rows whose winning class is not Silence / room tone / generic noise."""
    if frame_scores.ndim != 2 or frame_scores.shape[0] == 0:
        return frame_scores
    winners = frame_scores.argmax(axis=1)
    keep = np.array(
        [not is_background_class(class_names[int(idx)]) for idx in winners],
        dtype=bool,
    )
    return frame_scores[keep]


def tag_scores(
    clip_all: dict[str, float],
    clip_foreground: dict[str, float] | None,
) -> dict[str, float]:
    """Per-class max of full-file mean and foreground-only mean (Silence stays visible)."""
    if not clip_foreground:
        return dict(clip_all)
    return {name: max(clip_all[name], clip_foreground[name]) for name in clip_all}


def temporal_mix(
    frame_scores: np.ndarray,
    class_names: list[str],
    *,
    threshold: float,
    min_fraction: float = 0.2,
) -> bool:
    """True if unrelated classes each dominate a large share of patches.

    Pour then Trickle is related (not Mixed). Water then Speech is unrelated (Mixed).
    """
    if frame_scores.ndim != 2 or frame_scores.shape[0] < 2:
        return False
    winners = frame_scores.argmax(axis=1)
    peaks = frame_scores.max(axis=1)
    n = frame_scores.shape[0]
    shares: dict[int, int] = {}
    for idx, peak in zip(winners, peaks, strict=True):
        if peak < threshold:
            continue
        name = class_names[int(idx)]
        if is_background_class(name):
            continue
        shares[int(idx)] = shares.get(int(idx), 0) + 1
    strong = [class_names[i] for i, count in shares.items() if count / n >= min_fraction]
    if len(strong) < 2:
        return False
    return any(
        not classes_related(strong[i], strong[j])
        for i in range(len(strong))
        for j in range(i + 1, len(strong))
    )
