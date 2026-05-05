from __future__ import annotations

import csv
from pathlib import Path
from typing import Any

from database import ProcessorDB
from utils import ensure_dir, json_dumps, seconds_to_hhmmss, write_json, write_text


def save_chapter_files(video_id: int, chapters: list[dict[str, Any]], output_folder: str | Path) -> dict[str, Path]:
    base = Path(output_folder) / "chapters"
    json_path = base / f"{video_id}_chapters.json"
    txt_path = base / f"{video_id}_chapters.txt"
    youtube_path = base / f"{video_id}_youtube.txt"
    ffmetadata_path = base / f"{video_id}_ffmetadata.txt"
    write_json(json_path, {"chapters": chapters})
    txt_lines = []
    youtube_lines = []
    for chapter in chapters:
        start = seconds_to_hhmmss(chapter["start_seconds"])
        end = seconds_to_hhmmss(chapter.get("end_seconds", chapter["start_seconds"]))
        txt_lines.append(f"[{start} - {end}] {chapter['title']}\n{chapter.get('summary', '')}")
        youtube_lines.append(f"{start} {chapter['title']}")
    write_text(txt_path, "\n\n".join(txt_lines) + ("\n" if txt_lines else ""))
    write_text(youtube_path, "\n".join(youtube_lines) + ("\n" if youtube_lines else ""))
    write_text(ffmetadata_path, build_ffmetadata(chapters))
    return {
        "json": json_path,
        "txt": txt_path,
        "youtube": youtube_path,
        "ffmetadata": ffmetadata_path,
    }


def build_ffmetadata(chapters: list[dict[str, Any]]) -> str:
    lines = [";FFMETADATA1", ""]
    for chapter in chapters:
        start_ms = int(float(chapter["start_seconds"]) * 1000)
        end_ms = int(float(chapter.get("end_seconds", chapter["start_seconds"])) * 1000)
        title = str(chapter["title"]).replace("\n", " ").replace("=", "-")
        lines.extend(
            [
                "[CHAPTER]",
                "TIMEBASE=1/1000",
                f"START={start_ms}",
                f"END={end_ms}",
                f"title={title}",
                "",
            ]
        )
    return "\n".join(lines)


def export_data(db: ProcessorDB, output_folder: str | Path, export_format: str) -> list[Path]:
    exports_dir = ensure_dir(Path(output_folder) / "exports")
    if export_format == "csv":
        return _export_csv(db, exports_dir)
    if export_format == "json":
        path = exports_dir / "metadata.json"
        payload = _metadata_payload(db)
        write_json(path, payload)
        return [path]
    if export_format == "markdown":
        path = exports_dir / "metadata.md"
        write_text(path, _metadata_markdown(db))
        return [path]
    raise ValueError(f"Unsupported export format: {export_format}")


def _export_csv(db: ProcessorDB, exports_dir: Path) -> list[Path]:
    videos_path = exports_dir / "videos.csv"
    chapters_path = exports_dir / "chapters.csv"
    segments_path = exports_dir / "segments.csv"
    videos = db.list_videos()
    with videos_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "video_id",
                "filename",
                "relative_path",
                "absolute_path",
                "duration",
                "status",
                "global_tags",
                "chapter_count",
                "segment_count",
                "transcript_path",
                "chapters_json_path",
                "youtube_chapters_path",
            ],
        )
        writer.writeheader()
        for video in videos:
            video_id = video["video_id"]
            writer.writerow(
                {
                    "video_id": video_id,
                    "filename": video["filename"],
                    "relative_path": video["relative_path"],
                    "absolute_path": video["absolute_path"],
                    "duration": video["duration_seconds"],
                    "status": video["status"],
                    "global_tags": ", ".join(db.fetch_video_tags(video_id)),
                    "chapter_count": len(db.fetch_chapters(video_id)),
                    "segment_count": len(db.fetch_timeline(video_id, "segments")),
                    "transcript_path": video["transcript_path"],
                    "chapters_json_path": video["chapters_json_path"],
                    "youtube_chapters_path": video["youtube_chapters_path"],
                }
            )
    with chapters_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "video_id",
                "filename",
                "relative_path",
                "chapter_start",
                "chapter_end",
                "chapter_title",
                "chapter_summary",
                "chapter_tags",
                "confidence",
            ],
        )
        writer.writeheader()
        for video in videos:
            for chapter in db.fetch_chapters(video["video_id"]):
                writer.writerow(
                    {
                        "video_id": video["video_id"],
                        "filename": video["filename"],
                        "relative_path": video["relative_path"],
                        "chapter_start": chapter["start_seconds"],
                        "chapter_end": chapter["end_seconds"],
                        "chapter_title": chapter["title"],
                        "chapter_summary": chapter["summary"],
                        "chapter_tags": ", ".join(db.fetch_chapter_tags(video["video_id"], chapter["chapter_index"])),
                        "confidence": chapter["confidence"],
                    }
                )
    with segments_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "video_id",
                "filename",
                "relative_path",
                "segment_start",
                "segment_end",
                "segment_type",
                "segment_title",
                "segment_summary",
                "segment_tags",
                "confidence",
                "evidence",
            ],
        )
        writer.writeheader()
        for video in videos:
            for segment in db.fetch_timeline(video["video_id"], "segments"):
                writer.writerow(
                    {
                        "video_id": video["video_id"],
                        "filename": video["filename"],
                        "relative_path": video["relative_path"],
                        "segment_start": segment["start_seconds"],
                        "segment_end": segment["end_seconds"],
                        "segment_type": segment["segment_type"],
                        "segment_title": segment["title"],
                        "segment_summary": segment["summary"],
                        "segment_tags": segment["tags"],
                        "confidence": segment["confidence"],
                        "evidence": segment["source_evidence"],
                    }
                )
    return [videos_path, chapters_path, segments_path]


def _metadata_payload(db: ProcessorDB) -> dict[str, Any]:
    videos_payload = []
    for video in db.list_videos():
        video_id = video["video_id"]
        videos_payload.append(
            {
                **dict(video),
                "tags": db.fetch_video_tags(video_id),
                "chapters": [dict(row) for row in db.fetch_chapters(video_id)],
                "segments": [dict(row) for row in db.fetch_timeline(video_id, "segments")],
            }
        )
    return {"videos": videos_payload}


def _metadata_markdown(db: ProcessorDB) -> str:
    lines = ["# Video Metadata", ""]
    for video in db.list_videos():
        lines.append(f"## {video['filename']}")
        lines.append(f"- Path: `{video['relative_path']}`")
        lines.append(f"- Duration: {seconds_to_hhmmss(video['duration_seconds'] or 0)}")
        lines.append(f"- Status: {video['status']}")
        tags = ", ".join(db.fetch_video_tags(video["video_id"]))
        if tags:
            lines.append(f"- Tags: {tags}")
        for chapter in db.fetch_chapters(video["video_id"]):
            lines.append(
                f"- {seconds_to_hhmmss(chapter['start_seconds'])} {chapter['title']}: {chapter['summary'] or ''}"
            )
        lines.append("")
    return "\n".join(lines)

