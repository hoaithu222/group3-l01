import { installMocks, redisStore } from "./projects-test-mocks";
import { buildProjectsApp, cleanupGroups, makeApi, seedAsset, seedGroup, tokenFor, type Group } from "./projects-test-kit";
import { newObjectId } from "../../../../core/utils/object-id";
import { prisma } from "../../../../infrastructure/database";
import { createAssetAccessService } from "../../../assets/public";

const app = buildProjectsApp();
const api = makeApi(app);

describe("projects p3-03 — đính kèm thẻ/bình luận qua AssetLink (integration, Mongo memory replset)", () => {
  const groups: Group[] = [];
  let g: Group;
  let boardId: string;
  let taskId: string;

  beforeEach(async () => {
    installMocks();
    g = await seedGroup({ A: "OWNER", B: "ADMIN", C: "MEMBER", D: "MEMBER", X: "MEMBER", G: "GUEST" });
    groups.push(g);
    boardId = (await api("post", `/workspaces/${g.workspaceId}/boards`, tokenFor(g.ids.A), { name: "Đồ án" })).body.data.id;
    taskId = (await api("post", `/boards/${boardId}/tasks`, tokenFor(g.ids.C), { title: "Thẻ đính kèm" })).body.data.id;
  });
  afterEach(async () => {
    await cleanupGroups(groups.splice(0));
    redisStore.clear();
  });

  const as = (who: string) => tokenFor(g.ids[who]);
  const attach = (who: string, assetId: string) => api("post", `/tasks/${taskId}/attachments`, as(who), { assetId });

  it("POST: gắn asset READY của mình → 201 {attachment, attachmentCount}; AssetLink TASK (scope WORKSPACE, scopeId = workspaceId); count/version/activity/GET danh sách", async () => {
    const assetId = await seedAsset(g.workspaceId, g.ids.C, { originalName: "bao-cao.pdf" });
    const before = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    const res = await attach("C", assetId);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ attachmentCount: 1, attachment: { assetId, originalName: "bao-cao.pdf", mime: "application/pdf", size: 2048, kind: "FILE", attachedBy: g.ids.C, thumbnailUrl: null } });
    const link = await prisma.assetLink.findFirstOrThrow({ where: { assetId } });
    expect(link).toMatchObject({ targetType: "TASK", targetId: taskId, scopeType: "WORKSPACE", scopeId: g.workspaceId, createdBy: g.ids.C });
    expect(await prisma.task.findUniqueOrThrow({ where: { id: taskId } })).toMatchObject({ attachmentCount: 1, version: before.version + 1 });
    expect(await prisma.taskActivity.findFirst({ where: { taskId, type: "ATTACHMENT_ADDED" } })).toMatchObject({ after: { assetId, name: "bao-cao.pdf" } });

    const list = await api("get", `/tasks/${taskId}/attachments`, as("D"));
    expect(list.body.data.map((a: { assetId: string }) => a.assetId)).toEqual([assetId]);
    expect((await api("get", `/tasks/${taskId}/attachments`, as("G"))).status).toBe(404);
  });

  it("TASK_004 (400): asset của người khác / chưa READY / sai scope / đã gắn / không tồn tại; body sai → 400; GUEST 404", async () => {
    const other = await seedAsset(g.workspaceId, g.ids.D);
    const processing = await seedAsset(g.workspaceId, g.ids.C, { status: "PROCESSING" });
    const wrongScope = await seedAsset(g.workspaceId, g.ids.C, { scope: "MESSAGE" });
    const foreignWs = await seedAsset(newObjectId(), g.ids.C);
    const used = await seedAsset(g.workspaceId, g.ids.C);
    await attach("C", used);

    for (const assetId of [other, processing, wrongScope, foreignWs, used, newObjectId()]) {
      const res = await attach("C", assetId);
      expect([assetId, res.status, res.body.error.code]).toEqual([assetId, 400, "TASK_004"]);
    }
    expect((await api("post", `/tasks/${taskId}/attachments`, as("C"), { assetId: "rác" })).status).toBe(400);
    expect((await attach("G", await seedAsset(g.workspaceId, g.ids.G))).status).toBe(404);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: taskId } })).attachmentCount).toBe(1);
  });

  it("TASK_012 (409): thẻ đủ 10 tệp; gắn song song vượt trần → đếm KHÔNG vượt 10 (nguyên tử)", async () => {
    for (let i = 0; i < 8; i++) expect((await attach("C", await seedAsset(g.workspaceId, g.ids.C))).status).toBe(201);
    const racers = await Promise.all(Array.from({ length: 5 }, async () => attach("C", await seedAsset(g.workspaceId, g.ids.C))));
    expect(racers.filter((r) => r.status === 201)).toHaveLength(2);
    const limited = racers.filter((r) => r.status === 409);
    expect(limited).toHaveLength(3);
    expect(limited.every((r) => r.body.error.code === "TASK_012")).toBe(true);
    const t = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    expect(t.attachmentCount).toBe(10);
    expect(await prisma.assetLink.count({ where: { targetType: "TASK", targetId: taskId } })).toBe(10);
  }, 30_000);

  it("DELETE: người gắn hoặc OWNER/ADMIN → 204 (giảm đếm, gỡ AssetLink, ATTACHMENT_REMOVED); MEMBER khác 403; không có link/GUEST 404", async () => {
    const mine = await seedAsset(g.workspaceId, g.ids.C);
    const theirs = await seedAsset(g.workspaceId, g.ids.D);
    await attach("C", mine);
    await attach("D", theirs);

    expect((await api("delete", `/tasks/${taskId}/attachments/${mine}`, as("X"))).status).toBe(403);
    expect((await api("delete", `/tasks/${taskId}/attachments/${mine}`, as("G"))).status).toBe(404);
    expect((await api("delete", `/tasks/${taskId}/attachments/${newObjectId()}`, as("C"))).status).toBe(404);

    expect((await api("delete", `/tasks/${taskId}/attachments/${mine}`, as("C"))).status).toBe(204);
    expect((await api("delete", `/tasks/${taskId}/attachments/${theirs}`, as("B"))).status).toBe(204); // ADMIN gỡ tệp người khác
    expect((await prisma.task.findUniqueOrThrow({ where: { id: taskId } })).attachmentCount).toBe(0);
    expect(await prisma.assetLink.count({ where: { targetId: taskId } })).toBe(0);
    expect(await prisma.taskActivity.count({ where: { taskId, type: "ATTACHMENT_REMOVED" } })).toBe(2);
    // Asset vừa mất hết link có mốc `lastUnlinkedAt` để job dọn cho ân hạn (không xoá ngay).
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: mine } })).lastUnlinkedAt).not.toBeNull();
    expect((await api("delete", `/tasks/${taskId}/attachments/${mine}`, as("C"))).status).toBe(404);
  });

  it("bình luận có tệp (scope TASK_COMMENT): AssetLink TASK_COMMENT, attachmentCount, danh sách kèm attachments; xoá bình luận gỡ link; TASK_004 khi scope sai", async () => {
    const wrong = await seedAsset(g.workspaceId, g.ids.D, { scope: "TASK" });
    const bad = await api("post", `/tasks/${taskId}/comments`, as("D"), { clientCommentId: "client-comment-att-0", content: "kèm sai scope", attachmentAssetIds: [wrong] });
    expect([bad.status, bad.body.error.code]).toEqual([400, "TASK_004"]);

    const a = await seedAsset(g.workspaceId, g.ids.D, { scope: "TASK_COMMENT", originalName: "anh-man-hinh.pdf" });
    const created = await api("post", `/tasks/${taskId}/comments`, as("D"), { clientCommentId: "client-comment-att-1", content: "", attachmentAssetIds: [a] });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ content: "", attachmentCount: 1, attachments: [{ assetId: a, originalName: "anh-man-hinh.pdf" }] });
    expect(await prisma.assetLink.findFirstOrThrow({ where: { assetId: a } })).toMatchObject({ targetType: "TASK_COMMENT", targetId: created.body.data.id, scopeType: "WORKSPACE", scopeId: g.workspaceId });

    const list = await api("get", `/tasks/${taskId}/comments`, as("C"));
    expect(list.body.data[0].attachments.map((x: { assetId: string }) => x.assetId)).toEqual([a]);

    expect((await api("delete", `/task-comments/${created.body.data.id}`, as("D"))).status).toBe(204);
    expect(await prisma.assetLink.count({ where: { assetId: a } })).toBe(0);
    const after = await api("get", `/tasks/${taskId}/comments`, as("C"));
    expect(after.body.data[0]).toMatchObject({ attachments: [], attachmentCount: 0, content: "" });
  });

  it("PM2-24: sau khi bị loại khỏi workspace (hoặc là GUEST), người đó KHÔNG đọc được asset đính kèm thẻ/bình luận (assertRead → 404); thành viên còn lại đọc được", async () => {
    const onTask = await seedAsset(g.workspaceId, g.ids.C);
    const onComment = await seedAsset(g.workspaceId, g.ids.C, { scope: "TASK_COMMENT" });
    await attach("C", onTask);
    await api("post", `/tasks/${taskId}/comments`, as("C"), { clientCommentId: "client-comment-att-2", content: "có tệp", attachmentAssetIds: [onComment] });

    // X rời nhóm TRƯỚC khi có quyền nào được nạp vào cache (không cần gọi bumpVersion trong test).
    await prisma.workspaceMembership.updateMany({ where: { workspaceId: g.workspaceId, userId: g.ids.X }, data: { status: "REMOVED" } });

    const access = createAssetAccessService();
    const subject = (id: string) => ({ id, ownerId: g.ids.C, status: "READY" as const, parentAssetId: null });
    const user = (who: string) => ({ id: g.ids[who], email: `${g.ids[who]}@e.com` });
    for (const assetId of [onTask, onComment]) {
      await expect(access.assertRead(user("D"), subject(assetId))).resolves.toBeUndefined(); // thành viên khác
      await expect(access.assertRead(user("C"), subject(assetId))).resolves.toBeUndefined(); // chủ
      for (const who of ["X", "G"]) {
        await expect(access.assertRead(user(who), subject(assetId))).rejects.toMatchObject({ statusCode: 404 });
      }
    }
  });
});
