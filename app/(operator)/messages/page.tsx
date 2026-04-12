/**
 * Operator messages page (Stories 6-2 / 6-3).
 */

import { notFound } from "next/navigation";
import { Suspense } from "react";

import { MessageHub } from "@/components/messaging/message-hub";
import {
  fetchConversationThread,
  fetchOperatorConversations,
} from "@/lib/services/messaging";
import { createClient } from "@/lib/supabase/server";

async function MessagesPageBody() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const convsResult = await fetchOperatorConversations(user.id);
  if (!convsResult.success) {
    return (
      <p className="text-small text-destructive">
        Could not load conversations: {convsResult.error.message}
      </p>
    );
  }
  const conversations = convsResult.data;

  const first = conversations[0];
  let initialThread = null;
  if (first) {
    const threadResult = await fetchConversationThread({
      operatorId: user.id,
      conversationId: first.id,
    });
    if (threadResult.success) initialThread = threadResult.data;
  }

  return (
    <div className="flex flex-col gap-space-4">
      <h1 className="text-h1 lg:text-h1-lg">Messages</h1>
      <MessageHub
        operatorId={user.id}
        initialConversations={conversations}
        initialThread={initialThread}
      />
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded bg-amber-100/30" />}>
      <MessagesPageBody />
    </Suspense>
  );
}
