/**
 * MeasurementClassifier
 * Classifica artefatos em:
 * - artifact_type: MAPA | DOCUMENTACAO
 * - measurement_class: GA4 | GA3 | HIBRIDO | NAO_CLASSIFICADO
 * Calcula distribuição dos 5 status reais oficiais:
 * VALIDADO, CORREÇÃO, NOVO, EXCLUIR, DESCONTINUAR
 * Regra de integridade: total_telas = VALIDADO + CORREÇÃO + NOVO + EXCLUIR + DESCONTINUAR
 */

export class MeasurementClassifier {
  /**
   * Valida a regra de integridade para qualquer agrupamento:
   * total de telas = VALIDADO + CORREÇÃO + NOVO + EXCLUIR + DESCONTINUAR
   */
  validateIntegrity(totalScreens, statusSummary = {}) {
    const validado = Number(statusSummary.VALIDADO) || 0;
    const correcao = Number(statusSummary['CORREÇÃO'] ?? statusSummary.CORRECAO) || 0;
    const novo = Number(statusSummary.NOVO) || 0;
    const excluir = Number(statusSummary.EXCLUIR) || 0;
    const descontinuar = Number(statusSummary.DESCONTINUAR) || 0;

    const sum = validado + correcao + novo + excluir + descontinuar;
    return {
      valid: totalScreens === sum,
      totalScreens,
      sum,
      difference: totalScreens - sum
    };
  }

