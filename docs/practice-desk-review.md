# Practice Desk review

## Intended flow

1. Repertoire: choose the music to perform (tunes, sections, arrangements, ensemble material).
2. Musical devices: extract reusable ideas from harmony, voice leading, improvisation, or composition and apply them to music.
3. Training: isolate technique, rhythm, ear, fretboard, or other supporting skills; return to musical application afterward.
4. Practice a marker, log time and dominance with a short note, then continue to the next item. Use the weekly output and review as a longer-term direction.

The automatic marker exporter maps primary domains to these same three buckets. Primary domain and weekly role are supporting metadata, not alternative category systems. Manual category corrections remain authoritative.

## Findings addressed

- Three narrow tables forced horizontal scrolling and stacked tags. Replaced with one full-width searchable table, category counts, due/new filtering, and single-line records. The full unassigned queue is accessible (previously capped at 12).
- The routine competed with large static schedule and statistics cards. Moved statistics into compact badges and secondary guidance into keyboard/touch-accessible help.
- Opening a marker showed metadata without media. Added local video/audio and YouTube playback, marker looping, speed, an independent practice timer, session notes, recent history, and Save & next.
- The timer stopped counting in hidden tabs. It now measures elapsed wall time while running, with explicit pause/reset.
- The planner could loop forever at small daily targets. Candidate count now respects the five-minute minimum; all available categories receive a slot before extras.
- The daily schedule previously referenced only a subset of planned markers and used different durations. Schedule blocks now match the actual selected items and allocations.
- Failed saves and category changes had no useful error path. Added visible errors, retry-safe event IDs, and unsaved-session protection.
- Open-ended markers displayed reversed ranges. They now display start-to-end-of-source.
- Practice-day aggregation used UTC dates. It now follows local calendar days.

## Validation

- `npm run lint`: passes with pre-existing warnings outside the changed learning components.
- `npx tsc --noEmit --incremental false`: passes.
- `node --test tests/learning.test.mjs`: planner targets 15-180, bucket balance, missing categories, invalid targets, due ranking, SQLite persistence, notes, stats, and failed-write retries. Uses in-memory file handles; no user practice records are created.
- Browser: inspected 1440px and 390px widths, long names, empty search, category selection, local marker loading, timer, inline help/Escape, and discard protection.

## Manual checks

- Generate a 15-minute routine: expect at most three items, one from each available category, totaling 15 minutes. Existing routines remain unchanged until regenerated.
- Start routine, play a marker, change speed, and check looping. Pause the media and continue practicing with the independent timer.
- Save a real session with a note and changed dominance; check today's completion, recent practice, review date, and Continue routine. Reload to verify persistence.
- Change a marker category, then regenerate to use the new bucket. Search by source or tag; inspect all unassigned markers.
- Verify YouTube playback and Spotify source opening with the user's accounts. Spotify playback remains external; its timer and logging are available in the desk.

## Remaining content limitations

Generic generated titles such as "Other" and "Short performed example" remain untouched. Improving their specificity belongs in the generation pipeline and requires evaluating the underlying teaching content. The planner balances categories and ranks due/priority markers; it does not establish semantic relationships between a particular tune, device, and exercise. Weekly recording is an assignment, not a new built-in recorder.
