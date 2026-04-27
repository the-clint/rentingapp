"use client";

import { usePathname } from "next/navigation";

import { BrandLogo } from "@/components/brand-logo";

const TITLE_MAP: Array<{ prefix: string; title: string }> = [
  { prefix: "/dashboard", title: "Dashboard" },
  { prefix: "/listings/new", title: "New listing" },
  { prefix: "/listings", title: "Listings" },
  { prefix: "/bookings", title: "Bookings" },
  { prefix: "/messages", title: "Messages" },
  { prefix: "/settings", title: "Settings" },
  { prefix: "/more", title: "More" },
];

function getPageTitle(pathname: string): string {
  const match = TITLE_MAP.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  return match?.title ?? "";
}

export function OperatorMobileTopBar() {
  const pathname = usePathname();
  const title = getPageTitle(pathname);

  return (
    <header
      aria-label="Page header"
      className="fixed top-0 inset-x-0 z-40 md:hidden h-14 bg-card border-b border-neutral-300 flex items-center justify-between px-space-3"
    >
      <BrandLogo href="/dashboard" variant="mark" height={32} imgClassName="rounded-md" />
      <h1 className="text-base font-semibold truncate ml-space-3">{title}</h1>
    </header>
  );
}
