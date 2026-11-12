import type { NextRequest } from "next/server";
import { parseIds, toCartProduct } from "@/features/cart/cart-products";
import { getProducts } from "@/features/products/get-products";

/** Returns just the requested products, so the browser never receives the whole catalog. */
export async function GET(request: NextRequest) {
  const ids = parseIds(request.nextUrl.searchParams.get("ids"));
  if (!ids) return Response.json({ error: "Invalid ids" }, { status: 400 });
  try {
    const wanted = new Set(ids);
    const products = await getProducts();
    return Response.json(products.filter((p) => wanted.has(p.id)).map(toCartProduct));
  } catch {
    return Response.json({ error: "Product service unavailable" }, { status: 502 });
  }
}
