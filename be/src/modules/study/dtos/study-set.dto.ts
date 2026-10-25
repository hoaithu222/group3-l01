import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { graphemeLength } from "../../../core/utils/normalize";
import { cursorQuerySchema, objectIdSchema } from "../../../shared/dto/common-schemas";
import { STUDY_VISIBILITIES } from "../entities/study-set.interface";

/** Độ dài tính theo GRAPHEME (emoji ghép = 1) — 02-conventions §2 "Độ dài". */
const text = (max: number, label: string) =>
  z
    .string()
    .trim()
    .refine((s) => graphemeLength(s) <= max, { message: `${label} tối đa ${max} ký tự` });

const title = text(LIMITS.study.setTitleMax, "Tiêu đề").refine((s) => s.length > 0, { message: "Tiêu đề bắt buộc" });
const description = text(LIMITS.study.setDescriptionMax, "Mô tả");
const tags = z.array(z.string().trim().min(1).max(LIMITS.study.tagMax)).max(LIMITS.study.tagsMax);
const language = z.string().trim().min(2).max(8);

/**
 * `visibility WORKSPACE` thiếu `workspaceId` và `PUBLIC` thiếu `confirmPublic` do SERVICE kiểm để trả đúng mã
 * `STUDY_003`/`STUDY_008` (refine của Zod chỉ ra `VAL_001`).
 */
export const createSetSchema = z.object({
  title,
  description: description.optional(),
  tags: tags.default([]),
  visibility: z.enum(STUDY_VISIBILITIES).default("PRIVATE"),
  workspaceId: objectIdSchema.optional(),
  coverAssetId: objectIdSchema.optional(),
  language: language.optional(),
  confirmPublic: z.boolean().optional(),
});
export type CreateSetDto = z.infer<typeof createSetSchema>;

/** `null` xoá giá trị (mô tả, ảnh bìa, ngôn ngữ); thiếu = giữ nguyên. Không đổi được `workspaceId` của bộ đã gắn nhóm. */
export const patchSetSchema = z.object({
  expectedVersion: z.number().int().min(1),
  title: title.optional(),
  description: description.nullable().optional(),
  tags: tags.optional(),
  visibility: z.enum(STUDY_VISIBILITIES).optional(),
  workspaceId: objectIdSchema.optional(),
  coverAssetId: objectIdSchema.nullable().optional(),
  language: language.nullable().optional(),
  confirmPublic: z.boolean().optional(),
});
export type PatchSetDto = z.infer<typeof patchSetSchema>;

/** `hasQuiz` nhận chuỗi `"true"|"false"` (KHÔNG dùng `z.coerce.boolean()` — `"false"` sẽ thành `true`). */
export const listSetsQuerySchema = cursorQuerySchema.extend({
  scope: z.enum(["mine", "workspace", "public"]).default("mine"),
  workspaceId: objectIdSchema.optional(),
  q: z.string().trim().min(2).max(100).optional(),
  tag: z.string().trim().min(1).max(LIMITS.study.tagMax).optional(),
  hasQuiz: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});
export type ListSetsQueryDto = z.infer<typeof listSetsQuerySchema>;

export const duplicateSetSchema = z.object({
  targetVisibility: z.enum(["PRIVATE", "WORKSPACE"]).default("PRIVATE"),
  workspaceId: objectIdSchema.optional(),
});
export type DuplicateSetDto = z.infer<typeof duplicateSetSchema>;

const REPORT_REASONS = ["SPAM", "COPYRIGHT", "INAPPROPRIATE", "WRONG_CONTENT", "OTHER"] as const;

/** Như `POST /reports` (moderation): `OTHER` bắt buộc mô tả ≥ `LIMITS.report.otherDescriptionMin` ký tự. */
export const reportSetSchema = z
  .object({
    reason: z.enum(REPORT_REASONS),
    description: z.string().trim().max(LIMITS.report.descriptionMax).optional(),
  })
  .refine((v) => v.reason !== "OTHER" || (v.description?.length ?? 0) >= LIMITS.report.otherDescriptionMin, {
    message: `Mô tả ít nhất ${LIMITS.report.otherDescriptionMin} ký tự khi chọn "Khác"`,
    path: ["description"],
  });
export type ReportSetDto = z.infer<typeof reportSetSchema>;

export const popularTagsQuerySchema = z.object({ workspaceId: objectIdSchema.optional() });
export type PopularTagsQueryDto = z.infer<typeof popularTagsQuerySchema>;

/** `GET /admin/study-sets/:id/items` — phân trang trang quản trị (≤ 50/trang, admin.md §3). */
export const adminItemsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(50),
});
export type AdminItemsQueryDto = z.infer<typeof adminItemsQuerySchema>;

/**
 * `GET /admin/study-sets` — tab `content` của admin (p4-01 admin.md §1): bộ PUBLIC có ≥ `minReports` báo cáo mở (mặc định
 * `LIMITS.study.reportedPriorityThreshold` = 5), sắp `reportedCount` giảm dần. Chỉ đọc; phân trang page/limit (≤ 50).
 */
export const adminReportedSetsQuerySchema = z.object({
  minReports: z.coerce.number().int().min(1).max(1000).default(LIMITS.study.reportedPriorityThreshold),
  status: z.enum(["ACTIVE", "HIDDEN"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type AdminReportedSetsQueryDto = z.infer<typeof adminReportedSetsQuerySchema>;
