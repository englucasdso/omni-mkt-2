/**
 * Extrator de padrões (bookmarklet).
 *
 * Roda na página do Confluence, no navegador da pessoa, com o login dela.
 * Lê o conteúdo na ordem (títulos, textos, listas, blocos de código e tabelas),
 * separa a tabela de cabeçalho da página, ignora o Sumário e baixa um .json
 * para ser importado na Base de padrões do OMNI. Não envia nada para lugar nenhum.
 *
 * Fica como texto (e não como função TypeScript) para o build não alterar o código.
 */
export const EXTRACTOR_SOURCE = String.raw`(function () {
  var clean = function (s) { return String(s || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim(); };
  var text = function (el) { return clean(el.innerText || el.textContent || ''); };
  var root = document.querySelector('#main-content') || document.querySelector('.wiki-content') || document.body;
  var titleEl = document.querySelector('#title-text') || document.querySelector('h1#title-heading') || document.querySelector('[data-testid="title-text"]');
  var title = clean(titleEl ? titleEl.innerText : document.title.replace(/\s*-\s*[^-]*Confluence.*$/i, ''));
  var META_KEYS = /^(c[oó]digo do documento|data da cria[cç][aã]o|criado por|data da revis[aã]o|revisado por|pr[oó]xima revis[aã]o|aprovado por|status do documento|task|vers[aã]o|respons[aá]vel)$/i;
  var meta = {};
  var blocks = [];
  var lastHeading = '';
  var isMetaTable = function (t) {
    var rows = Array.prototype.slice.call(t.rows || []);
    var hits = rows.filter(function (r) { return r.cells.length === 2 && META_KEYS.test(text(r.cells[0])); }).length;
    return hits >= 3;
  };
  var inSkipped = function (el) {
    return !!el.closest('.toc-macro, [data-macro-name="toc"], .client-side-toc-macro, nav, #likes-and-labels-container, #comments-section');
  };
  var codeTitle = function (el) {
    var panel = el.closest('[data-macro-name="code"], .code.panel, .codeContent');
    var holder = panel && (panel.closest('[data-macro-name="code"], .code.panel') || panel);
    var head = holder && holder.querySelector('.codeHeader, .panelHeader');
    if (head && text(head)) return text(head);
    var node = el;
    for (var i = 0; i < 4 && node && node !== root; i++) {
      var prev = node.previousElementSibling;
      if (prev) { var t = text(prev); if (t && t.length <= 80 && t.indexOf('\n') < 0) return t; }
      node = node.parentElement;
    }
    return '';
  };
  /* Botões do Confluence (ex.: "Copiar como texto") não são conteúdo: ficam escondidos durante a leitura */
  var hidden = Array.prototype.map.call(root.querySelectorAll('button, [role="button"]'), function (b) {
    var prev = b.style.display; b.style.display = 'none'; return [b, prev];
  });
  var nodes = root.querySelectorAll('h1,h2,h3,h4,h5,h6,p,ul,ol,pre,table,code[class*="language-"]');
  Array.prototype.forEach.call(nodes, function (el) {
    if (inSkipped(el)) return;
    var tag = el.tagName.toLowerCase();
    if (tag === 'table') {
      if (el.parentElement && el.parentElement.closest('table')) return;
      if (isMetaTable(el)) {
        Array.prototype.forEach.call(el.rows, function (r) { if (r.cells.length === 2) meta[text(r.cells[0])] = text(r.cells[1]); });
        return;
      }
      var rows = Array.prototype.slice.call(el.rows).map(function (r) {
        return Array.prototype.map.call(r.cells, function (c) { return text(c); });
      }).filter(function (r) { return r.some(function (c) { return c; }); });
      if (!rows.length) return;
      var first = el.rows[0];
      var hasHeader = !!(el.tHead && el.tHead.rows.length) || (first && Array.prototype.every.call(first.cells, function (c) { return c.tagName === 'TH'; }));
      blocks.push({ type: 'table', section: lastHeading, headers: hasHeader ? rows[0] : [], rows: hasHeader ? rows.slice(1) : rows });
      return;
    }
    if (el.closest('table')) return;
    if (tag === 'pre' || tag === 'code') {
      if (tag === 'code' && el.closest('pre')) return;
      if (tag === 'pre' && el.parentElement && el.parentElement.closest('pre')) return;
      var codeEl = tag === 'pre' ? (el.querySelector('code') || el) : el;
      var lang = ((codeEl.className || '').match(/language-([\w-]+)/) || el.className.match(/brush:\s*([\w-]+)/) || [])[1] || '';
      var code = String(el.textContent || '').replace(/\u00a0/g, ' ').replace(/\s+$/, '');
      if (code.trim()) blocks.push({ type: 'code', title: codeTitle(el), language: lang, text: code });
      return;
    }
    if (el.closest('pre')) return;
    if (/^h[1-6]$/.test(tag)) {
      var h = text(el);
      if (h) { lastHeading = h; blocks.push({ type: 'heading', level: Number(tag[1]), text: h }); }
      return;
    }
    if (tag === 'ul' || tag === 'ol') {
      if (el.parentElement && el.parentElement.closest('ul,ol')) return;
      var items = Array.prototype.map.call(el.querySelectorAll(':scope > li'), function (li) { return text(li); }).filter(Boolean);
      if (items.length) blocks.push({ type: 'list', items: items });
      return;
    }
    if (tag === 'p') {
      if (el.closest('li')) return;
      var p = text(el);
      if (p) blocks.push({ type: 'paragraph', text: p });
    }
  });
  hidden.forEach(function (h) { h[0].style.display = h[1]; });
  var doc = { source: 'confluence', version: 1, title: title, url: location.href.split('#')[0], extractedAt: new Date().toISOString(), meta: meta, blocks: blocks };
  var tables = blocks.filter(function (b) { return b.type === 'table'; }).length;
  var codes = blocks.filter(function (b) { return b.type === 'code'; }).length;
  var slug = (title || 'pagina').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').replace(/^padroes-/, '').slice(0, 60);
  var name = 'padroes-' + slug + '.json';
  try {
    var blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    alert('OMNI: extraído "' + title + '"\n' + tables + ' tabelas, ' + codes + ' blocos de código, ' + blocks.length + ' blocos no total.\nArquivo: ' + name + '\nAgora importe esse arquivo na Base de padrões do OMNI.');
  } catch (e) {
    console.log(JSON.stringify(doc));
    alert('OMNI: não foi possível baixar o arquivo (' + e.message + '). O conteúdo foi colocado no Console (F12).');
  }
})();`;

/** Endereço do favorito: "javascript:" + código */
export const EXTRACTOR_BOOKMARKLET = 'javascript:' + encodeURIComponent(EXTRACTOR_SOURCE.replace(/\n\s*/g, ' '));
