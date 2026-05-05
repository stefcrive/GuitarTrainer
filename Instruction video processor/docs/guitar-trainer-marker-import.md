# Guitar Trainer Marker Import Integration

This document describes how to add automatic chapter/topic marker import to an existing Next.js Guitar Trainer app that already manages a video player and per-video markers.

The goal is not to create another metadata format. The processor must emit rows that match the app's current `marker_states` table exactly, so generated chapters become normal Guitar Trainer markers and annotations.

## Existing App Contract

Guitar Trainer stores local video marker state in a SQLite database named `guitar-trainer.sqlite` at the selected video root folder.

```sql
CREATE TABLE IF NOT EXISTS marker_states (
  content_path TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  marker_state TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

For local files:

```ts
type MarkerStateRow = {
  content_path: string; // relative to selected root, forward slashes
  content_type: "local";
  marker_state: string; // JSON.stringify(VideoMarkerState)
  updated_at: number; // Unix epoch milliseconds
};
```

Example `content_path`:

```text
Jazz/Minor ii V I/lesson01.mp4
```

The value must be relative to the same root folder selected in Guitar Trainer settings.

## Marker State Shape

The processor emits this JSON shape. The app should continue to treat it as its normal `VideoMarkerState`.

```ts
export type VideoMarkerState = {
  markers: VideoMarker[];
  annotations: MarkerAnnotation[];
  activeMarkerId: string | null;
  isLooping: boolean;
};

export type VideoMarker = {
  id: string;
  startTime: number;
  endTime: number;
  title?: string;
  isLooping: false;
  completionDegree: 0;
  createdAt: number;
  diagrams: unknown[];
};

export type MarkerAnnotation = {
  id: string;
  markerId: string;
  text: string;
  tags: string[];
  timestamp: number;
};
```

Generated IDs are deterministic, so repeated imports do not create duplicates:

```text
gtm:{video_fingerprint}:chapter:{chapter_index}
gta:{video_fingerprint}:chapter:{chapter_index}
```

For timeline segment imports, the ID kind changes to `segment`:

```text
gtm:{video_fingerprint}:segment:{segment_index}
gta:{video_fingerprint}:segment:{segment_index}
```

## Processor Outputs

The Python processor writes import artifacts under:

```text
outputs/
  guitar_trainer/
    marker_states.jsonl
    marker_states.sql
    import_report.json
    skipped_videos.json
```

`marker_states.jsonl` contains one JSON object per video:

```json
{
  "content_path": "Jazz/Minor ii V I/lesson01.mp4",
  "content_type": "local",
  "updated_at": 1710000000000,
  "marker_state": {
    "markers": [
      {
        "id": "gtm:9ce59f4e54b8d514c7f1a104:chapter:0",
        "startTime": 0,
        "endTime": 120.5,
        "title": "Minor ii V I Overview",
        "isLooping": false,
        "completionDegree": 0,
        "createdAt": 1710000000000,
        "diagrams": []
      }
    ],
    "annotations": [
      {
        "id": "gta:9ce59f4e54b8d514c7f1a104:chapter:0",
        "markerId": "gtm:9ce59f4e54b8d514c7f1a104:chapter:0",
        "text": "Summary: Introduces the ii V I progression and target arpeggios.\nConfidence: 0.86",
        "tags": ["minor ii v i", "arpeggios", "speech_explanation"],
        "timestamp": 1710000000000
      }
    ],
    "activeMarkerId": null,
    "isLooping": false
  },
  "source_video_id": 42,
  "source_hash": "9ce59f4e54b8d514c7f1a104",
  "duration_seconds": 1234.5
}
```

`marker_states.sql` is a parameterized upsert template:

```sql
INSERT INTO marker_states (content_path, content_type, marker_state, updated_at)
VALUES (?, 'local', ?, ?)
ON CONFLICT(content_path) DO UPDATE SET
  content_type = excluded.content_type,
  marker_state = excluded.marker_state,
  updated_at = excluded.updated_at;
