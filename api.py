from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent
PROFILES_FILE = BASE_DIR / "profiles.json"
STATE_FILE = BASE_DIR / ".selected_profile.json"

app = Flask(__name__, static_folder=None)


def run(cmd: list[str], *, check: bool = True) -> str:
    result = subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=check,
    )
    return result.stdout.strip()


def safe_run(cmd: list[str]) -> str:
    try:
        return run(cmd, check=True)
    except Exception:
        return ""


def command_exists(name: str) -> bool:
    return shutil.which(name) is not None


def load_profiles() -> list[dict[str, Any]]:
    if not PROFILES_FILE.exists():
        return []
    try:
        data = json.loads(PROFILES_FILE.read_text(encoding="utf-8"))
        if isinstance(data, list):
            return data
    except Exception:
        pass
    return []


def load_selected_profile_id() -> str | None:
    if not STATE_FILE.exists():
        return None
    try:
        data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
        return data.get("selected_profile_id")
    except Exception:
        return None


def save_selected_profile_id(profile_id: str) -> None:
    STATE_FILE.write_text(
        json.dumps({"selected_profile_id": profile_id}, indent=2),
        encoding="utf-8",
    )


def normalize_mac(mac: str) -> str:
    return mac.upper().replace(":", "_")


def get_profile_by_id(profile_id: str) -> dict[str, Any] | None:
    for profile in load_profiles():
        if profile.get("id") == profile_id:
            return profile
    return None


def bluetoothctl_cmd(*args: str) -> str:
    return safe_run(["bluetoothctl", *args])


def get_bt_info(mac: str) -> str:
    return bluetoothctl_cmd("info", mac)


def is_profile_connected(profile: dict[str, Any]) -> bool:
    mac = profile.get("mac", "")
    if not mac:
        return False
    info = get_bt_info(mac)
    return "Connected: yes" in info


def trust_and_connect_profile(profile: dict[str, Any]) -> dict[str, Any]:
    mac = profile.get("mac", "")
    if not mac:
        return {"ok": False, "message": "Profile has no MAC address"}

    if not command_exists("bluetoothctl"):
        return {"ok": False, "message": "bluetoothctl is not installed"}

    bluetoothctl_cmd("trust", mac)
    bluetoothctl_cmd("connect", mac)

    sink_result = set_default_sink_for_mac(mac)

    connected = is_profile_connected(profile)
    message = "Connected" if connected else "Connection attempt sent"

    if sink_result:
        message += f"; sink: {sink_result}"

    return {"ok": True, "message": message, "connected": connected}


def list_sinks() -> list[str]:
    if not command_exists("pactl"):
        return []
    output = safe_run(["pactl", "list", "short", "sinks"])
    if not output:
        return []
    return output.splitlines()


def set_default_sink_for_mac(mac: str) -> str:
    normalized = normalize_mac(mac)
    for line in list_sinks():
        if normalized in line.upper():
            parts = line.split()
            if len(parts) >= 2:
                sink_name = parts[1]
                safe_run(["pactl", "set-default-sink", sink_name])
                return sink_name
    return ""


def list_players() -> list[str]:
    if not command_exists("playerctl"):
        return []
    output = safe_run(["playerctl", "-l"])
    if not output:
        return []
    return [line.strip() for line in output.splitlines() if line.strip()]


def resolve_player_for_selected_profile() -> str | None:
    selected_id = load_selected_profile_id()
    profile = get_profile_by_id(selected_id) if selected_id else None
    players = list_players()

    if profile:
        mac = profile.get("mac", "")
        if mac:
            needle = normalize_mac(mac)
            for player in players:
                if needle in player.upper():
                    return player

    for player in players:
        if "bluez" in player.lower():
            return player

    return players[0] if players else None


def playerctl(player: str | None, *args: str) -> str:
    if not command_exists("playerctl"):
        return ""
    cmd = ["playerctl"]
    if player:
        cmd += ["-p", player]
    cmd += list(args)
    return safe_run(cmd)


def get_now_playing() -> dict[str, Any]:
    player = resolve_player_for_selected_profile()
    if not player:
        return {
            "title": "",
            "artist": "",
            "album": "",
            "art_url": "",
            "is_playing": False,
            "position": 0,
            "duration": 0,
            "player": "",
        }

    status = playerctl(player, "status")
    title = playerctl(player, "metadata", "xesam:title")
    artist = playerctl(player, "metadata", "xesam:artist")
    album = playerctl(player, "metadata", "xesam:album")
    art_url = playerctl(player, "metadata", "mpris:artUrl")
    position = playerctl(player, "position")
    length = playerctl(player, "metadata", "mpris:length")

    try:
        pos_seconds = float(position)
    except Exception:
        pos_seconds = 0.0

    try:
        duration_seconds = int(length) / 1_000_000
    except Exception:
        duration_seconds = 0.0

    return {
        "title": title,
        "artist": artist,
        "album": album,
        "art_url": art_url,
        "is_playing": status.lower() == "playing",
        "position": pos_seconds,
        "duration": duration_seconds,
        "player": player,
    }


def control_player(action: str) -> bool:
    player = resolve_player_for_selected_profile()
    if not player:
        return False

    action_map = {
        "previous": "previous",
        "playpause": "play-pause",
        "next": "next",
    }
    player_action = action_map.get(action)
    if not player_action:
        return False

    try:
        subprocess.run(
            ["playerctl", "-p", player, player_action],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return True
    except Exception:
        return False


def profiles_payload() -> dict[str, Any]:
    profiles = load_profiles()
    selected_id = load_selected_profile_id()

    enriched = []
    for profile in profiles:
        enriched.append(
            {
                **profile,
                "connected": is_profile_connected(profile),
            }
        )

    return {
        "profiles": enriched,
        "selected_profile_id": selected_id,
    }


@app.get("/")
def root():
    return send_from_directory(BASE_DIR, "index.html")


@app.get("/css/<path:filename>")
def css_files(filename: str):
    return send_from_directory(BASE_DIR / "css", filename)


@app.get("/js/<path:filename>")
def js_files(filename: str):
    return send_from_directory(BASE_DIR / "js", filename)


@app.get("/api/profiles")
def api_profiles():
    return jsonify(profiles_payload())


@app.post("/api/profile/select")
def api_profile_select():
    data = request.get_json(silent=True) or {}
    profile_id = data.get("id", "")
    profile = get_profile_by_id(profile_id)

    if not profile:
        return jsonify({"ok": False, "message": "Profile not found"}), 404

    save_selected_profile_id(profile_id)
    result = trust_and_connect_profile(profile)

    return jsonify(
        {
            **result,
            **profiles_payload(),
        }
    )


@app.get("/now")
def api_now():
    return jsonify(get_now_playing())


@app.post("/control/<action>")
def api_control(action: str):
    ok = control_player(action)
    return ("", 204) if ok else ("", 503)


@app.get("/favicon.ico")
def favicon():
    return ("", 204)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=False)