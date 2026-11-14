import { Routes, Route, useLocation } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { CalendarProvider } from "@/context/CalendarContext";
import LandingPage from "./LandingPage";
import SearchCourses from "./SearchCourses";
import CalendarPage from "./CalendarPage";
import NotFound from "./NotFound";

const Index = () => {
  const location = useLocation();

  return (
    <CalendarProvider>
      <div className="min-h-screen w-full">
        <AppSidebar />
        <main className="min-h-[calc(100vh-72px)] bg-background">
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
