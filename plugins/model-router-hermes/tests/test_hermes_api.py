import sys
import threading
import types
import unittest
from contextlib import contextmanager
from unittest import mock

from support import submodule

hermes_api = submodule("hermes_api")

BLOCKED = (
    "agent.secret_scope",
    "hermes_constants",
    "hermes_cli.auth",
    "hermes_cli.auth_plugin_providers",
    "hermes_cli.left_core_migration",
    "hermes_cli.runtime_provider",
    "agent.models_dev",
    "hermes_cli.models",
    "hermes_cli.models_catalog_static",
)


@contextmanager
def fake_modules(**modules):
    """Replaces the named Hermes modules; a None value makes the import fail."""
    entries = {name: modules.get(name) for name in BLOCKED}
    # A submodule import needs its parent package, which a plain interpreter lacks.
    entries["hermes_cli"] = module("hermes_cli", __path__=[])
    with mock.patch.dict(sys.modules, entries):
        yield


def module(name, **attrs):
    mod = types.ModuleType(name)
    vars(mod).update(attrs)
    return mod


class MissingModulesTest(unittest.TestCase):
    def test_node_and_checks_fail_closed_without_hermes_modules(self):
        api = hermes_api.live_api()
        with fake_modules():
            self.assertIsNone(api.find_node())
            with self.assertRaises(ImportError):
                api.auth_type("openrouter")
            with self.assertRaises(ImportError):
                api.is_refreshable("openrouter")
            with self.assertRaises(ImportError):
                api.resolve_runtime("openrouter", "m")
            with self.assertRaises(ImportError):
                api.list_models("openrouter")
            with self.assertRaises(ImportError):
                api.get_secret("TYPESAFE_API_KEY")
            with self.assertRaises(ImportError):
                api.provider_ids()
            with self.assertRaises(ImportError):
                api.has_credentials("openrouter")
            with self.assertRaises(ImportError):
                api.model_info("openrouter", "m")


class LiveFunctionsTest(unittest.TestCase):
    def test_functions_call_the_hermes_modules(self):
        calls = []
        held = threading.local()

        @contextmanager
        def installs_held():
            held.value = True
            try:
                yield
            finally:
                held.value = False

        def resolve(**kwargs):
            calls.append(("resolve", kwargs, getattr(held, "value", False)))

        def list_models(provider, allow_network=True):
            calls.append(("models", provider, allow_network))
            return ["m"]

        def get_model_info(provider, model, allow_network=True):
            calls.append(("info", provider, model, allow_network))
            return "info"

        def listed_canonical_providers():
            calls.append(("providers",))
            return [types.SimpleNamespace(slug="openrouter"), types.SimpleNamespace(slug="bedrock")]

        def provider_has_credentials(provider):
            calls.append(("credentials", provider))
            return provider == "openrouter"

        modules = {
            "agent.secret_scope": module("agent.secret_scope", get_secret=lambda name: f"v-{name}"),
            "hermes_constants": module(
                "hermes_constants", find_node_executable=lambda command: f"/bin/{command}"
            ),
            "hermes_cli.auth": module(
                "hermes_cli.auth",
                PROVIDER_REGISTRY={"openrouter": types.SimpleNamespace(auth_type="api_key")},
            ),
            "hermes_cli.auth_plugin_providers": module(
                "hermes_cli.auth_plugin_providers", is_refreshable_oauth_provider=lambda p: p == "x"
            ),
            "hermes_cli.left_core_migration": module(
                "hermes_cli.left_core_migration", installs_held=installs_held
            ),
            "hermes_cli.runtime_provider": module(
                "hermes_cli.runtime_provider", resolve_runtime_provider=resolve
            ),
            "agent.models_dev": module(
                "agent.models_dev", list_provider_models=list_models, get_model_info=get_model_info
            ),
            "hermes_cli.models": module(
                "hermes_cli.models", _provider_has_credentials=provider_has_credentials
            ),
            "hermes_cli.models_catalog_static": module(
                "hermes_cli.models_catalog_static",
                listed_canonical_providers=listed_canonical_providers,
            ),
        }
        api = hermes_api.live_api()
        with fake_modules(**modules):
            self.assertEqual(api.get_secret("NAME"), "v-NAME")
            self.assertEqual(api.find_node(), "/bin/node")
            self.assertEqual(api.auth_type("openrouter"), "api_key")
            self.assertIsNone(api.auth_type("outside-the-registry"))
            self.assertTrue(api.is_refreshable("x"))
            api.resolve_runtime("openrouter", "m")
            self.assertEqual(api.list_models("openrouter"), ["m"])
            self.assertEqual(api.provider_ids(), ["openrouter", "bedrock"])
            self.assertTrue(api.has_credentials("openrouter"))
            self.assertEqual(api.model_info("openrouter", "m"), "info")
        self.assertEqual(
            calls,
            [
                ("resolve", {"requested": "openrouter", "target_model": "m"}, True),
                ("models", "openrouter", False),
                ("providers",),
                ("credentials", "openrouter"),
                ("info", "openrouter", "m", False),
            ],
        )

    def test_find_node_returns_none_when_hermes_raises(self):
        def broken(command):
            raise RuntimeError("pm failed")

        with fake_modules(
            **{"hermes_constants": module("hermes_constants", find_node_executable=broken)}
        ):
            self.assertIsNone(hermes_api.live_api().find_node())


if __name__ == "__main__":
    unittest.main()
