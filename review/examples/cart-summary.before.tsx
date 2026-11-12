"use client";

/**
 * REVIEW EXERCISE: the component as submitted in a (fictional) pull request.
 * It works in a quick demo. It has five problems, written up in review/CODE_REVIEW.md.
 * Kept deliberately unfixed; excluded from linting for that reason (see eslint.config.mjs).
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { formatCents } from "@/shared/money";

type Line = { productId: number; quantity: number };
type Product = { id: number; title: string; price: number };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const CartContext = createContext<any>(null);

export function CartProvider({
  initialItems = [],
  children,
}: {
  initialItems?: Line[];
  children: ReactNode;
}) {
  const [items, setItems] = useState<Line[]>(initialItems);
  const [products, setProducts] = useState<Record<number, Product>>({});
  const [total, setTotal] = useState(0);

  // load product details whenever the cart changes
  useEffect(() => {
    if (items.length === 0) return;
    fetch(`/api/cart-products?ids=${items.map((i) => i.productId).join(",")}`)
      .then((r) => r.json())
      .then((list: Product[]) => {
        setProducts(Object.fromEntries(list.map((p) => [p.id, p])));
      });
  }, [items]);

  // keep the total up to date
  useEffect(() => {
    setTotal(items.reduce((sum, i) => sum + (products[i.productId]?.price ?? 0) * i.quantity, 0));
  }, [items, products]);

  const add = (productId: number) => setItems((prev) => [...prev, { productId, quantity: 1 }]);
  const remove = (productId: number) =>
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  const setQuantity = (productId: number, quantity: number) =>
    setItems((prev) => prev.map((i) => (i.productId === productId ? { ...i, quantity } : i)));

  return (
    <CartContext.Provider value={{ items, products, total, add, remove, setQuantity }}>
      {children}
    </CartContext.Provider>
  );
}

export function CartSummary() {
  const { items, products, total, remove, setQuantity } = useContext(CartContext);

  return (
    <section aria-label="Cart summary">
      <ul>
        {items.map((item: Line, index: number) => (
          <li key={index}>
            <span dangerouslySetInnerHTML={{ __html: products[item.productId]?.title ?? "" }} />
            <input
              type="number"
              aria-label="Quantity"
              defaultValue={item.quantity}
              onChange={(e) => setQuantity(item.productId, Number(e.target.value))}
            />
            <button onClick={() => remove(item.productId)}>Remove</button>
          </li>
        ))}
      </ul>
      <p>Total: {formatCents(total)}</p>
    </section>
  );
}

export function CartBadge() {
  const { items } = useContext(CartContext);
  return <span>{items.length}</span>;
}
