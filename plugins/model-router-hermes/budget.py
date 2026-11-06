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

    def __init__(self, budget, record, limit_ms):
        self._budget = budget
        self._record = record
        self._limit_ms = limit_ms

    def __enter__(self):
        return self

    def __exit__(self, *_exc):
        self._budget.end_use(self._record)

    def remaining_ms(self):
        return self._limit_ms - self._budget.elapsed_ms(self._record)


class Budget:
    def __init__(self, limit_ms, clock):
        self._limit_ms = limit_ms
        self._clock = clock
        self._lock = threading.Lock()
        self._record = None

    def elapsed_ms(self, record):
        return (self._clock() - record.started) * MS_PER_SECOND

    def end_use(self, record):
        """Marks now as the end of one task's use of `record`."""
        with self._lock:
            record.last_end = max(record.last_end, self._clock())

    def _starts_new_call(self, index, now):
        # Hermes routes a call's tasks in order from index 0, and a record idle past the limit belongs to an earlier call.
        record = self._record
        if index == 0 or record is None:
            return True
        return (now - record.last_end) * MS_PER_SECOND > self._limit_ms

    def open(self, index):
        with self._lock:
            now = self._clock()
            if self._starts_new_call(index, now):
                self._record = _Record(now)
            return Window(self, self._record, self._limit_ms)
