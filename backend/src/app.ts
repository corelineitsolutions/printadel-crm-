import express, { Express } from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import routes from "./routes";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware";

/**
 * Express Application Setup
 * Configures middleware and routes
 */

// Load environment variables
dotenv.config();

const app: Express = express();

// ==================== Middleware ====================

/**
 * CORS Configuration
 */
const corsOrigins = (process.env.CORS_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

/**
 * Body Parser Middleware
 * Parses JSON and URL-encoded request bodies
 */
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

/**
 * Static files middleware for uploaded images / assets
 */
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

/**
 * Request Logging Middleware (Development)
 * Logs all incoming requests
 */
if (process.env.NODE_ENV === "development") {
  app.use((req, _res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// ==================== Routes ====================

/**
 * API Routes
 * All routes are prefixed with /api
 */
app.use("/api", routes);

/**
 * Root Endpoint
 * API welcome message
 */
app.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "🚀 Printadel CRM API is running",
    version: "1.0.0",
    endpoints: {
      health: "/api/health",
      auth: "/api/auth",
    },
  });
});

// ==================== Error Handling ====================

/**
 * 404 Not Found Handler
 * Catches undefined routes
 */
app.use(notFoundHandler);

/**
 * Global Error Handler
 * Catches and formats all errors
 */
app.use(errorHandler);

export default app;
