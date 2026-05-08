from __future__ import annotations

import json
import re
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

from database import ProcessorDB
from utils import (
    GUITAR_TRAINER_VISIBLE_EXTENSIONS,
    clamp,
    ensure_dir,
    epoch_ms,
    json_dumps,
    json_loads,
    normalize_relative_path,
    normalize_tags,
    hhmmss_to_seconds,
    utc_now_iso,
    write_json,
    write_text,
)


SourceType = Literal["chapters", "timeline-segments"]
MergeMode = Literal["preserve-existing", "replace-generated", "force"]


MARKER_STATES_SQL_TEMPLATE = """-- Parameterized import template.
-- Use the application import command instead of embedding raw JSON strings.
INSERT INTO marker_states (content_path, content_type, marker_state, updated_at)
VALUES (?, 'local', ?, ?)
ON CONFLICT(content_path) DO UPDATE SET
  content_type = excluded.content_type,
  marker_state = excluded.marker_state,
  updated_at = excluded.updated_at;
"""


def export_guitar_trainer(
    db: ProcessorDB,
    root_folder: str | Path,
    output_folder: str | Path,
    *,
    source: SourceType = "chapters",
    video_path: str | None = None,
    db_path: str | Path | None = None,
    merge: MergeMode = "preserve-existing",
    force: bool = False,
    dry_run: bool = False,
) -> dict[str, Any]:
    if merge == "force" and not force:
        raise ValueError("--merge force requires --force")

    root = Path(root_folder).resolve()
    gt_dir = ensure_dir(Path(output_folder) / "guitar_trainer")
    jsonl_path = gt_dir / "marker_states.jsonl"
    sql_path = gt_dir / "marker_states.sql"
    report_path = gt_dir / "import_report.json"
    skipped_path = gt_dir / "skipped_videos.json"

    states: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    marker_count = 0
    annotation_count = 0
    videos = db.list_videos()
    if video_path:
        normalized_video_path = video_path.replace("\\", "/").strip("/")
        videos = [video for video in videos if video["relative_path"] == normalized_video_path]
        if not videos:
            skipped.append(
                {
                    "video_id": None,
                    "relative_path": normalized_video_path,
                    "reason": "Requested video path was not found in the processor database.",
                    "severity": "error",
                }
            )

    for video in videos:
        warnings = _visibility_warnings(video)
        skipped.extend(warnings)
        try:
            state = _marker_state_for_video(db, video, root, source)
        except Exception as exc:
            skipped.append(_skip(video, f"Failed export: {exc}", "error"))
            continue
        if not state["marker_state"]["markers"]:
            skipped.append(_skip(video, "Video has no valid markers for export.", "warning"))
            continue
        marker_count += len(state["marker_state"]["markers"])
        annotation_count += len(state["marker_state"]["annotations"])
        states.append(state)

    with jsonl_path.open("w", encoding="utf-8") as handle:
        for state in states:
            handle.write(json.dumps(state, ensure_ascii=False) + "\n")
    write_text(sql_path, MARKER_STATES_SQL_TEMPLATE)

    db_written = False
    backup_path: str | None = None
    warnings: list[str] = []
    if db_path and not dry_run:
        backup_path = _backup_db(db_path)
        try:
            _import_to_guitar_trainer_db(db_path, states, merge=merge, force=force)
            db_written = True
        except Exception as exc:
            warnings.append(f"Direct DB import failed: {exc}")
            skipped.append(
                {
                    "video_id": None,
                    "relative_path": None,
                    "reason": f"Direct DB import failed: {exc}",
                    "severity": "error",
                }
            )

    report = {
        "root_folder": str(root),
        "generated_at": utc_now_iso(),
        "videos_seen": len(videos),
        "videos_with_markers": len(states),
        "videos_without_chapters": sum(1 for item in skipped if "no valid markers" in item["reason"]),
        "videos_not_visible_to_guitar_trainer": sum(
            1 for item in skipped if "may not display" in item["reason"]
        ),
        "marker_count": marker_count,
        "annotation_count": annotation_count,
        "db_written": db_written,
        "db_path": str(db_path) if db_path else None,
        "backup_path": backup_path,
        "dry_run": dry_run,
        "merge_mode": merge,
        "source": source,
        "warnings": warnings + [item["reason"] for item in skipped if item["severity"] == "warning"],
    }
    write_json(report_path, report)
    write_json(skipped_path, skipped)
    return {
        "report": report,
        "states": states,
        "paths": {
            "jsonl": jsonl_path,
            "sql": sql_path,
            "report": report_path,
            "skipped": skipped_path,
        },
    }


