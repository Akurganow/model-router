"""The read-only config tool: the provider, the three models and which keys are set.

It changes nothing and returns presence only, never a key or its length."""

import json

from . import checks
from .constants import CONSTANTS
from .hermes_api import live_api
from .settings import found_keys, read_provider, read_slot


def _slot_line(texts, api, name, slot):
    if not slot.has_model:
        return texts["modelUnset"].format(name=name)
    template = texts["modelLine" if checks.slot_resolves(slot, api) else "modelUnresolved"]
    return template.format(name=name, provider=slot.provider or texts["unset"], model=slot.model)


def _read_all(ctx, api, constants):
    texts = constants["texts"]
    settings = [spec["setting"] for spec in constants["slots"].values()]
    provider = read_provider(ctx, constants)
    keys = found_keys(api, constants, provider)
    lines = [texts["providerLines"][provider]]
    lines += [_slot_line(texts, api, name, read_slot(ctx, name)) for name in settings]
    lines += [
        texts["keyLines"][name]["set" if name in keys else "unset"]
        for name in constants["providers"]["order"][provider]
    ]
    return texts["lineBreak"].join(lines)


def _answer(ctx, api, constants, args):
    """The full read when the input names no setting, else how to change that setting."""
    texts = constants["texts"]
    if not isinstance(args, dict) or "setting" not in args:
        return _read_all(ctx, api, constants)
    setting = args["setting"]
    if not isinstance(setting, str):
        return texts["badCall"]
    return texts["help"].get(setting, texts["badCall"])


def _handler(ctx, api, constants):
    def handle(args, **_context):
        try:
            text = _answer(ctx, api, constants, args)
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
            "parameters": {
                "type": "object",
                "properties": {"setting": {"type": "string", "enum": texts["settings"]}},
                "additionalProperties": False,
            },
        },
        handler=_handler(ctx, api if api is not None else live_api(), constants),
        description=texts["toolLabel"],
    )
