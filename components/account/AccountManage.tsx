"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CopyShape } from "@/lib/copy";
import { fill } from "@/lib/copy";
import { Card, Button } from "@/components/ui";
import { removeMe, signOut } from "@/app/actions/account";

/**
 * Signed-in account controls: sign out, and self-service data removal (GDPR
 * right-to-erasure). Removal is a TWO-STEP confirm so it can't be a one-tap
 * accident — the first tap arms it, the second tap does the irreversible delete.
 *
 * On success the server has already deleted the user + their picks and cleared
 * the session; we show a friendly confirmation and refresh, which re-renders the
 * page in its signed-out state.
 */
export function AccountManage({
  copy,
  displayName,
}: {
  copy: CopyShape;
  displayName: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSignOut() {
    startTransition(async () => {
      await signOut();
      router.refresh();
    });
  }

  function handleRemove() {
    startTransition(async () => {
      await removeMe();
      setDone(true);
      router.refresh();
    });
  }

  if (done) {
    return (
      <Card popIn className="mx-auto w-full max-w-[34rem] p-6">
        <p className="font-bold" role="status">
          {copy.account.removeDone}
        </p>
      </Card>
    );
  }

  return (
    <Card className="mx-auto w-full max-w-[34rem] p-6">
      <div className="flex flex-col gap-1">
        <h2 className="display text-[1.25rem]">{copy.account.manageTitle}</h2>
        <p className="text-[0.9rem]" style={{ color: "var(--color-muted)" }}>
          {fill(copy.account.signedInAs, { name: displayName })}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Button variant="secondary" onClick={handleSignOut} disabled={pending}>
          {copy.account.signOutCta}
        </Button>
      </div>

      <div
        className="mt-5 border-t pt-5"
        style={{ borderColor: "var(--color-ink)" }}
      >
        <h3 className="font-bold">{copy.account.removeTitle}</h3>
        <p
          className="mt-1 text-[0.85rem]"
          style={{ color: "var(--color-muted)" }}
        >
          {copy.account.removeBody}
        </p>

        {confirming ? (
          <div className="mt-3 flex flex-col gap-3">
            <p
              className="text-[0.85rem] font-bold"
              style={{ color: "var(--color-coral)" }}
              role="alert"
            >
              {copy.account.removeConfirmPrompt}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="primary"
                onClick={handleRemove}
                disabled={pending}
              >
                {pending
                  ? copy.account.removeWorking
                  : copy.account.removeConfirmCta}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setConfirming(false)}
                disabled={pending}
              >
                {copy.account.removeCancelCta}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <Button
              variant="secondary"
              onClick={() => setConfirming(true)}
              disabled={pending}
            >
              {copy.account.removeCta}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