```

## Generating Import Artifacts

Run the processor after videos have been scanned and processed:

```bash
python app.py process "D:/GuitarVideos"
python app.py export-guitar-trainer "D:/GuitarVideos"
```

Export from LLM chapters:

```bash
python app.py export-guitar-trainer "D:/GuitarVideos" --source chapters
```

Export from semantic timeline segments:

```bash
python app.py export-guitar-trainer "D:/GuitarVideos" --source timeline-segments
```

Write directly to the Guitar Trainer database:

```bash
python app.py export-guitar-trainer "D:/GuitarVideos" --db "D:/GuitarVideos/guitar-trainer.sqlite"
```

Preview only:

```bash
python app.py export-guitar-trainer "D:/GuitarVideos" --dry-run
```

Merge modes:

```bash
python app.py export-guitar-trainer "D:/GuitarVideos" --merge preserve-existing
python app.py export-guitar-trainer "D:/GuitarVideos" --merge replace-generated
python app.py export-guitar-trainer "D:/GuitarVideos" --merge force --force
```

Default behavior is `preserve-existing`. Existing user-created markers are never deleted unless `replace-generated` or `force` is explicitly selected.

Before direct DB writes, the processor creates:

```text
guitar-trainer.sqlite.backup-YYYYMMDD-HHMMSS
```

## Next.js Integration Options

There are two good integration models.

1. Keep the Python processor as a sidecar CLI and let the app import `marker_states.jsonl`.
2. Let the Python processor write directly to `guitar-trainer.sqlite`, then have the app reload marker state from the existing table.

The first model is easier to review and safer for app UX because the user can inspect `import_report.json` before committing changes.

## TypeScript Import Types

Add a server-only import module, for example:

```text
src/server/guitar-trainer/import-marker-states.ts
```

```ts
import "server-only";

export type VideoMarker = {
  id: string;
  startTime: number;
  endTime: number;
  title?: string;
  isLooping: false;
  completionDegree: 0;
  createdAt: number;
  diagrams: unknown[];
};

export type MarkerAnnotation = {
  id: string;
  markerId: string;
  text: string;
  tags: string[];
  timestamp: number;
};

export type VideoMarkerState = {
  markers: VideoMarker[];
  annotations: MarkerAnnotation[];
  activeMarkerId: string | null;
  isLooping: boolean;
};

export type GuitarTrainerImportRow = {
  content_path: string;
  content_type: "local";
  updated_at: number;
  marker_state: VideoMarkerState;
  source_video_id?: number;
  source_hash?: string;
  duration_seconds?: number;
};
```

## JSONL Loader

Use a line-oriented parser so large libraries do not need to be loaded as one huge JSON array.

```ts
import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { GuitarTrainerImportRow } from "./import-marker-states";

export async function readMarkerStatesJsonl(
  filePath: string,
): Promise<GuitarTrainerImportRow[]> {
  const raw = await readFile(filePath, "utf8");

  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const row = JSON.parse(line) as GuitarTrainerImportRow;
      validateImportRow(row, index + 1);
      return row;
    });
}

function validateImportRow(row: GuitarTrainerImportRow, lineNumber: number): void {
  if (row.content_type !== "local") {
    throw new Error(`Line ${lineNumber}: content_type must be "local"`);
  }

  if (!row.content_path || path.isAbsolute(row.content_path)) {
    throw new Error(`Line ${lineNumber}: content_path must be relative`);
  }

  if (row.content_path.includes("\\") || row.content_path.includes("..")) {
    throw new Error(`Line ${lineNumber}: content_path must use safe forward-slash paths`);
  }

  if (!Number.isFinite(row.updated_at)) {
    throw new Error(`Line ${lineNumber}: updated_at must be epoch milliseconds`);
  }

  const state = row.marker_state;
  if (!state || !Array.isArray(state.markers) || !Array.isArray(state.annotations)) {
    throw new Error(`Line ${lineNumber}: marker_state is invalid`);
  }

  for (const marker of state.markers) {
    if (!marker.id || marker.endTime <= marker.startTime) {
      throw new Error(`Line ${lineNumber}: invalid marker ${marker.id}`);
    }
  }
}
```

## SQLite Upsert in Next.js

This example uses `better-sqlite3`, which is common in Electron/Tauri-style local apps and server-only Next.js code.

```bash
npm install better-sqlite3
npm install -D @types/better-sqlite3
```

```ts
import "server-only";

