import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

const pushMock = vi.fn();
const prepareExtensionMock = vi.fn();
const commitExtensionMock = vi.fn();
const confirmPaymentMock = vi.fn();

const stripeFake = {
  confirmPayment: confirmPaymentMock,
};
let useStripeReturn: typeof stripeFake | null = stripeFake;
const elementsFake = {} as Record<string, unknown>;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/lib/actions/extension-actions", () => ({
  prepareExtension: (...args: unknown[]) => prepareExtensionMock(...args),
  commitExtension: (...args: unknown[]) => commitExtensionMock(...args),
}));

vi.mock("@stripe/stripe-js", () => ({
  loadStripe: vi.fn(async () => ({})),
}));

vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: ReactNode }) => (
    <div data-testid="stripe-elements">{children}</div>
  ),
  PaymentElement: () => <div data-testid="payment-element-inner" />,
  useStripe: () => useStripeReturn,
  useElements: () => elementsFake,
}));

import { ExtendRentalFlow } from "./extend-rental-flow";

const DEFAULT_PROPS = {
  bookingId: "booking-1",
  listingName: "Kubota Mini Excavator",
  currentEndDate: "2026-05-03",
  currentTotalCents: 30000,
  dailyRateCents: 10000,
  maxExtendDays: 4,
  publishableKey: "pk_test_xyz",
};

function renderFlow(
  overrides: Partial<React.ComponentProps<typeof ExtendRentalFlow>> = {},
) {
  return render(<ExtendRentalFlow {...DEFAULT_PROPS} {...overrides} />);
}

beforeEach(() => {
  pushMock.mockReset();
  prepareExtensionMock.mockReset();
  commitExtensionMock.mockReset();
  confirmPaymentMock.mockReset();
  useStripeReturn = stripeFake;

  prepareExtensionMock.mockResolvedValue({
    success: true,
    data: {
      bookingId: "booking-1",
      clientSecret: "pi_ext_secret",
      paymentIntentId: "pi_ext_1",
      amountCents: 20000,
      extendDays: 2,
      newEndDate: "2026-05-05",
      publishableKey: "pk_test_xyz",
      listingName: "Kubota Mini Excavator",
    },
  });
  commitExtensionMock.mockResolvedValue({
    success: true,
    data: {
      bookingId: "booking-1",
      listingId: "listing-1",
      newEndDate: "2026-05-05",
      newTotalCents: 50000,
      extendDays: 2,
    },
  });
  confirmPaymentMock.mockResolvedValue({});
});

describe("ExtendRentalFlow — step 1 (select)", () => {
  it("renders the four day options and defaults to +1", () => {
    renderFlow();
    expect(screen.getByTestId("extend-days-1")).toBeInTheDocument();
    expect(screen.getByTestId("extend-days-4")).toBeInTheDocument();
    expect(screen.getByTestId("extend-days-1")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("updates cost math and new end date when a day chip is clicked", () => {
    renderFlow();
    fireEvent.click(screen.getByTestId("extend-days-2"));
    expect(screen.getByTestId("extend-cost-math")).toHaveTextContent(
      /\$200\.00 more/,
    );
    expect(screen.getByTestId("extend-new-end")).toHaveTextContent(
      /May 5, 2026/,
    );
  });

  it("disables day options beyond maxExtendDays", () => {
    renderFlow({ maxExtendDays: 2 });
    const btn3 = screen.getByTestId("extend-days-3") as HTMLButtonElement;
    const btn4 = screen.getByTestId("extend-days-4") as HTMLButtonElement;
    expect(btn3.disabled).toBe(true);
    expect(btn4.disabled).toBe(true);
  });

  it("transitions to the authorize step when prepareExtension succeeds", async () => {
    renderFlow();
    fireEvent.click(screen.getByTestId("extend-days-2"));
    fireEvent.click(screen.getByTestId("extend-confirm-selection"));
    await waitFor(() =>
      expect(prepareExtensionMock).toHaveBeenCalledWith("booking-1", 2),
    );
    await waitFor(() =>
      expect(screen.getByTestId("extend-flow-authorize")).toBeInTheDocument(),
    );
  });

  it("shows an inline error when prepareExtension returns a failure", async () => {
    prepareExtensionMock.mockResolvedValueOnce({
      success: false,
      error: { code: "EXTENSION_LIMIT_EXCEEDED", message: "too many" },
    });
    renderFlow();
    fireEvent.click(screen.getByTestId("extend-confirm-selection"));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/too many/),
    );
  });
});

describe("ExtendRentalFlow — step 2 (authorize)", () => {
  async function advanceToAuthorize() {
    renderFlow();
    fireEvent.click(screen.getByTestId("extend-days-2"));
    fireEvent.click(screen.getByTestId("extend-confirm-selection"));
    await waitFor(() =>
      expect(screen.getByTestId("extend-flow-authorize")).toBeInTheDocument(),
    );
  }

  it("submits Stripe confirmPayment then commitExtension then shows done state", async () => {
    await advanceToAuthorize();
    fireEvent.click(screen.getByTestId("extend-authorize-button"));
    await waitFor(() =>
      expect(confirmPaymentMock).toHaveBeenCalledTimes(1),
    );
    await waitFor(() =>
      expect(commitExtensionMock).toHaveBeenCalledWith({
        bookingId: "booking-1",
        extendDays: 2,
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("extend-flow-done")).toBeInTheDocument(),
    );
    expect(screen.getByText(/Rental extended!/)).toBeInTheDocument();
  });

  it("shows a payment decline error and does not navigate", async () => {
    await advanceToAuthorize();
    confirmPaymentMock.mockResolvedValueOnce({
      error: { message: "declined", type: "card_error" },
    });
    fireEvent.click(screen.getByTestId("extend-authorize-button"));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /Payment issue/,
      ),
    );
    expect(commitExtensionMock).not.toHaveBeenCalled();
  });

  it("surfaces EXTENSION_CONFLICT from commitExtension", async () => {
    await advanceToAuthorize();
    commitExtensionMock.mockResolvedValueOnce({
      success: false,
      error: { code: "EXTENSION_CONFLICT", message: "race" },
    });
    fireEvent.click(screen.getByTestId("extend-authorize-button"));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /just booked/i,
      ),
    );
  });

  it("bounces to /rentals/verify on SESSION_EXPIRED", async () => {
    await advanceToAuthorize();
    commitExtensionMock.mockResolvedValueOnce({
      success: false,
      error: { code: "SESSION_EXPIRED", message: "expired" },
    });
    fireEvent.click(screen.getByTestId("extend-authorize-button"));
    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith(
        `/rentals/verify?returnTo=${encodeURIComponent("/rentals/booking-1/extend")}`,
      ),
    );
  });
});
