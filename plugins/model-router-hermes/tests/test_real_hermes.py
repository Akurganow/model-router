import unittest

from support import REAL_HERMES, fake_api, make_router, task


@unittest.skipUnless(REAL_HERMES, "the real Hermes modules do not import here")
class DefaultRouteMatchesHermesTest(unittest.TestCase):
    """Our skip route equals the route of Hermes's bundled default backend."""

    CONFIGS = (
        {},
        {
            "model": "m",
            "provider": "p",
            "base_url": "http://localhost:1",
            "api_key": "cfg-sentinel",
        },
        {"reasoning_effort": "high", "api_mode": "chat_completions", "service_tier": "fast"},
        {
            "request_overrides": {"a": 1},
            "fallback_providers": ["x"],
            "unknown_key": 3,
            "backend": "default",
        },
    )

    def test_default_route(self):
        from agent.delegation_provider import ROUTE_KEYS
        from agent.delegation_registry import get_active_provider

        hermes = get_active_provider({})
        router = make_router(api=fake_api(secrets={}))  # no key: every task takes the default route
        for config in self.CONFIGS:
            with self.subTest(config):
                expected = {
                    k: v for k, v in hermes.route_task(task(), config).items() if k in ROUTE_KEYS
                }
                ours = {
                    k: v
                    for k, v in router.route(task(), config).items()
                    if k in ROUTE_KEYS and k != "label"
                }
                self.assertEqual(ours, expected)


if __name__ == "__main__":
    unittest.main()
