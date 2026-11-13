"""The config tool: the provider, the three models, which keys are set, and the models the person can run.

It changes nothing and returns presence only, never a key or its length. The models
list reads Hermes's offline data and asks for no provider's key."""

import json

from . import checks, node
from .constants import CONSTANTS, MS_PER_SECOND, PLUGIN_DIR
from .hermes_api import live_api
from .settings import found_keys, read_provider, read_slot

# The op that has Node word the models list.
MODELS_OP = "models"


def _slot_line(texts, name, slot):
    if not slot.has_model:
        return texts["modelUnset"].format(name=name)
    return texts["modelLine"].format(
        name=name, provider=slot.provider or texts["unset"], model=slot.model
    )


def _read_all(ctx, api, constants):
    texts = constants["texts"]
    settings = [spec["setting"] for spec in constants["slots"].values()]
    provider = read_provider(ctx, constants)
    keys = found_keys(api, constants, provider)
    lines = [texts["providerLines"][provider]]
    lines += [_slot_line(texts, name, read_slot(ctx, name)) for name in settings]
    lines += [
        texts["keyLines"][name]["set" if name in keys else "unset"]
        for name in constants["providers"]["order"][provider]
    ]
    return texts["lineBreak"].join(lines)


def _models_of(provider, api):
    """The provider's model ids; none when its credentials need the network, Hermes holds none, or it cannot list them.

    The credential rule runs first, so Hermes is never asked about a provider whose check reaches the network."""
    try:
        if not checks.credentials_stay_offline(provider, api) or not api.has_credentials(provider):
            return []
        return [model for model in api.list_models(provider) or [] if isinstance(model, str)]
    except Exception:
        return []


def _numbers(api, provider, model):
    """The prices and the context Hermes knows offline. Hermes reads a missing price and a missing context as 0."""
    try:
        info = api.model_info(provider, model)
        if info is None:
            return {}
        numbers = {}
        if info.has_cost_data():
            numbers.update(input=info.cost_input, output=info.cost_output)
        if info.context_window > 0:
            numbers["context"] = info.context_window
        return numbers
    except Exception:
        return {}


def listed_models(api):
    """Each model of each provider whose credentials Hermes holds and reads offline."""
    return [
        {"provider": provider, "model": model, **_numbers(api, provider, model)}
        for provider in api.provider_ids()
        if isinstance(provider, str)
        for model in _models_of(provider, api)
    ]


def _models_text(api, constants, script):
    """Node words the list; when it cannot, the line says why."""
    unavailable = constants["texts"]["modelsUnavailable"]
    node_path = api.find_node()
    if not node_path:
        return unavailable["nodeNotFound"]
    try:
        listed = listed_models(api)
    except Exception as error:
        return unavailable["error"].format(error=error)
    timeout_s = (constants["routingLimitMs"] + constants["graceMs"]) / MS_PER_SECOND
    try:
        return node.run_models(
            [node_path, script], {"op": MODELS_OP, "listed": listed}, timeout_s
        )
    except node.NodeTimeout:
        return unavailable["timeout"]
    except node.NodeFailed:
        return unavailable["failed"]


def _answer(ctx, api, constants, script, args):
    """The full read when the input names no setting, the models list for models, else how to change that setting."""
    texts = constants["texts"]
    if not isinstance(args, dict) or "setting" not in args:
        return _read_all(ctx, api, constants)
    setting = args["setting"]
    if not isinstance(setting, str):
        return texts["badCall"]
    if setting == texts["modelsSetting"]:
        return _models_text(api, constants, script)
    return texts["help"].get(setting, texts["badCall"])


def _handler(ctx, api, constants, script):
    def handle(args, **_context):
        try:
            text = _answer(ctx, api, constants, script, args)
        except Exception as error:
            text = constants["texts"]["errorPrefix"] + str(error)
        return json.dumps({"text": text})

    return handle


def register_tool(ctx, api=None, constants=None, script=None):
    constants = constants if constants is not None else CONSTANTS
    texts = constants["texts"]
    script = str(script if script is not None else PLUGIN_DIR / "route.mjs")
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
        handler=_handler(ctx, api if api is not None else live_api(), constants, script),
        description=texts["toolLabel"],
    )