import Database from "better-sqlite3";
import { copyFile, mkdir, open } from "node:fs/promises";
import path from "node:path";
import type { GuitarTrainerImportRow, VideoMarkerState } from "./import-marker-states";

type MergeMode = "preserve-existing" | "replace-generated" | "force";

export async function importMarkerStatesToDb(options: {
  dbPath: string;
  rows: GuitarTrainerImportRow[];
  mergeMode?: MergeMode;
  force?: boolean;
}): Promise<{ imported: number; backupPath: string }> {
  const mergeMode = options.mergeMode ?? "preserve-existing";

  if (mergeMode === "force" && !options.force) {
    throw new Error("mergeMode force requires force=true");
  }

  const backupPath = await backupSqliteDb(options.dbPath);
  const db = new Database(options.dbPath);

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS marker_states (
        content_path TEXT PRIMARY KEY,
        content_type TEXT NOT NULL,
        marker_state TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    const upsert = db.prepare(`
      INSERT INTO marker_states (content_path, content_type, marker_state, updated_at)
      VALUES (?, 'local', ?, ?)
      ON CONFLICT(content_path) DO UPDATE SET
        content_type = excluded.content_type,
        marker_state = excluded.marker_state,
        updated_at = excluded.updated_at
    `);

    const getExisting = db.prepare(`
      SELECT marker_state
      FROM marker_states
      WHERE content_path = ?
    `);

    const transaction = db.transaction((rows: GuitarTrainerImportRow[]) => {
      for (const row of rows) {
        const existing = getExisting.get(row.content_path) as
          | { marker_state: string }
          | undefined;

        const markerState =
          mergeMode === "force"
            ? row.marker_state
            : mergeMarkerStates({
                existing: existing ? JSON.parse(existing.marker_state) : undefined,
                incoming: row.marker_state,
                sourceHash: row.source_hash,
                replaceGenerated: mergeMode === "replace-generated",
              });

        upsert.run(
          row.content_path,
          JSON.stringify(markerState),
          row.updated_at,
        );
      }
    });

    transaction(options.rows);
    return { imported: options.rows.length, backupPath };
  } finally {
    db.close();
  }
}

async function backupSqliteDb(dbPath: string): Promise<string> {
  await mkdir(path.dirname(dbPath), { recursive: true });

  const handle = await open(dbPath, "a");
  await handle.close();

  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z")
    .replace("T", "-");

  const backupPath = `${dbPath}.backup-${stamp}`;
  await copyFile(dbPath, backupPath);
  return backupPath;
}
```

## Merge Generated Markers Without Deleting User Markers

Generated marker IDs have a stable `gtm:` prefix and generated annotation IDs have a stable `gta:` prefix. Use this to merge safely.

```ts
function mergeMarkerStates(options: {
  existing?: VideoMarkerState;
  incoming: VideoMarkerState;
  sourceHash?: string;
  replaceGenerated: boolean;
}): VideoMarkerState {
  const existing = options.existing ?? {
    markers: [],
    annotations: [],
    activeMarkerId: null,
    isLooping: false,
  };

  const sourceKind = inferSourceKind(options.incoming);
  const markerPrefix = options.sourceHash
    ? `gtm:${options.sourceHash}:${sourceKind}:`
    : "gtm:";
  const annotationPrefix = options.sourceHash
    ? `gta:${options.sourceHash}:${sourceKind}:`
    : "gta:";

  const existingMarkers = options.replaceGenerated
    ? existing.markers.filter((marker) => !marker.id.startsWith(markerPrefix))
    : [...existing.markers];

  const existingAnnotations = options.replaceGenerated
    ? existing.annotations.filter(
        (annotation) => !annotation.id.startsWith(annotationPrefix),
      )
    : [...existing.annotations];

  const markerIds = new Set(existingMarkers.map((marker) => marker.id));
  const annotationIds = new Set(
    existingAnnotations.map((annotation) => annotation.id),
  );

  for (const marker of options.incoming.markers) {
    if (!markerIds.has(marker.id)) {
      existingMarkers.push(marker);
      markerIds.add(marker.id);
    }
  }

  for (const annotation of options.incoming.annotations) {
    if (!annotationIds.has(annotation.id)) {
      existingAnnotations.push(annotation);
      annotationIds.add(annotation.id);
    }
  }

  existingMarkers.sort((a, b) => a.startTime - b.startTime);

  return {
    markers: existingMarkers,
    annotations: existingAnnotations,
    activeMarkerId: existing.activeMarkerId,
    isLooping: existing.isLooping,
  };
}

