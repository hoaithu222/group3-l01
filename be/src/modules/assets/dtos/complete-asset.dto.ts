import { z } from "zod";

/**
 * `POST /assets/:id/complete` (be.md §3) — chốt kích thước thật (đối chiếu
 * `storage.head()`) + gợi ý metadata (chỉ lưu TẠM, `asset-processor.ts` xác
 * nhận lại từ nội dung thật trước khi coi là chính thức).
 */
export const completeAssetSchema = z.object({
  size: z.number().int().positive(),
  durationMs: z.number().int().positive().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  /** Voice note — 64 điểm 0..100, tính ở client. */
  waveform: z.array(z.number().int().min(0).max(100)).length(64).optional(),
});

export type CompleteAssetDto = z.infer<typeof completeAssetSchema>;
