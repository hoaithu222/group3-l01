jest.mock("../../../infrastructure/redis", () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), incr: jest.fn(), expire: jest.fn(), ping: jest.fn() },
}));

import { permissionService } from "../../../core/permission";
import { newObjectId } from "../../../core/utils/object-id";
import { ACTION_OF_ABILITY } from "../services/whiteboard-access.resolver";
import { WhiteboardsHarness, type Role } from "./support/whiteboards-harness";

let h: WhiteboardsHarness;
beforeEach(() => {
  h = new WhiteboardsHarness();
});
afterEach(() => h.dispose());

const READ = ["whiteboard.read"];
const EDIT = ["whiteboard.edit", "whiteboard.read", "whiteboard.restore", "whiteboard.snapshot"];
const MANAGE = [...EDIT, "whiteboard.manage"];

interface Scenario {
  /** Vai của người được kiểm; `null` = không phải thành viên nhóm. */
  role: Role | null;
  visibility: "WORKSPACE" | "PRIVATE";
  /** Người được kiểm CHÍNH là người tạo. */
  creator?: boolean;
  collaborator?: "EDITOR" | "VIEWER";
  archived?: boolean;
  workspaceArchived?: boolean;
}

/** Cùng bộ ca với ma trận thuần của tài liệu (`shared/collab/tests/collab-access.test.ts`) nhưng chạy qua `permissionService` thật + resolver WHITEBOARD → kiểm luôn ánh xạ ability → action `whiteboard.*`. */
describe.each<[string, Scenario, string[] | null]>([
  ["WORKSPACE · MEMBER (không phải người tạo): vẽ được, không quản lý", { role: "MEMBER", visibility: "WORKSPACE" }, EDIT],
  ["WORKSPACE · người tạo (MEMBER): quản lý được", { role: "MEMBER", visibility: "WORKSPACE", creator: true }, MANAGE],
  ["WORKSPACE · OWNER nhóm: quản lý được", { role: "OWNER", visibility: "WORKSPACE" }, MANAGE],
  ["WORKSPACE · ADMIN nhóm: quản lý được", { role: "ADMIN", visibility: "WORKSPACE" }, MANAGE],
  ["WORKSPACE · GUEST chưa được mời → 404", { role: "GUEST", visibility: "WORKSPACE" }, null],
  ["WORKSPACE · GUEST cộng tác viên EDITOR: vẽ, không quản lý", { role: "GUEST", visibility: "WORKSPACE", collaborator: "EDITOR" }, EDIT],
  ["WORKSPACE · GUEST cộng tác viên VIEWER: chỉ đọc (CW-07)", { role: "GUEST", visibility: "WORKSPACE", collaborator: "VIEWER" }, READ],
  ["WORKSPACE · người ngoài nhóm → 404", { role: null, visibility: "WORKSPACE" }, null],
  ["PRIVATE · OWNER nhóm không phải cộng tác viên → 404", { role: "OWNER", visibility: "PRIVATE" }, null],
  ["PRIVATE · ADMIN nhóm không phải cộng tác viên → 404", { role: "ADMIN", visibility: "PRIVATE" }, null],
  ["PRIVATE · MEMBER khác → 404", { role: "MEMBER", visibility: "PRIVATE" }, null],
  ["PRIVATE · người tạo: toàn quyền", { role: "MEMBER", visibility: "PRIVATE", creator: true }, MANAGE],
  ["PRIVATE · cộng tác viên EDITOR: vẽ, không quản lý", { role: "MEMBER", visibility: "PRIVATE", collaborator: "EDITOR" }, EDIT],
  ["PRIVATE · cộng tác viên VIEWER: chỉ đọc", { role: "MEMBER", visibility: "PRIVATE", collaborator: "VIEWER" }, READ],
  ["PRIVATE · OWNER nhóm là cộng tác viên VIEWER: chỉ đọc", { role: "OWNER", visibility: "PRIVATE", collaborator: "VIEWER" }, READ],
  ["ARCHIVED · MEMBER: chỉ đọc", { role: "MEMBER", visibility: "WORKSPACE", archived: true }, READ],
  ["ARCHIVED · người tạo: đọc + quản lý (để khôi phục lưu trữ)", { role: "MEMBER", visibility: "WORKSPACE", creator: true, archived: true }, ["whiteboard.manage", "whiteboard.read"]],
  ["ARCHIVED · PRIVATE · cộng tác viên EDITOR: chỉ đọc", { role: "MEMBER", visibility: "PRIVATE", collaborator: "EDITOR", archived: true }, READ],
  ["ARCHIVED · PRIVATE · OWNER lạ vẫn 404", { role: "OWNER", visibility: "PRIVATE", archived: true }, null],
  ["nhóm ARCHIVED · người tạo: chỉ đọc, không quản lý", { role: "MEMBER", visibility: "WORKSPACE", creator: true, workspaceArchived: true }, READ],
])("resolver WHITEBOARD — %s", (_name, scenario, expected) => {
  it("actions khớp ma trận", async () => {
    const creatorUser = h.addUser("MEMBER");
    const board = await h.service.create(creatorUser, h.workspaceId, { name: "Bảng", visibility: scenario.visibility });
    const subject = scenario.creator ? creatorUser : h.addUser(scenario.role);
    if (scenario.collaborator) {
      h.collaboratorRepo.rows.push({ id: newObjectId(), whiteboardId: board.id, userId: subject.id, role: scenario.collaborator, addedBy: creatorUser.id, createdAt: new Date() });
    }
    if (scenario.archived) await h.service.archive(creatorUser, board.id, {});
    if (scenario.workspaceArchived) h.setWorkspaceStatus("ARCHIVED");
    await permissionService.bumpVersion({ type: "WHITEBOARD", id: board.id });

    const access = await permissionService.resolve(subject, { type: "WHITEBOARD", id: board.id });
    if (expected === null) {
      expect(access.visible).toBe(false);
      await expect(permissionService.assert(subject, "whiteboard.read", { type: "WHITEBOARD", id: board.id })).rejects.toMatchObject({ statusCode: 404 });
    } else {
      expect(access.visible).toBe(true);
      expect([...access.actions].sort()).toEqual([...expected].sort());
    }
  });
});

describe("resolver WHITEBOARD — bảng không tồn tại / ánh xạ ability", () => {
  it("bảng không tồn tại → không thấy (404); mỗi ability của ma trận chung có đúng một action whiteboard.*", async () => {
    const user = h.addUser("OWNER");
    expect((await permissionService.resolve(user, { type: "WHITEBOARD", id: newObjectId() })).visible).toBe(false);
    expect(Object.values(ACTION_OF_ABILITY).every((a) => a.startsWith("whiteboard."))).toBe(true);
    expect(new Set(Object.values(ACTION_OF_ABILITY)).size).toBe(Object.keys(ACTION_OF_ABILITY).length);
  });
});
