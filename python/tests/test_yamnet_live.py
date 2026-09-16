"""Live YAMNet (downloads TF Hub model once). Skip with: pytest -m 'not yamnet'."""

from __future__ import annotations

import numpy as np
import pytest

from core.analyze import classify_waveform
from core.classifier import NUM_CLASSES, PATCH_HOP_SECONDS, PATCH_WINDOW_SECONDS, YamnetClassifier
from core.config import DEFAULTS

pytestmark = pytest.mark.yamnet


@pytest.fixture(scope="module")
def yamnet() -> YamnetClassifier:
    clf = YamnetClassifier()
    clf.load()
    return clf


def test_yamnet_frames_long_enough_clip(yamnet: YamnetClassifier):
    seconds = 5.0
    sr = 16000
    t = np.linspace(0, seconds, int(sr * seconds), endpoint=False, dtype=np.float32)
    waveform = (0.2 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
    frames = yamnet.frame_scores(waveform)
    expected_min = 1 + int((seconds - PATCH_WINDOW_SECONDS) / PATCH_HOP_SECONDS) - 2
    assert frames.ndim == 2
    assert frames.shape[1] == NUM_CLASSES
    assert frames.shape[0] >= max(1, expected_min)
    assert len(yamnet.class_names) == NUM_CLASSES

    result = classify_waveform(
        waveform,
        yamnet,
        threshold=DEFAULTS["confidenceThreshold"],
    )
    assert result["frames"] == frames.shape[0]
    assert result["destination"]
    assert isinstance(result["tags"], list)
    assert len(result["top"]) == 5
