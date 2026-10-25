import { resolveCollabAbilities, collabModeOf, type CollabAbility, type CollabAccessInput, type CollabWorkspaceRole } from "..";

const ME = "u-me";
const OTHER = "u-other";

const base: CollabAccessInput = {
  userId: ME,
  visibility: "WORKSPACE",
  resourceStatus: "ACTIVE",
  createdBy: OTHER,
  collaboratorRole: null,
  workspaceRole: "MEMBER",
  workspaceActive: true,
};
const abilities = (over: Partial<CollabAccessInput>): string[] | null => {
  const r = resolveCollabAbilities({ ...base, ...over });
  return r ? ([...r] as CollabAbility[]).sort() : null;
};

const FULL_EDIT: CollabAbility[] = ["edit", "read", "restore", "snapshot"];

describe("ma trận quyền tài nguyên cộng tác (vai × visibility × trạng thái)", () => {
  describe("WORKSPACE + ACTIVE", () => {
    it.each<[string, Partial<CollabAccessInput>, string[] | null]>([
      ["MEMBER (không phải người tạo) sửa được nhưng không quản lý", { workspaceRole: "MEMBER" }, FULL_EDIT],
      ["người tạo (MEMBER) quản lý được", { workspaceRole: "MEMBER", createdBy: ME }, [...FULL_EDIT, "manage"]],
      ["OWNER nhóm quản lý được", { workspaceRole: "OWNER" }, [...FULL_EDIT, "manage"]],
      ["ADMIN nhóm quản lý được", { workspaceRole: "ADMIN" }, [...FULL_EDIT, "manage"]],
      ["GUEST không được mời → 404", { workspaceRole: "GUEST" }, null],
      ["GUEST cộng tác viên EDITOR: sửa được, không quản lý", { workspaceRole: "GUEST", collaboratorRole: "EDITOR" }, FULL_EDIT],
      ["GUEST cộng tác viên VIEWER: chỉ đọc", { workspaceRole: "GUEST", collaboratorRole: "VIEWER" }, ["read"]],
      ["không phải thành viên → 404", { workspaceRole: null }, null],
    ])("%s", (_name, over, expected) => {
      expect(abilities(over)).toEqual(expected ? [...expected].sort() : null);
    });
  });

  describe("PRIVATE + ACTIVE (OWNER/ADMIN nhóm KHÔNG tự đọc — CW-D2)", () => {
    it.each<[string, Partial<CollabAccessInput>, string[] | null]>([
      ["OWNER nhóm không phải cộng tác viên → 404", { visibility: "PRIVATE", workspaceRole: "OWNER" }, null],
      ["ADMIN nhóm không phải cộng tác viên → 404", { visibility: "PRIVATE", workspaceRole: "ADMIN" }, null],
      ["MEMBER khác → 404", { visibility: "PRIVATE", workspaceRole: "MEMBER" }, null],
      ["GUEST khác → 404", { visibility: "PRIVATE", workspaceRole: "GUEST" }, null],
      ["người tạo: toàn quyền", { visibility: "PRIVATE", workspaceRole: "MEMBER", createdBy: ME }, [...FULL_EDIT, "manage"]],
      ["cộng tác viên EDITOR (MEMBER) sửa được, không quản lý", { visibility: "PRIVATE", collaboratorRole: "EDITOR" }, FULL_EDIT],
      ["cộng tác viên VIEWER chỉ đọc", { visibility: "PRIVATE", collaboratorRole: "VIEWER" }, ["read"]],
      ["OWNER nhóm là cộng tác viên VIEWER → chỉ đọc (không có quyền quản lý dù là OWNER)", { visibility: "PRIVATE", workspaceRole: "OWNER", collaboratorRole: "VIEWER" }, ["read"]],
      ["người tạo đã bị hạ xuống GUEST: sửa được nhưng không quản lý", { visibility: "PRIVATE", workspaceRole: "GUEST", createdBy: ME }, FULL_EDIT],
    ])("%s", (_name, over, expected) => {
      expect(abilities(over)).toEqual(expected ? [...expected].sort() : null);
    });
  });

  describe("tài nguyên ARCHIVED: chỉ đọc, người quản lý vẫn khôi phục lưu trữ được", () => {
    it.each<[string, Partial<CollabAccessInput>, string[] | null]>([
      ["MEMBER: chỉ đọc", { resourceStatus: "ARCHIVED" }, ["read"]],
      ["người tạo: đọc + quản lý (để khôi phục)", { resourceStatus: "ARCHIVED", createdBy: ME }, ["manage", "read"]],
      ["ADMIN nhóm: đọc + quản lý", { resourceStatus: "ARCHIVED", workspaceRole: "ADMIN" }, ["manage", "read"]],
      ["cộng tác viên EDITOR: chỉ đọc", { resourceStatus: "ARCHIVED", visibility: "PRIVATE", collaboratorRole: "EDITOR" }, ["read"]],
      ["PRIVATE + OWNER lạ vẫn 404", { resourceStatus: "ARCHIVED", visibility: "PRIVATE", workspaceRole: "OWNER" }, null],
    ])("%s", (_name, over, expected) => {
      expect(abilities(over)).toEqual(expected ? [...expected].sort() : null);
    });
  });

  describe("workspace ARCHIVED: chỉ đọc, không quản lý", () => {
    it.each<CollabWorkspaceRole>(["OWNER", "ADMIN", "MEMBER"])("%s chỉ có read", (workspaceRole) => {
      expect(abilities({ workspaceRole, workspaceActive: false, createdBy: ME })).toEqual(["read"]);
    });
  });

  it("collabModeOf: có edit → edit, còn lại → view", () => {
    expect(collabModeOf(new Set<CollabAbility>(["read", "edit"]))).toBe("edit");
    expect(collabModeOf(new Set<CollabAbility>(["read", "manage"]))).toBe("view");
  });
});
