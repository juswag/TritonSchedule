import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";

const STORAGE_KEY = "tritonschedule-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";
type Theme = "light" | "dark";
type Appearance = "Light" | "Dark" | "System";

// Both next-themes and the toast UI subscribe to media queries. Support the
// legacy and modern listener APIs so tests can deliver real change events.
function mockSystemTheme() {
  let theme: Theme = "light";
  const queries = new Map<string, MediaQueryList>();

  vi.spyOn(window, "matchMedia").mockImplementation((query) => {
    const existing = queries.get(query);
    if (existing) return existing;

    const target = new EventTarget();
    const mediaQuery: MediaQueryList = Object.assign(target, {
      media: query,
      matches: query === DARK_QUERY && theme === "dark",
      onchange: null,
      addListener: (listener: ((event: MediaQueryListEvent) => void) | null) => {
        if (listener) target.addEventListener("change", listener as EventListener);
      },
      removeListener: (listener: ((event: MediaQueryListEvent) => void) | null) => {
        if (listener) target.removeEventListener("change", listener as EventListener);
      },
    });
    queries.set(query, mediaQuery);
    return mediaQuery;
  });

  return (nextTheme: Theme) => {
    act(() => {
      theme = nextTheme;
      for (const query of queries.values()) {
        const matches = query.media === DARK_QUERY && theme === "dark";
        if (matches === query.matches) continue;
        Object.defineProperty(query, "matches", { value: matches, configurable: true });
        const event = Object.assign(new Event("change"), { matches, media: query.media });
        query.dispatchEvent(event);
        query.onchange?.call(query, event as MediaQueryListEvent);
      }
    });
  };
}

async function openAppearanceMenu() {
  fireEvent.keyDown(screen.getByRole("button", { name: /^Color theme:/ }), { key: "Enter" });
  await screen.findByRole("menu");
}

async function chooseAppearance(name: Appearance) {
  await openAppearanceMenu();
  fireEvent.click(screen.getByRole("menuitemradio", { name }));
  await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
}

async function expectTheme(theme: Theme) {
  await waitFor(() => {
    expect(document.documentElement).toHaveClass(theme);
    expect(document.documentElement).not.toHaveClass(theme === "dark" ? "light" : "dark");
    expect(document.documentElement.style.colorScheme).toBe(theme);
  });
}

describe("appearance settings", () => {
  let setSystemTheme: ReturnType<typeof mockSystemTheme>;

  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, "", "/");
    setSystemTheme = mockSystemTheme();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.style.removeProperty("color-scheme");
  });

  it.each<Theme>(["light", "dark"])("uses the %s system theme on a fresh visit", async (theme) => {
    setSystemTheme(theme);
    render(<App />);

    await expectTheme(theme);
    expect(screen.getByRole("button", { name: "Color theme: System" })).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it.each<Appearance>(["Light", "Dark", "System"])("applies and saves the %s choice", async (appearance) => {
    render(<App />);
    if (appearance !== "Dark") await chooseAppearance("Dark");

    await chooseAppearance(appearance);

    await expectTheme(appearance === "Dark" ? "dark" : "light");
    expect(localStorage.getItem(STORAGE_KEY)).toBe(appearance.toLowerCase());
    expect(screen.getByRole("button", { name: `Color theme: ${appearance}` })).toBeInTheDocument();
    await openAppearanceMenu();
    for (const option of ["Light", "Dark", "System"]) {
      expect(screen.getByRole("menuitemradio", { name: option }))
        .toHaveAttribute("aria-checked", String(option === appearance));
    }
  });

  it.each<Appearance>(["Light", "Dark", "System"])("restores the saved %s choice after remounting", async (appearance) => {
    const firstVisit = render(<App />);
    await chooseAppearance(appearance);
    firstVisit.unmount();

    // A remount must restore the preference, rather than inherit the old DOM.
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.style.removeProperty("color-scheme");
    setSystemTheme("dark");
    render(<App />);

    await expectTheme(appearance === "Light" ? "light" : "dark");
    expect(localStorage.getItem(STORAGE_KEY)).toBe(appearance.toLowerCase());
    expect(screen.getByRole("button", { name: `Color theme: ${appearance}` })).toBeInTheDocument();
  });

  it("follows live system changes while System is selected", async () => {
    render(<App />);
    await chooseAppearance("Dark");
    await chooseAppearance("System");
    await expectTheme("light");

    setSystemTheme("dark");
    await expectTheme("dark");
    setSystemTheme("light");
    await expectTheme("light");

    expect(localStorage.getItem(STORAGE_KEY)).toBe("system");
    expect(screen.getByRole("button", { name: "Color theme: System" })).toBeInTheDocument();
  });

  it.each<Appearance>(["Light", "Dark"])("keeps an explicit %s choice until System is selected again", async (appearance) => {
    render(<App />);
    await chooseAppearance(appearance);
    const selectedTheme = appearance.toLowerCase() as Theme;
    const oppositeTheme = selectedTheme === "dark" ? "light" : "dark";

    setSystemTheme(selectedTheme);
    setSystemTheme(oppositeTheme);
    await expectTheme(selectedTheme);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(selectedTheme);

    await chooseAppearance("System");
    await expectTheme(oppositeTheme);
    setSystemTheme(selectedTheme);
    await expectTheme(selectedTheme);
  });
});
