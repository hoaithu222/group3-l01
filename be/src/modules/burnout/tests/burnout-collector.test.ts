import { BurnoutHarness, PARIS, userId, VN } from "./support/burnout-harness";

/**
 * Collector (p7-03 be.md §5): CHỈ ghi cho người ĐÃ BẬT theo dõi (GM-08), theo múi giờ của họ (WELL-01), không lưu loại/nội dung, chống đếm trùng, nuốt lỗi hạ tầng (best-effort).
 */
const U1 = userId(1);
const U2 = userId(2);
const AT_2330_VN = new Date("2026-03-10T16:30:00Z"); // 23:30 ngày 10 giờ VN
const AT_0030_VN = new Date("2026-03-10T17:30:00Z"); // 00:30 ngày 11 giờ VN → ngày wellbeing 10

describe("BurnoutCollectorService", () => {
  let h: BurnoutHarness;
  beforeEach(() => {
    h = new BurnoutHarness();
  });

  it("GM-08: người CHƯA bật theo dõi (dù hoạt động khuya nhiều) — không ghi bucket, không ghi khoá chống trùng, không có gì trong Redis", async () => {
    h.addUser(U1);
    for (let i = 0; i < 5; i += 1) {
      await h.collector.recordActive(U1, new Date(AT_2330_VN.getTime() + i * 20 * 60_000));
      await h.collector.recordEvent(U1, AT_2330_VN, `job-${String(i)}`);
    }
    expect(h.store.hashes.size).toBe(0);
    expect(h.store.claimed.size).toBe(0);
    expect(h.store.optIn.size).toBe(0);
  });

  it("người ĐÃ bật: nhịp active ghi khe `b:HHmm` của ngày wellbeing theo múi giờ của họ", async () => {
    await h.optIn(U1);
    await h.collector.recordActive(U1, AT_2330_VN);
    expect(await h.store.readDay(U1, "2026-03-10")).toEqual({ "b:2330": "1" });
  });

  it("hoạt động 00:30 sáng hôm sau tính vào ngày HÔM TRƯỚC (bucket 00:30 thuộc ngày trước)", async () => {
    await h.optIn(U1);
    await h.collector.recordActive(U1, AT_0030_VN);
    expect(await h.store.readDay(U1, "2026-03-10")).toEqual({ "b:0030": "1" });
    expect(await h.store.readDay(U1, "2026-03-11")).toEqual({});
  });

  it("WELL-01: cùng một thời điểm, khe/ngày khác nhau theo múi giờ CỦA TỪNG NGƯỜI (VN 23:30 vs Paris 17:30)", async () => {
    await h.optIn(U1, VN);
    await h.optIn(U2, PARIS);
    await h.collector.recordActive(U1, AT_2330_VN);
    await h.collector.recordActive(U2, AT_2330_VN);
    expect(await h.store.readDay(U1, "2026-03-10")).toEqual({ "b:2330": "1" });
    expect(await h.store.readDay(U2, "2026-03-10")).toEqual({ "b:1730": "1" });
  });

  it("nhịp lặp trong cùng khe 15 phút chỉ ghi MỘT lần (nhịp 30 giây không xả ~30 lệnh Redis)", async () => {
    await h.optIn(U1);
    const spy = jest.spyOn(h.store, "markActive");
    for (let i = 0; i < 10; i += 1) await h.collector.recordActive(U1, new Date(AT_2330_VN.getTime() + i * 30_000));
    expect(spy).toHaveBeenCalledTimes(1);
    await h.collector.recordActive(U1, new Date(AT_2330_VN.getTime() + 15 * 60_000));
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("sự kiện: đếm theo khe, KHÔNG lưu loại/nội dung; cùng eventId chỉ đếm một lần, khác eventId đếm riêng", async () => {
    await h.optIn(U1);
    await h.collector.recordEvent(U1, AT_2330_VN, "task.completed_abc");
    await h.collector.recordEvent(U1, AT_2330_VN, "task.completed_abc");
    await h.collector.recordEvent(U1, AT_2330_VN, "task.created_def");
    expect(await h.store.readDay(U1, "2026-03-10")).toEqual({ "e:2330": "2" });
    // Khoá chống trùng là bản BĂM: không chứa id người dùng hay id sự kiện nguồn.
    for (const key of h.store.claimed) {
      expect(key).toMatch(/^[0-9a-f]{32}$/);
      expect(key).not.toContain(U1);
    }
  });

  it("sự kiện không có eventId vẫn đếm (mỗi lần gọi một sự kiện)", async () => {
    await h.optIn(U1);
    await h.collector.recordEvent(U1, AT_2330_VN);
    await h.collector.recordEvent(U1, AT_2330_VN);
    expect(await h.store.readDay(U1, "2026-03-10")).toEqual({ "e:2330": "2" });
  });

  it("phân hệ `burnout` TẮT → không thu thập dù người dùng còn trong tập đã bật", async () => {
    await h.optIn(U1);
    h.config.isEnabled = false;
    await h.collector.recordActive(U1, AT_2330_VN);
    await h.collector.recordEvent(U1, AT_2330_VN, "e1");
    expect(h.store.hashes.size).toBe(0);
  });

  it("Redis không sẵn sàng → KHÔNG thu thập khi không chắc (riêng tư đứng trước), không ném lỗi", async () => {
    await h.optIn(U1);
    h.store.available = false;
    await expect(h.collector.recordActive(U1, AT_2330_VN)).resolves.toBeUndefined();
    await expect(h.collector.recordEvent(U1, AT_2330_VN, "e1")).resolves.toBeUndefined();
    h.store.available = true;
    expect(h.store.hashes.size).toBe(0);
  });

  it("tài khoản không còn hoạt động (khoá/ẩn danh hoá/không tồn tại) → không ghi", async () => {
    await h.optIn(U1);
    h.directory.users.delete(U1);
    await h.collector.recordActive(U1, AT_2330_VN);
    expect(h.store.hashes.size).toBe(0);
  });

  it("lỗi hạ tầng khi ghi bị nuốt (không làm hỏng nhịp hiện diện / sink task.events)", async () => {
    await h.optIn(U1);
    jest.spyOn(h.store, "markActive").mockRejectedValue(new Error("redis chết"));
    jest.spyOn(h.store, "incrEvent").mockRejectedValue(new Error("redis chết"));
    await expect(h.collector.recordActive(U1, AT_2330_VN)).resolves.toBeUndefined();
    await expect(h.collector.recordEvent(U1, AT_2330_VN)).resolves.toBeUndefined();
  });

  it("ghi thất bại thì lần sau THỬ LẠI (chưa nhớ khe đã ghi)", async () => {
    await h.optIn(U1);
    const spy = jest.spyOn(h.store, "markActive").mockRejectedValueOnce(new Error("redis chết"));
    await h.collector.recordActive(U1, AT_2330_VN);
    await h.collector.recordActive(U1, AT_2330_VN);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(await h.store.readDay(U1, "2026-03-10")).toEqual({ "b:2330": "1" });
  });

  it("múi giờ người dùng được nhớ đệm (không tra thư mục mỗi nhịp)", async () => {
    await h.optIn(U1);
    const spy = jest.spyOn(h.directory, "getActiveUser");
    await h.collector.recordActive(U1, AT_2330_VN);
    await h.collector.recordEvent(U1, AT_2330_VN);
    await h.collector.recordActive(U1, new Date(AT_2330_VN.getTime() + 30_000));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
