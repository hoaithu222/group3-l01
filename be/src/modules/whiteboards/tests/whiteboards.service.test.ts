// Redis mock có `incr/expire` mà `permissionService.bumpVersion` cần; `get/set` trả undefined → cache quyền luôn "miss" (test thấy trạng thái thật).
jest.mock("../../../infrastructure/redis", () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), incr: jest.fn(), expire: jest.fn(), ping: jest.fn() },
}));
// Trần thấp để test WB_001 mà không phải tạo 200 bảng.
jest.mock("../services/whiteboard-limits", () => ({ getWhiteboardLimits: jest.fn() }));

import { newObjectId } from "../../../core/utils/object-id";
import { getWhiteboardLimits } from "../services/whiteboard-limits";
import { WhiteboardsHarness } from "./support/whiteboards-harness";

const LIMITS_LOW = { nameMax: 120, collaboratorsMax: 3, concurrentEditorsMax: 30, snapshotsAuto: 3, snapshotsManualMax: 2, perWorkspaceMax: 3, elementsMax: 5000, stateMaxBytes: 8 * 1024 * 1024 };

let h: WhiteboardsHarness;
beforeEach(() => {
  h = new WhiteboardsHarness();
  (getWhiteboardLimits as jest.Mock).mockResolvedValue(LIMITS_LOW);
});
afterEach(() => h.dispose());

const make = (over: Partial<{ name: string; visibility: "WORKSPACE" | "PRIVATE" }> = {}) => ({ name: "Sơ đồ", visibility: "WORKSPACE" as const, ...over });

describe("tạo bảng trắng", () => {
  it("MEMBER tạo → người tạo có toàn quyền, myRole CREATOR, ghi outbox whiteboard.events + audit (không có tên trong audit)", async () => {
    const alice = h.addUser("MEMBER");
    const board = await h.service.create(alice, h.workspaceId, make());
    expect(board).toMatchObject({
      name: "Sơ đồ",
      visibility: "WORKSPACE",
      status: "ACTIVE",
      myRole: "CREATOR",
      version: 1,
      yjsVersion: 0,
      elementCount: 0,
      thumbnailUrl: null,
      myPermissions: { edit: true, manage: true, snapshot: true, restore: true },
    });
    expect(h.outbox.events.map((e) => e.jobName)).toEqual(["whiteboard.events"]);
    expect(h.outbox.events[0]?.dedupeKey).toBe(`whiteboard.updated:${board.id}:v1`);
    expect(h.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "whiteboard.create", targetId: board.id, workspaceId: h.workspaceId }));
    expect(JSON.stringify(h.audit.record.mock.calls)).not.toContain("Sơ đồ");
  });

  it("GUEST / người ngoài nhóm → 404; nhóm ARCHIVED → 403 WS_002; quá số bảng → 409 WB_001", async () => {
    const guest = h.addUser("GUEST");
    const outsider = h.addUser(null);
    await expect(h.service.create(guest, h.workspaceId, make())).rejects.toMatchObject({ statusCode: 404 });
    await expect(h.service.create(outsider, h.workspaceId, make())).rejects.toMatchObject({ statusCode: 404 });

    const member = h.addUser("MEMBER");
    for (let i = 0; i < 3; i += 1) await h.service.create(member, h.workspaceId, make({ name: `B${i}` }));
    await expect(h.service.create(member, h.workspaceId, make())).rejects.toMatchObject({ statusCode: 409, errorCode: "WB_001", details: { max: 3 } });

    h.setWorkspaceStatus("ARCHIVED");
    await expect(h.service.create(member, h.workspaceId, make())).rejects.toMatchObject({ statusCode: 403, errorCode: "WS_002" });
  });
});

