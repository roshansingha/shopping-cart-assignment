"use client";

import { useCartStore } from "../store";

/** Single polite live region for all cart announcements. Keyed so identical messages re-announce. */
export function CartLiveRegion() {
  const { id, text } = useCartStore((s) => s.announcement);
  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      <p key={id}>{text}</p>
    </div>
  );
}
