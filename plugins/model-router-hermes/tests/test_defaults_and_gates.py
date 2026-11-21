import sys
import unittest

from support import (
    PREFIX,
    FakeClock,
    RouterCase,
    fake_api,
    good_settings,
    make_router,
    skip_reply,
    skipped_label,
    submodule,
    task,
)

node = submodule("node")


class DefaultRouteTest(RouterCase):
    def test_skip_returns_the_default_route_plus_label(self):
        config = {"reasoning_effort": "low", "api_mode": "chat", "service_tier": "fast", "x": 1}
        route, _ = self.route(config, reply=skip_reply(PREFIX + "skipped, test"))
        self.assertEqual(
            route,
            {
                "reasoning_effort": "low",
                "api_mode": "chat",
                "x": 1,
                "label": PREFIX + "skipped, test",
            },
        )

    def test_config_is_not_changed(self):
        config = {"service_tier": "fast", "api_mode": "chat"}
        self.route(config)
        self.assertEqual(config, {"service_tier": "fast", "api_mode": "chat"})

    def test_a_config_that_is_not_a_mapping_gives_the_failed_label_alone(self):
        stub = self.stub(reply=skip_reply())
        router = make_router(script=stub.script)
        for config in (None, "text", 3):
            self.assertEqual(
                router.route(task(), config), {"label": skipped_label("failed")}, config
            )

    def test_a_task_that_is_not_a_mapping_gives_the_default_route_plus_failed(self):
        stub = self.stub(reply=skip_reply())
        router = make_router(script=stub.script)
        self.assertEqual(router.route(None, {"a": 1}), {"a": 1, "label": skipped_label("failed")})


class GateTest(RouterCase):
    def assertSkipped(self, reason, config=None, **router_args):
        route, stub = self.route(config, **router_args)
        self.assertEqual(route["label"], skipped_label(reason))
        self.assertNodeNotRun(stub)
        return route

    def test_key_unset_for_each_gateway_value(self):
        cases = {
            "direct": {"OPENROUTER_API_KEY": "or-secret-one"},
            "openrouter": {"TYPESAFE_API_KEY": "ts-secret-one"},
            "auto": {},
            "openrouter-first": {},
        }
        for gateway, secrets in cases.items():
            with self.subTest(gateway):
                self.assertSkipped(
                    "keyUnset",
                    api=fake_api(secrets=secrets),
                    settings=good_settings(provider="typesafe", gateway=gateway),
                )

    def test_the_key_holders_are_looked_up_in_the_order_of_each_gateway_value(self):
        ts, orr = "TYPESAFE_API_KEY", "OPENROUTER_API_KEY"
        cases = {"direct": [ts], "auto": [ts, orr], "openrouter-first": [orr, ts], "openrouter": [orr]}
        for gateway, looked_up in cases.items():
            with self.subTest(gateway):
                calls = []
                self.route(
                    api=fake_api(get_secret=calls.append),
                    settings=good_settings(provider="typesafe", gateway=gateway),
                )
                self.assertEqual(calls, looked_up)

    def test_a_setting_that_is_not_valid_skips_before_any_secret_or_node(self):
        calls = []
        api = fake_api(get_secret=calls.append, find_node=lambda: calls.append("node"))
        for stored, label in (
            ({"provider": "auto"}, "model-router skipped, provider not valid: run setup"),
            ({"gateway": "fast"}, "model-router skipped, gateway not valid: run setup"),
            (
                {"provider": "openrouter", "gateway": "fast"},
                "model-router skipped, provider not valid: run setup",
            ),
        ):
            route, stub = self.route(api=api, settings=good_settings(**stored))
            self.assertEqual(route["label"], label)
            self.assertNodeNotRun(stub)
        self.assertEqual(calls, [])

    def test_a_setting_that_is_not_valid_skips_a_task_with_a_level_too(self):
        stub = self.stub(reply=skip_reply())
        router = make_router(script=stub.script, settings=good_settings(gateway="fast"))
        route = router.route({"goal": "g", "index": 0, "level": 1}, {})
        self.assertEqual(route, {"label": "model-router skipped, gateway not valid: run setup"})

    def test_blank_key_counts_as_unset(self):
        self.assertSkipped("keyUnset", api=fake_api(secrets={"TYPESAFE_API_KEY": "  "}))

    def test_a_blank_spaces_or_missing_openai_key_counts_as_unset(self):
        for blank in ("", "   ", None):
            with self.subTest(blank):
                self.assertSkipped(
                    "keyUnset",
                    api=fake_api(secrets={"OPENAI_API_KEY": blank}),
                    settings=good_settings(provider="openai", gateway="direct"),
                )

    def test_any_allowed_key_opens_the_gate(self):
        for gateway, secret in (
            ("auto", "OPENROUTER_API_KEY"),
            ("auto", "TYPESAFE_API_KEY"),
            ("openrouter-first", "TYPESAFE_API_KEY"),
            ("openrouter", "OPENROUTER_API_KEY"),
        ):
            with self.subTest((gateway, secret)):
                route, stub = self.route(
                    api=fake_api(secrets={secret: "k-secret-one"}),
                    settings=good_settings(provider="typesafe", gateway=gateway),
                )
                self.assertEqual(route["label"], PREFIX + "skipped, test")
                self.assertTrue(stub.capture.exists())

    def test_no_model_in_any_slot_still_asks_node(self):
        for small, large in ((None, None), ({}, {"model": " "}), ({"provider": "p"}, "m")):
            with self.subTest((small, large)):
                route, stub = self.route(
                    settings=good_settings(small_model=small, large_model=large)
                )
                self.assertEqual(route["label"], PREFIX + "skipped, test")
                self.assertTrue(stub.capture.exists())

    def test_subagent_model_set(self):
        for key in ("model", "provider", "base_url", "api_key"):
            for value in ("x", " y ", {"a": 1}, ["a"], 1, True):
                with self.subTest((key, value)):
                    config = {key: value, "api_mode": "chat"}
                    route = self.assertSkipped("subagentModelSet", config)
                    self.assertEqual(route["api_mode"], "chat")
                    self.assertEqual(route[key], value)

    def test_blank_or_empty_config_values_do_not_count_as_set(self):
        config = {"model": "  ", "provider": "", "base_url": None, "api_key": 0}
        route, stub = self.route(config)
        self.assertEqual(route["label"], PREFIX + "skipped, test")
        self.assertTrue(stub.capture.exists())

    def test_node_not_found(self):
        self.assertSkipped("nodeNotFound", api=fake_api(find_node=lambda: None))

    def test_budget_spent(self):
        clock = FakeClock()
        api = fake_api(find_node=lambda: clock.advance(9) or sys.executable)
        self.assertSkipped("timeout", api=api, clock=clock)

    def test_first_failing_gate_names_the_reason(self):
        clock = FakeClock()
        secrets = {}
        config = {"model": "m"}
        node_path = [None]

        def find_node():
            clock.advance(9)
            return node_path[0]

        def build():
            return fake_api(secrets=secrets, find_node=find_node)

        steps = [
            ("keyUnset", lambda: secrets.update(TYPESAFE_API_KEY="ts-secret-one")),
            ("subagentModelSet", lambda: config.clear()),
            ("nodeNotFound", lambda: node_path.__setitem__(0, sys.executable)),
            ("timeout", lambda: None),
        ]
        for reason, fix in steps:
            route, stub = self.route(dict(config), api=build(), clock=clock)
            self.assertEqual(route["label"], skipped_label(reason))
            self.assertNodeNotRun(stub)
            fix()


if __name__ == "__main__":
    unittest.main()
