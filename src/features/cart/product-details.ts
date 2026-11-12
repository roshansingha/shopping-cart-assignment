import { create } from "zustand";
import { isCartProduct, type CartProduct } from "./cart-products";

type Flags = Record<number, true>;
type DetailsState = {
  byId: Record<number, CartProduct>;
  /** Ids the server answered without (product removed upstream). Never re-requested. */
  unavailable: Flags;
  pending: Flags;
  error: boolean;
  load: (ids: readonly number[]) => Promise<void>;
};

const flags = (ids: readonly number[]): Flags => Object.fromEntries(ids.map((id) => [id, true]));
const without = (f: Flags, ids: readonly number[]): Flags => {
  const next = { ...f };
  for (const id of ids) delete next[id];
  return next;
};

/** Client-side lookup for cart lines only. Fetches what is missing, once, and remembers it. */
export function createProductDetailsStore(fetchImpl: typeof fetch = (...a) => fetch(...a)) {
  return create<DetailsState>()((set, get) => ({
    byId: {},
    unavailable: {},
    pending: {},
    error: false,
    load: async (ids) => {
      const s = get();
      const need = ids.filter((id) => !s.byId[id] && !s.unavailable[id] && !s.pending[id]);
      if (need.length === 0) return;
      set((st) => ({ error: false, pending: { ...st.pending, ...flags(need) } }));
      try {
        const res = await fetchImpl(`/api/cart-products?ids=${need.join(",")}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: unknown = await res.json();
        if (!Array.isArray(json) || !json.every(isCartProduct)) throw new Error("Unexpected shape");
        const found = new Set(json.map((p) => p.id));
        set((st) => ({
          byId: { ...st.byId, ...Object.fromEntries(json.map((p) => [p.id, p])) },
          unavailable: { ...st.unavailable, ...flags(need.filter((id) => !found.has(id))) },
          pending: without(st.pending, need),
        }));
      } catch {
        set((st) => ({ error: true, pending: without(st.pending, need) }));
      }
    },
  }));
}

export const useProductDetails = createProductDetailsStore();
