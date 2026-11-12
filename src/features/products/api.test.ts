import { describe, expect, it, vi } from "vitest";
import { ApiError, fetchProducts } from "./api";

const good = {
  id: 1,
  title: "Backpack",
  price: 109.95,
  description: "d",
  category: "bags",
  image: "https://fakestoreapi.com/img/1.jpg",
  rating: { rate: 3.9, count: 120 },
};
const respond = (body: unknown, init?: ResponseInit) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), init));

describe("fetchProducts", () => {
  it("parses products and converts price to cents", async () => {
    const [p] = await fetchProducts(respond([good]));
    expect(p.price).toBe(10995);
  });
  it("rounds awkward floats correctly", async () => {
    const [p] = await fetchProducts(respond([{ ...good, price: 0.29 }]));
    expect(p.price).toBe(29);
  });
  it("normalizes network failure", async () => {
    const f = vi.fn().mockRejectedValue(new TypeError("fail"));
    await expect(fetchProducts(f)).rejects.toMatchObject({ kind: "network" });
  });
  it("normalizes a 500", async () => {
    await expect(fetchProducts(respond({}, { status: 500 }))).rejects.toMatchObject({
      kind: "http",
      status: 500,
    });
  });
  it("rejects malformed payloads", async () => {
    await expect(fetchProducts(respond([{ ...good, price: "free" }]))).rejects.toMatchObject({
      kind: "parse",
    });
    await expect(fetchProducts(respond({ not: "an array" }))).rejects.toBeInstanceOf(ApiError);
  });
  it("rejects invalid JSON", async () => {
    const f = vi.fn().mockResolvedValue(new Response("<html>", { status: 200 }));
    await expect(fetchProducts(f)).rejects.toMatchObject({ kind: "parse" });
  });
});
