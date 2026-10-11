"""Local Windows gamepad bridge. No ChatGPT cookies, audio or API keys are read."""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import queue
import secrets
import threading
import time
import tkinter as tk
from tkinter import messagebox, ttk

os.environ.setdefault("SDL_JOYSTICK_ALLOW_BACKGROUND_EVENTS", "1")
os.environ.setdefault("PYGAME_HIDE_SUPPORT_PROMPT", "1")
ROOT = Path(__file__).resolve().parent
PORT = 19836


def load_config():
    path = ROOT / "config.json"
    config = json.loads(path.read_text("utf-8")) if path.exists() else {}
    config.setdefault("token", secrets.token_urlsafe(32))
    config.setdefault("controller_guid", "")
    config.setdefault("controller_name", "")
    config.setdefault("button", None)
    config.setdefault("button_a", 0 if "xbox" in config.get("controller_name", "").lower() else None)
    config.setdefault("button_x", 2 if "xbox" in config.get("controller_name", "").lower() else None)
    save_config(config)
    return config


def save_config(config):
    temporary = ROOT / "config.tmp"
    temporary.write_text(json.dumps(config, ensure_ascii=False, indent=2), "utf-8")
    temporary.replace(ROOT / "config.json")
    # Per-install pairing, kept out of source control. Only binds to loopback.
    (ROOT / "extension" / "local-config.js").write_text(
        "globalThis.LOCAL_CONFIG = " + json.dumps({"port": PORT, "token": config["token"], "mode": "dictation"}) + ";\n", "utf-8"
    )


class EdgeGate:
    """Trigger only a fresh down edge; held keys on reconnect must be released."""
    def __init__(self, debounce=0.35):
        self.previous = True
        self.last = float("-inf")
        self.debounce = debounce

    def update(self, pressed, now):
        rising = bool(pressed) and not self.previous
        self.previous = bool(pressed)
        if rising and now - self.last >= self.debounce:
            self.last = now
            return True
        return False


class RepeatGate(EdgeGate):
    """Wheel-like repeats only after a fresh down edge; never on reconnect hold."""
    def __init__(self, delay=0.35, interval=0.14):
        super().__init__()
        self.delay, self.interval = delay, interval
        self.repeating = False
        self.next_repeat = 0

    def update(self, pressed, now):
        first = super().update(pressed, now)
        if not pressed:
            self.repeating = False
        elif first:
            self.repeating = True
            self.next_repeat = now + self.delay
            return True
        elif self.repeating and now >= self.next_repeat:
            self.next_repeat = now + self.interval
            return True
        return False


def input_gates():
    return {key: RepeatGate() if key in ("up", "down") else EdgeGate() for key in ("b", "a", "x", "up", "down", "left", "right")}