  /**
   * Determina a classificação de mensuração e sumários a partir das telas do mapa
   */
  classifyMap(screens = [], declaredStatus = '', context = {}) {
    const statusSummary = {
      VALIDADO: 0,
      'CORREÇÃO': 0,
      NOVO: 0,
      EXCLUIR: 0,
      DESCONTINUAR: 0
    };

    let hasGa3 = false;
    let hasGa4 = false;
    let totalSnippets = 0;
    const extractionErrors = [];

    for (const screen of screens) {
      // Contagem de status por tela individual (não por mapa)
      const rawStatus = screen.status;
      let normStatus = null;
      if (typeof rawStatus === 'string') {
        const clean = rawStatus.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
        if (clean === 'VALIDADO') normStatus = 'VALIDADO';
        else if (clean === 'CORREÇÃO' || clean === 'CORRECAO') normStatus = 'CORREÇÃO';
        else if (clean === 'NOVO') normStatus = 'NOVO';
        else if (clean === 'EXCLUIR') normStatus = 'EXCLUIR';
        else if (clean === 'DESCONTINUAR') normStatus = 'DESCONTINUAR';
      }

      if (normStatus && statusSummary.hasOwnProperty(normStatus)) {
        statusSummary[normStatus]++;
      } else {
        // Falha de extração ou associação: registrar erro técnico, nunca adicionar a uma 6ª categoria
        extractionErrors.push({
          map_id: screen.map_id,
          screen_id: screen.screen_id,
          screen_index: screen.screen_index,
          status_raw: screen.status_raw || screen.status || ''
        });
      }

      // Avaliação de snippets
      const snippets = screen.snippets || [];
      totalSnippets += snippets.length;

      for (const snippet of snippets) {
        if (snippet.measurement_class === 'GA4') hasGa4 = true;
        else if (snippet.measurement_class === 'GA3') hasGa3 = true;
        else if (snippet.measurement_class === 'HIBRIDO') {
          hasGa4 = true;
          hasGa3 = true;
        }
      }
    }

    // Classificação Canônica dos Tipos de Artefato
    let artifact_type = 'NAO_CLASSIFICADO';
    if (screens.length > 0 || totalSnippets > 0 || context.hasTrackingScreens) {
      artifact_type = 'MAPA';
    } else {
      artifact_type = 'DOCUMENTACAO';
    }

    // Se não for MAPA, não tem status ou classificação de medição
    if (artifact_type !== 'MAPA') {
      return {
        artifact_type,
        measurement_class: 'NAO_CLASSIFICADO',
        status_summary: statusSummary,
        declared_status: null,
        calculated_status: 'NAO_IDENTIFICADO',
        homologation_status: 'NAO_HOMOLOGADO',
        homologation_percentage: 0,
        validated_screens: 0,
        total_screens: 0,
        status_divergent: false,
        homologado: false
      };
    }

    // Classificação de mensuração:
    let measurement_class = 'NAO_CLASSIFICADO';
    if (hasGa4 && hasGa3) {
      measurement_class = 'HIBRIDO';
    } else if (hasGa4) {
      measurement_class = 'GA4';
    } else if (hasGa3) {
      measurement_class = 'GA3';
    }

    // Status calculado e homologação do mapa:
    const totalScreens = screens.length;
    const validatedScreens = statusSummary.VALIDADO || 0;
    
    let homologation_percentage = 0;
    if (totalScreens > 0) {
      homologation_percentage = Math.round((validatedScreens / totalScreens) * 100);
    }
    
    let homologation_status = 'NAO_HOMOLOGADO';
    if (totalScreens > 0 && validatedScreens === totalScreens) {
      homologation_status = 'HOMOLOGADO';
    } else if (validatedScreens > 0 && validatedScreens < totalScreens) {
      homologation_status = 'PARCIAL';
    }
    
    // Maintain calculated_status for backward compatibility
    let calculated_status = null;
    let homologado = false;
    if (totalScreens > 0) {
      if (validatedScreens === totalScreens) {
        calculated_status = 'VALIDADO';
        homologado = true;
      } else if (validatedScreens > 0) {
        calculated_status = 'PARCIAL';
        homologado = false;
      } else {
        calculated_status = 'NAO_VALIDADO';
        homologado = false;
      }
    }

    const normDeclared = this.normalizeDeclaredStatus(declaredStatus);
    const status_divergent = Boolean(
      normDeclared && 
      calculated_status && 
      normDeclared !== calculated_status
    );

    // Compatibilidade com acesso legados por 'CORRECAO' sem acento
    statusSummary.CORRECAO = statusSummary['CORREÇÃO'];

    const integrity = this.validateIntegrity(totalScreens, statusSummary);

    return {
      artifact_type,
      measurement_class,
      status_summary: statusSummary,
      declared_status: normDeclared || null,
      calculated_status,
      homologation_status,
      homologation_percentage,
      validated_screens: validatedScreens,
      total_screens: totalScreens,
      homologado,
      status_divergent,
      extraction_errors: extractionErrors,
      integrity
    };
  }

  /**
   * Normaliza status declarado no header
   */
  normalizeDeclaredStatus(rawStatus) {
    if (!rawStatus) return null;
    const str = String(rawStatus).trim().toUpperCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    if (str.includes('VALIDADO') || str.includes('HOMOLOGADO') || str.includes('APROVADO')) {
      return 'VALIDADO';
    }
    if (str.includes('CORRECAO') || str.includes('AJUSTE') || str.includes('BUG')) {
      return 'CORRECAO';
    }
    if (str.includes('NOVO')) {
      return 'NOVO';
    }
    if (str.includes('EXCLUIR') || str.includes('EXCLUSAO')) {
      return 'EXCLUIR';
    }
    if (str.includes('DESCONTINUAR') || str.includes('DESCONTINUADO')) {
      return 'DESCONTINUAR';
    }
    if (str.includes('PARCIAL')) {
      return 'PARCIAL';
    }
    return str || null;
  }

  // Compatibilidade com chamadas legadas
  classify(screens, declaredStatus, context) {
    const result = this.classifyMap(screens, declaredStatus, context);
    if (result.artifact_type === 'DOCUMENTACAO') return 'Doc';
    if (result.artifact_type === 'NAO_CLASSIFICADO') return 'Não classificado';
    return result.measurement_class === 'NAO_CLASSIFICADO' ? 'Não classificado' : result.measurement_class;
  }
}
