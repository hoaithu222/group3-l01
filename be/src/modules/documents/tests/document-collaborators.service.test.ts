jest.mock("../../../infrastructure/redis", () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), incr: jest.fn(), expire: jest.fn(), ping: jest.fn() },
}));
jest.mock("../services/document-limits", () => ({
  getDocumentLimits: jest.fn().mockResolvedValue({ titleMax: 200, collaboratorsMax: 3, concurrentEditorsMax: 50, snapshotsAuto: 3, snapshotsManualMax: 2, perWorkspaceMax: 500 }),
}));

import { newObjectId } from "../../../core/utils/object-id";
import { getDocumentLimits } from "../services/document-limits";
import { DocumentsHarness } from "./support/documents-harness";

let h: DocumentsHarness;
beforeEach(() => {
  h = new DocumentsHarness();
  (getDocumentLimits as jest.Mock).mockResolvedValue({ titleMax: 200, collaboratorsMax: 3, concurrentEditorsMax: 50, snapshotsAuto: 3, snapshotsManualMax: 2, perWorkspaceMax: 500 });
});
afterEach(() => h.dispose());

const setup = async (visibility: "WORKSPACE" | "PRIVATE" = "PRIVATE") => {
  const creator = h.addUser("MEMBER");
  const doc = await h.service.create(creator, h.workspaceId, { title: "Tài liệu", visibility });
  return { creator, doc };
};

describe("thêm người cộng tác", () => {
  it("thêm thành viên nhóm: nhận quyền theo vai, thông báo CHỈ cho người mới, khoá dedupe outbox không trùng, có audit (không chứa tiêu đề)", async () => {
    const { creator, doc } = await setup();
    const editor = h.addUser("MEMBER");
    const viewer = h.addUser("MEMBER");
    const list = await h.collaborators.add(creator, doc.id, { userIds: [editor.id], role: "EDITOR" });
    await h.collaborators.add(creator, doc.id, { userIds: [viewer.id], role: "VIEWER" });
    expect(list.map((c) => c.role)).toEqual(["EDITOR"]);
    expect((await h.service.get(editor, doc.id)).myPermissions.edit).toBe(true);
    expect((await h.service.get(viewer, doc.id)).myPermissions.edit).toBe(false);
    expect(h.notifier.calls).toEqual([
      { docId: doc.id, userIds: [editor.id], role: "EDITOR" },
      { docId: doc.id, userIds: [viewer.id], role: "VIEWER" },
    ]);
    const keys = h.outbox.events.filter((e) => e.jobName === "document.events").map((e) => e.dedupeKey);
    expect(new Set(keys).size).toBe(keys.length); // trùng khoá dedupe sẽ làm vỡ transaction (unique index)
    expect(h.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "document.collaborator.add", targetId: doc.id }));
  });

  it("đổi vai người đã có: không thông báo lại; người tạo bị bỏ qua (không có dòng cộng tác)", async () => {
    const { creator, doc } = await setup();
    const bob = h.addUser("MEMBER");
    await h.collaborators.add(creator, doc.id, { userIds: [bob.id], role: "VIEWER" });
    const list = await h.collaborators.add(creator, doc.id, { userIds: [bob.id, creator.id], role: "EDITOR" });
    expect(list.map((c) => [c.userId, c.role])).toEqual([[bob.id, "EDITOR"]]);
    expect(h.notifier.calls).toHaveLength(1);
  });

  it("DOC_003: người không thuộc nhóm / đã rời / không tồn tại → 400 kèm invalidUserIds; DOC_004: quá số người tối đa", async () => {
    const { creator, doc } = await setup();
    const outsider = h.addUser(null);
    const ghost = newObjectId();
    await expect(h.collaborators.add(creator, doc.id, { userIds: [outsider.id, ghost], role: "EDITOR" })).rejects.toMatchObject({
      statusCode: 400,
      errorCode: "DOC_003",
      details: { invalidUserIds: [outsider.id, ghost] },
    });
    const users = [h.addUser("MEMBER"), h.addUser("MEMBER"), h.addUser("MEMBER"), h.addUser("MEMBER")];
    await h.collaborators.add(creator, doc.id, { userIds: users.slice(0, 3).map((u) => u.id), role: "EDITOR" });
    await expect(h.collaborators.add(creator, doc.id, { userIds: [users[3]?.id ?? ""], role: "EDITOR" })).rejects.toMatchObject({ statusCode: 409, errorCode: "DOC_004", details: { max: 3 } });
    // Đổi vai người đã có không tính thêm vào trần.
    await expect(h.collaborators.add(creator, doc.id, { userIds: [users[0]?.id ?? ""], role: "VIEWER" })).resolves.toHaveLength(3);
  });

  it("khách (GUEST) được mời vào tài liệu WORKSPACE: thấy tài liệu; chỉ người có quyền quản lý mới mời được (MEMBER khác → 403)", async () => {
    const { creator, doc } = await setup("WORKSPACE");
    const guest = h.addUser("GUEST");
    const member = h.addUser("MEMBER");
    await expect(h.collaborators.add(member, doc.id, { userIds: [guest.id], role: "VIEWER" })).rejects.toMatchObject({ statusCode: 403 });
    await h.collaborators.add(creator, doc.id, { userIds: [guest.id], role: "VIEWER" });
    expect((await h.service.get(guest, doc.id)).myRole).toBe("VIEWER");
  });

  it("tài liệu ARCHIVED không mời thêm được (DOC_005); người không thấy tài liệu → 404", async () => {
    const { creator, doc } = await setup();
    const outsider = h.addUser("OWNER"); // OWNER nhóm KHÔNG thấy PRIVATE
    await expect(h.collaborators.add(outsider, doc.id, { userIds: [creator.id], role: "EDITOR" })).rejects.toMatchObject({ statusCode: 404 });
    await h.service.archive(creator, doc.id, {});
    await expect(h.collaborators.add(creator, doc.id, { userIds: [h.addUser("MEMBER").id], role: "EDITOR" })).rejects.toMatchObject({ errorCode: "DOC_005" });
  });
});

