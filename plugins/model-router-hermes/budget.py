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
    """One task's view of the record it opened; leaving the block marks the task's end."""

    def __init__(self, budget, record):
        self._budget = budget
        self._record = record

    def __enter__(self):
        return self

    def __exit__(self, *_exc):
        with self._budget.lock:
            self._record.last_end = max(self._record.last_end, self._budget.clock())

    def remaining_ms(self):
        elapsed_ms = (self._budget.clock() - self._record.started) * MS_PER_SECOND
        return self._budget.limit_ms - elapsed_ms


class Budget:
    def __init__(self, limit_ms, clock):
        self.limit_ms = limit_ms
        self.clock = clock
        self.lock = threading.Lock()
        self._record = None

    def _starts_new_call(self, index, now):
        # Hermes routes a call's tasks in order from index 0, and a record idle past the limit belongs to an earlier call.
        record = self._record
        if index == 0 or record is None:
            return True
        return (now - record.last_end) * MS_PER_SECOND > self.limit_ms

    def open(self, index):
        with self.lock:
            now = self.clock()
            if self._starts_new_call(index, now):
                self._record = _Record(now)
            return Window(self, self._record)
