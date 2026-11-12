import { Suspense } from "react";
import { ProductGridSkeleton } from "@/features/products/components/product-grid";
import { ProductsSection } from "@/features/products/components/products-section";

export default function Home(props: PageProps<"/">) {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Products</h1>
      <Suspense fallback={<ProductGridSkeleton />}>
        <ProductsSection searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
