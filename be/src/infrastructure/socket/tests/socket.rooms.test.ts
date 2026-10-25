import { resolveJoinable, registerRoomGuard, clearRoomGuards } from "../socket.rooms";
import type { SocketData } from "../socket.server";

const OBJECT_ID = "507f1f77bcf86cd799439011";
const user: SocketData["user"] = { id: "u1", email: "u1@example.com" };

describe("resolveJoinable", () => {
  beforeEach(() => {
    clearRoomGuards();
  });

  it("kind chưa có guard đăng ký → { room: null, code: PERM_404 } (mặc định đóng)", async () => {
    const result = await resolveJoinable(user, "ch", OBJECT_ID);
    expect(result).toEqual({ room: null, code: "PERM_404" });
  });

  it("guard trả false (boolean) → { room: null, code: PERM_404 }", async () => {
    registerRoomGuard("ch", () => Promise.resolve(false));
    const result = await resolveJoinable(user, "ch", OBJECT_ID);
    expect(result).toEqual({ room: null, code: "PERM_404" });
  });

  it("guard trả true (boolean) → trả về room hợp lệ, không code", async () => {
    registerRoomGuard("ch", () => Promise.resolve(true));
    const result = await resolveJoinable(user, "ch", OBJECT_ID);
    expect(result).toEqual({ room: `ch:${OBJECT_ID}` });
  });

  it("guard trả { joinable:false, code:'PERM_001' } → giữ nguyên code", async () => {
    registerRoomGuard("ch", () => Promise.resolve({ joinable: false, code: "PERM_001" }));
    const result = await resolveJoinable(user, "ch", OBJECT_ID);
    expect(result).toEqual({ room: null, code: "PERM_001" });
  });

  it("guard trả { joinable:false } không kèm code → mặc định PERM_404", async () => {
    registerRoomGuard("ch", () => Promise.resolve({ joinable: false }));
    const result = await resolveJoinable(user, "ch", OBJECT_ID);
    expect(result).toEqual({ room: null, code: "PERM_404" });
  });

  it("guard trả { joinable:true } → room hợp lệ", async () => {
    registerRoomGuard("ch", () => Promise.resolve({ joinable: true }));
    const result = await resolveJoinable(user, "ch", OBJECT_ID);
    expect(result).toEqual({ room: `ch:${OBJECT_ID}` });
  });

  it("'user' với id khác chính mình → null", async () => {
    registerRoomGuard("user", (u, id) => Promise.resolve(u.id === id));
    const result = await resolveJoinable(user, "user", OBJECT_ID);
    expect(result.room).toBeNull();
  });

  it("'user' với id chính mình (ObjectId hợp lệ) → cho qua", async () => {
    const selfId = OBJECT_ID;
    registerRoomGuard("user", (u, id) => Promise.resolve(u.id === id));
    const selfUser: SocketData["user"] = { id: selfId, email: "u1@example.com" };
    const result = await resolveJoinable(selfUser, "user", selfId);
    expect(result.room).toBe(`user:${selfId}`);
  });

  it("id không đúng định dạng ObjectId → null", async () => {
    registerRoomGuard("ch", () => Promise.resolve(true));
    const result = await resolveJoinable(user, "ch", "not-an-object-id");
    expect(result.room).toBeNull();
  });

  it("kind không đúng định dạng → null", async () => {
    registerRoomGuard("ch", () => Promise.resolve(true));
    const result = await resolveJoinable(user, "CH_INVALID!", OBJECT_ID);
    expect(result.room).toBeNull();
  });
});
