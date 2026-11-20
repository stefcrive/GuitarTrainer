# Windows desktop package

Run this command from a Windows command prompt:

```bat
npm.cmd run package:windows
```

The one-click installer is created in `dist` as:

```text
Guitar-Trainer-Setup-<version>-x64.exe
```

The installed app bundles its own runtime. The target computer does not need
Node.js, npm, or the source repository.

## Per-computer configuration

Core local features run without API credentials. Optional Spotify and YouTube
OAuth credentials are intentionally not included in the installer. To configure
them, create this file after launching the installed app once:

```text
%APPDATA%\Guitar Trainer\config.env
```

Supported values include:

```env
NEXT_PUBLIC_SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
YOUTUBE_OAUTH_CLIENT_ID=
YOUTUBE_OAUTH_CLIENT_SECRET=
GUITAR_TRAINER_VIDEO_ROOT=D:\Guitar\Lessons
FFMPEG_BIN_DIR=C:\ffmpeg\bin
PYTHON_EXECUTABLE=C:\Python312\python.exe
```

Restart Guitar Trainer after editing the file. OAuth provider dashboards must
allow the callback address shown by the app. Because the desktop server uses an
available local port, OAuth is easiest when the provider supports the matching
loopback redirect configuration.
