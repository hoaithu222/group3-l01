import { isOpenAt, isValidOpenHour } from "../../domain/open-hours";

const TZ = "Asia/Ho_Chi_Minh";

describe("open-hours (openNow theo giờ Việt Nam)", () => {
  // 2026-09-25 là Thứ Sáu (day 5). 03:00Z = 10:00 ICT.
  const friday10h = new Date("2026-09-25T03:00:00Z");
  const hours = [
    { day: 5, open: "07:00", close: "22:00" },
    { day: 6, open: "08:00", close: "12:00" },
  ];

  it("đúng ngày + trong khung giờ → mở; ngoài khung/khác ngày → đóng", () => {
    expect(isOpenAt(hours, friday10h, TZ)).toBe(true);
    expect(isOpenAt(hours, new Date("2026-09-25T15:30:00Z"), TZ)).toBe(false); // 22:30 ICT
    expect(isOpenAt([{ day: 1, open: "07:00", close: "22:00" }], friday10h, TZ)).toBe(false);
  });

  it("giờ đóng là mốc loại trừ; chưa khai giờ → null (không biết)", () => {
    expect(isOpenAt([{ day: 5, open: "07:00", close: "10:00" }], friday10h, TZ)).toBe(false);
    expect(isOpenAt([], friday10h, TZ)).toBeNull();
  });

  it("khung giờ không hợp lệ: đóng trước mở / sai định dạng / ngày ngoài 0–6", () => {
    expect(isValidOpenHour({ day: 1, open: "07:00", close: "24:00" })).toBe(true);
    expect(isValidOpenHour({ day: 1, open: "22:00", close: "07:00" })).toBe(false);
    expect(isValidOpenHour({ day: 1, open: "7:00", close: "09:00" })).toBe(false);
    expect(isValidOpenHour({ day: 7, open: "07:00", close: "09:00" })).toBe(false);
  });
});
