window.HarnessMermaid = {
  render(code = "") {
    const parsed = parseFlowchart(code);
    if (!parsed) {
      return `<figure class="mermaid-fallback">
        <figcaption>Mermaid source</figcaption>
        <pre>${escapeMermaid(code)}</pre>
      </figure>`;
    }
    return renderSvg(parsed);
  },
};

function parseFlowchart(code) {
  const lines = String(code || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!/^flowchart\s+(LR|TB|TD|RL|BT)/i.test(lines[0] || "")) return null;
  const nodes = new Map();
  const edges = [];
  for (const line of lines.slice(1)) {
    const edgeMatch = line.match(/^([A-Za-z0-9_-]+)(?:\["([^"]+)"\])?\s*-+>\s*([A-Za-z0-9_-]+)(?:\["([^"]+)"\])?/);
    if (!edgeMatch) continue;
    const [, from, fromLabel, to, toLabel] = edgeMatch;
    nodes.set(from, fromLabel || from);
    nodes.set(to, toLabel || to);
    edges.push([from, to]);
  }
  if (nodes.size === 0) return null;
  const direction = (lines[0].match(/^flowchart\s+(LR|TB|TD|RL|BT)/i)?.[1] || "LR").toUpperCase();
  return { direction, nodes: [...nodes.entries()], edges };
}

function renderSvg({ direction, nodes, edges }) {
  const layout = layoutNodes(nodes, direction);
  const { positions, width, height } = layout;
  const nodeSvg = nodes.map(([id, label]) => {
    const pos = positions.get(id);
    const displayLabel = truncateLabel(label);
    return `<g class="mermaid-node">
      <title>${escapeMermaid(label).replaceAll("\\n", " ")}</title>
      <rect x="${pos.x - pos.width / 2}" y="${pos.y - 24}" width="${pos.width}" height="48" rx="8"></rect>
      <text x="${pos.x}" y="${pos.y + 4}" text-anchor="middle">${escapeMermaid(displayLabel)}</text>
    </g>`;
  }).join("");
  const edgeSvg = edges.map(([from, to]) => {
    const a = positions.get(from);
    const b = positions.get(to);
    if (!a || !b) return "";
    const horizontal = Math.abs(a.x - b.x) > Math.abs(a.y - b.y);
    const startX = horizontal ? a.x + Math.sign(b.x - a.x) * (a.width / 2) : a.x;
    const startY = horizontal ? a.y : a.y + Math.sign(b.y - a.y) * 24;
    const endX = horizontal ? b.x - Math.sign(b.x - a.x) * (b.width / 2 + 8) : b.x;
    const endY = horizontal ? b.y : b.y - Math.sign(b.y - a.y) * 32;
    const arrow = horizontal
      ? `M ${endX} ${endY} l ${b.x > a.x ? -7 : 7} -5 v 10 z`
      : `M ${endX} ${endY} l -5 ${b.y > a.y ? -7 : 7} h 10 z`;
    return `<path class="mermaid-edge" d="M ${startX} ${startY} L ${endX} ${endY}"></path><path class="mermaid-arrow" d="${arrow}"></path>`;
  }).join("");
  return `<figure class="mermaid-rendered">
    <figcaption>Mermaid</figcaption>
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Mermaid flowchart">${edgeSvg}${nodeSvg}</svg>
  </figure>`;
}

function layoutNodes(nodes, direction) {
  const vertical = ["TD", "TB", "BT"].includes(direction);
  const nodeSizes = nodes.map(([id, label]) => [id, nodeWidth(label)]);
  const positions = new Map();
  const margin = 48;
  const rowGap = 104;
  const colGap = 34;
  if (vertical) {
    const maxWidth = Math.max(220, ...nodeSizes.map(([, width]) => width));
    nodeSizes.forEach(([id, width], index) => {
      positions.set(id, { x: margin + maxWidth / 2, y: margin + 24 + index * rowGap, width });
    });
    return { positions, width: maxWidth + margin * 2, height: Math.max(150, margin * 2 + nodeSizes.length * rowGap) };
  }

  const maxPerRow = nodes.length > 5 ? Math.ceil(Math.sqrt(nodes.length * 1.4)) : nodes.length;
  let y = margin + 24;
  let width = 360;
  for (let index = 0; index < nodeSizes.length; index += maxPerRow) {
    const row = nodeSizes.slice(index, index + maxPerRow);
    let x = margin;
    for (const [id, nodeW] of row) {
      positions.set(id, { x: x + nodeW / 2, y, width: nodeW });
      x += nodeW + colGap;
    }
    width = Math.max(width, x + margin - colGap);
    y += rowGap;
  }
  return { positions, width, height: Math.max(150, y + margin - rowGap) };
}

function nodeWidth(label) {
  return Math.max(112, Math.min(240, String(label || "").replaceAll("\\n", " ").length * 7 + 34));
}

function truncateLabel(label) {
  const text = String(label || "").replaceAll("\\n", " ");
  return text.length > 28 ? `${text.slice(0, 25)}...` : text;
}

function escapeMermaid(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
