import express, { Request, Response } from "express";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import axios from "axios";

const router = express.Router();
const prisma = new PrismaClient();

const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;
const KESTRA_WEBHOOK_URL = process.env.KESTRA_WEBHOOK_URL;

function verifyGitHubSignature(req: Request): boolean {
  if (!GITHUB_WEBHOOK_SECRET) {
    console.warn("GITHUB_WEBHOOK_SECRET not configured, skipping signature verification");
    return true;
  }

  const signature = req.headers["x-hub-signature-256"] as string;
  if (!signature) {
    console.error("Missing X-Hub-Signature-256 header");
    return false;
  }

  const rawBody = (req as any).rawBody || Buffer.from(JSON.stringify(req.body));
  const hmac = crypto.createHmac("sha256", GITHUB_WEBHOOK_SECRET);
  const digest = "sha256=" + hmac.update(rawBody).digest("hex");

  const isValid = crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(digest)
  );

  if (!isValid) {
    console.error("Invalid GitHub webhook signature");
  }

  return isValid;
}

// Handle issue comment and forward to Kestra if issue is automated
async function handleIssueComment(payload: any) {
  try {
    const issue = payload.issue;
    const comment = payload.comment;
    const repository = payload.repository;
    
    const owner = repository.owner.login;
    const repo = repository.name;
    const issueNumber = issue.number;
    
    console.log(`[WEBHOOK] Checking if issue #${issueNumber} is automated...`);
    
    // Check if this issue is in our automated issues table
    const automatedIssue = await prisma.automatedIssue.findFirst({
      where: {
        repositoryOwner: owner,
        repositoryName: repo,
        issueNumber: issueNumber,
      },
      select: {
        id: true,
        issueNumber: true,
        title: true,
        body: true,
        githubToken: true,
      },
    });
    
    if (!automatedIssue) {
      console.log(`[WEBHOOK] Issue #${issueNumber} is not automated, skipping.`);
      return;
    }
    
    console.log(`[WEBHOOK] Issue #${issueNumber} is automated! Forwarding to Kestra...`);
    
    if (!KESTRA_WEBHOOK_URL) {
      console.error("[WEBHOOK] KESTRA_WEBHOOK_URL not configured!");
      return;
    }
    
    // Prepare payload for Kestra
    const kestraPayload = {
      issue_number: issueNumber,
      owner: owner,
      repo: repo,
      comment_body: comment.body,
      commenter_username: comment.user.login,
      commenter_id: comment.user.id,
      issue_title: issue.title,
      issue_body: issue.body || "",
      github_token: automatedIssue.githubToken,
      backend_api_url: process.env.BACKEND_URL || "https://autoauditserver.vercel.app",
      comment_created_at: comment.created_at,
    };
    
    console.log(`[WEBHOOK] Sending to Kestra:`, JSON.stringify(kestraPayload, null, 2));
    
    // Forward to Kestra webhook
    const kestraResponse = await axios.post(KESTRA_WEBHOOK_URL, kestraPayload, {
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });
    
    console.log(`[WEBHOOK] Kestra response:`, kestraResponse.status, kestraResponse.data);
  } catch (error) {
    console.error("[WEBHOOK] Error forwarding to Kestra:", error);
    if (axios.isAxiosError(error)) {
      console.error("[WEBHOOK] Kestra error response:", error.response?.data);
    }
  }
}

router.post("/github", express.raw({ type: "application/json" }), async (req: Request, res: Response) => {
  const rawBody = req.body;
  
  if (!rawBody) {
    console.error("[WEBHOOK /github] No body received");
    res.status(400).json({ error: "No body" });
    return;
  }

  let webhookPayload: any;
  try {
    let bodyString: string;
    if (Buffer.isBuffer(rawBody)) {
      bodyString = rawBody.toString("utf8");
    } else if (typeof rawBody === "string") {
      bodyString = rawBody;
    } else {
      console.error("[WEBHOOK /github] Unexpected body type:", typeof rawBody);
      res.status(400).json({ error: "Invalid body type" });
      return;
    }
    
    webhookPayload = JSON.parse(bodyString);
    (req as any).rawBody = Buffer.from(bodyString, "utf8");
    req.body = webhookPayload;
  } catch (error) {
    console.error("[WEBHOOK /github] Failed to parse JSON body:", error);
    console.error("[WEBHOOK /github] Raw body type:", typeof rawBody);
    if (Buffer.isBuffer(rawBody)) {
      console.error("[WEBHOOK /github] Raw body preview:", rawBody.toString("utf8").substring(0, 200));
    }
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }
  console.log("\n[WEBHOOK /github] ====== RECEIVED ======");
  console.log("[WEBHOOK /github] Event:", req.headers["x-github-event"]);
  console.log("[WEBHOOK /github] Delivery ID:", req.headers["x-github-delivery"]);
  console.log("[WEBHOOK /github] Action:", webhookPayload?.action || "none");
  console.log("[WEBHOOK /github] Repository:", webhookPayload?.repository?.full_name || "none");

  if (!verifyGitHubSignature(req)) {
    console.error("[WEBHOOK /github] Signature verification failed");
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  const event = req.headers["x-github-event"] as string;

  try {
    switch (event) {
      case "push":
        console.log("[WEBHOOK /github] Push event received");
        console.log("[WEBHOOK /github] Branch:", webhookPayload.ref);
        console.log("[WEBHOOK /github] Commits:", webhookPayload.commits?.length || 0);
        break;

      case "pull_request":
        console.log("[WEBHOOK /github] Pull request event received");
        console.log("[WEBHOOK /github] Action:", webhookPayload.action);
        console.log("[WEBHOOK /github] PR #:", webhookPayload.pull_request?.number);
        break;

      case "issues":
        console.log("[WEBHOOK /github] Issue event received");
        console.log("[WEBHOOK /github] Action:", webhookPayload.action);
        console.log("[WEBHOOK /github] Issue #:", webhookPayload.issue?.number);
        break;

      case "issue_comment":
        console.log("[WEBHOOK /github] Issue comment event received");
        console.log("[WEBHOOK /github] Action:", webhookPayload.action);
        console.log("[WEBHOOK /github] Issue #:", webhookPayload.issue?.number);
        console.log("[WEBHOOK /github] Comment by:", webhookPayload.comment?.user?.login);
        
        // Handle issue comment for automated issues
        if (webhookPayload.action === "created" && webhookPayload.issue && webhookPayload.comment) {
          await handleIssueComment(webhookPayload);
        }
        break;

      case "repository":
        console.log("[WEBHOOK /github] Repository event received");
        console.log("[WEBHOOK /github] Action:", webhookPayload.action);
        break;

      default:
        console.log(`[WEBHOOK /github] Unhandled event type: ${event}`);
    }

    console.log("[WEBHOOK /github] ====== PROCESSED ======\n");
    res.status(200).json({ received: true, event });
  } catch (error) {
    console.error("[WEBHOOK /github] ====== ERROR ======");
    console.error("[WEBHOOK /github] Error processing webhook:", error);
    console.error("[WEBHOOK /github] ===================\n");
    res.status(500).json({ error: "Failed to process webhook" });
  }
});

router.get("/github", (_req: Request, res: Response) => {
  res.json({
    message: "GitHub webhook endpoint",
    status: "active",
    note: "This endpoint accepts POST requests from GitHub webhooks"
  });
});

export default router;
