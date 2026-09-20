param(
  [Parameter(Mandatory=$true)][ValidateSet('update','rollback')][string]$Mode,
  [Parameter(Mandatory=$true)][string]$Exe,
  [Parameter(Mandatory=$true)][string]$InstallDir,
  [string]$UserData = '',
  [Parameter(Mandatory=$true)][string]$BackupDir,
  [string]$Package = ''
)

$ErrorActionPreference = 'Stop'
$AppName = 'Veloria Notes'
$AppDir = Join-Path $InstallDir 'resources\app'
$TempRoot = Join-Path $env:TEMP ("VeloriaNotesUpdate-" + $PID)

function Stop-App {
  foreach ($name in @('Veloria Notes','Veloria')) {
    Get-Process -Name $name -ErrorAction SilentlyContinue | ForEach-Object { try { [void]$_.CloseMainWindow() } catch {} }
  }
  Start-Sleep -Milliseconds 1200
  foreach ($name in @('Veloria Notes','Veloria')) {
    Get-Process -Name $name -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  }
}

function Get-AppVersion([string]$Dir) {
  try {
    $pkg = Get-Content -Raw -LiteralPath (Join-Path $Dir 'package.json') | ConvertFrom-Json
    if ($pkg.version) { return [string]$pkg.version }
  } catch {}
  return 'unknown'
}

function Assert-AppLayer([string]$Dir) {
  if (-not (Test-Path -LiteralPath (Join-Path $Dir 'main.js'))) { throw 'Güncelleme paketinde main.js bulunamadı.' }
  if (-not (Test-Path -LiteralPath (Join-Path $Dir 'package.json'))) { throw 'Güncelleme paketinde package.json bulunamadı.' }
  $pkg = Get-Content -Raw -LiteralPath (Join-Path $Dir 'package.json') | ConvertFrom-Json
  $name = [string]$pkg.name
  if ($name -notin @('veloria-notes','veloria-desktop')) { throw 'Bu ZIP geçerli bir Veloria Notes güncelleme paketi değil.' }
}

function New-AppBackup([string]$Label = '') {
  if (-not (Test-Path -LiteralPath $AppDir)) { return $null }
  New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
  $version = Get-AppVersion $AppDir
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $safeLabel = if ($Label) { '-' + ($Label -replace '[^A-Za-z0-9._-]','_') } else { '' }
  $target = Join-Path $BackupDir ("$stamp-v$version$safeLabel")
  Copy-Item -LiteralPath $AppDir -Destination $target -Recurse -Force
  return $target
}

function Install-AppLayer([string]$SourceDir) {
  Assert-AppLayer $SourceDir
  $resources = Join-Path $InstallDir 'resources'
  New-Item -ItemType Directory -Force -Path $resources | Out-Null
  $stage = Join-Path $resources ("app.new-" + $PID)
  $old = Join-Path $resources ("app.old-" + $PID)
  Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $old -Recurse -Force -ErrorAction SilentlyContinue
  Copy-Item -LiteralPath $SourceDir -Destination $stage -Recurse -Force
  Assert-AppLayer $stage
  try {
    if (Test-Path -LiteralPath $AppDir) { Move-Item -LiteralPath $AppDir -Destination $old -Force }
    Move-Item -LiteralPath $stage -Destination $AppDir -Force
    Remove-Item -LiteralPath $old -Recurse -Force -ErrorAction SilentlyContinue
  } catch {
    Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
    if ((Test-Path -LiteralPath $old) -and -not (Test-Path -LiteralPath $AppDir)) { Move-Item -LiteralPath $old -Destination $AppDir -Force }
    throw
  }
}

function Resolve-UpdateApp([string]$ZipPath) {
  if (-not (Test-Path -LiteralPath $ZipPath)) { throw 'Güncelleme ZIP dosyası bulunamadı.' }
  if ([IO.Path]::GetExtension($ZipPath).ToLowerInvariant() -ne '.zip') { throw 'Güncelleme paketi ZIP biçiminde olmalı.' }
  $extract = Join-Path $TempRoot 'package'
  New-Item -ItemType Directory -Force -Path $extract | Out-Null
  Expand-Archive -LiteralPath $ZipPath -DestinationPath $extract -Force
  $candidates = New-Object System.Collections.Generic.List[string]
  $candidates.Add($extract)
  $candidates.Add((Join-Path $extract 'app'))
  Get-ChildItem -LiteralPath $extract -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    $candidates.Add($_.FullName)
    $candidates.Add((Join-Path $_.FullName 'app'))
  }
  foreach ($candidate in $candidates) {
    if ((Test-Path -LiteralPath (Join-Path $candidate 'package.json')) -and (Test-Path -LiteralPath (Join-Path $candidate 'main.js'))) {
      Assert-AppLayer $candidate
      return $candidate
    }
  }
  throw 'ZIP içinde Veloria Notes uygulama katmanı bulunamadı.'
}

try {
  New-Item -ItemType Directory -Force -Path $TempRoot,$BackupDir | Out-Null
  Stop-App
  if ($Mode -eq 'update') {
    if (-not $Package) { throw 'Güncelleme paketi belirtilmedi.' }
    $source = Resolve-UpdateApp $Package
    [void](New-AppBackup 'before-update')
    Install-AppLayer $source
  } else {
    if (-not $Package -or $Package -notmatch '^[A-Za-z0-9._-]+$') { throw 'Geçersiz geri alma kimliği.' }
    $candidate = Join-Path $BackupDir $Package
    $backupRoot = [IO.Path]::GetFullPath($BackupDir).TrimEnd('\') + '\'
    $candidateFull = [IO.Path]::GetFullPath($candidate)
    if (-not $candidateFull.StartsWith($backupRoot,[StringComparison]::OrdinalIgnoreCase)) { throw 'Geçersiz yedek yolu.' }
    if (-not (Test-Path -LiteralPath $candidateFull)) { throw 'Seçilen program yedeği bulunamadı.' }
    Assert-AppLayer $candidateFull
    [void](New-AppBackup 'before-rollback')
    Install-AppLayer $candidateFull
  }
  Remove-Item -LiteralPath $TempRoot -Recurse -Force -ErrorAction SilentlyContinue
  Start-Process -FilePath $Exe -WorkingDirectory $InstallDir
  exit 0
} catch {
  $message = $_.Exception.Message
  try {
    $log = Join-Path $env:TEMP 'Veloria_Notes_Guncelleme_Hatasi.txt'
    Set-Content -Encoding UTF8 -LiteralPath $log -Value ("$AppName güncelleme hatası`r`n$message`r`n$($_.ScriptStackTrace)")
  } catch {}
  exit 1
}
