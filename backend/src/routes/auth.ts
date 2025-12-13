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

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const GITHUB_CALLBACK_URL = process.env.GITHUB_CALLBACK_URL;
const FRONTEND_URL = process.env.FRONTEND_URL;

router.get("/github", async (_req: Request, res: Response) => {
  if (!GITHUB_CLIENT_ID || !GITHUB_CALLBACK_URL) {
    res.status(500).json({ error: "GitHub OAuth not configured" });
    return;
  }

  try {
    const state = Math.random().toString(36).substring(7);
    console.log("OAuth init - Creating state:", state);
    
    await prisma.oAuthState.create({
      data: { state },
    });
    
    console.log("State saved to database");
    const authUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(GITHUB_CALLBACK_URL)}&state=${state}`;
    res.redirect(authUrl);
  } catch (error) {
    console.error("Error creating OAuth state:", error);
    res.status(500).json({ error: "Failed to initialize OAuth" });
  }
});

router.get("/github/install/callback", async (req: Request, res: Response) => {
  try {
    const { installation_id, state } = req.query;
    
    if (!installation_id) {
      res.setHeader("Content-Type", "text/html");
      res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>Error</title></head>
          <body>
            <script>window.location.href = ${JSON.stringify(`${FRONTEND_URL}?error=missing_installation`)};</script>
            <p>Redirecting...</p>
          </body>
        </html>
      `);
      return;
    }

    if (state && typeof state === "string") {
      const oauthState = await prisma.oAuthState.findUnique({
        where: { state: state as string },
      });

      if (oauthState) {
        const user = await prisma.user.findFirst({
          where: { githubToken: { not: null } },
          orderBy: { createdAt: "desc" },
        });

        if (user) {
          await prisma.user.update({
            where: { id: user.id },
            data: { appInstalled: true },
          });
        }
      }
    }

    res.setHeader("Content-Type", "text/html");
    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Installation Complete</title></head>
        <body>
          <script>window.location.href = ${JSON.stringify(`${FRONTEND_URL}/dashboard`)};</script>
          <p>Redirecting to dashboard...</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Installation callback error:", error);
    res.setHeader("Content-Type", "text/html");
    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Error</title></head>
        <body>
          <script>window.location.href = ${JSON.stringify(`${FRONTEND_URL}?error=install_failed`)};</script>
          <p>Redirecting...</p>
        </body>
      </html>
    `);
  }
});

router.get("/github/callback", async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      res.setHeader("Content-Type", "text/html");
      res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>Error</title></head>
          <body>
            <script>window.location.href = ${JSON.stringify(`${FRONTEND_URL}?error=missing_params`)};</script>
            <p>Redirecting...</p>
          </body>
        </html>
      `);
      return;
    }

    console.log("Callback received - State from query:", state);

    if (!state || typeof state !== "string") {
      res.setHeader("Content-Type", "text/html");
      res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>Error</title></head>
          <body>
            <script>window.location.href = ${JSON.stringify(`${FRONTEND_URL}?error=missing_state`)};</script>
            <p>Redirecting...</p>
          </body>
        </html>
      `);
      return;
    }

    const oauthState = await prisma.oAuthState.findUnique({
      where: { state: state as string },
    });

    if (!oauthState) {
      console.log("State not found - might be duplicate callback from GitHub");
      console.log("This is normal - GitHub may call the callback multiple times");
      res.setHeader("Content-Type", "text/html");
      res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>Redirecting...</title></head>
          <body>
            <script>window.location.href = ${JSON.stringify(`${FRONTEND_URL}/dashboard`)};</script>
            <p>Redirecting...</p>
          </body>
        </html>
      `);
      return;
    }

    console.log("State validated, proceeding with OAuth exchange");

    const tokenResponse = await axios.post(
      "https://github.com/login/oauth/access_token",
      {
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      },
      {
        headers: {
          Accept: "application/json",
        },
      }
    );

    const { access_token } = tokenResponse.data;

    if (!access_token) {
      res.setHeader("Content-Type", "text/html");
      return res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>Error</title></head>
          <body>
            <script>window.location.href = ${JSON.stringify(`${FRONTEND_URL}?error=no_token`)};</script>
            <p>Redirecting...</p>
          </body>
        </html>
      `);
    }

    const isUserAccessToken = access_token.startsWith("ghu_");
    const authHeader = isUserAccessToken ? `Bearer ${access_token}` : `token ${access_token}`;
    
    console.log("=== TOKEN TYPE DETECTION ===");
    console.log("Token prefix:", access_token.substring(0, 4));
    console.log("Is GitHub App user access token (ghu_):", isUserAccessToken);
    console.log("Using auth header format:", isUserAccessToken ? "Bearer" : "token");
    console.log("===========================");

    const userResponse = await axios.get("https://api.github.com/user", {
      headers: {
        Authorization: authHeader,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    const githubUser = userResponse.data;

    let appInstalled = false;
    const GITHUB_APP_ID = process.env.GITHUB_APP_ID;
    if (GITHUB_APP_ID && isUserAccessToken) {
      try {
        const installationResponse = await axios.get(`https://api.github.com/users/${githubUser.login}/installation`, {
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: authHeader,
            "X-GitHub-Api-Version": "2022-11-28",
          },
        });
        appInstalled = !!installationResponse.data?.id;
        console.log("App installation status:", appInstalled);
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          console.log("App not installed on account");
          appInstalled = false;
        } else {
          console.error("Error checking installation:", error);
        }
      }
    }

    const emailResponse = await axios.get<Array<{ email: string; primary: boolean; verified: boolean }>>("https://api.github.com/user/emails", {
      headers: {
        Authorization: authHeader,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    const primaryEmail = emailResponse.data.find((email) => email.primary)?.email || emailResponse.data[0]?.email || githubUser.email;

    let user = await prisma.user.findUnique({
      where: { githubId: githubUser.id.toString() },
    });

    if (!user) {
      user = await prisma.user.findUnique({
        where: { email: primaryEmail },
      });

      if (user) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            githubId: githubUser.id.toString(),
            githubToken: access_token,
            name: githubUser.name || githubUser.login,
            image: githubUser.avatar_url,
            appInstalled: appInstalled,
          },
        });
      } else {
        user = await prisma.user.create({
          data: {
            githubId: githubUser.id.toString(),
            email: primaryEmail,
            name: githubUser.name || githubUser.login,
            image: githubUser.avatar_url,
            githubToken: access_token,
            appInstalled: appInstalled,
          },
        });
      }
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          githubToken: access_token,
          name: githubUser.name || githubUser.login,
          image: githubUser.avatar_url,
          appInstalled: appInstalled,
        },
      });
    }

    console.log("User created/updated, generating JWT token");
    console.log("User ID:", user.id);
    console.log("User email:", user.email);
    
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: "30d" }
    );
    
    console.log("JWT token generated, length:", token.length);
    
    if (req.session) {
      req.session.userId = user.id;
      req.session.githubToken = access_token;
      
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            console.error("Error saving session:", err);
            reject(err);
          } else {
            console.log("Session saved successfully");
            console.log("Session ID:", req.sessionID);
            resolve();
          }
        });
      });
    }
    
    await prisma.oAuthState.delete({
      where: { id: oauthState.id },
    }).catch((err: unknown) => {
      console.error("Error deleting OAuth state (non-critical):", err);
    });
    
    res.cookie("authToken", token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: "/",
    });
    
    if (!appInstalled && GITHUB_APP_ID) {
      const appSlug = GITHUB_CLIENT_ID?.split(".")[0] || "autoauditai";
      const installUrl = `https://github.com/apps/${appSlug}/installations/new?state=${state}`;
      console.log("App not installed, redirecting to installation:", installUrl);
      res.redirect(302, installUrl);
      return;
    }
    
    const redirectUrl = `${FRONTEND_URL}/dashboard`;
    console.log("=== REDIRECT INFO ===");
    console.log("Frontend URL:", FRONTEND_URL);
    console.log("Redirect URL:", redirectUrl);
    console.log("App installed:", appInstalled);
    console.log("====================");
    
    res.redirect(302, redirectUrl);
    return;
  } catch (error: unknown) {
    console.error("GitHub OAuth error:", error);
    res.setHeader("Content-Type", "text/html");
    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Error</title></head>
        <body>
          <script>window.location.href = ${JSON.stringify(`${FRONTEND_URL}?error=oauth_failed`)};</script>
          <p>Redirecting...</p>
        </body>
      </html>
    `);
    return;
  }
});

router.get("/me", async (req: Request, res: Response) => {
  try {
    console.log("\n=== /auth/me called ===");
    console.log("Session ID:", req.sessionID || "none");
    console.log("Session userId:", req.session?.userId || "none");
    console.log("Cookies received:", req.headers.cookie || "none");
    console.log("Origin:", req.headers.origin || "none");
    console.log("Referer:", req.headers.referer || "none");
    
    let userId: string | undefined = req.session?.userId;
    
    if (!userId) {
      const authToken = req.cookies?.authToken;
      if (authToken) {
        console.log("Found authToken in cookies, verifying JWT...");
        try {
          const decoded = jwt.verify(authToken, JWT_SECRET) as { userId: string; email: string };
          userId = decoded.userId;
          console.log("JWT token validated, userId:", userId);
          
          if (req.session) {
            req.session.userId = userId;
            req.session.save(() => {});
          }
        } catch (err) {
          console.error("JWT verification failed:", err);
        }
      }
    }

    if (!userId) {
      console.log("No userId found - returning 401");
      console.log("Full session object:", JSON.stringify(req.session || {}, null, 2));
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        githubId: true,
        createdAt: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ user });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ error: "Failed to get user" });
  }
});

router.post("/logout", (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: "Failed to logout" });
      return;
    }
    res.json({ success: true });
  });
});

export default router;

