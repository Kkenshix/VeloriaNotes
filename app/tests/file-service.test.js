'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const fsp = fs.promises;
const crypto = require('node:crypto');
const {
  safeRelative,
  sanitizeSegment,
  isInside,
  uniqueDestination,
  pageFolderFromMeta,
  copyFileVerified,
  moveFile,
  hashFile,
  writeAtomic,
  refreshManagedIndex,
  replaceManagedVersion,
  listManagedVersions,
  restoreManagedVersion,
  moveManagedToTrash,
  listTrash,
  restoreTrashItem
} = require('../file-service');

async function tempDir(t, prefix = 'veloria-test-') {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => fsp.rm(dir, { recursive: true, force: true }));
  return dir;
}

test('safeRelative path traversal girişlerini reddeder', () => {
  assert.equal(safeRelative('../kaçış'), '');
  assert.equal(safeRelative(path.join('klasör', '..', '..', 'kaçış')), '');
  assert.equal(safeRelative(path.join('klasör', 'dosya.txt')), path.join('klasör', 'dosya.txt'));
});

test('sanitizeSegment Windows için geçersiz ve ayrılmış adları temizler', () => {
  assert.equal(sanitizeSegment('CON'), '_CON');
  assert.equal(sanitizeSegment('not:1?.txt'), 'not_1_.txt');
  assert.equal(sanitizeSegment('   '), 'Dosya');
});

test('isInside normal alt yolları kabul eder ve üst dizine kaçışı reddeder', async (t) => {
  const root = await tempDir(t);
  const child = path.join(root, 'a', 'b.txt');
  await fsp.mkdir(path.dirname(child), { recursive: true });
  assert.equal(isInside(root, child), true);
  assert.equal(isInside(root, path.resolve(root, '..', 'kaçış.txt')), false);
});

test('isInside sembolik bağlantı üzerinden yönetilen kökün dışına çıkışı reddeder', async (t) => {
  const base = await tempDir(t);
  const root = path.join(base, 'root');
  const outside = path.join(base, 'outside');
  await fsp.mkdir(root);
  await fsp.mkdir(outside);
  const link = path.join(root, 'bağlantı');
  try {
    await fsp.symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(error.code)) return;
    throw error;
  }
  assert.equal(isInside(root, path.join(link, 'kaçış.txt')), false);
});

test('uniqueDestination var olan dosyayı ezmeden yeni ad üretir', async (t) => {
  const root = await tempDir(t);
  await fsp.writeFile(path.join(root, 'not.txt'), 'a');
  const out = await uniqueDestination(root, 'not.txt');
  assert.equal(path.basename(out), 'not (2).txt');
});

test('pageFolderFromMeta güvenli klasör ağacı üretir', () => {
  const rel = pageFolderFromMeta({ categoryPath: ['Proje:1', 'CON'], pageTitle: 'Not?*' });
  assert.equal(rel, path.join('Proje_1', '_CON', 'Not__'));
  assert.equal(path.isAbsolute(rel), false);
});

test('copyFileVerified içeriği ve SHA-256 değerini doğrular', async (t) => {
  const root = await tempDir(t);
  const src = path.join(root, 'src.bin');
  const dst = path.join(root, 'alt', 'dst.bin');
  const payload = crypto.randomBytes(128 * 1024);
  await fsp.writeFile(src, payload);
  const result = await copyFileVerified(src, dst);
  assert.equal(result.method, 'copy');
  assert.equal(result.sha256, crypto.createHash('sha256').update(payload).digest('hex'));
  assert.deepEqual(await fsp.readFile(dst), payload);
  assert.equal(fs.existsSync(src), true);
});

test('moveFile dosyayı hedefe taşır ve kaynağı kaldırır', async (t) => {
  const root = await tempDir(t);
  const src = path.join(root, 'src.txt');
  const dst = path.join(root, 'alt', 'dst.txt');
  await fsp.writeFile(src, 'veloria');
  const result = await moveFile(src, dst);
  assert.ok(['rename', 'copy-delete'].includes(result.method));
  assert.equal(fs.existsSync(src), false);
  assert.equal(await fsp.readFile(dst, 'utf8'), 'veloria');
});

test('hashFile standart SHA-256 ile aynı sonucu verir', async (t) => {
  const root = await tempDir(t);
  const file = path.join(root, 'hash.txt');
  await fsp.writeFile(file, 'Veloria Notes');
  assert.equal(await hashFile(file), crypto.createHash('sha256').update('Veloria Notes').digest('hex'));
});

