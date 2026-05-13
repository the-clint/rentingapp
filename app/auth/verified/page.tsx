import { VerifiedCountdown } from "@/components/auth/verified-countdown";
import { CheckCircle2 } from "lucide-react";
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
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" aria-hidden />
            </div>
            <CardTitle className="text-2xl">Email verified</CardTitle>
            <CardDescription>
              Your account is confirmed and you&apos;re signed in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VerifiedCountdown seconds={5} redirectTo="/dashboard" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
