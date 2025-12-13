import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Github, MessageSquare, User, Calendar, Tag, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Issue {
  id: number;
  number: number;
  title: string;
  body: string;
  state: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  comments: number;
  assignees: Array<{
    login: string;
    avatar_url: string;
  }>;
  labels: Array<{
    name: string;
    color: string;
  }>;
  user: {
    login: string;
    avatar_url: string;
  };
}

function IssuesList() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const navigate = useNavigate();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const API_URL = import.meta.env.VITE_API_URL || "https://autoauditserver.vercel.app";

  useEffect(() => {
    async function fetchIssues() {
      if (!owner || !repo) {
        setError("Invalid repository");
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${API_URL}/api/repositories/${owner}/${repo}/issues`, {
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
        const unassignedIssues = data.issues.filter((issue: Issue) => issue.assignees.length === 0);
        setIssues(unassignedIssues);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching issues:", error);
        setLoading(false);
        setError("Failed to load issues");
      }
    }

    fetchIssues();
  }, [owner, repo, navigate, API_URL]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading issues...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive mb-4">{error}</p>
          <Button onClick={() => navigate("/repositories")}>Go Back</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container-custom py-12">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <Button
                onClick={() => navigate("/repositories")}
                variant="outline"
                size="icon"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div>
                <h1 className="text-4xl font-bold mb-2">Repository Issues</h1>
                <p className="text-muted-foreground">
                  {owner}/{repo} - Unassigned issues ready for automation
                </p>
              </div>
            </div>
          </div>

          {issues.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No unassigned issues found</p>
                <p className="text-sm text-muted-foreground mt-2">
                  All issues in this repository have been assigned.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="mb-6">
                <p className="text-sm text-muted-foreground">
                  Showing {issues.length} unassigned issue{issues.length !== 1 ? "s" : ""} ready for automation
                </p>
              </div>
              <div className="space-y-4">
                {issues.map((issue) => (
                  <Card key={issue.id} className="glass-card-hover">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Github className="w-4 h-4 text-muted-foreground" />
                            <CardTitle className="text-lg">
                              <a
                                href={issue.html_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:underline"
                              >
                                #{issue.number}: {issue.title}
                              </a>
                            </CardTitle>
                          </div>
                          <CardDescription className="mt-2 line-clamp-2">
                            {issue.body || "No description provided"}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap items-center gap-4 mb-4">
                        {issue.labels.length > 0 && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <Tag className="w-4 h-4 text-muted-foreground" />
                            {issue.labels.map((label) => (
                              <Badge
                                key={label.name}
                                variant="outline"
                                style={{
                                  borderColor: `#${label.color}`,
                                  color: `#${label.color}`,
                                }}
                              >
                                {label.name}
                              </Badge>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <MessageSquare className="w-4 h-4" />
                          <span>{issue.comments} comment{issue.comments !== 1 ? "s" : ""}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="w-4 h-4" />
                          <span>Updated {new Date(issue.updated_at).toLocaleDateString()}</span>
                        </div>
                        {issue.user && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <User className="w-4 h-4" />
                            <span>by {issue.user.login}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between pt-4 border-t border-border">
                        <div className="text-sm text-muted-foreground">
                          <span className="font-medium">Status:</span> {issue.state === "open" ? "Open" : "Closed"}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            onClick={() => window.open(issue.html_url, "_blank")}
                          >
                            View on GitHub
                          </Button>
                          <Button
                            onClick={() => {
                              console.log("Automate issue #" + issue.number);
                            }}
                          >
                            Automate
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default IssuesList;
