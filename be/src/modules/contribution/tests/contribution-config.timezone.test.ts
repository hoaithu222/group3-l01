/**
 * `RuntimeContribConfig.timezone(workspaceId)` (đồng bộ chéo #9): `Workspace.timezone` của nhóm thắng; chưa đặt/lỗi đọc → mặc định hệ thống
 * (`pm.timezone` → `CRON_TZ`). Trước đây luôn là `pm.timezone` toàn hệ thống.
 */
import { initRuntimeConfig, resetRuntimeConfig } from "../../../core/config/runtime-config";
import { RuntimeContribConfig } from "../services/contribution.ports";

describe("RuntimeContribConfig.timezone", () => {
  beforeEach(() => initRuntimeConfig({ findByKey: async (key) => (key === "pm" ? { value: { timezone: "Europe/Paris" }, version: 2 } : null) }));
  afterEach(() => resetRuntimeConfig());

  it("nhóm đã đặt múi giờ → dùng múi giờ của nhóm (không phải pm.timezone)", async () => {
    const seen: string[] = [];
    const config = new RuntimeContribConfig(async (workspaceId) => {
      seen.push(workspaceId);
      return "Asia/Tokyo";
    });
    expect(await config.timezone("ws-1")).toBe("Asia/Tokyo");
    expect(seen).toEqual(["ws-1"]);
  });

  it("nhóm chưa đặt (null) hoặc giá trị lạ trong dữ liệu cũ → mặc định hệ thống pm.timezone", async () => {
    expect(await new RuntimeContribConfig(async () => null).timezone("ws-1")).toBe("Europe/Paris");
    expect(await new RuntimeContribConfig(async () => "Khong/Ton_Tai").timezone("ws-1")).toBe("Europe/Paris");
  });

  it("không truyền kho tra nhóm (hành vi cũ) hoặc kho ném lỗi → mặc định hệ thống, không ném", async () => {
    expect(await new RuntimeContribConfig().timezone("ws-1")).toBe("Europe/Paris");
    const failing = new RuntimeContribConfig(async () => {
      throw new Error("mongo down");
    });
    expect(await failing.timezone("ws-1")).toBe("Europe/Paris");
  });
});
