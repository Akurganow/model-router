"""The plugin's settings, read from the Hermes plugin context.

`ctx.get_config` applies no schema default, so every read passes its own."""

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


def read_provider(ctx, constants):
    """The Jev provider value; anything outside the listed values is the default."""
    providers = constants["providers"]
    value = ctx.get_config("provider", providers["default"])
    return (
        value if isinstance(value, str) and value in providers["values"] else providers["default"]
    )


def read_slot(ctx, key):
    value = ctx.get_config(key, None)
    if not hasattr(value, "get"):
        return Slot("", "")
    return Slot(_text(value.get("provider")), _text(value.get("model")))


def found_keys(api, constants, provider):
    """The keys the provider value allows, by provider; a blank or non-text secret is absent."""
    providers = constants["providers"]
    found = {}
    for name in providers["order"][provider]:
        value = api.get_secret(providers["keyVariables"][name])
        if stripped(value):
            found[name] = value
    return found
