import { ConfluenceSession } from './confluenceSession.js';
import { ConfluenceTransport } from './confluenceTransport.js';
import { TreeCrawler } from './treeCrawler.js';
import { MapReader } from './mapReader.js';
import { MeasurementClassifier } from '../../services/classification/measurementClassifier.js';
import { classifyTree } from "../../services/classification/treeClassifier.js";
import { InventoryRepository } from '../../repositories/inventoryRepository.js';

const CONFLUENCE_BASE_URL = 'https://confluence.bradesco.com.br:8443';
const CURRENT_CONTENT_SCAN_VERSION = 2;

export class ConfluenceOrchestrator {
  constructor() {
    this.isCollecting = false;
    this.session = null;
    this.transport = null;
    this.repository = new InventoryRepository();
    this.classifier = new MeasurementClassifier();
  }

  async abort() {
    if (this.isCollecting) {
      console.log('[Orchestrator] Cancelamento solicitado pelo usuário.');
      if (this.transport) this.transport.cancel();
      if (this.session) {
        await this.session.close();
      }
      this.isCollecting = false;
      console.log('[Orchestrator] Mapeamento cancelado com sucesso.');
    }
  }

  extrairProdutoSubprodutoDaTrilha(ancestorTitles = [], fallbackProduto = '', fallbackSubproduto = '') {
    const titles = Array.isArray(ancestorTitles)
      ? ancestorTitles.map(value => String(value || '').trim())
      : [];
    return {
      produto: titles[1] || (typeof fallbackProduto === 'string' ? fallbackProduto.trim() : '') || '',
      subproduto: titles[2] || (typeof fallbackSubproduto === 'string' ? fallbackSubproduto.trim() : '') || ''
    };
  }

