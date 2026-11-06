"""The Hermes delegation provider. Only this module needs agent.delegation_provider."""

from agent.delegation_provider import DelegationProvider

from .constants import CONSTANTS
from .router import Router


class ModelRouterProvider(DelegationProvider):
    def __init__(self, ctx=None, *, router=None):
        self._router = router if router is not None else Router(ctx)

    @property
    def name(self):
        return CONSTANTS["backend"]

    def is_available(self):
        # False would fail delegation closed; the router answers every task itself.
        return True

    def route_task(self, task, config):
        return self._router.route(task, config)
