import Link from "next/link";
import { CartDrawer, type CartProduct } from "@/features/cart/components/cart-drawer";
import { getProducts } from "@/features/products/get-products";

/** Cart lines store only ids; prices come from the (cached) product list, never from storage. */
export async function SiteHeader() {
  let products: CartProduct[] = [];
  let unavailable = false;
  try {
    products = (await getProducts()).map(({ id, title, price, image }) => ({
      id,
      title,
      price,
      image,
    }));
  } catch {
    unavailable = true;
  }
  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-semibold">
          Shop
        </Link>
        <CartDrawer products={products} productsUnavailable={unavailable} />
      </div>
    </header>
  );
}

export function SiteHeaderFallback() {
  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-semibold">
          Shop
        </Link>
      </div>
    </header>
  );
}
