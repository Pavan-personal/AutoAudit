import express, { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import axios from "axios";
import jwt from "jsonwebtoken";

const router = express.Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "your-jwt-secret-change-in-production";

const GITHUB_APP_ID = process.env.GITHUB_APP_ID;
const GITHUB_PRIVATE_KEY = process.env.GITHUB_PRIVATE_KEY;
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;

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
                aiAnalysis: true,
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
        aiAnalysis: true,
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
              aiAnalysis,
              autoAssign,
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
                aiAnalysis: aiAnalysis || false,
                autoAssign: autoAssign || false,
              },
              create: {
                repositoryOwner: owner,
                repositoryName: repo,
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
                aiAnalysis: aiAnalysis || false,
                autoAssign: autoAssign || false,
                userId: user.id,
              },
            });

            res.json({ issue: automatedIssue });
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
      aiAnalysis,
      autoAssign,
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
        aiAnalysis: aiAnalysis || false,
        autoAssign: autoAssign || false,
      },
      create: {
        repositoryOwner: owner,
        repositoryName: repo,
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
        aiAnalysis: aiAnalysis || false,
        autoAssign: autoAssign || false,
        userId: userId,
      },
    });

    res.json({ issue: automatedIssue });
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
