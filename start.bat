@echo off
setlocal
cd /d "%~dp0"

echo Cleaning stale Guitar Trainer server processes...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$repo=(Resolve-Path '.').Path; Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($repo) -and ($_.CommandLine -like '*next*dev*' -or $_.CommandLine -like '*next*start*' -or $_.CommandLine -like '*npm*run dev*' -or $_.CommandLine -like '*npm*run start*' -or $_.CommandLine -like '*npx*next dev*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

echo Resetting Next.js dev cache...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$repo=(Resolve-Path '.').Path; $next=Join-Path $repo '.next'; if ((Test-Path -LiteralPath $next) -and (Resolve-Path -LiteralPath $next).Path.StartsWith($repo, [System.StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $next -Recurse -Force -ErrorAction SilentlyContinue }"

set "PORT="
if not defined START_PORT set "START_PORT=3000"
if not defined END_PORT set "END_PORT=3099"

echo Finding an available port between %START_PORT% and %END_PORT%...
set "PORT_FILE=%TEMP%\guitar-trainer-port-%RANDOM%.txt"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$start=[int]$env:START_PORT; $end=[int]$env:END_PORT; $used=[System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners().Port; for ($port=$start; $port -le $end; $port++) { if ($used -notcontains $port) { Write-Output $port; exit 0 } }; exit 1" > "%PORT_FILE%"

if errorlevel 1 (
  del "%PORT_FILE%" >nul 2>nul
  echo No available port found between %START_PORT% and %END_PORT%.
  exit /b 1
)

set /p PORT=<"%PORT_FILE%"
del "%PORT_FILE%" >nul 2>nul

if not defined PORT (
  echo No available port found between %START_PORT% and %END_PORT%.
  exit /b 1
)

set "SPOTIFY_OAUTH_REDIRECT_URI=http://127.0.0.1:%PORT%/api/spotify/callback"

echo Using port %PORT%.
echo Spotify redirect URI: %SPOTIFY_OAUTH_REDIRECT_URI%
echo Installing dependencies...
call npm install
echo Starting development server...
call npm run dev -- --port %PORT%
