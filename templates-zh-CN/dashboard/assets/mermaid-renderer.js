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
  return { nodes: [...nodes.entries()], edges };
}

function renderSvg({ nodes, edges }) {
  const width = Math.max(360, nodes.length * 150);
  const height = 150;
  const positions = new Map(nodes.map(([id], index) => [id, { x: 70 + index * 140, y: 70 }]));
  const nodeSvg = nodes.map(([id, label]) => {
    const pos = positions.get(id);
    return `<g class="mermaid-node">
      <rect x="${pos.x - 54}" y="${pos.y - 24}" width="108" height="48" rx="8"></rect>
      <text x="${pos.x}" y="${pos.y + 4}" text-anchor="middle">${escapeMermaid(label).replaceAll("\\n", " ")}</text>
    </g>`;
  }).join("");
  const edgeSvg = edges.map(([from, to]) => {
    const a = positions.get(from);
    const b = positions.get(to);
    if (!a || !b) return "";
    return `<path class="mermaid-edge" d="M ${a.x + 54} ${a.y} L ${b.x - 62} ${b.y}"></path><path class="mermaid-arrow" d="M ${b.x - 62} ${b.y} l -7 -5 v 10 z"></path>`;
  }).join("");
  return `<figure class="mermaid-rendered">
    <figcaption>Mermaid</figcaption>
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Mermaid flowchart">${edgeSvg}${nodeSvg}</svg>
  </figure>`;
}

function escapeMermaid(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
