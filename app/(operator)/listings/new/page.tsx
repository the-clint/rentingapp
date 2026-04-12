import Link from "next/link";

import { CreateListingWizard } from "@/components/listing/create-listing-wizard";

export function NewListingPage() {
  return (
    <div className="flex flex-col gap-space-6">
      <div className="flex items-start justify-between gap-space-4">
        <h1 className="text-h1 lg:text-h1-lg">New Listing</h1>
        <Link
          href="/listings"
          className="text-sm text-neutral-700 underline underline-offset-4 hover:text-primary-dark"
        >
          Cancel
        </Link>
      </div>
      <CreateListingWizard />
    </div>
  );
}

export default NewListingPage;
