import { z } from "zod";

import { phoneNumberSchema } from "@/lib/schemas/renter-auth-schema";

export const inquirySchema = z.object({
  listingId: z.string().uuid("Invalid listing"),
  phone: phoneNumberSchema,
  message: z
    .string()
    .trim()
    .min(1, "Message is required")
    .max(1600, "Message is too long"),
  turnstileToken: z.string().min(1, "Please complete the captcha"),
});

export type InquiryInput = z.infer<typeof inquirySchema>;
