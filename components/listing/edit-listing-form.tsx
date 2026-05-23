"use client";

import { useReducer, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { updateListing } from "@/lib/actions/listing-actions";
import {
  ListingDetailsFields,
  areDetailsValid,
  validateField,
  type DetailsDraft,
  type FieldKey,
} from "@/components/listing/listing-details-fields";
import {
  PhotoUploader,
  type PhotoDraft,
} from "@/components/listing/photo-uploader";

export interface EditListingInitialValues {
  details: DetailsDraft;
  photos: PhotoDraft[];
}

interface EditListingFormProps {
  listingId: string;
  operatorId: string;
  initialValues: EditListingInitialValues;
}

interface EditFormState {
  details: DetailsDraft;
  photos: PhotoDraft[];
  detailErrors: Partial<Record<FieldKey, string>>;
  saveError: string | null;
}

type EditFormAction =
  | { type: "set-detail"; field: keyof DetailsDraft; value: string | number | null }
  | { type: "set-photos"; photos: PhotoDraft[] }
  | { type: "set-detail-error"; field: FieldKey; message: string | undefined }
  | { type: "save-error"; message: string }
  | { type: "clear-save-error" };

function reducer(state: EditFormState, action: EditFormAction): EditFormState {
  switch (action.type) {
    case "set-detail":
      return {
        ...state,
        details: { ...state.details, [action.field]: action.value },
      };
    case "set-photos":
      return { ...state, photos: action.photos };
    case "set-detail-error":
      return {
        ...state,
        detailErrors: { ...state.detailErrors, [action.field]: action.message },
      };
    case "save-error":
      return { ...state, saveError: action.message };
    case "clear-save-error":
      return { ...state, saveError: null };
    default:
      return state;
  }
}

function createInitialState(initial: EditListingInitialValues): EditFormState {
  return {
    details: initial.details,
    photos: initial.photos,
    detailErrors: {},
    saveError: null,
  };
}

export function EditListingForm({
  listingId,
  operatorId,
  initialValues,
}: EditListingFormProps) {
  const router = useRouter();
  const [state, dispatch] = useReducer(
    reducer,
    initialValues,
    createInitialState,
  );
  const [isPending, startTransition] = useTransition();

  const hasHero = state.photos.some((p) => p.isHero);
  const isFormValid =
    areDetailsValid(state.details) && state.photos.length >= 1 && hasHero;

  const handleDetailChange = <K extends keyof DetailsDraft>(
    field: K,
    value: DetailsDraft[K],
  ) => {
    dispatch({ type: "set-detail", field, value });
  };

  const handleBlur = (field: FieldKey, value: unknown) => {
    const msg = validateField(field, value);
    dispatch({ type: "set-detail-error", field, message: msg });
  };

  const submitUpdate = () => {
    if (isPending) return;
    dispatch({ type: "clear-save-error" });

    const fd = new FormData();
    fd.set("name", state.details.name);
    fd.set("description", state.details.description);
    fd.set(
      "dailyRateCents",
      state.details.dailyRateCents === null
        ? "0"
        : String(state.details.dailyRateCents),
    );
    fd.set("addressStreet", state.details.addressStreet);
    fd.set("addressCity", state.details.addressCity);
    fd.set("addressState", state.details.addressState);
    fd.set("addressZip", state.details.addressZip);
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
      const result = await updateListing(listingId, fd);
      if (!result.success) {
        dispatch({ type: "save-error", message: result.error.message });
        return;
      }
      // Navigation IS the success signal: the operator lands back on the
      // detail page with the refreshed data. Cache invalidation is handled
      // server-side via revalidatePath in `updateListing`; calling
      // router.refresh() here on Next.js 16 cancels the in-flight push and
      // leaves the user stuck on /edit.
      router.push(`/listings/${listingId}`);
    });
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitUpdate();
  };

  const handleCancel = () => {
    router.push(`/listings/${listingId}`);
  };

  return (
    <form
      aria-label="Edit listing"
      className="flex flex-col gap-space-8"
      onSubmit={handleSubmit}
    >
      <section className="flex flex-col gap-space-4">
        <h2 className="text-h2 font-semibold">Details</h2>
        <ListingDetailsFields
          details={state.details}
          errors={state.detailErrors}
          onDetailChange={handleDetailChange}
          onBlur={handleBlur}
        />
      </section>

      <section className="flex flex-col gap-space-4">
        <h2 className="text-h2 font-semibold">Photos</h2>
        <PhotoUploader
          operatorId={operatorId}
          draftId={listingId}
          photos={state.photos}
          onChange={(photos) => dispatch({ type: "set-photos", photos })}
        />
      </section>

      {state.saveError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 p-space-4 text-sm text-destructive"
        >
          {state.saveError}
        </p>
      )}

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={handleCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!isFormValid || isPending}>
          {isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
