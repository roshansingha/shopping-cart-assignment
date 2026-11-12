import Image from "next/image";
import { QuantityStepper } from "@/features/cart/components/quantity-stepper";
import { formatCents } from "@/shared/money";
import type { Product } from "../schema";

export function ProductCard({ product }: { product: Product }) {
  return (
    <li className="flex flex-col rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="relative mb-3 aspect-square w-full">
        <Image
          src={product.image}
          alt=""
          fill
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
          className="object-contain"
        />
      </div>
      <p className="text-xs uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
        {product.category}
      </p>
      <h2 className="mt-1 line-clamp-2 flex-1 text-sm font-medium">{product.title}</h2>
      <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
        <span aria-hidden="true">★</span> {product.rating.rate.toFixed(1)}
        <span className="sr-only"> out of 5 stars,</span> ({product.rating.count}
        <span className="sr-only"> reviews</span>)
      </p>
      <p className="mt-1 text-lg font-semibold">{formatCents(product.price)}</p>
      <QuantityStepper productId={product.id} title={product.title} />
    </li>
  );
}
