import { useState, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, AlertTriangle, CheckCircle, Loader2, Github, Filter } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  const [createdIssues, setCreatedIssues] = useState<Set<number>>(new Set());
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [fileFilter, setFileFilter] = useState<string>("all");
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
            toast.error("GitHub App Not Installed", {
              description: `Please install the GitHub App first. Click here to install.`,
              action: {
                label: "Install App",
                onClick: () => window.open(installUrl, "_blank"),
              },
              duration: 10000,
            });
          } else {
            toast.error("Permission Denied", {
              description: "GitHub token doesn't have permission to create issues. Please re-authenticate.",
            });
          }
        } else {
          throw new Error(errorData.error || "Failed to create issue");
        }
        const newIssues = new Set(creatingIssues);
        newIssues.delete(issueIndex);
        setCreatingIssues(newIssues);
        return;
      }

      const issueData = await response.json();
      const newIssues = new Set(creatingIssues);
      newIssues.delete(issueIndex);
      setCreatingIssues(newIssues);
      
      const createdSet = new Set(createdIssues);
      createdSet.add(issueIndex);
      setCreatedIssues(createdSet);
      
      toast.success("Issue Created", {
        description: `Successfully created issue: ${issue.title}`,
        action: issueData.issue?.html_url ? {
          label: "View Issue",
          onClick: () => window.open(issueData.issue.html_url, "_blank"),
        } : undefined,
      });
    } catch (error) {
      console.error("Error creating issue:", error);
      const newIssues = new Set(creatingIssues);
      newIssues.delete(issueIndex);
      setCreatingIssues(newIssues);
      if (error instanceof Error) {
        toast.error("Failed to Create Issue", {
          description: error.message,
        });
      }
    }
  }

  function extractPriority(issue: Issue): string {
    // Priority is the last tag in the array (high/medium/low)
    const severityTags = issue.tags.filter(tag => 
      ['high', 'medium', 'low'].includes(tag.toLowerCase())
    );
    
    if (severityTags.length > 0) {
      return severityTags[severityTags.length - 1].toUpperCase();
    }
    
    // Fallback: Try to extract from body
    const patterns = [
      /-?\s*\*\*Severity\*\*[:\s]+(HIGH|MEDIUM|LOW)/i,
      /\*\*Severity\*\*[:\s]+(HIGH|MEDIUM|LOW)/i,
      /Severity[:\s]+(HIGH|MEDIUM|LOW)/i,
    ];
    
    for (const pattern of patterns) {
      const match = issue.body.match(pattern);
      if (match && match[1]) {
        return match[1].toUpperCase();
      }
    }
    
    return "MEDIUM";
  }

  function extractType(issue: Issue): string {
    // Type is typically the first tag (security, bug, performance, code-quality)
    const typeTags = issue.tags.filter(tag => 
      ['security', 'bug', 'performance', 'code-quality', 'review'].includes(tag.toLowerCase())
    );
    
    if (typeTags.length > 0) {
      return typeTags[0].toLowerCase();
    }
    
    // Fallback: Try to extract from body
    const patterns = [
      /-?\s*\*\*Type\*\*[:\s]+(\w+)/i,
      /\*\*Type\*\*[:\s]+(\w+)/i,
      /Type[:\s]+(\w+)/i,
    ];
    
    for (const pattern of patterns) {
      const match = issue.body.match(pattern);
      if (match && match[1]) {
        return match[1].trim().toLowerCase();
      }
    }
    
    return "unknown";
  }

  function parseMarkdown(text: string): string {
    return text
      // Remove bullet points (•) from start of lines
      .replace(/^[•\-\*]\s+/gm, "")
      // Headers
      .replace(/###\s+(.*?)(?=\n|$)/g, "<h3 class='text-base font-bold mt-3 mb-2'>$1</h3>")
      .replace(/##\s+(.*?)(?=\n|$)/g, "<h2 class='text-lg font-bold mt-4 mb-2'>$1</h2>")
      // Bold
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      // Italic
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      // Inline code
      .replace(/`([^`]+)`/g, "<code class='bg-secondary px-1 rounded text-xs'>$1</code>")
      // Code blocks
      .replace(/```[\s\S]*?```/g, (match) => {
        const code = match.replace(/```[\w]*\n?/g, "").trim();
        return `<pre class='bg-secondary p-2 rounded overflow-x-auto my-2'><code class='text-xs'>${code}</code></pre>`;
      })
      // Ordered lists (remove list styling, just show content)
      .replace(/^\d+\.\s+(.*?)$/gm, "<div class='mb-1.5'>$1</div>")
      // Unordered lists (remove bullet, just show content with optimal spacing)
      .replace(/^-\s+(.*?)$/gm, "<div class='mb-1.5'>$1</div>")
      // Paragraphs (double newlines)
      .replace(/\n\n/g, "</p><p class='mb-2'>")
      // Single newlines
      .replace(/\n/g, "<br />")
      // Wrap in paragraph
      .replace(/^/, "<p class='mb-2'>")
      .replace(/$/, "</p>");
  }

  // Get all unique files and priorities for filters
  const allFiles = useMemo(() => {
    const files = new Set<string>();
    analysis?.results.forEach((result) => {
      if (result.issues.length > 0) {
        files.add(result.file);
      }
    });
    return Array.from(files).sort();
  }, [analysis]);

  // Filter results based on selected filters
  const filteredResults = useMemo(() => {
    if (!analysis) return [];
    
    return analysis.results
      .map((result) => {
        if (result.status !== "success" || result.issues.length === 0) {
          return null;
        }

        // Filter by file
        if (fileFilter !== "all" && result.file !== fileFilter) {
          return null;
        }

        // Filter issues by priority
        const filteredIssues = result.issues.filter((issue) => {
          if (priorityFilter === "all") return true;
          const priority = extractPriority(issue);
          return priority === priorityFilter.toUpperCase();
        });

        if (filteredIssues.length === 0) {
          return null;
        }

        return {
          ...result,
          issues: filteredIssues,
        };
      })
      .filter((result): result is FileResult => result !== null);
  }, [analysis, priorityFilter, fileFilter]);

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
              <div className="grid grid-cols-3 gap-4 mb-6">
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
              
              <div className="flex flex-wrap gap-4 items-center">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Filters:</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <label className="text-sm text-muted-foreground">Priority:</label>
                  <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="All Priorities" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Priorities</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="LOW">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center gap-2">
                  <label className="text-sm text-muted-foreground">File:</label>
                  <Select value={fileFilter} onValueChange={setFileFilter}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="All Files" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Files</SelectItem>
                      {allFiles.map((file) => (
                        <SelectItem key={file} value={file}>
                          {file.length > 30 ? `${file.substring(0, 30)}...` : file}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            {filteredResults.map((result, fileIndex) => {
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
                        const priority = extractPriority(issue);
                        const type = extractType(issue);
                        const globalIndex = fileIndex * 1000 + issueIndex;
                        const isCreating = creatingIssues.has(globalIndex);
                        const isCreated = createdIssues.has(globalIndex);

                        return (
                          <Card key={issueIndex} className="bg-secondary/30 border-border">
                            <CardHeader>
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div 
                                    className="text-lg font-semibold mb-4"
                                    dangerouslySetInnerHTML={{
                                      __html: parseMarkdown(issue.title)
                                    }}
                                  />
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
                                    {type && type !== "unknown" && (
                                      <Badge variant="outline">{type}</Badge>
                                    )}
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
                                  __html: parseMarkdown(issue.body)
                                }}
                              />
                              <Button
                                onClick={() => createIssue(issue, fileIndex, globalIndex)}
                                disabled={isCreating || isCreated}
                                variant={isCreated ? "default" : "outline"}
                                className="w-full"
                              >
                                {isCreating ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    Creating Issue...
                                  </>
                                ) : isCreated ? (
                                  <>
                                    <CheckCircle className="w-4 h-4 mr-2" />
                                    Issue Created
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

          {filteredResults.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle className="w-12 h-12 text-primary mx-auto mb-4" />
                <p className="text-muted-foreground">
                  {priorityFilter !== "all" || fileFilter !== "all"
                    ? "No issues match the selected filters."
                    : "No issues found! Your code looks good."}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export default IssuesDisplay;