describe("xem + danh sách theo vai", () => {
  it("PRIVATE: OWNER nhóm không phải cộng tác viên nhận 404 (cả GET lẫn danh sách); người tạo và cộng tác viên thấy", async () => {
    const owner = h.addUser("OWNER");
    const creator = h.addUser("MEMBER");
    const viewer = h.addUser("MEMBER");
    const priv = await h.service.create(creator, h.workspaceId, make({ name: "Riêng", visibility: "PRIVATE" }));
    await h.collaborators.add(creator, priv.id, { userIds: [viewer.id], role: "VIEWER" });

    await expect(h.service.get(owner, priv.id)).rejects.toMatchObject({ statusCode: 404 });
    expect((await h.service.list(owner, h.workspaceId, { limit: 30, status: "ACTIVE" })).data).toHaveLength(0);
    expect((await h.service.get(creator, priv.id)).myRole).toBe("CREATOR");
    const asViewer = await h.service.get(viewer, priv.id);
    expect(asViewer).toMatchObject({ myRole: "VIEWER", myPermissions: { edit: false, manage: false, snapshot: false, restore: false } });
    expect((await h.service.list(viewer, h.workspaceId, { limit: 30, status: "ACTIVE" })).data.map((b) => b.id)).toEqual([priv.id]);
  });

  it("WORKSPACE: mọi MEMBER+ thấy; khách chỉ thấy khi được mời (VIEWER: chỉ đọc; EDITOR: vẽ được)", async () => {
    const creator = h.addUser("MEMBER");
    const member = h.addUser("MEMBER");
    const guest = h.addUser("GUEST");
    const guest2 = h.addUser("GUEST");
    const board = await h.service.create(creator, h.workspaceId, make());
    expect((await h.service.get(member, board.id)).myPermissions).toEqual({ edit: true, manage: false, snapshot: true, restore: true });
    await expect(h.service.get(guest, board.id)).rejects.toMatchObject({ statusCode: 404 });
    expect((await h.service.list(guest, h.workspaceId, { limit: 30, status: "ACTIVE" })).data).toHaveLength(0);

    await h.collaborators.add(creator, board.id, { userIds: [guest.id], role: "EDITOR" });
    await h.collaborators.add(creator, board.id, { userIds: [guest2.id], role: "VIEWER" });
    expect((await h.service.get(guest, board.id)).myPermissions.edit).toBe(true);
    expect((await h.service.get(guest2, board.id)).myPermissions.edit).toBe(false);
    expect((await h.service.list(guest2, h.workspaceId, { limit: 30, status: "ACTIVE" })).data).toHaveLength(1);
  });

  it("danh sách: phân trang cursor theo updatedAt giảm dần, lọc q không dấu, tab ARCHIVED; thumbnailUrl chỉ khi asset đã có URL ký, lỗi ký không làm hỏng danh sách", async () => {
    const creator = h.addUser("MEMBER");
    const a = await h.service.create(creator, h.workspaceId, make({ name: "Kế hoạch Quý" }));
    h.advance(1000);
    const b = await h.service.create(creator, h.workspaceId, make({ name: "Sprint" }));
    h.advance(1000);
    const c = await h.service.create(creator, h.workspaceId, make({ name: "Mindmap" }));

    const p1 = await h.service.list(creator, h.workspaceId, { limit: 2, status: "ACTIVE" });
    expect(p1.data.map((x) => x.id)).toEqual([c.id, b.id]);
    expect(p1.hasMore).toBe(true);
    const p2 = await h.service.list(creator, h.workspaceId, { limit: 2, status: "ACTIVE", cursor: p1.nextCursor ?? undefined });
    expect(p2.data.map((x) => x.id)).toEqual([a.id]);
    expect(p2.hasMore).toBe(false);
    expect((await h.service.list(creator, h.workspaceId, { limit: 30, status: "ACTIVE", q: "ke hoach" })).data.map((x) => x.id)).toEqual([a.id]);
    await expect(h.service.list(creator, h.workspaceId, { limit: 30, status: "ACTIVE", cursor: "không-phải-cursor" })).rejects.toMatchObject({ statusCode: 400 });

    await h.service.archive(creator, b.id, {});
    expect((await h.service.list(creator, h.workspaceId, { limit: 30, status: "ARCHIVED" })).data.map((x) => x.id)).toEqual([b.id]);
    expect((await h.service.list(creator, h.workspaceId, { limit: 30, status: "ACTIVE" })).data.map((x) => x.id)).not.toContain(b.id);

    // thumbnail: đặt trực tiếp ở repo để không phụ thuộc luồng PATCH
    const row = h.boards.rows.get(a.id);
    if (row) row.thumbnailAssetId = "6a".repeat(12);
    h.assetPort.urls.set("6a".repeat(12), "https://cdn.test/thumb.webp");
    expect((await h.service.list(creator, h.workspaceId, { limit: 30, status: "ACTIVE" })).data.find((x) => x.id === a.id)?.thumbnailUrl).toBe("https://cdn.test/thumb.webp");
    h.assetPort.failSigning = true;
    const failed = await h.service.list(creator, h.workspaceId, { limit: 30, status: "ACTIVE" });
    expect(failed.data.find((x) => x.id === a.id)).toMatchObject({ thumbnailAssetId: "6a".repeat(12), thumbnailUrl: null });
  });
});

