"""The task parameters the plugin declares, read from one task.

Hermes checks only a declared enum, and lets True through as 1, so each reader
checks the type too. A value that fails its check reads as absent."""

from .settings import stripped


def _value(task, name):
    try:
        return task.get(name)
    except Exception:
        return None


def description(task):
    """The description text, or empty text when it is missing, blank or not text."""
    value = _value(task, "description")
    return value if stripped(value) else ""


def caller_effort(task, constants):
    """The effort the delegating model set, when the ladder gives it; else None."""
    value = _value(task, "reasoning_effort")
    return value if isinstance(value, str) and value in constants["efforts"] else None


def level(task, constants):
    """The level the delegating model pinned, as an int of the level list; else None."""
    value = _value(task, "level")
    return value if type(value) is int and value in constants["levels"] else None
