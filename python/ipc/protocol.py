from __future__ import annotations

import json
import traceback
from typing import Any, TextIO

from ipc.handlers import build_handlers


def run_stdio_loop(stdin: TextIO, stdout: TextIO, stderr: TextIO) -> None:
    """Read one JSON object per line; write one JSON object per line.

    Request:  {"id": "1", "method": "ping", "params": {}}
    Response: {"id": "1", "ok": true, "result": {...}}
    Event:    {"type": "event", "name": "progress", "payload": {...}}
    """
    handlers = build_handlers(
        emit_progress=lambda payload: emit_event(stdout, "progress", payload)
    )
    for line in stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
            method = msg.get("method")
            if method not in handlers:
                raise ValueError(f"unknown method: {method}")
            result = handlers[method](msg.get("params") or {})
            _write(stdout, {"id": msg.get("id"), "ok": True, "result": result})
        except Exception as exc:  # noqa: BLE001 — IPC must never die on one bad request
            traceback.print_exc(file=stderr)
            _write(stdout, {"id": msg.get("id"), "ok": False, "error": str(exc)})


def emit_event(stdout: TextIO, name: str, payload: dict[str, Any]) -> None:
    _write(stdout, {"type": "event", "name": name, "payload": payload})


def _write(stdout: TextIO, obj: dict[str, Any]) -> None:
    stdout.write(json.dumps(obj) + "\n")
    stdout.flush()
