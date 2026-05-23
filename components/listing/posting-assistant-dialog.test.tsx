// Polyfill jsdom's partial HTMLDialogElement. Mirrors the
// delete-listing-dialog.test.tsx harness.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

if (typeof HTMLDialogElement !== "undefined") {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal(
      this: HTMLDialogElement,
    ) {
      this.setAttribute("open", "");
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close(
      this: HTMLDialogElement,
    ) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  }
}

const replaceMock = vi.fn();
const pathnameMock = vi.fn(() => "/listings/test-id");

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => pathnameMock(),
}));

const toDataURLMock = vi.fn().mockResolvedValue("data:image/png;base64,fake");
vi.mock("qrcode", () => ({
  default: { toDataURL: (...args: unknown[]) => toDataURLMock(...args) },
}));

const saveAdCopyMock = vi
  .fn()
  .mockResolvedValue({ success: true, data: null });
vi.mock("@/lib/actions/listing-actions", () => ({
  saveAdCopy: (...args: unknown[]) => saveAdCopyMock(...args),
}));

import { PostingAssistantDialog } from "./posting-assistant-dialog";

const sampleListing = {
  name: "Kubota Mini Excavator",
  description: "Compact 3,000lb mini excavator. Trailer included.",
  daily_rate_cents: 17500,
  pickup_location: "Provo, UT",
};

const bookingUrl = "https://everything.rent/book/test-id";

function setupClipboard(reject = false) {
  const writeText = reject
    ? vi.fn().mockRejectedValue(new Error("denied"))
    : vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    writable: true,
    configurable: true,
    value: { writeText },
  });
  return writeText;
}

