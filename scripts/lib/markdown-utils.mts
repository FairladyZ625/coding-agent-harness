// @ts-nocheck
import { sanitizeText, slug } from "./core-shared.mjs";

export function markdownTableRows(content) {
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("|"))
    .map(splitMarkdownRow);
}


export function parseAllMarkdownTables(content, source, kindPrefix) {
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
    const block = [];
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

export function splitMarkdownRow(line) {
  let text = String(line || "").trim();
  if (text.startsWith("|")) text = text.slice(1);
  if (text.endsWith("|") && !text.endsWith("\\|")) text = text.slice(0, -1);
  const cells = [];
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

export function tableAfterHeading(content, headerPattern) {
  const rows = markdownTableRows(content);
  const headerIndex = rows.findIndex((cells) => cells.some((cell) => headerPattern.test(cell)));
  if (headerIndex < 0) return { header: [], rows: [] };
  const header = rows[headerIndex];
  const body = [];
  for (const row of rows.slice(headerIndex + 1)) {
    if (row.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    if (row.length !== header.length) break;
    body.push(row);
  }
  return { header, rows: body };
}

export function getColumn(header, name) {
  return header.findIndex((cell) => cell.toLowerCase() === name.toLowerCase());
}

export function getColumnAny(header, names) {
  return header.findIndex((cell) => names.some((name) => cell.toLowerCase() === name.toLowerCase()));
}

export function contentHasAny(content, terms) {
  return terms.some((term) => (term instanceof RegExp ? term.test(content) : content.includes(term)));
}

export function getCell(cells, names, fallback = "") {
  for (const name of names) {
    if (cells[name] !== undefined) return cells[name];
  }
  return fallback;
}

export function splitList(value) {
  return String(value || "")
    .split(/[,+;]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => item.toLowerCase() !== "none");
}

export function splitDependencies(value) {
  return String(value || "")
    .split(/\s*(?:,|;|\+|&|\/|\band\b|\bAND\b)\s*/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !/^(none|n\/a|na|-|—|–|无)$/i.test(item))
    .filter((item) => !/^same\b/i.test(item));
}

export function firstColumn(header, names) {
  for (const name of names) {
    const index = getColumn(header, name);
    if (index >= 0) return index;
  }
  return -1;
}

export function updateMarkdownTableRow(content, headerPattern, updater) {
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

export function upsertMarkdownTableRow(content, headerPattern, matcher, row) {
  const updated = updateMarkdownTableRow(content, headerPattern, (header, existing) => (matcher(header, existing) ? fitMarkdownTableRow(row, header.length) : null));
  if (updated.matched) return updated.content;
  return appendMarkdownTableRow(content, headerPattern, row);
}

export function appendMarkdownTableRow(content, headerPattern, row) {
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

export function fitMarkdownTableRow(row, length) {
  const next = row.map(markdownTableCell);
  while (next.length < length) next.push("");
  return next.slice(0, length);
}

function markdownTableCell(value) {
  return String(value || "")
    .replace(/\r?\n/g, " ")
    .replaceAll("|", "\\|")
    .trim();
}
