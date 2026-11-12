import { describe, expect, it } from "vitest";
import { buildCsp, securityHeaders } from "./security-headers";

const prod = { isDev: false, inlineScripts: true };
const directive = (csp: string, name: string) =>
  csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("buildCsp", () => {
  it("never allows eval or websockets in production", () => {
    const csp = buildCsp(prod);
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toMatch(/\bws:|wss:/);
  });

  it("allows eval and websockets in development only (React debugging and HMR)", () => {
    const csp = buildCsp({ ...prod, isDev: true });
    expect(directive(csp, "script-src")).toContain("'unsafe-eval'");
    expect(directive(csp, "connect-src")).toContain("ws:");
  });

  it("locks down plugins, base URI, form targets and framing", () => {
    const csp = buildCsp(prod);
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
    expect(directive(csp, "base-uri")).toBe("base-uri 'self'");
    expect(directive(csp, "form-action")).toBe("form-action 'self'");
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
  });

  it("has no wildcard or remote origin in any directive", () => {
    const csp = buildCsp(prod);
    expect(csp).not.toMatch(/(^|\s)\*(\s|;|$)/);
    expect(csp).not.toMatch(/https?:\/\//);
  });

  it("images come from our own origin only, because they go through /_next/image", () => {
    expect(directive(buildCsp(prod), "img-src")).toBe("img-src 'self' data: blob:");
  });

  it("only allows inline scripts when asked, and never inline <style> elements in production", () => {
    expect(directive(buildCsp({ ...prod, inlineScripts: false }), "script-src")).toBe(
      "script-src 'self'",
    );
    expect(directive(buildCsp(prod), "script-src")).toContain("'unsafe-inline'");
    expect(directive(buildCsp(prod), "style-src")).toBe("style-src 'self'");
    expect(directive(buildCsp(prod), "style-src-attr")).toBe("style-src-attr 'unsafe-inline'");
  });
});

describe("securityHeaders", () => {
  const byKey = Object.fromEntries(securityHeaders(prod).map((h) => [h.key, h.value]));

  it("includes each hardening header exactly once", () => {
    const keys = securityHeaders(prod).map((h) => h.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(
      expect.arrayContaining([
        "Content-Security-Policy",
        "Strict-Transport-Security",
        "X-Content-Type-Options",
        "X-Frame-Options",
        "Referrer-Policy",
        "Permissions-Policy",
        "Cross-Origin-Opener-Policy",
      ]),
    );
  });

  it("uses safe values", () => {
    expect(byKey["X-Content-Type-Options"]).toBe("nosniff");
    expect(byKey["X-Frame-Options"]).toBe("DENY");
    expect(byKey["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(byKey["Cross-Origin-Opener-Policy"]).toBe("same-origin");
    expect(byKey["Strict-Transport-Security"]).not.toContain("preload"); // hard to undo, so opt-in later
    for (const sensor of ["camera", "microphone", "geolocation"]) {
      expect(byKey["Permissions-Policy"]).toContain(`${sensor}=()`);
    }
  });
});
