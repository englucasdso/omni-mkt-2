/**
 * Metadados do cabeçalho do mapa (tabela do topo da página no Confluence).
 * Fonte única para a busca de conteúdo, o filtro do Inventário e a busca de Cards.
 * Entram o valor do cabeçalho e, se for diferente, o do campo do artefato.
 */
export interface ArtifactMetadataField {
  key: string;
  label: string;
  value: string;
}

const FIELDS: Array<{ key: string; label: string; headerKey: string; legacyKey: string }> = [
  { key: 'numero_task', label: 'Nº da task', headerKey: 'numero_task', legacyKey: 'numero_da_task' },
  { key: 'gtm_id', label: 'GTM', headerKey: 'gtm_id', legacyKey: 'gtm_id' },
  { key: 'ga4_stream_id', label: 'GA4 Stream ID', headerKey: 'ga4_stream_id', legacyKey: 'propriedade_ga4_stream_id' },
  { key: 'firebase', label: 'Firebase', headerKey: 'firebase', legacyKey: 'firebase' },
  { key: 'dominio', label: 'Domínio', headerKey: 'dominio', legacyKey: 'dominio_exclusivo_web' },
  { key: 'produto_servico', label: 'Produto / Serviço', headerKey: 'produto_servico', legacyKey: 'produto_servico' },
  { key: 'figma_xd', label: 'Figma / XD', headerKey: 'figma_xd', legacyKey: 'figma_xd' },
  { key: 'responsavel', label: 'Responsável', headerKey: 'responsavel', legacyKey: 'responsavel' },
];

function isEmpty(value: string): boolean {
  const v = value.trim();
  return !v || v === '-' || v === '—' || /^n\/?a$/i.test(v);
}

export function getArtifactMetadata(artifact: any): ArtifactMetadataField[] {
  if (!artifact) return [];
  const header = artifact.header || {};
  const out: ArtifactMetadataField[] = [];
  for (const f of FIELDS) {
    const fromHeader = String(header?.[f.headerKey]?.value ?? '').trim();
    const fromField = String(artifact?.[f.legacyKey] ?? '').trim();
    if (!isEmpty(fromHeader)) out.push({ key: f.key, label: f.label, value: fromHeader });
    // Quando o campo do artefato diz outra coisa, os dois valores entram na busca
    if (!isEmpty(fromField) && fromField !== fromHeader) out.push({ key: f.key, label: f.label, value: fromField });
  }
  // IDs técnicos de GTM achados nos snippets
  for (const id of artifact.gtm_ids || []) {
    const v = String(id || '').trim();
    if (!isEmpty(v) && !out.some((m) => m.key === 'gtm_id' && m.value === v)) {
      out.push({ key: 'gtm_id', label: 'GTM', value: v });
    }
  }
  return out;
}
