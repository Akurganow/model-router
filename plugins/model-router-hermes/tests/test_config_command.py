import unittest

from support import CONSTANTS, REAL_HERMES, FakeCtx, UnreadableCtx, good_settings, submodule

TEXTS = CONSTANTS["texts"]
LOCAL = TEXTS["localPlatforms"]
PROVIDER = "model-router-provider"
GATEWAY = "model-router-gateway"
GATEWAY_LINES = {
    "direct": "gateway: direct (typesafe)",
    "auto": "gateway: auto (typesafe, then openrouter)",
    "openrouter-first": "gateway: openrouter-first (openrouter, then typesafe)",
    "openrouter": "gateway: openrouter (openrouter)",
}
GATEWAY_ALREADY = {
    "direct": "gateway unchanged: already direct",
    "auto": "gateway unchanged: already auto",
    "openrouter-first": "gateway unchanged: already openrouter-first",
    "openrouter": "gateway unchanged: already openrouter",
}
GATEWAY_REFUSED = "gateway unchanged: only a local session can change it"


def command(settings=None, fail=None, name=GATEWAY):
    ctx = FakeCtx(good_settings() if settings is None else settings, fail)
    submodule("config_command").register_command(ctx, 1 if name == GATEWAY else 0)
    return ctx, next(entry["handler"] for entry in ctx.commands if entry["name"] == name)


def other_than(value):
    return next(v for v in GATEWAY_LINES if v != value)


class ReadTest(unittest.TestCase):
    def test_an_empty_argument_gives_the_current_value_line(self):
        for raw in ("", "   ", None):
            with self.subTest(raw):
                ctx, handler = command(good_settings(gateway="auto"))
                self.assertEqual(handler(raw, platform="local"), GATEWAY_LINES["auto"])
                self.assertEqual(ctx.written, [])

    def test_reading_needs_no_local_session(self):
        _, handler = command(good_settings(gateway="openrouter"))
        for platform in (None, "telegram"):
            self.assertEqual(handler("", platform=platform), GATEWAY_LINES["openrouter"])

    def test_nothing_stored_reads_as_the_default(self):
        _, handler = command({})
        self.assertEqual(handler("", platform="local"), GATEWAY_LINES["direct"])

    def test_a_command_prints_its_own_line_while_a_setting_is_not_valid(self):
        _, handler = command(good_settings(provider="auto"), name=PROVIDER)
        self.assertEqual(
            handler("", platform="local"), "provider: auto (not valid: use one of typesafe, openai, google, perplexity)"
        )


class InvalidValueTest(unittest.TestCase):
    def test_a_value_outside_the_list_gives_the_allowed_values(self):
        for raw in ("bogus", "Direct", "auto now", "typesafe", "0"):
            with self.subTest(raw):
                ctx, handler = command()
                self.assertEqual(
                    handler(raw, platform="local"),
                    "gateway: use one of direct, auto, openrouter-first, openrouter",
                )
                self.assertEqual(ctx.written, [])

    def test_validity_is_checked_before_the_session(self):
        _, handler = command()
        self.assertEqual(
            handler("bogus", platform="telegram"),
            "gateway: use one of direct, auto, openrouter-first, openrouter",
        )


class RefusalTest(unittest.TestCase):
    def test_a_session_outside_the_local_set_cannot_write(self):
        for platform in (None, "telegram", "", "discord", "LOCAL", "api_server"):
            with self.subTest(platform):
                ctx, handler = command()
                self.assertEqual(
                    handler("auto", platform=platform),
                    GATEWAY_REFUSED + "\n" + GATEWAY_LINES["direct"],
                )
                self.assertEqual(ctx.written, [])

    def test_a_call_without_a_platform_keyword_cannot_write(self):
        ctx, handler = command()
        self.assertTrue(handler("auto").startswith(GATEWAY_REFUSED))
        self.assertEqual(ctx.written, [])

    def test_the_refusal_comes_before_the_already_set_line(self):
        _, handler = command(good_settings(gateway="auto"))
        self.assertTrue(handler("auto", platform="telegram").startswith(GATEWAY_REFUSED))


