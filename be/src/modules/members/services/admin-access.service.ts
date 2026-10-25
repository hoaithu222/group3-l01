import { LIMITS } from "../../../core/constants/limits";
import { NotFoundError } from "../../../core/exceptions";
import { resolveGuestPolicy, type GuestPolicy } from "../../../core/constants/guest-policy";
import type { IGuestConfig } from "../../../core/config/guest-config";
import type { IInvitationRepository } from "../repositories/invitation.repository.interface";
import type { IAccessSummaryRepository } from "../repositories/access-summary.repository.interface";
import type { InvitationRoleValue, InvitationStatusValue } from "../entities/invitation.interface";
import { maskEmail } from "./invitation-rules";

export interface AccessSummary {
  joinPolicy: "OPEN" | "APPROVAL";
  guestPolicy: GuestPolicy;
  /** Thành viên ACTIVE (mọi vai trò) và bị chặn (`BANNED`) — SummaryCard của tab Thành viên ở admin (p1-02 admin.md §2.1). */
  members: { active: number; banned: number };
  /** Link mời còn dùng được (chưa thu hồi/hết hạn/hết lượt) — CHỈ SỐ LƯỢNG, không token. */
  inviteLinks: { active: number };
  guests: { active: number; expiringIn48h: number };
  pendingRequests: number;
  pendingInvitations: number;
  /** Chỉ SỐ LƯỢNG — không tên kênh riêng tư. */
  privateChannels: { total: number; withRoleGrant: number };
}

/** Hàng bảng lời mời ở admin: email ĐÃ CHE ở server, không token, không lời nhắn. */
export interface AdminInvitationRow {
  id: string;
  email: string;
  role: InvitationRoleValue;
  invitedBy: string | null;
  status: InvitationStatusValue;
  expiresAt: Date;
  createdAt: Date;
}

/** Admin nền tảng chỉ XEM cấu hình truy cập + lời mời (không mời/duyệt thay chủ nhóm) — be.md p3-04 admin §3. */
export class AdminAccessService {
  constructor(
    private readonly invitations: IInvitationRepository,
    private readonly summaries: IAccessSummaryRepository,
    private readonly guestConfig: IGuestConfig
  ) {}

  async summary(workspaceId: string, now: Date = new Date()): Promise<AccessSummary> {
    const workspace = await this.invitations.findWorkspace(workspaceId);
    if (!workspace) throw new NotFoundError();
    const expiringBefore = new Date(now.getTime() + LIMITS.guest.expiringNoticeHours * 3600_000);
    const [counts, config] = await Promise.all([this.summaries.counts(workspaceId, now, expiringBefore), this.guestConfig.load()]);
    return {
      joinPolicy: workspace.joinPolicy,
      guestPolicy: resolveGuestPolicy(workspace.guestPolicy, config),
      members: { active: counts.activeMembers, banned: counts.bannedMembers },
      inviteLinks: { active: counts.activeInviteLinks },
      guests: { active: counts.activeGuests, expiringIn48h: counts.guestsExpiringSoon },
      pendingRequests: counts.pendingRequests,
      pendingInvitations: counts.pendingInvitations,
      privateChannels: { total: counts.privateChannels, withRoleGrant: counts.privateChannelsWithRoleGrant },
    };
  }

  /** Phân trang `page/limit` (danh sách quản trị — conventions §2). Lấy tối đa 500 dòng gần nhất rồi cắt trang — đủ cho quy mô 1 nhóm. */
  async listInvitations(
    workspaceId: string,
    query: { status?: InvitationStatusValue; page: number; limit: number }
  ): Promise<{ data: AdminInvitationRow[]; total: number }> {
    const workspace = await this.invitations.findWorkspace(workspaceId);
    if (!workspace) throw new NotFoundError();
    const all = await this.invitations.listAllByWorkspace(workspaceId, query.status);
    const start = (query.page - 1) * query.limit;
    const rows = all.slice(start, start + query.limit).map<AdminInvitationRow>((i) => ({
      id: i.id,
      email: maskEmail(i.email),
      role: i.role,
      invitedBy: i.invitedBy,
      status: i.status,
      expiresAt: i.expiresAt,
      createdAt: i.createdAt,
    }));
    return { data: rows, total: all.length };
  }
}
