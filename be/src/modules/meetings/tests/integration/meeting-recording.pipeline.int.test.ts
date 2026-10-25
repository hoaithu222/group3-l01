import { installMocks, redisStore } from "./meeting-room-test-mocks";
import { buildMeetingsApp, makeApi, seedWorld, type World } from "./meetings-test-kit";
import { drainRoomOutbox, ensureRoomIndexes } from "./meeting-room-test-kit";
import { cleanupRecapWorld, egressEvent, ensureRecapIndexes, installRecordingHarness, latestRecording, liveRoom, makeFlow, type RecordingHarness } from "./recap-recording-test-kit";
import express from "express";
import request from "supertest";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { prisma } from "../../../../infrastructure/database";
import { recordingStorageBytes } from "../../../../infrastructure/metrics/recording.metrics";
import { clearLiveKitHandlers, dispatchLiveKitEvent, registerLiveKitHandler, verifyLiveKitWebhook } from "../../../../infrastructure/media";
import { signWebhook, webhookBody } from "../../../../infrastructure/media/tests/livekit-test-utils";
import type { MeetingEventPayload } from "../../services/meeting-events";
import { LiveKitEventProcessor } from "../../../webhooks/livekit-event.processor";
import { LiveKitWebhookService } from "../../../webhooks/livekit-webhook.service";
import { createWebhooksRouter } from "../../../webhooks/webhooks.routes";
import { FakeLiveKitEventQueue, InMemoryWebhookEventRepository } from "../../../webhooks/tests/support/webhooks-test-support";

const app = buildMeetingsApp();
const api = makeApi(app);
const LK_KEY = "devkey"; // khớp `meeting-room-test-mocks.ts`
const LK_SECRET = "devsecretdevsecretdevsecretdevsecret1234";
const DAY = 86_400_000;

