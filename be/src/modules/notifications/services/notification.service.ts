import type { CursorResponse } from "../../../core/utils/response";
import { encodeCursor } from "../../../core/utils/cursor";
import { AppError, NotificationNotFoundError, ValidationError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { emitToUsers } from "../../../infrastructure/socket/socket.emit";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import type { INotificationRepository, UnreadCountResult } from "../repositories/notification.repository.interface";
import type {
  NotificationFilter,
  NotificationInboxItem,
  NotificationPreferenceEntity,
  NotificationScopeType,
  PreferenceScope,
} from "../entities/notification.interface";

export interface ListInboxInput {
  filter: NotificationFilter;
  workspaceId?: string;
  unreadOnly: boolean;
  cursor?: string;
  limit: number;
}

export interface MarkAllReadInput {
  filter: NotificationFilter;
  workspaceId?: string;
  before: Date;
}

export interface SetPreferenceInput {
  userId: string;
  scope: PreferenceScope;
  scopeId?: string;
  mode?: NotificationPreferenceEntity["mode"];
  mutedUntil?: Date | null;
  dndUntil?: Date | null;
  lockScreenPreview?: boolean;
}

const ACCOUNT_SCOPE_KEY = "account";

/** `before` (đọc-tất-cả) quá xa tương lai → `NOTI_003` (chống nuốt thông báo đến sau, NT-13). */
const FUTURE_SKEW_MS = 5 * 60_000;

/** Móc tuỳ chọn (p1-07) — test cũ dựng `new NotificationService(repo)` không cần truyền. */
export interface NotificationServiceHooks {
  /** Bổ sung `context` (kiểm quyền lúc đọc) + `actor` cho trang hộp thư. */
  enrich?: (userId: string, items: NotificationInboxItem[]) => Promise<NotificationInboxItem[]>;
  /** Gọi sau khi mục hộp thư đổi trạng thái đọc (xoá cache `unread:summary`). */
  inboxChanged?: (userId: string) => Promise<void>;
}

function scopeKeyFor(scope: PreferenceScope, scopeId?: string): string {
  return scope === "ACCOUNT" ? ACCOUNT_SCOPE_KEY : (scopeId ?? "");
}

/**
 * Inbox + preference (be.md §4/§7) — `deliver.recipient`/push nằm ở
 * `delivery.policy.ts`/`push.jobs.ts`, service này chỉ phục vụ REST đọc/ghi
 * inbox và preference của chính người dùng.
 */
export class NotificationService {
  constructor(
    private readonly repo: INotificationRepository,
    private readonly hooks: NotificationServiceHooks = {}
  ) {}

  async listInbox(userId: string, input: ListInboxInput): Promise<CursorResponse<NotificationInboxItem>> {
    const { data: rows, hasMore } = await this.repo.listInbox(userId, input);
    const last = rows[rows.length - 1];
    const data = this.hooks.enrich ? await this.hooks.enrich(userId, rows) : rows;
    return {
      data,
      meta: {
        nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
        hasMore,
        limit: input.limit,
      },
    };
  }

  async unreadCount(userId: string, workspaceId?: string): Promise<UnreadCountResult> {
    return this.repo.unreadCount(userId, workspaceId);
  }

  /** `POST /notifications/:id/read` — `id` = id của `NotificationRecipient` (be.md §4). */
  async markRead(userId: string, recipientId: string): Promise<Date> {
    const readAt = await this.repo.markRead(userId, recipientId);
    if (!readAt) throw new NotificationNotFoundError();
    emitToUsers([userId], SocketEvent.NOTIFICATION_READ, { ids: [recipientId] });
    await this.hooks.inboxChanged?.(userId);
    return readAt;
  }

  async markAllRead(userId: string, input: MarkAllReadInput): Promise<number> {
    if (input.before.getTime() > Date.now() + FUTURE_SKEW_MS) {
      throw new AppError(ErrorMessages[ErrorCode.NOTI_003], 400, ErrorCode.NOTI_003);
    }
    const updated = await this.repo.markAllRead(userId, input);
    emitToUsers([userId], SocketEvent.NOTIFICATION_READ, {
      all: { filter: input.filter, workspaceId: input.workspaceId, before: input.before.toISOString() },
    });
    await this.hooks.inboxChanged?.(userId);
    return updated;
  }

  /**
   * `notifications.mark-read-by-stream` (be.md §5.8) — đánh dấu mục hộp thư của tin ≤ `seq` trong luồng đã đọc (NT-12).
   * Phát `notification:read { ids }` (≤ 200 id); nhiều hơn → chỉ gợi ý refetch tổng hợp.
   */
  async markReadByStream(userId: string, scopeType: NotificationScopeType, scopeId: string, streamKey: string, seq: number): Promise<number> {
    const ids = await this.repo.markReadByStream(userId, scopeType, scopeId, streamKey, seq);
    if (ids.length === 0) return 0;
    try {
      if (ids.length <= 200) emitToUsers([userId], SocketEvent.NOTIFICATION_READ, { ids });
      else emitToUsers([userId], SocketEvent.UNREAD_SUMMARY_CHANGED, { reason: "READ_ALL" });
    } catch {
      // Socket chưa sẵn sàng — client sẽ đồng bộ ở lần refetch kế tiếp.
    }
    await this.hooks.inboxChanged?.(userId);
    return ids.length;
  }

  /** Cron `notifications.inbox-retention` (be.md §5.8) — xoá mục đã đọc/đã huỷ quá hạn giữ + Notification mồ côi. */
  async purgeExpired(before: Date): Promise<{ recipients: number; notifications: number }> {
    return this.repo.purgeExpired(before);
  }

  async listPreferences(userId: string): Promise<NotificationPreferenceEntity[]> {
    return this.repo.listPreferences(userId);
  }

  async getPreference(userId: string, scope?: PreferenceScope, scopeId?: string): Promise<NotificationPreferenceEntity | NotificationPreferenceEntity[]> {
    if (!scope) return this.listPreferences(userId);
    const scopeKey = scopeKeyFor(scope, scopeId);
    const existing = await this.repo.getPreference(userId, scope, scopeKey);
    if (existing) return existing;
    return {
      id: "",
      userId,
      scope,
      scopeKey,
      mode: "INHERIT",
      mutedUntil: null,
      dndUntil: null,
      quietHours: null,
      lockScreenPreview: false,
      updatedAt: new Date(0),
    };
  }

  /**
   * `PUT /me/notification-preferences` — chỉ ACCOUNT mới nhận `dndUntil`/
   * `lockScreenPreview` (be.md §2 Prisma "chỉ ACCOUNT"); scope khác gửi kèm
   * 2 field này bị bỏ qua thầm lặng để tránh lỗi 400 vô nghĩa cho client cũ.
   */
  async setPreference(input: SetPreferenceInput): Promise<NotificationPreferenceEntity> {
    if (input.scope !== "ACCOUNT" && !input.scopeId) {
      throw new ValidationError("scopeId bắt buộc trừ scope ACCOUNT");
    }
    const scopeKey = scopeKeyFor(input.scope, input.scopeId);
    return this.repo.upsertPreference({
      userId: input.userId,
      scope: input.scope,
      scopeKey,
      mode: input.mode,
      mutedUntil: input.mutedUntil,
      ...(input.scope === "ACCOUNT" && {
        dndUntil: input.dndUntil,
        lockScreenPreview: input.lockScreenPreview,
      }),
    });
  }
}
