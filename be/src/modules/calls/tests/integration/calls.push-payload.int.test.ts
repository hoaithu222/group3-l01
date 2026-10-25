import { installMocks, redisStore } from "./calls-test-mocks";
import { buildCallsApp, cleanupWorld, clientCallId, deviceId, drainOutbox, ensureCallIndexes, installHarness, makeApi, seedWorld, type CallsHarness, type World } from "./calls-test-kit";
import { callIdToUuid } from "../../../../core/utils/call-uuid";
import { LIMITS } from "../../../../core/constants/limits";
import { buildPushPayload } from "../../../notifications/services/push-payload.builder";

const app = buildCallsApp();
const api = makeApi(app);

/**
 * p2-02 be.md §3/§5.1: `CallDto.callUuid` + khoá mới trong `refs` của thông báo cuộc gọi (`scopeKind`, `callVersion`, `expiresAt`, `originDeviceId`) —
 * đi qua `notify()` → `buildPushPayload` thành dữ liệu push phẳng cho CallKit/ConnectionService.
 */
describe("calls — payload push cuộc gọi (p2-02, integration, Mongo memory replset)", () => {
  const worlds: World[] = [];
  let h: CallsHarness;
  let w: World;

  beforeAll(async () => {
    await ensureCallIndexes();
  });

  beforeEach(async () => {
    installMocks();
    h = installHarness();
    w = await seedWorld();
    worlds.push(w);
  });

  afterEach(async () => {
    await cleanupWorld(worlds.splice(0));
    redisStore.clear();
  });

  const start = (scopeId: string, userId = w.u.A!) =>
    api("post", "/calls", userId, { scopeType: "CONVERSATION", scopeId, mediaKind: "AUDIO", clientCallId: clientCallId(), deviceId: deviceId("a1") });
  const notification = (type: string) => h.notified.find((n) => n.type === type)!;

  it("CallDto.callUuid = UUID v5 của callId (POST /calls, GET /calls/:id) và call:incoming.call.callUuid khớp", async () => {
    const created = await start(w.direct);
    const callId = created.body.data.call.id as string;
    const uuid = callIdToUuid(callId);
    expect(created.body.data.call.callUuid).toBe(uuid);

    const fetched = await api("get", `/calls/${callId}`, w.u.B!);
    expect(fetched.body.data.callUuid).toBe(uuid);

    await drainOutbox(h);
    expect(h.eventsTo(w.u.B!, "call:incoming")[0]!.payload).toMatchObject({ call: { id: callId, callUuid: uuid } });
  });

  it("call.incoming 1-1: refs mang scopeKind DIRECT + callVersion + expiresAt = startedAt + ringTimeout; push FCM data có đủ khoá, TTL ≤ 45 s", async () => {
    const created = await start(w.direct);
    const call = created.body.data.call as { id: string; startedAt: string; version: number };
    await drainOutbox(h);

    const n = notification("call.incoming");
    const expectedExpiry = new Date(Date.parse(call.startedAt) + LIMITS.call.ringTimeoutSeconds * 1000).toISOString();
    expect(n.refs).toMatchObject({ callId: call.id, scopeKind: "DIRECT", expiresAt: expectedExpiry });
    expect(typeof (n.refs as { callVersion: unknown }).callVersion).toBe("number");

    const push = buildPushPayload({ type: n.type, targetUserId: w.u.B!, refs: n.refs ?? {}, lockScreenPreview: true });
    expect(push.data).toMatchObject({ callUuid: callIdToUuid(call.id), scopeKind: "DIRECT", expiresAt: expectedExpiry });
    expect(typeof push.data["callVersion"]).toBe("string");
    expect(push.ttlSeconds).toBeLessThanOrEqual(LIMITS.call.ringTimeoutSeconds);
    expect(push.ttlSeconds).toBeGreaterThan(0);
  });

  it("call.incoming nhóm chat: scopeKind GROUP", async () => {
    await start(w.group);
    await drainOutbox(h);
    expect(notification("call.incoming").refs).toMatchObject({ scopeKind: "GROUP" });
  });

  it("trả lời → call.answered-elsewhere mang originDeviceId (máy đã trả lời) + callVersion; từ chối → call.cancelled DECLINED_ELSEWHERE mang originDeviceId", async () => {
    const created = await start(w.group);
    const callId = created.body.data.call.id as string;
    await drainOutbox(h);

    const bDevice = deviceId("b1");
    await api("post", `/calls/${callId}/answer`, w.u.B!, { deviceId: bDevice });
    const cDevice = deviceId("c1");
    await api("post", `/calls/${callId}/decline`, w.u.C!, { deviceId: cDevice });
    await drainOutbox(h);

    const answered = notification("call.answered-elsewhere");
    expect(answered.refs).toMatchObject({ callId, deviceId: bDevice, originDeviceId: bDevice });
    expect(typeof (answered.refs as { callVersion: unknown }).callVersion).toBe("number");
    const answeredPush = buildPushPayload({ type: answered.type, targetUserId: w.u.B!, refs: answered.refs ?? {}, lockScreenPreview: false });
    expect(answeredPush.data).toMatchObject({ callUuid: callIdToUuid(callId), originDeviceId: bDevice });

    const declined = h.notified.find((n) => n.type === "call.cancelled" && (n.refs as { reason?: string }).reason === "DECLINED_ELSEWHERE")!;
    expect(declined.refs).toMatchObject({ callId, originDeviceId: cDevice });
  });

  it("người gọi huỷ → call.cancelled + call.missed cho callee mang callVersion (client bỏ tín hiệu cũ hơn cái đã xử lý)", async () => {
    const created = await start(w.direct);
    const callId = created.body.data.call.id as string;
    await drainOutbox(h);
    await api("post", `/calls/${callId}/cancel`, w.u.A!);
    await drainOutbox(h);

    for (const type of ["call.cancelled", "call.missed"]) {
      const n = h.notified.find((x) => x.type === type && (x.refs as { callId?: string }).callId === callId)!;
      expect(typeof (n.refs as { callVersion: unknown }).callVersion).toBe("number");
      const push = buildPushPayload({ type, targetUserId: w.u.B!, refs: n.refs ?? {}, lockScreenPreview: false });
      expect(push.data["callUuid"]).toBe(callIdToUuid(callId));
      expect(push.data["callVersion"]).toEqual(expect.any(String));
    }
  });
});
