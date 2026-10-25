import { installMocks, redisStore } from "./meetings-test-mocks";
import express from "express";
import request from "supertest";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { JwtUtils } from "../../../../core/utils/jwt";
import { newObjectId } from "../../../../core/utils/object-id";
import { prisma } from "../../../../infrastructure/database";
import { registerConversationModule } from "../../../conversations";
import "../../../conversations/conversations.routes"; // side-effect: đăng ký resolver CONVERSATION
import { PrismaWorkspaceRepository } from "../../../workspaces/repositories";
import { registerWorkspacePermissionResolver } from "../../../workspaces/services/workspace-permission.resolver";
import adminMeetingsRoutes from "../../admin-meetings.routes";
import meetingsRoutes from "../../meetings.routes";
import { registerMeetingsModule } from "../../index";
import { cleanupWorld, ensureMeetingIndexes, idemKey, installHarness, makeApi, meetingBody, seedWorld, slot, type World } from "./meetings-test-kit";

/**
 * `GET /admin/workspaces/:workspaceId/meetings` (admin.md p2-04 §2.1): admin nền tảng CHỈ thấy metadata. Trọng tâm là "không lộ nội dung":
 * agenda, địa điểm, link/mật khẩu nền tảng ngoài, mã họp và danh sách người tham dự phải THỰC SỰ vắng khỏi JSON (không chỉ "UI không hiển thị").
 */
registerWorkspacePermissionResolver(new PrismaWorkspaceRepository());
registerConversationModule();
registerMeetingsModule();
const app = express();
app.use(express.json());
app.use("/api/v1", meetingsRoutes);
app.use("/api/v1", adminMeetingsRoutes);
app.use(notFoundHandler);
app.use(errorHandler);
const userApi = makeApi(app);

const adminToken = (role: "admin" | "manager" | "user", userId = newObjectId()): string => JwtUtils.generateAccessToken({ userId, email: `${userId}@e.com`, name: "Admin", role, sv: 1 });
const adminGet = (path: string, role: "admin" | "manager" | "user" = "admin") => request(app).get(`/api/v1${path}`).set("Authorization", `Bearer ${adminToken(role)}`);

const SECRET_AGENDA = "BÍ-MẬT-AGENDA-XYZ";
const SECRET_PLACE = "Phòng-kín-tầng-99";
const SECRET_URL = "https://zoom.us/j/123456789?pwd=MAT-KHAU-BI-MAT";

