# Opt-in DeskPanel bridge

Base: SpolzerMod/yamusic-rs v1.0.2, commit 04c757400595fdcd2b7d8b78d87e03e6d95ebeab (GPL-3.0-only).

Apply patch.py to an exact source checkout. The patch fails if an expected source location is absent or ambiguous. Build with the existing Cargo.lock. The music-client.yml workflow builds and tests the patched source on Windows and packages the executable, checksum, upstream license and patch sources.

Start the executable with --deskpanel. The bridge publishes only current playback, volume and title/artist, never the account or authentication state. The volume message WM_APP+3 is accepted only when explicitly enabled. Existing playback hotkeys remain unchanged.

The status file is local and opt-in. A fixed allowlist constructs its payload. No HTTP listener or remote command execution is added to the music client. The DeskPanel Node server handles the limited LAN-facing command endpoint.

Updating to an upstream binary removes this extension. Keep the original executable as a rollback copy. DeskPanel validates current PID and freshness before enabling stateful controls.
