jest.mock("../../../infrastructure/redis", () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), incr: jest.fn(), expire: jest.fn(), ping: jest.fn() },
}));

import { WhiteboardEventsPublisher } from "../services/whiteboard-events-publisher";
import { WhiteboardsHarness } from "./support/whiteboards-harness";

let h: WhiteboardsHarness;
let emitted: Array<{ userIds: string[]; event: string; payload: Record<string, unknown> }>;
let publisher: WhiteboardEventsPublisher;
beforeEach(() => {
  h = new WhiteboardsHarness();
  emitted = [];
  publisher = new WhiteboardEventsPublisher(h.boards, h.collaboratorRepo, h.directory, (userIds, event, payload) => {
    emitted.push({ userIds, event, payload: payload as Record<string, unknown> });
  });
});
afterEach(() => h.dispose());

describe("whiteboard:updated — khán giả tính theo trạng thái HIỆN TẠI", () => {
  it("WORKSPACE → mọi MEMBER+ + người tạo + cộng tác viên; khách không được mời KHÔNG nhận; payload chỉ metadata", async () => {
    const creator = h.addUser("MEMBER");
    const member = h.addUser("MEMBER");
    const admin = h.addUser("ADMIN");
    const guestInvited = h.addUser("GUEST");
    const guestOther = h.addUser("GUEST");
    const board = await h.service.create(creator, h.workspaceId, { name: "Bảng", visibility: "WORKSPACE" });
    await h.collaborators.add(creator, board.id, { userIds: [guestInvited.id], role: "VIEWER" });

    const audience = await publisher.publish({ whiteboardId: board.id, version: 1 });
    expect(new Set(audience)).toEqual(new Set([creator.id, member.id, admin.id, guestInvited.id]));
    expect(audience).not.toContain(guestOther.id);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.event).toBe("whiteboard:updated");
    expect(emitted[0]?.payload).toEqual({
      id: board.id,
      workspaceId: h.workspaceId,
      name: "Bảng",
      visibility: "WORKSPACE",
      status: "ACTIVE",
      thumbnailAssetId: null,
      version: 1,
    });
  });

  it("PRIVATE → CHỈ người tạo + cộng tác viên (OWNER/ADMIN nhóm không tự nhận — không lộ sự tồn tại của bảng riêng tư)", async () => {
    const creator = h.addUser("MEMBER");
    const owner = h.addUser("OWNER");
    const collab = h.addUser("MEMBER");
    const board = await h.service.create(creator, h.workspaceId, { name: "Riêng", visibility: "PRIVATE" });
    await h.collaborators.add(creator, board.id, { userIds: [collab.id], role: "EDITOR" });

    const audience = await publisher.publish({ whiteboardId: board.id, version: 1 });
    expect(new Set(audience)).toEqual(new Set([creator.id, collab.id]));
    expect(audience).not.toContain(owner.id);
  });

  it("phản ánh trạng thái mới (ARCHIVED, đổi tên); bảng không còn tồn tại → không phát gì", async () => {
    const creator = h.addUser("MEMBER");
    const board = await h.service.create(creator, h.workspaceId, { name: "Cũ", visibility: "WORKSPACE" });
    await h.service.update(creator, board.id, { name: "Mới", expectedVersion: 1 });
    await h.service.archive(creator, board.id, {});
    await publisher.publish({ whiteboardId: board.id, version: 3 });
    expect(emitted[0]?.payload).toMatchObject({ name: "Mới", status: "ARCHIVED", version: 3 });

    emitted.length = 0;
    h.boards.rows.delete(board.id);
    expect(await publisher.publish({ whiteboardId: board.id, version: 3 })).toEqual([]);
    expect(emitted).toHaveLength(0);
  });
});