describe("PostingAssistantDialog", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    saveAdCopyMock.mockClear();
    saveAdCopyMock.mockResolvedValue({ success: true, data: null });
    pathnameMock.mockReturnValue("/listings/test-id");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is closed by default and opens on trigger click", () => {
    setupClipboard();
    render(
      <PostingAssistantDialog
        listing={sampleListing}
        bookingUrl={bookingUrl}
        listingId="test-id"
      />,
    );
    const dialog = document.querySelector("dialog");
    expect(dialog).not.toBeNull();
    expect(dialog?.hasAttribute("open")).toBe(false);

    fireEvent.click(
      screen.getByRole("button", { name: /^posting assistant$/i }),
    );
    expect(dialog?.hasAttribute("open")).toBe(true);
  });

  it("renders a single ad copy section + booking link row when open", () => {
    setupClipboard();
    render(
      <PostingAssistantDialog
        listing={sampleListing}
        bookingUrl={bookingUrl}
        listingId="test-id"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /^posting assistant$/i }),
    );

    expect(screen.getByText(/^Ad copy$/)).toBeInTheDocument();
    expect(
      screen.getByText("Booking link", { selector: "label" }),
    ).toBeInTheDocument();
    expect(screen.getByText(bookingUrl)).toBeInTheDocument();
  });

  it("copies the ad copy to the clipboard and shows 'Copied!' for 2 seconds", async () => {
    vi.useFakeTimers();
    const writeText = setupClipboard();
    render(
      <PostingAssistantDialog
        listing={sampleListing}
        bookingUrl={bookingUrl}
        listingId="test-id"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /^posting assistant$/i }),
    );

    const adTextarea = screen.getByLabelText(/^Ad copy$/i) as HTMLTextAreaElement;
    const adCard = adTextarea.closest("article")!;
    const copyButton = adCard.querySelector("button")!;
    await act(async () => {
      fireEvent.click(copyButton);
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    const copiedText = writeText.mock.calls[0][0] as string;
    expect(copiedText).toContain("$175.00/day");
    expect(copiedText).toContain(bookingUrl);
    expect(copiedText).toContain("Kubota Mini Excavator");

    expect(adCard.textContent).toContain("Copied!");

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(adCard.textContent).not.toContain("Copied!");
    expect(adCard.textContent).toContain("Copy");
  });

  it("shows inline error when the clipboard rejects and does not set Copied!", async () => {
    const writeText = setupClipboard(true);
    render(
      <PostingAssistantDialog
        listing={sampleListing}
        bookingUrl={bookingUrl}
        listingId="test-id"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /^posting assistant$/i }),
    );

    const adTextarea = screen.getByLabelText(/^Ad copy$/i) as HTMLTextAreaElement;
    const adCard = adTextarea.closest("article")!;
    const copyButton = adCard.querySelector("button")!;

    await act(async () => {
      fireEvent.click(copyButton);
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(adCard.textContent).not.toContain("Copied!");
    expect(
      screen.getByText(
        /Copy failed — select the text and press Ctrl\+C manually\./,
      ),
    ).toBeInTheDocument();
  });

  it("copies the booking link when the 'Copy link' button is clicked", async () => {
    const writeText = setupClipboard();
    render(
      <PostingAssistantDialog
        listing={sampleListing}
        bookingUrl={bookingUrl}
        listingId="test-id"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /^posting assistant$/i }),
    );

    const linkButton = screen.getByRole("button", { name: /copy link/i });
    await act(async () => {
      fireEvent.click(linkButton);
    });

    expect(writeText).toHaveBeenCalledWith(bookingUrl);
  });

  it("renders the QR code and download button in the booking link section", async () => {
    setupClipboard();
    const { findByRole } = render(
      <PostingAssistantDialog
        listing={sampleListing}
        bookingUrl={bookingUrl}
        listingId="test-id"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /^posting assistant$/i }),
    );

    const qrImage = await findByRole("img", { name: /QR code/i });
    expect(qrImage.getAttribute("src")).toBe("data:image/png;base64,fake");

    const downloadLink = screen.getByRole("link", { name: /download qr/i });
    expect(downloadLink.getAttribute("download")).toBe(
      "booking-qr-test-id.png",
    );
  });

  it("auto-opens once when initialOpen is true and scrubs ?posted=1 on close", async () => {
    setupClipboard();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      writable: true,
      configurable: true,
      value: {
        ...originalLocation,
        search: "?posted=1",
        pathname: "/listings/test-id",
      },
    });

    try {
      render(
        <PostingAssistantDialog
          listing={sampleListing}
          bookingUrl={bookingUrl}
          listingId="test-id"
          initialOpen={true}
        />,
      );

      const dialog = document.querySelector("dialog");
      expect(dialog?.hasAttribute("open")).toBe(true);

      const closeButton = screen.getByRole("button", {
        name: /close posting assistant/i,
      });
      await act(async () => {
        fireEvent.click(closeButton);
      });

      expect(replaceMock).toHaveBeenCalledWith("/listings/test-id");
    } finally {
      Object.defineProperty(window, "location", {
        writable: true,
        configurable: true,
        value: originalLocation,
      });
    }
  });

  it("Save button is disabled until the ad copy is edited and calls saveAdCopy on click", async () => {
    setupClipboard();
    render(
      <PostingAssistantDialog
        listing={sampleListing}
        bookingUrl={bookingUrl}
        listingId="test-id"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /^posting assistant$/i }),
    );

    const saveButton = screen.getByRole("button", { name: /^Save$/ });
    expect(saveButton).toBeDisabled();

    const textarea = screen.getByLabelText(/^Ad copy$/i) as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "Custom ad text" } });
    });
    expect(saveButton).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(saveButton);
    });
    expect(saveAdCopyMock).toHaveBeenCalledWith("test-id", "Custom ad text");
  });

  it("uses savedAdCopy as the initial textarea value when provided", () => {
    setupClipboard();
    render(
      <PostingAssistantDialog
        listing={sampleListing}
        bookingUrl={bookingUrl}
        listingId="test-id"
        savedAdCopy="Persisted custom copy"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /^posting assistant$/i }),
    );
    const textarea = screen.getByLabelText(/^Ad copy$/i) as HTMLTextAreaElement;
    expect(textarea.value).toBe("Persisted custom copy");
  });

  it("shows an error message when saveAdCopy fails", async () => {
    setupClipboard();
    saveAdCopyMock.mockResolvedValueOnce({
      success: false,
      error: { code: "DATABASE_ERROR", message: "Save blew up" },
    });
    render(
      <PostingAssistantDialog
        listing={sampleListing}
        bookingUrl={bookingUrl}
        listingId="test-id"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /^posting assistant$/i }),
    );

    const textarea = screen.getByLabelText(/^Ad copy$/i) as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "Edited" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    });

    expect(screen.getByRole("alert").textContent).toContain("Save blew up");
  });
});
