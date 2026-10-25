import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { graphemeLength } from "../../../core/utils/normalize";
import { objectIdSchema, expectedVersionSchema } from "../../../shared/dto/common-schemas";
import { WORKSPACE_COVER_PRESETS } from "../entities/workspace.interface";
import { ianaTimeZoneSchema } from "./timezone.dto";

export const updateWorkspaceSchema = z
  .object({
    name: z
      .string()
      .trim()
      .refine((s) => {
        const len = graphemeLength(s);
        return len >= LIMITS.workspace.nameMin && len <= LIMITS.workspace.nameMax;
      }, `Tên nhóm ${LIMITS.workspace.nameMin}-${LIMITS.workspace.nameMax} ký tự`)
      .optional(),
    description: z.string().trim().max(LIMITS.workspace.descriptionMax).nullable().optional(),
    /** `null` = gỡ ảnh đại diện. Asset scope `AVATAR` của chính người sửa, đã READY. */
    avatarAssetId: objectIdSchema.nullable().optional(),
    /** `null` = gỡ ảnh bìa (bìa quay về `coverPreset`). Cùng điều kiện với `avatarAssetId`. */
    coverAssetId: objectIdSchema.nullable().optional(),
    /** `null` = để client tự chọn nền theo id nhóm. */
    coverPreset: z.enum(WORKSPACE_COVER_PRESETS).nullable().optional(),
    /** Múi giờ IANA của nhóm; `null` = quay về mặc định hệ thống (đồng bộ chéo #9). */
    timezone: ianaTimeZoneSchema.nullable().optional(),
  })
  .merge(expectedVersionSchema)
  .refine(
    (v) =>
      v.name !== undefined ||
      v.description !== undefined ||
      v.avatarAssetId !== undefined ||
      v.coverAssetId !== undefined ||
      v.coverPreset !== undefined ||
      v.timezone !== undefined,
    "Không có thay đổi"
  );

export type UpdateWorkspaceDto = z.infer<typeof updateWorkspaceSchema>;
