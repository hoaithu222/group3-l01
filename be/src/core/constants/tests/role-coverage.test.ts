/**
 * Unit — `role-coverage` (p3-04 README §2 "Ngữ nghĩa roleRef"): ADMIN = OWNER+ADMIN, MEMBER = OWNER+ADMIN+MEMBER,
 * GUEST không bao giờ được phủ. Nguồn dùng chung của grant kênh theo vai trò và `@role`.
 */
import {
  GRANT_ROLE_REFS,
  ROLE_REF_LABEL,
  isCoveredByAnyRole,
  isGrantRoleRef,
  roleSubjectKey,
  rolesCovering,
  workspaceRolesCoveredBy,
  workspaceRolesCoveredByAny,
} from "../role-coverage";

describe("role-coverage", () => {
  it("workspaceRolesCoveredBy: ADMIN = OWNER+ADMIN; MEMBER = OWNER+ADMIN+MEMBER (không GUEST)", () => {
    expect([...workspaceRolesCoveredBy("ADMIN")]).toEqual(["OWNER", "ADMIN"]);
    expect([...workspaceRolesCoveredBy("MEMBER")]).toEqual(["OWNER", "ADMIN", "MEMBER"]);
    for (const ref of GRANT_ROLE_REFS) expect(workspaceRolesCoveredBy(ref)).not.toContain("GUEST");
  });

  it("rolesCovering: OWNER/ADMIN → [ADMIN, MEMBER]; MEMBER → [MEMBER]; GUEST/lạ/null → []", () => {
    expect([...rolesCovering("OWNER")]).toEqual(["ADMIN", "MEMBER"]);
    expect([...rolesCovering("ADMIN")]).toEqual(["ADMIN", "MEMBER"]);
    expect([...rolesCovering("MEMBER")]).toEqual(["MEMBER"]);
    expect(rolesCovering("GUEST")).toEqual([]);
    expect(rolesCovering("constructor")).toEqual([]); // không lọt qua prototype
    expect(rolesCovering(null)).toEqual([]);
    expect(rolesCovering(undefined)).toEqual([]);
  });

  it("workspaceRolesCoveredByAny gộp, bỏ trùng; isCoveredByAnyRole đối chiếu vai trò của người dùng", () => {
    expect(workspaceRolesCoveredByAny(["ADMIN", "MEMBER"]).sort()).toEqual(["ADMIN", "MEMBER", "OWNER"]);
    expect(workspaceRolesCoveredByAny([])).toEqual([]);
    expect(isCoveredByAnyRole("MEMBER", ["ADMIN"])).toBe(false);
    expect(isCoveredByAnyRole("MEMBER", ["ADMIN", "MEMBER"])).toBe(true);
    expect(isCoveredByAnyRole("ADMIN", ["ADMIN"])).toBe(true);
    expect(isCoveredByAnyRole("GUEST", ["ADMIN", "MEMBER"])).toBe(false);
  });

  it("isGrantRoleRef / roleSubjectKey / nhãn", () => {
    expect(isGrantRoleRef("ADMIN")).toBe(true);
    expect(isGrantRoleRef("MEMBER")).toBe(true);
    expect(isGrantRoleRef("OWNER")).toBe(false);
    expect(isGrantRoleRef(null)).toBe(false);
    expect(roleSubjectKey("ADMIN")).toBe("role:ADMIN");
    expect(roleSubjectKey("MEMBER")).toBe("role:MEMBER");
    expect(ROLE_REF_LABEL).toEqual({ ADMIN: "Quản trị viên", MEMBER: "Thành viên" });
  });
});
