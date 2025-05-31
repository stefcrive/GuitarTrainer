# Guitar Course Manager - Project Plan

## 1. Project Goal

Design and implement a Next.js application using Shadcn UI for managing and practicing with locally stored guitar video courses.

## 2. Core Features (Phase 1)

1.  **Local File Management:** Allow users to select a directory on their hard drive using the browser's File System Access API, scan the directory for video files (e.g., .mp4, .mov, .avi), and display a list of found videos.
2.  **Video Metadata & Tagging:**
    *   Enable users to assign custom tags to entire videos for categorization.
    *   Provide functionality to mark specific time-based sections within videos and associate custom tags and notes with these sections.
3.  **Video Playback:** Include an integrated video player (using `react-player`) for viewing individual videos. Video URLs will be generated using `URL.createObjectURL()` from file handles.
4.  **Course Creation:** Allow users to build structured training courses by adding entire videos, specific marked sections, or dynamically including videos/sections based on assigned tags.
5.  **Course Playback & Practice:**
    *   Enable sequential playback of items within a created course.
    *   Provide an enhanced video player during course playback with features such as loop playback for selected sections and the ability to view and access associated section-specific notes and tags.

## 3. Future Enhancements (Phase 2 - Outline)

1.  **Transcription:** Explore options for automated video transcription (e.g., local libraries via Tauri/Electron wrapper, or cloud APIs).
2.  **Search:** Implement search functionality across video metadata (names, tags, notes), course details, and potentially transcribed content.

## 4. Chosen Technical Approach (Phase 1)

*   **Frontend Framework:** Next.js (App Router) with React and TypeScript.
*   **UI Components:** Shadcn UI & Tailwind CSS.
*   **Local File Access:** Browser File System Access API. The user will need to select the video directory each time the application starts.
*   **Metadata Storage:** JSON files (`videos.json`, `tags.json`, `courses.json`) stored within a `.guitar_course_manager_data` subfolder inside the user-selected video directory. Full video file paths will be stored in `courses.json` for persistence within a course context.
*   **Video Player:** `react-player`.
*   **State Management:** React Context API or Zustand for managing application state (selected folder handle, video list, etc.). Prioritize Server Components where possible.

## 5. High-Level Architecture

```mermaid
graph TD
    A[User Interface (Next.js/React/Shadcn UI)] --> B{State Management (React Context/Zustand)};
    A --> C[File System Service];
    B --> A;
    C --> D[Browser File System Access API];
    C --> E[Metadata Service];
    E --> F{Local JSON Files (.guitar_course_manager_data/)};
    F --> E;
    G[Video Player (react-player)] --> A;

    subgraph Browser Environment
        D
    end

    subgraph User's Selected Folder
        F
    end

    subgraph Next.js Application
        A
        B
        C
        E
        G
    end

    style F fill:#f9f,stroke:#333,stroke-width:2px
```

*   **UI:** Handles user interactions.
*   **State Management:** Manages global state.
*   **File System Service (`services/file-system.ts`):** Client-side service interacting with the File System Access API for directory selection and file read/write operations.
*   **Metadata Service (`services/metadata.ts`):** Manages CRUD operations for the JSON metadata files via the File System Service.
*   **Video Player:** Integrated `react-player` component.

## 6. Data Models (JSON Structure)

*   **`.guitar_course_manager_data/videos.json`**:
    ```json
    [
      {
        "id": "unique_video_id_1",
        "fileName": "lesson_1.mp4",
        "filePath": "path/relative/to/selected/folder/lesson_1.mp4",
        "fullPath": "file:///full/system/path/to/lesson_1.mp4", // Optional: For course persistence
        "tags": ["tag_id_1", "tag_id_2"],
        "sections": [
          {
            "id": "section_id_1",
            "startTime": 30.5,
            "endTime": 65.0,
            "tags": ["tag_id_3"],
            "notes": "Focus on the fingerpicking pattern here."
          }
        ]
      }
    ]
    ```
*   **`.guitar_course_manager_data/tags.json`**:
    ```json
    [
      { "id": "tag_id_1", "name": "Technique", "color": "#FF5733" },
      { "id": "tag_id_2", "name": "Blues", "color": "#337AFF" },
      { "id": "tag_id_3", "name": "Difficult Riff", "color": "#FFC300" }
    ]
    ```
*   **`.guitar_course_manager_data/courses.json`**:
    ```json
    [
      {
        "id": "course_id_1",
        "name": "Blues Fundamentals Practice",
        "description": "Practice routine focusing on basic blues techniques.",
        "items": [
          { "type": "video", "videoId": "unique_video_id_1", "videoPath": "file:///full/system/path/to/lesson_1.mp4" },
          { "type": "section", "videoId": "unique_video_id_1", "sectionId": "section_id_1", "videoPath": "file:///full/system/path/to/lesson_1.mp4" },
          { "type": "tag", "tagId": "tag_id_2" }
        ]
      }
    ]
    ```

## 7. Component Breakdown (Key UI Elements)

*   `components/file-system/FolderSelectorButton.tsx` ('use client')
*   `components/video/VideoList.tsx`
*   `components/video/VideoListItem.tsx`
*   `components/video/VideoPlayer.tsx` ('use client')
*   `components/tagging/TagManager.tsx` ('use client')
*   `components/tagging/VideoTagger.tsx` ('use client')
*   `components/course/CourseBuilder.tsx` ('use client')
*   `components/course/CourseList.tsx`
*   `components/course/CoursePlayer.tsx` ('use client')

## 8. Phase 1 Implementation Steps

1.  **Project Setup:** Init Next.js, install dependencies (Shadcn, Tailwind, `react-player`).
2.  **File System Access:** Implement `FolderSelectorButton` & `FileSystemService`.
3.  **Video Discovery & Listing:** Scan directory, display list, init `videos.json`.
4.  **Metadata Handling:** Implement `MetadataService` for JSON CRUD.
5.  **Basic Video Playback:** Integrate `VideoPlayer`, use `URL.createObjectURL()`.
6.  **Tag Management:** Implement `TagManager` (`tags.json`).
7.  **Video Tagging:** Implement `VideoTagger` for whole videos (`videos.json`).
8.  **Section Marking & Tagging:** Enhance `VideoPlayer`/`VideoTagger` for sections (`videos.json`).
9.  **Course Creation:** Implement `CourseBuilder`/`CourseList` (`courses.json`).
10. **Course Playback:** Implement `CoursePlayer` with item resolution and looping.

## 9. Phase 2 Approach (Outline)

*   **Transcription:** Evaluate local (via Tauri/Electron) vs. cloud API options. Store transcripts with metadata.
*   **Search:** Implement search across JSON data and potentially transcripts (consider Lunr.js for local indexing if needed).