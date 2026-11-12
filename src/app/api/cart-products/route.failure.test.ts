import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/products/get-products", () => ({
  getProducts: vi.fn().mockRejectedValue(new Error("unexpected bug")),
}));

import { GET } from "./route";

describe("GET /api/cart-products on an unexpected failure", () => {
  it("answers a generic 502 with no internal detail", async () => {
    const res = await GET({
      nextUrl: new URL("http://localhost/api/cart-products?ids=1"),
    } as never);
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("unexpected bug");
  });
});
