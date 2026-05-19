window.HarnessMarkdown = {
  render(markdown = "", mode = "rendered") {
    if (mode === "source") return `<pre><code>${escapeHtml(markdown)}</code></pre>`;
    return renderBlocks(markdown);
  },
};

function renderBlocks(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const code = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push(lang === "mermaid" ? window.HarnessMermaid.render(code.join("\n")) : `<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }
    if (/^#{1,3}\s+/.test(line)) {
      const level = line.match(/^#+/)[0].length;
      blocks.push(`<h${level}>${inline(line.replace(/^#{1,3}\s+/, ""))}</h${level}>`);
      index += 1;
      continue;
    }
    if (isTableStart(lines, index)) {
      const table = [];
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        table.push(lines[index]);
        index += 1;
      }
      blocks.push(renderTable(table));
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
        items.push(`<li>${inline(lines[index].replace(/^[-*]\s+/, ""))}</li>`);
        index += 1;
      }
      blocks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }
    const paragraph = [];
    while (index < lines.length && lines[index].trim() && !/^#{1,3}\s+/.test(lines[index]) && !lines[index].startsWith("```") && !isTableStart(lines, index)) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(`<p>${inline(paragraph.join(" "))}</p>`);
  }
  return blocks.join("");
}

function isTableStart(lines, index) {
  return lines[index]?.trim().startsWith("|") && /^(\s*\|?\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1] || "");
}

function renderTable(lines) {
  const rows = lines.map(splitMarkdownRow);
  const header = rows[0] || [];
  const body = rows.slice(2).filter((row) => row.length === header.length);
  return `<div class="rendered-table-wrap"><table class="rendered-table">
    <thead><tr>${header.map((cell) => `<th>${inline(cell)}</th>`).join("")}</tr></thead>
    <tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
  </table></div>`;
}

function splitMarkdownRow(line) {
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

function inline(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
