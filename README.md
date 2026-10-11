<p align="center"><img src="docs/assets/hero.svg" alt="ChatGPT Gamepad — Talk. Send. Scroll. One tiny controller." width="100%"></p>

<p align="center">
  <a href="https://github.com/ShiroPpu69/chatgpt-gamepad/actions/workflows/test.yml"><img alt="Tests" src="https://github.com/ShiroPpu69/chatgpt-gamepad/actions/workflows/test.yml/badge.svg"></a>
  <img alt="Windows" src="https://img.shields.io/badge/Windows-10%20%2F%2011-2563eb">
  <img alt="Chrome" src="https://img.shields.io/badge/Chrome-116%2B-34a853">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-f59e0b"></a>
</p>
<p align="center"><b>English</b> · <a href="README.zh-CN.md">简体中文</a> · <a href="https://shiroppu69.github.io/chatgpt-gamepad/">Interactive guide</a> · <a href="https://github.com/ShiroPpu69/chatgpt-gamepad/releases/latest">Download</a></p>

# Give ChatGPT a controller.

Turn a little Bluetooth gamepad into a remote for the ChatGPT website. Press **B**, speak, press **B** again to send. Use **A** to keep talking in the current chat. Scroll long answers and browse recent conversations with the D-pad.

**Your existing ChatGPT account. No API key. No mouse juggling.**

Built and tested with a **SHANWAN Q36XDV in X mode**, on Windows and Chrome. Other SDL-compatible gamepads may work after calibration, but are not yet verified.

## One thumb, six controls

| Button | What it does |
| :--- | :--- |
| **B** | New chat + dictation → press again to stop, transcribe, and send |
| **A** | Dictation in the current chat → press again to stop, transcribe, and send |
| **X** | Read the latest assistant reply with ChatGPT’s native action; press again to stop |
| **↑ / ↓** | Smoothly scroll the conversation; hold to keep moving |
| **← / →** | Previous / next ordinary conversation in Recent |

After sending with B, the next B starts another **fresh chat**. A keeps you in the same conversation. End recording with the button that started it.

Dictation is ChatGPT's **speech-to-text microphone**, not its live voice-call mode. This project sends the resulting text prompt; it does not provide spoken replies.

## Why a gamepad?

Keep a tiny remote beside you while thinking out loud, reading a long answer, or moving through your recent chats. The two main actions stay easy to remember: **B begins a new conversation; A adds to this one.**

- **Start speaking sooner.** The extension activates when the required control becomes available, without waiting for the whole page to finish loading.
- **Read without moving the pointer.** Scrolling uses the webpage's own container and animation frames, including ChatGPT's reverse scroll layout.
- **Navigate the useful list.** Left/right use Recent, excluding known pinned and project conversations. Unsent text and active recordings block navigation.
- **Keep the setup out of the way.** Once calibrated, the listener can start silently when you sign in to Windows.
- **Use what you already have.** No API subscription or separate project account; normal ChatGPT account limits still apply.

## Quick start

**Requirements:** Windows 10/11, Chrome 116+, Python 3.12+, a logged-in ChatGPT account with dictation available, and a microphone. Node.js is only needed for development.

