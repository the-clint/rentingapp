// jsdom's HTMLDialogElement support is partial — `showModal` and `close` are
// not implemented. We polyfill both as tiny no-ops that flip the `open`
// property so React's `dialog[open]` assertions line up with what browsers
// actually do. Documented in Story 2.3 Task 4.7.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

if (typeof HTMLDialogElement !== "undefined") {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      this.removeAttribute("open");
      // React listens to the native `close` event to reset internal state.
      this.dispatchEvent(new Event("close"));
    };
  }
}

const pushMock = vi.fn();
const refreshMock = vi.fn();
const deleteListingMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

vi.mock("@/lib/actions/listing-actions", () => ({
  deleteListing: (...args: unknown[]) => deleteListingMock(...args),
}));

import { DeleteListingDialog } from "./delete-listing-dialog";

function renderDialog() {
  return render(
    <DeleteListingDialog listingId="listing-1" listingName="Honda Generator" />,
  );
}

describe("DeleteListingDialog", () => {
  beforeEach(() => {
    pushMock.mockReset();
    refreshMock.mockReset();
    deleteListingMock.mockReset();
  });

  it("is closed by default", () => {
    renderDialog();
    // Dialog element exists but has no `open` attribute.
    const dialog = document.querySelector("dialog");
    expect(dialog).not.toBeNull();
    expect(dialog?.hasAttribute("open")).toBe(false);
  });

  it("opens when the trigger button is clicked", () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /delete honda generator/i }));
    const dialog = document.querySelector("dialog");
    expect(dialog?.hasAttribute("open")).toBe(true);
  });

  it("shows the listing name in the confirmation body", () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /delete honda generator/i }));
    expect(screen.getByText(/Honda Generator/)).toBeInTheDocument();
    expect(
      screen.getByText(/This cannot be undone from the UI\./),
    ).toBeInTheDocument();
  });

  it("closes when the Cancel button is clicked", () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /delete honda generator/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    const dialog = document.querySelector("dialog");
    expect(dialog?.hasAttribute("open")).toBe(false);
    expect(deleteListingMock).not.toHaveBeenCalled();
  });

  it("calls deleteListing with the correct id on confirm and navigates on success", async () => {
    deleteListingMock.mockResolvedValue({ success: true, data: null });
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /delete honda generator/i }));
    // The confirm button is the one inside the dialog (different accessible name).
    const confirmButton = screen
      .getAllByRole("button", { name: /^delete$/i })
      .at(-1)!;
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(deleteListingMock).toHaveBeenCalledWith("listing-1");
    });
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/listings");
    });
    expect(refreshMock).toHaveBeenCalled();
  });

  it("renders the error inside the dialog on failure and does not navigate", async () => {
    deleteListingMock.mockResolvedValue({
      success: false,
      error: { code: "DATABASE_ERROR", message: "rls denied" },
    });
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /delete honda generator/i }));
    const confirmButton = screen
      .getAllByRole("button", { name: /^delete$/i })
      .at(-1)!;
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("rls denied");
    });
    expect(pushMock).not.toHaveBeenCalled();
    // Dialog should still be open.
    expect(document.querySelector("dialog")?.hasAttribute("open")).toBe(true);
  });
});
