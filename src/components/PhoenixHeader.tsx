import { Link } from "react-router-dom";
import { LoginArea } from "@/components/auth/LoginArea";

export function PhoenixHeader() {
  return (
    <header className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-30">
      <div className="container flex items-center justify-between py-4">
        <Link
          to="/"
          className="flex items-center gap-3 group"
          aria-label="Phoenix home"
        >
          <img
            src="/icon.svg"
            alt=""
            width={32}
            height={32}
            className="rounded-lg shadow-sm group-hover:scale-105 transition-transform"
          />
          <div className="flex flex-col leading-none">
            <span className="font-semibold text-lg tracking-tight">
              Phoenix
            </span>
            <span className="text-xs text-muted-foreground">
              Uncensorable voices
            </span>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          <Link
            to="/my-personas"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            My personas
          </Link>
          <Link
            to="/onboard"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            New persona
          </Link>
        </nav>

        <LoginArea className="max-w-60" />
      </div>
    </header>
  );
}
