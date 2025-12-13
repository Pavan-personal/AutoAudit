import express, { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import axios from "axios";

const router = express.Router();
const prisma = new PrismaClient();

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
    const authUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(GITHUB_CALLBACK_URL)}&scope=${encodeURIComponent("user:email repo")}&state=${state}`;
    res.redirect(authUrl);
  } catch (error) {
    console.error("Error creating OAuth state:", error);
    res.status(500).json({ error: "Failed to initialize OAuth" });
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

    const userResponse = await axios.get("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    const githubUser = userResponse.data;

    const emailResponse = await axios.get<Array<{ email: string; primary: boolean; verified: boolean }>>("https://api.github.com/user/emails", {
      headers: {
        Authorization: `Bearer ${access_token}`,
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
        },
      });
    }

    console.log("User created/updated, setting session");
    console.log("User ID:", user.id);
    console.log("User email:", user.email);
    
    if (req.session) {
      req.session.userId = user.id;
      req.session.githubToken = access_token;
      req.session.save(() => {
        console.log("Session saved successfully");
      });
    }
    
    await prisma.oAuthState.delete({
      where: { id: oauthState.id },
    }).catch((err: unknown) => {
      console.error("Error deleting OAuth state (non-critical):", err);
    });
    
    const redirectUrl = `${FRONTEND_URL}/dashboard`;
    console.log("=== REDIRECT INFO ===");
    console.log("Frontend URL:", FRONTEND_URL);
    console.log("Redirecting to dashboard with session cookie");
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
    console.log("=== /auth/me called ===");
    console.log("Session userId:", req.session?.userId || "none");
    
    const userId = req.session?.userId;

    if (!userId) {
      console.log("No userId in session - returning 401");
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

