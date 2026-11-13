import json
import shutil
import unittest

from support import (
    default_route,
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
    def set_slots(request):
        """The slots the fixture's request names a model for, as the shim would have found them set."""
        models = request.get("models") if isinstance(request, dict) else None
        unresolved = request.get("unresolved") or [] if isinstance(request, dict) else []
        if not isinstance(models, dict):
            return set()
        return {
            name
            for name, model in models.items()
            if isinstance(model, str) and model.strip() and name not in unresolved
        }

    def expected(self, response, config, set_slots):
        base = default_route(config)
        if response["outcome"] == "skip":
            return {**base, "label": response["line"]}
        slot, effort = response["slot"], response["effort"]
        route = {**base, "label": response["line"]}
        if slot in set_slots:
            route.update(model=f"{slot}-model", provider="openrouter")
        if effort is not None:
            route["reasoning_effort"] = effort
        return route

    def test_every_fixture(self):
        self.assertGreaterEqual(len(FIXTURES), 16)
        config = {"api_mode": "chat_completions", "service_tier": "fast"}
        for path in FIXTURES:
            fixture = json.loads(path.read_text(encoding="utf-8"))
            set_slots = self.set_slots(fixture["request"])
            settings = good_settings(
                **{
                    f"{name}_model": (
                        {"provider": "openrouter", "model": f"{name}-model"}
                        if name in set_slots
                        else None
                    )
                    for name in ("small", "middle", "large")
                }
            )
            with self.subTest(path.name):
                route, _ = self.route(config, reply=fixture["response"], settings=settings)
                self.assertEqual(route, self.expected(fixture["response"], config, set_slots))

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
