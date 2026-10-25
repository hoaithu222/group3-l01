import type { ContributionConfigValue } from "../../../core/constants/contribution";
import type { BoardRef, DirectoryUser, TaskRef } from "../entities/contribution.interface";
import type { TxHandle } from "./tx";

/**
 * Tra cứu CHỈ-ĐỌC xuyên collection mà báo cáo đóng góp cần (bảng, thẻ, thành viên, tên người) — ngoại lệ có chủ đích cùng tiền lệ
 * `workspace-search`/`gamification` (đọc dữ liệu module khác, KHÔNG ghi). Đây là dữ liệu để HIỂN THỊ, không quyết định quyền — quyền đi qua
 * `permissionService` (scope BOARD/WORKSPACE). Nơi duy nhất module này ghi vào collection của module khác là `IBoardContributionWriter`.
 */
export interface IContributionDirectory {
  getBoard(boardId: string): Promise<BoardRef | null>;
  getWorkspaceName(workspaceId: string): Promise<string | null>;
  /** `Workspace.timezone` THÔ (IANA do OWNER/ADMIN đặt; `null` = theo mặc định hệ thống hoặc nhóm không tồn tại) — múi giờ tính ngày/tuần/tháng của báo cáo (đồng bộ chéo #9). */
  getWorkspaceTimezone(workspaceId: string): Promise<string | null>;
  /** Thành viên ACTIVE OWNER/ADMIN/MEMBER (không GUEST) của nhóm. */
  listMemberIds(workspaceId: string): Promise<string[]>;
  /**
   * Tên + ảnh + trạng thái thành viên (`ACTIVE`/`LEFT`/`ANONYMIZED`) cho các id, kể cả người đã rời/ẩn danh. Id không tồn tại vắng mặt.
   * `avatarUrl` = URL ảnh ký sẵn bản THUMB (`avatarUrlOf(User.avatarAssetId)`); `null` khi chưa đặt ảnh hoặc `ANONYMIZED`.
   */
  getUsers(workspaceId: string, userIds: readonly string[]): Promise<Map<string, DirectoryUser>>;
  /** Người này là (hoặc từng là) thành viên không phải khách của nhóm — hợp lệ để xem thẻ/heatmap của họ. */
  isKnownMember(workspaceId: string, userId: string): Promise<boolean>;
  /** Tiêu đề + đã xoá chưa của các thẻ (thẻ không còn trong DB → vắng mặt). */
  getTasks(taskIds: readonly string[]): Promise<Map<string, TaskRef>>;
  /** Bảng của nhóm (kể cả đã lưu trữ). */
  listBoards(workspaceId: string): Promise<BoardRef[]>;
  workspaceExists(workspaceId: string): Promise<boolean>;
}

/** Ghi `Board.contribution` — trường DUY NHẤT p4-06 được ghi vào bảng `Board` (p3-02 dành riêng). KHÔNG đổi `Board.version`. */
export interface IBoardContributionWriter {
  setContribution(boardId: string, config: ContributionConfigValue, tx?: TxHandle): Promise<void>;
}
