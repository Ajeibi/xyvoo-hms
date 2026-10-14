import nodemailer from "nodemailer";
import { getMailEnv } from "@/lib/env";
import { badge, detailsPanel, escapeHtml, logoAttachment, renderEmail, type EmailLayout } from "@/lib/mail/layout";

const mailEnv = getMailEnv();

const smtp = nodemailer.createTransport({
  host: mailEnv.host,
  port: mailEnv.port,
  secure: false,
  auth: {
    user: mailEnv.user,
    pass: mailEnv.pass,
  },
});

/** "Slow down" or "try later" from the mail server, or a dropped connection: worth another go. */
function isTemporaryMailError(error: unknown) {
  const e = error as { responseCode?: number; code?: string; response?: string; message?: string };
  if (e?.responseCode && e.responseCode >= 420 && e.responseCode < 460) return true;
  if (e?.code && ["ECONNECTION", "ETIMEDOUT", "ESOCKET", "ECONNRESET"].includes(e.code)) return true;
  return /too many|rate limit|try again later/i.test(`${e?.response ?? ""} ${e?.message ?? ""}`);
}

/**
 * The shortest gap between two emails from this server. Mailtrap's testing
 * inbox takes one a second; set MAIL_MIN_INTERVAL_MS for a provider with its
 * own limit.
 */
const MIN_INTERVAL_MS = Number(process.env.MAIL_MIN_INTERVAL_MS) || (mailEnv.host.startsWith("sandbox.") ? 1100 : 0);
let queue: Promise<unknown> = Promise.resolve();
let lastSentAt = 0;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** One send at a time from this server, at least MIN_INTERVAL_MS apart. */
function inTurn<T>(send: () => Promise<T>): Promise<T> {
  const turn = queue.then(async () => {
    const gap = lastSentAt + MIN_INTERVAL_MS - Date.now();
    if (gap > 0) await wait(gap);
    try {
      return await send();
    } finally {
      lastSentAt = Date.now();
    }
  });
  queue = turn.catch(() => undefined);
  return turn;
}

/**
 * Sends one email, trying twice more when the mail server asks us to slow
 * down. The waits are a little random, so emails for the same order that
 * were refused together don't all come back at the same moment.
 */
const transporter = {
  async sendMail(options: Parameters<typeof smtp.sendMail>[0]) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await inTurn(() => smtp.sendMail(options));
      } catch (error) {
        if (attempt >= 2 || !isTemporaryMailError(error)) throw error;
        await wait((attempt === 0 ? 1500 : 4000) + Math.random() * 2000);
      }
    }
  },
};

