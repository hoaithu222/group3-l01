import { runtimeConfig } from "../../../core/config/runtime-config";
import { RuntimeMentorSettings } from "../services/mentor-settings";

describe("RuntimeMentorSettings.defaultDurationDays — SystemConfig `mentor.defaultDurationDays`", () => {
  const settings = new RuntimeMentorSettings();

  it("giá trị admin đặt (trong [7, 60]) được dùng và hỏi đúng đường dẫn `mentor.defaultDurationDays`", async () => {
    const spy = jest.spyOn(runtimeConfig, "get").mockResolvedValue(45);
    await expect(settings.defaultDurationDays()).resolves.toBe(45);
    expect(spy).toHaveBeenCalledWith("mentor.defaultDurationDays");
  });

  it("giá trị hỏng (không phải số nguyên / ngoài khoảng / vắng) → mặc định 30 của mã", async () => {
    for (const bad of [undefined, null, "45", 45.5, 6, 61, Number.NaN]) {
      jest.spyOn(runtimeConfig, "get").mockResolvedValue(bad);
      await expect(settings.defaultDurationDays()).resolves.toBe(30);
    }
  });

  it("đọc cấu hình lỗi → mặc định 30 (không làm hỏng việc chấp nhận cố vấn)", async () => {
    jest.spyOn(runtimeConfig, "get").mockRejectedValue(new Error("redis down"));
    await expect(settings.defaultDurationDays()).resolves.toBe(30);
  });
});
