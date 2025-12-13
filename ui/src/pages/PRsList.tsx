import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Github, MessageSquare, User, Calendar, Tag, AlertCircle, Sparkles, GitMerge, GitBranch, TrendingUp, Loader2, CheckCircle2 } from "lucide-react";
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

interface PullRequest {
  id: number;
  number: number;
  title: string;
  body: string;
  state: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  comments: number;
  review_comments: number;
  commits: number;
  additions: number;
  deletions: number;
  changed_files: number;
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
    sha: string;
  };
  labels: Array<{
    name: string;
    color: string;
  }>;
  user: {
    login: string;
    avatar_url: string;
  };
}

function PRsList() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const navigate = useNavigate();
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([]);
  const [automatedPRs, setAutomatedPRs] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [automateDialog, setAutomateDialog] = useState<{ open: boolean; pr: PullRequest | null }>({ open: false, pr: null });
  const [aiAnalysis, setAiAnalysis] = useState(false);
  const [autoMerge, setAutoMerge] = useState(false);
  const [codeRabbitInstalled, setCodeRabbitInstalled] = useState<boolean | null>(null);
  const [analyzingPRs, setAnalyzingPRs] = useState<Set<number>>(new Set());
  const [prScores, setPrScores] = useState<Map<number, { score: number; reasoning: string; recommendations: string[] }>>(new Map());
  const API_URL = import.meta.env.VITE_API_URL || "https://autoauditserver.vercel.app";

  useEffect(() => {
    async function fetchPRs() {
      if (!owner || !repo) {
        setError("Invalid repository");
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${API_URL}/api/repositories/${owner}/${repo}/pull-requests`, {
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
        setPullRequests(data.pullRequests || []);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching pull requests:", error);
        setLoading(false);
        setError("Failed to load pull requests");
      }
    }

    fetchPRs();
    
    async function fetchAutomatedPRs() {
      if (!owner || !repo) return;
      try {
        const response = await fetch(`${API_URL}/api/repositories/${owner}/${repo}/automated-prs`, {
          method: "GET",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
        });
        if (response.ok) {
          const data = await response.json();
          setAutomatedPRs(new Set(data.pullRequests.map((pr: { prNumber: number }) => pr.prNumber)));
        }
      } catch (error) {
        console.error("Error fetching automated PRs:", error);
      }
    }
    
    fetchAutomatedPRs();
    
    async function checkCodeRabbit() {
      try {
        const response = await fetch(`${API_URL}/api/repositories/${owner}/${repo}/check-coderabbit`, {
          method: "GET",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
        });
        if (response.ok) {
          const data = await response.json();
          setCodeRabbitInstalled(data.installed);
        } else {
          setCodeRabbitInstalled(false);
        }
      } catch {
        setCodeRabbitInstalled(false);
      }
    }
    
    checkCodeRabbit();
  }, [owner, repo, navigate, API_URL]);
  
  async function handleAnalyzePR(pr: PullRequest) {
    setAnalyzingPRs(new Set(analyzingPRs).add(pr.number));
    
    try {
      const response = await fetch(`${API_URL}/api/repositories/${owner}/${repo}/pull-requests/${pr.number}/analyze`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });
      
      if (!response.ok) {
        throw new Error("Failed to analyze PR");
      }
      
      const data = await response.json();
      const newScores = new Map(prScores);
      newScores.set(pr.number, {
        score: data.score,
        reasoning: data.reasoning,
        recommendations: data.recommendations || [],
      });
      setPrScores(newScores);
      
      toast.success("PR Analysis Complete", {
        description: `Merge readiness score: ${data.score}/100`,
      });
    } catch (error) {
      console.error("Error analyzing PR:", error);
      toast.error("Failed to Analyze PR", {
        description: error instanceof Error ? error.message : "Please try again later.",
      });
    } finally {
      const newAnalyzing = new Set(analyzingPRs);
      newAnalyzing.delete(pr.number);
      setAnalyzingPRs(newAnalyzing);
    }
  }
  
  async function handleAutomate(pr: PullRequest) {
    if (codeRabbitInstalled === false) {
      toast.error("CodeRabbit Not Installed", {
        description: "Please install CodeRabbit in your repository to use PR automation features.",
        action: {
          label: "Install CodeRabbit",
          onClick: () => window.open("https://github.com/apps/coderabbitai/installations/new", "_blank"),
        },
        duration: 10000,
      });
      return;
    }
    setAutomateDialog({ open: true, pr });
  }
  
  async function confirmAutomate() {
    if (!automateDialog.pr || !owner || !repo) return;
    
    try {
      const response = await fetch(`${API_URL}/api/repositories/${owner}/${repo}/automated-prs`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prNumber: automateDialog.pr.number,
          prId: automateDialog.pr.id,
          title: automateDialog.pr.title,
          body: automateDialog.pr.body,
          state: automateDialog.pr.state,
          htmlUrl: automateDialog.pr.html_url,
          head: automateDialog.pr.head,
          base: automateDialog.pr.base,
          user: automateDialog.pr.user,
          labels: automateDialog.pr.labels,
          comments: automateDialog.pr.comments,
          reviewComments: automateDialog.pr.review_comments,
          commits: automateDialog.pr.commits,
          additions: automateDialog.pr.additions,
          deletions: automateDialog.pr.deletions,
          changedFiles: automateDialog.pr.changed_files,
          createdAt: automateDialog.pr.created_at,
          updatedAt: automateDialog.pr.updated_at,
          mergedAt: automateDialog.pr.merged_at,
          aiAnalysis,
          autoMerge,
        }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to save automated PR");
      }
      
      const newAutomated = new Set(automatedPRs);
      newAutomated.add(automateDialog.pr.number);
      setAutomatedPRs(newAutomated);
      
      toast.success("PR Added to Automation", {
        description: `PR #${automateDialog.pr.number} is now being tracked for AI-powered automation.`,
      });
      
      setAutomateDialog({ open: false, pr: null });
      setAiAnalysis(false);
      setAutoMerge(false);
    } catch (error) {
      console.error("Error automating PR:", error);
      toast.error("Failed to Automate PR", {
        description: error instanceof Error ? error.message : "Please try again later.",
      });
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading pull requests...</p>
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
                <h1 className="text-4xl font-bold mb-2">Pull Requests</h1>
                <p className="text-muted-foreground">
                  {owner}/{repo} - All open PRs ready for AI-powered automation
                </p>
              </div>
            </div>
          </div>

          {codeRabbitInstalled === false && (
            <Card className="mb-6 border-yellow-500/50 bg-yellow-500/10">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-yellow-500 mb-1">CodeRabbit Installation Required</p>
                    <p className="text-sm text-muted-foreground mb-3">
                      To use PR automation features, you need to install CodeRabbit in your repository. CodeRabbit provides AI-powered code review comments that our system uses to make intelligent merge decisions.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open("https://github.com/apps/coderabbitai/installations/new", "_blank")}
                    >
                      Install CodeRabbit
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {pullRequests.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <GitMerge className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No open pull requests found</p>
                <p className="text-sm text-muted-foreground mt-2">
                  All pull requests in this repository are closed or merged, or there are no PRs yet.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="mb-6">
                <p className="text-sm text-muted-foreground">
                  Showing {pullRequests.length} open pull request{pullRequests.length !== 1 ? "s" : ""} - Use Cline AI to analyze PRs and get merge readiness scores (0-100)
                </p>
              </div>
              <div className="space-y-4">
                {pullRequests.map((pr) => (
                  <Card key={pr.id} className="glass-card-hover">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <GitMerge className="w-4 h-4 text-muted-foreground" />
                            <CardTitle className="text-lg">
                              <a
                                href={pr.html_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:underline"
                              >
                                #{pr.number}: {pr.title}
                              </a>
                            </CardTitle>
                          </div>
                          <CardDescription className="mt-2 line-clamp-2">
                            {pr.body || "No description provided"}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap items-center gap-4 mb-4">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <GitBranch className="w-4 h-4" />
                          <span>{pr.head.ref} → {pr.base.ref}</span>
                        </div>
                        {pr.labels.length > 0 && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <Tag className="w-4 h-4 text-muted-foreground" />
                            {pr.labels.map((label) => (
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
                          <span>{pr.comments} comment{pr.comments !== 1 ? "s" : ""}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="w-4 h-4" />
                          <span>Updated {new Date(pr.updated_at).toLocaleDateString()}</span>
                        </div>
                        {pr.user && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <img
                              src={pr.user.avatar_url}
                              alt={pr.user.login}
                              className="w-5 h-5 rounded-full"
                            />
                            <span>{pr.user.login}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>+{pr.additions} / -{pr.deletions}</span>
                        </div>
                      </div>
                      {prScores.has(pr.number) && (
                        <Card className="mb-4 border-2 overflow-hidden">
                          <CardContent className="p-0">
                            <div className={`relative p-6 ${
                              prScores.get(pr.number)!.score >= 70 
                                ? "bg-gradient-to-br from-green-500/20 to-green-600/10 border-green-500/30" 
                                : prScores.get(pr.number)!.score >= 50 
                                ? "bg-gradient-to-br from-yellow-500/20 to-yellow-600/10 border-yellow-500/30" 
                                : "bg-gradient-to-br from-red-500/20 to-red-600/10 border-red-500/30"
                            }`}>
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-3">
                                    <TrendingUp className={`w-6 h-6 ${
                                      prScores.get(pr.number)!.score >= 70 
                                        ? "text-green-500" 
                                        : prScores.get(pr.number)!.score >= 50 
                                        ? "text-yellow-500" 
                                        : "text-red-500"
                                    }`} />
                                    <h3 className="text-lg font-bold">AI Analysis Result</h3>
                                  </div>
                                  <div className="mb-3">
                                    <p className="text-sm font-medium text-muted-foreground mb-1">Merge Readiness Score</p>
                                    <div className="flex items-baseline gap-2">
                                      <span className={`text-6xl font-extrabold leading-none ${
                                        prScores.get(pr.number)!.score >= 70 
                                          ? "text-green-500" 
                                          : prScores.get(pr.number)!.score >= 50 
                                          ? "text-yellow-500" 
                                          : "text-red-500"
                                      }`}>
                                        {prScores.get(pr.number)!.score}
                                      </span>
                                      <span className="text-2xl font-semibold text-muted-foreground">/100</span>
                                    </div>
                                  </div>
                                  <div className="mt-4 p-3 rounded-lg bg-background/50 backdrop-blur-sm">
                                    <p className="text-sm font-medium text-foreground leading-relaxed">
                                      {prScores.get(pr.number)!.reasoning}
                                    </p>
                                  </div>
                                  {prScores.get(pr.number)!.recommendations.length > 0 && (
                                    <div className="mt-4 p-3 rounded-lg bg-background/50 backdrop-blur-sm">
                                      <p className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Recommendations</p>
                                      <ul className="text-sm text-foreground space-y-1.5">
                                        {prScores.get(pr.number)!.recommendations.map((rec, idx) => (
                                          <li key={idx} className="flex items-start gap-2">
                                            <span className="text-primary mt-1">•</span>
                                            <span>{rec}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                                <div className={`flex-shrink-0 w-20 h-20 rounded-full flex items-center justify-center ${
                                  prScores.get(pr.number)!.score >= 70 
                                    ? "bg-green-500/20" 
                                    : prScores.get(pr.number)!.score >= 50 
                                    ? "bg-yellow-500/20" 
                                    : "bg-red-500/20"
                                }`}>
                                  {prScores.get(pr.number)!.score >= 70 ? (
                                    <CheckCircle2 className="w-10 h-10 text-green-500" />
                                  ) : prScores.get(pr.number)!.score >= 50 ? (
                                    <AlertCircle className="w-10 h-10 text-yellow-500" />
                                  ) : (
                                    <AlertCircle className="w-10 h-10 text-red-500" />
                                  )}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                      <div className="flex items-center justify-between pt-4 border-t border-border">
                        <div className="text-sm text-muted-foreground">
                          <span className="font-medium">Status:</span> {pr.state === "open" ? "Open" : pr.merged_at ? "Merged" : "Closed"}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            onClick={() => window.open(pr.html_url, "_blank")}
                          >
                            View on GitHub
                          </Button>
                          {!prScores.has(pr.number) && (
                            <Button
                              onClick={() => handleAnalyzePR(pr)}
                              disabled={analyzingPRs.has(pr.number)}
                              variant="outline"
                            >
                              {analyzingPRs.has(pr.number) ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                  Analyzing...
                                </>
                              ) : (
                                <>
                                  <TrendingUp className="w-4 h-4 mr-2" />
                                  Analyze PR
                                </>
                              )}
                            </Button>
                          )}
                          {prScores.has(pr.number) && prScores.get(pr.number)!.score >= 70 && (
                            <Button
                              onClick={() => window.open(pr.html_url, "_blank")}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <GitMerge className="w-4 h-4 mr-2" />
                              Merge PR
                            </Button>
                          )}
                          {automatedPRs.has(pr.number) ? (
                            <Button disabled variant="outline">
                              <Sparkles className="w-4 h-4 mr-2" />
                              Automated
                            </Button>
                          ) : (
                            <Button onClick={() => handleAutomate(pr)} disabled={codeRabbitInstalled === false}>
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

      <Dialog open={automateDialog.open} onOpenChange={(open) => setAutomateDialog({ open, pr: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Automate PR #{automateDialog.pr?.number}</DialogTitle>
            <DialogDescription>
              Add this pull request to automated tracking. AI will analyze CodeRabbit comments and automatically merge when ready.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="aiAnalysis"
                checked={aiAnalysis}
                onChange={(e) => setAiAnalysis(e.target.checked)}
                className="rounded border-gray-300"
              />
              <label htmlFor="aiAnalysis" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Analyze with AI and merge based on CodeRabbit comments
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              When enabled, our AI will analyze CodeRabbit review comments and automatically merge the PR when all conditions are met and CodeRabbit approves.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAutomateDialog({ open: false, pr: null })}>
              Cancel
            </Button>
            <Button onClick={confirmAutomate}>
              Add to Automation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default PRsList;
