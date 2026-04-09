import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/actions/auth-actions";
import { Suspense } from "react";

async function DashboardContent() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    redirect("/auth/login");
  }

  return (
    <>
      <p className="text-muted-foreground">
        Welcome, {data.user.email}
      </p>
      <p className="text-sm text-muted-foreground">
        Dashboard content will be built in Story 1.4.
      </p>
      <form action={signOut}>
        <button
          type="submit"
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Sign out
        </button>
      </form>
    </>
  );
}

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-3xl font-bold">Operator Dashboard</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading...</p>}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}