describe("đổi tên / visibility / ảnh thu nhỏ", () => {
  it("chỉ người có manage đổi tên; expectedVersion lệch → 409 RES_003; tăng version + ghi outbox mới", async () => {
    const creator = h.addUser("MEMBER");
    const other = h.addUser("MEMBER");
    const board = await h.service.create(creator, h.workspaceId, make());

    await expect(h.service.update(other, board.id, { name: "Hack", expectedVersion: 1 })).rejects.toMatchObject({ statusCode: 403 });
    const renamed = await h.service.update(creator, board.id, { name: "Tên mới", expectedVersion: 1 });
    expect(renamed).toMatchObject({ name: "Tên mới", version: 2 });
    expect(h.outbox.events.at(-1)?.dedupeKey).toBe(`whiteboard.updated:${board.id}:v2`);
    await expect(h.service.update(creator, board.id, { name: "Cũ", expectedVersion: 1 })).rejects.toMatchObject({ statusCode: 409, errorCode: "RES_003", details: { currentVersion: 2 } });
  });

  it("PRIVATE → WORKSPACE cần confirmPublic; chỉ người tạo được đặt PRIVATE; đổi sang PRIVATE thu hồi quyền thành viên khác (permission:revoked)", async () => {
    const creator = h.addUser("MEMBER");
    const admin = h.addUser("ADMIN");
    const member = h.addUser("MEMBER");
    const collab = h.addUser("MEMBER");
    const board = await h.service.create(creator, h.workspaceId, make());
    await h.collaborators.add(creator, board.id, { userIds: [collab.id], role: "EDITOR" });

    await expect(h.service.update(admin, board.id, { visibility: "PRIVATE", expectedVersion: 1 })).rejects.toMatchObject({ statusCode: 403 });
    const priv = await h.service.update(creator, board.id, { visibility: "PRIVATE", expectedVersion: 1 });
    expect(priv.visibility).toBe("PRIVATE");
    const lost = h.revoked.at(-1);
    expect(lost?.payload).toMatchObject({ scopeType: "WHITEBOARD", scopeId: board.id, reason: "GRANT_REVOKED" });
    expect([...(lost?.userIds ?? [])].sort()).toEqual([admin.id, member.id].sort());
    await expect(h.service.get(member, board.id)).rejects.toMatchObject({ statusCode: 404 });
    expect((await h.service.get(collab, board.id)).myRole).toBe("EDITOR");

    await expect(h.service.update(creator, board.id, { visibility: "WORKSPACE", expectedVersion: 2 })).rejects.toMatchObject({ statusCode: 400 });
    const pub = await h.service.update(creator, board.id, { visibility: "WORKSPACE", confirmPublic: true, expectedVersion: 2 });
    expect(pub.visibility).toBe("WORKSPACE");
  });

  it("ảnh thu nhỏ: người có edit (kể cả không có manage) đặt được; asset phải READY + scope WHITEBOARD + IMAGE + của chính người gắn, sai → 400 WB_002; link cũ được thay", async () => {
    const creator = h.addUser("MEMBER");
    const other = h.addUser("MEMBER");
    const board = await h.service.create(creator, h.workspaceId, make());
    const assetId = newObjectId();
    h.assetPort.assets.set(assetId, { scope: "WHITEBOARD", kind: "IMAGE", status: "READY", ownerId: other.id });

    // `other` là MEMBER (có edit, không manage) và là chủ asset → được đặt ảnh thu nhỏ; tên thì không
    const done = await h.service.update(other, board.id, { thumbnailAssetId: assetId, expectedVersion: 1 });
    expect(done).toMatchObject({ thumbnailAssetId: assetId, version: 2 });
    expect(h.assetPort.replaced).toEqual([{ assetId, whiteboardId: board.id, workspaceId: h.workspaceId, actorId: other.id }]);
    await expect(h.service.update(other, board.id, { name: "X", expectedVersion: 2 })).rejects.toMatchObject({ statusCode: 403 });

    const cases: Array<[string, Partial<{ scope: string; kind: string; status: string; ownerId: string }> | null]> = [
      ["không tồn tại", null],
      ["của người khác", { ownerId: creator.id }],
      ["sai scope", { scope: "DOC" }],
      ["không phải ảnh", { kind: "FILE" }],
      ["chưa READY", { status: "PROCESSING" }],
    ];
    for (const [label, over] of cases) {
      const bad = newObjectId();
      if (over) h.assetPort.assets.set(bad, { scope: "WHITEBOARD", kind: "IMAGE", status: "READY", ownerId: other.id, ...over });
      await expect(h.service.update(other, board.id, { thumbnailAssetId: bad, expectedVersion: 2 })).rejects.toMatchObject({ statusCode: 400, errorCode: "WB_002" });
      expect({ label, replacedCalls: h.assetPort.replaced.length }).toEqual({ label, replacedCalls: 1 });
    }
  });

  it("bảng ARCHIVED không đổi được (403 WB_005); người xem không đặt được ảnh thu nhỏ (403)", async () => {
    const creator = h.addUser("MEMBER");
    const viewer = h.addUser("GUEST");
    const board = await h.service.create(creator, h.workspaceId, make());
    await h.collaborators.add(creator, board.id, { userIds: [viewer.id], role: "VIEWER" });
    const assetId = newObjectId();
    h.assetPort.assets.set(assetId, { scope: "WHITEBOARD", kind: "IMAGE", status: "READY", ownerId: viewer.id });
    await expect(h.service.update(viewer, board.id, { thumbnailAssetId: assetId, expectedVersion: 1 })).rejects.toMatchObject({ statusCode: 403 });

    await h.service.archive(creator, board.id, {});
    const v = (await h.service.get(creator, board.id)).version;
    await expect(h.service.update(creator, board.id, { name: "Mới", expectedVersion: v })).rejects.toMatchObject({ statusCode: 403, errorCode: "WB_005" });
  });
});