function inferSourceKind(state: VideoMarkerState): "chapter" | "segment" {
  const firstId = state.markers[0]?.id ?? "";
  return firstId.includes(":segment:") ? "segment" : "chapter";
}
```

## Next.js Route Handler Example

For App Router, keep filesystem and SQLite access in a server route.

```ts
// src/app/api/marker-import/route.ts
import { NextResponse } from "next/server";
import path from "node:path";
import { importMarkerStatesToDb } from "@/server/guitar-trainer/import-to-db";
import { readMarkerStatesJsonl } from "@/server/guitar-trainer/read-jsonl";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    rootFolder: string;
    dbPath?: string;
    outputFolder?: string;
    mergeMode?: "preserve-existing" | "replace-generated" | "force";
    force?: boolean;
  };

  const dbPath = body.dbPath ?? path.join(body.rootFolder, "guitar-trainer.sqlite");
  const outputFolder = body.outputFolder ?? "outputs";
  const jsonlPath = path.join(outputFolder, "guitar_trainer", "marker_states.jsonl");

  const rows = await readMarkerStatesJsonl(jsonlPath);
  const result = await importMarkerStatesToDb({
    dbPath,
    rows,
    mergeMode: body.mergeMode ?? "preserve-existing",
    force: body.force ?? false,
  });

  return NextResponse.json({
    ok: true,
    imported: result.imported,
    backupPath: result.backupPath,
  });
}
```

## Running the Processor From Next.js

If the app should start processing from the UI, call the Python CLI from server-only code. Do not run this from a browser component.

```ts
import "server-only";

import { spawn } from "node:child_process";

export function runGuitarTrainerExport(options: {
  rootFolder: string;
  dbPath?: string;
  source?: "chapters" | "timeline-segments";
  dryRun?: boolean;
}): Promise<void> {
  const args = [
    "app.py",
    "export-guitar-trainer",
    options.rootFolder,
    "--source",
    options.source ?? "chapters",
  ];

  if (options.dbPath) {
    args.push("--db", options.dbPath);
  }

  if (options.dryRun) {
    args.push("--dry-run");
  }

  return new Promise((resolve, reject) => {
    const child = spawn("python", args, {
      cwd: process.env.INSTRUCTION_VIDEO_PROCESSOR_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || `Processor exited with code ${code}`));
      }
    });
  });
}
```

For long-running processing, store a job record and stream status to the UI instead of blocking a request until completion.

## Loading Imported Markers in the Player

The player can read `marker_state` exactly as it already does:

```ts
import "server-only";

import Database from "better-sqlite3";
import type { VideoMarkerState } from "@/server/guitar-trainer/import-marker-states";

export function getMarkerState(options: {
  dbPath: string;
  contentPath: string;
}): VideoMarkerState {
  const db = new Database(options.dbPath, { readonly: true });

  try {
    const row = db
      .prepare(
        `SELECT marker_state FROM marker_states
         WHERE content_path = ? AND content_type = 'local'`,
      )
      .get(options.contentPath) as { marker_state: string } | undefined;

    if (!row) {
      return {
        markers: [],
        annotations: [],
        activeMarkerId: null,
        isLooping: false,
      };
    }

    return JSON.parse(row.marker_state) as VideoMarkerState;
  } finally {
    db.close();
  }
}
```

Normalize app paths the same way the processor does:

```ts
import path from "node:path";

