import { describeWeeklyCron, lastFireAt, parseWeeklyCron } from "../../domain/wallet-schedule";
import { toCsv, csvCell } from "../../domain/csv";
import { normalizeAccountName, bankNameOf } from "../../domain/vn-banks";
import { spendBandOf } from "../../services/wallet-stats.service";

const TZ = "Asia/Ho_Chi_Minh"; // UTC+7, không đổi giờ mùa hè

describe("lastFireAt (lịch nhắc hằng tuần theo múi giờ ví)", () => {
  // 2026-09-18 là Thứ Sáu → 09:00 giờ VN = 02:00 UTC.
  it("Thứ Sáu 09:00 VN: đúng giờ bắn thì trả chính mốc đó", () => {
    expect(lastFireAt("0 9 * * 5", TZ, new Date("2026-09-18T02:00:00.000Z"))?.toISOString()).toBe("2026-09-18T02:00:00.000Z");
  });

  it("trước giờ bắn 1 phút → mốc của tuần trước", () => {
    expect(lastFireAt("0 9 * * 5", TZ, new Date("2026-09-18T01:59:00.000Z"))?.toISOString()).toBe("2026-09-11T02:00:00.000Z");
  });

  it("sau giờ bắn vài ngày → vẫn trả mốc thứ Sáu gần nhất", () => {
    expect(lastFireAt("0 9 * * 5", TZ, new Date("2026-09-21T10:00:00.000Z"))?.toISOString()).toBe("2026-09-18T02:00:00.000Z");
  });

  it("múi giờ quyết định ngày: 20:00 UTC Thứ Năm đã là Thứ Sáu 03:00 giờ VN (chưa tới 09:00)", () => {
    expect(lastFireAt("0 9 * * 5", TZ, new Date("2026-09-17T20:00:00.000Z"))?.toISOString()).toBe("2026-09-11T02:00:00.000Z");
  });

  it("múi giờ khác (New York UTC−4 mùa hè): Thứ Hai 18:30 EDT = 22:30 UTC", () => {
    expect(lastFireAt("30 18 * * 1", "America/New_York", new Date("2026-09-15T00:00:00.000Z"))?.toISOString()).toBe("2026-09-14T22:30:00.000Z");
  });

  it("cron không hợp lệ → null (không ném)", () => {
    expect(lastFireAt("*/5 * * * *", TZ, new Date())).toBeNull();
    expect(lastFireAt("0 9 * * 9", TZ, new Date())).toBeNull();
  });

  it("parseWeeklyCron + mô tả tiếng Việt", () => {
    expect(parseWeeklyCron("5 7 * * 0")).toEqual({ minute: 5, hour: 7, weekday: 0 });
    expect(describeWeeklyCron("0 9 * * 5", TZ)).toBe("Thứ Sáu 09:00 Asia/Ho_Chi_Minh");
    expect(describeWeeklyCron("5 7 * * 0", "UTC")).toBe("Chủ Nhật 07:05 UTC");
  });
});

describe("csv", () => {
  it("có BOM, CRLF, escape dấu phẩy/nháy/xuống dòng", () => {
    const out = toCsv(["a", "b"], [["x,y", 'say "hi"'], ["line1\nline2", 5]]);
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out).toBe('﻿a,b\r\n"x,y","say ""hi"""\r\n"line1\nline2",5\r\n');
  });

  it("chặn CSV injection với chuỗi nhưng KHÔNG đổi số âm thật", () => {
    for (const bad of ["=1+1", "+1", "-1", "@SUM(A1)", "\tcmd"]) expect(csvCell(bad).replace(/^"/, "").startsWith("'")).toBe(true);
    expect(csvCell(-7500)).toBe("-7500");
    expect(csvCell(null)).toBe("");
  });
});

describe("vn-banks / dải chi tiêu", () => {
  it("chuẩn hoá tên chủ TK theo NAPAS", () => {
    expect(normalizeAccountName("Nguyễn Văn Ánh")).toBe("NGUYEN VAN ANH");
    expect(normalizeAccountName("  Đặng   thị  Hồng 2 ")).toBe("DANG THI HONG");
  });

  it("BIN lạ → null", () => {
    expect(bankNameOf("970436")).toBe("Vietcombank");
    expect(bankNameOf("000000")).toBeNull();
  });

  it("spendBandOf: ranh giới các dải", () => {
    expect(spendBandOf(0)).toBe("LT_500K");
    expect(spendBandOf(499_999)).toBe("LT_500K");
    expect(spendBandOf(500_000)).toBe("500K_2M");
    expect(spendBandOf(1_999_999)).toBe("500K_2M");
    expect(spendBandOf(2_000_000)).toBe("2M_10M");
    expect(spendBandOf(9_999_999)).toBe("2M_10M");
    expect(spendBandOf(10_000_000)).toBe("GT_10M");
  });
});
