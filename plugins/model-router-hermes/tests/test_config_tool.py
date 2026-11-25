import json
import shutil
import unittest
from pathlib import Path

from node_stub import make_node_stub
from support import (
    CONSTANTS,
    PLUGIN_DIR,
    FakeCtx,
    UnreadableCtx,
    fake_api,
    good_settings,
    submodule,
    temp_dir,
)

TEXTS = CONSTANTS["texts"]
LINES = TEXTS["lineBreak"]
SECRETS = {
    "TYPESAFE_API_KEY": "typesafe-secret-one",
    "OPENAI_API_KEY": "openai-secret-three",
    "GEMINI_API_KEY": "google-secret-four",
    "PERPLEXITY_API_KEY": "perplexity-secret-five",
    "OPENROUTER_API_KEY": "openrouter-secret-2",
}
# What the Node stand-in answers when a test asks for no lines of its own.
STUB_LINES = ["models: unset"]
_STUBS = temp_dir()
_stub_count = [0]


def stub_node(**kwargs):
    _stub_count[0] += 1
    kwargs.setdefault("reply", {"lines": STUB_LINES, "valid": True})
    return make_node_stub(Path(_STUBS.name), name=f"stub{_stub_count[0]}", **kwargs)


def handler_for(settings=None, secrets=None, stub=None, **api_overrides):
    ctx = FakeCtx(good_settings() if settings is None else settings)
    api = fake_api(secrets={} if secrets is None else secrets, **api_overrides)
    stub = stub or stub_node()
    submodule("config_tool").register_tool(ctx, api=api, script=stub.script)
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
            "models: unset\n"
            "small_model: unset\n"
            "middle_model: unset\n"
            "large_model: unset\n"
            "typesafe key: set",
        )

    def test_a_setting_that_is_not_valid_shows_its_notice_and_lists_no_key(self):
        looked_up = []
        models = "\nmodels: unset\nsmall_model: unset\nmiddle_model: unset\nlarge_model: unset"
        gateways = "direct, auto, openrouter-first, openrouter"
        for stored, expected in (
            ({"provider": "auto"}, "provider: auto (not valid: use one of typesafe, openai, google, perplexity)\ngateway: direct"),
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
                    "models: unset",
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
                    lines[6:], [TEXTS["keyLines"][name]["set"] for name in names]
                )

    def test_a_blank_key_is_unset(self):
        text = call(handler_for(secrets={"TYPESAFE_API_KEY": "   "}))
        self.assertIn(TEXTS["keyLines"]["typesafe"]["unset"], text)

    def test_any_input_gives_the_full_read(self):
        handler = handler_for()
        expected = call(handler)
        for args in ({}, None, [], "provider", 3, {"setting": "provider"}, {"setting": "bogus"}):
            with self.subTest(args):
                self.assertEqual(text_of(handler(args)), expected)

    def test_an_incomplete_model_slot_shows_the_missing_part_as_unset(self):
        settings = good_settings(small_model={"model": "m/x"}, large_model={"provider": "p"})
        lines = call(handler_for(settings)).split(LINES)
        self.assertEqual(lines[3], "small_model: unset m/x")
        self.assertEqual(lines[5], "large_model: unset")

    def test_the_report_shows_a_model_as_configured(self):
        settings = good_settings(middle_model={"provider": "openrouter", "model": "middle-model"})
        handler = handler_for(settings)
        self.assertEqual(
            call(handler).split(LINES)[3:6],
            [
                "small_model: openrouter small-model",
                "middle_model: openrouter middle-model",
                "large_model: openrouter large-model",
            ],
        )

    def test_a_blank_spaces_or_missing_model_is_unset_in_every_slot(self):
        for index, slot in enumerate(("small", "middle", "large"), start=3):
            for value in ({"provider": "openrouter", "model": ""}, {"model": "   "}, None):
                with self.subTest(slot=slot, value=value):
                    settings = good_settings(**{f"{slot}_model": value})
                    lines = call(handler_for(settings)).split(LINES)
                    self.assertEqual(lines[index], f"{slot}_model: unset")

    def test_extra_keywords_from_hermes_are_accepted(self):
        self.assertIn("provider: typesafe", call(handler_for(), task_id="t", parent_agent=None))


