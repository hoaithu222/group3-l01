/**
 * Integration — `POST /webhooks/livekit` qua HTTP thật (supertest) trên Prisma thật (Mongo memory replset,
 * `TEST_DB=memory`): RAW body + chữ ký JWT, unique `(provider, eventId)`, 5xx khi DB lỗi, dispatch theo tiền tố phòng
 * (MED-04..07, p0-08 be.md §10). Hàng đợi là đồ giả (không cần Redis thật); Redis mock như các suite integration khác.
 * Mongo memory KHÔNG chạy `db push` → tạo unique index bằng tay (xem ghi chú ở reuse-first.md, p3-02).
 */
import { setLiveKitEnv, signWebhook, webhookBody } from "../../../../infrastructure/media/tests/livekit-test-utils";

setLiveKitEnv();

jest.mock("../../../../infrastructure/redis", () => ({
  redis: {
    connect: jest.fn(),
    disconnect: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
    ping: jest.fn(),
    getClient: jest.fn(),
  },
}));

import express from "express";
import request from "supertest";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { prisma } from "../../../../infrastructure/database";
import { clearLiveKitHandlers, registerLiveKitHandler, verifyLiveKitWebhook } from "../../../../infrastructure/media";
import { LiveKitEventProcessor } from "../../livekit-event.processor";
import { LiveKitWebhookService } from "../../livekit-webhook.service";
import { PrismaWebhookEventRepository, type CreateWebhookEventInput } from "../../webhook-event.repo";
import { createWebhooksRouter } from "../../webhooks.routes";
import { FakeLiveKitEventQueue } from "../support/webhooks-test-support";

const RUN = `it${Date.now().toString(36)}`;
const eventId = (n: string) => `EV_${RUN}_${n}`;
const URL = "/api/v1/webhooks/livekit";

