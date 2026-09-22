"""Destination: top class; Mixed only if nothing is above threshold or unrelated time split."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from core.analyze import destination_from_frames
from core.config import YAMNET_CLASS_NAMES_ORDERED
from core.mapper import decide_destination


def test_clip_single_class_folder():
    names = YAMNET_CLASS_NAMES_ORDERED
    speech = names.index("Speech")
    frames = np.zeros((8, 521), dtype=np.float32)
    frames[:, speech] = 0.8
    dest, matching, clip = destination_from_frames(frames, names, threshold=0.3)
    assert dest == "Speech"
    assert matching == ["Speech"]
    assert clip["Speech"] == pytest.approx(0.8)


def test_overlapping_water_labels_use_top_class():
    names = YAMNET_CLASS_NAMES_ORDERED
    frames = np.zeros((8, 521), dtype=np.float32)
    frames[:, names.index("Pour")] = 0.464
    frames[:, names.index("Trickle, dribble")] = 0.416
    frames[:, names.index("Water")] = 0.395
    frames[:, names.index("Liquid")] = 0.390
    dest, matching, _clip = destination_from_frames(frames, names, threshold=0.3)
    assert dest == "Pour"
    assert set(matching) == {"Pour", "Trickle, dribble", "Water", "Liquid"}


def test_clip_unrelated_classes_still_use_top_folder():
    names = YAMNET_CLASS_NAMES_ORDERED
    frames = np.zeros((8, 521), dtype=np.float32)
    frames[:, names.index("Wind")] = 0.7
    frames[:, names.index("Speech")] = 0.65
    dest, matching, _clip = destination_from_frames(frames, names, threshold=0.3)
    assert dest == "Wind"
    assert set(matching) == {"Wind", "Speech"}


def test_none_above_threshold_is_mixed():
    frames = np.full((4, 521), 0.05, dtype=np.float32)
    dest, matching, _clip = destination_from_frames(
        frames, YAMNET_CLASS_NAMES_ORDERED, threshold=0.3
    )
    assert dest == "Mixed"
    assert matching == []


def test_temporal_unrelated_events_go_to_mixed():
    names = YAMNET_CLASS_NAMES_ORDERED
    frames = np.zeros((10, 521), dtype=np.float32)
    frames[:5, names.index("Water")] = 0.9
    frames[5:, names.index("Speech")] = 0.9
    dest, matching, clip = destination_from_frames(frames, names, threshold=0.3)
    assert dest == "Mixed"
    assert set(matching) == {"Water", "Speech"}
    assert clip["Water"] == pytest.approx(0.45)
    assert clip["Speech"] == pytest.approx(0.45)


def test_temporal_related_water_labels_stay_on_top_class():
    names = YAMNET_CLASS_NAMES_ORDERED
    frames = np.zeros((10, 521), dtype=np.float32)
    frames[:5, names.index("Water")] = 0.9
    frames[5:, names.index("Pour")] = 0.9
    dest, matching, _clip = destination_from_frames(frames, names, threshold=0.3)
    assert dest in {"Water", "Pour"}
    assert dest != "Mixed"
    assert set(matching) == {"Water", "Pour"}


def test_silence_patches_do_not_make_water_mixed():
    names = YAMNET_CLASS_NAMES_ORDERED
    frames = np.zeros((18, 521), dtype=np.float32)
    pour, water, silence = names.index("Pour"), names.index("Water"), names.index("Silence")
    frames[:9, pour] = 0.8
    frames[9:13, water] = 0.8
    frames[13:, silence] = 0.8
    dest, matching, _clip = destination_from_frames(frames, names, threshold=0.3)
    assert dest == "Pour"


def test_sparse_speech_in_mostly_silence_goes_to_speech():
    names = YAMNET_CLASS_NAMES_ORDERED
    frames = np.zeros((20, 521), dtype=np.float32)
    frames[:17, names.index("Silence")] = 0.9
    frames[17:, names.index("Speech")] = 0.9
    dest, matching, clip = destination_from_frames(frames, names, threshold=0.3)
    assert dest == "Speech"
    assert "Speech" in matching
    assert "Silence" in matching
    assert clip["Speech"] == pytest.approx(0.9)
    assert clip["Silence"] == pytest.approx(17 / 20 * 0.9)


def test_true_silence_file_stays_in_silence():
    names = YAMNET_CLASS_NAMES_ORDERED
    frames = np.zeros((8, 521), dtype=np.float32)
    frames[:, names.index("Silence")] = 0.85
    dest, matching, _clip = destination_from_frames(frames, names, threshold=0.3)
    assert dest == "Silence"
    assert matching == ["Silence"]


def test_sparse_unrelated_active_regions_still_mixed():
    names = YAMNET_CLASS_NAMES_ORDERED
    frames = np.zeros((20, 521), dtype=np.float32)
    frames[:14, names.index("Silence")] = 0.9
    frames[14:17, names.index("Water")] = 0.9
    frames[17:, names.index("Speech")] = 0.9
    dest, matching, _clip = destination_from_frames(frames, names, threshold=0.3)
    assert dest == "Mixed"
    assert set(matching) >= {"Water", "Speech", "Silence"}


def test_file_over_60s_still_gets_class_destination():
    names = YAMNET_CLASS_NAMES_ORDERED
    n_frames = 1 + int((70.0 - 0.96) / 0.48)
    assert n_frames > 100
    frames = np.zeros((n_frames, 521), dtype=np.float32)
    frames[:, names.index("Speech")] = 0.8
    dest, matching, _clip = destination_from_frames(frames, names, threshold=0.3)
    assert dest == "Speech"
    assert matching == ["Speech"]


def test_decide_destination_top_class():
    dest, matching = decide_destination(
        {"Speech": 0.4, "Silence": 0.1},
        threshold=0.3,
    )
    assert dest == "Speech"
    assert matching == ["Speech"]


class _FrameCountSpeechClassifier:
    class_names = YAMNET_CLASS_NAMES_ORDERED

    def load(self) -> None:
        return

    def frame_scores(self, waveform_16k_mono: np.ndarray) -> np.ndarray:
        from core.classifier import PATCH_HOP_SECONDS, PATCH_WINDOW_SECONDS, SAMPLE_RATE

        n = int(np.asarray(waveform_16k_mono, dtype=np.float32).reshape(-1).shape[0])
        seconds = n / SAMPLE_RATE
        if seconds < 0.975:
            n_frames = 1
        else:
            n_frames = 1 + int((seconds - PATCH_WINDOW_SECONDS) / PATCH_HOP_SECONDS)
        frames = np.zeros((n_frames, 521), dtype=np.float32)
        frames[:, YAMNET_CLASS_NAMES_ORDERED.index("Speech")] = 0.9
        return frames


def test_classify_path_stitches_chunks_instead_of_skipping_60s(tmp_path: Path):
    import soundfile as sf

    from core.analyze import classify_path, classify_waveform
    from core.preprocess import yamnet_waveform

    wav = tmp_path / "long.wav"
    sr = 48000
    seconds = 70.0
    n = int(sr * seconds)
    stereo = np.stack(
        [np.full(n, 0.02, dtype=np.float32), np.full(n, -0.02, dtype=np.float32)],
        axis=1,
    )
    sf.write(wav, stereo, sr, subtype="FLOAT")
    clf = _FrameCountSpeechClassifier()
    full = classify_waveform(yamnet_waveform(str(wav)), clf, threshold=0.3)
    chunked = classify_path(str(wav), clf, threshold=0.3, chunk_seconds=60)
    assert full["frames"] > 100
    assert chunked["frames"] == full["frames"]
    assert chunked["destination"] == "Speech"
    assert chunked["why"] == "Speech · 0.90"
    assert chunked["destination"] != "Long Samples"
