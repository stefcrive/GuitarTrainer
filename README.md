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

## License

This project is licensed under the MIT License - see the LICENSE file for details.
