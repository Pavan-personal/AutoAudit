import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
import session from "express-session";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const CLIENT_URL = process.env.CLIENT_URL || process.env.FRONTEND_URL;

app.use(express.json());
app.use(cookieParser());

const allowedOrigins = [
  CLIENT_URL,
  process.env.FRONTEND_URL,
  "https://autoauditai.vercel.app",
  "http://localhost:4000",
  "http://localhost:3000",
].filter(Boolean);

console.log("Allowed CORS origins:", allowedOrigins);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  if (req.method === "OPTIONS") {
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    } else {
      res.setHeader("Access-Control-Allow-Origin", "*");
    }
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, HEAD");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Cookie, X-Requested-With, Accept");
    res.setHeader("Access-Control-Max-Age", "86400");
    res.sendStatus(204);
    return;
  }
  
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, HEAD");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Cookie, X-Requested-With, Accept");
  res.setHeader("Access-Control-Expose-Headers", "Set-Cookie");
  
  next();
});

const corsOptions = {
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"],
  allowedHeaders: ["Content-Type", "Authorization", "Cookie", "X-Requested-With", "Accept"],
  exposedHeaders: ["Set-Cookie"],
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

app.use(
  session({
    name: "sessionId",
    secret: process.env.SESSION_SECRET || "your-secret-key-change-in-production",
    resave: true,
    saveUninitialized: true,
    cookie: {
      secure: true,
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      sameSite: "none",
      domain: undefined,
    },
  })
);

// Health check endpoint for Vercel
app.get("/health", (_req: express.Request, res: express.Response) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
    version: "1.0.0"
  });
});

// API status endpoint
app.get("/api/status", (_req: express.Request, res: express.Response) => {
  res.json({
    success: true,
    message: "Autoaudit backend is running",
    timestamp: new Date().toISOString(),
    endpoints: {
    }
  });
});

import authRoutes from "./routes/auth";
import webhookRoutes from "./routes/webhook";

app.use("/auth", authRoutes);
app.use("/webhook", webhookRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;