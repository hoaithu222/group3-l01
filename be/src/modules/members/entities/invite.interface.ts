import type { WorkspaceRoleValue } from "./member.interface";

export interface InviteLink {
  id: string;
  workspaceId: string;
  tokenHash: string;
  tokenPrefix: string;
  role: WorkspaceRoleValue;
  maxUses: number;
  remainingUses: number;
  usesCount: number;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedBy: string | null;
  createdBy: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export interface InviteLinkCreateInput {
  workspaceId: string;
  tokenHash: string;
  tokenPrefix: string;
  maxUses: number;
  expiresAt: Date;
  createdBy: string;
}

export type InviteStatus = "ACTIVE" | "EXPIRED" | "EXHAUSTED" | "REVOKED";

/** `GET /workspaces/:id/invites` item (be.md p1-02 §4). */
export interface InviteRow {
  id: string;
  tokenPrefix: string;
  role: WorkspaceRoleValue;
  maxUses: number;
  usesCount: number;
  expiresAt: Date;
  status: InviteStatus;
  createdBy: { id: string; name: string };
  createdAt: Date;
  lastUsedAt: Date | null;
}

/** `POST /workspaces/:id/invites` response — `url` CHỈ trả ở đây, không lưu lại (be.md §5.1). */
export interface CreateInviteResult {
  id: string;
  url: string;
  tokenPrefix: string;
  expiresAt: Date;
  maxUses: number;
}

/** `GET /invites/:token` response (be.md §4) — trung tính, không lộ workspace khi đã hết hiệu lực. */
export interface InvitePreview {
  workspace: { id: string; name: string; avatarUrl: string | null; description: string | null };
  inviter: { name: string; avatarUrl: string | null };
  expiresAt: Date;
  /**
   * p3-04 — nhóm bật duyệt tham gia (`joinPolicy=APPROVAL`): `POST /invites/:token/accept` chỉ TẠO YÊU CẦU chờ OWNER/ADMIN duyệt (HTTP 202,
   * `status: "PENDING"`) thay vì vào thẳng — app đổi nút "Tham gia" thành "Gửi yêu cầu tham gia" và hiện ô lời nhắn (`requestMessage`) NGAY từ bản xem trước.
   */
  requiresApproval: boolean;
  alreadyMember?: boolean;
}

export interface AcceptInviteResult {
  workspaceId: string;
  defaultChannelId: string | null;
  alreadyMember: boolean;
  /**
   * p3-04 — nhóm bật `joinPolicy=APPROVAL`: link chỉ tạo yêu cầu, trả `PENDING` (controller đáp HTTP 202, KHÔNG phải lỗi).
   * Vắng mặt (hoặc `ACTIVE`) ở nhóm mở: vào thẳng như Phase 1.
   */
  status?: "ACTIVE" | "PENDING";
}
