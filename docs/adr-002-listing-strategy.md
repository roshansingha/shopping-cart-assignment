# ADR-002: Listing strategy

- **Status:** Accepted
- **Date:** 2026-11-13

## Decision

Paginate the product list **on our server**, 8 products per page, from a cached copy of the catalogue.
Search, category, sort and page live in the **URL**.

When the catalogue gets too big to download and cache, move the filtering and paging to the API or a
search index. The URL and the page components stay the same.

## Why our server does the paging

The FakeStore API cannot page or search. Tested on 2026-11-12:

- It supports `?limit=`, a category filter, and sorting by id only.
- `?offset=5` and `?page=2` return the first items again, so there is no paging.
- `?q=bag` returns everything, so there is no search.
- There is no sort by price, rating or name.

So we fetch the list once, cache it for an hour, and filter, sort and slice it for each request in
`features/products/query.ts`. The browser only receives the current page.

## Pagination, infinite scroll or virtualization?

### Pagination (numbered pages) — what we use

- **Use it when** people browse or search a catalogue and need shareable links, a working Back
  button, and pages that work without JavaScript.
- **Avoid it when** position in the list does not matter, as in a news feed.
- **Here:** every page is a real URL, the page stays small, and keyboard and screen-reader use is simple.

### Infinite scroll or a "Load more" button — not used

- **Use it when** the content is a feed read from top to bottom, such as news or social posts.
- **Avoid it when** people need to reach the footer, compare items, or return to where they were.
  The page also grows without limit, and it is hard for keyboards and screen readers.
- **If you want that feel anyway:** add a Load more button on top of the paginated URLs, so every
  batch is still a real link.

### Virtualization (render only the visible rows) — not used

- **Use it when** one very long, dense list is scanned in a single scroll, with thousands of rows.
  Examples: admin tables, logs, comparison grids.
- **Avoid it when** the items are tall, image-heavy cards like products. It also hides rows from
  screen readers and find-in-page, and makes keyboard navigation harder.
- **Here:** pagination already keeps the page small, so there is nothing to gain.

## What to use as the catalogue grows

- **Small** (up to a few thousand products): keep today's approach.
- **Medium** (up to about 20,000): same, but cache only the fields the list needs.
- **Large, and the API can page and search:** pass the page, filters and sort to the API, and cache
  each query.
- **Large, and the API cannot:** copy the catalogue into a database or search index and query that.

Filtering in memory is cheap: the slowest page request takes 0.3 ms at 1,000 products and about
36 ms at 100,000 (`pnpm bench`). The limit is the size of the catalogue to download and cache
(4 MB at 10,000 products), not speed.

The 20,000 figure is an estimate from one laptop, and the hosting provider's cache size limit has
not been checked. Revisit when the catalogue passes about 20,000 products, when the API gains
paging or search, or when search quality becomes a requirement.