class GamepadWorker(threading.Thread):
    def __init__(self, config, events, commands, action):
        super().__init__(daemon=True, name="gamepad")
        self.config, self.events, self.commands, self.action = config, events, commands, action
        self.stop_event = threading.Event()

    def run(self):
        import pygame
        pygame.display.init()
        pygame.joystick.init()
        joysticks = {}
        active = None
        gates = input_gates()
        calibrating = False
        calibration_previous = []
        last_inventory = None
        last_scan = 0
        try:
            while not self.stop_event.is_set():
                for event in pygame.event.get():
                    if event.type == pygame.JOYDEVICEREMOVED:
                        joysticks.pop(event.instance_id, None)
                if time.monotonic() - last_scan > 1:
                    last_scan = time.monotonic()
                    for i in range(pygame.joystick.get_count()):
                        stick = pygame.joystick.Joystick(i)
                        joysticks.setdefault(stick.get_instance_id(), stick)
                inventory = [(j.get_instance_id(), j.get_name(), j.get_guid(), j.get_numbuttons()) for j in joysticks.values()]
                if inventory != last_inventory:
                    self.events.put(("devices", inventory))
                    last_inventory = inventory
                desired = self.config["controller_guid"]
                candidates = [j for j in joysticks.values() if j.get_guid() == desired] if desired else list(joysticks.values())
                selected = candidates[0] if len(candidates) == 1 else None
                instance = selected.get_instance_id() if selected else None
                if instance != active:
                    was_connected = active is not None
                    active = instance
                    gates = input_gates()
                    calibrating = False
                    self.events.put(("controller", selected.get_name() if selected else ""))
                    if was_connected and selected is None:
                        self.events.put(("notice", "手柄已断开。如语音仍在进行，请在 ChatGPT 中结束。"))
                while True:
                    try:
                        command = self.commands.get_nowait()
                    except queue.Empty:
                        break
                    if command in ("calibrate", "calibrate_a"):
                        if selected:
                            calibrating = "a" if command == "calibrate_a" else "b"
                            calibration_previous = [bool(selected.get_button(n)) for n in range(selected.get_numbuttons())]
                            self.events.put(("notice", f"请松开按键，然后按一次实体 {calibrating.upper()} 键。校准期间不会开启麦克风。"))
                        else:
                            self.events.put(("notice", "请先连接并选择一个手柄。"))
                    elif command == "select":
                        gates = input_gates()
                        calibrating = False
                if selected:
                    buttons = [bool(selected.get_button(n)) for n in range(selected.get_numbuttons())]
                    if calibrating:
                        pressed = [n for n, down in enumerate(buttons) if down and not calibration_previous[n]]
                        if len(pressed) == 1:
                            n = pressed[0]
                            target_key = "button_a" if calibrating == "a" else "button"
                            other_key = "button" if calibrating == "a" else "button_a"
                            if self.config.get(other_key) == n:
                                self.events.put(("notice", "A 和 B 不能设置成同一按键，请按正确的实体键。"))
                                calibration_previous = buttons
                                continue
                            self.config.update({target_key: n, "controller_guid": selected.get_guid(), "controller_name": selected.get_name()})
                            save_config(self.config)
                            gates = input_gates()
                            calibrating = False
                            self.events.put(("calibrated", target_key))
                        calibration_previous = buttons
                    else:
                        now = time.monotonic()
                        for name, config_key, action in (("b", "button", "toggle"), ("a", "button_a", "toggle_current"), ("x", "button_x", "read_aloud")):
                            n = self.config.get(config_key)
                            pressed = n is not None and 0 <= n < len(buttons) and buttons[n]
                            if gates[name].update(pressed, now):
                                self.action(action)
                        horizontal, vertical = selected.get_hat(0) if selected.get_numhats() else (0, 0)
                        for name, pressed, action in (("up", vertical == 1 and horizontal == 0, "scroll_up"), ("down", vertical == -1 and horizontal == 0, "scroll_down"), ("left", horizontal == -1 and vertical == 0, "previous"), ("right", horizontal == 1 and vertical == 0, "next")):
                            if gates[name].update(pressed, now):
                                self.action(action)
                self.stop_event.wait(0.015)
        except Exception:
            logging.exception("Gamepad worker failed")
            self.events.put(("error", "手柄读取失败，详情见 controller.log。"))
        finally:
            pygame.joystick.quit()
            pygame.display.quit()


