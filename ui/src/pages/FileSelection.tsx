import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, File, Folder, ChevronRight, ChevronDown, Check, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface FileItem {
  name: string;
  path: string;
  type: string;
  size: number;
  sha: string;
  download_url: string | null;
}

interface SelectedFile {
  path: string;
  content: string;
}

interface TreeNode {
  item: FileItem;
  children: TreeNode[];
  expanded: boolean;
}

function FileSelection() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const [items, setItems] = useState<FileItem[]>([]);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState<string>("");
  const [showPromptDialog, setShowPromptDialog] = useState(false);
  const [userPrompt, setUserPrompt] = useState("");
  const navigate = useNavigate();
  const API_URL = import.meta.env.VITE_API_URL || "https://autoauditserver.vercel.app";
  const OUMI_API_URL = import.meta.env.VITE_OUMI_API_URL || "https://pavannnnnnn-autoaudi-ai-oumi.hf.space/api/analyze";

  const fetchContents = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);

    try {
      const url = path
        ? `${API_URL}/api/repositories/${owner}/${repo}/contents?path=${encodeURIComponent(path)}`
        : `${API_URL}/api/repositories/${owner}/${repo}/contents`;

      const response = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setItems(data.items || []);

      const treeNodes: TreeNode[] = (data.items || []).map((item: FileItem) => ({
        item,
        children: [],
        expanded: false,
      }));

      setTree(treeNodes);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching contents:", error);
      setLoading(false);
      setError("Failed to load contents");
    }
  }, [owner, repo, API_URL]);

  useEffect(() => {
    if (!owner || !repo) {
      navigate("/repositories");
      return;
    }

    fetchContents(currentPath);
  }, [owner, repo, currentPath, navigate, fetchContents]);

  function updateTree(nodes: TreeNode[], targetPath: string, updater: (node: TreeNode) => TreeNode): TreeNode[] {
    return nodes.map((node) => {
      if (node.item.path === targetPath) {
        return updater(node);
      }
      if (node.children.length > 0) {
        return {
          ...node,
          children: updateTree(node.children, targetPath, updater),
        };
      }
      return node;
    });
  }

  async function fetchFolderContents(path: string, node: TreeNode) {
    if (node.children.length > 0) {
      setTree((prev) =>
        updateTree(prev, node.item.path, (n) => ({ ...n, expanded: !n.expanded }))
      );
      return;
    }

    try {
      const url = `${API_URL}/api/repositories/${owner}/${repo}/contents?path=${encodeURIComponent(path)}`;
      const response = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const children: TreeNode[] = (data.items || []).map((item: FileItem) => ({
        item,
        children: [],
        expanded: false,
      }));

      setTree((prev) =>
        updateTree(prev, node.item.path, (n) => ({ ...n, children, expanded: true }))
      );
    } catch (error) {
      console.error("Error fetching folder contents:", error);
    }
  }

  function toggleFile(path: string) {
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(path)) {
      newSelected.delete(path);
    } else {
      if (newSelected.size >= 5) {
        return;
      }
      newSelected.add(path);
    }
    setSelectedFiles(newSelected);
  }

  function handleAnalyzeClick() {
    if (selectedFiles.size === 0) {
      return;
    }
    setShowPromptDialog(true);
  }

  async function handleAnalyze() {
    setShowPromptDialog(false);
    setAnalyzing(true);
    setError(null);

    try {
      const fileContents: SelectedFile[] = [];

      for (const filePath of selectedFiles) {
        const response = await fetch(
          `${API_URL}/api/repositories/${owner}/${repo}/contents/${encodeURIComponent(filePath)}`,
          {
            method: "GET",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch file: ${filePath}`);
        }

        const data = await response.json();
        fileContents.push({
          path: data.path,
          content: data.content,
        });
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000);

      const analysisResponse = await fetch(OUMI_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          files: fileContents.map((file) => ({
            path: file.path,
            content: file.content,
          })),
          options: {
            type: ["bugs", "security"],
            userPrompt: userPrompt.trim() || undefined,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!analysisResponse.ok) {
        throw new Error("Failed to analyze files");
      }

      const analysisData = await analysisResponse.json();
      navigate(`/repositories/${owner}/${repo}/issues`, {
        state: { analysis: analysisData, repository: { owner, repo } },
      });
    } catch (error) {
      console.error("Error analyzing files:", error);
      if (error instanceof Error && error.name === "AbortError") {
        setError("Analysis timed out. Please try with fewer files.");
      } else {
        setError("Failed to analyze files. Please try again.");
      }
      setAnalyzing(false);
    }
  }

  function renderTree(nodes: TreeNode[], level = 0): JSX.Element[] {
    return nodes.map((node) => {
      const isFile = node.item.type === "file";
      const isSelected = selectedFiles.has(node.item.path);
      const isDisabled = !isSelected && selectedFiles.size >= 5;

      return (
        <div key={node.item.path} className={level > 0 ? "mt-1" : "mt-2"}>
          {isFile ? (
            <Card
              className={`cursor-pointer transition-all ${
                isSelected
                  ? "border-primary bg-secondary/50"
                  : isDisabled
                  ? "opacity-50"
                  : "hover:border-border"
              }`}
              onClick={() => {
                if (!isDisabled) {
                  toggleFile(node.item.path);
                }
              }}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3" style={{ paddingLeft: `${level * 24}px` }}>
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => !isDisabled && toggleFile(node.item.path)}
                    disabled={isDisabled}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <File className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{node.item.name}</p>
                    <p className="text-sm text-muted-foreground truncate mt-0.5">
                      {node.item.path}
                    </p>
                  </div>
                  {isSelected && (
                    <Check className="w-5 h-5 text-primary flex-shrink-0" />
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <div
              className={`cursor-pointer transition-all rounded-lg border border-border/50 bg-secondary/20 hover:bg-secondary/40 p-3 ${
                level > 0 ? "ml-4" : ""
              }`}
              onClick={() => fetchFolderContents(node.item.path, node)}
            >
              <div className="flex items-center gap-3" style={{ paddingLeft: `${level * 24}px` }}>
                {node.expanded ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                )}
                <Folder className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <p className="font-medium text-sm">{node.item.name}</p>
              </div>
            </div>
          )}
          {!isFile && node.expanded && node.children.length > 0 && (
            <div className="mt-1">{renderTree(node.children, level + 1)}</div>
          )}
        </div>
      );
    });
  }

  if (loading && tree.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading contents...</p>
        </div>
      </div>
    );
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
                <h1 className="text-4xl font-bold mb-2">Select Files</h1>
                <p className="text-muted-foreground">
                  Choose up to 5 files to audit ({selectedFiles.size}/5 selected)
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

          {tree.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <File className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No contents found in this repository</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="space-y-1 mb-6 max-h-[60vh] overflow-y-auto">
                {renderTree(tree)}
              </div>

              <div className="flex items-center justify-between">
                <Button
                  onClick={() => navigate("/repositories")}
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAnalyzeClick}
                  disabled={selectedFiles.size === 0 || analyzing}
                >
                  {analyzing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Analyzing...
                    </>
                  ) : (
                    "Analyze Files"
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      <Dialog open={showPromptDialog} onOpenChange={setShowPromptDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Additional Analysis Prompt</DialogTitle>
            <DialogDescription>
              Optionally provide additional instructions for the AI analysis. Leave empty to use default analysis.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="e.g., Focus on security vulnerabilities, check for performance issues, etc."
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowPromptDialog(false);
                setUserPrompt("");
              }}
            >
              Skip
            </Button>
            <Button
              onClick={handleAnalyze}
              disabled={analyzing}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default FileSelection;
