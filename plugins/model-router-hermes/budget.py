"""The routing time one delegate_task call may spend across its tasks.

One process-wide record per call. Hermes can keep this plugin loaded across
turns and run its tasks on several threads, so every access takes the lock."""

import threading

from .constants import MS_PER_SECOND


class _Record:
    def __init__(self, now):
        self.started = now
        self.last_end = now


class Window:
    """One task's view of the record it opened."""

    def __init__(self, budget, record):
        self._budget = budget
        self._record = record

    @property
    def started(self):
        return self._record.started

    def remaining_ms(self):
        elapsed_ms = (self._budget.clock() - self._record.started) * MS_PER_SECOND
        return self._budget.limit_ms - elapsed_ms

    def close(self):
        with self._budget.lock:
            self._record.last_end = max(self._record.last_end, self._budget.clock())


class Budget:
    def __init__(self, limit_ms, clock):
        self.limit_ms = limit_ms
        self.clock = clock
        self.lock = threading.Lock()
        self._record = None

    def open(self, index):
        """Index 0, no record, or a record idle past the limit opens a new record."""
        with self.lock:
            now = self.clock()
            record = self._record
            idle_ms = 0 if record is None else (now - record.last_end) * MS_PER_SECOND
            if index == 0 or record is None or idle_ms > self.limit_ms:
                record = self._record = _Record(now)
            return Window(self, record)
