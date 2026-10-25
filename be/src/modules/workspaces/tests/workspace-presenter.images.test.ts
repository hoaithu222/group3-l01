/**
 * Unit — ảnh nhóm trong mọi view (`workspace.presenter.ts`): `avatarUrl` (THUMB), `coverUrl` (ORIGINAL), `coverThumbUrl` (THUMB) là URL ký
 * sẵn dựng từ CỘT `avatarAssetId`/`coverAssetId` (`shared/media`), `coverPreset` lọc qua `toWorkspaceCoverPreset` (khoá lạ → null). Danh
 * sách, chi tiết (kể cả khách) và hàng admin cùng đủ 4 trường; hàng admin KHÔNG lộ asset id thô.
 */
import { env } from "../../../core/config";
import { verifyDisplayImageSignature } from "../../../shared/media";
import {
  toAdminWorkspaceRow,
  toAdminWorkspaceRowOf,
  toWorkspaceDetail,
  toWorkspaceListItem,
  workspaceImagesOf,
} from "../services/workspace.presenter";
import { computeWorkspaceActions } from "../services/workspace-permission.resolver";
import {
  WORKSPACE_COVER_PRESETS,
  toWorkspaceCoverPreset,
  type AdminWorkspaceRecord,
  type Workspace,
  type WorkspaceMembership,
  type WorkspaceRoleValue,
} from "../entities/workspace.interface";

const AVATAR = "65f00000000000000000ee01";
const COVER = "65f00000000000000000ee02";
const IMAGE_KEYS = ["avatarUrl", "coverUrl", "coverThumbUrl", "coverPreset"] as const;

function workspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: "65f00000000000000000ee10",
    name: "Nhóm ảnh",
    normalizedName: "nhom anh",
    description: null,
    avatarAssetId: null,
    ownerId: "65f00000000000000000ee11",
    defaultChannelId: null,
    status: "ACTIVE",
    archivedAt: null,
    archivedBy: null,
    archivedReason: null,
    archiveNote: null,
    memberCount: 3,
    lastActivityAt: new Date("2026-09-20T00:00:00Z"),
    version: 4,
    createdAt: new Date("2026-09-01T00:00:00Z"),
    updatedAt: new Date("2026-09-20T00:00:00Z"),
    ...overrides,
  };
}

function membership(role: WorkspaceRoleValue, overrides: Partial<WorkspaceMembership> = {}): WorkspaceMembership {
  return {
    id: "m1",
    workspaceId: "65f00000000000000000ee10",
    userId: "u1",
    role,
    status: "ACTIVE",
    displayName: null,
    joinedAt: new Date("2026-09-02T00:00:00Z"),
    leftAt: null,
    expiresAt: role === "GUEST" ? new Date("2026-10-01T00:00:00Z") : null,
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

/** URL ảnh hiển thị hợp lệ của đúng asset + biến thể. */
function expectDisplayUrl(url: string | null, assetId: string, variant: "THUMB" | "ORIGINAL"): void {
  expect(url).toMatch(new RegExp(`^https://api\\.example\\.test/api/v1/assets/${assetId}/image\\?v=${variant}&e=\\d+&s=[0-9a-f]{64}$`));
  const parsed = new URL(url ?? "");
  expect(verifyDisplayImageSignature(assetId, Number(parsed.searchParams.get("e")), parsed.searchParams.get("s") ?? "")).toBe(true);
}

const originalApiUrl = env.PUBLIC_API_URL;
beforeEach(() => {
  env.PUBLIC_API_URL = "https://api.example.test";
  // Cố định "bây giờ" — URL ký làm tròn theo ngày, so sánh hai lần dựng không được vắt qua nửa đêm UTC.
  jest.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 8, 20, 8, 0, 0));
});
afterEach(() => {
  env.PUBLIC_API_URL = originalApiUrl;
});

describe("toWorkspaceCoverPreset", () => {
  it("nhận đúng 7 khoá của bảng; khoá lạ/khác hoa thường/rỗng/null/undefined → null", () => {
    expect(WORKSPACE_COVER_PRESETS).toHaveLength(7);
    for (const key of WORKSPACE_COVER_PRESETS) expect(toWorkspaceCoverPreset(key)).toBe(key);
    for (const bad of ["neon", "Violet", " violet", "", null, undefined]) expect(toWorkspaceCoverPreset(bad)).toBeNull();
  });
});

