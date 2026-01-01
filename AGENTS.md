# AGENTS

This repository is a Next.js 14 (App Router) app for managing guitar courses and practice sessions. Use this file as the primary guide for automated agents working in the repo.

## Scope and priorities
- Prefer small, safe changes with clear reasoning.
- Preserve existing behavior unless the task explicitly asks to change it.
- Keep edits consistent with the current stack (React 18, TypeScript, Tailwind, Zustand, Radix UI).

## Quick start
- Install dependencies: `npm install`
- Run dev server: `npm run dev`
- Build: `npm run build`
- Start: `npm run start`
- Lint: `npm run lint`

`start.bat` runs install + dev server on Windows.

## Project layout
- `src/app`: Next.js App Router pages, layouts, and route handlers.
- `src/components`: Reusable UI and feature components.
  - `audio`: audio player features
  - `video`: video player features
  - `youtube`: YouTube integration UI
  - `ui`: shared UI components
- `src/services`: API clients and integrations (YouTube, filesystem, etc.).
- `src/stores`: Zustand state stores.
- `src/hooks`: custom React hooks.
- `src/types`: shared TypeScript types.
- `public`: static assets.

## Environment variables
Environment variables are loaded from `.env` (and optionally `.env.local`).
Typical keys:
- `NEXT_PUBLIC_YOUTUBE_API_KEY`: YouTube Data API v3 key (public browser key).
- `YOUTUBE_OAUTH_CLIENT_ID`: OAuth client ID for YouTube Data API.
- `YOUTUBE_OAUTH_CLIENT_SECRET`: OAuth client secret for YouTube Data API.
- `YOUTUBE_OAUTH_REDIRECT_URI`: Optional override for OAuth redirect (defaults to `/api/youtube/callback`).
- `NEXT_PUBLIC_SPOTIFY_CLIENT_ID`: Spotify client ID.
- `SPOTIFY_CLIENT_SECRET`: Spotify secret (server-only).

Do not commit new secrets. Use `.env.local` for personal keys.

## YouTube integration notes
- Uses YouTube Data API v3 from the browser (public key).
- Common 400 errors are caused by invalid key, API not enabled, or referrer restrictions.
- Private or unlisted playlists require OAuth and cannot be fetched with a simple key.
- Key lookups live in `src/services/youtube.ts`.
- OAuth routes live under `src/app/api/youtube` and store tokens in HTTP-only cookies.
- Authorized redirect URIs must include `/api/youtube/callback` for each environment.

## Spotify integration notes
- OAuth/secret use should stay server-side. Avoid exposing `SPOTIFY_CLIENT_SECRET` to client code.

## Coding conventions
- TypeScript, functional React components.
- Prefer hooks and Zustand stores for state.
- Tailwind CSS for styling; prefer existing class patterns.
- Keep components small and focused; avoid heavy inline logic in JSX when it hurts readability.
- Use ASCII in new text unless the file already uses non-ASCII.

## Testing and validation
- No dedicated test runner is configured. Use `npm run lint` for validation.
- When changing UI behavior, add short manual test notes.

## Workflow tips
- Use `rg` for searches.
- Avoid large refactors unless requested.
- If you touch API calls, add or improve error messages to make debugging easier.

## Common tasks
- Add a playlist: verify API key, API enabled, and referrer restrictions.
- Debug fetch errors: log `response.status`, `statusText`, and response JSON when possible.

## Security
- Never log secrets or full API keys.
- Redact keys in console logs and docs.
