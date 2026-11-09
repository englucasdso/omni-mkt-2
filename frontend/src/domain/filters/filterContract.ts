import { Artifact, ArtifactType, MeasurementClass } from '../../types';
import { OfficialStatus } from '../../utils/statusUtils';
import { resolveArtifactTaxonomy } from '../../utils/taxonomyResolver';
import { resolveMeasurementClass } from '../measurement/measurementResolver';

export type GlobalFilterValue = 'ALL' | string;

export interface GlobalFilterState {
  artifactType: 'ALL' | ArtifactType;
  productId: GlobalFilterValue;
  subproductId: GlobalFilterValue;
  measurementClass: 'ALL' | MeasurementClass;
  screenStatus: 'ALL' | OfficialStatus;
  responsible: GlobalFilterValue;
  year: GlobalFilterValue;
  onlyDivergent?: boolean;
}

export const DEFAULT_GLOBAL_FILTERS: GlobalFilterState = {
  artifactType: 'ALL',
  productId: 'ALL',
  subproductId: 'ALL',
  measurementClass: 'ALL',
  screenStatus: 'ALL',
  responsible: 'ALL',
  year: 'ALL',
  onlyDivergent: false
};

export const GLOBAL_FILTER_DEFAULT_LABELS = {
  artifactType: 'Todos os tipos',
  productId: 'Todos os produtos',
  subproductId: 'Todos os subprodutos',
  measurementClass: 'Todas as classificações',
  screenStatus: 'Todos os status',
  responsible: 'Todos os responsáveis',
  year: 'Todos os anos'
} as const;

/**
 * Retorna os subprodutos válidos vinculados ao produto selecionado.
 */
export function getValidSubproductsForProduct(
  artifacts: Artifact[],
  selectedProductKey: GlobalFilterValue
): Array<{ id: string; name: string }> {
  if (selectedProductKey === 'ALL') {
    const subs = new Map<string, string>();
    artifacts.forEach(art => {
      const tax = resolveArtifactTaxonomy(art);
      if (tax.subproduct) {
        subs.set(tax.subproduct.id, tax.subproduct.name);
      }
    });
    return Array.from(subs.entries()).map(([id, name]) => ({ id, name }));
  }

  const subMap = new Map<string, string>();
  artifacts.forEach(art => {
    const tax = resolveArtifactTaxonomy(art);
    if (tax.productKey === selectedProductKey && tax.subproduct) {
      subMap.set(tax.subproduct.id, tax.subproduct.name);
    }
  });

  return Array.from(subMap.entries()).map(([id, name]) => ({ id, name }));
}

/**
 * Valida se um subproduto pertence ao produto selecionado.
 * Se não pertencer, retorna 'ALL'.
 */
export function reconcileSubproductWithProduct(
  artifacts: Artifact[],
  selectedProductKey: GlobalFilterValue,
  currentSubproductKey: GlobalFilterValue
): GlobalFilterValue {
  if (currentSubproductKey === 'ALL') return 'ALL';
  if (selectedProductKey === 'ALL') return currentSubproductKey;

  const validSubs = getValidSubproductsForProduct(artifacts, selectedProductKey);
  const isValid = validSubs.some(s => s.id === currentSubproductKey);
  return isValid ? currentSubproductKey : 'ALL';
}

/**
 * Aplica os filtros canônicos de forma determinística e unificada.
 */
export function filterArtifactsByGlobalContract(
  artifacts: Artifact[],
  filters: Partial<GlobalFilterState>
): Artifact[] {
  const eff = { ...DEFAULT_GLOBAL_FILTERS, ...filters };

  return artifacts.filter(art => {
    // 1. Tipo de artefato
    if (eff.artifactType !== 'ALL') {
      const artType = art.artifact_type || 'NAO_CLASSIFICADO';
      if (artType !== eff.artifactType) return false;
    }

    // 2. Taxonomia: Produto
    if (eff.productId !== 'ALL') {
      const tax = resolveArtifactTaxonomy(art);
      if (tax.productKey !== eff.productId && tax.produto_id !== eff.productId && tax.produto_nome !== eff.productId) {
        return false;
      }
    }

    // 3. Taxonomia: Subproduto
    if (eff.subproductId !== 'ALL') {
      const tax = resolveArtifactTaxonomy(art);
      if (tax.subproductKey !== eff.subproductId && tax.subproduto_id !== eff.subproductId && tax.subproduto_nome !== eff.subproductId) {
        return false;
      }
    }

    // 4. Classe de Mensuração
    if (eff.measurementClass !== 'ALL') {
      const resolvedClass = resolveMeasurementClass(art);
      if (resolvedClass !== eff.measurementClass) return false;
    }

    // 5. Responsável
    if (eff.responsible !== 'ALL') {
      const resp = (art.responsavel || '').trim();
      if (resp !== eff.responsible) return false;
    }

    // 6. Ano
    if (eff.year !== 'ALL') {
      if (!art.ultima_atualizacao) return false;
      const d = new Date(art.ultima_atualizacao);
      const y = isNaN(d.getTime()) ? '' : d.getFullYear().toString();
      if (y !== eff.year) return false;
    }

    // 7. Divergência
    if (eff.onlyDivergent) {
      if (!art.status_divergent) return false;
    }

    return true;
  });
}
