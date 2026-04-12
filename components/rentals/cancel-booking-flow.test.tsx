import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const pushMock = vi.fn();
const refreshMock = vi.fn();
const confirmCancellationMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

vi.mock("@/lib/actions/cancellation-actions", () => ({
  confirmCancellation: (...args: unknown[]) =>
    confirmCancellationMock(...args),
}));

import { CancelBookingFlow } from "./cancel-booking-flow";

const BASE_PROPS = {
  bookingId: "booking-1",
  listingName: "Kubota Mini Excavator",
  startDate: "2026-05-10",
  endDate: "2026-05-12",
  amountCents: 45000,
  hoursUntilStart: 216,
} as const;

beforeEach(() => {
  pushMock.mockReset();
  refreshMock.mockReset();
  confirmCancellationMock.mockReset();
});

describe("CancelBookingFlow — refund preview", () => {
  it("renders the rental summary and refund copy", () => {
    render(<CancelBookingFlow {...BASE_PROPS} outcome="refund" />);
    expect(screen.getByText(/Kubota Mini Excavator/)).toBeInTheDocument();
    expect(
      screen.getByTestId("cancel-outcome-refund"),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/\$450\.00/).length).toBeGreaterThan(0);
    expect(
      screen.queryByTestId("cancel-outcome-hold-captured"),
    ).not.toBeInTheDocument();
  });

  it("calls confirmCancellation with the acknowledged refund outcome", async () => {
    confirmCancellationMock.mockResolvedValueOnce({
      success: true,
      data: {
        bookingId: "booking-1",
        outcome: "refund",
        newStatus: "cancelled",
      },
    });
    render(<CancelBookingFlow {...BASE_PROPS} outcome="refund" />);
    fireEvent.click(screen.getByTestId("cancel-confirm-button"));
    await waitFor(() => {
      expect(confirmCancellationMock).toHaveBeenCalledWith("booking-1", {
        acknowledgedOutcome: "refund",
      });
    });
    await waitFor(() =>
      expect(screen.getByTestId("cancel-flow-done")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("cancel-flow-success")).toHaveTextContent(
      /Cancelled/,
    );
  });
});

describe("CancelBookingFlow — within 48h preview", () => {
  const withinProps = {
    ...BASE_PROPS,
    hoursUntilStart: 12,
    outcome: "hold_captured" as const,
  };

  it("renders the amber warning box", () => {
    render(<CancelBookingFlow {...withinProps} />);
    expect(
      screen.getByTestId("cancel-outcome-hold-captured"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no refund within 48 hours/i),
    ).toBeInTheDocument();
  });

  it("confirm button stays enabled and commits with hold_captured", async () => {
    confirmCancellationMock.mockResolvedValueOnce({
      success: true,
      data: {
        bookingId: "booking-1",
        outcome: "hold_captured",
        newStatus: "cancelled",
      },
    });
    render(<CancelBookingFlow {...withinProps} />);
    fireEvent.click(screen.getByTestId("cancel-confirm-button"));
    await waitFor(() => {
      expect(confirmCancellationMock).toHaveBeenCalledWith("booking-1", {
        acknowledgedOutcome: "hold_captured",
      });
    });
    await waitFor(() =>
      expect(screen.getByTestId("cancel-flow-done")).toBeInTheDocument(),
    );
    expect(screen.getByText(/captured/i)).toBeInTheDocument();
  });
});

describe("CancelBookingFlow — drift handling", () => {
  it("shows the drift error when the server returns OUTCOME_DRIFT", async () => {
    confirmCancellationMock.mockResolvedValueOnce({
      success: false,
      error: { code: "OUTCOME_DRIFT", message: "policy changed" },
    });
    render(<CancelBookingFlow {...BASE_PROPS} outcome="refund" />);
    fireEvent.click(screen.getByTestId("cancel-confirm-button"));
    await waitFor(() =>
      expect(screen.getByTestId("cancel-drift-error")).toBeInTheDocument(),
    );
    // The confirm button is disabled until the user refreshes.
    const btn = screen.getByTestId(
      "cancel-confirm-button",
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("refresh button calls router.refresh() and clears the drift state", async () => {
    confirmCancellationMock.mockResolvedValueOnce({
      success: false,
      error: { code: "OUTCOME_DRIFT", message: "policy changed" },
    });
    render(<CancelBookingFlow {...BASE_PROPS} outcome="refund" />);
    fireEvent.click(screen.getByTestId("cancel-confirm-button"));
    await waitFor(() =>
      expect(screen.getByTestId("cancel-drift-error")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("cancel-refresh-button"));
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});

describe("CancelBookingFlow — error handling", () => {
  it("bounces to /rentals/verify on SESSION_EXPIRED", async () => {
    confirmCancellationMock.mockResolvedValueOnce({
      success: false,
      error: { code: "SESSION_EXPIRED", message: "expired" },
    });
    render(<CancelBookingFlow {...BASE_PROPS} outcome="refund" />);
    fireEvent.click(screen.getByTestId("cancel-confirm-button"));
    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith(
        `/rentals/verify?returnTo=${encodeURIComponent("/rentals/booking-1/cancel")}`,
      ),
    );
  });

  it("surfaces a generic error inline", async () => {
    confirmCancellationMock.mockResolvedValueOnce({
      success: false,
      error: {
        code: "CANCELLATION_STRIPE_ERROR",
        message: "stripe is down",
      },
    });
    render(<CancelBookingFlow {...BASE_PROPS} outcome="refund" />);
    fireEvent.click(screen.getByTestId("cancel-confirm-button"));
    await waitFor(() =>
      expect(screen.getByTestId("cancel-error")).toHaveTextContent(
        /stripe is down/,
      ),
    );
  });
});
