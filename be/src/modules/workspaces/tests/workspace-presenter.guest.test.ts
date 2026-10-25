/**
 * Unit — phần p3-04 của `workspace.presenter`: khách không thấy `memberCount`/chính sách nhóm, thấy `myExpiresAt`; người xin vào thấy thẻ
 * `status: "PENDING"`; `canInvite` của MEMBER theo `guestPolicy.memberCanInvite`.
 */
import { toWorkspaceDetail, toWorkspaceListItem, buildWorkspaceMyPermissions } from "../services/workspace.presenter";
import { computeWorkspaceActions } from "../services/workspace-permission.resolver";
import type { Workspace, WorkspaceMembership, WorkspaceRoleValue } from "../entities/workspace.interface";
import type { GuestPolicy } from "../../../core/constants/guest-policy";
import { createWorkspaceSchema } from "../dtos/create-workspace.dto";
import { updateWorkspaceSchema } from "../dtos/update-workspace.dto";

const EXPIRES = new Date("2026-10-01T00:00:00Z");
const POLICY: GuestPolicy = { enabled: true, maxGuests: 5, maxDays: 30, memberCanInvite: true };

function workspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: "ws1",
    name: "Nhóm",
    normalizedName: "nhom",
    description: null,
    avatarAssetId: null,
    ownerId: "o1",
    defaultChannelId: "ch1",
    status: "ACTIVE",
    archivedAt: null,
    archivedBy: null,
    archivedReason: null,
    archiveNote: null,
    memberCount: 7,
    lastActivityAt: new Date("2026-09-20T00:00:00Z"),
    version: 3,
    createdAt: new Date("2026-09-01T00:00:00Z"),
    updatedAt: new Date("2026-09-20T00:00:00Z"),
    ...overrides,
  };
}

function membership(role: WorkspaceRoleValue, overrides: Partial<WorkspaceMembership> = {}): WorkspaceMembership {
  return {
    id: "m1",
    workspaceId: "ws1",
    userId: "u1",
    role,
    status: "ACTIVE",
    displayName: null,
    joinedAt: new Date("2026-09-02T00:00:00Z"),
    leftAt: null,
    expiresAt: null,
    invitedBy: null,
    inviteLinkId: null,
    banReason: null,
    removedBy: null,
    isFavorite: false,
    position: null,
    notifyMode: "INHERIT",
    lastVisitedAt: null,
    ...overrides,
  };
}

const access = (role: WorkspaceRoleValue) => ({ visible: true, role, actions: computeWorkspaceActions(role, "ACTIVE") });

describe("toWorkspaceDetail — khách (p3-04 §5.6)", () => {
  it("GUEST: không memberCount, không joinPolicy/guestPolicy, có myExpiresAt", () => {
    const detail = toWorkspaceDetail(workspace({ joinPolicy: "APPROVAL" }), 7, access("GUEST"), membership("GUEST", { expiresAt: EXPIRES }), POLICY);
    expect("memberCount" in detail).toBe(false);
    expect("joinPolicy" in detail).toBe(false);
    expect("guestPolicy" in detail).toBe(false);
    expect(detail).toMatchObject({ myRole: "GUEST", myExpiresAt: EXPIRES });
    expect(detail.myPermissions).toMatchObject({ canInvite: false, canEdit: false, canCreateChannel: false });
  });

  it("MEMBER/OWNER: có memberCount + joinPolicy (mặc định OPEN) + guestPolicy khi được truyền; không có myExpiresAt", () => {
    const detail = toWorkspaceDetail(workspace(), 7, access("MEMBER"), membership("MEMBER"), POLICY);
    expect(detail).toMatchObject({ memberCount: 7, joinPolicy: "OPEN", guestPolicy: POLICY });
    expect("myExpiresAt" in detail).toBe(false);
    expect(toWorkspaceDetail(workspace({ joinPolicy: "APPROVAL" }), 7, access("OWNER"), membership("OWNER"), POLICY).joinPolicy).toBe("APPROVAL");
  });
});

