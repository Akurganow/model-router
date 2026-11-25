import json
import unittest
from unittest import mock

from support import (
    PREFIX,
    FakeClock,
    RouterCase,
    fake_api,
    good_settings,
    make_router,
    short_constants,
    skip_reply,
    skipped_label,
    submodule,
)

node = submodule("node")


class NodeRequestTest(RouterCase):
    def request(self, config=None, goal="g", context=None, **router_args):
        stub = self.stub(reply=skip_reply())
        router = make_router(script=stub.script, **router_args)
        router.route({"goal": goal, "context": context, "index": 0}, config or {})
        return json.loads(stub.captured()["stdin"])

    def test_request_shape(self):
        request = self.request(goal="the goal", context="the context")
        self.assertEqual(
            request,
            {
                "task": "the goal",
                "context": "the context",
                "provider": "typesafe",
                "gateway": None,
                "models": None,
                "keys": {"typesafe": "typesafe-secret-one"},
                "budgetMs": 1000,
                "slotModels": {"small": "small-model", "middle": None, "large": "large-model"},
                "keptEffort": None,
                "description": "",
            },
        )

    def test_missing_text_is_empty(self):
        request = self.request(goal=None, context=None)
        self.assertEqual((request["task"], request["context"]), ("", ""))

    def test_keys_hold_only_allowed_and_set_key_holders(self):
        both = {"TYPESAFE_API_KEY": "ts-secret-one", "OPENROUTER_API_KEY": "or-secret-one"}
        cases = {
            "direct": {"typesafe": "ts-secret-one"},
            "openrouter": {"openrouter": "or-secret-one"},
            "auto": {"typesafe": "ts-secret-one", "openrouter": "or-secret-one"},
            "openrouter-first": {"typesafe": "ts-secret-one", "openrouter": "or-secret-one"},
        }
        for gateway, keys in cases.items():
            with self.subTest(gateway):
                request = self.request(
                    api=fake_api(secrets=both), settings=good_settings(gateway=gateway)
                )
                self.assertEqual(request["keys"], keys)
                self.assertEqual(request["gateway"], gateway)

    def test_unset_key_of_an_allowed_holder_is_left_out(self):
        request = self.request(
            api=fake_api(secrets={"OPENROUTER_API_KEY": "or-secret-one"}),
            settings=good_settings(gateway="auto"),
        )
        self.assertEqual(request["keys"], {"openrouter": "or-secret-one"})

    def test_both_stored_texts_go_to_node_as_read(self):
        request = self.request(settings=good_settings(gateway="auto"))
        self.assertEqual((request["provider"], request["gateway"]), ("typesafe", "auto"))

    def test_the_stored_models_value_goes_to_node_as_read(self):
        dict_value = {"typesafe": "jev-preview", "openai": "gpt-6-luna"}
        for value in (dict_value, "{typesafe:jev-preview}", '{"typesafe": 3}', "", "   ", 7, None):
            with self.subTest(value):
                request = self.request(settings=good_settings(models=value))
                self.assertEqual(request["models"], value)

    def test_python_does_not_judge_a_models_value(self):
        for value in ("{typesafe}", "{typesafe:a/b}", "not models at all"):
            with self.subTest(value):
                stub = self.stub(reply=skip_reply())
                router = make_router(script=stub.script, settings=good_settings(models=value))
                route = router.route({"goal": "g", "index": 0}, {})
                self.assertEqual(route["label"], PREFIX + "skipped, test")
                self.assertTrue(stub.capture.exists())

    def test_the_slot_models(self):
        request = self.request(
            settings=good_settings(
                small_model={"provider": "p", "model": " "},
                middle_model={"provider": "p", "model": " m "},
                large_model={"provider": "p", "model": " l "},
            )
        )
        self.assertEqual(request["slotModels"], {"small": None, "middle": "m", "large": "l"})

    def test_a_blank_spaces_or_missing_model_is_sent_as_none_in_every_slot(self):
        for slot in ("small", "middle", "large"):
            for value in ({"provider": "p", "model": ""}, {"model": "   "}, None):
                with self.subTest(slot=slot, value=value):
                    request = self.request(settings=good_settings(**{f"{slot}_model": value}))
                    self.assertIsNone(request["slotModels"][slot])

    def test_a_config_effort_is_kept_by_config(self):
        for value, kept in (
            (None, None),
            ("", None),
            ("  ", None),
            ("low", "config"),
            ("medium", "config"),
            (3, "config"),
        ):
            with self.subTest(value):
                config = {} if value is None else {"reasoning_effort": value}
                self.assertEqual(self.request(config)["keptEffort"], kept)