test('writeAtomic yeni içeriği atomik olarak değiştirir', async (t) => {
  const root = await tempDir(t);
  const file = path.join(root, 'state', 'data.json');
  await writeAtomic(file, '{"v":1}');
  await writeAtomic(file, '{"v":2}');
  assert.equal(await fsp.readFile(file, 'utf8'), '{"v":2}');
  const leftovers = (await fsp.readdir(path.dirname(file))).filter((name) => name.includes('.tmp-') || name.includes('.bak-'));
  assert.deepEqual(leftovers, []);
});

test('refreshManagedIndex _Veloria sistem klasörünü indekslemez', async (t) => {
  const root = await tempDir(t);
  const indexPath = path.join(root, '_Veloria', 'index.json');
  await fsp.mkdir(path.join(root, 'Kategori', 'Sayfa', 'Dosyalar'), { recursive: true });
  await fsp.mkdir(path.join(root, '_Veloria', 'Secret'), { recursive: true });
  await fsp.writeFile(path.join(root, 'Kategori', 'Sayfa', 'Dosyalar', 'a.txt'), 'a');
  await fsp.writeFile(path.join(root, '_Veloria', 'Secret', 'secret.txt'), 'secret');
  const index = await refreshManagedIndex({ roots: [root], indexPath });
  assert.equal(index.files.some((x) => x.name === 'a.txt'), true);
  assert.equal(index.files.some((x) => x.name === 'secret.txt'), false);
});

test('dosya sürümleme eski sürümü saklar ve geri yükleyebilir', async (t) => {
  const root = await tempDir(t);
  const managedDir = path.join(root, 'Kategori', 'Sayfa', 'Dosyalar');
  const current = path.join(managedDir, 'not.txt');
  const incoming = path.join(root, 'incoming.txt');
  const indexPath = path.join(root, '_Veloria', 'index.json');
  await fsp.mkdir(managedDir, { recursive: true });
  await fsp.writeFile(current, 'eski');
  await fsp.writeFile(incoming, 'yeni');
  await refreshManagedIndex({ roots: [root], indexPath });
  const replaced = await replaceManagedVersion({ filePath: current, replacementPath: incoming, roots: [root], indexPath });
  assert.equal(replaced.versionCreated, true);
  assert.equal(await fsp.readFile(current, 'utf8'), 'yeni');
  const versions = await listManagedVersions({ filePath: current, roots: [root] });
  assert.equal(versions.length, 1);
  await restoreManagedVersion({ filePath: current, versionId: versions[0].id, roots: [root], indexPath });
  assert.equal(await fsp.readFile(current, 'utf8'), 'eski');
});

test('aynı içerikle sürümleme gereksiz sürüm oluşturmaz', async (t) => {
  const root = await tempDir(t);
  const managedDir = path.join(root, 'Kategori', 'Sayfa', 'Dosyalar');
  const current = path.join(managedDir, 'not.txt');
  const incoming = path.join(root, 'incoming.txt');
  const indexPath = path.join(root, '_Veloria', 'index.json');
  await fsp.mkdir(managedDir, { recursive: true });
  await fsp.writeFile(current, 'aynı');
  await fsp.writeFile(incoming, 'aynı');
  await refreshManagedIndex({ roots: [root], indexPath });
  const result = await replaceManagedVersion({ filePath: current, replacementPath: incoming, roots: [root], indexPath });
  assert.equal(result.unchanged, true);
  assert.equal((await listManagedVersions({ filePath: current, roots: [root] })).length, 0);
});

test('çöp kutusuna taşıma ve geri yükleme dosya yaşam döngüsünü korur', async (t) => {
  const root = await tempDir(t);
  const managedDir = path.join(root, 'Kategori', 'Sayfa', 'Dosyalar');
  const current = path.join(managedDir, 'sil.txt');
  const indexPath = path.join(root, '_Veloria', 'index.json');
  const trashIndexPath = path.join(root, '_Veloria', 'trash.json');
  await fsp.mkdir(managedDir, { recursive: true });
  await fsp.writeFile(current, 'geri getir');
  await refreshManagedIndex({ roots: [root], indexPath });
  const item = await moveManagedToTrash({ filePath: current, roots: [root], trashIndexPath, indexPath });
  assert.equal(fs.existsSync(current), false);
  assert.equal((await listTrash(trashIndexPath)).length, 1);
  const restored = await restoreTrashItem({ id: item.id, trashIndexPath, roots: [root], indexPath });
  assert.equal(await fsp.readFile(restored.restoredPath, 'utf8'), 'geri getir');
  assert.equal((await listTrash(trashIndexPath)).length, 0);
});