class Bridge(threading.Thread):
    def __init__(self, token, events):
        super().__init__(daemon=True, name="browser-bridge")
        self.token, self.events = token, events
        self.loop = None
        self.connection = None
        self.pending = None
        self.busy = False
        self.state = "idle"
        self.ready = threading.Event()

    def submit(self, kind):
        if self.loop:
            asyncio.run_coroutine_threadsafe(self.dispatch(kind), self.loop)

    async def dispatch(self, kind):
        if self.busy:
            self.events.put(("notice", "正在处理上一次按键，请稍候。"))
            return
        if self.connection is None:
            self.events.put(("error", "浏览器扩展未连接。请先加载扩展并保持 Chrome 打开。"))
            return
        self.busy = True
        self.events.put(("busy", True))
        request_id = secrets.token_hex(8)
        self.pending = (request_id, asyncio.get_running_loop().create_future())
        try:
            await self.connection.send(json.dumps({"type": "command", "id": request_id, "action": kind}))
            result = await asyncio.wait_for(self.pending[1], timeout=55)
            if result.get('nativeWheel'):
                result = {'ok':False,'state':result.get('state','unknown'),'message':'请重新加载 Q36 扩展至 0.7.0 并刷新 ChatGPT；旧版鼠标滚轮已停用。'}
            self.state = result.get("state", "unknown")
            self.events.put(("voice", self.state))
            self.events.put(("notice" if result.get("ok") else "error", result.get("message", "")))
        except (TimeoutError, ConnectionError):
            self.state = "unknown"
            self.events.put(("voice", "unknown"))
            self.events.put(("error", "没有收到确认。请查看 ChatGPT 的语音状态，再按 B 会先检查已有会话。"))
        except Exception as error:
            logging.exception("Browser command failed")
            self.events.put(("error", str(error)))
        finally:
            self.pending = None
            self.busy = False
            self.events.put(("busy", False))

    async def handle(self, socket):
        from websockets.exceptions import ConnectionClosed
        authenticated = False
        try:
            hello = json.loads(await asyncio.wait_for(socket.recv(), 5))
            if hello.get("type") != "auth" or not secrets.compare_digest(str(hello.get("token", "")), self.token):
                await socket.close(code=1008, reason="Pairing failed")
                return
            if self.connection is not None:
                await socket.close(code=1008, reason="Already paired")
                return
            authenticated = True
            self.connection = socket
            self.events.put(("browser", True))
            await socket.send(json.dumps({"type": "ready"}))
            async for raw in socket:
                payload = json.loads(raw)
                if payload.get("type") == "ping":
                    await socket.send(json.dumps({"type": "pong"}))
                elif payload.get("type") == "result" and self.pending and payload.get("id") == self.pending[0]:
                    if not self.pending[1].done():
                        self.pending[1].set_result(payload)
                elif payload.get("type") == "state":
                    self.state = payload.get("state", "unknown")
                    self.events.put(("voice", self.state))
        except (ConnectionClosed, TimeoutError, ValueError):
            pass
        finally:
            if authenticated:
                self.connection = None
                self.events.put(("browser", False))
                if self.pending and not self.pending[1].done():
                    self.pending[1].set_exception(ConnectionError("Extension disconnected"))

    def run(self):
        async def main():
            from websockets.asyncio.server import serve
            self.loop = asyncio.get_running_loop()
            # No public/LAN listener. Reject web origins before token authentication.
            import re
            try:
                async with serve(self.handle, "127.0.0.1", PORT, origins=[re.compile(r"chrome-extension://[a-p]{32}")], max_size=16384, ping_interval=20):
                    self.ready.set()
                    await asyncio.Future()
            except OSError:
                self.events.put(("fatal", f"端口 {PORT} 已被占用。请检查是否已经启动了控制器。"))
                self.ready.set()
        asyncio.run(main())


