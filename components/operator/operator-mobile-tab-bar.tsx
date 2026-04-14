"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { MOBILE_TAB_ITEMS } from "./nav-items";

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

export function OperatorMobileTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary mobile"
      className={cn(
        "fixed bottom-0 inset-x-0 z-40 md:hidden",
        "h-14 pb-[env(safe-area-inset-bottom)]",
        "bg-card border-t border-neutral-300",
        "flex items-stretch justify-around",
      )}
    >
      {MOBILE_TAB_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            aria-label={item.label}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 min-w-[44px] min-h-[44px] px-space-2 flex-1",
              active ? "text-primary" : "text-neutral-500",
            )}
          >
            <Icon aria-hidden="true" className="size-5 shrink-0" />
            <span className="text-caption leading-none">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
