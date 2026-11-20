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

An OpenAI key is required for teaching-unit generation. Missing credentials and provider failures are reported explicitly; no keyword fallback replaces the result.

In Guitar Trainer, open **Settings > Automatic marker generation**. Enter the OpenAI key, optionally enter a TypeSafe/Jev key, choose **LLM only** or **Jev + LLM**, and save. Keys are saved server-side in `.env.local`; responses expose only configured/not-configured status. Blank inputs preserve keys; Remove clears them. Desktop installations use `.env.local` beside the user-data root registry. `GUITAR_TRAINER_SETTINGS_ENV` can override the settings path.

Jev mode also requires `TYPESAFE_API_KEY`. Both modes use the text model for topic discovery, boundary review, and titles. `MARKER_DECISION_PROVIDER`, `MARKER_LLM_MODEL`, and `JEV_MODEL` override the YAML settings. CLI commands read credentials from their process environment; the application passes its saved credentials to the processor automatically.

## Teaching-unit generation

### YouTube videos

Open a YouTube video in Guitar Trainer and select **Automatic marker generation** below the player. The player must have loaded its duration, and a video root must be selected in Settings for marker storage. The root does not need to contain a local copy of the YouTube video.

The server fetches existing captions with `youtube-transcript-api` (installed by `requirements.txt`), then uses the same OpenAI/Jev teaching-unit pipeline. No video/audio download or Whisper transcription is performed. In automatic language mode, English tracks are preferred, with manual captions preferred over automatic captions in that language; otherwise an available original-language track is used. The processor's `language` setting can request a specific caption language.

Caption timestamps may overlap because subtitles stay on screen. These intervals are normalized without deleting their text, and are not treated as teaching-unit boundaries. Captions are cached for 24 hours in `outputs/youtube/captions`; generation traces are saved in `outputs/youtube`. Existing manual markers and annotations are preserved; regeneration replaces only the generated markers for that video. Progress can resume after navigation in the same browser tab.

Caption availability is controlled by YouTube. Disabled captions, restricted/private videos, live streams without a duration, and blocked requests produce explicit errors. This integration does not bypass restrictions or silently invent a transcript. It uses the same Jev/OpenAI keys configured in Settings; no additional YouTube Data API key is needed to fetch captions.

Validate the caption adapter with `python -m pytest tests/test_youtube_markers.py -q` and marker preservation with `node --test scripts/test-youtube-markers.cjs` from the repository root. Manual checks: load a captioned video, generate, verify looping and persisted markers after reloading; generate again with a manual marker present; switch videos during generation and return; try a video without captions and verify the error leaves existing markers intact.

### Local videos

The processor reads the original timestamped transcript without character truncation. It discovers lesson-specific topics, optionally classifies every transcript segment with Jev, reviews boundaries with overlapping context, then writes metadata for each complete unit. Audio blocks, pauses, duration targets, and chapter-count limits do not determine boundaries. A unit spans explanation, played examples, corrections, and repetition until the next teaching objective. A later return to the same topic creates a separate contiguous marker.

The review model sees Jev's probabilities and can correct uncertain assignments, missed changes, and excessive splits. Model-supplied segment IDs are validated; timestamps come from the transcript. Pure introductory/trailing banter is excluded, and played passages between speech anchors remain inside the unit. This is transcript-based inference: demonstrations without spoken context may still need manual correction.

The v4 prompts organize around parent learning objectives, not individual subtopics. A boundary needs both a sufficiently complete preceding objective and a distinct next objective with enough local setup to revisit independently. Setup, explanations, constituent steps, demonstrations, variations, corrections, and practice directions stay together when they serve the same objective. A brief supporting digression does not split it. Uncertainty favors continuation, without merging unrelated objectives or imposing a duration/count target. The same rule applies to Lessons, Repertoire, and Musical devices.

Jev does not write the markers or tags. The text model first discovers objectives; Jev optionally answers three questions per transcript segment (parent objective, probability of an independent unit start, and probability of instructional content); the text model reviews boundaries and then describes each unit. These stages use overlapping transcript windows, so source-wide completeness remains something to check when evaluating real outputs.

Generated filter tags use the shared 40-label `MARKER_TAG_VOCABULARY` in `tagger.py`. The metadata prompt asks for 1-2 central tags, permits a third only when it materially helps retrieval, and permits zero when none fits. Code enforces the vocabulary and maximum of three, canonicalizes spelling variants, and removes duplicates. Artist names, song names, keys, positions, and detailed topic phrases belong in titles, summaries, or learning metadata. Export no longer pads tags from topics, domains, audio types, or video-wide metadata. The app catalog also keeps descriptive learning metadata out of filter tags; it remains searchable in the learning dashboard.

