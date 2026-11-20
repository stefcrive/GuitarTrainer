$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$toolDirectory = Join-Path $workspace '.document-tools'
New-Item -ItemType Directory -Force -Path $toolDirectory | Out-Null
$release = Invoke-RestMethod 'https://api.github.com/repos/Audiveris/audiveris/releases/tags/5.11.0'
$asset = $release.assets | Where-Object { $_.name -eq 'Audiveris-5.11.0-windowsConsole-x86_64.msi' }
if (-not $asset) { throw 'The official Audiveris Windows release was not found.' }
$installer = Join-Path $toolDirectory $asset.name
if (-not (Test-Path -LiteralPath $installer)) { Invoke-WebRequest $asset.browser_download_url -OutFile $installer }
if ($asset.digest -and $asset.digest.StartsWith('sha256:')) {
  $hash = [System.Security.Cryptography.SHA256]::Create()
  $stream = [System.IO.File]::OpenRead($installer)
  try { $actual = [BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
  finally { $stream.Dispose(); $hash.Dispose() }
  if ($actual -ne $asset.digest.Substring(7)) { throw 'Audiveris checksum mismatch.' }
}
$destination = Join-Path $toolDirectory 'audiveris'
$result = Start-Process msiexec.exe -ArgumentList @('/a', ('"' + $installer + '"'), '/qn', ('TARGETDIR="' + $destination + '"')) -WindowStyle Hidden -Wait -PassThru
if ($result.ExitCode -ne 0) { throw "Audiveris extraction failed: $($result.ExitCode)" }
$executable = Get-ChildItem -LiteralPath $destination -Filter Audiveris.exe -Recurse | Select-Object -First 1
if (-not $executable) { throw 'Audiveris executable was not found after extraction.' }
Set-Content -LiteralPath (Join-Path $toolDirectory 'audiveris-path.txt') -Value $executable.FullName -Encoding utf8
Write-Output 'Audiveris is ready for document recognition. No system installation was performed.'
