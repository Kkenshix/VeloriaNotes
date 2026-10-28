$ErrorActionPreference = 'Stop'
$ElectronVersion = '44.10.0'
$AppVersion = '1.1.2'
$AppName = 'Veloria Notes'
$Author = 'Kenshix'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Payload = Join-Path $Root 'app'
$UpdaterSource = Join-Path $Root 'VELORIA_UPDATE_ENGINE.ps1'
$InstallDir = Join-Path $env:LOCALAPPDATA 'Veloria Notes'
$LegacyInstallDir = Join-Path $env:LOCALAPPDATA 'Veloria'
$TempDir = Join-Path $env:TEMP ("VeloriaNotesInstall-" + $PID)
if ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($TempDir)) -ne [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\')) { throw 'Beklenmeyen geçici kurulum yolu.' }
$RuntimeZip = Join-Path $TempDir ("electron-v$ElectronVersion-win32-x64.zip")
$SumsFile = Join-Path $TempDir 'SHASUMS256.txt'
$ReleaseBase = "https://github.com/electron/electron/releases/download/v$ElectronVersion"
$Exe = Join-Path $InstallDir 'Veloria Notes.exe'
$IconIco = Join-Path $Payload 'icon.ico'
$Rcedit = Join-Path $TempDir 'rcedit-x64.exe'
$RceditSha256 = '3E7801DB1A5EDBEC91B49A24A094AAD776CB4515488EA5A4CA2289C400EADE2A'
$ExistingRuntimeDir = Join-Path $TempDir 'existing-runtime'
$ReuseExistingRuntime = $false
$RuntimeSourceDir = ''

function Say([string]$Text, [ConsoleColor]$Color = [ConsoleColor]::Gray) { Write-Host $Text -ForegroundColor $Color }
function Show-Banner {
  Clear-Host
  Say '[Veloria Notes] Kurulum başlatılıyor' Cyan
  Say ('=' * 82) DarkGray
  Say ''
  $logo = @(
    'V   V  EEEEE  L       OOO   RRRR   I   AAAAA     N   N   OOO   TTTTT  EEEEE   SSSS',
    'V   V  E      L      O   O  R   R  I   A   A     NN  N  O   O    T    E      S    ',
    'V   V  EEEE   L      O   O  RRRR   I   AAAAA     N N N  O   O    T    EEEE    SSS ',
    ' V V   E      L      O   O  R  R   I   A   A     N  NN  O   O    T    E          S',
    '  V    EEEEE  LLLLL   OOO   R   R  I   A   A     N   N   OOO     T    EEEEE  SSSS '
  )
  foreach ($line in $logo) { Say $line Cyan }
  Say ''
  Say ('-' * 82) DarkGray
  Say ('  Sürüm       : v{0}' -f $AppVersion) White
  Say ('  Geliştirici : {0}' -f $Author) DarkCyan
  Say '  Platform    : Windows x64' DarkCyan
  Say ('-' * 82) DarkGray
  Say ''
}
function Get-DesktopCandidates {
  $list = New-Object System.Collections.Generic.List[string]
  $candidates = @([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('DesktopDirectory'),(Join-Path $env:USERPROFILE 'Desktop'))
  if ($env:OneDrive) { $candidates += (Join-Path $env:OneDrive 'Desktop') }
  if ($env:OneDriveConsumer) { $candidates += (Join-Path $env:OneDriveConsumer 'Desktop') }
  try {
    $p = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders' -Name Desktop -ErrorAction Stop).Desktop
    if ($p) { $candidates += [Environment]::ExpandEnvironmentVariables($p) }
  } catch {}
  foreach ($p in $candidates) { if ($p -and -not $list.Contains($p)) { $list.Add($p) } }
  return $list
}

function Get-VeloriaDataRoot {
  $desktop = (Get-DesktopCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1)
  if (-not $desktop) { $desktop = Join-Path $env:USERPROFILE 'Desktop' }
  return (Join-Path $desktop 'Veloria Dosyalar')
}

function Prepare-LocalDataRoot {
  $dataRoot = Get-VeloriaDataRoot
  $systemRoot = Join-Path $dataRoot '_Veloria'
  $localData = Join-Path $systemRoot 'local-data'
  New-Item -ItemType Directory -Force -Path $dataRoot,$systemRoot,$localData | Out-Null
  try { (Get-Item $systemRoot -Force).Attributes = ((Get-Item $systemRoot -Force).Attributes -bor [IO.FileAttributes]::Hidden) } catch {}
  return $dataRoot
}

function Backup-UserStateBeforeUpdate {
  $localData = Join-Path (Join-Path (Get-VeloriaDataRoot) '_Veloria') 'local-data'
  $statePath = Join-Path $localData 'veloria-state.json'
  if (-not (Test-Path $statePath)) { return }
  $backupDir = Join-Path $localData 'backups'
  New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  Copy-Item -LiteralPath $statePath -Destination (Join-Path $backupDir ("veloria-state-before-install-$stamp.json")) -Force
}

function Backup-InstalledAppLayer([string]$SourceInstallDir) {
  $appLayer = Join-Path $SourceInstallDir 'resources\app'
  if (-not (Test-Path -LiteralPath (Join-Path $appLayer 'main.js'))) { return }
  $backupRoot = Join-Path (Join-Path (Get-VeloriaDataRoot) '_Veloria') 'app-backups'
  New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
  $oldVersion = 'unknown'
  try { $oldVersion = [string]((Get-Content -Raw -LiteralPath (Join-Path $appLayer 'package.json') | ConvertFrom-Json).version) } catch {}
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $target = Join-Path $backupRoot ("$stamp-v$oldVersion-before-install")
  Copy-Item -LiteralPath $appLayer -Destination $target -Recurse -Force
}

function Download-File([string]$Url, [string]$OutFile) {
  try { Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $OutFile -TimeoutSec 240; return } catch { Say ("PowerShell indirmesi başarısız, curl deneniyor: " + $_.Exception.Message) Yellow }
  if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
    & curl.exe -L --fail --retry 3 --connect-timeout 20 -o $OutFile $Url
    if ($LASTEXITCODE -eq 0) { return }
  }
  throw "İndirme başarısız: $Url"
}

function Stop-VeloriaNotes {
  foreach ($name in @('Veloria Notes','Veloria')) { Get-Process -Name $name -ErrorAction SilentlyContinue | ForEach-Object { try { [void]$_.CloseMainWindow() } catch {} } }
  $deadline = (Get-Date).AddSeconds(30)
  while ((Get-Process -Name 'Veloria Notes','Veloria' -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 250 }
  if (Get-Process -Name 'Veloria Notes','Veloria' -ErrorAction SilentlyContinue) { throw 'Veloria Notes henüz kapanmadı. Açık değişikliklerini kaydedip uygulamayı kapattıktan sonra kurulumu yeniden çalıştır.' }
}

function New-Shortcut([string]$ShortcutPath, [string]$TargetExe) {
  $parent = Split-Path -Parent $ShortcutPath
  if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
  $ws = New-Object -ComObject WScript.Shell
  $s = $ws.CreateShortcut($ShortcutPath)
  $s.TargetPath = $TargetExe
  $s.WorkingDirectory = Split-Path -Parent $TargetExe
  $appIcon = Join-Path (Split-Path -Parent $TargetExe) 'resources\app\icon.ico'
  $s.IconLocation = if (Test-Path $appIcon) { $appIcon } else { "$TargetExe,0" }
  $s.Description = "Veloria Notes v$AppVersion"
  $s.Save()
}

function Set-RegDefault([string]$SubKey, [string]$Value) { $key=[Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($SubKey); try{$key.SetValue('', $Value,[Microsoft.Win32.RegistryValueKind]::String)}finally{if($key){$key.Dispose()}} }
function Set-RegString([string]$SubKey,[string]$Name,[string]$Value) { $key=[Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($SubKey); try{$key.SetValue($Name,$Value,[Microsoft.Win32.RegistryValueKind]::String)}finally{if($key){$key.Dispose()}} }
function Set-RegDword([string]$SubKey,[string]$Name,[int]$Value) { $key=[Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($SubKey); try{$key.SetValue($Name,$Value,[Microsoft.Win32.RegistryValueKind]::DWord)}finally{if($key){$key.Dispose()}} }

function Register-Integration {
  Set-RegDefault 'Software\Classes\*\shell\VeloriaMove' "Veloria Notes'a Taşı"
  Set-RegString 'Software\Classes\*\shell\VeloriaMove' 'Icon' $Exe
  Set-RegDefault 'Software\Classes\*\shell\VeloriaMove\command' ('"{0}" --veloria-import "%1"' -f $Exe)
  Set-RegDefault 'Software\Classes\*\shell\VeloriaNewNote' "Veloria Notes'ta Yeni Sayfa Oluştur"
  Set-RegString 'Software\Classes\*\shell\VeloriaNewNote' 'Icon' $Exe
  Set-RegDefault 'Software\Classes\*\shell\VeloriaNewNote\command' ('"{0}" --veloria-new-note "%1"' -f $Exe)
  Set-RegDefault 'Software\Classes\*\shell\VeloriaShow' "Veloria Notes'ta Göster"
  Set-RegString 'Software\Classes\*\shell\VeloriaShow' 'Icon' $Exe
  Set-RegDefault 'Software\Classes\*\shell\VeloriaShow\command' ('"{0}" --veloria-show "%1"' -f $Exe)
  Set-RegDefault 'Software\Classes\veloria' 'URL:Veloria Notes Protocol'
  Set-RegString 'Software\Classes\veloria' 'URL Protocol' ''
  Set-RegDefault 'Software\Classes\veloria\shell\open\command' ('"{0}" "%1"' -f $Exe)
}

function Write-Uninstaller {
  $uninstaller = Join-Path $InstallDir 'KALDIR_VELORIA_NOTES.ps1'
  $body = @"
`$ErrorActionPreference='SilentlyContinue'
foreach(`$n in @('Veloria Notes','Veloria')){Get-Process -Name `$n | Stop-Process -Force}
Start-Sleep -Milliseconds 500
`$paths=@('HKCU:\Software\Classes\*\shell\VeloriaMove','HKCU:\Software\Classes\*\shell\VeloriaNewNote','HKCU:\Software\Classes\*\shell\VeloriaShow','HKCU:\Software\Classes\veloria','HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\VeloriaNotes')
foreach(`$p in `$paths){Remove-Item -LiteralPath `$p -Recurse -Force}
`$desktops=@([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('DesktopDirectory'))|Select-Object -Unique
foreach(`$d in `$desktops){if(`$d){Remove-Item -Force (Join-Path `$d 'Veloria Notes.lnk')}}
`$programs=[Environment]::GetFolderPath('Programs');if(`$programs){Remove-Item -Force (Join-Path `$programs 'Veloria Notes.lnk')}
Start-Process powershell.exe -ArgumentList '-NoProfile','-WindowStyle','Hidden','-Command',('Start-Sleep 1; Remove-Item -LiteralPath "{0}" -Recurse -Force' -f '$InstallDir') -WindowStyle Hidden
"@
  Set-Content -Encoding UTF8 -LiteralPath $uninstaller -Value $body
  $u='Software\Microsoft\Windows\CurrentVersion\Uninstall\VeloriaNotes'
  Set-RegString $u 'DisplayName' 'Veloria Notes'
  Set-RegString $u 'DisplayVersion' $AppVersion
  Set-RegString $u 'Publisher' $Author
  Set-RegString $u 'InstallLocation' $InstallDir
  Set-RegString $u 'DisplayIcon' $Exe
  Set-RegString $u 'UninstallString' ('powershell.exe -NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $uninstaller)
  Set-RegDword $u 'NoModify' 1
  Set-RegDword $u 'NoRepair' 1
}


try {
  Show-Banner
  if (-not [Environment]::Is64BitOperatingSystem) { throw 'Bu paket yalnızca 64-bit Windows içindir.' }
  if (-not (Test-Path $Payload)) { throw 'app klasörü bulunamadı. ZIP paketini tamamen çıkartıp tekrar deneyin.' }
  if (-not (Test-Path $UpdaterSource)) { throw 'VELORIA_UPDATE_ENGINE.ps1 bulunamadı.' }
  New-Item -ItemType Directory -Force -Path $TempDir | Out-Null
  [void](Prepare-LocalDataRoot)
  Say 'Kurulum başlatılıyor. Mevcut not ve dosyalar korunacaktır.' White
  Stop-VeloriaNotes
  Backup-UserStateBeforeUpdate

  Backup-InstalledAppLayer $InstallDir
  if ((Test-Path (Join-Path $InstallDir 'icudtl.dat')) -and (Test-Path (Join-Path $InstallDir 'version')) -and ((Get-Content -Raw (Join-Path $InstallDir 'version')).Trim() -eq $ElectronVersion)) { $RuntimeSourceDir=$InstallDir }

  if ($RuntimeSourceDir) {
    Say '[1/7] Mevcut Electron çalışma zamanı hazırlanıyor...' Cyan
    $ReuseExistingRuntime=$true
  } else {
    Say '[1/7] Electron Windows çalışma zamanı indiriliyor...' Cyan
    Download-File "$ReleaseBase/electron-v$ElectronVersion-win32-x64.zip" $RuntimeZip
    Download-File "$ReleaseBase/SHASUMS256.txt" $SumsFile
    Say '[2/7] Çalışma zamanı SHA-256 ile doğrulanıyor...' Cyan
    $zipName=Split-Path -Leaf $RuntimeZip
    $line=Get-Content $SumsFile|Where-Object{$_ -match [regex]::Escape($zipName)}|Select-Object -First 1
    if(-not $line){throw 'Electron SHA-256 kaydı bulunamadı.'}
    $expected=($line -split '\s+')[0].ToLowerInvariant();$actual=(Get-FileHash -Algorithm SHA256 $RuntimeZip).Hash.ToLowerInvariant()
    if($expected -ne $actual){throw 'Electron çalışma zamanı SHA-256 doğrulaması başarısız.'}
  }

  if($ReuseExistingRuntime){Say '[2/7] Mevcut çalışma zamanı doğrulandı.' Cyan}
  Say '[3/7] Program dosyaları hazırlanıyor...' Cyan
  if ([IO.Path]::GetFullPath($InstallDir) -ne [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Veloria Notes'))) { throw 'Beklenmeyen kurulum yolu.' }
  New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

  Say '[4/7] Veloria Notes.exe oluşturuluyor...' Cyan
  if($ReuseExistingRuntime){
    $legacyExe=Join-Path $InstallDir 'Veloria.exe';$electronExe=Join-Path $InstallDir 'electron.exe'
    if(-not(Test-Path $Exe)){
      if(Test-Path $legacyExe){Move-Item -LiteralPath $legacyExe -Destination $Exe -Force}
      elseif(Test-Path $electronExe){Move-Item -LiteralPath $electronExe -Destination $Exe -Force}
    }
  } else {
    Expand-Archive -LiteralPath $RuntimeZip -DestinationPath $InstallDir -Force
    $electronExe=Join-Path $InstallDir 'electron.exe';if(-not(Test-Path $electronExe)){throw 'electron.exe çalışma zamanı içinde bulunamadı.'}
    Move-Item -LiteralPath $electronExe -Destination $Exe -Force
  }
  if(-not(Test-Path $Exe)){throw 'Veloria Notes.exe oluşturulamadı.'}
  $defaultApp=Join-Path $InstallDir 'resources\default_app.asar';if(Test-Path $defaultApp){Remove-Item -LiteralPath $defaultApp -Force}
  $appDir=Join-Path $InstallDir 'resources\app';New-Item -ItemType Directory -Force -Path $appDir | Out-Null
  Get-ChildItem -LiteralPath $Payload -Force | Where-Object { $_.Name -notin @('node_modules','tests','package-lock.json') } | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $appDir -Recurse -Force }
  Copy-Item -LiteralPath $UpdaterSource -Destination (Join-Path $InstallDir 'VELORIA_UPDATE_ENGINE.ps1') -Force

  if(Test-Path $IconIco){
    try{
      Download-File 'https://github.com/electron/rcedit/releases/download/v2.0.0/rcedit-x64.exe' $Rcedit
      if((Get-FileHash -Algorithm SHA256 $Rcedit).Hash.ToUpperInvariant() -ne $RceditSha256){throw 'rcedit SHA-256 doğrulaması başarısız.'}
      & $Rcedit $Exe --set-icon $IconIco --set-file-version "$AppVersion.0" --set-product-version "$AppVersion.0" --set-version-string ProductName 'Veloria Notes' --set-version-string FileDescription 'Veloria Notes' --set-version-string CompanyName 'Kenshix'
    }catch{Say ('EXE simgesi uygulanamadı; uygulama içi simge kullanılacak: '+$_.Exception.Message) Yellow}
  }

  Say '[5/7] Masaüstü ve Başlat Menüsü kısayolları oluşturuluyor...' Cyan
  $desktopMade=$false
  foreach($d in (Get-DesktopCandidates|Select-Object -Unique)){if($d -and (Test-Path $d)){try{New-Shortcut (Join-Path $d 'Veloria Notes.lnk') $Exe;$desktopMade=$true}catch{}}}
  if(-not $desktopMade){throw 'Masaüstü kısayolu oluşturulamadı.'}
  $programs=[Environment]::GetFolderPath('Programs');if($programs){New-Shortcut (Join-Path $programs 'Veloria Notes.lnk') $Exe}
  foreach($d in (Get-DesktopCandidates|Select-Object -Unique)){if($d){Remove-Item -LiteralPath (Join-Path $d 'Veloria.lnk') -Force -ErrorAction SilentlyContinue}}

  Say '[6/7] Windows entegrasyonu kuruluyor...' Cyan
  Register-Integration
  Write-Uninstaller
  Remove-Item 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Veloria' -Recurse -Force -ErrorAction SilentlyContinue

  Say '[7/7] Kurulum son kontrolleri tamamlanıyor...' Cyan
  Remove-Item -LiteralPath $TempDir -Recurse -Force -ErrorAction SilentlyContinue
  Say ''
  Say 'KURULUM TAMAMLANDI.' Green
  Say "Uygulama: $Exe" White
  Say 'Kurulum tamamlandı. Veloria Notes kurucudan bağımsız olarak açılacak.' DarkGray
  Start-Sleep -Seconds 2
  exit 0
} catch {
  $err=$_.Exception.Message
  Say ''
  Say ("HATA: "+$err) Red
  try{
    $desktop=(Get-DesktopCandidates|Where-Object{$_ -and (Test-Path $_)}|Select-Object -First 1);if(-not $desktop){$desktop=$env:USERPROFILE}
    $log=Join-Path $desktop 'Veloria_Notes_Kurulum_Hatasi.txt'
    Set-Content -Encoding UTF8 -LiteralPath $log -Value ("Veloria Notes v$AppVersion kurulum hatası`r`n$err`r`n$($_.ScriptStackTrace)")
    Start-Process notepad.exe -ArgumentList $log
  }catch{}
  exit 1
}
