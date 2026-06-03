import type { SVGProps } from "react";

export interface BallProps extends Omit<SVGProps<SVGSVGElement>, "fill"> {
  /** Rendered size in px (width == height). Default 36. */
  size?: number;
}

/**
 * Flat inline soccer ball matching the neo-brutalist line aesthetic: a thick
 * ink stroke, cream body, and a yellow center pentagon, no gradients or blur.
 * Replaces the ⚽ emoji so the ball renders identically across platforms and
 * sits in the same ink+flat-fill language as the rest of the system.
 *
 * Decorative by default (aria-hidden); pass an `aria-label` + role if it ever
 * needs to be announced.
 */
export function Ball({ size = 36, className = "", ...props }: BallProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      fill="none"
      aria-hidden="true"
      {...props}
    >
      {/* body */}
      <circle
        cx="24"
        cy="24"
        r="20"
        fill="var(--color-cream)"
        stroke="var(--color-ink)"
        strokeWidth="2.5"
      />
      {/* center pentagon — the signature yellow patch */}
      <path
        d="M24 13.5 33 20 29.5 30.5 18.5 30.5 15 20Z"
        fill="var(--color-yellow)"
        stroke="var(--color-ink)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* seams running from each pentagon vertex out to the rim */}
      <g stroke="var(--color-ink)" strokeWidth="2.5" strokeLinecap="round">
        <path d="M24 13.5 24 4.2" />
        <path d="M33 20 41.5 16.5" />
        <path d="M29.5 30.5 35.5 38.5" />
        <path d="M18.5 30.5 12.5 38.5" />
        <path d="M15 20 6.5 16.5" />
      </g>
    </svg>
  );
}
