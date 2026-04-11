/**
 * Operator booking detail page (Stories 5-2 / 5-3 / 5-4).
 */

import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { OperatorBookingDetailView } from "@/components/operator/booking-detail-view";
import { fetchOperatorBookingDetail } from "@/lib/services/operator-bookings";
import { createClient } from "@/lib/supabase/server";

interface BookingDetailPageProps {
  params: Promise<{ bookingId: string }>;
}

async function BookingDetailPageBody({ params }: BookingDetailPageProps) {
  const { bookingId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const result = await fetchOperatorBookingDetail({
    operatorId: user.id,
    bookingId,
    today: new Date(),
  });
  if (!result.success) {
    if (result.error.code === "FORBIDDEN" || result.error.code === "NOT_FOUND") {
      redirect("/bookings");
    }
    return (
      <p className="text-small text-destructive">
        Could not load booking: {result.error.message}
      </p>
    );
  }

  return <OperatorBookingDetailView booking={result.data} />;
}

export default function BookingDetailPage(props: BookingDetailPageProps) {
  return (
    <Suspense fallback={null}>
      <BookingDetailPageBody {...props} />
    </Suspense>
  );
}
