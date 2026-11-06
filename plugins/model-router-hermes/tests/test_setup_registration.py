import unittest

from support import CONSTANTS, PLUGIN_DIR, FakeCtx, good_settings, load_plugin

SKILLS_DIR = PLUGIN_DIR / "skills"
TEXTS = CONSTANTS["texts"]


def register(**fail):
    ctx = FakeCtx(good_settings(), {k: RuntimeError(f"no {k}") for k in fail})
    plugin = load_plugin()
    return ctx, plugin


class OrderTest(unittest.TestCase):
    def test_setup_registers_after_the_provider(self):
        ctx, plugin = register()
        plugin.register(ctx)
        self.assertEqual(ctx.order, ["provider", "tool", "command", "skill"])

    def test_the_tool_and_command_carry_the_texts_from_constants(self):
        ctx, plugin = register()
        plugin.register(ctx)
        self.assertEqual(ctx.tools[0]["name"], TEXTS["toolName"])
        self.assertEqual(ctx.commands[0]["name"], TEXTS["commandName"])


class IsolationTest(unittest.TestCase):
    def assertOneWarningAndRest(self, failed):
        ctx, plugin = register(**{failed: True})
        with self.assertLogs(level="WARNING") as logs:
            plugin.register(ctx)
        self.assertEqual(len(logs.records), 1)
        self.assertIn(f"no {failed}", logs.records[0].getMessage())
        self.assertEqual(
            ctx.order, [name for name in ("provider", "tool", "command", "skill") if name != failed]
        )

    def test_a_failing_tool_registration_stops_nothing_else(self):
        self.assertOneWarningAndRest("tool")

    def test_a_failing_command_registration_stops_nothing_else(self):
        self.assertOneWarningAndRest("command")

    def test_a_failing_skill_registration_stops_nothing_else(self):
        self.assertOneWarningAndRest("skill")

    def test_all_three_failing_leave_the_provider_and_log_three_warnings(self):
        ctx, plugin = register(tool=True, command=True, skill=True)
        with self.assertLogs(level="WARNING") as logs:
            plugin.register(ctx)
        self.assertEqual(len(logs.records), 3)
        self.assertEqual(ctx.order, ["provider"])

    def test_an_old_core_registers_no_setup_surface(self):
        import sys
        from unittest import mock

        ctx = FakeCtx(good_settings())
        with mock.patch.dict(sys.modules, {"agent.delegation_provider": None}):
            plugin = load_plugin()
            with self.assertLogs(level="WARNING"):
                plugin.register(ctx)
        self.assertEqual(ctx.order, [])


class SkillTest(unittest.TestCase):
    def test_each_skill_folder_registers_under_its_folder_name(self):
        folders = sorted(path for path in SKILLS_DIR.iterdir() if path.is_dir())
        self.assertEqual([f.name for f in folders], ["model-router-setup"])
        ctx, plugin = register()
        plugin.register(ctx)
        self.assertEqual(
            ctx.skills, [(folder.name, folder / "SKILL.md") for folder in folders]
        )
        for _, path in ctx.skills:
            self.assertTrue(path.is_file(), path)

    def test_the_skill_front_matter_names_the_folder_and_describes_the_use(self):
        text = (SKILLS_DIR / "model-router-setup" / "SKILL.md").read_text(encoding="utf-8")
        self.assertTrue(text.startswith("---\n"))
        front = text.split("---\n")[1]
        self.assertIn("name: model-router-setup\n", front)
        self.assertIn("description:", front)

    def test_the_skill_names_the_tool_and_the_command_the_plugin_registers(self):
        text = (SKILLS_DIR / "model-router-setup" / "SKILL.md").read_text(encoding="utf-8")
        self.assertIn(f"`{TEXTS['toolName']}`", text)
        self.assertIn(f"/{TEXTS['commandName']} <value>", text)
        self.assertIn("/delegation model-router --now", text)
        self.assertIn("delegation.backend", text)

    def test_the_skill_holds_no_key_shaped_text(self):
        text = (SKILLS_DIR / "model-router-setup" / "SKILL.md").read_text(encoding="utf-8")
        self.assertNotRegex(text, r"\bsk-[A-Za-z0-9_-]{8,}")
        self.assertNotIn("/Users/", text)


if __name__ == "__main__":
    unittest.main()
