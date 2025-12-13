import express, { Request, Response } from "express";
import crypto from "crypto";

const router = express.Router();

const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;

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

router.post("/github", express.raw({ type: "application/json" }), (req: Request, res: Response) => {
  const rawBody = req.body as Buffer;
  (req as any).rawBody = rawBody;
  
  let webhookPayload: any;
  try {
    const bodyString = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody);
    webhookPayload = JSON.parse(bodyString);
    req.body = webhookPayload;
  } catch (error) {
    console.error("[WEBHOOK /github] Failed to parse JSON body:", error);
    console.error("[WEBHOOK /github] Raw body type:", typeof rawBody);
    console.error("[WEBHOOK /github] Raw body preview:", rawBody?.toString?.()?.substring(0, 200));
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
