import { describe, expect, it } from "vitest";

describe("test harness", () => {
  it("fails on any request that has no mock handler (no accidental real network)", async () => {
    await expect(fetch("https://fakestoreapi.com/products")).rejects.toThrow();
  });
});
