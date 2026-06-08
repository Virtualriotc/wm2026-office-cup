"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import type { CopyShape } from "@/lib/copy";
import { JERSEY } from "@/lib/copy";
import type { Department } from "@/lib/types";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import { usePrefersReducedMotion } from "@/components/ui/useReducedMotion";
import { createAccount, continueWithCode } from "@/app/actions/account";

const NEXT_ROUTE = "/predict";

/**
 * The two side-by-side join cards:
 *   1. "New here?"  — name + department + consent -> Get my code. On success the
 *      card flips to the one-time code reveal (copy + continue).
 *   2. "Have a code?" — paste MP-XXXX -> Continue (resume an existing account).
 *
 * Both call server actions (account.ts); all auth/state lives server-side. This
 * component only orchestrates the form, the code reveal, and navigation.
 */
export function JoinCards({
  copy,
  departments,
}: {
  copy: CopyShape;
  departments: Department[];
}) {
  return (
    <div className="grid w-full max-w-[46rem] grid-cols-1 gap-5 md:grid-cols-2">
      <Card popIn delay={0.04} className="p-6">
        <NewHereCard copy={copy} departments={departments} />
      </Card>
      <Card popIn delay={0.12} className="p-6">
        <HaveCodeCard copy={copy} />
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// New here? — create account, then reveal the one-time code.
// ---------------------------------------------------------------------------

/** Sentinel <select> value: "I want to type a brand-new department". */
const ADD_NEW_DEPARTMENT = "__add_new_department__";

function NewHereCard({
  copy,
  departments,
}: {
  copy: CopyShape;
  departments: Department[];
}) {
  const router = useRouter();
  const reduce = usePrefersReducedMotion();
  const nameId = useId();
  const deptId = useId();
  const newDeptId = useId();
  const consentId = useId();

  const [name, setName] = useState("");
  // The picker value: an existing department id, or ADD_NEW_DEPARTMENT when the
  // player wants to start their own lane (which reveals the free-text field).
  const [department, setDepartment] = useState(departments[0]?.id ?? "");
  const [newDepartment, setNewDepartment] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  const addingNew = department === ADD_NEW_DEPARTMENT;
  // The value handed to the server: a known id, or the typed (trimmed) name.
  const chosenDepartment = addingNew ? newDepartment.trim() : department;
  const canSubmit =
    name.trim().length > 0 && consent && chosenDepartment.length > 0;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await createAccount(name, chosenDepartment, consent);
      if (res.ok) {
        setCode(res.code);
      } else {
        setError(res.error);
      }
    });
  }

  async function onCopy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setCopyFailed(false);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked (some browsers/contexts). DON'T fail silently — at the
      // signup moment a missed copy means a lost, unrecoverable code. Tell them
      // to copy by hand (the code is select-all on screen).
      setCopied(false);
      setCopyFailed(true);
    }
  }

  // --- one-time code reveal ---
  if (code) {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="code"
          className="flex flex-col gap-4"
          initial={reduce ? false : { opacity: 0, scale: 0.96 }}
          animate={reduce ? undefined : { opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 420, damping: 24 }}
        >
          <h2 className="display text-[1.4rem]">{copy.code.savedTitle}</h2>
          <p
            className="text-[0.9rem] font-semibold"
            style={{ color: "var(--color-ink)" }}
          >
            {copy.code.savedSubhead}
          </p>
          <output
            className="tnum select-all break-all rounded-[12px] border-[2.5px] border-[var(--color-ink)] bg-[var(--color-yellow)] px-4 py-3 text-center text-[1.35rem] font-extrabold tracking-wide"
            style={{ boxShadow: "var(--shadow-hard-sm)" }}
            aria-label={copy.code.savedTitle}
          >
            {code}
          </output>
          <Button type="button" variant="secondary" onClick={onCopy}>
            {copied ? copy.code.copied + " ✓" : copy.code.copyCta}
          </Button>
          {copyFailed ? (
            <p
              className="text-[0.8rem] font-bold"
              style={{ color: "var(--color-coral)" }}
              role="alert"
            >
              Couldn&apos;t copy automatically — tap the code above to select it,
              then copy it by hand. Don&apos;t lose it.
            </p>
          ) : null}
          <Button
            type="button"
            variant="primary"
            onClick={() => router.push(NEXT_ROUTE)}
          >
            {copy.code.continueCta} →
          </Button>
          <p
            className="text-center text-[0.72rem]"
            style={{ color: "var(--color-muted)" }}
          >
            {JERSEY.nudge}
          </p>
        </motion.div>
      </AnimatePresence>
    );
  }

  // --- create-account form ---
  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
      <div>
        <p className="text-[0.75rem] font-extrabold uppercase tracking-[0.08em]"
          style={{ color: "var(--color-royal)" }}>
          {copy.join.eyebrow}
        </p>
        <h2 className="display text-[1.4rem]">{copy.join.title}</h2>
        <p className="mt-1 text-[0.85rem]" style={{ color: "var(--color-muted)" }}>
          {copy.join.subhead}
        </p>
      </div>

      <Field
        label={copy.join.nameLabel}
        htmlFor={nameId}
        helper={copy.join.nameHelper}
      >
        <Input
          id={nameId}
          name="displayName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={copy.join.namePlaceholder}
          maxLength={40}
          autoComplete="off"
          required
        />
      </Field>

      <Field
        label={copy.join.departmentLabel}
        htmlFor={deptId}
        helper={copy.join.departmentHelper}
      >
        <Select
          id={deptId}
          name="departmentId"
          value={department}
          onChange={(e) => {
            setDepartment(e.target.value);
            setError(null);
          }}
          required
        >
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
          <option value={ADD_NEW_DEPARTMENT}>
            {copy.join.departmentAddOption}
          </option>
        </Select>
      </Field>

      {addingNew ? (
        <Field
          label={copy.join.newDepartmentLabel}
          htmlFor={newDeptId}
          helper={copy.join.newDepartmentHelper}
        >
          <Input
            id={newDeptId}
            name="newDepartment"
            value={newDepartment}
            onChange={(e) => {
              setNewDepartment(e.target.value);
              setError(null);
            }}
            placeholder={copy.join.newDepartmentPlaceholder}
            maxLength={40}
            autoComplete="off"
            autoFocus
            required
          />
          <button
            type="button"
            className="self-start text-[0.78rem] font-bold underline underline-offset-2"
            style={{ color: "var(--color-royal)" }}
            onClick={() => {
              setDepartment(departments[0]?.id ?? "");
              setNewDepartment("");
              setError(null);
            }}
          >
            {copy.join.departmentBackToList}
          </button>
        </Field>
      ) : null}

      <label
        htmlFor={consentId}
        className="flex cursor-pointer items-start gap-2.5 text-[0.8rem]"
      >
        <input
          id={consentId}
          name="consent"
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-5 w-5 flex-none accent-[var(--color-green)]"
          style={{ accentColor: "var(--color-green)" }}
        />
        <span>{copy.join.consentCheckbox}</span>
      </label>

      <p className="text-[0.78rem]" style={{ color: "var(--color-muted)" }}>
        {copy.join.prizeLine}
      </p>

      {error ? (
        <p role="alert" className="text-[0.8rem] font-bold"
          style={{ color: "var(--color-coral)" }}>
          {error}
        </p>
      ) : null}

      <Button type="submit" variant="primary" disabled={!canSubmit || pending}>
        {pending ? "…" : copy.code.getMyCodeCta + " →"}
      </Button>

      <p className="text-[0.72rem]" style={{ color: "var(--color-muted)" }}>
        {copy.join.privacyFooter}
      </p>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Have a code? — paste to resume.
