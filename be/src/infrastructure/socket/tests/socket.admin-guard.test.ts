/**
 * Guard room `admin:{topic}` (p1-08 — `admin:moderation`): chỉ role có `moderation:view` join được; topic lạ/thiếu quyền bị từ chối
 * (mặc định đóng); id của kind `admin` là TÊN CHỦ ĐỀ (không phải ObjectId) còn kind khác vẫn bắt buộc ObjectId.
 */
import { clearRoomGuards, resolveJoinable } from "../socket.rooms";
import { registerPermissionGuards } from "../socket.guards";
import type { SocketData } from "../socket.server";

const user = (role: string): SocketData["user"] => ({ id: "u1", email: "u@test.local", name: "U", role });

describe("room guard admin:{topic}", () => {
  beforeEach(() => {
    clearRoomGuards();
    registerPermissionGuards();
  });
  afterEach(() => clearRoomGuards());

  it("admin và manager (có moderation:view) join được admin:moderation", async () => {
    await expect(resolveJoinable(user("admin"), "admin", "moderation")).resolves.toEqual({ room: "admin:moderation" });
    await expect(resolveJoinable(user("manager"), "admin", "moderation")).resolves.toEqual({ room: "admin:moderation" });
  });

  it("user thường (không có quyền admin) → PERM_001; chủ đề lạ → PERM_404 (mặc định đóng)", async () => {
    await expect(resolveJoinable(user("user"), "admin", "moderation")).resolves.toEqual({ room: null, code: "PERM_001" });
    await expect(resolveJoinable(user("admin"), "admin", "khong-ton-tai")).resolves.toEqual({ room: null, code: "PERM_404" });
  });

  it("(p2-07) admin:media ← meeting:view: admin/manager join được, user thường → PERM_001", async () => {
    await expect(resolveJoinable(user("admin"), "admin", "media")).resolves.toEqual({ room: "admin:media" });
    await expect(resolveJoinable(user("manager"), "admin", "media")).resolves.toEqual({ room: "admin:media" });
    await expect(resolveJoinable(user("user"), "admin", "media")).resolves.toEqual({ room: null, code: "PERM_001" });
  });

  it("(p0-03) admin:ops ← dashboard:view: admin/manager join được, user thường → PERM_001", async () => {
    await expect(resolveJoinable(user("admin"), "admin", "ops")).resolves.toEqual({ room: "admin:ops" });
    await expect(resolveJoinable(user("manager"), "admin", "ops")).resolves.toEqual({ room: "admin:ops" });
    await expect(resolveJoinable(user("user"), "admin", "ops")).resolves.toEqual({ room: null, code: "PERM_001" });
  });

  it("tên chủ đề sai định dạng (chữ hoa/ký tự lạ/quá dài) → PERM_404", async () => {
    for (const topic of ["Moderation", "moderation!", "../x", "a".repeat(33), ""]) {
      await expect(resolveJoinable(user("admin"), "admin", topic)).resolves.toEqual({ room: null, code: "PERM_404" });
    }
  });

  it("kind khác `admin` vẫn bắt buộc ObjectId (không nới lỏng)", async () => {
    await expect(resolveJoinable(user("admin"), "ch", "moderation")).resolves.toEqual({ room: null, code: "PERM_404" });
  });
});
