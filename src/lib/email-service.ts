import { Resend } from "resend";
import { resolveAppBaseUrl } from "@/lib/app-url";

type EmailProvider = "resend";

type Diagnostics = {
  provider: EmailProvider;
  configured: boolean;
  verified: boolean;
  verifyError: string | null;
  missing: string[];
  fromEmail: string;
  fromName: string;
  host: string | null;
  port: number | null;
  secure: boolean | null;
  hasUser: boolean;
  hasPassword: boolean;
  hasApiKey: boolean;
};

type SendEmailArgs = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

type InviteAudience = "STAFF" | "CLIENT";

function getEmailProvider(): EmailProvider {
  return "resend";
}

function getFromEmail() {
  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim();
  if (!fromEmail) {
    throw new Error("Resend is selected but RESEND_FROM_EMAIL is not set.");
  }

  if (
    process.env.NODE_ENV === "production" &&
    fromEmail.toLowerCase().endsWith("@resend.dev")
  ) {
    throw new Error(
      "RESEND_FROM_EMAIL cannot use @resend.dev in production. Use an address from your verified domain.",
    );
  }

  return fromEmail;
}

function getFromName() {
  return (
    process.env.RESEND_FROM_NAME ||
    process.env.SMTP_FROM_NAME ||
    "Lighthouse Project Management"
  );
}

function buildInviteLink(
  inviteToken: string,
  invitePathOrUrl: string,
  appBaseUrl?: string,
) {
  const baseUrl = resolveAppBaseUrl(appBaseUrl);

  if (/^https?:\/\//i.test(invitePathOrUrl)) {
    if (invitePathOrUrl.startsWith(baseUrl)) {
      return invitePathOrUrl;
    }

    const url = new URL(invitePathOrUrl);
    return `${url.origin}${url.pathname}${url.search}${url.hash}`;
  }

  const relativePath = invitePathOrUrl.startsWith("/")
    ? invitePathOrUrl
    : `/${invitePathOrUrl}`;

  if (relativePath.includes("{token}")) {
    return `${baseUrl}${relativePath.replace("{token}", inviteToken)}`;
  }

  return `${baseUrl}${relativePath}${inviteToken}`;
}

export async function getEmailDiagnostics(): Promise<Diagnostics> {
  const provider = getEmailProvider();
  const fromEmail = getFromEmail();
  const fromName = getFromName();
  const missing: string[] = [];
  if (!process.env.RESEND_API_KEY) missing.push("RESEND_API_KEY");
  if (!process.env.RESEND_FROM_EMAIL) {
    missing.push("RESEND_FROM_EMAIL");
  }

  const diagnostics: Diagnostics = {
    provider,
    configured: missing.length === 0,
    verified: missing.length === 0,
    verifyError: null,
    missing,
    fromEmail,
    fromName,
    host: "api.resend.com",
    port: null,
    secure: true,
    hasUser: false,
    hasPassword: false,
    hasApiKey: Boolean(process.env.RESEND_API_KEY),
  };

  return diagnostics;
}

async function sendViaResend({
  to,
  subject,
  html,
  text,
  fromEmail,
  fromName,
}: SendEmailArgs & { fromEmail: string; fromName: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Resend is not configured. Set RESEND_API_KEY.");
  }

  const resend = new Resend(apiKey);
  const from = `${fromName} <${fromEmail}>`;
  const { data, error } = await resend.emails.send({
    from,
    to: [to],
    subject,
    html,
    text,
  });

  if (error) {
    throw new Error(error.message || "Resend send failed");
  }

  console.log("Resend email sent", {
    id: data?.id ?? null,
    recipientEmail: to,
    subject,
    fromEmail,
  });

  return {
    provider: "resend" as const,
    id: data?.id ?? null,
  };
}

async function sendEmail({ to, subject, html, text }: SendEmailArgs) {
  const fromEmail = getFromEmail();
  const fromName = getFromName();

  return sendViaResend({
    to,
    subject,
    html,
    text,
    fromEmail,
    fromName,
  });
}

