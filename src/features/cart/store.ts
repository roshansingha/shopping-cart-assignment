import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { addItem, decrementItem, getQuantity, removeItem, type CartLine } from "./logic";
import { STORAGE_KEY, parseStoredCart } from "./persistence";

type CartState = {
  lines: readonly CartLine[];
  /** False until localStorage has been read on the client (avoids SSR/hydration mismatch). */
  hydrated: boolean;
  /** Message for the aria-live region; `id` changes on every message so repeats are announced. */
  announcement: { id: number; text: string };
  add: (productId: number) => void;
  decrement: (productId: number) => void;
  remove: (productId: number) => void;
  announce: (text: string) => void;
};

/** localStorage can be missing (SSR) or throw (private mode, quota). Never let that crash the app. */
export const safeLocalStorage: StateStorage = {
  getItem: (k) => {
    try {
      return globalThis.localStorage?.getItem(k) ?? null;
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      globalThis.localStorage?.setItem(k, v);
    } catch {
      /* cart keeps working in memory */
    }
  },
  removeItem: (k) => {
    try {
      globalThis.localStorage?.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

/** Factory so tests can inject an in-memory storage. */
export function createCartStore(storage: StateStorage = safeLocalStorage) {
  const store = create<CartState>()(
    persist(
      (set) => ({
        lines: [],
        hydrated: false,
        announcement: { id: 0, text: "" },
        // Functional updates read the latest state, so rapid clicks never lose increments.
        add: (id) => set((s) => ({ lines: addItem(s.lines, id) })),
        decrement: (id) => set((s) => ({ lines: decrementItem(s.lines, id) })),
        remove: (id) => set((s) => ({ lines: removeItem(s.lines, id) })),
        announce: (text) => set((s) => ({ announcement: { id: s.announcement.id + 1, text } })),
      }),
      {
        name: STORAGE_KEY,
        version: 1,
        storage: createJSONStorage(() => storage),
        skipHydration: true, // hydrate on the client after mount, see CartHydrator
        partialize: (s) => ({ lines: s.lines }),
        migrate: (persisted) => persisted, // shape is re-validated in merge
        merge: (persisted, current) => ({
          ...current,
          lines: parseStoredCart(persisted),
        }),
        onRehydrateStorage: () => () => store.setState({ hydrated: true }),
      },
    ),
  );
  return store;
}

export const useCartStore = createCartStore();

export const selectQuantity = (productId: number) => (s: CartState) =>
  getQuantity(s.lines, productId);
