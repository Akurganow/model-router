"""Shared test helpers: loads the plugin package from its hyphenated folder, stubs
the Hermes modules a plain interpreter lacks, and builds routers, fake Hermes
functions and Node stand-ins."""

from __future__ import annotations

import abc
import dataclasses
import importlib
import importlib.util
import itertools
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from typing import Any

from node_stub import make_node_stub

PLUGIN_DIR = Path(__file__).resolve().parent.parent
FIXTURES = sorted((PLUGIN_DIR / "tests" / "fixtures").glob("*.json"))
MODELS_FIXTURE = json.loads(
    (PLUGIN_DIR / "tests" / "fixtures" / "models" / "listing.json").read_text(encoding="utf-8")
)
# Hermes accepts these efforts for a delegated task.
HERMES_EFFORTS = {"minimal", "low", "medium", "high", "xhigh", "max", "ultra"}


def _importable(name: str) -> bool:
    try:
        importlib.import_module(name)
    except ImportError:
        return False
    return True


# Decided before any stub lands: stubs make the real modules unimportable.
REAL_HERMES = all(
    _importable(name)
    for name in ("agent.delegation_registry", "agent.secret_scope", "hermes_constants")
)


def _stub_module(name: str, **attrs: Any) -> types.ModuleType:
    module = types.ModuleType(name)
    vars(module).update(attrs)
    sys.modules[name] = module
    return module


def _install_stubs() -> None:
    if not _importable("agent.delegation_provider"):

        class DelegationProvider(abc.ABC):
            @property
            @abc.abstractmethod
            def name(self) -> str: ...

            @abc.abstractmethod
            def route_task(self, task, config): ...

            def is_available(self) -> bool:
                return True

        agent = sys.modules.get("agent") or _stub_module("agent")
        agent.__path__ = getattr(agent, "__path__", [])
        _stub_module("agent.delegation_provider", DelegationProvider=DelegationProvider)
    if not _importable("agent.secret_scope"):
        _stub_module("agent.secret_scope", get_secret=lambda name, default=None: default)
    if not _importable("hermes_constants"):
        _stub_module("hermes_constants", find_node_executable=lambda command: None)


_install_stubs()
_counter = itertools.count()


