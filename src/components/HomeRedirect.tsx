import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";

export default function HomeRedirect() {
  const isAuth = useAuthStore((s) => s.isAuthenticated());
  const user = useAuthStore((s) => s.user);

  if (!isAuth) return <Navigate to="/login" replace />;

  const role: string = user?.role ?? "";
  if (role === "Admin") return <Navigate to="/admin" replace />;
  if (role === "Judge") return <Navigate to="/judge" replace />;
  if (role === "Viewer") return <Navigate to="/viewer" replace />;

  return <Navigate to="/home" replace />;
}
