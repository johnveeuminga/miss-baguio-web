import { useAuthStore } from "@/store/authStore";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "react-router-dom";

function initials(name?: string | null) {
  if (!name) return "U";
  return name
    .split(" ")
    .map((s) => s[0]?.toUpperCase() || "")
    .slice(0, 2)
    .join("");
}

export default function Header() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const logout = useAuthStore((s) => s.logout);

  return (
    <header className="w-full flex items-center justify-end gap-4 p-4 bg-[var(--card)] border-b border-[var(--border)]">
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
    </header>
  );
}
