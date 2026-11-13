/**
 * Documento de padrões extraído do Confluence pelo extrator (bookmarklet).
 * O formato é o mesmo no extrator, no servidor e na tela.
 */
export type StandardBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'code'; title: string; language: string; text: string }
  | { type: 'table'; section: string; headers: string[]; rows: string[][] };

export interface StandardDoc {
  /** Gerado no servidor a partir do endereço (ou do título) da página */
  id: string;
  source: 'confluence';
  version: 1;
  title: string;
  url: string;
  /** Quando o extrator rodou na página */
  extractedAt: string;
  /** Quando o arquivo foi enviado ao OMNI */
  importedAt: string;
  /** Tabela de cabeçalho da página (Código do Documento, Status do Documento, Task...) */
  meta: Record<string, string>;
  blocks: StandardBlock[];
}
