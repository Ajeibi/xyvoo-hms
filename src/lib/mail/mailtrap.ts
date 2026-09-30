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
