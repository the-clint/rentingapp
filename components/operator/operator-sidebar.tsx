"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { cn } from "@/lib/utils";
import { signOut } from "@/lib/actions/auth-actions";
import { NAV_ITEMS } from "./nav-items";

interface OperatorSidebarProps {
  userEmailSlot: React.ReactNode;
  /**
   * Tailwind class string for the sidebar's width — owned by `OperatorShell`
   * so the main-content padding can stay in sync with the sidebar's actual
   * size on every viewport.
   */
  widthClass: string;
  /** True when the user has explicitly collapsed the sidebar. Used for
   *  `aria-expanded` and the toggle button icon. */
  isCollapsed: boolean;
  /** Visual hint: render labels alongside icons. False ⇒ icon-only. */
  showLabels: boolean;
  onToggle: () => void;
}

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

export function OperatorSidebar({
  userEmailSlot,
  widthClass,
  isCollapsed,
  showLabels,
  onToggle,
}: OperatorSidebarProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      data-collapsed={isCollapsed}
      className={cn(
        "fixed inset-y-0 left-0 z-40 hidden md:flex flex-col text-white",
        "transition-[width] duration-150",
        widthClass,
      )}
      style={{
        background: "linear-gradient(180deg, #C45A2D 0%, #2E3E50 100%)",
      }}
    >
      {/* Logo / wordmark */}
      <div
        className={cn(
          "flex items-center h-16 px-space-4 border-b border-white/10",
          !showLabels && "justify-center px-0",
        )}
      >
        {showLabels ? (
          <span className="text-h2 font-bold tracking-tight">RentingApp</span>
        ) : (
          <span aria-hidden="true" className="text-h2 font-bold" title="RentingApp">
            R
          </span>
        )}
      </div>

      {/* Nav items */}
      <ul className="flex-1 flex flex-col gap-space-1 py-space-4">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                aria-label={!showLabels ? item.label : undefined}
                className={cn(
                  "flex items-center gap-space-3 h-11 mx-space-2 px-space-3 rounded-md text-small font-medium transition-colors",
                  "hover:bg-white/10",
                  active &&
                    "bg-primary-light/80 text-neutral-900 border-l-[3px] border-primary",
                  !active && "text-white",
                  !showLabels && "justify-center px-0 mx-space-1",
                )}
              >
                <Icon aria-hidden="true" className="size-5 shrink-0" />
                {showLabels && <span className="truncate">{item.label}</span>}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Footer: collapse toggle, user email, sign out */}
      <div className="border-t border-white/10 py-space-2 flex flex-col gap-space-1">
        <button
          type="button"
          onClick={onToggle}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!isCollapsed}
          className={cn(
            "mx-space-2 flex items-center gap-space-3 h-11 px-space-3 rounded-md text-small text-white hover:bg-white/10 transition-colors",
            !showLabels && "justify-center px-0 mx-space-1",
          )}
        >
          {isCollapsed ? (
            <PanelLeftOpen aria-hidden="true" className="size-5 shrink-0" />
          ) : (
            <PanelLeftClose aria-hidden="true" className="size-5 shrink-0" />
          )}
          {showLabels && <span>Collapse</span>}
        </button>

        {showLabels && userEmailSlot}

        <form action={signOut}>
          <button
            type="submit"
            aria-label="Sign out"
            className={cn(
              "mx-space-2 mb-space-2 flex items-center gap-space-3 h-11 px-space-3 rounded-md text-small text-white hover:bg-white/10 transition-colors w-[calc(100%-16px)]",
              !showLabels && "justify-center px-0 mx-space-1 w-[calc(100%-8px)]",
            )}
          >
            <LogOut aria-hidden="true" className="size-5 shrink-0" />
            {showLabels && <span>Sign out</span>}
          </button>
        </form>
      </div>
    </nav>
  );
}
