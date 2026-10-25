/**
 * Integration — p5-03 qua HTTP thật (supertest) trên Prisma thật (Mongo memory replset, `TEST_DB=memory`): webhook RAW body ký HMAC (CW-01/CW-02),
 * OAuth state một lần (INT-05), API không lộ token (INT-08), admin tắt nhà cung cấp → webhook IGNORED (INT-09), job `webhook-process` đăng ĐÚNG MỘT tin
 * hệ thống `INTEGRATION` vào kênh (engine tin nhắn thật). Nhà cung cấp là GitHub App thật nhưng KHÔNG gọi mạng (exchange giả); Redis mock có state.
 */
process.env.FEATURE_FLAGS = "communication=true,integration=true";

const redisStore = new Map<string, unknown>();
jest.mock("../../../../infrastructure/redis", () => ({
  redis: { connect: jest.fn(), disconnect: jest.fn(), ping: jest.fn(), get: jest.fn(), set: jest.fn(), del: jest.fn(), getdel: jest.fn(), incr: jest.fn(), expire: jest.fn(), exists: jest.fn(), setNx: jest.fn(), scanKeys: jest.fn(), getClient: jest.fn() },
}));
jest.mock("../../../../core/permission/user-status", () => ({ getUserStatusCached: jest.fn(), invalidateUserStatusCache: jest.fn() }));
jest.mock("../../../../infrastructure/queue/outbox/outbox.writer", () => ({
  ...jest.requireActual("../../../../infrastructure/queue/outbox/outbox.writer"),
  outboxSignal: jest.fn().mockResolvedValue(undefined),
}));

import "../../../../core/config";
import express from "express";
import request from "supertest";
import { initRuntimeConfig, resetRuntimeConfig } from "../../../../core/config/runtime-config";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { resetPermissionPorts, setPermissionPorts } from "../../../../core/permission";
import { getUserStatusCached } from "../../../../core/permission/user-status";
import { JwtUtils } from "../../../../core/utils/jwt";
import { normalizeSearch } from "../../../../core/utils/normalize";
import { newObjectId } from "../../../../core/utils/object-id";
import { prisma } from "../../../../infrastructure/database";
import { redis } from "../../../../infrastructure/redis";
import "../../../workspaces/workspaces.routes";
import "../../../channels/channels.routes";
import { registerChannelModule } from "../../../channels";
import { PrismaSystemConfigRepository } from "../../../system-config/repositories/system-config.repository.prisma";
import type { LiveKitWebhookService } from "../../../webhooks/livekit-webhook.service";
import { createWebhooksRouter } from "../../../webhooks/webhooks.routes";
import adminIntegrationsRoutes from "../../admin-integrations.routes";
import { createIntegrationsContainer, setIntegrationsContainerForTests } from "../../integrations.container";
import integrationsRoutes from "../../integrations.routes";
import type { ExchangeResult } from "../../providers/provider.interface";
import { githubDelivery, pushPayload, TestGithubProvider } from "../support/integration-harness";

class OAuthGithub extends TestGithubProvider {
  override exchange(): Promise<ExchangeResult> {
    return Promise.resolve({ externalAccountId: "777", externalName: "vci", scopes: [] });
  }
}

const describeDb = process.env.TEST_DB === "memory" ? describe : describe.skip;
const RUN = Date.now().toString(36);
const ids = { ws: newObjectId(), owner: newObjectId(), member: newObjectId(), admin: newObjectId(), channel: newObjectId() };
const token = (userId: string, role = "user") => `Bearer ${JwtUtils.generateAccessToken({ userId, email: `${userId}@e.com`, name: "T", role, sv: 1 })}`;

