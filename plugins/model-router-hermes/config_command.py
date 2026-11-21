"""One command per setting: it reads from any session and writes only from a local one."""

from .constants import CONSTANTS
from .settings import read_texts, setting_lines


def _run(ctx, constants, index, raw_args, platform):
    spec = constants["settings"][index]
    texts = constants["texts"]
    value = (raw_args or "").strip()
    stored = read_texts(ctx, constants)
    line = setting_lines(constants, stored)[index]
    if value == "":
        return line
    if value not in spec["values"]:
        return spec["useOneOf"]
    if platform not in texts["localPlatforms"]:
        return texts["lineBreak"].join([spec["refused"], line])
    # The stored text decides, not the value it reads as: a valid value replaces one that is not.
    if value == stored[spec["name"]]:
        return spec["already"][value]
    try:
        ctx.set_config(spec["name"], value)
    except Exception as error:
        return spec["unchanged"] + str(error)
    return setting_lines(constants, {**stored, spec["name"]: value})[index]


def _handler(ctx, constants, index):
    def handle(raw_args, platform=None, **_context):
        try:
            return _run(ctx, constants, index, raw_args, platform)
        except Exception as error:
            return constants["texts"]["errorPrefix"] + str(error)

    return handle


def register_command(ctx, index, constants=None):
    constants = constants if constants is not None else CONSTANTS
    command = constants["settings"][index]["command"]
    ctx.register_command(
        command["name"],
        _handler(ctx, constants, index),
        description=command["description"],
        args_hint=command["argsHint"],
    )
