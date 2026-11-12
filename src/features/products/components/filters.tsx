"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { parseQuery, toSearchParams, type ProductQuery, type Sort } from "../query";

const SORT_LABELS: Record<Sort, string> = {
  default: "Featured",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
  "rating-desc": "Top rated",
  "name-asc": "Name: A to Z",
};
const DEBOUNCE_MS = 300;

/** Filter state lives in the URL; this component only writes to it. */
export function Filters({ categories }: { categories: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const current = parseQuery(Object.fromEntries(useSearchParams()));
  const [search, setSearch] = useState(current.q);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef(current);

  useEffect(() => {
    latest.current = current;
  });
  useEffect(() => () => clearTimeout(timer.current), []);

  const update = (patch: Partial<ProductQuery>) => {
    const qs = toSearchParams({ ...latest.current, ...patch, page: 1 }).toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  const onSearch = (value: string) => {
    setSearch(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => update({ q: value.trim() }), DEBOUNCE_MS);
  };

  const field =
    "w-full rounded border border-zinc-500 bg-white px-3 py-2 text-sm dark:border-zinc-500 dark:bg-zinc-900";
  return (
    <form
      role="search"
      aria-label="Filter products"
      onSubmit={(e) => e.preventDefault()}
      className="mb-6 grid gap-3 sm:grid-cols-3"
      aria-busy={pending}
    >
      <label className="text-sm">
        <span className="mb-1 block font-medium">Search</span>
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          maxLength={100}
          className={field}
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-medium">Category</span>
        <select
          value={current.category}
          onChange={(e) => update({ category: e.target.value })}
          className={field}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-medium">Sort by</span>
        <select
          value={current.sort}
          onChange={(e) => update({ sort: e.target.value as Sort })}
          className={field}
        >
          {Object.entries(SORT_LABELS).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </form>
  );
}
