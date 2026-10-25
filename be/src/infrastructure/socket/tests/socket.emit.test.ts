/**
 * `socket.emit.ts` chọn đường phát: API (có `Server`) phát TRỰC TIẾP; worker (không có `Server`, đã bật cầu nối) ghi lên Redis qua emitter;
 * không có cả hai → ném lỗi cũ. Cả hai đường cho CÙNG một gói (room/event/payload có `v`/`serverNow`, `exceptUserIds`, `excludeUserId`, `recheck`).
 * `Server` và emitter đều được thay bằng bộ ghi (recorder) — không cần socket/Redis thật.
 */
const mockTryGetIO = jest.fn<unknown, []>();
const mockGetIO = jest.fn<unknown, []>();
const mockCan = jest.fn<Promise<boolean>, [unknown, unknown, unknown]>();

jest.mock("../socket.server", () => ({ tryGetIO: (): unknown => mockTryGetIO(), getIO: (): unknown => mockGetIO() }));
jest.mock("../../../core/permission", () => ({
  permissionService: { can: (user: unknown, action: unknown, scope: unknown): Promise<boolean> => mockCan(user, action, scope) },
}));

import type { BroadcastOp, SocketBridge } from "../socket.bridge";
import { BRIDGE_RECHECK_EVENT, setSocketBridgeForTests } from "../socket.bridge";
import { emitToAll, emitToRoom, emitToScope, emitToUsers, joinRooms, leaveRooms, stampPayload } from "../socket.emit";
import { disconnectUserSockets } from "../socket.sessions";

interface Recorded {
  chain: Array<[string, unknown]>;
  op: string;
  args: unknown[];
}

interface FakeSocket {
  data: { user?: { id: string } };
  emit: jest.Mock;
}