async function loadTemplate(
  templateName: string,
  replacements: Record<string, string>,
) {
  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const templatePath = path.join(
      process.cwd(),
      "public",
      "email-templates",
      templateName,
    );
    let template = await fs.readFile(templatePath, "utf8");

    for (const [token, value] of Object.entries(replacements)) {
      template = template.replace(
        new RegExp(`<!--\\s*${token}\\s*-->`, "g"),
        value,
      );
    }

    return template;
  } catch (error) {
    console.warn(
      "Email template load failed, falling back to inline content:",
      {
        templateName,
        error,
      },
    );
    return null;
  }
}

export async function verifyEmailService(): Promise<boolean> {
  try {
    const diagnostics = await getEmailDiagnostics();
    console.log("✓ Email service diagnostics", diagnostics);
    return diagnostics.configured && diagnostics.verified;
  } catch (error) {
    console.error("✗ Email service connection failed:", error);
    return false;
  }
}

export async function sendTestEmail(
  recipientEmail: string,
  recipientName: string,
) {
  const subject = "Lighthouse Project Management email test";
  const text = `Hi ${recipientName}, this is a test email from Lighthouse Project Management. If you received this, email delivery is working.`;
  const html = `<p>Hi ${recipientName},</p><p>This is a test email from <strong>Lighthouse Project Management</strong>.</p><p>If you received this, email delivery is working.</p>`;

  try {
    return await sendEmail({
      to: recipientEmail,
      subject,
      text,
      html,
    });
  } catch (error) {
    console.error("✗ Failed to send test email:", error, {
      recipientEmail,
      recipientName,
      provider: getEmailProvider(),
    });
    throw error;
  }
}

export async function sendAdminInviteEmail(
  recipientEmail: string,
  inviteToken: string,
  recipientName: string,
  teamName?: string,
  invitePathOrUrl: string = "/auth/invite?token=",
  appBaseUrl?: string,
  inviteAudience: InviteAudience = "STAFF",
) {
  const inviteLink = buildInviteLink(inviteToken, invitePathOrUrl, appBaseUrl);

  const isClientInvite = inviteAudience === "CLIENT";
  const templateName = isClientInvite ? "invite-client.html" : "invite.html";
  const subject = isClientInvite
    ? "You have been invited to collaborate in Lighthouse Project Management"
    : "You've been invited to join Lighthouse Project Management";
  const text = isClientInvite
    ? `You've been invited to collaborate in Lighthouse Project Management as a client. Visit: ${inviteLink}`
    : `You've been invited to join Lighthouse Project Management. Visit: ${inviteLink}`;

  let htmlContent = await loadTemplate(templateName, {
    RECIPIENT_NAME: recipientName || "",
    INVITE_LINK: inviteLink,
    TEAM_NAME: teamName || "",
  });

  if (!htmlContent) {
    htmlContent = isClientInvite
      ? `Hi ${recipientName}, you have been invited to collaborate in Lighthouse Project Management as a client. Accept here: ${inviteLink}`
      : `Hi ${recipientName}, you have been invited to join Lighthouse Project Management. Accept here: ${inviteLink}`;
  }

  try {
    return await sendEmail({
      to: recipientEmail,
      subject,
      html: htmlContent,
      text,
    });
  } catch (error) {
    console.error("✗ Failed to send invite email:", error);
    throw error;
  }
}

export async function sendPasswordResetEmail(
  recipientEmail: string,
  resetToken: string,
  recipientName: string,
  teamName?: string,
  appBaseUrl?: string,
) {
  const resetLink = `${resolveAppBaseUrl(appBaseUrl)}/auth/reset-password?token=${resetToken}`;

  let htmlContent = await loadTemplate("reset-password.html", {
    RECIPIENT_NAME: recipientName || "",
    RESET_LINK: resetLink,
    TEAM_NAME: teamName || "",
  });

  if (!htmlContent) {
    htmlContent = `Hi ${recipientName}, reset your password here: ${resetLink}`;
  }

  try {
    return await sendEmail({
      to: recipientEmail,
      subject: "Reset your Lighthouse Project Management password",
      html: htmlContent,
      text: `Reset your password: ${resetLink}`,
    });
  } catch (error) {
    console.error("✗ Failed to send password reset email:", error);
    throw error;
  }
}
