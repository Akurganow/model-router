import inspect
import json
import os
import socket
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from support import REAL_HERMES, fake_api, make_router, submodule, task

checks = submodule("checks")
hermes_api = submodule("hermes_api")


@unittest.skipUnless(REAL_HERMES, "the real Hermes modules do not import here")
class DefaultRouteMatchesHermesTest(unittest.TestCase):
    """Our skip route equals the route of Hermes's bundled default backend."""

    CONFIGS = (
        {},
        {
            "model": "m",
            "provider": "p",
            "base_url": "http://localhost:1",
            "api_key": "cfg-sentinel",
        },
        {"reasoning_effort": "high", "api_mode": "chat_completions", "service_tier": "fast"},
        {
            "request_overrides": {"a": 1},
            "fallback_providers": ["x"],
            "unknown_key": 3,
            "backend": "default",
        },
    )

    def test_default_route(self):
        from agent.delegation_provider import ROUTE_KEYS
        from agent.delegation_registry import get_active_provider

        hermes = get_active_provider({})
        router = make_router(api=fake_api(secrets={}))  # no key: every task takes the default route
        for config in self.CONFIGS:
            with self.subTest(config):
                expected = {
                    k: v for k, v in hermes.route_task(task(), config).items() if k in ROUTE_KEYS
                }
                ours = {
                    k: v
                    for k, v in router.route(task(), config).items()
                    if k in ROUTE_KEYS and k != "label"
                }
                self.assertEqual(ours, expected)


@unittest.skipUnless(REAL_HERMES, "the real Hermes modules do not import here")
class CredentialRuleOnHermesTest(unittest.TestCase):
    """The offline credential rule, read through Hermes's own registry and refresh check."""

    def test_api_key_providers_pass_and_login_providers_do_not(self):
        api = hermes_api.live_api()
        for provider in ("openrouter", "gemini", "deepseek"):
            with self.subTest(provider):
                self.assertTrue(checks.credentials_stay_offline(provider, api))
        for provider in ("nous", "openai-codex", "qwen-oauth", "minimax-oauth", "bedrock"):
            with self.subTest(provider):
                self.assertFalse(checks.credentials_stay_offline(provider, api))


def _no_network(*_args, **_kwargs):
    raise AssertionError("the call reached the network")


@unittest.skipUnless(REAL_HERMES, "the real Hermes modules do not import here")
class HermesApiOnHermesTest(unittest.TestCase):
    """Each Hermes function the shim calls keeps the name and the shape the shim uses.

    The live functions import lazily and some swallow errors, so only a call on
    the real Hermes shows a rename."""

    VARIABLE = "MODEL_ROUTER_PROBE_VARIABLE"

    def test_get_secret_reads_a_variable_and_returns_none_for_an_absent_one(self):
        api = hermes_api.live_api()
        with mock.patch.dict(os.environ, {self.VARIABLE: "probe-value"}):
            self.assertEqual(api.get_secret(self.VARIABLE), "probe-value")
        self.assertIsNone(api.get_secret(self.VARIABLE))

    def test_find_node_matches_hermes_and_names_a_file_or_nothing(self):
        # The shim's wrapper turns any error into None, so the test calls Hermes directly too.
        from hermes_constants import find_node_executable

        found = find_node_executable("node")
        self.assertTrue(found is None or os.path.isfile(found), found)
        self.assertEqual(hermes_api.live_api().find_node(), found)

    def test_list_models_reads_the_catalogue_offline(self):
        # Hermes ships no catalogue; offline it reads only the home's disk cache, so the test writes one.
        import agent.models_dev as models_dev

        cache = {"deepseek": {"id": "deepseek", "models": {"deepseek-chat": {"id": "deepseek-chat"}}}}
        home = tempfile.TemporaryDirectory()
        self.addCleanup(home.cleanup)
        Path(home.name, "models_dev_cache.json").write_text(json.dumps(cache), encoding="utf-8")
        with (
            mock.patch.dict(os.environ, {"HERMES_HOME": home.name}),
            mock.patch.object(models_dev, "_models_dev_cache", {}),
            mock.patch.object(socket.socket, "connect", _no_network),
            mock.patch.object(socket, "create_connection", _no_network),
        ):
            models = hermes_api.live_api().list_models("deepseek")
        self.assertEqual(models, ["deepseek-chat"])

    def test_resolve_runtime_provider_takes_the_keywords_the_shim_passes(self):
        from hermes_cli.runtime_provider import resolve_runtime_provider

        parameters = inspect.signature(resolve_runtime_provider).parameters
        for name in ("requested", "target_model"):
            with self.subTest(name):
                self.assertEqual(parameters[name].kind, inspect.Parameter.KEYWORD_ONLY)

    def test_installs_held_is_a_context_manager(self):
        from hermes_cli.left_core_migration import installs_held

        with installs_held():
            pass


if __name__ == "__main__":
    unittest.main()
