import "dotenv/config";

/**
 * Debug Script: Environment Variables
 * Run this on the server to verify that .env variables are loaded correctly.
 * Usage: npx ts-node src/scripts/debug-env.ts
 */

async function debugEnv() {
    console.log("--------------------------------------------------");
    console.log("🔍  BACKEND ENVIRONMENT DEBUGGER");
    console.log("--------------------------------------------------");
    console.log("Current Directory:", process.cwd());
    console.log("NODE_ENV:        ", process.env.NODE_ENV);
    console.log("PORT:            ", process.env.PORT);
    console.log("\n📧  EMAIL CONFIGURATION:");
    console.log("EMAIL_HOST:      ", process.env.EMAIL_HOST);
    console.log("EMAIL_PORT:      ", process.env.EMAIL_PORT);
    console.log("EMAIL_USER:      ", process.env.EMAIL_USER);
    console.log("EMAIL_FROM:      ", process.env.EMAIL_FROM);

    const pass = process.env.EMAIL_PASSWORD;
    if (!pass) {
        console.log("EMAIL_PASSWORD:   NOT SET ❌");
    } else {
        console.log("EMAIL_PASSWORD:   SET ✅");
        console.log("Password Length: ", pass.length);
        console.log("Password Hint:   ", pass.substring(0, 4) + "****************");
    }

    console.log("\n--------------------------------------------------");
    console.log("Total Variables: ", Object.keys(process.env).length);
    console.log("--------------------------------------------------");
}

debugEnv().catch(err => {
    console.error("Debugger failed:", err);
    process.exit(1);
});