export async function sendCheckoutReceiptEmail({
  to,
  subject,
  text,
  html,
}: {
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  await transporter.sendMail({
    from: mailEnv.from,
    to,
    subject,
    text,
    html,
  });
}

/** A file sent with a branded email, e.g. a PDF receipt. */
export type EmailAttachment = { filename: string; content: Buffer | Uint8Array; contentType: string };

/** Any email built with the branded layout (renderEmail), with the logo attached, plus any extra files. */
export async function sendBrandedEmail({
  to,
  subject,
  text,
  layout,
  replyTo,
  attachments,
  headers,
}: {
  to: string;
  subject: string;
  text: string;
  layout: EmailLayout;
  replyTo?: string | null;
  attachments?: EmailAttachment[];
  /** Extra headers, e.g. List-Unsubscribe on reminder emails. */
  headers?: Record<string, string>;
}) {
  await transporter.sendMail({
    from: mailEnv.from,
    to,
    subject,
    text,
    html: renderEmail(layout),
    attachments: [logoAttachment(), ...(attachments ?? []).map((a) => ({ filename: a.filename, content: Buffer.from(a.content), contentType: a.contentType }))],
    ...(replyTo ? { replyTo } : {}),
    ...(headers ? { headers } : {}),
  });
}

/** Booking-request emails from a hotel's public website (see src/lib/hms/booking-request.ts). */
export async function sendBookingRequestEmail({
  to,
  replyTo,
  subject,
  text,
  html,
}: {
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
}) {
  await transporter.sendMail({
    from: mailEnv.from,
    to,
    replyTo,
    subject,
    text,
    html,
  });
}

/** Contact-form messages from the marketing site (see src/lib/marketing/contact-request.ts). */
export async function sendContactRequestEmail({
  to,
  cc,
  replyTo,
  subject,
  text,
  html,
}: {
  to: string;
  cc?: string[];
  replyTo: string;
  subject: string;
  text: string;
  html: string;
}) {
  await transporter.sendMail({
    from: mailEnv.from,
    to,
    cc,
    replyTo,
    subject,
    text,
    html,
    attachments: [logoAttachment()],
  });
}

const ACCOUNT_CODE_COPY = {
  verify_email: {
    subject: "Your XYVOO verification code",
    badge: "Verification",
    title: "Confirm your email",
    intro: "use this code to confirm your email address and finish setting up your XYVOO account.",
    ignore: "If you didn't create a XYVOO account, you can ignore this email. Nobody can use the code without access to your inbox.",
  },
  reset_password: {
    subject: "Reset your XYVOO password",
    badge: "Password reset",
    title: "Reset your password",
    intro: "use this code to choose a new password for your XYVOO account.",
    ignore: "If you didn't ask to reset your password, you can ignore this email. Your password stays the same.",
  },
} as const;

/** Codes for confirming a new account's email and for password resets (see src/lib/auth/account-codes.ts). */
export async function sendAccountCodeEmail({
  to,
  name,
  code,
  purpose,
  expiresInMinutes,
}: {
  to: string;
  name: string | null;
  code: string;
  purpose: keyof typeof ACCOUNT_CODE_COPY;
  expiresInMinutes: number;
}) {
  const copy = ACCOUNT_CODE_COPY[purpose];
  const greeting = name ? `Hello ${name}, ` : "Hello, ";
  await transporter.sendMail({
    from: mailEnv.from,
    to,
    subject: copy.subject,
    text: `${greeting}${copy.intro}\n\nYour code is ${code}. It expires in ${expiresInMinutes} minutes.\n\n${copy.ignore}`,
    html: renderEmail({
      preheader: `Your code is ${code}. It expires in ${expiresInMinutes} minutes.`,
      badges: [badge(copy.badge)],
      title: copy.title,
      intro: `${greeting}${copy.intro}`,
      body: `<div style="margin:0 0 20px;padding:24px;border:1px dashed #007edf;border-radius:12px;background:#f5faff;text-align:center">
        <div style="font-size:34px;font-weight:800;letter-spacing:10px;color:#000d1f;font-family:'Courier New',monospace">${escapeHtml(code)}</div>
        <div style="margin-top:8px;font-size:13px;color:#64748b">Expires in ${expiresInMinutes} minutes</div>
      </div>
      <p style="margin:0;color:#64748b;font-size:14px;line-height:1.6">${escapeHtml(copy.ignore)}</p>`,
      footerNote: "You're receiving this because this address is linked to a XYVOO account.",
    }),
    attachments: [logoAttachment()],
  });
}

/**
 * Sent once, when a new shop owner confirms their email. It deliberately never
 * includes the password: it gives the sign-in address and links instead, with a
 * way to reset the password if they forget it.
 */
export async function sendStoreWelcomeEmail({
  to,
  name,
  storeName,
  dashboardUrl,
  shopUrl,
  signInUrl,
  resetPasswordUrl,
}: {
  to: string;
  name: string | null;
  storeName: string;
  dashboardUrl: string;
  shopUrl: string;
  signInUrl: string;
  resetPasswordUrl: string;
}) {
  const greeting = name ? `Hello ${name}, ` : "Hello, ";
  const intro = `${greeting}your shop ${storeName} is set up on XYVOO. Here's everything you need to come back to it.`;
  await transporter.sendMail({
    from: mailEnv.from,
    to,
    subject: `Welcome to XYVOO: ${storeName} is ready to set up`,
    text: [
      intro,
      "",
      `Shop name: ${storeName}`,
      `Sign in with: ${to}`,
      `Your dashboard: ${dashboardUrl}`,
      `Your shop's web address: ${shopUrl} (customers can see it once you publish)`,
      "",
      `Sign in at ${signInUrl}. Forgotten your password? Reset it at ${resetPasswordUrl}`,
      "",
      "Next steps: add your first product, add your payout account, then publish your shop.",
      "We'll never ask for your password by email.",
    ].join("\n"),
    html: renderEmail({
      preheader: `${storeName} is set up. Your dashboard link and sign-in details are inside.`,
      badges: [badge("Welcome", "green")],
      title: `Welcome to XYVOO`,
      intro,
      body: `${detailsPanel([
        { label: "Shop name", value: storeName },
        { label: "Sign in with", value: to },
        { label: "Your dashboard", value: dashboardUrl.replace(/^https?:\/\//, ""), href: dashboardUrl },
        { label: "Your shop's web address", value: shopUrl.replace(/^https?:\/\//, ""), href: shopUrl },
      ])}
      <p style="margin:20px 0 8px;color:#1e293b;font-size:15px;font-weight:700">Next steps</p>
      <ol style="margin:0 0 16px;padding-left:20px;color:#1e293b;font-size:15px;line-height:1.7">
        <li>Add your first product.</li>
        <li>Add your payout account, so you get paid.</li>
        <li>Publish your shop. Until then, only you can see it.</li>
      </ol>
      <p style="margin:0;color:#64748b;font-size:14px;line-height:1.6">Forgotten your password? <a href="${escapeHtml(resetPasswordUrl)}" style="color:#007edf">Reset it here</a>. We'll never ask for your password by email.</p>`,
      buttons: [
        { label: "Go to my dashboard", href: dashboardUrl },
        { label: "Sign in", href: signInUrl, variant: "secondary" },
      ],
      footerNote: "You're receiving this because you created a shop on XYVOO with this address.",
    }),
    attachments: [logoAttachment()],
  });
}

export async function sendRegistrationOtpEmail({
  to,
  hotelName,
  otpCode,
}: {
  to: string;
  hotelName: string;
  otpCode: string;
}) {
  await transporter.sendMail({
    from: mailEnv.from,
    to,
    subject: "Your XYVOO registration verification code",
    text: `Hello ${hotelName}, your verification code is ${otpCode}. It expires in 10 minutes.`,
    html: renderEmail({
      preheader: `Your XYVOO verification code is ${otpCode}. It expires in 10 minutes.`,
      badges: [badge("Verification")],
      title: "Verify your email",
      intro: `Hello ${hotelName}, use this code to finish setting up your XYVOO account.`,
      body: `<div style="margin:0 0 20px;padding:24px;border:1px dashed #007edf;border-radius:12px;background:#f5faff;text-align:center">
        <div style="font-size:34px;font-weight:800;letter-spacing:10px;color:#000d1f;font-family:'Courier New',monospace">${escapeHtml(otpCode)}</div>
        <div style="margin-top:8px;font-size:13px;color:#64748b">Expires in 10 minutes</div>
      </div>
      <p style="margin:0;color:#64748b;font-size:14px;line-height:1.6">If you didn't start a registration with XYVOO, you can ignore this email. Nobody can use the code without access to your inbox.</p>`,
      footerNote: "You're receiving this because this address was used to register on XYVOO.",
    }),
    attachments: [logoAttachment()],
  });
}
