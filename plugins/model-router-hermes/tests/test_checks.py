import contextvars
import dataclasses
import threading
import time
import unittest

from support import fake_api, submodule

checks = submodule("checks")
Slot = submodule("settings").Slot
GOOD = Slot("openrouter", "small-model")


def api(**overrides):
    return fake_api(**overrides)


class SlotChecksTest(unittest.TestCase):
    def resolves(self, slot=GOOD, **overrides):
        return checks.slot_resolves(slot, api(**overrides))

    def test_a_listed_api_key_model_resolves(self):
        self.assertTrue(self.resolves())

    def test_slot_without_provider_or_model_is_unresolved(self):
        self.assertFalse(self.resolves(Slot("", "small-model")))
        self.assertFalse(self.resolves(Slot("openrouter", "")))

    def test_other_auth_types_are_unresolved(self):
        self.assertFalse(self.resolves(auth_type=lambda provider: "oauth_device_code"))
        self.assertFalse(self.resolves(auth_type=lambda provider: "aws_sdk"))

    def test_a_provider_outside_the_registry_needs_only_the_refresh_check(self):
        # Hermes resolves OpenRouter outside its provider registry.
        self.assertTrue(self.resolves(auth_type=lambda provider: None))
        self.assertFalse(
            self.resolves(auth_type=lambda provider: None, is_refreshable=lambda provider: True)
        )

    def test_unknown_provider_is_unresolved(self):
        def unknown(provider):
            raise KeyError(provider)

        self.assertFalse(self.resolves(auth_type=unknown))

    def test_refreshable_provider_is_unresolved(self):
        self.assertFalse(self.resolves(is_refreshable=lambda provider: True))

    def test_resolver_error_is_unresolved(self):
        def broken(provider, model):
            raise RuntimeError("no credentials")

        self.assertFalse(self.resolves(resolve_runtime=broken))

    def test_resolver_gets_provider_and_model(self):
        seen = []
        self.resolves(resolve_runtime=lambda provider, model: seen.append((provider, model)))
        self.assertEqual(seen, [("openrouter", "small-model")])

    def test_unlisted_or_empty_catalog_is_unresolved(self):
        self.assertFalse(self.resolves(list_models=lambda provider: ["other"]))
        self.assertFalse(self.resolves(list_models=lambda provider: []))

    def test_catalog_error_is_unresolved(self):
        def broken(provider):
            raise ImportError("missing")

        self.assertFalse(self.resolves(list_models=broken))


class AnthropicTest(unittest.TestCase):
    slot = Slot("anthropic", "small-model")

    def resolves(self, secrets, **overrides):
        oauth = dict(auth_type=lambda p: "oauth_external", is_refreshable=lambda p: True)
        return checks.slot_resolves(self.slot, api(secrets=secrets, **{**oauth, **overrides}))

    def test_accepted_with_only_the_api_key(self):
        self.assertTrue(self.resolves({"ANTHROPIC_API_KEY": "anthropic-secret-one"}))

    def test_unresolved_without_the_api_key(self):
        self.assertFalse(self.resolves({}))

    def test_unresolved_when_a_token_is_set(self):
        base = {"ANTHROPIC_API_KEY": "anthropic-secret-one"}
        self.assertFalse(self.resolves({**base, "ANTHROPIC_TOKEN": "token-one"}))
        self.assertFalse(self.resolves({**base, "CLAUDE_CODE_OAUTH_TOKEN": "token-one"}))

    def test_still_needs_the_resolver_and_the_catalog(self):
        secrets = {"ANTHROPIC_API_KEY": "anthropic-secret-one"}

        def broken(provider, model):
            raise RuntimeError("no")

        self.assertFalse(self.resolves(secrets, resolve_runtime=broken))
        self.assertFalse(self.resolves(secrets, list_models=lambda p: []))

    def test_secret_read_error_is_unresolved(self):
        def broken(name):
            raise RuntimeError("no scope")

        self.assertFalse(self.resolves({}, get_secret=broken))


class WaitTest(unittest.TestCase):
    def test_resolved_slot_within_the_wait(self):
        self.assertTrue(checks.slot_resolved_within(GOOD, api(), 2))

    def test_unresolved_slot_within_the_wait(self):
        self.assertFalse(checks.slot_resolved_within(GOOD, api(list_models=lambda p: []), 2))

    def test_a_wait_that_runs_out_is_unresolved(self):
        gate = threading.Event()
        self.addCleanup(gate.set)

        def slow(provider):
            gate.wait(10)
            return ["small-model"]

        started = time.monotonic()
        self.assertFalse(checks.slot_resolved_within(GOOD, api(list_models=slow), 0.2))
        self.assertLess(time.monotonic() - started, 5)

    def test_no_wait_left_is_unresolved(self):
        self.assertFalse(checks.slot_resolved_within(GOOD, api(), 0))
        self.assertFalse(checks.slot_resolved_within(GOOD, api(), -1))

    def test_checks_run_in_a_daemon_thread_with_the_callers_context(self):
        var = contextvars.ContextVar("scope", default="unset")
        var.set("caller")
        seen = {}

        def resolve(provider, model):
            seen["thread"] = threading.current_thread()
            seen["scope"] = var.get()

        checks.slot_resolved_within(GOOD, api(resolve_runtime=resolve), 2)
        self.assertIsNot(seen["thread"], threading.main_thread())
        self.assertTrue(seen["thread"].daemon)
        self.assertEqual(seen["scope"], "caller")

    def test_worker_error_is_unresolved(self):
        def broken(provider, model):
            raise RuntimeError("no")

        self.assertFalse(
            checks.slot_resolved_within(GOOD, dataclasses.replace(api(), resolve_runtime=broken), 2)
        )


if __name__ == "__main__":
    unittest.main()
