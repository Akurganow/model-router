"""model-router-hermes: a Hermes delegation provider that routes each delegated task."""

import logging

# What Python names when the core has no delegation provider support.
OLD_CORE_MODULES = ("agent", "agent.delegation_provider")


def _load_provider():
    from .provider import ModelRouterProvider

    return ModelRouterProvider


def register(ctx):
    try:
        provider_class = _load_provider()
    except ModuleNotFoundError as error:
        if error.name not in OLD_CORE_MODULES:
            raise
        logging.getLogger(__name__).warning(
            "This Hermes core has no delegation providers (agent.delegation_provider is missing). "
            "Upgrade Hermes. model-router-hermes stays off."
        )
        return
    ctx.register_delegation_provider(provider_class(ctx))
