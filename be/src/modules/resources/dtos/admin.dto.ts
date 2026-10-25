import { z } from "zod";
import { reasonSchema } from "../../../shared/dto/common-schemas";

const GiB = 1024 * 1024 * 1024;

/** Khớp `SYSTEM_CONFIG_REGISTRY.resource.quotaOverrides[].bytes` (0,5–100 GiB, admin.md p3-01 §2.1). */
export const QUOTA_MIN_BYTES = GiB / 2;
export const QUOTA_MAX_BYTES = 100 * GiB;
/** Khớp `.max(500)` của schema registry `resource`. */
export const QUOTA_OVERRIDES_MAX = 500;

export const setResourceQuotaSchema = z.object({
  bytes: z.number().int().min(QUOTA_MIN_BYTES).max(QUOTA_MAX_BYTES),
  reason: reasonSchema.shape.reason,
});
export type SetResourceQuotaDto = z.infer<typeof setResourceQuotaSchema>;

export const resetResourceQuotaSchema = reasonSchema;
export type ResetResourceQuotaDto = z.infer<typeof resetResourceQuotaSchema>;
