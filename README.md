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
- Books and documents with PDF viewing, OCR markers, and reviewed notation/TAB practice ([setup and usage](docs/documents.md))

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
SPOTIFY_OAUTH_REDIRECT_URI=http://127.0.0.1:3000/api/spotify/callback
```

When using `start.bat`, it prints the exact Spotify redirect URI selected for the current run. Add that same redirect URI in the Spotify Developer Dashboard, for example:

```text
http://127.0.0.1:3000/api/spotify/callback
```

Spotify does not allow `localhost` redirect URIs. Use a loopback IP such as `127.0.0.1`. The callback must match the URI registered in the Spotify Developer Dashboard. For dynamically selected ports, Spotify also supports registering `http://127.0.0.1/api/spotify/callback` without a port. See [Spotify's redirect URI requirements](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri).

`start.bat` sets the callback to `127.0.0.1` on the selected port. Sign-in started on `localhost` first switches to that address so the OAuth state cookie and callback use the same host.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
