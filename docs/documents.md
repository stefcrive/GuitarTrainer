# Books, OCR, and music practice

Open **Books** in the navigation (`/documents`). The library scans the configured video root recursively, or the audio root if no video root is selected. It supports PDF, TXT, Markdown, ASCII TAB, DOCX text, and MusicXML (`.xml`, `.musicxml`, `.mxl`). Hidden folders and generated build directories are excluded.

## Reading and markers

- The library preserves the root directory's folder hierarchy, including nested folders. Collapse folders or search by name/path; searches expose matching ancestors. Select a document, navigate its pages or text sections, and adjust zoom.
- **Marker** saves a page range and optional selected image region. **Edit** provides the same learning categories as media markers: Repertoire, Musical devices, and Training, plus notes, tags, and completion percentage.
- **Generate** reads PDF bookmarks, contents/index entries, and heading patterns. Pages without usable text are OCR processed. Set **Index offset** when printed and physical page numbers differ: printed page 1 on PDF page 7 means offset 6.
- Optional staff detection proposes five-line notation and six-line TAB regions throughout the selected page range. It tolerates small scan rotations. Every candidate can be renamed, included, or excluded before saving. Existing markers and their notes are preserved.
- Cancel stops OCR/recognition and leaves completed marker candidates available for review. Recognized page text is cached for subsequent scans; changes to document size or modification time invalidate that cache.

Markers, OCR text, and scores are versioned JSON sidecars under `.guitar-documents` in the selected root. The source documents are never rewritten. Back up this directory with the books. Browser-only folder fallback uses the application's browser storage; native folder access writes sidecars to disk. DOCX is a text view, not a faithful Word layout. TXT/MD sections are bounded line groups, not printed pages.

## OCR engines selected on 2026-11-08

| Purpose | Choice | Reason and limits |
| --- | --- | --- |
| Scanned text, headings, and contents | PaddleOCR.js 0.4.2, PP-OCRv6 small | Current official browser SDK; multilingual local recognition and line coordinates without a Python/GPU service. |
| Printed staff notation | Audiveris 5.11.0 | Current stable OMR release with batch processing and MusicXML export for pitches, meter, and rhythmic durations. Runs as a separate local executable. |
| Six-string TAB | Staff geometry plus PaddleOCR numeral recognition | Experimental. Extracts string/fret drafts in standard EADGBE tuning. It cannot reliably infer rhythm, meter, bends, slides, or alternate tuning. |

The selection favors a practical local deployment. It is not a claim of a benchmark win on all guitar books. General text OCR does not recognize musical notation. Audiveris is a dedicated OMR engine, and its own project discussions describe the variation in guitar tablature and limited support. Tesseract.js is a mature browser OCR alternative, but the current PaddleOCR SDK provides the newer text model and polygon output used here. Local OCR does not send document pages to a cloud model. The optional GPT reader sends the captured image to OpenAI only when selected.

Primary references:

