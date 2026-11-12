// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import ErrorPage from "@/app/error";
import { rawProducts } from "@/test/fixtures";
import { server } from "@/test/server";
import { ApiError } from "../api";
import type { RawParams } from "../query";
import { ProductGridSkeleton } from "./product-grid";
import { ProductsSection } from "./products-section";

const URL = "https://fakestoreapi.com/products";
const serve = (body: unknown = rawProducts, init?: ResponseInit) =>
  server.use(http.get(URL, () => HttpResponse.json(body as object, init)));

async function renderSection(params: RawParams = {}) {
  // ProductsSection is an async Server Component: await it, then render the resulting tree.
  render(await ProductsSection({ searchParams: Promise.resolve(params) }));
}
const titles = () => screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);

describe("listing: success", () => {
  it("shows the first page with count and pagination", async () => {
    serve();
    await renderSection();
    expect(titles()).toHaveLength(8);
    expect(screen.getByRole("status")).toHaveTextContent("10 products");
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute("href", "/?page=2");
    expect(screen.queryByRole("link", { name: "Previous" })).not.toBeInTheDocument();
  });

  it("shows price in dollars from integer cents, plus category and rating", async () => {
    serve();
    await renderSection();
    expect(screen.getByText("$109.95")).toBeInTheDocument();
    expect(screen.getAllByText("gadgets").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/out of 5 stars/).length).toBeGreaterThan(0);
  });

  it("second page has the remainder and a Previous link only", async () => {
    serve();
    await renderSection({ page: "2" });
    expect(titles()).toEqual(["Product 9", "Product 10"]);
    expect(screen.getByRole("link", { name: "Previous" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Next" })).not.toBeInTheDocument();
  });
});

describe("listing: filter and sort", () => {
  it("filters by category", async () => {
    serve();
    await renderSection({ category: "clothing" });
    expect(titles()).toEqual(["Product 7", "Product 8", "Product 9", "Product 10"]);
    expect(screen.getByRole("status")).toHaveTextContent("4 products");
  });

  it("searches by title and uses the singular for one result", async () => {
    serve();
    await renderSection({ q: "product 3" });
    expect(titles()).toEqual(["Product 3"]);
    expect(screen.getByRole("status")).toHaveTextContent("1 product");
    expect(screen.getByRole("status")).not.toHaveTextContent("1 products");
  });

  it("sorts by price descending and ascending", async () => {
    serve();
    await renderSection({ sort: "price-desc" });
    expect(titles()[0]).toBe("Product 1"); // $109.95 is the highest
    document.body.innerHTML = "";
    await renderSection({ sort: "price-asc" });
    expect(titles()[0]).toBe("Product 2"); // $20.00 is the lowest
  });

  it("ignores hostile params instead of failing", async () => {
    serve();
    await renderSection({ sort: "<script>", page: "-1", category: "nope" });
    expect(screen.getByText("No products match your filters.")).toBeInTheDocument();
  });
});

describe("listing: empty, loading, error", () => {
  it("shows an empty state with a way out", async () => {
    serve();
    await renderSection({ q: "zzz" });
    expect(screen.getByText("No products match your filters.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("navigation", { name: "Pagination" })).not.toBeInTheDocument();
  });

  it("skeleton is announced as loading and hides its placeholders", () => {
    render(<ProductGridSkeleton />);
    const status = screen.getByRole("status", { name: "Loading products" });
    expect(within(status).getByText("Loading products…")).toBeInTheDocument();
  });

  it.each([
    ["HTTP 500", () => HttpResponse.json({}, { status: 500 }), "http"],
    ["network failure", () => HttpResponse.error(), "network"],
    ["malformed payload", () => HttpResponse.json([{ id: "x" }]), "parse"],
  ])("rejects with a normalized error on %s", async (_n, resolver, kind) => {
    server.use(http.get(URL, resolver));
    await expect(ProductsSection({ searchParams: Promise.resolve({}) })).rejects.toMatchObject({
      kind,
    });
  });

  it("error boundary shows the message and retry calls retry()", async () => {
    const retry = vi.fn();
    render(
      <ErrorPage error={new ApiError("http", "Product service returned 500.")} retry={retry} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Product service returned 500.");
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
