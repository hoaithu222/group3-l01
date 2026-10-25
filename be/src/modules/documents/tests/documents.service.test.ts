// Redis mock có `incr/expire` mà `permissionService.bumpVersion` cần; `get/set` trả undefined → cache quyền luôn "miss" (test thấy trạng thái thật).
jest.mock("../../../infrastructure/redis", () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), incr: jest.fn(), expire: jest.fn(), ping: jest.fn() },
}));
// Trần mỗi nhóm thấp để test DOC_001 mà không phải tạo 500 tài liệu.
jest.mock("../services/document-limits", () => ({
  getDocumentLimits: jest.fn().mockResolvedValue({ titleMax: 200, collaboratorsMax: 3, concurrentEditorsMax: 50, snapshotsAuto: 3, snapshotsManualMax: 2, perWorkspaceMax: 3 }),
}));

import { encodeCursor } from "../../../core/utils/cursor";
import { DocumentsHarness } from "./support/documents-harness";
import { getDocumentLimits } from "../services/document-limits";

let h: DocumentsHarness;
beforeEach(() => {
  h = new DocumentsHarness();
  (getDocumentLimits as jest.Mock).mockResolvedValue({ titleMax: 200, collaboratorsMax: 3, concurrentEditorsMax: 50, snapshotsAuto: 3, snapshotsManualMax: 2, perWorkspaceMax: 3 });
});
afterEach(() => h.dispose());

const make = (over: Partial<{ title: string; visibility: "WORKSPACE" | "PRIVATE" }> = {}) => ({ title: "Báo cáo", visibility: "WORKSPACE" as const, ...over });

describe("tạo tài liệu", () => {
  it("MEMBER tạo → người tạo có toàn quyền, myRole CREATOR, ghi outbox document.updated + audit (không có tiêu đề trong audit)", async () => {
    const alice = h.addUser("MEMBER");
    const doc = await h.service.create(alice, h.workspaceId, make());
    expect(doc).toMatchObject({ title: "Báo cáo", visibility: "WORKSPACE", status: "ACTIVE", myRole: "CREATOR", version: 1, yjsVersion: 0, myPermissions: { edit: true, manage: true, snapshot: true, restore: true } });
    expect(h.outbox.events.map((e) => e.jobName)).toEqual(["document.events"]);
    expect(h.outbox.events[0]?.dedupeKey).toBe(`document.updated:${doc.id}:v1`);
    expect(h.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "document.create", targetId: doc.id, workspaceId: h.workspaceId }));
    expect(JSON.stringify(h.audit.record.mock.calls)).not.toContain("Báo cáo");
  });

  it("GUEST / người ngoài nhóm → 404; nhóm ARCHIVED → 403 WS_002; quá số tài liệu → 409 DOC_001", async () => {
    const guest = h.addUser("GUEST");
    const outsider = h.addUser(null);
    await expect(h.service.create(guest, h.workspaceId, make())).rejects.toMatchObject({ statusCode: 404 });
    await expect(h.service.create(outsider, h.workspaceId, make())).rejects.toMatchObject({ statusCode: 404 });

    const member = h.addUser("MEMBER");
    for (let i = 0; i < 3; i += 1) await h.service.create(member, h.workspaceId, make({ title: `T${i}` }));
    await expect(h.service.create(member, h.workspaceId, make())).rejects.toMatchObject({ statusCode: 409, errorCode: "DOC_001", details: { max: 3 } });

    h.setWorkspaceStatus("ARCHIVED");
    await expect(h.service.create(member, h.workspaceId, make())).rejects.toMatchObject({ statusCode: 403, errorCode: "WS_002" });
  });
});

