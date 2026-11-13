// Usage: node scripts/a11y/responsive-check.mjs [base-url]
// Checks the listing and the open cart drawer at seven widths (320 to 1920 px): horizontal scrolling,
// grid columns, header and drawer fit, touch-target sizes, field font size, and axe at WCAG 2.2 AA.
// Expects the e2e mock data (it clicks "Add to cart: Product 1"): see playwright.config.ts for how to
// start it (mock API on :4010, app on :3100), or run: pnpm e2e once to build, then start both servers.
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

const base = (process.argv[2] ?? "http://localhost:3100").replace(/\/$/, "");
const widths = [320, 375, 640, 768, 1024, 1280, 1920];
const browser = await chromium.launch();
const wcag = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
console.log(
  "width | h-scroll | grid cols | header ok | targets <24px | targets <44px | field font | axe(list) | axe(drawer)",
);
for (const w of widths) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  const m = await page.evaluate(() => {
    const vis = (e) => {
      const r = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const targets = [...document.querySelectorAll("a[href], button, input, select, [role=button]")]
      .filter(vis)
      .filter((e) => !e.closest("dialog:not([open])"))
      .filter((e) => !e.classList.contains("skip-link"));
    const sizes = targets.map((e) => {
      const r = e.getBoundingClientRect();
      return {
        h: r.height,
        w: r.width,
        tag:
          e.tagName.toLowerCase() +
          (e.getAttribute("aria-label") ? `[${e.getAttribute("aria-label").slice(0, 28)}]` : ""),
      };
    });
    const grid = document.querySelector("main ul.grid");
    const cart = [...document.querySelectorAll("header button")].find((b) =>
      /^Cart/.test(b.getAttribute("aria-label") || ""),
    );
    const cr = cart.getBoundingClientRect();
    const field = document.querySelector("main input[type=search]");
    return {
      hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      cols: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
      headerOk: cr.right <= window.innerWidth && cr.left >= 0,
      small24: sizes
        .filter((s) => s.h < 24 || s.w < 24)
        .map((s) => `${s.tag} ${Math.round(s.w)}x${Math.round(s.h)}`),
      small44: sizes.filter((s) => (s.h < 44 && s.w < 44 ? true : s.h < 44)).length,
      fieldFont: getComputedStyle(field).fontSize,
    };
  });
  const axeList = (await new AxeBuilder({ page }).withTags(wcag).analyze()).violations.map(
    (v) => v.id,
  );
  await page.getByRole("button", { name: "Add to cart: Product 1" }).click();
  await page.getByRole("button", { name: /^Cart/ }).click();
  await page.getByRole("dialog", { name: "Your cart" }).getByText("Total").waitFor();
  const dr = await page.evaluate(() => {
    const d = document.querySelector("dialog[open]").getBoundingClientRect();
    return {
      fits: d.right <= window.innerWidth + 1 && d.left >= -1,
      width: Math.round(d.width),
      hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  const axeDrawer = (await new AxeBuilder({ page }).withTags(wcag).analyze()).violations.map(
    (v) => v.id,
  );
  console.log(
    `${String(w).padStart(5)} | ${m.hscroll ? "YES  " : "no   "}   | ${String(m.cols).padStart(9)} | ${m.headerOk ? "yes      " : "NO       "} | ${String(m.small24.length).padStart(13)} | ${String(m.small44).padStart(13)} | ${m.fieldFont.padStart(10)} | ${axeList.length ? axeList.join(",") : "clean"} | ${axeDrawer.length ? axeDrawer.join(",") : "clean"} | drawer ${dr.width}px ${dr.fits && !dr.hscroll ? "fits" : "OVERFLOWS"}`,
  );
  if (m.small24.length)
    console.log("      targets under 24px:", [...new Set(m.small24)].slice(0, 4).join("; "));
  await ctx.close();
}
await browser.close();
