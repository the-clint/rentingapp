"use client";

/**
 * Operator real-time notifications (Story 6-5).
 *
 * Mounted in the operator shell. Subscribes via Supabase Realtime to:
 *   - `messages` INSERT where direction='inbound' (message hub badge)
 *   - `bookings` INSERT/UPDATE (booking badge + lifecycle toasts)
 *   - `sms_log` INSERT where status='failed' (delivery failure toast)
 *
 * Toasts are a minimal in-component queue (no external toast library
 * dependency) that auto-dismiss after 5 seconds. On mobile the toast
 * anchors to the top-center; on desktop to the top-right.
 */

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

interface Toast {
  id: string;
  title: string;
  body?: string;
}

export function RealtimeNotifications({
  operatorId,
}: {
  operatorId: string;
}) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    if (!operatorId) return;
    const supabase = createClient();

    const pushToast = (toast: Omit<Toast, "id">) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev, { ...toast, id }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 5000);
    };

    const channels = [
      supabase
        .channel(`operator-${operatorId}-messages`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `direction=eq.inbound`,
          },
          (payload) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const row = payload.new as any;
            pushToast({
              title: "New message",
              body: String(row?.body ?? "").slice(0, 120),
            });
          },
        )
        .subscribe(),
      supabase
        .channel(`operator-${operatorId}-bookings`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "bookings",
          },
          (payload) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const row = (payload.new ?? payload.old) as any;
            if (!row) return;
            if (payload.eventType === "INSERT" && row.status === "confirmed") {
              pushToast({
                title: "New booking",
                body: `Dates ${row.start_date} → ${row.end_date}`,
              });
            } else if (
              payload.eventType === "UPDATE" &&
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (payload.old as any)?.status !== row.status
            ) {
              pushToast({
                title: `Booking ${row.status}`,
                body: `Dates ${row.start_date} → ${row.end_date}`,
              });
            }
          },
        )
        .subscribe(),
      supabase
        .channel(`operator-${operatorId}-sms-failures`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "sms_log",
            filter: `status=eq.failed`,
          },
          (payload) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const row = payload.new as any;
            pushToast({
              title: "SMS delivery failed",
              body: `${row.purpose ?? "sms"} — message saved, retry from the hub.`,
            });
          },
        )
        .subscribe(),
    ];

    return () => {
      for (const ch of channels) {
        supabase.removeChannel(ch);
      }
    };
  }, [operatorId]);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed left-0 right-0 top-4 z-50 flex flex-col items-center gap-2 px-4 md:items-end md:pr-6"
      data-testid="operator-toasts"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto max-w-sm rounded-lg border border-[hsl(var(--primary))]/30 bg-card p-3 shadow-lg"
          data-testid="operator-toast"
        >
          <p className="text-small font-semibold text-neutral-900">{t.title}</p>
          {t.body ? (
            <p className="text-xs text-neutral-700">{t.body}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
