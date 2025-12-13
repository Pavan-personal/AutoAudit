import express, { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import axios from "axios";
import jwt from "jsonwebtoken";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const execAsync = promisify(exec);

const router = express.Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "your-jwt-secret-change-in-production";

const GITHUB_APP_ID = process.env.GITHUB_APP_ID;
const GITHUB_PRIVATE_KEY = process.env.GITHUB_PRIVATE_KEY;
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const VERCEL_AI_GATEWAY_API_KEY = process.env.VERCEL_AI_GATEWAY_API_KEY;

declare module "express-session" {
  interface SessionData {
    userId?: string;
    githubToken?: string;
  }
}

function generateGitHubAppJWT(): string | null {
  if (!GITHUB_APP_ID || !GITHUB_PRIVATE_KEY) {
    console.error("GITHUB_APP_ID or GITHUB_PRIVATE_KEY not configured");
    return null;
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iat: now - 60,
      exp: now + 600,
      iss: GITHUB_APP_ID,
    };

    const privateKey = GITHUB_PRIVATE_KEY.replace(/\\n/g, "\n");
    const token = jwt.sign(payload, privateKey, { algorithm: "RS256" });
    return token;
  } catch (error) {
    console.error("Error generating GitHub App JWT:", error);
    return null;
  }
}

async function getInstallationId(owner: string, repo?: string): Promise<number | null> {
  if (!GITHUB_APP_ID || !GITHUB_PRIVATE_KEY) {
    return null;
  }

  try {
    const appJWT = generateGitHubAppJWT();
    if (!appJWT) {
      return null;
    }

    if (repo) {
      try {
        const repoResponse = await axios.get(`https://api.github.com/repos/${owner}/${repo}/installation`, {
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${appJWT}`,
            "X-GitHub-Api-Version": "2022-11-28",
          },
        });
        return repoResponse.data.id || null;
      } catch {
        console.log(`No repository installation found for ${owner}/${repo}, trying user installation`);
      }
    }

    const userResponse = await axios.get(`https://api.github.com/users/${owner}/installation`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${appJWT}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    return userResponse.data.id || null;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      console.log(`No installation found for ${owner}`);
    } else {
      console.error("Error getting installation ID:", error);
    }
    return null;
  }
}

async function generateInstallationToken(installationId: number): Promise<string | null> {
  if (!GITHUB_APP_ID || !GITHUB_PRIVATE_KEY) {
    return null;
  }

  try {
    const appJWT = generateGitHubAppJWT();
    if (!appJWT) {
      return null;
    }

    const response = await axios.post(
      `https://api.github.com/app/installations/${installationId}/access_tokens`,
      {},
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${appJWT}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );

    return response.data.token || null;
  } catch (error) {
    console.error("Error generating installation token:", error);
    if (axios.isAxiosError(error)) {
      console.error("Response:", error.response?.data);
    }
    return null;
  }
}

async function getGitHubToken(req: Request): Promise<string | null> {
  if (req.session?.githubToken) {
    return req.session.githubToken;
  }
  
  const userId = req.session?.userId;
  if (!userId) {
    const authToken = req.cookies?.authToken;
    if (authToken) {
      try {
        const decoded = jwt.verify(authToken, JWT_SECRET) as { userId: string; email: string };
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: { githubToken: true },
        });
        if (user?.githubToken) {
          return user.githubToken;
        }
      } catch (err) {
        console.error("JWT verification failed:", err);
      }
    }
    return null;
  }
  
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { githubToken: true },
  });
  
  return user?.githubToken || null;
}

