"""Apply the DeskPanel opt-in bridge to the pinned upstream v1.0.2 source."""
from pathlib import Path
import shutil
import sys
root = Path(sys.argv[1]).resolve()
def replace(name, before, after):
    path = root / name
    source = path.read_text(encoding="utf-8")
    if source.count(before) != 1:
        raise SystemExit("Unexpected upstream source: " + name)
    path.write_text(source.replace(before, after), encoding="utf-8")
replace("src/main.rs", "mod discord;", "mod discord;\nmod deskpanel;")
replace("src/player.rs", "        s.upcoming = upcoming;", "        s.upcoming = upcoming;\n        crate::deskpanel::publish(&s);")
replace("src/tray.rs", "    PlayPause,\n", "    PlayPause,\n    Volume(u8),\n")
replace("src/tray.rs", "        WM_HOTKEY => {", """        0x8003 if crate::deskpanel::enabled() && wp <= 100 => {
            emit(Event::Volume(wp as u8));
            0
        }
        WM_HOTKEY => {""")
replace("src/gui.rs", "                Event::PlayPause => ui.global::<App>().invoke_play_pause(),", """                Event::PlayPause => ui.global::<App>().invoke_play_pause(),
                Event::Volume(value) => ui.global::<App>().invoke_set_volume(value as f32 / 100.0),""")
shutil.copyfile(Path(__file__).with_name("deskpanel.rs"), root / "src/deskpanel.rs")
print("Applied DeskPanel state and volume bridge to yamusic-rs v1.0.2.")
