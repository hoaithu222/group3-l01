import { DEFAULT_BURNOUT_RULE_SET } from "../../../core/constants/burnout";
import { addDaysToLocalDate } from "../../../core/utils/local-date";
import type { BurnoutRuleSet } from "../domain/burnout-rules";
import { BurnoutHarness, userId } from "./support/burnout-harness";

/**
 * Assessor (p7-03 be.md §5/§10, GM-08/GM-09, WELL-05/06): không opt-in → không chấm/ghi/cảnh báo; cần ≥ 3 ngày dữ liệu; cảnh báo tối đa 1/24 giờ, chạy song song vẫn một cảnh báo; "Nhắc lại sau" chặn; assessment lưu `ruleVersion`.
 */
const U1 = userId(1);
const D = "2026-03-10";

/**
 * Năm ngày liền (D−2..D+2) làm liên tục 240 phút + khuya 90 phút: chấm bất kỳ ngày nào trong D..D+2 (chỉ dùng ngày ≤ ngày chấm) đều đủ ≥ 3 ngày, luật 1 (+30) và luật 4 (+20) → 50 điểm = MEDIUM.
 */
async function seedMedium(h: BurnoutHarness, id: string): Promise<void> {
  for (let offset = -2; offset <= 2; offset += 1) await h.seedDaily(id, addDaysToLocalDate(D, offset), { longestContinuousMinutes: 240, lateNightMinutes: 90 });
}

