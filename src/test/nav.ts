import { vi } from "vitest";

/** Controllable stand-in for next/navigation, shared by the setup mock and the tests. */
export const nav = {
  replace: vi.fn(),
  search: "",
};