The pipeline version invalidates old decision checkpoints while preserving cached transcripts. Existing stored markers/tags are not migrated by this change; regenerate the desired lessons to apply the new prompts. Manual validation: generate a lesson with setup, examples, variations, and a final assignment; check that one complete objective stays together and genuinely independent objectives remain separate. Check local-video and YouTube tags, then verify that detailed topic text remains searchable in the learning dashboard without appearing as extra tags. Model-output quality needs a real generation review; mocked regression tests only verify pipeline and tag constraints.

The automatic-generation button regenerates chapters even for previously processed videos and reuses a saved transcript when its source fingerprint matches. `--force` retranscribes. Completed chapters replace previous processor chapters transactionally. Failed model requests preserve previous chapters and do not import changes into Guitar Trainer. Decision evidence, provider/model identifiers, and Jev responses are saved in `outputs/decisions/<video_id>_decisions.json` without credentials.

Compare modes using the same transcript, without importing or changing live markers:

```bash
python app.py rechapter --video-id 9 --provider llm
python app.py rechapter --video-id 9 --provider jev
```

Each run saves a separate JSON file under `outputs/experiments/`. `--apply` updates processor chapters only; exporting to Guitar Trainer remains a separate command. For a useful comparison, manually mark desired teaching-unit boundaries on a few representative videos and compare missed changes, false splits, merged objectives, and example completeness. Keep one video aside for validation after tuning.

### Validation

Run `python -m pytest tests -q` in this directory. From the repository root, run `node --test scripts/test-marker-settings.cjs`, `npm run lint`, and `npx tsc --noEmit`.

Manual checks: save keys and reload Settings (only configured status should return); switch providers; generate twice for one unchanged video and verify the second run reports transcript reuse; verify markers span played examples; reject an invalid provider key and confirm existing markers remain; compare the two transcript-only previews. API access is required to evaluate real semantic accuracy.

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

Automatic marker generation offers **Lessons**, **Repertoire**, and **Musical devices** presets with optional custom segmentation instructions. All keep complete revisitable units together across played examples. Preferences apply to discovery, Jev classification, boundary review, and marker descriptions.

Existing transcripts are reused regardless of the chosen segmentation. Local transcripts and YouTube captions have a versioned archive in `%LOCALAPPDATA%/GuitarTrainer/processor-cache/transcripts` (or `~/GuitarTrainer/processor-cache/transcripts` without LOCALAPPDATA). Set `GUITAR_TRAINER_CACHE_DIR` to relocate this cache. There is no automatic expiry or deletion. Back up this folder along with the video library. The archive can restore transcripts if the processor database or `outputs` folder is lost. Changed source fingerprints acquire a separate transcript; explicit `--force` transcription retains earlier versions.

Validated discovery, Jev, and boundary-review windows are checkpointed under the same cache. Retrying an interrupted job reuses matching decisions; changing the prompt, preset, source text, model, or pipeline version recomputes the affected decisions.

**Fast** transcription uses faster-whisper batches of four with the same model and beam size as **Standard**, trading more memory and potentially different wording for throughput. CPU threads default to up to eight. The UI honors `MARKER_WHISPER_CPU_THREADS` and `MARKER_WHISPER_MODEL` overrides. Single-video generation probes only the selected file and skips unused audio classification. YouTube uses available captions without audio transcription.

CLI configuration supports `marker_preset`, `marker_prompt`, and `transcription_mode`, or environment variables `MARKER_PRESET`, `MARKER_PROMPT`, and `TRANSCRIPTION_MODE`. Use `--regenerate` to reuse a transcript and regenerate markers. Use `--limit` for resumable batches:

```bash
python app.py process "D:/GuitarVideos" --limit 10
```

The processor skips already processed videos unless `--force` is passed. Individual failures are logged and do not stop the batch.

UI validation: open Automatic marker generation, switch presets, enter custom instructions, then cancel or press Escape (no job starts). Reopen and generate; changing focus reuses the saved transcript. YouTube uses the same dialog without a Whisper control. The desktop dialog was checked for focus and overflow; the existing video workspace hides its player pane at phone widths, so that layout could not expose this dialog for a phone-size check.

## Known Limitations

- Teaching-unit generation requires OpenAI; Jev mode additionally requires TypeSafe. Provider failures preserve transcripts and previously generated chapters.
- YouTube captions may be unavailable, restricted, or blocked by YouTube.
- `embed-chapters` creates a copied video under `outputs/chaptered_videos/` and depends on container support for chapter metadata.
- The app relies on `ffmpeg`/`ffprobe` for real video processing.
