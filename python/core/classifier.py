"""YAMNet inference. Model is loaded once. Long audio → (N, 521) patch scores."""

from __future__ import annotations

import csv
import os
import sys
from pathlib import Path

import numpy as np

from core.config import YAMNET_CLASS_NAMES_ORDERED, yamnet_model_dir

# Official YAMNet hyperparameters (tensorflow/models research/audioset/yamnet).
PATCH_WINDOW_SECONDS = 0.96
PATCH_HOP_SECONDS = 0.48
NUM_CLASSES = 521
SAMPLE_RATE = 16000
# First patch needs ~0.975 s of 16 kHz audio (window 25 ms, no edge pad).
MIN_WAVEFORM_SECONDS = 0.975


def yamnet_saved_model_marker(model_dir: Path | None = None) -> Path:
    return (model_dir or yamnet_model_dir()) / "saved_model.pb"


class YamnetClassifier:
    def __init__(self) -> None:
        self._model = None
        self.class_names: list[str] = list(YAMNET_CLASS_NAMES_ORDERED)

    def load(self) -> None:
        if self._model is not None:
            return
        os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
        model_dir = yamnet_model_dir()
        marker = yamnet_saved_model_marker(model_dir)
        if not marker.is_file():
            print(
                f"Expected {marker}. Fetch with: python scripts/fetch_yamnet.py",
                file=sys.stderr,
            )
            raise RuntimeError("Fieldy is missing its listening model.")

        import tensorflow_hub as hub

        self._model = hub.load(str(model_dir))
        from_model = self._class_names_from_model()
        if from_model:
            self.class_names = from_model

    def frame_scores(self, waveform_16k_mono: np.ndarray) -> np.ndarray:
        """Return (N, 521) patch scores for a 16 kHz mono waveform of any length."""
        if self._model is None:
            raise RuntimeError("YamnetClassifier.load() must be called first")
        import tensorflow as tf

        waveform = np.asarray(waveform_16k_mono, dtype=np.float32).reshape(-1)
        min_samples = int(np.ceil(MIN_WAVEFORM_SECONDS * SAMPLE_RATE))
        if waveform.shape[0] < min_samples:
            padded = np.zeros(min_samples, dtype=np.float32)
            padded[: waveform.shape[0]] = waveform
            waveform = padded
        scores, _embeddings, _spectrogram = self._model(tf.constant(waveform, dtype=tf.float32))
        frames = np.asarray(scores, dtype=np.float32)
        if frames.ndim != 2 or frames.shape[1] != len(self.class_names):
            raise RuntimeError(
                f"unexpected YAMNet scores shape {frames.shape} vs {len(self.class_names)} classes"
            )
        return frames

    def clip_scores(self, frames: np.ndarray) -> dict[str, float]:
        """Mean-pool frames — same clip aggregate as YAMNet's inference.py."""
        if frames.size == 0:
            return {name: 0.0 for name in self.class_names}
        mean = frames.mean(axis=0)
        return {name: float(mean[i]) for i, name in enumerate(self.class_names)}

    def _class_names_from_model(self) -> list[str]:
        try:
            raw = self._model.class_map_path().numpy()
            csv_path = Path(raw.decode("utf-8") if isinstance(raw, bytes) else str(raw))
        except Exception:
            return []
        if not csv_path.is_file():
            return []
        names: list[str] = []
        with csv_path.open(newline="", encoding="utf-8") as handle:
            for row in csv.DictReader(handle):
                name = (row.get("display_name") or "").strip()
                if name:
                    names.append(name)
        return names if len(names) == NUM_CLASSES else []
