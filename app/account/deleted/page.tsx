import Link from "next/link";
import { COPY } from "@/lib/copy";

// Standalone, signed-out confirmation shown AFTER a successful data deletion.
// It lives at its own route (not inside /account) on purpose: a Server Action
// auto-revalidates the page it ran on, so a success message rendered back on
// /account is immediately swapped for the signed-out join form. Redirecting here
// gives the player an unambiguous "you're deleted" — the bug was that a real
// deletion looked like it silently bounced you to the signup screen.
//
// Dynamic so the per-request CSP nonce (middleware.ts) is stamped onto it.
export const dynamic = "force-dynamic";

export default function AccountDeletedPage() {
  return (
    <section className="flex flex-col items-center gap-6 py-20 text-center">
      <h1 className="display text-[clamp(2rem,7vw,3rem)]">
        {COPY.account.removeDoneTitle}
      </h1>
      <p
        className="max-w-[28rem] text-[1rem]"
        style={{ color: "var(--color-muted)" }}
      >
        {COPY.account.removeDone}
      </p>
      <Link href="/" className="nb-btn nb-btn--primary no-underline">
        {COPY.account.removeDoneCta}
      </Link>
    </section>
  );
}
