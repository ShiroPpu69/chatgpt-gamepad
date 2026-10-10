import asyncio
import unittest
import queue
from unittest.mock import patch

from controller import Bridge, EdgeGate, RepeatGate


class EdgeTests(unittest.TestCase):
    def test_held_key_at_connection_never_triggers(self):
        gate = EdgeGate()
        self.assertFalse(gate.update(True, 0))
        self.assertFalse(gate.update(True, 1))
        self.assertFalse(gate.update(False, 2))
        self.assertTrue(gate.update(True, 3))
        self.assertFalse(gate.update(True, 4))

    def test_release_and_second_press_trigger_again(self):
        gate = EdgeGate()
        gate.update(False, 0)
        self.assertTrue(gate.update(True, 1))
        gate.update(False, 1.4)
        self.assertTrue(gate.update(True, 2))

    def test_contact_bounce_is_suppressed(self):
        gate = EdgeGate()
        gate.update(False, 0)
        self.assertTrue(gate.update(True, 1))
        gate.update(False, 1.01)
        self.assertFalse(gate.update(True, 1.02))


class FakeSocket:
    def __init__(self, bridge, response):
        self.bridge, self.response = bridge, response

    async def send(self, _message):
        self.bridge.pending[1].set_result(self.response)


class RepeatTests(unittest.TestCase):
    def test_held_direction_repeats_after_initial_delay(self):
        gate = RepeatGate()
        gate.update(False, 0)
        self.assertTrue(gate.update(True, 1))
        self.assertFalse(gate.update(True, 1.2))
        self.assertTrue(gate.update(True, 1.36))
        self.assertFalse(gate.update(True, 1.4))
        self.assertTrue(gate.update(True, 1.51))

    def test_reconnect_hold_never_scrolls_until_release(self):
        gate = RepeatGate()
        self.assertFalse(gate.update(True, 0))
        self.assertFalse(gate.update(True, 1))
        gate.update(False, 2)
        self.assertTrue(gate.update(True, 3))
        gate.update(False, 3.2)
        self.assertFalse(gate.update(False, 5))


class BridgeTests(unittest.IsolatedAsyncioTestCase):
    async def test_ack_sets_real_state_and_unlocks(self):
        events = queue.Queue()
        bridge = Bridge("test-token", events)
        bridge.connection = FakeSocket(bridge, {"ok": True, "state": "active", "message": "Started"})
        await bridge.dispatch("toggle")
        self.assertEqual(bridge.state, "active")
        self.assertFalse(bridge.busy)
        self.assertIsNone(bridge.pending)

    async def test_missing_extension_does_not_claim_active(self):
        bridge = Bridge("test-token", queue.Queue())
        await bridge.dispatch("toggle")
        self.assertEqual(bridge.state, "idle")
        self.assertFalse(bridge.busy)

    async def test_busy_press_does_not_dispatch(self):
        bridge = Bridge("test-token", queue.Queue())
        bridge.busy = True
        await bridge.dispatch("toggle")
        self.assertIsNone(bridge.pending)

    async def test_dom_scroll_never_injects_native_input(self):
        bridge = Bridge("test-token", queue.Queue())
        bridge.connection = FakeSocket(bridge, {"ok":True,"state":"idle","method":"dom","moved":True})
        with patch("native_wheel.send_wheel") as injected:
            await bridge.dispatch("scroll_down")
            injected.assert_not_called()
        self.assertFalse(bridge.busy)

    async def test_old_extension_cannot_inject_native_input(self):
        events = queue.Queue()
        bridge = Bridge("test-token", events)
        bridge.connection = FakeSocket(bridge, {"ok":True,"nativeWheel":{"direction":"scroll_down"}})
        with patch("native_wheel.send_wheel") as injected:
            await bridge.dispatch("scroll_down")
            injected.assert_not_called()
        self.assertTrue(any(kind == "error" and "0.7.0" in value for kind,value in list(events.queue)))


if __name__ == "__main__":
    unittest.main()
