from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

import typer
from rich.console import Console
from rich.logging import RichHandler
from rich.progress import Progress
from rich.table import Table

from audio_classifier import classify_audio_windows
from audio_extractor import extract_audio
from chapterer import generate_chapters
from config import AppConfig, apply_runtime_overrides, load_config
from database import ProcessorDB
from embedder import embed_chapters_copy
from exporter import export_data, save_chapter_files
from guitar_trainer_exporter import export_guitar_trainer
from scanner import scan_videos
from search import build_results_table, search_metadata
from timeline_builder import build_timeline
from transcriber import save_transcript_outputs, transcribe_audio
from utils import ensure_dir, write_json


app = typer.Typer(help="Bulk-process guitar instructional videos into searchable metadata and Guitar Trainer markers.")
console = Console()


def _db(config: AppConfig) -> ProcessorDB:
    db = ProcessorDB(config.database_path)
    db.init_schema()
    return db


def _setup_logging(config: AppConfig) -> None:
    logs_dir = ensure_dir(Path(config.output_folder) / "logs")
    logging.basicConfig(
        level=getattr(logging, config.log_level.upper(), logging.INFO),
        format="%(message)s",
        handlers=[
            RichHandler(console=console, rich_tracebacks=True),
            logging.FileHandler(logs_dir / "processing.log", encoding="utf-8"),
        ],
    )


@app.command()
def scan(
    root: str = typer.Argument(..., help="Root folder containing videos."),
    dry_run: bool = typer.Option(False, "--dry-run", help="Preview files without writing to the processor DB."),
    full_hash: bool = typer.Option(False, "--full-hash", help="Hash complete files instead of partial fingerprints."),
    config_path: str = typer.Option("config.yaml", "--config", help="Config file path."),
) -> None:
    config = apply_runtime_overrides(load_config(config_path), root_folder=root)
    _setup_logging(config)
    videos = scan_videos(root, full_hash=full_hash, include_media=not dry_run)
    table = Table(title="Scan Results")
    for column in ["#", "Relative Path", "Extension", "Size", "Metadata"]:
        table.add_column(column)
    for idx, item in enumerate(videos, start=1):
        table.add_row(
            str(idx),
            item["relative_path"],
            item["extension"],
            str(item["file_size"]),
            item.get("metadata_error") or ("ok" if item.get("duration_seconds") else "not probed"),
        )
    console.print(table)
    console.print(f"Videos found: {len(videos)}")
    if dry_run:
        console.print("Dry run: database was not modified.")
        return
    db = _db(config)
    try:
        for item in videos:
            db.upsert_video(item)
        console.print(f"Database updated: {config.database_path}")
    finally:
        db.close()


@app.command()
def process(
    root: str = typer.Argument(..., help="Root folder containing videos."),
    limit: Optional[int] = typer.Option(None, "--limit", help="Maximum videos to process this run."),
    force: bool = typer.Option(False, "--force", help="Reprocess videos even if already processed."),
    full_hash: bool = typer.Option(False, "--full-hash", help="Hash complete files instead of partial fingerprints."),
    config_path: str = typer.Option("config.yaml", "--config", help="Config file path."),
) -> None:
    config = apply_runtime_overrides(load_config(config_path), root_folder=root, limit=limit, force=force)
    _setup_logging(config)
    ensure_output_tree(config.output_folder)
    db = _db(config)
    stats = {
        "found": 0,
        "already_processed": 0,
        "newly_processed": 0,
        "failed": 0,
        "skipped": 0,
        "gt_markers": 0,
        "gt_db_written": False,
    }
    try:
        videos = scan_videos(root, full_hash=full_hash, include_media=True)
        stats["found"] = len(videos)
        selected = []
        for item in videos:
            video_id = db.upsert_video(item)
            existing = db.get_video(video_id)
            if existing and existing["status"] == "processed" and config.skip_existing and not force:
                stats["already_processed"] += 1
                continue
            if item.get("metadata_error"):
                db.set_video_status(video_id, "failed", error_message=item["metadata_error"])
                stats["failed"] += 1
                continue
            selected.append((video_id, item))
            if config.max_videos_per_run and len(selected) >= config.max_videos_per_run:
                break

        with Progress(console=console) as progress:
            task = progress.add_task("Processing videos", total=len(selected))
            for video_id, item in selected:
                try:
                    _process_one(db, config, video_id, item)
                    stats["newly_processed"] += 1
                except Exception as exc:
                    logging.exception("Failed processing %s", item["relative_path"])
                    db.set_video_status(video_id, "failed", error_message=str(exc))
                    db.log("ERROR", str(exc), video_id=video_id)
                    stats["failed"] += 1
                finally:
                    progress.advance(task)

        if config.guitar_trainer_export_enabled:
            result = export_guitar_trainer(
                db,
                root,
                config.output_folder,
                source="chapters",
                db_path=config.guitar_trainer_db_path,
                merge=config.guitar_trainer_merge_mode,
                dry_run=not bool(config.guitar_trainer_db_path),
            )
            stats["gt_markers"] = result["report"]["marker_count"]
            stats["gt_db_written"] = result["report"]["db_written"]
        _print_process_summary(stats, config)
    finally:
        db.close()


