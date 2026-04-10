"use client";

import { useEffect, useState } from "react";

import { OperatorMobileTabBar } from "./operator-mobile-tab-bar";
import { OperatorSidebar } from "./operator-sidebar";

const STORAGE_KEY = "operator-sidebar-collapsed";

/**
 * Collapse state has three values:
 *   - "auto"      → before mount; CSS responsive defaults drive widths.
 *                   md: 64px collapsed, lg: 240px expanded.
 *   - "collapsed" → user (or tablet auto-default) chose 64px icon-only.
 *   - "expanded"  → user (or desktop auto-default) chose 240px.
 *
 * The "auto" intermediate state exists so SSR / first paint never shows the
 * wrong width on tablet (which would otherwise flash from 240→64 after the
 * useEffect runs). On every viewport the "auto" classes resolve to the
 * correct width via Tailwind's `md:` / `lg:` responsive prefixes; the JS
 * just promotes to explicit classes after mount so the user can toggle.
 */
type CollapseState = "auto" | "collapsed" | "expanded";

interface OperatorShellProps {
  userEmailSlot: React.ReactNode;
  children: React.ReactNode;
}

export function OperatorShell({ userEmailSlot, children }: OperatorShellProps) {
  const [collapseState, setCollapseState] = useState<CollapseState>("auto");

  useEffect(() => {
    const stored =
      typeof window !== "undefined"
        ? window.sessionStorage.getItem(STORAGE_KEY)
        : null;
    if (stored === "true") {
      setCollapseState("collapsed");
      return;
    }
    if (stored === "false") {
      setCollapseState("expanded");
      return;
    }
    // No stored preference: tablet defaults to collapsed, desktop to expanded.
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setCollapseState("collapsed");
    } else {
      setCollapseState("expanded");
    }
  }, []);

  function toggleCollapsed() {
    setCollapseState((prev) => {
      const next: CollapseState =
        prev === "collapsed" ? "expanded" : "collapsed";
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(
          STORAGE_KEY,
          String(next === "collapsed"),
        );
      }
      return next;
    });
  }

  // Effective boolean for visual rendering. During "auto" we treat the
  // sidebar as expanded for label visibility — on tablet the CSS will still
  // shrink the container to 64px, hiding the labels via overflow.
  const isCollapsed = collapseState === "collapsed";

  const sidebarWidthClass =
    collapseState === "auto"
      ? "md:w-[64px] lg:w-[240px]"
      : collapseState === "collapsed"
        ? "w-[64px]"
        : "w-[240px]";

  const mainPaddingClass =
    collapseState === "auto"
      ? "md:pl-[64px] lg:pl-[240px]"
      : collapseState === "collapsed"
        ? "md:pl-[64px]"
        : "md:pl-[240px]";

  return (
    <div className="min-h-screen bg-neutral-100">
      <OperatorSidebar
        userEmailSlot={userEmailSlot}
        widthClass={sidebarWidthClass}
        isCollapsed={isCollapsed}
        showLabels={collapseState !== "collapsed"}
        onToggle={toggleCollapsed}
      />
      <OperatorMobileTabBar />
      <main
        className={[
          "min-h-screen bg-neutral-100",
          mainPaddingClass,
          // Reserve space for fixed mobile tab bar.
          "pb-14 md:pb-0",
          "transition-[padding] duration-150",
        ].join(" ")}
      >
        <div className="mx-auto w-full max-w-[1200px] px-space-4 py-space-6">
          {children}
        </div>
      </main>
    </div>
  );
}
