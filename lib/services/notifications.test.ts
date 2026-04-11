import { afterEach, describe, expect, it, vi } from "vitest";

import {
  sendBookingCancellationSms,
  sendBookingConfirmationSms,
  sendBookingExtensionSms,
} from "./notifications";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sendBookingConfirmationSms (stub)", () => {
  it("resolves with delivered=true and logs a preview", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const result = await sendBookingConfirmationSms({
      phone: "+18015551234",
      body: "Your rental is confirmed for April 10-12.",
    });
    expect(result).toEqual({ delivered: true, stub: true });
    expect(infoSpy).toHaveBeenCalled();
    const logged = infoSpy.mock.calls[0]?.[1] ?? "";
    expect(String(logged)).toContain("+18015551234");
  });

  it("does not throw", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    await expect(
      sendBookingConfirmationSms({ phone: "+1", body: "x" }),
    ).resolves.toBeTruthy();
  });
});

describe("sendBookingCancellationSms (stub)", () => {
  it("resolves with delivered=true and logs the outcome", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const result = await sendBookingCancellationSms({
      phone: "+18015551234",
      outcome: "refund",
    });
    expect(result).toEqual({ delivered: true, stub: true });
    expect(infoSpy).toHaveBeenCalled();
    const logged = infoSpy.mock.calls[0]?.[1] ?? "";
    expect(String(logged)).toContain("+18015551234");
    expect(String(logged)).toContain("released");
  });

  it("handles the hold_captured outcome", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const result = await sendBookingCancellationSms({
      phone: "+18015550000",
      outcome: "hold_captured",
    });
    expect(result.delivered).toBe(true);
    const logged = infoSpy.mock.calls[0]?.[1] ?? "";
    expect(String(logged)).toContain("captured");
  });

  it("does not throw", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    await expect(
      sendBookingCancellationSms({ phone: "+1", outcome: "refund" }),
    ).resolves.toBeTruthy();
  });
});

describe("sendBookingExtensionSms (stub)", () => {
  it("resolves with delivered=true and logs a preview", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const result = await sendBookingExtensionSms({
      phone: "+18015551234",
      body: "Your rental has been extended. New return: April 14, 2026.",
    });
    expect(result).toEqual({ delivered: true, stub: true });
    expect(infoSpy).toHaveBeenCalled();
    const logged = infoSpy.mock.calls[0]?.[1] ?? "";
    expect(String(logged)).toContain("+18015551234");
  });

  it("does not throw", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    await expect(
      sendBookingExtensionSms({ phone: "+1", body: "x" }),
    ).resolves.toBeTruthy();
  });
});
