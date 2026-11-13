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

  describe("search box follows the URL", () => {
    it("clears when the URL drops q from outside (the empty state's Clear filters link)", () => {
      nav.search = "q=zzz";
      const { rerender } = render(<Filters categories={[]} />);
      expect(screen.getByLabelText("Search")).toHaveValue("zzz");
      nav.search = "";
      rerender(<Filters categories={[]} />);
      expect(screen.getByLabelText("Search")).toHaveValue("");
    });

    it("shows q again on Back after it was cleared", () => {
      nav.search = "q=hat";
      const { rerender } = render(<Filters categories={[]} />);
      nav.search = "";
      rerender(<Filters categories={[]} />);
      nav.search = "q=hat";
      rerender(<Filters categories={[]} />);
      expect(screen.getByLabelText("Search")).toHaveValue("hat");
    });

    it("does not overwrite typing when the URL catches up with an earlier write", async () => {
      const user = userEvent.setup();
      const { rerender } = render(<Filters categories={[]} />);
      const box = screen.getByLabelText("Search");
      await user.type(box, "ba");
      await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/?q=ba", { scroll: false }), {
        timeout: 1500,
      });
      await user.type(box, "g "); // still typing while the navigation is in flight
      nav.search = "q=ba";
      rerender(<Filters categories={[]} />);
      expect(box).toHaveValue("bag ");
    });

    it("keeps a trailing space the URL trims away", async () => {
      const user = userEvent.setup();
      const { rerender } = render(<Filters categories={[]} />);
      const box = screen.getByLabelText("Search");
      await user.type(box, "red ");
      await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/?q=red", { scroll: false }), {
        timeout: 1500,
      });
      nav.search = "q=red";
      rerender(<Filters categories={[]} />);
      expect(box).toHaveValue("red ");
    });
  });
});
