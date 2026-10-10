# Security and privacy

The Python listener binds to `127.0.0.1:19836`, not the LAN. It accepts Chrome extension origins and requires a randomly generated installation token. The token is created by `setup.ps1` and stored in ignored local files.

The extension runs on `https://chatgpt.com/*`. It examines controls and composer text to coordinate dictation, prevent empty sends, and preserve unsent drafts. Chat content, audio, cookies, and clipboard data are not transmitted to the Python listener. ChatGPT still handles your audio and messages under your existing account; this project does not change that relationship.

No project analytics or third-party telemetry is included. The repository has no API key requirement. Developer dependencies and GitHub Actions use their own upstream services during installation/testing.

Never share `config.json`, `extension/local-config.js`, or a full diagnostic bundle without reviewing it. If a pairing token is exposed, stop the listener, remove the local configuration, rerun setup, recalibrate, and reload the extension.

Report vulnerabilities using GitHub's private vulnerability reporting when available. Avoid posting secrets or working exploits in public issues.
