import unittest
from unittest import mock

from support import (
    PLUGIN_DIR,
    FakeClock,
    RouterCase,
    fake_api,
    make_router,
    route_reply,
    short_constants,
    skip_reply,
    skipped_label,
    submodule,
    task,
)

node = submodule("node")


class FailureTest(RouterCase):
    def assertFailed(self, route, reason="failed"):
        self.assertEqual(route["label"], skipped_label(reason))
        return route

    def test_node_that_outlasts_the_budget_is_a_timeout(self):
        stub = self.stub(reply=skip_reply(), sleep=30)
        route, _ = self.route({"a": 1}, stub=stub, constants=short_constants(300, 200))
        self.assertEqual(route, {"a": 1, "label": skipped_label("timeout")})

    def test_each_failed_case(self):
        cases = {
            "exit": dict(reply=skip_reply(), exit_code=1),
            "garbage": dict(raw="oops\n"),
            "empty": dict(raw=""),
            "array": dict(raw="[]\n"),
            "unknown outcome": dict(reply={"outcome": "maybe", "line": "x"}),
            "bad slot": dict(reply=route_reply("medium", "low")),
            "bad effort": dict(reply=route_reply(None, "max")),
            "line not text": dict(reply={"outcome": "skip", "line": 4}),
        }
        for name, kwargs in cases.items():
            with self.subTest(name):
                route, _ = self.route({"a": 1}, stub=self.stub(**kwargs))
                self.assertEqual(route, {"a": 1, "label": skipped_label("failed")})

    def test_missing_script_is_failed(self):
        router = make_router(
            script=self.dir / "missing.mjs", api=fake_api(find_node=lambda: str(self.dir / "none"))
        )
        self.assertEqual(router.route(task(), {"a": 1}), {"a": 1, "label": skipped_label("failed")})

    def test_any_exception_gives_the_default_route_plus_failed(self):
        def broken(name):
            raise RuntimeError("no scope")

        route, stub = self.route({"a": 1}, api=fake_api(get_secret=broken))
        self.assertEqual(route, {"a": 1, "label": skipped_label("failed")})
        self.assertNodeNotRun(stub)

    def test_settings_error_gives_failed(self):
        class Ctx:
            def get_config(self, key, default=None):
                raise RuntimeError("config unreadable")

        router = submodule("router").Router(
            Ctx(), api=fake_api(), clock=FakeClock(), script=None, constants=short_constants()
        )
        self.assertEqual(router.route(task(), {"a": 1}), {"a": 1, "label": skipped_label("failed")})

    def test_default_script_is_the_bundle_beside_the_plugin(self):
        router = make_router(script=None, api=fake_api(find_node=lambda: "/n/node"))
        with mock.patch.object(node, "run_node", return_value=node.Skip("skipped, x")) as run:
            router.route(task(), {})
        self.assertEqual(run.call_args.args[0], ["/n/node", str(PLUGIN_DIR / "route.mjs")])


if __name__ == "__main__":
    unittest.main()
