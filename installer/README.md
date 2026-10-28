# Veloria Notes kurulum kaynakları

Bu klasör küçük **web kurulum EXE'sinin** kaynak kodunu içerir. Web kurulum EXE'si uygulama kaynaklarını kendi içine gömer; ilk kurulumda resmi Electron çalışma zamanını indirir, SHA-256 ile doğrular ve `%LOCALAPPDATA%\Veloria Notes` altına otomatik kurar.

Windows üzerinde üretmek için:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\installer\build-web-installer.ps1
```

Çıktı:

```text
dist\Veloria-Notes-Web-Setup-1.1.0.exe
```

GitHub Releases için ana paket `electron-builder` ile oluşturulan `Veloria-Notes-Setup-1.1.0.exe` dosyasıdır. Web installer daha küçük bir alternatif olarak sunulur.
