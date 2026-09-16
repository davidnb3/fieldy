"""Unit tests for top-class destination and unrelated temporal mix."""

import numpy as np

from core.mapper import decide_destination, temporal_mix
from core.ontology import classes_related


def test_single_winner_uses_class_name():
    dest, matching = decide_destination(
        {"Speech": 0.8, "Wind": 0.1, "Silence": 0.2},
        threshold=0.3,
    )
    assert dest == "Speech"
    assert matching == ["Speech"]


def test_close_scores_use_top_class_not_mixed():
    dest, matching = decide_destination(
        {"Wind": 0.7, "Speech": 0.65, "Silence": 0.1},
        threshold=0.3,
    )
    assert dest == "Wind"
    assert set(matching) == {"Wind", "Speech"}


def test_silence_does_not_win_over_speech():
    dest, matching = decide_destination(
        {"Silence": 0.8, "Speech": 0.4, "Wind": 0.1},
        threshold=0.3,
    )
    assert dest == "Speech"
    assert set(matching) == {"Silence", "Speech"}


def test_only_silence_stays_silence_folder():
    dest, matching = decide_destination(
        {"Silence": 0.9, "Speech": 0.05},
        threshold=0.3,
    )
    assert dest == "Silence"
    assert matching == ["Silence"]


def test_unknown_goes_to_mixed():
    dest, matching = decide_destination(
        {"Wind": 0.05, "Speech": 0.04},
        threshold=0.3,
    )
    assert dest == "Mixed"
    assert matching == []


def test_temporal_mix_unrelated_classes():
    frames = np.zeros((10, 3), dtype=np.float32)
    frames[:5, 0] = 0.9
    frames[5:, 1] = 0.9
    assert temporal_mix(frames, ["Wind", "Speech", "Silence"], threshold=0.3)


def test_temporal_mix_ignores_silence():
    frames = np.zeros((10, 3), dtype=np.float32)
    frames[:6, 0] = 0.9  # Pour
    frames[6:, 2] = 0.9  # Silence
    assert not temporal_mix(frames, ["Pour", "Speech", "Silence"], threshold=0.3)


def test_temporal_mix_false_for_single_winner():
    frames = np.zeros((10, 3), dtype=np.float32)
    frames[:, 0] = 0.9
    assert not temporal_mix(frames, ["Wind", "Speech", "Silence"], threshold=0.3)


def test_water_family_is_related():
    assert classes_related("Pour", "Trickle, dribble")
    assert classes_related("Water", "Stream")
    assert classes_related("Water", "Pour")
    assert classes_related("Liquid", "Trickle, dribble")
    assert not classes_related("Water", "Speech")
    assert not classes_related("Wind", "Speech")