function buildApp(service: LiveKitWebhookService) {
  const app = express();
  // Cùng thứ tự với app.ts: webhook (RAW) chạy TRƯỚC express.json().
  app.use("/api/v1/webhooks", createWebhooksRouter(service));
  app.use(express.json());
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const repo = new PrismaWebhookEventRepository();
const queue = new FakeLiveKitEventQueue();
const app = buildApp(new LiveKitWebhookService({ repo, queue, verify: verifyLiveKitWebhook }));

async function send(body: string, auth?: string, contentType = "application/webhook+json") {
  const req = request(app).post(URL).set("Content-Type", contentType);
  return (auth !== undefined ? req.set("Authorization", auth) : req).send(body);
}
const signedSend = async (body: string) => send(body, await signWebhook(body));
const rowsOf = (id: string) => prisma.webhookEvent.findMany({ where: { provider: "LIVEKIT", eventId: id } });

/**
 * CHỈ chạy trên Mongo memory (`TEST_DB=memory`, mặc định CI): suite tạo index và xoá bản ghi `WebhookEvent` đã xử lý —
 * không được chạm DATABASE_URL thật (Atlas dev) khi chạy cục bộ thiếu biến này.
 */
const describeDb = process.env.TEST_DB === "memory" ? describe : describe.skip;

beforeAll(async () => {
  if (process.env.TEST_DB !== "memory") return;
  await prisma.$runCommandRaw({
    createIndexes: "WebhookEvent",
    indexes: [
      { key: { provider: 1, eventId: 1 }, name: "WebhookEvent_provider_eventId_key", unique: true },
    ],
  });
});

beforeEach(() => {
  queue.enqueued.length = 0;
  queue.ok = true;
});

afterAll(async () => {
  if (process.env.TEST_DB !== "memory") return;
  await prisma.webhookEvent.deleteMany({ where: { eventId: { startsWith: `EV_${RUN}_` } } });
  await prisma.$disconnect();
});

describeDb("POST /api/v1/webhooks/livekit", () => {
  it("chữ ký đúng → 200 {success:true}, ghi WebhookEvent RECEIVED (hash sha256, payload rút gọn) và xếp 1 job", async () => {
    const id = eventId("ok");
    const body = webhookBody({ id, event: "participant_joined", room: "call_it1", identity: "u1" });
    const res = await signedSend(body);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const rows = await rowsOf(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "participant_joined", roomName: "call_it1", status: "RECEIVED", attempts: 0, error: null, processedAt: null });
    expect(rows[0]?.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0]?.payload).toMatchObject({ v: 1, participant: { identity: "u1" } });
    expect(queue.enqueued).toEqual([{ webhookEventId: rows[0]?.id, eventId: id }]);
  });

  it("MED-05: cùng event.id gửi 2 lần → 200 cả hai, đúng 1 WebhookEvent, đúng 1 job", async () => {
    const id = eventId("dup");
    const body = webhookBody({ id, room: "call_it2", identity: "u1" });
    expect((await signedSend(body)).status).toBe(200);
    expect((await signedSend(body)).status).toBe(200);
    expect(await rowsOf(id)).toHaveLength(1);
    expect(queue.enqueued).toHaveLength(1);
  });

  it("MED-05: gửi đồng thời (race) cùng event.id → unique index chặn, vẫn 1 bản ghi, mọi response 200", async () => {
    const id = eventId("race");
    const body = webhookBody({ id, room: "call_it3", identity: "u1" });
    const auth = await signWebhook(body);
    const results = await Promise.all(Array.from({ length: 5 }, () => send(body, auth)));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(await rowsOf(id)).toHaveLength(1);
    expect(queue.enqueued).toHaveLength(1);
  });

  it("MED-04: chữ ký sai → 401 MEDIA_002, KHÔNG tạo WebhookEvent, không xếp job", async () => {
    const id = eventId("badsig");
    const body = webhookBody({ id, room: "call_it4" });
    const res = await send(body, await signWebhook(body, { secret: "another-secret-another-secret-123456" }));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("MEDIA_002");
    expect(await rowsOf(id)).toHaveLength(0);
    expect(queue.enqueued).toHaveLength(0);
  });

  it("MED-04: body bị sửa sau khi ký → 401, không tạo bản ghi", async () => {
    const id = eventId("tamper");
    const body = webhookBody({ id, room: "call_it5" });
    const res = await send(body.replace("call_it5", "call_it6"), await signWebhook(body));
    expect(res.status).toBe(401);
    expect(await rowsOf(id)).toHaveLength(0);
  });

  it("thiếu Authorization / Content-Type lạ → 401 MEDIA_002 (không thể kiểm chữ ký trên byte gốc)", async () => {
    const body = webhookBody({ id: eventId("noauth"), room: "call_it7" });
    expect((await send(body)).status).toBe(401);
    const res = await send(body, await signWebhook(body), "text/plain");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("MEDIA_002");
    expect(await rowsOf(eventId("noauth"))).toHaveLength(0);
  });

  it("body quá 256 KB → 413 (route không xác thực, chặn DoS), không ghi gì", async () => {
    const res = await send(`{"pad":"${"x".repeat(300 * 1024)}"}`, "x");
    expect(res.status).toBe(413);
  });

  it("MED-06: DB lỗi khi ghi → 5xx (LiveKit retry), KHÔNG 200 giả, không xếp job", async () => {
    class FailingRepo extends PrismaWebhookEventRepository {
      override create(_input: CreateWebhookEventInput): Promise<never> {
        return Promise.reject(new Error("mongo down"));
      }
    }
    const failingApp = buildApp(new LiveKitWebhookService({ repo: new FailingRepo(), queue, verify: verifyLiveKitWebhook }));
    const body = webhookBody({ id: eventId("dbfail"), room: "call_it8" });
    const res = await request(failingApp).post(URL).set("Content-Type", "application/webhook+json").set("Authorization", await signWebhook(body)).send(body);
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.status).not.toBe(200);
    expect(queue.enqueued).toHaveLength(0);
    expect(await rowsOf(eventId("dbfail"))).toHaveLength(0);
  });

  it("xếp job lỗi (Redis chậm/mất) vẫn 200 — bản ghi ở lại RECEIVED cho webhook.sweep", async () => {
    queue.ok = false;
    const id = eventId("noqueue");
    const res = await signedSend(webhookBody({ id, room: "call_it9" }));
    expect(res.status).toBe(200);
    expect((await rowsOf(id))[0]?.status).toBe("RECEIVED");
  });

  it("MED-07: dispatch theo tiền tố phòng trên DB thật — call_ → handler `call` (PROCESSED); `abc` → IGNORED", async () => {
    clearLiveKitHandlers();
    const handle = jest.fn().mockResolvedValue("PROCESSED");
    registerLiveKitHandler({ roomKind: "call", types: ["participant_joined"], handle });
    const processor = new LiveKitEventProcessor(repo);

    await signedSend(webhookBody({ id: eventId("d_call"), room: "call_it10", identity: "u1" }));
    await signedSend(webhookBody({ id: eventId("d_abc"), room: "abc", identity: "u1" }));
    const [callRow] = await rowsOf(eventId("d_call"));
    const [abcRow] = await rowsOf(eventId("d_abc"));

    await expect(processor.process(callRow.id)).resolves.toBe("PROCESSED");
    await expect(processor.process(abcRow.id)).resolves.toBe("IGNORED");
    await expect(processor.process(callRow.id)).resolves.toBe("SKIPPED");

    expect(handle).toHaveBeenCalledTimes(1);
    expect(await prisma.webhookEvent.findUnique({ where: { id: callRow.id } })).toMatchObject({ status: "PROCESSED", attempts: 1, error: null });
    expect((await prisma.webhookEvent.findUnique({ where: { id: callRow.id } }))?.processedAt).toBeInstanceOf(Date);
    expect(await prisma.webhookEvent.findUnique({ where: { id: abcRow.id } })).toMatchObject({ status: "IGNORED", attempts: 1 });
    clearLiveKitHandlers();
  });

  it("sweep/prune trên DB thật: findStaleReceived + deleteFinishedBefore", async () => {
    const id = eventId("stale");
    await signedSend(webhookBody({ id, room: "call_it11" }));
    const soon = new Date(Date.now() + 60_000);
    const stale = await repo.findStaleReceived("LIVEKIT", soon, 500);
    expect(stale.map((s) => s.eventId)).toContain(id);
    expect(await repo.findStaleReceived("LIVEKIT", new Date(Date.now() - 3_600_000), 500)).not.toContainEqual(expect.objectContaining({ eventId: id }));
    expect((await repo.lastReceivedAt("LIVEKIT"))?.getTime()).toBeGreaterThan(Date.now() - 60_000);

    const [row] = await rowsOf(id);
    await repo.markFinished(row.id, "PROCESSED", new Date());
    const deleted = await repo.deleteFinishedBefore("LIVEKIT", soon);
    expect(deleted).toBeGreaterThanOrEqual(1);
    expect(await rowsOf(id)).toHaveLength(0);
  });
});
