import type {
  FanoutReason,
  MessageScopeType,
  PushSkipReason,
  PushTarget,
} from "../entities/message-notification.types";
import type { IFanoutRepository } from "../repositories/fanout.repository.interface";
import type { MessagePreferenceResolver } from "./preference-resolver.service";

/**
 * `systemType` được phép fan-out ở Phase 1 — RỖNG: bảng notify của p1-04 §5.7 chỉ có loại do module khác
 * ghi (call/meeting/integration, Phase 2+) và các module đó tự gọi `notify()`. Thêm vào đây khi có loại
 * tin hệ thống cần thông báo qua fan-out.
 */
export const NOTIFYING_SYSTEM_TYPES: ReadonlySet<string> = new Set<string>();

/** Payload job `fanout.message` (outbox row riêng do `message.service.ts#send()` ghi, p1-07 be.md §7). */
export interface FanoutInput {
  messageId: string;
  /** USER id đã validate, đã loại tự tag (p1-06). Thiếu → suy từ `Message.mentions`. */
  mentionUserIds?: string[];
  mentionAll?: boolean;
  isFirstReply?: boolean;
  parentAuthorId?: string | null;
}

/** Payload job `fanout.message-edit` (`mentionDiff` của `message.service.ts#edit()`). */
export interface FanoutEditInput {
  messageId: string;
  addedUserIds: string[];
  removedUserIds: string[];
  allAdded?: boolean;
  allRemoved?: boolean;
}

export interface FanoutStats {
  skipped?: "not-found" | "deleted" | "system" | "no-audience";
  audience: number;
  attention: number;
  pushEnqueued: number;
  suppressed: Partial<Record<PushSkipReason, number>>;
}

/** Phụ thuộc của fan-out — inject để test đơn vị (NT-01, NT-14, edit) không cần Mongo/Redis/Socket. */
export interface FanoutDeps {
  repo: IFanoutRepository;
  prefs: MessagePreferenceResolver;
  /** Người ĐỌC ĐƯỢC luồng (`MessageScope.readerIds`); service tự loại tác giả. */
  readers(scopeType: MessageScopeType, scopeId: string): Promise<string[]>;
  /** Người theo dõi thread (state ON), đã gom mọi trang. */
  threadSubscribers(threadId: string): Promise<string[]>;
  /** Người TRONG `userIds` đã chặn `authorId` (`BlockPort.filterNotificationRecipients` bù) — NT-14. */
  blockersOf(authorId: string, userIds: string[]): Promise<Set<string>>;
  isViewing(userId: string, scopeKey: string): Promise<boolean>;
  wasPushed(messageId: string, userId: string): Promise<boolean>;
  pushEnabled(): Promise<boolean>;
  dispatch: { enqueueMany(targets: PushTarget[]): Promise<void> };
  emitToUsers(userIds: string[], event: string, payload: object): void;
  invalidateSummary(userIds: string[]): Promise<void>;
  record: {
    suppressed(reason: PushSkipReason): void;
    fanoutSeconds(seconds: number): void;
    /** Số mục hộp thư MỚI/được nâng vừa ghi — số liệu admin `inboxCreated`. */
    inboxCreated(count: number): void;
  };
  chunkSize: number;
  now?: () => Date;
}

export interface AttentionRowSpec {
  kind: string;
  kindRank: number;
  filterBucket: string;
}

export function isFollowingReason(reason: FanoutReason): boolean {
  return reason === "FIRST_REPLY" || reason === "THREAD_REPLY";
}
