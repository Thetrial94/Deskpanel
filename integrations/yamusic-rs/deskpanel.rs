// SPDX-License-Identifier: GPL-3.0-only
// Explicitly enabled local status export for DeskPanel. No account data or tokens.
use crate::player::Shared;
use std::sync::{OnceLock, atomic::{AtomicU64, Ordering}};
use std::time::{SystemTime, UNIX_EPOCH};

pub fn enabled() -> bool {
    static ENABLED: OnceLock<bool> = OnceLock::new();
    *ENABLED.get_or_init(|| std::env::args().any(|arg| arg == "--deskpanel"))
}
pub fn publish(state: &Shared) {
    static LAST: AtomicU64 = AtomicU64::new(0);
    if !enabled() { return; }
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64;
    let last = LAST.load(Ordering::Relaxed);
    if now.saturating_sub(last) < 500 { return; }
    LAST.store(now, Ordering::Relaxed);
    let Some(base) = std::env::var_os("LOCALAPPDATA") else { return; };
    let folder = std::path::PathBuf::from(base).join("DeskPanel");
    if std::fs::create_dir_all(&folder).is_err() { return; }
    let playback = if state.loading { "loading" } else if state.playing { "playing" } else if state.track.is_some() { "paused" } else { "idle" };
    let track = state.track.as_ref().map(|t| serde_json::json!({
        "title": t.title.chars().take(300).collect::<String>(),
        "artist": t.artists.chars().take(300).collect::<String>()
    }));
    let value = serde_json::json!({
        "schemaVersion": 1, "pid": std::process::id(), "updatedAt": now,
        "playback": playback, "volume": (state.volume.clamp(0.0, 1.0) * 100.0).round() as u32,
        "track": track
    });
    let temp = folder.join(format!("music-{}.tmp", std::process::id()));
    if let Ok(bytes) = serde_json::to_vec(&value) {
        if std::fs::write(&temp, bytes).is_ok() {
            let _ = std::fs::rename(&temp, folder.join("music-state.json"));
        }
    }
}
