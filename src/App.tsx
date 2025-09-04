import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import Login from "./pages/Login";
import Unauthorized from "./pages/Unauthorized";
import Admin from "./pages/Admin";
import Judge from "./pages/Judge";
import Viewer from "./pages/Viewer";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { PublicRoute } from "./components/PublicRoute";
import HomeRedirect from "./components/HomeRedirect";
import Header from "./components/Header";
import { useEffect } from "react";
import { onUnauthorized } from "./lib/api";
import { useAuthStore } from "./store/authStore";
import { useNavigate } from "react-router-dom";

function AppRouter() {
  const logout = useAuthStore((s) => s.logout);
  const token = useAuthStore((s) => s.token);
  const validateToken = useAuthStore((s) => s.validateToken);
  const navigate = useNavigate();

  useEffect(() => {
    // register global 401 handler
    onUnauthorized(() => {
      logout();
      navigate("/login");
    });
    const run = async () => {
      if (!token) return;
      const ok = await validateToken();
      if (!ok) {
        navigate("/login");
      }
    };
    void run();
  }, [logout, navigate, token, validateToken]);

  return (
    <>
      <Header />
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/home" element={<HomeRedirect />} />
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />
        <Route path="/unauthorized" element={<Unauthorized />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute requiredRole="Admin">
              <Admin />
            </ProtectedRoute>
          }
        />
        <Route
          path="/judge"
          element={
            <ProtectedRoute requiredRole="Judge">
              <Judge />
            </ProtectedRoute>
          }
        />
        <Route
          path="/viewer"
          element={
            <ProtectedRoute requiredRole="Viewer">
              <Viewer />
            </ProtectedRoute>
          }
        />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
