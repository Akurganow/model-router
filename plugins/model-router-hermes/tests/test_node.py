import json
import os
import sys
import time
import unittest
from pathlib import Path
from unittest import mock

from support import (
    CONSTANTS,
    PREFIX,
    make_node_stub,
    route_reply,
    skip_reply,
    submodule,
    temp_dir,
)

node = submodule("node")
EFFORTS = CONSTANTS["efforts"]
SLOTS = list(CONSTANTS["slots"])


def run(stub, request=None, timeout=5):
    return node.run_node([sys.executable, str(stub.script)], request or {"task": "t"}, timeout)


class ResponseTest(unittest.TestCase):
    def parse(self, value):
        return node.parse_response(json.dumps(value) + "\n")

    def test_skip(self):
        self.assertEqual(self.parse(skip_reply("skipped, x")), node.Skip("skipped, x"))

    def test_route_at_each_slot_and_effort(self):
        for slot in SLOTS:
            for effort in (None, *EFFORTS):
                self.assertEqual(
                    self.parse(route_reply(slot, effort, "L")), node.Route(slot, effort, "L")
                )

    def test_a_slot_or_effort_outside_the_settings_still_has_the_right_shape(self):
        # The router, not this module, knows which slots and efforts exist.
        self.assertEqual(
            self.parse(route_reply("medium", "max", "L")), node.Route("medium", "max", "L")
        )

    def test_a_route_with_no_slot_fails(self):
        for slot in (None, 1, ["small"]):
            with self.subTest(slot), self.assertRaises(node.NodeFailed):
                self.parse(route_reply(slot, "low"))

    def test_outside_the_protocol_fails(self):
        bad = [
            {},
            [],
            "text",
            {"outcome": "skip"},
            {"outcome": "skip", "line": 3},
            {"outcome": "other", "line": "x"},
            route_reply(1, "low"),
            route_reply("small", 5),
            route_reply("small", "low", 3),
            {"outcome": "route", "line": "x"},
            {"outcome": "route", "slot": "small", "line": "x"},
            {"outcome": "route", "effort": None, "line": "x"},
            {"outcome": "route", "effort": "low", "line": "x"},
        ]
        for value in bad:
            with self.assertRaises(node.NodeFailed, msg=value):
                self.parse(value)

    def test_not_one_json_object_fails(self):
        for text in ("", "not json", "{", '{"outcome":"skip","line":"a"}\n{"x":1}', "null"):
            with self.assertRaises(node.NodeFailed, msg=text):
                node.parse_response(text)


