from __future__ import annotations

import json
import sqlite3
import wave
from pathlib import Path

from audio_classifier import classify_audio_windows
from chapterer import validate_chapter_payload
from config import AppConfig
from database import ProcessorDB
from guitar_trainer_exporter import export_guitar_trainer
from scanner import scan_videos
from timeline_builder import build_timeline
from utils import normalize_relative_path, partial_file_hash


def test_normalize_relative_path_uses_forward_slashes(tmp_path: Path) -> None:
    root = tmp_path / "Videos"
    video = root / "Jazz" / "Minor ii V I" / "lesson01.mp4"
    video.parent.mkdir(parents=True)
    video.write_bytes(b"x")
    assert normalize_relative_path(root, video) == "Jazz/Minor ii V I/lesson01.mp4"


def test_partial_hash_changes_with_content(tmp_path: Path) -> None:
    path = tmp_path / "video.mp4"
    path.write_bytes(b"a" * 2048)
    first = partial_file_hash(path, chunk_size=128)
    path.write_bytes(b"b" * 2048)
    second = partial_file_hash(path, chunk_size=128)
    assert first != second


def test_scan_video_extensions_without_media_probe(tmp_path: Path) -> None:
    (tmp_path / "a.mp4").write_bytes(b"1")
    (tmp_path / "b.mkv").write_bytes(b"2")
    (tmp_path / "c.txt").write_text("nope")
    rows = scan_videos(tmp_path, include_media=False)
    assert [row["relative_path"] for row in rows] == ["a.mp4", "b.mkv"]


def test_database_schema_and_video_upsert(tmp_path: Path) -> None:
    db = ProcessorDB(tmp_path / "processor.sqlite")
    db.init_schema()
    video_id = db.upsert_video(
        {
            "absolute_path": str(tmp_path / "a.mp4"),
            "relative_path": "a.mp4",
            "filename": "a.mp4",
            "parent_folder": "",
            "extension": ".mp4",
            "file_size": 1,
            "created_time": 1,
            "modified_time": 2,
            "duration_seconds": 10,
            "video_codec": "h264",
            "audio_codec": "aac",
            "width": 1920,
            "height": 1080,
            "fps": 30,
            "hash": "abc",
        }
    )
    db.set_video_status(video_id, "processed")
    assert db.get_video(video_id)["status"] == "processed"
    db.close()


def test_audio_fallback_classifier(tmp_path: Path) -> None:
    wav_path = tmp_path / "audio.wav"
    with wave.open(str(wav_path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16000)
        wav.writeframes((1000).to_bytes(2, "little", signed=True) * 16000)
    config = AppConfig(audio_classifier="fallback", audio_analysis_window_seconds=1, audio_analysis_hop_seconds=1)
    events = classify_audio_windows(
        wav_path,
        config,
        [{"start_seconds": 0, "end_seconds": 0.5, "text": "hello"}],
    )
    assert events
    assert events[0]["speech_score"] > 0


def test_timeline_merges_audio_and_transcript() -> None:
    timeline = build_timeline(
        [{"start_seconds": 0, "end_seconds": 2, "text": "Practice this slowly."}],
        [
            {
                "start_seconds": 0,
                "end_seconds": 3,
                "top_labels": ["speech", "possible_music_or_guitar"],
                "speech_score": 0.7,
                "music_score": 0.3,
                "guitar_or_instrument_score": 0.2,
                "silence_or_noise_score": 0.0,
            }
        ],
        duration_seconds=3,
        filename="lesson.mp4",
        relative_path="lesson.mp4",
    )
    assert timeline[0]["segment_type"] == "mixed_speech_and_guitar"


def test_chapter_payload_validation_repairs_ends() -> None:
    payload = {
        "global_tags": ["Alternate Picking", "video"],
        "timeline_segments": [
            {
                "start": "00:00:00",
                "end": "00:00:10",
                "type": "guitar_exercise",
                "title": "Exercise",
                "summary": "Practice.",
                "confidence": 0.9,
                "tags": ["exercise"],
            }
        ],
        "chapters": [
            {"start": "00:00:00", "title": "Intro", "summary": "Start.", "confidence": 0.8, "tags": ["lesson"]},
            {"start": "00:00:10", "title": "Exercise", "summary": "Practice.", "confidence": 0.8, "tags": ["exercise"]},
        ],
    }
    result = validate_chapter_payload(payload, 20, AppConfig())
    assert result["global_tags"] == ["alternate picking"]
    assert result["chapters"][0]["end_seconds"] == 10


def test_guitar_trainer_export_and_merge_preserves_existing(tmp_path: Path) -> None:
    root = tmp_path / "videos"
    root.mkdir()
    video_path = root / "lesson.mp4"
    video_path.write_bytes(b"x")
    db = ProcessorDB(tmp_path / "processor.sqlite")
    db.init_schema()
    video_id = db.upsert_video(
        {
            "absolute_path": str(video_path),
            "relative_path": "lesson.mp4",
            "filename": "lesson.mp4",
            "parent_folder": "",
            "extension": ".mp4",
            "file_size": 1,
            "created_time": 1,
            "modified_time": 2,
            "duration_seconds": 20,
            "video_codec": "h264",
            "audio_codec": "aac",
            "width": 1,
            "height": 1,
            "fps": 30,
            "hash": "abc",
        }
    )
    db.insert_chapters_and_tags(
        video_id,
        [{"start_seconds": 0, "end_seconds": 10, "title": "Intro", "summary": "Start.", "confidence": 0.8, "tags": ["exercise"]}],
        ["alternate picking"],
    )
    gt_db = tmp_path / "guitar-trainer.sqlite"
    conn = sqlite3.connect(gt_db)
    conn.execute(
        "CREATE TABLE marker_states (content_path TEXT PRIMARY KEY, content_type TEXT NOT NULL, marker_state TEXT NOT NULL, updated_at INTEGER NOT NULL)"
    )
    existing = {"markers": [{"id": "user", "startTime": 1, "endTime": 2}], "annotations": [], "activeMarkerId": None, "isLooping": False}
    conn.execute(
        "INSERT INTO marker_states VALUES (?, ?, ?, ?)",
        ("lesson.mp4", "local", json.dumps(existing), 1),
    )
    conn.commit()
    conn.close()

    export_guitar_trainer(db, root, tmp_path / "outputs", db_path=gt_db, dry_run=False)
    conn = sqlite3.connect(gt_db)
    row = conn.execute("SELECT marker_state FROM marker_states WHERE content_path = ?", ("lesson.mp4",)).fetchone()
    state = json.loads(row[0])
    assert any(marker["id"] == "user" for marker in state["markers"])
    assert any(marker["id"].startswith("gtm:abc:chapter:") for marker in state["markers"])
    conn.close()
    db.close()

