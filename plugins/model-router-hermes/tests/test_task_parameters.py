import json
import re
import unittest

from support import (
    CONSTANTS,
    PREFIX,
    FakeCtx,
    RouterCase,
    fake_api,
    good_settings,
    make_router,
    route_reply,
    skip_reply,
    skipped_label,
    submodule,
    unresolved_label,
)

PARAMETERS = CONSTANTS["taskParameters"]
# Hermes refuses a task parameter whose name does not match this pattern.
NAME = re.compile(r"^[a-z][a-z0-9_]{0,63}$")


def item(**params):
    return {"goal": "do the thing", "context": None, "index": 0, **params}


def unset_label(slot):
    return CONSTANTS["skips"][CONSTANTS["slots"][slot]["unset"]]


class DeclarationTest(unittest.TestCase):
    def provider(self):
        return submodule("provider").ModelRouterProvider(FakeCtx(good_settings()))

    def test_the_parameters_are_the_ones_constants_hold(self):
        self.assertEqual(set(PARAMETERS), {"description", "reasoning_effort", "level"})
        self.assertEqual(self.provider().task_parameters({}), PARAMETERS)

    def test_the_parameters_are_the_same_bytes_for_any_config(self):
        provider = self.provider()
        first = json.dumps(provider.task_parameters({}))
        for config in ({}, {"reasoning_effort": "low", "model": "m"}, {"backend": "model-router"}):
            with self.subTest(config):
                self.assertEqual(json.dumps(provider.task_parameters(config)), first)

    def test_a_changed_result_leaves_the_next_one_alone(self):
        provider = self.provider()
        provider.task_parameters({})["level"]["enum"].append(9)
        self.assertEqual(provider.task_parameters({}), PARAMETERS)

    def test_every_name_is_one_hermes_takes(self):
        for name in PARAMETERS:
            self.assertRegex(name, NAME)

    def test_every_parameter_has_a_type_and_a_description(self):
        for name, schema in PARAMETERS.items():
            with self.subTest(name):
                self.assertIn(schema["type"], ("string", "integer"))
                self.assertTrue(schema["description"].strip())

    def test_the_effort_enum_is_the_ladder(self):
        enum = PARAMETERS["reasoning_effort"]["enum"]
        self.assertEqual(sorted(enum), sorted(CONSTANTS["efforts"]))
        self.assertEqual(len(enum), len(set(enum)))
        self.assertFalse({"max", "ultra", "minimal", "none"} & set(enum))

    def test_the_level_enum_is_the_three_levels(self):
        self.assertEqual(PARAMETERS["level"], {**PARAMETERS["level"], "type": "integer"})
        self.assertEqual(PARAMETERS["level"]["enum"], CONSTANTS["levels"])
        self.assertEqual(CONSTANTS["levels"], [0, 1, 2])

    def test_the_addendum_is_fixed_and_names_the_skill(self):
        provider = self.provider()
        addendum = CONSTANTS["delegationAddendum"]
        self.assertEqual(provider.description({}), addendum)
        self.assertEqual(provider.description({"reasoning_effort": "low"}), addendum)
        self.assertIn("model-router-hermes:model-router", addendum)
        self.assertNotIn("\n", addendum)


class DescriptionTest(RouterCase):
    def request(self, **params):
        stub = self.stub(reply=skip_reply())
        make_router(script=stub.script).route(item(**params), {})
        return json.loads(stub.captured()["stdin"])

    def test_a_description_goes_to_node_as_is(self):
        text = "  Find the config file  "
        self.assertEqual(self.request(description=text)["description"], text)

    def test_a_missing_blank_or_non_text_description_is_empty(self):
        for value in (None, "", "   ", 3, ["a"], {"a": 1}, True):
            with self.subTest(value):
                self.assertEqual(self.request(description=value)["description"], "")
        self.assertEqual(self.request()["description"], "")


class CallerEffortTest(RouterCase):
    def routed(self, config=None, reply=None, api=None, **params):
        stub = self.stub(reply=reply if reply is not None else route_reply(None, None, PREFIX + "L"))
        router = make_router(script=stub.script, api=api)
        return router.route(item(**params), {} if config is None else config), stub

    def test_a_ladder_effort_sets_the_route_and_tells_node(self):
        for effort in CONSTANTS["efforts"]:
            for slot in (None, "small", "large"):
                with self.subTest(effort=effort, slot=slot):
                    route, stub = self.routed(
                        reply=route_reply(slot, None, PREFIX + "L"), reasoning_effort=effort
                    )
                    self.assertEqual(route["reasoning_effort"], effort)
                    self.assertEqual(json.loads(stub.captured()["stdin"])["keptEffort"], "caller")

    def test_an_effort_off_the_ladder_is_ignored(self):
        for value in ("max", "minimal", "none", "Low", " low", "", 3, True, None):
            with self.subTest(value):
                route, stub = self.routed(reasoning_effort=value)
                self.assertNotIn("reasoning_effort", route)
                self.assertIsNone(json.loads(stub.captured()["stdin"])["keptEffort"])

    def test_the_caller_effort_rides_on_every_skip(self):
        stub_cases = {
            "keyUnset": {"api": fake_api(secrets={})},
            "nodeNotFound": {"api": fake_api(find_node=lambda: None)},
        }
        for reason, args in stub_cases.items():
            with self.subTest(reason):
                route, _ = self.routed(reasoning_effort="high", **args)
                self.assertEqual(route, {"reasoning_effort": "high", "label": skipped_label(reason)})
        route, _ = self.routed({"model": "m"}, reasoning_effort="high")
        self.assertEqual(
            route,
            {"model": "m", "reasoning_effort": "high", "label": skipped_label("subagentModelSet")},
        )
        route, _ = self.routed(reply=skip_reply(PREFIX + "skipped, x"), reasoning_effort="xhigh")
        self.assertEqual(route, {"reasoning_effort": "xhigh", "label": PREFIX + "skipped, x"})
        route, _ = self.routed(
            reply=route_reply("small", None, PREFIX + "L"),
            api=fake_api(list_models=lambda provider: []),
            reasoning_effort="low",
        )
        self.assertEqual(route, {"reasoning_effort": "low", "label": unresolved_label("small")})

    def test_the_caller_effort_rides_on_the_failed_skip(self):
        router = make_router()
        self.assertEqual(
            router.route(item(reasoning_effort="low"), "not a mapping"),
            {"reasoning_effort": "low", "label": skipped_label("failed")},
        )

    def test_the_config_effort_wins(self):
        for reply in (skip_reply(PREFIX + "skipped, x"), route_reply("large", None, PREFIX + "L")):
            with self.subTest(reply["outcome"]):
                route, stub = self.routed(
                    {"reasoning_effort": "low"}, reply=reply, reasoning_effort="xhigh"
                )
                self.assertEqual(route["reasoning_effort"], "low")
                request = json.loads(stub.captured()["stdin"])
                self.assertEqual(request["keptEffort"], "config")

    def test_a_blank_config_effort_lets_the_caller_effort_through(self):
        route, _ = self.routed({"reasoning_effort": " "}, reasoning_effort="high")
        self.assertEqual(route["reasoning_effort"], "high")


