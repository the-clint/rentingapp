import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

const pushMock = vi.fn();
const confirmBookingAfterPaymentMock = vi.fn();
const confirmPaymentMock = vi.fn();
const stripeFake = {
  confirmPayment: confirmPaymentMock,
  paymentRequest: vi.fn(() => ({
    canMakePayment: async () => null, // no Apple/Google Pay in tests
    on: vi.fn(),
  })),
};
let useStripeReturn: typeof stripeFake | null = stripeFake;
const elementsFake = {} as Record<string, unknown>;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/lib/actions/payment-actions", () => ({
  confirmBookingAfterPayment: (...args: unknown[]) =>
    confirmBookingAfterPaymentMock(...args),
}));

vi.mock("@stripe/stripe-js", () => ({
  loadStripe: vi.fn(async () => ({})),
}));

vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: ReactNode }) => (
    <div data-testid="stripe-elements">{children}</div>
  ),
  PaymentElement: () => <div data-testid="payment-element-inner" />,
  PaymentRequestButtonElement: () => (
    <div data-testid="payment-request-button-inner" />
  ),
  useStripe: () => useStripeReturn,
  useElements: () => elementsFake,
}));

import { PaymentHoldForm } from "./payment-hold-form";

function renderForm() {
  return render(
    <PaymentHoldForm
      listingId="listing-1"
      bookingId="booking-1"
      clientSecret="pi_test_secret"
      publishableKey="pk_test_xyz"
      amountCents={15000}
      listingName="Kubota Mini Excavator"
    />,
  );
}

beforeEach(() => {
  pushMock.mockReset();
  confirmBookingAfterPaymentMock.mockReset();
  confirmPaymentMock.mockReset();
  useStripeReturn = stripeFake;
  confirmBookingAfterPaymentMock.mockResolvedValue({
    success: true,
    data: {
      bookingId: "booking-1",
      listingId: "listing-1",
      redirectTo: "/book/listing-1/confirmed?bookingId=booking-1",
    },
  });
  confirmPaymentMock.mockResolvedValue({});
});

describe("PaymentHoldForm", () => {
  it("renders the hold amount and a PaymentElement", () => {
    renderForm();
    expect(screen.getAllByText(/\$150\.00/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("payment-element-inner")).toBeInTheDocument();
  });

  it("disables the confirm button when Stripe is not ready", () => {
    useStripeReturn = null;
    renderForm();
    const btn = screen.getByTestId("confirm-hold-button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("calls stripe.confirmPayment and confirmBookingAfterPayment on submit", async () => {
    renderForm();
    const btn = screen.getByTestId("confirm-hold-button");
    fireEvent.click(btn);
    await waitFor(() => expect(confirmPaymentMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(confirmBookingAfterPaymentMock).toHaveBeenCalledWith("booking-1"),
    );
    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith(
        "/book/listing-1/confirmed?bookingId=booking-1",
      ),
    );
  });

  it("surfaces an inline error when Stripe returns a decline", async () => {
    confirmPaymentMock.mockResolvedValueOnce({
      error: { message: "Your card was declined.", type: "card_error" },
    });
    renderForm();
    fireEvent.click(screen.getByTestId("confirm-hold-button"));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /Payment failed — please try another method\./,
      ),
    );
    expect(confirmBookingAfterPaymentMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("routes to /verify?returnTo=... on SESSION_EXPIRED from the Server Action", async () => {
    confirmBookingAfterPaymentMock.mockResolvedValueOnce({
      success: false,
      error: { code: "SESSION_EXPIRED", message: "expired" },
    });
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...originalLocation,
        origin: "http://localhost",
        pathname: "/book/listing-1/payment",
        search: "?bookingId=booking-1",
      },
    });

    renderForm();
    fireEvent.click(screen.getByTestId("confirm-hold-button"));
    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith(
        `/book/listing-1/verify?returnTo=${encodeURIComponent("/book/listing-1/payment?bookingId=booking-1")}`,
      ),
    );

    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("surfaces BOOKING_CONFLICT error from the Server Action", async () => {
    confirmBookingAfterPaymentMock.mockResolvedValueOnce({
      success: false,
      error: { code: "BOOKING_CONFLICT", message: "race" },
    });
    renderForm();
    fireEvent.click(screen.getByTestId("confirm-hold-button"));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /these dates were just booked/i,
      ),
    );
    expect(pushMock).not.toHaveBeenCalled();
  });
});
