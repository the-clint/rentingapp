import Link from "next/link";

import { Button } from "./ui/button";

export function Hero() {
  return (
    <div className="flex flex-col gap-10 items-center text-center pt-12">
      <h1 className="text-4xl lg:text-6xl font-semibold !leading-tight max-w-3xl">
        Run your equipment rental business from one place
      </h1>
      <p className="text-lg lg:text-xl text-muted-foreground max-w-2xl">
        Everything.Rent gives independent rental operators the tools to list
        equipment, post to KSL, Facebook Marketplace, and Craigslist, and turn
        every inquiry into a booking — with digital contracts and Stripe payment
        holds built in.
      </p>
      <div className="flex flex-wrap gap-3 justify-center">
        <Button asChild size="lg">
          <Link href="/auth/sign-up">Get started</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/auth/login">Sign in</Link>
        </Button>
      </div>
      <div className="w-full p-[1px] bg-gradient-to-r from-transparent via-foreground/10 to-transparent my-8" />
    </div>
  );
}
