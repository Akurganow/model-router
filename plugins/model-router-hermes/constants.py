"""The values the TypeScript bundle shares with this shim, read from constants.json.

The shim copies none of them: limits, provider tables, effort lists and texts all
come from that generated file."""

import json
from pathlib import Path

PLUGIN_DIR = Path(__file__).resolve().parent
MS_PER_SECOND = 1000
CONSTANTS = json.loads((PLUGIN_DIR / "constants.json").read_text(encoding="utf-8"))
