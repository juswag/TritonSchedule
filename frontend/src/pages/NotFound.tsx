import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-72px)] max-w-lg flex-col items-center justify-center px-6 text-center">
      <p className="font-display text-7xl leading-none text-foreground">404</p>
      <h1 className="mt-4 text-xl font-semibold text-foreground">This page does not exist</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">The link may be out of date, or the page was moved.</p>
      <Button asChild className="mt-6 h-11 rounded-full px-5">
        <Link to="/">Back to home</Link>
      </Button>
    </div>
  );
};

export default NotFound;
