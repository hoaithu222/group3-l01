/**
 * Phía API của cầu nối: lệnh `emitToScope({ recheck })` từ worker (`serverSideEmit`) được MỖI instance API xử lý cho socket CỤC BỘ của nó.
 */
const mockCan = jest.fn<Promise<boolean>, [unknown, unknown, unknown]>();
jest.mock("../../../core/permission", () => ({
  permissionService: { can: (user: unknown, action: unknown, scope: unknown): Promise<boolean> => mockCan(user, action, scope) },
}));

import type { Server } from "socket.io";
import { logger } from "../../logger";
import { BRIDGE_RECHECK_EVENT } from "../socket.bridge";
import { emitToSocketsWithRecheck, handleBridgeRecheck, registerSocketBridgeListeners } from "../socket.bridge.listener";

interface FakeSocket {
  data: { user?: { id: string } };
  emit: jest.Mock;
}

const socket = (userId?: string): FakeSocket => ({ data: userId ? { user: { id: userId } } : {}, emit: jest.fn() });

function fakeIo(sockets: FakeSocket[]) {
  const fetchSockets = jest.fn(() => Promise.resolve(sockets));
  const inRoom = jest.fn(() => ({ local: { fetchSockets } }));
  const handlers = new Map<string, (raw: unknown) => void>();
  const on = jest.fn((event: string, handler: (raw: unknown) => void) => {
    handlers.set(event, handler);
  });
  return { io: { in: inRoom, on } as unknown as Server, inRoom, fetchSockets, on, handlers };
}

const command = (over: Record<string, unknown> = {}) => ({
  room: "ch:c1",
  event: "message:created",
  payload: { v: 1, serverNow: "2026-09-25T10:00:00.000Z", id: "m1" },
  scope: { type: "CHANNEL", id: "c1" },
  recheck: "channel.read",
  ...over,
});

beforeEach(() => {
  mockCan.mockImplementation((user) => Promise.resolve((user as { id: string }).id !== "revoked"));
});

describe("registerSocketBridgeListeners", () => {
  it("đăng ký ĐÚNG một listener `serverSideEmit` và listener gọi handler xử lý lệnh", async () => {
    const ok = socket("ok");
    const { io, on, handlers } = fakeIo([ok]);

    registerSocketBridgeListeners(io);

    expect(on).toHaveBeenCalledTimes(1);
    expect(on).toHaveBeenCalledWith(BRIDGE_RECHECK_EVENT, expect.any(Function));
    handlers.get(BRIDGE_RECHECK_EVENT)?.(command());
    await new Promise((resolve) => setImmediate(resolve));
    expect(ok.emit).toHaveBeenCalledWith("message:created", command().payload);
  });
});

describe("handleBridgeRecheck", () => {
  it("chỉ xử lý socket CỤC BỘ (`.local`) của room — N instance không phát trùng", async () => {
    const { io, inRoom, fetchSockets } = fakeIo([]);

    await handleBridgeRecheck(io, command());

    expect(inRoom).toHaveBeenCalledWith("ch:c1");
    expect(fetchSockets).toHaveBeenCalledTimes(1);
  });

  it("kiểm quyền từng socket, chỉ phát cho socket còn quyền; bỏ excludeUserId và socket chưa xác thực", async () => {
    const ok = socket("ok");
    const revoked = socket("revoked");
    const sender = socket("sender");
    const anonymous = socket();
    const { io } = fakeIo([ok, revoked, sender, anonymous]);

    await handleBridgeRecheck(io, command({ excludeUserId: "sender" }));

    expect(mockCan).toHaveBeenCalledWith({ id: "ok" }, "channel.read", { type: "CHANNEL", id: "c1" });
    expect(ok.emit).toHaveBeenCalledWith("message:created", command().payload);
    expect(revoked.emit).not.toHaveBeenCalled();
    expect(sender.emit).not.toHaveBeenCalled();
    expect(anonymous.emit).not.toHaveBeenCalled();
  });

  it.each([
    ["không phải object", "oops"],
    ["null", null],
    ["thiếu room", command({ room: "" })],
    ["thiếu event", command({ event: undefined })],
    ["thiếu quyền recheck", command({ recheck: undefined })],
    ["payload không phải object", command({ payload: "x" })],
    ["scope type lạ", command({ scope: { type: "GALAXY", id: "c1" } })],
    ["scope thiếu id", command({ scope: { type: "CHANNEL" } })],
    ["excludeUserId sai kiểu", command({ excludeUserId: 42 })],
  ])("lệnh không hợp lệ (%s) → bỏ qua có log, KHÔNG phát gì (fail-closed)", async (_label, raw) => {
    const ok = socket("ok");
    const { io, fetchSockets } = fakeIo([ok]);

    await expect(handleBridgeRecheck(io, raw)).resolves.toBeUndefined();

    expect(fetchSockets).not.toHaveBeenCalled();
    expect(ok.emit).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Lệnh recheck không hợp lệ"));
  });

  it("lỗi khi liệt kê socket/kiểm quyền → nuốt + log (không làm sập listener của instance API)", async () => {
    const { io, fetchSockets } = fakeIo([]);
    fetchSockets.mockRejectedValue(new Error("adapter down"));

    await expect(handleBridgeRecheck(io, command())).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Xử lý lệnh recheck lỗi"), expect.objectContaining({ error: "adapter down" }));
  });
});

describe("emitToSocketsWithRecheck", () => {
  it("quyền không xác định (`can` = false) → không phát (mặc định đóng)", async () => {
    const s = socket("revoked");
    await emitToSocketsWithRecheck([s], { event: "e", payload: {}, scope: { type: "CHANNEL", id: "c1" }, recheck: "channel.read" });
    expect(s.emit).not.toHaveBeenCalled();
  });
});
