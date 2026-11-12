"use client";

import { useEffect } from "react";
import { STORAGE_KEY } from "../persistence";
import { useCartStore } from "../store";

/**
 * Reads the cart from localStorage after mount and keeps tabs in sync:
 * another tab writing the cart fires `storage` here, and we rehydrate from it.
 */
export function CartHydrator() {
  useEffect(() => {
    void useCartStore.persist.rehydrate();
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) void useCartStore.persist.rehydrate();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return null;
}
