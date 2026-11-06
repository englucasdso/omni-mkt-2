import fs from "fs";
import path from "path";
import { resolveCanonicalTaxonomy, evaluateStructuredContent, getTreeLevel } from "./classification/treeClassifier.js";

const DATA_FILE = path.join(process.cwd(), "backend/data/inventario.json");

export function normalizeInventoryItem(item: any) {
  if (!item) return null;
  
  let depth = item.depth !== undefined && item.depth !== null ? Number(item.depth) : null;
  if (depth === null) {
    if (item.taxonomy_depth !== undefined && item.taxonomy_depth !== null) {
      depth = Number(item.taxonomy_depth);
    } else if (Array.isArray(item.ancestor_ids) && item.ancestor_ids.length > 0) {
      depth = item.ancestor_ids.length;
    } else if (item.nivel !== undefined && item.nivel !== null) {
      depth = Number(item.nivel) - 1;
    } else {
      depth = 3;
    }
  }

  let artifact_type = item.artifact_type || 'NAO_CLASSIFICADO';

  if (depth === 0) {
    artifact_type = 'RAIZ';
  } else if (depth === 1 || depth === 2) {
    artifact_type = 'NO';
  } else {
    const { hasStructuredContent } = evaluateStructuredContent(item);
    const hasChildren = item.has_children === true || (item.children_count && item.children_count > 0) || item.is_leaf === false;
    const hasDoc = Boolean(
      item.structural_metadata?.signals?.has_documentation_signals ||
      item.signals?.has_documentation_signals ||
      item.has_documentation_signals ||
      item.hasDocContent
    );
    const isIncompleteOrError = item.content_scan_completed === false || Boolean(item.content_scan_error);

    if (hasStructuredContent) {
      artifact_type = 'MAPA';
    } else if (isIncompleteOrError) {
      artifact_type = 'NAO_CLASSIFICADO';
    } else if (!hasChildren && (hasDoc || item.artifact_type === 'DOCUMENTACAO')) {
      artifact_type = 'DOCUMENTACAO';
    } else {
      artifact_type = 'NO';
    }
  }
  
  let measurement_class = item.measurement_class || 'NAO_CLASSIFICADO';

  // Apenas mapas possuem telas e percentuais
  const isMap = artifact_type === 'MAPA';
  const screens = isMap && Array.isArray(item.screens) ? item.screens : [];
  const totalScreens = isMap ? screens.length : null;
  let validatedScreens = isMap ? (item.validated_screens !== undefined ? item.validated_screens : 
    (item.status_summary?.VALIDADO || 0)) : null;

  if (isMap && validatedScreens === 0 && screens.length > 0) {
    validatedScreens = screens.filter((s: any) => {
      const st = String(s.status || '').toUpperCase().trim();
      return st === 'VALIDADO' || st.includes('VALIDADO');
    }).length;
  }

  let homologation_percentage = isMap ? (item.homologation_percentage !== undefined ? item.homologation_percentage : 
    (Number(totalScreens) > 0 ? Math.round((Number(validatedScreens) / Number(totalScreens)) * 100) : 0)) : null;

  let homologation_status = isMap ? (item.homologation_status || 'NAO_HOMOLOGADO') : null;
  if (isMap && (!item.homologation_status || (homologation_status === 'NAO_HOMOLOGADO' && Number(validatedScreens) > 0))) {
    if (Number(totalScreens) > 0 && validatedScreens === totalScreens) {
      homologation_status = 'HOMOLOGADO';
    } else if (Number(validatedScreens) > 0 && Number(validatedScreens) < Number(totalScreens)) {
      homologation_status = 'PARCIAL';
    } else {
      homologation_status = 'NAO_HOMOLOGADO';
    }
  }

  // Detectar classe de mensuração se não definida
  if (isMap && (!measurement_class || measurement_class === 'NAO_CLASSIFICADO')) {
    let hasGa4 = false;
    let hasGa3 = false;
    for (const screen of screens) {
      for (const snip of (screen.snippets || [])) {
        if (snip.measurement_class === 'GA4') hasGa4 = true;
        else if (snip.measurement_class === 'GA3') hasGa3 = true;
        else if (snip.measurement_class === 'HIBRIDO') {
          hasGa4 = true;
          hasGa3 = true;
        }
      }
    }
    if (hasGa4 && hasGa3) measurement_class = 'HIBRIDO';
    else if (hasGa4) measurement_class = 'GA4';
    else if (hasGa3) measurement_class = 'GA3';
  }

  // Resolução canônica de taxonomia
  const tax = resolveCanonicalTaxonomy(item);

  const produto = tax.produto || (item.produto ? String(item.produto).trim() : '');
  const produto_id = tax.produto_id || (item.produto_id ? String(item.produto_id).trim() : (produto || null));
  const subproduto = tax.subproduto || (item.subproduto ? String(item.subproduto).trim() : '');
  const subproduto_id = tax.subproduto_id || (item.subproduto_id ? String(item.subproduto_id).trim() : (subproduto || null));
  const descendant_path_ids = tax.descendant_path_ids.length > 0 ? tax.descendant_path_ids : (Array.isArray(item.descendant_path_ids) ? item.descendant_path_ids : []);
  const descendant_path_titles = tax.descendant_path_titles.length > 0 ? tax.descendant_path_titles : (Array.isArray(item.descendant_path_titles) ? item.descendant_path_titles : []);

  return {
    ...item,
    artifact_type,
    measurement_class,
    depth: item.depth !== undefined ? item.depth : (item.taxonomy_depth || item.nivel || 1),
    taxonomy_depth: item.depth !== undefined ? item.depth : (item.taxonomy_depth || item.nivel || 1),
    parent_id: item.parent_id !== undefined ? item.parent_id : null,
    parent_title: item.parent_title !== undefined ? item.parent_title : (item.pai || null),
    ancestor_ids: Array.isArray(item.ancestor_ids) ? item.ancestor_ids : [],
    ancestor_titles: Array.isArray(item.ancestor_titles) ? item.ancestor_titles : [],
    full_path: item.full_path || item.titulo || '',
    produto,
    produto_id,
    subproduto,
    subproduto_id,
    descendant_path_ids,
    descendant_path_titles,
    categorias: descendant_path_titles,
    categoria_ids: descendant_path_ids,
    subproduto_path: subproduto ? [subproduto, ...descendant_path_titles] : [...descendant_path_titles],
    subproduto_path_ids: subproduto_id ? [subproduto_id, ...descendant_path_ids] : [...descendant_path_ids],
    has_children: Boolean(item.has_children),
    children_count: Number(item.children_count || 0),
    is_leaf: Boolean(item.is_leaf !== undefined ? item.is_leaf : (!item.has_children)),
    space: item.space || '',
    gtm_ids: Array.isArray(item.gtm_ids) ? item.gtm_ids : (item.gtm_id ? [item.gtm_id] : []),
    structural_metadata: item.structural_metadata || null,
    header: item.header || {},
    screens: screens,
    status_summary: item.status_summary || {
      NOVO: 0,
      VALIDADO: 0,
      CORRECAO: 0,
      EXCLUIR: 0,
      DESCONTINUAR: 0,
      NAO_IDENTIFICADO: 0
    },
    declared_status: item.declared_status || null,
    calculated_status: item.calculated_status || 'NAO_IDENTIFICADO',
    homologation_status,
    homologation_percentage,
    validated_screens: validatedScreens,
    total_screens: totalScreens,
    status_divergent: Boolean(item.status_divergent),
    parameter_summary: Array.isArray(item.parameter_summary) ? item.parameter_summary : [],
    pattern_summary: Array.isArray(item.pattern_summary) ? item.pattern_summary : [],
    tipo_mapa: isMap
      ? (item.tipo_mapa && item.tipo_mapa !== 'Nó' && item.tipo_mapa !== 'Doc' ? item.tipo_mapa : (measurement_class !== 'NAO_CLASSIFICADO' ? measurement_class : 'GA4'))
      : (artifact_type === 'NAO_CLASSIFICADO' ? 'Não classificado' : (artifact_type === 'DOCUMENTACAO' ? 'Doc' : (item.tipo_mapa || 'Nó')))
  };
}

