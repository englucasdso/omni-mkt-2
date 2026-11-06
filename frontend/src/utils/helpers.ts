import { Artifact, Insights } from "../types";

export const normalizar = (txt: string): string => {
  return String(txt || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
};

export const formatUltimaSincronizacao = (valor?: string | number | Date | null): string => {
  if (!valor) return "—";

  if (typeof valor === "string") {
    const trimmed = valor.trim();
    if (!trimmed || trimmed === "—" || trimmed === "-" || trimmed.toLowerCase() === "n/a" || trimmed === "null" || trimmed === "undefined") {
      return "—";
    }
  }

  let date: Date;
  if (valor instanceof Date) {
    date = valor;
  } else if (typeof valor === "number") {
    date = new Date(valor);
  } else if (typeof valor === "string") {
    const trimmed = valor.trim();
    if (/^\d{10,13}$/.test(trimmed)) {
      date = new Date(Number(trimmed) * (trimmed.length === 10 ? 1000 : 1));
    } else {
      const brMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[,\s]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
      if (brMatch) {
        const [, day, month, year, hours, minutes] = brMatch;
        const pad = (n: string | number) => String(n).padStart(2, "0");
        return `${pad(day)}/${pad(month)}/${year} às ${pad(hours || 0)}:${pad(minutes || 0)}`;
      }
      date = new Date(trimmed);
    }
  } else {
    return "—";
  }

  if (isNaN(date.getTime())) {
    return "—";
  }

  try {
    const formatter = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    let day = "";
    let month = "";
    let year = "";
    let hour = "";
    let minute = "";

    for (const part of parts) {
      if (part.type === "day") day = part.value;
      else if (part.type === "month") month = part.value;
      else if (part.type === "year") year = part.value;
      else if (part.type === "hour") hour = part.value === "24" ? "00" : part.value;
      else if (part.type === "minute") minute = part.value;
    }

    if (!day || !month || !year || !hour || !minute) {
      return "—";
    }

    return `${day}/${month}/${year} às ${hour}:${minute}`;
  } catch {
    return "—";
  }
};

export const formatDataBR = (valor: string): string => {
  return formatUltimaSincronizacao(valor);
};

export const getFilteredInsights = (subset: Artifact[], queryText: string): Insights | null => {
  const total = subset.length;
  if (total === 0) return null;

  const counts = {
    ga4: subset.filter(item => normalizar(item.tipo_mapa) === "ga4").length,
    universalAnalytics: subset.filter(item => normalizar(item.tipo_mapa) === "universal analytics").length,
    mapas: subset.filter(item => {
      const type = normalizar(item.tipo_mapa);
      return type === "ga4" || type === "universal analytics";
    }).length,
    documentos: subset.filter(item => {
      const type = normalizar(item.tipo_mapa);
      return type === "doc" || (type !== "ga4" && type !== "universal analytics");
    }).length,
  };

  const prodMap: Record<string, number> = {};
  const subMap: Record<string, number> = {};
  subset.forEach(item => {
    const p = item.produto || "Sem Produto";
    const s = item.subproduto || "Sem Subproduto";
    prodMap[p] = (prodMap[p] || 0) + 1;
    subMap[s] = (subMap[s] || 0) + 1;
  });

  const distribProduto = Object.entries(prodMap)
    .map(([name, count]) => ({ name, count, percent: ((count / total) * 100).toFixed(1) }))
    .sort((a,b) => b.count - a.count);

  const distribSubproduto = Object.entries(subMap)
    .map(([name, count]) => ({ name, count, percent: ((count / total) * 100).toFixed(1) }))
    .sort((a,b) => b.count - a.count);

  const distribTipos = [
    { name: "GA4", count: counts.ga4, percent: ((counts.ga4 / total) * 100).toFixed(1) },
    { name: "Universal Analytics", count: counts.universalAnalytics, percent: ((counts.universalAnalytics / total) * 100).toFixed(1) },
    { name: "Doc", count: counts.documentos, percent: ((counts.documentos / total) * 100).toFixed(1) },
  ].sort((a, b) => b.count - a.count);

  const now = new Date();
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  let last30Days = 0, last60Days = 0, last90Days = 0, olderThan90Days = 0;
  
  subset.forEach(item => {
    let old = true;
    if (item.ultima_atualizacao) {
      const parts = item.ultima_atualizacao.split('/');
      let d = new Date(item.ultima_atualizacao);
      if (parts.length === 3) {
         d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00Z`);
      }
      if (!isNaN(d.getTime())) {
        const daysDiff = (now.getTime() - d.getTime()) / MS_PER_DAY;
        if (daysDiff <= 30) { last30Days++; last60Days++; last90Days++; old = false; }
        else if (daysDiff <= 60) { last60Days++; last90Days++; old = false; }
        else if (daysDiff <= 90) { last90Days++; old = false; }
      }
    }
    if (old) olderThan90Days++;
  });

  const topUpdated = [...subset]
    .filter(a => !!a.versao && !isNaN(Number(a.versao)))
    .sort((a, b) => Number(b.versao) - Number(a.versao))
    .slice(0, 5);

  const validVersions = subset.map(r => Number(r.versao)).filter(n => !isNaN(n));
  const averageVersions = validVersions.length > 0 ? (validVersions.reduce((a, b) => a + b, 0) / validVersions.length).toFixed(1) : "1";

  // Problemas Detectados
  const semResponsavel = subset.filter(i => !i.responsavel || i.responsavel === "-").length;
  const semSubproduto = subset.filter(i => !i.subproduto || i.subproduto === "-").length;
  const foraPadraoGA4 = subset.filter(i => normalizar(i.tipo_mapa) === "universal analytics").length;
  
  // Consideramos desatualizado o que não foi atualizado em 2024 (exemplo hipotético)
  const desatualizados = subset.filter(item => {
    const data = new Date(item.ultima_atualizacao);
    return !isNaN(data.getTime()) && data.getFullYear() < 2024;
  }).length;

  const totalProblemas = semResponsavel + semSubproduto + foraPadraoGA4 + desatualizados;
  let nivelRisco: 'baixo' | 'medio' | 'alto' = 'baixo';
  if (totalProblemas / total > 0.4) nivelRisco = 'alto';
  else if (totalProblemas / total > 0.1) nivelRisco = 'medio';

  // Aderência ao Padrão
  const scoreAderencia = counts.mapas > 0 ? (counts.ga4 / counts.mapas) * 100 : 100;
  let statusAderencia: 'excelente' | 'bom' | 'atencao' = 'excelente';
  let interpretacaoAderencia = "A base está 100% aderente ao padrão GA4";

  if (scoreAderencia < 100 && scoreAderencia >= 80) {
    statusAderencia = 'bom';
    interpretacaoAderencia = `A base possui boa aderência (${scoreAderencia.toFixed(0)}%) ao padrão GA4.`;
  } else if (scoreAderencia < 80) {
    statusAderencia = 'bom';
    interpretacaoAderencia = "A base apresenta mapas em processo de migração para o padrão GA4.";
  }

  // Resumo Inteligente
  const principalProduto = distribProduto[0]?.name || "N/A";
  const principalSubproduto = distribSubproduto[0]?.name || "N/A";
  
  const recomendacoes: string[] = [];
  if (foraPadraoGA4 > 0) recomendacoes.push(`Planejar migração para o padrão GA4 em ${principalProduto}.`);
  if (semResponsavel > 0) recomendacoes.push(`Atribuir responsáveis aos artefatos sem responsável definido em ${principalSubproduto}.`);
  if (desatualizados > 0) recomendacoes.push(`Revisar artefatos de ${principalSubproduto} que necessitam de atualização.`);
  if (scoreAderencia < 90) recomendacoes.push(`Estabelecer força-tarefa de padronização imediata para o produto ${principalProduto}.`);
  if (recomendacoes.length === 0) recomendacoes.push("Manter o monitoramento contínuo e a atualização semanal dos documentos.");

  const textoCenario = `Visão Consolidada: Foram analisados ${total} artefatos. 
Riscos Prioritários: ${foraPadraoGA4} inconsistências críticas e ${semResponsavel} integrações sem owner. 
Impacto em Mensuração: Alto risco de perda de volume de conversão no produto ${principalProduto}.`;

  return {
    total,
    ga4: counts.ga4,
    universalAnalytics: counts.universalAnalytics,
    mapas: counts.mapas,
    documentos: counts.documentos,
    distribProduto,
    distribSubproduto,
    distribTipos,
    porcentagens: {
      ga4: ((counts.ga4 / total) * 100).toFixed(1),
      universalAnalytics: ((counts.universalAnalytics / total) * 100).toFixed(1),
      documentos: ((counts.documentos / total) * 100).toFixed(1),
    },
    updates: {
      last30Days,
      last60Days,
      last90Days,
      olderThan90Days,
      percentLast30Days: ((last30Days / total) * 100).toFixed(1),
      percentLast60Days: ((last60Days / total) * 100).toFixed(1),
      percentLast90Days: ((last90Days / total) * 100).toFixed(1),
      percentOlderThan90Days: ((olderThan90Days / total) * 100).toFixed(1),
    },
    versioning: {
      topUpdated,
      averageVersions,
    },
    searchTerm: queryText,
    problemas: {
      semResponsavel,
      semSubproduto,
      foraPadraoGA4,
      desatualizados,
      nivelRisco
    },
    aderencia: {
      score: scoreAderencia,
      interpretacao: interpretacaoAderencia,
      status: statusAderencia
    },
    resumoInteligente: {
      principalProduto,
      principalSubproduto,
      textoCenario,
      recomendacoes
    }
  };
};
