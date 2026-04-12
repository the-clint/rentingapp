import { Suspense } from "react";

import { DashboardHome } from "@/components/operator/dashboard-home";
import { DashboardSkeleton } from "@/components/operator/dashboard-skeleton";

export function DashboardPage() {
  return (
    <div className="flex flex-col gap-space-6">
      <h1 className="text-h1 lg:text-h1-lg">Dashboard</h1>
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardHome />
      </Suspense>
    </div>
  );
}

export default DashboardPage;
