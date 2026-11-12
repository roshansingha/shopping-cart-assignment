import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { server } from "./server";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import type { ImgHTMLAttributes } from "react";

// Outside the Next runtime: no cache layer, no router, no image optimizer.
vi.mock("next/cache", () => ({ cacheLife: () => {} }));
vi.mock("next/navigation", async () => {
  const { nav } = await import("./nav");
  return {
    useRouter: () => ({ replace: nav.replace, push: nav.replace }),
    usePathname: () => "/",
    useSearchParams: () => new URLSearchParams(nav.search),
  };
});
vi.mock("next/image", () => ({
  default: (
    props: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean },
  ) => {
    // Keep only real <img> attributes; next/image-only props must not reach the DOM.
    const { fill, priority, ...img } = props;
    void fill;
    void priority;
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...img} alt={img.alt ?? ""} />;
  },
}));

// jsdom has no modal <dialog>; emulate the parts the cart drawer uses.
if (typeof HTMLDialogElement !== "undefined") {
  HTMLDialogElement.prototype.showModal ??= function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
}

// Any request MSW has no handler for fails the test: no accidental real network calls.
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());
