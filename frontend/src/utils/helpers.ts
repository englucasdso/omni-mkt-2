import { Artifact } from "../types";
import { isMap, isDocumentation } from "../domain/artifacts";
import { resolveMeasurementClass } from "../domain/measurement";

export const normalizar = (txt: string): string => {
  return String(txt || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
};

// Criar um Intl.DateTimeFormat é caro: o formatador é criado uma vez e reaproveitado
let cachedDateTimeFormatter: Intl.DateTimeFormat | null = null;
const getDateTimeFormatter = (): Intl.DateTimeFormat => {
  if (!cachedDateTimeFormatter) {
    cachedDateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return cachedDateTimeFormatter;
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
    const formatter = getDateTimeFormatter();

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
