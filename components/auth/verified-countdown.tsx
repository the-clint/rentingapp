"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  seconds: number;
  redirectTo: string;
};

export function VerifiedCountdown({ seconds, redirectTo }: Props) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (remaining <= 0) {
      router.push(redirectTo);
      return;
    }
    const t = setTimeout(() => setRemaining((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining, router, redirectTo]);

  return (
    <div className="space-y-4 text-center">
      <p className="text-sm text-muted-foreground">
        Redirecting to your dashboard in{" "}
        <span className="font-semibold text-foreground" aria-live="polite">
          {remaining}
        </span>{" "}
        second{remaining === 1 ? "" : "s"}…
      </p>
      <Button asChild className="w-full">
        <Link href={redirectTo}>Go to dashboard now</Link>
      </Button>
    </div>
  );
}
