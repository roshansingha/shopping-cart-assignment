// Usage: pnpm coverage:report
// Runs the tests with coverage and writes docs/coverage-report.md, so the report lives in the repo
// and not only in CI. The full interactive HTML report is also uploaded by CI as an artifact.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const run = spawnSync(
  "pnpm",
  [
    "exec",
    "vitest",
    "run",
    "--coverage",
    "--coverage.reporter=json-summary",
    "--coverage.reporter=text-summary",
  ],
  { cwd: root, stdio: "inherit" },
);
const thresholdsMet = run.status === 0;

const summary = JSON.parse(readFileSync(resolve(root, "coverage/coverage-summary.json"), "utf8"));
const pct = (n) => `${Number.isInteger(n) ? n : n.toFixed(1)}%`;
const total = summary.total;

const files = Object.entries(summary)
  .filter(([k]) => k !== "total")
  .map(([k, v]) => ({ file: relative(root, k), ...v }))
  .sort((a, b) => a.file.localeCompare(b.file));

const groups = new Map();
for (const f of files) {
  const dir = f.file
    .split("/")
    .slice(0, f.file.startsWith("src/features/") ? 3 : 2)
    .join("/");
  if (!groups.has(dir)) groups.set(dir, []);
  groups.get(dir).push(f);
}

const line = (f, dir) =>
  `- \`${f.file.slice(dir.length + 1)}\`: lines ${pct(f.lines.pct)}, branches ${pct(f.branches.pct)}, functions ${pct(f.functions.pct)}`;

const md = `# Coverage report

Generated on ${new Date().toISOString().slice(0, 10)} by \`pnpm coverage:report\`. Regenerate it after
changing code or tests. CI also uploads the full interactive HTML report with every run (the
\`coverage-report\` artifact on the Actions run page).

## Result

- **Thresholds:** ${thresholdsMet ? "all met" : "NOT MET (the run failed, see the output above)"}.
- **Lines:** ${pct(total.lines.pct)} (${total.lines.covered} of ${total.lines.total})
- **Statements:** ${pct(total.statements.pct)}
- **Branches:** ${pct(total.branches.pct)} (${total.branches.covered} of ${total.branches.total})
- **Functions:** ${pct(total.functions.pct)}

## Thresholds, and why

- **80% across the project** (lines, functions, branches, statements). A floor that catches
  neglected code without rewarding tests of framework glue.
- **95% on the cart logic, the saved-cart validation and the query logic.** They hold the money and
  input rules and are plain functions, so high coverage is cheap and meaningful.
- The build fails if coverage drops below a threshold. The settings are in \`vitest.config.ts\`.
- Coverage shows that code ran, not that a test would notice it breaking. See
  [testing-strategy.md](testing-strategy.md) for how that is checked.

## Reading the low numbers

- **\`page.tsx\` and \`cart-hydrator.tsx\` show 0%** because unit tests do not run them. The browser tests
  do: every one loads the page, and the "two tabs stay in sync" test exercises the hydrator. Coverage
  from the browser tests is not included in this report.
- **\`site.ts\`** is two constants (the brand name and description).
- **Low branch numbers on a few components** (\`filters.tsx\`, \`error.tsx\`, \`store.ts\`) are
  defensive branches and default values that no test takes. The strict 95% bar applies to the cart
  logic, the saved-cart validation and the query logic, which are all at 100%.

## Per file

${[...groups.entries()].map(([dir, fs]) => `### \`${dir}\`\n\n${fs.map((f) => line(f, dir)).join("\n")}`).join("\n\n")}
`;
writeFileSync(resolve(root, "docs/coverage-report.md"), md);
console.log(
  `\nwrote docs/coverage-report.md (${files.length} files, thresholds ${thresholdsMet ? "met" : "NOT met"})`,
);
process.exit(thresholdsMet ? 0 : 1);
