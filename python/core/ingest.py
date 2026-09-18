"""Classify → tag original → move original into Mixed or an AudioSet class folder."""

from __future__ import annotations

from collections.abc import Callable, Iterable
from pathlib import Path
from typing import Any

from core.analyze import classify_path
from core.classifier import YamnetClassifier
from core.config import DEFAULTS, assert_legal_destination
from core.fs_ops import copy_into_folder, move_into_folder
from core.metadata import read_score, read_tags, write_tags
from core.recent import is_under_library, record_new_ingest

WAV_SUFFIXES = {".wav", ".wave"}
ProgressFn = Callable[[dict[str, Any]], None]

_classifier: YamnetClassifier | None = None


def get_classifier() -> YamnetClassifier:
    global _classifier
    if _classifier is None:
        loaded = YamnetClassifier()
        loaded.load()
        _classifier = loaded
    return _classifier


def expand_audio_paths(paths: Iterable[str]) -> list[Path]:
    found: list[Path] = []
    for raw in paths:
        path = Path(raw).expanduser()
        if path.is_dir():
            found.extend(
                sorted(
                    child
                    for child in path.rglob("*")
                    if child.is_file() and child.suffix.lower() in WAV_SUFFIXES
                )
            )
        else:
            found.append(path)
    return found


def ingest_paths(
    paths: list[str],
    config: dict[str, Any],
    *,
    classifier: YamnetClassifier | None = None,
    on_progress: ProgressFn | None = None,
) -> list[dict[str, Any]]:
    """Run YAMNet on each WAV, tag the original, move into a legal folder.

    Per-file errors are returned in the job list; the batch continues.
    """
    if config.get("needsOnboarding"):
        raise ValueError("needsOnboarding: save_config with libraryRoot first")
    library_root = Path(config["libraryRoot"]).expanduser().resolve()
    if not library_root.is_dir():
        raise ValueError(f"libraryRoot is not a directory: {library_root}")
    threshold = float(config.get("confidenceThreshold", DEFAULTS["confidenceThreshold"]))
    chunk_seconds = float(config.get("analyzeChunkSeconds", DEFAULTS["analyzeChunkSeconds"]))
    model = classifier or get_classifier()
    jobs: list[dict[str, Any]] = []
    for path in expand_audio_paths(paths):
        jobs.append(
            _ingest_one(
                path,
                library_root=library_root,
                threshold=threshold,
                chunk_seconds=chunk_seconds,
                classifier=model,
                on_progress=on_progress,
                config=config,
            )
        )
    record_new_ingest(library_root, jobs)
    return jobs


def _ingest_one(
    path: Path,
    *,
    library_root: Path,
    threshold: float,
    chunk_seconds: float,
    classifier: YamnetClassifier,
    on_progress: ProgressFn | None,
    config: dict[str, Any],
) -> dict[str, Any]:
    original = str(path)
    try:
        _progress(on_progress, original, "inspect")
        resolved = path.expanduser().resolve()
        if not resolved.is_file():
            raise FileNotFoundError(f"not a file: {path}")
        if resolved.suffix.lower() not in WAV_SUFFIXES:
            raise ValueError(f"only WAV is supported in MVP: {path}")
        _progress(on_progress, original, "analyze")
        result = classify_path(
            str(resolved),
            classifier,
            threshold=threshold,
            chunk_seconds=chunk_seconds,
        )
        dest = result["destination"]
        tags = list(result["tags"])
        score = result.get("score")
        assert_legal_destination(dest)
        was_library = is_under_library(library_root, resolved)
        copy_mode = str(config.get("ingestMode") or "move") == "copy" and not was_library
        previous_tags = read_tags(str(resolved))
        previous_score = read_score(str(resolved))
        dest_dir = library_root / dest
        copied = False
        if copy_mode:
            _progress(on_progress, original, "tag")
            moved_to = copy_into_folder(str(resolved), str(dest_dir))
            write_tags(moved_to, tags, score=score)
            copied = True
        else:
            _progress(on_progress, original, "tag")
            write_tags(str(resolved), tags, score=score)
            if resolved.parent.resolve() == dest_dir.resolve():
                moved_to = str(resolved)
            else:
                _progress(on_progress, original, "move")
                moved_to = move_into_folder(str(resolved), str(dest_dir))
        _progress(on_progress, original, "done", destination=dest, movedTo=moved_to)
        return {
            "path": original,
            "ok": True,
            "destination": dest,
            "tags": tags,
            "score": score,
            "movedTo": moved_to,
            "copied": copied,
            "wasLibrary": was_library,
            "previousPath": str(resolved),
            "previousTags": previous_tags,
            "previousScore": previous_score,
            "frames": result["frames"],
            "top": result["top"],
        }
    except Exception as exc:  # noqa: BLE001 — batch must continue
        _progress(on_progress, original, "error", error=str(exc))
        return {"path": original, "ok": False, "error": str(exc)}


def _progress(
    on_progress: ProgressFn | None,
    file: str,
    stage: str,
    **extra: Any,
) -> None:
    if on_progress is None:
        return
    payload: dict[str, Any] = {"file": file, "stage": stage}
    payload.update(extra)
    on_progress(payload)


def main() -> None:
    import argparse
    import json
    import sys

    from core.config import ConfigStore

    parser = argparse.ArgumentParser(description="Ingest WAV files into the Fieldy library.")
    parser.add_argument("paths", nargs="+")
    args = parser.parse_args()
    config = ConfigStore().get()
    if config.get("needsOnboarding"):
        print("needsOnboarding: save a libraryRoot first", file=sys.stderr)
        sys.exit(2)
    jobs = ingest_paths(args.paths, config)
    print(json.dumps({"jobs": jobs}, indent=2))
    if any(not job["ok"] for job in jobs):
        sys.exit(1)


if __name__ == "__main__":
    main()
