import type { WorkspaceInvitation, InvitationStatusValue, JoinPolicyValue } from "../entities/invitation.interface";

/** Workspace tối thiểu cho luồng mời/duyệt (đọc thẳng model dùng chung, giống `invite.service.ts`). */
export interface WorkspaceBrief {
  id: string;
  name: string;
  /** Ảnh đại diện nhóm (asset id thô) — presenter đổi thành URL ký sẵn bằng `avatarUrlOf`; `null` = chưa đặt. */
  avatarAssetId: string | null;
  status: "ACTIVE" | "ARCHIVED";
  joinPolicy: JoinPolicyValue;
  /** JSON thô — chuẩn hoá bằng `resolveGuestPolicy`. */
  guestPolicy: unknown;
  defaultChannelId: string | null;
}

export interface UserBrief {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
}

/** Thông tin tối thiểu của kênh (thuộc workspace) — kiểm kênh chỉ định cho khách và lấy TÊN cho màn xem trước. */
export interface ChannelBrief {
  id: string;
  name: string;
  visibility: "PUBLIC" | "PRIVATE";
  status: "ACTIVE" | "ARCHIVED";
}

export interface InvitationListParams {
  status?: InvitationStatusValue;
  cursor?: string;
  limit: number;
}

/**
 * Đọc + đếm `WorkspaceInvitation` (p3-04). TẠO/CHẤP NHẬN/THU HỒI/GỬI LẠI (CAS `status`/`pendingKey` + outbox) đi qua
 * `withTransaction` trực tiếp trong service — cùng mẫu `IInviteLinkRepository`.
 */
export interface IInvitationRepository {
  findById(id: string): Promise<WorkspaceInvitation | null>;
  findByTokenHash(tokenHash: string): Promise<WorkspaceInvitation | null>;
  listByWorkspace(
    workspaceId: string,
    params: InvitationListParams
  ): Promise<{ data: WorkspaceInvitation[]; hasMore: boolean }>;
  /** Toàn bộ lời mời của nhóm (mới nhất trước), lọc trạng thái — bảng admin phân trang page/limit; tối đa 500 dòng gần nhất. */
  listAllByWorkspace(workspaceId: string, status?: InvitationStatusValue): Promise<WorkspaceInvitation[]>;
  /** Lời mời PENDING chưa hết hạn khớp email (đã chuẩn hoá) — `GET /me/invitations`. */
  listPendingByEmail(normalizedEmail: string, now: Date): Promise<WorkspaceInvitation[]>;
  /** Số lời mời tạo trong workspace kể từ `since` (hạn mức `LIMITS.invitation.perWorkspacePerDayMax`). */
  countCreatedSince(workspaceId: string, since: Date): Promise<number>;
  findWorkspace(workspaceId: string): Promise<WorkspaceBrief | null>;
  findUserById(userId: string): Promise<UserBrief | null>;
  /** Tài khoản có email nằm trong `emails` (khớp chính xác từng giá trị truyền vào — người gọi truyền cả bản gốc lẫn chữ thường). */
  findUsersByEmails(emails: string[]): Promise<UserBrief[]>;
  /** Khách ACTIVE (kể cả đã quá hạn nhưng chưa quét) — hạn mức `maxGuests`. */
  countActiveGuests(workspaceId: string): Promise<number>;
  /** Lời mời khách PENDING chưa quá hạn — cũng tính vào hạn mức `maxGuests` để không phát hành vượt trần. */
  countPendingGuestInvitations(workspaceId: string, now: Date): Promise<number>;
  /** Kênh của workspace theo id (id lạ/thuộc workspace khác bị bỏ). */
  listChannels(workspaceId: string, channelIds: string[]): Promise<ChannelBrief[]>;
  /** Lời mời PENDING còn hạn theo (workspace, email đã chuẩn hoá). */
  findPendingFor(workspaceId: string, normalizedEmail: string): Promise<WorkspaceInvitation | null>;
}
