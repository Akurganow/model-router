"""route_task: the default route, or the default route moved to a model and an effort.

The delegating model may set an effort or pin a level on a task. The delegation
section outranks both: its effort beats the caller's, and its model beats a level."""

import logging
import math
import time

from . import checks, node, params
from .budget import Budget
from .constants import CONSTANTS, MS_PER_SECOND, PLUGIN_DIR
from .hermes_api import live_api
from .labels import OnceLog
from .settings import found_keys, read_provider, read_slot, stripped

# Config keys that name a model route of their own; the plugin then leaves the task alone.
SUBAGENT_ROUTE_KEYS = ("model", "provider", "base_url", "api_key")


def _is_set(value):
    # A route key counts as set when it is truthy: blank text, 0 and empty containers do not.
    text = stripped(value)
    return bool(value) if text is None else bool(text)


def _effort_set(value):
    # Unlike a route key, any value but None and blank text sets the effort, 0 included.
    return value is not None and stripped(value) != ""


# The states of a slot. Node words each one, so these are tokens of the protocol, not texts.
SET = "set"
UNSET = "unset"
UNRESOLVED = "unresolved"

# Node names a kept effort by its source, so only Python ranks the sources.
KEPT_BY_CONFIG = "config"
KEPT_BY_CALLER = "caller"


def _kept_effort(section, caller_effort):
    """Whose effort replaces the ladder's: the delegation section's, else the caller's, else None."""
    if _effort_set(section.get("reasoning_effort")):
        return KEPT_BY_CONFIG
    return KEPT_BY_CALLER if caller_effort is not None else None


def _subagent_model_set(config):
    return any(_is_set(config.get(key)) for key in SUBAGENT_ROUTE_KEYS)


class Router:
    def __init__(self, ctx, *, api=None, clock=time.monotonic, script=None, constants=None):
        self._ctx = ctx
        self._api = api if api is not None else live_api()
        self._script = str(script if script is not None else PLUGIN_DIR / "route.mjs")
        self._constants = constants if constants is not None else CONSTANTS
        self._budget = Budget(self._constants["routingLimitMs"], clock)
        self._log = OnceLog(logging.getLogger(__name__))

    def route(self, task, config):
        """Never raises. The result carries a label unless the task pins its level."""
        try:
            base = {k: v for k, v in config.items() if k != "service_tier"}
        except Exception:
            return self._logged(self._skip(self._with_caller_effort({}, task), "failed"))
        base = self._with_caller_effort(base, task)
        try:
            with self._budget.open(task.get("index")) as window:
                route = self._decide(task, config, base, window)
        except Exception:
            route = self._skip(base, "failed")
        return self._logged(route)

    def _with_caller_effort(self, base, task):
        """The base with the caller's effort, unless the delegation section sets one.

        The other harnesses keep a caller's effort even when the plugin skips, so every route carries it."""
        effort = params.caller_effort(task, self._constants)
        if _kept_effort(base, effort) != KEPT_BY_CALLER:
            return base
        return {**base, "reasoning_effort": effort}

    def _logged(self, route):
        # A pinned task whose slot is set carries no label, as other harnesses print no line for a caller's model.
        if "label" in route:
            self._log.info(route["label"])
        return route

    def _skip(self, base, reason):
        return {**base, "label": self._constants["skips"][reason]}

    def _decide(self, task, config, base, window):
        slot_settings = {
            name: read_slot(self._ctx, spec["setting"])
            for name, spec in self._constants["slots"].items()
        }
        level = params.level(task, self._constants)
        if level is not None:
            return self._pinned(level, config, base, slot_settings, window)
        provider = read_provider(self._ctx, self._constants)
        keys = found_keys(self._api, self._constants, provider)
        # These gates read Hermes state, and a skipped task starts no Node.
        if not keys:
            return self._skip(base, "keyUnset")
        if _subagent_model_set(config):
            return self._skip(base, "subagentModelSet")
        node_path = self._api.find_node()
        if not node_path:
            return self._skip(base, "nodeNotFound")
        # One offline check takes a few milliseconds (docs/clients.md#hermes-model-and-credential-checks),
        # so every slot is checked before Node and Node words the line.
        states = {name: self._slot_state(slot, window) for name, slot in slot_settings.items()}
        budget_ms = math.floor(window.remaining_ms())
        if budget_ms <= 0:
            return self._skip(base, "timeout")
        request = {
            "task": task.get("goal") or "",
            "context": task.get("context") or "",
            "provider": provider,
            "keys": keys,
            "budgetMs": budget_ms,
            "models": {
                name: slot.model if states[name] == SET else None
                for name, slot in slot_settings.items()
            },
            "unresolved": [name for name, state in states.items() if state == UNRESOLVED],
            "keptEffort": _kept_effort(config, params.caller_effort(task, self._constants)),
            "description": params.description(task),
        }
        return self._ask_node(node_path, request, base, slot_settings, states)

    def _pinned(self, level, config, base, slot_settings, window):
        """The pass-through of a pinned level: no Jev call, and a label only when its slot has no model."""
        if _subagent_model_set(config):
            return self._skip(base, "subagentModelSet")
        name = self._constants["levelSlots"][level]
        slot = slot_settings[name]
        state = self._slot_state(slot, window)
        if state == SET:
            return {**base, "model": slot.model, "provider": slot.provider}
        return {**base, "label": self._constants["slots"][name]["pinned"][state]}

    def _slot_state(self, slot, window):
        """set when the slot's model resolves offline in time, else unset or unresolved.

        A check that does not finish in time counts as unresolved, so the task keeps Hermes's model."""
        if not slot.has_model:
            return UNSET
        wait_s = max(window.remaining_ms(), 0) / MS_PER_SECOND
        return SET if checks.slot_resolved_within(slot, self._api, wait_s) else UNRESOLVED

    def _ask_node(self, node_path, request, base, slot_settings, states):
        timeout_s = (request["budgetMs"] + self._constants["graceMs"]) / MS_PER_SECOND
        try:
            answer = node.run_node([node_path, self._script], request, timeout_s)
        except node.NodeTimeout:
            return self._skip(base, "timeout")
        except node.NodeFailed:
            return self._skip(base, "failed")
        return self._apply(answer, base, slot_settings, states)

    def _in_protocol(self, answer):
        """Whether a route names a slot and an effort the settings and the ladder hold."""
        return answer.slot in self._constants["slots"] and (
            answer.effort is None or answer.effort in self._constants["efforts"]
        )

    def _apply(self, answer, base, slot_settings, states):
        # Node's lines are finished, prefix included.
        route = {**base, "label": answer.line}
        if isinstance(answer, node.Skip):
            return route
        if not self._in_protocol(answer):
            return self._skip(base, "failed")
        # A slot with no usable model keeps Hermes's model; Node's line already names it.
        if states[answer.slot] == SET:
            slot = slot_settings[answer.slot]
            route.update(model=slot.model, provider=slot.provider)
        if answer.effort is not None:
            route["reasoning_effort"] = answer.effort
        return route
