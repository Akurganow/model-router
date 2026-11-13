import json
import unittest

from support import CONSTANTS, FakeCtx, UnreadableCtx, fake_api, good_settings, submodule

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
        self.assertEqual(lines[1], "small_model: unset m/x (unresolved)")
        self.assertEqual(lines[3], "large_model: unset")

    def test_a_model_hermes_cannot_reach_offline_is_unresolved(self):
        settings = good_settings(middle_model={"provider": "openrouter", "model": "middle-model"})
        lines = call(handler_for(settings, list_models=lambda provider: ["small-model"]))
        self.assertEqual(
            lines.split(LINES)[1:4],
            [
                "small_model: openrouter small-model",
                "middle_model: openrouter middle-model (unresolved)",
                "large_model: openrouter large-model (unresolved)",
            ],
        )

    def test_a_blank_spaces_or_missing_middle_model_is_unset(self):
        for value in ({"provider": "openrouter", "model": ""}, {"model": "   "}, None):
            with self.subTest(value):
                lines = call(handler_for(good_settings(middle_model=value))).split(LINES)
                self.assertEqual(lines[2], "middle_model: unset")

    def test_extra_keywords_from_hermes_are_accepted(self):
        self.assertIn("provider", call(handler_for(), task_id="t", parent_agent=None))


class SettingHelpTest(unittest.TestCase):
    def test_each_setting_gives_its_help_text(self):
        handler = handler_for()
        for setting in TEXTS["settings"]:
            with self.subTest(setting):
                self.assertEqual(call(handler, {"setting": setting}), TEXTS["help"][setting])

    def test_an_unknown_setting_gives_the_bad_call_text(self):
        handler = handler_for()
        for setting in ("scope", "bogus", "", None, 3, ["provider"], "Provider"):
            with self.subTest(setting):
                self.assertEqual(call(handler, {"setting": setting}), TEXTS["badCall"])


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