describe("admin — cuộc họp của workspace (integration, Mongo memory replset)", () => {
  const worlds: World[] = [];
  let w: World;
  let other: World;
  const ids: Record<string, string> = {};
  const codes: string[] = [];
  const at = (minutes: number): Date => new Date(Date.now() + minutes * 60_000);

  const create = async (world: World, uid: string, name: string, over: Record<string, unknown>) => {
    const res = await userApi("post", `/workspaces/${world.workspaceId}/meetings`, uid, meetingBody({ title: name, ...over }), idemKey());
    expect(res.status).toBe(201);
    ids[name] = res.body.data.id as string;
    codes.push(res.body.data.code as string);
    return res.body.data as { id: string; code: string; version: number };
  };

  beforeAll(async () => {
    await ensureMeetingIndexes();
  });

  beforeEach(async () => {
    installMocks();
    installHarness();
    w = await seedWorld();
    other = await seedWorld();
    worlds.push(w, other);
    // m1: có mọi trường nhạy cảm; m2: xa nhất; m3: sẽ bị huỷ; m4: sẽ ENDED; m5: bị xoá mềm; x: workspace khác.
    await create(w, w.u.C!, "Họp 1", { ...slot(120), agenda: SECRET_AGENDA, location: SECRET_PLACE, platform: "ZOOM", externalUrl: SECRET_URL, attendeeIds: [w.u.D!, w.u.E!], visibility: "ATTENDEES" });
    await create(w, w.u.C!, "Họp 2", { ...slot(600) });
    const m3 = await create(w, w.u.C!, "Họp 3", { ...slot(300) });
    await create(w, w.u.C!, "Họp 4", { ...slot(30) });
    const m5 = await create(w, w.u.C!, "Họp 5", { ...slot(200) });
    await create(other, other.u.C!, "Họp khác", { ...slot(120) });

    await userApi("post", `/meetings/${m3.id}/cancel`, w.u.C!, { expectedVersion: 1, reason: "Hoãn" });
    await prisma.meeting.update({ where: { id: ids["Họp 4"]! }, data: { status: "ENDED", endReason: "HOST_ENDED", endedAt: new Date() } });
    expect((await userApi("delete", `/meetings/${m5.id}?expectedVersion=1`, w.u.C!)).status).toBe(204);
  });

  afterEach(async () => {
    await cleanupWorld(worlds.splice(0));
    redisStore.clear();
  });

  const list = (query = "", role: "admin" | "manager" | "user" = "admin") => adminGet(`/admin/workspaces/${w.workspaceId}/meetings${query}`, role);
  const titles = (res: request.Response): string[] => (res.body.data as Array<{ title: string }>).map((r) => r.title);

  it("trả cuộc họp chưa xoá của ĐÚNG workspace, startAt mới → cũ, kèm meta phân trang và tên chủ trì", async () => {
    const res = await list();
    expect(res.status).toBe(200);
    expect(titles(res)).toEqual(["Họp 2", "Họp 3", "Họp 1", "Họp 4"]); // không có "Họp 5" (xoá mềm) và "Họp khác"
    expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 4, totalPages: 1, hasNext: false, hasPrev: false });
    const m1 = (res.body.data as Array<Record<string, unknown>>).find((r) => r.title === "Họp 1")!;
    expect(m1).toMatchObject({ id: ids["Họp 1"], host: { id: w.u.C, name: "Người C" }, timezone: "Asia/Ho_Chi_Minh", status: "SCHEDULED", platform: "ZOOM", attendeeCount: 3, endReason: null, cancelledAt: null });
    expect(new Date(m1.endAt as string).getTime()).toBeGreaterThan(new Date(m1.startAt as string).getTime());
    const rows = res.body.data as Array<Record<string, unknown>>;
    expect(rows.find((r) => r.title === "Họp 3")).toMatchObject({ status: "CANCELLED", cancelledAt: expect.any(String) });
    expect(rows.find((r) => r.title === "Họp 4")).toMatchObject({ status: "ENDED", endReason: "HOST_ENDED" });
  });

  it("KHÔNG LỘ nội dung: agenda, địa điểm, link/mật khẩu nền tảng, mã họp, người tham dự không có trong JSON — và mỗi dòng chỉ có đúng các trường cho phép", async () => {
    const res = await list();
    expect(res.status).toBe(200);
    const raw = JSON.stringify(res.body);
    for (const secret of [SECRET_AGENDA, SECRET_PLACE, SECRET_URL, "MAT-KHAU-BI-MAT", ...codes, w.u.D!, w.u.E!, "Người D", "Người E"]) expect(raw).not.toContain(secret);
    for (const row of res.body.data as Array<Record<string, unknown>>) {
      expect(Object.keys(row).sort()).toEqual(["attendeeCount", "cancelledAt", "endAt", "endReason", "host", "id", "platform", "startAt", "status", "timezone", "title"].sort());
    }
  });

  it("phân trang server: limit/page, hasNext/hasPrev; limit > 50 hoặc page < 1 → 400", async () => {
    const p1 = await list("?limit=3&page=1");
    expect([titles(p1), p1.body.meta]).toEqual([["Họp 2", "Họp 3", "Họp 1"], { page: 1, limit: 3, total: 4, totalPages: 2, hasNext: true, hasPrev: false }]);
    const p2 = await list("?limit=3&page=2");
    expect([titles(p2), p2.body.meta]).toEqual([["Họp 4"], { page: 2, limit: 3, total: 4, totalPages: 2, hasNext: false, hasPrev: true }]);
    expect((await list("?page=3&limit=3")).body.data).toEqual([]);
    expect((await list("?limit=51")).status).toBe(400);
    expect((await list("?page=0")).status).toBe(400);
  });

  it("lọc trạng thái (một giá trị, phân tách dấu phẩy, hoặc lặp tham số); giá trị lạ → 400", async () => {
    expect(titles(await list("?status=CANCELLED"))).toEqual(["Họp 3"]);
    expect(titles(await list("?status=SCHEDULED,ENDED"))).toEqual(["Họp 2", "Họp 1", "Họp 4"]);
    expect(titles(await list("?status=ENDED&status=CANCELLED"))).toEqual(["Họp 3", "Họp 4"]);
    const live = await list("?status=LIVE");
    expect([live.status, live.body.data, live.body.meta.total]).toEqual([200, [], 0]);
    expect((await list("?status=KHONG-CO")).status).toBe(400);
  });

  it("lọc khoảng thời gian BẮT ĐẦU [from, to] (hai đầu bao gồm); to < from → 400", async () => {
    const q = (from: Date, to: Date) => `?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
    expect(titles(await list(q(at(100), at(400))))).toEqual(["Họp 3", "Họp 1"]);
    expect(titles(await list(`?from=${encodeURIComponent(at(500).toISOString())}`))).toEqual(["Họp 2"]);
    expect(titles(await list(`?to=${encodeURIComponent(at(60).toISOString())}`))).toEqual(["Họp 4"]);
    const exact = (await prisma.meeting.findUnique({ where: { id: ids["Họp 3"]! } }))!.startAt;
    expect(titles(await list(q(exact, exact)))).toEqual(["Họp 3"]);
    expect((await list(q(at(400), at(100)))).status).toBe(400);
    expect((await list("?from=khong-phai-ngay")).status).toBe(400);
  });

  it("chỉ vai trò có workspace:view (admin, manager); người dùng thường → 403; chưa đăng nhập → 401", async () => {
    expect((await list("", "manager")).status).toBe(200);
    expect((await list("", "user")).status).toBe(403);
    expect((await request(app).get(`/api/v1/admin/workspaces/${w.workspaceId}/meetings`)).status).toBe(401);
  });

  it("workspace không tồn tại → 404; id sai dạng → 400; cờ meeting tắt → 404 CFG_005", async () => {
    expect((await adminGet(`/admin/workspaces/${newObjectId()}/meetings`)).status).toBe(404);
    expect((await adminGet("/admin/workspaces/khong-phai-objectid/meetings")).status).toBe(400);
    const { runtimeConfig } = await import("../../../../core/config/runtime-config");
    const spy = jest.spyOn(runtimeConfig, "isFeatureEnabled").mockResolvedValue(false);
    const off = await list();
    expect([off.status, off.body.error.code]).toEqual([404, "CFG_005"]);
    spy.mockRestore();
  });

  it("chỉ đọc: gọi endpoint không ghi audit và không tạo outbox; workspace chưa có cuộc họp → danh sách rỗng", async () => {
    const audits = await prisma.auditLog.count({ where: { workspaceId: w.workspaceId } });
    const outbox = await prisma.outboxEvent.count({ where: { aggregateType: "Meeting", aggregateId: { in: Object.values(ids) } } });
    await list();
    expect(await prisma.auditLog.count({ where: { workspaceId: w.workspaceId } })).toBe(audits);
    expect(await prisma.outboxEvent.count({ where: { aggregateType: "Meeting", aggregateId: { in: Object.values(ids) } } })).toBe(outbox);
    const empty = await seedWorld();
    worlds.push(empty);
    const res = await adminGet(`/admin/workspaces/${empty.workspaceId}/meetings`);
    expect([res.status, res.body.data, res.body.meta.total, res.body.meta.totalPages]).toEqual([200, [], 0, 1]);
  });
});
