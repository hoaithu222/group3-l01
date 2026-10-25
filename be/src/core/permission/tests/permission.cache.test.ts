/**
 * ACL-04, ACL-05 (be.md §10) — cache theo version + fail-open (Redis lỗi) vs
 * fail-closed (resolver lỗi).
 */
import { registerScopeResolver, clearScopeRegistry } from "../scope-registry";
import { permissionService } from "../permission.service";
import { incrVersion } from "../permission.cache";
import { setPermissionPorts, resetPermissionPorts } from "../ports";
import { ErrorCode } from "../../utils/error.codes";
import type { ScopeResolver, ResolvedAccess } from "../scope.types";
import { installFakeRedis, type FakeRedisMock } from "./fixtures/fake-redis";

jest.mock("../../../infrastructure/redis", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createFakeRedisModule } = require("./fixtures/fake-redis");
  return createFakeRedisModule();
});

import { redis } from "../../../infrastructure/redis";

/** Resolver đếm số lần được gọi + cho phép đổi kết quả/giả lập lỗi giữa các bước test. */
class CountingResolver implements ScopeResolver {
  readonly type = "WORKSPACE" as const;
  calls = 0;
  shouldThrow = false;
  result: ResolvedAccess = { visible: true, role: "MEMBER", actions: new Set(["workspace.read"]) };

  resolve(): Promise<ResolvedAccess> {
    this.calls += 1;
    if (this.shouldThrow) return Promise.reject(new Error("resolver lỗi (giả lập DB down)"));
    return Promise.resolve(this.result);
  }
}

const user = { id: "u1", email: "u1@example.com" };
const scope = { type: "WORKSPACE" as const, id: "ws1" };

describe("permission.cache", () => {
  beforeEach(() => {
    clearScopeRegistry();
  });

  afterEach(() => {
    clearScopeRegistry();
    resetPermissionPorts();
  });

  describe("ACL-04 — bumpVersion vô hiệu cache ngay", () => {
    it("cache hit không gọi lại resolver; bumpVersion() xong thì gọi lại và thấy dữ liệu mới", async () => {
      installFakeRedis(redis as unknown as FakeRedisMock);
      const resolver = new CountingResolver();
      registerScopeResolver(resolver);

      await expect(permissionService.can(user, "workspace.read", scope)).resolves.toBe(true);
      expect(resolver.calls).toBe(1);

      // Cache hit — resolver KHÔNG được gọi lại dù dữ liệu nguồn đổi.
      resolver.result = { visible: true, role: "MEMBER", actions: new Set() };
      await expect(permissionService.can(user, "workspace.read", scope)).resolves.toBe(true);
      expect(resolver.calls).toBe(1);

      await permissionService.bumpVersion(scope);

      // Sau bump — khoá cache cũ tự vô hiệu, resolver được gọi lại, thấy dữ liệu mới.
      await expect(permissionService.can(user, "workspace.read", scope)).resolves.toBe(false);
      expect(resolver.calls).toBe(2);
    });
  });

  describe("ACL-05 — Redis lỗi vs resolver lỗi", () => {
    it("Redis GET/INCR trả null (mất kết nối) → bỏ cache, gọi resolver trực tiếp, vẫn trả đúng kết quả", async () => {
      (redis.get as jest.Mock).mockResolvedValue(null);
      (redis.set as jest.Mock).mockResolvedValue(undefined);
      (redis.incr as jest.Mock).mockResolvedValue(null);
      (redis.expire as jest.Mock).mockResolvedValue(undefined);

      const resolver = new CountingResolver();
      registerScopeResolver(resolver);

      await expect(permissionService.can(user, "workspace.read", scope)).resolves.toBe(true);
      expect(resolver.calls).toBe(1);
      // Không cache được (Redis down) → mỗi lần gọi lại resolver.
      await expect(permissionService.can(user, "workspace.read", scope)).resolves.toBe(true);
      expect(resolver.calls).toBe(2);
    });

    it("Redis lỗi (ném exception thay vì trả null) → vẫn fail-open, không văng lỗi lên caller", async () => {
      (redis.get as jest.Mock).mockRejectedValue(new Error("ECONNRESET"));
      (redis.set as jest.Mock).mockRejectedValue(new Error("ECONNRESET"));

      const resolver = new CountingResolver();
      registerScopeResolver(resolver);

      await expect(permissionService.can(user, "workspace.read", scope)).resolves.toBe(true);
    });

    it("resolver ném lỗi (DB lỗi/timeout) → fail-closed 503 SYS_503, KHÔNG cho qua", async () => {
      installFakeRedis(redis as unknown as FakeRedisMock);
      const resolver = new CountingResolver();
      resolver.shouldThrow = true;
      registerScopeResolver(resolver);

      await expect(permissionService.assert(user, "workspace.read", scope)).rejects.toMatchObject({
        statusCode: 503,
        errorCode: ErrorCode.SYS_503,
      });
      await expect(permissionService.can(user, "workspace.read", scope)).rejects.toMatchObject({
        statusCode: 503,
      });
    });
  });

  describe("bumpVersion — Redis lỗi khi INCR", () => {
    it("không throw — log + metric + xếp job retry qua OutboxPort, trả -1", async () => {
      (redis.incr as jest.Mock).mockResolvedValue(null);
      const enqueueNow = jest.fn().mockResolvedValue(undefined);
      setPermissionPorts({
        realtime: { leaveRooms: jest.fn().mockResolvedValue(undefined), emitToUsers: jest.fn().mockResolvedValue(undefined) },
        outbox: { enqueueNow },
      });

      await expect(permissionService.bumpVersion(scope)).resolves.toBe(-1);
      expect(enqueueNow).toHaveBeenCalledWith(
        "permission.bump",
        expect.objectContaining({ scopeType: "WORKSPACE", scopeId: "ws1" })
      );
    });

    it("ports chưa bind (chưa gọi bindPermissionPorts) → vẫn không throw, chỉ log warn", async () => {
      (redis.incr as jest.Mock).mockResolvedValue(null);
      resetPermissionPorts();
      await expect(permissionService.bumpVersion(scope)).resolves.toBe(-1);
    });
  });

  describe("incrVersion (dùng bởi job retry permission.bump)", () => {
    it("Redis OK → tăng dần; Redis lỗi → null", async () => {
      installFakeRedis(redis as unknown as FakeRedisMock);
      await expect(incrVersion(scope)).resolves.toBe(1);
      await expect(incrVersion(scope)).resolves.toBe(2);

      (redis.incr as jest.Mock).mockResolvedValue(null);
      await expect(incrVersion(scope)).resolves.toBeNull();
    });
  });
});