def _process_one(db: ProcessorDB, config: AppConfig, video_id: int, item: dict) -> None:
    db.clear_processing_outputs(video_id)
    db.set_video_status(video_id, "processing")
    audio_path = Path(config.output_folder) / "audio_cache" / f"{video_id}.wav"
    transcript_segments = []
    transcript_paths = {}
    if item.get("audio_codec"):
        audio_path = extract_audio(item["absolute_path"], audio_path)
        transcript = transcribe_audio(audio_path, config)
        transcript_segments = transcript.get("segments", [])
        transcript_paths = save_transcript_outputs(video_id, transcript, config.output_folder)
        db.insert_transcripts(video_id, transcript_segments)
        audio_events = classify_audio_windows(audio_path, config, transcript_segments)
        if not config.keep_audio_cache and audio_path.exists():
            audio_path.unlink(missing_ok=True)
    else:
        audio_events = []
    db.insert_audio_events(video_id, audio_events)
    write_json(
        Path(config.output_folder) / "audio_analysis" / f"{video_id}_audio_segments.json",
        {"audio_events": audio_events},
    )
    timeline = build_timeline(
        transcript_segments,
        audio_events,
        duration_seconds=item.get("duration_seconds"),
        filename=item["filename"],
        relative_path=item["relative_path"],
    )
    write_json(Path(config.output_folder) / "timelines" / f"{video_id}_timeline.json", {"timeline": timeline})
    db.insert_timeline_segments(video_id, timeline, "timeline_segments")
    chapter_payload = generate_chapters(item, timeline, config)
    chapters = chapter_payload["chapters"]
    semantic_segments = chapter_payload["timeline_segments"]
    db.insert_timeline_segments(video_id, semantic_segments, "segments")
    db.insert_chapters_and_tags(video_id, chapters, chapter_payload["global_tags"])
    chapter_paths = save_chapter_files(video_id, chapters, config.output_folder)
    db.set_video_status(
        video_id,
        "processed",
        paths={
            "transcript_path": str(transcript_paths.get("txt")) if transcript_paths else None,
            "chapters_json_path": str(chapter_paths["json"]),
            "youtube_chapters_path": str(chapter_paths["youtube"]),
            "ffmetadata_path": str(chapter_paths["ffmetadata"]),
        },
    )


@app.command("search")
def search_command(
    query: Optional[str] = typer.Argument(None, help="Text search query."),
    tag: Optional[str] = typer.Option(None, "--tag", help="Filter by exact tag."),
    segment_type: Optional[str] = typer.Option(None, "--segment-type", help="Filter by semantic segment type."),
    status: Optional[str] = typer.Option(None, "--status", help="Filter by processing status."),
    folder: Optional[str] = typer.Option(None, "--folder", help="Filter by parent folder substring."),
    unprocessed: bool = typer.Option(False, "--unprocessed", help="Show videos not processed yet."),
    config_path: str = typer.Option("config.yaml", "--config", help="Config file path."),
) -> None:
    config = load_config(config_path)
    db = _db(config)
    try:
        results = search_metadata(
            db,
            query,
            tag=tag,
            segment_type=segment_type,
            status=status,
            folder=folder,
            unprocessed=unprocessed,
        )
        console.print(build_results_table(results))
        console.print(f"Matches: {len(results)}")
    finally:
        db.close()


