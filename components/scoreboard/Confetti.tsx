"use client";

import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "@/components/ui/useReducedMotion";

// ============================================================================
// FULL-TIME CONFETTI — decorative only.
//
// Two deliberate choices:
//   1. Pieces are generated in an EFFECT, never during render. Random values
//      computed on the server would not match the client's, and React would
//      throw a hydration mismatch. Server renders nothing; the confetti is a
//      purely client-side flourish layered over an already-complete page.
//   2. It removes itself when the fall finishes. A celebration that keeps
//      animating while someone reads the final table is just a distraction.
//
// Reduced motion renders nothing at all — there is no "calm" version of
// confetti worth showing, and the page is complete without it.
// ============================================================================

const COLORS = [
  "var(--color-gold)",
  "var(--color-yellow)",
  "var(--color-coral)",
  "var(--color-royal)",
  "var(--color-green)",
  "var(--color-sky)",
  "var(--color-teal)",
];

interface Piece {
  id: number;
  left: number;
  delay: number;
  duration: number;
  drift: number;
  spin: number;
  color: string;
  round: boolean;
  scale: number;
}

function makePieces(count: number): Piece[] {
  return Array.from({ length: count }, (_, id) => ({
    id,
    left: Math.random() * 100,
    delay: Math.random() * 2.2,
    duration: 3.4 + Math.random() * 2.6,
    drift: (Math.random() - 0.5) * 220,
    spin: 360 + Math.random() * 900,
    color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
    round: Math.random() < 0.28,
    scale: 0.7 + Math.random() * 0.8,
  }));
}

export function Confetti({ count = 70 }: { count?: number }) {
  const reduce = usePrefersReducedMotion();
  const [pieces, setPieces] = useState<Piece[]>([]);

  useEffect(() => {
    if (reduce) return;
    setPieces(makePieces(count));
    // Longest possible life = max delay + max duration, plus a little slack.
    const done = setTimeout(() => setPieces([]), 9000);
    return () => clearTimeout(done);
  }, [count, reduce]);

  if (reduce || pieces.length === 0) return null;

  return (
    <div className="nb-confetti" aria-hidden>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="nb-confetti__piece"
          style={{
            left: `${p.left}%`,
            background: p.color,
            borderRadius: p.round ? "50%" : 2,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `scale(${p.scale})`,
            ["--drift" as string]: `${p.drift}px`,
            ["--spin" as string]: `${p.spin}deg`,
          }}
        />
      ))}
    </div>
  );
}
