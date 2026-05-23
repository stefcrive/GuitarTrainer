# Learning Platform Page

## Summary

Add a new `/learning` page that builds WEEKLY guitar practice routines from marker metadata, progress, tags, and prior session history. The v1 scheduler will be fully local, using FSRS-style spaced retrieval rather than an LLM/API. Existing markers start as `Uncategorized`; they only enter routines after being assigned to `Repertoire`, `Musical devices`, or `Training`.

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


You are building a “Guitar Training Marker Agent” for an instructional video/document library.

The goal of this agent is NOT merely to tag content by topic. The goal is to transform raw instructional material into practice-ready learning units that can later be pooled into coherent weekly practice sessions.

The user is an experienced guitarist with good technique, currently relearning the instrument through all-fourths tuning, intervallic/function-based fretboard navigation, ear-to-interval association, and composition/arrangement-oriented musicianship. The user’s main objectives are:

1. develop real repertoire;
2. learn composition and arranging;
3. become able to play with other musicians;
4. stop noodling and replace it with structured practice;
5. connect theory, fretboard, ear, technique, and musical output.

The agent should therefore tag instructional markers in a way that supports a weekly practice system centered on real music, repertoire, application, and deliverables.

Core philosophy:
Every useful practice item should eventually connect to one of these outputs:
- learning a tune;
- arranging a tune;
- extracting a musical device from a tune;
- composing a short original study;
- improving execution of a specific musical problem;
- preparing material to play with other musicians;
- recording a finished version.

Do not organize the library only as “content to consume.” Organize it as “material that can solve musical problems.”

Your task:

Given transcript segments, video chapters, documents, manually created notes, or existing markers, generate structured marker metadata.

Each marker should include:

- marker_title
- start_time
- end_time
- summary
- primary_domain
- secondary_domains
- topics
- musical_function
- practice_use_case
- weekly_practice_role
- difficulty_level
- required_prerequisites
- suggested_output
- repertoire_relevance
- composition_relevance
- playing_with_others_relevance
- all_fourths_relevance
- interval_function_relevance
- suggested_constraints
- extraction_prompt
- practice_prompt
- related_marker_links
- tags

Use the following top-level domains:

1. Repertoire
2. Musical Devices
3. Technique & Exercises
4. Harmony & Voice Leading
5. Ear Training & Audiation
6. Improvisation
7. Composition & Arrangement
8. Rhythm, Time & Groove
9. Fretboard Navigation
10. Performance & Playing With Others
11. Theory Reference
12. Workflow / Practice Method

The first three are the most important for the user’s current workflow:
- Repertoire
- Musical Devices
- Technique & Exercises

However, assign secondary domains when useful.

Definitions:

Repertoire:
Use when the marker helps learn, memorize, interpret, arrange, comp, perform, or improvise over an actual tune, song, standard, etude, study, or piece of music.

Musical Devices:
Use when the marker teaches an extractable musical idea that can be reused compositionally or improvisationally. Examples:
- triad pairs
- modal interchange
- secondary dominants
- pedal points
- contrary motion
- guide-tone lines
- chromatic approach tones
- enclosures
- upper structures
- quartal harmony
- diminished passing chords
- slash chords
- voice-leading cells
- rhythmic displacement
- melodic sequence
- call and response
- motivic development
- contrary-motion bass and melody
- drop voicings
- inner voice movement

Technique & Exercises:
Use when the marker is primarily about physical execution, coordination, mechanics, speed, articulation, picking, legato, muting, string crossing, position shifts, stretches, independence, right-hand control, left-hand control, or technical etudes.

Harmony & Voice Leading:
Use when the marker explains chord function, progression logic, cadences, 3rds/7ths, inversions, shell voicings, substitutions, counterpoint, bass motion, chord melody, or smooth movement between chords.

Ear Training & Audiation:
Use when the marker helps the user hear, sing, identify, internalize, or predict intervals, scale degrees, chord qualities, harmonic function, cadences, or melodic movement.

Improvisation:
Use when the marker teaches soloing, phrasing, targeting, lines, motifs, vocabulary, tension/release, playing changes, modal improvisation, or constrained improvisation.

Composition & Arrangement:
Use when the marker helps create original music, arrange melodies, harmonize, reharmonize, write intros/endings, orchestrate guitar textures, or transform source material into a finished musical object.

Rhythm, Time & Groove:
Use when the marker focuses on timing, subdivision, swing, syncopation, groove, comping rhythm, rhythmic motifs, odd meters, metronome work, or feel.

