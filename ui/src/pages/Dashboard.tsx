import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Github, Mail, User, Calendar } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface UserData {
  id: string;
  email: string;
  name: string;
  image: string | null;
  githubId: string | null;
  createdAt: string;
}

function Dashboard() {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const API_URL = import.meta.env.VITE_API_URL || "https://autoauditserver.vercel.app";

  useEffect(() => {
    async function fetchUser() {
      try {
        const requestUrl = `${API_URL}/auth/me`;
        const response = await fetch(requestUrl, {
          method: "GET",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          if (response.status === 401) {
            // Clear cookies and redirect to landing
            document.cookie.split(";").forEach((c) => {
              document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
            });
            sessionStorage.setItem("auth_failed", "true");
            navigate("/", { replace: true });
            return;
          }
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        setUser(data.user);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching user:", error);
        setLoading(false);
        setError("Failed to load user data");
      }
    }

    fetchUser();
  }, [navigate, API_URL]);

  async function handleLogout() {
    try {
      await fetch(`${API_URL}/auth/logout`, {
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
        credentials: "include",
      });
      
      // Clear all cookies on client side
      document.cookie.split(";").forEach((c) => {
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
      });
      
      navigate("/");
    } catch (error) {
      console.error("Error logging out:", error);
      // Even if logout fails, clear cookies and redirect
      document.cookie.split(";").forEach((c) => {
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
      });
      navigate("/");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive mb-4">{error}</p>
          <Button onClick={() => navigate("/")}>Go Home</Button>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container-custom py-12">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold mb-2">Dashboard</h1>
              <p className="text-muted-foreground">Your GitHub account details</p>
            </div>
            <Button onClick={handleLogout} variant="outline">
              Logout
            </Button>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-4">
                {user.image && (
                  <img
                    src={user.image}
                    alt={user.name}
                    className="w-20 h-20 rounded-full border-2 border-border"
                  />
                )}
                <div>
                  <CardTitle className="text-2xl">{user.name}</CardTitle>
                  <CardDescription>GitHub Account Information</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-center gap-3 p-4 rounded-lg bg-secondary/50">
                  <Mail className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium">{user.email}</p>
                  </div>
                </div>

                {user.githubId && (
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-secondary/50">
                    <Github className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">GitHub ID</p>
                      <p className="font-medium">{user.githubId}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3 p-4 rounded-lg bg-secondary/50">
                  <User className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">User ID</p>
                    <p className="font-medium font-mono text-sm">{user.id}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-4 rounded-lg bg-secondary/50">
                  <Calendar className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Joined</p>
                    <p className="font-medium">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-border">
                <p className="text-sm text-muted-foreground mb-2">
                  Your GitHub token is securely stored and ready to use for API calls.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate("/repositories")}
                  >
                    View Repositories
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;

