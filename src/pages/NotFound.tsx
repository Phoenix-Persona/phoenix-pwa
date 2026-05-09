import { useSeoMeta } from "@unhead/react";
import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";

import { AppHeader } from "@/components/AppHeader";
import { ImigongoSeal } from "@/components/ImigongoBand";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useSeoMeta({
    title: "Not found — Feniksi",
    description:
      "The page you are looking for could not be found. Return to Feniksi to continue.",
  });

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader />

      <main id="main-content" className="flex-1 grid place-items-center container py-20">
        <div className="text-center max-w-lg space-y-7 relative">
          <div className="relative inline-block">
            <ImigongoSeal
              size={200}
              colorClass="text-imigongo-clay"
              className="opacity-50 motion-safe:animate-[spin_60s_linear_infinite]"
            />
            <div className="absolute inset-0 grid place-items-center">
              <span className="font-display text-6xl font-medium text-imigongo-charcoal">
                404
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="font-display text-3xl md:text-4xl font-medium tracking-tight">
              The voice you're looking for isn't here.
            </h1>
            <p className="text-muted-foreground leading-relaxed">
              The page or persona at{" "}
              <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted">
                {location.pathname}
              </code>{" "}
              couldn't be found. It may have been removed, or the URL was
              mistyped.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Button asChild className="rounded-full px-6">
              <Link to="/">Return home</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full px-6">
              <Link to="/my-personas">My personas</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default NotFound;
