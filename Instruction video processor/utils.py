from __future__ import annotations

import hashlib
import json
import math
import os
import re
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".avi", ".m4v", ".webm", ".ogg"}
GUITAR_TRAINER_VISIBLE_EXTENSIONS = {".mp4", ".webm", ".ogg", ".mov"}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def epoch_ms() -> int:
    return int(time.time() * 1000)


def ensure_dir(path: str | Path) -> Path:
    target = Path(path)
    target.mkdir(parents=True, exist_ok=True)
    return target


def normalize_relative_path(root: str | Path, path: str | Path) -> str:
    rel = Path(path).resolve().relative_to(Path(root).resolve())
    return rel.as_posix()


def safe_filename(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_.-]+", "_", value).strip("_") or "file"


def seconds_to_hhmmss(seconds: float | int | None) -> str:
    if seconds is None or not math.isfinite(float(seconds)):
        seconds = 0
    total = max(0, int(float(seconds)))
    hours, rem = divmod(total, 3600)
    minutes, secs = divmod(rem, 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def hhmmss_to_seconds(value: str | int | float | None) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    parts = value.strip().split(":")
    try:
        if len(parts) == 3:
            h, m, s = parts
            return int(h) * 3600 + int(m) * 60 + float(s)
        if len(parts) == 2:
            m, s = parts
            return int(m) * 60 + float(s)
        return float(value)
    except ValueError:
        return 0.0


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def clean_tag(tag: str) -> str:
    cleaned = re.sub(r"\s+", " ", tag.strip().lower())
    return cleaned.strip(" ,.;:#")


def normalize_tags(tags: Iterable[str], max_count: int | None = None) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for tag in tags:
        cleaned = clean_tag(str(tag))
        if not cleaned or cleaned in seen:
            continue
        seen.add(cleaned)
        result.append(cleaned)
        if max_count and len(result) >= max_count:
            break
    return result


def json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def json_loads(value: str | bytes | None, default: Any = None) -> Any:
    if not value:
        return default
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return default


def run_command(args: list[str], timeout: int | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        text=True,
        capture_output=True,
        check=False,
        timeout=timeout,
    )


def partial_file_hash(path: str | Path, chunk_size: int = 1024 * 1024, full_hash: bool = False) -> str:
    file_path = Path(path)
    size = file_path.stat().st_size
    hasher = hashlib.sha256()
    hasher.update(str(size).encode("utf-8"))
    hasher.update(str(int(file_path.stat().st_mtime)).encode("utf-8"))

    with file_path.open("rb") as handle:
        if full_hash:
            for chunk in iter(lambda: handle.read(chunk_size), b""):
                hasher.update(chunk)
            return hasher.hexdigest()

        offsets = [0]
        if size > chunk_size * 2:
            offsets.append(max(0, size // 2 - chunk_size // 2))
        if size > chunk_size:
            offsets.append(max(0, size - chunk_size))
        for offset in sorted(set(offsets)):
            handle.seek(offset)
            hasher.update(handle.read(chunk_size))

    return hasher.hexdigest()[:24]


def write_json(path: str | Path, payload: Any) -> Path:
    target = Path(path)
    ensure_dir(target.parent)
    target.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return target


def write_text(path: str | Path, text: str) -> Path:
    target = Path(path)
    ensure_dir(target.parent)
    target.write_text(text, encoding="utf-8")
    return target


def file_mtime_created(path: str | Path) -> tuple[float, float]:
    stat = Path(path).stat()
    return stat.st_ctime, stat.st_mtime


def format_duration(seconds: float | None) -> str:
    if seconds is None:
        return ""
    return seconds_to_hhmmss(seconds)

