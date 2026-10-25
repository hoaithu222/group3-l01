import { setLiveKitEnv } from "./livekit-test-utils";

setLiveKitEnv();

import { InMemoryMediaServer } from "../in-memory-media-server";
import { getLiveKit, setMediaServerForTests } from "../livekit.client";
import { NoopMediaServer } from "../noop-media-server";

describe("NoopMediaServer (LiveKit chưa cấu hình)", () => {
  it("mọi thao tác → MEDIA_001 (503); isConfigured=false", async () => {
    const s = new NoopMediaServer();
    expect(s.isConfigured()).toBe(false);
    expect(s.kind).toBe("noop");
    const ops = [
      () => s.createRoom(), () => s.listRooms(), () => s.deleteRoom(), () => s.listParticipants(), () => s.removeParticipant(),
      () => s.mutePublishedTrack(), () => s.updateParticipant(), () => s.startRoomCompositeEgress(), () => s.stopEgress(),
      () => s.listEgress(), () => s.ping(),
    ];
    for (const op of ops) await expect(op()).rejects.toMatchObject({ errorCode: "MEDIA_001", statusCode: 503 });
  });
});

describe("getLiveKit / setMediaServerForTests", () => {
  afterEach(() => setMediaServerForTests(null));

  it("cấu hình đủ → adapter livekit thật (lazy singleton, cùng instance)", () => {
    setMediaServerForTests(null);
    const a = getLiveKit();
    expect(a.kind).toBe("livekit");
    expect(a.isConfigured()).toBe(true);
    expect(getLiveKit()).toBe(a);
  });

  it("test có thể ép adapter giả", () => {
    const fake = new InMemoryMediaServer();
    setMediaServerForTests(fake);
    expect(getLiveKit()).toBe(fake);
  });

  it("thiếu cấu hình → NoopMediaServer", () => {
    let get!: typeof getLiveKit;
    jest.isolateModules(() => {
      setLiveKitEnv({ LIVEKIT_URL: undefined });
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      get = (require("../livekit.client") as typeof import("../livekit.client")).getLiveKit;
    });
    try {
      expect(get().kind).toBe("noop");
    } finally {
      setLiveKitEnv();
    }
  });
});

describe("InMemoryMediaServer (adapter giả cho p2-*)", () => {
  const room = "call_abc";
  let server: InMemoryMediaServer;
  beforeEach(() => {
    server = new InMemoryMediaServer();
  });

  it("createRoom idempotent + ghi nhận lời gọi", async () => {
    const a = await server.createRoom({ name: room, emptyTimeoutSeconds: 60, maxParticipants: 16 });
    const b = await server.createRoom({ name: room });
    expect(b.sid).toBe(a.sid);
    expect(b).toMatchObject({ maxParticipants: 16, emptyTimeoutSeconds: 60 });
    expect(server.callsOf("createRoom")).toHaveLength(2);
  });

  it("listParticipants phòng lạ → []; deleteRoom/removeParticipant phòng lạ không lỗi", async () => {
    await expect(server.listParticipants("call_none")).resolves.toEqual([]);
    await expect(server.deleteRoom("call_none")).resolves.toBeUndefined();
    await expect(server.removeParticipant("call_none", "u1")).resolves.toBeUndefined();
  });

  it("join/leave mô phỏng client; listParticipants là nguồn sự thật", async () => {
    server.join(room, { identity: "u1" });
    server.join(room, { identity: "u2" });
    expect((await server.listParticipants(room)).map((p) => p.identity).sort()).toEqual(["u1", "u2"]);
    expect((await server.listRooms())[0]?.numParticipants).toBe(2);
    await server.removeParticipant(room, "u1");
    expect((await server.listParticipants(room)).map((p) => p.identity)).toEqual(["u2"]);
  });

  it("mutePublishedTrack / updateParticipant: đổi trạng thái; phòng/participant lạ → MEDIA_004", async () => {
    server.join(room, { identity: "u1", tracks: [{ sid: "TR_1", source: "MICROPHONE", kind: "AUDIO", muted: false }] });
    await server.mutePublishedTrack(room, "u1", "TR_1", true);
    await server.updateParticipant(room, "u1", {
      permission: { canPublish: true, canSubscribe: true, canPublishData: true, canPublishSources: ["CAMERA"] },
      attributes: { handRaisedAt: "2026-09-21T00:00:00Z" },
      metadata: '{"v":1,"role":"CO_HOST"}',
    });
    const [p] = await server.listParticipants(room);
    expect(p?.tracks[0]?.muted).toBe(true);
    expect(p?.permission).toMatchObject({ canPublishSources: ["CAMERA"], canUpdateMetadata: true });
    expect(p?.attributes).toEqual({ handRaisedAt: "2026-09-21T00:00:00Z" });
    expect(p?.metadata).toContain("CO_HOST");
    await expect(server.updateParticipant(room, "ghost", {})).rejects.toMatchObject({ errorCode: "MEDIA_004", statusCode: 409 });
    await expect(server.mutePublishedTrack("call_none", "u1", "TR_1", true)).rejects.toMatchObject({ errorCode: "MEDIA_004" });
  });

  it("egress: start (cần phòng) → list active → stop", async () => {
    await expect(server.startRoomCompositeEgress("call_none", { fileOutput: { filepath: "a.mp4" } })).rejects.toMatchObject({ errorCode: "MEDIA_004" });
    server.join(room, { identity: "u1" });
    const egress = await server.startRoomCompositeEgress(room, { fileOutput: { filepath: "recordings/a.mp4" } });
    expect(egress).toMatchObject({ roomName: room, status: "ACTIVE" });
    expect(await server.listEgress({ active: true })).toHaveLength(1);
    await server.stopEgress(egress.egressId);
    await server.stopEgress("EG_missing");
    expect((await server.listEgress({ egressId: egress.egressId }))[0]?.status).toBe("ENDING");
  });

  it("failNext mô phỏng LiveKit sập đúng 1 lần (MEDIA_003 mặc định)", async () => {
    server.failNext("listParticipants");
    await expect(server.listParticipants(room)).rejects.toMatchObject({ errorCode: "MEDIA_003", statusCode: 502 });
    await expect(server.listParticipants(room)).resolves.toEqual([]);
    const custom = new Error("boom");
    server.failNext("deleteRoom", custom);
    await expect(server.deleteRoom(room)).rejects.toBe(custom);
  });

  it("ping trả số phòng", async () => {
    server.join(room, { identity: "u1" });
    await expect(server.ping()).resolves.toEqual({ latencyMs: 0, rooms: 1 });
  });
});
