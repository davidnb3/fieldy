"""Fieldy Python entrypoint: NDJSON IPC on stdin/stdout.

Load YAMNet once. Never print non-JSON to stdout (logs go to stderr).
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ipc.protocol import run_stdio_loop


def main() -> None:
    run_stdio_loop(stdin=sys.stdin, stdout=sys.stdout, stderr=sys.stderr)


if __name__ == "__main__":
    main()
