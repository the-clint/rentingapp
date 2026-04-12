"use client";

import { Button } from "@/components/ui/button";
import {
  PhotoUploader,
  type PhotoDraft,
} from "@/components/listing/photo-uploader";

interface PhotosStepProps {
  operatorId: string;
  draftId: string;
  photos: PhotoDraft[];
  onPhotosChange: (photos: PhotoDraft[]) => void;
  onNext: () => void;
}

export function PhotosStep({
  operatorId,
  draftId,
  photos,
  onPhotosChange,
  onNext,
}: PhotosStepProps) {
  const canAdvance = photos.length >= 1;

  return (
    <div className="flex flex-col gap-space-6">
      <PhotoUploader
        operatorId={operatorId}
        draftId={draftId}
        photos={photos}
        onChange={onPhotosChange}
      />
      <div className="flex justify-end">
        <Button type="button" onClick={onNext} disabled={!canAdvance}>
          Next: Details
        </Button>
      </div>
    </div>
  );
}
