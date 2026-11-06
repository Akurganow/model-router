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
    _register_setup(ctx)


def _register_tool(ctx):
    from .config_tool import register_tool

    register_tool(ctx)


def _register_command(ctx):
    from .config_command import register_command

    register_command(ctx)


def _register_skills(ctx):
    from .constants import PLUGIN_DIR

    for folder in sorted((PLUGIN_DIR / "skills").iterdir()):
        if folder.is_dir():
            ctx.register_skill(folder.name, folder / "SKILL.md")


def _register_setup(ctx):
    """Each step fails alone: the provider is already registered and keeps routing."""
    for what, step in (
        ("tool", _register_tool),
        ("command", _register_command),
        ("skill", _register_skills),
    ):
        try:
            step(ctx)
        except Exception as error:
            logging.getLogger(__name__).warning(
                "model-router-hermes could not register its %s: %s. The provider is registered.",
                what,
                error,
            )
