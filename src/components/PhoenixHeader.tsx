import { Link } from "react-router-dom";
import { LoginArea } from "@/components/auth/LoginArea";

export function PhoenixHeader() {
  return (
    <header className="relative bg-card/80 backdrop-blur-md sticky top-0 z-30">
      <div className="container flex items-center justify-between py-4">
        <Link
          to="/"
          className="flex items-center gap-3 group"
          aria-label="Phoenix home"
        >
          <span className="relative">
            <span className="absolute -inset-1 rounded-xl bg-rw-gold/20 blur-md opacity-0 group-hover:opacity-100 transition-opacity" />
            <img
              src="/icon.svg"
              alt=""
              width={36}
              height={36}
              className="relative rounded-lg shadow-sm group-hover:scale-105 transition-transform"
            />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="font-display font-semibold text-xl tracking-tight">
              Phoenix
            </span>
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Uncensorable voices
            </span>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-7 text-sm font-medium">
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

      {/* Imigongo accent band — Rwandan-flag stripe of clay/gold/green */}
      <div className="h-[3px] flex" aria-hidden="true">
        <div className="flex-1 bg-imigongo-clay/90" />
        <div className="flex-1 bg-rw-gold" />
        <div className="flex-1 bg-rw-green" />
      </div>
    </header>
  );
}
