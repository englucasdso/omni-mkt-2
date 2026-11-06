import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'backend/data');
const INVENTORY_PATH = path.resolve(DATA_DIR, 'inventario.json');

export class InventoryRepository {
  getInventory() {
    if (!fs.existsSync(INVENTORY_PATH)) return [];
    try {
      const data = fs.readFileSync(INVENTORY_PATH, 'utf-8');
      const items = JSON.parse(data);
      return Array.isArray(items) ? items : [];
    } catch (e) {
      console.error('[InventoryRepository] Failed to read inventario.json:', e);
      return [];
    }
  }

  saveSafely(items) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('[InventoryRepository] Tentativa de salvar inventário vazio ou inválido rejeitada.');
    }

    // Validação mínima de estrutura: cada item deve possuir id e titulo
    const isValid = items.every(item => item && item.id && item.titulo);
    if (!isValid) {
      throw new Error('[InventoryRepository] Validação estrutural falhou: itens sem id ou titulo.');
    }

    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // Gravação atômica via arquivo temporário
    const tempPath = `${INVENTORY_PATH}.tmp.${Date.now()}`;
    fs.writeFileSync(tempPath, JSON.stringify(items, null, 2), 'utf-8');
    fs.renameSync(tempPath, INVENTORY_PATH);
    console.log(`[InventoryRepository] Salvo com sucesso e atomicamente: ${items.length} mapas no inventario.json`);
  }
}
