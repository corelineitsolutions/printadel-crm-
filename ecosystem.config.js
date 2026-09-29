const path = require("path");

/**
 * PM2 process file for Printadel CRM.
 * From the repo root: pm2 start ecosystem.config.js
 *
 * printadel-crm-backend  -> port 7834, loads backend/.env (dotenv in the server)
 * printadel-crm-admin    -> port 7833, Next.js loads admin/.env.local
 *
 * NEXT_PUBLIC_* values are baked in at build time. Build the admin after
 * admin/.env.local exists:  cd admin && npm run build
 */
module.exports = {
  apps: [
    {
      name: "printadel-crm-backend",
      cwd: path.join(__dirname, "backend"),
      script: "dist/server.js",
      interpreter: "node",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env_file: path.join(__dirname, "backend", ".env"),
      env: {
        NODE_ENV: "production",
        PORT: "7834",
        HOST: "0.0.0.0",
      },
    },
    {
      name: "printadel-crm-admin",
      cwd: path.join(__dirname, "admin"),
      script: path.join(__dirname, "admin", "node_modules", "next", "dist", "bin", "next"),
      args: "start -p 7833",
      interpreter: "node",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env_file: path.join(__dirname, "admin", ".env.local"),
      env: {
        NODE_ENV: "production",
        PORT: "7833",
      },
    },
  ],
};
