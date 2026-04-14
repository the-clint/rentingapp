"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface ListingPhotoCarouselPhoto {
  url: string;
  path: string;
}

interface ListingPhotoCarouselProps {
  photos: ReadonlyArray<ListingPhotoCarouselPhoto>;
  listingName: string;
}

/**
 * Renter-facing swipeable photo carousel. Native horizontal scroll-snap for
 * mobile swipe, arrow buttons on desktop (`md:` and up), dot indicators,
 * photo counter, and keyboard `ArrowLeft` / `ArrowRight` support.
 *
 * Arrow buttons clamp at the bounds (no wrap-around). Dot indicators use
 * `aria-current="true"` for the active slide. The outer container carries
 * `role="region"` + `aria-roledescription="carousel"` per the W3C ARIA
 * Authoring Practices Guide carousel pattern.
 *
 * Story 3.1: Renter Listing Page & Photo Carousel.
 */
export function ListingPhotoCarousel({
  photos,
  listingName,
}: ListingPhotoCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const rafIdRef = useRef<number | null>(null);

  const total = photos.length;

  // Derive the active slide index from the scroll position. rAF-throttled so
  // momentum scrolls on iOS don't spam setState.
  const handleScroll = useCallback(() => {
    if (rafIdRef.current !== null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      const track = trackRef.current;
      if (!track) return;
      const width = track.offsetWidth;
      if (width === 0) return;
      const next = Math.round(track.scrollLeft / width);
      setActiveIndex((current) => (current === next ? current : next));
    });
  }, []);

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  const scrollToIndex = useCallback(
    (raw: number) => {
      const clamped = Math.max(0, Math.min(total - 1, raw));
      const track = trackRef.current;
      if (track) {
        const width = track.offsetWidth || 0;
        track.scrollTo({ left: clamped * width, behavior: "smooth" });
      }
      setActiveIndex(clamped);
    },
    [total],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        scrollToIndex(activeIndex + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        scrollToIndex(activeIndex - 1);
      }
    },
    [activeIndex, scrollToIndex],
  );

  if (total === 0) {
    return null;
  }

  // Single-photo simple case — no dots, no arrows.
  if (total === 1) {
    const only = photos[0];
    return (
      <div
        role="region"
        aria-roledescription="carousel"
        aria-label={`${listingName} photos`}
        className="relative w-full overflow-hidden rounded-lg bg-neutral-100"
      >
        <div
          role="group"
          aria-roledescription="slide"
          aria-label="Photo 1 of 1"
          className="w-full"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={only.url}
            alt={`${listingName} photo 1`}
            className="aspect-[4/3] w-full object-cover"
          />
        </div>
        <span
          aria-hidden="true"
          className="absolute right-space-2 top-space-2 rounded-full bg-black/50 px-space-2 py-space-1 text-small text-white"
        >
          1 / 1
        </span>
      </div>
    );
  }

  const atStart = activeIndex <= 0;
  const atEnd = activeIndex >= total - 1;

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={`${listingName} photos`}
      className="relative w-full"
    >
      <div
        ref={trackRef}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        className="flex w-full snap-x snap-mandatory overflow-x-auto scroll-smooth rounded-lg bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-dark"
      >
        {photos.map((photo, i) => (
          <div
            key={photo.path}
            role="group"
            aria-roledescription="slide"
            aria-label={`Photo ${i + 1} of ${total}`}
            className="w-full shrink-0 snap-start"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt={`${listingName} photo ${i + 1}`}
              className="aspect-[4/3] w-full object-cover"
            />
          </div>
        ))}
      </div>

      {/* Counter pill */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-space-2 top-space-2 rounded-full bg-black/50 px-space-2 py-space-1 text-small text-white"
      >
        {activeIndex + 1} / {total}
      </span>

      {/* Prev / Next arrows — desktop only */}
      <button
        type="button"
        onClick={() => scrollToIndex(activeIndex - 1)}
        disabled={atStart}
        aria-disabled={atStart}
        aria-label="Previous photo"
        className="absolute left-space-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-card/90 text-neutral-900 shadow-md transition hover:bg-card disabled:cursor-not-allowed disabled:opacity-40 md:flex"
      >
        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => scrollToIndex(activeIndex + 1)}
        disabled={atEnd}
        aria-disabled={atEnd}
        aria-label="Next photo"
        className="absolute right-space-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-card/90 text-neutral-900 shadow-md transition hover:bg-card disabled:cursor-not-allowed disabled:opacity-40 md:flex"
      >
        <ChevronRight className="h-5 w-5" aria-hidden="true" />
      </button>

      {/* Dot indicators */}
      <div
        role="tablist"
        aria-label="Select photo"
        className="mt-space-3 flex justify-center gap-space-2"
      >
        {photos.map((photo, i) => {
          const isActive = i === activeIndex;
          return (
            <button
              key={photo.path}
              type="button"
              role="tab"
              aria-current={isActive ? "true" : undefined}
              aria-selected={isActive}
              aria-label={`Go to photo ${i + 1}`}
              onClick={() => scrollToIndex(i)}
              className={`h-2 w-2 rounded-full transition ${
                isActive ? "bg-primary" : "bg-neutral-300"
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}
