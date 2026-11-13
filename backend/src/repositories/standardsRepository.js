import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DATA_DIR = path.resolve(process.cwd(), 'backend/data');
const STANDARDS_PATH = path.resolve(DATA_DIR, 'padroes.json');
const BLOCK_TYPES = new Set(['heading', 'paragraph', 'list', 'code', 'table']);

// Botões do bloco de código do Confluence que versões antigas do extrator liam como conteúdo.
// A mesma lista existe no frontend (domain/padroes/sanitize.ts).
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
const cleanText = (t) =>
  String(t ?? '')
    .split('\n')
    .filter((l) => !TOOLBAR_LABELS.has(l.trim().toLowerCase()))
    .join('\n')
    .trim();
function cleanBlock(b) {
  if (b.type === 'table') {
    return {
      ...b,
      section: String(b.section || ''),
      headers: (b.headers || []).map(cleanText),
      rows: (b.rows || []).map((r) => (Array.isArray(r) ? r.map(cleanText) : [])),
    };
  }
  if (b.type === 'code') return { ...b, title: cleanText(b.title), text: cleanText(b.text) };
  if (b.type === 'paragraph') return { ...b, text: cleanText(b.text) };
  if (b.type === 'list') return { ...b, items: (b.items || []).map(cleanText).filter(Boolean) };
  return b;
}

/** Documentos de padrões importados pelo extrator (bookmarklet). Fora do Git. */
export class StandardsRepository {
  list() {
    if (!fs.existsSync(STANDARDS_PATH)) return [];
    try {
      const data = JSON.parse(fs.readFileSync(STANDARDS_PATH, 'utf-8'));
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.error('[StandardsRepository] Falha ao ler padroes.json:', e.message);
      return [];
    }
  }

  /** Confere o formato e devolve o documento pronto para salvar, ou lança erro com o motivo */
  normalize(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('Arquivo sem conteúdo.');
    if (raw.source !== 'confluence' || raw.version !== 1) {
      throw new Error('Este arquivo não veio do extrator do OMNI.');
    }
    const title = String(raw.title || '').trim();
    if (!title) throw new Error('O documento não tem título.');
    if (!Array.isArray(raw.blocks)) throw new Error('O documento não tem conteúdo (blocks).');
    const blocks = raw.blocks
      .filter((b) => b && BLOCK_TYPES.has(b.type))
      .map(cleanBlock)
      .filter((b) => (b.type === 'paragraph' || b.type === 'code' ? b.text : b.type === 'list' ? b.items.length : true));
    const url = String(raw.url || '').trim();
    const id = crypto.createHash('sha256').update(url || title).digest('hex').slice(0, 12);
    const meta = {};
    if (raw.meta && typeof raw.meta === 'object') {
      for (const [k, v] of Object.entries(raw.meta)) meta[String(k)] = String(v ?? '');
    }
    return {
      id,
      source: 'confluence',
      version: 1,
      title,
      url,
      extractedAt: String(raw.extractedAt || ''),
      importedAt: new Date().toISOString(),
      meta,
      blocks,
    };
  }

  /** Inclui ou substitui (mesma página = mesmo id). Devolve a lista nova. */
  upsert(docs) {
    const current = this.list();
    const byId = new Map(current.map((d) => [d.id, d]));
    for (const d of docs) byId.set(d.id, d);
    const next = Array.from(byId.values()).sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
    this.save(next);
    return next;
  }

  /** Troca um documento por outro (botão de substituir): tira o antigo e grava o novo */
  replace(oldId, doc) {
    const rest = this.list().filter((d) => d.id !== oldId && d.id !== doc.id);
    const next = [...rest, doc].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
    this.save(next);
    return next;
  }

  remove(id) {
    const next = this.list().filter((d) => d.id !== id);
    this.save(next);
    return next;
  }

  save(docs) {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const tempPath = `${STANDARDS_PATH}.tmp.${Date.now()}`;
    fs.writeFileSync(tempPath, JSON.stringify(docs, null, 2), 'utf-8');
    fs.renameSync(tempPath, STANDARDS_PATH);
  }
}
