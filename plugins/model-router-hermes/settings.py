"""The plugin's settings, read from the Hermes plugin context.

`ctx.get_config` applies no schema default, so a read passes none: a stored text
stays distinguishable from nothing stored. The tables that say which texts are
valid come from constants.json, and no setting, value or key holder is named here."""

from dataclasses import dataclass

from .constants import CONSTANTS

# The characters the core reads as blank. str.strip() has its own set, which differs.
BLANK = "".join(map(chr, CONSTANTS["blank"]))


@dataclass(frozen=True)
class Slot:
    """A small, middle or large model: a Hermes provider name and a model id, both trimmed."""

    provider: str
    model: str

    @property
    def has_model(self):
        return bool(self.model)


def trim(text):
    """The text without the blank characters at its ends."""
    return text.strip(BLANK)


def stripped(value):
    """The trimmed text of a string; None when the value is not text."""
    return trim(value) if isinstance(value, str) else None


def _text(value):
    return stripped(value) or ""


def read_texts(ctx, constants):
    """Each setting's stored text, by setting name; None when nothing or a non-text value is stored."""
    stored = {}
    for spec in constants["settings"]:
        value = ctx.get_config(spec["name"], None)
        stored[spec["name"]] = value if isinstance(value, str) else None
    return stored


def read_models(ctx, constants):
    """The stored `models` value as Hermes gives it: a text, a mapping or None. Node reads it."""
    return ctx.get_config(constants["modelsSetting"], None)


def models_request(ctx, constants):
    """The request that asks Node for the lines and the verdict of the stored `models` value."""
    return {
        "command": constants["texts"]["modelsCommand"],
        constants["modelsSetting"]: read_models(ctx, constants),
    }


def _value(spec, text):
    """The value a stored text reads as, or None when the text is not valid."""
    if not stripped(text):
        return spec["default"]
    return text if text in spec["values"] else None


def first_not_valid(constants, stored):
    """The first setting, in table order, whose stored text is not valid; None when all are."""
    return next(
        (spec for spec in constants["settings"] if _value(spec, stored[spec["name"]]) is None), None
    )


def choice(constants, stored):
    """The `choices` leaf of the stored values; None while a setting is not valid."""
    leaf = constants["choices"]
    for spec in constants["settings"]:
        value = _value(spec, stored[spec["name"]])
        if value is None:
            return None
        leaf = leaf[value]
    return leaf


def setting_lines(constants, stored):
    """One line per setting, in table order. While one is not valid, each setting speaks for itself."""
    # The list `settings`, each leaf's `lines` and the command's index agree by position,
    # because the build makes all three from one list.
    leaf = choice(constants, stored)
    if leaf is not None:
        return list(leaf["lines"])
    lines = []
    for spec in constants["settings"]:
        text = stored[spec["name"]]
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
