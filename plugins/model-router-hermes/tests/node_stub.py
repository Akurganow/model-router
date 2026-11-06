"""A script that stands in for route.mjs: it records what it was given, then answers."""

from __future__ import annotations

import dataclasses
import json
from pathlib import Path
from typing import Any


@dataclasses.dataclass
class NodeStub:
    script: Path
    capture: Path

    def captured(self) -> dict[str, Any]:
        return json.loads(self.capture.read_text(encoding="utf-8"))


_STUB_SOURCE = """\
import json, os, sys, time
data = sys.stdin.read()
with open({capture!r}, "w") as handle:
    json.dump({{"stdin": data, "env": dict(os.environ), "argv": sys.argv,
               "pid": os.getpid()}}, handle)
time.sleep({sleep!r})
sys.stdout.write({out!r})
sys.exit({code!r})
"""


def make_node_stub(
    directory: Path,
    *,
    reply: Any = None,
    raw: str | None = None,
    exit_code: int = 0,
    sleep: float = 0.0,
    name: str = "stub",
) -> NodeStub:
    """Writes a script that records its stdin, environment and arguments, then
    answers like route.mjs: one JSON line, or `raw` verbatim."""
    out = raw if raw is not None else json.dumps(reply) + "\n"
    script = directory / f"{name}.py"
    capture = directory / f"{name}.json"
    script.write_text(
        _STUB_SOURCE.format(capture=str(capture), sleep=sleep, out=out, code=exit_code),
        encoding="utf-8",
    )
    return NodeStub(script, capture)
