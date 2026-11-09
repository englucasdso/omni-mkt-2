import { normalizarStatus, OfficialStatus, OFFICIAL_STATUSES, STATUS_CONFIGS, StatusStyleConfig } from '../../utils/statusUtils';
import { Artifact, ScreenItem } from '../../types';

export { normalizarStatus, OFFICIAL_STATUSES, STATUS_CONFIGS };
export type { OfficialStatus, StatusStyleConfig };

export interface ScreenStatusMetrics {
  totalScreens: number;
  recognizedScreens: number;
  unrecognizedScreens: number;
  counts: {
    VALIDADO: number;
    'CORREÇÃO': number;
    NOVO: number;
    EXCLUIR: number;
    DESCONTINUAR: number;
  };
  // Campos complementares para compatibilidade direta
  validated: number;
  correction: number;
  new: number;
  exclude: number;
  discontinue: number;
  unrecognized: number;
  homologationPercentage: number | null;
  homologationStatus: 'HOMOLOGADO' | 'PARCIAL' | 'NAO_HOMOLOGADO' | 'NAO_CALCULAVEL';
  isFullyValidated: boolean;
  isFullyHomologated: boolean;
  hasScreens: boolean;
}

/**
 * calculateScreenStatusMetrics
 *
 * Agregador canônico único de status de telas e cálculo de homologação.
 * - Somente os 5 status oficiais (VALIDADO, CORREÇÃO, NOVO, EXCLUIR, DESCONTINUAR) são reconhecidos.
 * - Status não reconhecidos não entram no denominador da homologação de telas.
 * - Mapa sem telas é não-calculável (retorna homologationPercentage: null).
 * - Mapa integralmente homologado exige pelo menos 1 tela reconhecida e 100% VALIDADO.
 */
export function calculateScreenStatusMetrics(
  screens?: Array<{ status?: string | null }> | ScreenItem[] | null
): ScreenStatusMetrics {
  const safeScreens = Array.isArray(screens) ? screens : [];
  const totalScreens = safeScreens.length;

  let validated = 0;
  let correction = 0;
  let newCount = 0;
  let exclude = 0;
  let discontinue = 0;
  let unrecognized = 0;

  for (const sc of safeScreens) {
    const norm = normalizarStatus(sc?.status);
    if (norm === 'VALIDADO') {
      validated++;
    } else if (norm === 'CORREÇÃO') {
      correction++;
    } else if (norm === 'NOVO') {
      newCount++;
    } else if (norm === 'EXCLUIR') {
      exclude++;
    } else if (norm === 'DESCONTINUAR') {
      discontinue++;
    } else {
      unrecognized++;
    }
  }

  const recognizedScreens = validated + correction + newCount + exclude + discontinue;
  const hasScreens = totalScreens > 0;

  const homologationPercentage = recognizedScreens > 0
    ? Math.round((validated / recognizedScreens) * 100)
    : null;

  const isFullyValidated = hasScreens && validated === totalScreens;
  const isFullyHomologated = isFullyValidated;

  let homologationStatus: 'HOMOLOGADO' | 'PARCIAL' | 'NAO_HOMOLOGADO' | 'NAO_CALCULAVEL' = 'NAO_CALCULAVEL';
  if (recognizedScreens > 0) {
    if (homologationPercentage === 100) {
      homologationStatus = 'HOMOLOGADO';
    } else if (validated > 0) {
      homologationStatus = 'PARCIAL';
    } else {
      homologationStatus = 'NAO_HOMOLOGADO';
    }
  }

  return {
    totalScreens,
    recognizedScreens,
    unrecognizedScreens: unrecognized,
    counts: {
      VALIDADO: validated,
      'CORREÇÃO': correction,
      NOVO: newCount,
      EXCLUIR: exclude,
      DESCONTINUAR: discontinue
    },
    validated,
    correction,
    new: newCount,
    exclude,
    discontinue,
    unrecognized,
    homologationPercentage,
    homologationStatus,
    isFullyValidated,
    isFullyHomologated,
    hasScreens
  };
}

/**
 * getMapStatusMetrics
 * Helper para extrair as métricas canônicas a partir do objeto Artifact.
 * Suporta tanto o array completo `artifact.screens` quanto fallbacks estruturados (`status_summary`).
 */
export function getMapStatusMetrics(artifact?: Artifact | null): ScreenStatusMetrics {
  const screens = artifact?.screens;
  if (Array.isArray(screens) && screens.length > 0) {
    return calculateScreenStatusMetrics(screens);
  }

  const ss = artifact?.status_summary;
  if (ss) {
    const val = ss.VALIDADO ?? (ss as any).validado ?? artifact?.validated_screens ?? 0;
    const cor = ss['EM CORREÇÃO'] ?? (ss as any).CORRECAO ?? ss['CORREÇÃO'] ?? 0;
    const nov = ss.NOVO ?? (ss as any).novo ?? 0;
    const exc = ss.EXCLUIR ?? (ss as any).excluir ?? 0;
    const dis = ss.DESCONTINUAR ?? (ss as any).descontinuar ?? 0;
    const total = artifact?.total_screens ?? (val + cor + nov + exc + dis);
    const recognized = val + cor + nov + exc + dis;
    const unrecognized = Math.max(0, total - recognized);
    const pct = recognized > 0 
      ? Math.round((val / recognized) * 100) 
      : (artifact?.homologation_percentage ?? null);

    let status: 'HOMOLOGADO' | 'PARCIAL' | 'NAO_HOMOLOGADO' | 'NAO_CALCULAVEL' = 'NAO_CALCULAVEL';
    if (recognized > 0) {
      if (pct === 100) status = 'HOMOLOGADO';
      else if (val > 0) status = 'PARCIAL';
      else status = 'NAO_HOMOLOGADO';
    }

    return {
      totalScreens: total,
      recognizedScreens: recognized,
      unrecognizedScreens: unrecognized,
      counts: {
        VALIDADO: val,
        'CORREÇÃO': cor,
        NOVO: nov,
        EXCLUIR: exc,
        DESCONTINUAR: dis
      },
      validated: val,
      correction: cor,
      new: nov,
      exclude: exc,
      discontinue: dis,
      unrecognized,
      homologationPercentage: pct,
      homologationStatus: status,
      isFullyValidated: total > 0 && val === total,
      isFullyHomologated: total > 0 && val === total,
      hasScreens: total > 0
    };
  }

  return calculateScreenStatusMetrics(screens);
}
