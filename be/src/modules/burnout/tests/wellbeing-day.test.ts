import fc from "fast-check";
import { LIMITS } from "../../../core/constants/limits";
import { bucketOf, dayConfigFrom, isLateNightMinute, parseClock, parseSlot, splitBucketHash, summarizeDay, wellbeingDateOf, type DayConfig } from "../domain/wellbeing-day";

/**
 * Domain THUẦN: ngày wellbeing (ranh giới 05:00 theo múi giờ NGƯỜI DÙNG) + tổng hợp khe 15 phút → chỉ số ngày (p7-03 be.md §5 "Aggregator", WELL-01). Bảng + property (fast-check).
 */
const CFG: DayConfig = dayConfigFrom(LIMITS.wellbeing);
const VN = "Asia/Ho_Chi_Minh"; // UTC+7, không đổi giờ mùa hè
const PARIS = "Europe/Paris"; // UTC+1 tới 2026-03-29, sau đó UTC+2

const SLOTS = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, "0")}${String((i % 4) * 15).padStart(2, "0")}`);

describe("dayConfigFrom / parseClock", () => {
  it("đọc khung khuya 23:00–05:00 từ LIMITS", () => {
    expect(CFG).toEqual({ bucketMinutes: 15, continuousGapMinutes: 20, lateNightStartMinute: 1380, lateNightEndMinute: 300 });
  });

  it("sai định dạng → dùng giá trị dự phòng, không ném lỗi", () => {
    expect(parseClock("25:00", 7)).toBe(7);
    expect(parseClock("abc", 8)).toBe(8);
    expect(parseClock("07:30", 0)).toBe(450);
  });
});

describe("isLateNightMinute — [23:00, 05:00) vắt qua nửa đêm", () => {
  it.each([
    ["22:45", 22 * 60 + 45, false],
    ["23:00", 23 * 60, true],
    ["23:59", 23 * 60 + 59, true],
    ["00:00", 0, true],
    ["04:59", 4 * 60 + 59, true],
    ["05:00", 5 * 60, false],
    ["12:00", 12 * 60, false],
  ])("%s → %s", (_label, minute, expected) => {
    expect(isLateNightMinute(minute, CFG)).toBe(expected);
  });
});

describe("bucketOf / wellbeingDateOf — hoạt động 00:00–05:00 thuộc ngày HÔM TRƯỚC", () => {
  // 2026-03-10 tại VN = UTC+7 → 16:30 UTC là 23:30 VN cùng ngày; 17:30 UTC là 00:30 ngày 11 VN.
  it.each([
    ["2026-03-10T16:30:00Z", VN, "2026-03-10", "2330"],
    ["2026-03-10T17:30:00Z", VN, "2026-03-10", "0030"], // 00:30 ngày 11 → ngày wellbeing 10
    ["2026-03-10T21:59:00Z", VN, "2026-03-10", "0445"], // 04:59 ngày 11 → vẫn ngày 10
    ["2026-03-10T22:00:00Z", VN, "2026-03-11", "0500"], // 05:00 ngày 11 → ngày mới
    ["2026-03-10T05:07:00Z", VN, "2026-03-10", "1200"],
  ])("%s tại %s → ngày %s, khe %s", (iso, tz, date, slot) => {
    expect(bucketOf(new Date(iso), tz, CFG)).toEqual({ date, slot });
  });

  it("WELL-01: hoạt động 23:30 giờ VN tính vào khuya theo múi giờ CỦA NGƯỜI DÙNG, cùng thời điểm ở Paris là 17:30 (không khuya)", () => {
    const at = new Date("2026-03-10T16:30:00Z");
    const vn = bucketOf(at, VN, CFG);
    const paris = bucketOf(at, PARIS, CFG);
    expect(summarizeDay({ activeSlots: [vn.slot], eventSlots: {} }, CFG).lateNightMinutes).toBe(15);
    expect(paris).toEqual({ date: "2026-03-10", slot: "1730" });
    expect(summarizeDay({ activeSlots: [paris.slot], eventSlots: {} }, CFG).lateNightMinutes).toBe(0);
  });

  it("đổi múi giờ giữa chừng không tạo ngày ảo: mỗi lần ghi tính lại từ thời điểm thật, kết quả luôn là một ngày lịch hợp lệ liền kề", () => {
    const at = new Date("2026-03-10T20:00:00Z"); // 03:00 ngày 11 VN, 21:00 ngày 10 Paris
    expect(wellbeingDateOf(at, VN, CFG)).toBe("2026-03-10");
    expect(wellbeingDateOf(at, PARIS, CFG)).toBe("2026-03-10");
    expect(wellbeingDateOf(new Date("2026-03-10T23:00:00Z"), VN, CFG)).toBe("2026-03-11");
  });

  it("qua mốc đổi giờ mùa hè của Paris (2026-03-29 02:00 → 03:00) vẫn ra khe/ngày đúng", () => {
    expect(bucketOf(new Date("2026-03-29T00:45:00Z"), PARIS, CFG)).toEqual({ date: "2026-03-28", slot: "0145" });
    expect(bucketOf(new Date("2026-03-29T01:10:00Z"), PARIS, CFG)).toEqual({ date: "2026-03-28", slot: "0300" });
  });

  it("property: khe luôn nằm trên lưới 15 phút, không muộn hơn thời điểm thật quá 15 phút, ngày là ngày lịch địa phương hoặc hôm trước", () => {
    fc.assert(
      fc.property(fc.date({ min: new Date("2025-01-01T00:00:00Z"), max: new Date("2027-12-31T00:00:00Z"), noInvalidDate: true }), fc.constantFrom(VN, PARIS, "America/New_York", "Pacific/Kiritimati", "Asia/Kolkata"), (at, tz) => {
        const { date, slot } = bucketOf(at, tz, CFG);
        expect(parseSlot(slot, CFG)).not.toBeNull();
        expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        // ngày wellbeing không bao giờ SAU ngày lịch địa phương
        const calendar = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
        expect(date <= calendar).toBe(true);
      })
    );
  });
});

describe("summarizeDay — chuỗi liên tục, khe khuya, sự kiện", () => {
  const day = (activeSlots: string[], eventSlots: Record<string, number> = {}) => summarizeDay({ activeSlots, eventSlots }, CFG);

  it("không có gì → toàn số 0", () => {
    expect(day([])).toEqual({ activeMinutes: 0, longestContinuousMinutes: 0, lateNightMinutes: 0, eventsCount: 0, lateNightEvents: 0 });
  });

  it("khe liền nhau: 4 khe = 60 phút hoạt động, chuỗi liên tục 60 phút", () => {
    expect(day(["2000", "2015", "2030", "2045"])).toMatchObject({ activeMinutes: 60, longestContinuousMinutes: 60 });
  });

  it("khoảng trống 15 phút (một khe trống) ≤ 20 → vẫn liên tục; phần trống KHÔNG được cộng vào", () => {
    expect(day(["2000", "2030"])).toMatchObject({ activeMinutes: 30, longestContinuousMinutes: 30 });
  });

  it("khoảng trống 30 phút (hai khe trống) > 20 → đứt chuỗi, lấy chuỗi dài nhất", () => {
    expect(day(["2000", "2015", "2100", "2115", "2130"])).toMatchObject({ activeMinutes: 75, longestContinuousMinutes: 45 });
  });

  it("chuỗi vắt qua nửa đêm 23:30 → 00:15 là MỘT chuỗi của cùng ngày wellbeing", () => {
    expect(day(["2330", "2345", "0000", "0015"])).toMatchObject({ activeMinutes: 60, longestContinuousMinutes: 60, lateNightMinutes: 60 });
  });

  it("chỉ tính khuya cho khe trong [23:00, 05:00)", () => {
    expect(day(["2245", "2300", "0445", "0500"])).toMatchObject({ activeMinutes: 60, lateNightMinutes: 30 });
  });

  it("khe trùng chỉ tính một lần; khe sai định dạng/lệch lưới bị bỏ", () => {
    expect(day(["2000", "2000", "abcd", "2460", "2007", "9999"])).toMatchObject({ activeMinutes: 15, longestContinuousMinutes: 15 });
  });

  it("sự kiện: tổng + riêng phần khuya; số lạ (âm, NaN, 0, thập phân) bị xử lý an toàn", () => {
    const res = day([], { "2330": 2, "0100": 1, "1000": 4, "1015": -3, "1030": Number.NaN, "1045": 0, "1100": 2.9, "zzzz": 5 });
    expect(res).toMatchObject({ eventsCount: 2 + 1 + 4 + 2, lateNightEvents: 3 });
  });

  it("splitBucketHash: đọc `b:`/`e:`, bỏ trường lạ và giá trị hỏng", () => {
    expect(splitBucketHash({ "b:2000": "1", "b:2015": "", "e:2000": "3", "e:2015": "x", "e:2030": "-1", other: "1" })).toEqual({ activeSlots: ["2000"], eventSlots: { "2000": 3 } });
  });

  it("property: longest ≤ active ≤ 1440; khuya ≤ active; sự kiện khuya ≤ tổng; bội của 15", () => {
    fc.assert(
      fc.property(fc.subarray(SLOTS), fc.dictionary(fc.constantFrom(...SLOTS), fc.integer({ min: 0, max: 50 })), (slots, events) => {
        const r = day(slots, events);
        expect(r.longestContinuousMinutes).toBeLessThanOrEqual(r.activeMinutes);
        expect(r.activeMinutes).toBeLessThanOrEqual(1440);
        expect(r.lateNightMinutes).toBeLessThanOrEqual(r.activeMinutes);
        expect(r.lateNightEvents).toBeLessThanOrEqual(r.eventsCount);
        expect(r.activeMinutes % 15).toBe(0);
        expect(r.longestContinuousMinutes % 15).toBe(0);
      })
    );
  });

  it("property: không phụ thuộc thứ tự đầu vào và bỏ qua khe lặp", () => {
    fc.assert(
      fc.property(fc.subarray(SLOTS), (slots) => {
        const shuffled = [...slots].reverse();
        expect(day(shuffled)).toEqual(day(slots));
        expect(day([...slots, ...slots])).toEqual(day(slots));
      })
    );
  });

  it("property: thêm khe hoạt động KHÔNG bao giờ làm giảm tổng phút hay chuỗi dài nhất (đơn điệu)", () => {
    fc.assert(
      fc.property(fc.subarray(SLOTS), fc.constantFrom(...SLOTS), (slots, extra) => {
        const before = day(slots);
        const after = day([...slots, extra]);
        expect(after.activeMinutes).toBeGreaterThanOrEqual(before.activeMinutes);
        expect(after.longestContinuousMinutes).toBeGreaterThanOrEqual(before.longestContinuousMinutes);
      })
    );
  });
});
