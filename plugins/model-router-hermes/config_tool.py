"""The read-only config tool: the settings, the three models and which keys are set.

It changes nothing and returns presence only, never a key or its length."""

import json

from . import node
from .constants import CONSTANTS, MS_PER_SECOND, SCRIPT
from .hermes_api import live_api
from .settings import choice, found_keys, models_request, read_slot, read_texts, setting_lines


def _slot_line(texts, name, slot):
    if not slot.has_model:
        return texts["modelUnset"].format(name=name)
    return texts["modelLine"].format(
        name=name, provider=slot.provider or texts["unset"], model=slot.model
    )


def _models(ctx, api, constants, script):
    """Node's lines and verdict for the stored models value, which Python does not read; None when Node cannot answer."""
    node_path = api.find_node()
    if not node_path:
        return None
    try:
        return node.run_models(
            [node_path, script],
            models_request(ctx, constants),
            constants["routingLimitMs"] / MS_PER_SECOND,
        )
    except (node.NodeTimeout, node.NodeFailed):
        return None


def _read_all(ctx, api, constants, script):
    texts = constants["texts"]
    settings = [spec["setting"] for spec in constants["slots"].values()]
    stored = read_texts(ctx, constants)
    leaf = choice(constants, stored)
    lines = setting_lines(constants, stored)
    models = _models(ctx, api, constants, script)
    lines += [texts["modelsUnavailable"]] if models is None else models.lines
    lines += [_slot_line(texts, name, read_slot(ctx, name)) for name in settings]
    # While a setting or the models value is not valid, no key is looked up or listed.
    # With no answer from Node the verdict is unknown, and the keys are listed.
    holders = leaf["holders"] if leaf is not None and (models is None or models.valid) else []
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
