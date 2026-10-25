import type { AuthUser } from "../../../core/types/express";
import type { ChatScopeType, PollEntity } from "../entities/chat-extensions.types";
import type { TxHandle } from "../repositories/tx";

/** Khoá quyền của p7-01 (`permission-catalog`) mà module này cần — hiện CHƯA có catalog: xem `DefaultChatPermissionGate`. */
export type ChatPermissionKey = "POLL_CREATE" | "SCHEDULED_MESSAGE_CREATE";

export interface ChatPermissionScope {
  scopeType: ChatScopeType;
  scopeId: string;
  /** `null` cho hội thoại 1-1 (không thuộc workspace nào). */
  workspaceId: string | null;
}

/**
 * ĐIỂM NỐI p7-01 (vai trò tuỳ chỉnh): p7-01 chưa có mã nên quyền tạo khảo sát/tin hẹn giờ đi qua cổng này. Bản mặc định (`DefaultChatPermissionGate`) áp bảng vai mặc định của kế hoạch:
 * thành viên nhóm (MEMBER+) được tạo; KHÁCH (GUEST) không; 1-1 chỉ cần quyền gửi. Khi p7-01 xong, thay bản cài đặt bằng `PermissionService.assert(userId, key, { WORKSPACE })` (cờ
 * `custom-roles` bật) — service không đổi. Ném `ForbiddenError`/`ScopeForbiddenError` (403) khi từ chối.
 */
export interface IChatPermissionGate {
  assert(user: AuthUser, key: ChatPermissionKey, scope: ChatPermissionScope): Promise<void>;
}

/** Phát sự kiện socket — best-effort, KHÔNG được làm hỏng request/job đã commit. Chạy được ở cả API lẫn worker (cầu nối socket p0-03). */
export interface IChatEmitter {
  toRoom(room: string, event: string, payload: Record<string, unknown>): void;
  toUsers(userIds: string[], event: string, payload: Record<string, unknown>): void;
}

/**
 * Nhịp phát `poll:updated` (rủi ro nhóm 200 người bầu dày): `tryAcquire` = "lấy vé" phát NGAY (Redis `SET NX EX 1`) — được thì phát luôn; không được thì `scheduleTrailing` xếp MỘT job
 * `poll.emit` cuối cửa sổ (jobId theo giây ⇒ nhiều lần gọi chỉ một job) đọc số liệu MỚI NHẤT rồi phát. Tối đa ≈ 1 sự kiện/giây/khảo sát. Lỗi hạ tầng → coi như không có vé và không xếp job.
 */
export interface IEmitThrottle {
  tryAcquire(pollId: string): Promise<boolean>;
  scheduleTrailing(poll: Pick<PollEntity, "id">): Promise<void>;
}

/** Giữ tệp của tin hẹn giờ bằng `AssetLink(SCHEDULED_MESSAGE)` để job dọn mồ côi không xoá trong lúc chờ phát; gỡ khi phát/huỷ/lỗi. Link mang scope NONE (chỉ chủ tệp đọc trước giờ phát). */
export interface IScheduledAssetPort {
  attach(tx: TxHandle, input: { assetIds: string[]; scheduledMessageId: string; actorId: string }): Promise<void>;
  detach(tx: TxHandle, input: { scheduledMessageId: string; assetIds?: string[] }): Promise<void>;
}

/** Thông báo của module — luôn qua `notify()` (p0-06), TRONG transaction của nơi gọi (bền cùng thay đổi trạng thái). Nội dung push KHÔNG kèm nội dung tin. */
export interface IChatNotifier {
  scheduledFailed(tx: TxHandle, input: { scheduledMessageId: string; authorId: string; reason: string }): Promise<void>;
  reminder(tx: TxHandle, input: { reminderId: string; userId: string; messageId: string; scopeType: ChatScopeType; scopeId: string; unavailable: boolean }): Promise<void>;
}
