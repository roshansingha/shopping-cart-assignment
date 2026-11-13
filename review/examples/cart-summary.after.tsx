"use client";

/**
 * REVIEW EXERCISE: the refactor. Same behaviour, built on the app's existing architecture
 * (ADR-001): one Zustand cart store with selector subscriptions, and the on-demand product
 * lookup that already handles de-duplication, merging and errors.
 */
import { QuantityStepper } from "@/features/cart/components/quantity-stepper";
import { lineTitle } from "@/features/cart/cart-products";
import { itemCount } from "@/features/cart/logic";
import { useCartStore } from "@/features/cart/store";
import { useCartProducts } from "@/features/cart/use-cart-products";
import { formatCents } from "@/shared/money";

export function CartSummary() {
  const remove = useCartStore((s) => s.remove);
  // The fetching effect and every derived value live in one shared, tested hook.
  const { lines, byId, unavailable, total } = useCartProducts();

  return (
    <section aria-label="Cart summary">
      <ul>
        {lines.map((l) => {
          const title = lineTitle(l.productId, byId, unavailable);
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
      <p>Total: {total === null ? "—" : formatCents(total)}</p>
    </section>
  );
}

export function CartBadge() {
  // Selects a number, so it re-renders only when the count changes.
  const count = useCartStore((s) => itemCount(s.lines));
  return <span>{count}</span>;
}
