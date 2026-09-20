param(
  [string]$Version = '1.0'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Bootstrap = Join-Path $Root 'installer\bootstrap'
$Stage = Join-Path $env:TEMP ("VeloriaNotesWebInstaller-" + $PID)
$Payload = Join-Path $Bootstrap 'payload.zip'
$Dist = Join-Path $Root 'dist'
$Out = Join-Path $Dist ("Veloria-Notes-Web-Setup-$Version.exe")
$Rcedit = Join-Path $Stage 'rcedit-x64.exe'
$RceditSha256 = '3E7801DB1A5EDBEC91B49A24A094AAD776CB4515488EA5A4CA2289C400EADE2A'

function Download-File([string]$Url,[string]$OutFile) {
  try { Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $OutFile -TimeoutSec 240; return } catch {}
  if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
    & curl.exe -L --fail --retry 3 --connect-timeout 20 -o $OutFile $Url
    if ($LASTEXITCODE -eq 0) { return }
  }
  throw "İndirme başarısız: $Url"
}

try {
  if (-not (Get-Command go.exe -ErrorAction SilentlyContinue)) { throw 'Go 1.23+ bulunamadı.' }
  New-Item -ItemType Directory -Force -Path $Stage,$Dist | Out-Null
  $payloadRoot = Join-Path $Stage 'payload'
  New-Item -ItemType Directory -Force -Path (Join-Path $payloadRoot 'app') | Out-Null
  Copy-Item -LiteralPath (Join-Path $Root '_kurulum.ps1') -Destination $payloadRoot
  Copy-Item -LiteralPath (Join-Path $Root 'VELORIA_UPDATE_ENGINE.ps1') -Destination $payloadRoot
  Get-ChildItem -LiteralPath (Join-Path $Root 'app') -Force | Where-Object { $_.Name -notin @('tests','node_modules') } | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $payloadRoot 'app') -Recurse -Force
  }
  Remove-Item -LiteralPath $Payload -Force -ErrorAction SilentlyContinue
  Compress-Archive -Path (Join-Path $payloadRoot '*') -DestinationPath $Payload -CompressionLevel Optimal -Force

  Push-Location $Bootstrap
  try {
    $env:GOOS='windows'; $env:GOARCH='amd64'; $env:CGO_ENABLED='0'
    & go.exe build -trimpath -ldflags '-s -w' -o $Out .
    if ($LASTEXITCODE -ne 0) { throw 'Go web kurulum EXE derlemesi başarısız.' }
  } finally { Pop-Location }

  Download-File 'https://github.com/electron/rcedit/releases/download/v2.0.0/rcedit-x64.exe' $Rcedit
  if ((Get-FileHash -Algorithm SHA256 $Rcedit).Hash.ToUpperInvariant() -ne $RceditSha256) { throw 'rcedit SHA-256 doğrulaması başarısız.' }
  & $Rcedit $Out --set-icon (Join-Path $Root 'app\icon.ico') --set-file-version '1.0.0.0' --set-product-version '1.0.0.0' --set-version-string ProductName 'Veloria Notes Kurulum' --set-version-string FileDescription 'Veloria Notes Web Kurulumu' --set-version-string CompanyName 'Kenshix'
  if ($LASTEXITCODE -ne 0) { throw 'Kurulum EXE simgesi/metadata işlemi başarısız.' }
  Write-Host "Hazır: $Out" -ForegroundColor Green
} finally {
  Remove-Item -LiteralPath $Payload -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $Stage -Recurse -Force -ErrorAction SilentlyContinue
}
