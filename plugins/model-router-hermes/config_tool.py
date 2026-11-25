"""The read-only config tool: the settings, the three models and which keys are set.

It changes nothing and returns presence only, never a key or its length."""

import json

from . import node
from .constants import CONSTANTS, MS_PER_SECOND, SCRIPT
from .hermes_api import live_api
from .settings import choice, found_keys, read_models, read_slot, read_texts, setting_lines


def _slot_line(texts, name, slot):
    if not slot.has_model:
        return texts["modelUnset"].format(name=name)
    return texts["modelLine"].format(
        name=name, provider=slot.provider or texts["unset"], model=slot.model
    )


def _models_lines(ctx, api, constants, script):
    """Node's lines for the stored models value, which Python does not read; one line when Node cannot answer."""
    texts = constants["texts"]
    node_path = api.find_node()
    if not node_path:
        return [texts["modelsUnavailable"]]
    request = {
        "command": texts["modelsCommand"],
        constants["modelsSetting"]: read_models(ctx, constants),
    }
    try:
        return node.run_lines(
            [node_path, script], request, constants["routingLimitMs"] / MS_PER_SECOND
        )
    except (node.NodeTimeout, node.NodeFailed):
        return [texts["modelsUnavailable"]]


def _read_all(ctx, api, constants, script):
    texts = constants["texts"]
    settings = [spec["setting"] for spec in constants["slots"].values()]
    stored = read_texts(ctx, constants)
    leaf = choice(constants, stored)
    lines = setting_lines(constants, stored)
    lines += _models_lines(ctx, api, constants, script)
    lines += [_slot_line(texts, name, read_slot(ctx, name)) for name in settings]
    # While a setting is not valid, no holder is known, so no key is looked up or listed.
    holders = leaf["holders"] if leaf is not None else []
    keys = found_keys(api, constants, holders)
    lines += [texts["keyLines"][name]["set" if name in keys else "unset"] for name in holders]
    return texts["lineBreak"].join(lines)


def _handler(ctx, api, constants, script):
    def handle(_args, **_context):
        try:
            text = _read_all(ctx, api, constants, script)
        except Exception as error:
            text = constants["texts"]["errorPrefix"] + str(error)
        return json.dumps({"text": text})

    return handle


def register_tool(ctx, api=None, constants=None, script=None):
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
        handler=_handler(
            ctx,
            api if api is not None else live_api(),
            constants,
            script if script is not None else SCRIPT,
        ),
        description=texts["toolLabel"],
    )
