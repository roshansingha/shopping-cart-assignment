// Usage: node scripts/perf/measure.mjs [url] — reports what the browser must download for the page.
import { gzipSync } from "node:zlib";

const url = process.argv[2] ?? "http://localhost:3100/";
const gz = (buf) => gzipSync(buf).length;
const kb = (n) => `${(n / 1024).toFixed(1)} kB`;

const res = await fetch(url);
const html = await res.text();
const base = new URL(url);

const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(
  (m) => new URL(m[1], base).href,
);
const unique = [...new Set(scripts)];
let jsRaw = 0;
let jsGz = 0;
for (const s of unique) {
  const buf = Buffer.from(await (await fetch(s)).arrayBuffer());
  jsRaw += buf.length;
  jsGz += gz(buf);
}

// Inline RSC "flight" payload: data the server serialised into the HTML for client components.
const flight = [...html.matchAll(/self\.__next_f\.push\((.*?)\)<\/script>/gs)]
  .map((m) => m[1])
  .join("");
const imageRefs = (html.match(/https:\\?\/\\?\/fakestoreapi\.com/g) ?? []).length;

console.log(
  JSON.stringify(
    {
      url,
      htmlGzipBytes: gz(Buffer.from(html)),
      htmlRawBytes: Buffer.byteLength(html),
      flightPayloadRawBytes: Buffer.byteLength(flight),
      fakestoreImageUrlsInHtml: imageRefs,
      jsFiles: unique.length,
      jsRawBytes: jsRaw,
      jsGzipBytes: jsGz,
    },
    null,
    2,
  ),
);
console.log(
  `\nHTML ${kb(gz(Buffer.from(html)))} gz | RSC payload ${kb(Buffer.byteLength(flight))} raw | JS ${unique.length} files, ${kb(jsGz)} gz (${kb(jsRaw)} raw)`,
);
