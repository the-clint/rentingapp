import { EnvVarWarning } from "@/components/env-var-warning";
import { AuthButton } from "@/components/auth-button";
import { BrandLogo } from "@/components/brand-logo";
import { Hero } from "@/components/hero";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { hasEnvVars } from "@/lib/utils";
import { Suspense } from "react";

const features = [
  {
    title: "Listings that sell themselves",
    body: "Build a listing once and Everything.Rent generates ad copy ready to paste into KSL, Facebook Marketplace, and Craigslist.",
  },
  {
    title: "One inbox for every renter",
    body: "Inquiries, bookings, and SMS conversations land in a single hub — no more juggling tabs to find the next renter.",
  },
  {
    title: "Bookings with guardrails",
    body: "Real-time availability, digital contracts, and Stripe payment holds protect your gear from first inquiry to return.",
  },
  {
    title: "Built for Utah operators",
    body: "Designed for solo and small-team operators renting trailers, tools, and equipment across the Wasatch Front.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-20 items-center">
        <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16">
          <div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm">
            <div className="flex gap-5 items-center font-semibold">
              <BrandLogo height={32} />
            </div>
            {!hasEnvVars ? (
              <EnvVarWarning />
            ) : (
              <Suspense>
                <AuthButton />
              </Suspense>
            )}
          </div>
        </nav>
        <div className="flex-1 flex flex-col gap-20 max-w-5xl p-5 w-full">
          <Hero />
          <section className="flex flex-col gap-8 px-4">
            <h2 className="text-2xl lg:text-3xl font-semibold text-center">
              What you get
            </h2>
            <div className="grid gap-6 md:grid-cols-2">
              {features.map((feature) => (
                <div
                  key={feature.title}
                  className="rounded-lg border border-foreground/10 p-6 flex flex-col gap-2"
                >
                  <h3 className="font-semibold text-lg">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.body}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <footer className="w-full flex items-center justify-center border-t mx-auto text-center text-xs gap-8 py-16">
          <p>&copy; 2026 Everything.Rent</p>
          <ThemeSwitcher />
        </footer>
      </div>
    </main>
  );
}
