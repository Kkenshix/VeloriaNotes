Veloria Notes 1.1.1, Ctrl+X ve çok satırlı yapıştırma sonrasında oluşan fazladan kelime/satır boşluklarını düzeltir.

- Kelime kesildiğinde yerinde tek boşluk kalır; iki yandaki boşluklar üst üste binmez.
- Kesilen metni aynı yere yapıştırmak ayırıcı boşlukları doğru geri ekler.
- Üç paragrafı kopyalamak veya kesip yapıştırmak satır aralıklarını çoğaltmaz.
- Dışarıdan gelen HTML/paragraf panosundaki fazladan satır ayırıcıları düzeltilir.
- Kesme ve boşluk düzeltmesi tek Ctrl+Z / Ctrl+Y adımıdır.
- Kod girintileri, bilinçli boş satırlar ve işlem yapılan yerin dışındaki boşluklar korunur.

Doğrulama: 23 otomatik test, 29 gerçek Electron arayüz senaryosu; on kez art arda kes/yapıştır, kelime aralığı, çok satırlı seçim, eski paragraf biçimi, dış HTML panosu ve geri/ileri alma kontrolleri.

`Veloria-Notes-Setup-1.1.1.exe` tam Windows kurulumudur. `Veloria-Notes-Source-1.1.1.zip` kaynak kurulumunu içerir. Dosya özetleri `SHA256SUMS.txt` içindedir.

Ayrıntılar: [CHANGELOG.md](https://github.com/Kkenshix/VeloriaNotes/blob/main/CHANGELOG.md).