import React from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

type Props = {
  children: React.ReactNode;
};

export function PublicRoute({ children }: Props) {
  const isAuth = useAuthStore((s) => s.isAuthenticated());
  // If authenticated, redirect to home
  if (isAuth) return <Navigate to="/home" replace />;
  return <>{children}</>;
}
