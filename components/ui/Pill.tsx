import type { ComponentPropsWithoutRef, ReactNode } from "react";

export interface PillProps extends ComponentPropsWithoutRef<"span"> {
  children: ReactNode;
  active?: boolean;
  /**
   * Marks the pill as interactive: it gains the same hard-shadow + lift +
   * translate-on-press treatment as buttons. `active` implies pressable.
   */
  pressable?: boolean;
}

/**
 * Rounded pill for nav items and inline tags. `active` paints it yellow for
 * the current nav target and gives it the tactile button shadow/press;
 * `pressable` opts an inactive pill into the same treatment. Render as a child
 * of a link for navigation use.
 */
export function Pill({
  children,
  active = false,
  pressable = false,
  className = "",
  ...props
}: PillProps) {
  const tactile = active || pressable;
  const cls = `nb-pill ${tactile ? "nb-pill--pressable" : ""} ${
    active ? "bg-yellow" : ""
  } ${className}`.trim();
  return (
    <span
      className={cls}
      style={active ? { background: "var(--color-yellow)" } : undefined}
      {...props}
    >
      {children}
    </span>
  );
}
