import threading
import unittest
from unittest import mock

from support import (
    CONSTANTS,
    HERMES_EFFORTS,
    PREFIX,
    FakeClock,
    RouterCase,
    fake_api,
    good_settings,
    make_router,
    route_reply,
    short_constants,
    skipped_label,
    submodule,
    task,
    unresolved_label,
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

    def test_a_named_slot_sets_its_model_provider_and_effort(self):
        for slot, model in (("small", "small-model"), ("large", "large-model")):
            with self.subTest(slot):
                route, _ = self.route(
                    {k: v for k, v in self.CONFIG.items() if k != "reasoning_effort"},
                    reply=route_reply(slot, "medium", PREFIX + "L-line"),
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

    def test_no_slot_changes_only_the_effort(self):
        route, _ = self.route(reply=route_reply(None, "xhigh", PREFIX + "L1 no change"))
        self.assertEqual(route, {"reasoning_effort": "xhigh", "label": PREFIX + "L1 no change"})

    def test_config_effort_stays_when_the_response_has_none(self):
        for slot in (None, *CONSTANTS["slots"]):
            with self.subTest(slot):
                route, _ = self.route(self.CONFIG, reply=route_reply(slot, None, PREFIX + "L"))
                self.assertEqual(route["reasoning_effort"], "high")
                self.assertEqual(route["label"], PREFIX + "L")

    def test_no_effort_and_no_config_effort_sets_no_key(self):
        route, _ = self.route(reply=route_reply(None, None, PREFIX + "L"))
        self.assertEqual(route, {"label": PREFIX + "L"})

    def test_every_effort_is_valid_for_hermes_and_max_is_absent(self):
        self.assertTrue(set(CONSTANTS["efforts"]) <= HERMES_EFFORTS)
        self.assertFalse({"max", "ultra"} & set(CONSTANTS["efforts"]))
        for effort in CONSTANTS["efforts"]:
            route, _ = self.route(reply=route_reply(None, effort))
            self.assertEqual(route["reasoning_effort"], effort)

    def test_other_keys_survive_every_slot(self):
        for slot in (None, *CONSTANTS["slots"]):
            with self.subTest(slot):
                route, _ = self.route(
                    {"api_mode": "m", "request_overrides": {"a": 1}, "x": 2},
                    reply=route_reply(slot, "low"),
                )
                self.assertEqual(
                    (route["api_mode"], route["request_overrides"], route["x"]),
                    ("m", {"a": 1}, 2),
                )

    def test_slot_values_are_trimmed(self):
        settings = good_settings(small_model={"provider": " openrouter ", "model": " small-model "})
        route, _ = self.route(settings=settings, reply=route_reply("small", "low"))
        self.assertEqual((route["provider"], route["model"]), ("openrouter", "small-model"))

    def test_unresolved_slot_keeps_the_default_route(self):
        for slot in CONSTANTS["slots"]:
            with self.subTest(slot):
                route, _ = self.route(
                    self.CONFIG,
                    reply=route_reply(slot, "low"),
                    api=fake_api(list_models=lambda provider: []),
                )
                self.assertEqual(
                    route, {**self.expected_base(), "label": unresolved_label(slot)}
                )

    def test_a_slot_the_settings_do_not_hold_is_a_failed_skip(self):
        calls = []
        api = fake_api(list_models=lambda provider: calls.append(provider) or ["small-model"])
        route, _ = self.route(self.CONFIG, reply=route_reply("medium", "low"), api=api)
        self.assertEqual(route, {**self.expected_base(), "label": skipped_label("failed")})
        self.assertEqual(calls, [])

    def test_an_effort_the_ladder_does_not_give_is_a_failed_skip(self):
        for effort in ("max", "ultra", "Low", ""):
            for slot in (None, "small"):
                with self.subTest(effort=effort, slot=slot):
                    route, _ = self.route(self.CONFIG, reply=route_reply(slot, effort))
                    self.assertEqual(
                        route, {**self.expected_base(), "label": skipped_label("failed")}
                    )

    def test_slot_check_runs_only_for_a_named_slot(self):
        calls = []
        api = fake_api(list_models=lambda provider: calls.append(provider) or [])
        route, _ = self.route(reply=route_reply(None, "low"), api=api)
        self.assertEqual(calls, [])
        self.assertEqual(route["reasoning_effort"], "low")

    def test_slot_check_that_outlasts_the_wait_is_a_timeout(self):
        gate = threading.Event()
        self.addCleanup(gate.set)

        def slow(provider):
            gate.wait(10)
            return ["small-model"]

        route, _ = self.route(
            reply=route_reply("small", "low"),
            api=fake_api(list_models=slow),
            constants=short_constants(400, 1500),
        )
        self.assertEqual(route["label"], skipped_label("timeout"))

    def test_no_time_left_for_the_slot_check_is_a_timeout(self):
        clock = FakeClock()
        calls = []

        def spend_the_budget(*_args):
            clock.advance(9)
            return node.Route("small", "low", PREFIX + "L")

        api = fake_api(list_models=lambda provider: calls.append(provider) or ["small-model"])
        with mock.patch.object(node, "run_node", spend_the_budget):
            route = make_router(api=api, clock=clock).route(task(), {})
        self.assertEqual(route["label"], skipped_label("timeout"))
        self.assertEqual(calls, [])

    def test_a_completed_failing_check_is_unresolved_not_a_timeout(self):
        route, _ = self.route(
            reply=route_reply("large", "low"), api=fake_api(list_models=lambda provider: [])
        )
        self.assertEqual(route["label"], unresolved_label("large"))

    def test_slot_check_uses_the_slot_provider_and_model(self):
        seen = []
        api = fake_api(
            resolve_runtime=lambda provider, model: seen.append(("resolve", provider, model)),
            list_models=lambda provider: seen.append(("models", provider)) or ["small-model"],
        )
        self.route(reply=route_reply("small", "low"), api=api)
        self.assertEqual(seen, [("resolve", "openrouter", "small-model"), ("models", "openrouter")])


if __name__ == "__main__":
    unittest.main()
