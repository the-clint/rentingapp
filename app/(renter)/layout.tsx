// Renter route group layout. Minimal by design — the renter surface does NOT
// share the operator shell (sidebar, tab bar, auth-gated chrome). The proxy
// already lists `/book` in PUBLIC_ROUTES, so this layout never needs to
// fetch auth state.
//
// Story 3.1: Renter Listing Page & Photo Carousel.
export function RenterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <main className="min-h-screen bg-neutral-50">{children}</main>;
}

export default RenterLayout;
