import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const addToCart = (page: Page, n: number) =>
  page.getByRole("button", { name: `Add to cart: Product ${n}` });
const cartButton = (page: Page) => page.getByRole("button", { name: /^Cart/ });
const drawer = (page: Page) => page.getByRole("dialog", { name: "Your cart" });

async function ready(page: Page) {
  await page.goto("/");
  await expect(addToCart(page, 1)).toBeEnabled(); // enabled once the cart has hydrated
}

test.describe("browse", () => {
  test("lists a first page and filters, sorts and paginates via the URL", async ({ page }) => {
    await ready(page);
    await expect(page.getByRole("heading", { level: 2 })).toHaveCount(8);
    await expect(page.getByRole("status").first()).toHaveText("10 products");

    await page.getByLabel("Category").selectOption("clothing");
    await expect(page).toHaveURL(/category=clothing/);
    await expect(page.getByRole("status").first()).toHaveText("4 products");

    await page.getByLabel("Category").selectOption("");
    await page.getByLabel("Sort by").selectOption("price-asc");
    await expect(page).toHaveURL(/sort=price-asc/);
    await expect(page.getByRole("heading", { level: 2 }).first()).toHaveText("Product 2");

    await page.getByRole("link", { name: "Next" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByRole("heading", { level: 2 })).toHaveCount(2);
  });

  test("debounced search updates the URL and shows the empty state", async ({ page }) => {
    await ready(page);
    await page.getByLabel("Search").fill("zzz-nothing");
    await expect(page).toHaveURL(/q=zzz-nothing/);
    await expect(page.getByText("No products match your filters.")).toBeVisible();
    await page.getByRole("link", { name: "Clear filters" }).click();
    await expect(page.getByRole("heading", { level: 2 })).toHaveCount(8);
  });

  test("filter state survives a reload and is shareable", async ({ page }) => {
    await page.goto("/?category=clothing&sort=price-desc");
    await expect(page.getByRole("status").first()).toHaveText("4 products");
    await expect(page.getByLabel("Category")).toHaveValue("clothing");
    await expect(page.getByLabel("Sort by")).toHaveValue("price-desc");
  });
});

test.describe("cart", () => {
  test("add, change quantity, confirm totals, reload and confirm persistence", async ({ page }) => {
    await ready(page);
    await addToCart(page, 1).click(); // $109.95
    await page.getByRole("button", { name: "Increase quantity of Product 1" }).click();
    await addToCart(page, 2).click(); // $20.00
    await expect(cartButton(page)).toHaveAccessibleName("Cart, 3 items");

    await cartButton(page).click();
    await expect(drawer(page)).toBeVisible();
    // 2 x 109.95 + 1 x 20.00 = 239.90
    await expect(drawer(page).getByText("$239.90")).toBeVisible();

    await page.reload();
    await expect(cartButton(page)).toHaveAccessibleName("Cart, 3 items");
    await cartButton(page).click();
    await expect(drawer(page).getByText("$239.90")).toBeVisible();

    await drawer(page).getByRole("button", { name: "Remove Product 1 from cart" }).click();
    await expect(drawer(page).getByText("$20.00").last()).toBeVisible();
    await drawer(page).getByRole("button", { name: "Decrease quantity of Product 2" }).click();
    await expect(drawer(page).getByText("Your cart is empty.")).toBeVisible();
    await expect(drawer(page).getByText("$0.00")).toBeVisible();
  });

  test("caps quantity at 10 with a visible message", async ({ page }) => {
    await ready(page);
    await addToCart(page, 1).click();
    const plus = page.getByRole("button", { name: "Increase quantity of Product 1" });
    for (let i = 1; i < 10; i++) await plus.click();
    // aria-disabled, not disabled, so keyboard focus is not dropped at the cap
    await expect(plus).toHaveAttribute("aria-disabled", "true");
    // Playwright will not click an aria-disabled control; a keyboard user can still press it
    await plus.press("Enter");
    await expect(plus).toBeFocused();
    await expect(cartButton(page)).toHaveAccessibleName("Cart, 10 items");
    // the closed drawer renders the same stepper, so scope to the page content
    await expect(page.locator("#main-content").getByText("Maximum of 10 per item.")).toBeVisible();
  });

  test("starts empty when stored cart data is corrupted", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("cart-v1", "{garbage"));
    await ready(page);
    await expect(cartButton(page)).toHaveAccessibleName("Cart, 0 items");
  });

  test("two tabs stay in sync through storage events", async ({ context }) => {
    const a = await context.newPage();
    const b = await context.newPage();
    await ready(a);
    await ready(b);
    await addToCart(a, 1).click();
    await expect(cartButton(b)).toHaveAccessibleName("Cart, 1 item");
    await b.getByRole("button", { name: "Increase quantity of Product 1" }).click();
    await expect(cartButton(a)).toHaveAccessibleName("Cart, 2 items");
  });
});

test.describe("keyboard and accessibility", () => {
  test("skip link moves focus to main content", async ({ page }) => {
    await ready(page);
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
  });

  test("drawer closes on Escape and focus returns to the Cart button", async ({ page }) => {
    await ready(page);
    await cartButton(page).focus();
    await page.keyboard.press("Enter");
    await expect(drawer(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer(page)).toBeHidden();
    await expect(cartButton(page)).toBeFocused();
  });

  test("keyboard focus follows the control that replaces the one pressed", async ({ page }) => {
    await ready(page);
    await addToCart(page, 1).focus();
    await page.keyboard.press("Enter");
    const plus = page.getByRole("button", { name: "Increase quantity of Product 1" });
    await expect(plus).toBeFocused();
    await page.keyboard.press("Shift+Tab"); // to −
    await page.keyboard.press("Enter");
    await expect(addToCart(page, 1)).toBeFocused();
  });

  test("drawer traps focus while open", async ({ page }) => {
    await ready(page);
    await addToCart(page, 1).click(); // a line in the drawer, so it has more than one control
    await cartButton(page).click();
    // A native modal dialog makes the page behind it inert. Tab past the last control goes to the
    // browser's own UI (reported as <body>), then wraps back into the dialog; it never reaches the
    // page. So check every stop over two full cycles, not where focus happens to be after N tabs.
    const stops: string[] = [];
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      stops.push(
        await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return "browser";
          return el.closest("dialog") ? "dialog" : `page: ${el.outerHTML.slice(0, 80)}`;
        }),
      );
    }
    expect(stops.filter((s) => s.startsWith("page"))).toEqual([]);
    expect(stops).toContain("dialog");
  });

  const wcag = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
  test("no axe violations: listing", async ({ page }) => {
    await ready(page);
    expect((await new AxeBuilder({ page }).withTags(wcag).analyze()).violations).toEqual([]);
  });
  test("no axe violations: empty state", async ({ page }) => {
    await page.goto("/?q=zzz");
    await expect(page.getByText("No products match your filters.")).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(wcag).analyze()).violations).toEqual([]);
  });
  test("no axe violations: open cart drawer with items", async ({ page }) => {
    await ready(page);
    await addToCart(page, 1).click();
    await cartButton(page).click();
    await expect(drawer(page)).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(wcag).analyze()).violations).toEqual([]);
  });
  test("no axe violations: mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await ready(page);
    expect((await new AxeBuilder({ page }).withTags(wcag).analyze()).violations).toEqual([]);
  });
});