@app.command("export")
def export_command(
    format: str = typer.Option(..., "--format", help="csv, json, or markdown."),
    config_path: str = typer.Option("config.yaml", "--config", help="Config file path."),
) -> None:
    config = load_config(config_path)
    db = _db(config)
    try:
        paths = export_data(db, config.output_folder, format)
        for path in paths:
            console.print(f"Wrote {path}")
    finally:
        db.close()


@app.command("export-guitar-trainer")
def export_guitar_trainer_command(
    root: str = typer.Argument(..., help="Same root folder selected in Guitar Trainer."),
    source: str = typer.Option("chapters", "--source", help="chapters or timeline-segments."),
    db_path: Optional[str] = typer.Option(None, "--db", help="Path to guitar-trainer.sqlite."),
    merge: str = typer.Option("preserve-existing", "--merge", help="preserve-existing, replace-generated, or force."),
    force: bool = typer.Option(False, "--force", help="Allow force replacement when merge=force."),
    dry_run: bool = typer.Option(False, "--dry-run", help="Do not write to Guitar Trainer DB."),
    config_path: str = typer.Option("config.yaml", "--config", help="Config file path."),
) -> None:
    config = apply_runtime_overrides(load_config(config_path), root_folder=root)
    db = _db(config)
    try:
        result = export_guitar_trainer(
            db,
            root,
            config.output_folder,
            source=source,  # type: ignore[arg-type]
            db_path=db_path,
            merge=merge,  # type: ignore[arg-type]
            force=force,
            dry_run=dry_run or not bool(db_path),
        )
        _print_gt_summary(result["report"])
    finally:
        db.close()


@app.command("embed-chapters")
def embed_chapters_command(
    video_id: int = typer.Option(..., "--video-id", help="Processor video_id to embed chapters for."),
    config_path: str = typer.Option("config.yaml", "--config", help="Config file path."),
) -> None:
    config = load_config(config_path)
    db = _db(config)
    try:
        target = embed_chapters_copy(db, video_id, config.output_folder)
        console.print(f"Created chaptered copy: {target}")
    finally:
        db.close()


def ensure_output_tree(output_folder: str | Path) -> None:
    for child in [
        "audio_cache",
        "transcripts",
        "audio_analysis",
        "timelines",
        "chapters",
        "guitar_trainer",
        "exports",
        "logs",
    ]:
        ensure_dir(Path(output_folder) / child)


def _print_process_summary(stats: dict, config: AppConfig) -> None:
    table = Table(title="Processing Summary")
    table.add_column("Metric")
    table.add_column("Value")
    rows = {
        "videos found": stats["found"],
        "already processed": stats["already_processed"],
        "newly processed": stats["newly_processed"],
        "failed": stats["failed"],
        "skipped": stats["skipped"],
        "output folder": config.output_folder,
        "database path": config.database_path,
        "Guitar Trainer marker states generated": stats["gt_markers"],
        "Guitar Trainer DB written": str(stats["gt_db_written"]),
    }
    for key, value in rows.items():
        table.add_row(key, str(value))
    console.print(table)


def _print_gt_summary(report: dict) -> None:
    table = Table(title="Guitar Trainer Export")
    table.add_column("Metric")
    table.add_column("Value")
    for key in [
        "videos_seen",
        "videos_with_markers",
        "videos_without_chapters",
        "videos_not_visible_to_guitar_trainer",
        "marker_count",
        "annotation_count",
        "db_written",
        "db_path",
        "backup_path",
    ]:
        table.add_row(key, str(report.get(key)))
    console.print(table)


if __name__ == "__main__":
    app()

