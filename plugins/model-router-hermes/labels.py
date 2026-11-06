"""The routing label: logged once per distinct message."""

import threading
from collections import OrderedDict

MEMORY = 128


class OnceLog:
    """Logs each distinct message once, remembering the most recent `capacity` of them."""

    def __init__(self, logger, capacity=MEMORY):
        self._logger = logger
        self._capacity = capacity
        self._seen = OrderedDict()
        self._lock = threading.Lock()

    def info(self, message):
        with self._lock:
            if message in self._seen:
                return
            self._seen[message] = None
            if len(self._seen) > self._capacity:
                self._seen.popitem(last=False)
        self._logger.info("%s", message)
