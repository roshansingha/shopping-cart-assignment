import { describe, expect, it } from "vitest";
import { MAX_QUANTITY } from "./logic";
import { MAX_LINES, parseStoredCart } from "./persistence";

const line = (productId: unknown, quantity: unknown) => ({ productId, quantity });

describe("parseStoredCart", () => {
  it("accepts a valid cart", () => {
    expect(parseStoredCart({ lines: [line(1, 2), line(7, MAX_QUANTITY)] })).toEqual([
      { productId: 1, quantity: 2 },
      { productId: 7, quantity: MAX_QUANTITY },
    ]);
  });

  it("accepts an empty cart", () => {
    expect(parseStoredCart({ lines: [] })).toEqual([]);
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a number", 42],
    ["a string", "cart"],
    ["an array", []],
    ["missing lines", {}],
    ["lines is not an array", { lines: "x" }],
    ["lines is an object", { lines: { 0: line(1, 1) } }],
  ])("returns an empty cart for %s", (_n, raw) => {
    expect(parseStoredCart(raw)).toEqual([]);
  });

  it.each([
    ["null entry", [null]],
    ["primitive entry", [5]],
    ["missing quantity", [{ productId: 1 }]],
    ["productId zero", [line(0, 1)]],
    ["negative productId", [line(-1, 1)]],
    ["fractional productId", [line(1.5, 1)]],
    ["string productId", [line("1", 1)]],
    ["quantity zero", [line(1, 0)]],
    ["negative quantity", [line(1, -1)]],
    ["fractional quantity", [line(1, 1.5)]],
    ["quantity over the cap", [line(1, MAX_QUANTITY + 1)]],
    ["NaN quantity", [line(1, NaN)]],
    ["one bad line among good ones", [line(1, 1), line(2, 0), line(3, 1)]],
  ])("rejects the whole cart for %s (never half-trust tampered data)", (_n, lines) => {
    expect(parseStoredCart({ lines })).toEqual([]);
  });

  it("enforces the line limit exactly", () => {
    const make = (n: number) => Array.from({ length: n }, (_, i) => line(i + 1, 1));
    expect(parseStoredCart({ lines: make(MAX_LINES) })).toHaveLength(MAX_LINES);
    expect(parseStoredCart({ lines: make(MAX_LINES + 1) })).toEqual([]);
  });

  it("merges duplicate product lines", () => {
    expect(parseStoredCart({ lines: [line(1, 2), line(1, 3)] })).toEqual([
      { productId: 1, quantity: 3 },
    ]);
  });
});
