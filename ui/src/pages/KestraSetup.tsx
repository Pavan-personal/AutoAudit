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
import { ThemeToggle } from "@/components/ThemeToggle";

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
          const data = await response.json();
          if (data.expired) {
            toast.error("Session expired. Please log in again.");
          }
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
    
    const javaOpts = os === "macos" ? '-e JAVA_OPTS="-XX:UseSVE=0" \\\n  ' : '';
    
    return `docker run --pull=always --rm -it -p 8080:8080 --user=root \\n  ${javaOpts}-v /var/run/docker.sock:/var/run/docker.sock \\n  -v /tmp:/tmp \\n  -e "SECRET_${aiProvider.toUpperCase()}_API_KEY=${base64ApiKey}" \\n  -e "SECRET_WEBHOOK_SECRET_KEY=${base64Secret}" \\n  kestra/kestra:latest server local`;
  };

  const getWorkflowYaml = () => {
    const yaml = aiProvider === "gemini" ? `id: issue-assignment-gemini
namespace: autoaudit
description: AI-powered GitHub issue assignment using Google Gemini

inputs:
  - id: issue_number
    type: INT
    description: GitHub issue number
  - id: owner
    type: STRING
    description: Repository owner
  - id: repo
    type: STRING
    description: Repository name
  - id: comment_body
    type: STRING
    description: Comment text from user
  - id: commenter_username
    type: STRING
    description: GitHub username of commenter
  - id: commenter_id
    type: INT
    description: GitHub user ID of commenter
  - id: issue_title
    type: STRING
    description: Issue title
  - id: issue_body
    type: STRING
    description: Issue description
  - id: github_token
    type: STRING
    description: GitHub token for API calls
  - id: backend_api_url
    type: STRING
    description: Backend API URL
  - id: comment_created_at
    type: STRING
    description: Comment creation timestamp

tasks:
  - id: analyze_intent
    type: io.kestra.plugin.scripts.python.Script
    containerImage: python:3.11-slim
    beforeCommands:
      - pip install google-generativeai kestra
    env:
      GEMINI_API_KEY: "{{{{ secret('GEMINI_API_KEY') }}}}"
      ISSUE_TITLE: "{{{{ trigger.body.issue_title }}}}"
      ISSUE_BODY: "{{{{ trigger.body.issue_body }}}}"
      COMMENTER_USERNAME: "{{{{ trigger.body.commenter_username }}}}"
      COMMENT_BODY: "{{{{ trigger.body.comment_body }}}}"
    script: |
      import os
      import google.generativeai as genai
      from kestra import Kestra
      
      genai.configure(api_key=os.environ['GEMINI_API_KEY'])
      model = genai.GenerativeModel('gemini-pro')
      
      issue_title = os.environ.get('ISSUE_TITLE', '')
      issue_body = os.environ.get('ISSUE_BODY', '')
      commenter_username = os.environ.get('COMMENTER_USERNAME', '')
      comment_body = os.environ.get('COMMENT_BODY', '')
      
      prompt = f"""Analyze this GitHub issue comment to determine assignment intent.

      Issue Title: {issue_title}
      Issue Description: {issue_body}
      
      User @{commenter_username} commented:
      {comment_body}
      
      Your task: Determine if this comment indicates the user wants to be assigned to work on this issue.
      
      Return ONLY ONE of these three words:
      - ACCEPT: Comment shows intent to work on issue AND provides a valid approach/solution idea
      - REJECT: Comment shows intent to work on issue BUT lacks any approach or solution details
      - IGNORE: Comment is just discussion/info/question, NOT an assignment request
      
      Examples:
      - "I can fix this by updating the auth middleware" → ACCEPT
      - "I want to work on this" → REJECT (no approach)
      - "assign me" → REJECT (no approach)
      - "This is happening because of X" → IGNORE (just info)
      - "I'll refactor the parser module to handle this edge case" → ACCEPT
      
      Response (one word only):"""
      
      response = model.generate_content(
        prompt,
        generation_config=genai.types.GenerationConfig(
          temperature=0.1,
          max_output_tokens=10
        )
      )
      
      decision = response.text.strip().upper()
      Kestra.outputs({'decision': decision})

  - id: route_decision
    type: io.kestra.plugin.core.flow.Switch
    value: "{{{{ outputs.analyze_intent.vars.decision }}}}"
    cases:
      ACCEPT:
        - id: assign_issue
          type: io.kestra.plugin.core.http.Request
          uri: "{{{{ trigger.body.backend_api_url }}}}/api/repositories/{{{{ trigger.body.owner }}}}/{{{{ trigger.body.repo }}}}/issues/{{{{ trigger.body.issue_number }}}}/assign"
          method: POST
          contentType: application/json
          body: |
            {
              "assignee": "{{{{ trigger.body.commenter_username }}}}",
              "githubToken": "{{{{ trigger.body.github_token }}}}"
            }
      
      REJECT:
        - id: generate_response
          type: io.kestra.plugin.scripts.python.Script
          containerImage: python:3.11-slim
          beforeCommands:
            - pip install google-generativeai kestra
          env:
            GEMINI_API_KEY: "{{{{ secret('GEMINI_API_KEY') }}}}"
            ISSUE_TITLE: "{{{{ trigger.body.issue_title }}}}"
            COMMENTER_USERNAME: "{{{{ trigger.body.commenter_username }}}}"
            COMMENT_BODY: "{{{{ trigger.body.comment_body }}}}"
          script: |
            import os
            import google.generativeai as genai
            from kestra import Kestra
            
            genai.configure(api_key=os.environ['GEMINI_API_KEY'])
            model = genai.GenerativeModel('gemini-pro')
            
            issue_title = os.environ.get('ISSUE_TITLE', '')
            commenter_username = os.environ.get('COMMENTER_USERNAME', '')
            comment_body = os.environ.get('COMMENT_BODY', '')
            
            prompt = f"""Generate a friendly, conversational GitHub comment asking for more details about their approach.
            
            Context:
            - User @{commenter_username} wants to work on issue: "{issue_title}"
            - Their comment: "{comment_body}"
            - Problem: They didn't explain HOW they'll solve it
            
            Requirements:
            - Be friendly and encouraging (use emojis sparingly)
            - Mention their username with @
            - Ask them to explain their technical approach
            - Make it feel personal, not robotic
            - Keep it under 100 words
            - Vary the wording each time (don't be repetitive)
            
            Generate a unique, conversational response:"""
            
            response = model.generate_content(
              prompt,
              generation_config=genai.types.GenerationConfig(
                temperature=0.8,
                max_output_tokens=150
              )
            )
            
            dynamic_comment = response.text.strip()
            Kestra.outputs({'comment': dynamic_comment})
        
        - id: request_more_details
          type: io.kestra.plugin.core.http.Request
          uri: "{{{{ trigger.body.backend_api_url }}}}/api/repositories/{{{{ trigger.body.owner }}}}/{{{{ trigger.body.repo }}}}/issues/{{{{ trigger.body.issue_number }}}}/comment"
          method: POST
          contentType: application/json
          body: |
            {
              "comment": "{{{{ outputs.generate_response.vars.comment }}}}",
              "githubToken": "{{{{ trigger.body.github_token }}}}",
              "targetUsername": "{{{{ trigger.body.commenter_username }}}}"
            }
      
      IGNORE:
        - id: log_ignored
          type: io.kestra.plugin.core.log.Log
          message: "Comment from @{{{{ trigger.body.commenter_username }}}} was informational, no assignment action needed"

triggers:
  - id: webhook
    type: io.kestra.plugin.core.trigger.Webhook
    key: "{{{{ secret('WEBHOOK_SECRET_KEY') }}}}"
    conditions:
      - type: io.kestra.plugin.core.condition.ExpressionCondition
        expression: "{{{{ trigger.body.commenter_username != null and trigger.body.github_token != null }}}}"` 
    : 
    `id: issue-assignment-automation
namespace: autoaudit
description: AI-powered GitHub issue assignment based on comment analysis

inputs:
  - id: issue_number
    type: INT
    description: GitHub issue number
  - id: owner
    type: STRING
    description: Repository owner
  - id: repo
    type: STRING
    description: Repository name
  - id: comment_body
    type: STRING
    description: Comment text from user
  - id: commenter_username
    type: STRING
    description: GitHub username of commenter
  - id: commenter_id
    type: INT
    description: GitHub user ID of commenter
  - id: issue_title
    type: STRING
    description: Issue title
  - id: issue_body
    type: STRING
    description: Issue description
  - id: github_token
    type: STRING
    description: GitHub token for API calls
  - id: backend_api_url
    type: STRING
    description: Backend API URL
  - id: comment_created_at
    type: STRING
    description: Comment creation timestamp

tasks:
  - id: analyze_intent
    type: io.kestra.plugin.scripts.python.Script
    containerImage: python:3.11-slim
    beforeCommands:
      - pip install openai kestra
    env:
      OPENAI_API_KEY: "{{{{ secret('OPENAI_API_KEY') }}}}"
      ISSUE_TITLE: "{{{{ trigger.body.issue_title }}}}"
      ISSUE_BODY: "{{{{ trigger.body.issue_body }}}}"
      COMMENTER_USERNAME: "{{{{ trigger.body.commenter_username }}}}"
      COMMENT_BODY: "{{{{ trigger.body.comment_body }}}}"
    script: |
      import os
      from openai import OpenAI
      from kestra import Kestra
      
      client = OpenAI(api_key=os.environ['OPENAI_API_KEY'])
      
      issue_title = os.environ.get('ISSUE_TITLE', '')
      issue_body = os.environ.get('ISSUE_BODY', '')
      commenter_username = os.environ.get('COMMENTER_USERNAME', '')
      comment_body = os.environ.get('COMMENT_BODY', '')
      
      prompt = f"""Analyze this GitHub issue comment to determine assignment intent.

      Issue Title: {issue_title}
      Issue Description: {issue_body}
      
      User @{commenter_username} commented:
      {comment_body}
      
      Your task: Determine if this comment indicates the user wants to be assigned to work on this issue.
      
      Return ONLY ONE of these three words:
      - ACCEPT: Comment shows intent to work on issue AND provides a valid approach/solution idea
      - REJECT: Comment shows intent to work on issue BUT lacks any approach or solution details
      - IGNORE: Comment is just discussion/info/question, NOT an assignment request
      
      Examples:
      - "I can fix this by updating the auth middleware" → ACCEPT
      - "I want to work on this" → REJECT (no approach)
      - "assign me" → REJECT (no approach)
      - "This is happening because of X" → IGNORE (just info)
      - "I'll refactor the parser module to handle this edge case" → ACCEPT
      
      Response (one word only):"""
      
      response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
          {"role": "system", "content": "You are an expert at analyzing GitHub issue comments. Respond with ONLY one word: ACCEPT, REJECT, or IGNORE."},
          {"role": "user", "content": prompt}
        ],
        temperature=0.1,
        max_tokens=10
      )
      
      decision = response.choices[0].message.content.strip().upper()
      Kestra.outputs({'decision': decision})

  - id: route_decision
    type: io.kestra.plugin.core.flow.Switch
    value: "{{{{ outputs.analyze_intent.vars.decision }}}}"
    cases:
      ACCEPT:
        - id: assign_issue
          type: io.kestra.plugin.core.http.Request
          uri: "{{{{ trigger.body.backend_api_url }}}}/api/repositories/{{{{ trigger.body.owner }}}}/{{{{ trigger.body.repo }}}}/issues/{{{{ trigger.body.issue_number }}}}/assign"
          method: POST
          contentType: application/json
          body: |
            {
              "assignee": "{{{{ trigger.body.commenter_username }}}}",
              "githubToken": "{{{{ trigger.body.github_token }}}}"
            }
      
      REJECT:
        - id: generate_response
          type: io.kestra.plugin.scripts.python.Script
          containerImage: python:3.11-slim
          beforeCommands:
            - pip install openai kestra
          env:
            OPENAI_API_KEY: "{{{{ secret('OPENAI_API_KEY') }}}}"
            ISSUE_TITLE: "{{{{ trigger.body.issue_title }}}}"
            COMMENTER_USERNAME: "{{{{ trigger.body.commenter_username }}}}"
            COMMENT_BODY: "{{{{ trigger.body.comment_body }}}}"
          script: |
            import os
            from openai import OpenAI
            from kestra import Kestra
            
            client = OpenAI(api_key=os.environ['OPENAI_API_KEY'])
            
            issue_title = os.environ.get('ISSUE_TITLE', '')
            commenter_username = os.environ.get('COMMENTER_USERNAME', '')
            comment_body = os.environ.get('COMMENT_BODY', '')
            
            prompt = f"""Generate a friendly, conversational GitHub comment asking for more details about their approach.
            
            Context:
            - User @{commenter_username} wants to work on issue: "{issue_title}"
            - Their comment: "{comment_body}"
            - Problem: They didn't explain HOW they'll solve it
            
            Requirements:
            - Be friendly and encouraging (use emojis sparingly)
            - Mention their username with @
            - Ask them to explain their technical approach
            - Make it feel personal, not robotic
            - Keep it under 100 words
            - Vary the wording each time (don't be repetitive)
            
            Example tones:
            - "Hey @{commenter_username}! Excited you want to tackle this 🚀 Could you share how you're planning to solve it?"
            - "Thanks for jumping in @{commenter_username}! Before I assign this, could you walk me through your approach?"
            - "@{commenter_username} I'd love to assign this to you! Mind sharing your solution strategy first?"
            
            Generate a unique, conversational response:"""
            
            response = client.chat.completions.create(
              model="gpt-4o-mini",
              messages=[
                {"role": "system", "content": "You are a friendly GitHub bot that encourages contributors while ensuring quality. Be conversational and vary your responses."},
                {"role": "user", "content": prompt}
              ],
              temperature=0.8,
              max_tokens=150
            )
            
            dynamic_comment = response.choices[0].message.content.strip()
            Kestra.outputs({'comment': dynamic_comment})
        
        - id: request_more_details
          type: io.kestra.plugin.core.http.Request
          uri: "{{{{ trigger.body.backend_api_url }}}}/api/repositories/{{{{ trigger.body.owner }}}}/{{{{ trigger.body.repo }}}}/issues/{{{{ trigger.body.issue_number }}}}/comment"
          method: POST
          contentType: application/json
          body: |
            {
              "comment": "{{{{ outputs.generate_response.vars.comment }}}}",
              "githubToken": "{{{{ trigger.body.github_token }}}}",
              "targetUsername": "{{{{ trigger.body.commenter_username }}}}"
            }
      
      IGNORE:
        - id: log_ignored
          type: io.kestra.plugin.core.log.Log
          message: "Comment from @{{{{ trigger.body.commenter_username }}}} was informational, no assignment action needed"

triggers:
  - id: webhook
    type: io.kestra.plugin.core.trigger.Webhook
    key: "{{{{ secret('WEBHOOK_SECRET_KEY') }}}}"
    conditions:
      - type: io.kestra.plugin.core.condition.ExpressionCondition
        expression: "{{{{ trigger.body.commenter_username != null and trigger.body.github_token != null }}}}"`;

    return yaml;
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
            <div className="flex-1">
              <h1 className="text-4xl font-bold mb-2 flex items-center gap-2">
                <Settings className="w-8 h-8" />
                Kestra Setup
              </h1>
              <p className="text-muted-foreground">
                {owner}/{repo} - Configure AI-powered issue automation
              </p>
            </div>
            <ThemeToggle />
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
                Open the ngrok tunnel URL (eg: https://abc123.ngrok.io) and create the workflow
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <pre className="bg-[#1e1e1e] text-[#d4d4d4] p-4 rounded-lg overflow-x-auto text-xs font-mono max-h-96 border border-zinc-700">
                  <code className="language-yaml">{getWorkflowYaml()}</code>
                </pre>
                <Button
                  size="sm"
                  variant="ghost"
                  className="absolute top-2 right-2 bg-zinc-800/80 hover:bg-zinc-700"
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
                <li>Open your <strong>ngrok tunnel URL</strong> (e.g., https://abc123.ngrok.io) in browser</li>
                <li>Go to <strong>Flows → Create New Flow</strong></li>
                <li>Paste the complete YAML content above</li>
                <li>Click <strong>Save</strong> to deploy the workflow</li>
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
