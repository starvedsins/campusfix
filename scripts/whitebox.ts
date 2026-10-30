import ts from "typescript";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import sharp from "sharp";
const modules = [
  {
    id: "AUTH",
    name: "accountAccess",
    file: "src/lib/policies.ts",
    labels: ["Inactive?", "No lock?", "Lock is in future?"],
    outcomes: ["INACTIVE", "OPEN", "LOCKED", "OPEN"],
    cases: [
      "Inactive account",
      "Active, no lock",
      "Active, future lock",
      "Active, expired lock",
    ],
    predicates: 3,
    sequential: false,
  },
  {
    id: "PHOTO",
    name: "validatePhotoSize",
    file: "src/lib/domain.ts",
    labels: ["Size is not an integer?", "Size below 1?", "Size above 4500000?"],
    outcomes: ["Reject", "Reject", "Reject", "Accept size"],
    cases: ["1.5 bytes", "0 bytes", "4500001 bytes", "4500000 bytes"],
    predicates: 3,
    sequential: false,
  },
  {
    id: "DISPATCH",
    name: "priorityHours",
    file: "src/lib/policies.ts",
    labels: ["Priority P1?", "Priority P2?"],
    outcomes: ["4 hours", "24 hours", "72 hours"],
    cases: ["P1_CRITICAL", "P2_URGENT", "P3_ROUTINE"],
    predicates: 2,
    sequential: false,
  },
  {
    id: "REPAIR",
    name: "completionDecision",
    file: "src/lib/policies.ts",
    labels: ["Another technician?", "Work not started?", "No verified proof?"],
    outcomes: ["FORBIDDEN", "NOT_STARTED", "MISSING_PROOF", "READY"],
    cases: [
      "Other technician",
      "Assigned state",
      "In progress, no proof",
      "In progress, proof present",
    ],
    predicates: 3,
    sequential: false,
  },
  {
    id: "NOTIFY",
    name: "deliveryChannels",
    file: "src/lib/policies.ts",
    labels: ["Email enabled?", "SMS enabled?"],
    outcomes: ["Append EMAIL", "Append SMS", "Return channels"],
    cases: ["false, false => []", "true, false => EMAIL", "false, true => SMS"],
    predicates: 2,
    sequential: true,
  },
  {
    id: "CSV",
    name: "csvCell",
    file: "src/lib/reports.ts",
    labels: ["Value present?", "Formula prefix?"],
    outcomes: ["Convert to text", "Add apostrophe", "Quote and escape"],
    cases: [
      "null => empty quoted cell",
      "Plain text => quoted text",
      "=HYPERLINK(1) => escaped formula",
    ],
    predicates: 2,
    sequential: true,
  },
];
await mkdir("docs/graphs", { recursive: true });
const out = [
  "# White-box test evidence",
  "",
  "Scope: one production decision routine from each assessed module. These graphs do not describe the complexity of the whole application. The routines are called by the production services. The tests also exercise the full services with PostgreSQL.",
  "",
  "Method 1: V(G) = E - N + 2. Method 2: V(G) = P + 1, where P is the count of binary decision nodes. Method 3: V(G) is the number of graph regions, including the outside region. Each graph below is connected and has one exit. Throw and return edges both lead to that exit.",
  "",
];
for (const m of modules) {
  const source = await readFile(m.file, "utf8");
  const ast = ts.createSourceFile(m.file, source, ts.ScriptTarget.Latest, true);
  let fn: ts.FunctionDeclaration | undefined;
  ast.forEachChild((n) => {
    if (ts.isFunctionDeclaration(n) && n.name?.text === m.name) fn = n;
  });
  if (!fn?.body) throw new Error(`Routine missing: ${m.name}`);
  let decisions = 0;
  const visit = (n: ts.Node) => {
    if (ts.isIfStatement(n)) decisions++;
    n.forEachChild(visit);
  };
  visit(fn.body);
  if (decisions !== m.predicates)
    throw new Error(
      `Update the graph for ${m.name}. Its decision count changed.`,
    );
  const nodes = m.sequential ? 7 : m.predicates * 2 + 3;
  const edges = nodes + decisions - 1;
  const exit = nodes;
  const code = ["flowchart TD", "  n1([1 Start])"];
  const graphEdges: [number, number, string?][] = [[1, 2]];
  for (let i = 0; i < decisions; i++) {
    const d = 2 + i * 2,
      b = d + 1;
    code.push(`  n${d}{${d} ${m.labels[i]}}`, `  n${b}[${b} ${m.outcomes[i]}]`);
    graphEdges.push([d, b, "Yes"]);
    if (m.sequential) {
      graphEdges.push([d, d + 2, "No"], [b, d + 2]);
    } else graphEdges.push([d, d + 2, "No"], [b, exit]);
  }
  const last = nodes - 1;
  code.push(
    `  n${last}[${last} ${m.outcomes.at(-1)}]`,
    `  n${exit}([${exit} Exit])`,
  );
  graphEdges.push([last, exit]);
  for (const [a, b, label] of graphEdges)
    code.push(`  n${a} -->${label ? `|${label}|` : ""} n${b}`);
  if (graphEdges.length !== edges)
    throw new Error(`Edge count mismatch: ${m.name}`);
  const paths = m.sequential
    ? [
        "1,2,4,6,7",
        "1,2,3,4,6,7",
        m.id === "CSV" ? "1,2,3,4,5,6,7" : "1,2,4,5,6,7",
      ]
    : Array.from({ length: decisions + 1 }, (_, i) =>
        [
          1,
          ...Array.from({ length: i + 1 }, (_, j) => 2 + j * 2).filter(
            (n) => n <= last,
          ),
          ...(i < decisions ? [3 + i * 2] : []),
          exit,
        ].join(","),
      );
  const line = ast.getLineAndCharacterOfPosition(fn.getStart()).line + 1;
  const pseudocode = m.sequential
    ? [
        m.id === "CSV"
          ? "SET text to an empty string"
          : "SET channels to an empty list",
        ...m.labels.map(
          (condition, i) => `IF ${condition} THEN ${m.outcomes[i]}`,
        ),
        m.outcomes.at(-1)!,
        "END",
      ]
    : [
        "START",
        ...m.labels.map(
          (condition, i) =>
            `IF ${condition} THEN ${m.id === "PHOTO" ? "REJECT input and exit" : "RETURN " + m.outcomes[i]}`,
        ),
        m.id === "PHOTO" ? "ACCEPT the size" : `RETURN ${m.outcomes.at(-1)}`,
        "END",
      ];
  const escape = (s: string) =>
    s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const shapes: string[] = [];
  const box = (x: number, y: number, text: string, decision = false) => {
    shapes.push(
      decision
        ? `<polygon points="${x},${y - 44} ${x + 150},${y} ${x},${y + 44} ${x - 150},${y}" fill="#eef3ed" stroke="#285b48" stroke-width="2"/>`
        : `<rect x="${x - 125}" y="${y - 30}" width="250" height="60" rx="12" fill="#f7f9f7" stroke="#285b48" stroke-width="2"/>`,
    );
    shapes.push(
      `<text x="${x}" y="${y + 5}" text-anchor="middle" font-size="15">${escape(text)}</text>`,
    );
  };
  const arrow = (points: string, text?: string, x = 0, y = 0) => {
    shapes.push(
      `<path d="${points}" fill="none" stroke="#476354" stroke-width="2" marker-end="url(#arrow)"/>`,
    );
    if (text)
      shapes.push(`<text x="${x}" y="${y}" font-size="14">${text}</text>`);
  };
  box(300, 80, "1 Start");
  arrow("M300 110 L300 146");
  for (let i = 0; i < decisions; i++) {
    const y = 190 + i * 160,
      n = 2 + i * 2;
    box(300, y, `${n} ${m.labels[i]}`, true);
    box(650, y, `${n + 1} ${m.outcomes[i]}`);
    arrow(`M450 ${y} L525 ${y}`, "Yes", 473, y - 10);
    const nextY =
      i === decisions - 1
        ? m.sequential
          ? 570
          : 190 + decisions * 160
        : y + 160;
    arrow(
      `M300 ${y + 44} L300 ${nextY - (i === decisions - 1 ? 30 : 44)}`,
      "No",
      312,
      y + 85,
    );
    if (m.sequential)
      arrow(`M650 ${y + 30} L650 ${nextY - 65} L390 ${nextY - 15}`);
    else {
      const lane = 970 - i * 65;
      arrow(`M775 ${y} L${lane} ${y} L${lane} 790 L775 790`);
    }
  }
  if (m.sequential) {
    box(300, 570, `${last} ${m.outcomes.at(-1)}`);
    box(300, 730, `${exit} Exit`);
    arrow("M300 600 L300 700");
  } else {
    const y = 190 + decisions * 160;
    box(300, y, `${last} ${m.outcomes.at(-1)}`);
    box(650, 790, `${exit} Exit`);
    arrow(`M300 ${y + 30} L300 790 L525 790`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1040" height="900"><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="#476354"/></marker></defs><rect width="1040" height="900" fill="white"/><g font-family="Arial" fill="#173b2e"><text x="40" y="35" font-size="23" font-weight="bold">${m.id}: ${m.name}</text>${shapes.join("")}<text x="40" y="870" font-size="18">N=${nodes}, E=${edges}, P=${decisions}, V(G)=${decisions + 1}. Count the outside region.</text></g></svg>`;
  await writeFile(`docs/graphs/${m.id.toLowerCase()}.svg`, svg);
  await sharp(Buffer.from(svg))
    .png()
    .toFile(`docs/graphs/${m.id.toLowerCase()}.png`);
  out.push(
    `## ${m.id}: ${m.name}`,
    "",
    `Source: [${m.file}:${line}](../${m.file}).`,
    "",
    `![${m.id} control flow graph](graphs/${m.id.toLowerCase()}.png)`,
    "",
    "```mermaid",
    ...code,
    "```",
    "",
    `N = ${nodes}, E = ${edges}, P = ${decisions}.`,
    "",
    `1. Edges and nodes: ${edges} - ${nodes} + 2 = **${decisions + 1}**.`,
    `2. Predicate nodes: ${decisions} + 1 = **${decisions + 1}**.`,
    `3. Regions: ${decisions} bounded regions + 1 outside region = **${decisions + 1}**.`,
    "",
    "| Path | Nodes | Test input and expected result |",
    "|---|---|---|",
    ...paths.map((p, i) => `| ${m.id} P${i + 1} | ${p} | ${m.cases[i]} |`),
    "",
    "Pseudocode:",
    "",
    "```text",
    ...pseudocode,
    "```",
    "",
    "Production routine:",
    "",
    "```typescript",
    source.slice(fn.getStart(), fn.end),
    "```",
    "",
  );
  await writeFile(`docs/graphs/${m.id.toLowerCase()}.mmd`, code.join("\n"));
}
out.push(
  "The NOTIFY suite also tests both channels together. The CSV formula path passes through the value conversion node before the formula guard. The empty-value path cannot reach the formula branch because its text is empty. The tests include exact lock expiry and the full description and image boundaries.",
  "",
  "Run `npm run docs:whitebox`, then `npm run test:coverage`. See [test results](evidence/Test_Results.md). A failed test or changed decision count requires a new review.",
);
await writeFile("docs/White_Box_Tests.md", out.join("\n"));
console.log("Saved six source-checked control flow graphs and path tables.");
