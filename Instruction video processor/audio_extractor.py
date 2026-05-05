from __future__ import annotations

from pathlib import Path

from utils import ensure_dir, run_command


class AudioExtractionError(RuntimeError):
    pass


def extract_audio(video_path: str | Path, output_path: str | Path, *, sample_rate: int = 16000) -> Path:
    target = Path(output_path)
    ensure_dir(target.parent)
    args = [
        "ffmpeg",
        "-y",
        "-i",
        str(video_path),
        "-vn",
        "-ac",
        "1",
        "-ar",
        str(sample_rate),
        "-f",
        "wav",
        str(target),
    ]
    result = run_command(args, timeout=None)
    if result.returncode != 0:
        raise AudioExtractionError(result.stderr.strip() or "ffmpeg audio extraction failed")
    return target

