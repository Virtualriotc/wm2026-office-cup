import type { ReactNode } from "react";

export interface TagProps {
  children: ReactNode;
  className?: string;
}

/**
 * Small uppercase label badge, e.g. "UNOFFICIAL OFFICE GAME · NO BETTING".
 * Yellow fill, ink border (.nb-tag).
 */
export function Tag({ children, className = "" }: TagProps) {
  return <span className={`nb-tag ${className}`.trim()}>{children}</span>;
}
