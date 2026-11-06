import logging
import sys
import unittest
from unittest import mock

from support import (
    CONSTANTS,
    PLUGIN,
    PREFIX,
    FakeClock,
    FakeCtx,
    good_settings,
    load_plugin,
    make_router,
    skipped_label,
    submodule,
    task,
)


class ProviderTest(unittest.TestCase):
    def provider(self, **kwargs):
        return submodule("provider").ModelRouterProvider(FakeCtx(good_settings()), **kwargs)

    def test_name_is_the_backend(self):
        self.assertEqual(self.provider().name, CONSTANTS["backend"])
        self.assertEqual(self.provider().name, "model-router")

    def test_is_a_delegation_provider(self):
        from agent.delegation_provider import DelegationProvider

        self.assertIsInstance(self.provider(), DelegationProvider)

    def test_always_available(self):
        self.assertIs(self.provider().is_available(), True)

    def test_route_task_uses_the_router(self):
        router = make_router()
        provider = self.provider(router=router)
        with mock.patch.object(router, "route", return_value={"label": "x"}) as route:
            self.assertEqual(provider.route_task({"goal": "g"}, {"a": 1}), {"label": "x"})
        route.assert_called_once_with({"goal": "g"}, {"a": 1})

    def test_route_task_never_raises(self):
        # A Hermes core that cannot read secrets must still give a route.
        provider = submodule("provider").ModelRouterProvider(
            FakeCtx(good_settings()),
            router=make_router(api=submodule("hermes_api").live_api()),
        )
        with mock.patch.dict(sys.modules, {"agent.secret_scope": None}):
            route = provider.route_task(task(), {"a": 1})
        self.assertEqual(route, {"a": 1, "label": skipped_label("failed")})


class RegisterTest(unittest.TestCase):
    def test_register_hands_one_provider_to_the_context(self):
        ctx = FakeCtx(good_settings())
        PLUGIN.register(ctx)
        self.assertEqual([p.name for p in ctx.registered], ["model-router"])

    def test_register_starts_no_process(self):
        ctx = FakeCtx(good_settings())
        with (
            mock.patch("subprocess.run", side_effect=AssertionError("node started")),
            mock.patch("subprocess.Popen", side_effect=AssertionError("node started")),
        ):
            load_plugin().register(ctx)
        self.assertEqual(len(ctx.registered), 1)

    def test_old_core_logs_one_warning_and_registers_nothing(self):
        ctx = FakeCtx(good_settings())
        with mock.patch.dict(sys.modules, {"agent.delegation_provider": None}):
            plugin = load_plugin()
            with self.assertLogs(level="WARNING") as logs:
                self.assertIsNone(plugin.register(ctx))
        self.assertEqual(ctx.registered, [])
        self.assertEqual(len(logs.records), 1)

    def test_other_import_errors_are_not_swallowed(self):
        with mock.patch.dict(sys.modules, {"agent.delegation_provider": None}):
            plugin = load_plugin()
        broken = ModuleNotFoundError("No module named 'elsewhere'", name="elsewhere")
        with mock.patch.object(plugin, "_load_provider", side_effect=broken):
            with self.assertRaises(ModuleNotFoundError):
                plugin.register(FakeCtx())


class LogTest(unittest.TestCase):
    def test_a_label_is_logged_once_per_distinct_message(self):
        router = make_router(api=submodule("hermes_api").live_api())
        with mock.patch.dict(sys.modules, {"agent.secret_scope": None}):
            with self.assertLogs(level="INFO") as logs:
                for _ in range(3):
                    router.route(task(), {})
        self.assertEqual([r.getMessage() for r in logs.records], [skipped_label("failed")])
        self.assertTrue(all(r.levelno == logging.INFO for r in logs.records))

    def test_each_distinct_label_is_logged(self):
        from support import fake_api

        clock = FakeClock()
        router = make_router(api=fake_api(find_node=lambda: None), clock=clock)
        other = make_router(api=fake_api(secrets={}), clock=clock)
        with self.assertLogs(level="INFO") as logs:
            router.route(task(), {})
            other.route(task(), {})
            router.route(task(), {})
        self.assertEqual(
            [r.getMessage() for r in logs.records],
            [skipped_label("nodeNotFound"), skipped_label("keyUnset")],
        )

    def test_memory_is_bounded(self):
        log = submodule("labels").OnceLog(logging.getLogger("test-once"), capacity=2)
        with self.assertLogs("test-once", level="INFO") as logs:
            for message in ("a", "b", "c", "a", "c"):
                log.info(message)
        self.assertEqual([r.getMessage() for r in logs.records], ["a", "b", "c", "a"])

    def test_a_repeat_hit_keeps_the_message_among_the_most_recent(self):
        log = submodule("labels").OnceLog(logging.getLogger("test-once"), capacity=2)
        with self.assertLogs("test-once", level="INFO") as logs:
            for message in ("a", "b", "a", "c", "a", "b"):
                log.info(message)
        # The hit on "a" makes "b" the oldest, so "c" evicts "b" and "a" stays.
        self.assertEqual([r.getMessage() for r in logs.records], ["a", "b", "c", "b"])

    def test_every_skip_line_starts_with_the_prefix(self):
        for key, line in CONSTANTS["skips"].items():
            self.assertTrue(line.startswith(PREFIX), key)


if __name__ == "__main__":
    unittest.main()
