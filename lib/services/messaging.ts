/**
 * Messaging service layer (Stories 6-2, 6-3, 6-5).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { err, ok, type Result } from "@/lib/utils/result";

export interface ConversationSummary {
  id: string;
  renterPhone: string;
  renterDisplay: string;
  platformOrigin: "ksl" | "facebook" | "craigslist" | "direct" | null;
  lastMessageAt: string | null;
  unreadCount: number;
  preview: string;
  listingId: string | null;
  bookingId: string | null;
  listingName: string | null;
}

export interface ConversationThreadMessage {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  status: "received" | "sending" | "sent" | "failed";
  error: string | null;
  createdAt: string;
}

export interface ConversationThread {
  conversation: ConversationSummary;
  messages: ConversationThreadMessage[];
  bookingId: string | null;
  listingId: string | null;
  listingName: string | null;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 4) return `Renter •${digits.slice(-4)}`;
  return "Renter";
}

export async function fetchOperatorConversations(
  operatorId: string,
): Promise<Result<ConversationSummary[]>> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("conversations")
    .select(
      `id, renter_phone, platform_origin, unread_count_for_operator, last_message_at,
       booking_id, listing_id, listings(name),
       messages(id, body, direction, created_at)`,
    )
    .eq("operator_id", operatorId)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (error) return err("DATABASE_ERROR", error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[];

  const summaries: ConversationSummary[] = rows.map((row) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msgs = ((row.messages ?? []) as any[]).sort((a, b) =>
      String(b.created_at).localeCompare(String(a.created_at)),
    );
    const latest = msgs[0];
    return {
      id: row.id,
      renterPhone: row.renter_phone,
      renterDisplay: maskPhone(row.renter_phone),
      platformOrigin: row.platform_origin,
      lastMessageAt: row.last_message_at,
      unreadCount: row.unread_count_for_operator ?? 0,
      preview: latest?.body?.slice(0, 120) ?? "",
      listingId: row.listing_id ?? null,
      bookingId: row.booking_id ?? null,
      listingName: row.listings?.name ?? null,
    };
  });

  return ok(summaries);
}

export async function fetchConversationThread(args: {
  operatorId: string;
  conversationId: string;
}): Promise<Result<ConversationThread>> {
  const { operatorId, conversationId } = args;
  const admin = createAdminClient();
  const { data: convRow, error: convError } = await admin
    .from("conversations")
    .select(
      `id, renter_phone, platform_origin, unread_count_for_operator, last_message_at,
       operator_id, booking_id, listing_id,
       listings(name)`,
    )
    .eq("id", conversationId)
    .maybeSingle();

  if (convError) return err("DATABASE_ERROR", convError.message);
  if (!convRow) return err("NOT_FOUND", "Conversation not found");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conv = convRow as any;
  if (conv.operator_id !== operatorId) {
    return err("FORBIDDEN", "You do not have access to this conversation");
  }

  const { data: messagesData, error: messagesError } = await admin
    .from("messages")
    .select("id, direction, body, status, error, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (messagesError) return err("DATABASE_ERROR", messagesError.message);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const msgs = ((messagesData ?? []) as any[]).map((m) => ({
    id: m.id as string,
    direction: m.direction as "inbound" | "outbound",
    body: m.body as string,
    status: m.status as ConversationThreadMessage["status"],
    error: (m.error as string | null) ?? null,
    createdAt: m.created_at as string,
  }));

  return ok({
    conversation: {
      id: conv.id,
      renterPhone: conv.renter_phone,
      renterDisplay: maskPhone(conv.renter_phone),
      platformOrigin: conv.platform_origin,
      lastMessageAt: conv.last_message_at,
      unreadCount: conv.unread_count_for_operator ?? 0,
      preview: msgs[msgs.length - 1]?.body?.slice(0, 120) ?? "",
      listingId: conv.listing_id ?? null,
      bookingId: conv.booking_id ?? null,
      listingName: conv.listings?.name ?? null,
    },
    messages: msgs,
    bookingId: conv.booking_id ?? null,
    listingId: conv.listing_id ?? null,
    listingName: conv.listings?.name ?? null,
  });
}

export async function markConversationRead(args: {
  operatorId: string;
  conversationId: string;
}): Promise<Result<null>> {
  const { operatorId, conversationId } = args;
  const admin = createAdminClient();
  const { error } = await admin
    .from("conversations")
    .update({ unread_count_for_operator: 0 })
    .eq("id", conversationId)
    .eq("operator_id", operatorId);
  if (error) return err("DATABASE_ERROR", error.message);
  return ok(null);
}