export function toGuitarTrainerContentPath(rootFolder: string, absolutePath: string): string {
  return path.relative(rootFolder, absolutePath).split(path.sep).join("/");
}
```

## Import Report UI

Surface `outputs/guitar_trainer/import_report.json` in the app before direct DB import.

```ts
export type GuitarTrainerImportReport = {
  root_folder: string;
  generated_at: string;
  videos_seen: number;
  videos_with_markers: number;
  videos_without_chapters: number;
  videos_not_visible_to_guitar_trainer: number;
  marker_count: number;
  annotation_count: number;
  db_written: boolean;
  db_path: string | null;
  backup_path: string | null;
  dry_run?: boolean;
  merge_mode?: string;
  source?: string;
  warnings: string[];
};
```

Suggested UI fields:

```text
Videos scanned
Videos with generated markers
Markers to import
Annotations to import
Videos with unsupported visible extensions
Merge mode
Backup path
Warnings
```

Guitar Trainer currently scans:

```ts
const GUITAR_TRAINER_VISIBLE_EXTENSIONS = [".mp4", ".webm", ".ogg", ".mov"];
```

The processor can still process `.mkv`, `.avi`, and `.m4v`, but those files may not appear in Guitar Trainer unless the scanner is updated.

## Marker Generation Rules

The processor should keep these rules stable because the app depends on repeatable imports:

```py
start = clamp(chapter["start_seconds"], 0, duration_seconds)
end = clamp(chapter.get("end_seconds", duration_seconds), 0, duration_seconds)

if end - start < 1.0:
    skip_marker()
```

Markers:

```py
marker = {
    "id": f"gtm:{video_hash}:chapter:{chapter_index}",
    "startTime": round(start, 3),
    "endTime": round(end, 3),
    "title": chapter["title"],
    "isLooping": False,
    "completionDegree": 0,
    "createdAt": updated_at,
    "diagrams": [],
}
```

Annotations:

```py
annotation = {
    "id": f"gta:{video_hash}:chapter:{chapter_index}",
    "markerId": marker["id"],
    "text": "\n".join(
        [
            f"Summary: {chapter['summary']}",
            f"Confidence: {chapter.get('confidence', 'unknown')}",
        ]
    ),
    "tags": normalize_tags([*chapter_tags, *relevant_video_tags]),
    "timestamp": updated_at,
}
```

Tags should be lowercase, trimmed, deduplicated, and practical for filtering:

```ts
export function normalizeTags(tags: string[], maxCount = 20): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const tag of tags) {
    const cleaned = tag.trim().toLowerCase().replace(/\s+/g, " ");

    if (!cleaned || seen.has(cleaned)) {
      continue;
    }

    seen.add(cleaned);
    result.push(cleaned);

    if (result.length >= maxCount) {
      break;
    }
  }

  return result;
}
```

## End-To-End Smoke Test

1. Process a small root:

```bash
python app.py process "D:/GuitarVideos" --limit 1
```

2. Generate import artifacts:

```bash
python app.py export-guitar-trainer "D:/GuitarVideos" --dry-run
```

3. Inspect the report:

```bash
type outputs\guitar_trainer\import_report.json
```

4. Import into a copy of the Guitar Trainer DB:

```bash
copy "D:\GuitarVideos\guitar-trainer.sqlite" "D:\GuitarVideos\guitar-trainer.test.sqlite"
python app.py export-guitar-trainer "D:/GuitarVideos" --db "D:/GuitarVideos/guitar-trainer.test.sqlite"
```

5. Verify rows:

```sql
SELECT content_path, content_type, updated_at
FROM marker_states
ORDER BY updated_at DESC
LIMIT 10;
```

6. Open the matching local video in Guitar Trainer and confirm generated markers appear chronologically with annotations and tags.

## MVP Completion Checklist

- The processor emits `outputs/guitar_trainer/marker_states.jsonl`.
- The processor emits `outputs/guitar_trainer/marker_states.sql`.
- The processor emits `outputs/guitar_trainer/import_report.json`.
- The processor emits `outputs/guitar_trainer/skipped_videos.json`.
- `content_path` is relative to the selected Guitar Trainer root and uses `/`.
- `marker_state` matches `VideoMarkerState`.
- Generated IDs are deterministic.
- Default merge mode preserves user-created markers.
- Direct DB import creates a timestamped backup.
- Import errors leave the backup in place and write an error report.
- Unsupported-but-processed extensions produce compatibility warnings.
