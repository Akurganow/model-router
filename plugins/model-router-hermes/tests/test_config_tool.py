import json
import socket
import unittest
from pathlib import Path
from unittest import mock

from support import (
    CONSTANTS,
    MODELS_FIXTURE,
    FakeCtx,
    FakeModelInfo,
    UnreadableCtx,
    fake_api,
    good_settings,
    hermes_of,
    make_node_stub,
    short_constants,
    submodule,
    temp_dir,
)

TEXTS = CONSTANTS["texts"]
LINES = TEXTS["lineBreak"]
SECRETS = {"TYPESAFE_API_KEY": "typesafe-secret-one", "OPENROUTER_API_KEY": "openrouter-secret-2"}


def handler_for(settings=None, secrets=None, **api_overrides):
    ctx = FakeCtx(good_settings() if settings is None else settings)
    api = fake_api(secrets={} if secrets is None else secrets, **api_overrides)
    submodule("config_tool").register_tool(ctx, api=api)
    return ctx.tools[0]["handler"]


def text_of(raw):
    payload = json.loads(raw)
    assert list(payload) == ["text"], payload
    return payload["text"]


def call(handler, args=None, **kwargs):
    return text_of(handler({} if args is None else args, **kwargs))


class ReadAllTest(unittest.TestCase):
    def test_no_input_gives_the_provider_the_three_models_and_the_key_lines(self):
        handler = handler_for(
            good_settings(provider="auto", large_model=None), {"TYPESAFE_API_KEY": "x"}
        )
        self.assertEqual(
            call(handler),
            LINES.join(
                [
                    TEXTS["providerLines"]["auto"],
                    "small_model: openrouter small-model",
                    "middle_model: unset",
                    "large_model: unset",
                    TEXTS["keyLines"]["typesafe"]["set"],
                    TEXTS["keyLines"]["openrouter"]["unset"],
                ]
            ),
        )

    def test_only_the_keys_the_provider_allows_are_listed(self):
        for value, names in CONSTANTS["providers"]["order"].items():
            with self.subTest(value):
                lines = call(handler_for(good_settings(provider=value), SECRETS)).split(LINES)
                self.assertEqual(
                    lines[4:], [TEXTS["keyLines"][name]["set"] for name in names]
                )

    def test_an_unset_provider_reads_as_the_default(self):
        text = call(handler_for({}))
        default = CONSTANTS["providers"]["default"]
        self.assertEqual(text.split(LINES)[0], TEXTS["providerLines"][default])

    def test_a_blank_key_is_unset(self):
        text = call(handler_for(secrets={"TYPESAFE_API_KEY": "   "}))
        self.assertIn(TEXTS["keyLines"]["typesafe"]["unset"], text)

    def test_input_that_names_no_setting_reads_all(self):
        handler = handler_for()
        expected = call(handler)
        for args in ({}, None, [], "provider", 3):
            with self.subTest(args):
                self.assertEqual(text_of(handler(args)), expected)

    def test_an_incomplete_model_slot_shows_the_missing_part_as_unset(self):
        settings = good_settings(small_model={"model": "m/x"}, large_model={"provider": "p"})
        lines = call(handler_for(settings)).split(LINES)
        self.assertEqual(lines[1], "small_model: unset m/x")
        self.assertEqual(lines[3], "large_model: unset")

    def test_the_report_shows_a_model_as_configured_and_runs_no_check(self):
        calls = []
        settings = good_settings(middle_model={"provider": "openrouter", "model": "middle-model"})
        handler = handler_for(settings, list_models=lambda provider: calls.append(provider) or [])
        self.assertEqual(
            call(handler).split(LINES)[1:4],
            [
                "small_model: openrouter small-model",
                "middle_model: openrouter middle-model",
                "large_model: openrouter large-model",
            ],
        )
        self.assertEqual(calls, [])

    def test_a_blank_spaces_or_missing_model_is_unset_in_every_slot(self):
        for index, slot in enumerate(("small", "middle", "large"), start=1):
            for value in ({"provider": "openrouter", "model": ""}, {"model": "   "}, None):
                with self.subTest(slot=slot, value=value):
                    settings = good_settings(**{f"{slot}_model": value})
                    lines = call(handler_for(settings)).split(LINES)
                    self.assertEqual(lines[index], f"{slot}_model: unset")

    def test_extra_keywords_from_hermes_are_accepted(self):
        self.assertIn("provider", call(handler_for(), task_id="t", parent_agent=None))


class SettingHelpTest(unittest.TestCase):
    def test_each_setting_gives_its_help_text(self):
        handler = handler_for()
        self.assertEqual(
            [name for name in TEXTS["settings"] if name not in TEXTS["help"]], ["models"]
        )
        for setting in TEXTS["help"]:
            with self.subTest(setting):
                self.assertEqual(call(handler, {"setting": setting}), TEXTS["help"][setting])

    def test_an_unknown_setting_gives_the_bad_call_text(self):
        handler = handler_for()
        for setting in ("scope", "bogus", "", None, 3, ["provider"], "Provider"):
            with self.subTest(setting):
                self.assertEqual(call(handler, {"setting": setting}), TEXTS["badCall"])



