/** Unit — DTO Zod của module moderation/blocks (be.md p1-08 §3): OTHER cần mô tả ≥ 10, trần mô tả, id ObjectId, enum hành động, lý do 10–500. */
import { LIMITS } from "../../../core/constants/limits";
import { adminActionSchema, adminListReportsQuerySchema, createReportSchema, messageReportSchema, resolveReportSchema } from "../dtos";
import { blockSchema } from "../../blocks/blocks.validators";
import { oid } from "./report-fixtures";

const base = { targetType: "MESSAGE", targetId: oid("a"), reason: "SPAM" } as const;

describe("createReportSchema", () => {
  it("hợp lệ: đủ trường tối thiểu, mô tả tuỳ chọn", () => {
    expect(createReportSchema.safeParse(base).success).toBe(true);
    expect(createReportSchema.safeParse({ ...base, description: "  spam  ", contextWorkspaceId: oid("b") }).success).toBe(true);
  });

  it("reason OTHER bắt buộc mô tả ≥ 10 ký tự (sau trim)", () => {
    expect(createReportSchema.safeParse({ ...base, reason: "OTHER" }).success).toBe(false);
    expect(createReportSchema.safeParse({ ...base, reason: "OTHER", description: "ngắn" }).success).toBe(false);
    expect(createReportSchema.safeParse({ ...base, reason: "OTHER", description: "   ngắn      " }).success).toBe(false);
    expect(createReportSchema.safeParse({ ...base, reason: "OTHER", description: "Nội dung quấy rối kéo dài" }).success).toBe(true);
  });

  it("mô tả tối đa LIMITS.report.descriptionMax; targetType/reason/id không hợp lệ bị từ chối", () => {
    expect(createReportSchema.safeParse({ ...base, description: "x".repeat(LIMITS.report.descriptionMax) }).success).toBe(true);
    expect(createReportSchema.safeParse({ ...base, description: "x".repeat(LIMITS.report.descriptionMax + 1) }).success).toBe(false);
    expect(createReportSchema.safeParse({ ...base, targetType: "NOT_A_TARGET" }).success).toBe(false);
    expect(createReportSchema.safeParse({ ...base, targetType: "PORTFOLIO" }).success).toBe(true);
    expect(createReportSchema.safeParse({ ...base, reason: "BORING" }).success).toBe(false);
    expect(createReportSchema.safeParse({ ...base, targetId: "khong-phai-objectid" }).success).toBe(false);
  });

  it("alias tin nhắn: cùng luật OTHER, không nhận targetType/targetId từ body", () => {
    expect(messageReportSchema.safeParse({ reason: "OTHER" }).success).toBe(false);
    expect(messageReportSchema.safeParse({ reason: "SCAM" }).success).toBe(true);
    const parsed = messageReportSchema.parse({ reason: "SCAM", targetId: oid("a"), targetType: "USER" } as never);
    expect(parsed).not.toHaveProperty("targetId");
    expect(parsed).not.toHaveProperty("targetType");
  });
});

describe("resolve / admin action / list query / block", () => {
  it("resolveReportSchema: chỉ 3 hành động phạm vi, lý do 10–500", () => {
    expect(resolveReportSchema.safeParse({ action: "REMOVE_MESSAGE", reason: "Vi phạm nội quy" }).success).toBe(true);
    expect(resolveReportSchema.safeParse({ action: "LOCK_AUTHOR", reason: "Vi phạm nội quy" }).success).toBe(false);
    expect(resolveReportSchema.safeParse({ action: "DISMISS", reason: "ngắn" }).success).toBe(false);
    expect(resolveReportSchema.safeParse({ action: "DISMISS", reason: "x".repeat(501) }).success).toBe(false);
  });

  it("adminActionSchema: đủ 6 hành động nền tảng, lý do bắt buộc", () => {
    for (const action of ["DISMISS", "REMOVE_CONTENT", "WARN_AUTHOR", "LOCK_AUTHOR", "ARCHIVE_CHANNEL", "DISSOLVE_CONVERSATION"]) {
      expect(adminActionSchema.safeParse({ action, reason: "Vi phạm quy định" }).success).toBe(true);
    }
    expect(adminActionSchema.safeParse({ action: "REMOVE_MESSAGE", reason: "Vi phạm quy định" }).success).toBe(false);
    expect(adminActionSchema.safeParse({ action: "DISMISS" }).success).toBe(false);
  });

  it("adminListReportsQuerySchema: mặc định status OPEN, sort reportCount, page 1, limit 20; ép kiểu ngày", () => {
    expect(adminListReportsQuerySchema.parse({})).toMatchObject({ status: "OPEN", sort: "reportCount", page: 1, limit: 20 });
    const parsed = adminListReportsQuerySchema.parse({ from: "2026-09-01", to: "2026-09-19", limit: "50" });
    expect(parsed.from).toBeInstanceOf(Date);
    expect(parsed.limit).toBe(50);
    expect(adminListReportsQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  });

  it("blockSchema: userId phải là ObjectId", () => {
    expect(blockSchema.safeParse({ userId: oid("a") }).success).toBe(true);
    expect(blockSchema.safeParse({ userId: "abc" }).success).toBe(false);
    expect(blockSchema.safeParse({}).success).toBe(false);
  });
});
