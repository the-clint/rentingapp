import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Suspense } from "react";

async function ErrorContent({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const message = params?.error;

  return (
    <div className="space-y-4">
      <div className="space-y-2 text-sm text-muted-foreground">
        <p>
          We couldn&apos;t verify your email. This usually means one of the
          following:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>The link has expired (links are only valid for a short time).</li>
          <li>The link was already used to verify this account.</li>
          <li>The link was opened in a different browser than you signed up in.</li>
        </ul>
        <p className="pt-2">
          Try signing in below — if your email still isn&apos;t confirmed,
          you&apos;ll be able to request a new verification email.
        </p>
      </div>

      {message ? (
        <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Details:</span> {message}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild className="w-full">
          <Link href="/auth/login">Go to login</Link>
        </Button>
        <Button asChild variant="outline" className="w-full">
          <Link href="/auth/sign-up">Sign up again</Link>
        </Button>
      </div>
    </div>
  );
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="items-center text-center">
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-6 w-6 text-destructive" aria-hidden />
            </div>
            <CardTitle className="text-2xl">Verification failed</CardTitle>
            <CardDescription>
              We weren&apos;t able to confirm your email from this link.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense>
              <ErrorContent searchParams={searchParams} />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
