"""route_task: the default route, or the default route moved to a model and an effort."""

import logging
import math
import time

from . import checks, node
from .budget import Budget
from .constants import CONSTANTS, MS_PER_SECOND, PLUGIN_DIR
from .hermes_api import live_api
from .labels import OnceLog
from .settings import found_keys, read_provider, read_slot

# Config keys that name a model route of their own; the plugin then leaves the task alone.
SUBAGENT_ROUTE_KEYS = ("model", "provider", "base_url", "api_key")


def _is_set(value):
    return bool(value.strip()) if isinstance(value, str) else bool(value)


def _effort_set(value):
    return value is not None and not (isinstance(value, str) and not value.strip())


class Router:
    def __init__(self, ctx, *, api=None, clock=time.monotonic, script=None, constants=None):
        self._ctx = ctx
        self._api = api if api is not None else live_api()
        self._script = str(script if script is not None else PLUGIN_DIR / "route.mjs")
        self._constants = constants if constants is not None else CONSTANTS
        self._budget = Budget(self._constants["routingLimitMs"], clock)
        self._log = OnceLog(logging.getLogger(__name__))

    def route(self, task, config):
        """Never raises; the result is never empty."""
        try:
            base = {k: v for k, v in config.items() if k != "service_tier"}
        except Exception:
            return self._logged(self._skip({}, "failed"))
        try:
            with self._budget.open(task.get("index")) as window:
                route = self._decide(task, config, base, window)
        except Exception:
            route = self._skip(base, "failed")
        return self._logged(route)

    def _logged(self, route):
        self._log.info(route["label"])
        return route

    def _skip(self, base, reason):
        return {**base, "label": self._constants["skips"][reason]}

    def _decide(self, task, config, base, window):
        provider = read_provider(self._ctx, self._constants)
        keys = found_keys(self._api, self._constants, provider)
        slots = {
            name: read_slot(self._ctx, spec["setting"])
            for name, spec in self._constants["slots"].items()
        }
        # These gates read Hermes state, and a skipped task starts no Node.
        if not keys:
            return self._skip(base, "keyUnset")
        if not any(slot.has_model for slot in slots.values()):
            return self._skip(base, "noEndModel")
        if any(_is_set(config.get(key)) for key in SUBAGENT_ROUTE_KEYS):
            return self._skip(base, "subagentModelSet")
        node_path = self._api.find_node()
        if not node_path:
            return self._skip(base, "nodeNotFound")
        budget_ms = math.floor(window.remaining_ms())
        if budget_ms <= 0:
            return self._skip(base, "timeout")
        request = {
            "task": task.get("goal") or "",
            "context": task.get("context") or "",
            "provider": provider,
            "keys": keys,
            "budgetMs": budget_ms,
            **{f"{name}Model": slot.model or None for name, slot in slots.items()},
            "configEffort": _effort_set(config.get("reasoning_effort")),
        }
        return self._ask_node(node_path, request, base, slots, window)

    def _ask_node(self, node_path, request, base, slots, window):
        timeout_s = (request["budgetMs"] + self._constants["graceMs"]) / MS_PER_SECOND
        try:
            answer = node.run_node(
                [node_path, self._script],
                request,
                timeout_s,
                self._constants["efforts"],
                list(self._constants["slots"]),
            )
        except node.NodeTimeout:
            return self._skip(base, "timeout")
        except node.NodeFailed:
            return self._skip(base, "failed")
        return self._apply(answer, base, slots, window)

    def _apply(self, answer, base, slots, window):
        route = {**base, "label": self._constants["linePrefix"] + answer.line}
        if isinstance(answer, node.Skip):
            return route
        if answer.slot is not None:
            slot = slots[answer.slot]
            wait_s = max(window.remaining_ms(), 0) / MS_PER_SECOND
            resolved = checks.slot_resolved_within(slot, self._api, wait_s)
            if resolved is None:
                return self._skip(base, "timeout")
            if not resolved:
                return {**base, "label": self._constants["slots"][answer.slot]["unresolved"]}
            route.update(model=slot.model, provider=slot.provider)
        if answer.effort is not None:
            route["reasoning_effort"] = answer.effort
        return route