UNAVAILABLE = TEXTS["modelsUnavailable"]
MODELS = {"setting": "models"}


class ModelsSettingTest(unittest.TestCase):
    """The models setting: Python gathers Hermes's offline data, Node words it, Python prints it."""

    def setUp(self):
        self._dir = temp_dir()
        self.dir = Path(self._dir.name)
        self.addCleanup(self._dir.cleanup)

    def handler(self, api, reply=None, constants=None, **stub):
        self.stub = make_node_stub(self.dir, reply={"text": "worded"} if reply is None else reply, **stub)
        ctx = FakeCtx(good_settings())
        submodule("config_tool").register_tool(
            ctx, api=api, constants=constants, script=self.stub.script
        )
        return ctx.tools[0]["handler"]

    def sent(self):
        return json.loads(self.stub.captured()["stdin"])

    def listed(self, api):
        call(self.handler(api), MODELS)
        return self.sent()["listed"]

    def test_the_fixture_request_goes_to_node_and_its_text_comes_back(self):
        handler = self.handler(hermes_of(MODELS_FIXTURE), reply=MODELS_FIXTURE["response"])
        self.assertEqual(call(handler, MODELS), MODELS_FIXTURE["response"]["text"])
        self.assertEqual(self.sent(), MODELS_FIXTURE["request"])

    def test_a_price_goes_only_with_cost_data_and_a_context_only_when_known(self):
        infos = {
            "priced": FakeModelInfo(1.0, 5.0, 200000),
            "output-priced": FakeModelInfo(0.0, 2.0, 0),
            "free": FakeModelInfo(0.0, 0.0, 200000),
            "nothing": FakeModelInfo(),
            "unknown": None,
        }

        def broken(provider, model):
            if model == "broken":
                raise RuntimeError("catalogue unreadable")
            return infos[model]

        api = fake_api(
            list_providers=lambda: [{"id": "openrouter", "authenticated": True}],
            list_models=lambda provider: [*infos, "broken"],
            model_info=broken,
        )
        self.assertEqual(
            self.listed(api),
            [
                {"provider": "openrouter", "model": "priced", "input": 1.0, "output": 5.0, "context": 200000},
                {"provider": "openrouter", "model": "output-priced", "input": 0.0, "output": 2.0},
                {"provider": "openrouter", "model": "free", "context": 200000},
                {"provider": "openrouter", "model": "nothing"},
                {"provider": "openrouter", "model": "unknown"},
                {"provider": "openrouter", "model": "broken"},
            ],
        )

    def test_every_provider_hermes_marks_authenticated_is_listed(self):
        providers = [
            {"id": "openrouter", "authenticated": True},
            {"id": "gemini", "authenticated": False},
            {"id": "deepseek"},
            {"id": "nous", "authenticated": True},
            {"id": "broken", "authenticated": True},
            {"id": "xai", "authenticated": True},
            {"id": 3, "authenticated": True},
            {"authenticated": True},
            "openrouter",
            None,
        ]

        def list_models(provider):
            if provider == "broken":
                raise RuntimeError("cache unreadable")
            return [f"{provider}-model"]

        api = fake_api(list_providers=lambda: providers, list_models=list_models)
        self.assertEqual(
            self.listed(api),
            [
                {"provider": "openrouter", "model": "openrouter-model"},
                {"provider": "nous", "model": "nous-model"},
                {"provider": "xai", "model": "xai-model"},
            ],
        )

    def test_the_list_runs_no_credential_rule_and_reads_no_secret(self):
        # A listed model may read unresolved in a slot; the list shows what Hermes gives.
        def refused(*args):
            raise AssertionError("the list asked for a credential")

        api = fake_api(
            list_providers=lambda: [
                {"id": "anthropic", "authenticated": True},
                {"id": "qwen-oauth", "authenticated": True},
            ],
            get_secret=refused,
            auth_type=refused,
            is_refreshable=refused,
            resolve_runtime=refused,
            list_models=lambda provider: [f"{provider}-model"],
        )
        self.assertEqual(
            self.listed(api),
            [
                {"provider": "anthropic", "model": "anthropic-model"},
                {"provider": "qwen-oauth", "model": "qwen-oauth-model"},
            ],
        )

    def test_a_model_id_that_is_not_text_is_left_out(self):
        api = fake_api(
            list_providers=lambda: [{"id": "openrouter", "authenticated": True}],
            list_models=lambda provider: ["kept", None, 3, ["x"]],
        )
        self.assertEqual(self.listed(api), [{"provider": "openrouter", "model": "kept"}])

    def test_no_usable_provider_still_asks_node(self):
        self.assertEqual(self.listed(fake_api()), [])

    def test_without_node_it_prints_node_not_found_and_gathers_nothing(self):
        gathered = []
        api = fake_api(find_node=lambda: None, list_providers=lambda: gathered.append(1) or [])
        handler = self.handler(api)
        self.assertEqual(call(handler, MODELS), UNAVAILABLE["nodeNotFound"])
        self.assertEqual(UNAVAILABLE["nodeNotFound"], "models unavailable: node not found")
        self.assertEqual(gathered, [])
        self.assertFalse(self.stub.capture.exists())

    def test_a_failing_node_prints_failed(self):
        for stub in ({"exit_code": 1}, {"raw": "not json\n"}, {"reply": {"outcome": "skip", "line": "x"}}):
            with self.subTest(stub):
                handler = self.handler(hermes_of(MODELS_FIXTURE), **stub)
                self.assertEqual(call(handler, MODELS), UNAVAILABLE["failed"])
        self.assertEqual(UNAVAILABLE["failed"], "models unavailable: failed")

    def test_a_node_that_outlasts_the_limit_prints_timeout(self):
        constants = short_constants(routing_ms=100, grace_ms=100)
        handler = self.handler(hermes_of(MODELS_FIXTURE), constants=constants, sleep=30)
        self.assertEqual(call(handler, MODELS), UNAVAILABLE["timeout"])
        self.assertEqual(UNAVAILABLE["timeout"], "models unavailable: timeout")

    def test_a_hermes_list_that_raises_prints_its_error_and_starts_no_node(self):
        def boom():
            raise RuntimeError("provider list unreadable")

        handler = self.handler(fake_api(list_providers=boom))
        self.assertEqual(call(handler, MODELS), "models unavailable: provider list unreadable")
        self.assertFalse(self.stub.capture.exists())

    def test_the_plugins_own_code_opens_no_socket(self):
        # With a fake Hermes every socket call below is the plugin's; Node runs in a child process.
        attempts = []

        def blocked(*args, **kwargs):
            attempts.append(args)
            raise OSError("sockets blocked")

        handler = self.handler(hermes_of(MODELS_FIXTURE), reply=MODELS_FIXTURE["response"])
        with (
            mock.patch.object(socket.socket, "connect", blocked),
            mock.patch.object(socket.socket, "connect_ex", blocked),
            mock.patch.object(socket, "create_connection", blocked),
        ):
            self.assertEqual(call(handler, MODELS), MODELS_FIXTURE["response"]["text"])
        self.assertEqual(attempts, [])

