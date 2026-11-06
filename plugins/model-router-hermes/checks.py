"""Offline checks of a picked model slot.

A slot is resolved when Hermes can reach its model without a network call and
without a credential that refreshes over the network."""

import contextvars
import threading

ANTHROPIC = "anthropic"
API_KEY_AUTH = "api_key"
ANTHROPIC_API_KEY = "ANTHROPIC_API_KEY"
# Either one makes Hermes take the OAuth path, which refreshes over the network.
ANTHROPIC_OAUTH_VARIABLES = ("ANTHROPIC_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN")


def credentials_stay_offline(provider, api):
    """True when Hermes reads the provider's credentials without a network refresh."""
    if provider == ANTHROPIC:
        return bool(api.get_secret(ANTHROPIC_API_KEY)) and not any(
            api.get_secret(name) for name in ANTHROPIC_OAUTH_VARIABLES
        )
    # A provider outside the registry, such as OpenRouter, has no login type of its own.
    auth = api.auth_type(provider)
    return auth in (None, API_KEY_AUTH) and not api.is_refreshable(provider)


def slot_resolves(slot, api):
    """True when the slot is named, keeps offline credentials, resolves and lists its model."""
    if not (slot.provider and slot.model):
        return False
    try:
        if not credentials_stay_offline(slot.provider, api):
            return False
        api.resolve_runtime(slot.provider, slot.model)
        return slot.model in (api.list_models(slot.provider) or [])
    except Exception:
        return False


def slot_resolved_within(slot, api, timeout_s):
    """Runs the checks in a daemon thread. True or False when they finish in time, else None."""
    if timeout_s <= 0:
        return None
    outcome = []
    worker = threading.Thread(
        target=contextvars.copy_context().run,
        args=(lambda: outcome.append(slot_resolves(slot, api)),),
        daemon=True,
    )
    worker.start()
    worker.join(timeout_s)
    return outcome[0] if outcome else None
