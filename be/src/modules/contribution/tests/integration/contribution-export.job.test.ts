import { installMocks, redisStore, storageObjects } from "./contribution-test-mocks";
import { buildRig, cleanupGroups, completedPayload, ensureContributionIndexes, makeApi, seedGroup, seedTask, tokenFor, type Group } from "./contribution-test-kit";
import { newObjectId } from "../../../../core/utils/object-id";
import { prisma } from "../../../../infrastructure/database";
import { extractPdfLines, extractPdfText, pdfPageCount } from "../support/pdf-text";
import { formatVerifyCode } from "../../services/export/verify-code";
import { createAssetSchema } from "../../../assets/dtos/create-asset.dto";

const rig = buildRig();
const api = makeApi(rig.app);
const c = rig.container;

describe("contribution — xuất PDF (PM2-36, Mongo memory replset, asset thật, storage giả trong bộ nhớ)", () => {
  const groups: Group[] = [];
  const setup = async () => {
    const g = await seedGroup({ A: "OWNER", C: "MEMBER", D: "MEMBER", G: "GUEST" });
    groups.push(g);
    await prisma.user.update({ where: { id: g.ids.C }, data: { name: "Nguyễn Văn Ưu", normalizedName: "nguyen van uu" } });
    await prisma.user.update({ where: { id: g.ids.D }, data: { name: "Đặng Thị Hoài Thu", normalizedName: "dang thi hoai thu" } });
    const due = new Date("2026-09-10T10:00:00Z");
    for (const [who, points] of [["C", 5], ["D", 3]] as const) {
      const completedAt = new Date("2026-09-10T08:00:00Z");
      const taskId = await seedTask(g, { assignees: [g.ids[who]], storyPoints: points, done: true, completedAt, dueDate: due });
      await c.factsService.onTaskCompleted(completedPayload(g, taskId, 1, { assigneeIds: [g.ids[who]], storyPoints: points, dueDate: due.toISOString(), completedAt: completedAt.toISOString() }));
    }
    return g;
  };

  beforeAll(async () => {
    await ensureContributionIndexes();
  });
  beforeEach(() => {
    installMocks();
    storageObjects.clear();
  });
  afterEach(async () => {
    await cleanupGroups(groups.splice(0));
    redisStore.clear();
    rig.queue.jobs = [];
  });

  const post = (g: Group, who: string, body: Record<string, unknown> = { period: "ALL" }) => api("post", `/boards/${g.boardId}/contribution/export`, tokenFor(g.ids[who]), body);
  const getExport = (g: Group, who: string, id: string, qs = "") => api("get", `/contribution-exports/${id}${qs}`, tokenFor(g.ids[who]));

  it("POST → 202 QUEUED + outbox; job → READY: PDF đúng dấu tiếng Việt, mã xác thực + sha256 ở chân, asset REPORT gắn CONTRIBUTION_EXPORT, thông báo cho người yêu cầu", async () => {
    const g = await setup();
    const res = await post(g, "C", { period: "ALL", includeHeatmap: true });
    expect(res.status).toBe(202);
    const { exportId } = res.body.data as { exportId: string; status: string };
    expect(await prisma.outboxEvent.count({ where: { aggregateType: "ContributionExport", aggregateId: exportId, jobName: "contribution.export", queue: "reports" } })).toBe(1);

    const queued = await getExport(g, "C", exportId);
    expect(queued.body.data).toMatchObject({ status: "QUEUED", periodKey: "ALL" });
    expect(queued.body.data.url).toBeUndefined();
    const early = await getExport(g, "C", exportId, "?download=1");
    expect([early.status, early.body.error.code]).toEqual([409, "CONTRIB_006"]);

    expect(await c.exportJobs.run(exportId)).toBe("READY");
    const rec = await prisma.contributionExport.findUnique({ where: { id: exportId } });
    expect(rec).toMatchObject({ status: "READY", memberCount: expect.any(Number) as number });
    expect(rec?.assetId).toEqual(expect.any(String));

    // Asset: scope REPORT, READY, gắn CONTRIBUTION_EXPORT → export.
    const asset = await prisma.asset.findUnique({ where: { id: rec!.assetId! } });
    expect(asset).toMatchObject({ scope: "REPORT", status: "READY", mime: "application/pdf", ownerId: g.ids.C, workspaceId: g.workspaceId, kind: "FILE" });
    expect(asset?.originalName).toMatch(/^dong-gop-sprint-1-all\.pdf$/);
    expect(await prisma.assetLink.count({ where: { assetId: asset!.id, targetType: "CONTRIBUTION_EXPORT", targetId: exportId } })).toBe(1);

    // PDF thật: %PDF, đủ dấu tiếng Việt, mã xác thực + sha256 rút gọn ở chân MỖI trang, sha256 đầy đủ ở khối xác thực.
    const pdf = storageObjects.get(asset!.storageKey)!;
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(asset?.checksum).toMatch(/^[0-9a-f]{64}$/);
    const text = extractPdfText(pdf);
    for (const expected of ["Báo cáo đóng góp", "Nguyễn Văn Ưu", "Đặng Thị Hoài Thu", "Kỳ báo cáo: Toàn bộ thời gian", "Hoạt động theo ngày — 26 tuần gần nhất"]) expect(text).toContain(expected);
    const short = `${rec!.dataHash.slice(0, 4)}…${rec!.dataHash.slice(-2)}`;
    const footers = extractPdfLines(pdf).filter((l) => l.includes("SHA-256") && l.includes("Trang"));
    expect(footers).toHaveLength(pdfPageCount(pdf));
    for (const f of footers) expect(f).toContain(`Mã xác thực ${formatVerifyCode(rec!.verifyCode)} · SHA-256 ${short}`);
    expect(text).toContain(rec!.dataHash.slice(0, 32));

    // Thông báo: đúng người, đúng loại, `refs` chỉ có id.
    const notification = await prisma.notification.findFirst({ where: { dedupeKey: `contribution.export-ready:export:${exportId}` } });
    expect(notification).toMatchObject({ type: "contribution.export-ready", workspaceId: g.workspaceId });
    expect(notification?.refs).toEqual({ exportId, boardId: g.boardId, workspaceId: g.workspaceId });
    const recipients = await prisma.notificationRecipient.findMany({ where: { notificationId: notification!.id } });
    expect(recipients.map((r) => r.recipientId)).toEqual([g.ids.C]);

    // Tải: thành viên khác của nhóm xin URL ký; người ngoài/khách 404 (kể cả xin thẳng URL asset).
    const url = await getExport(g, "D", exportId, "?download=1");
    expect(url.status).toBe(200);
    expect(url.body.data.url).toMatch(/^https?:\/\//);
    expect(url.body.data).toMatchObject({ status: "READY", verifyCode: rec!.verifyCode, dataHash: rec!.dataHash });
    for (const stranger of [tokenFor(newObjectId()), tokenFor(g.ids.G)]) {
      const denied = await api("get", `/contribution-exports/${exportId}?download=1`, stranger);
      expect([denied.status, denied.body.error.code]).toEqual([404, "PERM_404"]);
    }
    const linkRef = { assetId: asset!.id, targetType: "CONTRIBUTION_EXPORT", targetId: exportId, scopeType: "WORKSPACE", scopeId: g.workspaceId };
    expect(await c.assetReadResolver.canRead({ id: g.ids.D, email: "d@e.com" }, linkRef)).toBe(true);
    expect(await c.assetReadResolver.canRead({ id: g.ids.G, email: "g@e.com" }, linkRef)).toBe(false);
    expect(await c.assetReadResolver.canRead({ id: newObjectId(), email: "x@e.com" }, linkRef)).toBe(false);
  });

  it("dữ liệu không đổi → trả bản cũ (200), không job/asset mới; dữ liệu đổi → bản mới", async () => {
    const g = await setup();
    const first = await post(g, "C");
    await c.exportJobs.run(first.body.data.exportId);
    const again = await post(g, "D");
    expect([again.status, again.body.data]).toEqual([200, { exportId: first.body.data.exportId, status: "READY" }]);
    expect(await prisma.contributionExport.count({ where: { workspaceId: g.workspaceId } })).toBe(1);
    expect(await prisma.asset.count({ where: { workspaceId: g.workspaceId, scope: "REPORT" } })).toBe(1);

    const taskId = await seedTask(g, { assignees: [g.ids.D], storyPoints: 8, done: true, completedAt: new Date("2026-09-12T08:00:00Z") });
    await c.factsService.onTaskCompleted(completedPayload(g, taskId, 1, { assigneeIds: [g.ids.D], storyPoints: 8, completedAt: "2026-09-12T08:00:00.000Z" }));
    const changed = await post(g, "D");
    expect(changed.status).toBe(202);
    expect(changed.body.data.exportId).not.toBe(first.body.data.exportId);
  });

  it("xuất lần thứ 6 trong 1 giờ → 429; khoảng 5 lần đầu đều được nhận", async () => {
    const g = await setup();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) statuses.push((await post(g, "C")).status);
    expect(statuses).toEqual([202, 202, 202, 202, 202, 429]);
    const limited = await post(g, "C");
    expect(limited.body.error.code).toBe("RATE_002");
    // Giới hạn tính theo (người, bảng): người khác vẫn xuất được.
    expect((await post(g, "D")).status).toBe(202);
  });

  it("kỳ sai → 400 CONTRIB_003; khách/người ngoài không xuất được (404) và không tạo bản ghi", async () => {
    const g = await setup();
    const bad = await post(g, "C", { period: "W:2025-W53" });
    expect([bad.status, bad.body.error.code]).toEqual([400, "CONTRIB_003"]);
    const strangerPost = await api("post", `/boards/${g.boardId}/contribution/export`, tokenFor(newObjectId()), { period: "ALL" });
    expect(strangerPost.status).toBe(404);
    const guestPost = await post(g, "G");
    expect(guestPost.status).toBe(404);
    expect(await prisma.contributionExport.count({ where: { workspaceId: g.workspaceId } })).toBe(0);
  });

  it("hết hạn 30 ngày → 410 CONTRIB_005; cron dọn gỡ AssetLink, đặt EXPIRED và nhả khoá để xuất lại", async () => {
    const g = await setup();
    const first = await post(g, "C");
    const id = first.body.data.exportId as string;
    await c.exportJobs.run(id);
    const rec = await prisma.contributionExport.findUnique({ where: { id } });
    await prisma.contributionExport.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 60_000) } });

    const expired = await getExport(g, "C", id, "?download=1");
    expect([expired.status, expired.body.error.code]).toEqual([410, "CONTRIB_005"]);
    expect(await c.exportJobs.expireDue()).toBe(1);
    expect(await prisma.contributionExport.findUnique({ where: { id } })).toMatchObject({ status: "EXPIRED", dedupeKey: `expired:${id}` });
    expect(await prisma.assetLink.count({ where: { targetType: "CONTRIBUTION_EXPORT", targetId: id } })).toBe(0);
    expect((await prisma.asset.findUnique({ where: { id: rec!.assetId! } }))?.lastUnlinkedAt).not.toBeNull();
    expect(await c.exportJobs.expireDue()).toBe(0);

    const renewed = await post(g, "C");
    expect(renewed.status).toBe(202);
    expect(renewed.body.data.exportId).not.toBe(id);
  });

  it("lỗi cuối → FAILED + thông báo FAILED (không dữ liệu), nhả khoá; job chạy lại sau khi READY bị bỏ qua", async () => {
    const g = await setup();
    const first = await post(g, "C");
    const id = first.body.data.exportId as string;
    await c.exportJobs.fail(id, new Error("Nguyễn Văn Ưu có điểm 91"));
    const rec = await prisma.contributionExport.findUnique({ where: { id } });
    expect(rec).toMatchObject({ status: "FAILED", error: "Không tạo được báo cáo", dedupeKey: `failed:${id}` });
    const failed = await prisma.notification.findFirst({ where: { dedupeKey: `contribution.export-failed:export:${id}` } });
    expect(failed?.type).toBe("contribution.export-failed");
    expect(JSON.stringify(failed)).not.toMatch(/Nguyễn|điểm/);
    expect(await c.exportJobs.run(id)).toBe("SKIPPED");
    expect(await prisma.asset.count({ where: { workspaceId: g.workspaceId } })).toBe(0);
    const retry = await post(g, "C");
    expect(retry.status).toBe(202);
  });

  it("client KHÔNG tạo được asset scope REPORT qua POST /assets (chỉ server)", () => {
    const body = { scope: "REPORT", kind: "FILE", fileName: "x.pdf", mime: "application/pdf", size: 1024 };
    expect(createAssetSchema.safeParse(body).success).toBe(false);
    expect(createAssetSchema.safeParse({ ...body, scope: "TASK" }).success).toBe(true);
  });
});
