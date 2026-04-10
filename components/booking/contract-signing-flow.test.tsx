import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const pushMock = vi.fn();
const signContractMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/lib/actions/contract-actions", () => ({
  signContract: (...args: unknown[]) => signContractMock(...args),
}));

import { ContractSigningFlow } from "./contract-signing-flow";
import type { ContractSummary } from "@/lib/utils/contract-template";

const SUMMARY: ContractSummary = {
  periodLine: "Rental period: 2026-05-01 through 2026-05-03 (3 days).",
  rateLine: "Daily rate $175.00. Total held on your card: $525.00.",
  cancellationLine:
    "Cancel 48+ hours before for a full refund. Within 48 hours, the hold is non-refundable.",
  liabilityLine:
    "You are responsible for damage beyond normal wear and tear; the payment hold secures the equipment.",
  noShowLine:
    "If you do not pick up the equipment on the start date, the hold may be captured as a no-show fee.",
  pickupLine: "Pickup: Provo, UT.",
};

const BODY = `RENTAL AGREEMENT\n\n${"x".repeat(300)}\nEnd of contract.`;

function renderFlow() {
  return render(
    <ContractSigningFlow
      listingId="listing-1"
      contractId="22222222-2222-2222-2222-222222222222"
      summary={SUMMARY}
      body={BODY}
      listingName="Kubota Mini Excavator"
      renterPhoneE164="+18015551234"
    />,
  );
}

describe("ContractSigningFlow", () => {
  beforeEach(() => {
    pushMock.mockReset();
    signContractMock.mockReset();
    vi.useRealTimers();
  });

  it("renders all summary lines and the listing name", () => {
    renderFlow();
    expect(screen.getByText(/Kubota Mini Excavator/)).toBeInTheDocument();
    expect(screen.getByText(/Rental period:/)).toBeInTheDocument();
    expect(screen.getByText(/Daily rate \$175\.00/)).toBeInTheDocument();
    expect(
      screen.getByText(
        /Cancel 48\+ hours before for a full refund\. Within 48 hours, the hold is non-refundable\./,
      ),
    ).toBeInTheDocument();
  });

  it("toggles the full terms accordion with aria-expanded", () => {
    renderFlow();
    const trigger = screen.getByTestId("view-full-terms");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    const panel = screen.getByTestId("full-terms-panel");
    expect(panel).toHaveAttribute("data-state", "closed");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(panel).toHaveAttribute("data-state", "open");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("disables the sign button until the checkbox is ticked", () => {
    renderFlow();
    const signBtn = screen.getByTestId("sign-button") as HTMLButtonElement;
    expect(signBtn.disabled).toBe(true);
    const checkbox = screen.getByTestId("agree-checkbox") as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(signBtn.disabled).toBe(false);
  });

  it("on successful sign shows the signed confirmation and schedules redirect", async () => {
    signContractMock.mockResolvedValue({
      success: true,
      data: {
        bookingId: "booking-123",
        signedAt: "2026-04-10T18:30:00Z",
      },
    });
    renderFlow();
    fireEvent.click(screen.getByTestId("agree-checkbox"));
    fireEvent.click(screen.getByTestId("sign-button"));

    await waitFor(() =>
      expect(signContractMock).toHaveBeenCalledWith({
        contractId: "22222222-2222-2222-2222-222222222222",
        agreeChecked: true,
      }),
    );

    const confirmation = await screen.findByTestId("signed-confirmation");
    expect(confirmation).toBeInTheDocument();
    expect(confirmation).toHaveTextContent(/Signed by \(801\) 555-1234/);

    // The post-sign redirect is scheduled via `window.setTimeout(..., 1500)`.
    // We wait for it to fire naturally rather than stubbing setTimeout, which
    // would conflict with React Testing Library's own `waitFor` polling.
    await waitFor(
      () =>
        expect(pushMock).toHaveBeenCalledWith(
          "/book/listing-1/payment?bookingId=booking-123",
        ),
      { timeout: 3000 },
    );
  });

  it("renders an inline error when signing fails with BOOKING_CONFLICT", async () => {
    signContractMock.mockResolvedValue({
      success: false,
      error: { code: "BOOKING_CONFLICT", message: "conflict" },
    });
    renderFlow();
    fireEvent.click(screen.getByTestId("agree-checkbox"));
    await waitFor(() =>
      expect(
        (screen.getByTestId("sign-button") as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByTestId("sign-button"));

    const error = await screen.findByTestId("sign-error");
    expect(error).toHaveTextContent(/These dates were just booked/);
    expect(screen.queryByTestId("signed-confirmation")).toBeNull();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("renders a generic error on other failures", async () => {
    signContractMock.mockResolvedValue({
      success: false,
      error: { code: "CONTRACT_DATABASE_ERROR", message: "db boom" },
    });
    renderFlow();
    fireEvent.click(screen.getByTestId("agree-checkbox"));
    await waitFor(() =>
      expect(
        (screen.getByTestId("sign-button") as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByTestId("sign-button"));

    const error = await screen.findByTestId("sign-error");
    expect(error).toHaveTextContent(/db boom/);
  });
});