describe("toWorkspaceDetail — múi giờ nhóm (đồng bộ chéo #9)", () => {
  it("chưa đặt: timezone null + effectiveTimezone = mặc định hệ thống được truyền vào (cả với khách)", () => {
    const d = toWorkspaceDetail(workspace(), 7, access("MEMBER"), membership("MEMBER"), POLICY, "Asia/Bangkok");
    expect([d.timezone, d.effectiveTimezone]).toEqual([null, "Asia/Bangkok"]);
    const g = toWorkspaceDetail(workspace(), 7, access("GUEST"), membership("GUEST", { expiresAt: EXPIRES }), POLICY, "Asia/Bangkok");
    expect([g.timezone, g.effectiveTimezone]).toEqual([null, "Asia/Bangkok"]);
  });

  it("đã đặt IANA hợp lệ: effectiveTimezone = giá trị của nhóm; giá trị lạ trong dữ liệu cũ → rơi về mặc định (không ném)", () => {
    const set = toWorkspaceDetail(workspace({ timezone: "Asia/Tokyo" }), 7, access("OWNER"), membership("OWNER"), POLICY, "Asia/Bangkok");
    expect([set.timezone, set.effectiveTimezone]).toEqual(["Asia/Tokyo", "Asia/Tokyo"]);
    const bad = toWorkspaceDetail(workspace({ timezone: "Khong/Ton_Tai" }), 7, access("OWNER"), membership("OWNER"), POLICY, "Asia/Bangkok");
    expect(bad.effectiveTimezone).toBe("Asia/Bangkok");
  });

  it("không truyền mặc định hệ thống (test/hàm cũ) → Asia/Ho_Chi_Minh", () => {
    expect(toWorkspaceDetail(workspace(), 7, access("OWNER"), membership("OWNER")).effectiveTimezone).toBe("Asia/Ho_Chi_Minh");
  });
});

describe("DTO tạo/sửa nhóm — timezone (đồng bộ chéo #9)", () => {
  it("createWorkspaceSchema: IANA hợp lệ nhận (cắt khoảng trắng), sai định dạng/không tồn tại → lỗi; vắng = hợp lệ", () => {
    expect(createWorkspaceSchema.parse({ name: "Nhóm học", timezone: " Asia/Tokyo " }).timezone).toBe("Asia/Tokyo");
    expect(createWorkspaceSchema.safeParse({ name: "Nhóm học" }).success).toBe(true);
    for (const timezone of ["Khong/Ton_Tai", "", "UTC+7 giờ", "x".repeat(70)]) {
      expect(createWorkspaceSchema.safeParse({ name: "Nhóm học", timezone }).success).toBe(false);
    }
  });

  it("updateWorkspaceSchema: chỉ đổi timezone là một thay đổi hợp lệ; null = về mặc định; sai → lỗi", () => {
    const base = { expectedVersion: 1 };
    expect(updateWorkspaceSchema.safeParse({ ...base, timezone: "Europe/Paris" }).success).toBe(true);
    expect(updateWorkspaceSchema.safeParse({ ...base, timezone: null }).success).toBe(true);
    expect(updateWorkspaceSchema.safeParse({ ...base, timezone: "Khong/Ton_Tai" }).success).toBe(false);
    expect(updateWorkspaceSchema.safeParse(base).success).toBe(false); // vẫn "Không có thay đổi"
  });
});

describe("buildWorkspaceMyPermissions.canInvite", () => {
  it("OWNER/ADMIN luôn true; MEMBER true CHỈ khi memberCanInvite; GUEST luôn false", () => {
    expect(buildWorkspaceMyPermissions(access("OWNER"), "OWNER", { ...POLICY, memberCanInvite: false }).canInvite).toBe(true);
    expect(buildWorkspaceMyPermissions(access("ADMIN"), "ADMIN").canInvite).toBe(true);
    expect(buildWorkspaceMyPermissions(access("MEMBER"), "MEMBER", { ...POLICY, memberCanInvite: false }).canInvite).toBe(false);
    expect(buildWorkspaceMyPermissions(access("MEMBER"), "MEMBER").canInvite).toBe(false);
    expect(buildWorkspaceMyPermissions(access("MEMBER"), "MEMBER", POLICY).canInvite).toBe(true);
    expect(buildWorkspaceMyPermissions(access("GUEST"), "GUEST", POLICY).canInvite).toBe(false);
  });
});

describe("toWorkspaceListItem", () => {
  it("membership PENDING → status \"PENDING\" (thẻ Đang chờ duyệt) kể cả khi nhóm ACTIVE", () => {
    const item = toWorkspaceListItem(workspace(), membership("MEMBER", { status: "PENDING" }), undefined);
    expect(item).toMatchObject({ status: "PENDING", myRole: "MEMBER", unreadCount: 0, unreadAvailable: false });
  });

  it("khách có myExpiresAt; thành viên thường không có trường này; nhóm ARCHIVED giữ status ARCHIVED", () => {
    expect(toWorkspaceListItem(workspace(), membership("GUEST", { expiresAt: EXPIRES }), undefined)).toMatchObject({ myRole: "GUEST", myExpiresAt: EXPIRES });
    const plain = toWorkspaceListItem(workspace({ status: "ARCHIVED" }), membership("MEMBER"), undefined);
    expect("myExpiresAt" in plain).toBe(false);
    expect(plain.status).toBe("ARCHIVED");
  });
});
