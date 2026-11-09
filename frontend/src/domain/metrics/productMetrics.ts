import { Artifact } from '../../types';
import { isMap } from '../artifacts/artifactSelectors';
import { resolveArtifactTaxonomy, ResolvedArtifactTaxonomy } from '../../utils/taxonomyResolver';
import { calculateScreenStatusMetrics, ScreenStatusMetrics, OfficialStatus } from '../status/screenStatusMetrics';
import { resolveMeasurementClass } from '../measurement/measurementResolver';
import { MeasurementClass } from '../../types';

export interface ProductPathInfo {
  key: string;
  displayText: string;
  count: number;
  mapIds: Set<string>;
}

export interface ProductConsolidatedItem {
  id: string;
  produto: string;
  mapas: Artifact[];
  totalMaps: number;
  subprodutosList: string[];
  pathsList: ProductPathInfo[];
  descendantPathsMap: Map<string, { key: string; displayText: string; mapIds: Set<string> }>;
  semSubprodutoMapIds: Set<string>;
  totalTelas: number;
  taxaHomologacao: number;
  mapasHomologados: number;
  mapasComTelas: number;
  mapasSemTelas: number;
  measurementCounts: Record<MeasurementClass, number>;
  screenStatusCounts: Record<OfficialStatus, number>;
  topParameters: Array<{ name: string; count: number }>;
}

/**
 * consolidateProducts
 *
 * Agregação canônica de produtos orientada exclusivamente a MAPAS.
 * Nós estruturais e documentações nunca são somados aos mapas do produto.
 */
