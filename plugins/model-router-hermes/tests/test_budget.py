import threading
import unittest

from support import FakeClock, submodule

LIMIT_MS = 8000


def make_budget(clock):
    return submodule("budget").Budget(LIMIT_MS, clock)


class BudgetTest(unittest.TestCase):
    def setUp(self):
        self.clock = FakeClock()
        self.budget = make_budget(self.clock)

    def finish(self, index):
        """Opens a task's window and leaves it, as a routed task does."""
        with self.budget.open(index) as window:
            return window

    def test_first_task_gets_the_whole_limit(self):
        window = self.budget.open(0)
        self.assertEqual(window.remaining_ms(), LIMIT_MS)

    def test_remaining_shrinks_with_the_clock(self):
        window = self.budget.open(0)
        self.clock.advance(1.5)
        self.assertEqual(window.remaining_ms(), 6500)

    def test_later_task_shares_the_record_of_the_call(self):
        self.finish(0)
        self.clock.advance(3)
        later = self.budget.open(1)
        self.assertEqual(later.remaining_ms(), 5000)

    def test_index_zero_opens_a_new_record(self):
        self.finish(0)
        self.clock.advance(3)
        self.assertEqual(self.budget.open(0).remaining_ms(), LIMIT_MS)

    def test_task_without_a_record_opens_one(self):
        self.assertEqual(self.budget.open(4).remaining_ms(), LIMIT_MS)
        self.assertEqual(self.budget.open(None).remaining_ms(), LIMIT_MS)

    def test_idle_record_is_dropped(self):
        self.finish(0)
        self.clock.advance(8.5)
        self.assertEqual(self.budget.open(1).remaining_ms(), LIMIT_MS)

    def test_record_idle_exactly_the_limit_is_kept(self):
        self.finish(0)
        self.clock.advance(8)
        self.assertEqual(self.budget.open(1).remaining_ms(), 0)

    def test_idle_counts_from_the_last_end_not_the_start(self):
        self.finish(0)
        self.clock.advance(7)
        self.finish(1)
        self.clock.advance(7)
        self.assertEqual(self.budget.open(2).remaining_ms(), LIMIT_MS - 14000)

    def test_spent_budget_is_not_positive(self):
        self.finish(0)
        self.clock.advance(7.5)
        self.finish(1)
        self.clock.advance(1)
        self.assertLess(self.budget.open(2).remaining_ms(), 0)

    def test_close_updates_the_record_the_task_opened(self):
        with self.budget.open(0):
            self.clock.advance(5)
            self.budget.open(0)  # a new call replaces the record
            self.clock.advance(5)
        # Leaving the first window must not keep the new record alive.
        self.clock.advance(7)
        # Record two idled for 12 s, so a new record opens.
        self.assertEqual(self.budget.open(1).remaining_ms(), LIMIT_MS)

    def test_the_lock_clock_and_limit_are_private(self):
        for name in ("lock", "clock", "limit_ms"):
            self.assertFalse(hasattr(self.budget, name), name)

    def test_one_record_under_concurrent_first_tasks(self):
        windows = []
        barrier = threading.Barrier(16)

        def open_window():
            barrier.wait()
            windows.append(self.budget.open(None))

        threads = [threading.Thread(target=open_window) for _ in range(16)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        self.assertEqual(len(windows), 16)
        self.assertEqual(len(set(map(id, (w._record for w in windows)))), 1)
        self.assertIs(windows[0]._record, self.budget._record)

    def test_a_window_closes_when_its_block_raises(self):
        with self.assertRaises(RuntimeError):
            with self.budget.open(0):
                self.clock.advance(7)
                raise RuntimeError("task failed")
        self.clock.advance(7)
        # The failed task closed at 7 s, so 7 s of idle keeps the record.
        self.assertEqual(self.budget.open(1).remaining_ms(), LIMIT_MS - 14000)

    def test_concurrent_open_and_close_do_not_raise(self):
        errors = []

        def work(index):
            try:
                for step in range(200):
                    self.finish(index if step % 7 == 0 else None)
            except Exception as error:  # pragma: no cover - failure path
                errors.append(error)

        threads = [threading.Thread(target=work, args=(n,)) for n in range(8)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        self.assertEqual(errors, [])


if __name__ == "__main__":
    unittest.main()
