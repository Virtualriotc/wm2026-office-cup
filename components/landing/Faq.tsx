import { PREDICT_FAQ } from "@/lib/copy";

/**
 * The rules, in one place, at the bottom of the home page. Native <details>
 * accordions — zero JS, so it hydrates instantly and is CSP-safe. The "+"
 * rotates to an "×" when an item is open.
 */
export function Faq() {
  return (
    <section className="mx-auto w-full max-w-[44rem]">
      <h2 className="display mb-1 text-center text-[1.5rem]">Good to know</h2>
      <p
        className="mb-4 text-center text-[0.85rem]"
        style={{ color: "var(--color-muted)" }}
      >
        Everything you need, in one place. Tap a question.
      </p>

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
