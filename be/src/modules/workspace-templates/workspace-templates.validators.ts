import { z } from "zod";
import { LIMITS } from "../../core/constants/limits";
import { graphemeLength, normalizeSearch } from "../../core/utils/normalize";
import { expectedVersionSchema, objectIdSchema, reasonSchema } from "../../shared/dto/common-schemas";

/** Khoá kênh trong mẫu — chuỗi ngắn ổn định, KHÔNG phải tên hiển thị (`a-z0-9-`). */
export const templateKeySchema = z.string().regex(/^[a-z0-9-]{1,40}$/, "Khoá chỉ gồm a-z, 0-9 và dấu gạch ngang (tối đa 40 ký tự)");

const templateCodeSchema = z.string().regex(/^[a-z0-9-]{2,40}$/, "Mã mẫu không hợp lệ");

/** Mã mẫu (`course`, `capstone`, `self-study`). */
export const templateCodeParamSchema = z.object({ code: templateCodeSchema });

/**
 * Param của `POST /workspaces/:workspaceId/templates/:code/apply`. `validateParams` THAY `req.params` bằng kết quả parse (Zod bỏ khoá lạ)
 * nên schema phải khai CẢ `workspaceId` — nếu không controller đọc `undefined` (lỗi đã gặp ở test tích hợp TPL-02).
 */
export const applyTemplateParamsSchema = z.object({ workspaceId: objectIdSchema, code: templateCodeSchema });

const channelNameSchema = z
  .string()
  .trim()
  .refine(
    (s) => graphemeLength(s) >= LIMITS.channel.nameMin && graphemeLength(s) <= LIMITS.channel.nameMax,
    `Tên kênh ${LIMITS.channel.nameMin}-${LIMITS.channel.nameMax} ký tự`
  );

export const templateChannelSchema = z.object({
  key: templateKeySchema,
  name: channelNameSchema,
  description: z.string().trim().max(LIMITS.channel.descriptionMax).default(""),
  type: z.enum(["TEXT", "VOICE", "POMODORO"]).default("TEXT"),
  visibility: z.enum(["PUBLIC", "PRIVATE"]).default("PUBLIC"),
  postingPolicy: z.enum(["MEMBERS", "ADMINS_ONLY"]).default("MEMBERS"),
  defaultSelected: z.boolean().default(true),
});
export type TemplateChannelDef = z.infer<typeof templateChannelSchema>;

/** Kênh mặc định "Chung" luôn tự tạo cùng nhóm — mẫu không được khai lại (admin.md p5-04 §2.1). */
const RESERVED_NAME = "chung";

/** 1–`templateChannelsMax` kênh; khoá và tên (đã chuẩn hoá) không trùng nhau; không có kênh "Chung". */
export const templateChannelsSchema = z
  .array(templateChannelSchema)
  .min(1, "Mẫu cần ít nhất 1 kênh")
  .max(LIMITS.workspaceTemplate.templateChannelsMax, `Mẫu tối đa ${LIMITS.workspaceTemplate.templateChannelsMax} kênh`)
  .superRefine((channels, ctx) => {
    const keys = new Set<string>();
    const names = new Set<string>();
    channels.forEach((c, index) => {
      if (keys.has(c.key)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, "key"], message: "Khoá kênh bị trùng" });
      keys.add(c.key);
      const n = normalizeSearch(c.name);
      if (n === RESERVED_NAME) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, "name"], message: 'Không dùng tên "Chung" (kênh mặc định tự tạo)' });
      else if (names.has(n)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, "name"], message: "Tên kênh bị trùng trong mẫu" });
      names.add(n);
    });
  });

/** `POST /workspaces/:workspaceId/templates/:code/apply`. */
export const applyTemplateSchema = z.object({
  channelKeys: z.array(templateKeySchema).min(1).max(LIMITS.workspaceTemplate.channelKeysMax),
});
export type ApplyTemplateDto = z.infer<typeof applyTemplateSchema>;

/** `PUT /admin/workspace-templates/:code` — sửa một phần; `expectedVersion` + `reason` bắt buộc; không tạo/xoá mã mẫu từ UI. */
export const adminUpdateTemplateSchema = z
  .object({
    name: z.string().trim().min(2, "Tên mẫu 2-60 ký tự").max(60, "Tên mẫu 2-60 ký tự").optional(),
    description: z.string().trim().max(300, "Mô tả tối đa 300 ký tự").optional(),
    isActive: z.boolean().optional(),
    order: z.number().int().min(0).max(1000).optional(),
    channels: templateChannelsSchema.optional(),
  })
  .merge(expectedVersionSchema)
  .merge(reasonSchema)
  .refine((v) => [v.name, v.description, v.isActive, v.order, v.channels].some((x) => x !== undefined), {
    message: "Cần ít nhất một trường thay đổi",
    path: ["name"],
  });
export type AdminUpdateTemplateDto = z.infer<typeof adminUpdateTemplateSchema>;
