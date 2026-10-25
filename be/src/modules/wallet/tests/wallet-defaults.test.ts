import { runtimeConfig } from "../../../core/config/runtime-config";
import { LIMITS } from "../../../core/constants/limits";
import { readWalletDefaults, staticWalletDefaults } from "../wallet-defaults";

const STATIC = { reminderCron: LIMITS.wallet.defaultReminderCron, timezone: LIMITS.wallet.defaultTz, reminderMinDebt: LIMITS.wallet.reminderMinDebt };

/** Mặc định của ví TẠO MỚI (`SystemConfig` khoá `wallet` + `limits.wallet.reminderMinDebt`) — ví đã có giữ cấu hình riêng. */
function mockConfig(values: { cron?: unknown; tz?: unknown; minDebt?: unknown }) {
  jest.spyOn(runtimeConfig, "get").mockImplementation((path: string) =>
    Promise.resolve(path === "wallet.defaultReminderCron" ? values.cron : path === "wallet.defaultTz" ? values.tz : undefined)
  );
  jest.spyOn(runtimeConfig, "getEffective").mockResolvedValue({ reminderMinDebt: values.minDebt });
}

describe("readWalletDefaults", () => {
  it("staticWalletDefaults = hằng LIMITS.wallet", async () => {
    await expect(staticWalletDefaults()).resolves.toEqual(STATIC);
  });

  it("dùng giá trị admin đặt (lịch hằng tuần hợp lệ, múi giờ IANA, ngưỡng nợ số nguyên ≥ 0)", async () => {
    mockConfig({ cron: "0 18 * * 5", tz: "Asia/Bangkok", minDebt: 50_000 });
    await expect(readWalletDefaults()).resolves.toEqual({ reminderCron: "0 18 * * 5", timezone: "Asia/Bangkok", reminderMinDebt: 50_000 });
  });

  it("từng giá trị hỏng rơi về mặc định của mã, không kéo theo các giá trị còn lại", async () => {
    mockConfig({ cron: "*/5 * * * *", tz: "Mars/Olympus", minDebt: -1 });
    await expect(readWalletDefaults()).resolves.toEqual(STATIC);
    mockConfig({ cron: "0 9 * * 1", tz: 42, minDebt: 12.5 });
    await expect(readWalletDefaults()).resolves.toEqual({ ...STATIC, reminderCron: "0 9 * * 1" });
    mockConfig({ cron: undefined, tz: "UTC", minDebt: 0 });
    await expect(readWalletDefaults()).resolves.toEqual({ ...STATIC, timezone: "UTC", reminderMinDebt: 0 });
  });

  it("đọc cấu hình lỗi → mặc định của mã (tạo ví/xem tổng quan không hỏng vì Redis/DB cấu hình)", async () => {
    jest.spyOn(runtimeConfig, "get").mockRejectedValue(new Error("redis down"));
    jest.spyOn(runtimeConfig, "getEffective").mockRejectedValue(new Error("redis down"));
    await expect(readWalletDefaults()).resolves.toEqual(STATIC);
  });
});
