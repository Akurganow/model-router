import unittest

from support import CONSTANTS, REAL_HERMES, FakeCtx, UnreadableCtx, good_settings, submodule

TEXTS = CONSTANTS["texts"]
LINES = TEXTS["lineBreak"]
VALUES = CONSTANTS["providers"]["values"]
LOCAL = TEXTS["localPlatforms"]


def command(settings=None, fail=None):
    ctx = FakeCtx(good_settings() if settings is None else settings, fail)
    submodule("config_command").register_command(ctx)
    return ctx, ctx.commands[0]["handler"]


def other_than(value):
    return next(v for v in VALUES if v != value)


class ReadTest(unittest.TestCase):
    def test_an_empty_argument_gives_the_current_value_line(self):
        for raw in ("", "   ", None):
            with self.subTest(raw):
                ctx, handler = command(good_settings(provider="auto"))
                self.assertEqual(handler(raw, platform="local"), TEXTS["providerLines"]["auto"])
                self.assertEqual(ctx.written, [])

    def test_reading_needs_no_local_session(self):
        _, handler = command(good_settings(provider="openrouter"))
        for platform in (None, "telegram"):
            self.assertEqual(handler("", platform=platform), TEXTS["providerLines"]["openrouter"])

    def test_an_unset_provider_reads_as_the_default(self):
        _, handler = command({})
        default = CONSTANTS["providers"]["default"]
        self.assertEqual(handler("", platform="local"), TEXTS["providerLines"][default])


class InvalidValueTest(unittest.TestCase):
    def test_a_value_outside_the_list_gives_the_allowed_values(self):
        for raw in ("bogus", "TypeSafe", "auto now", "scope", "0"):
            with self.subTest(raw):
                ctx, handler = command()
                self.assertEqual(handler(raw, platform="local"), TEXTS["useOneOf"])
                self.assertEqual(ctx.written, [])

    def test_validity_is_checked_before_the_session(self):
        _, handler = command()
        self.assertEqual(handler("bogus", platform="telegram"), TEXTS["useOneOf"])


class RefusalTest(unittest.TestCase):
    def test_a_session_outside_the_local_set_cannot_write(self):
        for platform in (None, "telegram", "", "discord", "LOCAL", "api_server"):
            with self.subTest(platform):
                ctx, handler = command(good_settings(provider="typesafe"))
                self.assertEqual(
                    handler("auto", platform=platform),
                    LINES.join([TEXTS["refused"], TEXTS["providerLines"]["typesafe"]]),
                )
                self.assertEqual(ctx.written, [])

    def test_a_call_without_a_platform_keyword_cannot_write(self):
        ctx, handler = command()
        self.assertTrue(handler("auto").startswith(TEXTS["refused"]))
        self.assertEqual(ctx.written, [])

    def test_the_refusal_comes_before_the_already_set_line(self):
        _, handler = command(good_settings(provider="auto"))
        self.assertTrue(handler("auto", platform="telegram").startswith(TEXTS["refused"]))


class WriteTest(unittest.TestCase):
    def test_every_local_platform_writes_the_provider(self):
        for platform in LOCAL:
            for value in VALUES:
                with self.subTest(platform=platform, value=value):
                    ctx, handler = command(good_settings(provider=other_than(value)))
                    self.assertEqual(
                        handler(f" {value} ", platform=platform), TEXTS["providerLines"][value]
                    )
                    self.assertEqual(ctx.written, [("provider", value)])

    def test_the_current_value_is_reported_unchanged_and_not_written(self):
        for value in VALUES:
            with self.subTest(value):
                ctx, handler = command(good_settings(provider=value))
                self.assertEqual(handler(value, platform="local"), TEXTS["already"][value])
                self.assertEqual(ctx.written, [])

    def test_the_default_counts_as_the_current_value_when_unset(self):
        default = CONSTANTS["providers"]["default"]
        ctx, handler = command({})
        self.assertEqual(handler(default, platform="cli"), TEXTS["already"][default])
        self.assertEqual(ctx.written, [])

    def test_a_write_error_gives_the_unchanged_prefix_and_the_message(self):
        ctx, handler = command(fail={"set_config": OSError("disk full")})
        self.assertEqual(
            handler(other_than("typesafe"), platform="local"),
            TEXTS["unchangedPrefix"] + "disk full",
        )
        self.assertEqual(ctx.settings["provider"], "typesafe")

    def test_a_read_error_gives_an_error_text(self):
        ctx = UnreadableCtx()
        submodule("config_command").register_command(ctx)
        handler = ctx.commands[0]["handler"]
        self.assertEqual(
            handler("auto", platform="local"), TEXTS["errorPrefix"] + "config unreadable"
        )


class RegistrationTest(unittest.TestCase):
    def test_name_description_and_hint(self):
        ctx, _ = command()
        entry = ctx.commands[0]
        self.assertEqual(entry["name"], TEXTS["commandName"])
        self.assertEqual(entry["description"], TEXTS["commandDescription"])
        self.assertEqual(entry["args_hint"], TEXTS["argsHint"])



@unittest.skipUnless(REAL_HERMES, "the real Hermes modules do not import here")
class HermesDispatchTest(unittest.TestCase):
    """The command runs through Hermes's own dispatcher, with the context a session passes."""

    def dispatch(self, platform):
        from hermes_cli.plugin_command_dispatch import invoke_plugin_command

        ctx, handler = command(good_settings(provider="auto"))
        reply = invoke_plugin_command(
            handler, "openrouter", source=None, session_id="s", session_key="s", platform=platform
        )
        return ctx, reply

    def test_a_cli_session_writes_the_provider(self):
        ctx, reply = self.dispatch("cli")
        self.assertEqual(reply, TEXTS["providerLines"]["openrouter"])
        self.assertEqual(ctx.written, [("provider", "openrouter")])

    def test_a_messaging_platform_is_refused(self):
        ctx, reply = self.dispatch("telegram")
        self.assertTrue(reply.startswith(TEXTS["refused"]))
        self.assertEqual(ctx.written, [])


if __name__ == "__main__":
    unittest.main()
