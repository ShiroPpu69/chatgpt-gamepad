# Contributing

Small, reproducible fixes and controller compatibility reports are welcome.

Install Python 3.12+, Node.js 22+, and the dependencies:

```powershell
./setup.ps1
npm ci --ignore-scripts
npm test
./.venv/Scripts/python.exe -m unittest discover -s tests -v
```

For a UI fix, include a minimal anonymized DOM fixture that reproduces the issue. Test dictation versus live voice, confirmation versus cancellation, and Recent versus pinned/project conversations. Scrolling must support normal and reverse coordinates, preserve manual scrolling, and avoid mouse/keyboard injection.

For a controller report, include its model, connection mode, Windows/Chrome versions, and `controller.py --diagnose` output. A gamepad being visible to Windows does not by itself establish full compatibility.

Keep pairing files, device identifiers, logs, chat screenshots, and credentials out of commits. See [SECURITY.md](SECURITY.md). PRs should explain the user-visible change and how it was verified.
