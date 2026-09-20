const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const nodemailer = require("nodemailer");

function loadEnvFiles() {
  const root = process.cwd();
  const envFiles = [".env.local", ".env"];

  for (const file of envFiles) {
    const fullPath = path.join(root, file);
    if (fs.existsSync(fullPath)) {
      dotenv.config({ path: fullPath });
    }
  }
}

function parseBoolean(value, fallback) {
  if (value === undefined) return fallback;
  return String(value).toLowerCase() === "true";
}

async function main() {
  loadEnvFiles();

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = parseBoolean(process.env.SMTP_SECURE, port === 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const fromEmail = process.env.SMTP_FROM_EMAIL || user;
  const fromName = process.env.SMTP_FROM_NAME || "Enable Project Management";

  const to = process.argv[2] || "dev@lighthousemediagroup.com";
  const subject = process.argv[3] || "SMTP test from Project Management Tool";
  const text = process.argv[4] || "This is a direct SMTP test email.";

  if (!host || !user || !pass || !fromEmail) {
    throw new Error(
      "Missing SMTP config. Required: SMTP_HOST, SMTP_USER, SMTP_PASSWORD, SMTP_FROM_EMAIL (or SMTP_USER).",
    );
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  await transporter.verify();

  const info = await transporter.sendMail({
    from: `${fromName} <${fromEmail}>`,
    to,
    subject,
    text,
    html: `<p>${text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`,
  });

  console.log("SMTP email sent", {
    to,
    subject,
    messageId: info.messageId,
    host,
    port,
    secure,
  });
}

main().catch((error) => {
  console.error("Failed to send SMTP email:", error.message || error);
  process.exit(1);
});
