import {
  ROLE_PERMISSIONS,
  permissionsForRole,
  isPermissionKey,
  ADMIN_RESOURCES,
} from "../permissions";
import { parseFeatureFlags } from "../modules";

describe("permissions", () => {
  it("admin có mọi quyền trừ partner", () => {
    expect(ROLE_PERMISSIONS.admin).toContain("user:delete");
    expect(ROLE_PERMISSIONS.admin).not.toContain("partner:view");
    expect(ROLE_PERMISSIONS.admin.length).toBe((ADMIN_RESOURCES.length - 1) * 6);
  });
  it("manager không đổi role người dùng", () => {
    expect(permissionsForRole("manager")).toContain("user:view");
    expect(permissionsForRole("manager")).not.toContain("user:update");
  });
  it("(p2-07) meeting: admin đủ 6 action; manager xem/kết thúc cưỡng bức/xuất CSV nhưng KHÔNG xoá; user không có gì", () => {
    expect(ADMIN_RESOURCES).toContain("meeting");
    for (const action of ["view", "create", "update", "delete", "export", "approve"]) expect(ROLE_PERMISSIONS.admin).toContain(`meeting:${action}`);
    expect(permissionsForRole("manager").filter((k) => k.startsWith("meeting:")).sort()).toEqual(["meeting:export", "meeting:update", "meeting:view"]);
    expect(permissionsForRole("manager")).not.toContain("meeting:delete");
    expect(permissionsForRole("user").some((k) => k.startsWith("meeting:"))).toBe(false);
    expect(isPermissionKey("meeting:delete")).toBe(true);
  });
  it("role lạ → rỗng; key hợp lệ", () => {
    expect(permissionsForRole("ghost")).toEqual([]);
    expect(isPermissionKey("o2o:approve")).toBe(true);
    expect(isPermissionKey("x:y")).toBe(false);
  });
});

describe("feature flags", () => {
  it("parse và cảnh báo khoá lạ", () => {
    const { flags, unknown } = parseFeatureFlags("communication=true, foo=1, push=false");
    expect(flags.communication).toBe(true);
    expect(flags.push).toBe(false);
    expect(unknown).toEqual(["foo"]);
  });
});
