import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import LandingPage from "@/pages/LandingPage";

function renderLanding() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/courses" element={<h1>Course search</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("landing page", () => {
  afterEach(() => cleanup());

  it("keeps the catalog search as the primary action", () => {
    renderLanding();

    expect(screen.getByRole("heading", { level: 1, name: /what are you taking next quarter\?/i })).toBeInTheDocument();
    expect(screen.getByText("Search the catalog and build a conflict-free week.")).toBeInTheDocument();
    expect(screen.getByText(/free to use/i)).toHaveTextContent(/no account required/i);

    fireEvent.change(screen.getByRole("textbox", { name: "Search the course catalog" }), {
      target: { value: "CSE 100" },
    });
    fireEvent.submit(screen.getByRole("search"));

    expect(screen.getByRole("heading", { name: "Course search" })).toBeInTheDocument();
  });

  it("opens the catalog when the search is empty", () => {
    renderLanding();
    fireEvent.submit(screen.getByRole("search"));
    expect(screen.getByRole("heading", { name: "Course search" })).toBeInTheDocument();
  });

  it("keeps the section anchors and footer actions", () => {
    renderLanding();

    expect(document.getElementById("how-it-works")).toBeInTheDocument();
    expect(document.getElementById("about")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Send feedback" })).toHaveAttribute(
      "href",
      "https://github.com/wangj000/TritonSchedule/issues/new",
    );
    expect(screen.getByRole("link", { name: "View on GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/wangj000/TritonSchedule",
    );
    expect(screen.getByText(/not affiliated with uc san diego/i)).toBeInTheDocument();
  });
});