Fretboard Navigation:
Use when the marker teaches mapping the neck, intervals, string sets, all-fourths logic, position shifting, triad/inversion mapping, scale-degree navigation, or non-shape-based visualization.

Performance & Playing With Others:
Use when the marker helps prepare real-world playing: comping behind others, following form, reading charts, count-ins, endings, dynamics, listening, density control, recovery after mistakes, duo/trio situations, ensemble roles.

Theory Reference:
Use when the marker is mainly conceptual and not immediately practice-based. These markers should be lower priority unless attached to a concrete practice use case.

Workflow / Practice Method:
Use when the marker helps plan practice, structure sessions, organize repertoire, evaluate recordings, design routines, or build weekly cycles.

Marker topic examples:
- triads
- triad inversions
- triad pairs
- spread triads
- close triads
- modes
- melodic minor
- harmonic minor
- major scale
- chord tones
- guide tones
- 3rds and 7ths
- voice leading
- shell voicings
- drop 2
- drop 3
- quartal voicings
- upper structures
- substitutions
- secondary dominants
- diminished passing chords
- modal interchange
- pedal point
- chromaticism
- enclosures
- approach tones
- arpeggios
- chord melody
- comping
- reharmonization
- arrangement
- composition
- motivic development
- melodic sequencing
- rhythm
- groove
- time feel
- syncopation
- odd meters
- alternate picking
- economy picking
- hybrid picking
- legato
- sweep picking
- string skipping
- muting
- articulation
- dynamics
- ear training
- interval recognition
- scale-degree hearing
- functional harmony
- repertoire
- standards
- Brazilian music
- blues
- jazz
- fusion
- rock
- classical guitar
- improvisation
- transcription
- all-fourths tuning
- fretboard mapping
- intervallic playing

The agent should classify each marker according to how useful it is for weekly practice construction.

weekly_practice_role must be one of:

- Main Repertoire Object
- Repertoire Support
- Device Extraction
- Composition Assignment
- Arrangement Assignment
- Technique Maintenance
- Technical Bottleneck Solver
- Ear/Fretboard Integration
- Improvisation Constraint
- Harmony/Voice-Leading Study
- Rhythm/Time Study
- Performance Preparation
- Theory Reference Only
- Practice Workflow Support

Use these rules:

1. If a marker refers to a real tune or complete musical example, prefer “Main Repertoire Object” or “Repertoire Support.”
2. If a marker teaches a reusable idea such as triad pairs, modal interchange, guide-tone lines, pedal tones, or motivic development, use “Device Extraction.”
3. If a marker can be used to write 4–8 bars of original music, use “Composition Assignment.”
4. If a marker helps harmonize a melody, create chord melody, build intros/endings, or vary texture, use “Arrangement Assignment.”
5. If a marker is mostly physical, use “Technique Maintenance” or “Technical Bottleneck Solver.”
6. If a marker links hearing to fretboard movement, use “Ear/Fretboard Integration.”
7. If a marker gives soloing restrictions, target notes, phrasing devices, or improvisational frameworks, use “Improvisation Constraint.”
8. If a marker teaches comping, form, endings, cueing, listening, dynamics, or ensemble interaction, use “Performance Preparation.”
9. If a marker is theoretical and abstract, classify it as “Theory Reference Only” unless it includes a concrete application.

Each marker should also include a “practice_use_case” written in practical language.

Examples:
- “Use this when arranging the melody of a tune with triads on adjacent string sets.”
- “Use this to extract a modal interchange color and compose an 8-bar progression.”
- “Use this as a technical bottleneck exercise before applying the same movement to repertoire.”
- “Use this to practice soloing over a tune using only chord tones and guide-tone targets.”
- “Use this to build a comping version of a tune before playing with another musician.”
- “Use this to connect the sound of scale degrees to all-fourths fretboard locations.”

Each marker should include a “suggested_output.”

Examples:
- “Record one chorus of melody + shell voicings.”
- “Write 4 bars using this device.”
- “Create a two-register chord melody excerpt.”
- “Play the progression using only 3rds and 7ths.”
- “Compose a short etude using triad pairs over one static chord.”
- “Prepare a chart for playing with another musician.”
- “Record one take with strict rhythmic constraints.”
- “Create three comping variations: sparse, medium density, active.”

Each marker should include “suggested_constraints.”

