import express, { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import axios from "axios";
import jwt from "jsonwebtoken";

const router = express.Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "your-jwt-secret-change-in-production";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    githubToken?: string;
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

router.get("/", async (req: Request, res: Response) => {
  try {
    const token = await getGitHubToken(req);
    if (!token) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const response = await axios.get("https://api.github.com/user/repos", {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
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

    const response = await axios.get(url, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    const items = Array.isArray(response.data) ? response.data : [response.data];

    res.json({ items });
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

    const response = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3.raw",
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


router.post("/:owner/:repo/issues", async (req: Request, res: Response) => {
  try {
    const token = await getGitHubToken(req);
    if (!token) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const { owner, repo } = req.params;
    const { title, body, labels } = req.body;

    if (!title || !body) {
      res.status(400).json({ error: "Title and body are required" });
      return;
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
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    res.json({ issue: response.data });
  } catch (error: unknown) {
    console.error("Error creating GitHub issue:", error);
    if (axios.isAxiosError(error)) {
      res.status(error.response?.status || 500).json({
        error: error.response?.data?.message || "Failed to create issue",
      });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

export default router;
