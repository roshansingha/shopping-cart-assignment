"use client";

/**
 * REVIEW EXERCISE: the refactor. Same behaviour, built on the app's existing architecture
 * (ADR-001): one Zustand cart store with selector subscriptions, and the on-demand product
 * lookup that already handles de-duplication, merging and errors.
 */
import { useEffect } from "react";
import { QuantityStepper } from "@/features/cart/components/quantity-stepper";
import { itemCount, totalCents } from "@/features/cart/logic";
import { useProductDetails } from "@/features/cart/product-details";
import { useCartStore } from "@/features/cart/store";
import { formatCents } from "@/shared/money";

export function CartSummary() {
  const lines = useCartStore((s) => s.lines);
  const remove = useCartStore((s) => s.remove);
  const byId = useProductDetails((s) => s.byId);
  const load = useProductDetails((s) => s.load);

  // Effect only for what must be synchronised with the outside world: fetching.
  const idsKey = lines.map((l) => l.productId).join(",");
  useEffect(() => {
    void load(idsKey ? idsKey.split(",").map(Number) : []);
  }, [idsKey, load]);

  // Everything else is derived while rendering: no extra state, no extra commits.
  const prices = new Map(Object.values(byId).map((p) => [p.id, p.price]));
  const settled = lines.every((l) => byId[l.productId]);

  return (
    <section aria-label="Cart summary">
      <ul>
        {lines.map((l) => {
          const title = byId[l.productId]?.title ?? "Loading…";
          return (
            <li key={l.productId}>
              {/* React escapes text: API data can never become markup */}
              <span>{title}</span>
              <QuantityStepper productId={l.productId} title={title} showAddWhenEmpty={false} />
              <button aria-label={`Remove ${title} from cart`} onClick={() => remove(l.productId)}>
                Remove
              </button>
            </li>
          );
        })}
      </ul>
      <p>Total: {settled ? formatCents(totalCents(lines, prices)) : "—"}</p>
    </section>
  );
}

export function CartBadge() {
  // Selects a number, so it re-renders only when the count changes.
  const count = useCartStore((s) => itemCount(s.lines));
  return <span>{count}</span>;
}
