import { beforeEach, describe, expect, it, vi } from "vitest";

const removeMock = vi.fn(async () => ({ error: null }));
const getPublicUrlMock = vi.fn((path: string) => ({
  data: { publicUrl: `https://example.supabase.co/object/public/listing-photos/${path}` },
}));
const fromMock = vi.fn(() => ({
  remove: removeMock,
  getPublicUrl: getPublicUrlMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    storage: { from: fromMock },
  })),
}));

import {
  LISTING_PHOTOS_BUCKET,
  deleteListingPhoto,
  getListingPhotoUploadPath,
  getPublicListingPhotoUrl,
} from "./storage";

describe("getListingPhotoUploadPath", () => {
  it("produces a path of the form `{operatorId}/{draftId}/{uuid}.{ext}`", () => {
    const path = getListingPhotoUploadPath(
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
      "generator-front.JPG",
    );
    expect(path).toMatch(
      /^11111111-1111-1111-1111-111111111111\/22222222-2222-2222-2222-222222222222\/[^/]+\.jpg$/,
    );
  });

  it("preserves allowed extensions (png, webp)", () => {
    const png = getListingPhotoUploadPath("op", "draft", "a.png");
    expect(png.endsWith(".png")).toBe(true);
    const webp = getListingPhotoUploadPath("op", "draft", "a.webp");
    expect(webp.endsWith(".webp")).toBe(true);
  });

  it("defaults to .jpg for unknown or missing extensions", () => {
    expect(getListingPhotoUploadPath("op", "draft", "no-ext").endsWith(".jpg")).toBe(
      true,
    );
    expect(getListingPhotoUploadPath("op", "draft", "a.gif").endsWith(".jpg")).toBe(
      true,
    );
  });
});

describe("getPublicListingPhotoUrl", () => {
  beforeEach(() => {
    fromMock.mockClear();
    getPublicUrlMock.mockClear();
  });

  it("uses the listing-photos bucket and returns the publicUrl field", async () => {
    const url = await getPublicListingPhotoUrl("op/draft/file.jpg");
    expect(fromMock).toHaveBeenCalledWith(LISTING_PHOTOS_BUCKET);
    expect(url).toContain("/listing-photos/op/draft/file.jpg");
  });
});

describe("deleteListingPhoto", () => {
  beforeEach(() => {
    fromMock.mockClear();
    removeMock.mockClear();
  });

  it("calls storage.from('listing-photos').remove([path]) and returns ok(null)", async () => {
    const result = await deleteListingPhoto("op/draft/file.jpg");
    expect(fromMock).toHaveBeenCalledWith(LISTING_PHOTOS_BUCKET);
    expect(removeMock).toHaveBeenCalledWith(["op/draft/file.jpg"]);
    expect(result.success).toBe(true);
  });
});
