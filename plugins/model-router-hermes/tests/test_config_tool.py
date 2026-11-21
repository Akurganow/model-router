import json
import unittest

from support import CONSTANTS, FakeCtx, UnreadableCtx, fake_api, good_settings, submodule

TEXTS = CONSTANTS["texts"]
LINES = TEXTS["lineBreak"]
SECRETS = {
    "TYPESAFE_API_KEY": "typesafe-secret-one",
    "OPENAI_API_KEY": "openai-secret-three",
    "GEMINI_API_KEY": "google-secret-four",
    "OPENROUTER_API_KEY": "openrouter-secret-2",
}


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
    def test_nothing_stored_gives_the_defaults_the_unset_models_and_the_key_line(self):
        handler = handler_for({}, {"TYPESAFE_API_KEY": "x"})
        self.assertEqual(
            call(handler),
            "provider: typesafe\n"
            "gateway: direct (typesafe)\n"
            "small_model: unset\n"
            "middle_model: unset\n"
            "large_model: unset\n"
            "typesafe key: set",
        )

    def test_a_setting_that_is_not_valid_shows_its_notice_and_lists_no_key(self):
        looked_up = []
        models = "\nsmall_model: unset\nmiddle_model: unset\nlarge_model: unset"
        gateways = "direct, auto, openrouter-first, openrouter"
        for stored, expected in (
            ({"provider": "auto"}, "provider: auto (not valid: use one of typesafe, openai, google)\ngateway: direct"),
            ({"gateway": "fast"}, f"provider: typesafe\ngateway: fast (not valid: use one of {gateways})"),
        ):
            with self.subTest(stored):
                handler = handler_for(stored, get_secret=looked_up.append)
                self.assertEqual(call(handler), expected + models)
        self.assertEqual(looked_up, [])

    def test_no_input_gives_the_settings_the_three_models_and_the_key_lines(self):
        handler = handler_for(
            good_settings(gateway="auto", large_model=None), {"TYPESAFE_API_KEY": "x"}
        )
        self.assertEqual(
            call(handler),
            LINES.join(
                [
                    "provider: typesafe",
                    "gateway: auto (typesafe, then openrouter)",
                    "small_model: openrouter small-model",
                    "middle_model: unset",
                    "large_model: unset",
                    TEXTS["keyLines"]["typesafe"]["set"],
                    TEXTS["keyLines"]["openrouter"]["unset"],
                ]
            ),
        )

    def test_only_the_keys_the_gateway_allows_are_listed(self):
        holders = {
            "direct": ["typesafe"],
            "auto": ["typesafe", "openrouter"],
            "openrouter-first": ["openrouter", "typesafe"],
            "openrouter": ["openrouter"],
        }
        for value, names in holders.items():
            with self.subTest(value):
                lines = call(handler_for(good_settings(gateway=value), SECRETS)).split(LINES)
                self.assertEqual(
                    lines[5:], [TEXTS["keyLines"][name]["set"] for name in names]
                )

    def test_a_blank_key_is_unset(self):
        text = call(handler_for(secrets={"TYPESAFE_API_KEY": "   "}))
        self.assertIn(TEXTS["keyLines"]["typesafe"]["unset"], text)

    def test_a_blank_spaces_or_missing_openai_or_google_key_is_unset(self):
        for provider, variable in (("openai", "OPENAI_API_KEY"), ("google", "GEMINI_API_KEY")):
            for blank in ("", "   ", None):
                with self.subTest(provider=provider, blank=blank):
                    text = call(
                        handler_for(good_settings(provider=provider), {variable: blank})
                    )
                    self.assertIn(TEXTS["keyLines"][provider]["unset"], text)

    def test_any_input_gives_the_full_read(self):
        handler = handler_for()
        expected = call(handler)
        for args in ({}, None, [], "provider", 3, {"setting": "provider"}, {"setting": "bogus"}):
            with self.subTest(args):
                self.assertEqual(text_of(handler(args)), expected)

    def test_an_incomplete_model_slot_shows_the_missing_part_as_unset(self):
        settings = good_settings(small_model={"model": "m/x"}, large_model={"provider": "p"})
        lines = call(handler_for(settings)).split(LINES)
        self.assertEqual(lines[2], "small_model: unset m/x")
        self.assertEqual(lines[4], "large_model: unset")

    def test_the_report_shows_a_model_as_configured(self):
        settings = good_settings(middle_model={"provider": "openrouter", "model": "middle-model"})
        handler = handler_for(settings)
        self.assertEqual(
            call(handler).split(LINES)[2:5],
            [
                "small_model: openrouter small-model",
                "middle_model: openrouter middle-model",
                "large_model: openrouter large-model",
            ],
        )

    def test_a_blank_spaces_or_missing_model_is_unset_in_every_slot(self):
        for index, slot in enumerate(("small", "middle", "large"), start=2):
            for value in ({"provider": "openrouter", "model": ""}, {"model": "   "}, None):
                with self.subTest(slot=slot, value=value):
                    settings = good_settings(**{f"{slot}_model": value})
                    lines = call(handler_for(settings)).split(LINES)
                    self.assertEqual(lines[index], f"{slot}_model: unset")

    def test_extra_keywords_from_hermes_are_accepted(self):
        self.assertIn("provider: typesafe", call(handler_for(), task_id="t", parent_agent=None))


class NoKeyLeakTest(unittest.TestCase):
    @staticmethod
    def outputs(secrets):
        handler = handler_for(good_settings(gateway="auto"), secrets)
        return [handler({})]

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

    def test_the_schema_takes_no_input(self):
        schema = self.registered()["schema"]
        self.assertEqual(schema["name"], TEXTS["toolName"])
        self.assertEqual(schema["description"], TEXTS["toolDescription"])
        self.assertEqual(
            schema["parameters"],
            {"type": "object", "properties": {}, "additionalProperties": False},
        )

    def test_the_tool_is_the_one_the_manifest_provides(self):
        manifest = json.loads((submodule("constants").PLUGIN_DIR / "plugin.yaml").read_text())
        self.assertEqual(manifest["provides_tools"], [self.registered()["name"]])


if __name__ == "__main__":
    unittest.main()
