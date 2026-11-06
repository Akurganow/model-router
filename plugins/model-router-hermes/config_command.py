"""The provider command: it reads from any session and writes only from a local one."""

from .constants import CONSTANTS
from .settings import read_provider


def _run(ctx, constants, raw_args, platform):
    texts = constants["texts"]
    value = (raw_args or "").strip()
    current = read_provider(ctx, constants)
    if value == "":
        return texts["providerLines"][current]
    if value not in constants["providers"]["values"]:
        return texts["useOneOf"]
    if platform not in texts["localPlatforms"]:
        return texts["lineBreak"].join([texts["refused"], texts["providerLines"][current]])
    if value == current:
        return texts["already"][value]
    try:
        ctx.set_config("provider", value)
    except Exception as error:
        return texts["unchangedPrefix"] + str(error)
    return texts["providerLines"][value]


def _handler(ctx, constants):
    def handle(raw_args, platform=None, **_context):
        try:
            return _run(ctx, constants, raw_args, platform)
        except Exception as error:
            return constants["texts"]["errorPrefix"] + str(error)

    return handle


def register_command(ctx, constants=None):
    constants = constants if constants is not None else CONSTANTS
    texts = constants["texts"]
    ctx.register_command(
        texts["commandName"],
        _handler(ctx, constants),
        description=texts["commandDescription"],
        args_hint=texts["argsHint"],
    )