Examples:
- only chord tones
- only guide tones
- only triads
- only two adjacent string sets
- one rhythmic motif only
- one position only
- three positions
- only 3rds and 7ths
- melody always on top
- bass + melody only
- no more than three notes per chord
- sing before playing
- record one take
- play with metronome on beats 2 and 4
- compose 8 bars maximum
- reharmonize only one phrase
- use all-fourths interval names, not shape names

The agent should create both human-readable and machine-readable output.

Preferred JSON schema:

{
  "marker_id": "string",
  "source_id": "string",
  "source_title": "string",
  "marker_title": "string",
  "start_time": "HH:MM:SS",
  "end_time": "HH:MM:SS",
  "summary": "string",
  "primary_domain": "Repertoire | Musical Devices | Technique & Exercises | Harmony & Voice Leading | Ear Training & Audiation | Improvisation | Composition & Arrangement | Rhythm, Time & Groove | Fretboard Navigation | Performance & Playing With Others | Theory Reference | Workflow / Practice Method",
  "secondary_domains": ["string"],
  "topics": ["string"],
  "musical_function": "string",
  "practice_use_case": "string",
  "weekly_practice_role": "string",
  "difficulty_level": "Beginner | Early Intermediate | Intermediate | Advanced Intermediate | Advanced",
  "required_prerequisites": ["string"],
  "suggested_output": "string",
  "repertoire_relevance": 0,
  "composition_relevance": 0,
  "playing_with_others_relevance": 0,
  "all_fourths_relevance": 0,
  "interval_function_relevance": 0,
  "suggested_constraints": ["string"],
  "extraction_prompt": "string",
  "practice_prompt": "string",
  "related_marker_links": ["marker_id"],
  "tags": ["string"],
  "priority_score": 0,
  "notes_for_weekly_planner": "string"
}

Relevance scores should be integers from 0 to 5.

priority_score should be calculated from usefulness for the user’s current goals.

Suggested priority weighting:
- repertoire_relevance: high weight
- composition_relevance: high weight
- playing_with_others_relevance: high weight
- interval_function_relevance: high weight
- all_fourths_relevance: medium-high weight
- pure theory without output: low weight
- pure technique without musical application: medium or low unless it solves a bottleneck

Priority interpretation:
0–1 = archive/reference only
2 = useful later
3 = useful for normal practice
4 = strong candidate for weekly practice
5 = central weekly practice material

When analyzing a marker, ask:

1. Does this help the user learn or perform a real piece?
2. Does this teach a reusable musical device?
3. Can this become a composition or arrangement task?
4. Can this help the user play with other musicians?
5. Does this connect sound, interval, function, and fretboard?
6. Does this apply well to all-fourths tuning?
7. Does this produce a concrete output?
8. Is it only theoretical, or can it be practiced immediately?

The agent should avoid vague tags like:
- “guitar”
- “lesson”
- “music theory”
- “practice”
unless paired with more specific tags.

Prefer specific tags like:
- triad-pairs
- melodic-minor
- lydian-dominant
- guide-tones
- chord-melody
- inner-voice-movement
- modal-interchange
- all-fourths
- interval-function
- ii-V-I
- shell-voicings
- comping
- repertoire-support
- device-extraction
- composition-study
- arrangement-study
- performance-ready
- technical-bottleneck
- ear-fretboard-integration

The agent should also generate “extraction_prompt” and “practice_prompt.”

extraction_prompt:
A prompt that tells the user how to extract the musical idea from the marker.

Examples:
- “Identify the core triad-pair sound, then write an 8-bar vamp using only those two triads.”
- “Extract the guide-tone motion from this progression and apply it to one tune in your repertoire.”
- “Find the modal interchange chord used here and compose a 4-bar progression using the same color.”
- “Extract the rhythmic motif and use it to create three variations over a ii–V–I.”

practice_prompt:
A direct instruction for one practice session.

Examples:
- “For 20 minutes, play this device over one static chord, then record a 60-second improvisation using only this material.”
- “Take one tune from your repertoire and arrange the first A section using this voicing approach.”
- “Play the progression using only 3rds and 7ths, then add the melody on top.”
- “Compose 8 bars using this device, record one take, and write one sentence about what worked.”

Weekly planner integration:

The marker data should allow another agent to build a weekly session based on this structure:

Weekly theme:
- one main repertoire object;
- one musical device extracted from it or related to it;
- one technique/exercise item that supports the repertoire/device;
- one ear/fretboard integration task;
- one composition or arrangement deliverable;
- one recording/performance deliverable.

