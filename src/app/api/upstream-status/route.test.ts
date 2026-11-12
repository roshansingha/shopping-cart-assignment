import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { rawProducts } from "@/test/fixtures";
import { server } from "@/test/server";
import { GET } from "./route";

const URL = "https://fakestoreapi.com/products";

describe("GET /api/upstream-status", () => {
  it("reports a healthy upstream", async () => {
    server.use(http.get(URL, () => HttpResponse.json(rawProducts)));
    const body = await (await GET()).json();
    expect(body).toMatchObject({ reachable: true, ok: true, status: 200 });
  });

  it("reports a Cloudflare challenge, which is what blocked deploys look like", async () => {
    server.use(
      http.get(URL, () =>
        HttpResponse.html("Just a moment...", {
          status: 403,
          headers: { server: "cloudflare", "cf-mitigated": "challenge" },
        }),
      ),
    );
    const body = await (await GET()).json();
    expect(body).toMatchObject({
      reachable: true,
      ok: false,
      status: 403,
      server: "cloudflare",
      cfMitigated: "challenge",
    });
  });

  it("reports an unreachable upstream without leaking details", async () => {
    server.use(http.get(URL, () => HttpResponse.error()));
    const body = await (await GET()).json();
    expect(body.reachable).toBe(false);
    expect(Object.keys(body).sort()).toEqual(["error", "ms", "reachable"]);
  });

  it("never returns the upstream body, only status and identifying headers", async () => {
    server.use(
      http.get(URL, () => HttpResponse.html("<html>secret page body</html>", { status: 403 })),
    );
    const res = await GET();
    expect(JSON.stringify(await res.json())).not.toContain("secret page body");
  });

  it("is cached briefly so it cannot be used to hammer the upstream", async () => {
    server.use(http.get(URL, () => HttpResponse.json(rawProducts)));
    expect((await GET()).headers.get("cache-control")).toContain("s-maxage=30");
  });
});
