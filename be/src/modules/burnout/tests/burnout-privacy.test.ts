import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BurnoutHarness, userId } from "./support/burnout-harness";

/**
 * Quyền riêng tư (p7-03 README §2/§6, WELL-02/04): xoá sạch khi tắt/ẩn danh hoá, hạn lưu giữ 90 ngày, và ADMIN không bao giờ thấy dữ liệu một người — chỉ số liệu tổng hợp ẩn danh (k ≥ 20, ô nhỏ bị che).
 */
const U1 = userId(1);
const U2 = userId(2);
const D = "2026-03-10";
const DAY_MS = 86_400_000;

describe("BurnoutPrivacyService — xoá sạch", () => {
  let h: BurnoutHarness;
  beforeEach(async () => {
    h = new BurnoutHarness();
    await h.optIn(U1);
    await h.optIn(U2);
  });

  async function fill(id: string): Promise<void> {
    await h.seedDaily(id, D, { activeMinutes: 60 });
    await h.assessments.upsertScore({ userId: id, date: D, riskScore: 50, level: "MEDIUM", factors: [], ruleVersion: 1 });
    await h.store.markActive(id, D, "2200");
  }

  it("ẩn danh hoá tài khoản (`wellbeing.user-anonymized`): xoá chỉ số, đánh giá, bucket, tập thu thập VÀ dòng cài đặt — người khác giữ nguyên", async () => {
    await fill(U1);
    await fill(U2);
    const result = await h.privacy.purgeUser(U1, { removeSetting: true });
    expect(result).toEqual({ dailies: 1, assessments: 1, buckets: 1, setting: 1 });
    expect(await h.settings.findByUserId(U1)).toBeNull();
    expect(h.store.optIn.has(U1)).toBe(false);
    expect([...h.dailies.rows.values()].map((r) => r.userId)).toEqual([U2]);
    expect([...h.assessments.rows.values()].map((r) => r.userId)).toEqual([U2]);
    expect([...h.store.hashes.keys()]).toEqual([`wb:${U2}:${D}`]);
    expect(await h.settings.findByUserId(U2)).not.toBeNull();
  });

  it("idempotent: chạy lại (job retry / giao lại) không còn gì để xoá, không lỗi", async () => {
    await fill(U1);
    await h.privacy.purgeUser(U1, { removeSetting: true });
    expect(await h.privacy.purgeUser(U1, { removeSetting: true })).toEqual({ dailies: 0, assessments: 0, buckets: 0, setting: 0 });
  });

  it("job `wellbeing.purge` sau khi TẮT: dọn phần còn sót (bucket lọt vào giữa lúc tắt và lúc job chạy)", async () => {
    await fill(U1);
    await h.setting.update(U1, { optIn: false });
    await h.store.markActive(U1, D, "2300");
    expect(await h.privacy.purgeIfStillOptedOut(U1)).toMatchObject({ buckets: 1 });
    expect(h.store.hashes.size).toBe(0);
  });

  it("đã BẬT LẠI trước khi job purge chạy → bỏ qua (null), dữ liệu lần bật mới còn nguyên", async () => {
    await h.setting.update(U1, { optIn: false });
    await h.setting.update(U1, { optIn: true });
    await fill(U1);
    expect(await h.privacy.purgeIfStillOptedOut(U1)).toBeNull();
    expect(h.dailies.rows.size).toBe(1);
    expect(h.store.optIn.has(U1)).toBe(true);
  });

  it("Redis lỗi khi xoá → LỖI ném ra để job retry (không nuốt); lần retry hoàn tất", async () => {
    await fill(U1);
    jest.spyOn(h.store, "deleteUserBuckets").mockRejectedValueOnce(new Error("redis chết"));
    await expect(h.privacy.purgeUser(U1, { removeSetting: true })).rejects.toThrow("redis chết");
    await expect(h.privacy.purgeUser(U1, { removeSetting: true })).resolves.toMatchObject({ setting: 1 });
  });

  it("hạn lưu giữ 90 ngày: chỉ xoá chỉ số/đánh giá tạo trước mốc, giữ phần gần đây", async () => {
    h.clockMs -= 100 * DAY_MS;
    await h.seedDaily(U1, "2025-12-01", { activeMinutes: 10 });
    await h.assessments.upsertScore({ userId: U1, date: "2025-12-01", riskScore: 10, level: "LOW", factors: [], ruleVersion: 1 });
    h.clockMs += 100 * DAY_MS;
    await h.seedDaily(U1, D, { activeMinutes: 60 });
    await h.assessments.upsertScore({ userId: U1, date: D, riskScore: 10, level: "LOW", factors: [], ruleVersion: 1 });
    expect(await h.privacy.sweepRetention()).toEqual({ dailies: 1, assessments: 1 });
    expect([...h.dailies.rows.values()].map((r) => r.date)).toEqual([D]);
    expect([...h.assessments.rows.values()].map((r) => r.date)).toEqual([D]);
  });
});

