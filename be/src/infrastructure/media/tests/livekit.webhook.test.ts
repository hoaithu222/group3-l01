import { setLiveKitEnv, signWebhook, webhookBody, TEST_LIVEKIT } from "./livekit-test-utils";

setLiveKitEnv();

import { fromStoredRow, toStoredPayload, verifyLiveKitWebhook, isKnownLiveKitEventType } from "../livekit.webhook";

const bodyOf = (i: Parameters<typeof webhookBody>[0] = {}) => webhookBody({ room: "call_abc123", identity: "u1", ...i });

describe("verifyLiveKitWebhook (MED-04)", () => {
  it("chữ ký đúng → sự kiện chuẩn hoá (id, type, room, participant)", async () => {
    const body = bodyOf({ id: "EV_1", event: "participant_joined" });
    const event = await verifyLiveKitWebhook(Buffer.from(body), await signWebhook(body));
    expect(event).toMatchObject({
      id: "EV_1",
      type: "participant_joined",
      roomName: "call_abc123",
      room: { sid: "RM_abc", numParticipants: 1 },
      participant: { identity: "u1", sid: "PA_abc", state: "ACTIVE" },
      track: null,
      egress: null,
    });
    expect(event.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("nhận cả body dạng string và tiền tố 'Bearer '", async () => {
    const body = bodyOf();
    await expect(verifyLiveKitWebhook(body, `Bearer ${await signWebhook(body)}`)).resolves.toMatchObject({ id: "EV_test0001" });
  });

  it("thiếu header Authorization → MEDIA_002 (401)", async () => {
    await expect(verifyLiveKitWebhook(Buffer.from(bodyOf()), undefined)).rejects.toMatchObject({ errorCode: "MEDIA_002", statusCode: 401 });
    await expect(verifyLiveKitWebhook(Buffer.from(bodyOf()), "")).rejects.toMatchObject({ errorCode: "MEDIA_002" });
  });

  it("body bị sửa 1 byte sau khi ký → MEDIA_002", async () => {
    const body = bodyOf({ id: "EV_2" });
    const auth = await signWebhook(body);
    const tampered = body.replace("EV_2", "EV_3");
    expect(tampered).not.toBe(body);
    await expect(verifyLiveKitWebhook(Buffer.from(tampered), auth)).rejects.toMatchObject({ errorCode: "MEDIA_002" });
  });

  it("ký bằng secret/key khác → MEDIA_002", async () => {
    const body = bodyOf();
    await expect(verifyLiveKitWebhook(Buffer.from(body), await signWebhook(body, { secret: "other-secret-other-secret-1234567" }))).rejects.toMatchObject({
      errorCode: "MEDIA_002",
    });
    await expect(verifyLiveKitWebhook(Buffer.from(body), await signWebhook(body, { key: "OtherKey" }))).rejects.toMatchObject({
      errorCode: "MEDIA_002",
    });
  });

  it("JWT rác hoặc bị sửa phần chữ ký → MEDIA_002", async () => {
    const body = bodyOf();
    await expect(verifyLiveKitWebhook(Buffer.from(body), "not.a.jwt")).rejects.toMatchObject({ errorCode: "MEDIA_002" });
    const good = await signWebhook(body);
    const forged = `${good.slice(0, -4)}${good.endsWith("AAAA") ? "BBBB" : "AAAA"}`;
    await expect(verifyLiveKitWebhook(Buffer.from(body), forged)).rejects.toMatchObject({ errorCode: "MEDIA_002" });
  });

  it("JWT hết hạn → MEDIA_002 (chống phát lại chữ ký cũ)", async () => {
    const body = bodyOf();
    const auth = await signWebhook(body, { ttl: "5m" });
    jest.useFakeTimers({
      now: Date.now() + 30 * 60_000,
      doNotFake: ["nextTick", "setImmediate", "setTimeout", "setInterval", "clearTimeout", "clearInterval", "clearImmediate", "queueMicrotask", "hrtime", "performance"],
    });
    try {
      await expect(verifyLiveKitWebhook(Buffer.from(body), auth)).rejects.toMatchObject({ errorCode: "MEDIA_002" });
    } finally {
      jest.useRealTimers();
    }
  });

  it("chữ ký hợp lệ nhưng body không phải JSON → MEDIA_002 (không ném lỗi thô)", async () => {
    const body = "không phải json";
    await expect(verifyLiveKitWebhook(Buffer.from(body), await signWebhook(body))).rejects.toMatchObject({ errorCode: "MEDIA_002" });
  });

  it("thiếu event.id (không dedupe được) → MEDIA_002", async () => {
    const body = JSON.stringify({ event: "room_started", room: { name: "call_x" } });
    await expect(verifyLiveKitWebhook(Buffer.from(body), await signWebhook(body))).rejects.toMatchObject({ errorCode: "MEDIA_002" });
  });

  it("egress_ended: chuẩn hoá trạng thái, tệp, thời gian (nano → ISO), roomName lấy từ egressInfo", async () => {
    const body = webhookBody({
      id: "EV_eg",
      event: "egress_ended",
      egress: {
        egressId: "EG_1",
        roomName: "meet_abcdefghij",
        status: "EGRESS_COMPLETE",
        startedAt: "1694028133776334000",
        endedAt: "1694028193776334000",
        fileResults: [{ filename: "recordings/a.mp4", location: "https://s3/b/recordings/a.mp4", size: "1048576", duration: "60000000000" }],
      },
    });
    const event = await verifyLiveKitWebhook(Buffer.from(body), await signWebhook(body));
    expect(event.roomName).toBe("meet_abcdefghij");
    expect(event.egress).toEqual({
      egressId: "EG_1",
      roomName: "meet_abcdefghij",
      status: "COMPLETE",
      startedAt: new Date(1_694_028_133_776).toISOString(),
      endedAt: new Date(1_694_028_193_776).toISOString(),
      error: null,
      files: [{ filename: "recordings/a.mp4", location: "https://s3/b/recordings/a.mp4", sizeBytes: 1_048_576, durationSeconds: 60 }],
    });
  });

  it("egress_ended lỗi: status FAILED + error", async () => {
    const body = webhookBody({ event: "egress_ended", egress: { egressId: "EG_2", roomName: "meet_x", status: "EGRESS_FAILED", error: "boom" } });
    const event = await verifyLiveKitWebhook(Buffer.from(body), await signWebhook(body));
    expect(event.egress).toMatchObject({ status: "FAILED", error: "boom", files: [] });
  });

  it("KHÔNG mang tên hiển thị/metadata của participant vào sự kiện chuẩn hoá (riêng tư)", async () => {
    const body = JSON.stringify({
      event: "participant_joined",
      id: "EV_pii",
      room: { name: "call_x", sid: "RM_1" },
      participant: { sid: "PA_1", identity: "u9", name: "Tên Rất Riêng Tư", metadata: '{"secret":"do-not-store"}', state: "ACTIVE" },
    });
    const event = await verifyLiveKitWebhook(Buffer.from(body), await signWebhook(body));
    expect(JSON.stringify(event)).not.toContain("Riêng Tư");
    expect(JSON.stringify(event)).not.toContain("do-not-store");
    expect(event.participant?.identity).toBe("u9");
  });

  it("track_published: nguồn track UPPER_SNAKE", async () => {
    const body = webhookBody({ event: "track_published", room: "call_x", identity: "u1", track: { sid: "TR_1", type: "VIDEO", source: "SCREEN_SHARE", muted: false } });
    const event = await verifyLiveKitWebhook(Buffer.from(body), await signWebhook(body));
    expect(event.track).toEqual({ sid: "TR_1", kind: "VIDEO", source: "SCREEN_SHARE", muted: false });
  });
});

describe("payload lưu/dựng lại", () => {
  it("toStoredPayload → fromStoredRow round-trip; payload thiếu/hỏng → trường null", async () => {
    const body = bodyOf({ id: "EV_rt" });
    const event = await verifyLiveKitWebhook(Buffer.from(body), await signWebhook(body));
    const stored = toStoredPayload(event);
    expect(stored.v).toBe(1);
    expect(fromStoredRow({ eventId: event.id, type: event.type, roomName: event.roomName, payload: JSON.parse(JSON.stringify(stored)) as unknown })).toEqual(event);
    expect(fromStoredRow({ eventId: "E", type: "room_started", roomName: null, payload: null })).toEqual({
      id: "E", type: "room_started", roomName: null, createdAt: null, room: null, participant: null, track: null, egress: null,
    });
  });

  it("isKnownLiveKitEventType", () => {
    expect(isKnownLiveKitEventType("egress_ended")).toBe(true);
    expect(isKnownLiveKitEventType("ingress_started")).toBe(false);
  });
});

describe("verifyLiveKitWebhook khi chưa cấu hình", () => {
  it("thiếu khoá → MEDIA_001 (503), không kiểm chữ ký", async () => {
    let verify!: typeof verifyLiveKitWebhook;
    jest.isolateModules(() => {
      setLiveKitEnv({ LIVEKIT_API_SECRET: undefined });
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      verify = (require("../livekit.webhook") as typeof import("../livekit.webhook")).verifyLiveKitWebhook;
    });
    try {
      await expect(verify(Buffer.from("{}"), "x")).rejects.toMatchObject({ errorCode: "MEDIA_001", statusCode: 503 });
    } finally {
      setLiveKitEnv();
    }
    expect(TEST_LIVEKIT.apiKey).toBeTruthy();
  });
});
