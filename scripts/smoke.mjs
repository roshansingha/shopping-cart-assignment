// Usage: node scripts/smoke.mjs <base-url>
// Post-deploy smoke test: checks the running site end to end over plain HTTP.
// Works against `next start` locally and against the deployed URL. Exits non-zero on any failure.

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const results = [];
const check = async (name, fn) => {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail ?? "" });
  } catch (e) {
    results.push({ name, ok: false, detail: e.message });
  }
};
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const get = (path, init) => fetch(base + path, { redirect: "manual", ...init });
const cards = (html) => (html.match(/aria-label="Add to cart: /g) ?? []).length;
// React server-renders <!-- --> separators between adjacent text nodes ("20<!-- --> products").
const text = (html) => html.replace(/<!--.*?-->/g, "");
const total = (html) => Number(/(\d+) products?\b/.exec(text(html))?.[1]);

let home = "";
let homeHeaders;

await check("home page responds 200 with the listing", async () => {
  const res = await get("/");
  assert(res.status === 200, `status ${res.status}`);
  home = await res.text();
  homeHeaders = res.headers;
  assert(/<h1[^>]*>Products<\/h1>/.test(home), "no <h1>Products</h1>");
  assert(cards(home) === 8, `expected 8 product cards on page 1, found ${cards(home)}`);
  const saved = text(home).includes("saved copy of the catalog");
  return `${total(home)} products, 8 on page 1${saved ? "  (NOTE: serving the saved catalog, live API unreachable)" : ""}`;
});

await check("security headers are present, framework banner hidden", async () => {
  const h = homeHeaders;
  const csp = h.get("content-security-policy") ?? "";
  assert(csp.includes("default-src 'self'"), "CSP missing or without default-src");
  assert(csp.includes("frame-ancestors 'none'"), "CSP missing frame-ancestors");
  assert(!csp.includes("unsafe-eval"), "CSP allows unsafe-eval in production");
  assert(h.get("x-content-type-options") === "nosniff", "nosniff missing");
  assert(h.get("x-frame-options") === "DENY", "X-Frame-Options missing");
  assert(h.get("strict-transport-security"), "HSTS missing");
  assert(!h.get("x-powered-by"), "X-Powered-By is exposed");
});

await check("pagination: last page holds the remainder, out-of-range page clamps", async () => {
  const n = total(home);
  const pages = Math.ceil(n / 8);
  const last = await (await get(`/?page=${pages}`)).text();
  assert(cards(last) === n - 8 * (pages - 1), `last page has ${cards(last)} cards`);
  const clamped = await (await get("/?page=9999")).text();
  assert(cards(clamped) === n - 8 * (pages - 1), "page 9999 did not clamp to the last page");
  return `${pages} pages`;
});

await check("category filter narrows the list", async () => {
  const options = [...home.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
  assert(options.length > 0, "no category options found");
  const category = options.find((o) => !o.includes("&")) ?? options[0];
  const html = await (await get(`/?category=${encodeURIComponent(category)}`)).text();
  assert(
    total(html) > 0 && total(html) < total(home),
    `category "${category}" gave ${total(html)}`,
  );
  return `"${category}": ${total(html)} products`;
});

await check("search with no matches shows the empty state", async () => {
  const html = await (await get("/?q=zzzzzz-no-such-product")).text();
  assert(html.includes("No products match your filters."), "empty state missing");
});

await check("hostile query parameters do not break or reflect as markup", async () => {
  const res = await get(
    `/?sort=${encodeURIComponent("<script>alert(1)</script>")}&page=-5&q=${encodeURIComponent('"><img src=x onerror=alert(1)>')}`,
  );
  assert(res.status === 200, `status ${res.status}`);
  const html = await res.text();
  assert(!html.includes("<img src=x onerror"), "search term reflected as markup");
});

await check("GET /api/cart-products returns only the requested products", async () => {
  const res = await get("/api/cart-products?ids=1,2");
  assert(res.status === 200, `status ${res.status}`);
  const body = await res.json();
  assert(
    Array.isArray(body) && body.length === 2,
    `expected 2 products, got ${JSON.stringify(body).slice(0, 80)}`,
  );
  assert(Object.keys(body[0]).sort().join() === "id,image,price,title", "unexpected fields");
  assert(Number.isInteger(body[0].price), "price is not integer cents");
});

await check("GET /api/cart-products rejects bad input with 400", async () => {
  for (const bad of ["", "?ids=abc", "?ids=1,,2", "?ids=-1", `?ids=${"1,".repeat(200)}1`]) {
    const res = await get(`/api/cart-products${bad}`);
    assert(res.status === 400, `"${bad.slice(0, 20)}" gave ${res.status}`);
  }
});

await check("product images load through the same-origin optimizer", async () => {
  const src = /\/_next\/image\?url=[^"\s,]+/.exec(home)?.[0].replace(/&amp;/g, "&");
  assert(src, "no optimized image URL in the page");
  const res = await get(src);
  assert(res.status === 200, `optimizer returned ${res.status}`);
  assert(
    (res.headers.get("content-type") ?? "").startsWith("image/"),
    `type ${res.headers.get("content-type")}`,
  );
  return `${res.headers.get("content-type")}, ${(await res.arrayBuffer()).byteLength} bytes`;
});

await check("the optimizer refuses images from other hosts", async () => {
  const res = await get(
    `/_next/image?url=${encodeURIComponent("https://example.com/x.png")}&w=256&q=75`,
  );
  assert(res.status === 400 || res.status === 404, `expected a refusal, got ${res.status}`);
});

await check("unknown routes return 404", async () => {
  const res = await get("/definitely-not-a-page");
  assert(res.status === 404, `status ${res.status}`);
});

const width = Math.max(...results.map((r) => r.name.length));
for (const r of results)
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name.padEnd(width)}  ${r.detail}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed against ${base}`);
process.exit(failed ? 1 : 0);