describe("xem + danh sách theo vai (CW-D2)", () => {
  it("PRIVATE: OWNER nhóm không phải cộng tác viên nhận 404 (cả GET lẫn danh sách); người tạo và cộng tác viên thấy", async () => {
    const owner = h.addUser("OWNER");
    const creator = h.addUser("MEMBER");
    const viewer = h.addUser("MEMBER");
    const priv = await h.service.create(creator, h.workspaceId, make({ title: "Riêng", visibility: "PRIVATE" }));
    await h.collaborators.add(creator, priv.id, { userIds: [viewer.id], role: "VIEWER" });

    await expect(h.service.get(owner, priv.id)).rejects.toMatchObject({ statusCode: 404 });
    expect((await h.service.list(owner, h.workspaceId, { limit: 30, status: "ACTIVE" })).data).toHaveLength(0);
    expect((await h.service.get(creator, priv.id)).myRole).toBe("CREATOR");
    const asViewer = await h.service.get(viewer, priv.id);
    expect(asViewer).toMatchObject({ myRole: "VIEWER", myPermissions: { edit: false, manage: false, snapshot: false, restore: false } });
    expect((await h.service.list(viewer, h.workspaceId, { limit: 30, status: "ACTIVE" })).data.map((d) => d.id)).toEqual([priv.id]);
  });

  it("WORKSPACE: mọi MEMBER+ thấy; khách chỉ thấy khi được mời (VIEWER: chỉ đọc; EDITOR: sửa được)", async () => {
    const creator = h.addUser("MEMBER");
    const member = h.addUser("MEMBER");
    const guest = h.addUser("GUEST");
    const guest2 = h.addUser("GUEST");
    const doc = await h.service.create(creator, h.workspaceId, make());
    expect((await h.service.get(member, doc.id)).myPermissions).toEqual({ edit: true, manage: false, snapshot: true, restore: true });
    await expect(h.service.get(guest, doc.id)).rejects.toMatchObject({ statusCode: 404 });
    expect((await h.service.list(guest, h.workspaceId, { limit: 30, status: "ACTIVE" })).data).toHaveLength(0);

    await h.collaborators.add(creator, doc.id, { userIds: [guest.id], role: "EDITOR" });
    await h.collaborators.add(creator, doc.id, { userIds: [guest2.id], role: "VIEWER" });
    expect((await h.service.get(guest, doc.id)).myPermissions.edit).toBe(true);
    expect((await h.service.get(guest2, doc.id)).myPermissions.edit).toBe(false);
    expect((await h.service.list(guest2, h.workspaceId, { limit: 30, status: "ACTIVE" })).data).toHaveLength(1);
  });

  it("phân trang cursor theo updatedAt desc, tìm theo tên không dấu, lọc trạng thái", async () => {
    const alice = h.addUser("MEMBER");
    (getDocumentLimits as jest.Mock).mockResolvedValue({ titleMax: 200, collaboratorsMax: 3, concurrentEditorsMax: 50, snapshotsAuto: 3, snapshotsManualMax: 2, perWorkspaceMax: 10 });
    const titles = ["Kế hoạch tuần", "Báo cáo tháng", "Biên bản họp", "Đề cương"];
    for (const title of titles) {
      h.advance(1000);
      await h.service.create(alice, h.workspaceId, make({ title }));
    }
    const p1 = await h.service.list(alice, h.workspaceId, { limit: 3, status: "ACTIVE" });
    expect(p1.data.map((d) => d.title)).toEqual(["Đề cương", "Biên bản họp", "Báo cáo tháng"]);
    expect(p1).toMatchObject({ hasMore: true, limit: 3 });
    const p2 = await h.service.list(alice, h.workspaceId, { limit: 3, status: "ACTIVE", cursor: p1.nextCursor ?? "" });
    expect(p2.data.map((d) => d.title)).toEqual(["Kế hoạch tuần"]);
    expect(p2.hasMore).toBe(false);

    expect((await h.service.list(alice, h.workspaceId, { limit: 30, status: "ACTIVE", q: "de cuong" })).data.map((d) => d.title)).toEqual(["Đề cương"]);
    const target = p1.data[0];
    await h.service.archive(alice, target?.id ?? "", {});
    expect((await h.service.list(alice, h.workspaceId, { limit: 30, status: "ARCHIVED" })).data.map((d) => d.id)).toEqual([target?.id]);
    await expect(h.service.list(alice, h.workspaceId, { limit: 30, status: "ACTIVE", cursor: "hỏng" })).rejects.toMatchObject({ statusCode: 400 });
    expect(encodeCursor(new Date(), "x")).toBeTruthy();
  });
});

