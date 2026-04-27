import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const toDataURLMock = vi.fn();
vi.mock("qrcode", () => ({
  default: { toDataURL: (...args: unknown[]) => toDataURLMock(...args) },
}));

import { BookingQrCode } from "./booking-qr-code";

const READY_DATA_URL = "data:image/png;base64,fake";

describe("BookingQrCode", () => {
  beforeEach(() => {
    toDataURLMock.mockReset();
  });

  afterEach(() => {
    toDataURLMock.mockReset();
  });

  it("renders a skeleton placeholder while loading", () => {
    // Never-resolving promise so the component stays in `loading`.
    toDataURLMock.mockImplementation(() => new Promise(() => {}));
    const { container } = render(
      <BookingQrCode
        bookingUrl="https://everything.rent/book/listing-1"
        listingId="listing-1"
      />,
    );
    const skeleton = container.querySelector(".animate-pulse");
    expect(skeleton).not.toBeNull();
    // No img and no error alert while loading.
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders the QR <img> with the returned data URL and the alt text built from listingName", async () => {
    toDataURLMock.mockResolvedValue(READY_DATA_URL);
    render(
      <BookingQrCode
        bookingUrl="https://everything.rent/book/listing-1"
        listingId="listing-1"
        listingName="Kubota Mini Excavator"
      />,
    );
    await waitFor(() => {
      const img = screen.getByRole("img") as HTMLImageElement;
      expect(img.getAttribute("src")).toBe(READY_DATA_URL);
    });
    const img = screen.getByRole("img") as HTMLImageElement;
    expect(img.alt).toBe(
      "QR code linking to Kubota Mini Excavator's booking page",
    );
    expect(toDataURLMock).toHaveBeenCalledWith(
      "https://everything.rent/book/listing-1",
      expect.objectContaining({
        errorCorrectionLevel: "M",
        margin: 2,
        width: 256,
        color: { dark: "#000000", light: "#FFFFFF" },
      }),
    );
  });

  it("falls back to a generic alt when listingName is omitted", async () => {
    toDataURLMock.mockResolvedValue(READY_DATA_URL);
    render(
      <BookingQrCode
        bookingUrl="https://everything.rent/book/listing-1"
        listingId="listing-1"
      />,
    );
    await waitFor(() => {
      expect(screen.getByRole("img")).toHaveAttribute("alt");
    });
    const img = screen.getByRole("img") as HTMLImageElement;
    expect(img.alt).toBe("QR code for this listing's booking page");
  });

  it("renders the error fallback with the rejection message when toDataURL rejects", async () => {
    toDataURLMock.mockRejectedValue(new Error("boom"));
    render(
      <BookingQrCode
        bookingUrl="https://everything.rent/book/listing-1"
        listingId="listing-1"
      />,
    );
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        /Couldn't generate QR code — use the booking link above\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("Download anchor uses booking-qr-{listingId}.png after the QR is ready", async () => {
    toDataURLMock.mockResolvedValue(READY_DATA_URL);
    render(
      <BookingQrCode
        bookingUrl="https://everything.rent/book/listing-1"
        listingId="listing-42"
      />,
    );
    await waitFor(() => {
      expect(screen.getByRole("img")).toBeInTheDocument();
    });
    const link = screen.getByRole("link", { name: /download qr/i });
    expect(link.getAttribute("download")).toBe("booking-qr-listing-42.png");
    expect(link.getAttribute("href")).toBe(READY_DATA_URL);
  });

  it("Download anchor is aria-disabled while loading and removes aria-disabled once ready", async () => {
    let resolveFn: ((value: string) => void) | null = null;
    toDataURLMock.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveFn = resolve;
        }),
    );
    render(
      <BookingQrCode
        bookingUrl="https://everything.rent/book/listing-1"
        listingId="listing-1"
      />,
    );
    const link = screen.getByRole("link", { name: /download qr/i });
    expect(link.getAttribute("aria-disabled")).toBe("true");
    expect(link.getAttribute("tabindex")).toBe("-1");

    resolveFn!(READY_DATA_URL);
    await waitFor(() => {
      expect(screen.getByRole("img")).toBeInTheDocument();
    });
    expect(link.getAttribute("aria-disabled")).toBeNull();
    expect(link.getAttribute("tabindex")).not.toBe("-1");
  });

  it("re-runs toDataURL when bookingUrl changes between renders and updates the displayed src", async () => {
    toDataURLMock
      .mockResolvedValueOnce("data:image/png;base64,first")
      .mockResolvedValueOnce("data:image/png;base64,second");

    const { rerender } = render(
      <BookingQrCode
        bookingUrl="https://everything.rent/book/a"
        listingId="listing-1"
      />,
    );
    await waitFor(() => {
      expect(screen.getByRole("img")).toHaveAttribute(
        "src",
        "data:image/png;base64,first",
      );
    });

    rerender(
      <BookingQrCode
        bookingUrl="https://everything.rent/book/b"
        listingId="listing-1"
      />,
    );
    await waitFor(() => {
      expect(screen.getByRole("img")).toHaveAttribute(
        "src",
        "data:image/png;base64,second",
      );
    });

    expect(toDataURLMock).toHaveBeenCalledTimes(2);
    expect(toDataURLMock.mock.calls[0][0]).toBe(
      "https://everything.rent/book/a",
    );
    expect(toDataURLMock.mock.calls[1][0]).toBe(
      "https://everything.rent/book/b",
    );
  });
});
