import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

/**
 * Email Configuration using Nodemailer
 * Configured for Gmail SMTP (can be changed to any SMTP provider)
 */

/**
 * Create Email Transporter
 * SMTP configuration for sending emails
 */
const createTransporter = (): Transporter => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || "smtp.gmail.com",
    port: parseInt(process.env.EMAIL_PORT || "587"),
    secure: process.env.EMAIL_SECURE === "true", // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
};

export const emailTransporter = createTransporter();

/**
 * Verify Email Configuration
 * Tests the email transporter connection
 */
export async function verifyEmailConfig() {
  try {
    await emailTransporter.verify();
    console.log("✅ Email server is ready to send messages");
    return true;
  } catch (error) {
    console.error("❌ Email server connection failed:", error);
    console.log("⚠️  Email functionality will be disabled");
    return false;
  }
}

/**
 * Email Options Interface
 */
export interface EmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content?: Buffer | string;
    path?: string;
  }>;
}

/**
 * Send Email Function
 * Wrapper function to send emails with error handling
 */
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    const fromAddress = process.env.EMAIL_FROM || process.env.EMAIL_USER;
    const mailOptions = {
      from: `"Printadel CRM" <${fromAddress}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      attachments: options.attachments,
    };

    const info = await emailTransporter.sendMail(mailOptions);
    console.log("✅ Email sent successfully:", info.messageId);
    return true;
  } catch (error) {
    console.error("❌ Failed to send email:", error);
    return false;
  }
}
