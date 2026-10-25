import { localDayRangeUtc, startOfLocalDateKey } from "../../../core/utils/local-date";
import { isoWeekOfDayKey, isoWeeksInYear, isoWeekStartDayKey, monthKeyOf, parsePeriod, periodContains, weekKeyOf } from "../services/period";

const VN = "Asia/Ho_Chi_Minh";

describe("period — kỳ báo cáo (p4-06 be.md §5.2)", () => {
  it("ALL: không chặn hai đầu", () => {
    const p = parsePeriod("ALL", VN);
    expect(p).toEqual({ key: "ALL", kind: "ALL", from: null, to: null });
    expect(periodContains(p, new Date("1999-01-01T00:00:00Z"))).toBe(true);
  });

  it("M:yyyy-mm theo múi giờ: 23:30 VN ngày 30/09 thuộc tháng 09, 00:00 ngày 01/10 thuộc tháng 10", () => {
    const sep = parsePeriod("M:2026-09", VN);
    expect(sep.from?.toISOString()).toBe("2026-08-31T17:00:00.000Z");
    expect(sep.to?.toISOString()).toBe("2026-09-30T17:00:00.000Z");
    const lateNight = new Date("2026-09-30T16:30:00Z"); // 23:30 VN, 30/09
    expect(periodContains(sep, lateNight)).toBe(true);
    expect(monthKeyOf(lateNight, VN)).toBe("M:2026-09");
    const midnight = new Date("2026-09-30T17:00:00Z"); // 00:00 VN, 01/10
    expect(periodContains(sep, midnight)).toBe(false);
    expect(monthKeyOf(midnight, VN)).toBe("M:2026-10");
  });

  it("tháng 12 sang tháng 01 năm sau", () => {
    const dec = parsePeriod("M:2026-12", "UTC");
    expect(dec.from?.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(dec.to?.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("W:gggg-Www: thứ Hai 00:00 tới thứ Hai kế tiếp (2026-W37 = 07–13/09)", () => {
    const w = parsePeriod("W:2026-W37", VN);
    expect(w.from?.toISOString()).toBe("2026-09-06T17:00:00.000Z");
    expect(w.to?.toISOString()).toBe("2026-09-13T17:00:00.000Z");
    expect(isoWeekStartDayKey(2026, 37)).toBe("2026-09-07");
  });

  it("tuần 53: năm 2026 có 53 tuần (tuần 53 bắt đầu 28/12), năm 2025 chỉ có 52", () => {
    expect(isoWeeksInYear(2026)).toBe(53);
    expect(isoWeeksInYear(2025)).toBe(52);
    expect(isoWeeksInYear(2020)).toBe(53);
    expect(parsePeriod("W:2026-W53", VN).from?.toISOString()).toBe("2026-12-27T17:00:00.000Z");
    expect(() => parsePeriod("W:2025-W53", VN)).toThrow(expect.objectContaining({ errorCode: "CONTRIB_003", statusCode: 400 }));
  });

  it("ngày đầu năm thuộc tuần cuối của năm trước (ISO 8601)", () => {
    expect(isoWeekOfDayKey("2027-01-03")).toEqual({ year: 2026, week: 53 });
    expect(isoWeekOfDayKey("2026-01-01")).toEqual({ year: 2026, week: 1 });
    expect(isoWeekOfDayKey("2025-12-29")).toEqual({ year: 2026, week: 1 });
    expect(weekKeyOf(new Date("2027-01-03T00:00:00Z"), "UTC")).toBe("W:2026-W53");
    expect(weekKeyOf(new Date("2026-09-13T16:59:59Z"), VN)).toBe("W:2026-W37");
    expect(weekKeyOf(new Date("2026-09-13T17:00:00Z"), VN)).toBe("W:2026-W38");
  });

  it.each(["", "all", "2026-09", "M:2026-13", "M:2026-00", "M:26-09", "W:2026-W00", "W:2026-W54", "W:2026-9", "Y:2026"])(
    "khoá kỳ sai %p → CONTRIB_003",
    (key) => {
      expect(() => parsePeriod(key, VN)).toThrow(expect.objectContaining({ errorCode: "CONTRIB_003", statusCode: 400 }));
    }
  );
});

describe("local-date — ngày địa phương ↔ instant UTC (dùng chung với heatmap/kỳ)", () => {
  it("00:00 ngày địa phương ở múi giờ +7, UTC, +14 và −11", () => {
    expect(startOfLocalDateKey("2026-09-15", "Asia/Ho_Chi_Minh").toISOString()).toBe("2026-09-14T17:00:00.000Z");
    expect(startOfLocalDateKey("2026-09-15", "UTC").toISOString()).toBe("2026-09-15T00:00:00.000Z");
    expect(startOfLocalDateKey("2026-09-15", "Pacific/Kiritimati").toISOString()).toBe("2026-09-14T10:00:00.000Z");
    expect(startOfLocalDateKey("2026-09-15", "Pacific/Pago_Pago").toISOString()).toBe("2026-09-15T11:00:00.000Z");
  });

  it("ngày 23 giờ / 25 giờ khi đổi giờ mùa hè (New York) vẫn cho khoảng [từ, đến) đúng", () => {
    const spring = localDayRangeUtc("2026-03-08", "America/New_York");
    expect((spring.to.getTime() - spring.from.getTime()) / 3_600_000).toBe(23);
    const fall = localDayRangeUtc("2026-11-01", "America/New_York");
    expect((fall.to.getTime() - fall.from.getTime()) / 3_600_000).toBe(25);
    const normal = localDayRangeUtc("2026-09-15", "Asia/Ho_Chi_Minh");
    expect((normal.to.getTime() - normal.from.getTime()) / 3_600_000).toBe(24);
  });
});
