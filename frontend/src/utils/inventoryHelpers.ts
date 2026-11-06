import { Artifact } from "../types";

export function getOperationalInsights(inventory: Artifact[]) {
  if (!inventory || inventory.length === 0) {
    return { recentActivities: [], chartData: [] };
  }

  // Ordenar inventário pela data
  const sorted = [...inventory].sort((a, b) => {
    return new Date(b.ultima_atualizacao).getTime() - new Date(a.ultima_atualizacao).getTime();
  });

  const recentActivities = sorted.slice(0, 50).map(item => {
    const d = new Date(item.ultima_atualizacao);
    const dateStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return {
      artifact: item,
      date: `${dateStr}, ${timeStr}`,
      title: item.titulo,
      responsavel: item.responsavel || "Sistema",
      status: "Atualizado",
      link: item.link
    };
  });

  const DAY_MS = 24 * 60 * 60 * 1000;
  
  const normalizeDate = (d: Date) => {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  
  // A âncora deve ser "HOJE" real para as datas.
  const anchorDate = normalizeDate(new Date());

  const itemsByDate: Record<number, Artifact[]> = {};
  for (const item of sorted) {
    const itemDate = normalizeDate(new Date(item.ultima_atualizacao));
    if (!itemsByDate[itemDate]) {
      itemsByDate[itemDate] = [];
    }
    itemsByDate[itemDate].push(item);
  }

  const chartData: { dateVal: number; value: number; items: Artifact[]; label?: string; height?: string }[] = [];
  let localMaxVal = 0;
  
  const DAYS_TO_SHOW = 10; // Mostrar 10 dias
  
  for (let i = DAYS_TO_SHOW - 1; i >= 0; i--) {
    const dayTime = anchorDate - (i * DAY_MS);
    const items = itemsByDate[dayTime] || [];
    localMaxVal = Math.max(localMaxVal, items.length);
    
    chartData.push({
      dateVal: dayTime,
      value: items.length,
      items: items
    });
  }

  chartData.forEach((cd) => {
    const dt = new Date(cd.dateVal);
    cd.label = `${dt.getDate().toString().padStart(2, '0')}/${(dt.getMonth()+1).toString().padStart(2, '0')}`;
  });

  // Calculate height, 0 is 0% but with a min height so it's visible. Max height should ideally be ~95%
  const chartDataWithHeight = chartData.map(cd => ({
    ...cd,
    height: localMaxVal > 0 ? `${(cd.value / localMaxVal) * 95}%` : "0%"
  }));

  return {
    recentActivities,
    chartData: chartDataWithHeight
  };
}
