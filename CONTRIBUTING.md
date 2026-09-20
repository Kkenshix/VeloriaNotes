# Veloria Notes'a katkı

## Geliştirme ortamı

```bash
cd app
npm install
npm run validate
npm start
```

## Pull request öncesi

- Değişikliği mümkün olduğunca tek konuya odakla ve kullanıcıya etkisini açıkla.
- `app` dizininde `npm run validate` çalıştır.
- `node_modules`, üretilmiş EXE/MSI dosyaları, loglar, yerel yedekler veya `Veloria Dosyalar` içeriğini commit etme.
- Gerçek not içerikleri, kişisel dosya adları, erişim belirteçleri, parolalar, private key'ler veya bilgisayara özgü mutlak yollar ekleme.
- Ağ erişimi ekleniyorsa neden gerekli olduğunu belgelerle açıkla; varsayılan local-first davranışı koru.
- Dosya sistemi değişikliklerinde path traversal, symlink/junction/reparse point, overwrite, yarım kalan transfer ve recovery davranışlarını test et.
- Yeni IPC kanalı eklenirse yalnızca güvenilir ana renderer frame'inden çağrılabildiğini doğrula.

## Hata raporu

İyi bir hata raporu şu bilgileri içerir:

- Tekrarlanabilir adımlar
- Windows sürümü
- Veloria Notes sürümü
- Kurulum yöntemi: hazır EXE / kaynak kurucusu / geliştirme
- Beklenen ve gerçekleşen davranış

Log veya ekran görüntülerindeki kişisel not/dosya içeriklerini paylaşmadan önce temizle.
