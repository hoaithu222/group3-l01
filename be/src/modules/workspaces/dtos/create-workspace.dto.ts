import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { graphemeLength } from "../../../core/utils/normalize";
import { objectIdSchema } from "../../../shared/dto/common-schemas";
import { WORKSPACE_COVER_PRESETS } from "../entities/workspace.interface";
import { ianaTimeZoneSchema } from "./timezone.dto";

export const createWorkspaceSchema = z
  .object({
    name: z
      .string()
      .trim()
      .refine(
        (s) => {
          const len = graphemeLength(s);
          return len >= LIMITS.workspace.nameMin && len <= LIMITS.workspace.nameMax;
        },
        `Tên nhóm ${LIMITS.workspace.nameMin}-${LIMITS.workspace.nameMax} ký tự`
      ),
    description: z.string().trim().max(LIMITS.workspace.descriptionMax).optional(),
    /** Asset scope `AVATAR` (ảnh, ≤ 2 MiB) của chính người tạo, đã READY. */
    avatarAssetId: objectIdSchema.optional(),
    /** Ảnh bìa — cùng điều kiện với `avatarAssetId`. */
    coverAssetId: objectIdSchema.optional(),
    /** Mẫu nền bìa khi chưa có ảnh (`WORKSPACE_COVER_PRESETS`). */
    coverPreset: z.enum(WORKSPACE_COVER_PRESETS).optional(),
    /** Múi giờ IANA của nhóm (đồng bộ chéo #9); vắng ⇒ theo mặc định hệ thống (`pm.timezone` → `CRON_TZ`). */
    timezone: ianaTimeZoneSchema.optional(),
    /** p5-04 — tạo nhóm từ mẫu (`GET /workspace-templates`); `channelKeys` vắng → kênh `defaultSelected` của mẫu, rỗng → không kênh nào. */
    templateCode: z
      .string()
      .regex(/^[a-z0-9-]{2,40}$/, "Mã mẫu không hợp lệ")
      .optional(),
    channelKeys: z
      .array(z.string().regex(/^[a-z0-9-]{1,40}$/))
      .max(LIMITS.workspaceTemplate.channelKeysMax)
      .optional(),
  })
  .refine((v) => v.channelKeys === undefined || v.templateCode !== undefined, {
    message: "channelKeys chỉ dùng kèm templateCode",
    path: ["channelKeys"],
  });

export type CreateWorkspaceDto = z.infer<typeof createWorkspaceSchema>;
