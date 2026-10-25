import { addDaysToLocalDate, diffLocalDates, localDate, localHour, safeTimeZone, startOfLocalDay, startOfLocalDayPlus, startOfNextLocalDay } from "../services/local-date";

const VN = "Asia/Ho_Chi_Minh";
const LA = "America/Los_Angeles";

describe("local-date (thuần, Intl)", () => {
  it("Asia/Ho_Chi_Minh: 23:59 và 00:10 rơi vào HAI ngày khác nhau", () => {
    const late = new Date("2026-09-21T16:59:00.000Z"); // 23:59 ngày 21
    const early = new Date("2026-09-21T17:10:00.000Z"); // 00:10 ngày 22
    expect(localDate(late, VN)).toBe("2026-09-21");
    expect(localDate(early, VN)).toBe("2026-09-22");
    expect(startOfNextLocalDay(late, VN)).toEqual(new Date("2026-09-21T17:00:00.000Z"));
    expect(startOfNextLocalDay(early, VN)).toEqual(new Date("2026-09-22T17:00:00.000Z"));
    expect(localHour(late, VN)).toBe(23);
  });

  it("America/Los_Angeles: ngày kết thúc giờ mùa hè dài 25 giờ (01/11/2026) và ngày bắt đầu dài 23 giờ (08/03/2026)", () => {
    const fallDay = new Date("2026-11-01T12:00:00.000Z");
    const start = startOfLocalDay(fallDay, LA);
    const next = startOfLocalDayPlus(fallDay, LA, 1);
    expect(start).toEqual(new Date("2026-11-01T07:00:00.000Z")); // 00:00 PDT
    expect(next).toEqual(new Date("2026-11-02T08:00:00.000Z")); // 00:00 PST
    expect((next.getTime() - start.getTime()) / 3_600_000).toBe(25);

    const springDay = new Date("2026-03-08T12:00:00.000Z");
    const s = startOfLocalDay(springDay, LA);
    const n = startOfNextLocalDay(springDay, LA);
    expect((n.getTime() - s.getTime()) / 3_600_000).toBe(23);
  });

  it("startOfLocalDayPlus cộng ngày lịch (âm được) và qua ranh giới tháng", () => {
    const at = new Date("2026-09-30T05:00:00.000Z"); // 12:00 ngày 30/09 VN
    expect(startOfLocalDayPlus(at, VN, 1)).toEqual(new Date("2026-09-30T17:00:00.000Z"));
    expect(startOfLocalDayPlus(at, VN, -30)).toEqual(new Date("2026-08-30T17:00:00.000Z"));
  });

  it("múi giờ lạ/rỗng → mặc định Asia/Ho_Chi_Minh (không ném lỗi)", () => {
    expect(safeTimeZone("Không/Tồn_Tại")).toBe(VN);
    expect(safeTimeZone(null)).toBe(VN);
    expect(safeTimeZone("UTC")).toBe("UTC");
    expect(localDate(new Date("2026-09-21T20:00:00.000Z"), "Không/Tồn_Tại")).toBe("2026-09-22");
  });

  it("addDaysToLocalDate / diffLocalDates không phụ thuộc múi giờ", () => {
    expect(addDaysToLocalDate("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDaysToLocalDate("2026-01-01", -1)).toBe("2025-12-31");
    expect(diffLocalDates("2026-09-01", "2026-09-21")).toBe(20);
  });
});
