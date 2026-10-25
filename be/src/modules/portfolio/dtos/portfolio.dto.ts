import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { graphemeLength } from "../../../core/utils/normalize";
import { cursorQuerySchema, expectedVersionSchema, objectIdSchema, reasonSchema } from "../../../shared/dto/common-schemas";
import { PORTFOLIO_ACCENTS, PORTFOLIO_SECTION_KINDS, PORTFOLIO_TEMPLATES } from "../entities/portfolio.interface";
import { safeHttpsUrl } from "../entities/portfolio.rules";

const L = LIMITS.portfolio;
const version = expectedVersionSchema.shape.expectedVersion;

/** Độ dài đếm GRAPHEME (emoji ghép = 1) — khớp cách client đếm (`graphemeLength`); `z.string().max` đếm code unit nên chặt hơn với emoji. */
const text = (max: number) => z.string().trim().refine((v) => graphemeLength(v) <= max, `Tối đa ${max} ký tự`);

/** Ô văn bản tuỳ chọn: `""` và `null` cùng nghĩa "xoá". */
const optionalText = (max: number) => text(max).nullable().transform((v) => (v === null || v === "" ? null : v));

export const linkSchema = z.object({
  label: z.string().trim().min(1, "Nhập tên liên kết").max(L.linkLabelMax),
  url: z.string().trim().max(L.linkUrlMax).refine((u) => safeHttpsUrl(u, L.linkUrlMax) !== null, "Liên kết phải là địa chỉ https:// hợp lệ"),
});

const sectionSchema = z.object({ kind: z.enum(PORTFOLIO_SECTION_KINDS), visible: z.boolean(), order: z.number().int().min(0).max(10) });

/** `PUT /me/portfolio` — ghi ĐỦ mọi trường (không PATCH); `.strict()` từ chối trường lạ. `expectedVersion: 0` khi hồ sơ chưa tồn tại (tạo lần đầu). */
export const updatePortfolioSchema = z
  .object({
    displayName: text(L.displayNameMax).refine((v) => graphemeLength(v) >= L.displayNameMin, `Tên hiển thị tối thiểu ${L.displayNameMin} ký tự`),
    headline: optionalText(L.headlineMax),
    bio: optionalText(L.bioMax),
    avatarAssetId: objectIdSchema.nullable(),
    links: z.array(linkSchema).max(L.linksMax),
    theme: z.object({ template: z.enum(PORTFOLIO_TEMPLATES), accent: z.enum(PORTFOLIO_ACCENTS) }).strict(),
    sections: z
      .array(sectionSchema)
      .length(PORTFOLIO_SECTION_KINDS.length)
      .refine((s) => new Set(s.map((x) => x.kind)).size === PORTFOLIO_SECTION_KINDS.length, "Mỗi mục (ABOUT, PROJECTS, SKILLS, CONTACT) phải xuất hiện đúng một lần"),
    seoIndexable: z.boolean(),
    expectedVersion: version,
  })
  .strict();
export type UpdatePortfolioDto = z.infer<typeof updatePortfolioSchema>;

/** Chỉ giới hạn độ dài — sai DẠNG slug trả `PORT_002` (đúng mã trong CR-10), không phải `VAL_001` chung. */
export const changeSlugSchema = z.object({ slug: z.string().trim().min(1).max(64), expectedVersion: version }).strict();
export type ChangeSlugDto = z.infer<typeof changeSlugSchema>;

export const slugAvailableQuerySchema = z.object({ slug: z.string().trim().max(64) });

export const previewQuerySchema = z.object({ template: z.enum(PORTFOLIO_TEMPLATES).optional(), accent: z.enum(PORTFOLIO_ACCENTS).optional() });
export type PreviewQueryDto = z.infer<typeof previewQuerySchema>;

export const eligibleQuerySchema = cursorQuerySchema;

export const addProjectSchema = z.object({ workspaceId: objectIdSchema }).strict();

export const updateProjectSchema = z
  .object({
    title: text(L.projectTitleMax).refine((v) => graphemeLength(v) >= L.projectTitleMin, `Tiêu đề dự án tối thiểu ${L.projectTitleMin} ký tự`),
    summary: optionalText(L.summaryMax),
    role: optionalText(L.roleMax),
    periodFrom: z.coerce.date().nullable(),
    periodTo: z.coerce.date().nullable(),
    highlights: z.array(text(L.highlightMax).refine((v) => v.length > 0, "Điểm nổi bật không được để trống")).max(L.highlightsMax),
    coverAssetId: objectIdSchema.nullable(),
    visible: z.boolean(),
    showTeammates: z.boolean(),
    expectedVersion: version,
  })
  .partial()
  .required({ expectedVersion: true })
  .strict()
  .refine((v) => !v.periodFrom || !v.periodTo || v.periodFrom <= v.periodTo, { message: "Thời gian bắt đầu phải trước thời gian kết thúc", path: ["periodTo"] });
export type UpdateProjectDto = z.infer<typeof updateProjectSchema>;

export const reorderProjectsSchema = z.object({ projectIds: z.array(objectIdSchema).max(L.projectsMax) }).strict();

export const publishSchema = z.object({ expectedVersion: version }).strict();

export const takedownSchema = reasonSchema.extend({ reportGroupKey: z.string().trim().max(120).optional() }).strict();
export type TakedownDto = z.infer<typeof takedownSchema>;

export const restoreSchema = reasonSchema.strict();

export const projectIdParamSchema = z.object({ projectId: objectIdSchema });
export const portfolioIdParamSchema = z.object({ portfolioId: objectIdSchema });
export const userIdParamSchema = z.object({ userId: objectIdSchema });
