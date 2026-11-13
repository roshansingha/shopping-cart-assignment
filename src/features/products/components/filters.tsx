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

  // The search box keeps its own text while the user types, so it must follow the URL when
  // something else changes `q` ("Clear filters", Back/Forward, a pasted link), but must not
  // overwrite the user's typing when the URL catches up with a value we wrote ourselves.
  // `written` holds the queries this box has sent and the URL has not yet shown.
  const [seenQ, setSeenQ] = useState(current.q);
  const [written, setWritten] = useState<readonly string[]>([]);
  if (current.q !== seenQ) {
    setSeenQ(current.q);
    const ours = written.indexOf(current.q);
    if (ours === -1) {
      setSearch(current.q); // changed from outside: show it
      setWritten([]);
    } else {
      setWritten(written.slice(ours + 1)); // our own write arrived; later ones are still in flight
    }
  }

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
    timer.current = setTimeout(() => {
      const q = value.trim();
      if (q !== latest.current.q) setWritten((w) => [...w, q]);
      update({ q });
    }, DEBOUNCE_MS);
  };

  // One look for all three fields: same height, padding, border and radius.
  // 16px on phones: iOS Safari zooms the page when a field smaller than that is focused.
  const field =
    "block h-10 w-full appearance-none rounded border border-zinc-500 bg-white px-3 text-base text-zinc-900 md:text-sm dark:bg-zinc-900 dark:text-zinc-100";
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
        <span className="relative block">
          <select
            value={current.category}
            onChange={(e) => update({ category: e.target.value })}
            className={`${field} pr-9`}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <Chevron />
        </span>
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-medium">Sort by</span>
        <span className="relative block">
          <select
            value={current.sort}
            onChange={(e) => update({ sort: e.target.value as Sort })}
            className={`${field} pr-9`}
          >
            {Object.entries(SORT_LABELS).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
          <Chevron />
        </span>
      </label>
    </form>
  );
}

/** Our own dropdown arrow: the native one differs per browser and cannot be themed. */
function Chevron() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600 dark:text-zinc-400"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 8l5 5 5-5" />
    </svg>
  );
}
