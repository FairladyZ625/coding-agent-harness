import { sanitizeText, slug } from "./core-shared.mjs";

type MarkdownCells = Record<string, string>;
type MarkdownTableRow = {
  id: string;
  cells: MarkdownCells;
};
type MarkdownTable = {
  id: string;
  kind: string;
  source: string;
  line: number;
  columns: string[];
  rows: MarkdownTableRow[];
};
type TableUpdateResult = {
  content: string;
  matched: boolean;
};

export function markdownTableRows(content: string): string[][] {
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("|"))
    .map(splitMarkdownRow);
}


export function parseAllMarkdownTables(content: string, source: string, kindPrefix: string): MarkdownTable[] {
  const lines = content.split(/\r?\n/);
  const tables = [];
  let index = 0;
  let tableIndex = 1;
  while (index < lines.length) {
    if (!lines[index].trim().startsWith("|")) {
      index += 1;
      continue;
    }
    const start = index;
    const block: string[] = [];
    while (index < lines.length && lines[index].trim().startsWith("|")) {
      block.push(lines[index]);
      index += 1;
    }
    if (block.length < 2) continue;
    const rows = block.map(splitMarkdownRow);
    const separator = rows[1] || [];
    if (!separator.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    const columns = rows[0];
    const dataRows = rows.slice(2).filter((row) => row.length === columns.length);
    tables.push({
      id: `${slug(kindPrefix)}-${String(tableIndex).padStart(2, "0")}`,
      kind: kindPrefix,
      source,
      line: start + 1,
      columns,
      rows: dataRows.map((row, rowIndex) => ({
        id: `${slug(kindPrefix)}-${String(tableIndex).padStart(2, "0")}-row-${String(rowIndex + 1).padStart(3, "0")}`,
        cells: Object.fromEntries(columns.map((column, columnIndex) => [column, sanitizeText(row[columnIndex] || "")])),
      })),
    });
    tableIndex += 1;
  }
  return tables;
}

export function splitMarkdownRow(line: string): string[] {
  let text = String(line || "").trim();
  if (text.startsWith("|")) text = text.slice(1);
  if (text.endsWith("|") && !text.endsWith("\\|")) text = text.slice(0, -1);
  const cells: string[] = [];
  let current = "";
  let inCode = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\\" && text[index + 1] === "|") {
      current += "|";
      index += 1;
      continue;
    }
    if (char === "`") inCode = !inCode;
    if (char === "|" && !inCode) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

export function tableAfterHeading(content: string, headerPattern: RegExp): { header: string[]; rows: string[][] } {
  const rows = markdownTableRows(content);
  const headerIndex = rows.findIndex((cells) => cells.some((cell) => headerPattern.test(cell)));
  if (headerIndex < 0) return { header: [], rows: [] };
  const header = rows[headerIndex];
  const body: string[][] = [];
  for (const row of rows.slice(headerIndex + 1)) {
    if (row.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    if (row.length !== header.length) break;
    body.push(row);
  }
  return { header, rows: body };
}

export function stripFencedCodeBlocks(content: string): string {
  const lines = String(content || "").split(/\r?\n/);
  const result: string[] = [];
  let fence = "";
  for (const line of lines) {
    const match = line.match(/^\s{0,3}(```|~~~)/);
    if (match) {
      if (!fence) fence = match[1];
      else if (match[1] === fence) fence = "";
      continue;
    }
    if (!fence) result.push(line);
  }
  return result.join("\n");
}

export function removeHeadingSectionOutsideFences(content: string, headingPattern: RegExp): string {
  const lines = String(content || "").split(/\r?\n/);
  let fence = "";
  let start = -1;
  let end = lines.length;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fenceMatch = line.match(/^\s{0,3}(```|~~~)/);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1];
      else if (fenceMatch[1] === fence) fence = "";
      continue;
    }
    if (fence) continue;
    if (start < 0 && headingPattern.test(line.trim())) {
      start = index;
      if (start > 0 && !lines[start - 1].trim()) start -= 1;
      continue;
    }
    if (start >= 0 && index > start && /^##\s+/.test(line.trim())) {
      end = index;
      break;
    }
  }
  if (start < 0) return String(content || "");
  return [...lines.slice(0, start), ...lines.slice(end)].join("\n");
}

