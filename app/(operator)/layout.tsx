export default function OperatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Auth check is handled by proxy.ts middleware.
  // Story 1-4 will build out the full operator layout with sidebar navigation.
  return <>{children}</>;
}
