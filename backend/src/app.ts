import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const CLIENT_URL = process.env.CLIENT_URL;

app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
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
    message: "MindMesh QuizCraft API is running",
    timestamp: new Date().toISOString(),
    endpoints: {
    }
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;