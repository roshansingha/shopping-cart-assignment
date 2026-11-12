import { PRODUCTS_URL } from "@/features/products/api";

/**
 * Diagnostic: can THIS server reach the live product API, and who answered?
 * Exists because the API sits behind bot protection that may refuse cloud hosts, and host logs
 * are awkward to read. Open /api/upstream-status on any deployment to see the answer.
 *
 * Reports only the status and two identifying headers, never the response body. Cached briefly so
 * repeated visits cannot be used to hammer the upstream through us.
 */
export async function GET() {
  const url = process.env.PRODUCTS_API_URL ?? PRODUCTS_URL;
  const started = Date.now();
  const headers = { "Cache-Control": "public, s-maxage=30" };
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    return Response.json(
      {
        reachable: true,
        ok: res.ok,
        status: res.status,
        server: res.headers.get("server"),
        cfMitigated: res.headers.get("cf-mitigated"), // "challenge" means a bot check was served
        contentType: res.headers.get("content-type"),
        ms: Date.now() - started,
      },
      { headers },
    );
  } catch (error) {
    return Response.json(
      {
        reachable: false,
        error: error instanceof Error ? error.name : "unknown",
        ms: Date.now() - started,
      },
      { headers },
    );
  }
}
