import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Copy, Check, ExternalLink, Info, Terminal, FileCode, Settings, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";

const KestraSetup = () => {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const navigate = useNavigate();
  const [aiProvider, setAiProvider] = useState<"openai" | "gemini">("openai");
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [ngrokDomain, setNgrokDomain] = useState("");
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const [copiedYaml, setCopiedYaml] = useState(false);
  const [saving, setSaving] = useState(false);
  const API_URL = import.meta.env.VITE_API_URL || "https://autoauditserver.vercel.app";

  // Auth check
  useEffect(() => {
    async function checkAuth() {
      try {
        const response = await fetch(`${API_URL}/api/user`, {
          method: "GET",
          credentials: "include",
        });
        if (!response.ok) {
          navigate("/");
        }
      } catch {
        navigate("/");
      }
    }
    checkAuth();
  }, [API_URL, navigate]);

  const generateDockerCommand = (os: "macos" | "linux") => {
    const base64ApiKey = btoa(apiKey || "your-api-key-here");
    const base64Secret = btoa(webhookSecret || "your-webhook-secret");
    
    const baseCommand = `docker run --pull=always --rm -it -p 8080:8080 --user=root \\
  -v /var/run/docker.sock:/var/run/docker.sock \\
  -v /tmp:/tmp \\
  -e "SECRET_${aiProvider.toUpperCase()}_API_KEY=${base64ApiKey}" \\
  -e "SECRET_WEBHOOK_SECRET_KEY=${base64Secret}" \\
  kestra/kestra:latest server local`;

    if (os === "macos") {
      return `-e JAVA_OPTS="-XX:UseSVE=0" \\
  ` + baseCommand;
    }
    return baseCommand;
  };

  const getWorkflowYaml = () => {
    if (aiProvider === "gemini") {
      return `# Gemini-powered workflow
id: issue-assignment-gemini
namespace: autoaudit
description: AI-powered GitHub issue assignment using Google Gemini

# ... (See full workflow in kestra/gemini-workflow.yaml)`;
    }
    return `# OpenAI-powered workflow  
id: issue-assignment-automation
namespace: autoaudit
description: AI-powered GitHub issue assignment based on comment analysis

# ... (See full workflow in kestra/kestra-workflow.yaml)`;
  };

  const copyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === "yaml") {
        setCopiedYaml(true);
        setTimeout(() => setCopiedYaml(false), 2000);
      } else {
        setCopiedCommand(type);
        setTimeout(() => setCopiedCommand(null), 2000);
      }
      toast.success("Copied to clipboard!");
    } catch (err) {
      toast.error("Failed to copy");
    }
  };

  const handleSave = async () => {
    if (!ngrokDomain || !webhookSecret) {
      toast.error("Please fill in all fields");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/repositories/${owner}/${repo}/kestra-config`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          kestraWebhookUrl: `${ngrokDomain}/api/v1/executions/webhook/autoaudit/${aiProvider === "openai" ? "issue-assignment-automation" : "issue-assignment-gemini"}/${webhookSecret}`,
          webhookSecret,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save configuration");
      }

      toast.success("Kestra configuration saved!");
      navigate(`/repositories/${owner}/${repo}/issues-list`);
    } catch (error) {
      console.error("Error saving config:", error);
      toast.error("Failed to save configuration");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container-custom py-12">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-4 mb-8">
            <Button
              onClick={() => navigate(`/repositories/${owner}/${repo}/issues-list`)}
              variant="outline"
              size="icon"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-4xl font-bold mb-2 flex items-center gap-2">
                <Settings className="w-8 h-8" />
                Kestra Setup
              </h1>
              <p className="text-muted-foreground">
                {owner}/{repo} - Configure AI-powered issue automation
              </p>
            </div>
          </div>

          <Alert className="mb-6 border-primary/50 bg-primary/5">
            <Info className="h-4 w-4" />
            <AlertTitle>Privacy Notice</AlertTitle>
            <AlertDescription>
              We do <strong>not</strong> store your API keys. They are only used locally in your Kestra instance. We only save your ngrok domain and webhook secret for routing.
            </AlertDescription>
          </Alert>

          {/* Step 1: Configure Secrets */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                Step 1: Configure Secrets
              </CardTitle>
              <CardDescription>
                Choose your AI provider and set up authentication
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ai-provider">AI Provider</Label>
                <Select value={aiProvider} onValueChange={(value: "openai" | "gemini") => setAiProvider(value)}>
                  <SelectTrigger id="ai-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI (GPT-4o-mini)</SelectItem>
                    <SelectItem value="gemini">Google Gemini (gemini-pro)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="api-key">
                  {aiProvider === "openai" ? "OpenAI" : "Gemini"} API Key
                </Label>
                <Input
                  id="api-key"
                  type="password"
                  placeholder={aiProvider === "openai" ? "sk-proj-..." : "AIza..."}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Get your key from{" "}
                  <a
                    href={aiProvider === "openai" ? "https://platform.openai.com/api-keys" : "https://makersuite.google.com/app/apikey"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    {aiProvider === "openai" ? "OpenAI Platform" : "Google AI Studio"}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="webhook-secret">Webhook Secret</Label>
                <Input
                  id="webhook-secret"
                  type="text"
                  placeholder="my-secret-key-123"
                  value={webhookSecret}
                  onChange={(e) => setWebhookSecret(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Choose any alphanumeric string (no special characters)
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Step 2: Run Kestra */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-primary" />
                Step 2: Run Kestra with Docker
              </CardTitle>
              <CardDescription>
                Copy and run the command in your terminal. Kestra will start on port 8080.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="linux" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="linux">WSL / Linux</TabsTrigger>
                  <TabsTrigger value="macos">macOS</TabsTrigger>
                </TabsList>
                <TabsContent value="linux" className="space-y-4">
                  <div className="relative">
                    <pre className="bg-black/95 text-green-400 p-4 rounded-lg overflow-x-auto text-sm font-mono">
                      <code>{generateDockerCommand("linux")}</code>
                    </pre>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="absolute top-2 right-2"
                      onClick={() => copyToClipboard(generateDockerCommand("linux"), "linux")}
                    >
                      {copiedCommand === "linux" ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </TabsContent>
                <TabsContent value="macos" className="space-y-4">
                  <div className="relative">
                    <pre className="bg-black/95 text-green-400 p-4 rounded-lg overflow-x-auto text-sm font-mono">
                      <code>{generateDockerCommand("macos")}</code>
                    </pre>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="absolute top-2 right-2"
                      onClick={() => copyToClipboard(generateDockerCommand("macos"), "macos")}
                    >
                      {copiedCommand === "macos" ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      For M4 chip users, the <code>JAVA_OPTS</code> flag prevents SIGILL errors
                    </AlertDescription>
                  </Alert>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Step 3: Expose with ngrok */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Step 3: Expose Kestra with ngrok</CardTitle>
              <CardDescription>
                Make your local Kestra accessible for GitHub webhooks
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <pre className="bg-black/95 text-green-400 p-4 rounded-lg overflow-x-auto text-sm font-mono">
                  <code>ngrok http 8080</code>
                </pre>
                <Button
                  size="sm"
                  variant="ghost"
                  className="absolute top-2 right-2"
                  onClick={() => copyToClipboard("ngrok http 8080", "ngrok")}
                >
                  {copiedCommand === "ngrok" ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Don't have ngrok?{" "}
                <a
                  href="https://ngrok.com/docs/getting-started"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  Install ngrok
                  <ExternalLink className="w-3 h-3" />
                </a>
              </p>
              <p className="text-sm text-muted-foreground">
                Copy the <strong>https</strong> forwarding URL (e.g., <code>https://abc123.ngrok.io</code>)
              </p>
            </CardContent>
          </Card>

          {/* Step 4: Deploy Workflow */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCode className="w-5 h-5 text-primary" />
                Step 4: Deploy Kestra Workflow
              </CardTitle>
              <CardDescription>
                Copy the workflow YAML and create it in Kestra UI at <code>http://localhost:8080</code>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Get the full workflow file from:{" "}
                  <code>kestra/{aiProvider === "openai" ? "kestra-workflow.yaml" : "gemini-workflow.yaml"}</code>
                </AlertDescription>
              </Alert>
              <div className="relative">
                <pre className="bg-black/95 text-blue-400 p-4 rounded-lg overflow-x-auto text-sm font-mono max-h-48">
                  <code>{getWorkflowYaml()}</code>
                </pre>
                <Button
                  size="sm"
                  variant="ghost"
                  className="absolute top-2 right-2"
                  onClick={() => copyToClipboard(getWorkflowYaml(), "yaml")}
                >
                  {copiedYaml ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <ol className="text-sm space-y-2 text-muted-foreground list-decimal list-inside">
                <li>Open <code>http://localhost:8080</code> in your browser</li>
                <li>Go to Flows → Create New Flow</li>
                <li>Paste the complete YAML content</li>
                <li>Save the flow</li>
              </ol>
            </CardContent>
          </Card>

          {/* Step 5: Finalize */}
          <Card>
            <CardHeader>
              <CardTitle>Step 5: Finalize Configuration</CardTitle>
              <CardDescription>
                Enter your ngrok domain and save the configuration
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ngrok-domain">Ngrok Domain</Label>
                <Input
                  id="ngrok-domain"
                  type="url"
                  placeholder="https://abc123.ngrok.io"
                  value={ngrokDomain}
                  onChange={(e) => setNgrokDomain(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Your ngrok forwarding URL (without trailing slash)
                </p>
              </div>

              <div className="space-y-2">
                <Label>Webhook Secret (confirmation)</Label>
                <Input
                  type="text"
                  value={webhookSecret}
                  disabled
                  className="bg-muted"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  onClick={() => navigate(`/repositories/${owner}/${repo}/issues-list`)}
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={!ngrokDomain || !webhookSecret || saving}
                  className="flex-1"
                >
                  {saving ? "Saving..." : "Save Configuration"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default KestraSetup;
