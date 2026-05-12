import Link from "next/link";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Page() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="items-center text-center">
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Mail className="h-6 w-6 text-primary" aria-hidden />
            </div>
            <CardTitle className="text-2xl">Verify your email</CardTitle>
            <CardDescription>
              We sent a confirmation link to the email you just provided.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>Open the email from Everything.Rent.</li>
              <li>
                Click the <span className="font-medium">Confirm your email</span> link inside.
              </li>
              <li>
                You&apos;ll be returned here and signed in to your dashboard automatically.
              </li>
            </ol>
            <p className="text-xs text-muted-foreground">
              Can&apos;t find it? Check your spam or promotions folder. The link
              expires after a short time — if it doesn&apos;t work, sign in to
              request a new one.
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link href="/auth/login">Back to login</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
