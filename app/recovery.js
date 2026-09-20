'use strict';
const api = window.veloriaDesktop;
const states = document.getElementById('states');
const apps = document.getElementById('apps');
const status = document.getElementById('status');
const fmt = (value) => { try { return new Date(value).toLocaleString('tr-TR'); } catch { return ''; } };
const msg = (text) => { status.textContent = String(text || ''); };
function empty(text) { const div = document.createElement('div'); div.className = 'small'; div.textContent = text; return div; }
async function loadStateBackups() {
  const list = await api.listStateBackups();
  states.replaceChildren();
  if (!list.length) { states.appendChild(empty('Yedek yok.')); return; }
  for (const item of list) {
    const row = document.createElement('div'); row.className = 'row';
    const grow = document.createElement('div'); grow.className = 'grow';
    const title = document.createElement('b'); title.textContent = item.name;
    const meta = document.createElement('div'); meta.className = 'small'; meta.textContent = `${fmt(item.mtimeMs)} · ${Math.round(item.size / 1024)} KB`;
    const button = document.createElement('button'); button.className = 'btn primary'; button.textContent = 'Geri yükle';
    button.addEventListener('click', async () => {
      if (!confirm('Bu not yedeği geri yüklensin mi?')) return;
      const result = await api.restoreStateBackup(item.id);
      msg(result.ok ? 'Not yedeği geri yüklendi. Veloria Notes yeniden açıldığında kullanılacak.' : 'Geri yüklenemedi.');
    });
    grow.append(title, meta); row.append(grow, button); states.appendChild(row);
  }
}
async function loadAppBackups() {
  const list = await api.listAppBackups();
  apps.replaceChildren();
  if (!list.length) { apps.appendChild(empty('Önceki program sürümü yok.')); return; }
  for (const item of list) {
    const row = document.createElement('div'); row.className = 'row';
    const grow = document.createElement('div'); grow.className = 'grow';
    const title = document.createElement('b'); title.textContent = item.name;
    const meta = document.createElement('div'); meta.className = 'small'; meta.textContent = fmt(item.mtimeMs);
    const button = document.createElement('button'); button.className = 'btn'; button.textContent = 'Bu sürüme dön';
    button.addEventListener('click', async () => {
      if (!confirm('Veloria Notes program katmanı bu sürüme geri dönsün mü? Kurtarma penceresi kapanacak.')) return;
      msg('Geri alma başlatılıyor...');
      await api.rollbackApp(item.id);
    });
    grow.append(title, meta); row.append(grow, button); apps.appendChild(row);
  }
}
document.getElementById('refreshState').addEventListener('click', loadStateBackups);
document.getElementById('refreshApps').addEventListener('click', loadAppBackups);
document.getElementById('exportRecovery').addEventListener('click', async () => { const x = await api.exportRecovery(); msg(x.canceled ? 'İptal edildi.' : 'Kurtarma paketi oluşturuldu.'); });
document.getElementById('openBackups').addEventListener('click', () => api.openBackupFolder());
document.getElementById('openRoot').addEventListener('click', () => api.openRoot());
document.getElementById('openInstall').addEventListener('click', () => api.openInstallFolder());
document.getElementById('quit').addEventListener('click', () => api.quit());
loadStateBackups();
loadAppBackups();
