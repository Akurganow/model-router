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
    # None for a provider Hermes resolves outside its registry, as it does OpenRouter.
    auth_type: Callable[[str], Optional[str]]
    is_refreshable: Callable[[str], bool]
    # Raises when the provider has no credentials that resolve without the network.
    resolve_runtime: Callable[[str, str], object]
    list_models: Callable[[str], list]
    # Hermes's own provider list, shared with its /model command: {id, label, aliases, authenticated}.
    list_providers: Callable[[], list]
    # A model's catalogue record offline, or None; its prices read 0.0 unless has_cost_data() is true.
    model_info: Callable[[str, str], object]


def _get_secret(name):
    from agent.secret_scope import get_secret

    return get_secret(name)


def _find_node():
    try:
        from hermes_constants import find_node_executable

        return find_node_executable("node")
    except Exception:
        return None


def _auth_type(provider):
    from hermes_cli.auth import PROVIDER_REGISTRY

    entry = PROVIDER_REGISTRY.get(provider)
    return None if entry is None else entry.auth_type


def _is_refreshable(provider):
    from hermes_cli.auth_plugin_providers import is_refreshable_oauth_provider

    return is_refreshable_oauth_provider(provider)


def _resolve_runtime(provider, model):
    from hermes_cli.left_core_migration import installs_held
    from hermes_cli.runtime_provider import resolve_runtime_provider

    # installs_held is a context variable: it must be entered in the thread that resolves.
    with installs_held():
        return resolve_runtime_provider(requested=provider, target_model=model)


def _list_models(provider):
    from agent.models_dev import list_provider_models

    return list_provider_models(provider, allow_network=False)


def _list_providers():
    from hermes_cli.models import list_available_providers

    return list_available_providers()


def _model_info(provider, model):
    from agent.models_dev import get_model_info

    return get_model_info(provider, model, allow_network=False)


def live_api():
    return HermesApi(
        get_secret=_get_secret,
        find_node=_find_node,
        auth_type=_auth_type,
        is_refreshable=_is_refreshable,
        resolve_runtime=_resolve_runtime,
        list_models=_list_models,
        list_providers=_list_providers,
        model_info=_model_info,
    )
