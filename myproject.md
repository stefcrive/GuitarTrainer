# Guitar Course Manager - Project Plan

## Project Goal

Design and plan a Next.js application using Shadcn UI for managing and practicing with locally stored guitar video courses.

## Current Status

- Planning phase: Decisions made on core technical approach.
- Detailed plan using File System Access API approved by user.

## Core Features (Phase 1)

1.  **Local File Management:** Select directory, scan for videos, display list.
2.  **Video Metadata & Tagging:**
    *   Assign tags to entire videos.
    *   Mark sections, assign tags/notes to sections.
3.  **Video Playback:** Integrated player.
4.  **Course Creation:** Build courses using videos or tags.
5.  **Course Playback & Practice:** Sequential playback, enhanced player (looping, section notes/tags).

## Future Enhancements (Phase 2)

1.  **Transcription:** Automated video transcription.
2.  **Search:** Search across metadata and transcriptions.

## Technology Stack Considerations

-   **Frontend:** Next.js (App Router), React, TypeScript
-   **UI:** Shadcn UI, Tailwind CSS
-   **Video Player:** TBD (e.g., `react-player`, `video.js`)
-   **Local File Access:** Browser File System Access API (User selects folder each session)
-   **Metadata Storage:** JSON files within a `.guitar_course_manager_data` subfolder in the user-selected video directory. Video paths stored in course metadata for persistence.
-   **Video Player:** `react-player` (Good balance of features and ease of use)

## To-Do

-   [x] Clarify local file access method.
-   [x] Clarify metadata storage approach.
-   [x] Define detailed architecture (High-level).
-   [x] Define data models (JSON structure).
-   [x] Create component breakdown (Key UI elements).
-   [x] Outline Phase 1 implementation steps.
-   [x] Outline Phase 2 approach.
-   [x] Present detailed plan for user approval.
-   [x] Get user approval on the plan.
-   [x] Offer to write the plan to a dedicated file. (Saved to docs/project_plan.md)
-   [ ] Propose switching to implementation mode.

## Lessons Learned

-   Decision: Use File System Access API for Phase 1 MVP for faster initial development, accepting the UX trade-off of re-selecting the folder each session. Migration to Tauri/Electron is possible later.