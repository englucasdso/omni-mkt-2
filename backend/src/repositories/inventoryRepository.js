import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'backend/data');

/** Cada espaço tem o seu arquivo de inventário (padrão: inventario.json). */
export class InventoryRepository {
  constructor(fileName = 'inventario.json') {
    this.fileName = fileName;
    this.inventoryPath = path.resolve(DATA_DIR, fileName);
  }

  getInventory() {
    if (!fs.existsSync(this.inventoryPath)) return [];
    try {
      const data = fs.readFileSync(this.inventoryPath, 'utf-8');
      const items = JSON.parse(data);
      return Array.isArray(items) ? items : [];
    } catch (e) {
      console.error(`[InventoryRepository] Failed to read ${this.fileName}:`, e);
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
    const tempPath = `${this.inventoryPath}.tmp.${Date.now()}`;
    fs.writeFileSync(tempPath, JSON.stringify(items, null, 2), 'utf-8');
    fs.renameSync(tempPath, this.inventoryPath);
    console.log(`[InventoryRepository] Salvo com sucesso e atomicamente: ${items.length} mapas no ${this.fileName}`);
  }
}
