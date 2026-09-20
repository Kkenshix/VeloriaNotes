'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const fsp = fs.promises;
const zlib = require('node:zlib');
const { listArchiveEntries, readArchiveEntry, listDirectoryEntries } = require('../archive-service');

async function tempDir(t) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'veloria-archive-test-'));
  t.after(() => fsp.rm(dir, { recursive: true, force: true }));
  return dir;
}

test('klasör listesi dosya ve alt klasörleri döndürür', async (t) => {
  const root = await tempDir(t);
  await fsp.mkdir(path.join(root, 'alt'));
  await fsp.writeFile(path.join(root, 'a.txt'), 'a');
  await fsp.writeFile(path.join(root, 'alt', 'b.txt'), 'bb');
  const result = await listDirectoryEntries(root);
  assert.equal(result.format, 'folder');
  assert.equal(result.entries.some((x) => x.path === 'a.txt' && !x.isDirectory), true);
  assert.equal(result.entries.some((x) => x.path.replace(/\\/g, '/') === 'alt/b.txt'), true);
});

test('klasör listesi sembolik bağlantıları takip etmez', async (t) => {
  const root = await tempDir(t);
  const outside = await tempDir(t);
  await fsp.writeFile(path.join(outside, 'secret.txt'), 'secret');
  try {
    await fsp.symlink(outside, path.join(root, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(error.code)) return;
    throw error;
  }
  const result = await listDirectoryEntries(root);
  assert.equal(result.entries.some((x) => x.name === 'link' || x.name === 'secret.txt'), false);
});

test('GZ arşivi listelenir ve içeriği okunur', async (t) => {
  const root = await tempDir(t);
  const gz = path.join(root, 'not.txt.gz');
  await fsp.writeFile(gz, zlib.gzipSync(Buffer.from('Veloria Notes', 'utf8')));
  const list = await listArchiveEntries(gz);
  assert.equal(list.format, 'gz');
  assert.equal(list.entries.length, 1);
  assert.equal(list.entries[0].path, 'not.txt');
  const entry = await readArchiveEntry(gz, 'not.txt');
  assert.equal(entry.data.toString('utf8'), 'Veloria Notes');
});

test('desteklenmeyen arşiv türü açık hata üretir', async (t) => {
  const root = await tempDir(t);
  const file = path.join(root, 'test.xyz');
  await fsp.writeFile(file, 'x');
  await assert.rejects(() => listArchiveEntries(file), /Desteklenmeyen arşiv türü/);
  await assert.rejects(() => readArchiveEntry(file, 'x'), /Desteklenmeyen arşiv türü/);
});
