import { DEFAULT_BURNOUT_RULE_SET } from "../../../core/constants/burnout";
import { addDaysToLocalDate } from "../../../core/utils/local-date";
import { BurnoutHarness, userId } from "./support/burnout-harness";

/**
 * Cài đặt của CHÍNH người dùng (p7-03 be.md §4/§5): mặc định TẮT, bật/tắt/xoá dữ liệu, ack cảnh báo, lịch sử 7/30 ngày; tắt ⇒ dừng thu thập + xoá sạch (WELL-02); không có đường nào chạm dữ liệu người khác.
 */
const U1 = userId(1);
const U2 = userId(2);
const D = "2026-03-10"; // ngày wellbeing vừa kết thúc ở TICK_AT (05:20 ngày 11 giờ VN)
const HOUR = 3_600_000;

async function seedMediumAndAlert(h: BurnoutHarness, id: string): Promise<string> {
  for (let offset = -2; offset <= 0; offset += 1) await h.seedDaily(id, addDaysToLocalDate(D, offset), { longestContinuousMinutes: 240, lateNightMinutes: 90 });
  await h.assessor.assess(id, D, DEFAULT_BURNOUT_RULE_SET);
  return (await h.assessments.findByDate(id, D))?.id as string;
}

describe("BurnoutSettingService — bật/tắt", () => {
  let h: BurnoutHarness;
  beforeEach(() => {
    h = new BurnoutHarness();
    h.addUser(U1);
    h.addUser(U2);
  });

  it("mặc định TẮT: xem cài đặt KHÔNG tạo dòng nào, không thêm vào tập thu thập", async () => {
    expect(await h.setting.get(U1)).toEqual({ enabled: false, optedInAt: null, alertsEnabled: true, preferredBreak: null, latest: null, pendingAlert: null });
    expect(h.settings.rows.size).toBe(0);
    expect(h.store.optIn.size).toBe(0);
  });

  it("bật: có `optedInAt`, vào tập thu thập, cảnh báo mặc định BẬT; bật lại giữ nguyên `optedInAt`", async () => {
    const first = await h.setting.update(U1, { optIn: true });
    expect(first).toMatchObject({ enabled: true, alertsEnabled: true, latest: null, pendingAlert: null });
    expect(first.optedInAt).toBe(new Date(h.clockMs).toISOString());
    expect(h.store.optIn.has(U1)).toBe(true);
    h.clockMs += 5 * HOUR;
    expect((await h.setting.update(U1, { optIn: true })).optedInAt).toBe(first.optedInAt);
  });

  it("sửa cài đặt khi đang bật: tắt cảnh báo, đặt/xoá giờ nghỉ mong muốn", async () => {
    await h.setting.update(U1, { optIn: true });
    expect(await h.setting.update(U1, { optIn: true, alertsEnabled: false, preferredBreak: { workMinutes: 50, breakMinutes: 10 } })).toMatchObject({ alertsEnabled: false, preferredBreak: { workMinutes: 50, breakMinutes: 10 } });
    expect((await h.setting.update(U1, { optIn: true, preferredBreak: null })).preferredBreak).toBeNull();
    expect((await h.setting.get(U1)).alertsEnabled).toBe(false);
  });

  it("bật kèm cài đặt ngay từ đầu", async () => {
    expect(await h.setting.update(U1, { optIn: true, alertsEnabled: false, preferredBreak: { workMinutes: 25, breakMinutes: 5 } })).toMatchObject({ enabled: true, alertsEnabled: false, preferredBreak: { workMinutes: 25, breakMinutes: 5 } });
  });

  it("WELL-02: tắt → dừng thu thập NGAY, xoá chỉ số + đánh giá + bucket, ghi dòng outbox dọn dẹp; get trả TẮT không còn dữ liệu", async () => {
    await h.setting.update(U1, { optIn: true });
    const alertId = await seedMediumAndAlert(h, U1);
    await h.store.markActive(U1, D, "2200");
    expect(alertId).toBeTruthy();

    const off = await h.setting.update(U1, { optIn: false });
    expect(off).toEqual({ enabled: false, optedInAt: null, alertsEnabled: true, preferredBreak: null, latest: null, pendingAlert: null });
    expect(h.dailies.rows.size).toBe(0);
    expect(h.assessments.rows.size).toBe(0);
    expect(h.store.hashes.size).toBe(0);
    expect(h.store.optIn.has(U1)).toBe(false);
    expect(await h.settings.findByUserId(U1)).toMatchObject({ optedInAt: null, optedOutAt: new Date(h.clockMs), lastAlertAt: null, snoozedUntil: null });
    expect(h.outbox.events).toHaveLength(1);
    expect(h.outbox.events[0]).toMatchObject({ queue: "gamification", jobName: "wellbeing.purge", aggregateId: U1, payload: { userId: U1 } });
    expect(h.outbox.events[0]?.dedupeKey).toBe(`wellbeing.purge:user:${U1}:${String(h.clockMs)}`);
  });

  it("sau khi tắt collector không ghi thêm gì (kể cả khi có nhịp active)", async () => {
    await h.setting.update(U1, { optIn: true });
    await h.setting.update(U1, { optIn: false });
    await h.collector.recordActive(U1, new Date("2026-03-10T16:30:00Z"));
    await h.collector.recordEvent(U1, new Date("2026-03-10T16:30:00Z"), "e1");
    expect(h.store.hashes.size).toBe(0);
  });

  it("tắt lặp lại / tắt khi chưa từng bật là no-op: không tạo dòng, không thêm outbox", async () => {
    await h.setting.update(U1, { optIn: false });
    expect(h.settings.rows.size).toBe(0);
    expect(h.outbox.events).toHaveLength(0);
    await h.setting.update(U1, { optIn: true });
    await h.setting.update(U1, { optIn: false });
    await h.setting.update(U1, { optIn: false });
    expect(h.outbox.events).toHaveLength(1);
  });

  it("bật lại sau khi tắt: khởi đầu sạch (không thừa mốc cảnh báo/giờ nghỉ cũ), `optedInAt` mới", async () => {
    await h.setting.update(U1, { optIn: true, preferredBreak: { workMinutes: 50, breakMinutes: 10 } });
    await h.setting.update(U1, { optIn: false });
    h.clockMs += 3 * HOUR;
    const again = await h.setting.update(U1, { optIn: true });
    expect(again).toMatchObject({ enabled: true, preferredBreak: null, alertsEnabled: true, latest: null });
    expect(again.optedInAt).toBe(new Date(h.clockMs).toISOString());
    expect(await h.settings.findByUserId(U1)).toMatchObject({ optedOutAt: null, lastAlertAt: null, snoozedUntil: null });
  });

  it("mỗi người một dòng cài đặt riêng: người này bật/tắt không ảnh hưởng người kia", async () => {
    await h.setting.update(U1, { optIn: true });
    await h.setting.update(U2, { optIn: true });
    await h.seedDaily(U2, D, { activeMinutes: 60 });
    await h.setting.update(U1, { optIn: false });
    expect((await h.setting.get(U2)).enabled).toBe(true);
    expect(h.dailies.rows.size).toBe(1);
    expect(h.store.optIn.has(U2)).toBe(true);
  });

  it("xoá dữ liệu nhưng GIỮ bật: xoá chỉ số/đánh giá/bucket + quên mốc cảnh báo; vẫn thu thập tiếp", async () => {
    await h.setting.update(U1, { optIn: true });
    await seedMediumAndAlert(h, U1);
    await h.store.markActive(U1, D, "2200");
    await h.setting.deleteMyData(U1);
    expect(h.dailies.rows.size).toBe(0);
    expect(h.assessments.rows.size).toBe(0);
    expect(h.store.hashes.size).toBe(0);
    expect(await h.settings.findByUserId(U1)).toMatchObject({ lastAlertAt: null, snoozedUntil: null });
    expect((await h.setting.get(U1)).enabled).toBe(true);
    expect(h.store.optIn.has(U1)).toBe(true);
    await h.collector.recordActive(U1, new Date("2026-03-10T16:30:00Z"));
    expect(h.store.hashes.size).toBe(1);
  });

  it("xoá dữ liệu khi chưa bật cũng an toàn (dọn phần còn sót), không lỗi", async () => {
    await h.seedDaily(U1, D, { activeMinutes: 60 });
    await expect(h.setting.deleteMyData(U1)).resolves.toBeUndefined();
    expect(h.dailies.rows.size).toBe(0);
  });

  it("Redis lỗi lúc BẬT: việc bật vẫn thành công (Mongo là nguồn sự thật), job hằng giờ đồng bộ lại tập thu thập", async () => {
    jest.spyOn(h.store, "addOptIn").mockRejectedValueOnce(new Error("redis chết"));
    await expect(h.setting.update(U1, { optIn: true })).resolves.toMatchObject({ enabled: true });
    expect(h.store.optIn.has(U1)).toBe(false);
    expect((await h.settings.findByUserId(U1))?.optedInAt).not.toBeNull();
    h.clockMs = Date.UTC(2026, 2, 10, 22, 20); // tick 05:20 VN
    await h.evaluation.run();
    expect(h.store.optIn.has(U1)).toBe(true);
  });

  it("Redis lỗi lúc tắt: DB vẫn tắt + xoá, dòng outbox đã có để job dọn Redis sau (không ném lỗi cho người dùng)", async () => {
    await h.setting.update(U1, { optIn: true });
    jest.spyOn(h.store, "removeOptIn").mockRejectedValueOnce(new Error("redis chết"));
    await expect(h.setting.update(U1, { optIn: false })).resolves.toMatchObject({ enabled: false });
    expect(h.outbox.events).toHaveLength(1);
    expect(h.dailies.rows.size).toBe(0);
  });
});

