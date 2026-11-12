import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_QUANTITY } from "./logic";
import { STORAGE_KEY } from "./persistence";
import { createCartStore, safeLocalStorage } from "./store";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => void (data[k] = v),
    removeItem: (k: string) => void delete data[k],
  };
}
const stored = (lines: unknown) => JSON.stringify({ state: { lines }, version: 1 });

describe("cart store", () => {
  let storage: ReturnType<typeof memoryStorage>;
  beforeEach(() => {
    storage = memoryStorage();
  });

  it("rapid clicks are not lost", () => {
    const s = createCartStore(storage);
    for (let i = 0; i < 5; i++) s.getState().add(1);
    expect(s.getState().lines).toEqual([{ productId: 1, quantity: 5 }]);
  });

  it("never exceeds the cap", () => {
    const s = createCartStore(storage);
    for (let i = 0; i < MAX_QUANTITY + 20; i++) s.getState().add(1);
    expect(s.getState().lines[0].quantity).toBe(MAX_QUANTITY);
  });

  it("persists changes and restores them", async () => {
    const a = createCartStore(storage);
    a.getState().add(7);
    a.getState().add(7);
    const b = createCartStore(storage);
    await b.persist.rehydrate();
    expect(b.getState().lines).toEqual([{ productId: 7, quantity: 2 }]);
    expect(b.getState().hydrated).toBe(true);
  });

  it.each([
    ["invalid JSON", "{not json"],
    ["wrong shape", stored("nope")],
    ["negative quantity", stored([{ productId: 1, quantity: -2 }])],
    ["quantity above cap", stored([{ productId: 1, quantity: 9999 }])],
    ["string ids", stored([{ productId: "1", quantity: 1 }])],
    ["unknown version payload", JSON.stringify({ state: 42, version: 99 })],
  ])("falls back to an empty cart on corrupted storage: %s", async (_name, raw) => {
    const s = createCartStore(memoryStorage({ [STORAGE_KEY]: raw }));
    await s.persist.rehydrate();
    expect(s.getState().lines).toEqual([]);
    expect(s.getState().hydrated).toBe(true);
  });

  it("merges duplicate stored lines", async () => {
    const raw = stored([
      { productId: 1, quantity: 2 },
      { productId: 1, quantity: 3 },
    ]);
    const s = createCartStore(memoryStorage({ [STORAGE_KEY]: raw }));
    await s.persist.rehydrate();
    expect(s.getState().lines).toEqual([{ productId: 1, quantity: 3 }]);
  });

  it("syncs from another tab via rehydrate, including cleared storage", async () => {
    const tabA = createCartStore(storage);
    const tabB = createCartStore(storage); // shares the same storage, like two tabs
    await tabB.persist.rehydrate();
    tabA.getState().add(3);
    await tabB.persist.rehydrate(); // what the `storage` event handler calls
    expect(tabB.getState().lines).toEqual([{ productId: 3, quantity: 1 }]);
    storage.removeItem(STORAGE_KEY);
    await tabB.persist.rehydrate();
    expect(tabB.getState().lines).toEqual([]);
  });

  it("increments the announcement id so repeats are announced", () => {
    const s = createCartStore(storage);
    s.getState().announce("hi");
    s.getState().announce("hi");
    expect(s.getState().announcement).toEqual({ id: 2, text: "hi" });
  });
});

describe("safeLocalStorage", () => {
  const broken = {
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("quota");
    },
    removeItem: () => {
      throw new Error("denied");
    },
  };

  it("never throws when localStorage is blocked or full", () => {
    vi.stubGlobal("localStorage", broken);
    try {
      expect(safeLocalStorage.getItem("k")).toBeNull();
      expect(() => safeLocalStorage.setItem("k", "v")).not.toThrow();
      expect(() => safeLocalStorage.removeItem("k")).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("the cart still works in memory when storage fails", () => {
    vi.stubGlobal("localStorage", broken);
    try {
      const s = createCartStore();
      s.getState().add(5);
      expect(s.getState().lines).toEqual([{ productId: 5, quantity: 1 }]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