- [PaddleOCR official project and PP-OCRv6 release information](https://github.com/PaddlePaddle/PaddleOCR)
- [Official PaddleOCR browser SDK options and output](https://github.com/PaddlePaddle/PaddleOCR/blob/main/paddleocr-js/packages/core/README.md)
- [Audiveris 5.11.0 release](https://github.com/Audiveris/audiveris/releases/tag/5.11.0)
- [Audiveris batch CLI](https://audiveris.github.io/audiveris/_pages/guides/advanced/cli/)
- [Audiveris tablature discussion](https://github.com/Audiveris/audiveris/discussions/754)
- [Tesseract.js API](https://github.com/naptha/tesseract.js/blob/master/docs/api.md)

## Local setup

`npm install` installs the JavaScript packages. `npm run dev` and `npm run build` prepare the local PDF worker, fonts, OCR worker, and ONNX runtime. On the first run, preparation downloads two official PaddleOCR model archives. Subsequent runs reuse them. To prepare explicitly:

```powershell
npm run documents:assets
```

For music recognition on Windows:

```powershell
npm run documents:omr
```

This downloads the official Audiveris 5.11.0 console MSI, verifies its release checksum when supplied, and extracts it under `.document-tools`. It does not install Audiveris system-wide. The release includes its own Java runtime. Alternatively set `AUDIVERIS_PATH` in `.env.local` to an absolute Audiveris executable path; use this approach on Linux/macOS or with an existing installation. Restart the server after changing environment variables.

Audiveris remains a separate AGPL-3.0 application with its upstream licenses. PaddleOCR uses Apache-2.0. The Windows app packages generated browser assets through the existing `public` resource rule; Audiveris must be installed/configured separately on the destination machine. For a packaged app, set `AUDIVERIS_PATH` in its user `config.env`. The development-only extracted path is not portable to another computer.

Node 22.13+ or 24+ is required by the selected PDF.js release. Keep PaddleOCR.js and ONNX Runtime versions paired: the supplied worker bundles ONNX Runtime 1.24.3 and must load matching WASM assets. These versions are pinned. Browser assets are served locally, so the application's content security policy does not need extra external origins.

## Recognition and playback

Use **Select region** to drag a crop, or **Coordinates** for keyboard selection. Include a complete staff system with its clef, key, and time signature. A single isolated note cannot supply all of that context. **Read notation** offers Selected region, Entire page, and Multiple pages (including All pages). Pages are transcribed sequentially and combined into one score. Cancel or a later-page failure keeps completed pages available for review. Read TAB is no longer offered in the toolbar while notation is the focus; existing TAB markers remain editable.

Before recognition, six-line TAB bands are masked, scan tilt is corrected, and five-line staff spacing is normalized near Audiveris' recommended 20 pixels. A tighter spacing check prevents a long beam above notation from being mistaken for a sixth TAB line. The original source image remains visible. MusicXML TAB parts are excluded from notation playback to avoid duplicate notes.

The score modal displays the source notation with a moving playhead, page selector, zoom, and auto-scroll. Note x positions and staff geometry come from Audiveris MusicXML and OMR output, then map back to the original crop. The note editor can be expanded when needed. Older saved scores without coordinates can be refreshed with **Read again**. MusicXML durations preserve tuplets, dotted notes, rests, chords, independent voices, ties, explicit instrument transposition, pickups, and measure meter changes. Set BPM in quarter notes per minute, select start and end measures, and enable looping. Loop settings, BPM, octave, tempo-click preference, and auto-scroll preference are saved with the score. The metronome shares the note scheduler, follows each measure's beat unit, accents full-bar starts, and can be muted live. BPM is always quarter notes per minute: 6/8 at 80 BPM produces eighth-note clicks at 160/minute. The synthesized practice sound uses Web Audio; opening another page or closing the modal stops it.

Playback no longer requires a review checkbox; valid notes, meter, BPM, and a measure range are sufficient. Notation recognition uses a detected meter first. If absent, it carries the previous page's meter, infers a candidate from consistent measure lengths, or uses the configured fallback (4/4 by default). The player labels the meter as recognized, carried, inferred, assumed, or manual. These are draft assumptions, not proof of meter. Short full bars are padded with silence; note durations are never stretched to fit. Overflowing bars are flagged for review. Raw MusicXML imports and TAB drafts still preserve unknown meters until edited. TAB drafts start with placeholder quarter-note durations and require timing correction. **Score editor** provides manual notes and an import path for corrected MusicXML. The note editor contains Add note. Meter edits update matching measures and click accents, preserve later explicit meter changes, and do not rewrite note durations; check the measure list when changing a score. Octave affects playback only.

Limits: OMR accuracy depends on scan quality. Repeats and navigation jumps play in written order; grace notes are omitted with a warning. Unpitched percussion is not synthesized. TAB string alignment and digits may be missed or misread; chord diagrams, handwritten notation, and alternate tuning are not automatically decoded. Whole-book staff detection proposes regions for recognition, not a verified complete transcription.

Recognition requests accept bounded PNG selections, use a private temporary directory, have a three-minute timeout, and run one Audiveris process at a time. Cancellation terminates that process. The server removes temporary input and output files after the request. This is a local desktop workflow; a hosted multi-user deployment would need authenticated job isolation.

## Validation and manual checks

```powershell
node --test tests/documents.test.mjs
npm run lint
npm run build
```

The focused tests cover score timing, ties, chords, rests, transposition, absent meter, compressed MusicXML, DOCX text, TOC offsets, marker preservation, tilted staff detection, recursive scanning, cancellation, and serialized sidecar saves.

Browser checks use an isolated directory: open text and scanned PDFs; generate and review markers; select a staff region; recognize notation; verify the fallback meter is labeled; correct the score, play/stop and loop with click on/off; save/reopen markers; edit TAB pitches and triplet durations; cancel OCR; and inspect both desktop and narrow layouts. The supplied triplet image produced four detected systems and an Audiveris draft requiring review. It contains no visible time signature; notation recognition now uses a labeled fallback rather than blocking on a blank meter.

### Notation hardening checks (2026-11-08)

The mixed vocal/guitar/TAB attachment now transcribes two notation parts instead of treating the wider TAB as the music scale. Guitar sixteenth-note beams are recovered more successfully, although that scan still needs an assumed meter and manual corrections. The screenshot containing sextuplets now retains the notation staff, excludes TAB, and recognizes 4/4. Its sextuplets and some notes are still imperfect: this is an editable draft, not verified transcription.

Browser checks covered actual two-page recognition, source-coordinate playheads, vertical auto-scroll, page transitions, live metronome mute, saved/reopened loop and click settings, partial results after a failed page, folder collapse/search, and a 390px viewport without horizontal modal overflow. Unit coverage includes duplicate TAB exclusion, simultaneous-part alignment, meter provenance/padding, page merging, meter-aware clicks, OMR geometry, and beam-versus-TAB detection.

Additional engine reference: [Audiveris staff scale guidance](https://audiveris.github.io/audiveris/_pages/explanation/steps/scale/).

### Player and recovery update

Loop controls use inclusive start/end measure dropdowns. Legacy beat-range settings are ignored on first opening; new measure selections are persisted. The review checkbox has been removed from both UI and playback validation. Source lookup uses measure order to prevent repeated labels from overwriting earlier coordinates. Parts with unequal measure counts retain later bar boundaries. Playheads choose the earliest printed staff at simultaneous starts and never jump to future notes when a measure lacks positioned events. Existing transcriptions should be refreshed with Read again to regenerate timing and source coordinates.

On a recognition failure, the client retries the same captured region at higher resolution, then with TAB masking disabled. Recovered scores display the captured source and record recovery details in the recognition tooltip. Cancellation and service/configuration errors do not trigger retries. Valid MusicXML exports are recovered from partial Audiveris runs even when the process returns a nonzero code.

### Tuplets and opening-system recovery

Audiveris now enables implicit tuplets through its documented processing constant. In the supplied sextuplet sample, a local recognition run recovered 24 first-measure notes with tuplet timing; the prior configuration returned 18 without tuplet timing. MusicXML explicit durations are not scaled twice; absent durations can be derived from note type, dots, and the actual/normal tuplet ratio.

Recognition checks five-line staff coverage, including the first staff, even after a successful API response. Missing rows produce a visible uncertainty notice when usable notes exist; engine failures trigger crop-preserving higher-resolution and unmasked retries. If needed, TAB-separated guitar systems are transcribed independently and combined in printed order; multiple notation staves before one TAB band stay together. Systems with no usable notes are reported; geometric uncertainty alone no longer rejects a usable system. Source movement ordering follows printed coordinates. Existing saved transcriptions need Read again.

Engine references: https://audiveris.github.io/audiveris/_pages/guides/advanced/cli/ and https://github.com/Audiveris/audiveris/blob/5.11.0/app/src/main/java/org/audiveris/omr/sheet/ProcessingSwitches.java

### GPT vision and crop-preserving retries

Read notation now offers Audiveris (local) or GPT-6 Astra (OpenAI). The latter sends only the captured PNG image to the Responses API, with low reasoning effort to reduce latency, high-detail image input, strict JSON Schema output, and store=false. No cloud requests occur as an automatic fallback from Audiveris. Users can also upload a PNG/JPEG/WebP screenshot in the recognition dialog; uploads use GPT and are saved with their score preview. API usage is billed to the configured OpenAI project.

The OpenAI key already present in Settings is shared; find it under AI services and marker generation. Keys remain server-side. No model switch to a cheaper model occurs silently if Astra is unavailable. Model choice was verified against https://developers.openai.com/api/docs/models/gpt-6-astra and https://developers.openai.com/api/docs/guides/latest-model.

GPT returns 480-tick measure-local timing, MIDI pitches/rests, voices, ties, tuplet ratios, meter, source positions, and uncertainty. Runtime validation rejects invalid ranges, overflowing measures, and reversed systems. Deterministic conversion creates MusicXML, then the existing MusicXML parser supplies playback. Export MusicXML serializes the current edited timeline, including a separate chord progression part and combined pages. Refusals, truncated output, access errors and quota errors have visible messages.

Local retries retain the selected crop at every resolution and mask setting. Geometric staff coverage is a heuristic: a usable partial score now opens with a visible uncertainty notice instead of an unconditional rejection. The dialog previews selected regions. GPT does not use the geometric coverage gate.

Browser regression check: creating Clear crop during pointer movement wrapped the toolbar and shifted the PDF 40 pixels. Keeping that control mounted stabilizes the page during selection. The same drag now captures 1778x184 pixels rather than 1778x6. Screenshot upload was verified at 1975x1153, with GPT selected. API conversion tests use mocked Responses output; a paid live OpenAI transcription was not run.

### Score dialog layout checks (2026-11-08)

Tempo, meter, octave, and click settings now share a compact toolbar above the score. Zoom and auto-scroll sit on the source viewport. Recognition and MusicXML actions share a row below it. Playback, beat position, loop range, and Save stay in a fixed footer; on narrow screens, the loop range occupies its own row. Meter provenance is available in the help beside Meter. Repeated coverage-warning sentences are displayed once without changing the saved score.

Verified the existing 121-note score at desktop width and a 390px viewport, expanded/collapsed the scrolling note table, and opened recognition help above its control. No score changes were saved. Manual follow-up: open a score without a source image, verify empty-note validation, and confirm zoom, loop changes, import/export, and Save/reopen retain their existing behavior.

### Chord progression and instrument sounds (2026-11-08)

Astra returns a separate chord array per measure, using printed symbols first, then chord diagrams, then conservative inferred harmony. Each event records a name, 480-tick local timing, MIDI voicing, origin, confidence estimate, and evidence. Inferred harmony is visibly labeled; unreadable diagrams may be omitted with warnings. Runtime checks reject overlapping events, invalid MIDI pitches, and out-of-measure durations. Reasoning remains low; this adds no extra model request.

The score modal has independent notation/chord enable switches and sound selectors. Edit chords opens a compact table for measure, name, local beat offset, duration, MIDI voicing, and source/evidence. Name edits generate conventional voicings for common major/minor/extended/slash chords; custom names can use explicitly edited MIDI voicings. N.C. creates silence. Add Chord fills a gap, or splits the active chord when the progression is full. Save retains edits and per-score sounds. MusicXML export includes the edited progression as a separate GT_CHORDS part; reimport keeps it separate from melody. Printed symbol/diagram provenance is preserved in saved score JSON; MusicXML reimport labels explicit chords Manual and retains the Inferred label.

Settings > Playback sounds sets defaults for notation, chord accompaniment, and scales. Existing saved score overrides are retained. The scales selector uses the same sampled audio engine while preserving volume, octave split, decay, and reverb controls. Four FluidR3 MP3 sample banks are bundled locally: nylon guitar, steel guitar, grand piano, and electric piano. Existing oscillator sounds remain available. Credits/license: public/sounds/LICENSE.md. The optional scripts/prepare-instrument-samples.mjs script refreshes JSON banks without executing downloaded JavaScript. No sound download occurs from a third-party host during app playback.

Validation: 30 document tests, TypeScript, and lint; browser checks covered persisted defaults, scales sound selection, chord name-to-voicing edits, separate track playback/muting, adding chords, Save/reopen, and 1440px/390px layouts. OfflineAudioContext rendered three pitches from each of the four sample banks with nonzero, unclipped output. Astra responses were fixtures; no paid live transcription was run for this change. Manual follow-up: recognize a fresh screenshot with printed names and an unlabelled passage, compare inferred harmony to the source, and audition sounds at a comfortable volume.
