import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const pushMock = vi.fn();
const refreshMock = vi.fn();
const updateListingMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

vi.mock("@/lib/actions/listing-actions", () => ({
  updateListing: (...args: unknown[]) => updateListingMock(...args),
}));

// PhotoUploader imports the browser Supabase client. Stub it so the
// module graph loads without environment access; the tests never exercise
// the uploader (they only read / write the existing photos array).
vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: "https://example/x" } })),
      })),
    },
  })),
}));

import { EditListingForm } from "./edit-listing-form";
import type { PhotoDraft } from "./photo-uploader";
import type { DetailsDraft } from "./listing-details-fields";

function initialPhotos(): PhotoDraft[] {
  return [
    {
      path: "op-1/listing-1/photo-1.jpg",
      isHero: true,
      position: 0,
      previewUrl: "https://example/photo-1.jpg",
      fileName: "photo-1.jpg",
    },
  ];
}

function initialDetails(): DetailsDraft {
  return {
    name: "Honda EU2200i Generator",
    description:
      "A quiet, portable inverter generator perfect for camping or backup power.",
    dailyRateCents: 7500,
    addressStreet: "123 Main St",
    addressCity: "Salt Lake City",
    addressState: "UT",
    addressZip: "84101",
    pickupInstructions: "",
  };
}

function renderForm() {
  return render(
    <EditListingForm
      listingId="listing-1"
      operatorId="op-1"
      initialValues={{ details: initialDetails(), photos: initialPhotos() }}
    />,
  );
}

describe("EditListingForm", () => {
  beforeEach(() => {
    pushMock.mockReset();
    refreshMock.mockReset();
    updateListingMock.mockReset();
  });

  it("renders every field pre-populated from initialValues", () => {
    renderForm();
    expect(screen.getByLabelText("Equipment name")).toHaveValue(
      "Honda EU2200i Generator",
    );
    expect(screen.getByLabelText("Description")).toHaveValue(
      "A quiet, portable inverter generator perfect for camping or backup power.",
    );
    expect(screen.getByLabelText("Daily rate")).toHaveValue("75.00");
    expect(screen.getByLabelText("Street address")).toHaveValue("123 Main St");
    expect(screen.getByLabelText("City")).toHaveValue("Salt Lake City");
    expect(screen.getByLabelText("State")).toHaveValue("UT");
    expect(screen.getByLabelText("ZIP")).toHaveValue("84101");
  });

  it("enables Save changes when the form is valid", () => {
    renderForm();
    const save = screen.getByRole("button", { name: /save changes/i });
    expect(save).toBeEnabled();
  });

  it("disables Save changes when the name field is cleared", () => {
    renderForm();
    const nameInput = screen.getByLabelText("Equipment name");
    fireEvent.change(nameInput, { target: { value: "" } });
    const save = screen.getByRole("button", { name: /save changes/i });
    expect(save).toBeDisabled();
  });

  it("navigates to the detail page when Cancel is clicked", () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(pushMock).toHaveBeenCalledWith("/listings/listing-1");
  });

  it("calls updateListing with a FormData payload matching the current state on save", async () => {
    updateListingMock.mockResolvedValue({
      success: true,
      data: { listingId: "listing-1" },
    });
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(updateListingMock).toHaveBeenCalledTimes(1);
    });
    const [id, fd] = updateListingMock.mock.calls[0] as [string, FormData];
    expect(id).toBe("listing-1");
    expect(fd.get("name")).toBe("Honda EU2200i Generator");
    expect(fd.get("dailyRateCents")).toBe("7500");
    expect(fd.get("addressStreet")).toBe("123 Main St");
    expect(fd.get("addressCity")).toBe("Salt Lake City");
    expect(fd.get("addressState")).toBe("UT");
    expect(fd.get("addressZip")).toBe("84101");
    expect(fd.get("pickupInstructions")).toBe("");
    const photos = JSON.parse(String(fd.get("photos"))) as unknown[];
    expect(photos.length).toBe(1);

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/listings/listing-1");
    });
  });

  it("renders the error summary when updateListing returns a failure", async () => {
    updateListingMock.mockResolvedValue({
      success: false,
      error: { code: "DATABASE_ERROR", message: "constraint violation" },
    });
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("constraint violation");
    });
    expect(pushMock).not.toHaveBeenCalled();
  });
});
