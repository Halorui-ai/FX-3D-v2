# Headless screenshot of the offline viewer opened from file:// (self-check).
# usage: .\shot.ps1 <name> "<hash params>" [width] [height]
param([string]$name, [string]$hash = "", [int]$w = 1600, [int]$h = 900)
$root = Split-Path $PSScriptRoot -Parent
$out = Join-Path $root "docs\check\shot_$name.png"
# (no non-ASCII literals here: Windows PowerShell 5.1 reads BOM-less scripts as ANSI)
$dist = (Get-ChildItem $root -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'app.js') } | Select-Object -First 1).FullName
$html = (Join-Path $dist "index.html") -replace '\\', '/'
$url = "file:///" + [uri]::EscapeUriString($html) + "#shot=1&ui=0&" + $hash
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$prof = Join-Path $env:TEMP ("fx3d_" + [guid]::NewGuid().ToString("N"))
if (Test-Path $out) { Remove-Item $out }
& $chrome --headless=new "--user-data-dir=$prof" --no-first-run --hide-scrollbars --enable-gpu --ignore-gpu-blocklist "--window-size=$w,$h" --virtual-time-budget=9000 "--screenshot=$out" --enable-logging=stderr --v=0 $url 2>&1 |
  Select-String -Pattern 'CONSOLE' | Select-Object -First 12 | ForEach-Object { $_.Line.Substring(0, [Math]::Min(300, $_.Line.Length)) }
Start-Sleep -Milliseconds 300
Remove-Item -Recurse -Force $prof -ErrorAction SilentlyContinue
if (Test-Path $out) { "{0} {1} KB" -f $out, [int]((Get-Item $out).Length / 1024) } else { "FAILED $name" }
