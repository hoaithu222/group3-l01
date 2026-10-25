/**
 * Unit — `workspace-stats.util.ts`: "ngày" của `WorkspaceDailyStat` tính theo
 * `CRON_TZ` (mặc định Asia/Ho_Chi_Minh, +07 không DST), KHÔNG theo UTC.
 */
import { addDaysToKey, dayKeyInTz, dayRangeUtc, isDayKey, previousDayKey, startOfDayUtc } from "../services/workspace-stats.util";

const ICT = "Asia/Ho_Chi_Minh";

describe("workspace-stats.util", () => {
  describe("dayKeyInTz()", () => {
    it("01:10 ICT ngày 19 = 18:10 UTC ngày 18 → key theo ICT là 2026-09-19 (UTC sẽ lệch 1 ngày)", () => {
      const instant = new Date("2026-09-18T18:10:00.000Z");
      expect(dayKeyInTz(instant, ICT)).toBe("2026-09-19");
      expect(dayKeyInTz(instant, "UTC")).toBe("2026-09-18");
    });

    it("sát nửa đêm: 16:59:59Z vẫn là ngày 18 ICT, 17:00:00Z đã sang ngày 19 ICT", () => {
      expect(dayKeyInTz(new Date("2026-09-18T16:59:59.999Z"), ICT)).toBe("2026-09-18");
      expect(dayKeyInTz(new Date("2026-09-18T17:00:00.000Z"), ICT)).toBe("2026-09-19");
    });

    it("múi giờ đi sau UTC (New York, UTC−4 mùa hè) → lùi 1 ngày khi UTC còn rạng sáng", () => {
      expect(dayKeyInTz(new Date("2026-07-15T02:00:00.000Z"), "America/New_York")).toBe("2026-07-14");
    });
  });

  describe("dayRangeUtc()", () => {
    it("ICT 2026-09-18 → [17/09 17:00Z, 18/09 17:00Z) — đúng 24 giờ", () => {
      const { from, to } = dayRangeUtc("2026-09-18", ICT);
      expect(from.toISOString()).toBe("2026-09-17T17:00:00.000Z");
      expect(to.toISOString()).toBe("2026-09-18T17:00:00.000Z");
      expect(to.getTime() - from.getTime()).toBe(24 * 3600 * 1000);
    });

    it("UTC: [00:00Z, 00:00Z ngày sau)", () => {
      const { from, to } = dayRangeUtc("2026-09-18", "UTC");
      expect([from.toISOString(), to.toISOString()]).toEqual(["2026-09-18T00:00:00.000Z", "2026-09-19T00:00:00.000Z"]);
    });

    it("ngày liên tiếp khít nhau (không hở/chồng): to của ngày N = from của ngày N+1", () => {
      expect(dayRangeUtc("2026-09-18", ICT).to.getTime()).toBe(dayRangeUtc("2026-09-19", ICT).from.getTime());
    });

    it("DST (New York): ngày chuyển giờ mùa xuân dài 23 giờ, mùa thu dài 25 giờ", () => {
      const spring = dayRangeUtc("2026-03-08", "America/New_York");
      expect((spring.to.getTime() - spring.from.getTime()) / 3600_000).toBe(23);
      const autumn = dayRangeUtc("2026-11-01", "America/New_York");
      expect((autumn.to.getTime() - autumn.from.getTime()) / 3600_000).toBe(25);
      // Ngày thường quanh đó vẫn 24 giờ.
      const normal = dayRangeUtc("2026-03-09", "America/New_York");
      expect((normal.to.getTime() - normal.from.getTime()) / 3600_000).toBe(24);
    });

    it("tin gửi lúc 23:30 ICT thuộc ngày đó, 00:10 ICT thuộc ngày sau (ranh giới nửa mở [from, to))", () => {
      const day18 = dayRangeUtc("2026-09-18", ICT);
      const at2330 = new Date("2026-09-18T16:30:00.000Z"); // 23:30 ICT 18/09
      const at0010 = new Date("2026-09-18T17:10:00.000Z"); // 00:10 ICT 19/09
      expect(at2330 >= day18.from && at2330 < day18.to).toBe(true);
      expect(at0010 >= day18.from && at0010 < day18.to).toBe(false);
      expect(at0010.getTime()).toBeGreaterThanOrEqual(dayRangeUtc("2026-09-19", ICT).from.getTime());
    });
  });

  describe("previousDayKey() — ngày cron 01:10 tổng kết", () => {
    it("01:10 ICT 19/09 (18:10Z 18/09) → tổng kết 2026-09-18", () => {
      expect(previousDayKey(new Date("2026-09-18T18:10:00.000Z"), ICT)).toBe("2026-09-18");
    });

    it("qua ranh giới tháng/năm/năm nhuận", () => {
      expect(previousDayKey(new Date("2026-10-01T01:10:00+07:00"), ICT)).toBe("2026-09-30");
      expect(previousDayKey(new Date("2027-01-01T01:10:00+07:00"), ICT)).toBe("2026-12-31");
      expect(previousDayKey(new Date("2028-03-01T01:10:00+07:00"), ICT)).toBe("2028-02-29");
    });
  });

  describe("addDaysToKey()/isDayKey()", () => {
    it("cộng/trừ ngày lịch", () => {
      expect(addDaysToKey("2026-09-30", 1)).toBe("2026-10-01");
      expect(addDaysToKey("2026-01-01", -1)).toBe("2025-12-31");
      expect(addDaysToKey("2026-09-18", 0)).toBe("2026-09-18");
    });

    it("isDayKey: đúng khuôn YYYY-MM-DD và là ngày có thật", () => {
      expect(isDayKey("2026-09-18")).toBe(true);
      for (const bad of ["2026-9-18", "2026-02-30", "2026-13-01", "18/09/2026", "", 20260918, null, undefined]) {
        expect(isDayKey(bad)).toBe(false);
      }
    });

    it("startOfDayUtc khớp cận dưới của dayRangeUtc", () => {
      expect(startOfDayUtc("2026-09-18", ICT).toISOString()).toBe(dayRangeUtc("2026-09-18", ICT).from.toISOString());
    });
  });
});
