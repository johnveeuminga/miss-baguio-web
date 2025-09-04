import React, { useState } from "react";
import { post } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await post("/api/auth/login", { username, password });
      login(res.token, res.user);
      // role-based redirect priority: Admin -> Judge -> Viewer -> home
      const roles: string[] = res?.user?.roles ?? [];
      if (roles.includes("Admin")) {
        navigate("/admin");
      } else if (roles.includes("Judge")) {
        navigate("/judge");
      } else if (roles.includes("Viewer")) {
        navigate("/viewer");
      } else {
        navigate("/home");
      }
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const message = (err as any)?.message || "Login failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <form onSubmit={submit} className="p-6">
          <CardHeader>
            <h2 className="text-2xl mb-1 font-bold">Sign in</h2>
            <p className="text-sm text-[var(--card-foreground)]">
              Enter your credentials
            </p>
          </CardHeader>
          <CardContent>
            {error && <div className="text-red-400 mb-2">{error}</div>}
            <div className="mb-3">
              <Input
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="mb-4">
              <Input
                placeholder="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button className="w-full" type="submit" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
