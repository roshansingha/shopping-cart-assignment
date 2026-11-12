import Link from "next/link";
import { toSearchParams, type ProductQuery } from "../query";

export function Pagination({
  query,
  page,
  pageCount,
}: {
  query: ProductQuery;
  page: number;
  pageCount: number;
}) {
  if (pageCount <= 1) return null;
  const href = (p: number) => {
    const qs = toSearchParams({ ...query, page: p }).toString();
    return qs ? `/?${qs}` : "/";
  };
  const linkCls =
    "rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800";
  return (
    <nav aria-label="Pagination" className="mt-6 flex items-center justify-center gap-2">
      {page > 1 && (
        <Link href={href(page - 1)} className={linkCls} rel="prev">
          Previous
        </Link>
      )}
      <span className="px-2 text-sm">
        Page {page} of {pageCount}
      </span>
      {page < pageCount && (
        <Link href={href(page + 1)} className={linkCls} rel="next">
          Next
        </Link>
      )}
    </nav>
  );
}
