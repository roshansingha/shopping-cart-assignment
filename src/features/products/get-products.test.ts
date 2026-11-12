import { cacheLife } from "next/cache";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rawProducts } from "@/test/fixtures";
import { server } from "@/test/server";
import { getProducts } from "./get-products";

const URL = "https://fakestoreapi.com/products";

beforeEach(() => {
  vi.mocked(cacheLife).mockClear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("getProducts", () => {
  it("returns live data and caches it for hours", async () => {
    server.use(http.get(URL, () => HttpResponse.json(rawProducts)));
    const result = await getProducts();
    expect(result.source).toBe("live");
    expect(result.products).toHaveLength(rawProducts.length);
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith("hours");
  });

  it.each([
    ["blocked (403)", () => HttpResponse.html("Just a moment...", { status: 403 })],
    ["server error (500)", () => HttpResponse.json({}, { status: 500 })],
    ["network failure", () => HttpResponse.error()],
    ["unexpected payload", () => HttpResponse.json({ not: "a list" })],
  ])("falls back to the saved catalog on %s", async (_n, resolver) => {
    server.use(http.get(URL, resolver));
    const result = await getProducts();
    expect(result.source).toBe("fallback");
    expect(result.products).toHaveLength(20);
  });

  it("caches the fallback for minutes only, so a recovered API is used again soon", async () => {
    server.use(http.get(URL, () => HttpResponse.json({}, { status: 403 })));
    await getProducts();
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith("minutes");
  });

  it("logs why it fell back, so an outage is visible in server logs", async () => {
    server.use(http.get(URL, () => HttpResponse.json({}, { status: 403 })));
    await getProducts();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("http 403"));
  });
});
