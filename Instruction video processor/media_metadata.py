from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from utils import run_command


class MediaToolError(RuntimeError):
    pass


def probe_media(path: str | Path) -> dict[str, Any]:
    args = [
        "ffprobe",
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(path),
    ]
    result = run_command(args, timeout=120)
    if result.returncode != 0:
        raise MediaToolError(result.stderr.strip() or "ffprobe failed")
    payload = json.loads(result.stdout or "{}")
    streams = payload.get("streams", [])
    video_stream = next((s for s in streams if s.get("codec_type") == "video"), {})
    audio_stream = next((s for s in streams if s.get("codec_type") == "audio"), {})
    duration = payload.get("format", {}).get("duration") or video_stream.get("duration")
    fps = _parse_fps(video_stream.get("avg_frame_rate") or video_stream.get("r_frame_rate"))
    return {
        "duration_seconds": float(duration) if duration else None,
        "video_codec": video_stream.get("codec_name"),
        "audio_codec": audio_stream.get("codec_name"),
        "width": video_stream.get("width"),
        "height": video_stream.get("height"),
        "fps": fps,
        "has_audio": bool(audio_stream),
    }


def _parse_fps(value: str | None) -> float | None:
    if not value or value == "0/0":
        return None
    if "/" in value:
        num, den = value.split("/", 1)
        try:
            denominator = float(den)
            return float(num) / denominator if denominator else None
        except ValueError:
            return None
    try:
        return float(value)
    except ValueError:
        return None

