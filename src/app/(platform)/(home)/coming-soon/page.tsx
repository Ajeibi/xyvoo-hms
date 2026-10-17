import { permanentRedirect } from "next/navigation";
import { WAITLIST_PATH } from "@/lib/auth-lock";

/** The old "launching soon" page, kept so existing links land on the waitlist. */
export default function ComingSoonPage() {
  permanentRedirect(WAITLIST_PATH);
}
