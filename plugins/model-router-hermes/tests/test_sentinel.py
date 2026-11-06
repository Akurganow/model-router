"""Distinct sentinel strings prove where secrets and task text may travel."""

import json
import unittest
from pathlib import Path

from support import (
    fake_api,
    good_settings,
    make_node_stub,
    make_router,
    route_reply,
    skip_reply,
    temp_dir,
)

# Hyphenated words: no sentinel is a key-shaped run for a scanner.
TYPESAFE_SENTINEL = "ts-sentinel-alpha"
OPENROUTER_SENTINEL = "or-sentinel-beta"
CONFIG_API_SENTINEL = "cfg-sentinel-gamma"
TASK_SENTINEL = "goal-sentinel-delta"
CONTEXT_SENTINEL = "ctx-sentinel-epsilon"
SECRETS = {
    "TYPESAFE_API_KEY": TYPESAFE_SENTINEL,
    "OPENROUTER_API_KEY": OPENROUTER_SENTINEL,
}


class SentinelTest(unittest.TestCase):
    def setUp(self):
        self._dir = temp_dir()
        self.dir = Path(self._dir.name)
        self.addCleanup(self._dir.cleanup)

    def route(self, config, reply, **settings):
        stub = make_node_stub(self.dir, reply=reply)
        router = make_router(
            settings=good_settings(provider="auto", **settings),
            api=fake_api(secrets=SECRETS),
            script=stub.script,
        )
        with self.assertLogs(level="DEBUG") as logs:
            route = router.route(
                {"goal": TASK_SENTINEL, "context": CONTEXT_SENTINEL, "index": 0}, config
            )
        return route, stub, "\n".join(r.getMessage() + str(r.args) for r in logs.records)

    def test_routed_task_keeps_secrets_and_text_where_they_belong(self):
        route, stub, logs = self.route({"api_mode": "chat"}, route_reply("small", "low"))
        captured = stub.captured()
        request = json.loads(captured["stdin"])
        self.assertEqual(
            request["keys"], {"typesafe": TYPESAFE_SENTINEL, "openrouter": OPENROUTER_SENTINEL}
        )
        self.assertEqual((request["task"], request["context"]), (TASK_SENTINEL, CONTEXT_SENTINEL))
        outside = json.dumps(
            {"env": captured["env"], "argv": captured["argv"], "route": route, "logs": logs}
        )
        for sentinel in (
            TYPESAFE_SENTINEL,
            OPENROUTER_SENTINEL,
            CONFIG_API_SENTINEL,
            TASK_SENTINEL,
            CONTEXT_SENTINEL,
        ):
            self.assertNotIn(sentinel, outside)

    def test_key_and_text_appear_only_in_their_stdin_fields(self):
        _, stub, _ = self.route({}, skip_reply())
        request = json.loads(stub.captured()["stdin"])
        without_keys = {k: v for k, v in request.items() if k != "keys"}
        self.assertNotIn(TYPESAFE_SENTINEL, json.dumps(without_keys))
        self.assertNotIn(OPENROUTER_SENTINEL, json.dumps(without_keys))
        for field in ("provider", "smallModel", "largeModel"):
            self.assertNotIn(TASK_SENTINEL, str(request[field]))

    def test_config_api_key_never_reaches_node_or_a_log(self):
        config = {"api_key": CONFIG_API_SENTINEL, "api_mode": "chat"}
        route, stub, logs = self.route(config, route_reply("small", "low"))
        self.assertFalse(stub.capture.exists())  # the subagent-model gate answers first
        self.assertNotIn(CONFIG_API_SENTINEL, logs)
        self.assertNotIn(TASK_SENTINEL, logs)
        # The default route carries the user's own api_key back to Hermes, as Hermes's default does.
        self.assertEqual(route["api_key"], CONFIG_API_SENTINEL)
        self.assertEqual(route["api_mode"], "chat")

    def test_a_node_failure_logs_no_secret(self):
        stub = make_node_stub(self.dir, raw=f"{TYPESAFE_SENTINEL} {TASK_SENTINEL}\n")
        router = make_router(
            settings=good_settings(), api=fake_api(secrets=SECRETS), script=stub.script
        )
        with self.assertLogs(level="DEBUG") as logs:
            router.route({"goal": TASK_SENTINEL, "context": None, "index": 0}, {})
        text = "\n".join(r.getMessage() for r in logs.records)
        self.assertNotIn(TYPESAFE_SENTINEL, text)
        self.assertNotIn(TASK_SENTINEL, text)


if __name__ == "__main__":
    unittest.main()
