import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Github, Search, ArrowLeft, Folder, Sparkles, Brain } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Repository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  html_url: string;
  updated_at: string;
  language: string | null;
  stargazers_count: number;
}

function Repositories() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [filteredRepos, setFilteredRepos] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();
  const API_URL = import.meta.env.VITE_API_URL || "https://autoauditserver.vercel.app";

  useEffect(() => {
    async function fetchRepositories() {
      try {
        const response = await fetch(`${API_URL}/api/repositories`, {
          method: "GET",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          if (response.status === 401) {
            navigate("/dashboard");
            return;
          }
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        setRepositories(data.repositories || []);
        setFilteredRepos(data.repositories || []);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching repositories:", error);
        setLoading(false);
        setError("Failed to load repositories");
      }
    }

    fetchRepositories();
  }, [navigate, API_URL]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredRepos(repositories);
      return;
    }

    if (repositories.length === 0) {
      setFilteredRepos([]);
      return;
    }

    const query = searchQuery.toLowerCase().trim();
    const filtered = repositories.filter(
      (repo) =>
        repo.name.toLowerCase().includes(query) ||
        (repo.description && repo.description.toLowerCase().includes(query)) ||
        repo.full_name.toLowerCase().includes(query)
    );
    setFilteredRepos(filtered);
  }, [searchQuery, repositories]);

  function handleAudit(repo: Repository, useCline: boolean = false) {
    if (useCline) {
      navigate(`/repositories/${repo.full_name}/files-cline`);
    } else {
      navigate(`/repositories/${repo.full_name}/files`);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading repositories...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive mb-4">{error}</p>
          <Button onClick={() => navigate("/dashboard")}>Go Back</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container-custom py-12">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <Button
                onClick={() => navigate("/dashboard")}
                variant="outline"
                size="icon"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div>
                <h1 className="text-4xl font-bold mb-2">Repositories</h1>
                <p className="text-muted-foreground">
                  Select a repository to audit
                </p>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search repositories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {filteredRepos.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Folder className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  {searchQuery ? "No repositories found matching your search" : "No repositories found"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredRepos.map((repo) => (
                <Card key={repo.id} className="glass-card-hover h-fit">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Github className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                        <CardTitle className="text-lg truncate">{repo.name}</CardTitle>
                      </div>
                    </div>
                    {repo.description && (
                      <CardDescription className="line-clamp-2">
                        {repo.description}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <div className="flex items-center gap-4">
                        {repo.language && (
                          <span>{repo.language}</span>
                        )}
                        <span>{repo.stargazers_count} stars</span>
                      </div>
                      <span className="text-xs">
                        {new Date(repo.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                    
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Code Audit</p>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => handleAudit(repo, false)}
                          variant="outline"
                          className="flex-1 group hover:bg-primary/10 hover:border-primary/50 transition-all"
                          size="sm"
                        >
                          <Brain className="w-4 h-4 mr-2 group-hover:text-primary" />
                          Oumi
                        </Button>
                        <Button
                          onClick={() => handleAudit(repo, true)}
                          variant="outline"
                          className="flex-1 group hover:bg-primary/10 hover:border-primary/50 transition-all"
                          size="sm"
                        >
                          <Sparkles className="w-4 h-4 mr-2 group-hover:text-primary" />
                          Cline
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        AI-powered code analysis to detect issues and create GitHub issues automatically
                      </p>
                    </div>
                    
                    <div className="pt-2 border-t border-border space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Management</p>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => navigate(`/repositories/${repo.full_name}/issues-list`)}
                          variant="outline"
                          className="flex-1"
                          size="sm"
                        >
                          Automate Issues
                        </Button>
                        <Button
                          onClick={() => navigate(`/repositories/${repo.full_name}/prs-list`)}
                          variant="outline"
                          className="flex-1"
                          size="sm"
                        >
                          Review PRs
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Repositories;