describe("workspaceImagesOf", () => {
  it("đủ ảnh: avatar THUMB, bìa ORIGINAL + THUMB của cùng asset bìa, preset giữ nguyên", () => {
    const images = workspaceImagesOf({ avatarAssetId: AVATAR, coverAssetId: COVER, coverPreset: "ocean" });
    expectDisplayUrl(images.avatarUrl, AVATAR, "THUMB");
    expectDisplayUrl(images.coverUrl, COVER, "ORIGINAL");
    expectDisplayUrl(images.coverThumbUrl, COVER, "THUMB");
    expect(images.coverPreset).toBe("ocean");
  });

  it("chưa có ảnh: mọi URL null; cột vắng (fixture/nhóm cũ) cũng null; preset lạ trong DB → null", () => {
    expect(workspaceImagesOf({ avatarAssetId: null, coverAssetId: null, coverPreset: null })).toEqual({
      avatarUrl: null,
      coverUrl: null,
      coverThumbUrl: null,
      coverPreset: null,
    });
    expect(workspaceImagesOf({ avatarAssetId: null })).toEqual({ avatarUrl: null, coverUrl: null, coverThumbUrl: null, coverPreset: null });
    expect(workspaceImagesOf({ avatarAssetId: null, coverAssetId: null, coverPreset: "khoa-da-bo" }).coverPreset).toBeNull();
  });
});

describe("list / detail — đủ 4 trường ảnh", () => {
  const withImages = workspace({ avatarAssetId: AVATAR, coverAssetId: COVER, coverPreset: "rose" });

  it("toWorkspaceListItem", () => {
    const item = toWorkspaceListItem(withImages, membership("MEMBER"), undefined);
    for (const key of IMAGE_KEYS) expect(item).toHaveProperty(key);
    expectDisplayUrl(item.avatarUrl, AVATAR, "THUMB");
    expectDisplayUrl(item.coverUrl, COVER, "ORIGINAL");
    expectDisplayUrl(item.coverThumbUrl, COVER, "THUMB");
    expect(item.coverPreset).toBe("rose");

    const plain = toWorkspaceListItem(workspace({ coverPreset: "???" }), membership("MEMBER"), undefined);
    expect(plain).toMatchObject({ avatarUrl: null, coverUrl: null, coverThumbUrl: null, coverPreset: null });
  });

  it("toWorkspaceDetail — thành viên và cả KHÁCH đều thấy ảnh nhóm", () => {
    for (const role of ["OWNER", "MEMBER", "GUEST"] as const) {
      const detail = toWorkspaceDetail(withImages, 3, access(role), membership(role));
      for (const key of IMAGE_KEYS) expect(detail).toHaveProperty(key);
      expectDisplayUrl(detail.avatarUrl, AVATAR, "THUMB");
      expectDisplayUrl(detail.coverUrl, COVER, "ORIGINAL");
      expect(detail.coverPreset).toBe("rose");
    }
    expect(toWorkspaceDetail(workspace({ coverPreset: "slate" }), 3, access("OWNER"), membership("OWNER"))).toMatchObject({
      avatarUrl: null,
      coverUrl: null,
      coverThumbUrl: null,
      coverPreset: "slate",
    });
  });
});

describe("hàng admin", () => {
  const record: AdminWorkspaceRecord = {
    id: "65f00000000000000000ee10",
    name: "Nhóm ảnh",
    avatarAssetId: AVATAR,
    coverAssetId: COVER,
    coverPreset: "forest",
    owner: { id: "65f00000000000000000ee11", name: "Chủ nhóm" },
    memberCount: 3,
    status: "ACTIVE",
    createdAt: new Date("2026-09-01T00:00:00Z"),
    lastActivityAt: new Date("2026-09-20T00:00:00Z"),
  };

  it("toAdminWorkspaceRow(record): asset id → URL ký sẵn, KHÔNG trả avatarAssetId/coverAssetId thô, giữ các trường khác", () => {
    const row = toAdminWorkspaceRow(record);
    expect(Object.keys(row).sort()).toEqual(
      ["avatarUrl", "coverPreset", "coverThumbUrl", "coverUrl", "createdAt", "id", "lastActivityAt", "memberCount", "name", "owner", "status"].sort()
    );
    expectDisplayUrl(row.avatarUrl, AVATAR, "THUMB");
    expectDisplayUrl(row.coverUrl, COVER, "ORIGINAL");
    expectDisplayUrl(row.coverThumbUrl, COVER, "THUMB");
    expect(row).toMatchObject({ coverPreset: "forest", owner: record.owner, memberCount: 3, status: "ACTIVE" });

    expect(toAdminWorkspaceRow({ ...record, avatarAssetId: null, coverAssetId: null, coverPreset: "lạ" })).toMatchObject({
      avatarUrl: null,
      coverUrl: null,
      coverThumbUrl: null,
      coverPreset: null,
    });
  });

  it("toAdminWorkspaceRowOf(workspace, owner) cùng hình với hàng danh sách; nhóm thiếu cột bìa (dữ liệu cũ) → null", () => {
    const full = workspace({ avatarAssetId: AVATAR, coverAssetId: COVER, coverPreset: "forest" });
    expect(toAdminWorkspaceRowOf(full, record.owner)).toEqual(toAdminWorkspaceRow(record));
    expect(toAdminWorkspaceRowOf(workspace(), null)).toMatchObject({ owner: null, avatarUrl: null, coverUrl: null, coverThumbUrl: null, coverPreset: null });
  });
});
