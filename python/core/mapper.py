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

    Destination is the top class above threshold. Overlapping AudioSet labels
    (Pour + Water) stay on that top folder; they are not Mixed.
    """
    candidates = {k: v for k, v in class_scores.items() if v >= threshold}
    matching = list(candidates.keys())
    if not candidates:
        return mixed_name, matching
    best_name, _best = max(candidates.items(), key=lambda kv: kv[1])
    return sanitize_class_folder(best_name), matching


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
