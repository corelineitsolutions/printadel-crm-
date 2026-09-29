import "dotenv/config";
import app from "./app";
import connectDB from "./config/database";
import { verifyEmailConfig } from "./config/email";
import http from "http";
import { initSocket } from "./config/socket";

/**
 * Server Entry Point
 * Starts the Express server and connects to MongoDB
 */

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";

/**
 * Start Server
 * Initializes MongoDB connection and starts HTTP server
 */
async function startServer() {
  try {
    console.log("🚀 Starting CRM Backend Server...\n");

    // Connect to MongoDB
    await connectDB();

    // Verify email configuration (non-blocking)
    verifyEmailConfig();

    // Create HTTP server
    const httpServer = http.createServer(app);

    // Initialize Socket.io
    initSocket(httpServer);

    // Start server
    const server = httpServer.listen(Number(PORT), HOST, () => {
      console.log(`\n✅ Server running on ${HOST}:${PORT} (pid ${process.pid}, cwd ${process.cwd()})`);
      console.log(`🌐 API URL: http://localhost:${PORT}`);
      console.log(`📚 Health Check: http://localhost:${PORT}/api/health`);
      console.log(`📅 Environment: ${process.env.NODE_ENV || "development"}\n`);
    });

    // Graceful shutdown
    process.on("SIGTERM", () => {
      console.log("\n⚠️  SIGTERM signal received: closing HTTP server");
      server.close(() => {
        console.log("✅ HTTP server closed");
        process.exit(0);
      });
    });

    process.on("SIGINT", () => {
      console.log("\n⚠️  SIGINT signal received: closing HTTP server");
      server.close(() => {
        console.log("✅ HTTP server closed");
        process.exit(0);
      });
    });

  } catch (error: any) {
    console.error("❌ Failed to start server:", error.message);
    process.exit(1);
  }
}

// Global Exception Handlers
process.on("unhandledRejection", (reason: any) => {
  console.error("\n💥 UNHANDLED REJECTION! Shutting down...");
  console.error(reason);
  process.exit(1);
});

process.on("uncaughtException", (error: Error) => {
  console.error("\n💥 UNCAUGHT EXCEPTION! Shutting down...");
  console.error(error);
  process.exit(1);
});

// Start the server
startServer();
