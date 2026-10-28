'use strict';

// Runs the real desktop UI against disposable data, never the user's desktop.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { _electron } = require('playwright');
const appDir = path.resolve(__dirname, '..');

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'veloria-ui-'));
  const system = path.join(root, '_Veloria');
  const data = path.join(system, 'local-data');
  await fs.mkdir(data, { recursive: true });
  const attachment = path.join(root, 'sample.txt');
  await fs.writeFile(attachment, 'original');
  const oldMirror = path.join(root, 'Genel', 'Eski', 'Dosyalar', 'Eski.txt');
  const conflict = path.join(root, 'Genel', 'Çakışma', 'Çakışma.txt');
  for (const file of [oldMirror, conflict]) await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(oldMirror, 'old');
  await fs.writeFile(conflict, 'DO NOT OVERWRITE');
  const category = { id: 'cat', name: 'Genel', parentId: null, order: 0 };
  const note = (id, title, html = '') => ({ id, title, categoryId: 'cat', order: 0, blocks: [{ id: `${id}-block`, type: 'richtext', html }] });
  const notes = [note('a', 'Birinci'), note('b', 'İkinci'), note('old', 'Eski'), note('collision', 'Çakışma'),
    note('file', 'Dosya Eki', `<span class="v692-inline-file" contenteditable="false" data-veloria-inline-file="1" data-native-path="${attachment}" data-name="sample.txt" data-kind="file"><span>sample.txt</span></span> `)];
  const state = { schema: 68, workspaceSystem: { activeId: 'ws', items: [{ id: 'ws', name: 'Test', categories: [category], pages: notes }] }, categories: [category], pages: notes };
  await fs.writeFile(path.join(data, 'veloria-state.json'), JSON.stringify(state));
  await fs.writeFile(path.join(system, 'veloria-native.json'), JSON.stringify({ noteFiles: { old: oldMirror } }));
  let app, win, originalClipboard;
  const errors = [], checks = [];
  const start = async () => {
    app = await _electron.launch({ executablePath: require('electron'), args: [appDir], env: { ...process.env, VELORIA_DEV_DATA_ROOT: root } });
    win = await app.firstWindow();
    win.on('pageerror', e => errors.push(e.message));
    await win.locator('.page-row').first().waitFor();
  };
  const open = async title => { await win.locator('.page-row .row-main').filter({ hasText: title }).dblclick(); return win.locator('[data-edit="rich"]').first(); };
  const paste = async (area, text) => { await app.evaluate(({ clipboard }, value) => clipboard.writeText(value), text); await area.press('Control+v'); };
  const closeWindow = async () => { const closed = win.waitForEvent('close'); await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close()); await closed; await app.close().catch(() => {}); app = null; };
  try {
    await start();
    originalClipboard = await app.evaluate(({ clipboard }) => clipboard.readText());
    assert.equal(await win.locator('.tab').count(), 0);
    let rich = await open('Birinci');
    await rich.click(); await win.keyboard.type('metin +'); await rich.press('Space'); await rich.press('Enter'); await win.keyboard.type('+'); await rich.press('Space'); await win.keyboard.type('ikinci');
    assert.equal(await rich.innerText(), 'metin + \n+ ikinci');
    assert.equal(await rich.locator('ul,ol').count(), 0); checks.push('literal typing');
    await rich.press('Control+a'); await paste(rich, 'bir\niki\nüç');
    assert.equal(await rich.innerText(), 'bir\niki\nüç'); checks.push('three-line paste');
    await rich.press('Control+z'); assert.equal(await rich.innerText(), 'metin + \n+ ikinci');
    await rich.press('Control+y'); assert.equal(await rich.innerText(), 'bir\niki\nüç'); checks.push('paste undo and redo');
    await rich.press('End'); await rich.press('Enter'); await paste(rich, 'alfa\nbeta\ngama');
    assert.equal(await rich.innerText(), 'bir\niki\nüç\nalfa\nbeta\ngama'); checks.push('paste after Enter');
    await rich.press('Control+a'); await paste(rich, '\nbir\n\niki\n');
    assert.equal(await rich.innerText(), '\nbir\n\niki\n'); checks.push('intentional blank lines');
    await rich.press('Control+a'); await win.keyboard.type('https://example.com');
    assert.equal(await rich.locator('a').getAttribute('href'), 'https://example.com/');
    await rich.press('Enter'); await win.keyboard.type('ikinci satir');
    assert.equal(await rich.innerText(), 'https://example.com\nikinci satir'); checks.push('typed link and next line');
    await app.evaluate(({ shell }) => { global.uiLinks = []; global.originalOpenExternal = shell.openExternal; shell.openExternal = async url => { global.uiLinks.push(url); }; });
    await rich.locator('a').click(); assert.deepEqual(await app.evaluate(() => global.uiLinks), ['https://example.com/']); checks.push('single click external dispatch');
    await rich.click(); await rich.press('Control+a'); await paste(rich, 'www.google.com veloria.com');
    assert.equal(await rich.locator('a').count(), 2); checks.push('pasted domain links');
    await rich.press('Home'); await rich.press('ArrowRight'); await win.keyboard.type('X'); await rich.press('Control+z');
    assert.equal(await rich.evaluate(() => getSelection().anchorOffset), 1); checks.push('undo caret');
    await open('İkinci'); await win.locator('.folder-row .row-main').first().dblclick();
    assert.equal(await win.locator('.tab').count(), 3);
    await win.locator('.tab').nth(1).click({ button: 'right' }); await win.getByRole('button', { name: 'Sağdaki sekmeleri kapat', exact: true }).click();
    assert.equal(await win.locator('.tab').count(), 2);
    await win.locator('.tab').last().click({ button: 'right' }); await win.getByRole('button', { name: 'Soldaki sekmeleri kapat', exact: true }).click();
    assert.equal(await win.locator('.tab').count(), 1); checks.push('left and right tab closure');
    await open('Birinci'); await win.locator('.tab').last().click({ button: 'right' }); await win.getByRole('button', { name: 'Diğer sekmeleri kapat', exact: true }).click();
    assert.equal(await win.locator('.tab').count(), 1);
    await win.locator('.tab').first().click({ button: 'middle' }); assert.equal(await win.locator('.tab').count(), 0); checks.push('other and middle-click closure');
    rich = await open('Dosya Eki');
    assert.equal(await rich.locator('[data-veloria-inline-file]').getAttribute('data-native-path'), attachment);
    await rich.click(); await rich.press('End'); await win.keyboard.type(' ek');
    await rich.locator('[data-veloria-inline-file]').dblclick();
    const code = win.locator('#codeArea'); await code.waitFor(); await code.click(); await code.press('End'); await win.keyboard.type('(');
    assert.equal(await code.inputValue(), 'original()'); await code.press('Control+z'); assert.equal(await code.inputValue(), 'original'); await code.press('Control+y'); assert.equal(await code.inputValue(), 'original()'); checks.push('text-file custom edit undo and redo');
    rich = await open('Eski'); await rich.click(); await win.keyboard.type('legacy updated');
    rich = await open('Çakışma'); await rich.click(); await win.keyboard.type('new mirror');
    rich = await open('Birinci'); await rich.click(); await rich.press('End'); await win.keyboard.type(' CLOSE-FLUSH');
    await closeWindow();
    const disk = JSON.parse(await fs.readFile(path.join(data, 'veloria-state.json'), 'utf8'));
    assert.ok(disk.pages.find(p => p.id === 'a').blocks[0].html.includes('CLOSE-FLUSH')); checks.push('immediate-close save');
    assert.equal(await fs.readFile(conflict, 'utf8'), 'DO NOT OVERWRITE');
    const config = JSON.parse(await fs.readFile(path.join(system, 'veloria-native.json'), 'utf8'));
    assert.equal(config.noteFiles.old, oldMirror); assert.ok((await fs.readFile(oldMirror, 'utf8')).includes('legacy updated'));
    assert.equal(path.basename(path.dirname(config.noteFiles.collision)), 'Çakışma');
    assert.notEqual(config.noteFiles.collision, conflict); checks.push('flat layout, legacy paths and collision preservation');
    await start(); assert.equal(await win.locator('.tab').count(), 0); checks.push('restart with closed tabs');
    rich = await open('Dosya Eki'); assert.equal(await rich.locator('[data-veloria-inline-file]').getAttribute('data-native-path'), attachment); checks.push('attachment persistence');
    await win.emulateMedia({ reducedMotion: 'reduce' }); await open('İkinci');
    assert.equal(await win.locator('#content').evaluate(n => n.firstElementChild.getAnimations().filter(a => a.playState === 'running').length), 0); checks.push('reduced motion');
    assert.deepEqual(errors, []);
    await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), originalClipboard);
    await closeWindow();
    console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
  } finally {
    if (app) { if (originalClipboard !== undefined) await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), originalClipboard).catch(() => {}); await app.close().catch(() => {}); }
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
