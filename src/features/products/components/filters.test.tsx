// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { nav } from "@/test/nav";
import { Filters } from "./filters";

beforeEach(() => {
  nav.replace.mockClear();
  nav.search = "";
});

describe("Filters", () => {
  it("writes category to the URL and resets the page", async () => {
    nav.search = "page=2&sort=price-asc";
    render(<Filters categories={["clothing", "gadgets"]} />);
    await userEvent.setup().selectOptions(screen.getByLabelText("Category"), "gadgets");
    expect(nav.replace).toHaveBeenCalledWith("/?category=gadgets&sort=price-asc", {
      scroll: false,
    });
  });

  it("writes sort to the URL and keeps other filters", async () => {
    nav.search = "category=gadgets";
    render(<Filters categories={["gadgets"]} />);
    await userEvent.setup().selectOptions(screen.getByLabelText("Sort by"), "price-desc");
    expect(nav.replace).toHaveBeenCalledWith("/?category=gadgets&sort=price-desc", {
      scroll: false,
    });
  });

  it("reflects the current URL in the controls", () => {
    nav.search = "q=hat&category=gadgets&sort=name-asc";
    render(<Filters categories={["gadgets"]} />);
    expect(screen.getByLabelText("Search")).toHaveValue("hat");
    expect(screen.getByLabelText("Category")).toHaveValue("gadgets");
    expect(screen.getByLabelText("Sort by")).toHaveValue("name-asc");
  });

  // Real timers: RTL's async helpers hang under Vitest fake timers. Cost is ~0.7s total.
  it("debounces search: one URL update after typing stops", async () => {
    const user = userEvent.setup();
    render(<Filters categories={[]} />);
    await user.type(screen.getByLabelText("Search"), "bag");
    expect(nav.replace).not.toHaveBeenCalled(); // typed 3 keys, nothing written yet
    await waitFor(() => expect(nav.replace).toHaveBeenCalled(), { timeout: 1500 });
    await new Promise((r) => setTimeout(r, 400)); // no further calls arrive
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(nav.replace).toHaveBeenCalledWith("/?q=bag", { scroll: false });
  });

  it("does not update the URL after unmount", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Filters categories={[]} />);
    await user.type(screen.getByLabelText("Search"), "x");
    unmount();
    await new Promise((r) => setTimeout(r, 450));
    expect(nav.replace).not.toHaveBeenCalled();
  });
});
