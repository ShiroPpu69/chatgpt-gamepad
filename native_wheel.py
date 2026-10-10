"""Native mouse wheel for user-triggered gamepad actions, scoped to Chrome/Edge."""
from __future__ import annotations
import ctypes
from ctypes import wintypes
import os
import time


class Point(ctypes.Structure):
    _fields_ = [("x", wintypes.LONG), ("y", wintypes.LONG)]


class Rect(ctypes.Structure):
    _fields_ = [("left", wintypes.LONG), ("top", wintypes.LONG), ("right", wintypes.LONG), ("bottom", wintypes.LONG)]


class MouseInput(ctypes.Structure):
    _fields_ = [("dx", wintypes.LONG), ("dy", wintypes.LONG), ("mouseData", wintypes.DWORD), ("dwFlags", wintypes.DWORD), ("time", wintypes.DWORD), ("dwExtraInfo", ctypes.c_size_t)]


class InputUnion(ctypes.Union):
    # KEYBDINPUT is smaller than MOUSEINPUT on both supported architectures.
    _fields_ = [("mi", MouseInput)]


class Input(ctypes.Structure):
    _fields_ = [("type", wintypes.DWORD), ("payload", InputUnion)]


def screen_point(client_width, client_height, origin_x, origin_y, viewport_width, viewport_height, x, y):
    """Chrome client area includes toolbar; viewport aligns with client bottom."""
    if min(client_width, client_height, viewport_width, viewport_height) <= 0:
        raise ValueError("Invalid browser viewport")
    scale = client_width / viewport_width
    viewport_top = client_height - viewport_height * scale
    point_x = origin_x + x * scale
    point_y = origin_y + viewport_top + y * scale
    if not (origin_x <= point_x < origin_x + client_width and origin_y <= point_y < origin_y + client_height):
        raise ValueError("Wheel point outside browser client area")
    return round(point_x), round(point_y)


def send_wheel(target):
    if os.name != "nt":
        raise RuntimeError("Native wheel requires Windows")
    user = ctypes.WinDLL("user32", use_last_error=True)
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    user.GetForegroundWindow.restype = wintypes.HWND
    user.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
    user.GetClientRect.argtypes = [wintypes.HWND, ctypes.POINTER(Rect)]
    user.ClientToScreen.argtypes = [wintypes.HWND, ctypes.POINTER(Point)]
    user.SendInput.argtypes = [wintypes.UINT, ctypes.POINTER(Input), ctypes.c_int]
    user.SendInput.restype = wintypes.UINT
    user.SetThreadDpiAwarenessContext.argtypes = [ctypes.c_void_p]
    user.SetThreadDpiAwarenessContext.restype = ctypes.c_void_p
    kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.QueryFullProcessImageNameW.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD)]
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    previous_dpi = user.SetThreadDpiAwarenessContext(ctypes.c_void_p(-4))
    try:
        window = user.GetForegroundWindow()
        pid = wintypes.DWORD()
        user.GetWindowThreadProcessId(window, ctypes.byref(pid))
        process = kernel.OpenProcess(0x1000, False, pid.value)
        if not process:
            raise RuntimeError("无法确认当前浏览器窗口。")
        try:
            size = wintypes.DWORD(32768)
            buffer = ctypes.create_unicode_buffer(size.value)
            if not kernel.QueryFullProcessImageNameW(process, 0, buffer, ctypes.byref(size)):
                raise RuntimeError("无法确认当前浏览器进程。")
            if os.path.basename(buffer.value).lower() not in ("chrome.exe", "msedge.exe"):
                raise RuntimeError("浏览器没有在前台，未发送滚轮事件。请回到 ChatGPT 再按上下键。")
        finally:
            kernel.CloseHandle(process)
        rect, origin, old_cursor = Rect(), Point(0, 0), Point()
        if not user.GetClientRect(window, ctypes.byref(rect)) or not user.ClientToScreen(window, ctypes.byref(origin)):
            raise RuntimeError("无法读取浏览器窗口尺寸。")
        point_x, point_y = screen_point(rect.right, rect.bottom, origin.x, origin.y, target["width"], target["height"], target["x"], target["y"])
        user.GetCursorPos(ctypes.byref(old_cursor))
        if user.GetForegroundWindow() != window:
            raise RuntimeError("前台窗口已变化，未发送滚轮事件。")
        if not user.SetCursorPos(point_x, point_y):
            raise RuntimeError("无法将滚轮定位到聊天正文。")
        try:
            delta = 120 if target["direction"] == "scroll_up" else -120
            event = Input(type=0, payload=InputUnion(mi=MouseInput(mouseData=delta & 0xFFFFFFFF, dwFlags=0x0800)))
            if user.SendInput(1, ctypes.byref(event), ctypes.sizeof(Input)) != 1:
                raise RuntimeError("Windows 没有接受滚轮事件。")
            time.sleep(0.025)
        finally:
            current = Point()
            if user.GetCursorPos(ctypes.byref(current)) and (current.x, current.y) == (point_x, point_y):
                user.SetCursorPos(old_cursor.x, old_cursor.y)
        return {"x": point_x, "y": point_y, "delta": delta}
    finally:
        if previous_dpi:
            user.SetThreadDpiAwarenessContext(previous_dpi)
