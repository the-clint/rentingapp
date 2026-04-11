"use server";

/**
 * Messaging Server Actions (Story 6-3).
 *
 * `sendOperatorReply(conversationId, body)` — authenticates the
 * operator, verifies ownership of the conversation, writes a
 * `messages` row in `sending` state, calls Twilio, flips the row to
 * `sent` (or `failed`), and updates `conversations.last_message_at`.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchConversationThread,
  type ConversationThread,
} from "@/lib/services/messaging";
import { sendSms } from "@/lib/services/twilio";
import { createClient } from "@/lib/supabase/server";
import { err, ok, type Result } from "@/lib/utils/result";

export interface SendOperatorReplyResult {
  messageId: string;
  conversationId: string;
  status: "sent" | "failed";
}

async function getOperatorSession(): Promise<{ userId: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const role = (user.app_metadata as { role?: string } | null)?.role;
  if (role === "renter") return null;
  return { userId: user.id };
}

export async function sendOperatorReply(
  conversationId: string,
  body: string,
): Promise<Result<SendOperatorReplyResult>> {
  if (!conversationId || typeof conversationId !== "string") {
    return err("NOT_FOUND", "Missing conversation id") as Result<SendOperatorReplyResult>;
  }
  const trimmed = (body ?? "").trim();
  if (trimmed.length === 0) {
    return err(
      "EMPTY_BODY",
      "Message body cannot be empty",
    ) as Result<SendOperatorReplyResult>;
  }
  if (trimmed.length > 1600) {
    return err(
      "BODY_TOO_LONG",
      "Message body exceeds 1600 characters",
    ) as Result<SendOperatorReplyResult>;
  }

  const session = await getOperatorSession();
  if (!session) {
    return err(
      "UNAUTHENTICATED",
      "Sign in as an operator to continue",
    ) as Result<SendOperatorReplyResult>;
  }

  const admin = createAdminClient();
  const { data: convData, error: convError } = await admin
    .from("conversations")
    .select("id, operator_id, renter_phone")
    .eq("id", conversationId)
    .maybeSingle();
  if (convError) {
    return err(
      "DATABASE_ERROR",
      convError.message,
    ) as Result<SendOperatorReplyResult>;
  }
  if (!convData) {
    return err(
      "NOT_FOUND",
      "Conversation not found",
    ) as Result<SendOperatorReplyResult>;
  }
  const conv = convData as {
    id: string;
    operator_id: string;
    renter_phone: string;
  };
  if (conv.operator_id !== session.userId) {
    return err(
      "FORBIDDEN",
      "You do not have access to this conversation",
    ) as Result<SendOperatorReplyResult>;
  }

  // Insert the message in `sending` state for optimistic UI on refresh.
  const { data: inserted, error: insertError } = await admin
    .from("messages")
    .insert({
      conversation_id: conv.id,
      direction: "outbound",
      sender_phone: conv.renter_phone,
      body: trimmed,
      status: "sending",
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return err(
      "DATABASE_ERROR",
      insertError?.message ?? "Failed to queue message",
    ) as Result<SendOperatorReplyResult>;
  }
  const messageId = (inserted as { id: string }).id;

  try {
    const twilioResult = await sendSms({
      to: conv.renter_phone,
      body: trimmed,
    });
    await admin
      .from("messages")
      .update({
        status: "sent",
        twilio_sid: twilioResult.sid,
      })
      .eq("id", messageId);
    await admin
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conv.id);

    // Audit trail in sms_log.
    await admin.from("sms_log").insert({
      direction: "outbound",
      purpose: "operator-reply",
      phone: conv.renter_phone,
      body: trimmed,
      status: "sent",
      operator_id: session.userId,
    });

    return ok({
      messageId,
      conversationId: conv.id,
      status: "sent",
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Twilio send failed";
    await admin
      .from("messages")
      .update({ status: "failed", error: message })
      .eq("id", messageId);
    await admin.from("sms_log").insert({
      direction: "outbound",
      purpose: "operator-reply",
      phone: conv.renter_phone,
      body: trimmed,
      status: "failed",
      error: message,
      operator_id: session.userId,
    });
    return ok({
      messageId,
      conversationId: conv.id,
      status: "failed",
    });
  }
}

export async function loadConversationThreadAction(
  conversationId: string,
): Promise<Result<ConversationThread>> {
  const session = await getOperatorSession();
  if (!session) {
    return err("UNAUTHENTICATED", "Sign in") as Result<ConversationThread>;
  }
  return fetchConversationThread({
    operatorId: session.userId,
    conversationId,
  });
}

export async function markConversationReadAction(
  conversationId: string,
): Promise<Result<null>> {
  const session = await getOperatorSession();
  if (!session) {
    return err("UNAUTHENTICATED", "Sign in") as Result<null>;
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("conversations")
    .update({ unread_count_for_operator: 0 })
    .eq("id", conversationId)
    .eq("operator_id", session.userId);
  if (error) return err("DATABASE_ERROR", error.message) as Result<null>;
  return ok(null);
}
