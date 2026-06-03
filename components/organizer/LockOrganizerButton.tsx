"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { lockOrganizer } from "@/app/actions/organizer";

/**
 * "Lock organizer" — clears the organizer cookie for this browser, so the next
 * render falls back to the code gate. Server-side (clearOrganizerSession via the
 * lockOrganizer action); we just refresh after.
 */
export function LockOrganizerButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleLock() {
    startTransition(async () => {
      await lockOrganizer();
      router.refresh();
    });
  }

  return (
    <Button variant="secondary" onClick={handleLock} disabled={pending}>
      {pending ? "Locking…" : "Lock organizer"}
    </Button>
  );
}
