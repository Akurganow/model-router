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

    def test_key_unset_for_each_provider_value(self):
        cases = {
            "typesafe": {"OPENROUTER_API_KEY": "or-secret-one"},
            "openrouter": {"TYPESAFE_API_KEY": "ts-secret-one"},
            "auto": {},
            "openrouter-first": {},
        }
        for provider, secrets in cases.items():
            with self.subTest(provider):
                self.assertSkipped(
                    "keyUnset",
                    api=fake_api(secrets=secrets),
                    settings=good_settings(provider=provider),
                )

    def test_blank_key_counts_as_unset(self):
        self.assertSkipped("keyUnset", api=fake_api(secrets={"TYPESAFE_API_KEY": "  "}))

    def test_any_allowed_key_opens_the_gate(self):
        for provider, secret in (
            ("auto", "OPENROUTER_API_KEY"),
            ("auto", "TYPESAFE_API_KEY"),
            ("openrouter-first", "TYPESAFE_API_KEY"),
            ("openrouter", "OPENROUTER_API_KEY"),
        ):
            with self.subTest((provider, secret)):
                route, stub = self.route(
                    api=fake_api(secrets={secret: "k-secret-one"}),
                    settings=good_settings(provider=provider),
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
