import { DEFAULT_BURNOUT_RULE_SET, type BurnoutRuleConfig } from "../../../core/constants/burnout";
import { BurnoutHarness } from "./support/burnout-harness";

/**
 * Admin sửa luật (p7-03 be.md §4/§5, WELL-06): CAS theo `version` bộ luật, lý do + audit `wellbeing.rules-update`, `WELL_003` luật không hợp lệ, `WELL_004` medium ≥ high; có hiệu lực cho lần chấm kế tiếp.
 */
const ADMIN = { id: "a".repeat(24), role: "admin" };
const rule = (over: Partial<BurnoutRuleConfig> = {}): BurnoutRuleConfig => ({ id: "extra", label: "Luật thêm", metric: "eventsCount", aggregate: "SUM", days: 7, op: "GT", threshold: 500, points: 10, ...over });
const input = (over: Partial<Parameters<BurnoutHarness["admin"]["updateRules"]>[0]> = {}) => ({
  expectedVersion: 1,
  reason: "Nới ngưỡng theo phản hồi của bộ phận hỗ trợ sinh viên",
  windowDays: 7,
  levels: { medium: 40, high: 70 },
  rules: [...DEFAULT_BURNOUT_RULE_SET.rules],
  ...over,
});

describe("BurnoutAdminService — luật", () => {
  let h: BurnoutHarness;
  beforeEach(() => {
    h = new BurnoutHarness();
  });

  it("chưa từng lưu → bộ luật mặc định theo đặc tả (version 1, cửa sổ 7 ngày, mức 40/70, bốn luật), đánh dấu isDefault", async () => {
    expect(await h.admin.rules()).toEqual({
      version: 1,
      windowDays: 7,
      levels: { medium: 40, high: 70 },
      rules: DEFAULT_BURNOUT_RULE_SET.rules,
      updatedAt: null,
      updatedBy: null,
      isDefault: true,
    });
  });

  it("lưu luật: version tăng 1, ghi vào kho cấu hình (CAS theo configVersion), audit `wellbeing.rules-update` kèm lý do", async () => {
    const saved = await h.admin.updateRules(input({ rules: [...DEFAULT_BURNOUT_RULE_SET.rules, rule()] }), ADMIN);
    expect(saved).toMatchObject({ version: 2, isDefault: false, updatedBy: ADMIN.id });
    expect(saved.rules).toHaveLength(5);
    expect(h.rulesAdmin.writes).toHaveLength(1);
    expect(h.rulesAdmin.writes[0]?.value.version).toBe(2);
    expect(h.rulesAdmin.writes[0]?.reason).toContain("Nới ngưỡng");
    expect(h.audit.records).toEqual([
      {
        actorId: ADMIN.id,
        actorRole: "admin",
        action: "wellbeing.rules-update",
        targetType: "BurnoutRules",
        targetId: "burnout.rules",
        reason: "Nới ngưỡng theo phản hồi của bộ phận hỗ trợ sinh viên",
        metadata: { fromVersion: 1, toVersion: 2, windowDays: 7, ruleCount: 5 },
      },
    ]);
  });

  it("lưu liên tiếp: version 1 → 2 → 3, mỗi lần phải gửi đúng version đang xem", async () => {
    await h.admin.updateRules(input(), ADMIN);
    expect((await h.admin.updateRules(input({ expectedVersion: 2, windowDays: 14 }), ADMIN)).version).toBe(3);
    expect((await h.admin.rules()).windowDays).toBe(14);
  });

  it("expectedVersion lệch (hai admin cùng sửa) → 409 RES_003 kèm version hiện tại, KHÔNG ghi, KHÔNG audit", async () => {
    await h.admin.updateRules(input(), ADMIN);
    await expect(h.admin.updateRules(input({ expectedVersion: 1 }), ADMIN)).rejects.toMatchObject({ statusCode: 409, errorCode: "RES_003", details: { currentVersion: 2 } });
    expect(h.rulesAdmin.writes).toHaveLength(1);
    expect(h.audit.records).toHaveLength(1);
  });

  it("WELL_004: ngưỡng mức cao ≤ ngưỡng mức trung bình → 400", async () => {
    for (const levels of [{ medium: 50, high: 50 }, { medium: 60, high: 40 }]) {
      await expect(h.admin.updateRules(input({ levels }), ADMIN)).rejects.toMatchObject({ statusCode: 400, errorCode: "WELL_004" });
    }
    expect(h.rulesAdmin.writes).toHaveLength(0);
    expect(h.audit.records).toHaveLength(0);
  });

  it("WELL_003: mã luật trùng, hoặc luật nhìn xa hơn cửa sổ → 400 kèm danh sách lỗi", async () => {
    await expect(h.admin.updateRules(input({ rules: [rule(), rule()] }), ADMIN)).rejects.toMatchObject({ statusCode: 400, errorCode: "WELL_003", details: { issues: [expect.objectContaining({ code: "DUPLICATE_RULE_ID", ruleId: "extra" })] } });
    await expect(h.admin.updateRules(input({ windowDays: 3, rules: [rule({ days: 5 })] }), ADMIN)).rejects.toMatchObject({ errorCode: "WELL_003", details: { issues: [expect.objectContaining({ code: "RULE_DAYS_EXCEED_WINDOW" })] } });
    expect(h.rulesAdmin.writes).toHaveLength(0);
  });

  it("WELL_004 được ưu tiên khi vừa sai medium/high vừa có lỗi khác", async () => {
    await expect(h.admin.updateRules(input({ levels: { medium: 70, high: 70 }, rules: [rule(), rule()] }), ADMIN)).rejects.toMatchObject({ errorCode: "WELL_004" });
  });

  it("lỗi ghi ở tầng cấu hình (CAS lệch giữa lúc đọc và ghi) → 409, không audit", async () => {
    const original = h.rulesAdmin.write.bind(h.rulesAdmin);
    jest.spyOn(h.rulesAdmin, "write").mockImplementationOnce(async (...args) => {
      h.rulesAdmin.configVersion += 1; // admin khác chen vào giữa
      await original(...args);
    });
    await expect(h.admin.updateRules(input(), ADMIN)).rejects.toMatchObject({ statusCode: 409, errorCode: "RES_003" });
    expect(h.audit.records).toHaveLength(0);
  });
});
