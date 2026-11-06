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

  return (
    <header className="sticky top-0 z-50 bg-card">
      <div className="flex h-[72px] w-full items-stretch justify-between px-4 sm:px-8">
        <NavLink
          to="/"
          aria-label="TritonSchedule home"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:ring-offset-2 focus-visible:ring-offset-card sm:gap-2.5"
        >
          <img
            src="/triton-trident.png"
            alt=""
            width="42"
            height="48"
            className="h-9 w-8 select-none object-contain dark:invert dark:hue-rotate-180 dark:mix-blend-screen sm:h-11 sm:w-10"
          />
          <span className="text-lg font-bold tracking-[-0.035em] text-foreground sm:text-[22px]">
            TritonSchedule
          </span>
        </NavLink>

        <div className="flex items-center gap-1 sm:gap-3">
          {isLandingPage ? (
            <nav className="flex items-center gap-1 text-sm font-medium text-foreground sm:gap-2" aria-label="Landing navigation">
              <a
                href="#how-it-works"
                className="hidden rounded-md px-3 py-2 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/20 md:inline-flex"
              >
                How it works
              </a>
              <a
                href="#about"
                className="hidden rounded-md px-3 py-2 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/20 md:inline-flex"
              >
                About
              </a>
              <NavLink
                to="/calendar"
                aria-label="Open schedule"
                className="ml-1 inline-flex h-10 items-center gap-2 rounded-md border border-primary/70 px-2 text-primary outline-none transition-colors hover:bg-primary/[0.045] focus-visible:ring-2 focus-visible:ring-primary/20 sm:px-4"
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
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="hidden truncate sm:inline">{item.title}</span>
                  </NavLink>
                );
              })}
            </nav>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
