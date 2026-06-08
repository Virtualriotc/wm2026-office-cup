"use client";

import { useState, useTransition } from "react";
import { JERSEY } from "@/lib/copy";
import { Card, Button } from "@/components/ui";
import { setJerseyOptIn } from "@/app/actions/account";

/**
 * Voluntary jersey-pool opt-in, on the Account page. Purely a flag on the user
 * — separate from login, change it any time. Optimistic toggle; reverts if the
 * server action fails.
 */
export function JerseyPool({ initialOptedIn }: { initialOptedIn: boolean }) {
  const [optedIn, setOptedIn] = useState(initialOptedIn);
  const [pending, startTransition] = useTransition();

  function toggle(next: boolean) {
    setOptedIn(next);
    startTransition(async () => {
      const res = await setJerseyOptIn(next);
      if (!res.ok) setOptedIn(!next); // revert on failure
    });
  }

  return (
    <Card className="mx-auto w-full max-w-[34rem] p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="display text-[1.25rem]">{JERSEY.title}</h2>
        <span className="nb-pill" style={{ fontSize: "0.62rem" }}>
          {JERSEY.badge}
        </span>
      </div>
      <p className="mt-2 text-[0.85rem]" style={{ color: "var(--color-muted)" }}>
        {JERSEY.blurb}
      </p>

      {optedIn ? (
        <div
          className="mt-4 rounded-[12px] p-4"
          style={{
            background: "var(--color-yellow)",
            border: "2px solid var(--color-ink)",
          }}
        >
          <p className="font-extrabold">{JERSEY.inTitle}</p>
          <p className="mt-1 text-[0.82rem]" style={{ color: "var(--color-ink)" }}>
            {JERSEY.inBody}
          </p>
          <div className="mt-3">
            <Button
              variant="secondary"
              onClick={() => toggle(false)}
              disabled={pending}
            >
              {pending ? JERSEY.working : JERSEY.optOutCta}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <p className="text-[0.72rem]" style={{ color: "var(--color-muted)" }}>
            {JERSEY.agree}
          </p>
          <div className="mt-3">
            <Button
              variant="primary"
              onClick={() => toggle(true)}
              disabled={pending}
            >
              {pending ? JERSEY.working : `${JERSEY.optInCta} →`}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