describe("BurnoutAssessorService", () => {
  let h: BurnoutHarness;
  beforeEach(async () => {
    h = new BurnoutHarness();
    await h.optIn(U1);
  });

  it("GM-08: người CHƯA bật (hoặc đã tắt) — không chấm, không ghi BurnoutAssessment, không thông báo/socket, dù có dữ liệu", async () => {
    const stranger = userId(9);
    h.addUser(stranger);
    await seedMedium(h, stranger);
    expect(await h.assessor.assess(stranger, D, DEFAULT_BURNOUT_RULE_SET)).toEqual({ kind: "SKIPPED", reason: "NOT_OPTED_IN" });
    await seedMedium(h, U1);
    await h.setting.update(U1, { optIn: false });
    expect(await h.assessor.assess(U1, D, DEFAULT_BURNOUT_RULE_SET)).toEqual({ kind: "SKIPPED", reason: "NOT_OPTED_IN" });
    expect(h.assessments.rows.size).toBe(0);
    expect(h.notifier.calls).toEqual([]);
    expect(h.emitter.events).toEqual([]);
  });

  it("ít hơn 3 ngày có dữ liệu → 'cần thêm vài ngày', không ghi đánh giá", async () => {
    await h.seedDaily(U1, D, { longestContinuousMinutes: 300 });
    await h.seedDaily(U1, addDaysToLocalDate(D, -1), { longestContinuousMinutes: 300 });
    expect(await h.assessor.assess(U1, D, DEFAULT_BURNOUT_RULE_SET)).toEqual({ kind: "SKIPPED", reason: "INSUFFICIENT_DATA" });
    expect(h.assessments.rows.size).toBe(0);
  });

  it("đủ 3 ngày, MEDIUM → lưu đánh giá + cảnh báo: thông báo hộp thư (chỉ id) + socket (mức, gợi ý) + đánh dấu đã cảnh báo", async () => {
    await seedMedium(h, U1);
    const outcome = await h.assessor.assess(U1, D, DEFAULT_BURNOUT_RULE_SET);
    expect(outcome).toMatchObject({ kind: "SCORED", level: "MEDIUM", alerted: true });
    const row = await h.assessments.findByDate(U1, D);
    expect(row).toMatchObject({ riskScore: 50, level: "MEDIUM", ruleVersion: 1, alerted: true, ackAction: null });
    expect(row?.factors.map((f) => f.ruleId)).toEqual(["long-continuous-session", "late-night-streak"]);
    expect(h.notifier.calls).toEqual([{ userId: U1, assessmentId: row?.id }]);
    expect(h.emitter.events).toEqual([{ userId: U1, payload: { assessmentId: row?.id, level: "MEDIUM", suggestion: "BREAK" } }]);
    expect((await h.settings.findByUserId(U1))?.lastAlertAt).toEqual(new Date(h.clockMs));
  });

  it("mức LOW: lưu điểm nhưng KHÔNG cảnh báo", async () => {
    for (let i = 0; i < 3; i += 1) await h.seedDaily(U1, addDaysToLocalDate(D, -i), { activeMinutes: 100 });
    expect(await h.assessor.assess(U1, D, DEFAULT_BURNOUT_RULE_SET)).toMatchObject({ kind: "SCORED", level: "LOW", alerted: false, skipReason: "LEVEL_LOW" });
    expect(h.notifier.calls).toEqual([]);
    expect(h.assessments.rows.size).toBe(1);
  });

  it("người dùng tắt cảnh báo: vẫn chấm + lưu để tự xem, nhưng không cảnh báo", async () => {
    await h.setting.update(U1, { optIn: true, alertsEnabled: false });
    await seedMedium(h, U1);
    expect(await h.assessor.assess(U1, D, DEFAULT_BURNOUT_RULE_SET)).toMatchObject({ kind: "SCORED", alerted: false, skipReason: "ALERTS_DISABLED" });
    expect(h.assessments.rows.size).toBe(1);
    expect(h.notifier.calls).toEqual([]);
  });

  it("chấm lại CÙNG ngày sau khi đã cảnh báo (job chạy lại) → không cảnh báo lần hai", async () => {
    await seedMedium(h, U1);
    await h.assessor.assess(U1, D, DEFAULT_BURNOUT_RULE_SET);
    h.clockMs += 3 * 3_600_000;
    expect(await h.assessor.assess(U1, D, DEFAULT_BURNOUT_RULE_SET)).toMatchObject({ kind: "SCORED", alerted: false, skipReason: "ALREADY_ALERTED" });
    expect(h.notifier.calls).toHaveLength(1);
    expect(h.assessments.rows.size).toBe(1);
  });

  it("GM-09: hai ngày liên tiếp đều đủ điều kiện, chấm trong cùng 24 giờ → đúng MỘT cảnh báo", async () => {
    await seedMedium(h, U1);
    const first = await h.assessor.assess(U1, D, DEFAULT_BURNOUT_RULE_SET);
    h.clockMs += 6 * 3_600_000;
    const second = await h.assessor.assess(U1, addDaysToLocalDate(D, 1), DEFAULT_BURNOUT_RULE_SET);
    expect(first).toMatchObject({ alerted: true });
    expect(second).toMatchObject({ kind: "SCORED", level: "MEDIUM", alerted: false, skipReason: "COOLDOWN" });
    expect(h.notifier.calls).toHaveLength(1);
    expect(h.emitter.events).toHaveLength(1);
    expect(h.assessments.rows.size).toBe(2); // vẫn lưu điểm cả hai ngày
  });

  it("đủ 24 giờ sau cảnh báo trước thì được cảnh báo tiếp; job lệch vài giây so với hôm qua vẫn tính đủ 24 giờ", async () => {
    await seedMedium(h, U1);
    await h.assessor.assess(U1, D, DEFAULT_BURNOUT_RULE_SET);
    h.clockMs += 24 * 3_600_000 - 8_000;
    expect(await h.assessor.assess(U1, addDaysToLocalDate(D, 1), DEFAULT_BURNOUT_RULE_SET)).toMatchObject({ alerted: true });
    expect(h.notifier.calls).toHaveLength(2);
  });

  it("job chạy SONG SONG hai lần → đúng MỘT cảnh báo (chiếm nguyên tử `claimAlert`)", async () => {
    await seedMedium(h, U1);
    const outcomes = await Promise.all([h.assessor.assess(U1, D, DEFAULT_BURNOUT_RULE_SET), h.assessor.assess(U1, D, DEFAULT_BURNOUT_RULE_SET)]);
    expect(outcomes.filter((o) => o.kind === "SCORED" && o.alerted)).toHaveLength(1);
    expect(h.notifier.calls).toHaveLength(1);
    expect(h.emitter.events).toHaveLength(1);
    expect(h.assessments.rows.size).toBe(1);
  });

  it("nhiều job đồng thời (5 lần) vẫn chỉ một cảnh báo", async () => {
    await seedMedium(h, U1);
    await Promise.all(Array.from({ length: 5 }, () => h.assessor.assess(U1, D, DEFAULT_BURNOUT_RULE_SET)));
    expect(h.notifier.calls).toHaveLength(1);
  });

  it("SNOOZE ('Nhắc lại sau') chặn cảnh báo trong 24 giờ, kể cả khi cooldown đã qua", async () => {
    await seedMedium(h, U1);
    await h.assessor.assess(U1, D, DEFAULT_BURNOUT_RULE_SET);
    const alertId = (await h.assessments.findByDate(U1, D))?.id as string;
    h.clockMs += 25 * 3_600_000; // cooldown đã hết
    await h.history.acknowledge(U1, alertId, "SNOOZE"); // tạm hoãn tới +24h kể từ bây giờ
    h.clockMs += 2 * 3_600_000;
    expect(await h.assessor.assess(U1, addDaysToLocalDate(D, 1), DEFAULT_BURNOUT_RULE_SET)).toMatchObject({ alerted: false, skipReason: "SNOOZED" });
    h.clockMs += 23 * 3_600_000; // qua hạn tạm hoãn
    expect(await h.assessor.assess(U1, addDaysToLocalDate(D, 2), DEFAULT_BURNOUT_RULE_SET)).toMatchObject({ alerted: true });
    expect(h.notifier.calls).toHaveLength(2);
  });

  it("DISMISS ('Đã hiểu') không tạm hoãn thêm — chỉ cooldown 24 giờ", async () => {
    await seedMedium(h, U1);
    await h.assessor.assess(U1, D, DEFAULT_BURNOUT_RULE_SET);
    await h.history.acknowledge(U1, (await h.assessments.findByDate(U1, D))?.id as string, "DISMISS");
    h.clockMs += 25 * 3_600_000;
    expect(await h.assessor.assess(U1, addDaysToLocalDate(D, 1), DEFAULT_BURNOUT_RULE_SET)).toMatchObject({ alerted: true });
  });

  it("WELL-06: assessment lưu `ruleVersion`; sửa luật tăng ngưỡng thì đánh giá NGÀY SAU dùng luật mới, quá khứ không đổi", async () => {
    await seedMedium(h, U1);
    await h.assessor.assess(U1, D, DEFAULT_BURNOUT_RULE_SET);
    const stricter: BurnoutRuleSet = { ...DEFAULT_BURNOUT_RULE_SET, version: 2, rules: DEFAULT_BURNOUT_RULE_SET.rules.map((r) => ({ ...r, threshold: r.threshold + 1000 })) };
    await h.assessor.assess(U1, addDaysToLocalDate(D, 1), stricter);
    expect(await h.assessments.findByDate(U1, D)).toMatchObject({ ruleVersion: 1, riskScore: 50, level: "MEDIUM" });
    expect(await h.assessments.findByDate(U1, addDaysToLocalDate(D, 1))).toMatchObject({ ruleVersion: 2, riskScore: 0, level: "LOW" });
  });

  it("lỗi khi ghi thông báo → lỗi lan ra để job thử lại và KHÔNG phát socket", async () => {
    await seedMedium(h, U1);
    jest.spyOn(h.notifier, "alert").mockRejectedValueOnce(new Error("db lỗi"));
    await expect(h.assessor.assess(U1, D, DEFAULT_BURNOUT_RULE_SET)).rejects.toThrow("db lỗi");
    expect(h.emitter.events).toEqual([]);
  });
});
