/** ACL-09 (be.md §10) — buildMyPermissions() trả đúng tập action theo vai trò. */
import { buildMyPermissions } from "../my-permissions";
import type { ResolvedAccess } from "../scope.types";
import type { Action } from "../actions";

function makeAccess(actions: Action[]): ResolvedAccess {
  return { visible: true, role: "MEMBER", actions: new Set(actions) };
}

describe("buildMyPermissions", () => {
  it("trả mảng action đã sắp xếp bảng chữ cái", () => {
    const access = makeAccess(["workspace.update", "workspace.archive", "workspace.read"]);
    expect(buildMyPermissions(access)).toEqual(["workspace.archive", "workspace.read", "workspace.update"]);
  });

  it("mảng rỗng khi access không có action nào", () => {
    const access = makeAccess([]);
    expect(buildMyPermissions(access)).toEqual([]);
  });

  it("lọc theo subset khi truyền vào — chỉ giữ action có mặt trong cả 2", () => {
    const access = makeAccess(["workspace.read", "workspace.update", "workspace.archive"]);
    const subset: Action[] = ["workspace.read", "workspace.archive", "workspace.transfer"];
    expect(buildMyPermissions(access, subset)).toEqual(["workspace.archive", "workspace.read"]);
  });

  it("subset không chứa action nào của access → mảng rỗng", () => {
    const access = makeAccess(["workspace.read"]);
    expect(buildMyPermissions(access, ["workspace.archive"])).toEqual([]);
  });

  it("không đổi thứ tự actions gốc trong ResolvedAccess (trả bản sao)", () => {
    const access = makeAccess(["workspace.update", "workspace.archive"]);
    const result = buildMyPermissions(access);
    expect([...access.actions]).toEqual(["workspace.update", "workspace.archive"]);
    expect(result).toEqual(["workspace.archive", "workspace.update"]);
  });
});
