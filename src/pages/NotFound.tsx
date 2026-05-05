import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0e0e0e]">
      <div className="text-center">
        <h1 className="font-display mb-4 text-6xl font-bold text-blue-400 tabular-nums">404</h1>
        <p className="mb-6 text-xl text-muted-foreground">Page not found</p>
        <a href="/" className="text-blue-400 hover:text-blue-300 transition-colors font-display text-sm uppercase tracking-widest">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