1. Download the [latest release](https://github.com/ShiroPpu69/chatgpt-gamepad/releases/latest) ZIP and extract it into a permanent folder. Or clone this repository.
2. Open PowerShell in that folder and run:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\setup.ps1
   ```

   This installs the Python dependencies and generates a **unique local pairing token**.
3. In Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select this project's `extension` folder.
4. Double-click `启动控制器.vbs`. Connect your gamepad, select it if necessary, and click **校准实体 B 键** (calibrate B). Release the key, then press B once. Calibrate A if its default mapping is wrong.
5. Open ChatGPT in Chrome and sign in. Allow microphone access when requested. Press B, speak, then press B again.

The control window currently uses Chinese labels. The [Chinese guide](README.zh-CN.md) includes the same steps in Chinese.

### Run without a controller window

After calibration, **close the control window after recording has ended**, then run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\setup-background.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\start-background.ps1
```

The listener now runs silently and starts again at your next Windows sign-in. Keep Chrome open; its extension reconnects automatically. Check connection status in the extension popup. Keep the project folder in place.

The setup script also attempts to register a Windows task that checks every minute and restores an exited listener. Duplicate launches do not start a second gamepad poller. If task registration is denied, login startup remains installed and a warning is shown. A disconnected listener in the popup refers to the local bridge, not Bluetooth pairing; run `start-background.ps1` to restore it immediately.

To disable login startup, run `setup-background.ps1 -Disable`. The current background process continues until you sign out. To recalibrate, stop this project's background `pythonw.exe` first, then open the original control window.

## Q36 Bluetooth tip

Set the physical switch to **X** and pair `Xbox Wireless Controller` once. For later sessions, use the **Home/reconnect button**; the blue light should become steady. Pair is for entering pairing mode. A saved Bluetooth entry does not necessarily mean the gamepad is online.

## What to expect

- This is an **unofficial prototype**, not a Chrome Web Store extension or an OpenAI product.
- ChatGPT's website changes. Semantic control matching and regression tests help, but a layout update can require an extension update. Reload the extension and refresh ChatGPT after updates.
- Left/right follow the currently loaded Recent list; they do not traverse projects, pinned chats, or an entire archived history. Boundaries do not wrap.
- Use the D-pad; analog sticks and Y have no actions assigned. Hold-to-repeat applies only to up/down.
- The extension prefers the current ChatGPT tab in Chrome's last focused window; if none is selected, it falls back to its remembered ChatGPT tab. Close extra tabs if the target seems wrong.
- Sending waits for non-empty transcription and an enabled send control. It will not intentionally send an empty message or blindly retry a send that may have succeeded.
- If the extension or listener disconnects during recording, **stop the microphone in ChatGPT itself**. Bluetooth pairing and microphone permission still belong to Windows/Chrome.

## How it works

```text
Bluetooth gamepad → Python / SDL listener → authenticated localhost bridge
                 → Chrome extension → ChatGPT controls + direct DOM scrolling
```

The bridge listens only on `127.0.0.1:19836` and requires the per-install token. The extension examines the input and controls to coordinate dictation and sends; chat content, audio, cookies, and clipboard data are not copied to the Python listener. There is no project analytics. [Security and privacy](SECURITY.md).

## Development

```powershell
npm ci --ignore-scripts
npm test
./.venv/Scripts/python.exe -m unittest discover -s tests -v
./.venv/Scripts/python.exe controller.py --diagnose
```

**77 JavaScript tests + 14 Python tests** cover control matching, safe send behavior, recent-history filtering, repeat gates, and normal/reverse scroll coordinates. Windows CI runs both suites. Physical-device compatibility still needs real hardware testing.

Compatibility reports and small fixes are welcome. See [Contributing](CONTRIBUTING.md), [Changelog](CHANGELOG.md), or [open an issue](https://github.com/ShiroPpu69/chatgpt-gamepad/issues/new/choose). If this gives your little gamepad a new job, a ⭐ helps other people find it.

## Credits

Independent implementation, inspired by [AntiMicroX](https://github.com/AntiMicroX/antimicrox), [stadia-macos-controller](https://github.com/AdithyanI/stadia-macos-controller), and [ONE voice](https://github.com/kaikisegfault/one-voice-chrome-extension). The negative-scroll fix references the layout investigation in [ChatGPT Scroll Fix](https://github.com/soshroom/chatgpt-scroll-fix) and [MDN scrollTop](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollTop); it does not apply that project's CSS/prototype proxy.

[MIT](LICENSE) · Not affiliated with OpenAI, SHANWAN, or Microsoft. Product names belong to their respective owners.
