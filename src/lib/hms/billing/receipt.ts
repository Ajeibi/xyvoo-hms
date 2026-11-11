import { badge, detailsPanel, EMAIL_SITE_URL } from "@/lib/mail/layout";
import { sendBrandedEmail } from "@/lib/mail/mailtrap";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatKobo } from "./money";
import type { PlatformChargeRow } from "./types";

/** The payment receipt emailed to whoever paid XYVOO. Only reference and amount; no card details exist here. */
export async function sendChargeReceipt(charge: PlatformChargeRow) {
  if (!charge.payerEmail) return;
  const { data: tenant } = await createServerSupabaseClient().from("tenants").select("subdomain, name, display_name").eq("id", charge.tenantId).maybeSingle();
  const hotel = (tenant?.display_name as string) || (tenant?.name as string) || "Your hotel";
  const slug = (tenant?.subdomain as string) || (tenant?.name as string) || "";
  const amount = formatKobo(charge.amountKobo, charge.currency);
  const paidOn = new Date(charge.paidAt ?? Date.now()).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  const link = `${EMAIL_SITE_URL}/hms/${slug}/settings#platform-payments-title`;

  await sendBrandedEmail({
    to: charge.payerEmail,
    subject: `Receipt: ${amount} paid to XYVOO`,
    text: `Thank you. We received ${amount} from ${hotel} for ${charge.description}.\n\nReference: ${charge.reference}\nPaid: ${paidOn}\n\nYou can see all your payments to XYVOO in Settings: ${link}`,
    layout: {
      preheader: `We received ${amount} for ${charge.description}.`,
      badges: [badge("Payment received", "green")],
      title: "Thank you, we've got your payment",
      intro: `${hotel} paid ${amount} to XYVOO for ${charge.description}.`,
      body: detailsPanel([
        { label: "For", value: charge.description },
        { label: "Amount", value: amount },
        { label: "Paid", value: paidOn },
        { label: "Reference", value: charge.reference },
      ]),
      buttons: [{ label: "See your payments", href: link }],
      footerNote: "You get this because you made a payment to XYVOO from your hotel's settings.",
    },
  });
}
