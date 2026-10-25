jest.mock("../../../infrastructure/redis", () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), incr: jest.fn(), expire: jest.fn(), ping: jest.fn() },
}));
jest.mock("../services/whiteboard-limits", () => ({ getWhiteboardLimits: jest.fn() }));

import { getWhiteboardLimits } from "../services/whiteboard-limits";
import { WhiteboardsHarness } from "./support/whiteboards-harness";

const LIMITS_LOW = { nameMax: 120, collaboratorsMax: 2, concurrentEditorsMax: 30, snapshotsAuto: 3, snapshotsManualMax: 2, perWorkspaceMax: 50, elementsMax: 5000, stateMaxBytes: 8 * 1024 * 1024 };

let h: WhiteboardsHarness;
beforeEach(() => {
  h = new WhiteboardsHarness();
  (getWhiteboardLimits as jest.Mock).mockResolvedValue(LIMITS_LOW);
});
afterEach(() => h.dispose());

const setup = async (visibility: "WORKSPACE" | "PRIVATE" = "PRIVATE") => {
  const creator = h.addUser("MEMBER");
  const board = await h.service.create(creator, h.workspaceId, { name: "Bảng", visibility });
  return { creator, board };
};

describe("thêm người cộng tác", () => {
  it("chỉ người có manage; người thêm vào thấy bảng PRIVATE; ghi outbox whiteboard.events (khoá dedupe riêng mỗi lần) + audit; không tạo dòng cho người tạo", async () => {
    const { creator, board } = await setup();
    const a = h.addUser("MEMBER");
    const b = h.addUser("MEMBER");
    await expect(h.collaborators.add(a, board.id, { userIds: [b.id], role: "EDITOR" })).rejects.toMatchObject({ statusCode: 404 });

    const before = h.outbox.events.length;
    const list = await h.collaborators.add(creator, board.id, { userIds: [a.id, creator.id], role: "EDITOR" });
    expect(list.map((c) => c.userId)).toEqual([a.id]);
    expect((await h.service.get(a, board.id)).myRole).toBe("EDITOR");
    await h.collaborators.add(creator, board.id, { userIds: [b.id], role: "VIEWER" });
    const events = h.outbox.events.slice(before);
    expect(events.map((e) => e.jobName)).toEqual(["whiteboard.events", "whiteboard.events"]);
    expect(new Set(events.map((e) => e.dedupeKey)).size).toBe(2);
    expect(h.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "whiteboard.collaborator.add", targetId: board.id }));
  });

  it("đổi vai (EDITOR → VIEWER) không tính là người mới; WB_003 người không thuộc nhóm; WB_004 quá số người; bảng ARCHIVED → WB_005", async () => {
    const { creator, board } = await setup();
    const a = h.addUser("MEMBER");
    const b = h.addUser("MEMBER");
    const c = h.addUser("MEMBER");
    const outsider = h.addUser(null);
    await h.collaborators.add(creator, board.id, { userIds: [a.id], role: "EDITOR" });
    const changed = await h.collaborators.add(creator, board.id, { userIds: [a.id], role: "VIEWER" });
    expect(changed).toHaveLength(1);
    expect(changed[0]?.role).toBe("VIEWER");

    await expect(h.collaborators.add(creator, board.id, { userIds: [outsider.id], role: "EDITOR" })).rejects.toMatchObject({
      statusCode: 400,
      errorCode: "WB_003",
      details: { invalidUserIds: [outsider.id] },
    });
    await h.collaborators.add(creator, board.id, { userIds: [b.id], role: "EDITOR" });
    await expect(h.collaborators.add(creator, board.id, { userIds: [c.id], role: "EDITOR" })).rejects.toMatchObject({ statusCode: 409, errorCode: "WB_004", details: { max: 2 } });

    await h.service.archive(creator, board.id, {});
    await expect(h.collaborators.add(creator, board.id, { userIds: [c.id], role: "EDITOR" })).rejects.toMatchObject({ statusCode: 403, errorCode: "WB_005" });
  });
});

describe("gỡ người cộng tác", () => {
  it("gỡ → mất quyền tức thì (404 với PRIVATE) + permission:revoked scopeType WHITEBOARD; không gỡ được người tạo; gỡ người không có dòng → 404", async () => {
    const { creator, board } = await setup();
    const a = h.addUser("MEMBER");
    await h.collaborators.add(creator, board.id, { userIds: [a.id], role: "EDITOR" });
    expect((await h.service.get(a, board.id)).id).toBe(board.id);

    await expect(h.collaborators.remove(creator, board.id, creator.id)).rejects.toMatchObject({ statusCode: 400 });
    await h.collaborators.remove(creator, board.id, a.id);
    await expect(h.service.get(a, board.id)).rejects.toMatchObject({ statusCode: 404 });
    expect(h.revoked.at(-1)).toMatchObject({ userIds: [a.id], payload: { scopeType: "WHITEBOARD", scopeId: board.id, reason: "GRANT_REVOKED", cascade: false } });
    await expect(h.collaborators.remove(creator, board.id, a.id)).rejects.toMatchObject({ statusCode: 404 });
    expect(h.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "whiteboard.collaborator.remove" }));
  });

  it("danh sách cộng tác viên: người có quyền đọc xem được, người ngoài 404", async () => {
    const { creator, board } = await setup("WORKSPACE");
    const a = h.addUser("GUEST");
    await h.collaborators.add(creator, board.id, { userIds: [a.id], role: "VIEWER" });
    expect((await h.collaborators.list(a, board.id)).map((c) => c.userId)).toEqual([a.id]);
    await expect(h.collaborators.list(h.addUser("GUEST"), board.id)).rejects.toMatchObject({ statusCode: 404 });
  });
});
