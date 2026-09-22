"""Library config. Folders are AudioSet class names plus Mixed."""

from __future__ import annotations

import csv
import json
import os
import re
from pathlib import Path
from typing import Any

from core.errors import inspect_library_root

RESERVED_FOLDERS = ("Mixed",)
CONFIG_FILENAME = ".Fieldy.json"
LEGACY_CONFIG_FILENAME = ".soundly-lite.json"
ALLOWED_KEYS = frozenset(
    {
        "libraryRoot",
        "confidenceThreshold",
        "conflictDelta",
        "analyzeChunkSeconds",
        "ingestMode",
        "dropzoneOnLaunch",
        "playbackVolume",
        "playbackLoop",
        "autoPlayOnSelect",
        "playbackMuted",
        "playbackPitch",
        "playbackPitchEnabled",
        "playbackPitchRange",
        "playbackPitchResetOnNew",
        "playbackPreservePitch",
    }
)
DEFAULTS = {
    "confidenceThreshold": 0.3,
    "conflictDelta": 0.15,
    "analyzeChunkSeconds": 60,
    "ingestMode": "move",
    "dropzoneOnLaunch": True,
    "playbackVolume": 1.0,
    "playbackLoop": False,
    "autoPlayOnSelect": False,
    "playbackMuted": False,
    "playbackPitch": 100.0,
    "playbackPitchEnabled": False,
    "playbackPitchRange": 2,
    "playbackPitchResetOnNew": True,
    "playbackPreservePitch": True,
}


def fieldy_root() -> Path:
    """Repo root while developing; extraResources root when packaged.

    Electron sets FIELDY_ROOT on the Python child. Unpackaged pytest uses
    this file’s location (…/python/core/config.py → parents[2]).
    """
    raw = (os.environ.get("FIELDY_ROOT") or "").strip()
    if raw:
        return Path(raw).expanduser().resolve()
    return Path(__file__).resolve().parents[2]


REPO_ROOT = fieldy_root()
CLASS_MAP_PATH = REPO_ROOT / "config" / "yamnet_class_map.csv"


def yamnet_model_dir() -> Path:
    raw = (os.environ.get("FIELDY_YAMNET_DIR") or "").strip()
    if raw:
        return Path(raw).expanduser().resolve()
    return fieldy_root() / "models" / "yamnet"


def default_pointer_path() -> Path:
    return Path.home() / ".Fieldy" / "pointer.json"


def _legacy_pointer_path() -> Path:
    return Path.home() / ".soundly-lite" / "pointer.json"


def load_yamnet_class_names_ordered(path: Path | None = None) -> list[str]:
    csv_path = path or CLASS_MAP_PATH
    names: list[str] = []
    with csv_path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            name = (row.get("display_name") or "").strip()
            if name:
                names.append(name)
    if len(names) != 521:
        raise RuntimeError(f"expected 521 YAMNet classes, got {len(names)} from {csv_path}")
    return names


def load_yamnet_class_names(path: Path | None = None) -> frozenset[str]:
    return frozenset(load_yamnet_class_names_ordered(path))


YAMNET_CLASS_NAMES_ORDERED: list[str] = load_yamnet_class_names_ordered()
YAMNET_CLASS_NAMES: frozenset[str] = frozenset(YAMNET_CLASS_NAMES_ORDERED)


def sanitize_class_folder(name: str) -> str:
    """Filesystem-safe AudioSet class folder (keep readable punctuation where legal)."""
    cleaned = name.strip().replace("/", "-").replace("\\", "-").replace(":", "-")
    cleaned = re.sub(r"[\x00-\x1f]", "", cleaned)
    return cleaned[:120] or "unnamed"


def legal_destination_names(class_names: frozenset[str] | None = None) -> frozenset[str]:
    names = class_names if class_names is not None else YAMNET_CLASS_NAMES
    return frozenset(RESERVED_FOLDERS) | names | {sanitize_class_folder(c) for c in names}


def is_legal_destination(name: str, class_names: frozenset[str] | None = None) -> bool:
    return name in legal_destination_names(class_names)


def assert_legal_destination(name: str, class_names: frozenset[str] | None = None) -> None:
    if not is_legal_destination(name, class_names):
        raise ValueError(f"destination is not Mixed or an AudioSet class: {name}")


