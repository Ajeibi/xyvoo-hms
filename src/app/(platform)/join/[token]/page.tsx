import type { Metadata } from "next";
import Image from "next/image";
import JoinTeam from "@/components/storefront/JoinTeam";
import { LOGO_URL } from "@/constants/branding";
import { STORE_ROLE_LABELS } from "@/lib/store/access";
import { findAuthUserByEmail } from "@/lib/auth/account-codes";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getInviteByToken, storeNameAndSlug } from "@/lib/store/team";
import { inviteState, isWellFormedToken, ROLE_DESCRIPTIONS } from "@/lib/store/team-rules";

// The link token is in the address, so it must never be passed on to another site.
export const metadata: Metadata = { title: "Join a shop team", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function JoinTeamPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = isWellFormedToken(token) ? await getInviteByToken(token) : null;
  const state = invite ? inviteState(invite) : "invalid";

  let props: React.ComponentProps<typeof JoinTeam> = { token, state: state === "open" ? "invalid" : state };
  if (invite && state === "open") {
    const auth = await createSupabaseAuthServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    const [store, existing] = await Promise.all([storeNameAndSlug(invite.tenant_id), findAuthUserByEmail(invite.email).catch(() => null)]);
    let alreadyMember = false;
    if (user && (user.email || "").toLowerCase() === invite.email) {
      const { data } = await createServerSupabaseClient().schema("store").from("memberships").select("id").eq("tenant_id", invite.tenant_id).eq("user_id", user.id).maybeSingle();
      alreadyMember = Boolean(data);
    }
    props = {
      token,
      state: "open",
      storeName: store?.storeName || "a shop",
      dashboardPath: store ? `/storefront/${store.slug}/dashboard` : "/auth/login/storefront",
      name: invite.name,
      email: invite.email,
      roleLabel: STORE_ROLE_LABELS[invite.role],
      roleDescription: ROLE_DESCRIPTIONS[invite.role],
      signedInEmail: user?.email ?? null,
      hasAccount: Boolean(existing),
      alreadyMember,
    };
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-[72px] max-w-3xl items-center px-4 sm:px-6">
          <Image src={LOGO_URL} alt="XYVOO" width={125} height={50} className="h-[50px] w-auto" />
        </div>
      </header>
      <main className="mx-auto max-w-lg px-4 py-10 sm:px-6">
        <JoinTeam {...props} />
      </main>
    </div>
  );
}