export function getInventoryData() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
    if (!Array.isArray(raw)) return [];
    return raw.map(normalizeInventoryItem).filter(Boolean);
  } catch (e) {
    console.error("[inventory.service] Erro ao ler inventario.json:", e);
    return [];
  }
}

export function calculateInsights(inventory: any[]) {
  const statusCounts = {
    VALIDADO: 0,
    'CORREÇÃO': 0,
    NOVO: 0,
    EXCLUIR: 0,
    DESCONTINUAR: 0,
    CORRECAO: 0
  };

  const measurementCounts = {
    GA4: 0,
    GA3: 0,
    HIBRIDO: 0,
    NAO_CLASSIFICADO: 0
  };

  let totalScreens = 0;
  let totalArtifacts = inventory.length; // Raiz + Nós + Mapas + Documentos
  let totalMaps = 0;
  let totalDocs = 0;
  let divergentCount = 0;

  for (const item of inventory) {
    if (item.artifact_type === 'DOCUMENTACAO') {
      totalDocs++;
    } else if (item.artifact_type === 'MAPA') {
      totalMaps++;
      
      if (item.measurement_class === 'HIBRIDO') {
         measurementCounts.HIBRIDO++;
      } else if (item.measurement_class && measurementCounts.hasOwnProperty(item.measurement_class)) {
         measurementCounts[item.measurement_class as keyof typeof measurementCounts]++;
      } else {
         measurementCounts.NAO_CLASSIFICADO++;
      }

      if (item.status_divergent) {
        divergentCount++;
      }

      const screens = item.screens || [];
      totalScreens += screens.length;

      // Contagem oficial por tela
      for (const sc of screens) {
        const raw = sc.status;
        if (typeof raw === 'string') {
          const clean = raw.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
          if (clean === 'VALIDADO') {
            statusCounts.VALIDADO++;
          } else if (clean === 'CORREÇÃO' || clean === 'CORRECAO') {
            statusCounts['CORREÇÃO']++;
            statusCounts.CORRECAO++;
          } else if (clean === 'NOVO') {
            statusCounts.NOVO++;
          } else if (clean === 'EXCLUIR') {
            statusCounts.EXCLUIR++;
          } else if (clean === 'DESCONTINUAR') {
            statusCounts.DESCONTINUAR++;
          }
        }
      }
    }
    // Raiz e Nós não entram nas métricas acima
  }

  const sumOfficial = statusCounts.VALIDADO + statusCounts['CORREÇÃO'] + statusCounts.NOVO + statusCounts.EXCLUIR + statusCounts.DESCONTINUAR;

  return {
    total: totalArtifacts,
    totalMaps,
    totalDocs,
    totalScreens,
    divergentCount,
    statusCounts,
    measurementCounts,
    integrity: {
      valid: totalScreens === sumOfficial,
      totalScreens,
      sum: sumOfficial,
      difference: totalScreens - sumOfficial
    },
    recent: totalArtifacts > 0 ? 1 : 0
  };
}

