import { redirect } from "next/navigation";
import { COPY } from "@/lib/copy";
import { getCurrentUser } from "@/lib/auth";
import { AccountManage } from "@/components/account/AccountManage";
import { JerseyPool } from "@/components/account/JerseyPool";

// Account / join surface. The TopNav "Account" pill and the signed-out predict
// prompt both link here, so it must exist (a missing route 404s mid-funnel).
// Signed OUT: the same JOIN/CODE flow as the landing page (create an account or
// resume with a code), without the marketing hero. Signed IN: the management
// surface — sign out + self-service data removal (GDPR right-to-erasure).
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await getCurrentUser();
  // Signed OUT -> go home. Joining belongs on the landing page, where the
  // one-time code reveal survives. A signed-out /account used to host the full
  // join form, but after a signup the Server Action revalidated THIS route,
  // swapped the JoinCards reveal for the signed-in management view, and the code
  // vanished before the user could save it (they'd be locked out). Home has both
  // join + resume, so nothing is lost and the swap can never happen here.
  if (!user) redirect("/");

  return (
    <div className="flex flex-col items-center gap-8 py-6">
      <header className="flex flex-col items-center gap-2 text-center">
        <h1 className="display text-[clamp(2rem,7vw,3.25rem)]">
          {COPY.app.nav.account}
        </h1>
        <p
          className="max-w-[34rem] text-[0.95rem]"
          style={{ color: "var(--color-muted)" }}
        >
          {COPY.account.removeBody}
        </p>
      </header>

      <AccountManage copy={COPY} displayName={user.displayName} />

      <JerseyPool initialOptedIn={user.jerseyOptIn} />

      <p
        className="max-w-[34rem] text-center text-[0.8rem]"
        style={{ color: "var(--color-muted)" }}
      >
        {COPY.disclaimers.privacyFooter}
      </p>
    </div>
  );
}
