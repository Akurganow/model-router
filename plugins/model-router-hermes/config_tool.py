"""The read-only config tool: the settings, the three models and which keys are set.

It changes nothing and returns presence only, never a key or its length."""

import json

from .constants import CONSTANTS
from .hermes_api import live_api
from .settings import choice, found_keys, read_slot, read_texts, setting_lines


def _slot_line(texts, name, slot):
    if not slot.has_model:
        return texts["modelUnset"].format(name=name)
    return texts["modelLine"].format(
        name=name, provider=slot.provider or texts["unset"], model=slot.model
    )


def _read_all(ctx, api, constants):
    texts = constants["texts"]
    settings = [spec["setting"] for spec in constants["slots"].values()]
    stored = read_texts(ctx, constants)
    leaf = choice(constants, stored)
    lines = setting_lines(constants, stored)
    lines += [_slot_line(texts, name, read_slot(ctx, name)) for name in settings]
    # While a setting is not valid, no holder is known, so no key is looked up or listed.
    holders = leaf["holders"] if leaf is not None else []
    keys = found_keys(api, constants, holders)
    lines += [texts["keyLines"][name]["set" if name in keys else "unset"] for name in holders]
    return texts["lineBreak"].join(lines)


def _handler(ctx, api, constants):
    def handle(_args, **_context):
        try:
            text = _read_all(ctx, api, constants)
        except Exception as error:
            text = constants["texts"]["errorPrefix"] + str(error)
        return json.dumps({"text": text})

    return handle


def register_tool(ctx, api=None, constants=None):
    constants = constants if constants is not None else CONSTANTS
    texts = constants["texts"]
    ctx.register_tool(
        name=texts["toolName"],
        toolset=texts["toolset"],
        schema={
            "name": texts["toolName"],
            "description": texts["toolDescription"],
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
        handler=_handler(ctx, api if api is not None else live_api(), constants),
        description=texts["toolLabel"],
    )
