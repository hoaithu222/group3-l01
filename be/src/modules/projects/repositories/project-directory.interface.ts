export interface UserSummary {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/**
 * Tra cứu chỉ-đọc xuyên collection mà dự án cần (thành viên, tên người). Đây là kiểm tra TÍNH HỢP LỆ DỮ LIỆU
 * (người làm phải là thành viên ACTIVE, không GUEST), KHÔNG quyết định quyền — quyền đi qua `permissionService`.
 */
export interface IProjectDirectory {
  /** Id (trong `userIds`) là thành viên ACTIVE MEMBER/ADMIN/OWNER (không GUEST) của workspace. */
  activeMemberIds(workspaceId: string, userIds: string[]): Promise<Set<string>>;
  /**
   * Tên hiển thị + avatar cho một tập id (id không tồn tại vắng mặt). `avatarUrl` = URL ảnh ký sẵn bản THUMB
   * (`avatarUrlOf(User.avatarAssetId)`, `shared/media`), `null` khi chưa đặt ảnh hoặc đã ẩn danh hoá.
   */
  userSummaries(userIds: string[]): Promise<Map<string, UserSummary>>;
  /**
   * Gợi ý người để giao việc/nhắc tên (`GET /boards/:id/mentionables`): thành viên ACTIVE MEMBER+ (không GUEST) của
   * workspace, tên khớp `q` không dấu theo từng từ (rỗng = tất cả), sắp theo tên, tối đa `limit`. KHÔNG trả email.
   */
  searchMentionables(workspaceId: string, q: string, limit: number): Promise<UserSummary[]>;
  /** `Notification.dedupeKey` đã tồn tại chưa — `notify()` không idempotent với outbox `deliver` nên job kiểm trước. */
  notificationExists(dedupeKey: string): Promise<boolean>;
  /**
   * (p4-05) Ứng viên người chấm: thành viên ACTIVE OWNER/ADMIN/MEMBER (không GUEST) của workspace, tài khoản còn hoạt động
   * (không khoá/ẩn danh hoá), tối đa `limit` (nhóm lớn hơn vẫn ra kết quả đúng cho phần đầu danh sách — thứ tự theo `userId`).
   */
  listReviewerCandidateIds(workspaceId: string, limit: number): Promise<string[]>;
  /**
   * (p4-05) Trong `userIds`, những người CÒN đủ điều kiện làm người chấm của workspace: thành viên ACTIVE MEMBER+ và tài khoản còn hoạt động
   * (khác `activeMemberIds`: loại cả tài khoản đã khoá/ẩn danh hoá) — đối soát người chấm sau khi rời nhóm/ẩn danh hoá.
   */
  activeReviewerIds(workspaceId: string, userIds: string[]): Promise<Set<string>>;
  /** (p4-05) OWNER/ADMIN ACTIVE của workspace — nhận `REVIEW_SHORTAGE`. */
  listAdminIds(workspaceId: string): Promise<string[]>;
  /** (p4-05) Tên bảng (id không tồn tại vắng mặt) — `GET /me/reviews`. */
  boardNames(boardIds: string[]): Promise<Map<string, string>>;
  /** (p4-05) Tên workspace (id không tồn tại vắng mặt) — `GET /me/reviews`. */
  workspaceNames(workspaceIds: string[]): Promise<Map<string, string>>;
  /** (p4-05) Trong `workspaceIds`, những nhóm mà `userId` còn là thành viên ACTIVE MEMBER+ — `/me/reviews` bỏ nhóm đã rời. */
  workspaceIdsWhereMember(userId: string, workspaceIds: string[]): Promise<Set<string>>;
  /** `Workspace.timezone` THÔ (IANA do OWNER/ADMIN đặt; `null` = theo mặc định hệ thống hoặc nhóm không tồn tại) — múi giờ tính "ngày" của dời lịch/Gantt (đồng bộ chéo #9). */
  workspaceTimezone(workspaceId: string): Promise<string | null>;
}