describe("đổi tên / visibility", () => {
  it("đổi tên tăng version, chuẩn hoá tiêu đề tìm kiếm; expectedVersion lệch → 409 RES_003", async () => {
    const alice = h.addUser("MEMBER");
    const doc = await h.service.create(alice, h.workspaceId, make());
    const renamed = await h.service.update(alice, doc.id, { title: "Đề án mới", expectedVersion: 1 });
    expect(renamed).toMatchObject({ title: "Đề án mới", version: 2 });
    expect(h.docs.rows.get(doc.id)?.normalizedTitle).toBe("de an moi");
    await expect(h.service.update(alice, doc.id, { title: "X", expectedVersion: 1 })).rejects.toMatchObject({ statusCode: 409, errorCode: "RES_003", details: { currentVersion: 2 } });
  });

  it("chỉ người tạo hoặc quản trị nhóm đổi tên; MEMBER khác → 403; người ngoài → 404", async () => {
    const creator = h.addUser("MEMBER");
    const other = h.addUser("MEMBER");
    const admin = h.addUser("ADMIN");
    const doc = await h.service.create(creator, h.workspaceId, make());
    await expect(h.service.update(other, doc.id, { title: "Hack", expectedVersion: 1 })).rejects.toMatchObject({ statusCode: 403 });
    expect((await h.service.update(admin, doc.id, { title: "Do admin", expectedVersion: 1 })).title).toBe("Do admin");
  });

  it("PRIVATE → WORKSPACE cần confirmPublic (DOC_002); WORKSPACE → PRIVATE chỉ người tạo (quản trị khác 403)", async () => {
    const creator = h.addUser("MEMBER");
    const admin = h.addUser("ADMIN");
    const doc = await h.service.create(creator, h.workspaceId, make({ visibility: "PRIVATE" }));
    await expect(h.service.update(creator, doc.id, { visibility: "WORKSPACE", expectedVersion: 1 })).rejects.toMatchObject({ statusCode: 400, errorCode: "DOC_002" });
    expect((await h.service.update(creator, doc.id, { visibility: "WORKSPACE", confirmPublic: true, expectedVersion: 1 })).visibility).toBe("WORKSPACE");
    await expect(h.service.update(admin, doc.id, { visibility: "PRIVATE", expectedVersion: 2 })).rejects.toMatchObject({ statusCode: 403 });
  });

  it("đổi sang PRIVATE: thành viên không phải người tạo/cộng tác viên mất quyền NGAY (permission:revoked + 404), cộng tác viên giữ", async () => {
    const creator = h.addUser("MEMBER");
    const keeper = h.addUser("MEMBER");
    const lost = h.addUser("MEMBER");
    const owner = h.addUser("OWNER");
    const doc = await h.service.create(creator, h.workspaceId, make());
    await h.collaborators.add(creator, doc.id, { userIds: [keeper.id], role: "EDITOR" });
    expect((await h.service.get(lost, doc.id)).id).toBe(doc.id);

    await h.service.update(creator, doc.id, { visibility: "PRIVATE", expectedVersion: 1 });
    await expect(h.service.get(lost, doc.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(h.service.get(owner, doc.id)).rejects.toMatchObject({ statusCode: 404 });
    expect((await h.service.get(keeper, doc.id)).myRole).toBe("EDITOR");
    const revokedIds = h.revoked.flatMap((r) => r.userIds);
    expect(revokedIds).toEqual(expect.arrayContaining([lost.id, owner.id]));
    expect(revokedIds).not.toContain(keeper.id);
    expect(revokedIds).not.toContain(creator.id);
  });
});

describe("lưu trữ / khôi phục lưu trữ", () => {
  it("archive: chỉ xem (edit=false), đóng kết nối soạn (outbox access-revoked archived), không đổi tên khi đang lưu trữ (DOC_005); idempotent", async () => {
    const alice = h.addUser("MEMBER");
    const member = h.addUser("MEMBER");
    const doc = await h.service.create(alice, h.workspaceId, make());
    h.outbox.events.length = 0;

    const archived = await h.service.archive(alice, doc.id, { reason: "Hết kỳ" });
    expect(archived).toMatchObject({ status: "ARCHIVED", version: 2, myPermissions: { edit: false, manage: true, snapshot: false, restore: false } });
    expect((await h.service.get(member, doc.id)).myPermissions.edit).toBe(false);
    expect(h.outbox.events.map((e) => e.jobName).sort()).toEqual(["document.access-revoked", "document.events"]);
    expect(h.outbox.events.find((e) => e.jobName === "document.access-revoked")?.payload).toMatchObject({ documentId: doc.id, reason: "archived" });
    expect(h.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "document.archive", reason: "Hết kỳ" }));
    await expect(h.service.update(alice, doc.id, { title: "X", expectedVersion: 2 })).rejects.toMatchObject({ statusCode: 403, errorCode: "DOC_005" });
    expect((await h.service.archive(alice, doc.id, {})).version).toBe(2);
  });

  it("MEMBER không phải người tạo không lưu trữ được (403); khôi phục: ACTIVE lại, nối lại để lấy quyền sửa; nhóm đã đủ số tài liệu → DOC_001", async () => {
    const creator = h.addUser("MEMBER");
    const other = h.addUser("MEMBER");
    const doc = await h.service.create(creator, h.workspaceId, make());
    await expect(h.service.archive(other, doc.id, {})).rejects.toMatchObject({ statusCode: 403 });
    await h.service.archive(creator, doc.id, {});
    for (let i = 0; i < 3; i += 1) await h.service.create(creator, h.workspaceId, make({ title: `T${i}` }));
    await expect(h.service.unarchive(creator, doc.id, {})).rejects.toMatchObject({ statusCode: 409, errorCode: "DOC_001" });

    (getDocumentLimits as jest.Mock).mockResolvedValue({ titleMax: 200, collaboratorsMax: 3, concurrentEditorsMax: 50, snapshotsAuto: 3, snapshotsManualMax: 2, perWorkspaceMax: 10 });
    h.outbox.events.length = 0;
    const restored = await h.service.unarchive(creator, doc.id, {});
    expect(restored).toMatchObject({ status: "ACTIVE", myPermissions: { edit: true } });
    expect(h.outbox.events.find((e) => e.jobName === "document.access-revoked")?.payload).toMatchObject({ documentId: doc.id, reason: "revoked" });
  });
});
