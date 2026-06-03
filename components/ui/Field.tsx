import type { ComponentPropsWithoutRef, ReactNode } from "react";

export interface FieldProps {
  label: string;
  htmlFor: string;
  helper?: string;
  /** Inline error message; sets aria-invalid on the control via aria-describedby. */
  error?: string;
  children: ReactNode;
}

/**
 * Labelled form field wrapper: visible label, optional helper + error text,
 * with accessible wiring. Pair with <Input> or a <select>.
 */
export function Field({ label, htmlFor, helper, error, children }: FieldProps) {
  const helperId = helper ? `${htmlFor}-helper` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="font-bold text-[0.95rem]">
        {label}
      </label>
      {children}
      {helper && !error ? (
        <p id={helperId} className="text-[0.8rem]" style={{ color: "var(--color-muted)" }}>
          {helper}
        </p>
      ) : null}
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="text-[0.8rem] font-bold"
          style={{ color: "var(--color-coral)" }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface InputProps extends ComponentPropsWithoutRef<"input"> {}

/** Neo-brutalist text input (.nb-input): cream, ink border, hard shadow. */
export function Input({ className = "", ...props }: InputProps) {
  return <input className={`nb-input ${className}`.trim()} {...props} />;
}

export interface SelectProps extends ComponentPropsWithoutRef<"select"> {}

/**
 * Neo-brutalist select: shares .nb-input chrome but strips the native arrow
 * (appearance:none) and paints a custom ink chevron via .nb-select, so it
 * matches the brutalist text inputs instead of the OS dropdown.
 */
export function Select({ className = "", children, ...props }: SelectProps) {
  return (
    <select className={`nb-input nb-select ${className}`.trim()} {...props}>
      {children}
    </select>
  );
}
