import { Router } from 'express';
// @ts-ignore - repositório em JavaScript
import { StandardsRepository } from '../repositories/standardsRepository.js';

const router = Router();
const repo = new StandardsRepository();

/** Lista os documentos de padrões importados */
router.get('/', (_req, res) => {
  res.json({ documentos: repo.list() });
});

/** Importa um ou mais documentos gerados pelo extrator. Mesma página substitui a anterior. */
router.post('/', (req, res) => {
  const body = req.body;
  const raws = Array.isArray(body) ? body : Array.isArray(body?.documentos) ? body.documentos : [body];
  const ok: any[] = [];
  const errors: string[] = [];
  raws.forEach((raw: any, i: number) => {
    try {
      ok.push(repo.normalize(raw));
    } catch (e: any) {
      errors.push(`Arquivo ${i + 1}: ${e.message}`);
    }
  });
  if (ok.length === 0) {
    return res.status(400).json({ error: errors.join(' ') || 'Nenhum documento válido.' });
  }
  const documentos = repo.upsert(ok);
  console.log(`[Padroes] ${ok.length} documento(s) importado(s); total ${documentos.length}.`);
  res.json({ documentos, importados: ok.map((d) => d.title), erros: errors });
});

/** Remove um documento */
router.delete('/:id', (req, res) => {
  res.json({ documentos: repo.remove(String(req.params.id)) });
});

export default router;
