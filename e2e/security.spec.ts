import { expect, test, type Page } from "@playwright/test";

type CspWindow = Window & { __csp: string[] };

/** Records every CSP violation the browser reports, from page load onward. */
async function recordViolations(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as CspWindow;
    w.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) =>
      w.__csp.push(`${e.violatedDirective} blocked ${e.blockedURI}`),
    );
  });
}
const violations = (page: Page) => page.evaluate(() => (window as unknown as CspWindow).__csp);

test.describe("security headers", () => {
  test("every response carries the hardening headers and hides the framework", async ({
    request,
  }) => {
    const res = await request.get("/");
    const h = res.headers();
    const csp = h["content-security-policy"];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("unsafe-eval"); // eval is only allowed in development
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["strict-transport-security"]).toContain("max-age=");
    expect(h["permissions-policy"]).toContain("camera=()");
    expect(h["cross-origin-opener-policy"]).toBe("same-origin");
    expect(h["x-powered-by"]).toBeUndefined();
  });

  test("the API route is covered too", async ({ request }) => {
    const res = await request.get("/api/cart-products?ids=1");
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  });
});

test.describe("CSP does not break the app", () => {
  test("no violations while browsing, adding to cart, opening the drawer and reloading", async ({
    page,
  }) => {
    await recordViolations(page);
    const consoleCsp: string[] = [];
    page.on("console", (m) => {
      if (/content security policy/i.test(m.text())) consoleCsp.push(m.text());
    });

    await page.goto("/");
    await expect(page.getByRole("button", { name: "Add to cart: Product 1" })).toBeEnabled();
    await page.getByLabel("Category").selectOption("clothing");
    await expect(page).toHaveURL(/category=clothing/);
    await page.getByLabel("Category").selectOption("");
    await page.getByRole("button", { name: "Add to cart: Product 1" }).click();
    await page.getByRole("button", { name: /^Cart/ }).click();
    await expect(
      page.getByRole("dialog", { name: "Your cart" }).getByText("$109.95").first(),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await page.reload();
    await expect(page.getByRole("button", { name: "Cart, 1 item" })).toBeVisible();

    expect(await violations(page)).toEqual([]);
    expect(consoleCsp).toEqual([]);
  });
});

test.describe("CSP actually enforces", () => {
  test("eval and new Function are blocked for page code", async ({ page }) => {
    await page.goto("/");
    // Two traps, both learned the hard way:
    //  1. page.evaluate() runs over the DevTools protocol, which disables the eval restriction.
    //  2. A script appended inside that call also runs synchronously inside it.
    // So the probe is an inline script that runs from a timer, after the protocol call returned,
    // which is how real page code (and an attacker's injected code) would run.
    await page.evaluate(() => {
      const s = document.createElement("script");
      s.textContent = `setTimeout(() => {
        const attempt = (fn) => { try { fn(); return "allowed"; } catch { return "blocked"; } };
        window.__evalProbe = {
          evalResult: attempt(() => eval("1 + 1")),
          fnResult: attempt(() => new Function("return 1")()),
        };
      }, 0);`;
      document.body.appendChild(s);
    });
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __evalProbe?: unknown }).__evalProbe))
      .toEqual({ evalResult: "blocked", fnResult: "blocked" });
  });

  test("a script from another origin is refused", async ({ page }) => {
    await recordViolations(page);
    await page.goto("/");
    await page.evaluate(() => {
      const s = document.createElement("script");
      s.src = "https://evil.example/steal.js";
      document.head.appendChild(s);
    });
    await expect
      .poll(() => violations(page))
      .toEqual(expect.arrayContaining([expect.stringContaining("evil.example")]));
  });

  test("an injected <style> element is refused, but the app's own styles still apply", async ({
    page,
  }) => {
    await recordViolations(page);
    await page.goto("/");
    await page.evaluate(() => {
      const s = document.createElement("style");
      s.textContent = "h1 { display: none !important }";
      document.head.appendChild(s);
    });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect((await violations(page)).some((v) => v.startsWith("style-src"))).toBe(true);
  });

  test("an image from another origin is refused", async ({ page }) => {
    await recordViolations(page);
    await page.goto("/");
    await page.evaluate(() => {
      const img = document.createElement("img");
      img.src = "https://evil.example/pixel.gif";
      document.body.appendChild(img);
    });
    await expect
      .poll(() => violations(page))
      .toEqual(
        expect.arrayContaining([expect.stringContaining("img-src blocked https://evil.example")]),
      );
  });
});
