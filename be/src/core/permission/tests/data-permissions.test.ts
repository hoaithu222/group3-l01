import type { NextFunction, Request, Response } from "express";
import { redis } from "../../../infrastructure/redis";
import { requirePermission } from "../../middlewares/auth";
import {
  clearDataPermissionProviders,
  hasDataPermissionProviderFor,
  registerDataPermissionProvider,
  resolveDataPermissions,
  withDataPermissions,
} from "../data-permissions";

/** Chạy middleware Express đồng bộ/bất đồng bộ tới khi gọi `next`. */
function run(mw: (req: Request, res: Response, next: NextFunction) => void, user: Request["user"]): Promise<unknown> {
  return new Promise((resolve) => mw({ user } as Request, {} as Response, (err?: unknown) => resolve(err ?? "OK")));
}

describe("quyền theo dữ liệu (p6-05 — partner:*)", () => {
  const owners = new Set<string>();
  let calls = 0;

  beforeEach(() => {
    clearDataPermissionProviders();
    owners.clear();
    calls = 0;
    registerDataPermissionProvider({
      name: "print-shop",
      resources: ["partner"],
      forUser: async (userId) => {
        calls += 1;
        return owners.has(userId) ? ["partner:view", "partner:update"] : [];
      },
    });
  });
  afterAll(() => clearDataPermissionProviders());

  it("provider chỉ tra cho tài nguyên nó khai; khoá ngoài `resources` bị lọc bỏ", async () => {
    registerDataPermissionProvider({ name: "rogue", resources: ["partner"], forUser: async () => ["user:delete", "partner:view"] });
    owners.add("u1");
    expect(hasDataPermissionProviderFor("partner:view")).toBe(true);
    expect(hasDataPermissionProviderFor("o2o:view")).toBe(false);
    expect((await resolveDataPermissions("u1")).sort()).toEqual(["partner:update", "partner:view"]);
    expect(await withDataPermissions("u2", ["o2o:view"])).toEqual(["o2o:view", "partner:view"]);
  });

  it("requirePermission: vai hệ thống đủ quyền → không tra provider; thiếu → tra lười (chủ tiệm qua, người khác 403)", async () => {
    owners.add("owner");
    expect(await run(requirePermission("o2o:view"), { id: "ops", email: "", role: "admin" })).toBe("OK");
    expect(calls).toBe(0);

    const owner: Request["user"] = { id: "owner", email: "", role: "user", permissions: [] };
    expect(await run(requirePermission("partner:update"), owner)).toBe("OK");
    expect(owner?.permissions).toEqual(expect.arrayContaining(["partner:view", "partner:update"]));

    const err = await run(requirePermission("partner:view"), { id: "stranger", email: "", role: "user" });
    expect(err).toMatchObject({ statusCode: 403 });
    // Admin vận hành KHÔNG có partner:* theo vai (ROLE_PERMISSIONS loại `partner`) và không sở hữu tiệm → 403.
    expect(await run(requirePermission("partner:view"), { id: "ops", email: "", role: "admin" })).toMatchObject({ statusCode: 403 });
  });

  it("provider lỗi → không cấp quyền (fail-closed), không ném", async () => {
    clearDataPermissionProviders();
    registerDataPermissionProvider({ name: "boom", resources: ["partner"], forUser: async () => Promise.reject(new Error("db down")) });
    expect(await resolveDataPermissions("u1")).toEqual([]);
    expect(redis.set).toHaveBeenCalled();
  });
});
