import { describe, expect, it, vi } from "vitest";

// A programming error must surface, not be disguised as an outage by the fallback.
vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  fetchProducts: vi.fn().mockRejectedValue(new TypeError("undefined is not a function")),
}));

import { getProducts } from "./get-products";

describe("getProducts on an unexpected error", () => {
  it("rethrows it instead of serving the saved catalog", async () => {
    await expect(getProducts()).rejects.toThrow(TypeError);
  });
});
