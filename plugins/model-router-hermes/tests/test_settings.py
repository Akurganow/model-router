import unittest

from support import CONSTANTS, FakeCtx, submodule


class ProviderSettingTest(unittest.TestCase):
    def read(self, settings):
        return submodule("settings").read_provider(FakeCtx(settings), CONSTANTS)

    def test_every_listed_value_is_kept(self):
        for value in CONSTANTS["providers"]["values"]:
            self.assertEqual(self.read({"provider": value}), value)

    def test_unset_is_the_default(self):
        self.assertEqual(self.read({}), CONSTANTS["providers"]["default"])

    def test_unknown_or_wrong_type_is_the_default(self):
        for value in ("bogus", "", None, 3, ["typesafe"], "TypeSafe"):
            self.assertEqual(
                self.read({"provider": value}), CONSTANTS["providers"]["default"], value
            )

    def test_the_default_is_passed_to_the_context(self):
        seen = []

        class Ctx:
            def get_config(self, key, default=None):
                seen.append((key, default))
                return default

        submodule("settings").read_provider(Ctx(), CONSTANTS)
        self.assertEqual(seen, [("provider", CONSTANTS["providers"]["default"])])


class SlotSettingTest(unittest.TestCase):
    def read(self, value):
        return submodule("settings").read_slot(FakeCtx({"small_model": value}), "small_model")

    def test_mapping_gives_trimmed_provider_and_model(self):
        slot = self.read({"provider": " openrouter ", "model": " m/x "})
        self.assertEqual((slot.provider, slot.model), ("openrouter", "m/x"))

    def test_missing_or_non_text_parts_are_empty(self):
        for value in (None, "m/x", ["m/x"], {}, {"provider": 3, "model": None}):
            slot = self.read(value)
            self.assertEqual((slot.provider, slot.model), ("", ""), value)

    def test_has_model_is_false_for_blank(self):
        self.assertFalse(self.read({"model": "  "}).has_model)
        self.assertTrue(self.read({"model": "m"}).has_model)


if __name__ == "__main__":
    unittest.main()