// ---------------------------------------------------------------------------

function HaveCodeCard({ copy }: { copy: CopyShape }) {
  const router = useRouter();
  const codeId = useId();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = code.trim();
    if (trimmed.length === 0) return;
    startTransition(async () => {
      const res = await continueWithCode(trimmed);
      if (res.ok) {
        router.push(NEXT_ROUTE);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <form className="flex h-full flex-col gap-4" onSubmit={onSubmit} noValidate>
      <div>
        <p className="text-[0.75rem] font-extrabold uppercase tracking-[0.08em]"
          style={{ color: "var(--color-royal)" }}>
          {copy.code.eyebrow}
        </p>
        <h2 className="display text-[1.4rem]">{copy.code.pasteTitle}</h2>
        <p className="mt-1 text-[0.85rem]" style={{ color: "var(--color-muted)" }}>
          {copy.code.pasteSubhead}
        </p>
      </div>

      <Field
        label={copy.code.pasteLabel}
        htmlFor={codeId}
        error={error ?? undefined}
      >
        <Input
          id={codeId}
          name="code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder={copy.code.pastePlaceholder}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="tnum uppercase"
          aria-invalid={error ? true : undefined}
        />
      </Field>

      <div className="mt-auto">
        <Button
          type="submit"
          variant="secondary"
          disabled={code.trim().length === 0 || pending}
          className="w-full"
        >
          {pending ? "…" : copy.code.pasteCta + " →"}
        </Button>
      </div>
    </form>
  );
}
