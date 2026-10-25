import type { ReminderTargetValue } from "../entities/wallet.interface";

export type WalletMemberRole = "OWNER" | "ADMIN" | "MEMBER" | "GUEST";

/**
 * Tra cứu chỉ-đọc xuyên collection mà ví cần (thành viên, nơi đăng nhắc, tệp).
 * Đặt sau 1 cổng riêng để service không import Prisma và để test thay bằng in-memory.
 * Đây là kiểm tra TÍNH HỢP LỆ DỮ LIỆU (người tham gia phải là thành viên ACTIVE),
 * không phải quyết định quyền — quyền vẫn đi qua `permissionService`.
 */
export interface IWalletDirectory {
  /** Vai trò của các user là thành viên ACTIVE của workspace (user không phải thành viên → vắng mặt). */
  activeRoles(workspaceId: string, userIds: string[]): Promise<Map<string, WalletMemberRole>>;
  isWorkspaceActive(workspaceId: string): Promise<boolean>;
  /** GROUP conversation ACTIVE của workspace, hoặc kênh TEXT ACTIVE của workspace. */
  isValidReminderTarget(workspaceId: string, type: Exclude<ReminderTargetValue, "NONE">, targetId: string): Promise<boolean>;
  /** Tên kênh CHỈ khi PUBLIC (admin stats không được lộ tên kênh riêng tư). */
  publicChannelName(workspaceId: string, channelId: string): Promise<string | null>;
  workspaceName(workspaceId: string): Promise<string | null>;
  /** Asset thuộc `ownerId` và đã READY (kiểm trước khi gắn hoá đơn/chứng từ). */
  isAssetReady(assetId: string, ownerId: string): Promise<boolean>;
  /** Thành viên ACTIVE MEMBER+ (không GUEST) — người được nhận sự kiện `wallet:updated`. */
  listWalletMemberIds(workspaceId: string): Promise<string[]>;
  /** `notify()` KHÔNG idempotent với outbox `deliver` (duplicate → P2002 huỷ transaction) — kiểm trước khi gọi lại cùng `dedupeKey`. */
  notificationExists(dedupeKey: string): Promise<boolean>;
  /** Tên hiển thị cho xuất CSV. */
  userNames(userIds: string[]): Promise<Map<string, string>>;
}