class NoKeyLeakTest(unittest.TestCase):
    @staticmethod
    def outputs(secrets):
        handler = handler_for(good_settings(provider="auto"), secrets)
        return [handler({})] + [handler({"setting": s}) for s in (*TEXTS["settings"], "x")]

    def test_no_output_holds_a_key(self):
        for raw in self.outputs(SECRETS):
            for secret in SECRETS.values():
                self.assertNotIn(secret, raw)

    def test_no_output_changes_with_a_key_length(self):
        baseline = self.outputs(SECRETS)
        for name, secret in SECRETS.items():
            with self.subTest(name):
                self.assertEqual(self.outputs({**SECRETS, name: secret + "x" * 17}), baseline)

    def test_a_failure_message_holds_no_key(self):
        def boom(name):
            raise RuntimeError("lookup failed")

        text = call(handler_for(get_secret=boom))
        self.assertEqual(text, TEXTS["errorPrefix"] + "lookup failed")


class FailureTest(unittest.TestCase):
    def test_a_failing_read_gives_an_error_text(self):
        ctx = UnreadableCtx()
        submodule("config_tool").register_tool(ctx, api=fake_api())
        self.assertEqual(
            call(ctx.tools[0]["handler"]), TEXTS["errorPrefix"] + "config unreadable"
        )

    def test_help_still_answers_when_the_settings_cannot_be_read(self):
        ctx = UnreadableCtx()
        submodule("config_tool").register_tool(ctx, api=fake_api())
        handler = ctx.tools[0]["handler"]
        self.assertEqual(call(handler, {"setting": "provider"}), TEXTS["help"]["provider"])


class RegistrationTest(unittest.TestCase):
    def registered(self):
        ctx = FakeCtx(good_settings())
        submodule("config_tool").register_tool(ctx, api=fake_api())
        self.assertEqual(len(ctx.tools), 1)
        return ctx.tools[0]

    def test_name_toolset_and_label(self):
        tool = self.registered()
        self.assertEqual(tool["name"], TEXTS["toolName"])
        self.assertEqual(tool["toolset"], TEXTS["toolset"])
        self.assertEqual(tool["description"], TEXTS["toolLabel"])
        self.assertFalse(tool.get("is_async", False))

    def test_the_schema_describes_one_optional_setting(self):
        schema = self.registered()["schema"]
        self.assertEqual(schema["name"], TEXTS["toolName"])
        self.assertEqual(schema["description"], TEXTS["toolDescription"])
        self.assertEqual(
            schema["parameters"],
            {
                "type": "object",
                "properties": {"setting": {"type": "string", "enum": TEXTS["settings"]}},
                "additionalProperties": False,
            },
        )

    def test_the_tool_is_the_one_the_manifest_provides(self):
        manifest = json.loads((submodule("constants").PLUGIN_DIR / "plugin.yaml").read_text())
        self.assertEqual(manifest["provides_tools"], [self.registered()["name"]])


if __name__ == "__main__":
    unittest.main()
