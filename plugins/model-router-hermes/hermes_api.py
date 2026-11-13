"""The Hermes functions the shim calls, behind one injectable record.

Each live function imports its Hermes module on first call, so the plugin loads
on a Hermes core that lacks one; a missing module is an ImportError at the call."""

from dataclasses import dataclass
from typing import Callable, Optional


@dataclass(frozen=True)
class HermesApi:
    get_secret: Callable[[str], Optional[str]]
    # Hermes's own Node, never the one on PATH; None when it has none.
    find_node: Callable[[], Optional[str]]


def _get_secret(name):
    from agent.secret_scope import get_secret

    return get_secret(name)


def _find_node():
    try:
        from hermes_constants import find_node_executable

        return find_node_executable("node")
    except Exception:
        return None


def live_api():
    return HermesApi(
        get_secret=_get_secret,
        find_node=_find_node,
    )