describe("ghi hình họp — webhook egress, import, xem/tải, xoá, hết hạn, tự sửa (integration, Mongo memory replset, LiveKit + storage giả)", () => {
  const worlds: World[] = [];
  let h: RecordingHarness;
  let w: World;
  let flow: ReturnType<typeof makeFlow>;

  beforeAll(async () => {
    await ensureRoomIndexes();
    await ensureRecapIndexes();
  });

  beforeEach(async () => {
    installMocks();
    h = installRecordingHarness();
    w = await seedWorld();
    worlds.push(w);
    flow = makeFlow(h, api, w);
  });

  afterEach(async () => {
    clearLiveKitHandlers();
    await cleanupRecapWorld(worlds.splice(0));
    redisStore.clear();
  });

  const kit = () => h.container.recapRecording;
  const importRows = (recordingId: string) => prisma.outboxEvent.findMany({ where: { jobName: "recording.import", aggregateId: recordingId }, orderBy: { createdAt: "asc" } });

  /** Ghi hình đã chạy xong tới READY (asset + link + tin) — dùng cho các ca xem/tải/xoá. */
  async function readyRecording(over: Record<string, unknown> = {}, opts: { chat?: boolean } = {}) {
    const r = await flow.recording(over, opts);
    const row = await latestRecording(r.m.id);
    await kit().egress.handle(flow.complete(r.room, row.egressId!));
    h.storage.put(row.storageKey, 5_000_000);
    expect(await kit().importer.run(r.rec.id)).toBe("READY");
    return { ...r, row: await latestRecording(r.m.id) };
  }

  it("RR-11: webhook egress ký sai → 401 và bản ghi không đổi; ký đúng → dispatcher chạy handler, bản ghi PROCESSING với dung lượng/thời lượng từ egress; gửi lại cùng event.id không xử lý lại", async () => {
    const { m, room, rec } = await flow.recording();
    const egressId = (await latestRecording(m.id)).egressId!;
    const repo = new InMemoryWebhookEventRepository();
    const queue = new FakeLiveKitEventQueue();
    const wh = express();
    wh.use("/api/v1/webhooks", createWebhooksRouter(new LiveKitWebhookService({ repo, queue, verify: verifyLiveKitWebhook })));
    wh.use(express.json());
    wh.use(notFoundHandler);
    wh.use(errorHandler);
    const now = String(Date.now() * 1_000_000);
    const body = webhookBody({
      id: "EV_p206_ended",
      event: "egress_ended",
      egress: { egressId, roomName: room, status: "EGRESS_COMPLETE", startedAt: now, endedAt: now, fileResults: [{ filename: "a.mp4", location: `s3://bucket/${egressId}.mp4`, size: "1234567", duration: "61400000000" }] },
    });
    const post = async (auth: string) => request(wh).post("/api/v1/webhooks/livekit").set("Content-Type", "application/webhook+json").set("Authorization", auth).send(body);

    const bad = await post(await signWebhook(body, { key: LK_KEY, secret: "another-secret-another-secret-123456" }));
    expect([bad.status, bad.body.error.code]).toEqual([401, "MEDIA_002"]);
    expect(queue.enqueued).toHaveLength(0);
    expect((await latestRecording(m.id)).status).toBe("STARTING"); // không đổi trạng thái

    const good = await post(await signWebhook(body, { key: LK_KEY, secret: LK_SECRET }));
    expect(good.status).toBe(200);
    expect(queue.enqueued).toHaveLength(1);
    registerLiveKitHandler({ name: "p2-06.recording", roomKind: "meeting", types: ["egress_started", "egress_updated", "egress_ended"], handle: (e) => kit().egress.handle(e) });
    const processor = new LiveKitEventProcessor(repo, dispatchLiveKitEvent);
    expect(await processor.process(queue.enqueued[0]!.webhookEventId)).toBe("PROCESSED");
    expect(await latestRecording(m.id)).toMatchObject({ id: rec.id, status: "PROCESSING", durationSec: 61, fileSizeBytes: 1_234_567, stopReason: "MEETING_ENDED" });

    expect((await post(await signWebhook(body, { key: LK_KEY, secret: LK_SECRET }))).status).toBe(200); // trùng event.id
    expect(queue.enqueued).toHaveLength(1);
    expect(await importRows(rec.id)).toHaveLength(1);
  });

  it("RR-12: egress COMPLETE hai lần → MỘT lượt PROCESSING; import → MỘT Asset (RECORDING/VIDEO/mp4) + MỘT AssetLink + MỘT tin MEETING_RECORDING_READY + thông báo hộp thư; import lặp không nhân đôi", async () => {
    const { m, callId, room, rec, conversationId } = await flow.recording({}, { chat: true });
    const egressId = (await latestRecording(m.id)).egressId!;
    await kit().egress.handle(egressEvent("egress_started", room, { egressId }));
    const ended = flow.complete(room, egressId);
    expect(await kit().egress.handle(ended)).toBe("PROCESSED");
    expect(await kit().egress.handle(ended)).toBe("PROCESSED"); // webhook trùng
    const row = await latestRecording(m.id);
    expect(row).toMatchObject({ status: "PROCESSING", durationSec: 61, fileSizeBytes: 5_000_000, stopReason: "MEETING_ENDED", importAttempts: 0 });
    expect(row.retentionExpiresAt!.getTime()).toBe(row.stoppedAt!.getTime() + 90 * DAY);
    expect(await importRows(rec.id)).toHaveLength(1);
    expect(flow.roomEvents(callId, "STOPPED")).toHaveLength(1);
    expect(await kit().importer.run(rec.id)).toBe("RETRY"); // chưa thấy tệp trên storage → hẹn lại (không ném)
    const rows = await importRows(rec.id);
    expect(rows).toHaveLength(2);
    expect(rows[1]!.availableAt.getTime()).toBeGreaterThan(h.clock.now().getTime() + 50_000);
    expect((await latestRecording(m.id)).importAttempts).toBe(1);

    h.storage.put(row.storageKey, 5_000_000);
    expect(await kit().importer.run(rec.id)).toBe("READY");
    expect(await kit().importer.run(rec.id)).toBe("SKIPPED");
    const ready = await latestRecording(m.id);
    expect(ready).toMatchObject({ status: "READY", fileSizeBytes: 5_000_000 });
    const assets = await prisma.asset.findMany({ where: { storageKey: row.storageKey } });
    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({ id: ready.assetId, scope: "RECORDING", kind: "VIDEO", status: "READY", mime: "video/mp4", ownerId: w.u.C, workspaceId: w.workspaceId, size: 5_000_000, durationMs: 61_000 });
    expect(assets[0]!.originalName).toMatch(/^hop-tuan-\d{4}-\d{2}-\d{2}\.mp4$/);
    const links = await prisma.assetLink.findMany({ where: { targetType: "MEETING_RECORDING", targetId: rec.id } });
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ assetId: ready.assetId, scopeType: "MEETING", scopeId: m.id });

    await drainRoomOutbox(h);
    const payload = (await prisma.outboxEvent.findFirstOrThrow({ where: { type: "meeting.recording-ready" } })).payload as unknown as MeetingEventPayload;
    await h.container.events.handle(payload); // handler chạy lại (job retry) — vẫn MỘT tin
    const cards = await prisma.message.findMany({ where: { scopeType: "CONVERSATION", scopeId: conversationId!, systemType: "MEETING_RECORDING_READY" } });
    expect(cards).toHaveLength(1);
    expect(cards[0]!.systemPayload).toMatchObject({ meetingId: m.id, recordingId: rec.id, durationSec: 61 });
    const inbox = h.notified.filter((n) => n.type === "meeting.recording-ready");
    expect(inbox.length).toBeGreaterThanOrEqual(1);
    expect(inbox[0]!.recipients.map((r) => r.userId).sort()).toEqual([w.u.A, w.u.B, w.u.C, w.u.D, w.u.E].sort());
    expect(h.emitted.some((e) => e.event === "meeting:recording-updated" && e.payload.status === "READY" && e.payload.recordingId === rec.id)).toBe(true);
  });

  it("RR-13: egress hỏng không có tệp → FAILED + lý do đã làm sạch (không URL) + call:recording FAILED; người điều khiển thấy, người xem không; ghi lại được sau đó. Hỏng nhưng đã ghi tệp → vẫn xử lý (EGRESS_FAILED)", async () => {
    const { m, callId, room, rec } = await flow.recording();
    const egressId = (await latestRecording(m.id)).egressId!;
    await kit().egress.handle(egressEvent("egress_started", room, { egressId }));
    await kit().egress.handle(egressEvent("egress_ended", room, { egressId, status: "FAILED", error: "Mất kết nối tới https://bucket.s3.amazonaws.com/recordings/x/y/z.mp4?X-Amz-Signature=abc123", files: [] }));
    const row = await latestRecording(m.id);
    expect(row).toMatchObject({ status: "FAILED", stopReason: "EGRESS_FAILED" });
    expect(row.error).toContain("Mất kết nối");
    expect(row.error).not.toMatch(/https?:|X-Amz|s3\.amazonaws/);
    expect(row.retentionExpiresAt).not.toBeNull();
    expect(flow.roomEvents(callId, "FAILED")).toHaveLength(1);
    expect(await importRows(rec.id)).toHaveLength(0);

    const host = await api("get", `/meetings/${m.id}/recordings`, w.u.C!);
    expect(host.body.data).toHaveLength(1);
    expect(host.body.data[0]).toMatchObject({ status: "FAILED", error: expect.any(String), myActions: { canRetry: false, canStop: false, canDelete: true } });
    expect((await api("get", `/meetings/${m.id}/recordings`, w.u.E!)).body.data).toEqual([]); // người xem chỉ thấy READY
    expect((await api("get", `/recordings/${rec.id}`, w.u.E!)).body.error.code).toBe("REC_005");

    const second = await flow.allConsent(m.id);
    const res2 = await flow.start(m.id, w.u.C!, second);
    expect(res2.status).toBe(201);
    const row2 = await latestRecording(m.id);
    await kit().egress.handle(egressEvent("egress_ended", room, { egressId: row2.egressId!, status: "ABORTED", files: [{ filename: "p.mp4", location: "s3://b/p.mp4", sizeBytes: 900_000, durationSeconds: 30 }] }));
    expect(await latestRecording(m.id)).toMatchObject({ status: "PROCESSING", stopReason: "EGRESS_FAILED", fileSizeBytes: 900_000 });
  });

  it("import thất bại (không thấy tệp đủ số lần) → FAILED nhưng canRetry; 'Thử lại import' chỉ khi tệp đã có trên storage → PROCESSING rồi READY", async () => {
    const { m, room, rec } = await flow.recording();
    const row = await latestRecording(m.id);
    await kit().egress.handle(flow.complete(room, row.egressId!));
    h.limits.importMaxAttempts = 3;
    expect(await kit().importer.run(rec.id)).toBe("RETRY");
    expect(await kit().importer.run(rec.id)).toBe("RETRY");
    expect(await kit().importer.run(rec.id)).toBe("FAILED");
    expect(await latestRecording(m.id)).toMatchObject({ status: "FAILED", error: expect.stringContaining("tệp ghi hình"), fileSizeBytes: 5_000_000 });
    const list = await api("get", `/meetings/${m.id}/recordings`, w.u.C!);
    expect(list.body.data[0].myActions).toMatchObject({ canRetry: true });
    expect((await api("post", `/recordings/${rec.id}/retry-import`, w.u.E!)).body.error.code).toBe("MEET_002");
    const missing = await api("post", `/recordings/${rec.id}/retry-import`, w.u.C!);
    expect([missing.status, missing.body.error.code]).toEqual([409, "REC_004"]); // tệp vẫn chưa có

    h.storage.put(row.storageKey, 5_000_000);
    const retry = await api("post", `/recordings/${rec.id}/retry-import`, w.u.B!);
    expect(retry.status).toBe(202);
    expect(retry.body.data).toMatchObject({ status: "PROCESSING" });
    expect(await kit().importer.run(rec.id)).toBe("READY");
    expect(await prisma.auditLog.count({ where: { action: "recording.retry-import", targetId: rec.id } })).toBe(1);
  });

  it("egress_started tới TRƯỚC khi start kịp ghi egressId: nhận bản STARTING của đúng phiên họp; egress lạ (ngoài hệ thống) bị bỏ qua", async () => {
    const { m, callId, room } = await liveRoom(h, api, w);
    const created = await prisma.meetingRecording.create({
      data: { meetingId: m.id, workspaceId: w.workspaceId, callId, requestId: "r", storageKey: "recordings/x.mp4", startedBy: w.u.C!, consentSnapshot: [], egressId: null, deletedAt: null },
    });
    expect(await kit().egress.handle(egressEvent("egress_started", room, { egressId: "EG_early" }))).toBe("PROCESSED");
    expect(await prisma.meetingRecording.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({ status: "RECORDING", egressId: "EG_early" });
    expect(await kit().egress.handle(egressEvent("egress_started", "meet_zzzzzzzzzz", { egressId: "EG_stranger" }))).toBe("IGNORED");
    expect(await kit().egress.handle(egressEvent("egress_updated", room, { egressId: "EG_early" }))).toBe("IGNORED");
  });

  it("RR-16: xem/tải — STREAM URL ký 900 giây cho người xem được cuộc họp; DOWNLOAD chỉ chủ trì/đồng chủ trì (60 giây) và OWNER không tham dự (audit); chưa READY → 409 REC_004; người ngoài → 404", async () => {
    const { m, rec } = await readyRecording({ attendeeIds: [w.u.D!, w.u.E!, w.u.B!] }); // A (OWNER workspace) KHÔNG tham dự
    const key = (await latestRecording(m.id)).storageKey;
    const stream = await api("get", `/recordings/${rec.id}/url?purpose=STREAM`, w.u.E!);
    expect(stream.status).toBe(200);
    expect(stream.body.data).toMatchObject({ url: `https://s3.test/${key}?ttl=900`, mime: "video/mp4" });
    expect(new Date(stream.body.data.expiresAt).getTime() - h.clock.now().getTime()).toBeGreaterThan(890_000);
    expect((await api("get", `/recordings/${rec.id}/url`, w.u.E!)).body.data.url).toContain("ttl=900"); // mặc định STREAM

    const denied = await api("get", `/recordings/${rec.id}/url?purpose=DOWNLOAD`, w.u.E!);
    expect([denied.status, denied.body.error.code]).toEqual([403, "MEET_002"]); // RR-16
    const bySession = await api("get", `/recordings/${rec.id}/url?purpose=DOWNLOAD`, w.u.B!);
    expect(bySession.body.data.url).toBe(`https://s3.test/${key}?ttl=60`);
    expect(await prisma.auditLog.count({ where: { action: "recording.download", targetId: rec.id } })).toBe(0); // chủ trì tải bản của mình: không cần audit
    expect((await api("get", `/recordings/${rec.id}/url`, w.u.X!)).body.error.code).toBe("REC_005");
    expect((await api("get", `/recordings/${rec.id}/url?purpose=BOGUS`, w.u.E!)).status).toBe(400);

    // OWNER workspace KHÔNG tham dự (cuộc họp riêng ATTENDEES): không xem/phát được, nhưng tải được (audit)
    const denyView = await api("get", `/recordings/${rec.id}/url?purpose=STREAM`, w.u.A!);
    expect([denyView.status, denyView.body.error.code]).toEqual([404, "REC_005"]);
    const ownerDownload = await api("get", `/recordings/${rec.id}/url?purpose=DOWNLOAD`, w.u.A!);
    expect(ownerDownload.status).toBe(200);
    expect(await prisma.auditLog.findFirst({ where: { action: "recording.download", targetId: rec.id } })).toMatchObject({ actorId: w.u.A });
    expect((await api("get", `/meetings/${m.id}/recordings`, w.u.A!)).status).toBe(404);
  });

  it("danh sách/chi tiết: người xem thấy READY (không error/không tên người đồng ý), người điều khiển thấy cả PROCESSING; chưa READY hỏi URL → 409 REC_004", async () => {
    const { m, room, rec } = await flow.recording();
    const row = await latestRecording(m.id);
    await kit().egress.handle(flow.complete(room, row.egressId!)); // PROCESSING
    expect((await api("get", `/recordings/${rec.id}/url`, w.u.C!)).body.error.code).toBe("REC_004");
    expect((await api("get", `/meetings/${m.id}/recordings`, w.u.E!)).body.data).toEqual([]);
    const asHost = await api("get", `/meetings/${m.id}/recordings`, w.u.C!);
    expect(asHost.body.data).toHaveLength(1);
    expect(asHost.body.data[0]).toMatchObject({ status: "PROCESSING", durationSec: 61, fileSizeBytes: 5_000_000, consentCount: 4, myActions: { canStop: false, canDownload: false, canDelete: true } });
    h.storage.put(row.storageKey, 5_000_000);
    await kit().importer.run(rec.id);
    const asViewer = await api("get", `/meetings/${m.id}/recordings`, w.u.E!);
    expect(asViewer.body.data).toHaveLength(1);
    expect(asViewer.body.data[0]).toMatchObject({ status: "READY", myActions: { canStop: false, canDownload: false, canDelete: false, canRetry: false } });
    expect(JSON.stringify(asViewer.body.data)).not.toContain(w.u.D!); // không lộ danh sách người đồng ý
    expect((await api("get", `/recordings/${rec.id}`, w.u.E!)).body.data.id).toBe(rec.id);
    expect((await api("get", `/meetings/${m.id}`, w.u.E!)).body.data).toMatchObject({ readyRecordingCount: 1 });
  });

  it("RR-20: xoá bản ghi — chủ trì theo lịch xoá bản của mình; OWNER workspace bắt buộc lý do ≥ 10 ký tự (audit); đồng chủ trì/người thường 403; đang ghi 409; xoá gỡ link + asset + hẹn xoá object; URL sau xoá 404", async () => {
    const { m, room, rec, row } = await readyRecording();
    for (const uid of [w.u.E!, w.u.B!]) {
      const res = await api("delete", `/recordings/${rec.id}`, uid);
      expect([res.status, res.body.error.code]).toEqual([403, "MEET_002"]);
    }
    expect((await api("delete", `/recordings/${rec.id}`, w.u.X!)).body.error.code).toBe("REC_005");
    const noReason = await api("delete", `/recordings/${rec.id}`, w.u.A!);
    expect([noReason.status, noReason.body.error.code]).toEqual([400, "VAL_001"]); // OWNER không chủ trì: bắt buộc lý do
    expect((await api("delete", `/recordings/${rec.id}?reason=ngan`, w.u.A!)).status).toBe(400);
    const reason = "Nội dung ghi hình có dữ liệu nhạy cảm";
    const done = await api("delete", `/recordings/${rec.id}?reason=${encodeURIComponent(reason)}`, w.u.A!);
    expect(done.status).toBe(204);
    expect(await prisma.meetingRecording.findUniqueOrThrow({ where: { id: rec.id } })).toMatchObject({ deletedBy: w.u.A, deleteReason: reason });
    expect(await prisma.auditLog.findFirst({ where: { action: "recording.delete", targetId: rec.id } })).toMatchObject({ actorId: w.u.A, reason });
    expect(await prisma.asset.findUniqueOrThrow({ where: { id: row.assetId! } })).toMatchObject({ status: "DELETED" });
    expect(await prisma.assetLink.count({ where: { targetType: "MEETING_RECORDING", targetId: rec.id } })).toBe(0);
    const del = await prisma.outboxEvent.findFirstOrThrow({ where: { jobName: "recording.storage-delete", aggregateId: rec.id } });
    expect(del.payload).toMatchObject({ recordingId: rec.id, storageKey: row.storageKey });
    expect(h.emitted.some((e) => e.event === "meeting:recording-updated" && e.payload.recordingId === rec.id && e.payload.deleted === true)).toBe(true);
    expect((await api("get", `/meetings/${m.id}/recordings`, w.u.C!)).body.data).toEqual([]);
    for (const uid of [w.u.C!, w.u.E!]) expect((await api("get", `/recordings/${rec.id}/url`, uid)).body.error.code).toBe("REC_005");
    expect((await api("delete", `/recordings/${rec.id}`, w.u.C!)).body.error.code).toBe("REC_005"); // đã xoá

    // Chủ trì theo lịch xoá bản của mình không cần lý do; đang ghi thì không xoá được
    const requestId = await flow.allConsent(m.id); // cùng phòng còn LIVE: ghi bản thứ hai
    const running = (await flow.start(m.id, w.u.C!, requestId)).body.data as { id: string };
    const busy = await api("delete", `/recordings/${running.id}`, w.u.C!);
    expect([busy.status, busy.body.error.code]).toEqual([409, "MEET_009"]);
    await kit().egress.handle(flow.complete(room, (await latestRecording(m.id)).egressId!));
    h.storage.put((await latestRecording(m.id)).storageKey, 5_000_000);
    await kit().importer.run(running.id);
    expect((await api("delete", `/recordings/${running.id}`, w.u.C!)).status).toBe(204);
  });

  it("RR-17: cron hết hạn xoá bản READY/FAILED quá hạn (object + asset + link + audit hệ thống), bản còn hạn giữ nguyên, danh sách không còn, URL cũ 404; cập nhật số liệu dung lượng", async () => {
    const a = await readyRecording();
    const requestId = await flow.allConsent(a.m.id); // cùng phòng còn LIVE: ghi thêm một bản rồi cho hỏng
    expect((await flow.start(a.m.id, w.u.C!, requestId)).status).toBe(201);
    const second = await latestRecording(a.m.id);
    await kit().egress.handle(egressEvent("egress_ended", a.room, { egressId: second.egressId!, status: "FAILED", error: "boom", files: [] }));
    expect((await latestRecording(a.m.id)).status).toBe("FAILED");
    expect((await latestRecording(a.m.id)).retentionExpiresAt!.getTime()).toBeGreaterThan(h.clock.now().getTime() + 89 * DAY);
    expect(await kit().maintenance.retentionCleanup()).toBe(0); // chưa bản nào hết hạn

    await prisma.meetingRecording.update({ where: { id: a.rec.id }, data: { retentionExpiresAt: new Date(h.clock.now().getTime() - 1000) } });
    expect(await kit().maintenance.retentionCleanup()).toBe(1);
    const after = await prisma.meetingRecording.findUniqueOrThrow({ where: { id: a.rec.id } });
    expect(after).toMatchObject({ deleteReason: "RETENTION", deletedBy: null });
    expect(after.deletedAt).not.toBeNull();
    expect(await prisma.outboxEvent.count({ where: { jobName: "recording.storage-delete", aggregateId: a.rec.id } })).toBe(1);
    expect(await prisma.assetLink.count({ where: { targetId: a.rec.id } })).toBe(0);
    expect(await prisma.asset.findUniqueOrThrow({ where: { id: a.row.assetId! } })).toMatchObject({ status: "DELETED" });
    expect(await prisma.auditLog.findFirst({ where: { action: "recording.delete", targetId: a.rec.id } })).toMatchObject({ metadata: expect.objectContaining({ system: true, reason: "RETENTION" }) });
    for (const uid of [w.u.C!, w.u.E!]) expect((await api("get", `/recordings/${a.rec.id}/url`, uid)).body.error.code).toBe("REC_005"); // URL cũ 404
    expect((await api("get", `/meetings/${a.m.id}/recordings`, w.u.E!)).body.data).toEqual([]);
    expect((await prisma.meetingRecording.findUniqueOrThrow({ where: { id: second.id } })).deletedAt).toBeNull(); // bản FAILED còn hạn giữ nguyên

    await prisma.meetingRecording.update({ where: { id: second.id }, data: { retentionExpiresAt: new Date(h.clock.now().getTime() - 1000) } });
    expect(await kit().maintenance.retentionCleanup()).toBe(1); // FAILED cũng hết hạn
    expect(await kit().maintenance.retentionCleanup()).toBe(0); // idempotent
    const gauge = await recordingStorageBytes.get();
    const sum = await prisma.meetingRecording.aggregate({ where: { status: "READY", deletedAt: null }, _sum: { fileSizeBytes: true } });
    expect(gauge.values[0]?.value).toBe(sum._sum.fileSizeBytes ?? 0);
  });

  it("stuck-check: STARTING không egress → FAILED; STARTING có egress đang chạy → RECORDING; STOPPING mà egress đã COMPLETE → PROCESSING + import; egress biến mất → FAILED; PROCESSING quá lâu → xếp lại import, hết lượt → FAILED", async () => {
    const { m, room, rec } = await flow.recording();
    const spy = jest.spyOn(h.media, "listEgress");
    h.clock.advanceMinutes(3); // quá ngưỡng STARTING (2 phút)
    const egressId = (await latestRecording(m.id)).egressId!;
    spy.mockResolvedValue([{ egressId, roomName: room, status: "ACTIVE", startedAt: h.clock.now().toISOString(), endedAt: null, error: null, files: [] }]);
    expect(await kit().maintenance.stuckCheck()).toBe(1);
    expect((await latestRecording(m.id)).status).toBe("RECORDING");

    expect((await api("post", `/recordings/${rec.id}/stop`, w.u.C!)).body.data.status).toBe("STOPPING");
    h.clock.advanceMinutes(31);
    spy.mockResolvedValue([{ egressId, roomName: room, status: "COMPLETE", startedAt: null, endedAt: h.clock.now().toISOString(), error: null, files: [{ filename: "a.mp4", location: "s3://b/a.mp4", sizeBytes: 2_000_000, durationSeconds: 100 }] }]);
    expect(await kit().maintenance.stuckCheck()).toBe(1);
    expect(await latestRecording(m.id)).toMatchObject({ status: "PROCESSING", durationSec: 100, fileSizeBytes: 2_000_000 });
    expect(await importRows(rec.id)).toHaveLength(1);

    h.clock.advanceMinutes(121); // PROCESSING quá 2 giờ: job import bị mất → xếp lại
    expect(await kit().maintenance.stuckCheck()).toBe(1);
    expect(await importRows(rec.id)).toHaveLength(2);
    expect((await latestRecording(m.id)).importAttempts).toBe(1);
    h.limits.importMaxAttempts = 2;
    h.clock.advanceMinutes(121);
    await prisma.meetingRecording.update({ where: { id: rec.id }, data: { importAttempts: 1 } });
    expect(await kit().maintenance.stuckCheck()).toBe(1);
    expect(await latestRecording(m.id)).toMatchObject({ status: "FAILED", error: expect.stringContaining("quá thời gian") });

    // egress không còn trên máy chủ media: bản STOPPING → FAILED
    const other = await prisma.meetingRecording.create({ data: { meetingId: m.id, workspaceId: w.workspaceId, callId: (await latestRecording(m.id)).callId, requestId: "r", storageKey: "recordings/y.mp4", startedBy: w.u.C!, consentSnapshot: [], egressId: "EG_gone", status: "STOPPING", deletedAt: null } });
    spy.mockResolvedValue([]);
    h.clock.advanceMinutes(31);
    expect(await kit().maintenance.stuckCheck()).toBe(1);
    expect(await prisma.meetingRecording.findUniqueOrThrow({ where: { id: other.id } })).toMatchObject({ status: "FAILED", error: expect.stringContaining("egress") });
    const noEgress = await prisma.meetingRecording.create({ data: { meetingId: m.id, workspaceId: w.workspaceId, callId: other.callId, requestId: "r", storageKey: "recordings/z.mp4", startedBy: w.u.C!, consentSnapshot: [], egressId: null, status: "STARTING", deletedAt: null } });
    h.clock.advanceMinutes(3);
    await kit().maintenance.stuckCheck();
    expect((await prisma.meetingRecording.findUniqueOrThrow({ where: { id: noEgress.id } })).status).toBe("FAILED");
  });

  it("hẹn giờ dừng (chạm trần thời lượng): stopBySystem MAX_DURATION dừng bản đang chạy; no-op khi đã dừng", async () => {
    const { m, rec } = await flow.recording();
    const stopped = await kit().recording.stopBySystem({ recordingId: rec.id }, "MAX_DURATION");
    expect(stopped).toMatchObject({ status: "STOPPING", stopReason: "MAX_DURATION" });
    expect(await kit().recording.stopBySystem({ recordingId: rec.id }, "MAX_DURATION")).toBeNull();
    expect(h.media.callsOf("stopEgress")).toHaveLength(1);
    expect((await latestRecording(m.id)).stoppedBy).toBeNull();
  });
});
