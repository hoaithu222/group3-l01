import { setLiveKitEnv, TEST_LIVEKIT } from "./livekit-test-utils";

setLiveKitEnv({
  EGRESS_S3_BUCKET: "rec-bucket",
  EGRESS_S3_REGION: "ap-southeast-1",
  EGRESS_S3_ACCESS_KEY_ID: "AKIATEST",
  EGRESS_S3_SECRET_ACCESS_KEY: "s3-secret-test",
  EGRESS_S3_PREFIX: "recordings",
});

import { EgressClient, EgressInfo, ParticipantInfo, RoomServiceClient, Room, TrackSource } from "livekit-server-sdk";
import { logger } from "../../logger";
import { livekitApiErrorsTotal } from "../../metrics";
import { LIVEKIT_FAILURE_LOG_INTERVAL_MS, LIVEKIT_REQUEST_TIMEOUT_SECONDS, LiveKitMediaServer } from "../livekit.client";
import { getEgressS3Config } from "../livekit.config";

const mockRoomApi = {
  createRoom: jest.fn(),
  listRooms: jest.fn(),
  deleteRoom: jest.fn(),
  listParticipants: jest.fn(),
  removeParticipant: jest.fn(),
  mutePublishedTrack: jest.fn(),
  updateParticipant: jest.fn(),
};
const mockEgressApi = { startRoomCompositeEgress: jest.fn(), stopEgress: jest.fn(), listEgress: jest.fn() };

jest.mock("livekit-server-sdk", () => {
  const actual = jest.requireActual<typeof import("livekit-server-sdk")>("livekit-server-sdk");
  return { ...actual, RoomServiceClient: jest.fn(), EgressClient: jest.fn() };
});

/** Lỗi như `ServerError` của SDK (Twirp): có `status`/`code`. */
const twirp = (status: number, code: string) => Object.assign(new Error(code), { status, code });
const notFound = () => twirp(404, "not_found");

let server: LiveKitMediaServer;
beforeEach(() => {
  (RoomServiceClient as unknown as jest.Mock).mockImplementation(() => mockRoomApi);
  (EgressClient as unknown as jest.Mock).mockImplementation(() => mockEgressApi);
  server = new LiveKitMediaServer({ url: TEST_LIVEKIT.url, apiKey: TEST_LIVEKIT.apiKey, apiSecret: TEST_LIVEKIT.apiSecret }, getEgressS3Config);
});

