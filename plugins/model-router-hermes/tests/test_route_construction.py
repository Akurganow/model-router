import unittest

from support import (
    CONSTANTS,
    HERMES_EFFORTS,
    PREFIX,
    RouterCase,
    good_settings,
    route_reply,
    skipped_label,
)


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
        settings = good_settings(middle_model={"provider": "openrouter", "model": "middle-model"})
        for slot, model in (
            ("small", "small-model"),
            ("middle", "middle-model"),
            ("large", "large-model"),
        ):
            with self.subTest(slot):
                route, _ = self.route(
                    {k: v for k, v in self.CONFIG.items() if k != "reasoning_effort"},
                    reply=route_reply(slot, "medium", PREFIX + "L-line"),
                    settings=settings,
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

    def test_a_slot_with_no_model_changes_only_the_effort(self):
        line = PREFIX + "L1 middle model unset · xhigh · p=0.90/0.90"
        route, _ = self.route(reply=route_reply("middle", "xhigh", line))
        self.assertEqual(route, {"reasoning_effort": "xhigh", "label": line})

    def test_a_null_slot_is_outside_the_protocol(self):
        route, _ = self.route(self.CONFIG, reply=route_reply(None, "low"))
        self.assertEqual(route, {**self.expected_base(), "label": skipped_label("failed")})

    def test_config_effort_stays_when_the_response_has_none(self):
        for slot in CONSTANTS["slots"]:
            with self.subTest(slot):
                route, _ = self.route(self.CONFIG, reply=route_reply(slot, None, PREFIX + "L"))
                self.assertEqual(route["reasoning_effort"], "high")
                self.assertEqual(route["label"], PREFIX + "L")

    def test_no_effort_and_no_config_effort_sets_no_key(self):
        route, _ = self.route(reply=route_reply("middle", None, PREFIX + "L"))
        self.assertEqual(route, {"label": PREFIX + "L"})

    def test_every_effort_is_valid_for_hermes_and_max_is_absent(self):
        self.assertTrue(set(CONSTANTS["efforts"]) <= HERMES_EFFORTS)
        self.assertFalse({"max", "ultra"} & set(CONSTANTS["efforts"]))
        for effort in CONSTANTS["efforts"]:
            route, _ = self.route(reply=route_reply("middle", effort))
            self.assertEqual(route["reasoning_effort"], effort)

    def test_other_keys_survive_every_slot(self):
        for slot in CONSTANTS["slots"]:
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

    def test_a_slot_the_settings_do_not_hold_is_a_failed_skip(self):
        route, _ = self.route(self.CONFIG, reply=route_reply("medium", "low"))
        self.assertEqual(route, {**self.expected_base(), "label": skipped_label("failed")})

    def test_an_effort_the_ladder_does_not_give_is_a_failed_skip(self):
        for effort in ("max", "ultra", "Low", ""):
            for slot in ("middle", "small"):
                with self.subTest(effort=effort, slot=slot):
                    route, _ = self.route(self.CONFIG, reply=route_reply(slot, effort))
                    self.assertEqual(
                        route, {**self.expected_base(), "label": skipped_label("failed")}
                    )


if __name__ == "__main__":
    unittest.main()
