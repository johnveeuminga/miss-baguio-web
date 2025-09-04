import React from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

type Props = {
  children: React.ReactNode;
  requiredRole?: string;
};

export function ProtectedRoute({ children, requiredRole }: Props) {
  const isAuth = useAuthStore((s) => s.isAuthenticated());
  const hasRole = useAuthStore((s) => s.hasRole(requiredRole || ""));

  const user = useAuthStore((s) => s.user);

  console.log(user);

  if (!isAuth) return <Navigate to="/login" replace />;
  if (requiredRole && !hasRole) return <Navigate to="/unauthorized" replace />;
  return <>{children}</>;
}
