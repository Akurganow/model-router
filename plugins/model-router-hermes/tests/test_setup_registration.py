import unittest

from support import CONSTANTS, PLUGIN_DIR, FakeCtx, good_settings, load_plugin

SKILLS_DIR = PLUGIN_DIR / "skills"
TEXTS = CONSTANTS["texts"]
SKILL_COUNT = sum(1 for path in SKILLS_DIR.iterdir() if path.is_dir())
# Each skill folder registers once, so a failing registrar stops at its first skill.
COMMANDS = [spec["command"]["name"] for spec in CONSTANTS["settings"]]
STEPS = ["provider", "tool", *["command"] * len(COMMANDS), *["skill"] * SKILL_COUNT]


def register(**fail):
    ctx = FakeCtx(good_settings(), {k: RuntimeError(f"no {k}") for k in fail})
    plugin = load_plugin()
    return ctx, plugin


class OrderTest(unittest.TestCase):
    def test_setup_registers_after_the_provider(self):
        ctx, plugin = register()
        plugin.register(ctx)
        self.assertEqual(ctx.order, STEPS)

    def test_the_tool_and_command_carry_the_texts_from_constants(self):
        ctx, plugin = register()
        plugin.register(ctx)
        self.assertEqual(ctx.tools[0]["name"], TEXTS["toolName"])
        self.assertEqual([entry["name"] for entry in ctx.commands], COMMANDS)


class IsolationTest(unittest.TestCase):
    def assertOneWarningAndRest(self, failed, rest):
        ctx, plugin = register(**{failed: True})
        with self.assertLogs(level="WARNING") as logs:
            plugin.register(ctx)
        self.assertEqual(len(logs.records), 1)
        self.assertIn(f"no {failed}", logs.records[0].getMessage())
        self.assertEqual(ctx.order, rest)

    def test_a_failing_tool_registration_stops_nothing_else(self):
        self.assertOneWarningAndRest("tool", [n for n in STEPS if n != "tool"])

    def test_a_failing_command_registration_stops_nothing_else(self):
        for name in COMMANDS:
            with self.subTest(name):
                self.assertOneWarningAndRest(
                    name, ["provider", "tool", "command", *["skill"] * SKILL_COUNT]
                )

    def test_a_failing_skill_registration_stops_nothing_else(self):
        self.assertOneWarningAndRest("skill", [n for n in STEPS if n != "skill"])

    def test_every_registration_failing_leaves_the_provider_and_logs_one_warning_each(self):
        ctx, plugin = register(**{name: True for name in ("tool", "skill", *COMMANDS)})
        with self.assertLogs(level="WARNING") as logs:
            plugin.register(ctx)
        self.assertEqual(len(logs.records), 4)
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
        self.assertEqual([f.name for f in folders], ["model-router", "model-router-setup"])
        ctx, plugin = register()
        plugin.register(ctx)
        self.assertEqual(
            ctx.skills, [(folder.name, folder / "SKILL.md") for folder in folders]
        )
        for _, path in ctx.skills:
            self.assertTrue(path.is_file(), path)

    def test_the_skill_front_matter_names_the_folder_and_describes_the_use(self):
        for folder in ("model-router", "model-router-setup"):
            with self.subTest(folder):
                text = (SKILLS_DIR / folder / "SKILL.md").read_text(encoding="utf-8")
                self.assertTrue(text.startswith("---\n"))
                front = text.split("---\n")[1]
                self.assertIn(f"name: {folder}\n", front)
                self.assertIn("description:", front)

    def test_the_skill_names_the_tool_and_the_command_the_plugin_registers(self):
        text = (SKILLS_DIR / "model-router-setup" / "SKILL.md").read_text(encoding="utf-8")
        self.assertIn(f"`{TEXTS['toolName']}`", text)
        self.assertIn(f"/{COMMANDS[0]} <value>", text)
        self.assertIn("delegation.backend", text)

    def test_the_skill_holds_no_key_shaped_text(self):
        for folder in ("model-router", "model-router-setup"):
            with self.subTest(folder):
                text = (SKILLS_DIR / folder / "SKILL.md").read_text(encoding="utf-8")
                self.assertNotRegex(text, r"\bsk-[A-Za-z0-9_-]{8,}")
                self.assertNotIn("/Users/", text)

    def test_the_escalation_skill_names_the_parameters_and_the_ladder(self):
        text = (SKILLS_DIR / "model-router" / "SKILL.md").read_text(encoding="utf-8")
        for name in CONSTANTS["taskParameters"]:
            self.assertIn(f"`{name}`", text)
        for effort in CONSTANTS["efforts"]:
            self.assertIn(f"`{effort}`", text)
        self.assertIn("/delegation default", text)
        self.assertIn("model-router-hermes:model-router-setup", text)


if __name__ == "__main__":
    unittest.main()
