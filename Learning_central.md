# Learning Platform Page

## Summary

Add a new `/learning` page that builds daily guitar practice routines from marker metadata, progress, tags, and prior session history. The v1 scheduler will be fully local, using FSRS-style spaced retrieval rather than an LLM/API. Existing markers start as `Uncategorized`; they only enter routines after being assigned to `Repertoire`, `Musical devices`, or `Training`.

## Key Changes

- Add `Learning` to the header/home navigation and create a client-side dashboard with:
  - Today's generated routine with target duration defaulting to 45 minutes.
  - Three marker tables: `Repertoire`, `Musical devices`, `Training`.
  - A small unassigned marker queue for setting the new marker domain metadata.
  - A calendar statistics panel showing practice days, total time, marker count, and average progress delta.
- Extend marker types with optional learning metadata:
  - `learning.domain?: 'repertoire' | 'musical-device' | 'training'`
  - Keep existing `completionDegree` as the dominance/progress score.
- Add domain selectors to marker editing surfaces and the learning modal.
- Add a focused marker modal that opens from table rows, loads the corresponding player and selected marker notes, seeks to the marker start, tracks active practice time, and records progress changes.

## Scheduler And Data

- Add SQLite tables through `local-sql-db.ts` for learning sessions, session items, per-marker learning state, and progress/time events.
- Add a `learning` service layer that:
  - Loads all markers through a reusable marker catalog helper.
  - Stores daily routine snapshots and item rationales.
  - Records marker time spent, progress score changes, and session completion.
- Use `ts-fsrs` with local defaults and target retention around 90%.
  - Map progress changes to FSRS ratings: low/regressed = `Again`, weak = `Hard`, solid = `Good`, high/stable = `Easy`.
  - Due items get priority; low-dominance items surface more often; high-dominance items get longer intervals.
  - New material is capped at 30% of the time budget unless there are not enough due items.
  - Failed or weak items can be reinserted near the end of the same session.
- The routine generator runs a local "agentic" loop: observe candidates, score due/new/history/tag factors, draft a session, check duration/domain/tag constraints, repair the list, then persist the final plan.

## UI Behavior

- Each domain table shows marker title, source, media type, time range, tags, dominance, last practiced, total time, next due, and routine eligibility.
- Clicking a marker opens the modal and starts a visibility-aware timer; closing or switching markers flushes time spent.
- Calendar stats are computed from stored session/event rows and support day-level detail for the practiced markers.

## Test Plan

- Run `npm run lint`.
- Manual checks:
  - Assign domains to existing uncategorized markers and confirm they move into the correct table.
  - Generate a 45-minute routine and confirm due/low-score markers are prioritized.
  - Open video, audio, YouTube, and Spotify-backed markers from the modal where available.
  - Change dominance and verify marker persistence, progress event history, routine rescheduling, and calendar updates.
  - Confirm existing `/markers`, `/videos`, `/audio`, and `/youtube` marker editing still works.

## Assumptions

- Use local FSRS scheduling, not an external AI provider.
- Existing markers remain uncategorized until manually assigned.
- Default routine target is 45 minutes and can be adjusted on the page.
- Scheduling references:
  - FSRS/DSR model: https://github.com/open-spaced-repetition/free-spaced-repetition-scheduler
  - FSRS algorithm notes: https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm
  - SM-2 spaced repetition: https://super-memory.com/english/ol/sm2.htm
  - Expanded retrieval practice research: https://www.sciencedirect.com/science/article/abs/pii/S2211368120300255
