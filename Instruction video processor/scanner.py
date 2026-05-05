from __future__ import annotations

from pathlib import Path
from typing import Any

from media_metadata import MediaToolError, probe_media
from utils import VIDEO_EXTENSIONS, file_mtime_created, normalize_relative_path, partial_file_hash


def scan_videos(root_folder: str | Path, *, full_hash: bool = False, include_media: bool = True) -> list[dict[str, Any]]:
    root = Path(root_folder).resolve()
    if not root.exists():
        raise FileNotFoundError(f"Root folder does not exist: {root}")
    if not root.is_dir():
        raise NotADirectoryError(f"Root path is not a folder: {root}")

    videos: list[dict[str, Any]] = []
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in VIDEO_EXTENSIONS:
            continue
        created, modified = file_mtime_created(path)
        relative_path = normalize_relative_path(root, path)
        item: dict[str, Any] = {
            "absolute_path": str(path.resolve()),
            "relative_path": relative_path,
            "filename": path.name,
            "parent_folder": Path(relative_path).parent.as_posix() if Path(relative_path).parent.as_posix() != "." else "",
            "extension": path.suffix.lower(),
            "file_size": path.stat().st_size,
            "created_time": created,
            "modified_time": modified,
            "hash": partial_file_hash(path, full_hash=full_hash),
            "duration_seconds": None,
            "video_codec": None,
            "audio_codec": None,
            "width": None,
            "height": None,
            "fps": None,
            "has_audio": None,
            "metadata_error": None,
        }
        if include_media:
            try:
                item.update(probe_media(path))
            except (MediaToolError, FileNotFoundError) as exc:
                item["metadata_error"] = str(exc)
        videos.append(item)
    return videos

