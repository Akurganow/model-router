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

    def test_the_models_value_is_read_once_with_no_default_and_left_as_stored(self):
        seen = []

        class Ctx:
            def get_config(self, key, default=None):
                seen.append((key, default))
                return stored

        for stored in ({"typesafe": "jev-preview"}, "{typesafe:jev-preview}", "  ", 7, None):
            with self.subTest(stored):
                seen.clear()
                self.assertIs(submodule("settings").read_models(Ctx(), CONSTANTS), stored)
                self.assertEqual(seen, [("models", None)])

    def test_a_byte_order_mark_alone_reads_as_the_default(self):
        texts = stored_texts({"gateway": "\ufeff"})
        self.assertEqual(
            submodule("settings").setting_lines(CONSTANTS, texts),
            ["provider: typesafe", "gateway: direct (typesafe)"],
        )

    def test_a_file_separator_alone_is_not_valid(self):
        self.assertEqual(not_valid({"gateway": "\x1c"}), "gateway")


def three_settings():
    def spec(name, first, second):
        return {
            "name": name,
            "default": first,
            "values": [first, second],
            "notValid": name + " bad: {stored}",
            "valueLines": {first: name + "=" + first, second: name + "=" + second},
        }

    leaf = {"holders": ["h"], "lines": ["leaf"]}
    default_leaf = {"holders": [], "lines": ["default leaf"]}
    return {
        "settings": [spec("s1", "x", "y"), spec("s2", "p", "q"), spec("s3", "m", "n")],
        # Only the leaves the rows reach.
        "choices": {"x": {"p": {"m": default_leaf}}, "y": {"q": {"n": leaf}}},
    }


class ThirdSettingTest(unittest.TestCase):
    def read(self, **stored):
        settings = submodule("settings")
        table = three_settings()
        texts = {"s1": None, "s2": None, "s3": None, **stored}
        spec = settings.first_not_valid(table, texts)
        leaf = settings.choice(table, texts)
        return None if spec is None else spec["name"], leaf, settings.setting_lines(table, texts)

    def test_a_valid_triple_reads_its_leaf(self):
        self.assertEqual(
            self.read(s1="y", s2="q", s3="n"),
            (None, {"holders": ["h"], "lines": ["leaf"]}, ["leaf"]),
        )

    def test_a_not_valid_third_setting_speaks_for_itself(self):
        self.assertEqual(
            self.read(s1="y", s2="q", s3="z"),
            ("s3", None, ["s1=y", "s2=q", "s3 bad: z"]),
        )

    def test_blank_texts_read_as_the_defaults(self):
        self.assertEqual(
            self.read(s1="  ", s3=""),
            (None, {"holders": [], "lines": ["default leaf"]}, ["default leaf"]),
        )


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
