from pathlib import Path
from flask import Flask, jsonify, send_from_directory, request
import subprocess

BASE_DIR = Path("/home/y/clock")
app = Flask(__name__, static_folder=None)

def run(cmd: list[str]) -> str:
    return subprocess.check_output(cmd, stderr=subprocess.DEVNULL).decode().strip()

def safe_run(cmd: list[str]) -> str:
    try:
        return run(cmd)
    except Exception:
        return ""

def get_now_playing() -> dict:
    # Try common player names first
    players = ["spotifyd", "spotify", "librespot", "vlc", "chromium"]

    chosen = None
    for p in players:
        status = safe_run(["playerctl", "-p", p, "status"])
        if status:
            chosen = p
            break

    if not chosen:
        # fallback: default playerctl target
        status = safe_run(["playerctl", "status"])
        if not status:
            return {
                "title": "",
                "artist": "",
                "album": "",
                "is_playing": False,
                "position": 0,
                "duration": 0,
            }

        title = safe_run(["playerctl", "metadata", "xesam:title"])
        artist = safe_run(["playerctl", "metadata", "xesam:artist"])
        album = safe_run(["playerctl", "metadata", "xesam:album"])
        art_url = safe_run(["playerctl", "metadata", "mpris:artUrl"])
        position_us = safe_run(["playerctl", "position", "--format", "{{ position }}"])
        length_us = safe_run(["playerctl", "metadata", "mpris:length"])
    else:
        status = safe_run(["playerctl", "-p", chosen, "status"])
        title = safe_run(["playerctl", "-p", chosen, "metadata", "xesam:title"])
        artist = safe_run(["playerctl", "-p", chosen, "metadata", "xesam:artist"])
        album = safe_run(["playerctl", "-p", chosen, "metadata", "xesam:album"])
        art_url = safe_run(["playerctl", "-p", chosen, "metadata", "mpris:artUrl"])
        position_us = safe_run(["playerctl", "-p", chosen, "position", "--format", "{{ position }}"])
        length_us = safe_run(["playerctl", "-p", chosen, "metadata", "mpris:length"])

    def parse_position_seconds(value: str) -> float:
        # playerctl position is often like 12.345678
        try:
            return float(value)
        except Exception:
            return 0.0

    def parse_length_seconds(value: str) -> float:
        # mpris:length is usually microseconds
        try:
            return int(value) / 1_000_000
        except Exception:
            return 0.0

    return {
        "title": title,
        "artist": artist,
        "album": album,
        "art_url": art_url,
        "is_playing": status.lower() == "playing",
        "position": parse_position_seconds(position_us),
        "duration": parse_length_seconds(length_us),
    }

@app.get("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")

@app.get("/css/<path:filename>")
def css(filename: str):
    return send_from_directory(BASE_DIR / "css", filename)

@app.get("/js/<path:filename>")
def js(filename: str):
    return send_from_directory(BASE_DIR / "js", filename)

@app.get("/now")
def now():
    return jsonify(get_now_playing())

def send_playerctl(action: str) -> None:
    players = ["spotifyd", "spotify", "librespot"]
    for p in players:
        try:
            subprocess.run(["playerctl", "-p", p, action], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return
        except Exception:
            pass
    subprocess.run(["playerctl", action], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

@app.post("/control/previous")
def previous():
    send_playerctl("previous")
    return ("", 204)

@app.post("/control/playpause")
def playpause():
    send_playerctl("play-pause")
    return ("", 204)

@app.post("/control/next")
def next_track():
    send_playerctl("next")
    return ("", 204)

@app.get("/favicon.ico")
def favicon():
    return ("", 204)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=False)