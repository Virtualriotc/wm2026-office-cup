import Link from "next/link";

// Branded 404. Dynamic so the per-request CSP nonce (see middleware.ts) is
// stamped onto its scripts: the default Next not-found is statically
// prerendered with NO nonce, which the strict script-src blocks — a wall of
// console errors on every mistyped URL. Forcing dynamic keeps it nonced and
// clean. Server-only (a plain Link), so there's no client JS to hydrate anyway.
export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <section className="flex flex-col items-center gap-6 py-16 text-center">
      <p className="display leading-none text-[5rem]">404</p>
      <h1 className="display text-[1.6rem]">Out of bounds</h1>
      <p
        className="max-w-[26rem] text-[0.95rem]"
        style={{ color: "var(--color-muted)" }}
      >
        We couldn&apos;t find that page. Head back to the cup to keep making your
        picks.
      </p>
      <Link href="/" className="nb-btn nb-btn--primary">
        Back to the cup →
      </Link>
    </section>
  );
}