describe("LiveKitMediaServer", () => {
  it("khởi tạo client với hạn 5 s (SDK mặc định treo rất lâu)", () => {
    expect(RoomServiceClient).toHaveBeenCalledWith(TEST_LIVEKIT.url, TEST_LIVEKIT.apiKey, TEST_LIVEKIT.apiSecret, { requestTimeout: LIVEKIT_REQUEST_TIMEOUT_SECONDS });
    expect(LIVEKIT_REQUEST_TIMEOUT_SECONDS).toBe(5);
    expect(server.kind).toBe("livekit");
    expect(server.isConfigured()).toBe(true);
  });

  it("createRoom truyền đúng tham số, trả MediaRoom (không lộ kiểu protobuf)", async () => {
    mockRoomApi.createRoom.mockResolvedValue(Room.fromJson({ sid: "RM_1", name: "call_x", emptyTimeout: 60, maxParticipants: 16, numParticipants: 0, creationTime: "1789000000" }));
    const room = await server.createRoom({ name: "call_x", emptyTimeoutSeconds: 60, maxParticipants: 16, metadata: "m" });
    expect(mockRoomApi.createRoom).toHaveBeenCalledWith({ name: "call_x", emptyTimeout: 60, departureTimeout: undefined, maxParticipants: 16, metadata: "m" });
    expect(room).toMatchObject({ name: "call_x", sid: "RM_1", maxParticipants: 16, emptyTimeoutSeconds: 60 });
    expect(room.createdAt).toBe(new Date(1_789_000_000 * 1000).toISOString());
  });

  it("listParticipants ánh xạ ParticipantInfo → MediaParticipant", async () => {
    mockRoomApi.listParticipants.mockResolvedValue([
      ParticipantInfo.fromJson({
        sid: "PA_1", identity: "u1", name: "A", state: "ACTIVE", metadata: '{"v":1}', joinedAt: "1789000000",
        attributes: { handRaisedAt: "x" },
        tracks: [{ sid: "TR_1", type: "AUDIO", source: "MICROPHONE", muted: true }],
        permission: { canPublish: true, canSubscribe: true, canPublishData: true, canPublishSources: ["CAMERA", "MICROPHONE"], canUpdateMetadata: true },
      }),
    ]);
    const [p] = await server.listParticipants("call_x");
    expect(p).toEqual({
      identity: "u1", sid: "PA_1", name: "A", state: "ACTIVE", metadata: '{"v":1}',
      attributes: { handRaisedAt: "x" },
      joinedAt: new Date(1_789_000_000 * 1000).toISOString(),
      tracks: [{ sid: "TR_1", source: "MICROPHONE", kind: "AUDIO", muted: true }],
      permission: { canPublish: true, canSubscribe: true, canPublishData: true, canPublishSources: ["CAMERA", "MICROPHONE"], canUpdateMetadata: true },
    });
  });

  it("quy ước idempotent: phòng/participant không tồn tại → listParticipants [], deleteRoom/removeParticipant/stopEgress thành công", async () => {
    mockRoomApi.listParticipants.mockRejectedValue(notFound());
    mockRoomApi.deleteRoom.mockRejectedValue(notFound());
    mockRoomApi.removeParticipant.mockRejectedValue(notFound());
    mockEgressApi.stopEgress.mockRejectedValue(notFound());
    await expect(server.listParticipants("call_x")).resolves.toEqual([]);
    await expect(server.deleteRoom("call_x")).resolves.toBeUndefined();
    await expect(server.removeParticipant("call_x", "u1")).resolves.toBeUndefined();
    await expect(server.stopEgress("EG_1")).resolves.toBeUndefined();
  });

  it("mutePublishedTrack / updateParticipant với phòng không tồn tại → MEDIA_004 (409)", async () => {
    mockRoomApi.mutePublishedTrack.mockRejectedValue(notFound());
    mockRoomApi.updateParticipant.mockRejectedValue(notFound());
    await expect(server.mutePublishedTrack("call_x", "u1", "TR_1", true)).rejects.toMatchObject({ errorCode: "MEDIA_004", statusCode: 409 });
    await expect(server.updateParticipant("call_x", "u1", { attributes: { a: "b" } })).rejects.toMatchObject({ errorCode: "MEDIA_004" });
  });

  it("lỗi mạng / quá hạn / 5xx → MEDIA_003 (502) và đếm livekit_api_errors_total{op}", async () => {
    const before = await livekitApiErrorsTotal.get();
    const count = (values: typeof before.values, op: string) => values.find((v) => v.labels.op === op)?.value ?? 0;
    mockRoomApi.listRooms.mockRejectedValue(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }));
    mockRoomApi.deleteRoom.mockRejectedValue(twirp(503, "unavailable"));
    await expect(server.listRooms()).rejects.toMatchObject({ errorCode: "MEDIA_003", statusCode: 502, details: { op: "listRooms" } });
    await expect(server.deleteRoom("call_x")).rejects.toMatchObject({ errorCode: "MEDIA_003" });
    const after = await livekitApiErrorsTotal.get();
    expect(count(after.values, "listRooms")).toBe(count(before.values, "listRooms") + 1);
    expect(count(after.values, "deleteRoom")).toBe(count(before.values, "deleteRoom") + 1);
  });

  it("LiveKit tắt: lỗi lặp cùng op chỉ ghi cảnh báo 1 lần / 5 phút (kèm suppressed), metric vẫn đếm đủ; hồi phục thì lỗi sau ghi lại ngay", async () => {
    const warn = jest.spyOn(logger, "warn").mockImplementation(() => logger);
    const logged = () => (warn.mock.calls as unknown[][]).filter(([message]) => message === "[livekit] Lỗi gọi API máy chủ media");
    const t0 = Date.now() + 10 * 60_000;
    const now = jest.spyOn(Date, "now");
    const at = (ms: number) => now.mockReturnValue(t0 + ms);
    const fail = () => mockRoomApi.listRooms.mockRejectedValue(new Error("fetch failed"));
    const before = (await livekitApiErrorsTotal.get()).values.find((v) => v.labels.op === "listRooms")?.value ?? 0;

    fail();
    at(0);
    await expect(server.listRooms()).rejects.toMatchObject({ errorCode: "MEDIA_003" });
    at(30_000);
    await expect(server.listRooms()).rejects.toMatchObject({ errorCode: "MEDIA_003" });
    at(60_000);
    await expect(server.listRooms()).rejects.toMatchObject({ errorCode: "MEDIA_003" });
    expect(logged()).toHaveLength(1);
    expect(logged()[0]?.[1]).not.toHaveProperty("suppressed");

    at(LIVEKIT_FAILURE_LOG_INTERVAL_MS);
    await expect(server.listRooms()).rejects.toMatchObject({ errorCode: "MEDIA_003" });
    expect(logged()).toHaveLength(2);
    expect(logged()[1]?.[1]).toMatchObject({ op: "listRooms", suppressed: 2 });

    // Mọi lần lỗi đều đếm metric dù log bị nén.
    const after = (await livekitApiErrorsTotal.get()).values.find((v) => v.labels.op === "listRooms")?.value ?? 0;
    expect(after).toBe(before + 4);

    // Hồi phục → lần lỗi kế tiếp (dù còn trong cửa sổ) được ghi ngay và không mang số nén cũ.
    mockRoomApi.listRooms.mockResolvedValue([]);
    await server.listRooms();
    fail();
    at(LIVEKIT_FAILURE_LOG_INTERVAL_MS + 1_000);
    await expect(server.listRooms()).rejects.toMatchObject({ errorCode: "MEDIA_003" });
    expect(logged()).toHaveLength(3);
    expect(logged()[2]?.[1]).not.toHaveProperty("suppressed");
  });

  it("updateParticipant: quyền thay thế nguyên khối, canPublishSources → TrackSource, canUpdateMetadata mặc định true", async () => {
    mockRoomApi.updateParticipant.mockResolvedValue(ParticipantInfo.fromJson({}));
    await server.updateParticipant("call_x", "u1", {
      permission: { canPublish: true, canSubscribe: true, canPublishData: false, canPublishSources: ["CAMERA", "SCREEN_SHARE"] },
      attributes: { handRaisedAt: "" },
    });
    expect(mockRoomApi.updateParticipant).toHaveBeenCalledWith("call_x", "u1", {
      metadata: undefined,
      name: undefined,
      attributes: { handRaisedAt: "" },
      permission: {
        canPublish: true, canSubscribe: true, canPublishData: false, canUpdateMetadata: true,
        canPublishSources: [TrackSource.CAMERA, TrackSource.SCREEN_SHARE],
      },
    });
  });

  it("startRoomCompositeEgress: mặc định S3 từ env, MP4, tự thêm EGRESS_S3_PREFIX", async () => {
    mockEgressApi.startRoomCompositeEgress.mockResolvedValue(EgressInfo.fromJson({ egressId: "EG_1", roomName: "meet_x", status: "EGRESS_STARTING" }));
    const egress = await server.startRoomCompositeEgress("meet_x", { fileOutput: { filepath: "meet_x/2026-09-21.mp4" }, layout: "grid", preset: "H264_720P_30" });
    expect(egress).toMatchObject({ egressId: "EG_1", roomName: "meet_x", status: "STARTING" });
    const [room, file, opts] = mockEgressApi.startRoomCompositeEgress.mock.calls[0] as [string, { filepath: string; fileType: number; output: { case: string; value: Record<string, string> } }, Record<string, unknown>];
    expect(room).toBe("meet_x");
    expect(file.filepath).toBe("recordings/meet_x/2026-09-21.mp4");
    expect(file.output.case).toBe("s3");
    expect(file.output.value).toMatchObject({ bucket: "rec-bucket", region: "ap-southeast-1", accessKey: "AKIATEST", secret: "s3-secret-test" });
    expect(opts).toMatchObject({ layout: "grid", encodingOptions: 0 });
  });

  it("filepath đã có tiền tố thì không thêm lần nữa; đích S3 truyền tường minh giữ nguyên filepath", async () => {
    mockEgressApi.startRoomCompositeEgress.mockResolvedValue(EgressInfo.fromJson({ egressId: "EG_2" }));
    await server.startRoomCompositeEgress("meet_x", { fileOutput: { filepath: "recordings/a.mp4" } });
    await server.startRoomCompositeEgress("meet_x", { fileOutput: { filepath: "custom/a.mp4", s3: { bucket: "b2", region: "r2", accessKey: "k2", secret: "s2" } } });
    const calls = mockEgressApi.startRoomCompositeEgress.mock.calls as Array<[string, { filepath: string; output: { value: { bucket: string } } }]>;
    expect(calls[0]?.[1].filepath).toBe("recordings/a.mp4");
    expect(calls[1]?.[1].filepath).toBe("custom/a.mp4");
    expect(calls[1]?.[1].output.value.bucket).toBe("b2");
  });

  it("thiếu cấu hình S3 → MEDIA_001 (ghi hình tắt), không gọi LiveKit", async () => {
    const noS3 = new LiveKitMediaServer({ url: TEST_LIVEKIT.url, apiKey: TEST_LIVEKIT.apiKey, apiSecret: TEST_LIVEKIT.apiSecret }, () => null);
    await expect(noS3.startRoomCompositeEgress("meet_x", { fileOutput: { filepath: "a.mp4" } })).rejects.toMatchObject({
      errorCode: "MEDIA_001",
      details: { reason: "egress-s3" },
    });
    expect(mockEgressApi.startRoomCompositeEgress).not.toHaveBeenCalled();
  });

  it("listEgress ánh xạ EgressInfo (nano → ISO, tệp, lỗi)", async () => {
    mockEgressApi.listEgress.mockResolvedValue([
      EgressInfo.fromJson({
        egressId: "EG_9", roomName: "meet_x", status: "EGRESS_FAILED", error: "no space",
        startedAt: "1694028133776334000", endedAt: "1694028193776334000",
        fileResults: [{ filename: "a.mp4", location: "s3://x/a.mp4", size: "10", duration: "2000000000" }],
      }),
    ]);
    const [egress] = await server.listEgress({ roomName: "meet_x", active: false });
    expect(mockEgressApi.listEgress).toHaveBeenCalledWith({ roomName: "meet_x", active: false });
    expect(egress).toEqual({
      egressId: "EG_9", roomName: "meet_x", status: "FAILED", error: "no space",
      startedAt: new Date(1_694_028_133_776).toISOString(), endedAt: new Date(1_694_028_193_776).toISOString(),
      files: [{ filename: "a.mp4", location: "s3://x/a.mp4", sizeBytes: 10, durationSeconds: 2 }],
    });
  });

  it("ping: client riêng hạn theo tham số, không failover; trả độ trễ + số phòng", async () => {
    mockRoomApi.listRooms.mockResolvedValue([Room.fromJson({ name: "a" }), Room.fromJson({ name: "b" })]);
    const result = await server.ping(1500);
    expect(result.rooms).toBe(2);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(RoomServiceClient).toHaveBeenLastCalledWith(TEST_LIVEKIT.url, TEST_LIVEKIT.apiKey, TEST_LIVEKIT.apiSecret, { requestTimeout: 1.5, failover: false });
    mockRoomApi.listRooms.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(server.ping()).rejects.toMatchObject({ errorCode: "MEDIA_003" });
  });
});