def load_plugin() -> types.ModuleType:
    """Loads a fresh copy of the plugin package under a unique module name."""
    name = f"model_router_hermes_under_test_{next(_counter)}"
    spec = importlib.util.spec_from_file_location(
        name, PLUGIN_DIR / "__init__.py", submodule_search_locations=[str(PLUGIN_DIR)]
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


PLUGIN = load_plugin()


def submodule(stem: str, plugin: types.ModuleType = PLUGIN) -> types.ModuleType:
    return importlib.import_module(f"{plugin.__name__}.{stem}")


CONSTANTS = json.loads((PLUGIN_DIR / "constants.json").read_text(encoding="utf-8"))
# Node returns finished lines, so every line a test stub answers starts with this.
PREFIX = "model-router "


def skipped_label(reason_key: str) -> str:
    return CONSTANTS["skips"][reason_key]


class FakeCtx:
    """The part of the Hermes plugin context the plugin uses.

    `fail` maps a registrar or `set_config` to the exception it raises."""

    def __init__(
        self, settings: dict[str, Any] | None = None, fail: dict[str, Exception] | None = None
    ) -> None:
        self.settings = {} if settings is None else settings
        self.fail = {} if fail is None else fail
        self.registered: list[Any] = []
        self.tools: list[dict[str, Any]] = []
        self.commands: list[dict[str, Any]] = []
        self.skills: list[tuple[str, Path]] = []
        self.written: list[tuple[str, Any]] = []
        self.order: list[str] = []

    def _enter(self, what: str) -> None:
        if what in self.fail:
            raise self.fail[what]
        self.order.append(what)

    def get_config(self, key: str, default: Any = None) -> Any:
        return self.settings.get(key, default)

    def set_config(self, key: str, value: Any) -> None:
        if "set_config" in self.fail:
            raise self.fail["set_config"]
        self.written.append((key, value))
        self.settings[key] = value

    def register_delegation_provider(self, provider: Any) -> None:
        self._enter("provider")
        self.registered.append(provider)

    def register_tool(self, name, toolset, schema, handler, **kwargs) -> None:
        self._enter("tool")
        self.tools.append(
            {"name": name, "toolset": toolset, "schema": schema, "handler": handler, **kwargs}
        )

    def register_command(self, name, handler, description="", args_hint="") -> None:
        self._enter("command")
        self.commands.append(
            {"name": name, "handler": handler, "description": description, "args_hint": args_hint}
        )

    def register_skill(self, name, path, **kwargs) -> None:
        self._enter("skill")
        self.skills.append((name, Path(path)))


class UnreadableCtx(FakeCtx):
    """A context whose settings cannot be read."""

    def get_config(self, key: str, default: Any = None) -> Any:
        raise ValueError("config unreadable")


class FakeClock:
    def __init__(self, now: float = 1000.0) -> None:
        self.now = now

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


def good_settings(**extra: Any) -> dict[str, Any]:
    settings: dict[str, Any] = {
        "provider": "typesafe",
        "small_model": {"provider": "openrouter", "model": "small-model"},
        "large_model": {"provider": "openrouter", "model": "large-model"},
    }
    settings.update(extra)
    return settings


def fake_api(**overrides: Any) -> Any:
    """A HermesApi whose functions all succeed; overrides replace single fields."""
    api_type = submodule("hermes_api").HermesApi
    secrets = overrides.pop("secrets", {"TYPESAFE_API_KEY": "typesafe-secret-one"})
    api = api_type(
        get_secret=lambda name: secrets.get(name),
        find_node=lambda: sys.executable,
        auth_type=lambda provider: "api_key",
        is_refreshable=lambda provider: False,
        resolve_runtime=lambda provider, model: None,
        list_models=lambda provider: ["small-model", "middle-model", "large-model"],
        list_providers=lambda: [],
        model_info=lambda provider, model: None,
    )
    return dataclasses.replace(api, **overrides)


@dataclasses.dataclass(frozen=True)
class FakeModelInfo:
    """The fields of Hermes's ModelInfo the shim reads; a price of 0.0 means Hermes has none."""

    cost_input: float = 0.0
    cost_output: float = 0.0
    context_window: int = 0

    def has_cost_data(self) -> bool:
        return self.cost_input > 0 or self.cost_output > 0


def hermes_of(fixture: dict[str, Any], **overrides: Any) -> Any:
    """A HermesApi that lists the providers, models and model data of a models fixture."""
    hermes = fixture["hermes"]
    auth_types = hermes.get("authTypes", {})

    def model_info(provider, model):
        info = hermes["info"].get(provider, {}).get(model)
        return None if info is None else FakeModelInfo(**info)

    return fake_api(
        list_providers=lambda: [dict(entry) for entry in hermes["providers"]],
        auth_type=lambda provider: auth_types.get(provider, "api_key"),
        list_models=lambda provider: list(hermes["models"].get(provider, [])),
        model_info=model_info,
        **overrides,
    )


def short_constants(routing_ms: int = 1000, grace_ms: int = 2000) -> dict[str, Any]:
    return {**CONSTANTS, "routingLimitMs": routing_ms, "graceMs": grace_ms}


def temp_dir() -> tempfile.TemporaryDirectory:
    return tempfile.TemporaryDirectory(prefix="mr-hermes-test-")


def make_router(
    *,
    settings: dict[str, Any] | None = None,
    api: Any = None,
    clock: Any = None,
    script: Path | str | None = None,
    constants: dict[str, Any] | None = None,
):
    router_module = submodule("router")
    return router_module.Router(
        FakeCtx(good_settings() if settings is None else settings),
        api=fake_api() if api is None else api,
        clock=FakeClock() if clock is None else clock,
        script=script,
        constants=short_constants() if constants is None else constants,
    )


def default_route(config: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in config.items() if k != "service_tier"}


UNRESOLVED_LINE = PREFIX + "L1 test unresolved line"


def route_reply(
    slot: str | None,
    effort: str | None,
    line: str = PREFIX + "L1 test line",
    unresolved_line: str | None = UNRESOLVED_LINE,
) -> dict[str, Any]:
    return {
        "outcome": "route",
        "slot": slot,
        "effort": effort,
        "line": line,
        "unresolvedLine": unresolved_line,
    }


def skip_reply(line: str = PREFIX + "skipped, test") -> dict[str, Any]:
    return {"outcome": "skip", "line": line}


def task(goal: str = "do the thing", context: str | None = None, index: int = 0) -> dict[str, Any]:
    return {"goal": goal, "context": context, "index": index}


class RouterCase(unittest.TestCase):
    def setUp(self):
        self._dir = temp_dir()
        self.dir = Path(self._dir.name)
        self.addCleanup(self._dir.cleanup)
        self.counter = 0

    def stub(self, **kwargs):
        self.counter += 1
        return make_node_stub(self.dir, name=f"stub{self.counter}", **kwargs)

    def route(self, config=None, *, reply=None, stub=None, settings=None, **router_args):
        stub = stub or self.stub(reply=reply if reply is not None else skip_reply())
        router = make_router(settings=settings, script=stub.script, **router_args)
        return router.route(task(), {} if config is None else config), stub

    def assertNodeNotRun(self, stub):
        self.assertFalse(stub.capture.exists())