describe("BurnoutAdminService.overview — ẩn danh (WELL-04)", () => {
  let h: BurnoutHarness;
  beforeEach(() => {
    h = new BurnoutHarness();
  });

  /** `n` người ĐANG bật theo dõi (ghi thẳng cài đặt — không cần thư mục người dùng). */
  async function enableMany(n: number, from = 1): Promise<string[]> {
    const ids = Array.from({ length: n }, (_, i) => userId(from + i));
    for (const id of ids) await h.settings.enable(id, new Date(h.clockMs), {});
    return ids;
  }
  const alert = async (id: string, date: string, alertedAt: Date, level: "LOW" | "MEDIUM" | "HIGH" = "MEDIUM") => {
    const a = await h.assessments.upsertScore({ userId: id, date, riskScore: 50, level, factors: [], ruleVersion: 1 });
    await h.assessments.markAlerted(a.id, alertedAt);
  };

  it("WELL-04: 12 người bật → 'Chưa đủ dữ liệu ẩn danh' và KHÔNG trả bất kỳ số liệu nào", async () => {
    await enableMany(12);
    expect(await h.admin.overview(12)).toEqual({ insufficient: true, minimum: 20 });
  });

  it("19 người → chưa đủ; 20 người → đủ", async () => {
    await enableMany(19);
    expect(await h.admin.overview(12)).toMatchObject({ insufficient: true });
    await enableMany(1, 20);
    expect(await h.admin.overview(12)).toMatchObject({ insufficient: false });
  });

  it("số người bật LÀM TRÒN tới 10 (24 → 20, 25 → 30) — không lộ số chính xác", async () => {
    await enableMany(24);
    expect(await h.admin.overview(1)).toMatchObject({ optInApprox: 20 });
    await enableMany(1, 25);
    expect(await h.admin.overview(1)).toMatchObject({ optInApprox: 30 });
  });

  it("người ĐÃ TẮT không được tính vào số người bật", async () => {
    const ids = await enableMany(22);
    await h.settings.disable(ids[0], new Date(h.clockMs));
    await h.settings.disable(ids[1], new Date(h.clockMs));
    expect(await h.admin.overview(1)).toMatchObject({ insufficient: false, optInApprox: 20 });
    await h.settings.disable(ids[2], new Date(h.clockMs));
    expect(await h.admin.overview(1)).toMatchObject({ insufficient: true });
  });

  it("cảnh báo mỗi tuần: mặc định 12 tuần cũ → mới, tuần bắt đầu thứ Hai UTC; ô 1–4 bị che (null), ≥ 5 hiện số, 0 giữ 0", async () => {
    const ids = await enableMany(24);
    // TICK_AT = thứ Ba 2026-03-10 → tuần hiện tại bắt đầu thứ Hai 2026-03-09.
    for (const id of ids.slice(0, 3)) await alert(id, "2026-03-10", new Date("2026-03-10T05:00:00Z")); // 3 cảnh báo tuần này
    for (const id of ids.slice(3, 9)) await alert(id, "2026-03-03", new Date("2026-03-04T05:00:00Z")); // 6 cảnh báo tuần trước
    const overview = await h.admin.overview(12);
    if (overview.insufficient) throw new Error("phải đủ dữ liệu");
    expect(overview.alertsPerWeek).toHaveLength(12);
    expect(overview.alertsPerWeek.at(-1)).toEqual({ weekStart: "2026-03-09", alerts: null });
    expect(overview.alertsPerWeek.at(-2)).toEqual({ weekStart: "2026-03-02", alerts: 6 });
    expect(overview.alertsPerWeek[0]).toEqual({ weekStart: "2025-12-22", alerts: 0 });
    const starts = overview.alertsPerWeek.map((w) => w.weekStart);
    expect(starts).toEqual([...starts].sort());
  });

  it("phân bố mức: mỗi người một lần theo đánh giá MỚI NHẤT; nhóm < 5 gộp vào Khác", async () => {
    const ids = await enableMany(24);
    const at = new Date("2026-03-10T05:00:00Z");
    // 15 LOW, 6 MEDIUM, 3 HIGH (HIGH < 5 → gộp Khác; Khác 3 < 5 → gộp thêm nhóm nhỏ nhất còn lại = MEDIUM).
    for (const [i, id] of ids.entries()) await alert(id, "2026-03-09", at, i < 15 ? "LOW" : i < 21 ? "MEDIUM" : "HIGH");
    // Người 0 có đánh giá cũ hơn là HIGH — chỉ đánh giá MỚI NHẤT được tính.
    await alert(ids[0], "2026-03-08", at, "HIGH");
    const overview = await h.admin.overview(1);
    if (overview.insufficient) throw new Error("phải đủ dữ liệu");
    expect(overview.levelDistribution).toEqual([
      { level: "LOW", count: 15 },
      { level: "OTHER", count: 9 },
    ]);
  });

  it("phân bố mức = null khi số người ĐÃ được chấm < 20 dù số người bật đủ", async () => {
    const ids = await enableMany(24);
    for (const id of ids.slice(0, 10)) await alert(id, "2026-03-09", new Date("2026-03-10T05:00:00Z"), "LOW");
    const overview = await h.admin.overview(1);
    if (overview.insufficient) throw new Error("phải đủ dữ liệu");
    expect(overview.levelDistribution).toBeNull();
  });

  it("KHÔNG BAO GIỜ chứa định danh: kết quả tổng quan không có userId nào", async () => {
    const ids = await enableMany(24);
    for (const id of ids) await alert(id, "2026-03-09", new Date("2026-03-10T05:00:00Z"), "MEDIUM");
    const json = JSON.stringify(await h.admin.overview(12));
    for (const id of ids) expect(json).not.toContain(id);
  });
});

