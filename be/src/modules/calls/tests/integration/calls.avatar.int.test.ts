import { installMocks, redisStore } from "./calls-test-mocks";
import { clientCallId, deviceId, drainOutbox, ensureCallIndexes, installHarness, makeApi, type CallsHarness } from "./calls-test-kit";
import { buildVoiceApp, cleanupVoiceWorld, connect, installPermissionPorts, MIC, resetPermissionSpy, seedChannel, seedVoiceWorld, type VoiceWorld } from "./voice-test-kit";
import { newObjectId } from "../../../../core/utils/object-id";
import { prisma } from "../../../../infrastructure/database";

const app = buildVoiceApp();
const api = makeApi(app);

/** URL ảnh ký sẵn bản THUMB của đúng asset (`avatarUrlOf`, `shared/media`) — gốc `PUBLIC_API_URL` tuỳ môi trường. */
const signedThumb = (assetId: string): RegExp => new RegExp(`/api/v1/assets/${assetId}/image\\?v=THUMB&e=\\d+&s=[0-9a-f]{64}$`);

type UserRef = { id?: string; userId?: string; avatarUrl: string | null };
type CallView = { id: string; scope: { kind: string; title: string; avatarUrl: string | null }; initiator: UserRef; participants?: UserRef[] };

/**
 * Hợp đồng ảnh hiển thị trên luồng cuộc gọi THẬT (Prisma + Mongo memory): `scope.avatarUrl` (DIRECT = ảnh người kia theo góc nhìn người xem,
 * GROUP = ảnh nhóm chat), `initiator`/`participants[].avatarUrl`, `call:incoming`, preview + `call:participant-updated` của phòng thoại.
 */
describe("calls — ảnh đại diện trong DTO/socket (integration, Mongo memory replset)", () => {
  const worlds: VoiceWorld[] = [];
  let h: CallsHarness;
  let w: VoiceWorld;
  const avatarOf: Record<string, string> = {};

  beforeAll(async () => {
    await ensureCallIndexes();
  });

  beforeEach(async () => {
    installMocks();
    h = installHarness();
    installPermissionPorts();
    w = await seedVoiceWorld();
    worlds.push(w);
    // A, B có ảnh; C chưa đặt ảnh (giữ null).
    for (const name of ["A", "B"]) {
      avatarOf[name] = newObjectId();
      await prisma.user.update({ where: { id: w.u[name]! }, data: { avatarAssetId: avatarOf[name] } });
    }
  });

  afterEach(async () => {
    resetPermissionSpy();
    await cleanupVoiceWorld(worlds.splice(0));
    redisStore.clear();
  });

  const start = (userId: string, scopeType: "CONVERSATION" | "CHANNEL", scopeId: string) =>
    api("post", "/calls", userId, { scopeType, scopeId, mediaKind: "AUDIO", clientCallId: clientCallId(), deviceId: deviceId() });
  const incomingOf = (userId: string): CallView => h.eventsTo(userId, "call:incoming")[0]!.payload.call as CallView;

  it("DIRECT: người gọi thấy ảnh của B, người nhận thấy ảnh của A; initiator/participant mang ảnh của chính họ", async () => {
    const res = await start(w.u.A!, "CONVERSATION", w.direct);
    expect(res.status).toBe(201);
    const call = res.body.data.call as CallView;
    expect(call.scope).toMatchObject({ kind: "DIRECT", title: "Người B", avatarUrl: expect.stringMatching(signedThumb(avatarOf.B!)) });
    expect(call.initiator.avatarUrl).toMatch(signedThumb(avatarOf.A!));
    expect(call.participants!.find((p) => p.userId === w.u.B)?.avatarUrl).toMatch(signedThumb(avatarOf.B!));

    await drainOutbox(h);
    const incoming = incomingOf(w.u.B!);
    expect(incoming.scope).toMatchObject({ kind: "DIRECT", title: "Người A", avatarUrl: expect.stringMatching(signedThumb(avatarOf.A!)) });
    expect(incoming.initiator.avatarUrl).toMatch(signedThumb(avatarOf.A!));
    const detail = await api("get", `/calls/${call.id}`, w.u.B!);
    expect((detail.body.data as CallView).scope.avatarUrl).toMatch(signedThumb(avatarOf.A!));
  });

  it("GROUP: scope.avatarUrl là ảnh NHÓM CHAT (không phải ảnh người gọi); thành viên chưa đặt ảnh → null", async () => {
    const groupAvatar = newObjectId();
    await prisma.conversation.update({ where: { id: w.group }, data: { avatarAssetId: groupAvatar } });
    const res = await start(w.u.A!, "CONVERSATION", w.group);
    expect(res.status).toBe(201);
    const call = res.body.data.call as CallView;
    expect(call.scope).toMatchObject({ kind: "GROUP", title: "Nhóm học tập", avatarUrl: expect.stringMatching(signedThumb(groupAvatar)) });
    expect(call.participants!.find((p) => p.userId === w.u.C)?.avatarUrl).toBeNull();

    await drainOutbox(h);
    expect(incomingOf(w.u.C!).scope.avatarUrl).toMatch(signedThumb(groupAvatar));
  });

  it("phòng thoại kênh: preview và `call:participant-updated` (room `call:` lẫn bản công khai `ch:`) mang ảnh của người trong phòng", async () => {
    const ch = await seedChannel(w, { name: "phong-hoc-nhom" });
    const res = await start(w.u.A!, "CHANNEL", ch);
    const callId = (res.body.data.call as CallView).id;
    expect((res.body.data.call as CallView).scope).toMatchObject({ kind: "CHANNEL", avatarUrl: null }); // kênh không có ảnh
    await connect(h, callId, w.u.A!, [MIC]);
    await drainOutbox(h);

    const preview = await api("get", `/channels/${ch}/voice`, w.u.C!);
    expect(preview.body.data.participants[0]).toMatchObject({ userId: w.u.A, avatarUrl: expect.stringMatching(signedThumb(avatarOf.A!)) });
    const updates = h.emitted.filter((e) => e.event === "call:participant-updated" && (e.payload.participant as { userId: string }).userId === w.u.A);
    for (const room of [`call:${callId}`, `ch:${ch}`]) {
      const last = updates.filter((e) => e.target === "room" && e.to === room).pop();
      expect((last!.payload.participant as UserRef).avatarUrl).toMatch(signedThumb(avatarOf.A!));
    }
  });
});
