"""Durable, versioned transcripts and resumable model decisions outside build outputs."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from uuid import uuid4


def cache_root():
    return Path(os.environ.get("GUITAR_TRAINER_CACHE_DIR") or
                Path(os.environ.get("LOCALAPPDATA") or Path.home()) / "GuitarTrainer" / "processor-cache")


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()


def read_json(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
    try:
        with temporary.open("w", encoding="utf-8") as stream:
            json.dump(value, stream, ensure_ascii=False)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def archive_transcript(source_key, transcript):
    """Content-addressed versions are never pruned or replaced by a different transcript."""
    if not transcript.get("segments"):
        raise ValueError("Cannot archive an empty transcript.")
    folder = cache_root() / "transcripts" / digest(source_key)
    version = digest(transcript)
    target = folder / f"{version}.json"
    if not target.exists():
        atomic_json(target, transcript)
    atomic_json(folder / "latest.json", {"version": version})
    return target


def restore_transcript(source_key):
    folder = cache_root() / "transcripts" / digest(source_key)
    pointer = read_json(folder / "latest.json") or {}
    version = pointer.get("version", "")
    candidates = ([folder / f"{version}.json"] if len(version) == 64 and version.isalnum() else [])
    # Recover even if an interrupted write or manual deletion lost the pointer.
    candidates += sorted(folder.glob("*.json"), key=lambda path: path.stat().st_mtime, reverse=True)
    for path in candidates:
        saved = read_json(path)
        if isinstance(saved, dict) and isinstance(saved.get("segments"), list) and saved["segments"]:
            if digest(saved) == path.stem:
                return saved
    return None