export function consolidateProducts(
  artifacts: Artifact[],
  taxonomyCache?: Map<string, ResolvedArtifactTaxonomy>
): ProductConsolidatedItem[] {
  const productEntries = new Map<string, {
    id: string;
    produto: string;
    mapas: Artifact[];
    seenMapIds: Set<string>;
    firstLevelSubproducts: Set<string>;
    descendantPathsMap: Map<string, { key: string; displayText: string; mapIds: Set<string> }>;
    hasSemSubproduto: boolean;
    semSubprodutoMapIds: Set<string>;
    totalTelas: number;
    mapasComTelas: number;
    mapasHomologados: number;
    mapasSemTelas: number;
    screenStatusCounts: Record<OfficialStatus, number>;
    measurementCounts: Record<MeasurementClass, number>;
    parametersMap: Map<string, number>;
  }>();

  const globallySeenMapIds = new Set<string>();

  artifacts.forEach(art => {
    // Apenas mapas reais entram na análise de produtos
    if (!isMap(art)) return;

    const mapIdStr = String(art.id);
    if (globallySeenMapIds.has(mapIdStr)) return;
    globallySeenMapIds.add(mapIdStr);

    const taxonomy = taxonomyCache?.get(mapIdStr) || resolveArtifactTaxonomy(art);
    const productKey = taxonomy.productKey;
    const displayedProductName = taxonomy.produto_nome;
    const descendantPath = taxonomy.descendantPath;

    if (!productEntries.has(productKey)) {
      productEntries.set(productKey, {
        id: productKey,
        produto: displayedProductName,
        mapas: [],
        seenMapIds: new Set(),
        firstLevelSubproducts: new Set(),
        descendantPathsMap: new Map(),
        hasSemSubproduto: false,
        semSubprodutoMapIds: new Set(),
        totalTelas: 0,
        mapasComTelas: 0,
        mapasHomologados: 0,
        mapasSemTelas: 0,
        screenStatusCounts: {
          VALIDADO: 0,
          'CORREÇÃO': 0,
          NOVO: 0,
          EXCLUIR: 0,
          DESCONTINUAR: 0
        },
        measurementCounts: {
          GA4: 0,
          GA3: 0,
          HIBRIDO: 0,
          NAO_CLASSIFICADO: 0
        },
        parametersMap: new Map()
      });
    }

    const pEntry = productEntries.get(productKey)!;
    if (pEntry.seenMapIds.has(mapIdStr)) return;
    pEntry.seenMapIds.add(mapIdStr);
    pEntry.mapas.push(art);

    if (descendantPath.length === 0) {
      pEntry.hasSemSubproduto = true;
      pEntry.semSubprodutoMapIds.add(mapIdStr);
    } else {
      pEntry.firstLevelSubproducts.add(descendantPath[0].name);

      for (let len = 1; len <= descendantPath.length; len++) {
        const prefix = descendantPath.slice(0, len).map(d => d.name);
        const pDisplay = prefix.join(' › ');
        const pKey = pDisplay;
        if (!pEntry.descendantPathsMap.has(pKey)) {
          pEntry.descendantPathsMap.set(pKey, {
            key: pKey,
            displayText: pDisplay,
            mapIds: new Set()
          });
        }
        pEntry.descendantPathsMap.get(pKey)!.mapIds.add(mapIdStr);
      }
    }

    const metrics = calculateScreenStatusMetrics(art.screens || []);
    if (metrics.hasScreens) {
      pEntry.mapasComTelas++;
      if (metrics.isFullyHomologated) {
        pEntry.mapasHomologados++;
      }
    } else {
      pEntry.mapasSemTelas++;
    }

    pEntry.totalTelas += metrics.recognizedScreens;
    pEntry.screenStatusCounts.VALIDADO += metrics.validated;
    pEntry.screenStatusCounts['CORREÇÃO'] += metrics.correction;
    pEntry.screenStatusCounts.NOVO += metrics.new;
    pEntry.screenStatusCounts.EXCLUIR += metrics.exclude;
    pEntry.screenStatusCounts.DESCONTINUAR += metrics.discontinue;

    const mClass = resolveMeasurementClass(art);
    pEntry.measurementCounts[mClass] = (pEntry.measurementCounts[mClass] || 0) + 1;

    (art.parameter_summary || []).forEach(param => {
      pEntry.parametersMap.set(param.name, (pEntry.parametersMap.get(param.name) || 0) + param.occurrences);
    });
  });

  return Array.from(productEntries.values()).map(p => {
    const totalMaps = p.mapas.length;
    const taxaHomologacao = p.mapasComTelas > 0
      ? Math.round((p.mapasHomologados / p.mapasComTelas) * 100)
      : 0;

    const topParameters = Array.from(p.parametersMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const pathsList: ProductPathInfo[] = Array.from(p.descendantPathsMap.values())
      .map(item => ({
        key: item.key,
        displayText: item.displayText,
        count: item.mapIds.size,
        mapIds: item.mapIds
      }))
      .sort((a, b) => a.displayText.localeCompare(b.displayText, 'pt-BR'));

    if (p.hasSemSubproduto) {
      pathsList.push({
        key: 'SEM_SUBPRODUTO',
        displayText: 'Sem subproduto',
        count: p.semSubprodutoMapIds.size,
        mapIds: p.semSubprodutoMapIds
      });
    }

    return {
      id: p.id,
      produto: p.produto,
      mapas: p.mapas,
      totalMaps,
      subprodutosList: Array.from(p.firstLevelSubproducts).sort(),
      pathsList,
      descendantPathsMap: p.descendantPathsMap,
      semSubprodutoMapIds: p.semSubprodutoMapIds,
      totalTelas: p.totalTelas,
      taxaHomologacao,
      mapasHomologados: p.mapasHomologados,
      mapasComTelas: p.mapasComTelas,
      mapasSemTelas: p.mapasSemTelas,
      measurementCounts: p.measurementCounts,
      screenStatusCounts: p.screenStatusCounts,
      topParameters
    };
  }).sort((a, b) => {
    if (a.id === 'SEM_PRODUTO') return 1;
    if (b.id === 'SEM_PRODUTO') return -1;
    return b.totalMaps - a.totalMaps;
  });
}
