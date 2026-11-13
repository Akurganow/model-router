"""One Node process per task: the request goes on stdin, one JSON line comes back.

Keys travel only on stdin. The child sees a small allowlist of the environment
and no arguments but the script."""

import json
import os
import subprocess
from dataclasses import dataclass

_PROXY = ("HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY")
ENV_NAMES = (
    "PATH",
    "HOME",
    "TMPDIR",
    # Windows needs it in a replaced environment, or the program may not start.
    "SYSTEMROOT",
    *_PROXY,
    *(name.lower() for name in _PROXY),
    "NODE_EXTRA_CA_CERTS",
    "SSL_CERT_FILE",
)


class NodeTimeout(Exception):
    """The run outlasted its budget and grace; the process is killed."""


class NodeFailed(Exception):
    """The run exited non-zero, could not start, or answered outside the protocol."""


@dataclass(frozen=True)
class Skip:
    line: str


@dataclass(frozen=True)
class Route:
    """slot names the model slot of the level; the router applies its model only when it is set.

    This module checks only the shape: whether a slot or an effort exists is the router's to say."""

    slot: object
    effort: object
    line: str


# Node's fetch reads the proxy variables only when this switch is set.
PROXY_SWITCH = "NODE_USE_ENV_PROXY"
_PROXY_TARGETS = ("HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy")


def child_env(environ):
    env = {name: environ[name] for name in (*ENV_NAMES, PROXY_SWITCH) if name in environ}
    if PROXY_SWITCH not in env and any(name in env for name in _PROXY_TARGETS):
        env[PROXY_SWITCH] = "1"
    return env


def _is_text_or_none(value):
    return value is None or isinstance(value, str)


def _checked(reply):
    if not isinstance(reply, dict) or not isinstance(reply.get("line"), str):
        raise NodeFailed("reply has no line")
    if reply.get("outcome") == "skip":
        return Skip(reply["line"])
    if (
        reply.get("outcome") == "route"
        and "slot" in reply
        and "effort" in reply
        and _is_text_or_none(reply["slot"])
        and _is_text_or_none(reply["effort"])
    ):
        return Route(reply["slot"], reply["effort"], reply["line"])
    raise NodeFailed("reply is outside the protocol")


def parse_response(text):
    """Reads Node's stdout. Raises NodeFailed unless it is one protocol object."""
    try:
        reply = json.loads(text)
    except ValueError:
        raise NodeFailed("reply is not one JSON object") from None
    return _checked(reply)


def run_node(command, request, timeout_s):
    """Runs `command` (a list, no shell) with the request on stdin; returns a Skip or a Route."""
    try:
        done = subprocess.run(
            command,
            input=json.dumps(request).encode("utf-8"),
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            env=child_env(os.environ),
            timeout=timeout_s,
            check=False,
        )
    except subprocess.TimeoutExpired:
        raise NodeTimeout from None
    except OSError:
        raise NodeFailed("node did not start") from None
    if done.returncode != 0:
        raise NodeFailed("node exited non-zero")
    try:
        return parse_response(done.stdout.decode("utf-8"))
    except UnicodeDecodeError:
        raise NodeFailed("reply is not text") from None
