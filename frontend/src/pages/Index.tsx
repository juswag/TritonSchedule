import { Routes, Route, useLocation } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { CalendarProvider } from "@/context/CalendarContext";
import { cn } from "@/lib/utils";
import LandingPage from "./LandingPage";
import SearchCourses from "./SearchCourses";
import CalendarPage from "./CalendarPage";
import NotFound from "./NotFound";

const Index = () => {
  const location = useLocation();
  const isLandingPage = location.pathname === "/";

  return (
    <CalendarProvider>
      <div className={cn("min-h-screen w-full", !isLandingPage && "bg-background text-foreground")}>
        {!isLandingPage && (
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
          >
            Skip to content
          </a>
        )}
        <AppSidebar />
        <main id="main-content" className="min-h-[calc(100vh-72px)] bg-background">
          <div key={location.pathname} className="page-transition">
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/courses" element={<SearchCourses />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </div>
        </main>
      </div>
    </CalendarProvider>
  );
};

export default Index;
