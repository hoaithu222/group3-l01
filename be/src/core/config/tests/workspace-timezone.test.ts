/**
 * `workspace-timezone.ts` (đồng bộ chéo #9): chuỗi ưu tiên `Workspace.timezone` → `SystemConfig pm.timezone` → `CRON_TZ` → `Asia/Ho_Chi_Minh`.
 */
import { effectiveWorkspaceTimeZone, systemDefaultTimeZone } from "../workspace-timezone";
import { initRuntimeConfig, resetRuntimeConfig, type ISystemConfigReader, type SystemConfigSnapshot } from "../runtime-config";
import { env } from "../env.schema";

const reader = (data: Record<string, SystemConfigSnapshot>): ISystemConfigReader => ({ findByKey: async (key) => data[key] ?? null });

describe("effectiveWorkspaceTimeZone", () => {
  it("Workspace.timezone hợp lệ thắng mặc định hệ thống", () => {
    expect(effectiveWorkspaceTimeZone("Asia/Tokyo", "Asia/Ho_Chi_Minh")).toBe("Asia/Tokyo");
  });

  it.each([null, undefined, "", "Khong/Ton_Tai", "x".repeat(70)])("giá trị %p (thiếu/không phải IANA) → mặc định hệ thống, không ném lỗi", (raw) => {
    expect(effectiveWorkspaceTimeZone(raw as string | null | undefined, "Asia/Bangkok")).toBe("Asia/Bangkok");
  });
});

describe("systemDefaultTimeZone", () => {
  afterEach(() => resetRuntimeConfig());

  it("mặc định registry pm.timezone khi chưa có override", async () => {
    initRuntimeConfig(reader({}));
    expect(await systemDefaultTimeZone()).toBe("Asia/Ho_Chi_Minh");
  });

  it("override pm.timezone hợp lệ của admin được dùng", async () => {
    initRuntimeConfig(reader({ pm: { value: { timezone: "Europe/Paris" }, version: 2 } }));
    expect(await systemDefaultTimeZone()).toBe("Europe/Paris");
  });

  it("đọc cấu hình lỗi → rơi về CRON_TZ (không ném)", async () => {
    initRuntimeConfig({
      findByKey: async () => {
        throw new Error("mongo down");
      },
    });
    expect(await systemDefaultTimeZone()).toBe(env.CRON_TZ);
  });
});
