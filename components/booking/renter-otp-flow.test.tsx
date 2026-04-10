import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const requestRenterOtp = vi.fn();
const verifyRenterOtp = vi.fn();
vi.mock("@/lib/actions/renter-auth-actions", () => ({
  requestRenterOtp: (...args: unknown[]) =>
    requestRenterOtp(...(args as [FormData])),
  verifyRenterOtp: (...args: unknown[]) =>
    verifyRenterOtp(...(args as [FormData])),
}));

import { RenterOtpFlow } from "./renter-otp-flow";

describe("RenterOtpFlow", () => {
  beforeEach(() => {
    pushMock.mockClear();
    requestRenterOtp.mockReset();
    verifyRenterOtp.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("auto-formats the phone input as the renter types", () => {
    render(<RenterOtpFlow listingId="listing-1" />);
    const phone = screen.getByTestId("phone-input") as HTMLInputElement;
    fireEvent.change(phone, { target: { value: "8015551234" } });
    expect(phone.value).toBe("(801) 555-1234");
  });

  it("disables the Send Code button until 10 digits are entered", () => {
    render(<RenterOtpFlow listingId="listing-1" />);
    const button = screen.getByTestId("send-code-button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    const phone = screen.getByTestId("phone-input") as HTMLInputElement;
    fireEvent.change(phone, { target: { value: "801555" } });
    expect(button.disabled).toBe(true);
    fireEvent.change(phone, { target: { value: "8015551234" } });
    expect(button.disabled).toBe(false);
  });

  it("transitions to the OTP step on successful send", async () => {
    requestRenterOtp.mockResolvedValue({
      success: true,
      data: { phone: "+18015551234" },
    });
    render(<RenterOtpFlow listingId="listing-1" />);
    const phone = screen.getByTestId("phone-input") as HTMLInputElement;
    fireEvent.change(phone, { target: { value: "8015551234" } });
    fireEvent.click(screen.getByTestId("send-code-button"));
    await waitFor(() =>
      expect(screen.getByTestId("otp-boxes")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("otp-digit-0")).toBeInTheDocument();
  });

  it("shows the server error when requestRenterOtp fails", async () => {
    requestRenterOtp.mockResolvedValue({
      success: false,
      error: { code: "OTP_RATE_LIMITED", message: "Please wait 60 seconds." },
    });
    render(<RenterOtpFlow listingId="listing-1" />);
    fireEvent.change(screen.getByTestId("phone-input"), {
      target: { value: "8015551234" },
    });
    fireEvent.click(screen.getByTestId("send-code-button"));
    await waitFor(() =>
      expect(screen.getByText("Please wait 60 seconds.")).toBeInTheDocument(),
    );
  });

  async function advanceToOtpStep() {
    requestRenterOtp.mockResolvedValue({
      success: true,
      data: { phone: "+18015551234" },
    });
    render(<RenterOtpFlow listingId="listing-1" start="2026-05-01" end="2026-05-03" />);
    fireEvent.change(screen.getByTestId("phone-input"), {
      target: { value: "8015551234" },
    });
    fireEvent.click(screen.getByTestId("send-code-button"));
    await waitFor(() =>
      expect(screen.getByTestId("otp-boxes")).toBeInTheDocument(),
    );
  }

  it("auto-advances digits and auto-submits on the 6th", async () => {
    verifyRenterOtp.mockResolvedValue({
      success: true,
      data: { userId: "renter-1" },
    });
    await advanceToOtpStep();
    for (let i = 0; i < 6; i += 1) {
      fireEvent.change(screen.getByTestId(`otp-digit-${i}`), {
        target: { value: String(i + 1) },
      });
    }
    await waitFor(() =>
      expect(verifyRenterOtp).toHaveBeenCalledTimes(1),
    );
    const fd = verifyRenterOtp.mock.calls[0][0] as FormData;
    expect(fd.get("code")).toBe("123456");
    expect(fd.get("phone")).toBe("+18015551234");
  });

  it("navigates to the contract step on successful verify", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    verifyRenterOtp.mockResolvedValue({
      success: true,
      data: { userId: "renter-1" },
    });
    await advanceToOtpStep();
    for (let i = 0; i < 6; i += 1) {
      fireEvent.change(screen.getByTestId(`otp-digit-${i}`), {
        target: { value: "1" },
      });
    }
    await waitFor(() =>
      expect(verifyRenterOtp).toHaveBeenCalledTimes(1),
    );
    act(() => {
      vi.advanceTimersByTime(500);
    });
    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith(
        "/book/listing-1/contract?start=2026-05-01&end=2026-05-03",
      ),
    );
  });

  it("shakes, shows error, and clears boxes on invalid code", async () => {
    verifyRenterOtp.mockResolvedValue({
      success: false,
      error: { code: "OTP_INVALID_CODE", message: "Invalid code, try again" },
    });
    await advanceToOtpStep();
    for (let i = 0; i < 6; i += 1) {
      fireEvent.change(screen.getByTestId(`otp-digit-${i}`), {
        target: { value: "9" },
      });
    }
    await waitFor(() =>
      expect(
        screen.getByText("Invalid code, try again"),
      ).toBeInTheDocument(),
    );
    const box0 = screen.getByTestId("otp-digit-0") as HTMLInputElement;
    expect(box0.value).toBe("");
    expect(screen.getByTestId("otp-boxes")).toHaveClass("animate-otp-shake");
  });

  it("renders an initially-disabled resend button that enables after 30s", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await advanceToOtpStep();
    const resend = screen.getByTestId("resend-button") as HTMLButtonElement;
    expect(resend.disabled).toBe(true);
    act(() => {
      vi.advanceTimersByTime(31_000);
    });
    await waitFor(() => expect(resend.disabled).toBe(false));
  });

  it("renders the countdown timer", async () => {
    await advanceToOtpStep();
    expect(screen.getByTestId("otp-countdown")).toHaveTextContent(/5:00/);
  });
});
