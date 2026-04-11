import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  cancelExtensionIntent,
  cancelPaymentIntent,
  createBookingHoldIntent,
  createExtensionHoldIntent,
  getStripeServerClient,
  resetStripeClientForTests,
  verifyWebhookSignature,
} from "./stripe";

interface FakeStripeShape {
  paymentIntents: {
    create: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  };
  webhooks: {
    constructEvent: ReturnType<typeof vi.fn>;
  };
}

function makeFakeStripe(): FakeStripeShape {
  return {
    paymentIntents: {
      create: vi.fn(),
      cancel: vi.fn(),
    },
    webhooks: {
      constructEvent: vi.fn(),
    },
  };
}

beforeEach(() => {
  resetStripeClientForTests();
  process.env.STRIPE_SECRET_KEY = "sk_test_abc";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_xyz";
});

describe("getStripeServerClient", () => {
  it("throws a helpful error when STRIPE_SECRET_KEY is missing", () => {
    delete process.env.STRIPE_SECRET_KEY;
    expect(() => getStripeServerClient()).toThrow(/STRIPE_SECRET_KEY/);
  });

  it("returns a cached singleton across calls", () => {
    const a = getStripeServerClient();
    const b = getStripeServerClient();
    expect(a).toBe(b);
  });
});

describe("createBookingHoldIntent", () => {
  it("creates a manual-capture PaymentIntent with booking metadata", async () => {
    const fake = makeFakeStripe();
    fake.paymentIntents.create.mockResolvedValue({
      id: "pi_123",
      client_secret: "pi_123_secret_abc",
    });

    const result = await createBookingHoldIntent({
      bookingId: "b-1",
      amountCents: 15000,
      metadata: { listing_id: "L-1" },
      stripe: fake as never,
    });

    expect(result).toEqual({
      clientSecret: "pi_123_secret_abc",
      paymentIntentId: "pi_123",
    });

    expect(fake.paymentIntents.create).toHaveBeenCalledTimes(1);
    const args = fake.paymentIntents.create.mock.calls[0][0];
    expect(args.amount).toBe(15000);
    expect(args.currency).toBe("usd");
    expect(args.capture_method).toBe("manual");
    expect(args.automatic_payment_methods).toEqual({ enabled: true });
    expect(args.metadata).toMatchObject({
      booking_id: "b-1",
      listing_id: "L-1",
      story: "3-5",
    });
  });

  it("rejects a non-positive amount", async () => {
    const fake = makeFakeStripe();
    await expect(
      createBookingHoldIntent({
        bookingId: "b-1",
        amountCents: 0,
        metadata: {},
        stripe: fake as never,
      }),
    ).rejects.toThrow(/positive integer/);
  });

  it("throws when Stripe omits the client_secret", async () => {
    const fake = makeFakeStripe();
    fake.paymentIntents.create.mockResolvedValue({ id: "pi_x", client_secret: null });
    await expect(
      createBookingHoldIntent({
        bookingId: "b-1",
        amountCents: 100,
        metadata: {},
        stripe: fake as never,
      }),
    ).rejects.toThrow(/client_secret/);
  });
});

describe("createExtensionHoldIntent", () => {
  it("creates a manual-capture delta PaymentIntent with extension metadata", async () => {
    const fake = makeFakeStripe();
    fake.paymentIntents.create.mockResolvedValue({
      id: "pi_ext_1",
      client_secret: "pi_ext_1_secret_zzz",
    });

    const result = await createExtensionHoldIntent({
      bookingId: "b-1",
      amountCents: 5000,
      metadata: { listing_id: "L-1", renter_id: "R-1" },
      stripe: fake as never,
    });

    expect(result).toEqual({
      clientSecret: "pi_ext_1_secret_zzz",
      paymentIntentId: "pi_ext_1",
    });

    const args = fake.paymentIntents.create.mock.calls[0][0];
    expect(args.amount).toBe(5000);
    expect(args.capture_method).toBe("manual");
    expect(args.automatic_payment_methods).toEqual({ enabled: true });
    expect(args.metadata).toMatchObject({
      booking_id: "b-1",
      listing_id: "L-1",
      renter_id: "R-1",
      story: "4-2",
      kind: "extension",
    });
  });

  it("rejects a non-positive amount", async () => {
    const fake = makeFakeStripe();
    await expect(
      createExtensionHoldIntent({
        bookingId: "b-1",
        amountCents: 0,
        metadata: {},
        stripe: fake as never,
      }),
    ).rejects.toThrow(/positive integer/);
  });

  it("throws when Stripe omits the client_secret", async () => {
    const fake = makeFakeStripe();
    fake.paymentIntents.create.mockResolvedValue({ id: "pi_x", client_secret: null });
    await expect(
      createExtensionHoldIntent({
        bookingId: "b-1",
        amountCents: 100,
        metadata: {},
        stripe: fake as never,
      }),
    ).rejects.toThrow(/client_secret/);
  });
});

describe("cancelExtensionIntent", () => {
  it("delegates to paymentIntents.cancel", async () => {
    const fake = makeFakeStripe();
    fake.paymentIntents.cancel.mockResolvedValue({ id: "pi_ext_1" });
    await cancelExtensionIntent("pi_ext_1", fake as never);
    expect(fake.paymentIntents.cancel).toHaveBeenCalledWith("pi_ext_1");
  });
});

describe("cancelPaymentIntent", () => {
  it("delegates to paymentIntents.cancel", async () => {
    const fake = makeFakeStripe();
    fake.paymentIntents.cancel.mockResolvedValue({ id: "pi_1" });
    await cancelPaymentIntent("pi_1", fake as never);
    expect(fake.paymentIntents.cancel).toHaveBeenCalledWith("pi_1");
  });

  it("swallows StripeInvalidRequestError (already cancelled / captured)", async () => {
    const fake = makeFakeStripe();
    // Construct an error that matches the SDK's invariant check.
    const StripeModule = await import("stripe");
    const stripeDefault = (StripeModule as { default: unknown }).default as {
      errors: { StripeInvalidRequestError: new (m: { message: string }) => Error };
    };
    const invalid = new stripeDefault.errors.StripeInvalidRequestError({
      message: "already canceled",
    });
    fake.paymentIntents.cancel.mockRejectedValue(invalid);
    await expect(cancelPaymentIntent("pi_1", fake as never)).resolves.toBeUndefined();
  });

  it("propagates other errors", async () => {
    const fake = makeFakeStripe();
    fake.paymentIntents.cancel.mockRejectedValue(new Error("network"));
    await expect(cancelPaymentIntent("pi_1", fake as never)).rejects.toThrow(
      /network/,
    );
  });
});

describe("verifyWebhookSignature", () => {
  it("delegates to webhooks.constructEvent with the shared secret", () => {
    const fake = makeFakeStripe();
    fake.webhooks.constructEvent.mockReturnValue({ id: "evt_1", type: "payment_intent.succeeded" });
    const event = verifyWebhookSignature("raw", "sig", fake as never, "whsec_xyz");
    expect(event).toMatchObject({ id: "evt_1" });
    expect(fake.webhooks.constructEvent).toHaveBeenCalledWith("raw", "sig", "whsec_xyz");
  });

  it("throws when the webhook secret is missing", () => {
    const fake = makeFakeStripe();
    delete process.env.STRIPE_WEBHOOK_SECRET;
    expect(() =>
      verifyWebhookSignature("raw", "sig", fake as never),
    ).toThrow(/STRIPE_WEBHOOK_SECRET/);
  });
});
