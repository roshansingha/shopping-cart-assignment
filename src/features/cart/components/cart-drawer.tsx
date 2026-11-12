"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { formatCents } from "@/shared/money";
import { itemCount, totalCents } from "../logic";
import { useProductDetails } from "../product-details";
import { useCartStore } from "../store";
import { QuantityStepper } from "./quantity-stepper";

/**
 * Header cart button + drawer. The drawer is a native <dialog> opened with showModal():
 * the browser provides the focus trap, Escape to close, inert background and focus return
 * to the trigger, so no custom ARIA or focus code is needed.
 *
 * Product details (title, price, image) are fetched only for the lines in the cart, and only
 * once the drawer is opened, so page weight does not grow with the size of the catalog.
 * The title and Close button always render, so focus has somewhere to land when it opens.
 */
export function CartDrawer() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const lines = useCartStore((s) => s.lines);
  const hydrated = useCartStore((s) => s.hydrated);
  const remove = useCartStore((s) => s.remove);
  const byId = useProductDetails((s) => s.byId);
  const unavailable = useProductDetails((s) => s.unavailable);
  const pending = useProductDetails((s) => s.pending);
  const error = useProductDetails((s) => s.error);
  const load = useProductDetails((s) => s.load);

  const idsKey = lines.map((l) => l.productId).join(",");
  useEffect(() => {
    if (open) void load(idsKey ? idsKey.split(",").map(Number) : []);
  }, [open, idsKey, load]);

  const count = hydrated ? itemCount(lines) : 0;
  const loading = lines.some((l) => pending[l.productId]);
  const settled = lines.every((l) => byId[l.productId] || unavailable[l.productId]);
  const prices = new Map(Object.values(byId).map((p) => [p.id, p.price]));

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          dialog.current?.showModal();
        }}
        aria-haspopup="dialog"
        aria-label={`Cart, ${count} ${count === 1 ? "item" : "items"}`}
        className="relative rounded border border-zinc-500 px-3 py-2 text-sm dark:border-zinc-500"
      >
        Cart
        {count > 0 && (
          <span
            aria-hidden="true"
            className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-zinc-900 px-1.5 text-xs text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            {count}
          </span>
        )}
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="cart-title"
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === dialog.current && dialog.current?.close()}
        className="m-0 ml-auto h-full max-h-none w-full max-w-md bg-white p-0 text-zinc-900 backdrop:bg-black/50 dark:bg-zinc-900 dark:text-zinc-100"
      >
        <div className="flex h-full flex-col p-4">
          <div className="flex items-center justify-between">
            <h2 id="cart-title" className="text-lg font-semibold">
              Your cart
            </h2>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="rounded border border-zinc-500 px-3 py-1.5 text-sm dark:border-zinc-500"
            >
              Close
            </button>
          </div>

          {open && (
            <>
              {error && (
                <div role="alert" className="mt-3 text-sm text-amber-700 dark:text-amber-400">
                  Product details could not be loaded, so prices are unavailable.{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => void load(lines.map((l) => l.productId))}
                  >
                    Try again
                  </button>
                </div>
              )}
              {loading && (
                <p role="status" className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                  Loading prices…
                </p>
              )}

              {lines.length === 0 ? (
                <p className="mt-8 text-center text-sm text-zinc-600 dark:text-zinc-400">
                  Your cart is empty.
                </p>
              ) : (
                <ul className="mt-4 flex-1 divide-y divide-zinc-200 overflow-y-auto dark:divide-zinc-800">
                  {lines.map((l) => {
                    const p = byId[l.productId];
                    const title =
                      p?.title ??
                      (unavailable[l.productId] ? `Unavailable item #${l.productId}` : "Loading…");
                    return (
                      <li key={l.productId} className="flex gap-3 py-3">
                        {p && (
                          <div className="relative h-16 w-16 shrink-0">
                            <Image
                              src={p.image}
                              alt=""
                              fill
                              sizes="64px"
                              className="object-contain"
                            />
                          </div>
                        )}
                        <div className="flex-1">
                          <p className="line-clamp-2 text-sm font-medium">{title}</p>
                          {p && <p className="text-sm">{formatCents(p.price * l.quantity)}</p>}
                          <QuantityStepper
                            productId={l.productId}
                            title={title}
                            showAddWhenEmpty={false}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            remove(l.productId);
                            useCartStore.getState().announce(`${title} removed from cart.`);
                          }}
                          className="self-start text-sm underline"
                          aria-label={`Remove ${title} from cart`}
                        >
                          Remove
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="mt-4 flex items-center justify-between border-t border-zinc-200 pt-4 text-base font-semibold dark:border-zinc-800">
                <span>Total</span>
                <span>{settled ? formatCents(totalCents(lines, prices)) : "—"}</span>
              </div>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
