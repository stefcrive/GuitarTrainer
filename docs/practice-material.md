# Practice material library

Use `E:\GUITAR MUSIC ARCHIVE\PRACTICE MATERIAL` as **Settings > Practice Material Root**.
Selecting it enables scanning its audio as well as its videos. Books use the same root.
The browser must grant access through the directory picker; the server root registry
does not replace that permission. Restart an already running app after updating its code.

## Organization completed on November 9, 2026

- Merged the subject folders under `Guitar Books` into the common subject/course tree.
- Kept all colliding files, using `Copy 02`, `Copy 03`, etc. These names do not assert
  that the contents are identical.
- Reunited clearly named companions, including Howard Morgen's Fingerboard
  Breakthrough book, Wes Montgomery's Play-Along book, Don Mock's Melodic Minor
  book, and Mark Lettieri's course video and PDFs.
- Grouped Eric Johnson's Fine Art of Guitar video parts and booklet together.
- Moved Loop Loft libraries under Rhythm and Backing Resources, preserving their
  internal filenames and folder relationships. Legacy course-player packages and
  multipart archives keep their internal structure.
- Retained 9,446 files. Verified all 5,254 moved files with full SHA-256 checksums
  before and after each move. Preserved 137 filename collisions as separate copies.
- Updated 20 database rows and the affected legacy marker filename. Backups of
  changed metadata are in the audit directory. Removed 422 empty folders, with
  their paths recorded for reversal. Folders holding legacy metadata are retained.
- Indexed 5,893 supported media/document files in 114 course groups; 90 groups
  contain more than one supported media type.

Audit directory:
`E:\GUITAR MUSIC ARCHIVE\_Organization Audit 2026-11-09 Unified`

`plan.json` records old/new paths; `execution.jsonl` includes content hashes;
`metadata.json` records metadata backups and updates; `verification.json` records
the results; `course-catalog.json` lists the mixed-media courses and their files.

## Navigation

Visited application pages remain mounted during navigation for the current app
session. Books keeps its scanned library, open document, page/zoom, filters,
expanded folders, dialogs, and library/document scroll positions. The other
pages retain their own open workspace too. A plain navigation link resumes the
page; a new companion link applies its new target. **Show all material** explicitly
clears a saved course filter. Changing the root or requesting a refresh still
rescans the library. Reloading or closing the app ends this in-memory session.

Navigation regression checked with 100 test documents: Books -> Scales -> Books
retained Book 030, 150% zoom, library scroll 768 px, and document scroll 1,440 px.
The instrumented root scan count was unchanged after navigation and browser Back.
`node --test scripts/test-workspace-navigation.cjs` covers retained page queries,
new companion targets, explicit clearing, and separate YouTube video workspaces.

Videos, Audio, and Books remain separate pages. Their folder trees share subject
and course names. Generic `Audio`, `Video`, `PDF`, and similar media folders are
omitted from the displayed tree, while real paths stay unchanged.

The book, music, and video icons beside a file open its companions on the
corresponding page. A single companion opens directly. Multiple companions open
the course's filtered library. The selected item's toolbar shows companion counts.
Use **Show all material** to clear the course filter. Tooltips explain that these
are course-folder relationships, not verified page/track references.

Loose files directly in a subject folder are not automatically linked to every
other file in that subject. Separate courses never match solely on a filename.
JPG, JPEG, PNG, GIF, and WebP scans can now open in Books alongside PDFs.

Legacy AVI/MPG videos, TIFF scans, WMA/AC3 audio, archives, MIDI, Power Tab and Guitar
Pro files are preserved. This pass does not add playback/readers for those formats
or extract archives. Browser-local favorites/history may still contain old paths;
the migration updates disk metadata, not the browser's private storage.

## Reversal

Close Guitar Trainer first. From the repository directory, run:

```powershell
node scripts/organize-practice-material.cjs 'E:/GUITAR MUSIC ARCHIVE/PRACTICE MATERIAL' 'E:/GUITAR MUSIC ARCHIVE/_Organization Audit 2026-11-09 Unified' undo
```

The undo command checks every moved file and the changed metadata before restoring
paths. It refuses to overwrite subsequent media or metadata changes. It reverses
this pass only; the user's rename to `PRACTICE MATERIAL` remains. Empty destination
folders may remain. Keep the audit directory for reversal.

## Validation

- `node --test scripts/test-practice-material.cjs`: relationship boundaries, shared
  media-folder hierarchy, Unicode/reserved URL characters, image formats and exclusions.
- `node --test scripts/test-practice-organization.cjs`: collision preservation,
  metadata migration, refusal to overwrite later edits, and byte-exact reversal
  using an isolated temporary library.
- TypeScript, lint and production build pass. Existing lint warnings remain.
- Browser checks with an isolated in-memory library: video to book, book to filtered
  video course, video to audio, audio to book, same course hierarchy, compact rows,
  mobile navigation, course-folder collapse, and empty search. A generated silent
  WAV loaded successfully; the temporary test route was removed afterward.
- The real library's 90 mixed-media groups were checked from its filesystem index.
  The browser's native directory picker could not be completed through the test
  interface, so live playback against the full archive was not verified.

Manual follow-up: select the root, open Fingerboard Breakthrough in Videos, click
its book icon, then test a book's audio link in Wes Montgomery - Play-Along. Confirm
that a saved Mark Lettieri marker still opens after the path migration.
