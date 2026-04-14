"use client";

/**
 * Message hub client component (Stories 6-2 / 6-3).
 *
 * Two-panel layout on desktop: conversation list (left) + active
 * thread (right). On mobile the list takes the full viewport and
 * tapping a conversation navigates to the thread via a client-side
 * state flip (no separate route for Story 6-2 MVP).
 */

import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  loadConversationThreadAction,
  markConversationReadAction,
  sendOperatorReply,
} from "@/lib/actions/messaging-actions";
import type {
  ConversationSummary,
  ConversationThread,
  ConversationThreadMessage,
} from "@/lib/services/messaging";

export interface MessageHubProps {
  operatorId: string;
  initialConversations: ConversationSummary[];
  initialThread: ConversationThread | null;
}

const PLATFORM_BADGE: Record<
  NonNullable<ConversationSummary["platformOrigin"]>,
  { label: string; className: string }
> = {
  ksl: { label: "KSL", className: "bg-blue-100 text-blue-800" },
  facebook: { label: "FB", className: "bg-blue-200 text-blue-900" },
  craigslist: {
    label: "CL",
    className: "bg-purple-100 text-purple-800",
  },
  direct: { label: "Direct", className: "bg-muted text-neutral-900" },
};

function formatTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function MessageHub({
  initialConversations,
  initialThread,
}: MessageHubProps) {
  const [conversations, setConversations] =
    useState<ConversationSummary[]>(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(
    initialThread?.conversation.id ?? null,
  );
  const [thread, setThread] = useState<ConversationThread | null>(initialThread);
  const [replyText, setReplyText] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const messageListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = messageListRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [thread?.messages.length]);

  async function handleSelect(conversation: ConversationSummary) {
    setActiveId(conversation.id);
    setError(null);
    const result = await loadConversationThreadAction(conversation.id);
    if (result.success) {
      setThread(result.data);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversation.id ? { ...c, unreadCount: 0 } : c,
        ),
      );
      void markConversationReadAction(conversation.id);
    } else {
      setError(result.error.message);
    }
  }

  async function handleSend(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!activeId) return;
    const trimmed = replyText.trim();
    if (!trimmed) return;

    // Optimistic message bubble.
    const optimisticId = `optimistic-${Date.now()}`;
    const optimistic: ConversationThreadMessage = {
      id: optimisticId,
      direction: "outbound",
      body: trimmed,
      status: "sending",
      error: null,
      createdAt: new Date().toISOString(),
    };
    setThread((prev) =>
      prev
        ? { ...prev, messages: [...prev.messages, optimistic] }
        : prev,
    );
    setReplyText("");

    startTransition(async () => {
      const result = await sendOperatorReply(activeId, trimmed);
      if (!result.success) {
        setError(result.error.message);
        setThread((prev) =>
          prev
            ? {
                ...prev,
                messages: prev.messages.map((m) =>
                  m.id === optimisticId
                    ? { ...m, status: "failed", error: result.error.message }
                    : m,
                ),
              }
            : prev,
        );
        return;
      }
      setThread((prev) =>
        prev
          ? {
              ...prev,
              messages: prev.messages.map((m) =>
                m.id === optimisticId
                  ? {
                      ...m,
                      id: result.data.messageId,
                      status: result.data.status,
                    }
                  : m,
              ),
            }
          : prev,
      );
    });
  }

  if (conversations.length === 0) {
    return (
      <div
        className="rounded-lg border border-dashed border-neutral-300 bg-muted p-space-6 text-center"
        data-testid="messages-empty-state"
      >
        <p className="text-small text-neutral-900">
          No messages yet. When renters reach out, conversations will
          appear here.
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex h-[70vh] flex-col gap-space-2 lg:flex-row"
      data-testid="message-hub"
    >
      <aside
        className="lg:w-[300px] lg:shrink-0 overflow-y-auto border border-border bg-card rounded-lg"
        data-testid="conversation-list"
      >
        <ul>
          {conversations.map((conv) => {
            const badge = conv.platformOrigin
              ? PLATFORM_BADGE[conv.platformOrigin]
              : null;
            const active = conv.id === activeId;
            return (
              <li key={conv.id}>
                <button
                  type="button"
                  onClick={() => void handleSelect(conv)}
                  data-testid={`conversation-item-${conv.id}`}
                  data-active={active ? "true" : undefined}
                  className={cn(
                    "flex w-full flex-col gap-1 border-b border-border px-space-3 py-space-2 text-left hover:bg-muted",
                    active && "bg-[hsl(var(--primary))]/10",
                  )}
                >
                  <div className="flex items-center justify-between gap-space-2">
                    <span
                      className={cn(
                        "truncate text-small font-semibold text-neutral-900",
                        conv.unreadCount > 0 && "font-bold",
                      )}
                    >
                      {conv.renterDisplay}
                    </span>
                    {badge ? (
                      <span
                        className={cn(
                          "rounded px-1.5 text-xs font-semibold",
                          badge.className,
                        )}
                      >
                        {badge.label}
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-neutral-700">
                    {conv.preview || "No messages yet"}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {formatTime(conv.lastMessageAt)}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <section
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-space-2 rounded-lg border border-border bg-card",
          !thread && "hidden lg:flex",
        )}
        data-testid="conversation-thread"
      >
        {thread ? (
          <>
            <header className="flex items-center justify-between border-b border-border px-space-3 py-space-2">
              <div>
                <p className="text-small font-semibold text-neutral-900">
                  {thread.conversation.renterDisplay}
                </p>
                <p className="text-xs text-neutral-700">
                  {thread.conversation.renterPhone}
                  {thread.listingName ? ` · ${thread.listingName}` : ""}
                </p>
              </div>
              {thread.conversation.platformOrigin ? (
                <span
                  className={cn(
                    "rounded px-2 py-0.5 text-xs font-semibold",
                    PLATFORM_BADGE[thread.conversation.platformOrigin]
                      .className,
                  )}
                >
                  {PLATFORM_BADGE[thread.conversation.platformOrigin].label}
                </span>
              ) : null}
            </header>

            <div
              ref={messageListRef}
              className="flex-1 overflow-y-auto px-space-3 py-space-2"
              role="log"
              aria-live="polite"
            >
              {thread.messages.length === 0 ? (
                <p className="text-small text-neutral-700">
                  No messages in this conversation yet.
                </p>
              ) : (
                <ul className="flex flex-col gap-space-2">
                  {thread.messages.map((m) => (
                    <li
                      key={m.id}
                      data-testid={`message-${m.direction}`}
                      data-status={m.status}
                      className={cn(
                        "max-w-[85%] rounded-md px-space-3 py-space-2 text-small",
                        m.direction === "inbound"
                          ? "self-start bg-neutral-100 text-neutral-900"
                          : "self-end bg-[hsl(var(--primary))] text-white",
                      )}
                    >
                      <p className="whitespace-pre-wrap">{m.body}</p>
                      <p className="mt-1 text-xs opacity-80">
                        {m.direction === "outbound"
                          ? m.status === "sending"
                            ? "Sending…"
                            : m.status === "failed"
                              ? "Failed — retry"
                              : "Sent"
                          : formatTime(m.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {error ? (
              <p
                role="alert"
                className="px-space-3 text-small text-destructive"
              >
                {error}
              </p>
            ) : null}

            <form
              onSubmit={handleSend}
              className="flex items-center gap-space-2 border-t border-border p-space-2"
              data-testid="message-compose"
            >
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={`Reply to ${thread.conversation.renterDisplay}`}
                aria-label={`Reply to ${thread.conversation.renterDisplay}`}
                className="flex-1 rounded-md border border-neutral-300 px-space-2 py-space-2 text-small"
              />
              <Button
                type="submit"
                disabled={replyText.trim().length === 0 || isPending}
              >
                {isPending ? "Sending…" : "Send"}
              </Button>
            </form>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-small text-neutral-700">
              Select a conversation to view.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
