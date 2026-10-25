import { listAuditLogQuerySchema } from "../audit-log.validators";

const OID = "665f1c2e8a1b2c3d4e5f6a7b";

describe("listAuditLogQuerySchema", () => {
  it("action đơn (dạng cũ) vẫn hợp lệ → mảng 1 phần tử", () => {
    const r = listAuditLogQuerySchema.parse({ action: "user.lock" });
    expect(r.action).toEqual(["user.lock"]);
  });

  it("action nhiều mã ngăn bằng dấu phẩy → mảng đã bỏ trùng + trim", () => {
    const r = listAuditLogQuerySchema.parse({ action: "user.lock, user.unlock,user.lock," });
    expect(r.action).toEqual(["user.lock", "user.unlock"]);
  });

  it("action toàn dấu phẩy → không hợp lệ", () => {
    expect(listAuditLogQuerySchema.safeParse({ action: ",,," }).success).toBe(false);
  });

  it("quá 30 mã → không hợp lệ", () => {
    const many = Array.from({ length: 31 }, (_, i) => `a.${i}`).join(",");
    expect(listAuditLogQuerySchema.safeParse({ action: many }).success).toBe(false);
  });

  it("actorId/workspaceId phải là ObjectId (tránh Prisma ném 500)", () => {
    expect(listAuditLogQuerySchema.safeParse({ actorId: OID, workspaceId: OID }).success).toBe(true);
    expect(listAuditLogQuerySchema.safeParse({ actorId: "abc" }).success).toBe(false);
    expect(listAuditLogQuerySchema.safeParse({ workspaceId: "abc" }).success).toBe(false);
  });

  it("from/to ép sang Date, mặc định limit có giá trị", () => {
    const r = listAuditLogQuerySchema.parse({ from: "2026-01-01T00:00:00.000Z" });
    expect(r.from).toBeInstanceOf(Date);
    expect(typeof r.limit).toBe("number");
  });
});