describe("BurnoutSettingService.get — đánh giá mới nhất + cảnh báo chưa bấm", () => {
  let h: BurnoutHarness;
  beforeEach(async () => {
    h = new BurnoutHarness();
    await h.optIn(U1);
  });

  it("có đánh giá + cảnh báo chưa bấm → `latest` và `pendingAlert` (WELL-05: app hiện toast khi mở lại); bấm rồi thì hết chờ", async () => {
    const alertId = await seedMediumAndAlert(h, U1);
    const view = await h.setting.get(U1);
    expect(view.latest).toMatchObject({ id: alertId, date: D, level: "MEDIUM", riskScore: 50, suggestion: "BREAK", alerted: true, ackAction: null });
    expect(view.pendingAlert).toEqual({ id: alertId, level: "MEDIUM", suggestion: "BREAK" });
    await h.history.acknowledge(U1, alertId, "DISMISS");
    const after = await h.setting.get(U1);
    expect(after.pendingAlert).toBeNull();
    expect(after.latest).toMatchObject({ ackAction: "DISMISS" });
  });

  it("chưa đủ dữ liệu → không có `latest`", async () => {
    await h.seedDaily(U1, D, { activeMinutes: 60 });
    expect((await h.setting.get(U1)).latest).toBeNull();
  });
});

