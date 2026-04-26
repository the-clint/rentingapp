import Link from "next/link";

interface BrandLogoProps {
  href?: string | null;
  height?: number;
  className?: string;
}

const ASPECT_RATIO = 958 / 199.8; // matches /public/logo.svg viewBox

export function BrandLogo({
  href = "/",
  height = 32,
  className,
}: BrandLogoProps) {
  const width = Math.round(height * ASPECT_RATIO);

  // Plain <img> avoids next/image SVG sandboxing config and renders the
  // pre-outlined wordmark without any font dependency.
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.svg"
      alt="Everything.Rent"
      width={width}
      height={height}
      style={{ height: `${height}px`, width: "auto" }}
      className={className}
    />
  );

  if (!href) return img;

  return (
    <Link href={href} aria-label="Everything.Rent home" className="inline-flex">
      {img}
    </Link>
  );
}
