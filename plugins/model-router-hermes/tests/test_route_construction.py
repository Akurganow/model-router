import threading
import unittest

from support import (
    CONSTANTS,
    HERMES_EFFORTS,
    PREFIX,
    RouterCase,
    fake_api,
    good_settings,
    route_reply,
    short_constants,
    skipped_label,
    submodule,
)

node = submodule("node")


class RouteConstructionTest(RouterCase):
    CONFIG = {
        "api_mode": "chat_completions",
        "request_overrides": {"temperature": 0.2},
        "reasoning_effort": "high",
        "fallback_providers": ["a"],
        "service_tier": "fast",
    }

    def expected_base(self):
        return {k: v for k, v in self.CONFIG.items() if k != "service_tier"}

    def test_level_zero_and_two_set_slot_model_provider_and_effort(self):
        for level, model in ((0, "small-model"), (2, "large-model")):
            with self.subTest(level):
                route, _ = self.route(
                    {k: v for k, v in self.CONFIG.items() if k != "reasoning_effort"},
                    reply=route_reply(level, "medium", "L-line"),
                )
                self.assertEqual(
                    route,
                    {
                        "api_mode": "chat_completions",
                        "request_overrides": {"temperature": 0.2},
                        "fallback_providers": ["a"],
                        "model": model,
                        "provider": "openrouter",
                        "reasoning_effort": "medium",
                        "label": PREFIX + "L-line",
                    },
                )

    def test_level_one_changes_only_the_effort(self):
        route, _ = self.route(reply=route_reply(1, "xhigh", "L1 no change"))
        self.assertEqual(route, {"reasoning_effort": "xhigh", "label": PREFIX + "L1 no change"})

    def test_config_effort_stays_when_the_response_has_none(self):
        for level in (0, 1, 2):
            with self.subTest(level):
                route, _ = self.route(self.CONFIG, reply=route_reply(level, None, "L"))
                self.assertEqual(route["reasoning_effort"], "high")
                self.assertEqual(route["label"], PREFIX + "L")

    def test_no_effort_and_no_config_effort_sets_no_key(self):
        route, _ = self.route(reply=route_reply(1, None, "L"))
        self.assertEqual(route, {"label": PREFIX + "L"})

    def test_every_effort_is_valid_for_hermes_and_max_is_absent(self):
        self.assertTrue(set(CONSTANTS["efforts"]) <= HERMES_EFFORTS)
        self.assertFalse({"max", "ultra"} & set(CONSTANTS["efforts"]))
        for effort in CONSTANTS["efforts"]:
            route, _ = self.route(reply=route_reply(1, effort))
            self.assertEqual(route["reasoning_effort"], effort)

    def test_other_keys_survive_every_level(self):
        for level in (0, 1, 2):
            with self.subTest(level):
                route, _ = self.route(
                    {"api_mode": "m", "request_overrides": {"a": 1}, "x": 2},
                    reply=route_reply(level, "low"),
                )
                self.assertEqual(
                    (route["api_mode"], route["request_overrides"], route["x"]),
                    ("m", {"a": 1}, 2),
                )

    def test_slot_values_are_trimmed(self):
        settings = good_settings(small_model={"provider": " openrouter ", "model": " small-model "})
        route, _ = self.route(settings=settings, reply=route_reply(0, "low"))
        self.assertEqual((route["provider"], route["model"]), ("openrouter", "small-model"))

    def test_unresolved_slot_keeps_the_default_route(self):
        for level, key in ((0, "smallModelUnresolved"), (2, "largeModelUnresolved")):
            with self.subTest(level):
                route, _ = self.route(
                    self.CONFIG,
                    reply=route_reply(level, "low"),
                    api=fake_api(list_models=lambda provider: []),
                )
                self.assertEqual(route, {**self.expected_base(), "label": skipped_label(key)})

    def test_slot_check_runs_only_on_the_end_levels(self):
        calls = []
        api = fake_api(list_models=lambda provider: calls.append(provider) or [])
        route, _ = self.route(reply=route_reply(1, "low"), api=api)
        self.assertEqual(calls, [])
        self.assertEqual(route["reasoning_effort"], "low")

    def test_slot_check_wait_that_runs_out_is_unresolved(self):
        gate = threading.Event()
        self.addCleanup(gate.set)

        def slow(provider):
            gate.wait(10)
            return ["small-model"]

        route, _ = self.route(
            reply=route_reply(0, "low"),
            api=fake_api(list_models=slow),
            constants=short_constants(400, 1500),
        )
        self.assertEqual(route["label"], skipped_label("smallModelUnresolved"))

    def test_slot_check_uses_the_slot_provider_and_model(self):
        seen = []
        api = fake_api(
            resolve_runtime=lambda provider, model: seen.append(("resolve", provider, model)),
            list_models=lambda provider: seen.append(("models", provider)) or ["small-model"],
        )
        self.route(reply=route_reply(0, "low"), api=api)
        self.assertEqual(seen, [("resolve", "openrouter", "small-model"), ("models", "openrouter")])


if __name__ == "__main__":
    unittest.main()
