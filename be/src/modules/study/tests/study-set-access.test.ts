import { ForbiddenError, ScopeNotFoundError } from "../../../core/exceptions";
import type { StudySet } from "../entities/study-set.interface";
import { StudySetAccess } from "../services/study-set-access";
import { ADMIN, AUTHOR, FakeRoles, GUEST, MEMBER, OWNER, STRANGER, WS, WS2 } from "./support/harness";

function makeSet(over: Partial<StudySet> = {}): StudySet {
  return {
    id: "0000000000000000000000f1",
    ownerId: AUTHOR.id,
    workspaceId: null,
    title: "Bộ học",
    normalizedTitle: "bo hoc",
    description: null,
    tags: [],
    coverAssetId: null,
    language: null,
    visibility: "PRIVATE",
    status: "ACTIVE",
    hiddenReason: null,
    hiddenBy: null,
    hiddenAt: null,
    itemCount: 0,
    itemTypesMask: 0,
    reportedCount: 0,
    copiedFromId: null,
    copyCount: 0,
    version: 1,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

describe("study-set-access — ma trận quyền README p4-01 §6", () => {
  let roles: FakeRoles;
  let access: StudySetAccess;

  beforeEach(() => {
    roles = new FakeRoles(); // chỉ chứa vai THÀNH VIÊN; GUEST/người ngoài → null (đúng hợp đồng `IStudyWorkspaceRoles`)
    access = new StudySetAccess(roles);
  });

  const perms = (user: typeof AUTHOR, set: StudySet) => access.resolve(user, set);

  describe("PRIVATE", () => {
    const set = makeSet();
    it("tác giả xem/học/sửa/xoá/nhân bản; không tự báo cáo, không ẩn", async () => {
      expect(await perms(AUTHOR, set)).toEqual({ meta: true, content: true, edit: true, delete: true, duplicate: true, report: false, hide: false, unhide: false });
    });
    it("mọi người khác (kể cả OWNER nhóm và người đăng nhập) → không thấy gì (404)", async () => {
      for (const u of [OWNER, ADMIN, MEMBER, STRANGER, GUEST]) {
        expect(await perms(u, set)).toMatchObject({ meta: false, content: false });
      }
      await expect(access.assertMeta(STRANGER, set)).rejects.toBeInstanceOf(ScopeNotFoundError);
    });
  });

  describe("WORKSPACE (nhóm WS)", () => {
    const set = makeSet({ visibility: "WORKSPACE", workspaceId: WS });
    it("OWNER/ADMIN/MEMBER xem, học, nhân bản, báo cáo; chỉ OWNER/ADMIN ẩn; không ai ngoài tác giả sửa/xoá", async () => {
      expect(await perms(MEMBER, set)).toEqual({ meta: true, content: true, edit: false, delete: false, duplicate: true, report: true, hide: false, unhide: false });
      for (const u of [OWNER, ADMIN]) {
        expect(await perms(u, set)).toEqual({ meta: true, content: true, edit: false, delete: false, duplicate: true, report: true, hide: true, unhide: false });
      }
    });
    it("GUEST và người ngoài nhóm → 404; người ở nhóm KHÁC → 404", async () => {
      expect(await perms(GUEST, set)).toMatchObject({ meta: false, content: false });
      expect(await perms(STRANGER, set)).toMatchObject({ meta: false, content: false });
      expect(await perms(OWNER, makeSet({ visibility: "WORKSPACE", workspaceId: WS2 }))).toMatchObject({ meta: false });
    });
    it("bộ đã chuyển về PRIVATE: thành viên nhóm mất quyền ngay (quyền tính lại mỗi lần)", async () => {
      expect(await perms(MEMBER, { ...set, visibility: "PRIVATE" })).toMatchObject({ meta: false, content: false });
    });
  });

  describe("PUBLIC ACTIVE", () => {
    const set = makeSet({ visibility: "PUBLIC" });
    it("mọi người dùng đăng nhập xem/học/nhân bản/báo cáo (kể cả GUEST của một nhóm)", async () => {
      for (const u of [MEMBER, GUEST, STRANGER, OWNER]) {
        expect(await perms(u, set)).toEqual({ meta: true, content: true, edit: false, delete: false, duplicate: true, report: true, hide: false, unhide: false });
      }
    });
    it("không cần tra vai trò nhóm", async () => {
      await perms(STRANGER, set);
      expect(roles.calls).toBe(0);
    });
  });

  describe("HIDDEN — ST-19", () => {
    it("bộ PUBLIC đã ẩn: người khác 404; tác giả vẫn thấy nhưng không sửa/nhân bản (chỉ xoá)", async () => {
      const set = makeSet({ visibility: "PUBLIC", status: "HIDDEN" });
      expect(await perms(STRANGER, set)).toMatchObject({ meta: false, content: false });
      expect(await perms(OWNER, set)).toMatchObject({ meta: false });
      expect(await perms(AUTHOR, set)).toEqual({ meta: true, content: true, edit: false, delete: true, duplicate: false, report: false, hide: false, unhide: false });
    });
    it("bộ WORKSPACE đã ẩn: OWNER/ADMIN chỉ thấy metadata + khôi phục được; MEMBER 404", async () => {
      const set = makeSet({ visibility: "WORKSPACE", workspaceId: WS, status: "HIDDEN" });
      expect(await perms(ADMIN, set)).toEqual({ meta: true, content: false, edit: false, delete: false, duplicate: false, report: false, hide: false, unhide: true });
      expect(await perms(MEMBER, set)).toMatchObject({ meta: false, content: false, unhide: false });
    });
    it("sửa bộ đã ẩn (tác giả) → STUDY_004; người khác thấy được → 403", async () => {
      await expect(access.assertEdit(AUTHOR, makeSet({ status: "HIDDEN" }))).rejects.toMatchObject({ errorCode: "STUDY_004", statusCode: 409 });
      await expect(access.assertEdit(MEMBER, makeSet({ visibility: "WORKSPACE", workspaceId: WS }))).rejects.toBeInstanceOf(ForbiddenError);
      await expect(access.assertEdit(STRANGER, makeSet())).rejects.toBeInstanceOf(ScopeNotFoundError);
    });
  });

  it("DELETED → 404 cho mọi người, kể cả tác giả", async () => {
    const set = makeSet({ status: "DELETED", deletedAt: new Date() });
    for (const u of [AUTHOR, OWNER, STRANGER]) expect(await perms(u, set)).toMatchObject({ meta: false, content: false, delete: false });
  });

  it("canView = quyền ĐỌC NỘI DUNG (hợp đồng dùng lại cho p4-02/p5-01)", async () => {
    expect(await access.canView(MEMBER, makeSet({ visibility: "WORKSPACE", workspaceId: WS }))).toBe(true);
    expect(await access.canView(ADMIN, makeSet({ visibility: "WORKSPACE", workspaceId: WS, status: "HIDDEN" }))).toBe(false);
  });

  it("filterViewable: lọc theo quyền và tra vai trò MỘT lần cho mỗi nhóm", async () => {
    const sets = [
      makeSet({ id: "0000000000000000000000f1", visibility: "WORKSPACE", workspaceId: WS }),
      makeSet({ id: "0000000000000000000000f2", visibility: "WORKSPACE", workspaceId: WS }),
      makeSet({ id: "0000000000000000000000f3", visibility: "WORKSPACE", workspaceId: WS2 }),
      makeSet({ id: "0000000000000000000000f4", visibility: "PRIVATE" }),
      makeSet({ id: "0000000000000000000000f5", visibility: "PUBLIC" }),
    ];
    const seen = await access.filterViewable(MEMBER, sets);
    expect(seen.map((s) => s.id)).toEqual(["0000000000000000000000f1", "0000000000000000000000f2", "0000000000000000000000f5"]);
    expect(roles.calls).toBe(2); // WS + WS2, không phải 3
  });
});
