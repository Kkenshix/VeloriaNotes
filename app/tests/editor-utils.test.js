'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { findLinks, textToHtml, linkUrl } = require('../editor-utils');

test('üç satır ve bilinçli boş satırlar paragraf eklenmeden korunur', () => {
  assert.equal(textToHtml('bir\r\niki\rüç'), 'bir<br>iki<br>üç');
  assert.equal(textToHtml('\nbir\n\niki\n'), '<br>bir<br><br>iki<br>');
  assert.equal(textToHtml(''), '');
});
test('Markdown işaretleri düz metin olarak kalır, HTML çalıştırılamaz', () => {
  assert.equal(textToHtml('+ metin\n- ikinci\n# başlık\n<script>x</script>'), '+ metin<br>- ikinci<br># başlık<br>&lt;script&gt;x&lt;/script&gt;');
});
test('https, www ve alan adları güvenli bağlantı olur', () => {
  const links = findLinks('https://example.com/a?q=1&b=2 www.google.com veloria.com');
  assert.deepEqual(links.map(x => x.href), ['https://example.com/a?q=1&b=2', 'https://www.google.com/', 'https://veloria.com/']);
  assert.ok(textToHtml('https://example.com/?a=1&b=2').includes('?a=1&amp;b=2'));
});
test('cümle noktalaması linkin dışında, dengeli parantez linkte kalır', () => {
  assert.equal(findLinks('(https://example.com/a_(b)).')[0].label, 'https://example.com/a_(b)');
  assert.equal(findLinks('example.com,')[0].label, 'example.com');
});
test('e-posta, dosya yolu ve tehlikeli protokoller web bağlantısı yapılmaz', () => {
  assert.deepEqual(findLinks('a@example.com C:\\notes\\file.txt /tmp/test.txt javascript:alert(1)'), []);
  assert.equal(linkUrl('javascript:alert(1)'), '');
  assert.equal(linkUrl('https://user:password@example.com'), '');
});
