import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DATA_DIR = path.resolve(process.cwd(), 'backend/data');
const STANDARDS_PATH = path.resolve(DATA_DIR, 'padroes.json');
const BLOCK_TYPES = new Set(['heading', 'paragraph', 'list', 'code', 'table']);

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
    const blocks = raw.blocks.filter((b) => b && BLOCK_TYPES.has(b.type));
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