describe("cổng đọc của admin không có đường nào tới dữ liệu một người", () => {
  const ROOT = join(__dirname, "..");
  const COMMENT_LINE = /^\s*(\/\/|\*|\/\*)/;
  /** Mã nguồn đã BỎ dòng chú thích (chú thích được phép nhắc "userId" để giải thích luật). */
  const read = (file: string): string =>
    readFileSync(join(ROOT, file), "utf8")
      .split(/\r?\n/)
      .filter((line) => !COMMENT_LINE.test(line))
      .join("\n");
  const routePaths = (source: string): string[] => [...source.matchAll(/\brouter\.(get|put|post|patch|delete)\(\s*"([^"]+)"/g)].map((m) => `${m[1].toUpperCase()} ${m[2]}`).sort();

  it("IBurnoutAggregateRepository chỉ có ba hàm đếm/phân bố, không nhận/trả userId", () => {
    const code = read("repositories/aggregate.repository.interface.ts");
    expect([...code.matchAll(/^\s{2}(\w+)\(/gm)].map((m) => m[1])).toEqual(["countEnabled", "countAlertedBetween", "latestLevelCounts"]);
    expect(code).not.toMatch(/userId/);
  });

  it("service admin chỉ phụ thuộc cổng tổng hợp + cổng luật + audit (không repo theo người)", () => {
    const src = read("services/burnout-admin.service.ts");
    expect(src).not.toMatch(/IWellbeingSettingRepository|IWellbeingDailyRepository|IBurnoutAssessmentRepository/);
    expect(src).not.toMatch(/userId/);
  });

  it("route admin: không có tham số/đường dẫn theo người dùng, quyền gamification, có cờ burnout", () => {
    const routes = read("admin-burnout.routes.ts");
    expect(routePaths(routes)).toEqual(["GET /admin/wellbeing/overview", "GET /admin/wellbeing/rules", "PUT /admin/wellbeing/rules"]);
    expect(routePaths(routes).join(" ")).not.toMatch(/user|:id/i);
    expect(routes).toContain('requirePermission("gamification:view")');
    expect(routes).toContain('requirePermission("gamification:update")');
    expect(routes).toContain("requireFeature(MODULES.BURNOUT)");
    expect(read("controllers/admin-burnout.controller.ts")).not.toMatch(/userId|params/);
  });

  it("route người dùng: không route nào nhận userId từ path/body/query (id luôn lấy từ token)", () => {
    const routes = read("burnout.routes.ts");
    // PATCH /me/wellbeing (thêm sau): chỉ sửa cài đặt phụ của người ĐANG bật, không có optIn — đường bật vẫn chỉ là PUT (id vẫn từ token).
    expect(routePaths(routes)).toEqual(["DELETE /me/wellbeing/data", "GET /me/wellbeing", "GET /me/wellbeing/assessments", "PATCH /me/wellbeing", "POST /me/wellbeing/alerts/:id/ack", "PUT /me/wellbeing"]);
    expect(routePaths(routes).join(" ")).not.toMatch(/userId/);
    expect(read("dtos/burnout.dto.ts")).not.toMatch(/userId/);
    expect(read("controllers/burnout.controller.ts")).not.toMatch(/params\.userId|query\.userId|body\.userId/);
  });
});
