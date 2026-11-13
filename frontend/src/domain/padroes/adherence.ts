/**
 * Aderência dos mapas aos padrões cadastrados.
 *
 * Nada aqui é veredito. O mapa não diz qual documento de padrão ele segue, então o
 * canal (APP, WEB, WEBVIEW, GTM) é deduzido pelo título, pelo caminho e pelo código.
 * Cada ponto encontrado é um convite para conferir a documentação, não um erro.
 *
 * Regras:
 * - Nomes são comparados exatamente: "Action" e "action" são nomes diferentes.
 * - Snippets de Universal Analytics (GA3) ficam de fora: são o padrão antigo.
 */
import { Artifact } from '../../types';
import { StandardDoc } from './types';
import { buildParameterCatalog, parameterName } from './standardsCatalog';
import { shortDocTitle } from './sanitize';

export type Channel = 'APP' | 'WEB' | 'WEBVIEW' | 'GTM';

export const CHANNEL_LABEL: Record<Channel, string> = {
  APP: 'App',
  WEB: 'Web',
  WEBVIEW: 'Webview',
  GTM: 'GTM',
};

export type FlagKind = 'CAIXA' | 'OUTRO_PADRAO' | 'NAO_ENCONTRADO';

export interface AdherenceFlag {
  kind: FlagKind;
  /** Nome do parâmetro como está no mapa */
  param: string;
  /** Nome no padrão, quando existe um parecido (ex.: maiúscula diferente) */
  expected?: string;
  message: string;
  screenId: string;
  /** Posição estrutural da tela (zero-based; na tela, mostrar +1) */
  screenIndex: number;
  snippetIndex: number;
  event: string;
}

export interface MapAdherence {
  mapId: string;
  channels: Channel[];
  /** De onde veio o canal */
  channelSource: 'titulo' | 'caminho' | 'codigo' | 'indefinido';
  /** Documentos usados na comparação (títulos curtos) */
  docTitles: string[];
  flags: AdherenceFlag[];
}

const norm = (s: string) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/** Canais citados num texto (título do mapa, caminho ou título do documento) */
export function detectChannels(text: string): Set<Channel> {
  let t = ` ${norm(text)} `;
  const out = new Set<Channel>();
  if (/web\s*-?\s*view/.test(t)) {
    out.add('WEBVIEW');
    t = t.replace(/web\s*-?\s*view/g, ' ');
  }
  if (/[^a-z](app|apps|aplicativo|nativo|android|ios|sdk|firebase)[^a-z]/.test(t)) out.add('APP');
  if (/[^a-z](web|site|portal|desktop|internet banking)[^a-z]/.test(t)) out.add('WEB');
  if (/[^a-z]gtm[^a-z]|google tag manager/.test(t)) out.add('GTM');
  return out;
}

