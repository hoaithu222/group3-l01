import { BurnoutHarness, PARIS, userId, VN } from "./support/burnout-harness";

/**
 * Aggregator (p7-03 be.md §5/§10): HASH bucket Redis → `WellbeingDaily`. Khe trống 15/30 phút, bucket 00:30 thuộc ngày trước, múi giờ VN vs Paris (WELL-01), idempotent, không ghi đè bằng số 0.
 */
const U1 = userId(1);
const U2 = userId(2);
const DAY = "2026-03-10";

describe("BurnoutAggregatorService", () => {
  let h: BurnoutHarness;
  beforeEach(() => {
    h = new BurnoutHarness();
    h.clockMs = Date.UTC(2026, 2, 5, 3, 0, 0); // đã bật từ trước ngày cần tổng hợp
  });

  const aggregate = (id: string, tz: string = VN, date: string = DAY) => h.aggregator.aggregate({ userId: id, date, timezone: tz, optedInAt: new Date(Date.UTC(2026, 2, 5, 3, 0, 0)) });
  const mark = async (id: string, slots: string[], date: string = DAY) => {
    for (const s of slots) await h.store.markActive(id, date, s);
  };

  it("khe liền nhau + khe khuya + sự kiện → chỉ số ngày đúng", async () => {
    await h.optIn(U1);
    await mark(U1, ["2200", "2215", "2230", "2245", "2300", "2315"]);
    await h.store.incrEvent(U1, DAY, "2300");
    await h.store.incrEvent(U1, DAY, "2300");
    await h.store.incrEvent(U1, DAY, "1000");
    const row = await aggregate(U1);
    expect(row).toMatchObject({ userId: U1, date: DAY, timezone: VN, activeMinutes: 90, longestContinuousMinutes: 90, lateNightMinutes: 30, eventsCount: 3, lateNightEvents: 2 });
  });

  it("khoảng trống 15 phút vẫn liên tục, 30 phút thì đứt chuỗi", async () => {
    await h.optIn(U1);
    await mark(U1, ["2000", "2030", "2100", "2200", "2215"]); // 2000→2030 gap15 ✓ liên tục; 2030→2100 gap 15 ✓; 2100→2200 gap 45 ✗
    expect(await aggregate(U1)).toMatchObject({ activeMinutes: 75, longestContinuousMinutes: 45 });
    await mark(U1, ["2300", "2345"], "2026-03-09"); // gap 30 phút → đứt
    expect(await aggregate(U1, VN, "2026-03-09")).toMatchObject({ activeMinutes: 30, longestContinuousMinutes: 15 });
  });

  it("bucket 00:30 (đã ghi vào ngày hôm trước) được cộng vào khuya của ngày đó, nối chuỗi với 23:45", async () => {
    await h.optIn(U1);
    await mark(U1, ["2330", "2345", "0000", "0030"]);
    const row = await aggregate(U1);
    expect(row).toMatchObject({ activeMinutes: 60, lateNightMinutes: 60, longestContinuousMinutes: 60 });
  });

  it("WELL-01: opt-in 22:00, hoạt động 23:30 qua collector → tính vào lateNightMinutes theo múi giờ tài khoản (VN), còn Paris thì không", async () => {
    h.clockMs = Date.UTC(2026, 2, 10, 15, 0, 0); // 22:00 ngày 10 giờ VN
    await h.optIn(U1, VN);
    await h.optIn(U2, PARIS);
    const at = new Date("2026-03-10T16:30:00Z"); // 23:30 VN = 17:30 Paris
    await h.collector.recordActive(U1, at);
    await h.collector.recordActive(U2, at);
    const optedInAt = new Date(h.clockMs);
    expect(await h.aggregator.aggregate({ userId: U1, date: DAY, timezone: VN, optedInAt })).toMatchObject({ lateNightMinutes: 15, activeMinutes: 15 });
    expect(await h.aggregator.aggregate({ userId: U2, date: DAY, timezone: PARIS, optedInAt })).toMatchObject({ lateNightMinutes: 0, activeMinutes: 15 });
  });

  it("người đã bật mà không có hoạt động → hàng toàn số 0 (ngày CÓ dữ liệu là 'không làm gì', không phải 'không biết')", async () => {
    await h.optIn(U1);
    expect(await aggregate(U1)).toMatchObject({ activeMinutes: 0, longestContinuousMinutes: 0, lateNightMinutes: 0, eventsCount: 0, lateNightEvents: 0 });
    expect(h.dailies.rows.size).toBe(1);
  });

  it("KHÔNG tổng hợp ngày TRƯỚC khi bật theo dõi (không có dữ liệu ≠ 0 phút)", async () => {
    await h.optIn(U1);
    const optedInAt = new Date("2026-03-10T15:00:00Z"); // 22:00 ngày 10 VN
    expect(await h.aggregator.aggregate({ userId: U1, date: "2026-03-09", timezone: VN, optedInAt })).toBeNull();
    expect(await h.aggregator.aggregate({ userId: U1, date: "2026-03-10", timezone: VN, optedInAt })).not.toBeNull();
    expect(h.dailies.rows.size).toBe(1);
  });

  it("idempotent: chạy lại cùng HASH cho ra đúng MỘT hàng cùng nội dung", async () => {
    await h.optIn(U1);
    await mark(U1, ["2000", "2015"]);
    const first = await aggregate(U1);
    const second = await aggregate(U1);
    expect(second).toMatchObject({ id: first?.id, activeMinutes: 30 });
    expect(h.dailies.rows.size).toBe(1);
  });

  it("HASH đã hết hạn/rỗng khi job chạy lại KHÔNG ghi đè hàng đã có bằng số 0", async () => {
    await h.optIn(U1);
    await mark(U1, ["2000", "2015", "2030"]);
    await aggregate(U1);
    h.store.hashes.clear(); // TTL 3 ngày đã xoá HASH
    expect(await aggregate(U1)).toMatchObject({ activeMinutes: 45 });
    expect((await h.dailies.findByDate(U1, DAY))?.activeMinutes).toBe(45);
  });

  it("HASH có thêm khe mới (job chạy lại sau khi có thêm hoạt động) → cập nhật hàng", async () => {
    await h.optIn(U1);
    await mark(U1, ["2000"]);
    await aggregate(U1);
    await mark(U1, ["2015"]);
    expect(await aggregate(U1)).toMatchObject({ activeMinutes: 30 });
    expect(h.dailies.rows.size).toBe(1);
  });

  it("dữ liệu lạ trong HASH (khe sai lưới, số âm) bị bỏ, không làm hỏng tổng hợp", async () => {
    await h.optIn(U1);
    h.store.hashes.set(`wb:${U1}:${DAY}`, { "b:2000": "1", "b:2007": "1", "b:zzzz": "1", "e:2000": "-4", "e:2015": "abc", junk: "1" });
    expect(await aggregate(U1)).toMatchObject({ activeMinutes: 15, eventsCount: 0 });
  });
});
