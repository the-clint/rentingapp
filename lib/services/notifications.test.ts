import { afterEach, describe, expect, it, vi } from "vitest";

import { sendBookingConfirmationSms } from "./notifications";

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