function buildApp(): express.Express {
  registerChannelModule();
  const app = express();
  app.use("/api/v1/webhooks", createWebhooksRouter({} as LiveKitWebhookService));
  app.use(express.json());
  app.use("/api/v1", integrationsRoutes);
  app.use("/api/v1", adminIntegrationsRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

function installRedis(): void {
  (redis.get as jest.Mock).mockImplementation((k: string) => Promise.resolve(redisStore.get(k) ?? null));
  (redis.set as jest.Mock).mockImplementation((k: string, v: unknown) => (redisStore.set(k, v), Promise.resolve()));
  (redis.del as jest.Mock).mockImplementation((k: string) => (redisStore.delete(k), Promise.resolve()));
  (redis.getdel as jest.Mock).mockImplementation((k: string) => {
    const v = redisStore.get(k) ?? null;
    redisStore.delete(k);
    return Promise.resolve(v);
  });
  (redis.incr as jest.Mock).mockImplementation((k: string) => {
    const n = ((redisStore.get(k) as number) ?? 0) + 1;
    redisStore.set(k, n);
    return Promise.resolve(n);
  });
  (redis.getClient as jest.Mock).mockReturnValue(null);
  (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1, showPresence: true });
}

let app: express.Express;

beforeAll(async () => {
  if (process.env.TEST_DB !== "memory") return;
  await prisma.$runCommandRaw({ createIndexes: "WebhookEvent", indexes: [{ key: { provider: 1, eventId: 1 }, name: "WebhookEvent_provider_eventId_key", unique: true }] });
  for (const [id, name] of [[ids.owner, "Chủ"], [ids.member, "Thành viên"], [ids.admin, "Quản trị"]] as const) {
    await prisma.user.create({ data: { id, email: `${id}@e.com`, name, normalizedName: normalizeSearch(name) } });
  }
  await prisma.workspace.create({ data: { id: ids.ws, name: `Nhóm ${RUN}`, normalizedName: `nhom ${RUN}`, ownerId: ids.owner, status: "ACTIVE", defaultChannelId: ids.channel } });
  await prisma.workspaceMembership.createMany({ data: [{ workspaceId: ids.ws, userId: ids.owner, role: "OWNER", status: "ACTIVE" }, { workspaceId: ids.ws, userId: ids.member, role: "MEMBER", status: "ACTIVE" }] });
  await prisma.channel.create({
    data: { id: ids.channel, workspaceId: ids.ws, name: "chung", normalizedName: "chung", type: "TEXT", visibility: "PUBLIC", postingPolicy: "MEMBERS", status: "ACTIVE", isDefault: true, position: 0, lastSeq: 0, memberCount: 0, createdBy: ids.owner, version: 1 },
  });
  setPermissionPorts({ realtime: { leaveRooms: () => Promise.resolve(), emitToUsers: () => Promise.resolve() }, outbox: { enqueueNow: () => Promise.resolve() } });
  initRuntimeConfig(new PrismaSystemConfigRepository());
  app = buildApp();
});

beforeEach(() => {
  installRedis();
  setIntegrationsContainerForTests(createIntegrationsContainer({ providers: [new OAuthGithub()], jobs: { scheduleTokenRefresh: () => Promise.resolve(), enqueueCalendarSync: () => Promise.resolve(), enqueueTargetRecheck: () => Promise.resolve(), enqueueCalendarCleanup: () => Promise.resolve() } }));
});

afterAll(async () => {
  setIntegrationsContainerForTests(null);
  resetPermissionPorts();
  resetRuntimeConfig();
  if (process.env.TEST_DB !== "memory") return;
  await prisma.message.deleteMany({ where: { scopeId: ids.channel } });
  await prisma.webhookEvent.deleteMany({ where: { provider: "GITHUB", eventId: { startsWith: RUN } } });
  await prisma.integration.deleteMany({ where: { workspaceId: ids.ws } });
  await prisma.systemConfig.deleteMany({ where: { key: "integrations" } });
  await prisma.channel.deleteMany({ where: { id: ids.channel } });
  await prisma.workspaceMembership.deleteMany({ where: { workspaceId: ids.ws } });
  await prisma.workspace.deleteMany({ where: { id: ids.ws } });
  await prisma.user.deleteMany({ where: { id: { in: [ids.owner, ids.member, ids.admin] } } });
});

const hook = (event: string, body: Record<string, unknown>, delivery: string, secret?: string) => {
  const d = githubDelivery(event, body, delivery, secret);
  // Gửi CHUỖI (đúng từng byte đã ký): superagent tuần tự hoá lại Buffer thành JSON `{type:"Buffer",data:[…]}` khi Content-Type là JSON.
  return request(app).post("/api/v1/webhooks/github").set(d.headers).send(d.rawBody.toString("utf8"));
};
const location = (res: request.Response) => new URL(String(res.headers.location).replace("superapp://", "https://app.local/")).searchParams;

describeDb("p5-03 qua HTTP", () => {
  let integrationId = "";

  it("INT-05: kết nối GitHub (OWNER) → callback ok; dùng lại state → 302 code=INT_003, không tạo kết nối thứ hai", async () => {
    const start = await request(app).post(`/api/v1/workspaces/${ids.ws}/integrations/github/connect`).set("Authorization", token(ids.owner)).send({});
    expect(start.status).toBe(200);
    const state = new URL(start.body.data.authorizeUrl).searchParams.get("state") ?? "";
    const denied = await request(app).post(`/api/v1/workspaces/${ids.ws}/integrations/github/connect`).set("Authorization", token(ids.member)).send({});
    expect(denied.status).toBe(403);

    const ok = await request(app).get(`/api/v1/integrations/github/callback`).query({ state, code: "c1", installation_id: "777" });
    expect(ok.status).toBe(302);
    expect(location(ok).get("status")).toBe("ok");
    integrationId = location(ok).get("id") ?? "";

    const reused = await request(app).get(`/api/v1/integrations/github/callback`).query({ state, code: "c2", installation_id: "777" });
    expect(location(reused).get("code")).toBe("INT_003");
    expect(await prisma.integration.count({ where: { workspaceId: ids.ws } })).toBe(1);

    const cfg = await request(app).patch(`/api/v1/integrations/${integrationId}`).set("Authorization", token(ids.owner)).send({ repos: [{ id: "1001", fullName: "vci/app" }], expectedVersion: 1 });
    expect(cfg.status).toBe(200);
  });

  it("INT-08: danh sách/chi tiết không có token/secret; MEMBER chỉ thấy bản rút gọn", async () => {
    const own = await request(app).get(`/api/v1/workspaces/${ids.ws}/integrations`).set("Authorization", token(ids.owner));
    const mem = await request(app).get(`/api/v1/workspaces/${ids.ws}/integrations`).set("Authorization", token(ids.member));
    for (const res of [own, mem]) {
      expect(res.status).toBe(200);
      expect(res.text).not.toMatch(/ciphertext|credentials|webhookSecretHash|externalHookIds/);
    }
    expect(own.body.data.canManage).toBe(true);
    expect(mem.body.data).toMatchObject({ canManage: false, items: [{ provider: "GITHUB", target: { name: "chung" } }] });
  });

  it("CW-01: chữ ký sai → 401 INT_007, không có WebhookEvent", async () => {
    const res = await hook("push", pushPayload(), `${RUN}-bad`, "sai");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INT_007");
    expect(await prisma.webhookEvent.count({ where: { provider: "GITHUB", eventId: `${RUN}-bad` } })).toBe(0);
  });

  it("CW-02: cùng delivery 2 lần → 1 WebhookEvent + 1 dòng outbox; job chạy 2 lần → 1 tin INTEGRATION trong kênh", async () => {
    const first = await hook("push", pushPayload(3), `${RUN}-d1`);
    const second = await hook("push", pushPayload(3), `${RUN}-d1`);
    expect([first.status, second.status]).toEqual([202, 202]);
    expect([first.body.data.duplicate, second.body.data.duplicate]).toEqual([false, true]);
    const rows = await prisma.webhookEvent.findMany({ where: { provider: "GITHUB", eventId: `${RUN}-d1` } });
    expect(rows).toHaveLength(1);
    expect(await prisma.outboxEvent.count({ where: { dedupeKey: `wh:github:${RUN}-d1` } })).toBe(1);

    const { getIntegrationsContainer } = await import("../../integrations.container");
    expect(await getIntegrationsContainer().webhookProcess.process(rows[0].id)).toBe("PROCESSED");
    expect(await getIntegrationsContainer().webhookProcess.process(rows[0].id)).toBe("SKIPPED");
    const messages = await prisma.message.findMany({ where: { scopeType: "CHANNEL", scopeId: ids.channel, systemType: "INTEGRATION" } });
    expect(messages).toHaveLength(1);
    expect(JSON.stringify(messages[0]?.systemPayload)).toContain("vci/app");
    expect(await prisma.webhookEvent.findUnique({ where: { id: rows[0].id } })).toMatchObject({ status: "PROCESSED", messageId: messages[0].id });
  });

  it("INT-09: admin tắt GitHub (lý do + audit) → nhà cung cấp unavailable, webhook mới IGNORED", async () => {
    const off = await request(app).put("/api/v1/admin/integrations/providers/GITHUB").set("Authorization", token(ids.admin, "admin")).send({ enabled: false, reason: "Tạm dừng để kiểm tra bảo mật" });
    expect(off.status).toBe(200);
    expect(off.body.data).toMatchObject({ provider: "GITHUB", enabled: false, available: false });
    const res = await hook("push", pushPayload(), `${RUN}-off`);
    expect(res.status).toBe(202);
    expect(res.body.data.status).toBe("IGNORED");
    expect(await prisma.webhookEvent.findFirst({ where: { provider: "GITHUB", eventId: `${RUN}-off` } })).toMatchObject({ status: "IGNORED" });
    expect(await prisma.auditLog.count({ where: { action: "integration.provider-toggle", actorId: ids.admin } })).toBe(1);
    const events = await request(app).get("/api/v1/admin/integrations/events").query({ workspaceId: ids.ws }).set("Authorization", token(ids.admin, "admin"));
    expect(events.status).toBe(200);
    expect(events.text).not.toMatch(/"payload"|@example\.com/);
  });
});