def _marker_state_for_video(
    db: ProcessorDB,
    video: Any,
    root: Path,
    source: SourceType,
) -> dict[str, Any]:
    duration = float(video["duration_seconds"] or 0)
    if duration <= 0:
        raise ValueError("Missing duration")
    content_path = normalize_relative_path(root, video["absolute_path"])
    updated_at = epoch_ms()
    if source == "chapters":
        rows = db.fetch_chapters(video["video_id"])
        if not rows:
            rows = _chapters_from_extracted_markdown(video)
        source_kind = "chapter"
    else:
        rows = db.fetch_timeline(video["video_id"], "segments")
        source_kind = "segment"

    markers = []
    annotations = []
    global_tags = db.fetch_video_tags(video["video_id"])
    for idx, row in enumerate(rows):
        start = clamp(float(row["start_seconds"] or 0), 0, duration)
        raw_end = row["end_seconds"] if "end_seconds" in row.keys() else None
        end = clamp(float(raw_end if raw_end is not None else duration), 0, duration)
        if end - start < 1.0:
            continue
        marker_id = f"gtm:{video['hash']}:{source_kind}:{idx}"
        annotation_id = f"gta:{video['hash']}:{source_kind}:{idx}"
        title = row["title"] or f"{source_kind.title()} {idx + 1}"
        marker = {
            "id": marker_id,
            "startTime": round(start, 3),
            "endTime": round(end, 3),
            "title": title,
            "isLooping": False,
            "completionDegree": 0,
            "createdAt": updated_at,
            "diagrams": [],
        }
        tags = _annotation_tags(db, video["video_id"], row, global_tags, source)
        annotation = {
            "id": annotation_id,
            "markerId": marker_id,
            "text": _annotation_text(row, source),
            "tags": tags,
            "timestamp": updated_at,
        }
        markers.append(marker)
        annotations.append(annotation)

    return {
        "content_path": content_path,
        "content_type": "local",
        "updated_at": updated_at,
        "marker_state": {
            "markers": markers,
            "annotations": annotations,
            "activeMarkerId": None,
            "isLooping": False,
        },
        "source_video_id": video["video_id"],
        "source_hash": video["hash"],
        "duration_seconds": duration,
    }


def _chapters_from_extracted_markdown(video: Any) -> list[dict[str, Any]]:
    markdown_path = _find_extracted_markdown(video)
    if not markdown_path:
        return []

    text = markdown_path.read_text(encoding="utf-8", errors="ignore")
    global_tags = _concept_tags_from_markdown(text)
    chapter_rows: list[dict[str, Any]] = []
    pattern = re.compile(
        r"^\s*-\s+\*\*(\d{1,2}:\d{2}(?::\d{2})?)\s+-\s+(\d{1,2}:\d{2}(?::\d{2})?):\s+(.+?)\*\*\s*$",
        re.MULTILINE,
    )
    matches = list(pattern.finditer(text))
    for index, match in enumerate(matches):
        start = hhmmss_to_seconds(match.group(1))
        end = hhmmss_to_seconds(match.group(2))
        title = match.group(3).strip()
        next_start = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        block = text[match.end() : next_start]
        bullet_summaries = [
            line.strip().lstrip("- ").strip()
            for line in block.splitlines()
            if line.strip().startswith("- ")
        ]
        summary = bullet_summaries[0] if bullet_summaries else title
        tags = normalize_tags([title, *global_tags], max_count=8)
        if end - start < 1:
            continue
        chapter_rows.append(
            {
                "chapter_index": index,
                "start_seconds": start,
                "end_seconds": end,
                "title": title,
                "summary": summary,
                "confidence": 0.8,
                "_tags": tags,
            }
        )
    return chapter_rows


def _find_extracted_markdown(video: Any) -> Path | None:
    exports_dir = Path("outputs") / "exports"
    candidates = list(exports_dir.glob("*_extracted.md"))
    if not candidates:
        return None

    video_tokens = _name_tokens(Path(video["filename"]).stem)
    best: tuple[int, Path] | None = None
    for candidate in candidates:
        candidate_tokens = _name_tokens(candidate.stem.replace("_extracted", ""))
        score = len(video_tokens & candidate_tokens)
        if best is None or score > best[0]:
            best = (score, candidate)
    return best[1] if best and best[0] >= 2 else None


def _name_tokens(value: str) -> set[str]:
    return {
        token
        for token in re.split(r"[^a-z0-9]+", value.lower())
        if len(token) > 1 and token not in {"the", "and", "part", "pt"}
    }


def _concept_tags_from_markdown(text: str) -> list[str]:
    match = re.search(r"## Concepts And Terms\s*(.+?)(?:\n## |\Z)", text, re.DOTALL | re.IGNORECASE)
    if not match:
        return []
    tags = []
    for line in match.group(1).splitlines():
        cleaned = line.strip().lstrip("- ").strip()
        if cleaned:
            tags.append(cleaned)
    return normalize_tags(tags, max_count=20)


def _annotation_tags(db: ProcessorDB, video_id: int, row: Any, global_tags: list[str], source: SourceType) -> list[str]:
    if source == "chapters":
        if isinstance(row, dict) and "_tags" in row:
            row_tags = row["_tags"]
        else:
            row_tags = db.fetch_chapter_tags(video_id, row["chapter_index"])
        semantic = []
    else:
        row_tags = json_loads(row["tags"], [])
        semantic = [row["segment_type"]] if row["segment_type"] else []
    return normalize_tags([*row_tags, *global_tags, *semantic], max_count=20)


