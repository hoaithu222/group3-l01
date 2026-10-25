import type { WorkspaceRole } from './members.types';

export type InviteStatus = 'ACTIVE' | 'EXPIRED' | 'EXHAUSTED' | 'REVOKED';

/** `GET /workspaces/:id/invites` item (be.md p1-02 §4). */
export interface InviteRow {
  id: string;
  tokenPrefix: string;
  role: WorkspaceRole;
  maxUses: number;
  usesCount: number;
  expiresAt: string;
  status: InviteStatus;
  createdBy: { id: string; name: string };
  createdAt: string;
  lastUsedAt: string | null;
}

/** Meta cursor (`ResponseUtils.cursor`) — khác `members` là phân trang theo `page`. */
export interface CursorMeta {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

export interface InviteListPage {
  items: InviteRow[];
  meta: CursorMeta;
}

/** `expiresInHours` chỉ nhận 1/24/168 (1h · 24h · 7 ngày) — `LIMITS.invite.expiresHoursOptions`. */
export interface CreateInvitePayload {
  expiresInHours: 1 | 24 | 168;
  maxUses: number;
}

/** ⚠️ `url` chỉ trả Ở ĐÂY, một lần — KHÔNG đưa vào cache React Query (app.md §4). */
export interface CreateInviteResult {
  id: string;
  url: string;
  tokenPrefix: string;
  expiresAt: string;
  maxUses: number;
}

export interface InvitePreview {
  workspace: { id: string; name: string; avatarUrl: string | null; description: string | null };
  inviter: { name: string; avatarUrl: string | null };
  expiresAt: string;
  alreadyMember?: boolean;
}

/**
 * Body TUỲ CHỌN của `POST /invites/:token/accept` (be.md p3-04 §13.2 mục 8): `requestMessage` ≤ 500 ký tự, CHỈ được lưu khi lượt
 * chấp nhận tạo yêu cầu `PENDING` (nhóm `joinPolicy=APPROVAL`) rồi hiện ở `join-requests[].requestMessage`; nhóm mở bỏ qua.
 * Không có lời nhắn ⇒ KHÔNG gửi body (như trước khi có trường này).
 */
export interface AcceptInvitePayload {
  requestMessage?: string;
}

export interface AcceptInviteResult {
  workspaceId: string;
  defaultChannelId: string | null;
  alreadyMember: boolean;
  /**
   * p3-04: nhóm bật `joinPolicy=APPROVAL` → link mời chỉ tạo yêu cầu, BE trả
   * `status: 'PENDING'` (be.md §5.5, kèm HTTP 202 — không phải lỗi). Vắng mặt
   * (hoặc `'ACTIVE'`) ở nhóm mở: vào thẳng như cũ.
   */
  status?: 'ACTIVE' | 'PENDING';
}
