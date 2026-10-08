import express, { Express } from "express";
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

// Nginx on the same host forwards the visitor IP; office Wi-Fi punch-in depends on it.
app.set("trust proxy", "loopback");

// ==================== Middleware ====================

/**
 * CORS Configuration
 * Admin (crmadmin) calls the API on crmbackend, so that origin must always be allowed.
 * Quoted values from .env / PM2 are stripped so "https://..." still matches.
 */
const defaultCorsOrigins = [
  "http://localhost:3000",
  "http://localhost:7833",
  "http://crmadmin.printadel.in",
  "https://crmadmin.printadel.in",
];

const envCorsOrigins = (process.env.CORS_ORIGIN || "")
  .replace(/^["']|["']$/g, "")
  .split(",")
  .map((origin) => origin.trim().replace(/^["']|["']$/g, ""))
  .filter(Boolean);

const corsOrigins = new Set([...defaultCorsOrigins, ...envCorsOrigins]);

function isAllowedOrigin(origin?: string) {
  if (!origin) return true;
  if (corsOrigins.has(origin)) return true;
  try {
    const host = new URL(origin).hostname;
    return host === "printadel.in" || host.endsWith(".printadel.in");
  } catch {
    return false;
  }
}

app.use((req, res, next) => {
  res.setHeader("X-Backend", `printadel-crm-backend pid=${process.pid}`);

  const origin = req.headers.origin;
  if (req.method === "OPTIONS" || req.path === "/api/auth/login") {
    console.log(
      `[cors] ${req.method} ${req.path} origin=${origin || "-"} allowed=${
        typeof origin === "string" ? isAllowedOrigin(origin) : "no-origin"
      }`
    );
  }

  if (typeof origin === "string" && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,PATCH,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
});

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
