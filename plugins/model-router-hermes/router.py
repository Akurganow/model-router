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

# An end level takes its model from a slot; the middle level keeps the task's model.
END_LEVELS = {0: ("small", "smallModelUnresolved"), 2: ("large", "largeModelUnresolved")}
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
            return self._logged({"label": self._skipped("failed")})
        try:
            return self._logged(self._routed(task, config, base))
        except Exception:
            return self._logged(self._skip(base, "failed"))

    def _logged(self, route):
        self._log.info(route["label"])
        return route

    def _skipped(self, reason):
        skips = self._constants["skips"]
        return self._constants["linePrefix"] + skips["skippedPrefix"] + skips[reason]

    def _skip(self, base, reason):
        return {**base, "label": self._skipped(reason)}

    def _routed(self, task, config, base):
        window = self._budget.open(task.get("index"))
        try:
            return self._decide(task, config, base, window)
        finally:
            window.close()

    def _keys(self, provider):
        return found_keys(self._api, self._constants, provider)

    def _decide(self, task, config, base, window):
        provider = read_provider(self._ctx, self._constants)
        keys = self._keys(provider)
        slots = {
            "small": read_slot(self._ctx, "small_model"),
            "large": read_slot(self._ctx, "large_model"),
        }
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
            "smallModel": slots["small"].model or None,
            "largeModel": slots["large"].model or None,
            "configEffort": _effort_set(config.get("reasoning_effort")),
        }
        return self._ask_node(node_path, request, base, slots, window)

    def _ask_node(self, node_path, request, base, slots, window):
        timeout_s = (request["budgetMs"] + self._constants["graceMs"]) / MS_PER_SECOND
        try:
            answer = node.run_node(
                [node_path, self._script], request, timeout_s, self._constants["efforts"]
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
        if answer.level in END_LEVELS:
            name, unresolved = END_LEVELS[answer.level]
            slot = slots[name]
            wait_s = max(window.remaining_ms(), 0) / MS_PER_SECOND
            if not checks.slot_resolved_within(slot, self._api, wait_s):
                return self._skip(base, unresolved)
            route.update(model=slot.model, provider=slot.provider)
        if answer.effort is not None:
            route["reasoning_effort"] = answer.effort
        return route
