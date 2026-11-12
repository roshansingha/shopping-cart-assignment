// Tiny stand-in for fakestoreapi.com so E2E runs are deterministic and offline-safe.
import { createServer } from "node:http";
import { rawProducts } from "../src/test/fixtures.ts";

const PORT = Number(process.env.MOCK_API_PORT ?? 4010);
// MOCK_PRODUCT_COUNT > 10 simulates a large catalog (used by the performance measurements).
const COUNT = Number(process.env.MOCK_PRODUCT_COUNT ?? 0);
const products =
  COUNT > rawProducts.length
    ? Array.from({ length: COUNT }, (_, i) => ({
        ...rawProducts[i % rawProducts.length],
        id: i + 1,
        title: `Product ${i + 1}`,
      }))
    : rawProducts;

createServer((req, res) => {
  if (req.url?.startsWith("/products")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(products));
  } else {
    res.writeHead(404).end();
  }
}).listen(PORT, () => console.log(`mock api on :${PORT}`));
