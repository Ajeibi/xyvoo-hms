import nodemailer from "nodemailer";
import { getMailEnv } from "@/lib/env";

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
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>Verify your email</h2>
        <p>Hello ${hotelName},</p>
        <p>Your XYVOO verification code is:</p>
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px;">${otpCode}</p>
        <p>This code expires in 10 minutes.</p>
      </div>
    `,
  });
}