  async run(rootPageId, maxRows, username, password) {
    if (this.isCollecting) {
      throw new Error('A sincronização já está em andamento. Aguarde...');
    }

    this.isCollecting = true;
    console.time('Coleta Confluence Refatorada');
    
    const allRows = [];
    
    let stats = {
      reused: 0,
      new: 0,
      altered: 0,
      total: 0
    };

    try {
      // 1. Carrega o cache (sincronização incremental diretamente do inventario.json)
      const existingInventory = this.repository.getInventory();
      const invMap = new Map();
      for (const item of existingInventory) {
        invMap.set(String(item.id), item);
      }

      // 2. Inicia Sessão obrigatória no navegador
      this.session = new ConfluenceSession(CONFLUENCE_BASE_URL);
      const page = await this.session.authenticate(rootPageId, username, password);
      
      this.transport = new ConfluenceTransport(page);

      // Validação inicial obrigatória no contexto do navegador
      console.log('[BrowserTransport] Contexto: browser');
      const hostInfo = await page.evaluate(() => window.location.host);
      console.log(`[BrowserTransport] Host autenticado: ${hostInfo}`);

      const rootData = await this.transport.checkRoot(rootPageId);
      console.log('[BrowserTransport] Página raiz: HTTP 200');
      const childrenFound = (rootData && rootData.results) ? rootData.results.length : 0;
      console.log(`[BrowserTransport] Filhos encontrados: ${childrenFound}`);

      const crawler = new TreeCrawler(this.transport, 4, CONFLUENCE_BASE_URL);
      const mapReader = new MapReader(this.transport);

      // 3. Processa cada página da árvore (sem limite de profundidade, incluindo nós intermediários com filhos)
      await crawler.crawl(rootPageId, async (node, isLeaf, depth, parentTitle, trilhaAtual) => {
        const idStr = String(node.id);
        const nodeDepth = String(node.id) === String(rootPageId)
          ? 0
          : Number(node.depth !== undefined ? node.depth : depth);
        const ancestorTitles = node.ancestor_titles || trilhaAtual.map(t => t.titulo);
        
        let cabecalho = {};
        let headerObj = {};
        let tipo_mapa = '';
        let telasDoMapa = [];
        let artifact_type = 'NAO_CLASSIFICADO';
        let measurement_class = 'NAO_CLASSIFICADO';
        let statusSummary = {};
        let declaredStatus = null;
        let calculatedStatus = 'NAO_IDENTIFICADO';
        let statusDivergent = false;
        let homologado = false;
        let parameterSummary = [];
        let patternSummary = [];
        let gtm_ids = [];
        let structural_metadata = null;
        let signature_hash = '';
        let content_scan_completed = false;
        let content_scan_version = CURRENT_CONTENT_SCAN_VERSION;
        let content_scan_error = null;

        const currentVersion = String(node.version || (node.raw_page && node.raw_page.version && node.raw_page.version.number) || '');
        const currentUpdated = String(node.ultima_atualizacao || (node.raw_page && node.raw_page.history && node.raw_page.history.lastUpdated && node.raw_page.history.lastUpdated.when) || '');
        
        const cached = invMap.get(idStr);
        let homologationStatus = 'NAO_HOMOLOGADO';
        let homologationPercentage = 0;
        let validatedScreens = 0;
        let totalScreens = 0;

        if (nodeDepth >= 3) {
          // Páginas elegíveis para conteúdo analítico/documental (nível humano 4+)
          const canReuseCache = Boolean(
            cached &&
            String(cached.id) === idStr &&
            String(cached.versao) === currentVersion &&
            String(cached.ultima_atualizacao) === currentUpdated &&
            cached.content_scan_completed === true &&
            Number(cached.content_scan_version) === CURRENT_CONTENT_SCAN_VERSION
          );

          if (canReuseCache) {
            cabecalho = {
              produto_servico: cached.produto_servico,
              numero_task: cached.numero_da_task,
              figma_xd: cached.figma_xd,
              ga4_stream_id: cached.propriedade_ga4_stream_id,
              firebase: cached.firebase,
              gtm_id: cached.gtm_id,
              dominio: cached.dominio_exclusivo_web,
              status_homologacao: cached.declared_status
            };
            headerObj = cached.header || {};
            telasDoMapa = cached.screens || [];
            artifact_type = cached.artifact_type || 'NO';
            measurement_class = cached.measurement_class || 'NAO_CLASSIFICADO';
            tipo_mapa = cached.tipo_mapa || (artifact_type === 'DOCUMENTACAO' ? 'Doc' : (artifact_type === 'MAPA' ? measurement_class : 'Nó'));
            statusSummary = cached.status_summary || {};
            declaredStatus = cached.declared_status || null;
            calculatedStatus = cached.calculated_status || 'NAO_IDENTIFICADO';
            homologationStatus = cached.homologation_status || 'NAO_HOMOLOGADO';
            homologationPercentage = cached.homologation_percentage || 0;
            validatedScreens = cached.validated_screens || 0;
            totalScreens = cached.total_screens || 0;
            statusDivergent = Boolean(cached.status_divergent);
            homologado = cached.homologado !== undefined ? Boolean(cached.homologado) : (telasDoMapa.length > 0 && telasDoMapa.every(s => s.status === 'VALIDADO'));
            parameterSummary = cached.parameter_summary || [];
            patternSummary = cached.pattern_summary || [];
            gtm_ids = Array.isArray(cached.gtm_ids) ? cached.gtm_ids : (cached.gtm_id ? [cached.gtm_id] : []);
            structural_metadata = cached.structural_metadata || null;
            signature_hash = cached.signature_hash || (structural_metadata && structural_metadata.signature_hash) || '';
            content_scan_completed = true;
            content_scan_version = CURRENT_CONTENT_SCAN_VERSION;
            stats.reused++;
          } else {
            // Executar mapReader.readMapDetails() em todas as páginas com depth >= 3
            // independentemente de isLeaf, has_children, children_count, título, prefixo, barras
            try {
              const tempEstrutura = this.extrairProdutoSubprodutoDaTrilha(ancestorTitles);
              const details = await mapReader.readMapDetails(idStr, tempEstrutura.produto, tempEstrutura.subproduto);
              cabecalho = details.cabecalho || {};
              headerObj = details.header || {};
              telasDoMapa = details.telas || [];
              parameterSummary = details.parameter_summary || [];
              patternSummary = details.pattern_summary || [];
              gtm_ids = details.gtm_ids || [];
              structural_metadata = details.structural_metadata || null;
              signature_hash = details.signature_hash || '';
              content_scan_completed = true;
              content_scan_version = CURRENT_CONTENT_SCAN_VERSION;

              const classification = this.classifier.classifyMap(telasDoMapa, cabecalho.status_homologacao, {
                hasTrackingScreens: telasDoMapa.length > 0,
                hasGtmIds: gtm_ids.length > 0,
                hasDocContent: Boolean(structural_metadata?.signals?.has_documentation_signals),
                hasContent: Boolean(structural_metadata?.signals?.has_content),
                isRoot: idStr === String(rootPageId),
                hasChildren: Boolean(node.has_children)
              });

              artifact_type = classification.artifact_type;
              measurement_class = classification.measurement_class;
              statusSummary = classification.status_summary;
              declaredStatus = classification.declared_status;
              calculatedStatus = classification.calculated_status;
              homologationStatus = classification.homologation_status;
              homologationPercentage = classification.homologation_percentage;
              validatedScreens = classification.validated_screens;
              totalScreens = classification.total_screens;
              statusDivergent = classification.status_divergent;
              homologado = Boolean(classification.homologado);
              tipo_mapa = artifact_type === 'DOCUMENTACAO' ? 'Doc' : (measurement_class === 'NAO_CLASSIFICADO' ? 'Não classificado' : measurement_class);
              
              if (cached) stats.altered++;
              else stats.new++;
            } catch (readErr) {
              console.warn(`[ConfluenceOrchestrator] Não foi possível ler conteúdo detalhado da página ${idStr} (${node.title}): ${readErr.message}`);
              content_scan_completed = false;
              content_scan_version = null;
              content_scan_error = {
                message: String(readErr.message || 'Erro ao ler detalhes do mapa'),
                occurred_at: new Date().toISOString()
              };

              const hasValidCachedScreens = cached && Array.isArray(cached.screens) && cached.screens.length > 0;
              if (hasValidCachedScreens) {
                cabecalho = {
                  produto_servico: cached.produto_servico,
                  numero_task: cached.numero_da_task,
                  figma_xd: cached.figma_xd,
                  ga4_stream_id: cached.propriedade_ga4_stream_id,
                  firebase: cached.firebase,
                  gtm_id: cached.gtm_id,
                  dominio: cached.dominio_exclusivo_web,
                  status_homologacao: cached.declared_status
                };
                headerObj = cached.header || {};
                telasDoMapa = cached.screens || [];
                artifact_type = cached.artifact_type || 'MAPA';
                measurement_class = cached.measurement_class || 'NAO_CLASSIFICADO';
                tipo_mapa = cached.tipo_mapa || 'Doc';
                statusSummary = cached.status_summary || {};
                declaredStatus = cached.declared_status || null;
                calculatedStatus = cached.calculated_status || 'NAO_IDENTIFICADO';
                homologationStatus = cached.homologation_status || 'NAO_HOMOLOGADO';
                homologationPercentage = cached.homologation_percentage || 0;
                validatedScreens = cached.validated_screens || 0;
                totalScreens = cached.total_screens || 0;
                statusDivergent = Boolean(cached.status_divergent);
                homologado = Boolean(cached.homologado);
                parameterSummary = cached.parameter_summary || [];
                patternSummary = cached.pattern_summary || [];
                gtm_ids = Array.isArray(cached.gtm_ids) ? cached.gtm_ids : (cached.gtm_id ? [cached.gtm_id] : []);
                structural_metadata = cached.structural_metadata || null;
                signature_hash = cached.signature_hash || '';
              } else {
                artifact_type = 'NAO_CLASSIFICADO';
                measurement_class = 'NAO_CLASSIFICADO';
                tipo_mapa = 'Não classificado';
                telasDoMapa = [];
              }

              if (cached) stats.altered++;
              else stats.new++;
            }
          }
        } else {
          // depth 0, 1, 2: Raiz, Produto, Subproduto (não ler conteúdo para tentar torná-los mapas)
          content_scan_completed = false;
          content_scan_version = null;
          artifact_type = nodeDepth === 0 ? 'RAIZ' : 'NO';
          tipo_mapa = 'Nó';
          measurement_class = 'NAO_CLASSIFICADO';
          if (cached && String(cached.versao) === currentVersion && String(cached.ultima_atualizacao) === currentUpdated) {
            stats.reused++;
          } else {
            if (cached) stats.altered++;
            else stats.new++;
          }
        }

        const resolvedStructure = this.extrairProdutoSubprodutoDaTrilha(ancestorTitles);

        const row = {
          id: idStr,
          titulo: String(node.title || '').trim(),
          link: node.url || `${CONFLUENCE_BASE_URL}/pages/viewpage.action?pageId=${idStr}`,
          ultima_atualizacao: currentUpdated,
          responsavel: String(node.responsavel || '').trim(),
          versao: currentVersion,
          // Estrutura hierárquica completa
          depth: Number(node.depth !== undefined ? node.depth : depth),
          nivel: Number(node.depth !== undefined ? node.depth : depth),
          taxonomy_depth: Number(node.depth !== undefined ? node.depth : depth),
          parent_id: node.parent_id !== undefined ? node.parent_id : null,
          parent_title: node.parent_title !== undefined ? node.parent_title : (parentTitle || ''),
          pai: node.parent_title !== undefined ? node.parent_title : (parentTitle || ''),
          ancestor_ids: node.ancestor_ids || [],
          ancestor_titles: ancestorTitles,
          full_path: node.full_path || ancestorTitles.join(' > '),
          has_children: Boolean(node.has_children),
          children_count: Number(node.children_count || 0),
          is_leaf: Boolean(node.is_leaf !== undefined ? node.is_leaf : isLeaf),
          space: node.space || '',
          produto: resolvedStructure.produto,
          subproduto: resolvedStructure.subproduto,
          artifact_type,
          measurement_class,
          header: headerObj,
          screens: telasDoMapa,
          status_summary: statusSummary,
          declared_status: declaredStatus,
          calculated_status: calculatedStatus,
          homologation_status: typeof homologationStatus !== 'undefined' ? homologationStatus : (homologado ? 'HOMOLOGADO' : 'NAO_HOMOLOGADO'),
          homologation_percentage: typeof homologationPercentage !== 'undefined' ? homologationPercentage : (homologado ? 100 : 0),
          validated_screens: typeof validatedScreens !== 'undefined' ? validatedScreens : (homologado ? telasDoMapa.length : 0),
          total_screens: typeof totalScreens !== 'undefined' ? totalScreens : telasDoMapa.length,
          homologado,
          status_divergent: statusDivergent,
          parameter_summary: parameterSummary,
          pattern_summary: patternSummary,
          gtm_ids,
          gtm_id: gtm_ids.length > 0 ? gtm_ids.join(', ') : (cabecalho.gtm_id || ''),
          structural_metadata,
          signature_hash,
          // Campos planos para retrocompatibilidade
          produto_servico: cabecalho.produto_servico || '',
          numero_da_task: cabecalho.numero_task || cabecalho.n_da_task || cabecalho.numero_da_task || '',
          figma_xd: cabecalho.figma_xd || cabecalho.figma || '',
          propriedade_ga4_stream_id: cabecalho.ga4_stream_id || cabecalho.propriedade_ga4_stream_id || '',
          firebase: cabecalho.firebase || '',
          dominio_exclusivo_web: cabecalho.dominio || cabecalho.dominio_exclusivo_web || '',
          tipo_mapa: tipo_mapa || 'Doc',
          content_scan_completed: nodeDepth >= 3 ? content_scan_completed : false,
          content_scan_version: nodeDepth >= 3 ? content_scan_version : null,
          content_scan_error: nodeDepth >= 3 ? content_scan_error : null,
        };

        allRows.push(row);
        
        stats.total++;
        if (stats.total % 50 === 0) {
          console.log(`Processados: ${stats.total}`);
        }
      }, maxRows);

      // 4. Salva de forma segura usando o repositório diretamente no inventario.json
      if (allRows.length === 0) {
        console.error('[Orchestrator] ERRO: Coleta retornou 0 registros. Gravação bloqueada para proteger o inventário atual.');
        throw new Error('A coleta retornou 0 registros. Sincronização abortada para proteger a base.');
      }
      const finalRows = classifyTree(allRows, rootPageId);
      this.repository.saveSafely(finalRows);
      
      console.log('--- Resumo da Coleta ---');
      console.log(`Duração: Concluída.`);
      console.log(`Total encontrado: ${stats.total}`);
      console.log(`Requisições HTTP: ${this.transport.metrics.totalRequests}`);
      console.log(`Reutilizados do cache: ${stats.reused}`);
      console.log(`Novos: ${stats.new}`);
      console.log(`Alterados: ${stats.altered}`);
      console.log(`Respostas 429: ${this.transport.metrics.total429s}`);
      console.log(`Erros HTTP: ${this.transport.metrics.totalErrors}`);
      console.log('------------------------');

      return finalRows;
    } finally {
      if (this.session) {
        await this.session.close();
      }
      this.isCollecting = false;
      console.timeEnd('Coleta Confluence Refatorada');
    }
  }
}
