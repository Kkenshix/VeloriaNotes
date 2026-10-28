<p align="center">
  <img src="app/icon.png" alt="Veloria Notes" width="112">
</p>

# Veloria Notes v1.1.1

**Veloria Notes**, notları, sayfaları, klasörleri ve fiziksel dosyaları tek bir yerel çalışma alanında düzenlemek için geliştirilmiş açık kaynak bir Windows masaüstü uygulamasıdır. Electron tabanlıdır; hesap açmayı veya bir bulut hizmetini kullanmayı zorunlu tutmaz.

> Ana hedef platform: **64-bit Windows 10/11**. Uygulama, kurtarma ekranı ve kurulum akışı Türkçedir.

## Özellikler

- Birden fazla bağımsız çalışma alanı, klasör ve sayfa
- Zengin metin, başlık, bağlantı, kod bloğu ve görev içerikleri
- Görsel ve dosya ekleri; yerel dosya önizleme
- Eksik/taşınmış ekleri hata yağmuruna neden olmadan algılama ve yeniden bağlama
- Dosya taşıma/kopyalama, sürüm geçmişi, çöp kutusu ve SHA-256 bütünlük doğrulaması
- ZIP/RAR/7Z/TAR/TGZ/GZ arşivlerini uygulama içinden inceleme
- `Ctrl + Alt + V` ile Hızlı Not penceresi
- Salt + `scrypt` tabanlı yerel uygulama PIN'i
- Yerel durum yedekleri ve Kurtarma modu
- `veloria://` protokolü ve Windows Gezgini sağ tık entegrasyonu
- Uygulama katmanı güncelleme ve geri alma motoru

## Kurulum

### Hazır EXE — kaynak kodundan build almak gerekmez

GitHub **Releases** bölümünde iki Windows kurucusu üretilecek şekilde proje hazırlanmıştır:

```text
Veloria-Notes-Setup-1.1.1.exe
Veloria-Notes-Web-Setup-1.1.1.exe
```

**`Veloria-Notes-Setup-1.1.1.exe`** ana kurulum paketidir. Electron çalışma zamanını paketle birlikte taşır ve normal son kullanıcı dağıtımı için önerilir.

**`Veloria-Notes-Web-Setup-1.1.1.exe`** daha küçük kurucudur. Kaynak kodunu kendi içinde taşır; ilk kurulumda resmi Electron Windows çalışma zamanını indirir, resmi `SHASUMS256.txt` kaydıyla SHA-256 doğrulaması yapar ve kurulumu otomatik tamamlar.

Her iki yöntemde de kullanıcı kaynak kodundan build almak zorunda değildir. Kurulum kullanıcı hesabına yapılır, masaüstü ve Başlat Menüsü kısayolları oluşturulur ve kurulum tamamlanınca **kurulu `Veloria Notes.exe` bağımsız bir işlem olarak açılır**. Kurulum terminali/CMD penceresi kapansa bile uygulama çalışmaya devam eder. Release iş akışı ayrıca kurulum dosyalarının SHA-256 özetlerini `SHA256SUMS.txt` olarak üretir.

Hazır EXE'lerde `app/icon.ico` uygulama simgesi kullanılır. Proje varsayılan olarak kod imzalama sertifikası içermez; bu nedenle imzasız topluluk buildlerinde Windows SmartScreen ilk çalıştırmada uyarı gösterebilir. Resmî dağıtım yapılacaksa bir Authenticode sertifikasıyla imzalama önerilir.

### Kaynak ZIP'inden otomatik kurulum

Kaynak ZIP'ini doğrudan kullanmak istersen:

1. ZIP'i tamamen bir klasöre çıkart.
2. `KUR_VELORIA_NOTES.bat` dosyasını çift tıkla.
3. Kurulum ekranında **VELORIA NOTES**, sürüm ve geliştirici bilgileri gösterilir.
4. Gerekirse Electron çalışma zamanı indirilip SHA-256 ile doğrulanır.
5. Program `%LOCALAPPDATA%\Veloria Notes` altına kurulur.
6. Masaüstü/Başlat Menüsü kısayolları ve Windows entegrasyonu hazırlanır.
7. Veloria Notes otomatik açılır.

Kaynak kurulum paketinde şu öğeler birlikte kalmalıdır:

```text
KUR_VELORIA_NOTES.bat
_kurulum.ps1
VELORIA_UPDATE_ENGINE.ps1
app\
```

Eski `Veloria` kurulumu bulunursa mevcut Electron çalışma zamanı yeniden kullanılabilir ve kullanıcı verileri korunur.

## Kullanıcı verileri

Varsayılan çalışma alanı:

```text
Masaüstü\Veloria Dosyalar
```

Sistem verileri bu klasördeki gizli `_Veloria` dizininde tutulur. Not durumu, indeksler, çöp kutusu kayıtları, durum yedekleri ve uygulama geri alma kopyaları kurulu EXE'nin içine yazılmaz.

> `Veloria Dosyalar` klasör adı eski sürümlerle uyumluluk için korunmuştur. Uygulamanın görünen adı **Veloria Notes**'tur.

## Kaynaktan geliştirme

Gereksinimler:

- Node.js 22 veya güncel LTS
- npm
- Electron `44.10.0`

