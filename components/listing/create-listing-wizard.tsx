"use client";

import { useEffect, useReducer, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { createListing } from "@/lib/actions/listing-actions";
import { WizardStepIndicator } from "@/components/listing/wizard-step-indicator";
import { PhotosStep } from "@/components/listing/photos-step";
import { DetailsStep } from "@/components/listing/details-step";
import type { DetailsDraft } from "@/components/listing/listing-details-fields";
import { AvailabilityStep } from "@/components/listing/availability-step";
import type { PhotoDraft } from "@/components/listing/photo-uploader";

type Step = 1 | 2 | 3;

interface WizardState {
  step: Step;
  draftId: string;
  photos: PhotoDraft[];
  details: DetailsDraft;
}

type WizardAction =
  | { type: "goto"; step: Step }
  | { type: "set-photos"; photos: PhotoDraft[] }
  | {
      type: "set-detail";
      field: keyof DetailsDraft;
      value: string | number | null;
    };

const EMPTY_DETAILS: DetailsDraft = {
  name: "",
  description: "",
  dailyRateCents: null,
  pickupLocation: "",
  pickupInstructions: "",
};

function createInitialState(): WizardState {
  return {
    step: 1,
    draftId: crypto.randomUUID(),
    photos: [],
    details: { ...EMPTY_DETAILS },
  };
}

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "goto":
      return { ...state, step: action.step };
    case "set-photos":
      return { ...state, photos: action.photos };
    case "set-detail":
      return {
        ...state,
        details: { ...state.details, [action.field]: action.value },
      };
    default:
      return state;
  }
}

export function CreateListingWizard() {
  const router = useRouter();
  const [state, dispatch] = useReducer(
    wizardReducer,
    undefined,
    createInitialState,
  );
  const [operatorId, setOperatorId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setOperatorId(data.user.id);
    });
  }, []);

  const handlePublish = () => {
    setSubmitError(null);
    setSuccessMessage(null);

    const fd = new FormData();
    fd.set("name", state.details.name);
    fd.set("description", state.details.description);
    fd.set(
      "dailyRateCents",
      state.details.dailyRateCents === null
        ? "0"
        : String(state.details.dailyRateCents),
    );
    fd.set("pickupLocation", state.details.pickupLocation);
    fd.set("pickupInstructions", state.details.pickupInstructions);
    fd.set(
      "photos",
      JSON.stringify(
        state.photos.map((p) => ({
          path: p.path,
          isHero: p.isHero,
          position: p.position,
        })),
      ),
    );

    startTransition(async () => {
      const result = await createListing(fd);
      if (!result.success) {
        setSubmitError(result.error.message);
        return;
      }
      setSuccessMessage("Listing published!");
      router.push(`/listings/${result.data.listingId}?posted=1`);
    });
  };

  return (
    <div className="flex flex-col gap-space-6">
      <WizardStepIndicator currentStep={state.step} />

      <Card>
        <CardContent className="p-space-6 pt-space-6">
          {state.step === 1 && (
            <PhotosStep
              operatorId={operatorId ?? ""}
              draftId={state.draftId}
              photos={state.photos}
              onPhotosChange={(photos) =>
                dispatch({ type: "set-photos", photos })
              }
              onNext={() => dispatch({ type: "goto", step: 2 })}
            />
          )}
          {state.step === 2 && (
            <DetailsStep
              details={state.details}
              onDetailChange={(field, value) =>
                dispatch({ type: "set-detail", field, value })
              }
              onBack={() => dispatch({ type: "goto", step: 1 })}
              onNext={() => dispatch({ type: "goto", step: 3 })}
            />
          )}
          {state.step === 3 && (
            <AvailabilityStep
              onBack={() => dispatch({ type: "goto", step: 2 })}
              onPublish={handlePublish}
              isPublishing={isPending}
            />
          )}
        </CardContent>
      </Card>

      {submitError && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 p-space-4 text-sm text-destructive"
        >
          {submitError}
        </div>
      )}
      {successMessage && (
        <div
          role="status"
          className="rounded-md border border-primary/40 bg-primary-light/30 p-space-4 text-sm text-primary-dark"
        >
          {successMessage}
        </div>
      )}
    </div>
  );
}