describe("gỡ người cộng tác", () => {
  it("gỡ → mất quyền ngay (404), phát permission:revoked, ghi audit; gỡ lại người đã gỡ → 404; không gỡ được người tạo", async () => {
    const { creator, doc } = await setup();
    const bob = h.addUser("MEMBER");
    await h.collaborators.add(creator, doc.id, { userIds: [bob.id], role: "EDITOR" });
    expect((await h.service.get(bob, doc.id)).id).toBe(doc.id);

    await h.collaborators.remove(creator, doc.id, bob.id);
    await expect(h.service.get(bob, doc.id)).rejects.toMatchObject({ statusCode: 404 });
    expect(h.revoked.flatMap((r) => r.userIds)).toContain(bob.id);
    expect(h.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "document.collaborator.remove", metadata: { userId: bob.id } }));
    await expect(h.collaborators.remove(creator, doc.id, bob.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(h.collaborators.remove(creator, doc.id, creator.id)).rejects.toMatchObject({ statusCode: 400 });
  });

  it("danh sách kèm tên; cộng tác viên VIEWER không gỡ được ai (403)", async () => {
    const { creator, doc } = await setup();
    const viewer = h.addUser("MEMBER");
    const editor = h.addUser("MEMBER");
    await h.collaborators.add(creator, doc.id, { userIds: [viewer.id], role: "VIEWER" });
    await h.collaborators.add(creator, doc.id, { userIds: [editor.id], role: "EDITOR" });
    const list = await h.collaborators.list(viewer, doc.id);
    expect(list.map((c) => c.userId).sort()).toEqual([viewer.id, editor.id].sort());
    expect(list.every((c) => c.name.startsWith("Người"))).toBe(true);
    await expect(h.collaborators.remove(viewer, doc.id, editor.id)).rejects.toMatchObject({ statusCode: 403 });
  });
});
