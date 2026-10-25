import { z } from 'zod';

/** Khớp registry BE `economy` (`system-config.registry.ts`): phí 0–50%, cấp tối thiểu 1–200, lý do 10–500. */
export const economySettingsFormSchema = z.object({
  marketplaceEnabled: z.boolean(),
  marketplaceFeePercent: z.coerce.number().int().min(0).max(50),
  sellerMinLevel: z.coerce.number().int().min(1).max(200),
  reason: z.string().trim().min(10, 'Lý do tối thiểu 10 ký tự').max(500),
});

export type EconomySettingsFormValues = z.infer<typeof economySettingsFormSchema>;
