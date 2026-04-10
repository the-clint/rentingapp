import {
  Calendar,
  LayoutDashboard,
  MessageSquare,
  MoreHorizontal,
  Package,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

/**
 * Desktop / tablet sidebar nav items.
 * Order and contents are fixed — mirrors UX spec §Navigation Patterns.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Listings", href: "/listings", icon: Package },
  { label: "Bookings", href: "/bookings", icon: Calendar },
  { label: "Messages", href: "/messages", icon: MessageSquare },
  { label: "Settings", href: "/settings", icon: Settings },
] as const;

/**
 * Mobile bottom tab bar items (4 tabs).
 * Dashboard is intentionally omitted per UX spec — reachable via More.
 */
export const MOBILE_TAB_ITEMS: readonly NavItem[] = [
  { label: "Listings", href: "/listings", icon: Package },
  { label: "Bookings", href: "/bookings", icon: Calendar },
  { label: "Messages", href: "/messages", icon: MessageSquare },
  { label: "More", href: "/more", icon: MoreHorizontal },
] as const;
