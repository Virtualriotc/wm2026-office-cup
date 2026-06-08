"use client";

import { useTransition } from "react";
import { motion } from "motion/react";
import { JERSEY_INTRO } from "@/lib/copy";
import { Button } from "@/components/ui";
import { usePrefersReducedMotion } from "@/components/ui/useReducedMotion";
import { setJerseyOptIn } from "@/app/actions/account";

/**
 * Shown ONCE, right after a new player has saved their code and tapped Continue
 * (never over the code itself — the code-saving moment must stay uncluttered).
 * Explains the voluntary jersey pool in full, then either opts the (already
 * signed-in) new user in or lets them skip. Both paths call `onDone`, which the
 * parent uses to navigate on to the predictions.
 */
export function JerseyIntroModal({ onDone }: { onDone: () => void }) {
  const reduce = usePrefersReducedMotion();
  const [pending, startTransition] = useTransition();

  function join() {
    startTransition(async () => {
      await setJerseyOptIn(true);
      onDone();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(17, 17, 17, 0.55)" }}
      role="dialog"
      aria-modal="true"
      aria-label={JERSEY_INTRO.title}
      onClick={() => !pending && onDone()}
    >
      <motion.div
        className="w-full max-w-[32rem] rounded-[16px] p-6"
        style={{
          background: "var(--color-cream)",
          border: "2.5px solid var(--color-ink)",
          boxShadow: "var(--shadow-hard)",
        }}
        onClick={(e) => e.stopPropagation()}
        initial={reduce ? false : { opacity: 0, scale: 0.94, y: 12 }}
        animate={reduce ? undefined : { opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 26 }}
      >
        <p
          className="text-[0.72rem] font-extrabold uppercase tracking-[0.08em]"
          style={{ color: "var(--color-royal)" }}
        >
          {JERSEY_INTRO.eyebrow}
        </p>
        <h2 className="display text-[1.6rem]">{JERSEY_INTRO.title}</h2>
        <p className="mt-1.5 text-[0.9rem]" style={{ color: "var(--color-ink)" }}>
          {JERSEY_INTRO.lead}
        </p>

        <dl className="mt-4 flex flex-col gap-2.5">
          {JERSEY_INTRO.points.map((p) => (
            <div
              key={p.h}
              className="rounded-[10px] px-3 py-2"
              style={{ background: "var(--color-haze)" }}
            >
              <dt className="text-[0.82rem] font-extrabold">{p.h}</dt>
              <dd className="text-[0.85rem]" style={{ color: "var(--color-ink)" }}>
                {p.b}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-4 text-[0.72rem]" style={{ color: "var(--color-muted)" }}>
          {JERSEY_INTRO.agree}
        </p>

        <div className="mt-3 flex flex-col gap-2.5 sm:flex-row-reverse">
          <Button
            type="button"
            variant="primary"
            onClick={join}
            disabled={pending}
            className="sm:flex-1"
          >
            {pending ? "Saving…" : `${JERSEY_INTRO.joinCta} →`}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => !pending && onDone()}
            disabled={pending}
            className="sm:flex-1"
          >
            {JERSEY_INTRO.skipCta}
          </Button>
        </div>

        <p
          className="mt-3 text-center text-[0.72rem]"
          style={{ color: "var(--color-muted)" }}
        >
          {JERSEY_INTRO.footnote}
        </p>
      </motion.div>
    </div>
  );
}
