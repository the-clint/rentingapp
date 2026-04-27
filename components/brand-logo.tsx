import Link from "next/link";

import { cn } from "@/lib/utils";

type BrandLogoVariant = "full" | "mark";

interface BrandLogoProps {
  href?: string | null;
  /** Pixel height. Ignored when `fill` is true. */
  height?: number;
  variant?: BrandLogoVariant;
  /** Stretch to fill the parent's width; height auto from aspect ratio. */
  fill?: boolean;
  className?: string;
  imgClassName?: string;
}

const VARIANTS: Record<BrandLogoVariant, { src: string; aspectRatio: number }> =
  {
    full: { src: "/logo.svg", aspectRatio: 958 / 199.8 },
    mark: { src: "/logo-mark.svg", aspectRatio: 1 },
  };

export function BrandLogo({
  href = "/",
  height = 32,
  variant = "full",
  fill = false,
  className,
  imgClassName,
}: BrandLogoProps) {
  const { src, aspectRatio } = VARIANTS[variant];
  const width = Math.round(height * aspectRatio);

  // Plain <img> avoids next/image SVG sandboxing config and renders the
  // pre-outlined wordmark without any font dependency.
  const img = fill ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="Everything.Rent"
      className={cn("w-full h-auto block", imgClassName)}
    />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="Everything.Rent"
      width={width}
      height={height}
      style={{ height: `${height}px`, width: "auto" }}
      className={imgClassName}
    />
  );

  if (!href) return <span className={className}>{img}</span>;

  return (
    <Link
      href={href}
      aria-label="Everything.Rent home"
      className={cn("inline-flex", fill && "block w-full", className)}
    >
      {img}
    </Link>
  );
}
