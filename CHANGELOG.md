# Değişiklik Günlüğü

## 1.0 - 2026-09-20

### Değiştirildi
- Uygulamanın görünen adı **Veloria Notes** olarak güncellendi.
- Windows kurulum metinleri ve GitHub dokümantasyonu Türkçeleştirildi.
- Electron çalışma zamanı `44.4.3` kararlı yamasına güncellendi.
- Hazır tek tık Windows EXE üretimi için Electron Builder/NSIS yapılandırması eklendi.
- Kaynak kurucunun başlangıç ekranı **VELORIA NOTES**, sürüm ve geliştirici bilgileriyle yenilendi.
- Normal uygulama, Hızlı Not ve Kurtarma pencerelerinin yetki sınırları birbirinden ayrıldı.
- GitHub Actions akışı tam NSIS kurulumunu, küçük web kurucusunu ve SHA-256 özetlerini üretecek şekilde düzenlendi.

### Eklendi
- `VELORIA_UPDATE_ENGINE.ps1` güvenli uygulama katmanı güncelleme/geri alma motoru.
- Ayrı ve en az yetkili `recovery-preload.js` köprüsü.
- Küçük Windows web kurucusu (`installer/bootstrap`) ve otomatik üretim betiği.
- `SUPPORT.md`, Türkçe issue/PR şablonları ve Dependabot yapılandırması.
- Dosya sistemi ve arşiv katmanı için **18 otomatik test**.

### Düzeltildi
- Windows PowerShell 5.1 üzerinde Türkçe karakterlerin `ÅŸ/Ã¼` gibi bozulmasına neden olan UTF-8/BOM uyumsuzluğu giderildi.
- Kurulum başlığındaki ASCII **VELORIA NOTES** logosu sabit genişlikte yeniden hizalandı; sürüm ve geliştirici satırları sadeleştirildi.
- Kurulum tamamlandıktan sonra kurulu `Veloria Notes.exe` artık kurucunun CMD/terminal işlem ağacından bağımsız başlatılıyor; kurulum penceresi kapanınca uygulama kapanmıyor.
- Kullanıcıya görünen sürüm numarası **v1.0** olarak standardize edildi.
- Silinmiş/eski görsel yolları önizlenirken oluşan `ENOENT` IPC hata yığınları normal “dosya eksik” durumuna çevrildi; aynı eksik ek için tekrarlı önizleme istekleri durduruldu.
- Güncelleme/geri alma ekranının beklediği updater dosyasının kaynak ve paketlenmiş kurulumda bulunması sağlandı.
- Kurtarma modu ayrı bir kopya EXE yerine aynı Veloria Notes EXE'sini `--recovery` ile kullanacak şekilde düzenlendi.
- Dosya kökü denetimleri symlink/junction/reparse-point kaçışlarına karşı canonical path kontrolüyle güçlendirildi.
- Yetkili IPC çağrılarına pencere, ana frame ve yerel renderer URL doğrulaması eklendi.
- Electron renderer sandbox etkinleştirildi.
- HTML sayfalarına CSP eklendi ve kaydedilmiş zengin metin için izin listeli temizleme katmanı eklendi.
- Kurtarma ve Hızlı Not sayfalarındaki inline JavaScript ayrı dosyalara taşındı.
- `_Veloria` koruması Windows üzerinde büyük/küçük harf farklılıklarına karşı güçlendirildi.
- Windows sağ tık/protokol entegrasyonu yeni **Veloria Notes** adı ve kurulum yolu ile güncellendi.

### Güvenlik ve test
- Path traversal, güvenli Windows dosya adı, symlink/junction kaçışı, SHA-256 doğrulamalı kopyalama, atomik yazım, sürümleme, çöp kutusu, dizin listeleme ve GZ/arşiv davranışları test kapsamına alındı.
- `contextIsolation`, sandbox, sınırlı preload API'leri, IPC sender doğrulaması ve CSP birlikte uygulanıyor.
