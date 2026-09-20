# Güvenlik Politikası

## Güvenlik açığı bildirimi

Parola, anahtar, özel kullanıcı içeriği veya çalışır durumdaki exploit ayrıntılarını herkese açık bir issue içinde yayımlama.

Depoda GitHub Private Vulnerability Reporting açıksa güvenlik bildirimleri için onu kullan. Açık değilse exploit ayrıntısı veya kişisel veri içermeyen kısa bir issue açıp geliştiriciden özel iletişim kanalı iste.

## Hassas veriler

Veloria Notes local-first çalışır ve kullanıcının yönettiği yerel dosyalara erişebilir. Hata raporlarında gerçek çalışma alanı içeriği yalnızca kullanıcı açıkça temizlenmiş bir örnek paylaşmak istiyorsa bulunmalıdır.

## Uygulama güvenliği

- Renderer process sandbox etkin tutulur.
- Node entegrasyonu renderer'da kapalıdır.
- IPC göndericisi ve ana frame doğrulanır.
- Yönetilen dosya yollarında canonical path ve symlink/junction kontrolleri uygulanır.
- Zengin metin HTML'i izin listesiyle temizlenir.
- CSP uzaktaki script/nesne kaynaklarını engeller.

## Kurulum bütünlüğü

Kaynak kurucusu Electron arşivini Electron'un yayımladığı SHA-256 listesine göre doğrular. EXE metadata/simge işlemi için kullanılan `rcedit` v2.0.0 x64 ikilisi de sabitlenmiş SHA-256 değeriyle doğrulanır.