class EnvironmentTest(unittest.TestCase):
    def test_only_the_allowlist_passes(self):
        environ = {
            "PATH": "/bin",
            "HOME": "/h",
            "TMPDIR": "/t",
            "https_proxy": "p",
            "NO_PROXY": "n",
            "NODE_EXTRA_CA_CERTS": "/c",
            "SSL_CERT_FILE": "/s",
            "TYPESAFE_API_KEY": "leak",
            "OPENROUTER_API_KEY": "leak",
            "HERMES_HOME": "/hermes",
            "NODE_OPTIONS": "--require x",
        }
        self.assertEqual(
            node.child_env(environ),
            {
                k: environ[k]
                for k in (
                    "PATH",
                    "HOME",
                    "TMPDIR",
                    "https_proxy",
                    "NO_PROXY",
                    "NODE_EXTRA_CA_CERTS",
                    "SSL_CERT_FILE",
                )
            }
            | {"NODE_USE_ENV_PROXY": "1"},
        )

    def test_windows_system_root_passes(self):
        # Hermes runs natively on Windows, where a child started without SYSTEMROOT may fail.
        env = node.child_env({"SYSTEMROOT": r"C:\Windows", "PATH": "/b"})
        self.assertEqual(env, {"SYSTEMROOT": r"C:\Windows", "PATH": "/b"})

    def test_all_listed_names_are_copied_in_both_cases(self):
        names = ["PATH", "HOME", "TMPDIR", "SYSTEMROOT", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE"]
        names += [
            n for base in ("HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY") for n in (base, base.lower())
        ]
        self.assertEqual(
            node.child_env({n: "v" for n in names}),
            {n: "v" for n in names} | {"NODE_USE_ENV_PROXY": "1"},
        )

    def test_absent_names_are_left_out(self):
        self.assertEqual(node.child_env({}), {})

    def test_a_proxy_variable_turns_on_nodes_proxy_support(self):
        # Node's fetch reads the proxy variables only with NODE_USE_ENV_PROXY set.
        for name in ("HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"):
            env = node.child_env({name: "http://proxy.invalid:8080"})
            self.assertEqual(env.get("NODE_USE_ENV_PROXY"), "1", name)

    def test_no_proxy_alone_leaves_proxy_support_off(self):
        self.assertNotIn("NODE_USE_ENV_PROXY", node.child_env({"NO_PROXY": "n", "PATH": "/b"}))

    def test_a_set_proxy_switch_passes_as_it_is(self):
        env = node.child_env({"HTTPS_PROXY": "p", "NODE_USE_ENV_PROXY": "0"})
        self.assertEqual(env["NODE_USE_ENV_PROXY"], "0")


class RunTest(unittest.TestCase):
    def setUp(self):
        self._dir = temp_dir()
        self.dir = Path(self._dir.name)
        self.addCleanup(self._dir.cleanup)

    def test_request_goes_on_stdin_and_the_reply_comes_back(self):
        stub = make_node_stub(self.dir, reply=route_reply("small", "low"))
        result = run(stub, {"task": "t", "keys": {"typesafe": "k-one"}})
        self.assertEqual(result, node.Route("small", "low", PREFIX + "L1 test line"))
        captured = stub.captured()
        self.assertEqual(json.loads(captured["stdin"])["keys"], {"typesafe": "k-one"})
        self.assertEqual(captured["argv"], [str(stub.script)])

    def test_child_gets_the_filtered_environment(self):
        stub = make_node_stub(self.dir, reply=skip_reply())
        with mock.patch.dict(os.environ, {"TYPESAFE_API_KEY": "leak-one", "HERMES_HOME": "/x"}):
            run(stub)
        env = stub.captured()["env"]
        self.assertNotIn("TYPESAFE_API_KEY", env)
        self.assertNotIn("HERMES_HOME", env)
        self.assertEqual(env.get("PATH"), os.environ.get("PATH"))

    def test_run_is_a_list_without_a_shell(self):
        with mock.patch("subprocess.run") as fake:
            fake.return_value = mock.Mock(returncode=0, stdout=json.dumps(skip_reply()).encode())
            node.run_node(["node", "route.mjs"], {"task": "t"}, 2.5)
        args, kwargs = fake.call_args
        self.assertEqual(args[0], ["node", "route.mjs"])
        self.assertIs(kwargs.get("shell", False), False)
        self.assertEqual(kwargs["timeout"], 2.5)
        self.assertEqual(json.loads(kwargs["input"]), {"task": "t"})

    def test_timeout_kills_the_process(self):
        stub = make_node_stub(self.dir, reply=skip_reply(), sleep=30)
        started = time.monotonic()
        with self.assertRaises(node.NodeTimeout):
            run(stub, timeout=0.6)
        self.assertLess(time.monotonic() - started, 10)
        pid = json.loads(stub.capture.read_text())["pid"]
        with self.assertRaises(ProcessLookupError):
            os.kill(pid, 0)

    def test_non_zero_exit_fails(self):
        stub = make_node_stub(self.dir, reply=skip_reply(), exit_code=3)
        with self.assertRaises(node.NodeFailed):
            run(stub)

    def test_garbage_and_empty_output_fail(self):
        for raw in ("garbage\n", "", "[]\n"):
            stub = make_node_stub(self.dir, raw=raw)
            with self.assertRaises(node.NodeFailed, msg=raw):
                run(stub)

    def test_os_error_fails(self):
        with self.assertRaises(node.NodeFailed):
            node.run_node([str(self.dir / "missing")], {}, 2)

    def test_output_that_is_not_utf8_fails(self):
        with mock.patch("subprocess.run") as fake:
            fake.return_value = mock.Mock(returncode=0, stdout=b"\xff\xfe")
            with self.assertRaises(node.NodeFailed):
                node.run_node(["node"], {}, 2)


if __name__ == "__main__":
    unittest.main()
