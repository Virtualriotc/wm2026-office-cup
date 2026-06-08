import { PREDICT_FAQ } from "@/lib/copy";
import { STAGE_POINTS } from "@/lib/scoring";
import { stageLabel } from "@/components/predict/predict-helpers";
import type { Stage } from "@/lib/types";

// Rounds in tournament order, for the scoring table. Points come from
// STAGE_POINTS (the real scoring source), so this table can never drift.
const STAGE_ORDER: Stage[] = ["group", "r32", "r16", "qf", "sf", "final"];

/**
 * The rules, in one place, at the bottom of the home page: an always-visible
 * scoring table, then a short FAQ. Native <details> accordions — zero JS, so it
 * hydrates instantly and is CSP-safe. The "+" rotates to an "×" when open.
 */
export function Faq() {
  return (
    <section className="mx-auto w-full max-w-[44rem]">
      <h2 className="display mb-1 text-center text-[1.5rem]">Scoring &amp; FAQ</h2>
      <p
        className="mb-5 text-center text-[0.85rem]"
        style={{ color: "var(--color-muted)" }}
      >
        Points per round, and the questions people usually ask.
      </p>

      {/* Always-visible scoring table. */}
      <div
        className="mb-3 rounded-[14px] px-4 py-4 sm:px-5"
        style={{
          background: "var(--color-cream)",
          border: "2.5px solid var(--color-ink)",
          boxShadow: "var(--shadow-hard-sm)",
        }}
      >
        <h3 className="font-extrabold">How scoring works</h3>
        <p className="mt-0.5 text-[0.85rem]" style={{ color: "var(--color-muted)" }}>
          Get a match right and you score that round&apos;s points. Later rounds
          are worth more.
        </p>

        <ul className="mt-3 flex flex-col">
          {STAGE_ORDER.map((stage, i) => {
            const pts = STAGE_POINTS[stage];
            return (
              <li
                key={stage}
                className="flex items-center justify-between py-1.5 text-[0.92rem]"
                style={
                  i === 0
                    ? undefined
                    : { borderTop: "1.5px solid var(--color-haze)" }
                }
              >
                <span className="font-semibold">{stageLabel(stage)}</span>
                <span
                  className="tnum select-none rounded-full px-2.5 py-0.5 text-[0.8rem] font-extrabold"
                  style={{
                    background: "var(--color-yellow)",
                    border: "2px solid var(--color-ink)",
                  }}
                >
                  {pts} {pts === 1 ? "pt" : "pts"}
                </span>
              </li>
            );
          })}
        </ul>

        <p className="mt-3 text-[0.8rem]" style={{ color: "var(--color-muted)" }}>
          A wrong pick scores zero, with no penalty. Draws only count in the
          group stage.
        </p>
      </div>

      {/* FAQ accordions. */}
      <div className="flex flex-col gap-2.5">
        {PREDICT_FAQ.map((item) => (
          <details
            key={item.q}
            className="group rounded-[14px] px-4 py-3"
            style={{
              background: "var(--color-cream)",
              border: "2.5px solid var(--color-ink)",
              boxShadow: "var(--shadow-hard-sm)",
            }}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-extrabold marker:hidden">
              <span>{item.q}</span>
              <span
                className="select-none text-[1.4rem] leading-none transition-transform duration-200 group-open:rotate-45"
                style={{ color: "var(--color-royal)" }}
                aria-hidden
              >
                +
              </span>
            </summary>
            <p
              className="mt-2.5 text-[0.9rem] leading-relaxed"
              style={{ color: "var(--color-ink)" }}
            >
              {item.a}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