```bash
cd app
npm install
npm run validate
npm start
```

`npm run validate`, JavaScript sözdizimi kontrollerini ve otomatik testleri birlikte çalıştırır.

## Windows kurulum EXE'si üretme

### Tam kurulum paketi

64-bit Windows üzerinde:

```powershell
cd app
npm install
npm run validate
npm run dist
```

Çıktı:

```text
dist\Veloria-Notes-Setup-1.1.1.exe
```

### Küçük web kurulum paketi

Go 1.23+ yüklü Windows ortamında depo kökünden:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\installer\build-web-installer.ps1
```

Çıktı:

```text
dist\Veloria-Notes-Web-Setup-1.1.1.exe
```

Web kurucunun kaynak kodu `installer/bootstrap` klasöründedir.

## GitHub Actions ve Release

`.github/workflows/validate.yml` her push/PR üzerinde:

- JavaScript sözdizimi kontrolünü,
- otomatik testleri,
- PowerShell kurulum/güncelleme betiklerinin parser kontrolünü

çalıştırır.

`.github/workflows/build-windows.yml` manuel çalıştırıldığında tam kurulum EXE'sini ve web kurulum EXE'sini oluşturur, `SHA256SUMS.txt` üretir ve artifact olarak saklar. Release, doğrulanmış dosyalar ve sürüm notlarıyla ayrıca yayımlanır.

Örnek sürüm akışı:

```bash
gh release create v1.1.1 dist/Veloria-Notes-Setup-1.1.1.exe --target main --notes-file RELEASE_NOTES.md
```

## Güncelleme ve geri alma

Kurtarma ekranı `VELORIA_UPDATE_ENGINE.ps1` üzerinden uygulama katmanını yedekleyip değiştirebilir. Güncelleme ZIP'inin içinde en az aşağıdaki dosyaları taşıyan geçerli bir `app` katmanı bulunmalıdır:

```text
app/
├─ main.js
├─ package.json
└─ ...
```

Güncellemeden önce mevcut uygulama katmanı:

```text
Veloria Dosyalar\_Veloria\app-backups
```

altına kopyalanır. Geri alma işlemi kullanıcının notlarına ve yönetilen fiziksel dosyalarına dokunmaz.

## Güvenlik modeli

- `contextIsolation: true`
- `nodeIntegration: false`
- Renderer sandbox etkin
- Ana pencere, Hızlı Not ve Kurtarma için sınırlı preload köprüleri
- Yetkili IPC çağrılarında pencere/frame ve yerel renderer URL doğrulaması
- Yönetilen dosya işlemlerinde canonical path doğrulaması
- Junction/symlink/reparse-point üzerinden depolama kökü dışına çıkışın engellenmesi
- `_Veloria` sistem/yedek dizininin normal dosya işlemlerinden korunması
- Zengin metinde izin listeli HTML temizleme
- CSP ile uzak script, nesne, form ve ağ bağlantılarının engellenmesi
- Dosya taşıma/kopyalamada boyut + SHA-256 doğrulaması
- ZIP/TAR önizlemede yol normalizasyonu ve boyut sınırları
- Kurulum indirmelerinde SHA-256 doğrulaması

Güvenlik açığı bildirmek için [SECURITY.md](SECURITY.md) dosyasına bak.

## Testler

Test paketi dosya sistemi ve arşiv katmanındaki kritik davranışları kapsar; örneğin:

- path traversal engelleme
- symlink/junction kaçış engelleme
- güvenli dosya adı üretimi
- SHA-256 doğrulamalı kopyalama
- atomik durum yazımı
- `_Veloria` dizininin indeks dışında tutulması
- dosya sürümleme ve geri yükleme
- çöp kutusuna taşıma/geri getirme
- arşiv ve klasör listeleme

Çalıştırmak için:

```bash
cd app
npm test
```

## Proje yapısı

```text
Veloria-Notes/
├─ app/
│  ├─ main.js
│  ├─ preload.js
│  ├─ recovery-preload.js
│  ├─ quick-preload.js
│  ├─ renderer.js
│  ├─ file-service.js
│  ├─ archive-service.js
│  ├─ index.html
│  ├─ recovery.html
│  ├─ recovery.js
│  ├─ quick-capture.html
│  ├─ quick-capture.js
│  ├─ tests/
│  └─ package.json
├─ installer/
│  ├─ bootstrap/
│  └─ build-web-installer.ps1
├─ KUR_VELORIA_NOTES.bat
├─ _kurulum.ps1
├─ VELORIA_UPDATE_ENGINE.ps1
├─ CHANGELOG.md
├─ SECURITY.md
├─ CONTRIBUTING.md
├─ THIRD_PARTY_NOTICES.md
└─ LICENSE
```

## Katkı

Katkı kuralları için [CONTRIBUTING.md](CONTRIBUTING.md) dosyasına bak. Pull request göndermeden önce `npm run validate` çalıştırılması önerilir.

## Lisans

Veloria Notes, [MIT Lisansı](LICENSE) ile açık kaynak olarak yayımlanır. Üçüncü taraf bileşenlerin lisansları kendi koşullarına tabidir; ayrıntılar için [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) dosyasına bak.