describe("BurnoutHistoryService", () => {
  let h: BurnoutHarness;
  beforeEach(() => {
    h = new BurnoutHarness();
    h.addUser(U1);
    h.addUser(U2);
  });

  it("WELL_001 (409) khi chưa bật theo dõi — cả khi có dữ liệu sót", async () => {
    await h.seedDaily(U1, D, { activeMinutes: 60 });
    await expect(h.history.history(U1, 7)).rejects.toMatchObject({ errorCode: "WELL_001", statusCode: 409 });
    await h.setting.update(U1, { optIn: true });
    await h.setting.update(U1, { optIn: false });
    await expect(h.history.history(U1, 7)).rejects.toMatchObject({ errorCode: "WELL_001" });
  });

  it("7 ngày vs 30 ngày: cửa sổ tính theo ngày wellbeing hôm nay của người dùng (05:20 ngày 11 → hôm nay là 11)", async () => {
    await h.setting.update(U1, { optIn: true });
    for (const date of ["2026-02-08", "2026-02-09", "2026-03-03", "2026-03-04", "2026-03-10"]) await h.seedDaily(U1, date, { activeMinutes: 60 });
    const week = await h.history.history(U1, 7);
    expect(week.dailies.map((d) => d.date)).toEqual(["2026-03-04", "2026-03-10"]);
    const month = await h.history.history(U1, 30);
    expect(month.days).toBe(30);
    expect(month.dailies.map((d) => d.date)).toEqual(["2026-02-09", "2026-03-03", "2026-03-04", "2026-03-10"]);
  });

  it("chỉ trả dữ liệu CỦA NGƯỜI GỌI (người kia không thấy dữ liệu của mình) và chỉ các trường chỉ số — không userId/timezone", async () => {
    await h.setting.update(U1, { optIn: true });
    await h.setting.update(U2, { optIn: true });
    await h.seedDaily(U1, D, { activeMinutes: 100 });
    await h.seedDaily(U2, D, { activeMinutes: 999 });
    const mine = await h.history.history(U1, 7);
    expect(mine.dailies).toEqual([{ date: D, activeMinutes: 100, longestContinuousMinutes: 0, lateNightMinutes: 0, eventsCount: 0, lateNightEvents: 0 }]);
    expect(JSON.stringify(mine)).not.toContain(U2);
    expect(JSON.stringify(mine)).not.toContain(U1);
  });

  it("ack: DISMISS ghi nhận, lặp lại là no-op giữ hành động ĐẦU TIÊN", async () => {
    await h.setting.update(U1, { optIn: true });
    const alertId = await seedMediumAndAlert(h, U1);
    await h.history.acknowledge(U1, alertId, "DISMISS");
    await h.history.acknowledge(U1, alertId, "SNOOZE");
    expect(await h.assessments.findOwned(alertId, U1)).toMatchObject({ ackAction: "DISMISS", ackAt: new Date(h.clockMs) });
    expect((await h.settings.findByUserId(U1))?.snoozedUntil).toBeNull();
  });

  it("ack SNOOZE: đặt tạm hoãn 24 giờ kể từ lúc bấm", async () => {
    await h.setting.update(U1, { optIn: true });
    const alertId = await seedMediumAndAlert(h, U1);
    h.clockMs += 2 * HOUR;
    await h.history.acknowledge(U1, alertId, "SNOOZE");
    expect((await h.settings.findByUserId(U1))?.snoozedUntil).toEqual(new Date(h.clockMs + 24 * HOUR));
  });

  it("ack: id của NGƯỜI KHÁC, id không tồn tại, hoặc đánh giá chưa từng cảnh báo → cùng một 404 (không dò được id)", async () => {
    await h.setting.update(U1, { optIn: true });
    await h.setting.update(U2, { optIn: true });
    const alertId = await seedMediumAndAlert(h, U1);
    await expect(h.history.acknowledge(U2, alertId, "DISMISS")).rejects.toMatchObject({ statusCode: 404, errorCode: "RES_001" });
    await expect(h.history.acknowledge(U1, userId(99), "DISMISS")).rejects.toMatchObject({ statusCode: 404, errorCode: "RES_001" });
    const low = await h.assessments.upsertScore({ userId: U2, date: D, riskScore: 0, level: "LOW", factors: [], ruleVersion: 1 });
    await expect(h.history.acknowledge(U2, low.id, "DISMISS")).rejects.toMatchObject({ statusCode: 404 });
    // Cảnh báo của người kia không bị ảnh hưởng
    expect(await h.assessments.findOwned(alertId, U1)).toMatchObject({ ackAction: null });
  });
});
