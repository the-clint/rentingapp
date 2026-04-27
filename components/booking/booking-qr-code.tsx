"use client";

import { Download } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

interface BookingQrCodeProps {
  bookingUrl: string;
  listingId: string;
  listingName?: string;
}

type QrState =
  | { status: "loading" }
  | { status: "ready"; dataUrl: string }
  | { status: "error"; message: string };

export function BookingQrCode({
  bookingUrl,
  listingId,
  listingName,
}: BookingQrCodeProps) {
  const [state, setState] = useState<QrState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    QRCode.toDataURL(bookingUrl, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 256,
      color: { dark: "#000000", light: "#FFFFFF" },
    })
      .then((dataUrl) => {
        if (!cancelled) setState({ status: "ready", dataUrl });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Unknown error";
          setState({ status: "error", message });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bookingUrl]);

  const altText = listingName
    ? `QR code linking to ${listingName}'s booking page`
    : "QR code for this listing's booking page";

  const isReady = state.status === "ready";

  return (
    <div className="flex flex-col items-center gap-space-2 md:w-auto md:flex-shrink-0">
      {state.status === "loading" && (
        <div
          aria-hidden="true"
          className="h-[160px] w-[160px] animate-pulse rounded-md bg-neutral-100"
        />
      )}
      {state.status === "ready" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={state.dataUrl}
          alt={altText}
          width={160}
          height={160}
          className="rounded-md border border-neutral-200 bg-white"
        />
      )}
      {state.status === "error" && (
        <div
          role="alert"
          className="flex h-[160px] w-[160px] flex-col items-center justify-center gap-space-1 rounded-md border border-dashed border-neutral-300 bg-card px-space-2 py-space-2 text-center"
        >
          <p className="text-xs text-destructive">
            Couldn&apos;t generate QR code — use the booking link above.
          </p>
          <span className="block text-[10px] text-neutral-500">
            {state.message}
          </span>
        </div>
      )}
      <Button asChild variant="outline" size="sm">
        <a
          href={isReady ? state.dataUrl : "#"}
          download={`booking-qr-${listingId}.png`}
          {...(isReady ? {} : { "aria-disabled": true, tabIndex: -1 })}
          className={
            isReady ? undefined : "pointer-events-none opacity-50"
          }
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Download QR
        </a>
      </Button>
    </div>
  );
}
