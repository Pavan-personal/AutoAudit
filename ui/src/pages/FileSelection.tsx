import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, File, Check, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

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

function FileSelection() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const API_URL = import.meta.env.VITE_API_URL || "https://autoauditserver.vercel.app";

  useEffect(() => {
    if (!owner || !repo) {
      navigate("/repositories");
      return;
    }

    async function fetchFiles() {
      try {
        const response = await fetch(
          `${API_URL}/api/repositories/${owner}/${repo}/contents`,
          {
            method: "GET",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        setFiles(data.files || []);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching files:", error);
        setLoading(false);
        setError("Failed to load files");
      }
    }

    fetchFiles();
  }, [owner, repo, navigate, API_URL]);

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

  async function handleAnalyze() {
    if (selectedFiles.size === 0) {
      return;
    }

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

      const analysisResponse = await fetch(`${API_URL}/api/repositories/analyze`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          files: fileContents,
          options: {
            type: ["bugs", "security"],
          },
        }),
      });

      if (!analysisResponse.ok) {
        throw new Error("Failed to analyze files");
      }

      const analysisData = await analysisResponse.json();
      navigate(`/repositories/${owner}/${repo}/issues`, {
        state: { analysis: analysisData, repository: { owner, repo } },
      });
    } catch (error) {
      console.error("Error analyzing files:", error);
      setError("Failed to analyze files. Please try again.");
      setAnalyzing(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading files...</p>
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

          {files.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <File className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No files found in this repository</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="space-y-2 mb-6">
                {files.map((file) => {
                  const isSelected = selectedFiles.has(file.path);
                  const isDisabled = !isSelected && selectedFiles.size >= 5;

                  return (
                    <Card
                      key={file.path}
                      className={`cursor-pointer transition-all ${
                        isSelected
                          ? "border-primary bg-secondary/50"
                          : isDisabled
                          ? "opacity-50"
                          : "hover:border-border"
                      }`}
                      onClick={() => !isDisabled && toggleFile(file.path)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center gap-4">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => !isDisabled && toggleFile(file.path)}
                            disabled={isDisabled}
                          />
                          <File className="w-5 h-5 text-muted-foreground" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{file.name}</p>
                            <p className="text-sm text-muted-foreground truncate">
                              {file.path}
                            </p>
                          </div>
                          {isSelected && (
                            <Check className="w-5 h-5 text-primary" />
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <div className="flex items-center justify-between">
                <Button
                  onClick={() => navigate("/repositories")}
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAnalyze}
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
    </div>
  );
}

export default FileSelection;
