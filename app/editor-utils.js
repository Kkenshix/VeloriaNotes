'use strict';

// Shared by the sandboxed renderer and the Node regression tests.
((root) => {
  const escapeHtml = (text) => String(text).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  function linkUrl(text) {
    const value = String(text || '').trim();
    if (!value || /[\s<>"\x00-\x1f]/.test(value)) return '';
    try {
      const url = new URL(/^(https?:\/\/|mailto:)/i.test(value) ? value : `https://${value}`);
      if (url.protocol === 'mailto:') return url.pathname.includes('@') ? url.href : '';
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return '';
      return url.href;
    } catch { return ''; }
  }

  function findLinks(text) {
    // Do not turn domains inside e-mail addresses or file paths into web links.
    const pattern = /(?:https?:\/\/|www\.)[^\s<>"\x00-\x1f]+|[\p{L}\p{N}](?:[\p{L}\p{N}-]*\.)+[\p{L}]{2,63}(?::\d+)?(?:\/[^\s<>"\x00-\x1f]*)?/giu;
    const links = [];
    for (const match of String(text).matchAll(pattern)) {
      const previous = text[match.index - 1] || '';
      if (/[\p{L}\p{N}_@/\\.:-]/u.test(previous)) continue;
      let label = match[0].replace(/[.,;:!?…'’”]+$/u, '');
      for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']]) {
        while (label.endsWith(close) && label.split(close).length > label.split(open).length) label = label.slice(0, -1);
      }
      const href = linkUrl(label);
      if (href) links.push({ start: match.index, end: match.index + label.length, label, href });
    }
    return links;
  }

  function textToHtml(text) {
    const source = String(text || '').replace(/\r\n?/g, '\n');
    let html = '', cursor = 0;
    for (const link of findLinks(source)) {
      html += escapeHtml(source.slice(cursor, link.start));
      html += `<a href="${escapeHtml(link.href)}" data-veloria-auto-link="1" rel="noopener noreferrer">${escapeHtml(link.label)}</a>`;
      cursor = link.end;
    }
    return (html + escapeHtml(source.slice(cursor))).replace(/\n/g, '<br>');
  }

  const api = { linkUrl, findLinks, textToHtml };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VeloriaEditor = api;
})(globalThis);
