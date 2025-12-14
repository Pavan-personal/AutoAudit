import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Sparkles, Scan, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

function ClineFileSelection() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPromptDialog, setShowPromptDialog] = useState(false);
  const [userPrompt, setUserPrompt] = useState("");
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const navigate = useNavigate();
  const API_URL = import.meta.env.VITE_API_URL || "https://autoauditserver.vercel.app";

  function handleScanClick() {
    setShowPromptDialog(true);
  }

  async function handleScanEntireRepo() {
    if (!owner || !repo) {
      setError("Invalid repository");
      return;
    }

    setAnalyzing(true);
    setError(null);
    setShowPromptDialog(false);
    setProgress(0);
    setStatusMessage("Fetching repository files...");

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600000);

      // Simulate progress for better UX
      let currentBatch = 1;
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) return prev; // Cap at 90% until complete
          return prev + Math.random() * 10;
        });
      }, 2000);

      // Update status messages based on estimated batches (assuming ~10 files per batch)
      setTimeout(() => setStatusMessage("Analyzing files with AI..."), 3000);
      setTimeout(() => {
        currentBatch = 1;
        setStatusMessage("Processing batch 1...");
      }, 8000);
      setTimeout(() => {
        currentBatch = 2;
        setStatusMessage("Processing batch 2...");
      }, 25000);
      setTimeout(() => {
        currentBatch = 3;
        setStatusMessage("Processing batch 3...");
      }, 42000);
      setTimeout(() => {
        currentBatch = 4;
        setStatusMessage("Processing batch 4...");
      }, 60000);
      setTimeout(() => setStatusMessage("Finalizing analysis..."), 80000);

      const analysisResponse = await fetch(`${API_URL}/api/repositories/${owner}/${repo}/analyze-cline`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scanEntireRepo: true,
          userPrompt: userPrompt.trim() || undefined,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      clearInterval(progressInterval);
      setProgress(100);
      setStatusMessage("✅ Analysis complete! Redirecting...");

      if (!analysisResponse.ok) {
        const errorData = await analysisResponse.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to analyze repository");
      }

      const analysisData = await analysisResponse.json();
      
      toast.success("✨ Repository Analysis Complete!", {
        description: `Found ${analysisData.summary?.total_issues || 0} issues across ${analysisData.summary?.files_with_issues || 0} files.`,
        duration: 3000,
      });
      
      navigate(`/repositories/${owner}/${repo}/issues`, {
        state: { analysis: analysisData, repository: { owner, repo } },
      });
    } catch (error) {
      console.error("Error analyzing repository:", error);
      if (error instanceof Error && error.name === "AbortError") {
        setError("Analysis timed out. The repository might be too large. Please try again.");
        toast.error("Analysis Timed Out", {
          description: "The repository scan took too long. Try with a smaller repository or contact support.",
        });
      } else {
        const errorMessage = error instanceof Error ? error.message : "Failed to analyze repository. Please try again.";
        setError(errorMessage);
        toast.error("Analysis Failed", {
          description: errorMessage,
        });
      }
      setAnalyzing(false);
      setProgress(0);
      setStatusMessage("");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container-custom py-12">
        <div className="max-w-4xl mx-auto">
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
                <h1 className="text-4xl font-bold mb-2 flex items-center gap-2">
                  <Sparkles className="w-8 h-8 text-primary" />
                  Full Codebase Scan
                </h1>
                <p className="text-muted-foreground">
                  Comprehensive AI-powered analysis of your entire codebase
                </p>
              </div>
            </div>
          </div>

          {error && (
            <Card className="mb-6 border-destructive">
              <CardContent className="pt-6">
                <p className="text-destructive">{error}</p>
              </CardContent>
            </Card>
          )}

          <Card className="glass-card-hover">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <Scan className="w-6 h-6 text-primary" />
                <CardTitle>Scan Entire Repository</CardTitle>
              </div>
              <CardDescription>
                Complete codebase scanning using advanced AI models and research. Analyzes your entire repository, including all files and directories (excluding common build artifacts and dependencies).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-secondary/50 border border-border">
                  <h3 className="font-semibold mb-2">What will be analyzed:</h3>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li>Main source code files (up to 80 files, max 2 directory levels deep)</li>
                    <li>For monorepos: Only scans the main folder (src, lib, app, etc.)</li>
                    <li>Code quality, security vulnerabilities, and bugs</li>
                    <li>Performance issues and architectural concerns</li>
                  </ul>
                </div>
                <div className="p-4 rounded-lg bg-secondary/50 border border-border">
                  <h3 className="font-semibold mb-2">Automatically excluded:</h3>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li>Test files, docs, node_modules, .git, dist, build folders</li>
                    <li>Binary files (images, fonts, archives)</li>
                    <li>Files larger than 1MB</li>
                    <li>Deep nested directories (only 2 levels scanned)</li>
                  </ul>
                </div>
                <div className="pt-4">
                  <Button
                    onClick={handleScanClick}
                    disabled={analyzing}
                    size="lg"
                    className="w-full"
                  >
                    {analyzing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin mr-2" />
                        Scanning Repository...
                      </>
                    ) : (
                      <>
                        <Scan className="w-5 h-5 mr-2" />
                        Start Full Repository Scan
                      </>
                    )}
                  </Button>
                </div>
                {analyzing && (
                  <div className="space-y-4 py-4">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-sm">
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-primary" />
                          <span className="text-foreground font-medium">{statusMessage}</span>
                        </div>
                        <span className="text-primary font-bold">{Math.round(progress)}%</span>
                      </div>
                      <div className="relative w-full bg-secondary rounded-full h-3 overflow-hidden border border-border">
                        <div 
                          className="absolute top-0 left-0 h-full bg-gradient-to-r from-primary to-primary/80 rounded-full transition-all duration-500 ease-out shadow-lg"
                          style={{ width: `${progress}%` }}
                        >
                          <div className="absolute inset-0 bg-white/20 animate-pulse" />
                        </div>
                      </div>
                    </div>
                    <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
                      <div className="flex items-start gap-2">
                        <Sparkles className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-foreground">
                            AI is analyzing your code in batches for optimal quality
                          </p>
                          <p className="text-xs text-muted-foreground">
                            We process files in groups to ensure accurate issue detection with specific code references
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={showPromptDialog} onOpenChange={setShowPromptDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Additional Analysis Instructions</DialogTitle>
            <DialogDescription>
              Optionally provide specific instructions for the AI analysis. Leave empty to use default comprehensive analysis.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="e.g., Focus on security vulnerabilities, check for performance bottlenecks, review code architecture, etc."
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              className="min-h-[120px]"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setUserPrompt("");
                handleScanEntireRepo();
              }}
              disabled={analyzing}
              className="hover:bg-black/10"
            >
              Skip
            </Button>
            <Button
              onClick={handleScanEntireRepo}
              disabled={analyzing || !userPrompt.trim()}
            >
              Start Scan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ClineFileSelection;
