import type { CopyShape } from "@/lib/copy";
import { Card, StepBadge } from "@/components/ui";

/**
 * The four numbered steps: Create account -> Save your code -> Pick matches ->
 * Watch scores. Yellow ink-bordered badges (StepBadge) inside one cream card.
 * Stacks on mobile, runs as a row on wider screens.
 */
export function Steps({ copy }: { copy: CopyShape }) {
  const steps = [
    copy.hero.steps.createAccount,
    copy.hero.steps.saveCode,
    copy.hero.steps.pickMatches,
    copy.hero.steps.watchScores,
  ];

  return (
    <Card popIn delay={0.1} className="w-full max-w-[46rem] p-6">
      <h2 className="display mb-5 text-[1.4rem]">How it works</h2>
      <ol className="flex flex-col gap-4 text-left sm:flex-row sm:justify-between sm:gap-3">
        {steps.map((label, i) => (
          <li key={label} className="flex-1">
            <StepBadge n={i + 1} label={label} delay={0.15 + i * 0.07} />
          </li>
        ))}
      </ol>
    </Card>
  );
}
