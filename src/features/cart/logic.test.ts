import { describe, expect, it } from "vitest";
import {
  MAX_QUANTITY,
  addItem,
  decrementItem,
  getQuantity,
  isAtMax,
  itemCount,
  removeItem,
  setQuantity,
  totalCents,
  type Cart,
} from "./logic";

const empty: Cart = [];

describe("cart logic", () => {
  it("adds a new item with quantity 1", () => {
    expect(addItem(empty, 1)).toEqual([{ productId: 1, quantity: 1 }]);
  });
  it("duplicate adds increment one line", () => {
    const c = addItem(addItem(empty, 1), 1);
    expect(c).toEqual([{ productId: 1, quantity: 2 }]);
  });
  it("does not mutate the input", () => {
    const c: Cart = Object.freeze([{ productId: 1, quantity: 1 }]);
    expect(() => addItem(c, 1)).not.toThrow();
    expect(c[0].quantity).toBe(1);
  });
  it("decrementing the last unit removes the line", () => {
    expect(decrementItem(addItem(empty, 1), 1)).toEqual([]);
  });
  it("decrementing a missing item is a no-op", () => {
    expect(decrementItem(empty, 9)).toEqual([]);
  });
  it("quantity zero or negative removes the line", () => {
    const c = addItem(empty, 1);
    expect(setQuantity(c, 1, 0)).toEqual([]);
    expect(setQuantity(c, 1, -5)).toEqual([]);
  });
  it("caps at MAX_QUANTITY, including large quantities", () => {
    expect(getQuantity(setQuantity(empty, 1, 1_000_000), 1)).toBe(MAX_QUANTITY);
    let c: Cart = empty;
    for (let i = 0; i < MAX_QUANTITY + 5; i++) c = addItem(c, 1);
    expect(getQuantity(c, 1)).toBe(MAX_QUANTITY);
    expect(isAtMax(c, 1)).toBe(true);
  });
  it("ignores NaN/Infinity and truncates fractions", () => {
    const c = addItem(empty, 1);
    expect(setQuantity(c, 1, NaN)).toBe(c);
    expect(setQuantity(c, 1, Infinity)).toBe(c);
    expect(getQuantity(setQuantity(c, 1, 2.9), 1)).toBe(2);
  });
  it("updating one line leaves other lines untouched and in place", () => {
    const c = setQuantity(setQuantity(empty, 1, 2), 2, 3);
    expect(setQuantity(c, 1, 5)).toEqual([
      { productId: 1, quantity: 5 },
      { productId: 2, quantity: 3 },
    ]);
  });
  it("removeItem drops the whole line", () => {
    expect(removeItem(setQuantity(empty, 1, 4), 1)).toEqual([]);
  });
  it("counts items across lines", () => {
    expect(itemCount(setQuantity(setQuantity(empty, 1, 2), 2, 3))).toBe(5);
  });
  it("totals in integer cents without float drift", () => {
    const prices = new Map([
      [1, 1099],
      [2, 1],
    ]);
    const c = setQuantity(setQuantity(empty, 1, 3), 2, 3);
    expect(totalCents(c, prices)).toBe(3300);
    expect(totalCents(empty, prices)).toBe(0);
  });
  it("skips unknown products in totals", () => {
    expect(totalCents(addItem(empty, 99), new Map())).toBe(0);
  });
});
