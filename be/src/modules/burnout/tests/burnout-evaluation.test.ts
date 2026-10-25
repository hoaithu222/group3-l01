import { BurnoutHarness, PARIS, userId, VN } from "./support/burnout-harness";

/**
 * Tick hằng giờ `wellbeing.evaluate` (p7-03 be.md §7, mẫu `streak.check`): chọn người theo MÚI GIỜ CỦA TỪNG NGƯỜI (giờ địa phương 05:xx), tổng hợp ngày vừa qua + chấm điểm, đồng bộ tập "đã bật" trên Redis.
 * `TICK_AT` = 22:20 UTC = 05:20 ngày 11 giờ VN (= 23:20 ngày 10 giờ Paris).
 */
const U1 = userId(1);
const U2 = userId(2);
const U3 = userId(3);
const DAY = "2026-03-10"; // ngày wellbeing vừa kết thúc lúc 05:20 ngày 11 (VN)

describe("BurnoutEvaluationService.run", () => {
  let h: BurnoutHarness;
  beforeEach(() => {
    h = new BurnoutHarness();
  });

  /** Bật theo dõi từ trước 5 ngày rồi đặt lại đồng hồ về giờ tick. */
  async function optInEarlier(id: string, tz: string = VN): Promise<void> {
    const tick = h.clockMs;
    h.clockMs = tick - 5 * 86_400_000;
    await h.optIn(id, tz);
    h.clockMs = tick;
  }

  it("người có giờ địa phương 05:xx (VN) được tổng hợp + chấm; người ở múi giờ khác (Paris 23:20) chưa tới giờ", async () => {
    await optInEarlier(U1, VN);
    await optInEarlier(U2, PARIS);
    await h.store.markActive(U1, DAY, "2200");
    await h.store.markActive(U2, DAY, "2200");
    const report = await h.evaluation.run();
    expect(report).toMatchObject({ scanned: 2, evaluated: 1, alerts: 0, failed: 0 });
    expect((await h.dailies.findByDate(U1, DAY))?.activeMinutes).toBe(15);
    expect(await h.dailies.findByDate(U2, DAY)).toBeNull();
  });

  it("tổng hợp cả ngày liền trước để bắt kịp khi lỡ một nhịp (ngày D−1 và D)", async () => {
    await optInEarlier(U1);
    await h.store.markActive(U1, "2026-03-09", "2000");
    await h.store.markActive(U1, DAY, "2200");
    await h.evaluation.run();
    expect((await h.dailies.findByDate(U1, "2026-03-09"))?.activeMinutes).toBe(15);
    expect((await h.dailies.findByDate(U1, DAY))?.activeMinutes).toBe(15);
  });

  it("đủ dữ liệu + đủ điều kiện → chấm và cảnh báo trong cùng tick; báo cáo đếm đúng", async () => {
    await optInEarlier(U1);
    // Mỗi ngày làm liền 20:00 → 00:15 (18 khe = 270 phút > 180; khuya 23:00–00:15 = 90 phút > 60): luật 1 (+30) + luật 4 sau 3 ngày liền (+20) = 50 → MEDIUM.
    const slots = ["2000", "2015", "2030", "2045", "2100", "2115", "2130", "2145", "2200", "2215", "2230", "2245", "2300", "2315", "2330", "2345", "0000", "0015"];
    await h.seedDaily(U1, "2026-03-08", { activeMinutes: 270, longestContinuousMinutes: 270, lateNightMinutes: 90 }); // ngày đã được tổng hợp ở tick hôm trước
    for (const date of ["2026-03-09", DAY]) for (const slot of slots) await h.store.markActive(U1, date, slot);
    const report = await h.evaluation.run();
    expect(report).toMatchObject({ evaluated: 1, alerts: 1, failed: 0 });
    expect(await h.assessments.findByDate(U1, DAY)).toMatchObject({ riskScore: 50, level: "MEDIUM", ruleVersion: 1, alerted: true });
    expect(h.notifier.calls).toHaveLength(1);
    expect(h.emitter.events).toHaveLength(1);
  });

  it("GM-08: người ĐÃ TẮT theo dõi không bao giờ được quét/chấm dù còn bucket cũ", async () => {
    await optInEarlier(U1);
    await h.store.markActive(U1, DAY, "2200");
    await h.setting.update(U1, { optIn: false });
    await h.store.markActive(U1, DAY, "2200"); // bucket lọt vào sau khi tắt
    const report = await h.evaluation.run();
    expect(report.scanned).toBe(0);
    expect(h.dailies.rows.size).toBe(0);
    expect(h.assessments.rows.size).toBe(0);
  });

  it("phân hệ TẮT → không quét, không tổng hợp, không cảnh báo", async () => {
    await optInEarlier(U1);
    h.config.isEnabled = false;
    expect(await h.evaluation.run()).toEqual({ scanned: 0, evaluated: 0, alerts: 0, failed: 0 });
    expect(h.dailies.rows.size).toBe(0);
  });

  it("tài khoản không còn hoạt động (khoá/ẩn danh hoá) bị bỏ qua", async () => {
    await optInEarlier(U1);
    h.directory.users.delete(U1);
    const report = await h.evaluation.run();
    expect(report).toMatchObject({ scanned: 1, evaluated: 0 });
    expect(h.dailies.rows.size).toBe(0);
  });

  it("lỗi của MỘT người không làm hỏng người khác; lỗi được đếm và không lộ định danh trong báo cáo", async () => {
    await optInEarlier(U1);
    await optInEarlier(U3);
    const original = h.aggregator.aggregate.bind(h.aggregator);
    jest.spyOn(h.aggregator, "aggregate").mockImplementation((input) => (input.userId === U1 ? Promise.reject(new Error("mongo lỗi")) : original(input)));
    const report = await h.evaluation.run();
    expect(report).toMatchObject({ scanned: 2, evaluated: 1, failed: 1 });
    expect(Object.keys(report).sort()).toEqual(["alerts", "evaluated", "failed", "scanned"]);
    expect(await h.dailies.findByDate(U3, DAY)).not.toBeNull();
  });

  it("chạy lại (job chạy trùng) là idempotent: không thêm hàng, không cảnh báo lần hai", async () => {
    await optInEarlier(U1);
    await h.store.markActive(U1, DAY, "2200");
    await h.evaluation.run();
    const rows = h.dailies.rows.size;
    await h.evaluation.run();
    expect(h.dailies.rows.size).toBe(rows);
    expect(h.notifier.calls).toEqual([]);
  });

  it("đồng bộ tập 'đã bật' trên Redis: thêm người còn bật bị mất, gỡ người đã tắt (Mongo xác nhận), giữ người vừa bật sau lúc quét", async () => {
    await optInEarlier(U1);
    h.store.optIn.clear(); // Redis mất dữ liệu
    h.store.optIn.add(U2); // thành viên cũ đã tắt (SREM hỏng lúc trước)
    await h.evaluation.run();
    expect([...h.store.optIn].sort()).toEqual([U1]);

    // Người vừa bật (Mongo đã bật) nhưng chưa nằm trong danh sách quét của lượt này: không được gỡ.
    await optInEarlier(U3);
    const original = h.settings.listEnabledPage.bind(h.settings);
    jest.spyOn(h.settings, "listEnabledPage").mockImplementation(async (after, limit) => (await original(after, limit)).filter((s) => s.userId !== U3));
    await h.evaluation.run();
    expect(h.store.optIn.has(U3)).toBe(true);
  });
});
