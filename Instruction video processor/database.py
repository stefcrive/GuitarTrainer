from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

from utils import ensure_dir, json_dumps, utc_now_iso


SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS videos (
  video_id INTEGER PRIMARY KEY AUTOINCREMENT,
  absolute_path TEXT NOT NULL UNIQUE,
  relative_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  parent_folder TEXT NOT NULL,
  extension TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  created_time REAL,
  modified_time REAL,
  duration_seconds REAL,
  video_codec TEXT,
  audio_codec TEXT,
  width INTEGER,
  height INTEGER,
  fps REAL,
  hash TEXT,
  status TEXT NOT NULL DEFAULT 'unprocessed',
  error_message TEXT,
  processed_at TEXT,
  transcript_path TEXT,
  chapters_json_path TEXT,
  youtube_chapters_path TEXT,
  ffmetadata_path TEXT
);

CREATE TABLE IF NOT EXISTS transcripts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id INTEGER NOT NULL,
  segment_index INTEGER NOT NULL,
  start_seconds REAL NOT NULL,
  end_seconds REAL NOT NULL,
  text TEXT NOT NULL,
  confidence REAL,
  FOREIGN KEY(video_id) REFERENCES videos(video_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id INTEGER NOT NULL,
  segment_index INTEGER NOT NULL,
  start_seconds REAL NOT NULL,
  end_seconds REAL NOT NULL,
  segment_type TEXT NOT NULL,
  title TEXT,
  summary TEXT,
  confidence REAL,
  source_evidence TEXT,
  transcript_text TEXT,
  audio_labels TEXT,
  tags TEXT,
  FOREIGN KEY(video_id) REFERENCES videos(video_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audio_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id INTEGER NOT NULL,
  window_index INTEGER NOT NULL,
  start_seconds REAL NOT NULL,
  end_seconds REAL NOT NULL,
  top_labels TEXT,
  top_scores TEXT,
  speech_score REAL,
  music_score REAL,
  guitar_or_instrument_score REAL,
  silence_or_noise_score REAL,
  FOREIGN KEY(video_id) REFERENCES videos(video_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS timeline_segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id INTEGER NOT NULL,
  segment_index INTEGER NOT NULL,
  start_seconds REAL NOT NULL,
  end_seconds REAL NOT NULL,
  segment_type TEXT NOT NULL,
  title TEXT,
  summary TEXT,
  confidence REAL,
  source_evidence TEXT,
  transcript_text TEXT,
  audio_labels TEXT,
  tags TEXT,
  FOREIGN KEY(video_id) REFERENCES videos(video_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id INTEGER NOT NULL,
  chapter_index INTEGER NOT NULL,
  start_seconds REAL NOT NULL,
  end_seconds REAL,
  title TEXT NOT NULL,
  summary TEXT,
  confidence REAL,
  FOREIGN KEY(video_id) REFERENCES videos(video_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS video_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id INTEGER NOT NULL,
  tag TEXT NOT NULL,
  UNIQUE(video_id, tag),
  FOREIGN KEY(video_id) REFERENCES videos(video_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chapter_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id INTEGER NOT NULL,
  chapter_index INTEGER NOT NULL,
  tag TEXT NOT NULL,
  UNIQUE(video_id, chapter_index, tag),
  FOREIGN KEY(video_id) REFERENCES videos(video_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS processing_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id INTEGER,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(video_id) REFERENCES videos(video_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
CREATE INDEX IF NOT EXISTS idx_videos_relative_path ON videos(relative_path);
CREATE INDEX IF NOT EXISTS idx_videos_parent_folder ON videos(parent_folder);
CREATE INDEX IF NOT EXISTS idx_transcripts_video_id ON transcripts(video_id);
CREATE INDEX IF NOT EXISTS idx_audio_events_video_id ON audio_events(video_id);
CREATE INDEX IF NOT EXISTS idx_timeline_video_id ON timeline_segments(video_id);
CREATE INDEX IF NOT EXISTS idx_timeline_type ON timeline_segments(segment_type);
CREATE INDEX IF NOT EXISTS idx_chapters_video_id ON chapters(video_id);
CREATE INDEX IF NOT EXISTS idx_video_tags_tag ON video_tags(tag);
CREATE INDEX IF NOT EXISTS idx_chapter_tags_tag ON chapter_tags(tag);
"""


class ProcessorDB:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        ensure_dir(self.path.parent)
        self.conn = sqlite3.connect(self.path)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys = ON")

    def close(self) -> None:
        self.conn.close()

    def init_schema(self) -> None:
        self.conn.executescript(SCHEMA)
        self.conn.commit()

    def log(self, level: str, message: str, video_id: int | None = None) -> None:
        self.conn.execute(
            "INSERT INTO processing_logs (video_id, level, message, created_at) VALUES (?, ?, ?, ?)",
            (video_id, level.upper(), message, utc_now_iso()),
        )
        self.conn.commit()

    def upsert_video(self, item: dict[str, Any]) -> int:
        columns = [
            "absolute_path",
            "relative_path",
            "filename",
            "parent_folder",
            "extension",
            "file_size",
            "created_time",
            "modified_time",
            "duration_seconds",
            "video_codec",
            "audio_codec",
            "width",
            "height",
            "fps",
            "hash",
        ]
        values = [item.get(column) for column in columns]
        assignments = ", ".join(f"{column}=excluded.{column}" for column in columns[1:])
        sql = f"""
        INSERT INTO videos ({", ".join(columns)})
        VALUES ({", ".join("?" for _ in columns)})
        ON CONFLICT(absolute_path) DO UPDATE SET {assignments}
        """
        self.conn.execute(sql, values)
        self.conn.commit()
        row = self.conn.execute(
            "SELECT video_id FROM videos WHERE absolute_path = ?", (item["absolute_path"],)
        ).fetchone()
        return int(row["video_id"])

    def get_video(self, video_id: int) -> sqlite3.Row | None:
        return self.conn.execute("SELECT * FROM videos WHERE video_id = ?", (video_id,)).fetchone()

    def get_video_by_path(self, absolute_path: str) -> sqlite3.Row | None:
        return self.conn.execute(
            "SELECT * FROM videos WHERE absolute_path = ?", (absolute_path,)
        ).fetchone()

    def list_videos(self, where: str = "", params: tuple[Any, ...] = ()) -> list[sqlite3.Row]:
        sql = "SELECT * FROM videos"
        if where:
            sql += f" WHERE {where}"
        sql += " ORDER BY relative_path"
        return list(self.conn.execute(sql, params).fetchall())

    def set_video_status(
        self,
        video_id: int,
        status: str,
        *,
        error_message: str | None = None,
        paths: dict[str, str | None] | None = None,
    ) -> None:
        paths = paths or {}
        self.conn.execute(
            """
            UPDATE videos
            SET status = ?, error_message = ?, processed_at = ?,
                transcript_path = COALESCE(?, transcript_path),
                chapters_json_path = COALESCE(?, chapters_json_path),
                youtube_chapters_path = COALESCE(?, youtube_chapters_path),
                ffmetadata_path = COALESCE(?, ffmetadata_path)
            WHERE video_id = ?
            """,
            (
                status,
                error_message,
                utc_now_iso() if status == "processed" else None,
                paths.get("transcript_path"),
                paths.get("chapters_json_path"),
                paths.get("youtube_chapters_path"),
                paths.get("ffmetadata_path"),
                video_id,
            ),
        )
        self.conn.commit()

    def clear_processing_outputs(self, video_id: int) -> None:
        for table in [
            "transcripts",
            "segments",
            "audio_events",
            "timeline_segments",
            "chapters",
            "video_tags",
            "chapter_tags",
        ]:
            self.conn.execute(f"DELETE FROM {table} WHERE video_id = ?", (video_id,))
        self.conn.commit()

    def insert_transcripts(self, video_id: int, segments: list[dict[str, Any]]) -> None:
        self.conn.executemany(
            """
            INSERT INTO transcripts (video_id, segment_index, start_seconds, end_seconds, text, confidence)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    video_id,
                    idx,
                    float(segment.get("start_seconds", 0)),
                    float(segment.get("end_seconds", 0)),
                    segment.get("text", ""),
                    segment.get("confidence"),
                )
                for idx, segment in enumerate(segments)
            ],
        )
        self.conn.commit()

    def insert_audio_events(self, video_id: int, events: list[dict[str, Any]]) -> None:
        self.conn.executemany(
            """
            INSERT INTO audio_events
            (video_id, window_index, start_seconds, end_seconds, top_labels, top_scores,
             speech_score, music_score, guitar_or_instrument_score, silence_or_noise_score)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    video_id,
                    idx,
                    float(event.get("start_seconds", 0)),
                    float(event.get("end_seconds", 0)),
                    json_dumps(event.get("top_labels", [])),
                    json_dumps(event.get("top_scores", [])),
                    event.get("speech_score"),
                    event.get("music_score"),
                    event.get("guitar_or_instrument_score"),
                    event.get("silence_or_noise_score"),
                )
                for idx, event in enumerate(events)
            ],
        )
        self.conn.commit()

    def insert_timeline_segments(self, video_id: int, segments: list[dict[str, Any]], table: str) -> None:
        if table not in {"timeline_segments", "segments"}:
            raise ValueError(f"Unsupported timeline table: {table}")
        self.conn.executemany(
            f"""
            INSERT INTO {table}
            (video_id, segment_index, start_seconds, end_seconds, segment_type, title, summary,
             confidence, source_evidence, transcript_text, audio_labels, tags)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    video_id,
                    idx,
                    float(segment.get("start_seconds", 0)),
                    float(segment.get("end_seconds", 0)),
                    segment.get("segment_type") or segment.get("type") or "other",
                    segment.get("title"),
                    segment.get("summary"),
                    segment.get("confidence"),
                    segment.get("source_evidence") or segment.get("evidence"),
                    segment.get("transcript_text") or segment.get("transcript", ""),
                    json_dumps(segment.get("audio_labels", [])),
                    json_dumps(segment.get("tags", [])),
                )
                for idx, segment in enumerate(segments)
            ],
        )
        self.conn.commit()

    def insert_chapters_and_tags(
        self,
        video_id: int,
        chapters: list[dict[str, Any]],
        video_tags: list[str],
    ) -> None:
        self.conn.executemany(
            """
            INSERT INTO chapters
            (video_id, chapter_index, start_seconds, end_seconds, title, summary, confidence)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    video_id,
                    idx,
                    float(chapter.get("start_seconds", 0)),
                    chapter.get("end_seconds"),
                    chapter.get("title") or f"Chapter {idx + 1}",
                    chapter.get("summary", ""),
                    chapter.get("confidence"),
                )
                for idx, chapter in enumerate(chapters)
            ],
        )
        self.conn.executemany(
            "INSERT OR IGNORE INTO video_tags (video_id, tag) VALUES (?, ?)",
            [(video_id, tag) for tag in video_tags],
        )
        chapter_tag_rows: list[tuple[int, int, str]] = []
        for idx, chapter in enumerate(chapters):
            for tag in chapter.get("tags", []):
                chapter_tag_rows.append((video_id, idx, tag))
        self.conn.executemany(
            "INSERT OR IGNORE INTO chapter_tags (video_id, chapter_index, tag) VALUES (?, ?, ?)",
            chapter_tag_rows,
        )
        self.conn.commit()

    def fetch_transcripts(self, video_id: int) -> list[sqlite3.Row]:
        return list(
            self.conn.execute(
                "SELECT * FROM transcripts WHERE video_id = ? ORDER BY segment_index", (video_id,)
            ).fetchall()
        )

    def fetch_audio_events(self, video_id: int) -> list[sqlite3.Row]:
        return list(
            self.conn.execute(
                "SELECT * FROM audio_events WHERE video_id = ? ORDER BY window_index", (video_id,)
            ).fetchall()
        )

    def fetch_timeline(self, video_id: int, table: str = "timeline_segments") -> list[sqlite3.Row]:
        return list(
            self.conn.execute(
                f"SELECT * FROM {table} WHERE video_id = ? ORDER BY segment_index", (video_id,)
            ).fetchall()
        )

    def fetch_chapters(self, video_id: int) -> list[sqlite3.Row]:
        return list(
            self.conn.execute(
                "SELECT * FROM chapters WHERE video_id = ? ORDER BY chapter_index", (video_id,)
            ).fetchall()
        )

    def fetch_video_tags(self, video_id: int) -> list[str]:
        rows = self.conn.execute(
            "SELECT tag FROM video_tags WHERE video_id = ? ORDER BY tag", (video_id,)
        ).fetchall()
        return [row["tag"] for row in rows]

    def fetch_chapter_tags(self, video_id: int, chapter_index: int) -> list[str]:
        rows = self.conn.execute(
            """
            SELECT tag FROM chapter_tags
            WHERE video_id = ? AND chapter_index = ?
            ORDER BY tag
            """,
            (video_id, chapter_index),
        ).fetchall()
        return [row["tag"] for row in rows]

