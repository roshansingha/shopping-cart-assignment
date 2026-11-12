// @vitest-environment jsdom
import { Profiler } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useCartStore } from "../store";
import { QuantityStepper } from "./quantity-stepper";

/**
 * Performance guard: changing one product's quantity must not re-render other products' controls.
 * <Profiler> reports a commit for its subtree only when something inside it re-rendered.
 */
const ids = [1, 2, 3, 4, 5, 6, 7, 8];
const commits: Record<number, number> = {};

beforeEach(() => {
  useCartStore.setState({ lines: [], hydrated: true });
  ids.forEach((id) => (commits[id] = 0));
});

function renderGrid() {
  render(
    <ul>
      {ids.map((id) => (
        <li key={id}>
          <Profiler id={`p${id}`} onRender={() => void (commits[id] += 1)}>
            <QuantityStepper productId={id} title={`Product ${id}`} />
          </Profiler>
        </li>
      ))}
    </ul>,
  );
  ids.forEach((id) => (commits[id] = 0)); // ignore the initial mount
}

describe("cart updates only re-render the affected product", () => {
  it("adding product 3 re-renders product 3 and nothing else", async () => {
    renderGrid();
    await userEvent.setup().click(screen.getByRole("button", { name: "Add to cart: Product 3" }));
    expect(commits[3]).toBeGreaterThan(0);
    for (const id of ids.filter((i) => i !== 3)) expect(commits[id]).toBe(0);
  });

  it("a further change to one product still leaves the others untouched", async () => {
    renderGrid();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Add to cart: Product 1" }));
    await user.click(screen.getByRole("button", { name: "Add to cart: Product 2" }));
    ids.forEach((id) => (commits[id] = 0));
    await user.click(screen.getByRole("button", { name: "Increase quantity of Product 2" }));
    expect(commits[2]).toBeGreaterThan(0);
    for (const id of ids.filter((i) => i !== 2)) expect(commits[id]).toBe(0);
  });
});