/** Canais sugeridos pelo próprio código de disparo */
function channelsFromCode(code: string): Set<Channel> {
  const out = new Set<Channel>();
  if (/datalayer\s*\.\s*push|gtag\s*\(/i.test(code)) out.add('WEB');
  if (/bundle\s*\.\s*put|firebaseanalytics|analytics\s*\.\s*logevent|logevent\s*\(/i.test(code)) out.add('APP');
  return out;
}

interface DocInfo {
  doc: StandardDoc;
  channels: Set<Channel>;
}

function mapChannels(art: Artifact): { channels: Set<Channel>; source: MapAdherence['channelSource']; usesDataLayer: boolean } {
  const code = (art.screens || [])
    .flatMap((s: any) => (s.snippets || []).map((sn: any) => String(sn.raw_code || '')))
    .join('\n');
  const usesDataLayer = /datalayer\s*\.\s*push/i.test(code);

  const byTitle = detectChannels(art.titulo || '');
  if (byTitle.size) return { channels: byTitle, source: 'titulo', usesDataLayer };

  const path = [art.subproduto, ...(art.ancestor_titles || []), art.full_path].filter(Boolean).join(' / ');
  const byPath = detectChannels(path);
  if (byPath.size) return { channels: byPath, source: 'caminho', usesDataLayer };

  const byCode = channelsFromCode(code);
  if (byCode.size) return { channels: byCode, source: 'codigo', usesDataLayer };

  return { channels: new Set(), source: 'indefinido', usesDataLayer };
}

const isLegacySnippet = (sn: any, art: Artifact) => {
  const cls = String(sn.measurement_class || art.measurement_class || '').toUpperCase();
  return cls === 'GA3' || cls.includes('UNIVERSAL');
};

/** Nomes do catálogo: exato e por minúsculas (para achar diferença de caixa) */
function nameIndex(docs: StandardDoc[]) {
  const exact = new Set<string>();
  const lower = new Map<string, string>();
  for (const p of buildParameterCatalog(docs)) {
    exact.add(p.name);
    if (!lower.has(p.name.toLowerCase())) lower.set(p.name.toLowerCase(), p.name);
  }
  return { exact, lower };
}

const list = (titles: string[]) => (titles.length > 1 ? `${titles.slice(0, -1).join(', ')} e ${titles[titles.length - 1]}` : titles[0] || '');

/** Analisa todos os mapas. Só devolve os que têm pontos para conferir. */
export function analyzeAdherence(artifacts: Artifact[], docs: StandardDoc[]): Map<string, MapAdherence> {
  const out = new Map<string, MapAdherence>();
  if (!docs.length) return out;

  const infos: DocInfo[] = docs.map((doc) => ({ doc, channels: detectChannels(doc.title) }));
  const allIndex = nameIndex(docs);
  // Onde cada nome aparece (para dizer "está no padrão de App")
  const docsByName = new Map<string, string[]>();
  for (const p of buildParameterCatalog(docs)) {
    docsByName.set(
      p.name,
      Array.from(new Set(p.sources.map((s) => shortDocTitle(s.docTitle))))
    );
  }
  const indexCache = new Map<string, { exact: Set<string>; lower: Map<string, string>; titles: string[] }>();

  for (const art of artifacts || []) {
    if (art.artifact_type !== 'MAPA') continue;
    const { channels, source, usesDataLayer } = mapChannels(art);
    if (usesDataLayer && (channels.has('WEB') || channels.has('WEBVIEW'))) channels.add('GTM');

    // Documentos que valem para o mapa: os do canal dele e os gerais (sem canal no título)
    const chosen =
      channels.size === 0
        ? infos
        : infos.filter((i) => i.channels.size === 0 || Array.from(i.channels).some((c) => channels.has(c)));
    const used = chosen.length ? chosen : infos;
    const key = used.map((i) => i.doc.id).sort().join('|');
    if (!indexCache.has(key)) {
      const idx = nameIndex(used.map((i) => i.doc));
      indexCache.set(key, { ...idx, titles: used.map((i) => shortDocTitle(i.doc.title)) });
    }
    const idx = indexCache.get(key)!;
    const usedTitles = idx.titles;

    const flags: AdherenceFlag[] = [];
    (art.screens || []).forEach((screen: any, sIdx: number) => {
      const screenIndex = typeof screen.screen_index === 'number' ? screen.screen_index : sIdx;
      (screen.snippets || []).forEach((sn: any, snIdx: number) => {
        if (isLegacySnippet(sn, art)) return;
        const seen = new Set<string>();
        for (const p of sn.parameters || []) {
          const name = parameterName(p.name_raw || p.name || '');
          if (!name || seen.has(name)) continue;
          seen.add(name);
          if (idx.exact.has(name)) continue;

          const base = {
            param: name,
            screenId: String(screen.screen_id ?? `screen-${sIdx}`),
            screenIndex,
            snippetIndex: snIdx,
            event: String(sn.event_normalized || sn.event_raw || ''),
          };
          const sameLetters = idx.lower.get(name.toLowerCase());
          if (sameLetters) {
            flags.push({
              ...base,
              kind: 'CAIXA',
              expected: sameLetters,
              message: `"${name}" está escrito diferente do padrão "${sameLetters}" (maiúsculas e minúsculas). Confira se é o mesmo parâmetro.`,
            });
            continue;
          }
          const elsewhere = (docsByName.get(name) || []).filter((t) => !usedTitles.includes(t));
          if (allIndex.exact.has(name) && elsewhere.length) {
            flags.push({
              ...base,
              kind: 'OUTRO_PADRAO',
              message: `"${name}" está no padrão de ${list(elsewhere)}, não no de ${list(usedTitles)}. Confira qual padrão vale para este mapa.`,
            });
            continue;
          }
          const lowerElsewhere = allIndex.lower.get(name.toLowerCase());
          flags.push({
            ...base,
            kind: 'NAO_ENCONTRADO',
            expected: lowerElsewhere,
            message: lowerElsewhere
              ? `"${name}" não está em ${list(usedTitles)}. Existe "${lowerElsewhere}" em outro documento. Confira a documentação.`
              : `"${name}" não está nos padrões cadastrados (${list(usedTitles)}). Confira a documentação.`,
          });
        }
      });
    });

    if (flags.length) {
      out.set(String(art.id), {
        mapId: String(art.id),
        channels: Array.from(channels),
        channelSource: chosen.length && channels.size ? source : 'indefinido',
        docTitles: usedTitles,
        flags,
      });
    }
  }
  return out;
}

/** Frase curta sobre como o canal foi escolhido */
export function describeComparison(a: MapAdherence): string {
  const ch = a.channels.map((c) => CHANNEL_LABEL[c]).join(', ');
  const via = { titulo: 'pelo título', caminho: 'pelo caminho na árvore', codigo: 'pelo código', indefinido: '' }[a.channelSource];
  return a.channelSource === 'indefinido'
    ? `Não deu para saber o canal do mapa; comparado com todos os padrões.`
    : `Canal ${ch}, deduzido ${via}. Comparado com: ${a.docTitles.join(', ')}.`;
}

export const FLAG_KIND_LABEL: Record<FlagKind, string> = {
  CAIXA: 'Maiúscula diferente',
  OUTRO_PADRAO: 'Padrão de outro canal',
  NAO_ENCONTRADO: 'Fora dos padrões',
};
