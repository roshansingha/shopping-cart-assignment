// Usage: node scripts/perf/lighthouse.mjs <label> [url] [runs]
// Runs Lighthouse (mobile and desktop) several times and writes medians to docs/perf/<label>-lighthouse.json
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const [label = "run", url = "http://localhost:3100/", runsArg = "3"] = process.argv.slice(2);
const runs = Number(runsArg);
// LH_THROTTLING=devtools applies real network/CPU throttling instead of Lighthouse's default simulation.
const throttling = process.env.LH_THROTTLING ?? "simulate";
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
mkdirSync("docs/perf", { recursive: true });
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

const out = {};
const forms = (process.env.LH_FORMS ?? "mobile,desktop").split(",");
for (const form of forms) {
  const samples = [];
  for (let i = 0; i < runs; i++) {
    const file = `/tmp/lh-${label}-${form}-${i}.json`;
    const args = [
      "exec",
      "lighthouse",
      url,
      "--quiet",
      "--output=json",
      `--output-path=${file}`,
      `--chrome-path=${chrome}`,
      "--chrome-flags=--headless=new --no-sandbox",
      "--only-categories=performance,accessibility,best-practices",
      `--throttling-method=${throttling}`,
    ];
    if (form === "desktop") args.push("--preset=desktop");
    execFileSync("corepack", ["pnpm", ...args], { stdio: "pipe", timeout: 180000 });
    const r = JSON.parse(readFileSync(file, "utf8"));
    const a = r.audits;
    samples.push({
      performance: Math.round(r.categories.performance.score * 100),
      accessibility: Math.round(r.categories.accessibility.score * 100),
      bestPractices: Math.round(r.categories["best-practices"].score * 100),
      fcpMs: Math.round(a["first-contentful-paint"].numericValue),
      lcpMs: Math.round(a["largest-contentful-paint"].numericValue),
      tbtMs: Math.round(a["total-blocking-time"].numericValue),
      cls: Number(a["cumulative-layout-shift"].numericValue.toFixed(3)),
      speedIndexMs: Math.round(a["speed-index"].numericValue),
      transferKB: Math.round(a["total-byte-weight"].numericValue / 1024),
      lcpElement:
        a[
          "largest-contentful-paint-element"
        ]?.details?.items?.[0]?.items?.[0]?.node?.snippet?.slice(0, 90) ?? null,
      lcpLazyLoaded: a["lcp-lazy-loaded"]?.score === 0,
    });
  }
  const keys = [
    "performance",
    "accessibility",
    "bestPractices",
    "fcpMs",
    "lcpMs",
    "tbtMs",
    "cls",
    "speedIndexMs",
    "transferKB",
  ];
  out[form] = {
    runs: samples.length,
    median: Object.fromEntries(keys.map((k) => [k, median(samples.map((s) => s[k]))])),
    lcpElement: samples[0].lcpElement,
    lcpLazyLoaded: samples.some((s) => s.lcpLazyLoaded),
    samples,
  };
}
writeFileSync(`docs/perf/${label}-lighthouse.json`, JSON.stringify(out, null, 2) + "\n");
for (const f of ["mobile", "desktop"])
  console.log(
    f,
    JSON.stringify(out[f].median),
    "\n  LCP element:",
    out[f].lcpElement,
    "| lcp lazy-loaded:",
    out[f].lcpLazyLoaded,
  );
