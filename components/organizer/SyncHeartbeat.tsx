"use client";

import { useState, useTransition } from "react";
import { COPY, fill } from "@/lib/copy";
import type { SyncStatus } from "@/lib/data";
import { Button } from "@/components/ui";
import { syncNowAction } from "@/app/actions/organizer";

/** A bare "x ago" string the {time} slot of organizer.lastSyncedLabel fills. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export interface SyncHeartbeatProps {
  status: SyncStatus;
}

/**
 * Last-synced heartbeat + a manual "sync now" trigger, reading the store's
 * getSyncStatus(): when the feed last ran, how many results it has recorded,
 * and the last sync note. Results arrive automatically; this is just the
 * "is the feed alive?" pulse. Sync degrades gracefully (no key / over-limit)
 * and never affects the source of truth. Authorization comes from the organizer
 * cookie (set on unlock), not a prop.
 */
export function SyncHeartbeat({ status }: SyncHeartbeatProps) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(status.lastSyncNote);

  function handleSync() {
    startTransition(async () => {
      const res = await syncNowAction();
      setNote(res.message ?? res.error ?? null);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{
              background: status.lastSyncAt
                ? "var(--color-green)"
                : "var(--color-muted)",
            }}
          />
          <p className="text-[0.85rem] font-bold">
            {status.lastSyncAt
              ? fill(COPY.organizer.lastSyncedLabel, {
                  time: relativeTime(status.lastSyncAt),
                })
              : COPY.organizer.neverSynced}
          </p>
          <span className="nb-pill tnum" style={{ fontSize: "0.7rem" }}>
            {fill(COPY.organizer.feedCountLabel, {
              count: status.feedResultCount,
            })}
          </span>
        </div>
        <Button variant="secondary" onClick={handleSync} disabled={pending}>
          {pending ? COPY.organizer.syncingLabel : COPY.organizer.syncNowCta}
        </Button>
      </div>
      {note ? (
        <p className="text-[0.78rem]" style={{ color: "var(--color-muted)" }}>
          {note}
        </p>
      ) : null}
    </div>
  );
}
