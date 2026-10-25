import { patchSettingSchema } from "../dtos";
import { BurnoutHarness, userId } from "./support/burnout-harness";

/**
 * `PATCH /me/wellbeing` (p7-03): sửa cài đặt PHỤ của người ĐANG bật, và KHÔNG BAO GIỜ bật theo dõi.
 *
 * Lý do tồn tại: `PUT` luôn đòi `optIn`, nên client đổi một công tắc phụ bằng `optIn: true` trên tài khoản đã TẮT ở máy khác sẽ lén bật
 * lại theo dõi (vi phạm đồng ý rõ ràng). Các test dưới đây khoá đúng điều đó: chưa bật ⇒ `WELL_001`, không ghi gì, không vào tập thu thập.
 */
const U1 = userId(1);

describe("BurnoutSettingService.patch — không bao giờ bật theo dõi", () => {
  let h: BurnoutHarness;
  beforeEach(() => {
    h = new BurnoutHarness();
    h.addUser(U1);
  });

  it("đang bật: sửa cảnh báo + giờ nghỉ, giữ nguyên `optedInAt`", async () => {
    const on = await h.setting.update(U1, { optIn: true });
    const patched = await h.setting.patch(U1, { alertsEnabled: false, preferredBreak: { workMinutes: 50, breakMinutes: 10 } });
    expect(patched).toMatchObject({ enabled: true, alertsEnabled: false, preferredBreak: { workMinutes: 50, breakMinutes: 10 } });
    expect(patched.optedInAt).toBe(on.optedInAt);
    expect((await h.setting.patch(U1, { preferredBreak: null })).preferredBreak).toBeNull();
  });

  it("CHƯA từng bật: WELL_001 (409), KHÔNG tạo dòng, KHÔNG vào tập thu thập", async () => {
    await expect(h.setting.patch(U1, { alertsEnabled: false })).rejects.toMatchObject({ errorCode: "WELL_001", statusCode: 409 });
    expect(h.settings.rows.size).toBe(0);
    expect(h.store.optIn.size).toBe(0);
  });

  it("ĐÃ TẮT (vd vừa tắt ở máy khác): WELL_001, vẫn TẮT — không bị bật lại và không thu thập tiếp", async () => {
    await h.setting.update(U1, { optIn: true });
    await h.setting.update(U1, { optIn: false });

    await expect(h.setting.patch(U1, { alertsEnabled: true })).rejects.toMatchObject({ errorCode: "WELL_001" });

    expect((await h.setting.get(U1)).enabled).toBe(false);
    expect(h.store.optIn.has(U1)).toBe(false);
  });
});

describe("patchSettingSchema", () => {
  it("nhận từng trường riêng lẻ và giờ nghỉ null (xoá)", () => {
    expect(patchSettingSchema.safeParse({ alertsEnabled: false }).success).toBe(true);
    expect(patchSettingSchema.safeParse({ preferredBreak: null }).success).toBe(true);
    expect(patchSettingSchema.safeParse({ preferredBreak: { workMinutes: 50, breakMinutes: 10 } }).success).toBe(true);
  });

  it("body rỗng bị từ chối (không phải 'không đổi gì')", () => {
    expect(patchSettingSchema.safeParse({}).success).toBe(false);
  });

  it("KHÔNG nhận `optIn` (PATCH không được phép bật/tắt) và không nhận trường lạ như `userId`", () => {
    expect(patchSettingSchema.safeParse({ optIn: true, alertsEnabled: false }).success).toBe(false);
    expect(patchSettingSchema.safeParse({ alertsEnabled: false, userId: "x" }).success).toBe(false);
  });

  it("giờ nghỉ ngoài khoảng cho phép bị từ chối", () => {
    expect(patchSettingSchema.safeParse({ preferredBreak: { workMinutes: 0, breakMinutes: 10 } }).success).toBe(false);
  });
});