class ModelsLinesTest(unittest.TestCase):
    def test_the_lines_node_gives_follow_the_settings_and_come_before_the_slots(self):
        lines = ["models: {typesafe:jev-preview}", "typesafe model: jev-preview (OpenRouter: x)"]
        handler = handler_for(stub=stub_node(reply={"lines": lines, "valid": True}))
        self.assertEqual(
            call(handler).split(LINES)[2:5],
            [*lines, "small_model: openrouter small-model"],
        )

    def test_the_stored_value_goes_to_node_as_read_and_nothing_else_does(self):
        for value in ({"typesafe": "jev-preview"}, "{typesafe:jev-preview}", "{typesafe", "", None):
            with self.subTest(value):
                stub = stub_node()
                call(handler_for(good_settings(models=value), SECRETS, stub=stub))
                self.assertEqual(
                    json.loads(stub.captured()["stdin"]),
                    {"command": TEXTS["modelsCommand"], "models": value},
                )

    def test_the_models_are_read_when_a_setting_is_not_valid_too(self):
        stub = stub_node()
        text = call(handler_for(good_settings(provider="auto"), stub=stub))
        self.assertIn("models: unset", text)
        self.assertTrue(stub.capture.exists())

    def test_a_models_value_that_is_not_valid_lists_no_key(self):
        looked_up = []
        shown = "models: {typesafe:a/b} (not valid: typesafe:a/b)"
        stub = stub_node(reply={"lines": [shown], "valid": False})
        handler = handler_for(good_settings(), SECRETS, stub=stub, get_secret=looked_up.append)
        self.assertEqual(
            call(handler),
            LINES.join(
                [
                    "provider: typesafe",
                    "gateway: direct (typesafe)",
                    shown,
                    "small_model: openrouter small-model",
                    "middle_model: unset",
                    "large_model: openrouter large-model",
                ]
            ),
        )
        self.assertEqual(looked_up, [])

    def test_no_node_or_a_failed_run_gives_the_unavailable_line(self):
        for name, handler in (
            ("no node", handler_for(find_node=lambda: None)),
            ("exit code", handler_for(stub=stub_node(exit_code=1))),
            ("not json", handler_for(stub=stub_node(raw="no\n"))),
            (
                "no lines",
                handler_for(stub=stub_node(reply={"lines": "models: unset", "valid": True})),
            ),
            ("no line text", handler_for(stub=stub_node(reply={"lines": [3], "valid": True}))),
            ("no verdict", handler_for(stub=stub_node(reply={"lines": ["models: unset"]}))),
        ):
            with self.subTest(name):
                lines = call(handler).split(LINES)
                self.assertEqual(lines[2], TEXTS["modelsUnavailable"])
                self.assertEqual(lines[3], "small_model: openrouter small-model")


@unittest.skipUnless(shutil.which("node"), "node is not installed")
class RealBundleTest(unittest.TestCase):
    """The shipped bundle prints the models lines, naming the entry that is not valid."""

    def lines(self, models):
        node_path = shutil.which("node")
        ctx = FakeCtx(good_settings(models=models))
        api = fake_api(secrets={}, find_node=lambda: node_path)
        submodule("config_tool").register_tool(ctx, api=api, script=PLUGIN_DIR / "route.mjs")
        return call(ctx.tools[0]["handler"]).split(LINES)

    def test_a_dict_and_a_text_give_their_model_lines(self):
        for models in ({"typesafe": "jev-preview"}, "{typesafe:jev-preview}"):
            with self.subTest(models):
                lines = self.lines(models)
                self.assertEqual(
                    lines[3], "typesafe model: jev-preview (OpenRouter: jev-preview)"
                )

    def test_a_value_that_is_not_valid_lists_no_key(self):
        self.assertNotIn("key:", "\n".join(self.lines("{typesafe:a/b}")))
        self.assertIn("typesafe key: unset", "\n".join(self.lines("{typesafe:a}")))

    def test_an_entry_that_is_not_valid_is_named(self):
        self.assertEqual(
            self.lines("{typesafe:a/b}")[2],
            "models: {typesafe:a/b} (not valid: typesafe:a/b)",
        )


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