export function searchArtifacts(query: string) {
  const inventory = getInventoryData();
  if (!query) return inventory;
  const lowerQuery = query.toLowerCase().trim();

  return inventory.filter((item: any) => {
    if (item.titulo && item.titulo.toLowerCase().includes(lowerQuery)) return true;
    if (item.full_path && item.full_path.toLowerCase().includes(lowerQuery)) return true;
    if (item.responsavel && item.responsavel.toLowerCase().includes(lowerQuery)) return true;
    if (item.produto && item.produto.toLowerCase().includes(lowerQuery)) return true;
    if (item.subproduto && item.subproduto.toLowerCase().includes(lowerQuery)) return true;
    if (item.numero_da_task && item.numero_da_task.toLowerCase().includes(lowerQuery)) return true;
    if (item.propriedade_ga4_stream_id && item.propriedade_ga4_stream_id.toLowerCase().includes(lowerQuery)) return true;
    if (item.gtm_id && item.gtm_id.toLowerCase().includes(lowerQuery)) return true;
    if (item.gtm_ids && item.gtm_ids.some((g: string) => String(g).toLowerCase().includes(lowerQuery))) return true;
    if (item.artifact_type && item.artifact_type.toLowerCase().includes(lowerQuery)) return true;
    if (item.measurement_class && item.measurement_class.toLowerCase().includes(lowerQuery)) return true;

    // Busca dentro dos parâmetros
    if (item.parameter_summary) {
      for (const p of item.parameter_summary) {
        if (p.path && p.path.toLowerCase().includes(lowerQuery)) return true;
        if (p.distinct_values && p.distinct_values.some((v: string) => String(v).toLowerCase().includes(lowerQuery))) return true;
      }
    }

    return false;
  });
}
