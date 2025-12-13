import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Github, MessageSquare, User, Calendar, Tag, AlertCircle, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

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
  const [automatedIssues, setAutomatedIssues] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [automateDialog, setAutomateDialog] = useState<{ open: boolean; issue: Issue | null }>({ open: false, issue: null });
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
        setIssues(data.issues || []);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching issues:", error);
        setLoading(false);
        setError("Failed to load issues");
      }
    }

    fetchIssues();
    
    async function fetchAutomatedIssues() {
      if (!owner || !repo) return;
      try {
        const response = await fetch(`${API_URL}/api/repositories/${owner}/${repo}/automated-issues`, {
          method: "GET",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
        });
        if (response.ok) {
          const data = await response.json();
          setAutomatedIssues(new Set(data.issues.map((issue: { issueNumber: number }) => issue.issueNumber)));
        }
      } catch (error) {
        console.error("Error fetching automated issues:", error);
      }
    }
    
    fetchAutomatedIssues();
  }, [owner, repo, navigate, API_URL]);
  
  async function handleAutomate(issue: Issue) {
    setAutomateDialog({ open: true, issue });
  }
  
  async function confirmAutomate() {
    if (!automateDialog.issue || !owner || !repo) return;
    
    try {
      const response = await fetch(`${API_URL}/api/repositories/${owner}/${repo}/automated-issues`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          issueNumber: automateDialog.issue.number,
          issueId: automateDialog.issue.id,
          title: automateDialog.issue.title,
          body: automateDialog.issue.body,
          state: automateDialog.issue.state,
          htmlUrl: automateDialog.issue.html_url,
          assignees: automateDialog.issue.assignees,
          labels: automateDialog.issue.labels,
          user: automateDialog.issue.user,
          comments: automateDialog.issue.comments,
          createdAt: automateDialog.issue.created_at,
          updatedAt: automateDialog.issue.updated_at,
          autoAssign: true,
        }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to save automated issue");
      }
      
      const newAutomated = new Set(automatedIssues);
      newAutomated.add(automateDialog.issue.number);
      setAutomatedIssues(newAutomated);
      
      toast.success("Issue Added to Automation", {
        description: `Issue #${automateDialog.issue.number} is now being tracked for AI-powered automation.`,
      });
      
      setAutomateDialog({ open: false, issue: null });
    } catch (error) {
      console.error("Error automating issue:", error);
      toast.error("Failed to Automate Issue", {
        description: error instanceof Error ? error.message : "Please try again later.",
      });
    }
  }

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
    <>
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
                  {owner}/{repo} - All open issues ready for AI-powered automation
                </p>
              </div>
            </div>
          </div>

          {issues.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No open issues found</p>
                <p className="text-sm text-muted-foreground mt-2">
                  All issues in this repository are closed or there are no issues yet.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="mb-6">
                <p className="text-sm text-muted-foreground">
                  Showing {issues.length} open issue{issues.length !== 1 ? "s" : ""} - Use AI to automatically analyze and assign issues to the right team members
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
                        {issue.assignees.length > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">Assigned to:</span>
                            <div className="flex items-center gap-1">
                              {issue.assignees.map((assignee, idx) => (
                                <img
                                  key={idx}
                                  src={assignee.avatar_url}
                                  alt={assignee.login}
                                  className="w-6 h-6 rounded-full border border-border"
                                  title={assignee.login}
                                />
                              ))}
                            </div>
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
                          {automatedIssues.has(issue.number) ? (
                            <Button disabled variant="outline">
                              <Sparkles className="w-4 h-4 mr-2" />
                              Automated
                            </Button>
                          ) : (
                            <Button onClick={() => handleAutomate(issue)}>
                              <Sparkles className="w-4 h-4 mr-2" />
                              Automate
                            </Button>
                          )}
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

      <Dialog open={automateDialog.open} onOpenChange={(open) => setAutomateDialog({ open, issue: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Automate Issue #{automateDialog.issue?.number}</DialogTitle>
            <DialogDescription>
              Add this issue to automated tracking. AI will analyze comments and assign based on comment intent.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 pt-0.5">
                <input
                  type="checkbox"
                  id="autoAssign"
                  checked={true}
                  disabled
                  className="w-6 h-6 rounded border-2 border-primary bg-primary text-primary-foreground focus:ring-2 focus:ring-primary focus:ring-offset-2 cursor-not-allowed"
                  style={{ 
                    accentColor: 'hsl(var(--primary))',
                    backgroundColor: 'hsl(var(--primary))',
                    borderColor: 'hsl(var(--primary))'
                  }}
                />
              </div>
              <div className="flex-1">
                <label htmlFor="autoAssign" className="text-sm font-medium leading-none cursor-not-allowed">
                  AI-Powered Auto-Assignment Enabled
                </label>
                <p className="text-xs text-muted-foreground mt-2">
                  Our AI will analyze all comments on this issue. If a comment indicates assignment intent (e.g., "I'll take this", "assign to me"), the issue will be automatically assigned. Normal comments without assignment intent will be ignored.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAutomateDialog({ open: false, issue: null })}>
              Cancel
            </Button>
            <Button onClick={confirmAutomate}>
              Add to Automation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default IssuesList;
