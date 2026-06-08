"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CopyShape } from "@/lib/copy";
import { Pill, Tag } from "@/components/ui";
import { PlayerCountBadge } from "@/components/PlayerCountBadge";

const LINKS = [
  { href: "/predict", key: "predict" as const },
  { href: "/scoreboard", key: "scoreboard" as const },
  { href: "/organizer", key: "organizer" as const },
  { href: "/account", key: "account" as const },
];

/**
 * Top pill nav: brand + the four surfaces (Predict / Scoreboard / Organizer /
 * Account) + the "unofficial · no betting" tag. The active route's pill is
 * highlighted. Routes themselves are built by later agents; this nav is the
 * stable shell.
 */
export function TopNav({ copy }: { copy: CopyShape }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 mx-auto flex w-full max-w-[1100px] flex-col gap-2 px-5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="display text-[1.15rem] no-underline">
          {copy.app.brand}
        </Link>
        <div className="flex items-center gap-2">
          <PlayerCountBadge />
          <Tag>{copy.app.unofficialTag}</Tag>
        </div>
      </div>
      <nav aria-label="Primary" className="flex flex-wrap gap-2">
        {LINKS.map((link) => {
          const active =
            pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className="no-underline"
            >
              <Pill active={active}>{copy.app.nav[link.key]}</Pill>
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