class WriteTest(unittest.TestCase):
    def test_every_local_platform_writes_the_gateway(self):
        for platform in LOCAL:
            for value, line in GATEWAY_LINES.items():
                with self.subTest(platform=platform, value=value):
                    ctx, handler = command(good_settings(gateway=other_than(value)))
                    self.assertEqual(handler(f" {value} ", platform=platform), line)
                    self.assertEqual(ctx.written, [("gateway", value)])

    def test_the_stored_value_is_reported_unchanged_and_not_written(self):
        for value, line in GATEWAY_ALREADY.items():
            with self.subTest(value):
                ctx, handler = command(good_settings(gateway=value))
                self.assertEqual(handler(value, platform="local"), line)
                self.assertEqual(ctx.written, [])

    def test_the_default_over_nothing_stored_is_written(self):
        ctx, handler = command({})
        self.assertEqual(handler("direct", platform="cli"), GATEWAY_LINES["direct"])
        self.assertEqual(ctx.written, [("gateway", "direct")])

    def test_a_valid_value_over_a_stored_text_that_is_not_valid_is_written(self):
        for name, setting, stored, value, line in (
            (GATEWAY, "gateway", "fast", "auto", GATEWAY_LINES["auto"]),
            (GATEWAY, "gateway", "   ", "direct", GATEWAY_LINES["direct"]),
            (PROVIDER, "provider", "auto", "typesafe", "provider: typesafe"),
        ):
            with self.subTest(name=name, stored=stored):
                ctx, handler = command(good_settings(**{setting: stored}), name=name)
                self.assertEqual(handler(value, platform="local"), line)
                self.assertEqual(ctx.written, [(setting, value)])

    def test_a_write_error_gives_the_unchanged_prefix_and_the_message(self):
        ctx, handler = command(fail={"set_config": OSError("disk full")})
        self.assertEqual(
            handler("auto", platform="local"), "gateway unchanged: disk full"
        )
        self.assertNotIn("gateway", ctx.settings)

    def test_a_read_error_gives_an_error_text(self):
        ctx = UnreadableCtx()
        submodule("config_command").register_command(ctx, 0)
        handler = ctx.commands[0]["handler"]
        self.assertEqual(
            handler("typesafe", platform="local"), TEXTS["errorPrefix"] + "config unreadable"
        )


class RegistrationTest(unittest.TestCase):
    def test_both_commands_register_with_their_names_descriptions_and_hints(self):
        ctx = FakeCtx(good_settings())
        for index in (0, 1):
            submodule("config_command").register_command(ctx, index)
        provider = "Shows or changes whose model scores subagent calls: typesafe, openai, google, perplexity."
        gateway = "Shows or changes how OpenRouter is used for the provider: "
        self.assertEqual(
            [(e["name"], e["description"], e["args_hint"]) for e in ctx.commands],
            [
                ("model-router-provider", provider, "<typesafe|openai|google|perplexity>"),
                (
                    "model-router-gateway",
                    gateway + "direct, auto, openrouter-first, openrouter.",
                    "<direct|auto|openrouter-first|openrouter>",
                ),
            ],
        )


@unittest.skipUnless(REAL_HERMES, "the real Hermes modules do not import here")
class HermesDispatchTest(unittest.TestCase):
    """The command runs through Hermes's own dispatcher, with the context a session passes."""

    def dispatch(self, platform):
        from hermes_cli.plugin_command_dispatch import invoke_plugin_command

        ctx, handler = command(good_settings(gateway="auto"))
        reply = invoke_plugin_command(
            handler, "openrouter", source=None, session_id="s", session_key="s", platform=platform
        )
        return ctx, reply

    def test_a_cli_session_writes_the_gateway(self):
        ctx, reply = self.dispatch("cli")
        self.assertEqual(reply, GATEWAY_LINES["openrouter"])
        self.assertEqual(ctx.written, [("gateway", "openrouter")])

    def test_a_messaging_platform_is_refused(self):
        ctx, reply = self.dispatch("telegram")
        self.assertTrue(reply.startswith(GATEWAY_REFUSED))
        self.assertEqual(ctx.written, [])


if __name__ == "__main__":
    unittest.main()