describe("lưu trữ / khôi phục", () => {
  it("archive: ARCHIVED + outbox đóng kết nối (whiteboard.access-revoked) + edit=false cho mọi người, manage vẫn còn; idempotent; unarchive kiểm WB_001", async () => {
    const creator = h.addUser("MEMBER");
    const member = h.addUser("MEMBER");
    const board = await h.service.create(creator, h.workspaceId, make());
    await expect(h.service.archive(member, board.id, {})).rejects.toMatchObject({ statusCode: 403 });

    const archived = await h.service.archive(creator, board.id, { reason: "xong việc" });
    expect(archived).toMatchObject({ status: "ARCHIVED", myPermissions: { edit: false, manage: true, snapshot: false, restore: false } });
    const kick = h.outbox.events.find((e) => e.jobName === "whiteboard.access-revoked");
    expect(kick).toMatchObject({ queue: "notifications", payload: { whiteboardId: board.id, reason: "archived" } });
    expect((await h.service.get(member, board.id)).myPermissions.edit).toBe(false);
    expect(h.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "whiteboard.archive", reason: "xong việc" }));
    const before = h.outbox.events.length;
    await h.service.archive(creator, board.id, {});
    expect(h.outbox.events).toHaveLength(before);

    for (let i = 0; i < 3; i += 1) await h.service.create(creator, h.workspaceId, make({ name: `B${i}` }));
    await expect(h.service.unarchive(creator, board.id, {})).rejects.toMatchObject({ statusCode: 409, errorCode: "WB_001" });
  });

  it("unarchive: ACTIVE lại + báo người đang xem nối lại để lấy quyền vẽ", async () => {
    const creator = h.addUser("MEMBER");
    const board = await h.service.create(creator, h.workspaceId, make());
    await h.service.archive(creator, board.id, {});
    const back = await h.service.unarchive(creator, board.id, {});
    expect(back).toMatchObject({ status: "ACTIVE", myPermissions: { edit: true } });
    expect(h.outbox.events.filter((e) => e.jobName === "whiteboard.access-revoked").map((e) => (e.payload as { reason: string }).reason)).toEqual(["archived", "revoked"]);
  });
});
