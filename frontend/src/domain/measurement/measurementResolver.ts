import { Artifact, MeasurementClass } from '../../types';
import { MEASUREMENT_CONFIGS, MeasurementConfig } from './measurementConfig';

/**
 * measurementResolver.ts
 *
 * Resolvedor canônico de classe de mensuração do Hub de Artefatos.
 * Centraliza e padroniza a identificação da esteira de métricas (GA4, GA3, Híbrido ou Não classificado).
 * - Prioriza o campo canônico artifact.measurement_class;
 * - Realiza fallback para tipo_mapa somente se estritamente necessário;
 * - Nunca assume GA3 apenas por ausência de GA4;
 * - Regra de produto: todo MAPA sem evidência de GA3 ou de híbrido é GA4;
 * - Nó, documentação e raiz ficam como NAO_CLASSIFICADO.
 */
export function resolveMeasurementClass(artifact?: Artifact | null): MeasurementClass {
  if (!artifact) return 'NAO_CLASSIFICADO';
  const type = String(artifact.artifact_type || '').toUpperCase();
  if (type && type !== 'MAPA') return 'NAO_CLASSIFICADO';

  const direct = String(artifact.measurement_class || '').trim().toUpperCase();
  if (direct === 'GA4') return 'GA4';
  if (direct === 'GA3' || direct === 'UNIVERSAL' || direct === 'UNIVERSAL ANALYTICS') return 'GA3';
  if (direct === 'HIBRIDO' || direct === 'HÍBRIDO') return 'HIBRIDO';

  // Fallback controlado para campos legados apenas se measurement_class não estiver preenchido
  const legacy = String(artifact.tipo_mapa || '').toLowerCase().trim();
  if (legacy.includes('hibrid') || legacy.includes('híbrid')) return 'HIBRIDO';
  if (legacy.includes('ga4')) return 'GA4';
  if (legacy.includes('ga3') || legacy.includes('universal analytics') || legacy.includes('universal')) return 'GA3';

  return type === 'MAPA' ? 'GA4' : 'NAO_CLASSIFICADO';
}

export function getMeasurementConfig(mc?: string | null): MeasurementConfig {
  const norm = String(mc || '').trim().toUpperCase();
  if (norm === 'GA4') return MEASUREMENT_CONFIGS.GA4;
  if (norm === 'GA3' || norm === 'UNIVERSAL' || norm === 'UNIVERSAL ANALYTICS') return MEASUREMENT_CONFIGS.GA3;
  if (norm === 'HIBRIDO' || norm === 'HÍBRIDO') return MEASUREMENT_CONFIGS.HIBRIDO;
  return MEASUREMENT_CONFIGS.NAO_CLASSIFICADO;
}

export function getMeasurementLabel(mc?: string | null): string {
  return getMeasurementConfig(mc).label;
}
