import express, { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import axios from "axios";
import jwt from "jsonwebtoken";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

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

async function executeAIAnalysis(prompt: string, timeout: number = 300000, useJsonMode: boolean = false): Promise<{ stdout: string; stderr: string }> {
  try {
    // Prioritize Vercel AI Gateway, fallback to OpenAI API
    const useVercelGateway = !!VERCEL_AI_GATEWAY_API_KEY;
    const apiKey = VERCEL_AI_GATEWAY_API_KEY || OPENAI_API_KEY;
    const baseURL = useVercelGateway
      ? "https://ai-gateway.vercel.sh/v1"
      : "https://api.openai.com/v1";
    const model = useVercelGateway
      ? "openai/gpt-4o-mini"
      : "gpt-4o-mini";

    if (!apiKey) {
      throw new Error("Either VERCEL_AI_GATEWAY_API_KEY or OPENAI_API_KEY must be configured");
    }

    console.log(`Using ${useVercelGateway ? "Vercel AI Gateway" : "OpenAI API"} for AI analysis`);

    try {
      const requestBody: any = {
        model: model,
        messages: [
          {
            role: "system",
            content: "You are an expert code security and quality analyzer. Focus on finding REAL, actionable issues in code. Be specific and reference actual code patterns.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.2,
        max_tokens: 16000,
      };

      // Only enable JSON mode for OpenAI API (Vercel Gateway doesn't support response_format)
      if (useJsonMode && !useVercelGateway) {
        requestBody.response_format = { type: "json_object" };
      }

      // Log prompt size for debugging
      const promptLength = prompt.length;
      console.log(`Prompt size: ${promptLength} characters, JSON mode: ${useJsonMode && !useVercelGateway}`);

      const response = await axios.post(
        `${baseURL}/chat/completions`,
        requestBody,
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
        const errorDetails = apiError.response?.data?.error || {};
        console.error(`AI API error details:`, JSON.stringify(errorDetails, null, 2));
        
        // If Vercel Gateway fails with Invalid input or similar errors, try OpenAI directly
        if (useVercelGateway && OPENAI_API_KEY && (
          errorMsg.includes("Invalid input") || 
          errorMsg.includes("credit card") || 
          errorMsg.includes("401") || 
          errorMsg.includes("403")
        )) {
          console.log(`Vercel AI Gateway failed (${errorMsg}), falling back to OpenAI API...`);
          try {
            const fallbackBody: any = {
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "system",
                  content: "You are an expert code security and quality analyzer. Focus on finding REAL, actionable issues in code. Be specific and reference actual code patterns.",
                },
                {
                  role: "user",
                  content: prompt,
                },
              ],
              temperature: 0.2,
              max_tokens: 16000,
            };
            
            if (useJsonMode) {
              fallbackBody.response_format = { type: "json_object" };
            }

            const fallbackResponse = await axios.post(
              "https://api.openai.com/v1/chat/completions",
              fallbackBody,
              {
                headers: {
                  "Authorization": `Bearer ${OPENAI_API_KEY}`,
                  "Content-Type": "application/json",
                },
                timeout: timeout,
              }
            );
            const content = fallbackResponse.data.choices[0]?.message?.content || "";
            return { stdout: content, stderr: "" };
          } catch (fallbackError) {
            console.error("OpenAI API fallback also failed:", fallbackError);
            throw new Error(`Both Vercel AI Gateway and OpenAI API failed. Gateway error: ${errorMsg}`);
          }
        }
        
        throw new Error(`AI API error: ${errorMsg}`);
      }
      throw apiError;
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Unknown error in AI analysis execution");
  }
}

function parseAIIssuesOutput(output: string, files: Array<{ path: string; content: string }>): {
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
    throw new Error("AI analysis returned empty output - analysis may have failed");
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
      throw new Error(`AI analysis execution failed: ${errorMatch[1].substring(0, 150)}`);
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
            body: `AI analysis for ${file.path}:\n\n${relevantOutput}`,
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

function parseAIPRScore(output: string): { score: number; reasoning: string; recommendations: string[]; analysis: string } {
  const lowerOutput = output.toLowerCase();
  
  if (!output || output.trim().length === 0) {
    throw new Error("AI analysis returned empty output");
  }

  if (lowerOutput.includes("npm error") || 
      lowerOutput.includes("enoent") || 
      lowerOutput.includes("errno") ||
      lowerOutput.includes("syscall") ||
      lowerOutput.includes("invalid response body") ||
      lowerOutput.includes("no such file or directory")) {
    throw new Error(`AI analysis execution failed with npm error: ${output.substring(0, 200)}`);
  }

  if (lowerOutput.includes("error") && (lowerOutput.includes("failed") || lowerOutput.includes("cannot"))) {
    const errorMatch = output.match(/error[:\s]+([^\n]+)/i);
    if (errorMatch) {
      throw new Error(`AI analysis execution failed: ${errorMatch[1]}`);
    }
  }

  let score = 50;
  const reasoning: string[] = [];
  const recommendations: string[] = [];
  let analysis = "";

  // Extract score from "## Merge Readiness Score: **85**" or "Merge Readiness Score: **85/100**" format
  // Try multiple patterns to find the score
  const scorePatterns = [
    /##\s+Merge\s+Readiness\s+Score[:\s]*\*\*(\d{1,3})(?:\s*\/\s*100)?\*\*/i,
    /merge\s+readiness\s+score[:\s]*\*\*(\d{1,3})(?:\s*\/\s*100)?\*\*/i,
    /merge\s+readiness\s+score[:\s]*(\d{1,3})(?:\s*\/\s*100)?/i,
    /(?:score|rating|readiness)[:\s]*\*\*(\d{1,3})(?:\s*\/\s*100)?\*\*/i,
    /(?:score|rating|readiness)[:\s]*(\d{1,3})(?:\s*\/\s*100)?/i,
  ];
  
  for (const pattern of scorePatterns) {
    const scoreMatch = output.match(pattern);
    if (scoreMatch && scoreMatch[1]) {
      const parsedScore = parseInt(scoreMatch[1], 10);
      if (!isNaN(parsedScore) && parsedScore >= 0 && parsedScore <= 100) {
        score = parsedScore;
        break; // Use first valid match
      }
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

  // Extract Analysis section - the analysis is usually the numbered list with scores
  // Look for patterns like "1. **Code Quality (15/20)**:"
  const analysisPatterns = [
    /####?\s*Detailed\s+Analysis[:\s]*\n([\s\S]*?)(?=\n####?\s*(?:Detailed|Recommendations|Reasoning)|$)/i,
    /##\s+Detailed\s+Analysis[:\s]*\n([\s\S]*?)(?=\n##|$)/i,
    /Detailed\s+Analysis[:\s]*\n([\s\S]*?)(?=\n(?:Detailed|Recommendations|Reasoning|##)|$)/i,
  ];
  
  for (const pattern of analysisPatterns) {
    const match = output.match(pattern);
    if (match && match[1] && match[1].trim().length > 20) {
      analysis = match[1].trim();
      break;
    }
  }
  
  // If no analysis section found, look for numbered list with scores (the actual format)
  // Pattern: "1. **Code Quality (15/20)**: ..."
  if (!analysis || analysis.length < 20) {
    // Find the start of numbered list with scores
    const numberedListStart = output.search(/\d+\.\s+\*\*.*?\(\d+\/\d+\).*?\*\*:/);
    if (numberedListStart !== -1) {
      // Extract from that point until recommendations or end
      const fromNumberedList = output.substring(numberedListStart);
      const endMatch = fromNumberedList.match(/([\s\S]*?)(?=\n(?:####?\s*Recommendations|##\s+Recommendations|$))/i);
      if (endMatch && endMatch[1].trim().length > 20) {
        analysis = endMatch[1].trim();
      } else {
        // Get all numbered items with scores
        const allNumberedItems = fromNumberedList.match(/\d+\.\s+\*\*.*?\(\d+\/\d+\).*?\*\*:[\s\S]*?(?=\n\d+\.\s+\*\*|$)/g);
        if (allNumberedItems && allNumberedItems.length > 0) {
          analysis = allNumberedItems.join("\n\n");
        }
      }
    }
  }
  
  // Final fallback: use the full output (excluding score header and reasoning)
  if (!analysis || analysis.length < 20) {
    analysis = output
      .replace(/##\s+Merge\s+Readiness\s+Score[:\s]*\*\*(\d{1,3})(?:\s*\/\s*100)?\*\*/gi, "")
      .replace(/###\s+Merge\s+Readiness\s+Score[:\s]*\*\*(\d{1,3})(?:\s*\/\s*100)?\*\*/gi, "")
      .replace(/Merge\s+Readiness\s+Score[:\s]*\*\*(\d{1,3})(?:\s*\/\s*100)?\*\*/gi, "")
      .replace(/####?\s*Detailed\s+Reasoning[:\s]*\n[\s\S]*?(?=\n####?\s*|$)/gi, "")
      .trim();
    if (analysis.length < 20) {
      analysis = output.substring(0, 2000);
    }
  }

  // Extract Reasoning section
  const reasoningMatch = output.match(/####?\s*Detailed\s+Reasoning[:\s]*\n([\s\S]*?)(?=\n####?\s*|$)/i);
  if (reasoningMatch && reasoningMatch[1].trim().length > 20) {
    reasoning.push(reasoningMatch[1].trim());
  } else {
    // Fallback: look for reasoning in other formats
    const fallbackReasoning = output.match(/(?:reasoning|analysis|assessment)[:\s]*([^\n]+(?:\n[^\n]+){0,5})/i);
    if (fallbackReasoning && fallbackReasoning[1].length > 20) {
      reasoning.push(fallbackReasoning[1].trim());
    }
  }

  if (reasoning.length === 0) {
    const firstParagraph = output.split("\n\n")[0] || output.split("\n").slice(0, 3).join(" ");
    if (firstParagraph.length > 20 && !firstParagraph.toLowerCase().includes("error")) {
      reasoning.push(firstParagraph.substring(0, 200));
    } else {
      reasoning.push("Code analysis completed");
    }
  }

  // Extract Recommendations section
  const recommendationsMatch = output.match(/####?\s*Recommendations[:\s]*\n([\s\S]*?)(?=\n####?\s*|$)/i);
  if (recommendationsMatch) {
    const recsText = recommendationsMatch[1];
    const recs = recsText.split(/\n[-*•]\s*/).filter(r => r.trim().length > 5 && !r.trim().toLowerCase().includes("for improvement:"));
    recommendations.push(...recs.map(r => r.trim().replace(/^[-*•]\s*/, "")).slice(0, 5));
  } else {
    // Fallback pattern
    const fallbackRecs = output.match(/(?:recommendations?|suggestions?|improvements?)[:\s]*([^\n]+(?:\n[^\n-]+){0,10})/i);
    if (fallbackRecs) {
      const recsText = fallbackRecs[1];
      const recs = recsText.split(/\n[-*•]\s*/).filter(r => r.trim().length > 5 && !r.trim().toLowerCase().includes("for improvement:"));
      recommendations.push(...recs.map(r => r.trim().replace(/^[-*•]\s*/, "")).slice(0, 5));
    }
  }

  if (recommendations.length === 0) {
    if (score < 50) {
      recommendations.push("Review code quality and fix critical issues before merging");
    } else if (score < 70) {
      recommendations.push("Address identified issues to improve merge readiness");
    }
  }

  // If no analysis extracted, use reasoning as fallback
  if (!analysis || analysis.length < 20) {
    analysis = reasoning.join(". ") || output.substring(0, 500);
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    reasoning: reasoning.join(". "),
    recommendations: recommendations.length > 0 ? recommendations : [],
    analysis,
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
            select: { id: true, githubToken: true },
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
                githubToken: user.githubToken,
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
                githubToken: user.githubToken,
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
        githubToken: user.githubToken,
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
        githubToken: user.githubToken,
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

// ====== KESTRA AUTOMATION ENDPOINTS ======

// Assign user to an issue (called by Kestra)
router.post("/:owner/:repo/issues/:number/assign", async (req: Request, res: Response) => {
  try {
    const { owner, repo, number } = req.params;
    const { assignee, githubToken } = req.body;

    if (!assignee) {
      res.status(400).json({ error: "Assignee username is required" });
      return;
    }

    if (!githubToken) {
      res.status(400).json({ error: "GitHub token is required" });
      return;
    }

    console.log(`[ASSIGN] Assigning issue #${number} to ${assignee} in ${owner}/${repo}`);

    // Call GitHub API to assign the issue
    const response = await axios.post(
      `https://api.github.com/repos/${owner}/${repo}/issues/${number}/assignees`,
      { assignees: [assignee] },
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );

    // Update automated issue record
    await prisma.automatedIssue.updateMany({
      where: {
        repositoryOwner: owner,
        repositoryName: repo,
        issueNumber: parseInt(number),
      },
      data: {
        assignedTo: assignee,
      },
    });

    console.log(`[ASSIGN] Successfully assigned issue #${number} to ${assignee}`);
    res.json({ 
      success: true, 
      message: `Issue assigned to ${assignee}`,
      assignees: response.data.assignees 
    });
  } catch (error: unknown) {
    console.error("[ASSIGN] Error assigning issue:", error);
    if (axios.isAxiosError(error)) {
      res.status(error.response?.status || 500).json({
        error: error.response?.data?.message || "Failed to assign issue",
      });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// Post a comment on an issue (called by Kestra)
router.post("/:owner/:repo/issues/:number/comment", async (req: Request, res: Response) => {
  try {
    const { owner, repo, number } = req.params;
    const { comment, githubToken } = req.body;

    if (!comment) {
      res.status(400).json({ error: "Comment text is required" });
      return;
    }

    if (!githubToken) {
      res.status(400).json({ error: "GitHub token is required" });
      return;
    }

    console.log(`[COMMENT] Posting comment on issue #${number} in ${owner}/${repo}`);

    // Call GitHub API to post comment
    const response = await axios.post(
      `https://api.github.com/repos/${owner}/${repo}/issues/${number}/comments`,
      { body: comment },
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );

    console.log(`[COMMENT] Successfully posted comment on issue #${number}`);
    res.json({ 
      success: true, 
      message: "Comment posted successfully",
      comment: response.data 
    });
  } catch (error: unknown) {
    console.error("[COMMENT] Error posting comment:", error);
    if (axios.isAxiosError(error)) {
      res.status(error.response?.status || 500).json({
        error: error.response?.data?.message || "Failed to post comment",
      });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
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

// Add missing analyze-cline endpoint that frontend is calling
router.post("/:owner/:repo/analyze-cline", async (req: Request, res: Response) => {
  // Forward to analyze-full-scan handler
  req.params.owner = req.params.owner;
  req.params.repo = req.params.repo;
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
    console.log(`Full repository scan requested for ${req.params.owner}/${req.params.repo}`);
    filesToAnalyze = await fetchAllRepoFiles(req.params.owner, req.params.repo, token);
    console.log(`Fetched ${filesToAnalyze.length} files from repository`);
  } else {
    if (!files || !Array.isArray(files) || files.length === 0) {
      res.status(400).json({ error: "No files provided for analysis" });
      return;
    }
    filesToAnalyze = files;
    console.log(`AI analysis requested for ${req.params.owner}/${req.params.repo}, ${files.length} file(s)`);
  }

  if (filesToAnalyze.length === 0) {
    res.status(400).json({ error: "No files found to analyze" });
    return;
  }

  // Process in batches for better results
  const batchSize = 10;
  const allResults: Array<{ file: string; status: string; issues: Array<{ title: string; body: string; tags: string[] }> }> = [];
  let totalIssuesFound = 0;

  try {
    for (let i = 0; i < filesToAnalyze.length; i += batchSize) {
      const batch = filesToAnalyze.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(filesToAnalyze.length / batchSize)}`);

      // Build prompt with ACTUAL file contents
      const filesContent = batch.map(f => {
        const truncatedContent = f.content.substring(0, 6000); // Reduced to prevent token overflow
        return `### File: ${f.path}\n\`\`\`\n${truncatedContent}\n\`\`\``;
      }).join('\n\n');

      const prompt = `Analyze the following ${batch.length} files for bugs, security vulnerabilities, and code quality issues.

${filesContent}

You MUST return valid JSON matching this structure:
{
  "files": [
    {
      "path": "exact/file/path.ext",
      "issues": [
        {
          "title": "Brief issue title",
          "severity": "HIGH",
          "type": "security",
          "description": "Detailed description with specific code references",
          "line": 42
        }
      ]
    }
  ]
}

Rules:
- severity must be: HIGH, MEDIUM, or LOW
- type must be: security, bug, performance, or code-quality
- Only report REAL issues you can see in the code
- Reference actual functions, variables, or patterns
- If a file has no issues, include it with empty issues array
${userPrompt ? `\n- Additional: ${userPrompt}` : ''}`;

      const { stdout } = await executeAIAnalysis(prompt, 300000, true);

      try {
        // Clean the response - remove markdown code blocks if present
        let cleanedResponse = stdout.trim();
        
        // Remove ```json or ``` wrappers
        if (cleanedResponse.startsWith('```')) {
          cleanedResponse = cleanedResponse
            .replace(/^```(?:json)?\n?/i, '')
            .replace(/\n?```$/i, '')
            .trim();
        }
        
        const batchResult = JSON.parse(cleanedResponse);
        if (batchResult.files && Array.isArray(batchResult.files)) {
          for (const fileResult of batchResult.files) {
            const issues = (fileResult.issues || []).map((issue: any) => ({
              title: issue.title || 'Code Issue',
              body: `**Severity:** ${issue.severity || 'MEDIUM'}
**Type:** ${issue.type || 'code-quality'}
${issue.line ? `**Line:** ${issue.line}
` : ''}
${issue.description || 'No description provided'}`,
              tags: [issue.type || 'review', issue.severity?.toLowerCase() || 'medium']
            }));
            
            allResults.push({
              file: fileResult.path,
              status: 'success',
              issues: issues
            });
            
            totalIssuesFound += issues.length;
          }
        }
      } catch (parseError) {
        console.error('Failed to parse JSON response for batch:', parseError);
        // Fallback to text parsing for this batch
        const textResults = parseAIIssuesOutput(stdout, batch);
        allResults.push(...textResults.results);
        totalIssuesFound += textResults.summary.total_issues;
      }

      // Small delay between batches to avoid rate limits
      if (i + batchSize < filesToAnalyze.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    res.json({
      summary: {
        total_files: filesToAnalyze.length,
        total_issues: totalIssuesFound,
        files_with_issues: allResults.filter(r => r.issues.length > 0).length,
      },
      results: allResults,
    });
  } catch (error: unknown) {
    console.error('Error in AI analysis:', error);
    if (error instanceof Error) {
      res.status(500).json({ error: `AI analysis failed: ${error.message}` });
    } else {
      res.status(500).json({ error: 'Internal server error during AI analysis' });
    }
  }
});

router.post("/:owner/:repo/analyze-full-scan", async (req: Request, res: Response) => {
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
      console.log(`Full repository scan requested for ${owner}/${repo}`);
      filesToAnalyze = await fetchAllRepoFiles(owner, repo, token);
      console.log(`Fetched ${filesToAnalyze.length} files from repository`);
    } else {
      if (!files || !Array.isArray(files) || files.length === 0) {
        res.status(400).json({ error: "No files provided for analysis" });
        return;
      }
      filesToAnalyze = files;
      console.log(`AI analysis requested for ${owner}/${repo}, ${files.length} file(s)`);
    }

    if (filesToAnalyze.length === 0) {
      res.status(400).json({ error: "No files found to analyze" });
      return;
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-analysis-"));
    
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
        ? `Analyze this codebase (${fileCount} files: ${filePaths}${moreFiles}). ${userPrompt}

Analyze the actual code provided and identify REAL issues. For each issue you find, provide:

- **File Path**: \`path/to/file.js\` (Line X if applicable)
- **Description**: Specific issue description based on the actual code
- **Priority Level**: HIGH/MEDIUM/LOW
- **Type**: bugs/security/performance/architecture/code-quality

IMPORTANT:
- Only report issues you can actually see in the code
- Be specific - reference actual code patterns, functions, or lines
- Do NOT include generic templates or placeholder text
- Do NOT say "I don't have access" - you have the code
- If a file has no issues, you can skip it (but still analyze it thoroughly)

Format each issue clearly. Focus on actionable, specific problems.`
        : `Analyze this codebase (${fileCount} files: ${filePaths}${moreFiles}).

Analyze the actual code provided and identify REAL issues. For each issue you find, provide:

- **File Path**: \`path/to/file.js\` (Line X if applicable)
- **Description**: Specific issue description based on the actual code
- **Priority Level**: HIGH/MEDIUM/LOW
- **Type**: bugs/security/performance/architecture/code-quality

IMPORTANT:
- Only report issues you can actually see in the code
- Be specific - reference actual code patterns, functions, or lines
- Do NOT include generic templates or placeholder text
- Do NOT say "I don't have access" - you have the code
- If a file has no issues, you can skip it (but still analyze it thoroughly)

Format each issue clearly. Focus on actionable, specific problems.`;

      console.log("Executing AI analysis...");
      const { stdout, stderr } = await executeAIAnalysis(prompt, 600000);

      const analysisOutput = stdout || stderr || "";
      
      if (!analysisOutput || analysisOutput.trim().length === 0) {
        throw new Error("AI analysis returned empty response - analysis may not have executed properly");
      }

      if (stderr && stderr.includes("npm error") && !stdout) {
        throw new Error(`AI analysis failed: ${stderr.substring(0, 300)}. This is likely a disk space or npm configuration issue in the serverless environment.`);
      }

      try {
        const analysisResult = parseAIIssuesOutput(analysisOutput, filesToAnalyze);
        
        if (analysisResult.summary.total_issues === 0 && analysisOutput.length > 100) {
          console.warn("AI returned output but parsed 0 issues - this may indicate a parsing issue or no issues were found");
        }
        
        res.json(analysisResult);
      } catch (parseError) {
        if (parseError instanceof Error && parseError.message.includes("AI analysis execution failed")) {
          throw parseError;
        }
        throw new Error(`Failed to parse AI analysis output: ${parseError instanceof Error ? parseError.message : "Unknown error"}. Raw output: ${analysisOutput.substring(0, 500)}`);
      }
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error("Error cleaning up temp directory:", cleanupError);
      }
    }
  } catch (error: unknown) {
    console.error("Error in AI analysis:", error);
    if (error instanceof Error) {
      res.status(500).json({ error: `AI analysis failed: ${error.message}` });
    } else {
      res.status(500).json({ error: "Internal server error during AI analysis" });
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

IMPORTANT: Format your response EXACTLY as follows:

### Merge Readiness Score: **XX/100**

IMPORTANT: The score you provide here (XX) MUST be the same score you calculate based on all the factors. Do NOT provide different scores in different sections.

#### Detailed Analysis:
[Provide comprehensive analysis here - this will be displayed to users]

#### Detailed Reasoning:
[Provide detailed reasoning here - this explains the score]

#### Recommendations:
- [Recommendation 1]
- [Recommendation 2]
- [etc.]

CRITICAL: The score in "Merge Readiness Score: **XX/100**" MUST match the actual calculated score based on all factors. Do NOT provide conflicting scores.`;

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pr-analysis-"));
    
    try {
      console.log(`Executing AI PR analysis for PR #${prNumber}...`);
      const { stdout, stderr } = await executeAIAnalysis(analysisPrompt, 300000);

      const analysisOutput = stdout || stderr || "";
      
      if (!analysisOutput || analysisOutput.trim().length === 0) {
        throw new Error("Cline PR analysis returned empty response - Cline may not have executed properly");
      }

      if (stderr && stderr.includes("npm error") && !stdout) {
        throw new Error(`AI analysis failed: ${stderr.substring(0, 300)}. This is likely a disk space or npm configuration issue in the serverless environment.`);
      }

      let scoreResult;
      try {
        scoreResult = parseAIPRScore(analysisOutput);
      } catch (parseError) {
        if (parseError instanceof Error && parseError.message.includes("Open AI execution failed")) {
          throw parseError;
        }
        throw new Error(`Failed to parse AI PR analysis: ${parseError instanceof Error ? parseError.message : "Unknown error"}. Raw output: ${analysisOutput.substring(0, 500)}`);
      }

      // Calculate score from sub-scores in analysis (e.g., (15/20), (10/10))
      function calculateScoreFromAnalysis(analysisText: string): number | null {
        if (!analysisText) return null;
        
        // Find all (X/Y) patterns like (15/20), (10/10), etc.
        const scorePattern = /\((\d+)\s*\/\s*(\d+)\)/g;
        const matches = [...analysisText.matchAll(scorePattern)];
        
        if (matches.length === 0) return null;
        
        let totalPercentage = 0;
        let count = 0;
        
        for (const match of matches) {
          const score = parseInt(match[1], 10);
          const max = parseInt(match[2], 10);
          if (!isNaN(score) && !isNaN(max) && max > 0) {
            const percentage = (score / max) * 100;
            totalPercentage += percentage;
            count++;
          }
        }
        
        if (count === 0) return null;
        
        const averageScore = Math.round(totalPercentage / count);
        return Math.max(0, Math.min(100, averageScore));
      }
      
      // ALWAYS calculate score from analysis sub-scores if available (most accurate)
      let finalScore = scoreResult.score;
      if (scoreResult.analysis) {
        const calculatedScore = calculateScoreFromAnalysis(scoreResult.analysis);
        if (calculatedScore !== null) {
          finalScore = calculatedScore;
          console.log(`✅ Calculated score ${finalScore} from analysis sub-scores (was ${scoreResult.score})`);
        } else {
          // Fallback: extract from "Merge Readiness Score: **85**" format in full output
          const fullOutputScore = calculateScoreFromAnalysis(analysisOutput);
          if (fullOutputScore !== null) {
            finalScore = fullOutputScore;
            console.log(`✅ Calculated score ${finalScore} from full output sub-scores`);
          } else {
            // Last fallback: extract from score header
            const analysisScoreMatch = analysisOutput.match(/##\s+Merge\s+Readiness\s+Score[:\s]*\*\*(\d{1,3})(?:\s*\/\s*100)?\*\*/i) ||
                                       analysisOutput.match(/merge\s+readiness\s+score[:\s]*\*\*(\d{1,3})(?:\s*\/\s*100)?\*\*/i);
            if (analysisScoreMatch) {
              const analysisScore = parseInt(analysisScoreMatch[1], 10);
              if (!isNaN(analysisScore) && analysisScore >= 0 && analysisScore <= 100) {
                finalScore = analysisScore;
                console.log(`✅ Extracted score ${finalScore} from score header (was ${scoreResult.score})`);
              }
            }
          }
        }
      } else {
        // If no analysis, try to calculate from full output
        const calculatedScore = calculateScoreFromAnalysis(analysisOutput);
        if (calculatedScore !== null) {
          finalScore = calculatedScore;
          console.log(`✅ Calculated score ${finalScore} from full output (no analysis field)`);
        }
      }

      // Ensure analysis is populated - use extracted analysis or fallback to full output
      const finalAnalysis = scoreResult.analysis && scoreResult.analysis.length > 20 
        ? scoreResult.analysis 
        : analysisOutput
            .replace(/##\s+Merge\s+Readiness\s+Score[:\s]*\*\*(\d{1,3})(?:\s*\/\s*100)?\*\*/gi, "")
            .replace(/###\s+Merge\s+Readiness\s+Score[:\s]*\*\*(\d{1,3})(?:\s*\/\s*100)?\*\*/gi, "")
            .substring(0, 3000);

      res.json({
        prNumber: parseInt(prNumber),
        score: finalScore,
        reasoning: scoreResult.reasoning,
        recommendations: scoreResult.recommendations,
        analysis: finalAnalysis,
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
