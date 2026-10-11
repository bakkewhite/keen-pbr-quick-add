param(
  [string]$Version = ''
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$package = Get-Content -LiteralPath (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json
if ($Version -and $Version -cne $package.version) {
  throw 'Version must match package.json'
}
$Version = $package.version
if ($Version -notmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?$') {
  throw 'Invalid package version'
}
$dist = [IO.Path]::GetFullPath((Join-Path $repoRoot 'dist'))
$release = [IO.Path]::GetFullPath((Join-Path $repoRoot 'release'))
$staging = [IO.Path]::GetFullPath((Join-Path $release 'staging'))
$archive = [IO.Path]::GetFullPath(
  (Join-Path $release "keen-pbr-quick-add-v$Version.zip")
)

$releasePrefix = $release.TrimEnd([IO.Path]::DirectorySeparatorChar) +
  [IO.Path]::DirectorySeparatorChar
foreach ($target in @($staging, $archive)) {
  if (-not $target.StartsWith(
      $releasePrefix,
      [StringComparison]::OrdinalIgnoreCase
    )) {
    throw 'Package target escaped release/'
  }
}

if (-not (Test-Path -LiteralPath (Join-Path $dist 'manifest.json'))) {
  throw 'dist/manifest.json is missing; run npm run build first'
}
$manifest = Get-Content -LiteralPath (Join-Path $dist 'manifest.json') -Raw | ConvertFrom-Json
if ($manifest.version -cne ($Version -split '-')[0]) {
  throw 'Built manifest version does not match package.json'
}

New-Item -ItemType Directory -Path $release -Force | Out-Null
if (Test-Path -LiteralPath $staging) {
  Remove-Item -LiteralPath $staging -Recurse -Force
}
New-Item -ItemType Directory -Path $staging | Out-Null

try {
  Copy-Item -Path (Join-Path $dist '*') -Destination $staging -Recurse
  Copy-Item -LiteralPath (Join-Path $repoRoot 'LICENSE') -Destination $staging
  Get-ChildItem -LiteralPath $staging -Filter '*.map' -Recurse |
    Remove-Item -Force

  if (Test-Path -LiteralPath $archive) {
    Remove-Item -LiteralPath $archive -Force
  }
  Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $archive
} finally {
  if (Test-Path -LiteralPath $staging) {
    Remove-Item -LiteralPath $staging -Recurse -Force
  }
}

Write-Output $archive
