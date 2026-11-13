/**
 * Limpeza dos documentos de padrões.
 *
 * O Confluence coloca botões dentro dos blocos de código ("Copiar como texto",
 * "Ativar quebra automática de texto"). Versões antigas do extrator liam esses
 * botões como se fossem conteúdo. Aqui eles saem, inclusive de documentos já
 * importados. A mesma lista existe no servidor (standardsRepository.js).
 */
import { StandardBlock, StandardDoc } from './types';

const TOOLBAR_LABELS = new Set(
  [
    'Ativar quebra automática de texto',
    'Desativar quebra automática de texto',
    'Copiar como texto',
    'Copiar',
    'Copy as text',
    'Copy',
    'Toggle line wrapping',
    'Expandir código-fonte',
    'Recolher código-fonte',
    'Expand source',
    'Collapse source',
  ].map((s) => s.toLowerCase())
);

const isToolbarLine = (line: string) => TOOLBAR_LABELS.has(line.trim().toLowerCase());

export function cleanText(text: string): string {
  return String(text || '')
    .split('\n')
    .filter((l) => !isToolbarLine(l))
    .join('\n')
    .trim();
}

function cleanBlock(b: StandardBlock): StandardBlock | null {
  switch (b.type) {
    case 'code': {
      const text = String(b.text || '')
        .split('\n')
        .filter((l) => !isToolbarLine(l))
        .join('\n')
        .replace(/^\n+|\s+$/g, '');
      return text ? { ...b, title: isToolbarLine(b.title || '') ? '' : b.title, text } : null;
    }
    case 'table':
      return { ...b, headers: b.headers.map(cleanText), rows: b.rows.map((r) => r.map(cleanText)) };
    case 'paragraph': {
      const text = cleanText(b.text);
      return text ? { ...b, text } : null;
    }
    case 'list': {
      const items = b.items.map(cleanText).filter(Boolean);
      return items.length ? { ...b, items } : null;
    }
    default:
      return b;
  }
}

export function sanitizeStandardDoc(doc: StandardDoc): StandardDoc {
  return { ...doc, blocks: (doc.blocks || []).map(cleanBlock).filter(Boolean) as StandardBlock[] };
}

/** Título sem o prefixo comum "[Padrões & Taxonomia] - " */
export function shortDocTitle(title: string): string {
  return String(title || '').replace(/^\s*\[[^\]]*\]\s*[-–—]\s*/, '').trim() || title;
}
