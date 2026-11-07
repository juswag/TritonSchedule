import { useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CourseQuickSearch } from "@/components/schedule/CourseQuickSearch";
import { searchScheduleCourses } from "@/lib/scheduleApi";
import type { ScheduleCourse } from "@/types/generation";

vi.mock("@/lib/scheduleApi", () => ({ searchScheduleCourses: vi.fn() }));
const search = vi.mocked(searchScheduleCourses);
const course: ScheduleCourse = {
  key: "fa26:cse110",
  term: "FA26",
  code: "CSE 110",
  title: "Software Engineering",
  options: [],
  issues: [],
};

function Harness({
  onAdd = vi.fn(),
}: {
  onAdd?: (course: ScheduleCourse) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <>
      <CourseQuickSearch
        term="FA26"
        selectedKeys={selected}
        onAdd={(course) => {
          onAdd(course);
          setSelected((keys) => [...keys, course.key]);
        }}
      />
      <button type="button">Outside search</button>
    </>
  );
}

function typeQuery(value: string) {
  const input = screen.getByRole("combobox", { name: "Quick course search" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
  return input;
}

describe("schedule quick course search", () => {
  beforeEach(() => {
    search.mockReset();
    search.mockResolvedValue([course]);
  });
  afterEach(cleanup);

  it("adds with the keyboard, preserves the query, and prevents duplicate additions", async () => {
    const added = vi.fn();
    render(<Harness onAdd={added} />);
    const input = typeQuery("cse 110");
    await screen.findByRole("option", { name: "Add CSE 110" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(added).toHaveBeenCalledWith(course);
    const option = screen.getByRole("option", { name: "Added CSE 110" });
    expect(option).toHaveAttribute("aria-disabled", "true");
    expect(input).toHaveValue("cse 110");
    fireEvent.click(option);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(added).toHaveBeenCalledTimes(1);
  });

  it("dismisses on Escape and outside interaction and clears without leaving the input", async () => {
    render(<Harness />);
    const input = typeQuery("CSE");
    await screen.findByRole("option", { name: "Add CSE 110" });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    fireEvent.focus(input);
    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Outside search" }),
    );
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    fireEvent.focus(input);
    fireEvent.click(
      screen.getByRole("button", { name: "Clear course search" }),
    );
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("ignores stale responses even if the transport resolves an aborted request", async () => {
    let resolveOld: (value: ScheduleCourse[]) => void;
    search.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    search.mockResolvedValueOnce([
      {
        ...course,
        key: "fa26:math109",
        code: "MATH 109",
        title: "Mathematical Reasoning",
      },
    ]);
    render(<Harness />);
    typeQuery("CSE");
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    const signal = search.mock.calls[0][2];
    typeQuery("MATH");
    expect(signal?.aborted).toBe(true);
    await screen.findByRole("option", { name: "Add MATH 109" });
    await act(async () => {
      resolveOld!([course]);
    });
    expect(
      screen.queryByRole("option", { name: "Add CSE 110" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Add MATH 109" }),
    ).toBeInTheDocument();
  });

  it("shows errors with retry and distinguishes a successful empty search", async () => {
    search.mockRejectedValueOnce(new Error("Catalog temporarily unavailable."));
    search.mockResolvedValueOnce([]);
    render(<Harness />);
    typeQuery("CSE");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Catalog temporarily unavailable.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByText("No courses found. Try a code or title."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not search while the term is unavailable", () => {
    render(<CourseQuickSearch term="" selectedKeys={[]} onAdd={vi.fn()} />);
    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(search).not.toHaveBeenCalled();
  });
});
