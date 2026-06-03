"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { seedFixturesAction } from "@/app/actions/organizer";

/**
 * Seed fixtures/bracket/kickoffs from openfootball (graceful fallback to the
 * bundled set). Idempotent — safe to tap more than once. Authorization comes
 * from the organizer cookie (set on unlock), not a prop.
 */
export function SeedButton() {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  function handleSeed() {
    startTransition(async () => {
      const res = await seedFixturesAction();
      setNote(res.ok ? res.message ?? "Seeded." : res.error ?? "Seed failed.");
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" onClick={handleSeed} disabled={pending}>
        {pending ? "Seeding…" : "Seed fixtures"}
      </Button>
      {note ? (
        <p className="text-[0.78rem]" style={{ color: "var(--color-muted)" }}>
          {note}
        </p>
      ) : null}
    </div>
  );
}
