/**
 * p3-04b — điểm chạm KHÁCH của lớp quyền dùng chung:
 *   - `requireWorkspaceRole`: KHÁCH dưới bậc → 404 trung tính (không 403), đủ bậc `GUEST` → qua; thành viên vẫn 403;
 *   - `GUEST_HIDDEN_ACTIONS` mở rộng (danh bạ, mời, tạo kênh/nhóm chat/họp) → `assert` trả 404 cho khách;
 *   - cache quyền: mục cache có `expiresAt` đã quá → coi như KHÔNG thấy ngay (không chờ TTL 60 giây / job `guest.expire`).
 */
import type { Request, Response } from "express";
import { registerScopeResolver, clearScopeRegistry } from "../scope-registry";
import { permissionService } from "../permission.service";
import { requireWorkspaceRole } from "../middlewares";
import { GUEST_HIDDEN_ACTIONS } from "../actions";
import { ErrorCode } from "../../utils/error.codes";
import type { ScopeResolver, ResolvedAccess } from "../scope.types";
import { FakeWorkspaceResolver } from "./fixtures/fake-resolvers";
import { installFakeRedis, type FakeRedisMock } from "./fixtures/fake-redis";

jest.mock("../../../infrastructure/redis", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createFakeRedisModule } = require("./fixtures/fake-redis");
  return createFakeRedisModule();
});

import { redis } from "../../../infrastructure/redis";

const WS = "aa".repeat(12);
const guest = { id: "guest", email: "g@e.com" };

function runMiddleware(min: "GUEST" | "MEMBER" | "ADMIN", userId: string): Promise<unknown> {
  const req = { params: { workspaceId: WS }, user: { id: userId, email: `${userId}@e.com` } } as unknown as Request;
  return new Promise((resolve) => {
    void requireWorkspaceRole(min)(req, {} as Response, (err?: unknown) => resolve(err ?? null));
  });
}

describe("p3-04b — quyền của KHÁCH", () => {
  beforeEach(() => {
    installFakeRedis(redis as unknown as FakeRedisMock);
    clearScopeRegistry();
    const ws = new FakeWorkspaceResolver();
    ws.members.set(
      WS,
      new Map([
        ["guest", "GUEST"],
        ["member", "MEMBER"],
      ])
    );
    registerScopeResolver(ws);
  });

  afterEach(() => {
    clearScopeRegistry();
  });

  describe("requireWorkspaceRole", () => {
    it("KHÁCH dưới bậc MEMBER/ADMIN → 404 PERM_404 (không lộ chức năng tồn tại)", async () => {
      for (const min of ["MEMBER", "ADMIN"] as const) {
        expect(await runMiddleware(min, "guest")).toMatchObject({ statusCode: 404, errorCode: ErrorCode.PERM_404 });
      }
    });

    it("KHÁCH đạt bậc GUEST → qua (gắn req.access); thành viên dưới bậc vẫn 403 PERM_001", async () => {
      expect(await runMiddleware("GUEST", "guest")).toBeNull();
      expect(await runMiddleware("ADMIN", "member")).toMatchObject({ statusCode: 403, errorCode: ErrorCode.PERM_001 });
    });

    it("không phải thành viên → 404 (như trước)", async () => {
      expect(await runMiddleware("GUEST", "stranger")).toMatchObject({ statusCode: 404 });
    });
  });

  describe("GUEST_HIDDEN_ACTIONS (mở rộng p3-04b)", () => {
    it.each(["workspace.member.list", "workspace.member.invite", "workspace.channel.create", "workspace.conversation.create", "workspace.meeting.create"] as const)(
      "%s: KHÁCH → 404 PERM_404; thành viên không đủ quyền vẫn 403",
      async (action) => {
        expect(GUEST_HIDDEN_ACTIONS.has(action)).toBe(true);
        const scope = { type: "WORKSPACE", id: WS } as const;
        await expect(permissionService.assert(guest, action, scope)).rejects.toMatchObject({ statusCode: 404, errorCode: ErrorCode.PERM_404 });
      }
    );

    it("action KHÔNG thuộc tập ẩn (workspace.archive) → khách vẫn 403 như cũ", async () => {
      await expect(permissionService.assert(guest, "workspace.archive", { type: "WORKSPACE", id: WS })).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });

  describe("cache quyền + ResolvedAccess.expiresAt", () => {
    class ExpiringResolver implements ScopeResolver {
      readonly type = "WORKSPACE" as const;
      calls = 0;
      constructor(private readonly expiresAt: Date) {}
      resolve(): Promise<ResolvedAccess> {
        this.calls += 1;
        return Promise.resolve({ visible: true, role: "GUEST", actions: new Set(["workspace.read"]), expiresAt: this.expiresAt });
      }
    }

    it("còn hạn: cache hit (không gọi lại resolver) và giữ nguyên expiresAt", async () => {
      clearScopeRegistry();
      const expiresAt = new Date(Date.now() + 3600_000);
      const resolver = new ExpiringResolver(expiresAt);
      registerScopeResolver(resolver);
      const scope = { type: "WORKSPACE", id: WS } as const;

      const first = await permissionService.resolve(guest, scope);
      const second = await permissionService.resolve(guest, scope);
      expect(resolver.calls).toBe(1);
      expect(first.expiresAt).toEqual(expiresAt);
      expect(second).toMatchObject({ visible: true, role: "GUEST" });
      expect(second.expiresAt?.getTime()).toBe(expiresAt.getTime());
    });

    it("hết hạn GIỮA lúc ghi cache và lúc đọc → coi như không thấy NGAY dù TTL cache chưa hết (RB-04 phía quyền)", async () => {
      clearScopeRegistry();
      // Hạn 150ms: lần 1 còn hạn (ghi cache), sau khi quá hạn lần 2 đọc cache phải trả invisible mà KHÔNG gọi lại resolver.
      const resolver = new ExpiringResolver(new Date(Date.now() + 150));
      registerScopeResolver(resolver);
      const scope = { type: "WORKSPACE", id: WS } as const;

      await expect(permissionService.can(guest, "workspace.read", scope)).resolves.toBe(true);
      await new Promise((r) => setTimeout(r, 200));
      await expect(permissionService.can(guest, "workspace.read", scope)).resolves.toBe(false);
      await expect(permissionService.assert(guest, "workspace.read", scope)).rejects.toMatchObject({ statusCode: 404 });
      expect(resolver.calls).toBe(1);
    });
  });
});

