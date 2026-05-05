from __future__ import annotations

from pathlib import Path

from database import ProcessorDB
from utils import ensure_dir, run_command


class EmbedError(RuntimeError):
    pass


def embed_chapters_copy(db: ProcessorDB, video_id: int, output_folder: str | Path) -> Path:
    video = db.get_video(video_id)
    if not video:
        raise EmbedError(f"Video not found: {video_id}")
    ffmetadata_path = video["ffmetadata_path"]
    if not ffmetadata_path or not Path(ffmetadata_path).exists():
        raise EmbedError("FFMETADATA file is missing. Process the video first.")
    source = Path(video["absolute_path"])
    target_dir = ensure_dir(Path(output_folder) / "chaptered_videos")
    target = target_dir / source.name
    if target.exists():
        stem = source.stem
        target = target_dir / f"{stem}.chaptered{source.suffix}"
    args = [
        "ffmpeg",
        "-y",
        "-i",
        str(source),
        "-i",
        str(ffmetadata_path),
        "-map_metadata",
        "1",
        "-codec",
        "copy",
        str(target),
    ]
    result = run_command(args, timeout=None)
    if result.returncode != 0:
        raise EmbedError(result.stderr.strip() or "ffmpeg chapter embedding failed")
    return target

