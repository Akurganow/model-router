"""The plugin's settings, read from the Hermes plugin context.

`ctx.get_config` applies no schema default, so a read passes none: a stored text
stays distinguishable from nothing stored. The tables that say which texts are
valid come from constants.json, and no setting, value or key holder is named here."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Slot:
    """A small, middle or large model: a Hermes provider name and a model id, both trimmed."""

    provider: str
    model: str

    @property
    def has_model(self):
        return bool(self.model)


def stripped(value):
    """The trimmed text of a string; None when the value is not text."""
    return value.strip() if isinstance(value, str) else None


def _text(value):
    return stripped(value) or ""


def read_texts(ctx, constants):
    """Each setting's stored text, by setting name; None when nothing or a non-text value is stored."""
    texts = {}
    for spec in constants["settings"]:
        stored = ctx.get_config(spec["name"], None)
        texts[spec["name"]] = stored if isinstance(stored, str) else None
    return texts


def _value(spec, text):
    """The value a stored text reads as, or None when the text is not valid."""
    if text is None or text.strip() == "":
        return spec["default"]
    return text if text in spec["values"] else None


def first_not_valid(constants, texts):
    """The first setting, in table order, whose stored text is not valid; None when all are."""
    return next(
        (spec for spec in constants["settings"] if _value(spec, texts[spec["name"]]) is None), None
    )


def choice(constants, texts):
    """The `choices` leaf of the stored values; None while a setting is not valid."""
    leaf = constants["choices"]
    for spec in constants["settings"]:
        value = _value(spec, texts[spec["name"]])
        if value is None:
            return None
        leaf = leaf[value]
    return leaf


def setting_lines(constants, texts):
    """One line per setting, in table order. While one is not valid, each setting speaks for itself."""
    leaf = choice(constants, texts)
    if leaf is not None:
        return list(leaf["lines"])
    lines = []
    for spec in constants["settings"]:
        text = texts[spec["name"]]
        value = _value(spec, text)
        lines.append(
            spec["notValid"].format(stored=text) if value is None else spec["valueLines"][value]
        )
    return lines


def read_slot(ctx, key):
    value = ctx.get_config(key, None)
    if not hasattr(value, "get"):
        return Slot("", "")
    return Slot(_text(value.get("provider")), _text(value.get("model")))


def found_keys(api, constants, holders):
    """The keys of the holders, by holder; a blank or non-text secret is absent."""
    found = {}
    for holder in holders:
        value = api.get_secret(constants["keyVariables"][holder])
        if stripped(value):
            found[holder] = value
    return found
