"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { COPY } from "@/lib/copy";
import { Card, Button, Field, Input } from "@/components/ui";
import { unlockOrganizer } from "@/app/actions/organizer";

/**
 * Code gate shown when the visitor isn't an organizer. The code is POSTed to a
 * server action (unlockOrganizer), validated against ORGANIZER_CODE server-side,
 * and on success an httpOnly cookie is set. The plaintext code NEVER appears in
 * a URL, query param, browser history, or server access log. The real gate is
 * server-side (requireOrganizer).
 */
export function OrganizerCodeGate() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    setInvalid(false);
    startTransition(async () => {
      const res = await unlockOrganizer(trimmed);
      if (res.ok) {
        setCode("");
        router.refresh(); // re-render the page; the cookie now unlocks it
      } else {
        setInvalid(true);
      }
    });
  }

  return (
    <Card popIn className="mx-auto w-full max-w-[28rem] p-6">
      <h1 className="display text-[1.75rem]">{COPY.organizer.title}</h1>
      <p className="mt-2 text-[0.95rem]" style={{ color: "var(--color-muted)" }}>
        {COPY.organizer.subhead}
      </p>
      <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3">
        <Field
          label={COPY.organizer.codeGateLabel}
          htmlFor="organizer-code"
          error={invalid ? COPY.errors.notOrganizer : undefined}
        >
          <Input
            id="organizer-code"
            name="code"
            type="password"
            autoComplete="off"
            placeholder={COPY.organizer.codeGatePlaceholder}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-invalid={invalid || undefined}
          />
        </Field>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Unlocking…" : COPY.organizer.codeGateCta}
        </Button>
      </form>
    </Card>
  );
}