class ControllerApp:
    def __init__(self, calibrate=False):
        self.config = load_config()
        self.events = queue.Queue()
        self.commands = queue.Queue()
        self.root = tk.Tk()
        self.root.title("Q36 · ChatGPT 控制器")
        self.root.geometry("680x540")
        self.root.minsize(650, 520)
        self.root.configure(bg="#f5f4ef")
        self.devices = []
        self.busy = False
        self.voice = "idle"
        style = ttk.Style()
        style.theme_use("clam")
        style.configure("TFrame", background="#f5f4ef")
        style.configure("TLabel", background="#f5f4ef", font=("Microsoft YaHei UI", 10))
        style.configure("TButton", font=("Microsoft YaHei UI", 10), padding=8)
        frame = ttk.Frame(self.root, padding=24)
        frame.pack(fill="both", expand=True)
        ttk.Label(frame, text="用手柄，与 ChatGPT 对话", font=("Microsoft YaHei UI", 21, "bold")).pack(anchor="w")
        ttk.Label(frame, text="B：新建对话并录音；再次按 B 停止并发送\nA：当前对话录音；再次按 A 停止并发送\n↑ / ↓：滚动当前对话；← / →：切换最近对话（排除置顶和项目）", padding=(0, 10, 0, 14)).pack(anchor="w")
        self.controller_label = ttk.Label(frame, text="手柄：等待连接")
        self.controller_label.pack(anchor="w", pady=3)
        self.device_box = ttk.Combobox(frame, state="readonly", width=58)
        self.device_box.pack(fill="x", pady=5)
        self.device_box.bind("<<ComboboxSelected>>", self.select_device)
        self.mapping_label = ttk.Label(frame, text=self.mapping_text())
        self.mapping_label.pack(anchor="w", pady=3)
        self.browser_label = ttk.Label(frame, text="浏览器扩展：等待连接")
        self.browser_label.pack(anchor="w", pady=3)
        self.voice_label = ttk.Label(frame, text="语音：未开始", font=("Microsoft YaHei UI", 13, "bold"))
        self.voice_label.pack(anchor="w", pady=10)
        buttons = ttk.Frame(frame)
        buttons.pack(fill="x")
        ttk.Button(buttons, text="校准实体 B 键", command=lambda: self.commands.put("calibrate")).pack(side="left", padx=(0, 8))
        ttk.Button(buttons, text="校准 A 键", command=lambda: self.commands.put("calibrate_a")).pack(side="left", padx=(0, 8))
        self.try_button = ttk.Button(buttons, text="测试 B 键动作", command=lambda: self.bridge.submit("toggle"))
        self.try_button.pack(side="left", padx=(0, 8))
        ttk.Button(buttons, text="安装说明", command=lambda: os.startfile(ROOT / "README.md")).pack(side="left")
        self.notice = tk.StringVar(value="先加载浏览器扩展，连接手柄，再校准一次 B 键。")
        ttk.Label(frame, textvariable=self.notice, wraplength=570, foreground="#525956").pack(anchor="w", pady=14)
        self.bridge = Bridge(self.config["token"], self.events)
        self.bridge.start()
        self.worker = GamepadWorker(self.config, self.events, self.commands, self.bridge.submit)
        self.worker.start()
        if calibrate:
            self.commands.put("calibrate")
        self.root.protocol("WM_DELETE_WINDOW", self.close)
        self.root.after(100, self.consume)

    def mapping_text(self):
        n = self.config["button"]
        a = self.config.get("button_a")
        b_label = "未校准" if n is None else str(n)
        a_label = "未校准" if a is None else str(a)
        return f"按键编号：B = {b_label}   A = {a_label}   方向操作 = 十字键"

    def select_device(self, _=None):
        index = self.device_box.current()
        if 0 <= index < len(self.devices):
            _, name, guid, _ = self.devices[index]
            if guid != self.config["controller_guid"]:
                self.config.update(controller_guid=guid, controller_name=name, button=None, button_a=0 if "xbox" in name.lower() else None)
                save_config(self.config)
            self.commands.put("select")
            self.mapping_label.configure(text=self.mapping_text())

    def consume(self):
        while True:
            try:
                kind, value = self.events.get_nowait()
            except queue.Empty:
                break
            if kind == "devices":
                self.devices = value
                self.device_box["values"] = [f"{name} · {count} 个按键 · ID {instance}" for instance, name, _, count in value]
                matches = [i for i, (_, _, guid, _) in enumerate(value) if guid == self.config["controller_guid"]]
                if len(matches) == 1:
                    self.device_box.current(matches[0])
                elif len(value) == 1:
                    self.device_box.current(0)
                else:
                    self.device_box.set("请选择手柄" if value else "没有检测到手柄，请连接蓝牙或 USB")
            elif kind == "controller":
                self.controller_label.configure(text="手柄：" + (value or "等待连接 / 请选择一个设备"))
            elif kind == "calibrated":
                self.mapping_label.configure(text=self.mapping_text())
                self.notice.set("按键校准完成。请先松开按键，再进行操作。")
            elif kind == "browser":
                self.browser_label.configure(text="浏览器扩展：" + ("已连接" if value else "未连接"))
            elif kind == "busy":
                self.busy = value
                self.try_button.configure(state="disabled" if value else "normal")
                if value:
                    self.voice_label.configure(text="语音：正在处理，请稍候…")
            elif kind == "voice":
                self.voice = value
                label = {"idle": "未开始 / 已停止", "active": "正在录音，再按对应按键发送", "unknown": "状态待确认，请查看 ChatGPT"}.get(value, value)
                self.voice_label.configure(text="语音：" + label)
            elif kind in ("notice", "error"):
                self.notice.set(value)
                logging.info("%s: %s", kind, value)
            elif kind == "fatal":
                messagebox.showerror("无法启动", value)
                self.worker.stop_event.set()
                self.root.destroy()
                return
        self.root.after(100, self.consume)

    def close(self):
        if self.busy:
            self.notice.set("请等本次操作完成后关闭。")
            return
        if self.voice in ("active", "unknown"):
            if self.bridge.connection:
                self.bridge.submit("stop")
                self.notice.set("已请求结束语音。确认“已结束”后，再关闭控制器。")
            else:
                self.notice.set("扩展已断开。请先在 ChatGPT 手动结束语音，再点击关闭。")
                if messagebox.askyesno("确认语音已关闭", "请确认已在 ChatGPT 手动结束语音。现在关闭控制器？"):
                    self.worker.stop_event.set()
                    self.root.destroy()
            return
        self.worker.stop_event.set()
        self.root.destroy()


