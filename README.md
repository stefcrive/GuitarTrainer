# Guitar Trainer

A Next.js application for managing guitar courses and practice sessions. Built with TypeScript, React, and Tailwind CSS.

## Features

- 📹 Video player with markers and annotations for guitar lessons
- 🎵 Audio player for backing tracks and practice sessions
- 📝 Custom markers and annotations for video sections
- ⭐ Favorites management for quick access to frequently used content
- 🎸 YouTube integration for accessing guitar lessons
- 📁 Local file system integration for managing your music files
- 🎼 Recent views tracking
- 🔍 Search functionality

## Tech Stack

- Next.js 14 with App Router
- TypeScript
- React 18
- Tailwind CSS
- Radix UI Components
- Zustand for state management
- React Player for media playback

## Getting Started

1. Clone the repository:
```bash
git clone https://github.com/stefcrive/GuitarTrainer.git
cd GuitarTrainer
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.

If port `3000` is already used by another app, either use the port shown by Next.js in the terminal or run the included `start.bat`, which automatically chooses the next available port from `3000` to `3099`.

## Project Structure

- `/src/app` - Next.js app router pages and layouts
- `/src/components` - Reusable React components
  - `/audio` - Audio player and related components
  - `/video` - Video player and related components
  - `/youtube` - YouTube integration components
  - `/ui` - Common UI components
- `/src/services` - Core services for file system, audio/video handling
- `/src/stores` - Zustand state management stores
- `/src/types` - TypeScript type definitions
- `/src/hooks` - Custom React hooks

## Development

### Scripts

- `npm run dev` - Start development server
- `npm run build` - Build production application
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

### Spotify OAuth

For local Spotify login, set these values in `.env` or `.env.local`:

```env
NEXT_PUBLIC_SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_OAUTH_REDIRECT_URI=http://localhost:3008/api/spotify/callback
```

When using `start.bat`, it prints the exact Spotify redirect URI selected for the current run. Add that same redirect URI in the Spotify Developer Dashboard, for example:

```text
http://localhost:3008/api/spotify/callback
```

Spotify requires an exact match, including protocol, host, port, and path. It does not support wildcard localhost ports. If you want OAuth to use one predictable port, set `START_PORT` and `END_PORT` to the same registered port before running `start.bat`.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
