import { newObjectId } from "../../../core/utils/object-id";
import { addProjectSchema, changeSlugSchema, previewQuerySchema, publishSchema, reorderProjectsSchema, restoreSchema, slugAvailableQuerySchema, takedownSchema, updatePortfolioSchema, updateProjectSchema } from "../dtos";

/** DTO Zod (be.md §3): `.strict()`, đếm grapheme, https-only, mục đủ 4, tiêu đề/ngày dự án, các schema nhỏ. */
const base = {
  displayName: "Nguyễn Văn An",
  headline: null,
  bio: null,
  avatarAssetId: null,
  links: [],
  theme: { template: "CLASSIC", accent: "GREEN" },
  sections: [
    { kind: "ABOUT", visible: true, order: 0 },
    { kind: "PROJECTS", visible: true, order: 1 },
    { kind: "SKILLS", visible: true, order: 2 },
    { kind: "CONTACT", visible: true, order: 3 },
  ],
  seoIndexable: false,
  expectedVersion: 0,
};

describe("updatePortfolioSchema", () => {
  it("hợp lệ; '' và null cùng nghĩa 'xoá' (thành null); chuỗi được trim", () => {
    const parsed = updatePortfolioSchema.parse({ ...base, headline: "   ", bio: "", displayName: "  An  " });
    expect(parsed).toMatchObject({ headline: null, bio: null, displayName: "An" });
  });

  it("trường lạ → lỗi (.strict); thiếu expectedVersion → lỗi; version âm/thập phân → lỗi", () => {
    expect(updatePortfolioSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
    const noVersion = Object.fromEntries(Object.entries(base).filter(([key]) => key !== "expectedVersion"));
    expect(updatePortfolioSchema.safeParse(noVersion).success).toBe(false);
    expect(updatePortfolioSchema.safeParse({ ...base, expectedVersion: -1 }).success).toBe(false);
    expect(updatePortfolioSchema.safeParse({ ...base, expectedVersion: 1.5 }).success).toBe(false);
  });

  it("độ dài đếm GRAPHEME: 120 emoji ghép hợp lệ ở tiêu đề; 121 grapheme thì không", () => {
    const family = "👨‍👩‍👧";
    expect(updatePortfolioSchema.safeParse({ ...base, headline: family.repeat(120) }).success).toBe(true);
    expect(updatePortfolioSchema.safeParse({ ...base, headline: family.repeat(121) }).success).toBe(false);
    expect(updatePortfolioSchema.safeParse({ ...base, bio: "a".repeat(600) }).success).toBe(true);
    expect(updatePortfolioSchema.safeParse({ ...base, bio: "a".repeat(601) }).success).toBe(false);
  });

  it("tên hiển thị 2–60 grapheme", () => {
    expect(updatePortfolioSchema.safeParse({ ...base, displayName: "A" }).success).toBe(false);
    expect(updatePortfolioSchema.safeParse({ ...base, displayName: "Ab" }).success).toBe(true);
    expect(updatePortfolioSchema.safeParse({ ...base, displayName: "a".repeat(61) }).success).toBe(false);
  });

  it("liên kết: chỉ https hợp lệ, tối đa 6, nhãn 1–30, URL ≤ 300", () => {
    const link = (url: string, label = "Trang") => ({ label, url });
    expect(updatePortfolioSchema.safeParse({ ...base, links: [link("https://github.com/an")] }).success).toBe(true);
    for (const url of ["javascript:alert(1)", "http://x.com", "https://u:p@x.com", "ftp://x.com", "abc"]) expect(updatePortfolioSchema.safeParse({ ...base, links: [link(url)] }).success).toBe(false);
    expect(updatePortfolioSchema.safeParse({ ...base, links: [link("https://x.com", "")] }).success).toBe(false);
    expect(updatePortfolioSchema.safeParse({ ...base, links: [link("https://x.com", "n".repeat(31))] }).success).toBe(false);
    expect(updatePortfolioSchema.safeParse({ ...base, links: Array.from({ length: 6 }, () => link("https://x.com")) }).success).toBe(true);
    expect(updatePortfolioSchema.safeParse({ ...base, links: Array.from({ length: 7 }, () => link("https://x.com")) }).success).toBe(false);
  });

  it("mục: đủ 4 loại đúng một lần; order 0–10; mẫu/màu ngoài danh mục bị từ chối", () => {
    expect(updatePortfolioSchema.safeParse({ ...base, sections: base.sections.slice(0, 3) }).success).toBe(false);
    expect(updatePortfolioSchema.safeParse({ ...base, sections: [...base.sections.slice(0, 3), { kind: "ABOUT", visible: true, order: 3 }] }).success).toBe(false);
    expect(updatePortfolioSchema.safeParse({ ...base, sections: base.sections.map((s) => ({ ...s, order: 11 })) }).success).toBe(false);
    expect(updatePortfolioSchema.safeParse({ ...base, theme: { template: "NEON", accent: "GREEN" } }).success).toBe(false);
    expect(updatePortfolioSchema.safeParse({ ...base, theme: { template: "CLASSIC", accent: "PINK" } }).success).toBe(false);
    expect(updatePortfolioSchema.safeParse({ ...base, theme: { template: "CLASSIC", accent: "GREEN", extra: 1 } }).success).toBe(false);
  });

  it("avatarAssetId phải là ObjectId hoặc null", () => {
    expect(updatePortfolioSchema.safeParse({ ...base, avatarAssetId: newObjectId() }).success).toBe(true);
    expect(updatePortfolioSchema.safeParse({ ...base, avatarAssetId: "khong-hop-le" }).success).toBe(false);
  });
});

describe("updateProjectSchema", () => {
  it("chỉ expectedVersion là bắt buộc; các trường còn lại tuỳ chọn (PATCH)", () => {
    expect(updateProjectSchema.safeParse({ expectedVersion: 1 }).success).toBe(true);
    expect(updateProjectSchema.safeParse({ title: "Hệ thống kho" }).success).toBe(false);
    expect(updateProjectSchema.safeParse({ expectedVersion: 1, hack: true }).success).toBe(false);
  });

  it("tiêu đề 2–80 grapheme; điểm nổi bật ≤ 3 mục, mỗi mục 1–160 grapheme và không rỗng", () => {
    expect(updateProjectSchema.safeParse({ expectedVersion: 1, title: "A" }).success).toBe(false);
    expect(updateProjectSchema.safeParse({ expectedVersion: 1, title: "a".repeat(81) }).success).toBe(false);
    expect(updateProjectSchema.safeParse({ expectedVersion: 1, highlights: ["a", "b", "c"] }).success).toBe(true);
    expect(updateProjectSchema.safeParse({ expectedVersion: 1, highlights: ["a", "b", "c", "d"] }).success).toBe(false);
    expect(updateProjectSchema.safeParse({ expectedVersion: 1, highlights: [""] }).success).toBe(false);
    expect(updateProjectSchema.safeParse({ expectedVersion: 1, highlights: ["a".repeat(161)] }).success).toBe(false);
  });

  it("ngày: ép kiểu từ chuỗi, null hợp lệ; bắt đầu sau kết thúc bị từ chối", () => {
    const ok = updateProjectSchema.parse({ expectedVersion: 1, periodFrom: "2025-09-01", periodTo: null });
    expect(ok.periodFrom).toBeInstanceOf(Date);
    expect(ok.periodTo).toBeNull();
    expect(updateProjectSchema.safeParse({ expectedVersion: 1, periodFrom: "2026-01-01", periodTo: "2025-01-01" }).success).toBe(false);
    expect(updateProjectSchema.safeParse({ expectedVersion: 1, periodFrom: "không-phải-ngày" }).success).toBe(false);
  });

  it("summary/role rỗng → null", () => {
    expect(updateProjectSchema.parse({ expectedVersion: 1, summary: "  ", role: "" })).toMatchObject({ summary: null, role: null });
  });
});

describe("schema nhỏ", () => {
  it("changeSlug chỉ giới hạn độ dài — sai DẠNG để service trả PORT_002 (không phải VAL_001)", () => {
    expect(changeSlugSchema.safeParse({ slug: "A--B!", expectedVersion: 1 }).success).toBe(true);
    expect(changeSlugSchema.safeParse({ slug: "", expectedVersion: 1 }).success).toBe(false);
    expect(changeSlugSchema.safeParse({ slug: "a".repeat(65), expectedVersion: 1 }).success).toBe(false);
    expect(slugAvailableQuerySchema.safeParse({ slug: "an-dev" }).success).toBe(true);
    expect(slugAvailableQuerySchema.safeParse({}).success).toBe(false);
  });

  it("addProject/reorder/publish/preview", () => {
    expect(addProjectSchema.safeParse({ workspaceId: newObjectId() }).success).toBe(true);
    expect(addProjectSchema.safeParse({ workspaceId: "x" }).success).toBe(false);
    expect(addProjectSchema.safeParse({ workspaceId: newObjectId(), extra: 1 }).success).toBe(false);
    expect(reorderProjectsSchema.safeParse({ projectIds: Array.from({ length: 12 }, () => newObjectId()) }).success).toBe(true);
    expect(reorderProjectsSchema.safeParse({ projectIds: Array.from({ length: 13 }, () => newObjectId()) }).success).toBe(false);
    expect(publishSchema.safeParse({ expectedVersion: 2 }).success).toBe(true);
    expect(publishSchema.safeParse({}).success).toBe(false);
    expect(previewQuerySchema.safeParse({ template: "MINIMAL", accent: "ROSE" }).success).toBe(true);
    expect(previewQuerySchema.safeParse({}).success).toBe(true);
    expect(previewQuerySchema.safeParse({ template: "NEON" }).success).toBe(false);
  });

  it("takedown/restore: lý do 10–500 ký tự bắt buộc; reportGroupKey ≤ 120", () => {
    expect(takedownSchema.safeParse({ reason: "Vi phạm quy định cộng đồng" }).success).toBe(true);
    expect(takedownSchema.safeParse({ reason: "ngắn" }).success).toBe(false);
    expect(takedownSchema.safeParse({ reason: "x".repeat(501) }).success).toBe(false);
    expect(takedownSchema.safeParse({ reason: "Vi phạm quy định", reportGroupKey: "k".repeat(121) }).success).toBe(false);
    expect(takedownSchema.safeParse({ reason: "Vi phạm quy định", reportGroupKey: `PORTFOLIO:${newObjectId()}` }).success).toBe(true);
    expect(restoreSchema.safeParse({ reason: "Đã xác minh chính chủ" }).success).toBe(true);
    expect(restoreSchema.safeParse({}).success).toBe(false);
  });
});