def _annotation_text(row: Any, source: SourceType) -> str:
    summary = row["summary"] or "No summary available."
    confidence = row["confidence"] if row["confidence"] is not None else "unknown"
    if source == "chapters":
        parts = [f"Summary: {summary}", f"Confidence: {confidence}"]
    else:
        parts = [
            f"Summary: {summary}",
            f"Confidence: {confidence}",
            f"Type: {row['segment_type']}",
        ]
        if row["source_evidence"]:
            parts.append(f"Evidence: {row['source_evidence']}")
    return "\n".join(parts)


def _visibility_warnings(video: Any) -> list[dict[str, Any]]:
    if video["extension"] in GUITAR_TRAINER_VISIBLE_EXTENSIONS:
        return []
    return [
        _skip(
            video,
            f"Guitar Trainer may not display {video['extension']} files unless scanner is updated.",
            "warning",
        )
    ]


def _skip(video: Any, reason: str, severity: str) -> dict[str, Any]:
    return {
        "video_id": video["video_id"] if video is not None else None,
        "relative_path": video["relative_path"] if video is not None else None,
        "reason": reason,
        "severity": severity,
    }


def _backup_db(db_path: str | Path) -> str:
    path = Path(db_path)
    if not path.exists():
        ensure_dir(path.parent)
        sqlite3.connect(path).close()
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = path.with_name(f"{path.name}.backup-{stamp}")
    shutil.copy2(path, backup)
    return str(backup)


def _ensure_gt_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS marker_states (
          content_path TEXT PRIMARY KEY,
          content_type TEXT NOT NULL,
          marker_state TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        )
        """
    )


def _import_to_guitar_trainer_db(
    db_path: str | Path,
    states: list[dict[str, Any]],
    *,
    merge: MergeMode,
    force: bool,
) -> None:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        _ensure_gt_schema(conn)
        conn.execute("BEGIN")
        for state in states:
            content_path = state["content_path"]
            incoming = state["marker_state"]
            row = conn.execute(
                "SELECT marker_state FROM marker_states WHERE content_path = ?", (content_path,)
            ).fetchone()
            if merge == "force" and force:
                merged = incoming
            elif row:
                existing = json_loads(row["marker_state"], {})
                merged = _merge_marker_states(
                    existing,
                    incoming,
                    source_hash=state["source_hash"],
                    source_kind=_source_kind_from_markers(incoming),
                    replace_generated=merge == "replace-generated",
                )
            else:
                merged = incoming
            conn.execute(
                """
                INSERT INTO marker_states (content_path, content_type, marker_state, updated_at)
                VALUES (?, 'local', ?, ?)
                ON CONFLICT(content_path) DO UPDATE SET
                  content_type = excluded.content_type,
                  marker_state = excluded.marker_state,
                  updated_at = excluded.updated_at
                """,
                (content_path, json_dumps(merged), state["updated_at"]),
            )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _merge_marker_states(
    existing: dict[str, Any],
    incoming: dict[str, Any],
    *,
    source_hash: str,
    source_kind: str,
    replace_generated: bool,
) -> dict[str, Any]:
    existing_markers = list(existing.get("markers") or [])
    existing_annotations = list(existing.get("annotations") or [])
    generated_prefix = f"gtm:{source_hash}:{source_kind}:"
    generated_annotation_prefix = f"gta:{source_hash}:{source_kind}:"
    if replace_generated:
        existing_markers = [m for m in existing_markers if not str(m.get("id", "")).startswith(generated_prefix)]
        existing_annotations = [
            a for a in existing_annotations if not str(a.get("id", "")).startswith(generated_annotation_prefix)
        ]
    marker_ids = {m.get("id") for m in existing_markers}
    annotation_ids = {a.get("id") for a in existing_annotations}
    for marker in incoming.get("markers", []):
        if marker.get("id") not in marker_ids:
            existing_markers.append(marker)
            marker_ids.add(marker.get("id"))
    for annotation in incoming.get("annotations", []):
        if annotation.get("id") not in annotation_ids:
            existing_annotations.append(annotation)
            annotation_ids.add(annotation.get("id"))
    existing_markers.sort(key=lambda m: float(m.get("startTime") or 0))
    return {
        "markers": existing_markers,
        "annotations": existing_annotations,
        "activeMarkerId": existing.get("activeMarkerId"),
        "isLooping": bool(existing.get("isLooping", False)),
    }


def _source_kind_from_markers(marker_state: dict[str, Any]) -> str:
    markers = marker_state.get("markers", [])
    if not markers:
        return "chapter"
    marker_id = str(markers[0].get("id", ""))
    if ":segment:" in marker_id:
        return "segment"
    return "chapter"