/** Bộ ghi chuỗi `to().except().emit()` — dùng chung cho `Server` giả và emitter giả. */
function recorder(calls: Recorded[], chain: Array<[string, unknown]> = [], sockets: FakeSocket[] = []): BroadcastOp & { fetchSockets: () => Promise<FakeSocket[]> } {
  const next = (name: string, arg: unknown) => recorder(calls, [...chain, [name, arg]], sockets);
  return {
    to: (room) => next("to", room),
    in: (room) => next("in", room),
    except: (room) => next("except", room),
    emit: (event, ...args) => {
      calls.push({ chain, op: "emit", args: [event, ...args] });
      return true;
    },
    socketsJoin: (rooms) => {
      calls.push({ chain, op: "socketsJoin", args: [rooms] });
    },
    socketsLeave: (rooms) => {
      calls.push({ chain, op: "socketsLeave", args: [rooms] });
    },
    disconnectSockets: (close) => {
      calls.push({ chain, op: "disconnectSockets", args: [close] });
    },
    fetchSockets: () => Promise.resolve(sockets),
  };
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function payloadOf(call: Recorded | undefined): Record<string, unknown> {
  if (!call) throw new Error("Không có lệnh emit nào được ghi");
  return call.args[1] as Record<string, unknown>;
}

interface Env {
  apiCalls: Recorded[];
  bridgeCalls: Recorded[];
  serverSideEmit: jest.Mock;
  sockets: FakeSocket[];
}

/** `mode`: "api" = có Server; "worker" = không Server + có cầu nối; "none" = không có gì. Cả hai bộ ghi đều được lắp để chứng minh đường KIA không bị chạm. */
function arrange(mode: "api" | "worker" | "none"): Env {
  const apiCalls: Recorded[] = [];
  const bridgeCalls: Recorded[] = [];
  const sockets: FakeSocket[] = [];
  const serverSideEmit = jest.fn();
  const bridge: SocketBridge = {
    broadcaster: recorder(bridgeCalls),
    serverSideEmit,
    stats: () => ({ published: 0, dropped: 0, failed: 0, timedOut: 0, noSubscribers: 0, inflight: 0 }),
    close: () => Promise.resolve(),
  };
  setSocketBridgeForTests(mode === "worker" || mode === "api" ? bridge : null);
  if (mode === "api") {
    const io = recorder(apiCalls, [], sockets);
    mockTryGetIO.mockReturnValue(io);
    mockGetIO.mockReturnValue(io);
  } else {
    mockTryGetIO.mockReturnValue(null);
    mockGetIO.mockImplementation(() => {
      throw new Error("[Socket] Socket.IO chưa được khởi tạo. Gọi initSocketServer() trước.");
    });
  }
  return { apiCalls, bridgeCalls, serverSideEmit, sockets };
}

afterEach(() => {
  setSocketBridgeForTests(null);
});

/** Cùng một bộ kịch bản chạy cho cả hai đường — kết quả (gói) PHẢI giống hệt nhau. */
describe.each([
  ["API (Server trực tiếp)", "api"],
  ["worker (cầu nối Redis emitter)", "worker"],
] as const)("emit qua %s", (_label, mode) => {
  const used = (env: Env): Recorded[] => (mode === "api" ? env.apiCalls : env.bridgeCalls);
  const other = (env: Env): Recorded[] => (mode === "api" ? env.bridgeCalls : env.apiCalls);

  it("emitToRoom: room + event + payload có `v`/`serverNow`, giữ nguyên field của nơi gọi", () => {
    const env = arrange(mode);
    emitToRoom("ch:c1", "message:created", { id: "m1", body: "hi" });

    expect(used(env)).toHaveLength(1);
    const [call] = used(env);
    expect(call?.chain).toEqual([["to", "ch:c1"]]);
    expect(call?.args[0]).toBe("message:created");
    expect(payloadOf(call)).toMatchObject({ v: 1, id: "m1", body: "hi" });
    expect(payloadOf(call).serverNow).toEqual(expect.stringMatching(ISO));
    expect(other(env)).toHaveLength(0); // đường kia KHÔNG bị chạm
    expect(env.serverSideEmit).not.toHaveBeenCalled();
  });

  it("emitToRoom có exceptUserIds → except(user:{id}…) (p1-08)", () => {
    const env = arrange(mode);
    emitToRoom("ws:w1", "presence:updated", { userId: "u9" }, ["b1", "b2"]);

    expect(used(env)[0]?.chain).toEqual([["to", "ws:w1"], ["except", ["user:b1", "user:b2"]]]);
  });

  it("emitToRoom exceptUserIds rỗng → KHÔNG gọi except", () => {
    const env = arrange(mode);
    emitToRoom("ws:w1", "presence:updated", { userId: "u9" }, []);

    expect(used(env)[0]?.chain).toEqual([["to", "ws:w1"]]);
  });

  it("emitToUsers → to([user:a, user:b]) một lượt; danh sách rỗng → không phát gì", () => {
    const env = arrange(mode);
    emitToUsers(["a", "b"], "notification:created", { id: "n1" });
    emitToUsers([], "notification:created", { id: "n2" });

    expect(used(env)).toHaveLength(1);
    expect(used(env)[0]?.chain).toEqual([["to", ["user:a", "user:b"]]]);
    expect(payloadOf(used(env)[0])).toMatchObject({ v: 1, id: "n1" });
    expect(other(env)).toHaveLength(0);
  });

  it("emitToAll → emit toàn cục (không room)", () => {
    const env = arrange(mode);
    emitToAll("config:updated", { keys: ["limits.call"] });

    expect(used(env)[0]?.chain).toEqual([]);
    expect(used(env)[0]?.args[0]).toBe("config:updated");
    expect(payloadOf(used(env)[0])).toMatchObject({ v: 1, keys: ["limits.call"] });
  });

  it("emitToScope (không recheck) → room theo ScopeType; excludeUserId → except(user:{id})", async () => {
    const env = arrange(mode);
    await emitToScope({ type: "WORKSPACE", id: "w1" }, "member:updated", { userId: "u1" });
    await emitToScope({ type: "CHANNEL", id: "c1" }, "channel:updated", { id: "c1" }, { excludeUserId: "sender" });

    expect(used(env)).toHaveLength(2);
    expect(used(env)[0]?.chain).toEqual([["to", "ws:w1"]]);
    expect(used(env)[1]?.chain).toEqual([["to", "ch:c1"], ["except", "user:sender"]]);
    expect(payloadOf(used(env)[0])).toMatchObject({ v: 1, userId: "u1" });
    expect(other(env)).toHaveLength(0);
  });

  it("leaveRooms/joinRooms → in(user:{id}…).socketsLeave/socketsJoin; danh sách rỗng → không làm gì", () => {
    const env = arrange(mode);
    leaveRooms(["a", "b"], ["ch:c1", "ch:c2"]);
    joinRooms(["a"], ["ws:w1"]);
    leaveRooms([], ["ch:c1"]);
    joinRooms(["a"], []);

    expect(used(env)).toHaveLength(2);
    expect(used(env)[0]).toEqual({ chain: [["in", ["user:a", "user:b"]]], op: "socketsLeave", args: [["ch:c1", "ch:c2"]] });
    expect(used(env)[1]).toEqual({ chain: [["in", ["user:a"]]], op: "socketsJoin", args: [["ws:w1"]] });
    expect(other(env)).toHaveLength(0);
  });

  it("disconnectUserSockets → in(user:{id}).disconnectSockets(true)", () => {
    const env = arrange(mode);
    disconnectUserSockets("u1", "credentials-changed");

    expect(used(env)).toEqual([{ chain: [["in", "user:u1"]], op: "disconnectSockets", args: [true] }]);
    expect(other(env)).toHaveLength(0);
  });
});

describe("emitToScope({ recheck })", () => {
  beforeEach(() => {
    mockCan.mockImplementation((user) => Promise.resolve((user as { id: string }).id !== "revoked"));
  });

  it("API: fetchSockets → kiểm quyền từng socket → chỉ socket còn quyền nhận; bỏ excludeUserId và socket chưa xác thực", async () => {
    const env = arrange("api");
    const ok: FakeSocket = { data: { user: { id: "ok" } }, emit: jest.fn() };
    const revoked: FakeSocket = { data: { user: { id: "revoked" } }, emit: jest.fn() };
    const sender: FakeSocket = { data: { user: { id: "sender" } }, emit: jest.fn() };
    const anonymous: FakeSocket = { data: {}, emit: jest.fn() };
    env.sockets.push(ok, revoked, sender, anonymous);

    await emitToScope({ type: "CHANNEL", id: "c1" }, "message:created", { id: "m1" }, { recheck: "channel.read", excludeUserId: "sender" });

    expect(mockCan).toHaveBeenCalledWith({ id: "ok" }, "channel.read", { type: "CHANNEL", id: "c1" });
    expect(ok.emit).toHaveBeenCalledWith("message:created", expect.objectContaining({ v: 1, id: "m1" }));
    expect(revoked.emit).not.toHaveBeenCalled();
    expect(sender.emit).not.toHaveBeenCalled();
    expect(anonymous.emit).not.toHaveBeenCalled();
    expect(env.apiCalls).toHaveLength(0); // KHÔNG emit cả room khi có recheck
    expect(env.serverSideEmit).not.toHaveBeenCalled();
  });

  it("worker: KHÔNG liệt kê socket — uỷ quyền cho mọi instance API bằng serverSideEmit, gói đã có envelope", async () => {
    const env = arrange("worker");

    await emitToScope({ type: "CHANNEL", id: "c1" }, "message:created", { id: "m1" }, { recheck: "channel.read", excludeUserId: "sender" });

    expect(env.bridgeCalls).toHaveLength(0); // không emit cả room
    expect(env.serverSideEmit).toHaveBeenCalledTimes(1);
    const [event, cmd] = env.serverSideEmit.mock.calls[0] as [string, Record<string, unknown>];
    expect(event).toBe(BRIDGE_RECHECK_EVENT);
    expect(cmd).toMatchObject({
      room: "ch:c1",
      event: "message:created",
      scope: { type: "CHANNEL", id: "c1" },
      recheck: "channel.read",
      excludeUserId: "sender",
      payload: { v: 1, id: "m1" },
    });
    expect((cmd.payload as Record<string, unknown>).serverNow).toEqual(expect.stringMatching(ISO));
    expect(mockCan).not.toHaveBeenCalled(); // việc kiểm quyền thuộc về instance API
  });
});

describe("không có đường phát nào (script/test/API trước initSocketServer)", () => {
  it("giữ NGUYÊN hành vi cũ: emit* ném lỗi `getIO()`; emitToScope reject; disconnectUserSockets nuốt lỗi", async () => {
    arrange("none");
    const notInit = /Socket\.IO chưa được khởi tạo/;

    expect(() => emitToRoom("ch:c1", "e", {})).toThrow(notInit);
    expect(() => emitToUsers(["a"], "e", {})).toThrow(notInit);
    expect(() => emitToAll("e", {})).toThrow(notInit);
    expect(() => leaveRooms(["a"], ["ch:c1"])).toThrow(notInit);
    expect(() => joinRooms(["a"], ["ch:c1"])).toThrow(notInit);
    await expect(emitToScope({ type: "CHANNEL", id: "c1" }, "e", {})).rejects.toThrow(notInit);
    expect(() => disconnectUserSockets("u1", "test")).not.toThrow();
  });

  it("scope type lạ → bỏ qua có log, không ném (như trước)", async () => {
    arrange("worker");
    await expect(emitToScope({ type: "NOPE" as never, id: "x" }, "e", {})).resolves.toBeUndefined();
  });
});

describe("stampPayload", () => {
  it("thêm v/serverNow nếu thiếu; payload tự đặt v/serverNow thì giữ nguyên", () => {
    const stamped = stampPayload({ a: 1 });
    expect(stamped).toMatchObject({ v: 1, a: 1 });
    expect(stamped.serverNow).toMatch(ISO);
    expect(stampPayload({ v: 2, serverNow: "x" })).toEqual({ v: 2, serverNow: "x" });
  });
});
