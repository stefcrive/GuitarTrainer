# Local Guitar Instruction Video Processor

CLI-first local app for bulk-processing guitar instructional videos into searchable metadata, transcripts, chapters, semantic segment labels, tags, and Guitar Trainer-compatible local marker states.

The app never deletes, moves, or modifies original videos. It writes outputs under `outputs/`, stores processing state in SQLite, and can optionally write to a copied or selected Guitar Trainer `guitar-trainer.sqlite` after making a backup.

## Install

Python 3.11+ is recommended.

```bash
pip install -r requirements.txt
```

Install `ffmpeg` and make sure both `ffmpeg` and `ffprobe` are on PATH:

```bash
ffmpeg -version
ffprobe -version
```

Optional YAMNet audio classification:

```bash
pip install -r requirements-yamnet.txt
```

If YAMNet/TensorFlow is unavailable, the app automatically falls back to simple energy and transcript-gap audio classification.

## Configure

Copy `config.example.yaml` to `config.yaml` and adjust paths/models:

```bash
copy config.example.yaml config.yaml
```

For LLM chaptering and tagging, set:

```bash
set OPENAI_API_KEY=your-key
```

If no OpenAI key is available, processing still produces conservative fallback chapters from transcript/audio evidence, with lower confidence.

## Commands

```bash
python app.py scan "D:/GuitarVideos" --dry-run
python app.py process "D:/GuitarVideos"
python app.py process "D:/GuitarVideos" --limit 10
python app.py process "D:/GuitarVideos" --force
python app.py search "alternate picking"
python app.py search --tag "legato"
python app.py search --segment-type guitar_exercise
python app.py search --status failed
python app.py search --folder "Jazz"
python app.py search --unprocessed
python app.py export --format csv
python app.py export --format json
python app.py export --format markdown
python app.py embed-chapters --video-id 42
```

Guitar Trainer exports:

```bash
python app.py export-guitar-trainer "D:/GuitarVideos"
python app.py export-guitar-trainer "D:/GuitarVideos" --source chapters
python app.py export-guitar-trainer "D:/GuitarVideos" --source timeline-segments
python app.py export-guitar-trainer "D:/GuitarVideos" --db "D:/GuitarVideos/guitar-trainer.sqlite"
python app.py export-guitar-trainer "D:/GuitarVideos" --merge preserve-existing
python app.py export-guitar-trainer "D:/GuitarVideos" --merge replace-generated
python app.py export-guitar-trainer "D:/GuitarVideos" --dry-run
```

## Outputs

```text
outputs/
  audio_cache/
  transcripts/
  audio_analysis/
  timelines/
  chapters/
  guitar_trainer/
  exports/
  logs/
```

The processor database defaults to `outputs/processor.sqlite`.

## Guitar Trainer Compatibility

The existing Guitar Trainer app stores local markers in a SQLite file named `guitar-trainer.sqlite` at the selected video root. The relevant table is:

```sql
CREATE TABLE IF NOT EXISTS marker_states (
  content_path TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  marker_state TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

For local videos, `content_path` must be the relative path from the same root folder selected in Guitar Trainer, using `/` separators.

This processor scans `.mp4`, `.mov`, `.mkv`, `.avi`, `.m4v`, `.webm`, and `.ogg`. Guitar Trainer currently displays `.mp4`, `.webm`, `.ogg`, and `.mov`; `.mkv`, `.avi`, and `.m4v` are reported as warnings in `outputs/guitar_trainer/skipped_videos.json`.

Before direct DB import, the app creates:

```text
guitar-trainer.sqlite.backup-YYYYMMDD-HHMMSS
```

Merge modes:

- `preserve-existing`: default, adds generated markers only if missing and preserves all existing markers/annotations.
- `replace-generated`: removes and replaces only generated marker/annotation IDs for the current video fingerprint/source.
- `force`: replaces the full marker state only when `--merge force --force` is passed.

For a code-rich Next.js integration guide, see [docs/guitar-trainer-marker-import.md](docs/guitar-trainer-marker-import.md).

## Performance

Long videos can take from about 30 minutes to several hours depending on CPU/GPU, Whisper model, audio classifier, and LLM usage. Use `--limit` for resumable batches:

```bash
python app.py process "D:/GuitarVideos" --limit 10
```

The processor skips already processed videos unless `--force` is passed. Individual failures are logged and do not stop the batch.

## Known Limitations

- YAMNet labels are an evidence layer, not a perfect guitar classifier.
- Fallback chaptering is conservative and lower-confidence when OpenAI is unavailable.
- `embed-chapters` creates a copied video under `outputs/chaptered_videos/` and depends on container support for chapter metadata.
- The app relies on `ffmpeg`/`ffprobe` for real video processing.
