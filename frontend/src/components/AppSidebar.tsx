import { useEffect, useState } from "react";
import { CalendarDays, Search } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";

const navItems = [
  { title: "Courses", url: "/courses", icon: Search },
  { title: "Schedule", url: "/calendar", icon: CalendarDays },
];

export function AppSidebar() {
  const location = useLocation();
  const isLandingPage = location.pathname === "/";
  const [overHero, setOverHero] = useState(true);

  useEffect(() => {
    if (!isLandingPage) return;
    const onScroll = () => setOverHero(window.scrollY < 32);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isLandingPage]);

  const onSky = isLandingPage && overHero;

  return (
    <header
      className={cn(
        "z-50 transition-[background-color,border-color,box-shadow] duration-300",
        isLandingPage ? "fixed inset-x-0 top-0" : "sticky top-0 bg-card",
        onSky
          ? "border-b border-transparent bg-transparent"
          : isLandingPage
            ? "border-b border-border/80 bg-card/85 shadow-sm backdrop-blur-md"
            : "bg-card",
      )}
    >
      <div className="flex h-[72px] w-full items-stretch justify-between px-4 sm:px-8">
        <NavLink
          to="/"
          aria-label="TritonSchedule home"
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-md outline-none focus-visible:ring-2 sm:gap-2.5",
            onSky
              ? "focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
              : "focus-visible:ring-primary/25 focus-visible:ring-offset-2 focus-visible:ring-offset-card",
          )}
        >
          <span
            className={cn(
              "inline-flex h-9 w-8 shrink-0 items-center justify-center overflow-hidden sm:h-11 sm:w-10",
              onSky && "rounded-lg bg-white",
            )}
          >
            <img
              src="/triton-trident.png"
              alt=""
              width="42"
              height="48"
              className={cn(
                "h-full w-full select-none object-contain",
                onSky ? "scale-[1.7]" : "dark:invert dark:hue-rotate-180 dark:mix-blend-screen",
              )}
            />
          </span>
          <span
            className={cn(
              "text-lg font-bold tracking-[-0.035em] sm:text-[22px]",
              onSky ? "text-white" : "text-foreground",
            )}
          >
            TritonSchedule
          </span>
        </NavLink>

        <div className="flex items-center gap-1 sm:gap-3">
          {isLandingPage ? (
            <nav className="flex items-center gap-1 text-sm font-medium sm:gap-2" aria-label="Landing navigation">
              <a
                href="#how-it-works"
                className={cn(
                  "hidden rounded-md px-3 py-2 outline-none transition-colors focus-visible:ring-2 md:inline-flex",
                  onSky
                    ? "text-white/90 hover:bg-white/10 focus-visible:ring-white/70"
                    : "text-foreground hover:bg-muted focus-visible:ring-primary/20",
                )}
              >
                How it works
              </a>
              <a
                href="#about"
                className={cn(
                  "hidden rounded-md px-3 py-2 outline-none transition-colors focus-visible:ring-2 md:inline-flex",
                  onSky
                    ? "text-white/90 hover:bg-white/10 focus-visible:ring-white/70"
                    : "text-foreground hover:bg-muted focus-visible:ring-primary/20",
                )}
              >
                About
              </a>
              <NavLink
                to="/calendar"
                aria-label="Open schedule"
                className={cn(
                  "ml-1 inline-flex h-10 items-center gap-2 rounded-full border px-2 outline-none transition-colors focus-visible:ring-2 sm:px-4",
                  onSky
                    ? "border-white/45 text-white hover:bg-white/10 focus-visible:ring-white/70"
                    : "border-primary/70 text-primary hover:bg-primary/[0.045] focus-visible:ring-primary/20",
                )}
              >
                <CalendarDays className="h-4 w-4" />
                <span className="hidden sm:inline">Open schedule</span>
              </NavLink>
            </nav>
          ) : (
            <nav className="flex h-full min-w-0 items-stretch" aria-label="Primary navigation">
              {navItems.map((item) => {
                const isActive = location.pathname === item.url;
                return (
                  <NavLink
                    key={item.title}
                    to={item.url}
                    aria-label={item.title}
                    className={cn(
                      "relative inline-flex min-w-0 items-center justify-center gap-2 px-2 text-sm font-medium outline-none transition-colors focus-visible:bg-primary/[0.055] sm:px-5",
                      isActive
                        ? "text-primary after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-primary sm:after:inset-x-5"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="hidden truncate sm:inline">{item.title}</span>
                  </NavLink>
                );
              })}
            </nav>
          )}
          <ThemeToggle className={onSky ? "text-white hover:bg-white/10 hover:text-white" : undefined} />
        </div>
      </div>
    </header>
  );
}
