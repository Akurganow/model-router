import json
import shutil
import unittest

from support import (
    default_route,
    CONSTANTS,
    FIXTURES,
    PLUGIN_DIR,
    PREFIX,
    RouterCase,
    submodule,
)

node = submodule("node")


class FixtureReplayTest(RouterCase):
    """Each fixture's response, replayed through a Node stand-in, becomes the expected route."""

    def expected(self, response, config):
        base = default_route(config)
        if response["outcome"] == "skip":
            return {**base, "label": PREFIX + response["line"]}
        level, effort = response["level"], response["effort"]
        route = {**base, "label": PREFIX + response["line"]}
        if level != 1:
            route.update(
                model="small-model" if level == 0 else "large-model", provider="openrouter"
            )
        if effort is not None:
            route["reasoning_effort"] = effort
        return route

    def test_every_fixture(self):
        self.assertGreaterEqual(len(FIXTURES), 16)
        config = {"api_mode": "chat_completions", "service_tier": "fast"}
        for path in FIXTURES:
            fixture = json.loads(path.read_text(encoding="utf-8"))
            with self.subTest(path.name):
                route, _ = self.route(config, reply=fixture["response"])
                self.assertEqual(route, self.expected(fixture["response"], config))


@unittest.skipUnless(shutil.which("node"), "node is not installed")
class RealBundleTest(unittest.TestCase):
    """The shipped bundle answers the fixtures that need no network."""

    def test_offline_fixtures(self):
        node_path = shutil.which("node")
        offline = [p for p in FIXTURES if json.loads(p.read_text())["jev"] == []]
        self.assertGreaterEqual(len(offline), 3)
        for path in offline:
            fixture = json.loads(path.read_text(encoding="utf-8"))
            with self.subTest(path.name):
                result = node.run_node(
                    [node_path, str(PLUGIN_DIR / "route.mjs")],
                    fixture["request"],
                    20,
                    CONSTANTS["efforts"],
                )
                self.assertEqual(result, node.Skip(fixture["response"]["line"]))


if __name__ == "__main__":
    unittest.main()