def merge_and_validate(params: dict[str, Any]) -> dict[str, Any]:
    unknown = set(params) - ALLOWED_KEYS
    if unknown:
        raise ValueError(f"unknown config keys: {sorted(unknown)}")
    raw_root = str(params.get("libraryRoot") or "").strip()
    if not raw_root:
        raise ValueError("libraryRoot is required")
    root = Path(raw_root).expanduser()
    if not root.is_absolute():
        raise ValueError("libraryRoot must be an absolute path")
    if root.exists() and not root.is_dir():
        raise ValueError(f"libraryRoot is not a directory: {root}")

    cfg: dict[str, Any] = dict(DEFAULTS)
    if "confidenceThreshold" in params:
        cfg["confidenceThreshold"] = _number_in_range(
            params["confidenceThreshold"], "confidenceThreshold", 0.0, 1.0
        )
    if "conflictDelta" in params:
        cfg["conflictDelta"] = _number_in_range(
            params["conflictDelta"], "conflictDelta", 0.0, 1.0
        )
    if "analyzeChunkSeconds" in params:
        chunk = _as_float(params["analyzeChunkSeconds"], "analyzeChunkSeconds")
        if chunk < 5:
            raise ValueError("analyzeChunkSeconds must be >= 5")
        cfg["analyzeChunkSeconds"] = chunk
    if "ingestMode" in params:
        mode = params["ingestMode"]
        if mode not in ("move", "copy"):
            raise ValueError("ingestMode must be move or copy")
        cfg["ingestMode"] = mode
    if "dropzoneOnLaunch" in params:
        cfg["dropzoneOnLaunch"] = _as_bool(params["dropzoneOnLaunch"], "dropzoneOnLaunch")
    if "playbackVolume" in params:
        cfg["playbackVolume"] = _number_in_range(
            params["playbackVolume"], "playbackVolume", 0.0, 1.0
        )
    if "playbackLoop" in params:
        cfg["playbackLoop"] = _as_bool(params["playbackLoop"], "playbackLoop")
    if "autoPlayOnSelect" in params:
        cfg["autoPlayOnSelect"] = _as_bool(params["autoPlayOnSelect"], "autoPlayOnSelect")
    if "playbackMuted" in params:
        cfg["playbackMuted"] = _as_bool(params["playbackMuted"], "playbackMuted")
    if "playbackPitchRange" in params:
        rng = int(_as_float(params["playbackPitchRange"], "playbackPitchRange"))
        if rng not in (2, 4, 8):
            raise ValueError("playbackPitchRange must be 2, 4, or 8")
        cfg["playbackPitchRange"] = rng
    pitch_max = float(cfg["playbackPitchRange"]) * 100.0
    if "playbackPitch" in params:
        cfg["playbackPitch"] = _number_in_range(
            params["playbackPitch"], "playbackPitch", 0.1, pitch_max
        )
    else:
        cfg["playbackPitch"] = min(float(cfg["playbackPitch"]), pitch_max)
    if "playbackPitchEnabled" in params:
        cfg["playbackPitchEnabled"] = _as_bool(
            params["playbackPitchEnabled"], "playbackPitchEnabled"
        )
    if "playbackPitchResetOnNew" in params:
        cfg["playbackPitchResetOnNew"] = _as_bool(
            params["playbackPitchResetOnNew"], "playbackPitchResetOnNew"
        )
    if "playbackPreservePitch" in params:
        cfg["playbackPreservePitch"] = _as_bool(
            params["playbackPreservePitch"], "playbackPreservePitch"
        )
    cfg["libraryRoot"] = str(root)
    return cfg


def _as_bool(value: Any, field: str) -> bool:
    if not isinstance(value, bool):
        raise ValueError(f"{field} must be a boolean")
    return value


def _as_float(value: Any, field: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{field} must be a number")
    return float(value)


def _number_in_range(value: Any, field: str, lo: float, hi: float) -> float:
    number = _as_float(value, field)
    if number < lo or number > hi:
        raise ValueError(f"{field} must be between {lo} and {hi}")
    return number


class ConfigStore:
    """In-memory config plus `{libraryRoot}/.Fieldy.json` and a home pointer."""

    def __init__(self, pointer_path: Path | None = None) -> None:
        self.pointer_path = pointer_path or default_pointer_path()
        self._config: dict[str, Any] | None = None

    def get(self) -> dict[str, Any]:
        if self._config is not None:
            data = dict(self._config)
            problem = inspect_library_root(data.get("libraryRoot"))
            if problem:
                data["libraryRootProblem"] = problem
            return data
        loaded = self._load_from_disk()
        if loaded is None:
            return {"needsOnboarding": True}
        if loaded.get("libraryRootProblem"):
            return dict(loaded)
        self._config = loaded
        return dict(loaded)

    def save(self, params: dict[str, Any]) -> dict[str, Any]:
        cfg = merge_and_validate(params)
        root = Path(cfg["libraryRoot"]).expanduser()
        root.mkdir(parents=True, exist_ok=True)
        root = root.resolve()
        cfg["libraryRoot"] = str(root)
        mixed = root / "Mixed"
        mixed.mkdir(exist_ok=True)
        payload = json.dumps(cfg, indent=2) + "\n"
        (root / CONFIG_FILENAME).write_text(payload, encoding="utf-8")
        self.pointer_path.parent.mkdir(parents=True, exist_ok=True)
        self.pointer_path.write_text(
            json.dumps({"libraryRoot": str(root)}, indent=2) + "\n",
            encoding="utf-8",
        )
        self._config = cfg
        return {"ok": True, "config": dict(cfg)}

    def _load_from_disk(self) -> dict[str, Any] | None:
        pointer_file = self.pointer_path if self.pointer_path.is_file() else None
        if pointer_file is None and self.pointer_path == default_pointer_path():
            legacy = _legacy_pointer_path()
            if legacy.is_file():
                pointer_file = legacy
        if pointer_file is None:
            return None
        pointer = json.loads(pointer_file.read_text(encoding="utf-8"))
        library_root = pointer.get("libraryRoot")
        if not library_root:
            return None
        root = Path(library_root)
        try:
            is_dir = root.is_dir()
        except PermissionError:
            return {"libraryRoot": str(root), "libraryRootProblem": "unreadable"}
        except OSError:
            return {"libraryRoot": str(root), "libraryRootProblem": "missing"}
        if not is_dir:
            return {"libraryRoot": str(root), "libraryRootProblem": "missing"}
        config_file = next(
            (
                candidate
                for name in (CONFIG_FILENAME, LEGACY_CONFIG_FILENAME)
                if (candidate := root / name).is_file()
            ),
            None,
        )
        if config_file is None:
            return {"libraryRoot": str(root.resolve()), "libraryRootProblem": "missing"}
        raw = json.loads(config_file.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            raise ValueError(f"invalid config file: {config_file}")
        return merge_and_validate(raw)
