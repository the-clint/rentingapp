import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyWebhookSignatureMock = vi.fn();
const insertMock = vi.fn();

vi.mock("@/lib/services/stripe", () => ({
  verifyWebhookSignature: (...args: unknown[]) =>
    verifyWebhookSignatureMock(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: vi.fn(() => ({
      insert: (row: unknown) => insertMock(row),
    })),
  }),
}));

import { POST } from "./route";

interface RequestInit {
  headers?: Record<string, string>;
  body?: string;
}

function makeRequest(init: RequestInit = {}) {
  const headers = new Headers(init.headers ?? {});
  return {
    headers: {
      get: (name: string) => headers.get(name),
    },
    text: async () => init.body ?? "",
  } as unknown as import("next/server").NextRequest;
}

beforeEach(() => {
  verifyWebhookSignatureMock.mockReset();
  insertMock.mockReset();
  insertMock.mockResolvedValue({ error: null });
});

describe("POST /api/webhooks/stripe", () => {
  it("returns 400 when stripe-signature header is missing", async () => {
    const res = await POST(makeRequest({ body: "{}" }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/stripe-signature/);
  });

  it("returns 400 when signature verification throws", async () => {
    verifyWebhookSignatureMock.mockImplementationOnce(() => {
      throw new Error("bad sig");
    });
    const res = await POST(
      makeRequest({
        body: "{}",
        headers: { "stripe-signature": "t=1,v1=x" },
      }),
    );
    expect(res.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("dedupes replayed events via 23505 unique-violation", async () => {
    verifyWebhookSignatureMock.mockReturnValue({
      id: "evt_1",
      type: "payment_intent.payment_failed",
    });
    insertMock.mockResolvedValueOnce({
      error: { code: "23505", message: "duplicate key" },
    });
    const res = await POST(
      makeRequest({
        body: "{}",
        headers: { "stripe-signature": "sig" },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { duplicate?: boolean };
    expect(json.duplicate).toBe(true);
  });

  it("records and 200-OKs a payment_intent.payment_failed event", async () => {
    verifyWebhookSignatureMock.mockReturnValue({
      id: "evt_2",
      type: "payment_intent.payment_failed",
    });
    const res = await POST(
      makeRequest({
        body: "{}",
        headers: { "stripe-signature": "sig" },
      }),
    );
    expect(res.status).toBe(200);
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        stripe_event_id: "evt_2",
        event_type: "payment_intent.payment_failed",
      }),
    );
  });

  it("200-OKs unknown event types without processing", async () => {
    verifyWebhookSignatureMock.mockReturnValue({
      id: "evt_3",
      type: "charge.refunded",
    });
    const res = await POST(
      makeRequest({
        body: "{}",
        headers: { "stripe-signature": "sig" },
      }),
    );
    expect(res.status).toBe(200);
  });
});
