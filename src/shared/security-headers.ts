/**
 * Security headers, kept out of next.config.ts so they can be unit tested.
 *
 * Why a static CSP and not a per-request nonce: nonces force every page to render dynamically
 * and are incompatible with Partial Prerendering (Next docs: "Static vs Dynamic Rendering with
 * CSP"), which would undo the performance work. See docs/security-notes.md for the trade-off.
 */
export type CspOptions = {
  /** Development needs eval (React debugging) and websockets (HMR). Never enabled in production. */
  isDev: boolean;
  /** Allow inline scripts. Next streams its RSC payload in inline <script> tags. */
  inlineScripts: boolean;
};

export function buildCsp({ isDev, inlineScripts }: CspOptions): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      ...(inlineScripts ? ["'unsafe-inline'"] : []),
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    // Stylesheets are same-origin files. Inline style *attributes* (next/image sets some) are
    // allowed separately so inline <style> elements stay blocked in production.
    "style-src": ["'self'", ...(isDev ? ["'unsafe-inline'"] : [])],
    "style-src-attr": ["'unsafe-inline'"],
    // Product images are fetched through the same-origin /_next/image optimizer, never directly.
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...(isDev ? ["ws:", "wss:"] : [])],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

export type Header = { key: string; value: string };

export function securityHeaders(options: CspOptions): Header[] {
  return [
    { key: "Content-Security-Policy", value: buildCsp(options) },
    // HTTPS only for two years. No `preload`: that is a hard-to-undo public commitment.
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" }, // older browsers; CSP frame-ancestors covers the rest
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value:
        "camera=(), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(), gyroscope=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
}
