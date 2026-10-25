import { installMocks, redisStore } from "./calls-test-mocks";
import { clientCallId, deviceId, drainOutbox, ensureCallIndexes, installHarness, makeApi, type CallsHarness } from "./calls-test-kit";
import { buildVoiceApp, CAM, cleanupVoiceWorld, connect, grantOf, installPermissionPorts, MIC, resetPermissionSpy, roomOf, seedChannel, seedVoiceWorld, type VoiceWorld } from "./voice-test-kit";
import { prisma } from "../../../../infrastructure/database";
import { CallChannelVideoService } from "../../services/call-channel-video.service";

const app = buildVoiceApp();
const api = makeApi(app);

/** p2-03 be.md §5.9: kênh VOICE tắt video (`channel.updated` allowVideo=false) → phòng đang chạy bị thu quyền camera + `VIDEO_DISABLED`. */
describe("p2-03 — kênh tắt video khi phòng đang chạy (integration, Mongo memory replset)", () => {
  const worlds: VoiceWorld[] = [];
  let h: CallsHarness;
  let w: VoiceWorld;
  let ch: string;
  let callId: string;

  beforeAll(async () => {
    await ensureCallIndexes();
  });

  beforeEach(async () => {
    installMocks();
    h = installHarness();
    installPermissionPorts();
    w = await seedVoiceWorld();
    worlds.push(w);
    ch = await seedChannel(w);
    const first = await api("post", "/calls", w.u.A!, { scopeType: "CHANNEL", scopeId: ch, mediaKind: "AUDIO", clientCallId: clientCallId(), deviceId: deviceId() });
    callId = first.body.data.call.id as string;
    await connect(h, callId, w.u.A!, [MIC, CAM]);
    await api("post", "/calls", w.u.B!, { scopeType: "CHANNEL", scopeId: ch, mediaKind: "AUDIO", clientCallId: clientCallId(), deviceId: deviceId() });
    await connect(h, callId, w.u.B!, [MIC, CAM]);
  });

  afterEach(async () => {
    resetPermissionSpy();
    await cleanupVoiceWorld(worlds.splice(0));
    redisStore.clear();
  });

  const service = () => new CallChannelVideoService(h.container.deps);
  const part = (userId: string) => prisma.callParticipant.findUnique({ where: { callId_userId: { callId, userId } } });
  const hostActions = () => h.emitted.filter((e) => e.event === "call:host-action" && (e.payload as { type?: string }).type === "VIDEO_DISABLED");

  it("thu quyền camera của MỌI người trong phòng: DB + LiveKit (bỏ CAMERA, giữ MICROPHONE) + tắt track camera + call:host-action VIDEO_DISABLED", async () => {
    const before = (await prisma.call.findUnique({ where: { id: callId } }))!.version;
    h.media.calls.length = 0;

    const result = await service().disableVideo(ch);
    expect(result).toEqual({ callId, changed: 2 });

    for (const id of [w.u.A!, w.u.B!]) expect((await part(id))!.publishPermissions.video).toBe(false);
    expect((await prisma.call.findUnique({ where: { id: callId } }))!.version).toBe(before + 1);

    const perms = h.media.callsOf("updateParticipant").map((c) => ({ id: c.args[1], permission: (c.args[2] as { permission: { canPublishSources: string[] } }).permission }));
    expect(perms.map((p) => p.id).sort()).toEqual([w.u.A, w.u.B].sort());
    for (const p of perms) expect(p.permission.canPublishSources).toEqual(["MICROPHONE"]);
    // Track camera đang phát của cả hai bị tắt (mic không đụng tới).
    expect(h.media.callsOf("mutePublishedTrack").map((c) => c.args).sort()).toEqual(
      [
        [roomOf(callId), w.u.A, "TR_cam", true],
        [roomOf(callId), w.u.B, "TR_cam", true],
      ].sort()
    );

    await drainOutbox(h);
    const actions = hostActions();
    expect(actions.map((e) => e.target)).toContain("room");
    expect(actions[0]!.payload).toMatchObject({ callId, type: "VIDEO_DISABLED", targetUserId: null, byUserId: null });
  });

  it("token cấp SAU đó không có camera (DB là nguồn sự thật)", async () => {
    await service().disableVideo(ch);
    const renewed = await api("post", `/calls/${callId}/token`, w.u.B!);
    expect(renewed.status).toBe(200);
    expect(grantOf(renewed.body.data.token as string).canPublishSources).toEqual(["microphone"]);
  });

  it("idempotent: chạy lại (job retry) KHÔNG tăng version thừa/không phát lại host-action, nhưng vẫn đồng bộ lại LiveKit", async () => {
    await service().disableVideo(ch);
    const versionAfterFirst = (await prisma.call.findUnique({ where: { id: callId } }))!.version;
    await drainOutbox(h);
    const firstCount = hostActions().length;
    h.media.calls.length = 0;

    const again = await service().disableVideo(ch);
    expect(again).toEqual({ callId, changed: 0 });
    expect((await prisma.call.findUnique({ where: { id: callId } }))!.version).toBe(versionAfterFirst);
    await drainOutbox(h);
    expect(hostActions()).toHaveLength(firstCount);
    // LiveKit best-effort được vá lại ở lần chạy lại (quyền thay thế nguyên khối; track đã muted thì không mute lại).
    expect(h.media.callsOf("updateParticipant").length).toBe(2);
  });

  it("kênh không có phòng đang chạy → không làm gì (null)", async () => {
    const other = await seedChannel(w);
    await expect(service().disableVideo(other)).resolves.toBeNull();
  });
});
