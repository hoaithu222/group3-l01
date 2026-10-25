import { z } from "zod";
import { objectIdSchema } from "../../../shared/dto/common-schemas";
import { CLIENT_ASSET_SCOPES, ASSET_KINDS } from "../entities/asset.interface";
import { mimePolicy } from "../services/mime-policy";

export const createAssetSchema = z
  .object({
    /** `REPORT` (tệp do server sinh) KHÔNG nằm trong danh sách này — client không tự tạo được. */
    scope: z.enum(CLIENT_ASSET_SCOPES),
    kind: z.enum(ASSET_KINDS),
    fileName: z.string().trim().min(1).max(255),
    mime: z.string().min(3).max(127),
    size: z.number().int().positive(),
    /** sha256 hex — tuỳ chọn, client gửi để đối chiếu (không bắt buộc, storage/processor vẫn là nguồn sự thật). */
    checksum: z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .optional(),
    workspaceId: objectIdSchema.optional(),
  })
  .superRefine((v, ctx) => mimePolicy.validateDeclared(v, ctx));

export type CreateAssetDto = z.infer<typeof createAssetSchema>;
