import { COPY } from "@/lib/copy";
import { getStore, isMockStore } from "@/lib/data";
import { Hero } from "@/components/landing/Hero";
import { JoinCards } from "@/components/landing/JoinCards";
import { Steps } from "@/components/landing/Steps";
import { computeFirstKickoff } from "@/components/scoreboard/scoreboardState";

// Landing + JOIN/CODE flow. A server component: it loads the department list
// from the data store (mock by default), then hands it to the interactive
// JoinCards (a client component) which drives createAccount / continueWithCode.
export default async function HomePage() {
  const store = getStore();
  const [departments, matches] = await Promise.all([
    store.getDepartments(),
    store.getMatches(),
  ]);
  const firstKickoff = computeFirstKickoff(matches);

  return (
    <div className="flex flex-col items-center gap-10 py-6">
      <Hero copy={COPY} kickoff={firstKickoff} />

      <JoinCards copy={COPY} departments={departments} />

      <Steps copy={COPY} />

      <p
        className="max-w-[34rem] text-center text-[0.8rem]"
        style={{ color: "var(--color-muted)" }}
      >
        {COPY.hero.disclaimer}
      </p>

      {isMockStore() ? (
        <p className="nb-pill" style={{ fontSize: "0.7rem" }}>
          Demo mode — running on sample data (no database configured)
        </p>
      ) : null}
    </div>
  );
}
