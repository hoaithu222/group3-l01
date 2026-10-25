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
import { maskStorageKey } from "../../services/admin-recording.service";
import { cleanupWorld, ensureMeetingIndexes, idemKey, installHarness, makeApi, meetingBody, seedWorld, slot, type World } from "./meetings-test-kit";
import { FakeCapability, FakeRecordingStorage, seedAsset } from "./recap-recording-test-kit";

/**
 * `/admin/recordings*` (p2-06 admin.md, D-24): admin nền tảng CHỈ thấy metadata vận hành. Trọng tâm là "không lộ nội dung": mã họp, khoá object, danh sách người đồng ý, URL ký
 * phải THỰC SỰ vắng khỏi JSON; không có endpoint phát/tải; xoá bắt buộc lý do + audit và chỉ `admin` (không phải `manager`).
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

type Role = "admin" | "manager" | "user";
const adminId = newObjectId();
const tokenOf = (role: Role, userId = adminId): string => JwtUtils.generateAccessToken({ userId, email: `${userId}@e.com`, name: "Admin", role, sv: 1 });
const call = (method: "get" | "delete", path: string, role: Role | null = "admin") => {
  const req = request(app)[method](`/api/v1${path}`);
  return role ? req.set("Authorization", `Bearer ${tokenOf(role)}`) : req;
};
const DAY = 86_400_000;

describe("admin — bản ghi hình cuộc họp (integration, Mongo memory replset)", () => {
  const worlds: World[] = [];
  let w: World;
  let other: World;
  let storage: FakeRecordingStorage;
  let meeting: { id: string; code: string };
  const ids: Record<string, string> = {};

  const rec = async (name: string, over: Record<string, unknown> = {}, world: World = w, meetingId = meeting.id) => {
    const created = await prisma.meetingRecording.create({
      data: {
        meetingId,
        workspaceId: world.workspaceId,
        callId: newObjectId(),
        requestId: "req",
        layout: "GRID",
        status: "READY",
        storageKey: `recordings/${world.workspaceId}/${meetingId}/${newObjectId()}.mp4`,
        startedBy: world.u.C!,
        consentSnapshot: [{ userId: world.u.D!, at: new Date(), lateJoin: false }, { userId: world.u.E!, at: new Date(), lateJoin: true }],
        fileSizeBytes: 1_000_000,
        durationSec: 600,
        stoppedAt: new Date(),
        retentionExpiresAt: new Date(Date.now() + 60 * DAY),
        deletedAt: null,
        ...over,
      },
    });
    ids[name] = created.id;
    return created;
  };

  beforeAll(async () => {
    await ensureMeetingIndexes();
  });

  beforeEach(async () => {
    installMocks();
    storage = new FakeRecordingStorage();
    installHarness({ recordingStorage: storage, recordingCapability: new FakeCapability() });
    w = await seedWorld();
    other = await seedWorld();
    worlds.push(w, other);
    const created = await userApi("post", `/workspaces/${w.workspaceId}/meetings`, w.u.C!, meetingBody({ title: "Họp bí mật quý 3", ...slot(60), agenda: "AGENDA-KHONG-DUOC-LO" }), idemKey());
    meeting = created.body.data as { id: string; code: string };
    const otherMeeting = await userApi("post", `/workspaces/${other.workspaceId}/meetings`, other.u.C!, meetingBody({ title: "Họp workspace khác", ...slot(60) }), idemKey());

    await rec("ready-big", { fileSizeBytes: 5_000_000, durationSec: 3000, startedAt: new Date(Date.now() - 3 * DAY) });
    await rec("ready-small", { fileSizeBytes: 1_000_000, durationSec: 100, retentionExpiresAt: new Date(Date.now() + 5 * DAY), startedAt: new Date(Date.now() - 2 * DAY) });
    await rec("failed", { status: "FAILED", fileSizeBytes: null, durationSec: null, error: "Egress ghi hình kết thúc mà không có tệp", startedAt: new Date(Date.now() - DAY) });
    await rec("recording", { status: "RECORDING", fileSizeBytes: null, durationSec: null, retentionExpiresAt: null, stoppedAt: null });
    await rec("deleted", { deletedAt: new Date(), deleteReason: "Xoá theo yêu cầu người dùng" });
    await rec("other", {}, other, otherMeeting.body.data.id as string);
  });

  afterEach(async () => {
    const all = await prisma.meetingRecording.findMany({ where: { workspaceId: { in: worlds.map((x) => x.workspaceId) } }, select: { id: true } });
    await prisma.assetLink.deleteMany({ where: { targetId: { in: all.map((r) => r.id) } } });
    await prisma.asset.deleteMany({ where: { workspaceId: { in: worlds.map((x) => x.workspaceId) } } });
    await prisma.outboxEvent.deleteMany({ where: { aggregateType: "MeetingRecording", aggregateId: { in: all.map((r) => r.id) } } });
    await prisma.meetingRecording.deleteMany({ where: { id: { in: all.map((r) => r.id) } } });
    await cleanupWorld(worlds.splice(0));
    redisStore.clear();
  });

  it("quyền: admin xem/xoá; manager chỉ xem (xoá 403); người dùng thường 403; chưa đăng nhập 401", async () => {
    expect((await call("get", "/admin/recordings")).status).toBe(200);
    expect((await call("get", "/admin/recordings", "manager")).status).toBe(200);
    expect((await call("get", "/admin/recordings/summary", "manager")).status).toBe(200);
    expect((await call("get", `/admin/recordings/${ids["ready-big"]}`, "manager")).status).toBe(200);
    expect((await call("delete", `/admin/recordings/${ids["ready-big"]}?reason=Ly+do+du+dai+de+xoa`, "manager")).status).toBe(403);
    expect((await call("get", "/admin/recordings", "user")).status).toBe(403);
    expect((await call("delete", `/admin/recordings/${ids["ready-big"]}?reason=Ly+do+du+dai+de+xoa`, "user")).status).toBe(403);
    expect((await call("get", "/admin/recordings", null)).status).toBe(401);
    expect(await prisma.meetingRecording.findUniqueOrThrow({ where: { id: ids["ready-big"]! } })).toMatchObject({ deletedAt: null });
  });

  it("KHÔNG lộ nội dung: không mã họp, agenda, khoá object, danh sách người đồng ý, URL/liên kết ký, thẻ video; chỉ tiêu đề + metadata vận hành", async () => {
    const list = await call("get", `/admin/recordings?workspaceId=${w.workspaceId}`);
    const json = JSON.stringify(list.body);
    for (const secret of [meeting.code, "AGENDA-KHONG-DUOC-LO", "storageKey", "consentSnapshot", w.u.D!, w.u.E!, "http", "signed", "url\""]) expect(json).not.toContain(secret);
    const row = list.body.data.find((r: { id: string }) => r.id === ids["ready-big"]);
    expect(row).toMatchObject({ meeting: { id: meeting.id, title: "Họp bí mật quý 3" }, workspace: { id: w.workspaceId }, startedBy: { id: w.u.C, name: "Người C" }, status: "READY", fileSizeBytes: 5_000_000, durationSec: 3000, layout: "GRID" });
    expect(Object.keys(row).sort()).toEqual(["deleteReason", "deletedAt", "durationSec", "error", "fileSizeBytes", "id", "layout", "meeting", "retentionDaysLeft", "retentionExpiresAt", "startedAt", "startedBy", "status", "stoppedAt", "workspace"].sort());

    const detail = await call("get", `/admin/recordings/${ids["ready-big"]}`);
    const dj = JSON.stringify(detail.body);
    for (const secret of [meeting.code, "AGENDA-KHONG-DUOC-LO", "consentSnapshot", w.u.D!, w.u.E!, "http"]) expect(dj).not.toContain(secret);
    expect(detail.body.data).toMatchObject({ consentCount: 2, storageKeyMasked: expect.stringMatching(/^recordings\/…\/[a-f0-9]{24}\.mp4$/), egressId: null });
    expect(detail.body.data.storageKeyMasked).not.toContain(w.workspaceId);
    expect((await call("get", `/admin/recordings/${ids["ready-big"]}/url`)).status).toBe(404); // không có endpoint URL ký
    expect((await call("get", `/admin/recordings/${ids["ready-big"]}/download`)).status).toBe(404);
  });

  it("danh sách: phân trang server + lọc trạng thái (CSV), workspace, khoảng ngày, sắp hết hạn, bao gồm đã xoá; sắp xếp theo dung lượng/thời lượng/hạn", async () => {
    const all = await call("get", "/admin/recordings?limit=2&page=1");
    expect(all.body.meta).toMatchObject({ page: 1, limit: 2, total: 5, totalPages: 3, hasNext: true }); // 6 bản − 1 đã xoá
    expect(all.body.data).toHaveLength(2);
    const ready = await call("get", `/admin/recordings?status=READY&workspaceId=${w.workspaceId}&sort=-fileSizeBytes`);
    expect(ready.body.data.map((r: { id: string }) => r.id)).toEqual([ids["ready-big"], ids["ready-small"]]);
    const csv = await call("get", `/admin/recordings?status=FAILED,RECORDING&workspaceId=${w.workspaceId}`);
    expect(csv.body.data.map((r: { status: string }) => r.status).sort()).toEqual(["FAILED", "RECORDING"]);
    const soon = await call("get", `/admin/recordings?expiringWithinDays=7&workspaceId=${w.workspaceId}`);
    expect(soon.body.data.map((r: { id: string }) => r.id)).toEqual([ids["ready-small"]]);
    expect(soon.body.data[0].retentionDaysLeft).toBeLessThanOrEqual(5);
    const withDeleted = await call("get", `/admin/recordings?includeDeleted=true&workspaceId=${w.workspaceId}`);
    expect(withDeleted.body.data).toHaveLength(5);
    expect(withDeleted.body.data.find((r: { id: string }) => r.id === ids["deleted"])).toMatchObject({ deleteReason: "Xoá theo yêu cầu người dùng" });
    const range = await call("get", `/admin/recordings?workspaceId=${w.workspaceId}&from=${new Date(Date.now() - 2.5 * DAY).toISOString()}&to=${new Date(Date.now() - 1.5 * DAY).toISOString()}`);
    expect(range.body.data.map((r: { id: string }) => r.id)).toEqual([ids["ready-small"]]);
    expect((await call("get", "/admin/recordings?status=NOPE")).status).toBe(400);
    expect((await call("get", "/admin/recordings?limit=1000")).status).toBe(400);
  });

  it("lọc theo meetingId (drawer cuộc họp): chỉ bản ghi của cuộc họp đó (chưa xoá), kết hợp được với status; id sai định dạng → 400; họp không có bản ghi → rỗng", async () => {
    const mine = await call("get", `/admin/recordings?meetingId=${meeting.id}&sort=-fileSizeBytes`);
    expect(mine.status).toBe(200);
    expect(mine.body.data.map((r: { id: string }) => r.id).sort()).toEqual([ids["ready-big"], ids["ready-small"], ids["failed"], ids["recording"]].sort());
    expect(mine.body.data.every((r: { meeting: { id: string } }) => r.meeting.id === meeting.id)).toBe(true);
    expect(mine.body.meta.total).toBe(4); // 5 bản ghi của họp này − 1 đã xoá; bản của workspace khác không lẫn vào
    expect(mine.body.data.map((r: { id: string }) => r.id)).not.toContain(ids["other"]);

    const failedOnly = await call("get", `/admin/recordings?meetingId=${meeting.id}&status=FAILED`);
    expect(failedOnly.body.data.map((r: { id: string }) => r.id)).toEqual([ids["failed"]]);
    expect((await call("get", "/admin/recordings?meetingId=khong-phai-objectid")).status).toBe(400);
    expect((await call("get", `/admin/recordings?meetingId=${newObjectId()}`)).body.data).toEqual([]);
  });

  it("tóm tắt: tổng dung lượng READY chưa xoá, số READY, sắp hết hạn 7 ngày, lỗi 24 giờ, dung lượng 30 ngày trước (kể cả bản xoá SAU mốc đó); lọc theo workspace", async () => {
    const now = Date.now();
    await rec("old-live", { fileSizeBytes: 2_000_000, stoppedAt: new Date(now - 40 * DAY), startedAt: new Date(now - 40 * DAY) });
    await rec("old-deleted-late", { fileSizeBytes: 3_000_000, stoppedAt: new Date(now - 40 * DAY), deletedAt: new Date(now - 10 * DAY), deleteReason: "Dọn dẹp" });
    await rec("old-deleted-early", { fileSizeBytes: 4_000_000, stoppedAt: new Date(now - 60 * DAY), deletedAt: new Date(now - 45 * DAY), deleteReason: "Dọn dẹp cũ" });
    const summary = await call("get", `/admin/recordings/summary?workspaceId=${w.workspaceId}`);
    expect(summary.body.data).toEqual({
      recordingStorageBytes: 8_000_000, // big 5M + small 1M + old-live 2M (đã xoá không tính)
      storageBytes30dAgo: 5_000_000, // old-live 2M + old-deleted-late 3M (xoá sau mốc 30 ngày); old-deleted-early đã xoá trước mốc
      readyCount: 3,
      expiringIn7d: 1,
      failed24h: 1,
    });
    const global = await call("get", "/admin/recordings/summary");
    expect(global.body.data.recordingStorageBytes).toBe(9_000_000); // cộng bản của workspace khác (1M)
  });

  it("xoá: bắt buộc lý do 10–500 ký tự; bản đang ghi 409 MEET_009; không thấy 404 REC_005; thành công → xoá mềm + gỡ asset/link + hẹn xoá object + audit (admin, có lý do); lặp lại 404", async () => {
    const id = ids["ready-big"]!;
    const asset = await seedAsset(w.u.C!, w.workspaceId);
    await prisma.asset.update({ where: { id: asset }, data: { scope: "RECORDING" } });
    await prisma.meetingRecording.update({ where: { id }, data: { assetId: asset } });
    await prisma.assetLink.create({ data: { assetId: asset, targetType: "MEETING_RECORDING", targetId: id, scopeType: "MEETING", scopeId: meeting.id, createdBy: w.u.C! } });

    expect((await call("delete", `/admin/recordings/${id}`)).status).toBe(400); // thiếu lý do
    expect((await call("delete", `/admin/recordings/${id}?reason=ngan`)).status).toBe(400);
    const busy = await call("delete", `/admin/recordings/${ids["recording"]}?reason=Ban+dang+ghi+khong+duoc+xoa`);
    expect([busy.status, busy.body.error.code]).toEqual([409, "MEET_009"]);
    const missing = await call("delete", `/admin/recordings/${newObjectId()}?reason=Khong+co+ban+ghi+nay+dau`);
    expect([missing.status, missing.body.error.code]).toEqual([404, "REC_005"]);

    const reason = "Yêu cầu của chủ nhóm về quyền riêng tư";
    const ok = await call("delete", `/admin/recordings/${id}?reason=${encodeURIComponent(reason)}`);
    expect(ok.status).toBe(204);
    expect(await prisma.meetingRecording.findUniqueOrThrow({ where: { id } })).toMatchObject({ deletedBy: adminId, deleteReason: reason });
    expect((await prisma.meetingRecording.findUniqueOrThrow({ where: { id } })).deletedAt).not.toBeNull();
    expect(await prisma.asset.findUniqueOrThrow({ where: { id: asset } })).toMatchObject({ status: "DELETED" });
    expect(await prisma.assetLink.count({ where: { targetId: id } })).toBe(0);
    expect((await prisma.outboxEvent.findFirstOrThrow({ where: { jobName: "recording.storage-delete", aggregateId: id } })).payload).toMatchObject({ recordingId: id });
    expect(await prisma.auditLog.findFirst({ where: { action: "recording.delete", targetId: id } })).toMatchObject({ actorId: adminId, reason, workspaceId: w.workspaceId, metadata: expect.objectContaining({ byAdmin: true }) });
    expect((await call("delete", `/admin/recordings/${id}?reason=${encodeURIComponent(reason)}`)).status).toBe(404);
    expect((await call("get", "/admin/recordings?status=READY&workspaceId=" + w.workspaceId)).body.data.map((r: { id: string }) => r.id)).toEqual([ids["ready-small"]]);
  });

  it("chi tiết: trạng thái object từ HEAD (tồn tại/không), che khoá object; 404 REC_005 khi không có", async () => {
    const id = ids["ready-small"]!;
    const key = (await prisma.meetingRecording.findUniqueOrThrow({ where: { id } })).storageKey;
    expect((await call("get", `/admin/recordings/${id}`)).body.data.object).toEqual({ exists: false, sizeBytes: null });
    storage.put(key, 999);
    expect((await call("get", `/admin/recordings/${id}`)).body.data.object).toEqual({ exists: true, sizeBytes: 999 });
    const missing = await call("get", `/admin/recordings/${newObjectId()}`);
    expect([missing.status, missing.body.error.code]).toEqual([404, "REC_005"]);
    expect(maskStorageKey("recordings/aaa/bbb/ccc.mp4")).toBe("recordings/…/ccc.mp4");
    expect(maskStorageKey("a.mp4")).toBe("a.mp4");
  });
});