async function executeCline(prompt: string, workingDir?: string, timeout: number = 300000): Promise<{ stdout: string; stderr: string }> {
  try {
    const apiKey = VERCEL_AI_GATEWAY_API_KEY || OPENAI_API_KEY;
    const baseURL = VERCEL_AI_GATEWAY_API_KEY 
      ? "https://ai-gateway.vercel.sh/v1"
      : "https://api.openai.com/v1";
    const model = VERCEL_AI_GATEWAY_API_KEY 
      ? "openai/gpt-4o-mini"
      : "gpt-4o-mini";

    if (!apiKey) {
      throw new Error("Either VERCEL_AI_GATEWAY_API_KEY or OPENAI_API_KEY must be configured");
    }

    console.log(`Using ${VERCEL_AI_GATEWAY_API_KEY ? "Vercel AI Gateway" : "OpenAI API"} (Cline-compatible)`);

    try {
      const response = await axios.post(
        `${baseURL}/chat/completions`,
        {
          model: model,
          messages: [
            {
              role: "system",
              content: "You are Cline, an expert AI coding assistant. Analyze code thoroughly and provide detailed, actionable feedback. Format your responses clearly and professionally.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.7,
          max_tokens: 4000,
        },
        {
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: timeout,
        }
      );

      const content = response.data.choices[0]?.message?.content || "";
      return { stdout: content, stderr: "" };
    } catch (apiError) {
      if (axios.isAxiosError(apiError)) {
        const errorMsg = apiError.response?.data?.error?.message || apiError.message;
        throw new Error(`AI API error: ${errorMsg}`);
      }
      throw apiError;
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Unknown error in Cline execution");
  }
}

function parseClineIssuesOutput(output: string, files: Array<{ path: string; content: string }>): {
  summary: {
    total_files: number;
    total_issues: number;
    files_with_issues: number;
  };
  results: Array<{
    file: string;
    status: string;
    issues: Array<{
      title: string;
      body: string;
      tags: string[];
    }>;
  }>;
} {
  if (!output || output.trim().length === 0) {
    throw new Error("Cline returned empty output - analysis may have failed");
  }

  const lowerOutput = output.toLowerCase();
  
  if (lowerOutput.includes("npm error") || 
      lowerOutput.includes("enoent") || 
      lowerOutput.includes("errno") ||
      lowerOutput.includes("syscall") ||
      lowerOutput.includes("invalid response body") ||
      lowerOutput.includes("no such file or directory")) {
    throw new Error(`Cline execution failed with npm error. Please check Cline installation and disk space.`);
  }

  if (lowerOutput.includes("error") && (lowerOutput.includes("failed") || lowerOutput.includes("cannot") || lowerOutput.includes("unable"))) {
    const errorMatch = output.match(/(?:error|failed|cannot|unable)[:\s]+([^\n]+)/i);
    if (errorMatch && !lowerOutput.includes("issue") && !lowerOutput.includes("bug")) {
      throw new Error(`Cline execution failed: ${errorMatch[1].substring(0, 150)}`);
    }
  }

  const results: Array<{
    file: string;
    status: string;
    issues: Array<{
      title: string;
      body: string;
      tags: string[];
    }>;
  }> = [];

  let totalIssues = 0;

  for (const file of files) {
    const fileIssues: Array<{
      title: string;
      body: string;
      tags: string[];
    }> = [];

    const fileName = path.basename(file.path);
    const filePathLower = file.path.toLowerCase();
    
    const fileMentioned = lowerOutput.includes(filePathLower) || 
                          lowerOutput.includes(fileName.toLowerCase()) ||
                          output.includes(file.path) ||
                          output.includes(fileName);

    if (fileMentioned) {
      const lines = output.split("\n");
      let currentIssue: { title: string; body: string; tags: string[] } | null = null;
      let issueLines: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const lowerLine = line.toLowerCase();

        const isIssueStart = /^(issue|bug|security|error|vulnerability|problem|warning|concern|risk|flaw)/i.test(line) ||
                            lowerLine.includes("line ") ||
                            lowerLine.includes("found in") ||
                            lowerLine.includes("detected");

        if (isIssueStart && currentIssue === null) {
          if (issueLines.length > 0) {
            const issueBody = issueLines.join("\n").substring(0, 500);
            fileIssues.push({
              title: issueLines[0]?.substring(0, 100) || `Issue in ${fileName}`,
              body: issueBody || `Issue detected in ${file.path}`,
              tags: extractTags(issueBody),
            });
            totalIssues++;
            issueLines = [];
          }
          currentIssue = {
            title: line.substring(0, 100),
            body: line,
            tags: extractTags(line),
          };
          issueLines = [line];
        } else if (currentIssue || issueLines.length > 0) {
          if (line.length > 0 && !line.match(/^[-=*]{3,}$/)) {
            issueLines.push(line);
            if (currentIssue) {
              currentIssue.body += "\n" + line;
              if (currentIssue.body.length > 500) {
                currentIssue.body = currentIssue.body.substring(0, 500) + "...";
              }
            }
          } else if (line.length === 0 && issueLines.length > 2) {
            if (currentIssue) {
              fileIssues.push(currentIssue);
              totalIssues++;
            } else if (issueLines.length > 0) {
              const issueBody = issueLines.join("\n").substring(0, 500);
              fileIssues.push({
                title: issueLines[0]?.substring(0, 100) || `Issue in ${fileName}`,
                body: issueBody,
                tags: extractTags(issueBody),
              });
              totalIssues++;
            }
            currentIssue = null;
            issueLines = [];
          }
        }
      }

      if (currentIssue) {
        fileIssues.push(currentIssue);
        totalIssues++;
      } else if (issueLines.length > 0) {
        const issueBody = issueLines.join("\n").substring(0, 500);
        fileIssues.push({
          title: issueLines[0]?.substring(0, 100) || `Issue in ${fileName}`,
          body: issueBody,
          tags: extractTags(issueBody),
        });
        totalIssues++;
      }

      if (fileIssues.length === 0 && fileMentioned) {
        const relevantOutput = output.split("\n")
          .filter((l, idx) => {
            const lowerL = l.toLowerCase();
            return lowerL.includes(filePathLower) || 
                   lowerL.includes(fileName.toLowerCase()) ||
                   (idx < 50 && (lowerL.includes("issue") || lowerL.includes("bug") || lowerL.includes("security")));
          })
          .join("\n")
          .substring(0, 500);

        if (relevantOutput.length > 50) {
          fileIssues.push({
            title: `Analysis findings for ${fileName}`,
            body: `Cline AI analysis for ${file.path}:\n\n${relevantOutput}`,
            tags: extractTags(relevantOutput),
          });
          totalIssues++;
        }
      }
    }

    results.push({
      file: file.path,
      status: "success",
      issues: fileIssues,
    });
  }

  if (results.length === 0 && files.length > 0) {
    for (const file of files) {
      results.push({
        file: file.path,
        status: "success",
        issues: [],
      });
    }
  }

  return {
    summary: {
      total_files: files.length,
      total_issues: totalIssues,
      files_with_issues: results.filter((r) => r.issues.length > 0).length,
    },
    results,
  };
}

function extractTags(text: string): string[] {
  const tags: string[] = [];
  const lowerText = text.toLowerCase();

  if (lowerText.includes("security") || lowerText.includes("vulnerability") || lowerText.includes("exploit")) {
    tags.push("security");
  }
  if (lowerText.includes("bug") || lowerText.includes("error") || lowerText.includes("fail")) {
    tags.push("bugs");
  }
  if (lowerText.includes("performance") || lowerText.includes("slow") || lowerText.includes("optimize")) {
    tags.push("performance");
  }
  if (lowerText.includes("javascript") || lowerText.includes("js")) {
    tags.push("javascript");
  }
  if (lowerText.includes("typescript") || lowerText.includes("ts")) {
    tags.push("typescript");
  }

  return tags.length > 0 ? tags : ["review"];
}

function parseClinePRScore(output: string): { score: number; reasoning: string; recommendations: string[] } {
  const lowerOutput = output.toLowerCase();
  
  if (!output || output.trim().length === 0) {
    throw new Error("Cline returned empty output");
  }

  if (lowerOutput.includes("npm error") || 
      lowerOutput.includes("enoent") || 
      lowerOutput.includes("errno") ||
      lowerOutput.includes("syscall") ||
      lowerOutput.includes("invalid response body") ||
      lowerOutput.includes("no such file or directory")) {
    throw new Error(`Cline execution failed with npm error: ${output.substring(0, 200)}`);
  }

  if (lowerOutput.includes("error") && (lowerOutput.includes("failed") || lowerOutput.includes("cannot"))) {
    const errorMatch = output.match(/error[:\s]+([^\n]+)/i);
    if (errorMatch) {
      throw new Error(`Cline execution failed: ${errorMatch[1]}`);
    }
  }

  let score = 50;
  const reasoning: string[] = [];
  const recommendations: string[] = [];

  const scoreMatch = output.match(/(?:score|rating|readiness)[:\s]*(\d{1,3})(?:\s*\/\s*100)?/i);
  if (scoreMatch) {
    const parsedScore = parseInt(scoreMatch[1], 10);
    if (!isNaN(parsedScore) && parsedScore >= 0 && parsedScore <= 100) {
      score = parsedScore;
    }
  }

  if (lowerOutput.includes("excellent") || lowerOutput.includes("great") || lowerOutput.includes("perfect")) {
    score = Math.min(95, score + 30);
    reasoning.push("Code quality is excellent");
  }
  if (lowerOutput.includes("good") || lowerOutput.includes("well")) {
    score = Math.min(85, score + 20);
    reasoning.push("Code quality is good");
  }
  if (lowerOutput.includes("needs improvement") || lowerOutput.includes("issues found")) {
    score = Math.max(30, score - 20);
    reasoning.push("Some issues need to be addressed");
  }
  if (lowerOutput.includes("security") || lowerOutput.includes("vulnerability")) {
    score = Math.max(20, score - 25);
    reasoning.push("Security concerns detected");
    recommendations.push("Address security vulnerabilities before merging");
  }
  if (lowerOutput.includes("test") && lowerOutput.includes("pass")) {
    score = Math.min(95, score + 15);
    reasoning.push("Tests are passing");
  }
  if (lowerOutput.includes("test") && (lowerOutput.includes("fail") || lowerOutput.includes("missing"))) {
    score = Math.max(25, score - 20);
    reasoning.push("Tests are failing or missing");
    recommendations.push("Ensure all tests pass before merging");
  }
  if (lowerOutput.includes("review") && lowerOutput.includes("approve")) {
    score = Math.min(90, score + 15);
    reasoning.push("Code review approved");
  }
  if (lowerOutput.includes("conflict") || lowerOutput.includes("merge conflict")) {
    score = Math.max(10, score - 30);
    reasoning.push("Merge conflicts detected");
    recommendations.push("Resolve merge conflicts before merging");
  }

  const reasoningMatch = output.match(/(?:reasoning|analysis|assessment)[:\s]*([^\n]+(?:\n[^\n]+){0,5})/i);
  if (reasoningMatch && reasoningMatch[1].length > 20) {
    reasoning.push(reasoningMatch[1].trim());
  }

  if (reasoning.length === 0) {
    const firstParagraph = output.split("\n\n")[0] || output.split("\n").slice(0, 3).join(" ");
    if (firstParagraph.length > 20 && !firstParagraph.toLowerCase().includes("error")) {
      reasoning.push(firstParagraph.substring(0, 200));
    } else {
      reasoning.push("Code analysis completed");
    }
  }

  const recommendationsMatch = output.match(/(?:recommendations?|suggestions?|improvements?)[:\s]*([^\n]+(?:\n[^\n-]+){0,10})/i);
  if (recommendationsMatch) {
    const recs = recommendationsMatch[1].split(/\n|•|-/).filter(r => r.trim().length > 10);
    recommendations.push(...recs.slice(0, 5).map(r => r.trim()));
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    reasoning: reasoning.join(". "),
    recommendations: recommendations.length > 0 ? recommendations : [],
  };
}

router.get("/installation-status", async (req: Request, res: Response) => {
  try {
    const token = await getGitHubToken(req);
    if (!token) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const isUserAccessToken = token.startsWith("ghu_");
    const authHeader = isUserAccessToken ? `Bearer ${token}` : `token ${token}`;

    const userResponse = await axios.get("https://api.github.com/user", {
      headers: {
        Authorization: authHeader,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    const username = userResponse.data.login;

    if (!GITHUB_APP_ID || !GITHUB_PRIVATE_KEY) {
      res.json({
        installed: false,
        message: "GitHub App configuration missing. Installation check unavailable.",
        installUrl: null,
      });
      return;
    }

    const installationId = await getInstallationId(username);
    const installUrl = GITHUB_CLIENT_ID
      ? `https://github.com/apps/${GITHUB_CLIENT_ID.split(".")[0]}/installations/new`
      : null;

    res.json({
      installed: installationId !== null,
      installationId: installationId,
      installUrl: installUrl,
      message: installationId
        ? "GitHub App is installed and ready to create issues."
        : "GitHub App is not installed. Please install it to create issues.",
    });
  } catch (error: unknown) {
    console.error("Error checking installation status:", error);
    if (axios.isAxiosError(error)) {
      res.status(error.response?.status || 500).json({
        error: error.response?.data?.message || "Failed to check installation status",
      });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const token = await getGitHubToken(req);
    if (!token) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const isUserAccessToken = token.startsWith("ghu_");
    const authHeader = isUserAccessToken ? `Bearer ${token}` : `token ${token}`;

    const response = await axios.get("https://api.github.com/user/repos", {
      headers: {
        Authorization: authHeader,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      params: {
        sort: "updated",
        per_page: 100,
      },
    });

    res.json({ repositories: response.data });
  } catch (error: unknown) {
    console.error("Error fetching repositories:", error);
    if (axios.isAxiosError(error)) {
      res.status(error.response?.status || 500).json({
        error: error.response?.data?.message || "Failed to fetch repositories",
      });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

router.get("/:owner/:repo/contents", async (req: Request, res: Response) => {
  try {
    const token = await getGitHubToken(req);
    if (!token) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const { owner, repo } = req.params;
    const { path = "" } = req.query;

    const url = path
      ? `https://api.github.com/repos/${owner}/${repo}/contents/${path}`
      : `https://api.github.com/repos/${owner}/${repo}/contents`;

    const isUserAccessToken = token.startsWith("ghu_");
    const authHeader = isUserAccessToken ? `Bearer ${token}` : `token ${token}`;

    const response = await axios.get(url, {
      headers: {
        Authorization: authHeader,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    const items = Array.isArray(response.data) ? response.data : [response.data];
    
    const sortedItems = [...items].sort((a: any, b: any) => {
      if (a.type === "dir" && b.type === "file") return -1;
      if (a.type === "file" && b.type === "dir") return 1;
      return a.name.localeCompare(b.name);
    });

    res.json({ items: sortedItems });
  } catch (error: unknown) {
    console.error("Error fetching repository contents:", error);
    if (axios.isAxiosError(error)) {
      res.status(error.response?.status || 500).json({
        error: error.response?.data?.message || "Failed to fetch repository contents",
      });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

router.get("/:owner/:repo/contents/:path", async (req: Request, res: Response) => {
  try {
    const token = await getGitHubToken(req);
    if (!token) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const { owner, repo, path } = req.params;
    const filePath = decodeURIComponent(path);

    const isUserAccessToken = token.startsWith("ghu_");
    const authHeader = isUserAccessToken ? `Bearer ${token}` : `token ${token}`;

    const response = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      {
        headers: {
          Authorization: authHeader,
          Accept: "application/vnd.github.raw+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );

    res.json({
      path: filePath,
      content: response.data,
      encoding: "utf-8",
    });
  } catch (error: unknown) {
    console.error("Error fetching file content:", error);
    if (axios.isAxiosError(error)) {
      res.status(error.response?.status || 500).json({
        error: error.response?.data?.message || "Failed to fetch file content",
      });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});


router.get("/:owner/:repo/issues", async (req: Request, res: Response) => {
  try {
    const { owner, repo } = req.params;
    const token = await getGitHubToken(req);
    
    if (!token) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const isUserAccessToken = token.startsWith("ghu_");
    const authHeader = isUserAccessToken ? `Bearer ${token}` : `token ${token}`;

    let authHeaderForRequest: string;

    if (GITHUB_APP_ID && GITHUB_PRIVATE_KEY) {
      const installationId = await getInstallationId(owner, repo);
      if (installationId) {
        const installationToken = await generateInstallationToken(installationId);
        if (installationToken) {
          authHeaderForRequest = `Bearer ${installationToken}`;
        } else {
          authHeaderForRequest = authHeader;
        }
      } else {
        authHeaderForRequest = authHeader;
      }
    } else {
      authHeaderForRequest = authHeader;
    }

    const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}/issues`, {
      headers: {
        Authorization: authHeaderForRequest,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      params: {
        state: "open",
        per_page: 100,
        sort: "updated",
        direction: "desc",
      },
    });

    const issues = response.data.filter((issue: any) => !issue.pull_request);

    res.json({ issues });
  } catch (error: unknown) {
    console.error("Error fetching issues:", error);
    if (axios.isAxiosError(error)) {
      res.status(error.response?.status || 500).json({
        error: error.response?.data?.message || "Failed to fetch issues",
      });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

router.post("/:owner/:repo/issues", async (req: Request, res: Response) => {
  try {
    const { owner, repo } = req.params;
    const { title, body, labels } = req.body;

    if (!title || !body) {
      res.status(400).json({ error: "Title and body are required" });
      return;
    }

    let authHeader: string;
    let tokenType: string;

    if (GITHUB_APP_ID && GITHUB_PRIVATE_KEY) {
      const installationId = await getInstallationId(owner, repo);
      
      if (installationId) {
        const installationToken = await generateInstallationToken(installationId);
        if (installationToken) {
          authHeader = `Bearer ${installationToken}`;
          tokenType = "GitHub App installation access token (ghs_)";
          console.log("=== CREATING GITHUB ISSUE ===");
          console.log("Token type:", tokenType);
          console.log("Using installation token for:", `${owner}/${repo}`);
          console.log("=============================");
        } else {
          const userToken = await getGitHubToken(req);
          if (!userToken) {
            res.status(401).json({ error: "Not authenticated and failed to generate installation token" });
            return;
          }
          const isUserAccessToken = userToken.startsWith("ghu_");
          authHeader = isUserAccessToken ? `Bearer ${userToken}` : `token ${userToken}`;
          tokenType = isUserAccessToken ? "GitHub App user access token (ghu_)" : "OAuth token";
          console.log("=== CREATING GITHUB ISSUE ===");
          console.log("Token type:", tokenType, "(fallback - installation token generation failed)");
          console.log("Repository:", `${owner}/${repo}`);
          console.log("=============================");
        }
      } else {
        const userToken = await getGitHubToken(req);
        if (!userToken) {
          res.status(401).json({ error: "Not authenticated and app not installed" });
          return;
        }
        const isUserAccessToken = userToken.startsWith("ghu_");
        authHeader = isUserAccessToken ? `Bearer ${userToken}` : `token ${userToken}`;
        tokenType = isUserAccessToken ? "GitHub App user access token (ghu_)" : "OAuth token";
        console.log("=== CREATING GITHUB ISSUE ===");
        console.log("Token type:", tokenType, "(fallback - no installation found)");
        console.log("Repository:", `${owner}/${repo}`);
        console.log("=============================");
      }
    } else {
      const userToken = await getGitHubToken(req);
      if (!userToken) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }
      const isUserAccessToken = userToken.startsWith("ghu_");
      authHeader = isUserAccessToken ? `Bearer ${userToken}` : `token ${userToken}`;
      tokenType = isUserAccessToken ? "GitHub App user access token (ghu_)" : "OAuth token";
      console.log("=== CREATING GITHUB ISSUE ===");
      console.log("Token type:", tokenType);
      console.log("Repository:", `${owner}/${repo}`);
      console.log("=============================");
    }

    const response = await axios.post(
      `https://api.github.com/repos/${owner}/${repo}/issues`,
      {
        title,
        body,
        labels: labels || [],
      },
      {
        headers: {
          Authorization: authHeader,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );

    res.json({ issue: response.data });
  } catch (error: unknown) {
    console.error("Error creating GitHub issue:", error);
    if (axios.isAxiosError(error)) {
      const status = error.response?.status || 500;
      const message = error.response?.data?.message || "Failed to create issue";
      
      if (status === 403 && message.includes("Resource not accessible by integration")) {
        res.status(403).json({
          error: "GitHub App is not installed on this account. Please install the GitHub App first.",
          details: "The app needs to be installed on your account to create issues. Visit your GitHub App settings to install it.",
        });
      } else {
        res.status(status).json({ error: message });
      }
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

router.get("/:owner/:repo/automated-issues", async (req: Request, res: Response) => {
  try {
    const { owner, repo } = req.params;
    const userId = req.session?.userId;
    
    if (!userId) {
      const authToken = req.cookies?.authToken;
      if (authToken) {
        try {
          const decoded = jwt.verify(authToken, JWT_SECRET) as { userId: string };
          const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: { id: true },
          });
          if (user) {
            const issues = await prisma.automatedIssue.findMany({
              where: {
                repositoryOwner: owner,
                repositoryName: repo,
                userId: user.id,
              },
              select: {
                issueNumber: true,
                autoAssign: true,
                assignedTo: true,
              },
            });
            res.json({ issues });
            return;
          }
        } catch (err) {
          console.error("JWT verification failed:", err);
        }
      }
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const issues = await prisma.automatedIssue.findMany({
      where: {
        repositoryOwner: owner,
        repositoryName: repo,
        userId: userId,
      },
      select: {
        issueNumber: true,
        autoAssign: true,
        assignedTo: true,
      },
    });

    res.json({ issues });
  } catch (error: unknown) {
    console.error("Error fetching automated issues:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:owner/:repo/automated-issues", async (req: Request, res: Response) => {
  try {
    const { owner, repo } = req.params;
    const userId = req.session?.userId;
    
    if (!userId) {
      const authToken = req.cookies?.authToken;
      if (authToken) {
        try {
          const decoded = jwt.verify(authToken, JWT_SECRET) as { userId: string };
          const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: { id: true },
          });
          if (user) {
            const {
              issueNumber,
              issueId,
              title,
              body,
              state,
              htmlUrl,
              assignees,
              labels,
              user: issueUser,
              comments,
              createdAt,
              updatedAt,
            } = req.body;

            const automatedIssue = await prisma.automatedIssue.upsert({
              where: {
                repositoryOwner_repositoryName_issueNumber: {
                  repositoryOwner: owner,
                  repositoryName: repo,
                  issueNumber: issueNumber,
                },
              },
              update: {
                title,
                body,
                state,
                htmlUrl,
                assignees,
                labels,
                user: issueUser,
                comments,
                updatedAt,
                autoAssign: true,
              },
              create: {
                repositoryOwner: owner,
                repositoryName: repo,
                issueNumber,
                issueId: typeof issueId === 'bigint' ? issueId : BigInt(issueId),
                title,
                body,
                state,
                htmlUrl,
                assignees,
                labels,
                user: issueUser,
                comments,
                createdAt,
                updatedAt,
                autoAssign: true,
                userId: user.id,
              },
            });

            res.json({ 
              issue: {
                ...automatedIssue,
                issueId: automatedIssue.issueId.toString(),
              }
            });
            return;
          }
        } catch (err) {
          console.error("JWT verification failed:", err);
        }
      }
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const {
      issueNumber,
      issueId,
      title,
      body,
      state,
      htmlUrl,
      assignees,
      labels,
      user: issueUser,
      comments,
      createdAt,
      updatedAt,
    } = req.body;

    const automatedIssue = await prisma.automatedIssue.upsert({
      where: {
        repositoryOwner_repositoryName_issueNumber: {
          repositoryOwner: owner,
          repositoryName: repo,
          issueNumber: issueNumber,
        },
      },
      update: {
        title,
        body,
        state,
        htmlUrl,
        assignees,
        labels,
        user: issueUser,
        comments,
        updatedAt,
        autoAssign: true,
      },
      create: {
        repositoryOwner: owner,
        repositoryName: repo,
        issueNumber,
        issueId: typeof issueId === 'bigint' ? issueId : BigInt(issueId),
        title,
        body,
        state,
        htmlUrl,
        assignees,
        labels,
        user: issueUser,
        comments,
        createdAt,
        updatedAt,
        autoAssign: true,
        userId: userId,
      },
    });

    res.json({ 
      issue: {
        ...automatedIssue,
        issueId: automatedIssue.issueId.toString(),
      }
    });
  } catch (error: unknown) {
    console.error("Error saving automated issue:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:owner/:repo/pull-requests", async (req: Request, res: Response) => {
  try {
    const { owner, repo } = req.params;
    const token = await getGitHubToken(req);
    
    if (!token) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const isUserAccessToken = token.startsWith("ghu_");
    const authHeader = isUserAccessToken ? `Bearer ${token}` : `token ${token}`;

    let authHeaderForRequest: string;

    if (GITHUB_APP_ID && GITHUB_PRIVATE_KEY) {
      const installationId = await getInstallationId(owner, repo);
      if (installationId) {
        const installationToken = await generateInstallationToken(installationId);
        if (installationToken) {
          authHeaderForRequest = `Bearer ${installationToken}`;
        } else {
          authHeaderForRequest = authHeader;
        }
      } else {
        authHeaderForRequest = authHeader;
      }
    } else {
      authHeaderForRequest = authHeader;
    }

    const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
      headers: {
        Authorization: authHeaderForRequest,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      params: {
        state: "open",
        per_page: 100,
        sort: "updated",
        direction: "desc",
      },
    });

    res.json({ pullRequests: response.data });
  } catch (error: unknown) {
    console.error("Error fetching pull requests:", error);
    if (axios.isAxiosError(error)) {
      res.status(error.response?.status || 500).json({
        error: error.response?.data?.message || "Failed to fetch pull requests",
      });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

router.get("/:owner/:repo/automated-prs", async (req: Request, res: Response) => {
  try {
    const { owner, repo } = req.params;
    const userId = req.session?.userId;
    
    if (!userId) {
      const authToken = req.cookies?.authToken;
      if (authToken) {
        try {
          const decoded = jwt.verify(authToken, JWT_SECRET) as { userId: string };
          const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: { id: true },
          });
          if (user) {
            const prs = await prisma.automatedPR.findMany({
              where: {
                repositoryOwner: owner,
                repositoryName: repo,
                userId: user.id,
              },
              select: {
                prNumber: true,
                aiAnalysis: true,
                autoMerge: true,
                merged: true,
              },
            });
            res.json({ pullRequests: prs });
            return;
          }
        } catch (err) {
          console.error("JWT verification failed:", err);
        }
      }
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const prs = await prisma.automatedPR.findMany({
      where: {
        repositoryOwner: owner,
        repositoryName: repo,
        userId: userId,
      },
      select: {
        prNumber: true,
        aiAnalysis: true,
        autoMerge: true,
        merged: true,
      },
    });

    res.json({ pullRequests: prs });
  } catch (error: unknown) {
    console.error("Error fetching automated PRs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:owner/:repo/automated-prs", async (req: Request, res: Response) => {
  try {
    const { owner, repo } = req.params;
    const userId = req.session?.userId;
    
    if (!userId) {
      const authToken = req.cookies?.authToken;
      if (authToken) {
        try {
          const decoded = jwt.verify(authToken, JWT_SECRET) as { userId: string };
          const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: { id: true },
          });
          if (user) {
            const {
              prNumber,
              prId,
              title,
              body,
              state,
              htmlUrl,
              head,
              base,
              user: prUser,
              labels,
              comments,
              reviewComments,
              commits,
              additions,
              deletions,
              changedFiles,
              createdAt,
              updatedAt,
              mergedAt,
              aiAnalysis,
              autoMerge,
            } = req.body;

            const automatedPR = await prisma.automatedPR.upsert({
              where: {
                repositoryOwner_repositoryName_prNumber: {
                  repositoryOwner: owner,
                  repositoryName: repo,
                  prNumber: prNumber,
                },
              },
              update: {
                title,
                body,
                state,
                htmlUrl,
                head,
                base,
                user: prUser,
                labels,
                comments,
                reviewComments,
                commits,
                additions,
                deletions,
                changedFiles,
                updatedAt,
                mergedAt,
                aiAnalysis: aiAnalysis || false,
                autoMerge: autoMerge || false,
                merged: mergedAt ? true : false,
              },
              create: {
                repositoryOwner: owner,
                repositoryName: repo,
                prNumber,
                prId,
                title,
                body,
                state,
                htmlUrl,
                head,
                base,
                user: prUser,
                labels,
                comments,
                reviewComments,
                commits,
                additions,
                deletions,
                changedFiles,
                createdAt,
                updatedAt,
                mergedAt,
                aiAnalysis: aiAnalysis || false,
                autoMerge: autoMerge || false,
                merged: mergedAt ? true : false,
                userId: user.id,
              },
            });

            res.json({ pullRequest: automatedPR });
            return;
          }
        } catch (err) {
          console.error("JWT verification failed:", err);
        }
      }
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const {
      prNumber,
      prId,
      title,
      body,
      state,
      htmlUrl,
      head,
      base,
      user: prUser,
      labels,
      comments,
      reviewComments,
      commits,
      additions,
      deletions,
      changedFiles,
      createdAt,
      updatedAt,
      mergedAt,
      aiAnalysis,
      autoMerge,
    } = req.body;

    const automatedPR = await prisma.automatedPR.upsert({
      where: {
        repositoryOwner_repositoryName_prNumber: {
          repositoryOwner: owner,
          repositoryName: repo,
          prNumber: prNumber,
        },
      },
      update: {
        title,
        body,
        state,
        htmlUrl,
        head,
        base,
        user: prUser,
        labels,
        comments,
        reviewComments,
        commits,
        additions,
        deletions,
        changedFiles,
        updatedAt,
        mergedAt,
        aiAnalysis: aiAnalysis || false,
        autoMerge: autoMerge || false,
        merged: mergedAt ? true : false,
      },
      create: {
        repositoryOwner: owner,
        repositoryName: repo,
        prNumber,
        prId,
        title,
        body,
        state,
        htmlUrl,
        head,
        base,
        user: prUser,
        labels,
        comments,
        reviewComments,
        commits,
        additions,
        deletions,
        changedFiles,
        createdAt,
        updatedAt,
        mergedAt,
        aiAnalysis: aiAnalysis || false,
        autoMerge: autoMerge || false,
        merged: mergedAt ? true : false,
        userId: userId,
      },
    });

    res.json({ pullRequest: automatedPR });
  } catch (error: unknown) {
    console.error("Error saving automated PR:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

async function fetchAllRepoFiles(owner: string, repo: string, token: string, basePath: string = ""): Promise<Array<{ path: string; content: string }>> {
  const isUserAccessToken = token.startsWith("ghu_");
  const authHeader = isUserAccessToken ? `Bearer ${token}` : `token ${token}`;
  
  const files: Array<{ path: string; content: string }> = [];
  const maxFileSize = 1 * 1024 * 1024;
  const maxFiles = 80;
  const maxDepth = 2;
  
  const excludedDirs = [".git", "node_modules", "dist", "build", ".next", ".venv", "__pycache__", ".pytest_cache", "coverage", ".nyc_output", "test", "tests", "__tests__", "spec", "specs", "docs", "documentation"];
  const excludedExtensions = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".woff", ".woff2", ".ttf", ".eot", ".mp4", ".mp3", ".zip", ".tar", ".gz"];
  
  const priorityDirs = ["src", "lib", "app", "components", "pages", "routes", "api", "server", "client"];
  const priorityExtensions = [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".kt", ".swift"];
  
  let mainFolder: string | null = null;
  let scannedRoot = false;

  async function fetchDirectory(dirPath: string, depth: number = 0): Promise<void> {
    if (files.length >= maxFiles) {
      return;
    }
    
    if (depth > maxDepth) {
      return;
    }
    try {
      const url = dirPath
        ? `https://api.github.com/repos/${owner}/${repo}/contents/${dirPath}`
        : `https://api.github.com/repos/${owner}/${repo}/contents`;

      const response = await axios.get(url, {
        headers: {
          Authorization: authHeader,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      const items = Array.isArray(response.data) ? response.data : [response.data];
      
      if (!scannedRoot && depth === 0) {
        scannedRoot = true;
        const rootDirs = items.filter((item: any) => item.type === "dir" && priorityDirs.includes(item.name));
        if (rootDirs.length > 0) {
          mainFolder = rootDirs[0].name;
          console.log(`Monorepo detected, focusing on main folder: ${mainFolder}`);
        }
      }

      const sortedItems = [...items].sort((a: any, b: any) => {
        if (a.type === "file" && b.type === "dir") {
          if (depth === 0 && mainFolder && (a.path?.startsWith(mainFolder) || b.name === mainFolder)) {
            return b.name === mainFolder ? 1 : -1;
          }
          return -1;
        }
        if (a.type === "dir" && b.type === "file") {
          if (depth === 0 && mainFolder && (a.name === mainFolder || b.path?.startsWith(mainFolder))) {
            return a.name === mainFolder ? -1 : 1;
          }
          return 1;
        }
        
        if (a.type === "file" && b.type === "file") {
          const aExt = path.extname(a.name || a.path || "").toLowerCase();
          const bExt = path.extname(b.name || b.path || "").toLowerCase();
          const aPriority = priorityExtensions.includes(aExt);
          const bPriority = priorityExtensions.includes(bExt);
          if (aPriority && !bPriority) return -1;
          if (!aPriority && bPriority) return 1;
        }
        
        return (a.name || a.path || "").localeCompare(b.name || b.path || "");
      });

      for (const item of sortedItems) {
        if (files.length >= maxFiles) {
          break;
        }
        
        if (item.type === "file") {
          const fileName = path.basename(item.path || item.name);
          const fileExt = path.extname(fileName).toLowerCase();
          const dirName = path.dirname(item.path || item.name).split("/")[0];
          const fullPath = item.path || item.name;

          if (mainFolder && depth === 0 && !fullPath.startsWith(mainFolder)) {
            continue;
          }

          if (excludedDirs.includes(dirName) || excludedExtensions.includes(fileExt)) {
            continue;
          }

          if (item.size > maxFileSize) {
            continue;
          }

          try {
            let fileContent: string;
            
            if (item.download_url) {
              const fileResponse = await axios.get(item.download_url, {
                headers: {
                  Authorization: authHeader,
                  Accept: "application/vnd.github.raw",
                },
                responseType: "text",
                timeout: 10000,
              });
              fileContent = fileResponse.data;
            } else if (item.content && item.encoding === "base64") {
              fileContent = Buffer.from(item.content, "base64").toString("utf8");
            } else {
              const fileResponse = await axios.get(item.url, {
                headers: {
                  Authorization: authHeader,
                  Accept: "application/vnd.github+json",
                },
                timeout: 10000,
              });
              
              if (fileResponse.data.content && fileResponse.data.encoding === "base64") {
                fileContent = Buffer.from(fileResponse.data.content, "base64").toString("utf8");
              } else {
                fileContent = fileResponse.data.content || "";
              }
            }

            files.push({
              path: fullPath,
              content: fileContent,
            });
          } catch (fileError) {
            console.error(`Error fetching file ${item.path}:`, fileError);
          }
        } else if (item.type === "dir") {
          const dirName = path.basename(item.path || item.name);
          
          if (mainFolder && depth === 0 && dirName !== mainFolder) {
            continue;
          }
          
          if (!excludedDirs.includes(dirName)) {
            await fetchDirectory(item.path || item.name, depth + 1);
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        }
      }
    } catch (error) {
      console.error(`Error fetching directory ${dirPath}:`, error);
    }
  }

  await fetchDirectory(basePath, 0);
  console.log(`Fetched ${files.length} files (max: ${maxFiles}, depth: ${maxDepth}, main folder: ${mainFolder || "root"})`);
  return files;
}

router.post("/:owner/:repo/analyze-cline", async (req: Request, res: Response) => {
  try {
    const owner = req.params.owner;
    const repo = req.params.repo;
    const { files, userPrompt, scanEntireRepo } = req.body;

    if (!OPENAI_API_KEY) {
      res.status(500).json({ error: "OPENAI_API_KEY not configured" });
      return;
    }

    const token = await getGitHubToken(req);
    if (!token) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    let filesToAnalyze: Array<{ path: string; content: string }> = [];

    if (scanEntireRepo) {
      console.log(`Cline full repository scan requested for ${owner}/${repo}`);
      filesToAnalyze = await fetchAllRepoFiles(owner, repo, token);
      console.log(`Fetched ${filesToAnalyze.length} files from repository`);
    } else {
      if (!files || !Array.isArray(files) || files.length === 0) {
        res.status(400).json({ error: "No files provided for analysis" });
        return;
      }
      filesToAnalyze = files;
      console.log(`Cline analysis requested for ${owner}/${repo}, ${files.length} file(s)`);
    }

    if (filesToAnalyze.length === 0) {
      res.status(400).json({ error: "No files found to analyze" });
      return;
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cline-analysis-"));
    
    try {
      for (const file of filesToAnalyze) {
        const filePath = path.join(tempDir, file.path);
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, file.content, "utf8");
      }

      const fileCount = filesToAnalyze.length;
      const filePaths = filesToAnalyze.slice(0, 10).map((f: { path: string }) => f.path).join(", ");
      const moreFiles = fileCount > 10 ? ` and ${fileCount - 10} more files` : "";
      
      const prompt = userPrompt
        ? `Analyze this entire codebase (${fileCount} files: ${filePaths}${moreFiles}). ${userPrompt}. Perform a comprehensive code review and identify bugs, security vulnerabilities, code quality issues, performance problems, and architectural concerns. For each issue found, provide: 1) A clear title, 2) File path and line numbers if possible, 3) Detailed description, 4) Priority level (HIGH/MEDIUM/LOW), 5) Type (bugs, security, performance, architecture, etc.). Format the output clearly with file paths.`
        : `Analyze this entire codebase (${fileCount} files: ${filePaths}${moreFiles}). Perform a comprehensive code review and identify bugs, security vulnerabilities, code quality issues, performance problems, and architectural concerns. For each issue found, provide: 1) A clear title, 2) File path and line numbers if possible, 3) Detailed description, 4) Priority level (HIGH/MEDIUM/LOW), 5) Type (bugs, security, performance, architecture, etc.). Format the output clearly with file paths.`;

      console.log("Executing Cline analysis...");
      const { stdout, stderr } = await executeCline(prompt, tempDir, 600000);

      const analysisOutput = stdout || stderr || "";
      
      if (!analysisOutput || analysisOutput.trim().length === 0) {
        throw new Error("Cline analysis returned empty response - Cline may not have executed properly");
      }

      if (stderr && stderr.includes("npm error") && !stdout) {
        throw new Error(`Cline installation failed: ${stderr.substring(0, 300)}. This is likely a disk space or npm configuration issue in the serverless environment.`);
      }

      try {
        const analysisResult = parseClineIssuesOutput(analysisOutput, filesToAnalyze);
        
        if (analysisResult.summary.total_issues === 0 && analysisOutput.length > 100) {
          console.warn("Cline returned output but parsed 0 issues - this may indicate a parsing issue or Cline didn't find issues");
        }
        
        res.json(analysisResult);
      } catch (parseError) {
        if (parseError instanceof Error && parseError.message.includes("Cline execution failed")) {
          throw parseError;
        }
        throw new Error(`Failed to parse Cline output: ${parseError instanceof Error ? parseError.message : "Unknown error"}. Raw output: ${analysisOutput.substring(0, 500)}`);
      }
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error("Error cleaning up temp directory:", cleanupError);
      }
    }
  } catch (error: unknown) {
    console.error("Error in Cline analysis:", error);
    if (error instanceof Error) {
      res.status(500).json({ error: `Cline analysis failed: ${error.message}` });
    } else {
      res.status(500).json({ error: "Internal server error during Cline analysis" });
    }
  }
});

router.post("/:owner/:repo/pull-requests/:prNumber/analyze", async (req: Request, res: Response) => {
  try {
    const { owner, repo, prNumber } = req.params;
    const token = await getGitHubToken(req);
    
    if (!token) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    if (!OPENAI_API_KEY) {
      res.status(500).json({ error: "OPENAI_API_KEY not configured" });
      return;
    }

    const isUserAccessToken = token.startsWith("ghu_");
    const authHeader = isUserAccessToken ? `Bearer ${token}` : `token ${token}`;

    let authHeaderForRequest: string;

    if (GITHUB_APP_ID && GITHUB_PRIVATE_KEY) {
      const installationId = await getInstallationId(owner, repo);
      if (installationId) {
        const installationToken = await generateInstallationToken(installationId);
        if (installationToken) {
          authHeaderForRequest = `Bearer ${installationToken}`;
        } else {
          authHeaderForRequest = authHeader;
        }
      } else {
        authHeaderForRequest = authHeader;
      }
    } else {
      authHeaderForRequest = authHeader;
    }

    const [prResponse, diffResponse, commentsResponse, reviewsResponse, commitsResponse] = await Promise.all([
      axios.get(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`, {
        headers: {
          Authorization: authHeaderForRequest,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }),
      axios.get(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`, {
        headers: {
          Authorization: authHeaderForRequest,
          Accept: "application/vnd.github.diff",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }),
      axios.get(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/comments`, {
        headers: {
          Authorization: authHeaderForRequest,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }),
      axios.get(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/reviews`, {
        headers: {
          Authorization: authHeaderForRequest,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }),
      axios.get(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/commits`, {
        headers: {
          Authorization: authHeaderForRequest,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }),
    ]);

    const pr = prResponse.data;
    const diff = diffResponse.data;
    const comments = commentsResponse.data;
    const reviews = reviewsResponse.data;
    const commits = commitsResponse.data;

    const [checksResponse, reviewCommentsResponse] = await Promise.all([
      axios.get(`https://api.github.com/repos/${owner}/${repo}/commits/${pr.head.sha}/check-runs`, {
        headers: {
          Authorization: authHeaderForRequest,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }).catch(() => ({ data: { check_runs: [] } })),
      axios.get(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/comments`, {
        headers: {
          Authorization: authHeaderForRequest,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }).catch(() => ({ data: [] })),
    ]);

    const checks = checksResponse.data.check_runs || [];
    const reviewComments = reviewCommentsResponse.data || [];

    const labels = pr.labels?.map((l: any) => l.name).join(", ") || "None";
    const assignees = pr.assignees?.map((a: any) => a.login).join(", ") || "None";
    const requestedReviewers = pr.requested_reviewers?.map((r: any) => r.login).join(", ") || "None";
    const commitMessages = commits?.slice(0, 10).map((c: any) => `- ${c.commit.message.split("\n")[0]}`).join("\n") || "No commits";
    const failedChecks = checks.filter((c: any) => c.conclusion === "failure" || c.conclusion === "cancelled");
    const passedChecks = checks.filter((c: any) => c.conclusion === "success");
    const pendingChecks = checks.filter((c: any) => !c.conclusion || c.status === "in_progress" || c.status === "queued");
    const approvedReviews = reviews.filter((r: any) => r.state === "APPROVED");
    const changesRequested = reviews.filter((r: any) => r.state === "CHANGES_REQUESTED");
    const mergeableStatus = pr.mergeable === true ? "Yes" : pr.mergeable === false ? "No (has conflicts)" : "Unknown";
    const isDraft = pr.draft === true;

    const analysisPrompt = `Analyze this pull request comprehensively and provide a merge readiness score (0-100).

=== PULL REQUEST METADATA ===
Title: ${pr.title}
Description: ${pr.body || "No description provided"}
State: ${pr.state}${isDraft ? " (DRAFT)" : ""}
Mergeable: ${mergeableStatus}
Labels: ${labels}
Assignees: ${assignees}
Requested Reviewers: ${requestedReviewers}
Author: ${pr.user?.login || "Unknown"}

=== CODE CHANGES ===
Files Changed: ${pr.changed_files}
Additions: +${pr.additions} lines
Deletions: -${pr.deletions} lines
Commits: ${pr.commits} total

Commit Messages (first 10):
${commitMessages}

Code Diff (first 4000 chars):
${typeof diff === "string" ? diff.substring(0, 4000) : "No diff available"}
${typeof diff === "string" && diff.length > 4000 ? "\n... (diff truncated, showing first 4000 chars)" : ""}

=== REVIEWS & FEEDBACK ===
Total Reviews: ${reviews.length}
- Approved: ${approvedReviews.length}
- Changes Requested: ${changesRequested.length}
- Commented: ${reviews.filter((r: any) => r.state === "COMMENTED").length}

Review Details:
${reviews.length > 0 ? reviews.map((r: any) => `- ${r.state} by ${r.user?.login || "Unknown"}: ${r.body ? r.body.substring(0, 200) : "No comment"}`).join("\n") : "No reviews yet"}

Review Comments: ${reviewComments.length} total
${reviewComments.slice(0, 5).map((c: any) => `- ${c.user?.login || "Unknown"}: ${c.body?.substring(0, 150) || ""}`).join("\n")}

General Comments: ${comments.length} total
${comments.slice(0, 5).map((c: any) => `- ${c.user?.login || "Unknown"}: ${c.body?.substring(0, 150) || ""}`).join("\n")}

=== STATUS CHECKS & CI/CD ===
Total Checks: ${checks.length}
- Passed: ${passedChecks.length}
- Failed: ${failedChecks.length}
- Pending: ${pendingChecks.length}

Check Details:
${checks.length > 0 ? checks.map((c: any) => `- ${c.name}: ${c.status} → ${c.conclusion || "pending"}`).join("\n") : "No status checks"}

${failedChecks.length > 0 ? `\n⚠️ FAILED CHECKS:\n${failedChecks.map((c: any) => `- ${c.name}: ${c.output?.title || "Check failed"}`).join("\n")}` : ""}

=== ANALYSIS REQUIREMENTS ===
Consider ALL of the following factors when scoring:
1. Code Quality: Is the code well-written, follows best practices, and maintainable?
2. Test Coverage: Are there tests? Do they pass?
3. Security: Any security vulnerabilities or concerns?
4. Performance: Any performance issues or optimizations needed?
5. Documentation: Is the PR description clear? Are code changes documented?
6. Reviews: Are there approvals? Any requested changes?
7. CI/CD Status: Do all checks pass?
8. Merge Conflicts: Is the PR mergeable?
9. Commit Quality: Are commit messages clear and meaningful?
10. Labels & Context: Do labels indicate priority, breaking changes, etc.?
11. Draft Status: Is this a draft PR (should not be merged yet)?
12. Size: Is the PR too large? (${pr.additions + pr.deletions} lines changed)

Provide:
1. A score from 0-100 indicating merge readiness (consider ALL factors above)
2. Detailed reasoning for the score (mention specific factors that influenced the score)
3. Actionable recommendations for improvement (if score < 70, be specific about what needs to be fixed)

Format your response clearly with the score prominently displayed.`;

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cline-pr-analysis-"));
    
    try {
      console.log(`Executing Cline PR analysis for PR #${prNumber}...`);
      const { stdout, stderr } = await executeCline(analysisPrompt, tempDir, 300000);

      const analysisOutput = stdout || stderr || "";
      
      if (!analysisOutput || analysisOutput.trim().length === 0) {
        throw new Error("Cline PR analysis returned empty response - Cline may not have executed properly");
      }

      if (stderr && stderr.includes("npm error") && !stdout) {
        throw new Error(`Cline installation failed: ${stderr.substring(0, 300)}. This is likely a disk space or npm configuration issue in the serverless environment.`);
      }

      let scoreResult;
      try {
        scoreResult = parseClinePRScore(analysisOutput);
      } catch (parseError) {
        if (parseError instanceof Error && parseError.message.includes("Cline execution failed")) {
          throw parseError;
        }
        throw new Error(`Failed to parse Cline PR analysis: ${parseError instanceof Error ? parseError.message : "Unknown error"}. Raw output: ${analysisOutput.substring(0, 500)}`);
      }

      res.json({
        prNumber: parseInt(prNumber),
        score: scoreResult.score,
        reasoning: scoreResult.reasoning,
        recommendations: scoreResult.recommendations,
        analysis: analysisOutput.substring(0, 1000),
        metadata: {
          isDraft: isDraft,
          mergeable: pr.mergeable,
          labels: pr.labels?.map((l: any) => l.name) || [],
          assignees: pr.assignees?.map((a: any) => a.login) || [],
        },
        checks: {
          total: checks.length,
          passed: passedChecks.length,
          failed: failedChecks.length,
          pending: pendingChecks.length,
        },
        reviews: {
          total: reviews.length,
          approved: approvedReviews.length,
          changesRequested: changesRequested.length,
          commented: reviews.filter((r: any) => r.state === "COMMENTED").length,
        },
        commits: {
          total: pr.commits,
          messages: commits?.slice(0, 5).map((c: any) => c.commit.message.split("\n")[0]) || [],
        },
      });
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error("Error cleaning up temp directory:", cleanupError);
      }
    }
  } catch (error: unknown) {
    console.error("Error in Cline PR analysis:", error);
    if (axios.isAxiosError(error)) {
      res.status(error.response?.status || 500).json({
        error: error.response?.data?.message || "Failed to analyze PR",
      });
    } else if (error instanceof Error) {
      res.status(500).json({ error: `Cline PR analysis failed: ${error.message}` });
    } else {
      res.status(500).json({ error: "Internal server error during PR analysis" });
    }
  }
});

router.get("/:owner/:repo/check-coderabbit", async (req: Request, res: Response) => {
  try {
    const { owner, repo } = req.params;
    
    try {
      const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}/installation`, {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        params: {
          per_page: 100,
        },
      });
      
      const installations = Array.isArray(response.data) ? response.data : [response.data];
      const codeRabbitInstalled = installations.some((inst: any) => 
        inst.app_slug === "coderabbitai" || inst.account?.login === "coderabbitai"
      );
      
      res.json({ installed: codeRabbitInstalled });
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        res.json({ installed: false });
      } else {
        res.json({ installed: false });
      }
    }
  } catch (error: unknown) {
    console.error("Error checking CodeRabbit:", error);
    res.json({ installed: false });
  }
});

export default router;