A good weekly practice plan should not be a random list of videos. It should create a small musical project.

Example weekly plan logic:

1. Select one “Main Repertoire Object.”
2. Select 1–2 “Repertoire Support” markers related to melody, harmony, form, comping, or arrangement.
3. Select one “Device Extraction” marker that can be applied to the same tune.
4. Select one “Technique Maintenance” or “Technical Bottleneck Solver” marker only if it supports the tune or device.
5. Select one “Ear/Fretboard Integration” marker that reinforces the harmonic or intervallic material.
6. Select one “Composition Assignment” or “Arrangement Assignment.”
7. End the week with a “suggested_output,” preferably a recording.

The weekly planner should avoid creating overloaded weeks. Prefer fewer markers with stronger integration.

Ideal weekly output:
- one tune learned or improved;
- one device extracted;
- one short written or arranged passage;
- one recorded take;
- one note about what to improve next week.

Example marker output:

{
  "marker_id": "generated_unique_id",
  "source_id": "video_0123",
  "source_title": "Triad Pairs for Modal Improvisation",
  "marker_title": "Major Triad Pairs over Lydian Sound",
  "start_time": "00:08:15",
  "end_time": "00:17:40",
  "summary": "Explains how to combine two major triads a whole step apart to create a Lydian color over a major chord.",
  "primary_domain": "Musical Devices",
  "secondary_domains": ["Improvisation", "Composition & Arrangement", "Fretboard Navigation"],
  "topics": ["triad pairs", "Lydian mode", "major triads", "modal improvisation", "intervallic playing"],
  "musical_function": "Creates a bright upper-extension sound over a major chord using two simple triadic structures.",
  "practice_use_case": "Use this to create a constrained improvisation or short composition over a static major/Lydian harmony.",
  "weekly_practice_role": "Device Extraction",
  "difficulty_level": "Advanced Intermediate",
  "required_prerequisites": ["major triads", "basic modal harmony", "interval recognition", "all-fourths fretboard mapping"],
  "suggested_output": "Compose and record a 60-second study using only the two selected triads over one major chord.",
  "repertoire_relevance": 2,
  "composition_relevance": 5,
  "playing_with_others_relevance": 3,
  "all_fourths_relevance": 4,
  "interval_function_relevance": 5,
  "suggested_constraints": ["only two triads", "one string set at a time", "sing each triad before playing", "record one take"],
  "extraction_prompt": "Identify the two triads, name their scale degrees against the chord, then write 4–8 bars using only notes from those triads.",
  "practice_prompt": "For 20 minutes, map the two triads across adjacent string sets in all-fourths tuning. Then record a 60-second improvisation over a static major chord using only this material.",
  "related_marker_links": [],
  "tags": ["triad-pairs", "lydian", "modal-improvisation", "interval-function", "all-fourths", "composition-study", "device-extraction"],
  "priority_score": 4,
  "notes_for_weekly_planner": "Best paired with a repertoire item containing a major Imaj7 or IVmaj7 vamp, or with a composition week focused on modal color."
}

The final system should support two main operations:

Operation A: Marker generation
Input:
- source metadata;
- transcript segment;
- existing chapter info;
- optional user notes.

Output:
- structured marker metadata following the schema above.

Operation B: Weekly practice pooling
Input:
- available marker database;
- user-selected weekly theme or tune;
- time available per day;
- target output for the week;
- optional weak areas.

Output:
- a weekly practice plan using selected markers.

Weekly practice output should include:
- weekly objective;
- selected markers;
- why each marker was selected;
- daily practice schedule;
- concrete deliverable;
- recording assignment;
- review question.

Daily practice template:
- 10 min technique maintenance;
- 20 min ear/fretboard integration;
- 30 min repertoire;
- 20 min composition/arrangement/application;
- 10 min recording/review.

This can be adjusted based on available time, but the structure should remain output-oriented.

Important behavior:
- Prefer real music over abstract exercises.
- Prefer small finished outputs over endless study.
- Prefer application over content consumption.
- Prefer constraints over open-ended noodling.
- Prefer repertoire-linked practice over isolated topic practice.
- Prefer markers that can be used to compose, arrange, record, or play with others.

When uncertain, classify the marker based on its most useful practice application rather than its academic topic.

Now implement the marker-generation and weekly-practice-pooling logic accordingly.