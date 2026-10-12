/** A WhatsApp link (wa.me) for a Nigerian, Ghanaian, Kenyan or South African number, or null if it can't be turned into one. */
export function whatsappLink(phone: string | null, message: string, countryCode = "NG") {
  if (!phone) return null;
  let digits = phone.replace(/[^0-9+]/g, "");
  const dial: Record<string, string> = { NG: "234", GH: "233", KE: "254", ZA: "27" };
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = (dial[countryCode] || "234") + digits.slice(1);
  if (!/^[1-9][0-9]{7,14}$/.test(digits)) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
