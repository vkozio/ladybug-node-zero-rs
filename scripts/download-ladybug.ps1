# Download Ladybug prebuilt C library into third_party/ladybug.
# Usage: from repo root, .\scripts\download-ladybug.ps1
# Env: LADYBUG_VERSION (default: v0.14.2-bindings.0 for vkozio/ladybug, else v0.14.1), LADYBUG_REPO (default vkozio/ladybug).

$ErrorActionPreference = "Stop"
$repo = if ($env:LADYBUG_REPO) { $env:LADYBUG_REPO } else { "vkozio/ladybug" }
$version = if ($env:LADYBUG_VERSION) { $env:LADYBUG_VERSION } else {
  if ($repo -eq "vkozio/ladybug") { "v0.14.2-bindings.0" } else { "v0.14.1" }
}

$os = $env:OS
$arch = [System.Environment]::GetEnvironmentVariable("PROCESSOR_ARCHITECTURE", "Machine")
$assetName = $null
if ($os -match "Windows") {
    if ($arch -eq "AMD64") { $assetName = "liblbug-windows-x86_64.zip" }
    elseif ($arch -eq "ARM64") { $assetName = "liblbug-windows-aarch64.zip" }
}
if (-not $assetName) {
    Write-Error "Unsupported platform: OS=$os ARCH=$arch. Set LADYBUG_ASSET to the release asset filename to override."
}
if ($env:LADYBUG_ASSET) { $assetName = $env:LADYBUG_ASSET }

$baseUrl = "https://github.com/$repo/releases/download/$version/$assetName"
$root = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $root "package.json"))) { $root = (Get-Location).Path }
$destDir = Join-Path $root "third_party\ladybug"
$zipPath = Join-Path $destDir "ladybug-prebuilt.zip"
$extractDir = Join-Path $destDir "_extract"

New-Item -ItemType Directory -Force -Path $destDir | Out-Null

Write-Host "Downloading $baseUrl -> $zipPath"
Invoke-WebRequest -Uri $baseUrl -OutFile $zipPath -UseBasicParsing

if (Test-Path $extractDir) { Remove-Item -Recurse -Force $extractDir }
Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force

$children = Get-ChildItem -Path $extractDir
if ($children.Count -eq 1 -and $children[0].PSIsContainer) {
    $inner = $children[0]
    Get-ChildItem -Path $inner.FullName | Move-Item -Destination $destDir -Force
} else {
    Get-ChildItem -Path $extractDir | Move-Item -Destination $destDir -Force
}
Remove-Item -Recurse -Force $extractDir
Remove-Item -Force $zipPath

Write-Host "Done. Library and headers are in $destDir"