class LevelTest(RouterCase):
    def pinned(self, config=None, settings=None, api=None, **params):
        stub = self.stub(reply=skip_reply())
        router = make_router(script=stub.script, settings=settings, api=api)
        route = router.route(item(**params), {} if config is None else config)
        return route, stub

    def test_a_set_level_sets_its_slot_without_node_or_label(self):
        settings = good_settings(middle_model={"provider": "openrouter", "model": "middle-model"})
        for level, model in ((0, "small-model"), (1, "middle-model"), (2, "large-model")):
            with self.subTest(level):
                route, stub = self.pinned(
                    {"api_mode": "chat", "service_tier": "fast"}, settings=settings, level=level
                )
                self.assertEqual(
                    route, {"api_mode": "chat", "model": model, "provider": "openrouter"}
                )
                self.assertNodeNotRun(stub)

    def test_the_middle_level_with_no_middle_model_passes_through_with_its_label(self):
        route, stub = self.pinned({"api_mode": "chat", "reasoning_effort": "low"}, level=1)
        self.assertEqual(
            route,
            {
                "api_mode": "chat",
                "reasoning_effort": "low",
                "label": "model-router L1 middle model unset",
            },
        )
        self.assertNodeNotRun(stub)

    def test_a_pinned_level_needs_no_key_and_no_other_slot(self):
        route, stub = self.pinned(
            api=fake_api(secrets={}), settings=good_settings(small_model=None), level=2
        )
        self.assertEqual(route, {"model": "large-model", "provider": "openrouter"})
        self.assertNodeNotRun(stub)

    def test_the_caller_effort_joins_a_pinned_level(self):
        route, _ = self.pinned(level=0, reasoning_effort="xhigh")
        self.assertEqual(
            route, {"model": "small-model", "provider": "openrouter", "reasoning_effort": "xhigh"}
        )

    def test_an_unset_slot_passes_through_on_the_hermes_model_with_its_label(self):
        labels = {
            "small": "model-router L0 small model unset",
            "middle": "model-router L1 middle model unset",
            "large": "model-router L2 large model unset",
        }
        for level, slot in ((0, "small"), (1, "middle"), (2, "large")):
            for value in ({"provider": "openrouter"}, {"model": ""}, {"model": "   "}, None):
                with self.subTest(slot=slot, value=value):
                    route, stub = self.pinned(
                        {"api_mode": "chat"},
                        settings=good_settings(**{f"{slot}_model": value}),
                        level=level,
                        reasoning_effort="high",
                    )
                    self.assertEqual(
                        route,
                        {"api_mode": "chat", "reasoning_effort": "high", "label": labels[slot]},
                    )
                    self.assertNodeNotRun(stub)

    def test_an_unresolved_slot_passes_through_on_the_hermes_model_with_its_label(self):
        settings = good_settings(middle_model={"provider": "openrouter", "model": "middle-model"})
        labels = (
            "model-router L0 small model unresolved",
            "model-router L1 middle model unresolved",
            "model-router L2 large model unresolved",
        )
        for level, label in enumerate(labels):
            with self.subTest(level):
                route, _ = self.pinned(
                    settings=settings, api=fake_api(list_models=lambda provider: []), level=level
                )
                self.assertEqual(route, {"label": label})

    def test_a_set_subagent_model_wins(self):
        route, stub = self.pinned({"model": "m"}, level=2, reasoning_effort="high")
        self.assertEqual(
            route,
            {"model": "m", "reasoning_effort": "high", "label": skipped_label("subagentModelSet")},
        )
        self.assertNodeNotRun(stub)

    def test_a_value_that_is_not_a_level_is_absent(self):
        for value in (True, False, 2.0, "2", 3, -1, None, [2]):
            with self.subTest(value):
                route, stub = self.pinned(level=value)
                self.assertEqual(route["label"], PREFIX + "skipped, test")
                self.assertTrue(stub.capture.exists())

    def test_a_pinned_route_logs_nothing(self):
        router = make_router()
        logger = submodule("router").logging.getLogger(submodule("router").__name__)
        with self.assertNoLogs(logger, level="INFO"):
            router.route(item(level=0), {})


if __name__ == "__main__":
    unittest.main()
