import Link from "next/link";
import { CartDrawer } from "@/features/cart/components/cart-drawer";
import { SITE_NAME } from "@/shared/site";

/** Static: no data fetching. The cart drawer loads product details on demand. */
export function SiteHeader() {
  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <BagIcon />
          {SITE_NAME}
        </Link>
        <CartDrawer />
      </div>
    </header>
  );
}

/** Simple shopping-bag mark. Decorative: the name next to it is the accessible label. */
function BagIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 2 3 6v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4H6Z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}
