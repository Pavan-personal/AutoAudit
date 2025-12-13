import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, AlertTriangle, CheckCircle, Loader2, Github } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Issue {
  title: string;
  body: string;
  tags: string[];
}

interface FileResult {
  file: string;
  status: string;
  issues: Issue[];
}

interface AnalysisData {
  summary: {
    total_files: number;
    total_issues: number;
    files_with_issues: number;
  };
  results: FileResult[];
}

function IssuesDisplay() {
  const location = useLocation();
  const navigate = useNavigate();
  const [creatingIssues, setCreatingIssues] = useState<Set<number>>(new Set());
  const API_URL = import.meta.env.VITE_API_URL || "https://autoauditserver.vercel.app";
  const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID || "";

  const analysis = location.state?.analysis as AnalysisData | undefined;
  const repository = location.state?.repository as { owner: string; repo: string } | undefined;

  if (!analysis || !repository) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive mb-4">No analysis data found</p>
          <Button onClick={() => navigate("/repositories")}>Go Back</Button>
        </div>
      </div>
    );
  }

  async function createIssue(issue: Issue, fileIndex: number, issueIndex: number) {
    setCreatingIssues(new Set(creatingIssues).add(issueIndex));

    try {
      const response = await fetch(
        `${API_URL}/api/repositories/${repository.owner}/${repository.repo}/issues`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: issue.title,
            body: issue.body,
            labels: issue.tags || [],
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 403) {
          if (errorData.error?.includes("not accessible by integration") || errorData.error?.includes("not installed")) {
            const installUrl = `https://github.com/apps/${GITHUB_CLIENT_ID?.split(".")[0] || "autoauditai"}/installations/new`;
            const message = `GitHub App is not installed on your account.\n\nPlease install it first:\n${installUrl}\n\nAfter installation, try creating the issue again.`;
            alert(message);
          } else {
            alert("GitHub token doesn't have permission to create issues. Please re-authenticate by logging out and logging back in.");
          }
        } else {
          throw new Error(errorData.error || "Failed to create issue");
        }
        const newIssues = new Set(creatingIssues);
        newIssues.delete(issueIndex);
        setCreatingIssues(newIssues);
        return;
      }

      const newIssues = new Set(creatingIssues);
      newIssues.delete(issueIndex);
      setCreatingIssues(newIssues);
      alert("Issue created successfully!");
    } catch (error) {
      console.error("Error creating issue:", error);
      const newIssues = new Set(creatingIssues);
      newIssues.delete(issueIndex);
      setCreatingIssues(newIssues);
      if (error instanceof Error) {
        alert(`Failed to create issue: ${error.message}`);
      }
    }
  }

  function extractPriority(body: string): string {
    const priorityMatch = body.match(/\*\*Priority\*\*\s*\*\*(.*?)\*\*/);
    return priorityMatch ? priorityMatch[1].trim() : "MEDIUM";
  }

  function extractType(body: string): string {
    const typeMatch = body.match(/## Type\s*\n(.*?)\n/);
    return typeMatch ? typeMatch[1].trim() : "unknown";
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
                <h1 className="text-4xl font-bold mb-2">Analysis Results</h1>
                <p className="text-muted-foreground">
                  {analysis.summary.total_issues} issues found across{" "}
                  {analysis.summary.files_with_issues} files
                </p>
              </div>
            </div>
          </div>

          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 rounded-lg bg-secondary/50">
                  <p className="text-2xl font-bold">{analysis.summary.total_files}</p>
                  <p className="text-sm text-muted-foreground">Files Analyzed</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-secondary/50">
                  <p className="text-2xl font-bold">{analysis.summary.total_issues}</p>
                  <p className="text-sm text-muted-foreground">Total Issues</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-secondary/50">
                  <p className="text-2xl font-bold">{analysis.summary.files_with_issues}</p>
                  <p className="text-sm text-muted-foreground">Files with Issues</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            {analysis.results.map((result, fileIndex) => {
              if (result.status !== "success" || result.issues.length === 0) {
                return null;
              }

              return (
                <Card key={fileIndex} className="glass-card">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <AlertTriangle className="w-5 h-5 text-destructive" />
                          {result.file}
                        </CardTitle>
                        <CardDescription className="mt-2">
                          {result.issues.length} issue{result.issues.length !== 1 ? "s" : ""} found
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {result.issues.map((issue, issueIndex) => {
                        const priority = extractPriority(issue.body);
                        const type = extractType(issue.body);
                        const globalIndex = fileIndex * 1000 + issueIndex;
                        const isCreating = creatingIssues.has(globalIndex);

                        return (
                          <Card key={issueIndex} className="bg-secondary/30 border-border">
                            <CardHeader>
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <CardTitle className="text-lg mb-2">{issue.title}</CardTitle>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Badge
                                      variant={
                                        priority === "HIGH"
                                          ? "destructive"
                                          : priority === "MEDIUM"
                                          ? "default"
                                          : "secondary"
                                      }
                                    >
                                      {priority}
                                    </Badge>
                                    <Badge variant="outline">{type}</Badge>
                                    {issue.tags.map((tag, tagIndex) => (
                                      <Badge key={tagIndex} variant="outline">
                                        {tag}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent>
                              <div
                                className="prose prose-invert max-w-none text-sm text-muted-foreground mb-4"
                                dangerouslySetInnerHTML={{
                                  __html: issue.body
                                    .replace(/\n/g, "<br />")
                                    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                                    .replace(/`(.*?)`/g, "<code class='bg-secondary px-1 rounded'>$1</code>"),
                                }}
                              />
                              <Button
                                onClick={() => createIssue(issue, fileIndex, globalIndex)}
                                disabled={isCreating}
                                variant="outline"
                                className="w-full"
                              >
                                {isCreating ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    Creating Issue...
                                  </>
                                ) : (
                                  <>
                                    <Github className="w-4 h-4 mr-2" />
                                    Create GitHub Issue
                                  </>
                                )}
                              </Button>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {analysis.results.every((r) => r.issues.length === 0) && (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle className="w-12 h-12 text-primary mx-auto mb-4" />
                <p className="text-muted-foreground">No issues found! Your code looks good.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export default IssuesDisplay;
