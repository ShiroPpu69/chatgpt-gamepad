# Changelog

## 0.8.1

- Recognize newer assistant-role markers and grouped turn containers for native Read aloud.
- Exclude the earlier user-message footer when user and assistant share one group.
- Add regression fixtures for the new renderer (73 JavaScript tests).

## 0.8.0

- X invokes ChatGPT native Read aloud on the latest assistant reply, supporting a direct action or the reply’s More menu.
- Recording blocks playback to avoid recording the read-aloud output.
- Xbox-mode X defaults to SDL button 2, with edge-only triggering.
- Background recovery task checks every minute after installation.

## 0.7.1 — first public release

- B creates a fresh ChatGPT conversation and starts dictation; pressing it again confirms transcription and sends it.
- A starts dictation in the current conversation; pressing it again sends it there.
- Up/down smoothly scroll the conversation without mouse or keyboard injection, including reverse layouts with negative scroll offsets.
- Left/right navigate ordinary conversations in Recent, excluding known pinned and project conversations.
- Controls become available when the required UI appears, without waiting for all page resources.
- Windows login startup and a silent background listener remove the need to open the controller window each session.
- Local pairing, calibrated A/B buttons, 65 JavaScript tests and 14 Python tests.

The implementation was verified by its first user with a SHANWAN Q36XDV in X mode on Windows and Chrome. Other controllers need compatibility testing.
