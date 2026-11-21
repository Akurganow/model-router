import unittest

from support import CONSTANTS, FakeCtx, submodule


def stored_texts(settings):
    return submodule("settings").read_texts(FakeCtx(settings), CONSTANTS)


def not_valid(settings):
    spec = submodule("settings").first_not_valid(CONSTANTS, stored_texts(settings))
    return None if spec is None else spec["name"]


class SettingTextTest(unittest.TestCase):
    def test_a_text_outside_the_values_is_not_valid(self):
        for name, texts in (("provider", ("auto", "openrouter")), ("gateway", ("fast", " direct "))):
            for text in texts:
                with self.subTest(name=name, text=text):
                    self.assertEqual(not_valid({name: text}), name)

    def test_nothing_or_blank_or_not_text_reads_as_the_default(self):
        for name in ("provider", "gateway"):
            for value in (None, "", "   ", 3, ["typesafe"]):
                with self.subTest(name=name, value=value):
                    texts = stored_texts({} if value is None else {name: value})
                    self.assertEqual(
                        submodule("settings").setting_lines(CONSTANTS, texts),
                        ["provider: typesafe", "gateway: direct (typesafe)"],
                    )

    def test_every_listed_value_reads_as_itself(self):
        for value in ("direct", "auto", "openrouter-first", "openrouter"):
            with self.subTest(value):
                self.assertIsNone(not_valid({"gateway": value}))
                self.assertEqual(stored_texts({"gateway": value})["gateway"], value)

    def test_each_setting_is_read_once_and_with_no_default(self):
        seen = []

        class Ctx:
            def get_config(self, key, default=None):
                seen.append((key, default))
                return default

        submodule("settings").read_texts(Ctx(), CONSTANTS)
        self.assertEqual(seen, [("provider", None), ("gateway", None)])


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