class BudgetHandoffTest(RouterCase):
    def shared_router(self, stub, clock, constants=None):
        return make_router(
            script=stub.script, clock=clock, constants=constants or short_constants(8000, 1000)
        )

    def test_node_gets_the_remaining_budget_and_the_run_ends_after_the_grace(self):
        clock = FakeClock()
        stub = self.stub(reply=skip_reply())
        router = self.shared_router(stub, clock)
        with mock.patch.object(node, "run_node", wraps=node.run_node) as run:
            router.route({"goal": "g", "index": 0}, {})
            clock.advance(2.5)
            router.route({"goal": "g", "index": 1}, {})
        (first, second) = run.call_args_list
        self.assertEqual(first.args[1]["budgetMs"], 8000)
        self.assertEqual(first.args[2], 9.0)
        self.assertEqual(second.args[1]["budgetMs"], 5500)
        self.assertEqual(second.args[2], 6.5)
        self.assertEqual(len(first.args), 3)

    def test_budget_is_whole_milliseconds(self):
        clock = FakeClock()
        stub = self.stub(reply=skip_reply())
        router = self.shared_router(stub, clock)
        router.route({"goal": "g", "index": 0}, {})
        clock.advance(0.0004)  # 7999.6 ms left: the run gets 7999, never more than the budget
        router.route({"goal": "g", "index": 1}, {})
        self.assertEqual(json.loads(stub.captured()["stdin"])["budgetMs"], 7999)

    def test_spent_budget_skips_later_tasks_until_the_record_idles(self):
        clock = FakeClock()
        stub = self.stub(reply=skip_reply())
        router = self.shared_router(stub, clock)
        labels = []

        def step(index, wait):
            clock.advance(wait)
            labels.append(router.route({"goal": "g", "index": index}, {})["label"])

        step(0, 0)
        step(1, 7.5)
        step(2, 1)
        step(3, 1)
        self.assertEqual(labels[2:], [skipped_label("timeout")] * 2)
        step(4, 9)
        self.assertEqual(labels[4], PREFIX + "skipped, test")

    def test_less_than_one_millisecond_left_is_a_timeout_without_a_run(self):
        for wait in (8.0, 7.9996):
            with self.subTest(wait):
                clock = FakeClock()
                stub = self.stub(reply=skip_reply())
                router = self.shared_router(stub, clock)
                router.route({"goal": "g", "index": 0}, {})
                stub.capture.unlink()
                clock.advance(wait)
                route = router.route({"goal": "g", "index": 1}, {})
                self.assertEqual(route["label"], skipped_label("timeout"))
                self.assertRoutingNotRun(stub)

    def test_task_zero_opens_a_new_record(self):
        clock = FakeClock()
        stub = self.stub(reply=skip_reply())
        router = self.shared_router(stub, clock)
        router.route({"goal": "g", "index": 0}, {})
        clock.advance(7.5)
        with mock.patch.object(node, "run_node", wraps=node.run_node) as run:
            router.route({"goal": "g", "index": 0}, {})
        self.assertEqual(run.call_args.args[1]["budgetMs"], 8000)


if __name__ == "__main__":
    unittest.main()
