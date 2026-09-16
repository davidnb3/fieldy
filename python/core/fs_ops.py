"""Filesystem mutations. Destinations must pass config.assert_legal_destination."""

from __future__ import annotations

import os
import shutil
from pathlib import Path


def unique_dest(dest_dir: Path, filename: str) -> Path:
    dest = dest_dir / filename
    if not dest.exists():
        return dest
    stem, suffix = dest.stem, dest.suffix
    n = 1
    while True:
        candidate = dest_dir / f"{stem}_{n}{suffix}"
        if not candidate.exists():
            return candidate
        n += 1


def move_into_folder(src: str, dest_dir: str) -> str:
    dest_dir_p = Path(dest_dir)
    dest_dir_p.mkdir(parents=True, exist_ok=True)
    dest = unique_dest(dest_dir_p, os.path.basename(src))
    shutil.move(src, dest)
    return str(dest)


def rename_file(path: str, new_name: str) -> str:
    p = Path(path)
    dest = p.with_name(new_name)
    if dest.exists():
        raise FileExistsError(str(dest))
    p.rename(dest)
    return str(dest)


def delete_file(path: str) -> None:
    Path(path).unlink()
