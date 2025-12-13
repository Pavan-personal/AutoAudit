import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Sparkles, Scan } from "lucide-react";
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

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600000);

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

      if (!analysisResponse.ok) {
        const errorData = await analysisResponse.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to analyze repository");
      }

      const analysisData = await analysisResponse.json();
      
      toast.success("Repository Analysis Complete", {
        description: `Analyzed ${analysisData.summary?.total_files || 0} files and found ${analysisData.summary?.total_issues || 0} issues.`,
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
                  Cline AI Repository Scan
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
                Cline AI will analyze your entire codebase, including all files and directories (excluding common build artifacts and dependencies).
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
                  <div className="text-center py-4">
                    <p className="text-sm text-muted-foreground">
                      This may take several minutes depending on repository size...
                    </p>
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
