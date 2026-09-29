const path = require("path");

/**
 * Backend-only PM2 config. Prefer the repo-root ecosystem.config.js,
 * which also starts printadel-crm-admin.
 * Env is loaded from backend/.env.
 */
module.exports = {
  apps: [
    {
      name: "printadel-crm-backend",
      cwd: __dirname,
      script: "dist/server.js",
      interpreter: "node",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env_file: path.join(__dirname, ".env"),
      env: {
        NODE_ENV: "production",
        PORT: "7834",
        HOST: "0.0.0.0",
      },
    },
  ],
};
