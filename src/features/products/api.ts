import { productsSchema, type Product } from "./schema";

export const PRODUCTS_URL = "https://fakestoreapi.com/products";

export type ApiErrorKind = "network" | "http" | "parse";

/** Single error shape for the UI, whatever went wrong underneath. */
export class ApiError extends Error {
  constructor(
    public readonly kind: ApiErrorKind,
    message: string,
    public readonly status?: number,
    /** Who answered, e.g. "server=cloudflare cf-mitigated=challenge". Never the response body. */
    public readonly detail?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Names the responder (a CDN, a bot check) so an outage is diagnosable from logs alone. */
function describeResponder(headers: Headers): string | undefined {
  const parts = ["server", "cf-mitigated"].flatMap((h) => {
    const v = headers.get(h);
    return v ? [`${h}=${v}`] : [];
  });
  return parts.length ? parts.join(" ") : undefined;
}

export async function fetchProducts(
  fetchImpl: typeof fetch = fetch,
  url: string = PRODUCTS_URL,
): Promise<Product[]> {
  let res: Response;
  try {
    res = await fetchImpl(url);
  } catch {
    throw new ApiError("network", "Could not reach the product service.");
  }
  if (!res.ok) {
    throw new ApiError(
      "http",
      `Product service returned ${res.status}.`,
      res.status,
      describeResponder(res.headers),
    );
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ApiError("parse", "Product service returned invalid JSON.");
  }
  const parsed = productsSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError("parse", "Product data did not match the expected shape.");
  }
  return parsed.data;
}
