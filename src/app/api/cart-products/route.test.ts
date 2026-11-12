import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { rawProducts } from "@/test/fixtures";
import { server } from "@/test/server";
import { GET } from "./route";

const call = (query: string) =>
  GET({ nextUrl: new URL(`http://localhost/api/cart-products${query}`) } as never);
const serve = (resolver = () => HttpResponse.json(rawProducts)) =>
  server.use(http.get("https://fakestoreapi.com/products", resolver));

describe("GET /api/cart-products", () => {
  it("returns only the requested products, with only the fields the cart needs", async () => {
    serve();
    const res = await call("?ids=2,5");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.map((p: { id: number }) => p.id)).toEqual([2, 5]);
    expect(Object.keys(body[0]).sort()).toEqual(["id", "image", "price", "title"]);
    expect(body[0].price).toBe(2000); // integer cents
  });
  it("omits unknown ids instead of failing", async () => {
    serve();
    const body = await (await call("?ids=1,999")).json();
    expect(body.map((p: { id: number }) => p.id)).toEqual([1]);
  });
  it("answers 400 to a missing or malformed ids param", async () => {
    expect((await call("")).status).toBe(400);
    expect((await call("?ids=1,abc")).status).toBe(400);
  });
  it("still answers from the saved catalog when the product service fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    serve(() => HttpResponse.json({}, { status: 403 }));
    const res = await call("?ids=1,2");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.map((p: { id: number }) => p.id)).toEqual([1, 2]);
    expect(body[0].price).toBeGreaterThan(0);
  });
});
