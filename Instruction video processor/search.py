from __future__ import annotations

from typing import Any

from rich.table import Table

from database import ProcessorDB
from utils import json_loads, seconds_to_hhmmss


def search_metadata(
    db: ProcessorDB,
    query: str | None = None,
    *,
    tag: str | None = None,
    segment_type: str | None = None,
    status: str | None = None,
    folder: str | None = None,
    unprocessed: bool = False,
) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    videos = db.list_videos()
    query_low = query.lower() if query else None
    tag_low = tag.lower() if tag else None
    folder_low = folder.lower() if folder else None

    for video in videos:
        if status and video["status"] != status:
            continue
        if unprocessed and video["status"] == "processed":
            continue
        if folder_low and folder_low not in (video["parent_folder"] or "").lower():
            continue

        video_tags = db.fetch_video_tags(video["video_id"])
        if tag_low and tag_low not in [t.lower() for t in video_tags]:
            continue

        base_text = " ".join(
            [
                video["filename"],
                video["relative_path"],
                video["parent_folder"],
                " ".join(video_tags),
            ]
        ).lower()
        if query_low and query_low in base_text:
            results.append(_result(video, "video", "", 0, video_tags))

        for chapter in db.fetch_chapters(video["video_id"]):
            chapter_tags = db.fetch_chapter_tags(video["video_id"], chapter["chapter_index"])
            text = " ".join([chapter["title"] or "", chapter["summary"] or "", " ".join(chapter_tags)]).lower()
            if (query_low and query_low in text) or (tag_low and tag_low in [t.lower() for t in chapter_tags]):
                results.append(
                    _result(video, "chapter", chapter["title"], chapter["start_seconds"], chapter_tags or video_tags)
                )

        for segment in db.fetch_timeline(video["video_id"], "segments"):
            segment_tags = json_loads(segment["tags"], [])
            text = " ".join(
                [
                    segment["title"] or "",
                    segment["summary"] or "",
                    segment["transcript_text"] or "",
                    segment["segment_type"] or "",
                    " ".join(segment_tags),
                ]
            ).lower()
            if segment_type and segment["segment_type"] != segment_type:
                continue
            if query_low and query_low not in text:
                if not segment_type:
                    continue
            if tag_low and tag_low not in [t.lower() for t in segment_tags]:
                continue
            if query_low or tag_low or segment_type:
                results.append(
                    _result(
                        video,
                        f"segment:{segment['segment_type']}",
                        segment["title"],
                        segment["start_seconds"],
                        segment_tags or video_tags,
                    )
                )

        if not any([query_low, tag_low, segment_type]) and (status or folder_low or unprocessed):
            results.append(_result(video, "video", "", 0, video_tags))
    return results


def build_results_table(results: list[dict[str, Any]]) -> Table:
    table = Table(title="Search Results")
    table.add_column("Filename")
    table.add_column("Relative Path")
    table.add_column("Duration")
    table.add_column("Match Type")
    table.add_column("Title")
    table.add_column("Timestamp")
    table.add_column("Tags")
    for result in results:
        table.add_row(
            result["filename"],
            result["relative_path"],
            result["duration"],
            result["match_type"],
            result["title"],
            result["timestamp"],
            ", ".join(result["tags"][:8]),
        )
    return table


def _result(video: Any, match_type: str, title: str | None, timestamp: float, tags: list[str]) -> dict[str, Any]:
    return {
        "filename": video["filename"],
        "relative_path": video["relative_path"],
        "duration": seconds_to_hhmmss(video["duration_seconds"] or 0),
        "match_type": match_type,
        "title": title or "",
        "timestamp": seconds_to_hhmmss(timestamp),
        "tags": tags,
    }

