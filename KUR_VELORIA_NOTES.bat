@echo off
setlocal
chcp 65001 >nul
title Veloria Notes v1.1.1 Kurulum
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0_kurulum.ps1"
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (
  echo.
  echo Kurulum tamamlanamadi. Masaustundeki Veloria_Notes_Kurulum_Hatasi.txt dosyasini hata raporuna ekleyin.
  pause
  exit /b %RC%
)

set "VELORIA_EXE=%LOCALAPPDATA%\Veloria Notes\Veloria Notes.exe"
if exist "%VELORIA_EXE%" (
  start "" /D "%LOCALAPPDATA%\Veloria Notes" "%VELORIA_EXE%"
) else (
  echo Kurulum tamamlandi ancak kurulu EXE bulunamadi: "%VELORIA_EXE%"
  pause
  exit /b 2
)

exit /b 0
