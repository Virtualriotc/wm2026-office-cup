import { COPY } from "@/lib/copy";
import { getStore, isMockStore } from "@/lib/data";
import { getCurrentUser } from "@/lib/auth";
import { JoinCards } from "@/components/landing/JoinCards";
import { AccountManage } from "@/components/account/AccountManage";

// Account / join surface. The TopNav "Account" pill and the signed-out predict
// prompt both link here, so it must exist (a missing route 404s mid-funnel).
// Signed OUT: the same JOIN/CODE flow as the landing page (create an account or
// resume with a code), without the marketing hero. Signed IN: the management
// surface — sign out + self-service data removal (GDPR right-to-erasure).
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const [departments, user] = await Promise.all([
    getStore().getDepartments(),
    getCurrentUser(),
  ]);

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
          {user ? COPY.account.removeBody : COPY.join.subhead}
        </p>
      </header>

      {user ? (
        <AccountManage copy={COPY} displayName={user.displayName} />
      ) : (
        <JoinCards copy={COPY} departments={departments} />
      )}

      <p
        className="max-w-[34rem] text-center text-[0.8rem]"
        style={{ color: "var(--color-muted)" }}
      >
        {COPY.disclaimers.privacyFooter}
      </p>

      {isMockStore() ? (
        <p className="nb-pill" style={{ fontSize: "0.7rem" }}>
          Demo mode — running on sample data (no database configured)
        </p>
      ) : null}
    </div>
  );
}
