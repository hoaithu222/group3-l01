import type { MemberStats } from "../entities/portfolio.interface";

export interface EligibleWorkspace {
  workspaceId: string;
  /** Số thẻ đã hoàn thành được tính cho người này ở nhóm (tổng các bảng). */
  tasksDone: number;
}

export interface WorkspaceRef {
  id: string;
  name: string;
  archived: boolean;
}

export interface UserRef {
  id: string;
  name: string;
  /** `User.status` — `ANONYMIZED` bị loại khỏi danh sách đồng đội. */
  status: string;
  avatarAssetId: string | null;
}

/**
 * Cổng ĐỌC dữ liệu nguồn của module khác (thay cho `TaskStatsReadPort` p3-02 / `ResourceStatsReadPort` p3-01 của kế hoạch — mẫu `career`/`contribution`:
 * module chỉ đọc, KHÔNG ghi collection của module khác, KHÔNG trả nội dung ngoài số đếm/tên nhóm/tên người). Số liệu thẻ lấy từ snapshot `ALL` + fact của
 * `contribution` (p4-06) nên khớp báo cáo đóng góp người dùng đã thấy trong app.
 */
export interface IPortfolioSourceRepository {
  /** Nhóm người dùng có ≥ 1 thẻ hoàn thành được tính (kể cả đã rời nhóm / nhóm đã lưu trữ). */
  eligibleWorkspaces(userId: string): Promise<EligibleWorkspace[]>;
  /** Gộp mọi bảng của nhóm; `null` khi chưa có thẻ hoàn thành nào được tính. */
  memberStats(userId: string, workspaceId: string): Promise<MemberStats | null>;
  /** Người từng cùng làm ≥ 1 thẻ hoàn thành với người này ở nhóm (distinct, trừ chính họ). */
  coAssignees(userId: string, workspaceId: string): Promise<string[]>;
  /** Số tệp người này đã tải lên kho tài liệu của nhóm (không tính đã xoá vĩnh viễn). */
  filesUploaded(userId: string, workspaceId: string): Promise<number>;
  workspaces(ids: readonly string[]): Promise<Map<string, WorkspaceRef>>;
  /** Nhóm mà người này còn là thành viên ACTIVE (không tính khách GUEST) — nhãn "Đã rời nhóm". */
  activeMemberOf(userId: string, workspaceIds: readonly string[]): Promise<Set<string>>;
  users(ids: readonly string[]): Promise<Map<string, UserRef>>;
  /** Người dùng đã bật `career.visibility.appearInOthersPortfolios` (mặc định TẮT — thiếu bản ghi = không đồng ý). */
  teammateConsent(userIds: readonly string[]): Promise<Set<string>>;
}