export function getColumn(header: string[], name: string): number {
  return header.findIndex((cell) => cell.toLowerCase() === name.toLowerCase());
}

export function getColumnAny(header: string[], names: string[]): number {
  return header.findIndex((cell) => names.some((name) => cell.toLowerCase() === name.toLowerCase()));
}

export function contentHasAny(content: string, terms: Array<string | RegExp>): boolean {
  return terms.some((term) => (term instanceof RegExp ? term.test(content) : content.includes(term)));
}

export function getCell(cells: MarkdownCells, names: string[], fallback = ""): string {
  for (const name of names) {
    if (cells[name] !== undefined) return cells[name];
  }
  return fallback;
}

export function splitList(value: unknown): string[] {
  return String(value || "")
    .split(/[,+;]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => item.toLowerCase() !== "none");
}

export function splitDependencies(value: unknown): string[] {
  return String(value || "")
    .split(/\s*(?:,|;|\+|&|\/|\band\b|\bAND\b)\s*/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !/^(none|n\/a|na|-|—|–|无)$/i.test(item))
    .filter((item) => !/^same\b/i.test(item));
}

export function firstColumn(header: string[], names: string[]): number {
  for (const name of names) {
    const index = getColumn(header, name);
    if (index >= 0) return index;
  }
  return -1;
}

export function updateMarkdownTableRow(content: string, headerPattern: RegExp, updater: (header: string[], row: string[]) => string[] | null): TableUpdateResult {
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].trim().startsWith("|")) continue;
    const header = splitMarkdownRow(lines[index]);
    if (!header.some((cell) => headerPattern.test(cell))) continue;
    let matched = false;
    let rowIndex = index + 2;
    while (rowIndex < lines.length && lines[rowIndex].trim().startsWith("|")) {
      const row = splitMarkdownRow(lines[rowIndex]);
      if (row.length === header.length && !row.every((cell) => /^:?-{3,}:?$/.test(cell))) {
        const next = updater(header, row);
        if (!next) {
          rowIndex += 1;
          continue;
        }
        matched = true;
        if (next.join("\u0000") !== row.join("\u0000")) matched = true;
        lines[rowIndex] = `| ${next.join(" | ")} |`;
      }
      rowIndex += 1;
    }
    return { content: lines.join("\n"), matched };
  }
  return { content, matched: false };
}

export function upsertMarkdownTableRow(content: string, headerPattern: RegExp, matcher: (header: string[], row: string[]) => boolean, row: unknown[]): string {
  const updated = updateMarkdownTableRow(content, headerPattern, (header, existing) => (matcher(header, existing) ? fitMarkdownTableRow(row, header.length) : null));
  if (updated.matched) return updated.content;
  return appendMarkdownTableRow(content, headerPattern, row);
}

export function appendMarkdownTableRow(content: string, headerPattern: RegExp, row: unknown[]): string {
  const lines = String(content || "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].trim().startsWith("|")) continue;
    const header = splitMarkdownRow(lines[index]);
    if (!header.some((cell) => headerPattern.test(cell))) continue;
    let insertAt = index + 2;
    while (insertAt < lines.length && lines[insertAt].trim().startsWith("|")) insertAt += 1;
    lines.splice(insertAt, 0, `| ${fitMarkdownTableRow(row, header.length).join(" | ")} |`);
    return lines.join("\n");
  }
  return `${String(content || "").trimEnd()}\n\n| ${row.map(markdownTableCell).join(" | ")} |\n`;
}

export function fitMarkdownTableRow(row: unknown[], length: number): string[] {
  const next = row.map(markdownTableCell);
  while (next.length < length) next.push("");
  return next.slice(0, length);
}

function markdownTableCell(value: unknown): string {
  return String(value || "")
    .replace(/\r?\n/g, " ")
    .replaceAll("|", "\\|")
    .trim();
}
