import json
import shutil
import unittest

from support import (
    good_settings,
    FIXTURES,
    PLUGIN_DIR,
    RouterCase,
    submodule,
)

node = submodule("node")


class FixtureReplayTest(RouterCase):
    """Each fixture's response, replayed through a Node stand-in, becomes the expected route."""

    @staticmethod
    def settings_for(fixture):
        """A model in each slot the fixture's request names one for."""
        request = fixture["request"]
        models = request.get("models") if isinstance(request, dict) else None
        models = models if isinstance(models, dict) else {}
        return good_settings(
            **{
                f"{name}_model": (
                    {"provider": "openrouter", "model": f"{name}-model"}
                    if isinstance(models.get(name), str) and models[name].strip()
                    else None
                )
                for name in ("small", "middle", "large")
            }
        )

    def test_every_fixture(self):
        self.assertGreaterEqual(len(FIXTURES), 16)
        config = {"api_mode": "chat_completions", "service_tier": "fast"}
        for path in FIXTURES:
            fixture = json.loads(path.read_text(encoding="utf-8"))
            with self.subTest(path.name):
                route, _ = self.route(
                    config,
                    reply=fixture["response"],
                    settings=self.settings_for(fixture),
                )
                self.assertEqual(route, fixture["route"])


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
                )
                self.assertEqual(result, node.Skip(fixture["response"]["line"]))


if __name__ == "__main__":
    unittest.main()
