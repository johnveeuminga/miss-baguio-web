import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import Login from "./pages/Login";
import Unauthorized from "./pages/Unauthorized";
import { Navigate } from "react-router-dom";
import JudgeHome from "./pages/JudgeHome";
import Scoring from "./pages/Scoring";
import FinalsScoring from "./pages/FinalsScoring";
import ViewerScoreboard from "./pages/ViewerScoreboard";
import Top5Ranking from "./pages/Top5Ranking";
import AdminActiveControl from "./components/AdminActiveControl";
import ResultsCombined from "./pages/admin/ResultsCombined";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { PublicRoute } from "./components/PublicRoute";
import HomeRedirect from "./components/HomeRedirect";
import Header from "./components/Header";
import { useEffect, useState } from "react";
import { onUnauthorized } from "./lib/api";
import { useAuthStore } from "./store/authStore";
import { useNavigate } from "react-router-dom";
import { Toaster } from "sonner";

function AppRouter() {
  const logout = useAuthStore((s) => s.logout);
  const token = useAuthStore((s) => s.token);
  const validateToken = useAuthStore((s) => s.validateToken);
  const navigate = useNavigate();
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    onUnauthorized(() => {
      logout();
      navigate("/login");
    });

    const run = async () => {
      try {
        if (!token) return;
        const ok = await validateToken();
        console.log("Token valid:", ok);
        if (!ok) {
          navigate("/login");
        }
      } finally {
        setCheckingAuth(false);
      }
    };

    void run();
  }, [logout, navigate, token, validateToken]);

  return (
    <>
      <Header />
      {checkingAuth ? (
        <div className="p-8">Checking authentication…</div>
      ) : (
        <Routes>
          <Route path="/" element={<Login />} />
          <Route
            path="/judge/home"
            element={
              <ProtectedRoute requiredRole="Judge">
                <JudgeHome />
              </ProtectedRoute>
            }
          />
          <Route
            path="/scoring"
            element={
              <ProtectedRoute requiredRole="Judge">
                <Scoring />
              </ProtectedRoute>
            }
          />
          <Route
            path="/finals-scoring"
            element={
              <ProtectedRoute requiredRole="Judge">
                <FinalsScoring />
              </ProtectedRoute>
            }
          />
          <Route
            path="/judge/top5"
            element={
              <ProtectedRoute requiredRole="Judge">
                <Top5Ranking />
              </ProtectedRoute>
            }
          />
          <Route
            path="/viewer/scoreboard"
            element={
              <ProtectedRoute requiredRole="Viewer">
                <ViewerScoreboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/active"
            element={
              <ProtectedRoute requiredRole="Admin">
                <AdminActiveControl />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/results"
            element={
              <ProtectedRoute requiredRole="Admin">
                <ResultsCombined />
              </ProtectedRoute>
            }
          />
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
                {/* Redirect admin root to admin active control */}
                <Navigate to="/admin/active" replace />
              </ProtectedRoute>
            }
          />
          <Route
            path="/judge"
            element={
              <ProtectedRoute requiredRole="Judge">
                <Navigate to="/judge/home" replace />
              </ProtectedRoute>
            }
          />
          <Route
            path="/viewer"
            element={
              <ProtectedRoute requiredRole="Viewer">
                <Navigate to="/viewer/scoreboard" replace />
              </ProtectedRoute>
            }
          />
        </Routes>
      )}
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRouter />
        <Toaster />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
