import { SessionDeviceCleanup, type DeviceTokenPort } from "../services/session-device-cleanup";

/**
 * Thu hồi phiên TỪ XA phải cắt push của thiết bị (best-effort). Cổng `DeviceTokenPort` giả — hàm thường, KHÔNG dùng
 * `jest.fn()` cho implementation (`resetMocks: true` xoá implementation trước mỗi test); ghi lại lời gọi bằng mảng.
 */
function fakePort(opts: { active?: string[]; failListing?: boolean; failFor?: string[] } = {}) {
  const unregistered: Array<[string, string]> = [];
  const port: DeviceTokenPort = {
    listActive: async () => {
      if (opts.failListing) throw new Error("mongo down");
      return (opts.active ?? []).map((deviceId) => ({ deviceId }));
    },
    unregister: async (userId, deviceId) => {
      if (opts.failFor?.includes(deviceId)) throw new Error(`lỗi ${deviceId}`);
      unregistered.push([userId, deviceId]);
      return 1;
    },
  };
  return { port, unregistered };
}

describe("SessionDeviceCleanup", () => {
  describe("unregisterAll — không còn phiên nào", () => {
    it("gỡ push của MỌI thiết bị đang nhận push (mỗi deviceId một lần, kể cả nhiều token cùng thiết bị)", async () => {
      const { port, unregistered } = fakePort({ active: ["dev-a", "dev-b", "dev-a"] });

      await new SessionDeviceCleanup(port).unregisterAll("u1");

      expect(unregistered).toEqual([
        ["u1", "dev-a"],
        ["u1", "dev-b"],
      ]);
    });

    it("lỗi khi liệt kê thiết bị KHÔNG ném ra (không được làm hỏng việc thu hồi phiên)", async () => {
      const { port, unregistered } = fakePort({ failListing: true });

      await expect(new SessionDeviceCleanup(port).unregisterAll("u1")).resolves.toBeUndefined();
      expect(unregistered).toEqual([]);
    });

    it("một thiết bị lỗi không chặn các thiết bị còn lại", async () => {
      const { port, unregistered } = fakePort({ active: ["dev-a", "dev-b", "dev-c"], failFor: ["dev-b"] });

      await expect(new SessionDeviceCleanup(port).unregisterAll("u1")).resolves.toBeUndefined();

      expect(unregistered.map(([, d]) => d)).toEqual(["dev-a", "dev-c"]);
    });
  });

  describe("unregisterRevoked — chỉ thiết bị của phiên vừa thu hồi", () => {
    it("bỏ thiết bị còn phiên hoạt động khác (phiên được giữ / hai phiên cùng máy), bỏ phiên không có deviceId, khử trùng lặp", async () => {
      const { port, unregistered } = fakePort();

      await new SessionDeviceCleanup(port).unregisterRevoked(
        "u1",
        ["dev-a", "dev-b", null, undefined, "dev-b", "dev-keep"],
        new Set(["dev-keep"])
      );

      expect(unregistered).toEqual([
        ["u1", "dev-a"],
        ["u1", "dev-b"],
      ]);
    });

    it("không có thiết bị nào để gỡ ⇒ không gọi cổng", async () => {
      const { port, unregistered } = fakePort();

      await new SessionDeviceCleanup(port).unregisterRevoked("u1", [null, "dev-keep"], new Set(["dev-keep"]));

      expect(unregistered).toEqual([]);
    });
  });

  it("cổng null (tắt) ⇒ mọi thao tác là no-op", async () => {
    const cleanup = new SessionDeviceCleanup(null);

    await expect(cleanup.unregisterAll("u1")).resolves.toBeUndefined();
    await expect(cleanup.unregisterRevoked("u1", ["dev-a"], new Set())).resolves.toBeUndefined();
  });
});
