export interface AccessCounts {
  /** Thành viên `ACTIVE` (mọi vai trò, kể cả khách) và thành viên bị chặn (`BANNED`) — SummaryCard đầu bảng thành viên ở admin. */
  activeMembers: number;
  bannedMembers: number;
  /** Link mời (`InviteLink`) còn dùng được: chưa thu hồi, chưa hết hạn, còn lượt — CHỈ SỐ LƯỢNG, không token. */
  activeInviteLinks: number;
  activeGuests: number;
  guestsExpiringSoon: number;
  pendingRequests: number;
  pendingInvitations: number;
  privateChannels: number;
  privateChannelsWithRoleGrant: number;
}

/** Số liệu tổng hợp quyền truy cập của 1 nhóm cho `GET /admin/workspaces/:id/access-summary` — CHỈ số lượng, không nội dung. */
export interface IAccessSummaryRepository {
  counts(workspaceId: string, now: Date, expiringBefore: Date): Promise<AccessCounts>;
}
