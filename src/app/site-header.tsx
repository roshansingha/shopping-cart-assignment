import Link from "next/link";
import { CartDrawer } from "@/features/cart/components/cart-drawer";

/** Static: no data fetching. The cart drawer loads product details on demand. */
export function SiteHeader() {
  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-semibold">
          Shop
        </Link>
        <CartDrawer />
      </div>
    </header>
  );
}
