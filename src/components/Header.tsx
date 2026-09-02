import { useAuthStore } from "@/store/authStore";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

function initials(name?: string | null) {
  if (!name) return "U";
  return name
    .split(" ")
    .map((s) => s[0]?.toUpperCase() || "")
    .slice(0, 2)
    .join("");
}

// Every route is role-gated by ProtectedRoute (see App.tsx) — visiting one
// meant for a different role silently redirects to /unauthorized with no
// explanation. This nav is the fix: show only the links each role can
// actually use, so nobody has to guess or type a URL that turns out to be
// gated to a different account.
const NAV_BY_ROLE: Record<string, { to: string; label: string }[]> = {
  Admin: [
    { to: "/admin/active", label: "Session Control" },
    { to: "/admin/results", label: "Results" },
  ],
  Judge: [
    { to: "/judge/home", label: "Home" },
    { to: "/judge/top5", label: "Top 7" },
  ],
  Viewer: [{ to: "/viewer/scoreboard", label: "Scoreboard" }],
};

const HOME_BY_ROLE: Record<string, string> = {
  Admin: "/admin/active",
  Judge: "/judge/home",
  Viewer: "/viewer/scoreboard",
};

export default function Header() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const logout = useAuthStore((s) => s.logout);
  const location = useLocation();

  const role = user?.role;
  const navLinks = (role && NAV_BY_ROLE[role]) || [];
  const homeLink = (role && HOME_BY_ROLE[role]) || "/login";

  return (
    <header className="w-full flex items-center gap-6 p-4 bg-[var(--card)] border-b border-[var(--border)]">
      <Link to={homeLink} className="shrink-0">
        <img
          src="https://miss-baguio-2025.s3.ap-southeast-1.amazonaws.com/miss-baguio-logo.png"
          alt="Miss Baguio 2025"
          className="h-[3.75rem] w-auto cursor-pointer hover:opacity-80 transition-opacity"
        />
      </Link>

      {isAuthenticated && navLinks.length > 0 && (
        <nav className="flex items-center gap-1 flex-1">
          {navLinks.map((link) => {
            const active = location.pathname.startsWith(link.to);
            return (
              <Link
                key={link.to}
                to={link.to}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      )}

      <div className="flex items-center gap-4 ml-auto">
        {isAuthenticated && (
          <>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-[var(--primary)] flex items-center justify-center text-[var(--primary-foreground)] font-bold">
                {initials(user?.fullName)}
              </div>
              <div className="text-sm text-[var(--card-foreground)]">
                {user?.fullName ?? "Guest"}
              </div>
            </div>
            <Button
              variant="ghost"
              onClick={() => {
                logout();
                window.location.href = "/login";
              }}
            >
              Logout
            </Button>
          </>
        )}
        {!isAuthenticated && (
          <Link to="/login" className={buttonVariants({ variant: "ghost" })}>
            Login
          </Link>
        )}
      </div>
    </header>
  );
}
