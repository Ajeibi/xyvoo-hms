import nodemailer from "nodemailer";
import { getMailEnv } from "@/lib/env";
import { badge, escapeHtml, logoAttachment, renderEmail } from "@/lib/mail/layout";

const mailEnv = getMailEnv();

const transporter = nodemailer.createTransport({
  host: mailEnv.host,
  port: mailEnv.port,
  secure: false,
  auth: {
    user: mailEnv.user,
    pass: mailEnv.pass,
  },
});

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