def run_background():
    """Run the existing bridge and driver without creating a Tk window."""
    config = load_config()
    events, commands = queue.Queue(), queue.Queue()
    bridge = Bridge(config['token'], events)
    bridge.start()
    if not bridge.ready.wait(10):
        logging.error('Background bridge did not start in time')
        return
    # Binding happens before the worker starts, so a repeated launch cannot
    # listen to buttons a second time or produce duplicate commands.
    while not events.empty():
        kind, value = events.get_nowait()
        if kind == 'fatal':
            logging.info('Background launch skipped: %s', value)
            return
    worker = GamepadWorker(config, events, commands, bridge.submit)
    worker.start()
    logging.info('Background controller started (PID %s); no control window', os.getpid())
    try:
        while bridge.is_alive() and worker.is_alive():
            try:
                kind, value = events.get(timeout=1)
            except queue.Empty:
                continue
            if kind in ('controller', 'browser', 'notice', 'error', 'fatal'):
                logging.info('%s: %s', kind, value)
            if kind == 'fatal':
                break
    finally:
        worker.stop_event.set()
        worker.join(timeout=3)
        logging.info('Background controller stopped')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--diagnose", action="store_true")
    parser.add_argument("--prepare", action="store_true")
    parser.add_argument("--calibrate", action="store_true")
    parser.add_argument("--background", action="store_true", help="Run silently without the control window")
    args = parser.parse_args()
    if args.prepare:
        load_config()
        print("Extension pairing file prepared.")
        return
    if args.diagnose:
        import pygame
        pygame.display.init()
        pygame.joystick.init()
        items = []
        for i in range(pygame.joystick.get_count()):
            j = pygame.joystick.Joystick(i)
            items.append({"name": j.get_name(), "guid": j.get_guid(), "buttons": j.get_numbuttons()})
        print(json.dumps(items, ensure_ascii=False, indent=2))
        pygame.quit()
        return
    handler = RotatingFileHandler(ROOT / "controller.log", maxBytes=200000, backupCount=2, encoding="utf-8")
    logging.basicConfig(level=logging.INFO, handlers=[handler], format="%(asctime)s %(message)s")
    if args.background:
        run_background()
        return
    ControllerApp(calibrate=args.calibrate).root.mainloop()


if __name__ == "__main__":
    main()
