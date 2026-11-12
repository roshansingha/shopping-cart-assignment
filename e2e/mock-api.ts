// Tiny stand-in for fakestoreapi.com so E2E runs are deterministic and offline-safe.
import { createServer } from "node:http";
import { rawProducts } from "../src/test/fixtures.ts";

const PORT = Number(process.env.MOCK_API_PORT ?? 4010);

createServer((req, res) => {
  if (req.url?.startsWith("/products")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(rawProducts));
  } else {
    res.writeHead(404).end();
  }
}).listen(PORT, () => console.log(`mock api on :${PORT}`));
